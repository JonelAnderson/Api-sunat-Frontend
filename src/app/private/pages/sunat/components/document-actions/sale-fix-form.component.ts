import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { serverMessages } from '@shared/functions/list-helpers';
import { ActionTarget, REASON_MAX, actionHttpError } from '../../models/document-actions.models';
import { fieldErrors } from '../../models/tenant-admin.models';
import { ymdToDisplay } from '@shared/functions/lima-dates';
import { Option } from '../../models/sunat.models';
import { Json, SaleKind, arr, dayText, kindInfo, money, obj, str, sunatBadge, sunatStatusName } from '../../models/tenant-views.models';
import { TenantAdminService } from '../../services/tenant-admin.service';
import { TenantViewsService } from '../../services/tenant-views.service';
import {
  AFFECTED_DOC_OPTIONS, CREDIT_NOTE_REASONS, DEBIT_NOTE_REASONS, EmissionItem, IGV_AFFECTATION_OPTIONS, ItemField, NOTE_EMIT_ITEM_FIELDS, OPERATION_TYPE_OPTIONS,
  PAYMENT_FORM_OPTIONS, PartyValue, SALE_CURRENCY_OPTIONS, SALE_ITEM_FIELDS, editItemToBody, editItemsFromData, igvOptionsWith, itemErrors, itemToBody,
  jsonSummary, keptItemData, otherErrors, partyErrors, partyFromResource, sameJson, saleItemsFromResource
} from '../emission/emission.models';
import { ItemGridComponent } from '../emission/item-grid.component';
import { PartyBlockComponent } from '../emission/party-block.component';
import { DocActionResult } from './doc-action-modal.component';

interface SaleFixState {
  cliente: PartyValue;
  tipo_moneda: string;
  forma_pago: string;
  fecha_vencimiento: string;
  observacion: string;
  leyenda: string;
  items: EmissionItem[];
  doc_afectado_tipo: string;
  doc_afectado_serie: string;
  doc_afectado_correlativo: string;
  cod_motivo: string;
  des_motivo: string;
}

/** Lo que `datos_edicion` nunca lleva y el panel nunca reenvía (§12.1). */
const NEVER_SENT = ['correlativo', 'leyenda', 'motivo', 'enviar_automatico'];

/** Una fila de solo lectura (lo que el `PUT` no cambia, o lo que se reenvía sin mostrarse). */
interface ReadOnlyRow {
  label: string;
  values: string[];
}

/** Claves de error que tienen un campo en este formulario. */
const KNOWN = ['tipo_moneda', 'forma_pago', 'fecha_vencimiento', 'observacion', 'leyenda', 'doc_afectado_tipo', 'doc_afectado_serie',
  'doc_afectado_correlativo', 'cod_motivo', 'des_motivo', 'motivo', 'enviar_automatico'];

/**
 * Corregir y reenviar una factura, boleta o nota no aceptada (§11.8.4 y §12.1, `Admin.Documents.Issue`).
 *
 * **Con `datos_edicion`** (§12.1, la API actual): el detalle trae el cuerpo exacto del `PUT` armado con lo guardado. El
 * formulario se precarga con él (cliente, moneda, forma de pago, vencimiento, observación, documento que modifica y motivo de
 * las notas, ítems con su `tip_afe_igv` y código SUNAT) y envía **ese mismo objeto** con lo corregido encima, más `motivo`:
 * lo que no se muestra (tipo de operación, `porcentaje_igv`, descuentos, ISC, ICBPER del ítem, `descuentos_globales`,
 * `anticipos`, `percepcion`) vuelve sin tocar para que los totales sigan coherentes. Nunca `correlativo` ni `leyenda` (la
 * API la recalcula). Cuotas, detracción, guías, extras, leyenda, sucursal y serie / número no los cambia el `PUT`: se
 * muestran de solo lectura.
 *
 * **Sin `datos_edicion`** (API anterior), como en la entrega 2:
 * `PUT tenants/{id}/{tipo}/{docId}` con **solo los campos que cambiaron** de los que acepta `PUT /api/v1/{tipo}/{id}`
 * (`cliente`, `tipo_moneda`, `forma_pago`, `fecha_vencimiento`, `observacion`, `leyenda`, `items`; en notas `doc_afectado_*`,
 * `cod_motivo`, `des_motivo`), más `motivo` obligatorio y, si se elige, `enviar_automatico` (solo para esta corrección).
 * Se llena con el detalle guardado (`GET {tipo}/{docId}`). Los ítems se envían completos si se tocó alguno (la API los
 * reemplaza y recalcula los totales). La serie, el número y la fecha de emisión no cambian.
 */
@Component({
  selector: 'app-sale-fix-form',
  imports: [FormsModule, NgClass, ItemGridComponent, PartyBlockComponent],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-edit"></em>Corregir y reenviar: {{ typeName }} {{ target.number }}</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" [disabled]="saving()" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      @if (loading()) {
      <div class="erp-loading" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Cargando el comprobante…</div>
      } @else if (loadError()) {
      <div class="alert alert-warning mb-0">{{ loadError() }}</div>
      } @else {
      <div class="border rounded p-3 mb-3">
        <div class="d-flex flex-wrap justify-content-between gap-2">
          <div>
            <div class="small text-muted">{{ typeName }} · emitido {{ issued }}</div>
            <div class="fw-semibold">{{ target.number }}</div>
            @if (target.tenantName) {<div class="small text-muted">{{ target.tenantName }}</div>}
          </div>
          <span class="badge align-self-start" [ngClass]="badge(status)">{{ statusName(status) }}</span>
        </div>
        @if (sunatText) {<div class="small mt-2"><strong>Respuesta de SUNAT:</strong> {{ sunatText }}</div>}
      </div>
      <div class="erp-callout mb-3"><em class="feather icon-info"></em>
        @if (edit) {
        <span>Se precarga con todo lo guardado y se reenvía el comprobante completo con lo que corrija, con la misma serie y número, según el modo con que se
          creó (puede cambiarlo abajo solo para esta corrección). Lo que el formulario no muestra (tasas propias, descuentos, ISC, ICBPER, descuentos globales,
          anticipos, percepción) se devuelve igual; la leyenda la vuelve a calcular la API. La fecha de emisión no se corrige.</span>
        } @else {
        <span>Se guarda con la misma serie y número y se reenvía a SUNAT según el modo con que se creó (puede cambiarlo abajo solo para esta corrección).
          Solo se envían los campos que cambie. La fecha de emisión no se corrige: si es el problema, anule o emita otro comprobante.</span>
        }
      </div>

      <form class="erp-form" novalidate (ngSubmit)="save()">
        <app-party-block title="Cliente" [(value)]="s.cliente" prefix="cliente" [errors]="errors()" [tenantId]="target.tenantId" [lookup]="true"
          [disabled]="saving()" hint="Si cambia el cliente, se envía completo (tipo, número, razón social y dirección)."></app-party-block>

        <div class="row g-2 mb-3">
          <div class="col-6 col-md-3">
            <label class="form-label small" for="sf-moneda">Moneda</label>
            <select id="sf-moneda" class="form-select form-select-sm" name="tipo_moneda" [(ngModel)]="s.tipo_moneda" [class.is-invalid]="!!err('tipo_moneda')">
              @for (o of currencies; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
            @if (err('tipo_moneda')) {<div class="invalid-feedback">{{ err('tipo_moneda') }}</div>}
          </div>
          @if (!isNote) {
          <div class="col-6 col-md-3">
            <label class="form-label small" for="sf-forma">Forma de pago</label>
            <select id="sf-forma" class="form-select form-select-sm" name="forma_pago" [(ngModel)]="s.forma_pago" [class.is-invalid]="!!err('forma_pago')">
              @if (!s.forma_pago) {<option [ngValue]="''">Sin indicar</option>}
              @for (o of paymentForms; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
            @if (err('forma_pago')) {<div class="invalid-feedback">{{ err('forma_pago') }}</div>}
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small" for="sf-venc">Vencimiento</label>
            <input id="sf-venc" type="date" class="form-control form-control-sm" name="fecha_vencimiento" [(ngModel)]="s.fecha_vencimiento"
              [class.is-invalid]="!!err('fecha_vencimiento')" />
            @if (err('fecha_vencimiento')) {<div class="invalid-feedback">{{ err('fecha_vencimiento') }}</div>}
          </div>
          @if (s.forma_pago === 'Credito' && !edit) {
          <div class="col-12"><p class="form-text mb-0">Las cuotas del crédito no se corrigen aquí: se conservan las guardadas.</p></div>
          }
          }
        </div>

        @if (isNote) {
        <fieldset class="border rounded p-3 mb-3">
          <legend class="float-none w-auto px-2 fs-6 mb-0">Documento que modifica y motivo</legend>
          <div class="row g-2">
            <div class="col-md-4">
              <label class="form-label small" for="sf-af-tipo">Tipo</label>
              <select id="sf-af-tipo" class="form-select form-select-sm" name="doc_afectado_tipo" [(ngModel)]="s.doc_afectado_tipo"
                [class.is-invalid]="!!err('doc_afectado_tipo')">
                <option [ngValue]="''">Sin indicar</option>
                @for (o of affectedTypes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
              </select>
              @if (err('doc_afectado_tipo')) {<div class="invalid-feedback">{{ err('doc_afectado_tipo') }}</div>}
            </div>
            <div class="col-6 col-md-4">
              <label class="form-label small" for="sf-af-serie">Serie</label>
              <input id="sf-af-serie" class="form-control form-control-sm text-uppercase" name="doc_afectado_serie" maxlength="4"
                [ngModel]="s.doc_afectado_serie" (ngModelChange)="s.doc_afectado_serie = ($event || '').toUpperCase()" [class.is-invalid]="!!err('doc_afectado_serie')" />
              @if (err('doc_afectado_serie')) {<div class="invalid-feedback">{{ err('doc_afectado_serie') }}</div>}
            </div>
            <div class="col-6 col-md-4">
              <label class="form-label small" for="sf-af-corr">Correlativo</label>
              <input id="sf-af-corr" class="form-control form-control-sm" name="doc_afectado_correlativo" maxlength="10" inputmode="numeric"
                [(ngModel)]="s.doc_afectado_correlativo" [class.is-invalid]="!!err('doc_afectado_correlativo')" />
              @if (err('doc_afectado_correlativo')) {<div class="invalid-feedback">{{ err('doc_afectado_correlativo') }}</div>}
            </div>
            <div class="col-md-5">
              <label class="form-label small" for="sf-motivo-cod">Motivo SUNAT</label>
              <select id="sf-motivo-cod" class="form-select form-select-sm" name="cod_motivo" [(ngModel)]="s.cod_motivo" [class.is-invalid]="!!err('cod_motivo')">
                @if (!s.cod_motivo) {<option [ngValue]="''">Elija…</option>}
                @for (o of noteReasons; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
              </select>
              @if (err('cod_motivo')) {<div class="invalid-feedback">{{ err('cod_motivo') }}</div>}
            </div>
            <div class="col-md-7">
              <label class="form-label small" for="sf-motivo-des">Descripción del motivo</label>
              <input id="sf-motivo-des" class="form-control form-control-sm" name="des_motivo" maxlength="250" [(ngModel)]="s.des_motivo"
                [class.is-invalid]="!!err('des_motivo')" />
              @if (err('des_motivo')) {<div class="invalid-feedback">{{ err('des_motivo') }}</div>}
            </div>
          </div>
        </fieldset>
        }

        <fieldset class="border rounded p-3 mb-3">
          <legend class="float-none w-auto px-2 fs-6 mb-0">Ítems</legend>
          <app-item-grid [(items)]="s.items" [fields]="itemFields" [igvTypes]="igvTypes" [currency]="s.tipo_moneda" [errors]="errors()" [disabled]="saving()"></app-item-grid>
          @if (keptItems().length) {
          <p class="form-text mb-0">Se devuelven sin cambios (no se muestran aquí): {{ keptItems().join(' · ') }}. Si cambia la afectación de un ítem, su tasa propia de IGV
            se quita (la API usa la de esa afectación).</p>
          }
          @if (inferredIgv && !edit) {
          <p class="form-text text-warning mb-0">El detalle guardado no trae la afectación del IGV: se marcó "Gravado" en los ítems con IGV. Elija la de los demás
            si corrige los ítems (si no los toca, no se envían).</p>
          }
        </fieldset>

        @if (edit && keptRows.length) {
        <fieldset class="border rounded p-3 mb-3">
          <legend class="float-none w-auto px-2 fs-6 mb-0">Se reenvían sin cambios</legend>
          <p class="form-text mt-0">Vienen en los datos guardados y vuelven tal cual para que la API recalcule totales coherentes con lo emitido.</p>
          <dl class="row small mb-0">
            @for (r of keptRows; track r.label) {<dt class="col-sm-4">{{ r.label }}</dt><dd class="col-sm-8">@for (v of r.values; track $index) {<div>{{ v }}</div>}</dd>}
          </dl>
        </fieldset>
        }
        @if (edit && fixedRows.length) {
        <fieldset class="border rounded p-3 mb-3">
          <legend class="float-none w-auto px-2 fs-6 mb-0">No se corrige aquí</legend>
          <p class="form-text mt-0">La corrección (PUT de la API) no cambia estos datos: quedan como se guardaron. Para cambiarlos hay que anular el comprobante (o emitir
            una nota) y emitir otro.</p>
          <dl class="row small mb-0">
            @for (r of fixedRows; track r.label) {<dt class="col-sm-4">{{ r.label }}</dt><dd class="col-sm-8">@for (v of r.values; track $index) {<div>{{ v }}</div>}</dd>}
          </dl>
          <p class="form-text mb-0 mt-1">La leyenda (monto en letras) se vuelve a calcular con los ítems corregidos.</p>
        </fieldset>
        }

        <div class="row g-2 mb-3">
          <div class="col-md-6">
            <label class="form-label small" for="sf-obs">Observación</label>
            <textarea id="sf-obs" class="form-control form-control-sm" rows="2" name="observacion" maxlength="500" [(ngModel)]="s.observacion"
              [class.is-invalid]="!!err('observacion')"></textarea>
            @if (err('observacion')) {<div class="invalid-feedback">{{ err('observacion') }}</div>}
          </div>
          @if (!edit) {
          <div class="col-md-6">
            <label class="form-label small" for="sf-ley">Leyenda (monto en letras)</label>
            <textarea id="sf-ley" class="form-control form-control-sm" rows="2" name="leyenda" maxlength="500" [(ngModel)]="s.leyenda"
              [class.is-invalid]="!!err('leyenda')"></textarea>
            @if (err('leyenda')) {<div class="invalid-feedback">{{ err('leyenda') }}</div>}
            <div class="form-text">Si no la cambia y corrige los ítems, la API la vuelve a calcular.</div>
          </div>
          }
        </div>

        <div class="row g-2">
          <div class="col-md-5">
            <label class="form-label small" for="sf-envio">Envío a SUNAT</label>
            <select id="sf-envio" class="form-select form-select-sm" name="envio" [(ngModel)]="envio">
              <option [ngValue]="''">Como se creó el comprobante (por defecto)</option>
              <option [ngValue]="'si'">Enviar a SUNAT al guardar</option>
              <option [ngValue]="'no'">Dejar pendiente (enviar después)</option>
            </select>
          </div>
          <div class="col-md-7">
            <label class="form-label small" for="sf-motivo">Motivo de la corrección <span class="erp-required">*</span></label>
            <textarea id="sf-motivo" class="form-control form-control-sm" rows="2" name="motivo" [attr.maxlength]="reasonMax" [(ngModel)]="motivo"
              placeholder="Por ejemplo: el cliente tenía mal el RUC (rechazo 2017). Queda en la auditoría." [class.is-invalid]="!!err('motivo')"></textarea>
            @if (err('motivo')) {<div class="invalid-feedback">{{ err('motivo') }}</div>}
          </div>
        </div>
        <button type="submit" class="d-none" aria-hidden="true" tabindex="-1"></button>
      </form>

      @if (others().length || error()) {
      <div class="alert alert-danger py-2 small mt-3 mb-0" role="alert">
        @if (error()) {<div>{{ error() }}</div>}
        @for (o of others(); track $index) {<div>{{ o }}</div>}
      </div>
      }
      }
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" [disabled]="saving()" (click)="activeModal.dismiss()">Cancelar</button>
      @if (!loading() && !loadError()) {
      <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">
        @if (saving()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
        Guardar y reenviar
      </button>
      }
    </div>
  `
})
export class SaleFixFormComponent implements OnInit {
  readonly activeModal = inject(NgbActiveModal);
  private admin = inject(TenantAdminService);
  private views = inject(TenantViewsService);

  target!: ActionTarget;

  readonly currencies = SALE_CURRENCY_OPTIONS;
  readonly paymentForms = PAYMENT_FORM_OPTIONS;
  readonly affectedTypes = AFFECTED_DOC_OPTIONS;
  itemFields: ItemField[] = SALE_ITEM_FIELDS;
  igvTypes: Option<string>[] = IGV_AFFECTATION_OPTIONS;
  readonly reasonMax = REASON_MAX;
  kind!: SaleKind;
  isNote = false;
  typeName = '';
  noteReasons = CREDIT_NOTE_REASONS;
  issued = '';
  status = '';
  sunatText = '';
  inferredIgv = false;
  /** `datos_edicion` del detalle (§12.1); `null` con una API anterior. */
  edit: Json | null = null;
  /** Lo que el `PUT` no cambia (solo lectura). */
  fixedRows: ReadOnlyRow[] = [];
  /** Lo que se reenvía tal cual sin mostrarse (descuentos globales, anticipos, percepción, tipo de operación). */
  keptRows: ReadOnlyRow[] = [];
  s!: SaleFixState;
  private initial!: SaleFixState;
  motivo = '';
  envio: '' | 'si' | 'no' = '';

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly saving = signal(false);
  readonly error = signal('');
  readonly errors = signal<Record<string, string>>({});
  readonly others = signal<string[]>([]);

  ngOnInit(): void {
    this.kind = this.target.kind as SaleKind;
    this.isNote = this.kind === 'notas-credito' || this.kind === 'notas-debito';
    this.noteReasons = this.kind === 'notas-debito' ? DEBIT_NOTE_REASONS : CREDIT_NOTE_REASONS;
    this.typeName = kindInfo(this.kind).singular;
    this.views.get(this.target.tenantId, `${this.kind}/${this.target.docId}`).subscribe({
      next: (resp) => {
        this.loading.set(false);
        if (resp.succeeded && resp.data) {
          this.fill(obj(resp.data));
        } else {
          this.loadError.set(serverMessages(resp, 'No se pudo cargar el comprobante.'));
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(actionHttpError(err, 'No se pudo cargar el comprobante.'));
      }
    });
  }

  private fill(d: Json): void {
    const sunat = obj(d['sunat']);
    this.status = str(sunat['estado']);
    this.sunatText = [str(sunat['codigo']), str(sunat['descripcion'])].filter(Boolean).join(' – ');
    this.issued = dayText(d['fecha_emision']);
    const edit = d['datos_edicion'];
    if (edit != null && typeof edit === 'object' && !Array.isArray(edit)) {
      this.fillFromEdit(d, edit as Json);
      return;
    }
    const a = obj(d['doc_afectado']);
    const items = saleItemsFromResource(d['items']);
    this.inferredIgv = items.some((i) => !i.tip_afe_igv);
    const state: SaleFixState = {
      cliente: partyFromResource(d['cliente']), tipo_moneda: str(d['tipo_moneda']) || 'PEN', forma_pago: str(d['forma_pago']),
      fecha_vencimiento: str(d['fecha_vencimiento']).substring(0, 10), observacion: str(d['observacion']), leyenda: str(d['leyenda']), items,
      doc_afectado_tipo: str(a['tipo']), doc_afectado_serie: str(a['serie']), doc_afectado_correlativo: str(a['correlativo']),
      cod_motivo: str(a['motivo_codigo']), des_motivo: str(a['motivo_descripcion'])
    };
    this.initial = structuredClone(state);
    this.s = state;
  }

  /** Precarga con `datos_edicion` (§12.1) y arma las filas de solo lectura con el recurso de `/api/v1`. */
  private fillFromEdit(d: Json, e: Json): void {
    this.edit = e;
    this.itemFields = NOTE_EMIT_ITEM_FIELDS;
    const items = editItemsFromData(e['items']);
    this.igvTypes = igvOptionsWith(items.map((i) => i.tip_afe_igv));
    const state: SaleFixState = {
      cliente: partyFromResource(e['cliente']), tipo_moneda: str(e['tipo_moneda']) || 'PEN', forma_pago: str(e['forma_pago']),
      fecha_vencimiento: str(e['fecha_vencimiento']).substring(0, 10), observacion: str(e['observacion']), leyenda: '', items,
      doc_afectado_tipo: str(e['doc_afectado_tipo']), doc_afectado_serie: str(e['doc_afectado_serie']), doc_afectado_correlativo: str(e['doc_afectado_correlativo']),
      cod_motivo: str(e['cod_motivo']), des_motivo: str(e['des_motivo'])
    };
    this.initial = structuredClone(state);
    this.s = state;
    const currency = state.tipo_moneda;
    const row = (label: string, values: string[]): ReadOnlyRow | null => (values.length ? { label, values } : null);
    const op = str(e['tipo_operacion']);
    this.fixedRows = [
      row('Serie y número', [str(d['numero_completo']) || [str(d['serie']), str(d['correlativo'])].filter(Boolean).join('-')].filter(Boolean)),
      row('Sucursal (código de local)', [str(d['cod_local'])].filter(Boolean)),
      row('Cuotas', arr(d['cuotas']).map((c, i) => `Cuota ${i + 1}: ${money(c['monto'], currency)} · vence ${ymdToDisplay(str(c['fecha_pago']).substring(0, 10))}`)),
      row('Detracción', jsonSummary(d['detraccion'])),
      row('Guías relacionadas', jsonSummary(d['guias'])),
      row('Datos adicionales (extras)', jsonSummary(d['extras'])),
      row('Leyenda guardada', [str(d['leyenda'])].filter(Boolean))
    ].filter((r): r is ReadOnlyRow => !!r);
    this.keptRows = [
      row('Tipo de operación', op ? [OPERATION_TYPE_OPTIONS.find((o) => o.id === op)?.name ?? op] : []),
      row('Descuentos globales', jsonSummary(e['descuentos_globales'])),
      row('Anticipos', jsonSummary(e['anticipos'])),
      row('Percepción', jsonSummary(e['percepcion']))
    ].filter((r): r is ReadOnlyRow => !!r);
  }

  /** Datos de un ítem que se devuelven sin mostrarse (p. ej. "Ítem 2: descuentos, ISC"). */
  keptItems(): string[] {
    return this.edit ? this.s.items.map((i, n) => ({ n, kept: keptItemData(i) })).filter((x) => x.kept.length)
      .map((x) => `Ítem ${x.n + 1}: ${x.kept.join(', ')}`) : [];
  }

  err(key: string): string {
    return this.errors()[key] ?? '';
  }

  statusName(v: string): string {
    return sunatStatusName(v);
  }

  badge(v: string): string {
    return sunatBadge(v);
  }

  private clientBody(p: PartyValue, cleared: boolean): Json {
    const b: Json = { tipo_doc: p.tipo_doc, num_doc: p.num_doc.trim(), razon_social: p.razon_social.trim() };
    if (p.direccion.trim()) {
      b['direccion'] = p.direccion.trim();
    } else if (cleared) {
      b['direccion'] = null;
    }
    return b;
  }

  private itemsOf(list: EmissionItem[]): Json[] {
    return list.map((i) => itemToBody(i, this.itemFields));
  }

  /** Solo lo que cambió (más `motivo` y `enviar_automatico` si se eligió). */
  private buildBody(): { body: Json; changed: string[]; errors: Record<string, string> } {
    const s = this.s;
    const i = this.initial;
    const body: Json = {};
    let e: Record<string, string> = {};
    const text = (v: string) => (v.trim() ? v.trim() : null);
    const initialClient = this.clientBody(i.cliente, false);
    const client = this.clientBody(s.cliente, !!i.cliente.direccion.trim());
    if (!sameJson(client, initialClient)) {
      body['cliente'] = client;
      e = { ...e, ...partyErrors(s.cliente, 'cliente') };
    }
    if (s.tipo_moneda !== i.tipo_moneda) {
      body['tipo_moneda'] = s.tipo_moneda;
    }
    if (!this.isNote) {
      if (s.forma_pago !== i.forma_pago && s.forma_pago) {
        body['forma_pago'] = s.forma_pago;
      }
      if (s.fecha_vencimiento !== i.fecha_vencimiento) {
        body['fecha_vencimiento'] = s.fecha_vencimiento || null;
      }
    }
    if (s.observacion.trim() !== i.observacion.trim()) {
      body['observacion'] = text(s.observacion);
    }
    if (s.leyenda.trim() !== i.leyenda.trim()) {
      body['leyenda'] = text(s.leyenda);
    }
    const items = this.itemsOf(s.items);
    if (!sameJson(items, this.itemsOf(i.items))) {
      body['items'] = items;
      e = { ...e, ...itemErrors(s.items, this.itemFields) };
    }
    if (this.isNote) {
      (['doc_afectado_tipo', 'doc_afectado_serie', 'doc_afectado_correlativo'] as const).forEach((k) => {
        if (s[k].trim() !== i[k].trim()) {
          body[k] = text(s[k]);
        }
      });
      if (s.cod_motivo !== i.cod_motivo && s.cod_motivo) {
        body['cod_motivo'] = s.cod_motivo;
      }
      if (s.des_motivo.trim() !== i.des_motivo.trim()) {
        if (!s.des_motivo.trim()) {
          e['des_motivo'] = 'Indique la descripción del motivo.';
        }
        body['des_motivo'] = s.des_motivo.trim();
      }
      if (body['doc_afectado_serie'] && !/^[A-Z0-9]{4}$/.test(str(body['doc_afectado_serie']))) {
        e['doc_afectado_serie'] = 'La serie tiene 4 caracteres.';
      }
    }
    return { body, changed: Object.keys(body), errors: e };
  }

  /** Cliente de `datos_edicion` con lo corregido encima (`tipo_doc`, `num_doc`, `razon_social` solo con valor; `direccion` o `null`). */
  private editClient(p: PartyValue): Json {
    const c: Json = { ...obj(this.edit?.['cliente']) };
    (['tipo_doc', 'num_doc', 'razon_social'] as const).forEach((k) => {
      if (p[k].trim()) {
        c[k] = p[k].trim();
      } else {
        delete c[k];
      }
    });
    c['direccion'] = p.direccion.trim() ? p.direccion.trim() : null;
    return c;
  }

  /** `datos_edicion` con el estado del formulario encima (sin `motivo`). */
  private editBody(st: SaleFixState): Json {
    const e = this.edit ?? {};
    const b: Json = structuredClone(e);
    NEVER_SENT.forEach((k) => delete b[k]);
    const text = (v: string) => (v.trim() ? v.trim() : null);
    b['cliente'] = this.editClient(st.cliente);
    b['tipo_moneda'] = st.tipo_moneda;
    b['observacion'] = text(st.observacion);
    if (!this.isNote) {
      b['forma_pago'] = st.forma_pago || (e['forma_pago'] ?? null);
      b['fecha_vencimiento'] = st.fecha_vencimiento || null;
    } else {
      b['doc_afectado_tipo'] = text(st.doc_afectado_tipo);
      b['doc_afectado_serie'] = text(st.doc_afectado_serie);
      b['doc_afectado_correlativo'] = text(st.doc_afectado_correlativo);
      (['cod_motivo', 'des_motivo'] as const).forEach((k) => {
        if (st[k].trim()) {
          b[k] = st[k].trim();
        } else {
          delete b[k];
        }
      });
    }
    // Una tasa propia (`porcentaje_igv`) solo sigue si no se cambió la afectación del ítem (§12.1).
    const initialTip = new Map(this.initial.items.map((i) => [i.key, i.tip_afe_igv]));
    b['items'] = st.items.map((i) => {
      const x = editItemToBody(i, this.itemFields);
      if (initialTip.has(i.key) && initialTip.get(i.key) !== i.tip_afe_igv && x['porcentaje_igv'] != null) {
        x['porcentaje_igv'] = null;
      }
      return x;
    });
    return b;
  }

  /** Cuerpo completo (§12.1): `datos_edicion` + lo corregido. Solo se validan las partes que cambiaron. */
  private buildEditBody(): { body: Json; changed: string[]; errors: Record<string, string> } {
    const body = this.editBody(this.s);
    const before = this.editBody(this.initial);
    const changed = Object.keys(body).filter((k) => !sameJson(body[k], before[k]));
    let e: Record<string, string> = {};
    if (changed.includes('cliente')) {
      e = { ...e, ...partyErrors(this.s.cliente, 'cliente') };
    }
    if (changed.includes('items')) {
      e = { ...e, ...itemErrors(this.s.items, this.itemFields) };
    }
    if (this.isNote) {
      if (changed.includes('des_motivo') && !this.s.des_motivo.trim()) {
        e['des_motivo'] = 'Indique la descripción del motivo.';
      }
      if (body['doc_afectado_serie'] && !/^[A-Z0-9]{4}$/.test(str(body['doc_afectado_serie']))) {
        e['doc_afectado_serie'] = 'La serie tiene 4 caracteres.';
      }
    }
    return { body, changed, errors: e };
  }

  save(): void {
    if (this.saving()) {
      return;
    }
    const { body, changed, errors } = this.edit ? this.buildEditBody() : this.buildBody();
    const motivo = this.motivo.trim();
    const e = { ...errors };
    if (!motivo) {
      e['motivo'] = 'El motivo es obligatorio.';
    } else if (motivo.length > REASON_MAX) {
      e['motivo'] = `Máximo ${REASON_MAX} caracteres.`;
    }
    this.error.set(changed.length ? '' : 'No hay cambios: corrija al menos un campo. Para enviar el mismo comprobante sin cambios use "Reenviar a SUNAT".');
    this.errors.set(e);
    this.others.set([]);
    if (Object.keys(e).length || !changed.length) {
      return;
    }
    body['motivo'] = motivo;
    if (this.envio) {
      body['enviar_automatico'] = this.envio === 'si';
    }
    this.saving.set(true);
    this.admin.fixDocument(this.target.tenantId, this.kind, this.target.docId, body).subscribe({
      next: (resp) => {
        this.saving.set(false);
        if (resp.succeeded) {
          this.activeModal.close({ action: 'fix', resp } as DocActionResult);
          return;
        }
        this.showErrors(fieldErrors(resp), serverMessages({ messages: resp.messages }, 'La API no aceptó la corrección.'));
      },
      error: (err) => {
        this.saving.set(false);
        this.showErrors(fieldErrors(err?.error), actionHttpError(err, 'No se pudo corregir el comprobante.'));
      }
    });
  }

  private showErrors(fields: Record<string, string>, message: string): void {
    this.errors.set(fields);
    this.error.set(message);
    this.others.set(otherErrors(fields, (k) => KNOWN.includes(k) || k === 'cliente' || k.startsWith('cliente.') || k === 'items' || k.startsWith('items.'))
      .filter((m) => !message.includes(m)));
  }
}
