import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { serverMessages } from '@shared/functions/list-helpers';
import { ActionTarget, REASON_MAX, actionHttpError } from '../../models/document-actions.models';
import { UbigeoChoice, fieldErrors, rucError } from '../../models/tenant-admin.models';
import { Json, arr, dayText, num, obj, str, sunatBadge, sunatStatusName } from '../../models/tenant-views.models';
import { TenantAdminService } from '../../services/tenant-admin.service';
import { TenantViewsService } from '../../services/tenant-views.service';
import { UbigeoSelectComponent } from '../common/ubigeo-select.component';
import { Option } from '../../models/sunat.models';
import {
  EmissionItem, FREIGHT_PAYER_OPTIONS, GUIDE_EMIT_ITEM_FIELDS, GUIDE_ITEM_FIELDS, GUIDE_RELATED_DOC_OPTIONS, ItemField, PARTY_DOC_OPTIONS, PartyValue,
  RELATED_DOC_OPTIONS, TRANSFER_MODE_OPTIONS, TRANSFER_REASON_OPTIONS, WEIGHT_UNIT_OPTIONS, editItemToBody, editItemsFromData, emptyParty,
  guideItemsFromResource, itemErrors, itemToBody, jsonSummary, otherErrors, partyErrors, partyFromResource, partyToBody
} from '../emission/emission.models';
import { ItemGridComponent } from '../emission/item-grid.component';
import { PartyBlockComponent } from '../emission/party-block.component';
import { DocActionResult } from './doc-action-modal.component';

interface Driver {
  key: string;
  tipo: string;
  tipo_doc: string;
  num_doc: string;
  nombres: string;
  apellidos: string;
  licencia: string;
  extra: Json;
}

interface RelatedDoc {
  key: string;
  tipo_codigo: string;
  numero: string;
  ruc_emisor: string;
  /** Claves guardadas del documento que el formulario no muestra (`datos_edicion`). */
  extra?: Json;
}

const M1L = 'SUNAT_Envio_IndicadorTrasladoVehiculoM1L';
let seq = 0;
const key = (p: string) => `${p}-${++seq}`;

/** Claves de error con un campo en el formulario (el resto se lista al final). */
const KNOWN_PREFIXES = ['destinatario', 'remitente', 'transportista', 'vehiculo', 'conductor', 'conductores', 'doc_relacionado', 'items', 'tercero', 'comprador',
  'datos_subcontratador', 'datos_pagador_flete', 'autorizacion_especial', 'indicadores'];
/** Claves del vehículo que el formulario edita (las demás, p. ej. `cod_emisor` / `nro_autorizacion`, vuelven igual). */
const VEHICLE_KEYS = ['placa', 'nro_circulacion', 'tuc', 'secundarios'];
/** Lo que `datos_edicion` nunca lleva y el panel no reenvía (§12.1). */
const NEVER_SENT = ['correlativo', 'motivo', 'enviar_automatico'];
const KNOWN_FIELDS = ['fecha_emision', 'cod_traslado', 'mod_traslado', 'fecha_traslado', 'fecha_entrega_transportista', 'peso_total', 'und_peso_total',
  'num_bultos', 'partida_ubigeo', 'partida_direccion', 'partida_ruc', 'partida_cod_local', 'llegada_ubigeo', 'llegada_direccion', 'llegada_ruc',
  'llegada_cod_local', 'observacion', 'motivo'];

/**
 * Corregir y reenviar una guía de remisión pendiente o rechazada (§11.8.4 y §12.1, `Admin.Documents.Issue`).
 *
 * **Con `datos_edicion`** (§12.1, la API actual): el detalle trae el cuerpo completo del `PUT` (09 o 31) armado con lo
 * guardado. El formulario se precarga con él (remitente, destinatario, tercero y comprador, traslado, indicadores, partida /
 * llegada con RUC y código de local, transportista, vehículo con tarjeta, TUC y secundarios, conductor o conductores con la
 * misma forma, documentos relacionados, subcontratista, pagador del flete, autorización especial e ítems con su código
 * SUNAT) y envía **ese mismo objeto** con lo corregido encima, más `motivo`: las claves que no muestra vuelven igual y las
 * que se vacían van en `null`. Nunca `correlativo`. La GRT (31) no lleva `cod_traslado` ni `mod_traslado`.
 *
 * **Sin `datos_edicion`** (API anterior), como en la entrega 2:
 * `PUT tenants/{id}/guias-remision/{docId}` con el **cuerpo completo** de `PUT /api/v1/guias-remision/{id}` (la API valida y
 * reconstruye toda la guía) más `motivo` obligatorio. Se llena con el detalle guardado (`GET guias-remision/{docId}`), que no
 * trae todo lo que pudo tener la guía: remitente y documentos relacionados (guía transportista), RUC y código de los
 * establecimientos, indicadores, subcontratista, pagador del flete y autorización especial. Los que el formulario ofrece
 * se escriben a mano; lo que no se envía se quita de la guía.
 */
@Component({
  selector: 'app-guide-fix-form',
  imports: [FormsModule, NgClass, ItemGridComponent, PartyBlockComponent, UbigeoSelectComponent],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-truck"></em>Corregir y reenviar: guía {{ target.number }}</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" [disabled]="saving()" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      @if (loading()) {
      <div class="erp-loading" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Cargando la guía…</div>
      } @else if (loadError()) {
      <div class="alert alert-warning mb-0">{{ loadError() }}</div>
      } @else {
      <div class="border rounded p-3 mb-3">
        <div class="d-flex flex-wrap justify-content-between gap-2">
          <div>
            <div class="small text-muted">{{ isGrt ? 'Guía de remisión transportista (31)' : 'Guía de remisión remitente (09)' }} · emitida {{ issued }}</div>
            <div class="fw-semibold">{{ target.number }}</div>
            @if (target.tenantName) {<div class="small text-muted">{{ target.tenantName }}</div>}
          </div>
          <span class="badge align-self-start" [ngClass]="badge(status)">{{ statusName(status) }}</span>
        </div>
        @if (sunatText) {<div class="small mt-2"><strong>Respuesta de SUNAT:</strong> {{ sunatText }}</div>}
      </div>
      @if (edit) {
      <div class="erp-callout mb-3"><em class="feather icon-info"></em>
        <span>Se precarga con todo lo guardado de la guía y se reenvía completa a SUNAT con la misma serie y número. Corrija lo necesario: lo que deje vacío se
          quita y lo que el formulario no muestra{{ keptText ? ' (' + keptText + ')' : '' }} se devuelve igual. La fecha de emisión la pone la API (hora actual
          de Lima en el día elegido).</span>
      </div>
      } @else {
      <div class="alert alert-warning small">
        <strong>La guía se reemplaza completa</strong> con lo que envíe este formulario y se reenvía a SUNAT con la misma serie y número. La API no devuelve
        {{ isGrt ? 'el remitente, los documentos relacionados, ' : '' }}el RUC y el código de los establecimientos, los indicadores, el subcontratista, el pagador
        del flete ni la autorización especial: complete los que tenía la guía; los que deje vacíos se quitan.
      </div>
      }

      <form class="erp-form" novalidate (ngSubmit)="save()">
        <div class="row g-2 mb-3">
          <div class="col-6 col-md-3">
            <label class="form-label small" for="gf-serie">Serie</label>
            <input id="gf-serie" class="form-control form-control-sm" [value]="serie" readonly />
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small" for="gf-fecha">Fecha de emisión <span class="erp-required">*</span></label>
            <input id="gf-fecha" type="date" class="form-control form-control-sm" name="fecha_emision" [(ngModel)]="fechaEmision" [class.is-invalid]="!!err('fecha_emision')" />
            @if (err('fecha_emision')) {<div class="invalid-feedback">{{ err('fecha_emision') }}</div>}
          </div>
        </div>

        @if (isGrt) {
        <app-party-block title="Remitente (quien envía la carga)" [(value)]="remitente" prefix="remitente" [errors]="errors()" [docTypes]="senderTypes"
          [showAddress]="false" [tenantId]="target.tenantId" [lookup]="true"></app-party-block>
        }
        <app-party-block title="Destinatario" [(value)]="destinatario" prefix="destinatario" [errors]="errors()" [showAddress]="false"
          [tenantId]="target.tenantId" [lookup]="true"></app-party-block>

        <fieldset class="border rounded p-3 mb-3">
          <legend class="float-none w-auto px-2 fs-6 mb-0">Traslado</legend>
          <div class="row g-2">
            @if (!(edit && isGrt)) {
            <div class="col-md-6">
              <label class="form-label small" for="gf-cod">Motivo de traslado @if (!isGrt) {<span class="erp-required">*</span>}</label>
              <select id="gf-cod" class="form-select form-select-sm" name="cod_traslado" [(ngModel)]="codTraslado" [class.is-invalid]="!!err('cod_traslado')">
                <option [ngValue]="''">{{ isGrt ? 'No aplica' : 'Elija…' }}</option>
                @for (o of reasons; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
              </select>
              @if (err('cod_traslado')) {<div class="invalid-feedback">{{ err('cod_traslado') }}</div>}
            </div>
            <div class="col-md-6">
              <label class="form-label small" for="gf-mod">Modalidad @if (!isGrt) {<span class="erp-required">*</span>}</label>
              <select id="gf-mod" class="form-select form-select-sm" name="mod_traslado" [(ngModel)]="modTraslado" [class.is-invalid]="!!err('mod_traslado')">
                <option [ngValue]="''">{{ isGrt ? 'No aplica' : 'Elija…' }}</option>
                @for (o of modes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
              </select>
              @if (err('mod_traslado')) {<div class="invalid-feedback">{{ err('mod_traslado') }}</div>}
            </div>
            }
            <div class="col-6 col-md-3">
              <label class="form-label small" for="gf-ftras">Fecha de traslado <span class="erp-required">*</span></label>
              <input id="gf-ftras" type="date" class="form-control form-control-sm" name="fecha_traslado" [(ngModel)]="fechaTraslado"
                [class.is-invalid]="!!err('fecha_traslado')" />
              @if (err('fecha_traslado')) {<div class="invalid-feedback">{{ err('fecha_traslado') }}</div>}
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label small" for="gf-fent">Entrega al transportista</label>
              <input id="gf-fent" type="date" class="form-control form-control-sm" name="fecha_entrega_transportista" [(ngModel)]="fechaEntrega"
                [class.is-invalid]="!!err('fecha_entrega_transportista')" />
              @if (err('fecha_entrega_transportista')) {<div class="invalid-feedback">{{ err('fecha_entrega_transportista') }}</div>}
            </div>
            <div class="col-6 col-md-2">
              <label class="form-label small" for="gf-peso">Peso total <span class="erp-required">*</span></label>
              <input id="gf-peso" type="number" min="0" step="any" class="form-control form-control-sm text-end" name="peso_total" [(ngModel)]="pesoTotal"
                [class.is-invalid]="!!err('peso_total')" />
              @if (err('peso_total')) {<div class="invalid-feedback">{{ err('peso_total') }}</div>}
            </div>
            <div class="col-6 col-md-2">
              <label class="form-label small" for="gf-und">Unidad</label>
              <select id="gf-und" class="form-select form-select-sm" name="und_peso_total" [(ngModel)]="undPeso">
                @for (o of weightUnits; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
              </select>
            </div>
            <div class="col-6 col-md-2">
              <label class="form-label small" for="gf-bultos">Bultos</label>
              <input id="gf-bultos" type="number" min="1" step="1" class="form-control form-control-sm text-end" name="num_bultos" [(ngModel)]="numBultos"
                [class.is-invalid]="!!err('num_bultos')" />
              @if (err('num_bultos')) {<div class="invalid-feedback">{{ err('num_bultos') }}</div>}
            </div>
            <div class="col-12">
              <div class="form-check">
                <input id="gf-m1l" type="checkbox" class="form-check-input" name="m1l" [(ngModel)]="m1l" />
                <label class="form-check-label small" for="gf-m1l">Traslado en vehículo de categoría M1 o L (indicador de SUNAT)</label>
              </div>
            </div>
          </div>
        </fieldset>
        @if (otherIndicators.length) {<p class="form-text mt-n2 mb-3">Otros indicadores guardados que se conservan: {{ otherIndicators.join(', ') }}.</p>}

        @if (edit && !isGrt && (codTraslado === '03' || filled(tercero) || hasKey('tercero'))) {
        <app-party-block title="Tercero" [(value)]="tercero" prefix="tercero" [errors]="errors()" [showAddress]="false" [tenantId]="target.tenantId" [lookup]="true"
          hint="Venta con entrega a terceros (motivo 03). Déjelo vacío para quitarlo."></app-party-block>
        }
        @if (edit && !isGrt && (codTraslado === '03' || filled(comprador) || hasKey('comprador'))) {
        <app-party-block title="Comprador" [(value)]="comprador" prefix="comprador" [errors]="errors()" [showAddress]="false" [tenantId]="target.tenantId" [lookup]="true"
          hint="Déjelo vacío para quitarlo."></app-party-block>
        }

        @for (side of sides; track side.id) {
        <fieldset class="border rounded p-3 mb-3">
          <legend class="float-none w-auto px-2 fs-6 mb-0">{{ side.name }}</legend>
          <app-ubigeo-select [idPrefix]="'gf-' + side.id" [value]="addr[side.id].ubigeo" [error]="err(side.id + '_ubigeo')"
            (changed)="setUbigeo(side.id, $event)"></app-ubigeo-select>
          <div class="row g-2 mt-1">
            <div class="col-12">
              <label class="form-label small" [for]="'gf-' + side.id + '-dir'">Dirección <span class="erp-required">*</span></label>
              <input [id]="'gf-' + side.id + '-dir'" class="form-control form-control-sm" maxlength="500" [name]="side.id + '_direccion'"
                [(ngModel)]="addr[side.id].direccion" [class.is-invalid]="!!err(side.id + '_direccion')" />
              @if (err(side.id + '_direccion')) {<div class="invalid-feedback">{{ err(side.id + '_direccion') }}</div>}
            </div>
            <div class="col-6 col-md-4">
              <label class="form-label small" [for]="'gf-' + side.id + '-ruc'">RUC del establecimiento</label>
              <input [id]="'gf-' + side.id + '-ruc'" class="form-control form-control-sm" maxlength="11" inputmode="numeric" [name]="side.id + '_ruc'"
                [(ngModel)]="addr[side.id].ruc" [class.is-invalid]="!!err(side.id + '_ruc')" />
              @if (err(side.id + '_ruc')) {<div class="invalid-feedback">{{ err(side.id + '_ruc') }}</div>}
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label small" [for]="'gf-' + side.id + '-cod'">Código de local</label>
              <input [id]="'gf-' + side.id + '-cod'" class="form-control form-control-sm" maxlength="5" [name]="side.id + '_cod_local'"
                [(ngModel)]="addr[side.id].codLocal" [class.is-invalid]="!!err(side.id + '_cod_local')" />
              @if (err(side.id + '_cod_local')) {<div class="invalid-feedback">{{ err(side.id + '_cod_local') }}</div>}
            </div>
            <div class="col-12 col-md-5 d-flex align-items-end"><span class="form-text">RUC y código: para traslados entre establecimientos (motivo 04).</span></div>
          </div>
        </fieldset>
        }

        @if (!isGrt) {
        <app-party-block title="Transportista (transporte público)" [(value)]="transportista" prefix="transportista" [errors]="errors()" [showAddress]="false"
          nameLabel="Razón social" hint="Déjelo vacío si el transporte es privado."></app-party-block>
        <div class="row g-2 mb-3" style="margin-top: -0.5rem">
          <div class="col-md-4">
            <label class="form-label small" for="gf-mtc">Registro MTC del transportista</label>
            <input id="gf-mtc" class="form-control form-control-sm" maxlength="20" name="nro_mtc" [(ngModel)]="nroMtc" [class.is-invalid]="!!err('transportista.nro_mtc')" />
            @if (err('transportista.nro_mtc')) {<div class="invalid-feedback">{{ err('transportista.nro_mtc') }}</div>}
          </div>
        </div>
        }

        <fieldset class="border rounded p-3 mb-3">
          <legend class="float-none w-auto px-2 fs-6 mb-0">Vehículo y conductores</legend>
          @if (err('vehiculo') || err('conductor') || err('conductores')) {
          <div class="text-danger small mb-2">{{ err('vehiculo') }} {{ err('conductor') }} {{ err('conductores') }}</div>
          }
          <div class="row g-2 mb-2">
            <div class="col-md-4">
              <label class="form-label small" for="gf-placa">Placa del vehículo principal @if (isGrt) {<span class="erp-required">*</span>}</label>
              <input id="gf-placa" class="form-control form-control-sm text-uppercase" maxlength="10" name="placa" [ngModel]="placa"
                (ngModelChange)="placa = ($event || '').toUpperCase()" [class.is-invalid]="!!err('vehiculo.placa')" />
              @if (err('vehiculo.placa')) {<div class="invalid-feedback">{{ err('vehiculo.placa') }}</div>}
              @if (vehicleExtra) {<div class="form-text">Se conservan los demás datos guardados del vehículo ({{ vehicleExtra }}).</div>}
            </div>
            @if (edit) {
            @if (isGrt || nroCirculacion || tuc) {
            <div class="col-md-4">
              <label class="form-label small" for="gf-circ">Tarjeta de circulación / TUCE</label>
              <input id="gf-circ" class="form-control form-control-sm text-uppercase" maxlength="15" name="nro_circulacion" [ngModel]="nroCirculacion"
                (ngModelChange)="nroCirculacion = alnum($event)" [class.is-invalid]="!!err('vehiculo.nro_circulacion')" />
              @if (err('vehiculo.nro_circulacion')) {<div class="invalid-feedback">{{ err('vehiculo.nro_circulacion') }}</div>}
            </div>
            <div class="col-md-4">
              <label class="form-label small" for="gf-tuc">Certificado de habilitación (TUC)</label>
              <input id="gf-tuc" class="form-control form-control-sm text-uppercase" maxlength="15" name="tuc" [ngModel]="tuc" (ngModelChange)="tuc = alnum($event)"
                [class.is-invalid]="!!err('vehiculo.tuc')" />
              @if (err('vehiculo.tuc')) {<div class="invalid-feedback">{{ err('vehiculo.tuc') }}</div>}
            </div>
            }
            <div class="col-md-4">
              <span class="form-label small d-block">Placas secundarias (máx. 2)</span>
              @for (p of secondary; track $index; let j = $index) {
              <div class="input-group input-group-sm mb-1">
                <input class="form-control text-uppercase" maxlength="8" [attr.aria-label]="'Placa secundaria ' + (j + 1)" [name]="'gf-sec-' + j" [ngModel]="p"
                  (ngModelChange)="secondary[j] = plate($event)" [class.is-invalid]="!!err('vehiculo.secundarios.' + j + '.placa')" />
                <button type="button" class="btn btn-outline-danger" (click)="secondary.splice(j, 1)" [attr.aria-label]="'Quitar la placa ' + (j + 1)"><em class="feather icon-trash-2"></em></button>
              </div>
              }
              @if (secondary.length < 2) {<button type="button" class="btn btn-sm btn-link px-0" (click)="secondary.push('')">Agregar placa</button>}
            </div>
            }
          </div>
          <div class="table-responsive">
            <table class="table table-sm align-top small mb-2">
              <thead>
                <tr><th scope="col">Tipo</th><th scope="col">Documento</th><th scope="col">Número</th><th scope="col">Nombres</th><th scope="col">Apellidos</th>
                  <th scope="col">Licencia</th><th scope="col"><span class="visually-hidden">Quitar</span></th></tr>
              </thead>
              <tbody>
                @for (d of drivers; track d.key; let i = $index) {
                <tr>
                  <td>
                    <select class="form-select form-select-sm" [attr.aria-label]="'Tipo del conductor ' + (i + 1)" [name]="'drv-tipo-' + d.key" [(ngModel)]="d.tipo">
                      <option [ngValue]="''">—</option><option ngValue="Principal">Principal</option><option ngValue="Secundario">Secundario</option>
                    </select>
                  </td>
                  <td>
                    <select class="form-select form-select-sm" [attr.aria-label]="'Documento del conductor ' + (i + 1)" [name]="'drv-td-' + d.key" [(ngModel)]="d.tipo_doc"
                      [class.is-invalid]="!!dErr(i, 'tipo_doc')">
                      @for (o of docTypes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
                    </select>
                  </td>
                  @for (f of driverFields; track f.id) {
                  <td>
                    <input class="form-control form-control-sm" [attr.aria-label]="f.name + ' del conductor ' + (i + 1)" [attr.maxlength]="f.max"
                      [name]="'drv-' + f.id + '-' + d.key" [(ngModel)]="d[f.id]" [class.is-invalid]="!!dErr(i, f.id)" />
                    @if (dErr(i, f.id)) {<div class="invalid-feedback">{{ dErr(i, f.id) }}</div>}
                  </td>
                  }
                  <td class="text-end">
                    <button type="button" class="btn btn-sm btn-link text-danger px-1" (click)="removeDriver(i)" [attr.aria-label]="'Quitar el conductor ' + (i + 1)"
                      title="Quitar"><em class="feather icon-trash-2"></em></button>
                  </td>
                </tr>
                } @empty {
                <tr><td colspan="7" class="text-muted">Sin conductores{{ isGrt ? ' (la guía transportista exige al menos uno)' : '' }}.</td></tr>
                }
              </tbody>
            </table>
          </div>
          <button type="button" class="btn btn-sm btn-outline-primary" (click)="addDriver()"><em class="feather icon-plus me-1"></em>Agregar conductor</button>
        </fieldset>

        @if (isGrt || edit) {
        <fieldset class="border rounded p-3 mb-3">
          <legend class="float-none w-auto px-2 fs-6 mb-0">Documentos relacionados @if (isGrt) {<span class="erp-required">*</span>}</legend>
          @if (err('doc_relacionado')) {<div class="text-danger small mb-2">{{ err('doc_relacionado') }}</div>}
          <div class="table-responsive">
            <table class="table table-sm align-top small mb-2">
              <thead><tr><th scope="col">Tipo</th><th scope="col">Número</th><th scope="col">RUC del emisor</th><th scope="col"><span class="visually-hidden">Quitar</span></th></tr></thead>
              <tbody>
                @for (r of related; track r.key; let i = $index) {
                <tr>
                  <td>
                    <select class="form-select form-select-sm" [attr.aria-label]="'Tipo del documento relacionado ' + (i + 1)" [name]="'rel-t-' + r.key"
                      [(ngModel)]="r.tipo_codigo" [class.is-invalid]="!!rErr(i, 'tipo_codigo')">
                      <option [ngValue]="''">Elija…</option>
                      @for (o of relatedTypes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
                    </select>
                    @if (rErr(i, 'tipo_codigo')) {<div class="invalid-feedback">{{ rErr(i, 'tipo_codigo') }}</div>}
                  </td>
                  <td>
                    <input class="form-control form-control-sm" maxlength="100" placeholder="F001-120" [attr.aria-label]="'Número del documento relacionado ' + (i + 1)"
                      [name]="'rel-n-' + r.key" [(ngModel)]="r.numero" [class.is-invalid]="!!rErr(i, 'numero')" />
                    @if (rErr(i, 'numero')) {<div class="invalid-feedback">{{ rErr(i, 'numero') }}</div>}
                  </td>
                  <td>
                    <input class="form-control form-control-sm" maxlength="11" inputmode="numeric" [attr.aria-label]="'RUC del emisor del documento ' + (i + 1)"
                      [name]="'rel-r-' + r.key" [(ngModel)]="r.ruc_emisor" [class.is-invalid]="!!rErr(i, 'ruc_emisor')" />
                    @if (rErr(i, 'ruc_emisor')) {<div class="invalid-feedback">{{ rErr(i, 'ruc_emisor') }}</div>}
                  </td>
                  <td class="text-end">
                    <button type="button" class="btn btn-sm btn-link text-danger px-1" (click)="related.splice(i, 1)" [attr.aria-label]="'Quitar el documento ' + (i + 1)"
                      title="Quitar"><em class="feather icon-trash-2"></em></button>
                  </td>
                </tr>
                }
              </tbody>
            </table>
          </div>
          <button type="button" class="btn btn-sm btn-outline-primary" [disabled]="related.length >= 5" (click)="addRelated()">
            <em class="feather icon-plus me-1"></em>Agregar documento</button>
          <span class="form-text ms-2">Máximo 5. {{ isGrt ? 'Factura, boleta o guía relacionada llevan el RUC de su emisor.' : 'Los motivos 08, 09 y 19 exigen una DAM, DS o manifiesto.' }}</span>
        </fieldset>
        }

        @if (edit && isGrt) {
        <fieldset class="border rounded p-3 mb-3">
          <legend class="float-none w-auto px-2 fs-6 mb-0">Subcontratación y flete</legend>
          <div class="row g-2">
            <div class="col-md-4">
              <label class="form-label small" for="gf-sub-ruc">RUC del subcontratador</label>
              <input id="gf-sub-ruc" class="form-control form-control-sm" maxlength="11" inputmode="numeric" name="sub_ruc" [(ngModel)]="subRuc"
                [class.is-invalid]="!!err('datos_subcontratador.num_doc')" />
              @if (err('datos_subcontratador.num_doc')) {<div class="invalid-feedback">{{ err('datos_subcontratador.num_doc') }}</div>}
            </div>
            <div class="col-md-8">
              <label class="form-label small" for="gf-sub-rs">Razón social del subcontratador</label>
              <input id="gf-sub-rs" class="form-control form-control-sm" maxlength="250" name="sub_rs" [(ngModel)]="subRazon"
                [class.is-invalid]="!!err('datos_subcontratador.razon_social')" />
              @if (err('datos_subcontratador.razon_social')) {<div class="invalid-feedback">{{ err('datos_subcontratador.razon_social') }}</div>}
            </div>
            <div class="col-md-4">
              <label class="form-label small" for="gf-pag">Quién paga el flete @if (subRuc.trim()) {<span class="erp-required">*</span>}</label>
              <select id="gf-pag" class="form-select form-select-sm" name="pagador" [(ngModel)]="pagadorTipo"
                [class.is-invalid]="!!err('datos_pagador_flete') || !!err('datos_pagador_flete.tipo')">
                <option [ngValue]="''">Sin indicar</option>
                @for (o of payerTypes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
              </select>
              @if (err('datos_pagador_flete') || err('datos_pagador_flete.tipo')) {<div class="invalid-feedback">{{ err('datos_pagador_flete') || err('datos_pagador_flete.tipo') }}</div>}
            </div>
            @if (pagadorTipo === 'tercero') {
            <div class="col-md-3">
              <label class="form-label small" for="gf-pag-doc">RUC / DNI del tercero <span class="erp-required">*</span></label>
              <input id="gf-pag-doc" class="form-control form-control-sm" maxlength="15" name="pag_doc" [(ngModel)]="pagadorDoc"
                [class.is-invalid]="!!err('datos_pagador_flete.num_doc')" />
              @if (err('datos_pagador_flete.num_doc')) {<div class="invalid-feedback">{{ err('datos_pagador_flete.num_doc') }}</div>}
            </div>
            <div class="col-md-5">
              <label class="form-label small" for="gf-pag-rs">Razón social del tercero <span class="erp-required">*</span></label>
              <input id="gf-pag-rs" class="form-control form-control-sm" maxlength="250" name="pag_rs" [(ngModel)]="pagadorRazon"
                [class.is-invalid]="!!err('datos_pagador_flete.razon_social')" />
              @if (err('datos_pagador_flete.razon_social')) {<div class="invalid-feedback">{{ err('datos_pagador_flete.razon_social') }}</div>}
            </div>
            }
          </div>
        </fieldset>
        }

        @if (edit && (isGrt || autCodEmisor || autNumero)) {
        <fieldset class="border rounded p-3 mb-3">
          <legend class="float-none w-auto px-2 fs-6 mb-0">Autorización especial</legend>
          <div class="row g-2">
            <div class="col-md-4">
              <label class="form-label small" for="gf-aut-cod">Entidad emisora (código)</label>
              <input id="gf-aut-cod" class="form-control form-control-sm" maxlength="2" name="aut_cod" [(ngModel)]="autCodEmisor"
                [class.is-invalid]="!!err('autorizacion_especial.cod_emisor')" />
              @if (err('autorizacion_especial.cod_emisor')) {<div class="invalid-feedback">{{ err('autorizacion_especial.cod_emisor') }}</div>}
            </div>
            <div class="col-md-8">
              <label class="form-label small" for="gf-aut-num">Número de autorización</label>
              <input id="gf-aut-num" class="form-control form-control-sm" maxlength="50" name="aut_num" [(ngModel)]="autNumero"
                [class.is-invalid]="!!err('autorizacion_especial.nro_autorizacion')" />
              @if (err('autorizacion_especial.nro_autorizacion')) {<div class="invalid-feedback">{{ err('autorizacion_especial.nro_autorizacion') }}</div>}
            </div>
          </div>
          <p class="form-text mb-0 mt-1">Déjela vacía para quitarla.</p>
        </fieldset>
        }

        <fieldset class="border rounded p-3 mb-3">
          <legend class="float-none w-auto px-2 fs-6 mb-0">Bienes</legend>
          <app-item-grid [(items)]="items" [fields]="itemFields" [errors]="errors()" [disabled]="saving()"></app-item-grid>
        </fieldset>

        <div class="row g-2">
          <div class="col-md-6">
            <label class="form-label small" for="gf-obs">Observación</label>
            <textarea id="gf-obs" class="form-control form-control-sm" rows="2" maxlength="500" name="observacion" [(ngModel)]="observacion"
              [class.is-invalid]="!!err('observacion')"></textarea>
            @if (err('observacion')) {<div class="invalid-feedback">{{ err('observacion') }}</div>}
          </div>
          <div class="col-md-6">
            <label class="form-label small" for="gf-motivo">Motivo de la corrección <span class="erp-required">*</span></label>
            <textarea id="gf-motivo" class="form-control form-control-sm" rows="2" name="motivo" [attr.maxlength]="reasonMax" [(ngModel)]="motivo"
              placeholder="Por qué se corrige (queda en la auditoría)" [class.is-invalid]="!!err('motivo')"></textarea>
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
export class GuideFixFormComponent implements OnInit {
  readonly activeModal = inject(NgbActiveModal);
  private admin = inject(TenantAdminService);
  private views = inject(TenantViewsService);

  target!: ActionTarget;

  readonly reasons = TRANSFER_REASON_OPTIONS;
  readonly modes = TRANSFER_MODE_OPTIONS;
  readonly weightUnits = WEIGHT_UNIT_OPTIONS;
  readonly docTypes = PARTY_DOC_OPTIONS;
  readonly senderTypes = PARTY_DOC_OPTIONS.filter((o) => o.id === '1' || o.id === '6');
  relatedTypes: Option<string>[] = RELATED_DOC_OPTIONS;
  itemFields: ItemField[] = GUIDE_ITEM_FIELDS;
  readonly payerTypes = FREIGHT_PAYER_OPTIONS;
  readonly reasonMax = REASON_MAX;
  readonly sides: { id: 'partida' | 'llegada'; name: string }[] = [{ id: 'partida', name: 'Punto de partida' }, { id: 'llegada', name: 'Punto de llegada' }];
  readonly driverFields: { id: 'num_doc' | 'nombres' | 'apellidos' | 'licencia'; name: string; max: number }[] = [
    { id: 'num_doc', name: 'Número', max: 15 }, { id: 'nombres', name: 'Nombres', max: 100 }, { id: 'apellidos', name: 'Apellidos', max: 100 },
    { id: 'licencia', name: 'Licencia', max: 20 }
  ];

  isGrt = false;
  /** `datos_edicion` del detalle (§12.1); `null` con una API anterior. */
  edit: Json | null = null;
  /** Lo que se devuelve igual sin mostrarse (para el aviso). */
  keptText = '';
  tipoDocumento = '09';
  serie = '';
  issued = '';
  status = '';
  sunatText = '';
  fechaEmision = '';
  destinatario: PartyValue = emptyParty();
  remitente: PartyValue = emptyParty('6');
  codTraslado = '';
  modTraslado = '';
  fechaTraslado = '';
  fechaEntrega = '';
  pesoTotal: number | null = null;
  undPeso = 'KGM';
  numBultos: number | null = null;
  m1l = false;
  addr: Record<'partida' | 'llegada', { ubigeo: string; direccion: string; ruc: string; codLocal: string }> = {
    partida: { ubigeo: '', direccion: '', ruc: '', codLocal: '' }, llegada: { ubigeo: '', direccion: '', ruc: '', codLocal: '' }
  };
  tercero: PartyValue = emptyParty('6');
  comprador: PartyValue = emptyParty('6');
  /** Indicadores guardados distintos de M1L (se conservan). */
  otherIndicators: string[] = [];
  transportista: PartyValue = emptyParty('6');
  nroMtc = '';
  private transportistaExtra: Json = {};
  placa = '';
  private vehicle: Json = {};
  vehicleExtra = '';
  nroCirculacion = '';
  tuc = '';
  secondary: string[] = [];
  /** Forma guardada de los conductores: `conductor` (objeto) o `conductores` (lista). */
  private driverShape: 'object' | 'list' = 'list';
  subRuc = '';
  subRazon = '';
  pagadorTipo = '';
  pagadorDoc = '';
  pagadorRazon = '';
  autCodEmisor = '';
  autNumero = '';
  drivers: Driver[] = [];
  related: RelatedDoc[] = [];
  items: EmissionItem[] = [];
  observacion = '';
  motivo = '';

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly saving = signal(false);
  readonly error = signal('');
  readonly errors = signal<Record<string, string>>({});
  readonly others = signal<string[]>([]);

  ngOnInit(): void {
    this.views.get(this.target.tenantId, `guias-remision/${this.target.docId}`).subscribe({
      next: (resp) => {
        this.loading.set(false);
        if (resp.succeeded && resp.data) {
          this.fill(obj(resp.data));
        } else {
          this.loadError.set(serverMessages(resp, 'No se pudo cargar la guía.'));
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(actionHttpError(err, 'No se pudo cargar la guía.'));
      }
    });
  }

  private fill(d: Json): void {
    const s = obj(d['sunat']);
    this.status = str(s['estado']);
    this.sunatText = [str(s['codigo']), str(s['descripcion'])].filter(Boolean).join(' – ');
    this.issued = dayText(d['fecha_emision']);
    const edit = d['datos_edicion'];
    if (edit != null && typeof edit === 'object' && !Array.isArray(edit)) {
      this.fillFromEdit(d, edit as Json);
      return;
    }
    const e = obj(d['envio']);
    const dirs = obj(d['direcciones']);
    this.tipoDocumento = str(d['tipo_documento']) || '09';
    this.isGrt = this.tipoDocumento === '31';
    this.serie = str(d['serie']);
    this.fechaEmision = str(d['fecha_emision']).substring(0, 10);
    this.destinatario = partyFromResource(d['destinatario']);
    this.codTraslado = str(e['cod_traslado']);
    this.modTraslado = str(e['mod_traslado']);
    this.fechaTraslado = str(e['fecha_traslado']).substring(0, 10);
    this.fechaEntrega = str(e['fecha_entrega_transportista']).substring(0, 10);
    this.pesoTotal = num(e['peso_total']);
    this.undPeso = str(e['und_peso_total']) || 'KGM';
    this.numBultos = num(d['num_bultos']);
    (['partida', 'llegada'] as const).forEach((k) => {
      const a = obj(dirs[k]);
      this.addr[k] = { ubigeo: str(a['ubigeo']), direccion: str(a['direccion']), ruc: '', codLocal: '' };
    });
    this.observacion = str(d['observacion']);
    const t = obj(d['transportista']);
    if (Object.keys(t).length) {
      this.transportista = partyFromResource(t);
      this.nroMtc = str(t['nro_mtc']);
      this.transportistaExtra = Object.fromEntries(Object.entries(t).filter(([k]) => !['tipo_doc', 'num_doc', 'razon_social', 'nro_mtc'].includes(k)));
    } else {
      this.transportista = { tipo_doc: '6', num_doc: '', razon_social: '', direccion: '' };
    }
    this.vehicle = obj(d['vehiculo']);
    this.placa = str(this.vehicle['placa']);
    this.vehicleExtra = Object.keys(this.vehicle).filter((k) => k !== 'placa').join(', ');
    const rawDrivers = Array.isArray(d['conductor']) ? arr(d['conductor']) : Object.keys(obj(d['conductor'])).length ? [obj(d['conductor'])] : [];
    this.drivers = rawDrivers.map((c) => ({
      key: key('drv'), tipo: str(c['tipo']), tipo_doc: str(c['tipo_doc']) || '1', num_doc: str(c['num_doc']), nombres: str(c['nombres']),
      apellidos: str(c['apellidos']), licencia: str(c['licencia']),
      extra: Object.fromEntries(Object.entries(c).filter(([k]) => !['tipo', 'tipo_doc', 'num_doc', 'nombres', 'apellidos', 'licencia'].includes(k)))
    }));
    this.items = guideItemsFromResource(d['items']);
    if (this.isGrt) {
      this.related = [{ key: key('rel'), tipo_codigo: '', numero: '', ruc_emisor: '' }];
    }
  }

  /** Precarga con `datos_edicion` (§12.1): todos los campos guardados de la guía 09 o 31. */
  private fillFromEdit(d: Json, e: Json): void {
    this.edit = e;
    this.tipoDocumento = str(e['tipo_documento']) || str(d['tipo_documento']) || '09';
    this.isGrt = this.tipoDocumento === '31';
    this.relatedTypes = this.isGrt ? RELATED_DOC_OPTIONS : GUIDE_RELATED_DOC_OPTIONS;
    this.itemFields = GUIDE_EMIT_ITEM_FIELDS;
    this.serie = str(e['serie']) || str(d['serie']);
    this.fechaEmision = str(e['fecha_emision']).substring(0, 10);
    const party = (k: string) => (Object.keys(obj(e[k])).length ? partyFromResource(e[k]) : emptyParty('6'));
    this.destinatario = party('destinatario');
    this.remitente = party('remitente');
    this.tercero = party('tercero');
    this.comprador = party('comprador');
    this.codTraslado = str(e['cod_traslado']);
    this.modTraslado = str(e['mod_traslado']);
    this.fechaTraslado = str(e['fecha_traslado']).substring(0, 10);
    this.fechaEntrega = str(e['fecha_entrega_transportista']).substring(0, 10);
    this.pesoTotal = num(e['peso_total']);
    this.undPeso = str(e['und_peso_total']) || 'KGM';
    this.numBultos = num(e['num_bultos']);
    const indicators = (Array.isArray(e['indicadores']) ? e['indicadores'] : []).map(str).filter(Boolean);
    this.m1l = indicators.includes(M1L);
    this.otherIndicators = indicators.filter((i) => i !== M1L);
    (['partida', 'llegada'] as const).forEach((k) => {
      this.addr[k] = { ubigeo: str(e[`${k}_ubigeo`]), direccion: str(e[`${k}_direccion`]), ruc: str(e[`${k}_ruc`]), codLocal: str(e[`${k}_cod_local`]) };
    });
    this.observacion = str(e['observacion']);
    const t = obj(e['transportista']);
    this.transportista = Object.keys(t).length ? partyFromResource(t) : emptyParty('6');
    this.nroMtc = str(t['nro_mtc']);
    this.transportistaExtra = Object.fromEntries(Object.entries(t).filter(([k]) => !['tipo_doc', 'num_doc', 'razon_social', 'nro_mtc'].includes(k)));
    this.vehicle = obj(e['vehiculo']);
    this.placa = str(this.vehicle['placa']);
    this.nroCirculacion = str(this.vehicle['nro_circulacion']);
    this.tuc = str(this.vehicle['tuc']);
    this.secondary = arr(this.vehicle['secundarios']).map((v) => str(v['placa'])).filter(Boolean);
    this.vehicleExtra = Object.keys(this.vehicle).filter((k) => !VEHICLE_KEYS.includes(k)).join(', ');
    const list = Array.isArray(e['conductores']) ? arr(e['conductores']) : null;
    const single = obj(e['conductor']);
    this.driverShape = list || !Object.keys(single).length ? 'list' : 'object';
    const rawDrivers = list ?? (Object.keys(single).length ? [single] : Array.isArray(e['conductor']) ? arr(e['conductor']) : []);
    this.drivers = rawDrivers.map((c) => ({
      key: key('drv'), tipo: str(c['tipo']), tipo_doc: str(c['tipo_doc']) || '1', num_doc: str(c['num_doc']), nombres: str(c['nombres']),
      apellidos: str(c['apellidos']), licencia: str(c['licencia']),
      extra: Object.fromEntries(Object.entries(c).filter(([k]) => !['tipo', 'tipo_doc', 'num_doc', 'nombres', 'apellidos', 'licencia'].includes(k)))
    }));
    this.related = arr(e['doc_relacionado']).map((r) => ({
      key: key('rel'), tipo_codigo: str(r['tipo_codigo']), numero: str(r['numero']), ruc_emisor: str(r['ruc_emisor']),
      extra: Object.fromEntries(Object.entries(r).filter(([k]) => !['tipo_codigo', 'numero', 'ruc_emisor'].includes(k)))
    }));
    if (this.isGrt && !this.related.length) {
      this.addRelated();
    }
    const sub = obj(e['datos_subcontratador']);
    this.subRuc = str(sub['num_doc']);
    this.subRazon = str(sub['razon_social']);
    const payer = obj(e['datos_pagador_flete']);
    this.pagadorTipo = str(payer['tipo']);
    this.pagadorDoc = str(payer['num_doc']);
    this.pagadorRazon = str(payer['razon_social']);
    const aut = obj(e['autorizacion_especial']);
    this.autCodEmisor = str(aut['cod_emisor']);
    this.autNumero = str(aut['nro_autorizacion']);
    this.items = editItemsFromData(e['items']);
    // Lo que no se muestra y vuelve igual: transportista en la 31, claves extra del vehículo, otros indicadores.
    const kept: string[] = [];
    if (this.isGrt && Object.keys(t).length) {
      kept.push(`transportista: ${jsonSummary(t).join(' ')}`);
    }
    if (this.vehicleExtra) {
      kept.push(`del vehículo: ${this.vehicleExtra}`);
    }
    this.keptText = kept.join('; ');
  }

  /** ¿`datos_edicion` trae la clave con valor? */
  hasKey(k: string): boolean {
    const v = this.edit?.[k];
    return v != null && !(typeof v === 'object' && !Object.keys(v as object).length);
  }

  filled(p: PartyValue): boolean {
    return !!(p.num_doc.trim() || p.razon_social.trim());
  }

  plate(v: unknown): string {
    return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8);
  }

  alnum(v: unknown): string {
    return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 15);
  }

  err(k: string): string {
    return this.errors()[k] ?? '';
  }

  /** Errores de un conductor: la API usa `conductores.N.campo` (lista) o `conductor.campo` (uno). */
  dErr(i: number, f: string): string {
    return this.err(`conductores.${i}.${f}`) || (i === 0 ? this.err(`conductor.${f}`) : '');
  }

  rErr(i: number, f: string): string {
    return this.err(`doc_relacionado.${i}.${f}`);
  }

  statusName(v: string): string {
    return sunatStatusName(v);
  }

  badge(v: string): string {
    return sunatBadge(v);
  }

  setUbigeo(side: 'partida' | 'llegada', choice: UbigeoChoice | null): void {
    this.addr[side].ubigeo = choice?.ubigeo ?? '';
  }

  addDriver(): void {
    this.drivers.push({ key: key('drv'), tipo: this.drivers.length ? 'Secundario' : 'Principal', tipo_doc: '1', num_doc: '', nombres: '', apellidos: '', licencia: '', extra: {} });
  }

  removeDriver(i: number): void {
    this.drivers.splice(i, 1);
  }

  addRelated(): void {
    this.related.push({ key: key('rel'), tipo_codigo: '', numero: '', ruc_emisor: '' });
  }

  private validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.fechaEmision)) {
      e['fecha_emision'] = 'Indique la fecha de emisión.';
    }
    Object.assign(e, partyErrors(this.destinatario, 'destinatario'));
    if (this.edit) {
      (['tercero', 'comprador'] as const).forEach((k) => {
        if (!this.isGrt && this.filled(this[k])) {
          Object.assign(e, partyErrors(this[k], k));
        }
      });
      if (!this.isGrt) {
        this.related.forEach((r, i) => {
          if (r.tipo_codigo || r.numero.trim() || r.ruc_emisor.trim()) {
            if (!r.tipo_codigo) {
              e[`doc_relacionado.${i}.tipo_codigo`] = 'Elija el tipo.';
            }
            if (!r.numero.trim()) {
              e[`doc_relacionado.${i}.numero`] = 'Indique el número.';
            }
            if (r.ruc_emisor.trim() && rucError(r.ruc_emisor.trim())) {
              e[`doc_relacionado.${i}.ruc_emisor`] = rucError(r.ruc_emisor.trim());
            }
          }
        });
      } else {
        if (this.subRuc.trim() || this.subRazon.trim()) {
          if (!/^\d{11}$/.test(this.subRuc.trim())) {
            e['datos_subcontratador.num_doc'] = 'RUC de 11 dígitos.';
          }
          if (!this.subRazon.trim()) {
            e['datos_subcontratador.razon_social'] = 'Indique la razón social.';
          }
          if (!this.pagadorTipo) {
            e['datos_pagador_flete'] = 'Con transporte subcontratado, indique quién paga el flete.';
          }
        }
        if (this.pagadorTipo === 'tercero') {
          if (!this.pagadorDoc.trim()) {
            e['datos_pagador_flete.num_doc'] = 'Indique el documento del tercero.';
          }
          if (!this.pagadorRazon.trim()) {
            e['datos_pagador_flete.razon_social'] = 'Indique la razón social del tercero.';
          }
        }
      }
      if (!!this.autCodEmisor.trim() !== !!this.autNumero.trim()) {
        e[this.autCodEmisor.trim() ? 'autorizacion_especial.nro_autorizacion' : 'autorizacion_especial.cod_emisor'] = 'Indique los dos datos (o deje ambos vacíos).';
      }
    }
    if (this.isGrt) {
      Object.assign(e, partyErrors(this.remitente, 'remitente', ['1', '6']));
      if (!this.related.length) {
        e['doc_relacionado'] = 'La guía transportista requiere al menos un documento relacionado.';
      }
      this.related.forEach((r, i) => {
        if (!r.tipo_codigo) {
          e[`doc_relacionado.${i}.tipo_codigo`] = 'Elija el tipo.';
        }
        if (!r.numero.trim()) {
          e[`doc_relacionado.${i}.numero`] = 'Indique el número.';
        }
        if (['01', '03', '09', '31'].includes(r.tipo_codigo) && !r.ruc_emisor.trim()) {
          e[`doc_relacionado.${i}.ruc_emisor`] = 'Indique el RUC del emisor.';
        } else if (r.ruc_emisor.trim() && rucError(r.ruc_emisor.trim())) {
          e[`doc_relacionado.${i}.ruc_emisor`] = rucError(r.ruc_emisor.trim());
        }
      });
      if (!this.placa.trim()) {
        e['vehiculo.placa'] = 'La guía transportista requiere el vehículo.';
      }
      if (!this.drivers.length) {
        e['conductor'] = 'La guía transportista requiere al menos un conductor.';
      }
    } else {
      if (!this.codTraslado) {
        e['cod_traslado'] = 'Elija el motivo de traslado.';
      }
      if (!this.modTraslado) {
        e['mod_traslado'] = 'Elija la modalidad.';
      }
      if (this.transportistaFilled()) {
        Object.assign(e, partyErrors(this.transportista, 'transportista'));
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.fechaTraslado)) {
      e['fecha_traslado'] = 'Indique la fecha de traslado.';
    }
    if (!((this.pesoTotal ?? 0) > 0)) {
      e['peso_total'] = 'El peso total debe ser mayor que 0.';
    }
    if (this.numBultos != null && !(Number.isInteger(Number(this.numBultos)) && Number(this.numBultos) >= 1)) {
      e['num_bultos'] = 'Número entero de 1 o más.';
    }
    this.sides.forEach((side) => {
      const a = this.addr[side.id];
      if (!/^\d{6}$/.test(a.ubigeo)) {
        e[`${side.id}_ubigeo`] = 'Elija el distrito (ubigeo de 6 dígitos).';
      }
      if (!a.direccion.trim()) {
        e[`${side.id}_direccion`] = 'Indique la dirección.';
      }
      if (a.ruc.trim() && !/^\d{11}$/.test(a.ruc.trim())) {
        e[`${side.id}_ruc`] = 'El RUC tiene 11 dígitos.';
      }
    });
    this.drivers.forEach((d, i) => {
      this.driverFields.forEach((f) => {
        if (!d[f.id].trim()) {
          e[`conductores.${i}.${f.id}`] = 'Obligatorio.';
        }
      });
    });
    Object.assign(e, itemErrors(this.items, this.itemFields));
    const motivo = this.motivo.trim();
    if (!motivo) {
      e['motivo'] = 'El motivo es obligatorio.';
    } else if (motivo.length > REASON_MAX) {
      e['motivo'] = `Máximo ${REASON_MAX} caracteres.`;
    }
    return e;
  }

  private transportistaFilled(): boolean {
    return !!(this.transportista.num_doc.trim() || this.transportista.razon_social.trim() || this.nroMtc.trim());
  }

  /** Cuerpo completo de `PUT /api/v1/guias-remision/{id}` (nombres de `/api/v1`) más `motivo`. */
  private buildBody(): Json {
    const text = (v: string) => (v.trim() ? v.trim() : null);
    const b: Json = {
      tipo_documento: this.tipoDocumento, serie: this.serie, fecha_emision: this.fechaEmision, destinatario: partyToBody(this.destinatario, false),
      fecha_traslado: this.fechaTraslado, peso_total: Number(this.pesoTotal), und_peso_total: this.undPeso
    };
    if (this.codTraslado) {
      b['cod_traslado'] = this.codTraslado;
    }
    if (this.modTraslado) {
      b['mod_traslado'] = this.modTraslado;
    }
    if (this.fechaEntrega) {
      b['fecha_entrega_transportista'] = this.fechaEntrega;
    }
    if (this.numBultos != null && String(this.numBultos) !== '') {
      b['num_bultos'] = Number(this.numBultos);
    }
    this.sides.forEach((side) => {
      const a = this.addr[side.id];
      b[`${side.id}_ubigeo`] = a.ubigeo;
      b[`${side.id}_direccion`] = a.direccion.trim();
      if (text(a.ruc)) {
        b[`${side.id}_ruc`] = a.ruc.trim();
      }
      if (text(a.codLocal)) {
        b[`${side.id}_cod_local`] = a.codLocal.trim();
      }
    });
    if (this.m1l) {
      b['indicadores'] = [M1L];
    }
    if (text(this.observacion)) {
      b['observacion'] = this.observacion.trim();
    }
    if (!this.isGrt && this.transportistaFilled()) {
      const t: Json = { ...this.transportistaExtra, ...partyToBody(this.transportista, false) };
      if (text(this.nroMtc)) {
        t['nro_mtc'] = this.nroMtc.trim();
      }
      b['transportista'] = t;
    }
    if (text(this.placa)) {
      b['vehiculo'] = { ...this.vehicle, placa: this.placa.trim() };
    }
    const drivers = this.drivers.map((d) => {
      const c: Json = { ...d.extra, tipo_doc: d.tipo_doc, num_doc: d.num_doc.trim(), nombres: d.nombres.trim(), apellidos: d.apellidos.trim(), licencia: d.licencia.trim() };
      if (d.tipo) {
        c['tipo'] = d.tipo;
      }
      return c;
    });
    if (drivers.length) {
      // Uno en la remitente va como objeto; varios (o la transportista) como lista (la API la toma como `conductores`).
      b['conductor'] = drivers.length === 1 && !this.isGrt ? drivers[0] : drivers;
    }
    if (this.isGrt) {
      b['remitente'] = partyToBody(this.remitente, false);
      b['doc_relacionado'] = this.related.map((r) => {
        const x: Json = { tipo_codigo: r.tipo_codigo, numero: r.numero.trim() };
        if (text(r.ruc_emisor)) {
          x['ruc_emisor'] = r.ruc_emisor.trim();
        }
        return x;
      });
    }
    b['items'] = this.items.map((i) => itemToBody(i, this.itemFields));
    b['motivo'] = this.motivo.trim();
    return b;
  }

  /** Un tercero de `datos_edicion` con lo corregido encima, o `null` si se vació. */
  private partyOrNull(k: string, p: PartyValue): Json | null {
    return this.filled(p) ? { ...obj(this.edit?.[k]), ...partyToBody(p, false) } : null;
  }

  /** Cuerpo completo (§12.1): `datos_edicion` con el formulario encima, más `motivo`. Lo vaciado va en `null`. */
  private buildEditBody(): Json {
    const e = this.edit ?? {};
    const b: Json = structuredClone(e);
    NEVER_SENT.forEach((k) => delete b[k]);
    const text = (v: string) => (v.trim() ? v.trim() : null);
    const numOrNull = (v: unknown) => (v == null || String(v) === '' ? null : Number(v));
    b['tipo_documento'] = this.tipoDocumento;
    b['serie'] = this.serie;
    b['fecha_emision'] = this.fechaEmision;
    b['destinatario'] = { ...obj(e['destinatario']), ...partyToBody(this.destinatario, false) };
    if (this.isGrt) {
      b['remitente'] = this.partyOrNull('remitente', this.remitente);
    } else {
      b['tercero'] = this.partyOrNull('tercero', this.tercero);
      b['comprador'] = this.partyOrNull('comprador', this.comprador);
    }
    if ('cod_traslado' in e || (!this.isGrt && this.codTraslado)) {
      b['cod_traslado'] = this.codTraslado || null;
    }
    if ('mod_traslado' in e || (!this.isGrt && this.modTraslado)) {
      b['mod_traslado'] = this.modTraslado || null;
    }
    b['fecha_traslado'] = this.fechaTraslado || null;
    b['fecha_entrega_transportista'] = this.fechaEntrega || null;
    b['peso_total'] = numOrNull(this.pesoTotal);
    b['und_peso_total'] = this.undPeso;
    b['num_bultos'] = numOrNull(this.numBultos);
    const indicators = [...this.otherIndicators, ...(this.m1l ? [M1L] : [])];
    b['indicadores'] = indicators.length ? indicators : null;
    this.sides.forEach((side) => {
      const a = this.addr[side.id];
      b[`${side.id}_ubigeo`] = a.ubigeo || null;
      b[`${side.id}_direccion`] = text(a.direccion);
      b[`${side.id}_ruc`] = text(a.ruc);
      b[`${side.id}_cod_local`] = text(a.codLocal);
    });
    if (!this.isGrt) {
      if (this.transportistaFilled()) {
        const t: Json = { ...this.transportistaExtra, ...partyToBody(this.transportista, false) };
        if (text(this.nroMtc)) {
          t['nro_mtc'] = this.nroMtc.trim();
        }
        b['transportista'] = t;
      } else {
        b['transportista'] = null;
      }
    }
    if (text(this.placa)) {
      const v: Json = { ...this.vehicle, placa: this.placa.trim() };
      (['nro_circulacion', 'tuc'] as const).forEach((k) => {
        const value = k === 'tuc' ? this.tuc : this.nroCirculacion;
        if (value.trim()) {
          v[k] = value.trim();
        } else {
          delete v[k];
        }
      });
      const saved = arr(this.vehicle['secundarios']);
      const plates = this.secondary.map((p) => p.trim()).filter(Boolean);
      if (plates.length) {
        v['secundarios'] = plates.map((p, j) => ({ ...(saved[j] ?? {}), placa: p }));
      } else {
        delete v['secundarios'];
      }
      b['vehiculo'] = v;
    } else {
      b['vehiculo'] = null;
    }
    const drivers = this.drivers.map((d) => {
      const c: Json = { ...d.extra, tipo_doc: d.tipo_doc, num_doc: d.num_doc.trim(), nombres: d.nombres.trim(), apellidos: d.apellidos.trim(), licencia: d.licencia.trim() };
      if (d.tipo) {
        c['tipo'] = d.tipo;
      }
      return c;
    });
    // Misma forma que lo guardado: un objeto en `conductor` o la lista en `conductores` (el otro, null).
    if (this.driverShape === 'object' && drivers.length === 1) {
      b['conductor'] = drivers[0];
      b['conductores'] = null;
    } else {
      b['conductor'] = null;
      b['conductores'] = drivers.length ? drivers : null;
    }
    const related = this.related.filter((r) => r.tipo_codigo || r.numero.trim() || r.ruc_emisor.trim()).map((r) => {
      const x: Json = { ...(r.extra ?? {}), tipo_codigo: r.tipo_codigo, numero: r.numero.trim() };
      if (text(r.ruc_emisor)) {
        x['ruc_emisor'] = r.ruc_emisor.trim();
      } else {
        delete x['ruc_emisor'];
      }
      return x;
    });
    b['doc_relacionado'] = related.length ? related : null;
    if (this.isGrt) {
      b['datos_subcontratador'] = this.subRuc.trim() || this.subRazon.trim()
        ? { ...obj(e['datos_subcontratador']), num_doc: this.subRuc.trim(), razon_social: this.subRazon.trim() } : null;
      if (this.pagadorTipo) {
        const p: Json = { ...obj(e['datos_pagador_flete']), tipo: this.pagadorTipo };
        if (this.pagadorTipo === 'tercero') {
          p['tipo_doc'] = this.pagadorDoc.trim().length === 11 ? '6' : (str(p['tipo_doc']) || '1');
          p['num_doc'] = this.pagadorDoc.trim();
          p['razon_social'] = this.pagadorRazon.trim();
        } else {
          delete p['tipo_doc'];
          delete p['num_doc'];
          delete p['razon_social'];
        }
        b['datos_pagador_flete'] = p;
      } else {
        b['datos_pagador_flete'] = null;
      }
    }
    b['autorizacion_especial'] = this.autCodEmisor.trim() || this.autNumero.trim()
      ? { ...obj(e['autorizacion_especial']), cod_emisor: this.autCodEmisor.trim(), nro_autorizacion: this.autNumero.trim() } : null;
    b['observacion'] = text(this.observacion);
    b['items'] = this.items.map((i) => editItemToBody(i, this.itemFields));
    b['motivo'] = this.motivo.trim();
    return b;
  }

  save(): void {
    if (this.saving()) {
      return;
    }
    const e = this.validate();
    this.errors.set(e);
    this.error.set(Object.keys(e).length ? 'Revise los campos marcados.' : '');
    this.others.set([]);
    if (Object.keys(e).length) {
      return;
    }
    this.saving.set(true);
    this.admin.fixDocument(this.target.tenantId, 'guias-remision', this.target.docId, this.edit ? this.buildEditBody() : this.buildBody()).subscribe({
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
        this.showErrors(fieldErrors(err?.error), actionHttpError(err, 'No se pudo corregir la guía.'));
      }
    });
  }

  private showErrors(fields: Record<string, string>, message: string): void {
    this.errors.set(fields);
    this.error.set(message);
    const known = (k: string) => KNOWN_FIELDS.includes(k) || KNOWN_PREFIXES.some((p) => k === p || k.startsWith(`${p}.`));
    this.others.set(otherErrors(fields, known).filter((m) => !message.includes(m)));
  }
}
