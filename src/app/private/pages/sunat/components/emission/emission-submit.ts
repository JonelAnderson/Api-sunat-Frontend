/**
 * Envío de una emisión (§11.6, §11.7, §11.10) con su `Idempotency-Key`:
 * - La clave es un UUID por **intento de emisión**: se crea al enviar y se conserva mientras se reintente **el mismo cuerpo**
 *   (doble clic, corte de red, tiempo agotado, 409 "en curso"): la API devuelve la respuesta guardada con
 *   `Idempotency-Replayed: true` en vez de emitir otra vez.
 * - Cualquier cambio del formulario cambia el cuerpo y, con él, la clave (otro comprobante = otra clave). Después de una
 *   emisión correcta la clave se descarta ("Emitir otro" arranca con una nueva).
 * - Un error de la API (validación, cupo, empresa suspendida, 403 / 404 / 429) libera la clave en el servidor: se corrige y
 *   se vuelve a enviar (si el cuerpo cambió, con otra clave; si no, con la misma).
 * - Sin respuesta clara (sin conexión, tiempo agotado, 409, 500 / 502 / 504) no se sabe si se emitió: se ofrece
 *   "Reintentar la misma emisión", que reenvía exactamente el último cuerpo con la misma clave.
 * Nada de esto se guarda en el navegador (ni la clave ni el formulario).
 */
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TimeoutError } from 'rxjs';
import { serverMessages } from '@shared/functions/list-helpers';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { actionHttpError } from '../../models/document-actions.models';
import { fieldErrors } from '../../models/tenant-admin.models';
import { Json } from '../../models/tenant-views.models';
import { EmissionService, IssueKind } from '../../services/emission.service';
import { otherErrors } from './emission.models';

/** Formato de §11.6: 8 a 100 caracteres `[A-Za-z0-9._:-]` (un UUID sirve). */
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,100}$/;

/** UUID v4 (con `crypto.randomUUID` o, si el navegador no lo tiene, con `getRandomValues`). */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(b);
  } else {
    for (let i = 0; i < 16; i++) {
      b[i] = Math.floor(Math.random() * 256);
    }
  }
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Emisión correcta (o repetida por la API). */
export interface IssueOutcome {
  kind: IssueKind;
  resp: BaseResponse;
  /** La API devolvió la respuesta guardada de esa clave (`Idempotency-Replayed: true`): no se emitió otra vez. */
  replayed: boolean;
}

/** Explicación extra para los mensajes de negocio más comunes (§11.7, §11.10). */
export function explainIssueMessage(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('limite de documentos') || t.includes('límite de documentos')) {
    return 'El cupo de comprobantes del plan de la empresa está agotado este mes: cambie su plan o su modo de emisión ("Cambiar plan" en la página de la empresa) y vuelva a intentar.';
  }
  if (t.includes('suscripción venció') || t.includes('suscripcion vencio')) {
    return 'La suscripción de la empresa venció: renuévela o cambie su modo de emisión antes de emitir.';
  }
  if (t.includes('suspendida')) {
    return 'Active la empresa (botón "Activar" de su página) para poder emitir.';
  }
  return '';
}

/**
 * Estado y envío de un formulario de emisión. Una instancia por formulario (al recrear el formulario se descarta la clave).
 * `known(campo)` dice si un error de la API tiene un campo en el formulario (el resto se lista al final).
 */
export class EmissionSubmitter {
  readonly sending = signal(false);
  /** Aviso general del último intento. */
  readonly error = signal('');
  /** Errores por campo (`propertyName` de la API o de la validación local). */
  readonly errors = signal<Record<string, string>>({});
  /** Errores sin campo en el formulario. */
  readonly others = signal<string[]>([]);
  /** Último intento sin respuesta clara: se puede repetir con la misma clave. */
  readonly unknown = signal('');

  private key = '';
  private lastJson = '';
  private lastBody: Json | null = null;
  private lastKind: IssueKind | null = null;
  private lastTenant = 0;

  constructor(private service: EmissionService, private known: (key: string) => boolean) {}

  /** Clave del intento en curso o del último sin respuesta ('' si no hay). Se muestra abreviada para soporte. */
  currentKey(): string {
    return this.key;
  }

  /** Muestra errores locales (mismas claves de la API) y devuelve `true` si hay alguno (entonces no se envía). */
  blockWith(errors: Record<string, string>): boolean {
    const has = Object.keys(errors).length > 0;
    this.errors.set(errors);
    this.others.set(has ? otherErrors(errors, this.known) : []);
    this.error.set(has ? 'Revise los campos marcados.' : '');
    return has;
  }

  /** Emite `body`: misma clave si el cuerpo, la ruta y la empresa son los del último intento; si no, una nueva. */
  submit(tenantId: number, kind: IssueKind, body: Json, done: (outcome: IssueOutcome) => void): void {
    if (this.sending()) {
      return;
    }
    const json = JSON.stringify(body);
    if (!this.key || json !== this.lastJson || kind !== this.lastKind || tenantId !== this.lastTenant) {
      this.key = newIdempotencyKey();
    }
    this.lastJson = json;
    this.lastBody = body;
    this.lastKind = kind;
    this.lastTenant = tenantId;
    this.send(done);
  }

  /** Reenvía exactamente el último cuerpo con la misma clave (después de un intento sin respuesta clara). */
  retrySame(done: (outcome: IssueOutcome) => void): void {
    if (this.sending() || !this.lastBody || !this.lastKind || !this.key) {
      return;
    }
    this.send(done);
  }

  /** Después de un intento sin respuesta clara, ¿el formulario arma otro cuerpo? (emitir ahora usaría otra clave). */
  differsFromLast(body: Json): boolean {
    return !!this.unknown() && !!this.lastJson && JSON.stringify(body) !== this.lastJson;
  }

  private send(done: (outcome: IssueOutcome) => void): void {
    const kind = this.lastKind!;
    this.sending.set(true);
    this.error.set('');
    this.errors.set({});
    this.others.set([]);
    this.service.issue(this.lastTenant, kind, this.lastBody!, this.key).subscribe({
      next: ({ resp, replayed }) => {
        this.sending.set(false);
        this.unknown.set('');
        if (resp?.succeeded) {
          // Emitido (o repetido): la clave no se vuelve a usar.
          this.key = '';
          this.lastJson = '';
          this.lastBody = null;
          done({ kind, resp, replayed });
          return;
        }
        const fields = fieldErrors(resp);
        if (fields['Idempotency-Key']?.includes('otra petición')) {
          // Clave usada con otro cuerpo (no debería pasar: cada cuerpo nuevo lleva clave nueva). La próxima va con otra.
          this.key = '';
        }
        const message = serverMessages({ messages: resp?.messages }, 'La API no aceptó la emisión.');
        this.show(fields, [message, explainIssueMessage(message)].filter(Boolean).join(' '));
      },
      error: (err: unknown) => {
        this.sending.set(false);
        this.handleHttpError(err);
      }
    });
  }

  private handleHttpError(err: unknown): void {
    if (err instanceof TimeoutError) {
      this.unknown.set('La API no respondió a tiempo. Puede que el comprobante se haya emitido: use "Reintentar la misma emisión" sin cambiar nada. Si ya se emitió, la API devuelve ese mismo resultado y no emite otro.');
      this.error.set('');
      return;
    }
    const e = err as HttpErrorResponse;
    const status = e?.status ?? 0;
    const message = actionHttpError(err, 'No se pudo emitir el comprobante.');
    if (status === 409) {
      this.unknown.set(`${message} La emisión con esta clave sigue en curso: espere unos segundos y pulse "Reintentar la misma emisión" para ver su resultado (no se duplica).`);
      this.error.set('');
      return;
    }
    if (status === 0 || status === 500 || status === 502 || status === 504) {
      this.unknown.set(`${message} No se sabe si el comprobante se emitió: use "Reintentar la misma emisión" sin cambiar nada; si ya se emitió, la API devuelve ese resultado sin duplicarlo.`);
      this.error.set('');
      return;
    }
    this.unknown.set('');
    const extra = status === 429 ? 'Espere un minuto y vuelva a intentar.'
      : status === 403 ? explainIssueMessage(message) || 'Su rol no permite emitir o la empresa está suspendida.'
        : explainIssueMessage(message);
    this.show(fieldErrors(e?.error), [message, extra].filter(Boolean).join(' '));
  }

  private show(fields: Record<string, string>, message: string): void {
    const general = { ...fields };
    const keyError = general['Idempotency-Key'];
    delete general['Idempotency-Key'];
    this.errors.set(general);
    this.error.set(keyError && !message.includes(keyError) ? `${message} ${keyError}` : message);
    this.others.set(otherErrors(general, this.known).filter((m) => !message.includes(m)));
  }
}
