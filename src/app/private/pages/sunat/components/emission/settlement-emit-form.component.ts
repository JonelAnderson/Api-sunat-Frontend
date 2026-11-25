import { Component, OnInit, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { limaTodayYmd } from '@shared/functions/lima-dates';
import { Option } from '../../models/sunat.models';
import { UbigeoChoice } from '../../models/tenant-admin.models';
import { Json, obj, str } from '../../models/tenant-views.models';
import { EmissionService } from '../../services/emission.service';
import { UbigeoSelectComponent } from '../common/ubigeo-select.component';
import { EmissionActionsComponent, withReason } from './emission-actions.component';
import { EmissionSubmitter, IssueOutcome } from './emission-submit';
import { EmissionContext, EmitType, seriesOptions } from './emission-types';
import {
  ADDRESS_TYPE_OPTIONS, EmissionItem, GOLD_NATURE_CODES, SALE_GUIDE_TYPES, SELLER_DOC_OPTIONS, SETTLEMENT_IGV_OPTIONS, SETTLEMENT_ITEM_FIELDS,
  SETTLEMENT_OPERATION_OPTIONS, emptyItem, itemErrors, itemToBody
} from './emission.models';
import { ItemGridComponent } from './item-grid.component';

interface SettlementGuide {
  key: string;
  tipo: string;
  numero: string;
}

interface GoldData {
  codigo_concesion: string;
  ley_mineral: number | null;
  naturaleza_mineral: string;
  nombre_derecho_minero: string;
}

let seq = 0;
const key = (p: string) => `${p}-${++seq}`;

const GOLD_FIELDS: (keyof GoldData)[] = ['codigo_concesion', 'ley_mineral', 'naturaleza_mineral', 'nombre_derecho_minero'];

/**
 * Liquidación de compra (04) (§11.7): `POST tenants/{id}/liquidaciones-compra` con el cuerpo de `/api/v1`. Serie L…, tipo de
 * operación 0501 (compra interna) o 0503 (oro: cada ítem con los datos de la concesión), vendedor sin RUC (DNI o carné:
 * nombre, dirección, ubigeo y tipo de domicilio del catálogo 60), lugar de la operación, productos agropecuarios, ítems con
 * código SUNAT **obligatorio** y valor unitario **sin** IGV (10 / 20 / 30), guías relacionadas y placa. Solo soles. El IGV,
 * la retención del impuesto a la renta y el neto a pagar los calcula la API.
 */
@Component({
  selector: 'app-settlement-emit-form',
  imports: [FormsModule, ItemGridComponent, UbigeoSelectComponent, EmissionActionsComponent],
  template: `
    <form class="erp-form" novalidate (ngSubmit)="submit()">
      <div class="row g-2 mb-3">
        <div class="col-6 col-md-3">
          <label class="form-label small" for="lq-serie">Serie <span class="erp-required">*</span></label>
          <select id="lq-serie" class="form-select form-select-sm" name="serie" [(ngModel)]="serie" [class.is-invalid]="!!err('serie')">
            <option [ngValue]="''">Elija…</option>
            @for (o of seriesList; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
          @if (err('serie')) {<div class="invalid-feedback">{{ err('serie') }}</div>}
          @if (!seriesList.length) {<div class="form-text text-danger">Sin series activas de liquidación de compra (L…): créelas en Configuración.</div>}
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label small" for="lq-fecha">Fecha de emisión <span class="erp-required">*</span></label>
          <input id="lq-fecha" type="date" class="form-control form-control-sm" name="fecha_emision" [(ngModel)]="fechaEmision" [max]="today"
            [class.is-invalid]="!!err('fecha_emision')" />
          @if (err('fecha_emision')) {<div class="invalid-feedback">{{ err('fecha_emision') }}</div>}
          <div class="form-text">Se envía el mismo día o el siguiente (SUNAT).</div>
        </div>
        <div class="col-md-3">
          <label class="form-label small" for="lq-op">Tipo de operación</label>
          <select id="lq-op" class="form-select form-select-sm" name="tipo_operacion" [(ngModel)]="tipoOperacion" [class.is-invalid]="!!err('tipo_operacion')">
            @for (o of operations; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
          @if (err('tipo_operacion')) {<div class="invalid-feedback">{{ err('tipo_operacion') }}</div>}
        </div>
        <div class="col-md-3 d-flex align-items-end">
          <div class="form-check mb-1">
            <input id="lq-agro" type="checkbox" class="form-check-input" name="productos_agropecuarios" [(ngModel)]="agro" />
            <label class="form-check-label small" for="lq-agro">Productos agropecuarios (tasa de renta especial)</label>
          </div>
        </div>
      </div>

      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">Vendedor (sin RUC)</legend>
        <div class="row g-2">
          <div class="col-md-3">
            <label class="form-label small" for="lq-v-tipo">Documento <span class="erp-required">*</span></label>
            <select id="lq-v-tipo" class="form-select form-select-sm" name="v_tipo" [(ngModel)]="vTipo" [class.is-invalid]="!!err('vendedor.tipo_doc')">
              @for (o of sellerDocs; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
            @if (err('vendedor.tipo_doc')) {<div class="invalid-feedback">{{ err('vendedor.tipo_doc') }}</div>}
          </div>
          <div class="col-md-3">
            <label class="form-label small" for="lq-v-num">Número <span class="erp-required">*</span></label>
            <input id="lq-v-num" class="form-control form-control-sm" name="v_num" maxlength="15" [(ngModel)]="vNum" [class.is-invalid]="!!err('vendedor.num_doc')" />
            @if (err('vendedor.num_doc')) {<div class="invalid-feedback">{{ err('vendedor.num_doc') }}</div>}
          </div>
          <div class="col-md-6">
            <label class="form-label small" for="lq-v-nom">Nombre completo <span class="erp-required">*</span></label>
            <input id="lq-v-nom" class="form-control form-control-sm" name="v_nom" maxlength="1500" [(ngModel)]="vNombre" [class.is-invalid]="!!err('vendedor.nombre')" />
            @if (err('vendedor.nombre')) {<div class="invalid-feedback">{{ err('vendedor.nombre') }}</div>}
          </div>
          <div class="col-md-8">
            <label class="form-label small" for="lq-v-dir">Dirección <span class="erp-required">*</span></label>
            <input id="lq-v-dir" class="form-control form-control-sm" name="v_dir" maxlength="250" [(ngModel)]="vDireccion" [class.is-invalid]="!!err('vendedor.direccion')" />
            @if (err('vendedor.direccion')) {<div class="invalid-feedback">{{ err('vendedor.direccion') }}</div>}
          </div>
          <div class="col-md-4">
            <label class="form-label small" for="lq-v-tdom">Tipo de domicilio <span class="erp-required">*</span></label>
            <select id="lq-v-tdom" class="form-select form-select-sm" name="v_tdom" [(ngModel)]="vTipoDom" [class.is-invalid]="!!err('vendedor.tipo_domicilio')">
              @for (o of addressTypes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
          </div>
          <div class="col-12">
            <app-ubigeo-select idPrefix="lq-v" [value]="vUbigeo" [error]="err('vendedor.ubigeo')" (changed)="vUbigeo = pickUbigeo($event)"></app-ubigeo-select>
          </div>
        </div>
      </fieldset>

      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">Lugar de la operación</legend>
        <div class="form-check mb-2">
          <input id="lq-same" type="checkbox" class="form-check-input" name="same" [(ngModel)]="sameAsSeller" />
          <label class="form-check-label small" for="lq-same">Es el domicilio del vendedor</label>
        </div>
        @if (!sameAsSeller) {
        <div class="row g-2">
          <div class="col-md-8">
            <label class="form-label small" for="lq-l-dir">Dirección <span class="erp-required">*</span></label>
            <input id="lq-l-dir" class="form-control form-control-sm" name="l_dir" maxlength="250" [(ngModel)]="lDireccion" [class.is-invalid]="!!err('lugar.direccion')" />
            @if (err('lugar.direccion')) {<div class="invalid-feedback">{{ err('lugar.direccion') }}</div>}
          </div>
          <div class="col-md-4">
            <label class="form-label small" for="lq-l-tipo">Tipo <span class="erp-required">*</span></label>
            <select id="lq-l-tipo" class="form-select form-select-sm" name="l_tipo" [(ngModel)]="lTipo">
              @for (o of addressTypes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
          </div>
          <div class="col-12">
            <app-ubigeo-select idPrefix="lq-l" [value]="lUbigeo" [error]="err('lugar.ubigeo')" (changed)="lUbigeo = pickUbigeo($event)"></app-ubigeo-select>
          </div>
        </div>
        }
      </fieldset>

      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">Productos comprados</legend>
        <app-item-grid [(items)]="items" [fields]="itemFields" currency="PEN" [errors]="sub.errors()" [disabled]="sub.sending()" [rate]="ctx().igvRatePct"
          [igvTypes]="igvTypes" defaultUnit="KGM" [sunatCodeRequired]="true"></app-item-grid>
        @if (tipoOperacion === '0503') {
        <div class="mt-3">
          <h6 class="small fw-semibold">Compra de oro: datos de cada ítem (catálogo 55)</h6>
          @for (it of items; track it.key; let i = $index) {
          <div class="row g-2 mb-2 align-items-end">
            <div class="col-12 col-md-2 small text-muted">Ítem {{ i + 1 }}</div>
            <div class="col-6 col-md-3">
              <input class="form-control form-control-sm" placeholder="Código de concesión" maxlength="50" [attr.aria-label]="'Concesión del ítem ' + (i + 1)"
                [name]="'oro-c-' + it.key" [ngModel]="gold(it).codigo_concesion" (ngModelChange)="setGold(it, 'codigo_concesion', $event)"
                [class.is-invalid]="!!err('items.' + i + '.oro.codigo_concesion')" />
            </div>
            <div class="col-6 col-md-2">
              <input type="number" min="0" max="100" step="any" class="form-control form-control-sm text-end" placeholder="Ley %" [attr.aria-label]="'Ley mineral del ítem ' + (i + 1)"
                [name]="'oro-l-' + it.key" [ngModel]="gold(it).ley_mineral" (ngModelChange)="setGold(it, 'ley_mineral', $event)"
                [class.is-invalid]="!!err('items.' + i + '.oro.ley_mineral')" />
            </div>
            <div class="col-6 col-md-2">
              <select class="form-select form-select-sm" [attr.aria-label]="'Naturaleza del mineral del ítem ' + (i + 1)" [name]="'oro-n-' + it.key"
                [ngModel]="gold(it).naturaleza_mineral" (ngModelChange)="setGold(it, 'naturaleza_mineral', $event)"
                [class.is-invalid]="!!err('items.' + i + '.oro.naturaleza_mineral')">
                <option [ngValue]="''">Naturaleza…</option>
                @for (n of goldNatures; track n) {<option [ngValue]="n">{{ n }}</option>}
              </select>
            </div>
            <div class="col-6 col-md-3">
              <input class="form-control form-control-sm" placeholder="Derecho minero" maxlength="100" [attr.aria-label]="'Derecho minero del ítem ' + (i + 1)"
                [name]="'oro-d-' + it.key" [ngModel]="gold(it).nombre_derecho_minero" (ngModelChange)="setGold(it, 'nombre_derecho_minero', $event)"
                [class.is-invalid]="!!err('items.' + i + '.oro.nombre_derecho_minero')" />
            </div>
          </div>
          }
        </div>
        }
      </fieldset>

      <div class="row g-3 mb-3">
        <div class="col-lg-7">
          <fieldset class="border rounded p-3 h-100">
            <legend class="float-none w-auto px-2 fs-6 mb-0">Guías relacionadas (máx. 10)</legend>
            @for (g of guias; track g.key; let i = $index) {
            <div class="input-group input-group-sm mb-2 has-validation">
              <select class="form-select" style="max-width: 14rem" [attr.aria-label]="'Tipo de la guía ' + (i + 1)" [name]="'lg-t-' + g.key" [(ngModel)]="g.tipo">
                @for (o of guideTypes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
              </select>
              <input class="form-control" placeholder="T001-123" maxlength="30" [attr.aria-label]="'Número de la guía ' + (i + 1)" [name]="'lg-n-' + g.key"
                [(ngModel)]="g.numero" [class.is-invalid]="!!err('guias.' + i + '.numero')" />
              <button type="button" class="btn btn-outline-danger" (click)="guias.splice(i, 1)" [attr.aria-label]="'Quitar la guía ' + (i + 1)"><em class="feather icon-trash-2"></em></button>
              @if (err('guias.' + i + '.numero')) {<div class="invalid-feedback">{{ err('guias.' + i + '.numero') }}</div>}
            </div>
            }
            <button type="button" class="btn btn-sm btn-outline-primary" [disabled]="guias.length >= 10" (click)="guias.push({ key: newKey('lg'), tipo: '09', numero: '' })">
              <em class="feather icon-plus me-1"></em>Agregar guía</button>
          </fieldset>
        </div>
        <div class="col-lg-5">
          <label class="form-label small" for="lq-placa">Placa del vehículo (si la liquidación sustenta el traslado)</label>
          <input id="lq-placa" class="form-control form-control-sm text-uppercase" name="placa" maxlength="8" [ngModel]="placa"
            (ngModelChange)="placa = ($event || '').toUpperCase().replace(' ', '')" [class.is-invalid]="!!err('placa_vehiculo')" />
          @if (err('placa_vehiculo')) {<div class="invalid-feedback">{{ err('placa_vehiculo') }}</div>}
          <label class="form-label small mt-2" for="lq-envio">Envío a SUNAT</label>
          <select id="lq-envio" class="form-select form-select-sm" name="envio" [(ngModel)]="auto">
            <option [ngValue]="true">Enviar a SUNAT al emitir</option>
            <option [ngValue]="false">Dejar pendiente (enviar después)</option>
          </select>
        </div>
      </div>

      <label class="form-label small" for="lq-obs">Observación</label>
      <textarea id="lq-obs" class="form-control form-control-sm" rows="2" name="observacion" maxlength="500" [(ngModel)]="observacion"></textarea>
      <button type="submit" class="d-none" aria-hidden="true" tabindex="-1"></button>
    </form>
    <app-emission-actions [submitter]="sub" [(motivo)]="motivo" [label]="type().verb" [disabled]="!ctx().active" [changed]="sub.differsFromLast(build().body)"
      (send)="submit()" (retry)="retry()"></app-emission-actions>
  `
})
export class SettlementEmitFormComponent implements OnInit {
  private service = inject(EmissionService);

  readonly ctx = input.required<EmissionContext>();
  readonly type = input.required<EmitType>();
  readonly issued = output<IssueOutcome>();

  readonly sub = new EmissionSubmitter(this.service, (k) => ['serie', 'fecha_emision', 'tipo_operacion', 'placa_vehiculo', 'motivo'].includes(k)
    || ['vendedor', 'lugar', 'items', 'guias'].some((p) => k === p || k.startsWith(`${p}.`)));
  readonly operations = SETTLEMENT_OPERATION_OPTIONS;
  readonly sellerDocs = SELLER_DOC_OPTIONS;
  readonly addressTypes = ADDRESS_TYPE_OPTIONS;
  readonly igvTypes = SETTLEMENT_IGV_OPTIONS;
  readonly itemFields = SETTLEMENT_ITEM_FIELDS;
  readonly guideTypes = SALE_GUIDE_TYPES;
  readonly goldNatures = GOLD_NATURE_CODES;
  readonly today = limaTodayYmd();
  seriesList: Option<string>[] = [];

  serie = '';
  fechaEmision = limaTodayYmd();
  tipoOperacion = '0501';
  agro = false;
  vTipo = '1';
  vNum = '';
  vNombre = '';
  vDireccion = '';
  vUbigeo = '';
  vTipoDom = '02';
  sameAsSeller = true;
  lDireccion = '';
  lUbigeo = '';
  lTipo = '02';
  items: EmissionItem[] = [emptyItem('KGM')];
  guias: SettlementGuide[] = [];
  placa = '';
  observacion = '';
  auto = true;
  motivo = '';

  ngOnInit(): void {
    this.seriesList = seriesOptions(this.ctx(), this.type().seriesType);
    this.serie = this.seriesList[0]?.id ?? '';
  }

  newKey(p: string): string {
    return key(p);
  }

  err(k: string): string {
    return this.sub.errors()[k] ?? '';
  }

  pickUbigeo(choice: UbigeoChoice | null): string {
    return choice?.ubigeo ?? '';
  }

  gold(it: EmissionItem): GoldData {
    const o = obj(it.extra?.['oro']);
    return {
      codigo_concesion: str(o['codigo_concesion']), ley_mineral: o['ley_mineral'] == null || o['ley_mineral'] === '' ? null : Number(o['ley_mineral']),
      naturaleza_mineral: str(o['naturaleza_mineral']), nombre_derecho_minero: str(o['nombre_derecho_minero'])
    };
  }

  setGold(it: EmissionItem, field: keyof GoldData, value: unknown): void {
    const g = { ...this.gold(it), [field]: value };
    this.items = this.items.map((x) => (x.key === it.key ? { ...x, extra: { ...(x.extra ?? {}), oro: g } } : x));
  }

  build(): { body: Json; errors: Record<string, string> } {
    const e: Record<string, string> = {};
    if (!this.serie) {
      e['serie'] = 'Elija la serie.';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.fechaEmision)) {
      e['fecha_emision'] = 'Indique la fecha de emisión.';
    }
    const num = this.vNum.trim();
    if (!num) {
      e['vendedor.num_doc'] = 'Indique el documento del vendedor.';
    } else if (this.vTipo === '1' && !/^\d{8}$/.test(num)) {
      e['vendedor.num_doc'] = 'El DNI del vendedor debe tener 8 dígitos.';
    } else if (this.vTipo === '4' && !/^[A-Za-z0-9]{1,15}$/.test(num)) {
      e['vendedor.num_doc'] = 'Carné de extranjería alfanumérico, de hasta 15 caracteres y sin espacios.';
    }
    if (this.vNombre.trim().length < 3) {
      e['vendedor.nombre'] = 'Indique el nombre (3 o más caracteres).';
    }
    if (this.vDireccion.trim().length < 3) {
      e['vendedor.direccion'] = 'Indique la dirección (3 o más caracteres).';
    }
    if (!/^\d{6}$/.test(this.vUbigeo)) {
      e['vendedor.ubigeo'] = 'Elija el distrito (ubigeo de 6 dígitos).';
    }
    const lugar = this.sameAsSeller
      ? { direccion: this.vDireccion.trim(), ubigeo: this.vUbigeo, tipo: this.vTipoDom }
      : { direccion: this.lDireccion.trim(), ubigeo: this.lUbigeo, tipo: this.lTipo };
    if (!this.sameAsSeller) {
      if (lugar.direccion.length < 3) {
        e['lugar.direccion'] = 'Indique la dirección del lugar.';
      }
      if (!/^\d{6}$/.test(lugar.ubigeo)) {
        e['lugar.ubigeo'] = 'Elija el distrito del lugar.';
      }
    }
    Object.assign(e, itemErrors(this.items, this.itemFields, 'items', { sunatCodeRequired: true }));
    const gold = this.tipoOperacion === '0503';
    const items = this.items.map((it, i) => {
      const x = itemToBody(it, this.itemFields);
      if (gold) {
        const g = this.gold(it);
        GOLD_FIELDS.forEach((f) => {
          if (g[f] == null || String(g[f]).trim() === '') {
            e[`items.${i}.oro.${f}`] = 'Obligatorio en la compra de oro.';
          }
        });
        x['oro'] = { ...g, ley_mineral: g.ley_mineral == null ? null : Number(g.ley_mineral) };
      } else {
        delete x['oro'];
      }
      return x;
    });
    if (this.placa && !/^[A-Z0-9]{6,8}$/.test(this.placa)) {
      e['placa_vehiculo'] = 'Placa de 6 a 8 letras o números, sin guion.';
    }
    const b: Json = {
      serie: this.serie, fecha_emision: this.fechaEmision, tipo_operacion: this.tipoOperacion, tipo_moneda: 'PEN', productos_agropecuarios: this.agro,
      vendedor: { tipo_doc: this.vTipo, num_doc: num, nombre: this.vNombre.trim(), direccion: this.vDireccion.trim(), ubigeo: this.vUbigeo, tipo_domicilio: this.vTipoDom },
      lugar, items, enviar_automatico: this.auto
    };
    const guias = this.guias.filter((g) => g.numero.trim());
    if (guias.length) {
      b['guias'] = guias.map((g) => ({ tipo: g.tipo, numero: g.numero.trim() }));
    }
    if (this.placa) {
      b['placa_vehiculo'] = this.placa;
    }
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
    this.sub.submit(this.ctx().tenantId, 'liquidaciones-compra', body, (o) => this.issued.emit(o));
  }

  retry(): void {
    this.sub.retrySame((o) => this.issued.emit(o));
  }
}
