import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';
import { serverMessages } from '@shared/functions/list-helpers';
import { ymdToDisplay } from '@shared/functions/lima-dates';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import {
  ActionTarget, DocAction, REASON_MAX, SETTLEMENT_CAUSAL_OPTIONS, SUSPENDED_MESSAGE, VoidInfo, actionHttpError, targetFromResource, voidBlockReason,
  voidInfo
} from '../../models/document-actions.models';
import { fieldErrors } from '../../models/tenant-admin.models';
import { obj, sunatBadge, sunatStatusName } from '../../models/tenant-views.models';
import { TenantAdminService } from '../../services/tenant-admin.service';
import { TenantViewsService } from '../../services/tenant-views.service';

/** Lo que devuelve el modal al terminar bien: la acción y el sobre de la API. */
export interface DocActionResult {
  action: DocAction;
  resp: BaseResponse;
}

/**
 * Confirmación y envío de una acción de la fase D sobre un documento (§11.8): reenviar (`…/enviar`, motivo obligatorio),
 * anular / revertir (`…/anular` o `…/revertir`, motivo obligatorio que va a SUNAT; en liquidaciones también `causal`) y
 * refrescar el estado en SUNAT (`…/refrescar`, motivo opcional). Muestra el resumen del documento, el mecanismo de anulación
 * con su fecha y plazo, y los errores de la API junto al campo (`errors[].propertyName`) o arriba (403 empresa suspendida,
 * 409, 429…). Para anular primero vuelve a leer el detalle (estado, fecha, plazo y pagos guardados). Cierra con
 * `DocActionResult` solo si la API respondió `succeeded: true`.
 */
@Component({
  selector: 'app-doc-action-modal',
  imports: [FormsModule, NgClass],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather {{ icon() }}"></em>{{ title() }}</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" [disabled]="sending()" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      @if (loading()) {
      <div class="erp-loading" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Leyendo el documento…</div>
      } @else {
      <div class="border rounded p-3 mb-3">
        <div class="d-flex flex-wrap justify-content-between gap-2">
          <div>
            <div class="small text-muted">{{ t.typeName }}</div>
            <div class="fw-semibold fs-6">{{ t.number || '—' }}</div>
            @if (t.party) {<div class="small">{{ t.party }}</div>}
            @if (t.tenantName) {<div class="small text-muted">{{ t.tenantName }}</div>}
          </div>
          <div class="text-end">
            <span class="badge" [ngClass]="badge(t.status)">{{ statusName(t.status) || 'Sin estado' }}</span>
            @if (t.issueYmd) {<div class="small text-muted mt-1">{{ t.kind === 'resumenes' ? 'Referencia' : 'Emisión' }}: {{ day(t.issueYmd) }}</div>}
          </div>
        </div>
      </div>

      @switch (action) {
      @case ('resend') {
      <p class="small">Vuelve a enviar el documento a SUNAT con las credenciales guardadas de la empresa (usted no las ve), con la misma serie y número.
        @if (t.kind === 'boletas') { Una boleta que se informa por resumen diario se envía con su resumen. }
        @if (t.kind === 'resumenes' || t.kind === 'anulaciones') { Se reenvía el {{ t.kind === 'resumenes' ? 'resumen' : 'documento' }} completo. }</p>
      }
      @case ('refresh') {
      <p class="small">Consulta a SUNAT <strong>en este momento</strong> y guarda lo que responda:
        @switch (t.kind) {
        @case ('guias-remision') { el ticket de la guía (GRE). }
        @case ('resumenes') { el ticket del resumen. }
        @case ('anulaciones') { el ticket de la baja o reversión. }
        @default { el CDR del comprobante (queda aceptado con su CDR y su PDF, o rechazado; si SUNAT no lo tiene, queda como estaba). }
        }
        Usa las credenciales guardadas de la empresa.</p>
      }
      @case ('void') {
      @if (info(); as v) {
      <div class="erp-callout mb-2"><em class="feather icon-slash"></em>
        <span><strong>{{ v.title }}.</strong> {{ v.description }}</span>
      </div>
      <ul class="small mb-3">
        @for (r of v.rules; track $index) {<li>{{ r }}</li>}
      </ul>
      }
      @if (blocked()) {
      <div class="alert alert-warning py-2 small">{{ blocked() }}</div>
      }
      }
      }

      <p class="small text-muted">Queda en la auditoría con su motivo y el resultado. Cuenta en el límite por minuto de la empresa (según su plan) y en el suyo (30 acciones por minuto).</p>

      @if (error()) {
      <div class="alert alert-danger py-2 small" role="alert">{{ error() }}</div>
      }

      @if (!blocked()) {
      <form class="erp-form" novalidate (ngSubmit)="send()">
        @if (info()?.causal) {
        <div class="mb-3">
          <label class="form-label" for="dam-causal">Causal <span class="erp-required">*</span></label>
          <select id="dam-causal" class="form-select" name="causal" [(ngModel)]="causal" [class.is-invalid]="!!err('causal')">
            <option [ngValue]="''">Elija…</option>
            @for (c of causals; track c.id) {<option [ngValue]="c.id">{{ c.name }}</option>}
          </select>
          @if (err('causal')) {<div class="invalid-feedback">{{ err('causal') }}</div>}
        </div>
        }
        <label class="form-label" for="dam-motivo">{{ action === 'void' ? 'Motivo (va a SUNAT)' : 'Motivo' }} @if (reasonRequired()) {<span class="erp-required">*</span>}</label>
        <textarea id="dam-motivo" class="form-control" rows="3" name="motivo" [(ngModel)]="motivo" [attr.maxlength]="reasonMax()"
          [placeholder]="action === 'void' ? 'Por qué se anula (lo recibe SUNAT)' : (reasonRequired() ? 'Por qué se hace (queda en la auditoría)' : 'Opcional')"
          [class.is-invalid]="!!err('motivo')"></textarea>
        @if (err('motivo')) {<div class="invalid-feedback">{{ err('motivo') }}</div>}
        <div class="form-text text-end">{{ motivo.length }} / {{ reasonMax() }}</div>
        @if (action === 'void') {
        <div class="form-check mt-2">
          <input id="dam-confirm" type="checkbox" class="form-check-input" name="confirm" [(ngModel)]="confirmed" />
          <label class="form-check-label small" for="dam-confirm">Entiendo que la {{ info()?.mechanism === 'RR' ? 'reversión' : 'anulación' }} se envía a SUNAT
            en nombre de la empresa y no se puede deshacer.</label>
        </div>
        }
        <button type="submit" class="d-none" aria-hidden="true" tabindex="-1"></button>
      </form>
      }
      }
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" [disabled]="sending()" (click)="activeModal.dismiss()">Cancelar</button>
      @if (!loading() && !blocked()) {
      <button type="button" class="btn" [ngClass]="action === 'void' ? 'btn-danger' : 'btn-primary'"
        [disabled]="sending() || (action === 'void' && !confirmed)" (click)="send()">
        @if (sending()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
        {{ confirmText() }}
      </button>
      }
    </div>
  `
})
export class DocActionModalComponent implements OnInit {
  readonly activeModal = inject(NgbActiveModal);
  private admin = inject(TenantAdminService);
  private views = inject(TenantViewsService);

  target!: ActionTarget;
  action!: Exclude<DocAction, 'fix'>;

  readonly causals = SETTLEMENT_CAUSAL_OPTIONS;
  t!: ActionTarget;
  motivo = '';
  causal = '';
  confirmed = false;
  readonly loading = signal(false);
  readonly sending = signal(false);
  readonly error = signal('');
  readonly errors = signal<Record<string, string>>({});
  readonly info = signal<VoidInfo | null>(null);
  readonly blocked = signal('');

  ngOnInit(): void {
    this.t = { ...this.target };
    if (this.t.tenantActive === false) {
      this.blocked.set(SUSPENDED_MESSAGE);
    }
    if (this.action === 'void') {
      this.info.set(voidInfo(this.t));
      this.reloadForVoid();
    }
  }

  /** Antes de anular: estado, fecha, plazo de reversión y pagos guardados (la fila puede estar desactualizada). */
  private reloadForVoid(): void {
    this.loading.set(true);
    this.views.get(this.t.tenantId, `${this.t.kind}/${this.t.docId}`).subscribe({
      next: (resp) => {
        this.loading.set(false);
        const fresh = resp.succeeded && resp.data ? targetFromResource(this.t.tenantId, this.t.kind, obj(resp.data), this.t.tenantActive, this.t.tenantName) : null;
        if (fresh) {
          this.t = { ...fresh, typeName: this.t.typeName || fresh.typeName };
        }
        this.info.set(voidInfo(this.t));
        this.blocked.set(voidBlockReason(this.t));
      },
      error: () => {
        // Sin el detalle se usa lo de la fila; la API vuelve a comprobar todo.
        this.loading.set(false);
        this.blocked.set(voidBlockReason(this.t));
      }
    });
  }

  title(): string {
    switch (this.action) {
      case 'resend':
        return 'Reenviar a SUNAT';
      case 'refresh':
        return 'Refrescar el estado en SUNAT';
      default:
        return this.info()?.mechanism === 'RR' ? 'Revertir el documento' : 'Anular el documento';
    }
  }

  icon(): string {
    return this.action === 'resend' ? 'icon-send' : this.action === 'refresh' ? 'icon-refresh-cw' : 'icon-slash';
  }

  confirmText(): string {
    switch (this.action) {
      case 'resend':
        return 'Reenviar';
      case 'refresh':
        return 'Consultar a SUNAT';
      default:
        return `${this.info()?.verb ?? 'Anular'} (${this.info()?.mechanism ?? ''})`;
    }
  }

  reasonRequired(): boolean {
    return this.action !== 'refresh';
  }

  reasonMax(): number {
    return this.action === 'void' ? this.info()?.reasonMax ?? 255 : REASON_MAX;
  }

  err(key: string): string {
    return this.errors()[key] ?? '';
  }

  statusName(s: string): string {
    return sunatStatusName(s);
  }

  badge(s: string): string {
    return sunatBadge(s);
  }

  day(ymd: string): string {
    return ymdToDisplay(ymd);
  }

  send(): void {
    if (this.sending() || this.blocked()) {
      return;
    }
    const motivo = this.motivo.trim();
    const e: Record<string, string> = {};
    const min = this.action === 'void' ? this.info()?.reasonMin ?? 1 : 1;
    if (this.reasonRequired() && !motivo) {
      e['motivo'] = 'El motivo es obligatorio.';
    } else if (motivo && motivo.length < min) {
      e['motivo'] = `El motivo debe tener al menos ${min} caracteres.`;
    } else if (motivo.length > this.reasonMax()) {
      e['motivo'] = `El motivo no debe superar los ${this.reasonMax()} caracteres.`;
    }
    if (this.info()?.causal && !this.causal) {
      e['causal'] = 'Elija la causal de la reversión.';
    }
    if (this.action === 'void' && !this.confirmed) {
      e['confirm'] = 'Confirme la anulación.';
    }
    this.errors.set(e);
    this.error.set('');
    if (Object.keys(e).length) {
      return;
    }
    const t = this.t;
    let call: Observable<BaseResponse>;
    switch (this.action) {
      case 'resend':
        call = this.admin.resendDocument(t.tenantId, t.kind, t.docId, motivo);
        break;
      case 'refresh':
        call = this.admin.refreshDocument(t.tenantId, t.kind, t.docId, motivo);
        break;
      default:
        call = this.admin.voidDocument(t.tenantId, t.kind, t.docId, motivo, this.causal);
    }
    this.sending.set(true);
    call.subscribe({
      next: (resp) => {
        this.sending.set(false);
        if (resp.succeeded) {
          this.activeModal.close({ action: this.action, resp } as DocActionResult);
          return;
        }
        this.errors.set(fieldErrors(resp));
        this.error.set(serverMessages({ messages: resp.messages }, 'La API no realizó la acción.'));
      },
      error: (err) => {
        this.sending.set(false);
        this.errors.set(fieldErrors(err?.error));
        this.error.set(actionHttpError(err, 'No se pudo realizar la acción.'));
      }
    });
  }
}
