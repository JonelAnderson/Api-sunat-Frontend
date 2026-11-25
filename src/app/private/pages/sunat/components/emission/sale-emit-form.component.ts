import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addDaysYmd, limaTodayYmd, ymdToDisplay } from '@shared/functions/lima-dates';
import { rows, serverMessages } from '@shared/functions/list-helpers';
import { Option } from '../../models/sunat.models';
import { actionHttpError } from '../../models/document-actions.models';
import { Json, SaleKind, money, obj, str, sunatStatusName } from '../../models/tenant-views.models';
import { EmissionService } from '../../services/emission.service';
import { TenantViewsService } from '../../services/tenant-views.service';
import { EmissionActionsComponent, withReason } from './emission-actions.component';
import { EmissionSubmitter, IssueOutcome } from './emission-submit';
import { EmissionContext, EmitType, seriesOptions } from './emission-types';
import {
  AFFECTED_DOC_OPTIONS, CREDIT_NOTE_REASONS, DEBIT_NOTE_REASONS, DETRACTION_GOODS, DETRACTION_OPERATIONS, EmissionItem, ItemField, NOTE_EMIT_ITEM_FIELDS,
  OPERATION_TYPE_OPTIONS, PARTY_DOC_OPTIONS, PAYMENT_FORM_OPTIONS, PAYMENT_MEANS_OPTIONS, PERCEPTION_OPERATION, PERCEPTION_REGIMES, PartyValue,
  SALE_CURRENCY_OPTIONS, SALE_EMIT_ITEM_FIELDS, SALE_GUIDE_TYPES, SALE_PAYMENT_METHODS, emptyItem, emptyParty, itemErrors, itemToBody, partyErrors,
  partyFromResource, partyToBody, round2, saleItemsFromResource, splitInstallments, totalsPreview
} from './emission.models';
import { ItemGridComponent } from './item-grid.component';
import { PartyBlockComponent } from './party-block.component';

interface Installment {
  key: string;
  monto: number | null;
  fecha_pago: string;
}

interface RelatedGuide {
  key: string;
  tipo_doc: string;
  nro_doc: string;
}

interface Payment {
  key: string;
  metodo: string;
  monto: number | null;
  referencia: string;
}

/** Comprobante origen de una nota (`?origen=facturas&origenId=15` o "Traer datos"). */
export interface NoteSource {
  kind: 'facturas' | 'boletas';
  id: number;
}

let seq = 0;
const key = (p: string) => `${p}-${++seq}`;

/** Campos con error de la API que tienen lugar en el formulario (el resto se lista al final). */
const KNOWN_FIELDS = ['serie', 'correlativo', 'fecha_emision', 'fecha_vencimiento', 'tipo_operacion', 'tipo_moneda', 'forma_pago', 'observacion', 'leyenda',
  'doc_afectado_tipo', 'doc_afectado_serie', 'doc_afectado_correlativo', 'cod_motivo', 'des_motivo', 'motivo', 'tax_regime'];
const KNOWN_PREFIXES = ['cliente', 'items', 'cuotas', 'detraccion', 'percepcion', 'guias', 'pagos', 'descuentos_globales', 'extras'];

/**
 * Emitir factura, boleta, nota de crédito o nota de débito (§11.7): `POST tenants/{id}/{facturas|boletas|notas-credito|
 * notas-debito}` con el cuerpo de `/api/v1` (snake_case) más `motivo` opcional y la cabecera `Idempotency-Key`.
 * - Factura / boleta: serie activa del tipo, fecha, moneda, tipo de operación, forma de pago (crédito → cuotas con reparto
 *   automático), cliente (con "Consultar"), ítems con código SUNAT y descuento %, detracción (1001–1004, monto = total × % como
 *   valida la API), percepción (2001), guías relacionadas, pagos recibidos, orden de compra (`extras.orden_compra`),
 *   observación y envío (enviar ahora, dejar pendiente o, en boletas, "solo registro" para el resumen diario).
 * - Notas: documento que modifica (se traen cliente, moneda e ítems con "Traer datos" o desde el detalle del comprobante
 *   aceptado), motivo del catálogo 09 / 10 (los ítems se bloquean según el motivo, como la referencia) y, en la NC 04, el
 *   descuento global. La serie se filtra por la letra del comprobante (F para facturas, B para boletas).
 * Los totales del pie son una vista previa con la tasa de la empresa; los oficiales los calcula la API.
 */
@Component({
  selector: 'app-sale-emit-form',
  imports: [FormsModule, ItemGridComponent, PartyBlockComponent, EmissionActionsComponent],
  template: `
    <form class="erp-form" novalidate (ngSubmit)="submit()">
      @if (isNote) {
      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">Documento que modifica</legend>
        <div class="row g-2 align-items-end">
          <div class="col-md-3">
            <label class="form-label small" for="se-af-tipo">Tipo @if (!affectedOptional()) {<span class="erp-required">*</span>}</label>
            <select id="se-af-tipo" class="form-select form-select-sm" name="doc_afectado_tipo" [(ngModel)]="docTipo" (ngModelChange)="onAffectedType()"
              [class.is-invalid]="!!err('doc_afectado_tipo')">
              @for (o of affectedTypes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
            @if (err('doc_afectado_tipo')) {<div class="invalid-feedback">{{ err('doc_afectado_tipo') }}</div>}
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small" for="se-af-serie">Serie @if (!affectedOptional()) {<span class="erp-required">*</span>}</label>
            <input id="se-af-serie" class="form-control form-control-sm text-uppercase" name="doc_afectado_serie" maxlength="4" [ngModel]="docSerie"
              (ngModelChange)="docSerie = ($event || '').toUpperCase()" [class.is-invalid]="!!err('doc_afectado_serie')" />
            @if (err('doc_afectado_serie')) {<div class="invalid-feedback">{{ err('doc_afectado_serie') }}</div>}
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small" for="se-af-corr">Correlativo @if (!affectedOptional()) {<span class="erp-required">*</span>}</label>
            <input id="se-af-corr" class="form-control form-control-sm" name="doc_afectado_correlativo" maxlength="9" inputmode="numeric" [(ngModel)]="docCorrelativo"
              [class.is-invalid]="!!err('doc_afectado_correlativo')" />
            @if (err('doc_afectado_correlativo')) {<div class="invalid-feedback">{{ err('doc_afectado_correlativo') }}</div>}
          </div>
          <div class="col-md-5">
            @if (docTipo === '01' || docTipo === '03') {
            <button type="button" class="btn btn-sm btn-outline-primary" [disabled]="loadingSource() || sub.sending()" (click)="findSource()">
              @if (loadingSource()) {<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>} @else {<em class="feather icon-download-cloud me-1"></em>}
              Traer datos del comprobante
            </button>
            }
          </div>
        </div>
        @if (sourceInfo(); as si) {<div class="small mt-2" [class.text-success]="si.ok" [class.text-danger]="!si.ok">{{ si.text }}</div>}
        <p class="form-text mb-0 mt-2">"Traer datos" busca el comprobante de esta empresa y copia el cliente, la moneda y los ítems (puede ajustarlos según el motivo).
          La nota va en la moneda del comprobante y, en devoluciones, no puede superar su total.</p>
        <div class="row g-2 mt-1">
          <div class="col-md-5">
            <label class="form-label small" for="se-cod-motivo">Motivo SUNAT <span class="erp-required">*</span></label>
            <select id="se-cod-motivo" class="form-select form-select-sm" name="cod_motivo" [(ngModel)]="codMotivo" (ngModelChange)="onReason()"
              [class.is-invalid]="!!err('cod_motivo')">
              <option [ngValue]="''">Elija…</option>
              @for (o of reasons; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
            @if (err('cod_motivo')) {<div class="invalid-feedback">{{ err('cod_motivo') }}</div>}
          </div>
          <div class="col-md-7">
            <label class="form-label small" for="se-des-motivo">Descripción del motivo <span class="erp-required">*</span></label>
            <input id="se-des-motivo" class="form-control form-control-sm" name="des_motivo" maxlength="250" [(ngModel)]="desMotivo"
              [class.is-invalid]="!!err('des_motivo')" />
            @if (err('des_motivo')) {<div class="invalid-feedback">{{ err('des_motivo') }}</div>}
          </div>
        </div>
        @if (reasonHint()) {<div class="erp-callout mt-2 mb-0 small"><em class="feather icon-info"></em><span>{{ reasonHint() }}</span></div>}
      </fieldset>
      }

      <div class="row g-2 mb-3">
        <div class="col-6 col-md-3">
          <label class="form-label small" for="se-serie">Serie <span class="erp-required">*</span></label>
          <select id="se-serie" class="form-select form-select-sm" name="serie" [(ngModel)]="serie" [class.is-invalid]="!!err('serie')">
            <option [ngValue]="''">Elija…</option>
            @for (o of seriesList(); track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
          @if (err('serie')) {<div class="invalid-feedback">{{ err('serie') }}</div>}
          @if (!seriesList().length) {<div class="form-text text-danger">La empresa no tiene series activas {{ seriesHint() }}: créelas en Configuración.</div>}
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label small" for="se-fecha">Fecha de emisión <span class="erp-required">*</span></label>
          <input id="se-fecha" type="date" class="form-control form-control-sm" name="fecha_emision" [(ngModel)]="fechaEmision" [max]="today"
            [class.is-invalid]="!!err('fecha_emision')" />
          @if (err('fecha_emision')) {<div class="invalid-feedback">{{ err('fecha_emision') }}</div>}
        </div>
        <div class="col-6 col-md-2">
          <label class="form-label small" for="se-moneda">Moneda</label>
          <select id="se-moneda" class="form-select form-select-sm" name="tipo_moneda" [(ngModel)]="moneda" [class.is-invalid]="!!err('tipo_moneda')">
            @for (o of currencies; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
          @if (err('tipo_moneda')) {<div class="invalid-feedback">{{ err('tipo_moneda') }}</div>}
        </div>
        @if (!isNote) {
        <div class="col-md-4">
          <label class="form-label small" for="se-tipo-op">Tipo de operación</label>
          <select id="se-tipo-op" class="form-select form-select-sm" name="tipo_operacion" [(ngModel)]="tipoOperacion" (ngModelChange)="onOperation()"
            [class.is-invalid]="!!err('tipo_operacion')">
            @for (o of operations; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
          @if (err('tipo_operacion')) {<div class="invalid-feedback">{{ err('tipo_operacion') }}</div>}
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label small" for="se-forma">Forma de pago</label>
          <select id="se-forma" class="form-select form-select-sm" name="forma_pago" [(ngModel)]="formaPago" (ngModelChange)="onPaymentForm()"
            [class.is-invalid]="!!err('forma_pago')">
            @for (o of paymentForms; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
          @if (err('forma_pago')) {<div class="invalid-feedback">{{ err('forma_pago') }}</div>}
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label small" for="se-venc">Vencimiento</label>
          <input id="se-venc" type="date" class="form-control form-control-sm" name="fecha_vencimiento" [(ngModel)]="fechaVencimiento" [min]="fechaEmision"
            [class.is-invalid]="!!err('fecha_vencimiento')" />
          @if (err('fecha_vencimiento')) {<div class="invalid-feedback">{{ err('fecha_vencimiento') }}</div>}
          @if (formaPago === 'Credito') {<div class="form-text">Vacío = la fecha de la última cuota.</div>}
        </div>
        @if (isFactura) {
        <div class="col-md-3">
          <label class="form-label small" for="se-oc">Orden de compra</label>
          <input id="se-oc" class="form-control form-control-sm" name="orden_compra" maxlength="50" [(ngModel)]="ordenCompra" />
        </div>
        }
        }
      </div>

      <app-party-block [title]="isNote ? 'Cliente (del comprobante que modifica)' : 'Cliente'" [(value)]="cliente" prefix="cliente" [errors]="sub.errors()"
        [docTypes]="clientTypes()" [tenantId]="ctx().tenantId" [lookup]="true" [disabled]="sub.sending()" [hint]="clientHint()"></app-party-block>

      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">Ítems</legend>
        <app-item-grid [(items)]="items" [fields]="itemFields()" [currency]="moneda" [errors]="sub.errors()" [disabled]="sub.sending()" [rate]="ctx().igvRatePct"
          [lockedFields]="lockedFields()" [allowAdd]="!itemsLocked()" [allowRemove]="canRemoveItems()"></app-item-grid>
        @if (inferredIgv) {
        <p class="form-text text-warning mb-0">El comprobante guardado no trae la afectación del IGV: se marcó "Gravado" en los ítems con IGV; revise los demás.</p>
        }
        @if (isCreditNote && codMotivo === '04') {
        <div class="row g-2 mt-2">
          <div class="col-md-4">
            <label class="form-label small" for="se-dg">Descuento global (con IGV) <span class="erp-required">*</span></label>
            <input id="se-dg" type="number" min="0" step="any" class="form-control form-control-sm text-end" name="descuento_global" [(ngModel)]="descuentoGlobal"
              [class.is-invalid]="!!err('descuentos_globales')" />
            @if (err('descuentos_globales')) {<div class="invalid-feedback">{{ err('descuentos_globales') }}</div>}
            <div class="form-text">Va como <code>descuentos_globales</code> (código 02) por su base sin IGV: {{ money(globalDiscountBase()) }}.</div>
          </div>
        </div>
        }
      </fieldset>

      @if (!isNote && detractionOn()) {
      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">Detracción (SPOT)</legend>
        <div class="row g-2">
          <div class="col-md-6">
            <label class="form-label small" for="se-det-bien">Bien o servicio (catálogo 54) <span class="erp-required">*</span></label>
            <select id="se-det-bien" class="form-select form-select-sm" name="det_bien" [(ngModel)]="detBien" (ngModelChange)="onDetractionGood()"
              [class.is-invalid]="!!err('detraccion.cod_bien')">
              <option [ngValue]="''">Elija…</option>
              @for (o of detractionGoods; track o.id) {<option [ngValue]="o.id">{{ o.name }}{{ o.rate !== null ? ' (' + o.rate + ' %)' : '' }}</option>}
            </select>
            @if (err('detraccion.cod_bien')) {<div class="invalid-feedback">{{ err('detraccion.cod_bien') }}</div>}
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small" for="se-det-pct">Porcentaje <span class="erp-required">*</span></label>
            <input id="se-det-pct" type="number" min="0" max="100" step="any" class="form-control form-control-sm text-end" name="det_pct" [(ngModel)]="detPct"
              [class.is-invalid]="!!err('detraccion.porcentaje')" />
            @if (err('detraccion.porcentaje')) {<div class="invalid-feedback">{{ err('detraccion.porcentaje') }}</div>}
          </div>
          <div class="col-6 col-md-4">
            <label class="form-label small" for="se-det-cta">Cuenta del Banco de la Nación <span class="erp-required">*</span></label>
            <input id="se-det-cta" class="form-control form-control-sm" name="det_cta" maxlength="20" [(ngModel)]="detCuenta" [class.is-invalid]="!!err('detraccion.cta_banco')" />
            @if (err('detraccion.cta_banco')) {<div class="invalid-feedback">{{ err('detraccion.cta_banco') }}</div>}
          </div>
          <div class="col-md-6">
            <label class="form-label small" for="se-det-medio">Medio de pago (catálogo 59)</label>
            <select id="se-det-medio" class="form-select form-select-sm" name="det_medio" [(ngModel)]="detMedio">
              @for (o of paymentMeans; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
          </div>
          <div class="col-md-6 d-flex align-items-end">
            <div class="small">
              Monto de la detracción: <strong>{{ money(detractionAmount(), moneda) }}</strong> · neto a cobrar {{ money(previewTotal() - detractionAmount(), moneda) }}
              @if (err('detraccion.monto')) {<div class="text-danger">{{ err('detraccion.monto') }}</div>}
              <div class="form-text">Se calcula como total × porcentaje (la API exige ese monto, con 1,00 de tolerancia).</div>
            </div>
          </div>
        </div>
      </fieldset>
      }

      @if (!isNote && perceptionOn()) {
      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">Percepción</legend>
        <div class="row g-2">
          <div class="col-md-6">
            <label class="form-label small" for="se-per-reg">Régimen (catálogo 22) <span class="erp-required">*</span></label>
            <select id="se-per-reg" class="form-select form-select-sm" name="per_reg" [(ngModel)]="perRegimen" (ngModelChange)="onPerceptionRegime()"
              [class.is-invalid]="!!err('percepcion.cod_regimen')">
              @for (o of perceptionRegimes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
            @if (err('percepcion.cod_regimen')) {<div class="invalid-feedback">{{ err('percepcion.cod_regimen') }}</div>}
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small" for="se-per-pct">Porcentaje</label>
            <input id="se-per-pct" type="number" min="0" max="100" step="any" class="form-control form-control-sm text-end" name="per_pct" [(ngModel)]="perPct"
              [class.is-invalid]="!!err('percepcion.porcentaje')" />
          </div>
          <div class="col-md-4 d-flex align-items-end small">
            Base {{ money(previewTotal(), moneda) }} · percepción <strong class="ms-1">{{ money(perceptionAmount(), moneda) }}</strong>
          </div>
        </div>
        @if (err('percepcion.monto') || err('percepcion.base')) {<div class="text-danger small mt-1">{{ err('percepcion.monto') }} {{ err('percepcion.base') }}</div>}
      </fieldset>
      }

      @if (!isNote && formaPago === 'Credito') {
      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">Cuotas del crédito <span class="erp-required">*</span></legend>
        @if (err('cuotas')) {<div class="text-danger small mb-2">{{ err('cuotas') }}</div>}
        <div class="d-flex flex-wrap gap-2 align-items-end mb-2">
          <div>
            <label class="form-label small" for="se-ncuotas">Número de cuotas</label>
            <input id="se-ncuotas" type="number" min="1" max="36" step="1" class="form-control form-control-sm text-end" style="width: 6rem" name="n_cuotas"
              [(ngModel)]="nCuotas" />
          </div>
          <button type="button" class="btn btn-sm btn-outline-primary" (click)="splitCuotas()"><em class="feather icon-divide me-1"></em>Repartir en partes iguales</button>
          <span class="small text-muted">Monto pendiente a repartir (vista previa): {{ money(creditBase(), moneda) }}</span>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-top small mb-2">
            <thead><tr><th scope="col">#</th><th scope="col" class="text-end">Monto</th><th scope="col">Fecha de pago</th><th scope="col"><span class="visually-hidden">Quitar</span></th></tr></thead>
            <tbody>
              @for (q of cuotas; track q.key; let i = $index) {
              <tr>
                <td class="pt-2 text-muted">{{ i + 1 }}</td>
                <td>
                  <input type="number" min="0" step="any" class="form-control form-control-sm text-end" [attr.aria-label]="'Monto de la cuota ' + (i + 1)"
                    [name]="'cuota-m-' + q.key" [(ngModel)]="q.monto" [class.is-invalid]="!!err('cuotas.' + i + '.monto')" />
                  @if (err('cuotas.' + i + '.monto')) {<div class="invalid-feedback">{{ err('cuotas.' + i + '.monto') }}</div>}
                </td>
                <td>
                  <input type="date" class="form-control form-control-sm" [attr.aria-label]="'Fecha de la cuota ' + (i + 1)" [name]="'cuota-f-' + q.key"
                    [(ngModel)]="q.fecha_pago" [min]="fechaEmision" [class.is-invalid]="!!err('cuotas.' + i + '.fecha_pago')" />
                  @if (err('cuotas.' + i + '.fecha_pago')) {<div class="invalid-feedback">{{ err('cuotas.' + i + '.fecha_pago') }}</div>}
                </td>
                <td class="text-end"><button type="button" class="btn btn-sm btn-link text-danger px-1" (click)="cuotas.splice(i, 1)"
                  [attr.aria-label]="'Quitar la cuota ' + (i + 1)" title="Quitar"><em class="feather icon-trash-2"></em></button></td>
              </tr>
              }
            </tbody>
          </table>
        </div>
        <button type="button" class="btn btn-sm btn-outline-primary" [disabled]="cuotas.length >= 36" (click)="addCuota()"><em class="feather icon-plus me-1"></em>Agregar cuota</button>
        @if (cuotasMismatch()) {<p class="form-text text-warning mb-0 mt-1">{{ cuotasMismatch() }}</p>}
      </fieldset>
      }

      @if (!isNote) {
      <div class="row g-3 mb-3">
        <div class="col-lg-6">
          <fieldset class="border rounded p-3 h-100">
            <legend class="float-none w-auto px-2 fs-6 mb-0">Guías de remisión relacionadas</legend>
            @for (g of guias; track g.key; let i = $index) {
            <div class="input-group input-group-sm mb-2 has-validation">
              <select class="form-select" style="max-width: 14rem" [attr.aria-label]="'Tipo de la guía ' + (i + 1)" [name]="'guia-t-' + g.key" [(ngModel)]="g.tipo_doc">
                @for (o of guideTypes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
              </select>
              <input class="form-control" placeholder="T001-123" maxlength="30" [attr.aria-label]="'Número de la guía ' + (i + 1)" [name]="'guia-n-' + g.key"
                [(ngModel)]="g.nro_doc" [class.is-invalid]="!!err('guias.' + i + '.nro_doc')" />
              <button type="button" class="btn btn-outline-danger" (click)="guias.splice(i, 1)" [attr.aria-label]="'Quitar la guía ' + (i + 1)"><em class="feather icon-trash-2"></em></button>
              @if (err('guias.' + i + '.nro_doc')) {<div class="invalid-feedback">{{ err('guias.' + i + '.nro_doc') }}</div>}
            </div>
            }
            <button type="button" class="btn btn-sm btn-outline-primary" (click)="guias.push({ key: newKey('g'), tipo_doc: '09', nro_doc: '' })">
              <em class="feather icon-plus me-1"></em>Agregar guía</button>
          </fieldset>
        </div>
        <div class="col-lg-6">
          <fieldset class="border rounded p-3 h-100">
            <legend class="float-none w-auto px-2 fs-6 mb-0">Pagos recibidos (opcional)</legend>
            @for (p of pagos; track p.key; let i = $index) {
            <div class="input-group input-group-sm mb-2 has-validation">
              <select class="form-select" style="max-width: 9rem" [attr.aria-label]="'Método del pago ' + (i + 1)" [name]="'pago-m-' + p.key" [(ngModel)]="p.metodo">
                @for (o of paymentMethods; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
              </select>
              <input type="number" min="0" step="any" class="form-control text-end" placeholder="Monto" [attr.aria-label]="'Monto del pago ' + (i + 1)"
                [name]="'pago-a-' + p.key" [(ngModel)]="p.monto" [class.is-invalid]="!!err('pagos.' + i + '.monto')" />
              <input class="form-control" placeholder="Referencia" maxlength="100" [attr.aria-label]="'Referencia del pago ' + (i + 1)" [name]="'pago-r-' + p.key"
                [(ngModel)]="p.referencia" />
              <button type="button" class="btn btn-outline-danger" (click)="pagos.splice(i, 1)" [attr.aria-label]="'Quitar el pago ' + (i + 1)"><em class="feather icon-trash-2"></em></button>
              @if (err('pagos.' + i + '.monto')) {<div class="invalid-feedback">{{ err('pagos.' + i + '.monto') }}</div>}
            </div>
            }
            <button type="button" class="btn btn-sm btn-outline-primary" (click)="addPayment()"><em class="feather icon-plus me-1"></em>Agregar pago</button>
            <p class="form-text mb-0 mt-1">Registra lo cobrado junto con el comprobante (estado de pago parcial o pagado).</p>
          </fieldset>
        </div>
      </div>
      }

      <div class="row g-2">
        <div class="col-md-8">
          <label class="form-label small" for="se-obs">Observación</label>
          <textarea id="se-obs" class="form-control form-control-sm" rows="2" name="observacion" maxlength="500" [(ngModel)]="observacion"
            [class.is-invalid]="!!err('observacion')"></textarea>
          @if (err('observacion')) {<div class="invalid-feedback">{{ err('observacion') }}</div>}
        </div>
        <div class="col-md-4">
          <label class="form-label small" for="se-envio">Envío a SUNAT</label>
          <select id="se-envio" class="form-select form-select-sm" name="envio" [(ngModel)]="envio">
            <option ngValue="auto">Enviar a SUNAT al emitir</option>
            <option ngValue="pendiente">Dejar pendiente (enviar después)</option>
            @if (isBoleta) {<option ngValue="resumen">Solo registrar (se informa en el resumen diario)</option>}
          </select>
        </div>
      </div>
      <button type="submit" class="d-none" aria-hidden="true" tabindex="-1"></button>
    </form>

    <app-emission-actions [submitter]="sub" [(motivo)]="motivo" [label]="type().verb" [disabled]="!ctx().active" [changed]="sub.differsFromLast(build().body)"
      (send)="submit()" (retry)="retry()"></app-emission-actions>
  `
})
export class SaleEmitFormComponent implements OnInit {
  private service = inject(EmissionService);
  private views = inject(TenantViewsService);

  readonly ctx = input.required<EmissionContext>();
  readonly type = input.required<EmitType>();
  /** Comprobante origen de una nota (desde el detalle de una factura / boleta aceptada). */
  readonly source = input<NoteSource | null>(null);
  readonly issued = output<IssueOutcome>();

  readonly sub = new EmissionSubmitter(this.service, (k) => KNOWN_FIELDS.includes(k) || KNOWN_PREFIXES.some((p) => k === p || k.startsWith(`${p}.`)));

  readonly currencies = SALE_CURRENCY_OPTIONS;
  readonly paymentForms = PAYMENT_FORM_OPTIONS.filter((o) => o.id === 'Contado' || o.id === 'Credito');
  readonly operations = OPERATION_TYPE_OPTIONS;
  readonly affectedTypes = AFFECTED_DOC_OPTIONS;
  readonly detractionGoods = DETRACTION_GOODS;
  readonly paymentMeans = PAYMENT_MEANS_OPTIONS;
  readonly perceptionRegimes = PERCEPTION_REGIMES;
  readonly guideTypes = SALE_GUIDE_TYPES;
  readonly paymentMethods = SALE_PAYMENT_METHODS;
  readonly today = limaTodayYmd();

  kind!: SaleKind;
  isNote = false;
  isCreditNote = false;
  isFactura = false;
  isBoleta = false;
  reasons: Option<string>[] = CREDIT_NOTE_REASONS;

  serie = '';
  fechaEmision = limaTodayYmd();
  moneda = 'PEN';
  tipoOperacion = '0101';
  formaPago = 'Contado';
  fechaVencimiento = '';
  ordenCompra = '';
  cliente: PartyValue = emptyParty('6');
  items: EmissionItem[] = [emptyItem()];
  inferredIgv = false;
  observacion = '';
  envio: 'auto' | 'pendiente' | 'resumen' = 'auto';
  motivo = '';
  // Crédito
  nCuotas = 1;
  cuotas: Installment[] = [];
  // Detracción y percepción
  detBien = '';
  detPct: number | null = null;
  detCuenta = '';
  detMedio = '001';
  perRegimen = '01';
  perPct: number | null = 2;
  guias: RelatedGuide[] = [];
  pagos: Payment[] = [];
  // Notas
  docTipo = '01';
  docSerie = '';
  docCorrelativo = '';
  codMotivo = '';
  desMotivo = '';
  descuentoGlobal: number | null = null;
  /** Los ítems vienen del comprobante: se bloquean según el motivo (como la referencia). */
  private fromSource = false;

  readonly loadingSource = signal(false);
  readonly sourceInfo = signal<{ ok: boolean; text: string } | null>(null);

  ngOnInit(): void {
    this.kind = this.type().id as SaleKind;
    this.isNote = this.kind === 'notas-credito' || this.kind === 'notas-debito';
    this.isCreditNote = this.kind === 'notas-credito';
    this.isFactura = this.kind === 'facturas';
    this.isBoleta = this.kind === 'boletas';
    this.reasons = this.kind === 'notas-debito' ? DEBIT_NOTE_REASONS : CREDIT_NOTE_REASONS;
    this.cliente = emptyParty(this.isBoleta ? '1' : '6');
    if (this.isNote && this.ctx().taxRegime === 'rus') {
      this.docTipo = '03';
    }
    this.pickDefaultSerie();
    const src = this.source();
    if (this.isNote && src) {
      this.docTipo = src.kind === 'boletas' ? '03' : '01';
      this.pickDefaultSerie();
      this.loadSource(this.views.get(this.ctx().tenantId, `${src.kind}/${src.id}`), true);
    }
  }

  newKey(p: string): string {
    return key(p);
  }

  err(k: string): string {
    return this.sub.errors()[k] ?? '';
  }

  money(v: number, currency?: string): string {
    return money(v, currency);
  }

  // ---------------------------------------------------------------- Series y cliente
  private seriesLetter(): string {
    return this.isNote ? (this.docTipo === '01' ? 'F' : this.docTipo === '03' ? 'B' : '') : '';
  }

  seriesList(): Option<string>[] {
    return seriesOptions(this.ctx(), this.type().seriesType, this.seriesLetter());
  }

  seriesHint(): string {
    const letter = this.seriesLetter();
    return `de ${this.type().name.toLowerCase()}${letter ? ` que empiecen con ${letter}` : ''}`;
  }

  private pickDefaultSerie(): void {
    const list = this.seriesList();
    if (!list.some((o) => o.id === this.serie)) {
      this.serie = list[0]?.id ?? '';
    }
  }

  /** Factura: RUC (o, en exportación, documento de no domiciliado); boleta y notas: cualquiera. */
  clientTypes(): Option<string>[] {
    if (this.isFactura) {
      return this.tipoOperacion.startsWith('02') ? PARTY_DOC_OPTIONS.filter((o) => o.id !== '6' && o.id !== '1') : PARTY_DOC_OPTIONS.filter((o) => o.id === '6');
    }
    return PARTY_DOC_OPTIONS;
  }

  clientHint(): string {
    if (this.isBoleta) {
      return 'Sin documento (tipo 0) solo hasta S/ 700: escriba un número genérico (por ejemplo 00000000) y "CLIENTES VARIOS". La dirección es opcional.';
    }
    if (this.isFactura) {
      return this.tipoOperacion.startsWith('02') ? 'Exportación: cliente no domiciliado (sin RUC).' : 'La factura exige cliente con RUC.';
    }
    return '';
  }

  // ---------------------------------------------------------------- Ítems y motivos de las notas
  itemFields(): ItemField[] {
    if (!this.isNote) {
      return SALE_EMIT_ITEM_FIELDS;
    }
    return this.isCreditNote && this.codMotivo === '05' ? [...NOTE_EMIT_ITEM_FIELDS.slice(0, -1), 'descuento_pct', 'tip_afe_igv'] : NOTE_EMIT_ITEM_FIELDS;
  }

  /** Qué se puede editar de los ítems copiados según el motivo (configuración de la referencia). */
  private editableByReason(): ItemField[] | null {
    if (!this.isNote || !this.fromSource) {
      return null;
    }
    if (this.isCreditNote) {
      switch (this.codMotivo) {
        case '01':
        case '02':
        case '04':
        case '06':
          return [];
        case '03':
          return ['descripcion'];
        case '05':
          return ['descuento_pct'];
        case '07':
          return ['cantidad'];
        case '09':
          return ['precio_unitario'];
        default:
          return null;
      }
    }
    return this.codMotivo === '02' ? ['precio_unitario'] : null;
  }

  lockedFields(): ItemField[] {
    const editable = this.editableByReason();
    return editable ? this.itemFields().filter((f) => !editable.includes(f)) : [];
  }

  itemsLocked(): boolean {
    return this.editableByReason() != null;
  }

  canRemoveItems(): boolean {
    return !this.itemsLocked() || (this.isCreditNote && this.codMotivo === '07');
  }

  affectedOptional(): boolean {
    return this.kind === 'notas-debito' && this.codMotivo === '13';
  }

  reasonHint(): string {
    if (!this.codMotivo) {
      return '';
    }
    if (this.isCreditNote) {
      const hints: Record<string, string> = {
        '01': 'Anula toda la operación: los ítems van iguales al comprobante.',
        '02': 'Anulación por error en el RUC: después emita el comprobante correcto.',
        '03': 'Solo se corrige la descripción de los ítems.',
        '04': 'Descuento global: indique el monto con IGV; los ítems no cambian.',
        '05': 'Descuento por ítem: indique el % de descuento de cada ítem.',
        '06': 'Devolución total: los ítems van iguales al comprobante.',
        '07': 'Devolución por ítem: deje solo lo devuelto y ajuste las cantidades.',
        '08': 'Bonificación.',
        '09': 'Disminución en el valor: ajuste los precios.'
      };
      return hints[this.codMotivo] ?? '';
    }
    return this.codMotivo === '13'
      ? 'Penalidades: el documento que modifica es opcional y la nota solo admite operaciones inafectas (afectación 30).'
      : this.codMotivo === '02' ? 'Aumento en el valor: ajuste los precios.' : '';
  }

  onReason(): void {
    const name = this.reasons.find((o) => o.id === this.codMotivo)?.name ?? '';
    const label = name.replace(/^\d+ - /, '').replace(/ \(.*\)$/, '');
    if (!this.desMotivo.trim() || this.reasons.some((o) => o.name.replace(/^\d+ - /, '').replace(/ \(.*\)$/, '') === this.desMotivo.trim())) {
      this.desMotivo = label;
    }
  }

  onAffectedType(): void {
    this.pickDefaultSerie();
    this.sourceInfo.set(null);
  }

  globalDiscountBase(): number {
    const amount = Number(this.descuentoGlobal ?? 0);
    return round2(amount / (1 + (this.ctx().igvRatePct || 0) / 100));
  }

  /** "Traer datos": busca el comprobante por serie y correlativo (`GET {facturas|boletas}?serie=&correlativo=&con=items`). */
  findSource(): void {
    const serie = this.docSerie.trim();
    const corr = this.docCorrelativo.trim().replace(/^0+(?=\d)/, '');
    if (!/^[A-Z0-9]{4}$/.test(serie) || !/^\d{1,9}$/.test(corr)) {
      this.sourceInfo.set({ ok: false, text: 'Escriba la serie (4 caracteres) y el correlativo (número) del comprobante.' });
      return;
    }
    const kind = this.docTipo === '03' ? 'boletas' : 'facturas';
    this.loadSource(this.views.get(this.ctx().tenantId, kind, { serie, correlativo: corr, con: 'items', records: 1, numPage: 1 }), false);
  }

  private loadSource(call: ReturnType<TenantViewsService['get']>, isDetail: boolean): void {
    this.loadingSource.set(true);
    this.sourceInfo.set(null);
    call.subscribe({
      next: (resp) => {
        this.loadingSource.set(false);
        const doc = resp.succeeded ? (isDetail ? obj(resp.data) : obj(rows<Json>(resp)[0])) : {};
        if (!resp.succeeded || !Object.keys(doc).length) {
          this.sourceInfo.set({ ok: false, text: resp.succeeded ? 'No se encontró ese comprobante en esta empresa.' : serverMessages(resp, 'No se pudo leer el comprobante.') });
          return;
        }
        this.fillFromSource(doc);
      },
      error: (err) => {
        this.loadingSource.set(false);
        this.sourceInfo.set({ ok: false, text: actionHttpError(err, 'No se pudo leer el comprobante.') });
      }
    });
  }

  private fillFromSource(d: Json): void {
    const tipo = str(d['tipo_documento']);
    if (tipo === '01' || tipo === '03') {
      this.docTipo = tipo;
    }
    this.docSerie = str(d['serie']);
    this.docCorrelativo = str(d['correlativo']).replace(/^0+(?=\d)/, '');
    this.moneda = str(d['tipo_moneda']) || this.moneda;
    const client = partyFromResource(d['cliente']);
    if (client.num_doc) {
      this.cliente = { ...client, tipo_doc: client.tipo_doc || (this.docTipo === '03' ? '1' : '6') };
    }
    const items = saleItemsFromResource(d['items']);
    if (items.length) {
      this.items = items;
      this.inferredIgv = items.some((i) => !i.tip_afe_igv);
      this.fromSource = true;
    }
    this.pickDefaultSerie();
    const status = str(obj(d['sunat'])['estado']);
    const total = money(obj(d['totales'])['total'], str(d['tipo_moneda']) || 'PEN');
    const base = `${str(d['numero_completo']) || `${this.docSerie}-${this.docCorrelativo}`} · ${str(obj(d['cliente'])['razon_social'])} · ${total} · ${ymdToDisplay(str(d['fecha_emision']).substring(0, 10))}`;
    this.sourceInfo.set(status === 'aceptado'
      ? { ok: true, text: `Se copiaron los datos de ${base}.` }
      : { ok: false, text: `Se copiaron los datos de ${base}, pero su estado es "${sunatStatusName(status) || 'sin estado'}": SUNAT rechaza notas sobre comprobantes no aceptados.` });
  }

  // ---------------------------------------------------------------- Operación, crédito, detracción y percepción
  previewTotal(): number {
    return round2(totalsPreview(this.items, (this.ctx().igvRatePct || 0) / 100).total);
  }

  detractionOn(): boolean {
    return this.isFactura && DETRACTION_OPERATIONS.includes(this.tipoOperacion);
  }

  perceptionOn(): boolean {
    return this.tipoOperacion === PERCEPTION_OPERATION;
  }

  onOperation(): void {
    if (this.isFactura && this.tipoOperacion.startsWith('02') && this.cliente.tipo_doc === '6') {
      this.cliente = { ...this.cliente, tipo_doc: '0' };
    } else if (this.isFactura && !this.tipoOperacion.startsWith('02') && this.cliente.tipo_doc !== '6') {
      this.cliente = { ...this.cliente, tipo_doc: '6' };
    }
  }

  onDetractionGood(): void {
    const g = this.detractionGoods.find((o) => o.id === this.detBien);
    if (g?.rate != null) {
      this.detPct = g.rate;
    }
  }

  detractionAmount(): number {
    return this.detractionOn() ? round2((this.previewTotal() * Number(this.detPct ?? 0)) / 100) : 0;
  }

  onPerceptionRegime(): void {
    this.perPct = this.perceptionRegimes.find((o) => o.id === this.perRegimen)?.rate ?? this.perPct;
  }

  perceptionAmount(): number {
    return round2((this.previewTotal() * Number(this.perPct ?? 0)) / 100);
  }

  /** Lo que se reparte en cuotas: el total menos la detracción (vista previa). */
  creditBase(): number {
    return round2(this.previewTotal() - this.detractionAmount());
  }

  onPaymentForm(): void {
    if (this.formaPago === 'Credito' && !this.cuotas.length) {
      this.splitCuotas();
    }
  }

  splitCuotas(): void {
    this.cuotas = splitInstallments(this.creditBase(), Number(this.nCuotas) || 1, this.fechaEmision || this.today, addDaysYmd)
      .map((c) => ({ key: key('q'), monto: c.monto, fecha_pago: c.fecha_pago }));
    this.nCuotas = this.cuotas.length;
  }

  addCuota(): void {
    const last = this.cuotas[this.cuotas.length - 1]?.fecha_pago || this.fechaEmision || this.today;
    this.cuotas.push({ key: key('q'), monto: null, fecha_pago: addDaysYmd(last, 30) });
  }

  cuotasMismatch(): string {
    if (!this.cuotas.length) {
      return '';
    }
    const sum = round2(this.cuotas.reduce((a, q) => a + Number(q.monto ?? 0), 0));
    const expected = this.creditBase();
    return Math.abs(sum - expected) > 0.05
      ? `Las cuotas suman ${money(sum, this.moneda)} y el monto pendiente estimado es ${money(expected, this.moneda)}: revíselas ("Repartir" las recalcula).`
      : '';
  }

  addPayment(): void {
    this.pagos.push({ key: key('p'), metodo: 'efectivo', monto: null, referencia: '' });
  }

  // ---------------------------------------------------------------- Cuerpo y envío
  /** Cuerpo de `/api/v1` y errores locales (mismas claves de la API). Puro: se llama también para avisar si cambió. */
  build(): { body: Json; errors: Record<string, string> } {
    const e: Record<string, string> = {};
    const fields = this.itemFields();
    const b: Json = {
      serie: this.serie, fecha_emision: this.fechaEmision, tipo_moneda: this.moneda, cliente: partyToBody(this.cliente, true),
      items: this.items.map((i) => itemToBody(i, fields))
    };
    if (!this.serie) {
      e['serie'] = 'Elija la serie.';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.fechaEmision)) {
      e['fecha_emision'] = 'Indique la fecha de emisión.';
    } else if (this.fechaEmision > this.today) {
      e['fecha_emision'] = 'La fecha de emisión no puede ser posterior a hoy.';
    }
    Object.assign(e, partyErrors(this.cliente, 'cliente', this.clientTypes().map((o) => o.id)), itemErrors(this.items, fields));
    if (!this.isNote) {
      b['tipo_operacion'] = this.tipoOperacion;
      b['forma_pago'] = this.formaPago;
      if (this.isBoleta && this.cliente.tipo_doc === '0' && this.previewTotal() > 700) {
        e['cliente.tipo_doc'] = 'Para boletas mayores a S/ 700.00 es obligatorio el documento de identidad del cliente.';
      }
      if (this.formaPago === 'Credito') {
        if (!this.cuotas.length) {
          e['cuotas'] = 'Las cuotas son obligatorias cuando la forma de pago es Crédito.';
        }
        this.cuotas.forEach((q, i) => {
          if (!((q.monto ?? 0) > 0)) {
            e[`cuotas.${i}.monto`] = 'Mayor que 0.';
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(q.fecha_pago)) {
            e[`cuotas.${i}.fecha_pago`] = 'Indique la fecha.';
          }
        });
        b['cuotas'] = this.cuotas.map((q) => ({ monto: Number(q.monto ?? 0), fecha_pago: q.fecha_pago }));
        b['fecha_vencimiento'] = this.fechaVencimiento || this.cuotas[this.cuotas.length - 1]?.fecha_pago || null;
      } else if (this.fechaVencimiento) {
        b['fecha_vencimiento'] = this.fechaVencimiento;
      }
      if (this.detractionOn()) {
        if (!this.detBien) {
          e['detraccion.cod_bien'] = 'Elija el bien o servicio.';
        }
        if (!((this.detPct ?? 0) > 0)) {
          e['detraccion.porcentaje'] = 'Indique el porcentaje.';
        }
        if (!this.detCuenta.trim()) {
          e['detraccion.cta_banco'] = 'Indique la cuenta de detracciones.';
        }
        b['detraccion'] = {
          cod_bien: this.detBien, porcentaje: Number(this.detPct ?? 0), monto: this.detractionAmount(), cta_banco: this.detCuenta.trim(), cod_medio_pago: this.detMedio
        };
      }
      if (this.perceptionOn()) {
        b['percepcion'] = { cod_regimen: this.perRegimen, porcentaje: Number(this.perPct ?? 0), monto: this.perceptionAmount(), base: this.previewTotal() };
      }
      const guias = this.guias.filter((g) => g.nro_doc.trim());
      if (guias.length) {
        b['guias'] = guias.map((g) => ({ tipo_doc: g.tipo_doc, nro_doc: g.nro_doc.trim() }));
      }
      if (this.pagos.length) {
        this.pagos.forEach((p, i) => {
          if (!((p.monto ?? 0) > 0)) {
            e[`pagos.${i}.monto`] = 'Mayor que 0.';
          }
        });
        b['pagos'] = this.pagos.map((p) => {
          const x: Json = { metodo: p.metodo, monto: Number(p.monto ?? 0) };
          if (p.referencia.trim()) {
            x['referencia'] = p.referencia.trim();
          }
          return x;
        });
      }
      if (this.isFactura && this.ordenCompra.trim()) {
        b['extras'] = { orden_compra: this.ordenCompra.trim() };
      }
    } else {
      const optional = this.affectedOptional();
      const serie = this.docSerie.trim();
      const corr = this.docCorrelativo.trim();
      if (!optional || serie || corr) {
        b['doc_afectado_tipo'] = this.docTipo;
        b['doc_afectado_serie'] = serie;
        b['doc_afectado_correlativo'] = corr.replace(/^0+(?=\d)/, '');
        if (!/^[A-Z0-9]{4}$/.test(serie)) {
          e['doc_afectado_serie'] = 'La serie tiene 4 caracteres.';
        }
        if (!/^\d{1,9}$/.test(corr)) {
          e['doc_afectado_correlativo'] = 'Indique el correlativo (número).';
        }
      }
      b['cod_motivo'] = this.codMotivo;
      b['des_motivo'] = this.desMotivo.trim();
      if (!this.codMotivo) {
        e['cod_motivo'] = 'Elija el motivo.';
      }
      if (!this.desMotivo.trim()) {
        e['des_motivo'] = 'Indique la descripción del motivo.';
      }
      if (this.isCreditNote && this.codMotivo === '04') {
        if (!((this.descuentoGlobal ?? 0) > 0)) {
          e['descuentos_globales'] = 'Indique el descuento global.';
        }
        b['descuentos_globales'] = [{ cod_tipo: '02', monto: this.globalDiscountBase() }];
      }
    }
    if (this.observacion.trim()) {
      b['observacion'] = this.observacion.trim();
    }
    b['enviar_automatico'] = this.envio === 'auto';
    if (this.isBoleta && this.envio === 'resumen') {
      b['solo_registro'] = true;
    }
    withReason(b, this.motivo, e);
    return { body: b, errors: e };
  }

  submit(): void {
    const { body, errors } = this.build();
    if (!this.ctx().active || this.sub.blockWith(errors)) {
      return;
    }
    this.sub.submit(this.ctx().tenantId, this.type().id, body, (o) => this.issued.emit(o));
  }

  retry(): void {
    this.sub.retrySame((o) => this.issued.emit(o));
  }

}

