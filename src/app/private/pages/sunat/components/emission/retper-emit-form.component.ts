import { Component, OnInit, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { limaTodayYmd } from '@shared/functions/lima-dates';
import { Option } from '../../models/sunat.models';
import { Json, money } from '../../models/tenant-views.models';
import { EmissionService } from '../../services/emission.service';
import { EmissionActionsComponent, withReason } from './emission-actions.component';
import { EmissionSubmitter, IssueOutcome } from './emission-submit';
import { EmissionContext, EmitType, seriesOptions } from './emission-types';
import {
  PERCEPTION_REGIMES, PartyValue, RETENTION_REGIMES, RETPER_DOC_TYPES, SALE_CURRENCY_OPTIONS, emptyParty, partyErrors, partyToBody, round2
} from './emission.models';
import { PartyBlockComponent } from './party-block.component';

interface RetPerPayment {
  key: string;
  importe: number | null;
  fecha: string;
}

interface RetPerDoc {
  key: string;
  tipo_doc: string;
  num_doc: string;
  fecha_emision: string;
  imp_total: number | null;
  moneda: string;
  /** `fecha_retencion` / `fecha_percepcion`. */
  fecha_operacion: string;
  pagos: RetPerPayment[];
  /** Tipo de cambio (obligatorio si la moneda no es PEN). */
  factor: number | null;
  fecha_cambio: string;
}

let seq = 0;
const key = (p: string) => `${p}-${++seq}`;

/**
 * Comprobante de retención (20) o de percepción (40) (§11.7): `POST tenants/{id}/retenciones|percepciones` con el cuerpo de
 * `/api/v1`. La retención lleva `proveedor`, `documentos[].pagos` y `fecha_retencion`; la percepción, `cliente`, `cobros` y
 * `fecha_percepcion`. Régimen del catálogo 23 (3 % / 6 %) o 22 (2 % / 1 % / 0,5 %) con su tasa (editable). Cada documento
 * relacionado (factura, boleta o ticket) lleva sus pagos o cobros y, en otra moneda, el tipo de cambio. Los importes
 * retenidos / percibidos y netos los calcula la API (como la referencia, no se envían): aquí solo se muestran estimados.
 */
@Component({
  selector: 'app-retper-emit-form',
  imports: [FormsModule, PartyBlockComponent, EmissionActionsComponent],
  template: `
    <form class="erp-form" novalidate (ngSubmit)="submit()">
      <div class="row g-2 mb-3">
        <div class="col-6 col-md-3">
          <label class="form-label small" for="rp-serie">Serie <span class="erp-required">*</span></label>
          <select id="rp-serie" class="form-select form-select-sm" name="serie" [(ngModel)]="serie" [class.is-invalid]="!!err('serie')">
            <option [ngValue]="''">Elija…</option>
            @for (o of seriesList; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
          @if (err('serie')) {<div class="invalid-feedback">{{ err('serie') }}</div>}
          @if (!seriesList.length) {<div class="form-text text-danger">Sin series activas de {{ isPerception ? 'percepción (P…)' : 'retención (R…)' }}: créelas en Configuración.</div>}
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label small" for="rp-fecha">Fecha de emisión <span class="erp-required">*</span></label>
          <input id="rp-fecha" type="date" class="form-control form-control-sm" name="fecha_emision" [(ngModel)]="fechaEmision" [max]="today"
            [class.is-invalid]="!!err('fecha_emision')" />
          @if (err('fecha_emision')) {<div class="invalid-feedback">{{ err('fecha_emision') }}</div>}
        </div>
        <div class="col-md-4">
          <label class="form-label small" for="rp-reg">Régimen <span class="erp-required">*</span></label>
          <select id="rp-reg" class="form-select form-select-sm" name="regimen" [(ngModel)]="regimen" (ngModelChange)="onRegime()" [class.is-invalid]="!!err('regimen')">
            @for (o of regimes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
          @if (err('regimen')) {<div class="invalid-feedback">{{ err('regimen') }}</div>}
        </div>
        <div class="col-6 col-md-2">
          <label class="form-label small" for="rp-tasa">Tasa % <span class="erp-required">*</span></label>
          <input id="rp-tasa" type="number" min="0" max="100" step="any" class="form-control form-control-sm text-end" name="tasa" [(ngModel)]="tasa"
            [class.is-invalid]="!!err('tasa')" />
          @if (err('tasa')) {<div class="invalid-feedback">{{ err('tasa') }}</div>}
        </div>
      </div>

      <app-party-block [title]="isPerception ? 'Cliente (a quien se percibe)' : 'Proveedor (a quien se retiene)'" [(value)]="tercero" [prefix]="partyKey"
        [errors]="sub.errors()" [tenantId]="ctx().tenantId" [lookup]="true" [disabled]="sub.sending()"></app-party-block>

      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">Comprobantes relacionados <span class="erp-required">*</span></legend>
        @if (err('documentos')) {<div class="text-danger small mb-2">{{ err('documentos') }}</div>}
        @for (d of docs; track d.key; let i = $index) {
        <div class="border rounded p-2 mb-2">
          <div class="row g-2">
            <div class="col-6 col-md-2">
              <label class="form-label small" [for]="'rp-dt-' + d.key">Tipo</label>
              <select [id]="'rp-dt-' + d.key" class="form-select form-select-sm" [name]="'rp-dt-' + d.key" [(ngModel)]="d.tipo_doc">
                @for (o of docTypes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
              </select>
            </div>
            <div class="col-6 col-md-2">
              <label class="form-label small" [for]="'rp-dn-' + d.key">Número <span class="erp-required">*</span></label>
              <input [id]="'rp-dn-' + d.key" class="form-control form-control-sm text-uppercase" placeholder="F001-120" maxlength="20" [name]="'rp-dn-' + d.key"
                [ngModel]="d.num_doc" (ngModelChange)="d.num_doc = ($event || '').toUpperCase()" [class.is-invalid]="!!dErr(i, 'num_doc')" />
              @if (dErr(i, 'num_doc')) {<div class="invalid-feedback">{{ dErr(i, 'num_doc') }}</div>}
            </div>
            <div class="col-6 col-md-2">
              <label class="form-label small" [for]="'rp-df-' + d.key">Emitido <span class="erp-required">*</span></label>
              <input [id]="'rp-df-' + d.key" type="date" class="form-control form-control-sm" [name]="'rp-df-' + d.key" [(ngModel)]="d.fecha_emision"
                [class.is-invalid]="!!dErr(i, 'fecha_emision')" />
              @if (dErr(i, 'fecha_emision')) {<div class="invalid-feedback">{{ dErr(i, 'fecha_emision') }}</div>}
            </div>
            <div class="col-6 col-md-2">
              <label class="form-label small" [for]="'rp-di-' + d.key">Importe total <span class="erp-required">*</span></label>
              <input [id]="'rp-di-' + d.key" type="number" min="0" step="any" class="form-control form-control-sm text-end" [name]="'rp-di-' + d.key"
                [(ngModel)]="d.imp_total" (ngModelChange)="syncPayment(d)" [class.is-invalid]="!!dErr(i, 'imp_total')" />
              @if (dErr(i, 'imp_total')) {<div class="invalid-feedback">{{ dErr(i, 'imp_total') }}</div>}
            </div>
            <div class="col-6 col-md-2">
              <label class="form-label small" [for]="'rp-dm-' + d.key">Moneda</label>
              <select [id]="'rp-dm-' + d.key" class="form-select form-select-sm" [name]="'rp-dm-' + d.key" [(ngModel)]="d.moneda">
                @for (o of currencies; track o.id) {<option [ngValue]="o.id">{{ o.id }}</option>}
              </select>
            </div>
            <div class="col-6 col-md-2">
              <label class="form-label small" [for]="'rp-do-' + d.key">Fecha de {{ isPerception ? 'percepción' : 'retención' }} <span class="erp-required">*</span></label>
              <input [id]="'rp-do-' + d.key" type="date" class="form-control form-control-sm" [name]="'rp-do-' + d.key" [(ngModel)]="d.fecha_operacion"
                [class.is-invalid]="!!dErr(i, dateKey)" />
              @if (dErr(i, dateKey)) {<div class="invalid-feedback">{{ dErr(i, dateKey) }}</div>}
            </div>
            @if (d.moneda !== 'PEN') {
            <div class="col-6 col-md-3">
              <label class="form-label small" [for]="'rp-tc-' + d.key">Tipo de cambio a PEN <span class="erp-required">*</span></label>
              <input [id]="'rp-tc-' + d.key" type="number" min="0" step="any" class="form-control form-control-sm text-end" [name]="'rp-tc-' + d.key" [(ngModel)]="d.factor"
                [class.is-invalid]="!!dErr(i, 'tipo_cambio') || !!dErr(i, 'tipo_cambio.factor')" />
              @if (dErr(i, 'tipo_cambio') || dErr(i, 'tipo_cambio.factor')) {<div class="invalid-feedback">{{ dErr(i, 'tipo_cambio') || dErr(i, 'tipo_cambio.factor') }}</div>}
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label small" [for]="'rp-tf-' + d.key">Fecha del tipo de cambio</label>
              <input [id]="'rp-tf-' + d.key" type="date" class="form-control form-control-sm" [name]="'rp-tf-' + d.key" [(ngModel)]="d.fecha_cambio" />
            </div>
            }
          </div>
          <div class="mt-2">
            <span class="small fw-semibold">{{ isPerception ? 'Cobros' : 'Pagos' }}</span>
            @if (dErr(i, payKey)) {<span class="text-danger small ms-2">{{ dErr(i, payKey) }}</span>}
            @for (p of d.pagos; track p.key; let j = $index) {
            <div class="input-group input-group-sm mt-1" style="max-width: 32rem">
              <input type="number" min="0" step="any" class="form-control text-end" placeholder="Importe" [attr.aria-label]="'Importe ' + (j + 1) + ' del comprobante ' + (i + 1)"
                [name]="'rp-pi-' + p.key" [(ngModel)]="p.importe" [class.is-invalid]="!!dErr(i, payKey + '.' + j + '.importe')" />
              <input type="date" class="form-control" [attr.aria-label]="'Fecha ' + (j + 1) + ' del comprobante ' + (i + 1)" [name]="'rp-pf-' + p.key" [(ngModel)]="p.fecha"
                [class.is-invalid]="!!dErr(i, payKey + '.' + j + '.fecha')" />
              <button type="button" class="btn btn-outline-danger" [disabled]="d.pagos.length <= 1" (click)="d.pagos.splice(j, 1)"
                [attr.aria-label]="'Quitar el pago ' + (j + 1)"><em class="feather icon-trash-2"></em></button>
            </div>
            }
            <div class="d-flex flex-wrap gap-2 align-items-center mt-1">
              <button type="button" class="btn btn-sm btn-link px-0" (click)="d.pagos.push({ key: newKey('rpp'), importe: null, fecha: today })">
                <em class="feather icon-plus me-1"></em>Agregar {{ isPerception ? 'cobro' : 'pago' }}</button>
              <span class="small text-muted">Estimado: {{ isPerception ? 'percibido' : 'retenido' }} {{ money(docAmount(d)) }} (en soles)</span>
              <button type="button" class="btn btn-sm btn-link text-danger ms-auto" [disabled]="docs.length <= 1" (click)="docs.splice(i, 1)">Quitar comprobante</button>
            </div>
          </div>
        </div>
        }
        <button type="button" class="btn btn-sm btn-outline-primary" (click)="addDoc()"><em class="feather icon-plus me-1"></em>Agregar comprobante</button>
        <p class="small mt-2 mb-0">Vista previa: {{ isPerception ? 'percepción' : 'retención' }} total <strong>{{ money(totalAmount(), 'PEN') }}</strong>. La API calcula
          los importes oficiales ({{ isPerception ? 'imp_percibido / imp_cobrado' : 'imp_retenido / imp_pagado' }}).</p>
      </fieldset>

      <div class="row g-2">
        <div class="col-md-8">
          <label class="form-label small" for="rp-obs">Observación</label>
          <textarea id="rp-obs" class="form-control form-control-sm" rows="2" name="observacion" maxlength="500" [(ngModel)]="observacion"></textarea>
        </div>
        <div class="col-md-4">
          <label class="form-label small" for="rp-envio">Envío a SUNAT</label>
          <select id="rp-envio" class="form-select form-select-sm" name="envio" [(ngModel)]="auto">
            <option [ngValue]="true">Enviar a SUNAT al emitir</option>
            <option [ngValue]="false">Dejar pendiente (enviar después)</option>
          </select>
        </div>
      </div>
      <button type="submit" class="d-none" aria-hidden="true" tabindex="-1"></button>
    </form>
    <app-emission-actions [submitter]="sub" [(motivo)]="motivo" [label]="type().verb" [disabled]="!ctx().active" [changed]="sub.differsFromLast(build().body)"
      (send)="submit()" (retry)="retry()"></app-emission-actions>
  `
})
export class RetPerEmitFormComponent implements OnInit {
  private service = inject(EmissionService);

  readonly ctx = input.required<EmissionContext>();
  readonly type = input.required<EmitType>();
  readonly issued = output<IssueOutcome>();

  readonly docTypes = RETPER_DOC_TYPES;
  readonly currencies = SALE_CURRENCY_OPTIONS;
  readonly today = limaTodayYmd();
  isPerception = false;
  partyKey = 'proveedor';
  payKey = 'pagos';
  dateKey = 'fecha_retencion';
  regimes: (Option<string> & { rate: number })[] = RETENTION_REGIMES;
  seriesList: Option<string>[] = [];

  serie = '';
  fechaEmision = limaTodayYmd();
  regimen = '01';
  tasa: number | null = 3;
  tercero: PartyValue = emptyParty('6');
  docs: RetPerDoc[] = [];
  observacion = '';
  auto = true;
  motivo = '';

  readonly sub = new EmissionSubmitter(this.service, (k) => ['serie', 'fecha_emision', 'regimen', 'tasa', 'motivo', 'documentos'].includes(k)
    || k.startsWith(`${this.partyKey}.`) || k.startsWith('documentos.'));

  ngOnInit(): void {
    this.isPerception = this.type().id === 'percepciones';
    this.partyKey = this.isPerception ? 'cliente' : 'proveedor';
    this.payKey = this.isPerception ? 'cobros' : 'pagos';
    this.dateKey = this.isPerception ? 'fecha_percepcion' : 'fecha_retencion';
    this.regimes = this.isPerception ? PERCEPTION_REGIMES : RETENTION_REGIMES;
    this.regimen = '01';
    this.tasa = this.regimes[0].rate;
    this.seriesList = seriesOptions(this.ctx(), this.type().seriesType);
    this.serie = this.seriesList[0]?.id ?? '';
    this.addDoc();
  }

  newKey(p: string): string {
    return key(p);
  }

  money(v: number, currency?: string): string {
    return money(v, currency);
  }

  err(k: string): string {
    return this.sub.errors()[k] ?? '';
  }

  dErr(i: number, f: string): string {
    return this.err(`documentos.${i}.${f}`);
  }

  onRegime(): void {
    this.tasa = this.regimes.find((o) => o.id === this.regimen)?.rate ?? this.tasa;
  }

  addDoc(): void {
    this.docs.push({
      key: key('rpd'), tipo_doc: '01', num_doc: '', fecha_emision: this.today, imp_total: null, moneda: 'PEN', fecha_operacion: this.today,
      pagos: [{ key: key('rpp'), importe: null, fecha: this.today }], factor: null, fecha_cambio: this.today
    });
  }

  /** Con un solo pago, el importe sigue al total del comprobante (pago completo, como la referencia). */
  syncPayment(d: RetPerDoc): void {
    if (d.pagos.length === 1) {
      d.pagos[0].importe = d.imp_total;
    }
  }

  docAmount(d: RetPerDoc): number {
    const paid = d.pagos.reduce((a, p) => a + Number(p.importe ?? 0), 0);
    const factor = d.moneda === 'PEN' ? 1 : Number(d.factor ?? 0);
    return round2((paid * factor * Number(this.tasa ?? 0)) / 100);
  }

  totalAmount(): number {
    return round2(this.docs.reduce((a, d) => a + this.docAmount(d), 0));
  }

  build(): { body: Json; errors: Record<string, string> } {
    const e: Record<string, string> = {};
    if (!this.serie) {
      e['serie'] = 'Elija la serie.';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.fechaEmision)) {
      e['fecha_emision'] = 'Indique la fecha de emisión.';
    }
    if (this.tasa == null || this.tasa < 0 || this.tasa > 100) {
      e['tasa'] = 'De 0 a 100.';
    }
    Object.assign(e, partyErrors(this.tercero, this.partyKey));
    if (!this.docs.length) {
      e['documentos'] = 'Agregue al menos un comprobante.';
    }
    const documentos = this.docs.map((d, i) => {
      const k = (f: string) => `documentos.${i}.${f}`;
      if (!d.num_doc.trim()) {
        e[k('num_doc')] = 'Indique el número (serie-correlativo).';
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha_emision)) {
        e[k('fecha_emision')] = 'Indique la fecha.';
      }
      if (!((d.imp_total ?? 0) > 0)) {
        e[k('imp_total')] = 'Mayor que 0.';
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha_operacion)) {
        e[k(this.dateKey)] = 'Indique la fecha.';
      }
      d.pagos.forEach((p, j) => {
        if (!((p.importe ?? 0) > 0)) {
          e[k(`${this.payKey}.${j}.importe`)] = 'Mayor que 0.';
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) {
          e[k(`${this.payKey}.${j}.fecha`)] = 'Indique la fecha.';
        }
      });
      const x: Json = {
        tipo_doc: d.tipo_doc, num_doc: d.num_doc.trim(), fecha_emision: d.fecha_emision, imp_total: Number(d.imp_total ?? 0), moneda: d.moneda,
        [this.dateKey]: d.fecha_operacion,
        [this.payKey]: d.pagos.map((p) => ({ importe: Number(p.importe ?? 0), fecha: p.fecha, moneda: d.moneda }))
      };
      if (d.moneda !== 'PEN') {
        if (!((d.factor ?? 0) > 0)) {
          e[k('tipo_cambio')] = `El tipo de cambio es obligatorio cuando la moneda es ${d.moneda}.`;
        }
        x['tipo_cambio'] = { moneda_ref: d.moneda, moneda_obj: 'PEN', factor: Number(d.factor ?? 0), fecha: d.fecha_cambio || d.fecha_operacion };
      }
      return x;
    });
    const b: Json = {
      serie: this.serie, fecha_emision: this.fechaEmision, [this.partyKey]: partyToBody(this.tercero, true), regimen: this.regimen,
      tasa: Number(this.tasa ?? 0), documentos, enviar_automatico: this.auto
    };
    if (this.observacion.trim()) {
      b['observacion'] = this.observacion.trim();
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
