import { Component, OnInit, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { limaTodayYmd } from '@shared/functions/lima-dates';
import { Option } from '../../models/sunat.models';
import { UbigeoChoice, rucError } from '../../models/tenant-admin.models';
import { Json } from '../../models/tenant-views.models';
import { EmissionService } from '../../services/emission.service';
import { UbigeoSelectComponent } from '../common/ubigeo-select.component';
import { EmissionActionsComponent, withReason } from './emission-actions.component';
import { EmissionSubmitter, IssueOutcome } from './emission-submit';
import { EmissionContext, EmitType, seriesOptions } from './emission-types';
import {
  EmissionItem, FREIGHT_PAYER_OPTIONS, GUIDE_EMIT_ITEM_FIELDS, GUIDE_M1L_INDICATOR, GUIDE_RELATED_DOC_OPTIONS, PARTY_DOC_OPTIONS, PartyValue, RELATED_DOC_OPTIONS,
  TRANSFER_MODE_OPTIONS, TRANSFER_REASON_OPTIONS, WEIGHT_UNIT_OPTIONS, emptyItem, emptyParty, itemErrors, itemToBody, partyErrors, partyToBody
} from './emission.models';
import { ItemGridComponent } from './item-grid.component';
import { PartyBlockComponent } from './party-block.component';

interface Driver {
  key: string;
  tipo_doc: string;
  num_doc: string;
  nombres: string;
  apellidos: string;
  licencia: string;
}

interface RelatedDoc {
  key: string;
  tipo_codigo: string;
  numero: string;
  ruc_emisor: string;
}

interface Place {
  ubigeo: string;
  direccion: string;
  ruc: string;
  codLocal: string;
}

type DriverField = 'num_doc' | 'nombres' | 'apellidos' | 'licencia';

let seq = 0;
const key = (p: string) => `${p}-${++seq}`;

const PLATE_RE = /^[A-Z0-9]{6,8}$/;
const ALNUM_RE = /^[A-Z0-9]{10,15}$/;
const KNOWN_FIELDS = ['serie', 'correlativo', 'fecha_emision', 'cod_traslado', 'mod_traslado', 'fecha_traslado', 'fecha_entrega_transportista', 'peso_total',
  'und_peso_total', 'num_bultos', 'partida_ubigeo', 'partida_direccion', 'partida_ruc', 'partida_cod_local', 'llegada_ubigeo', 'llegada_direccion', 'llegada_ruc',
  'llegada_cod_local', 'observacion', 'motivo', 'indicadores'];
const KNOWN_PREFIXES = ['destinatario', 'remitente', 'tercero', 'transportista', 'vehiculo', 'conductor', 'conductores', 'doc_relacionado', 'items',
  'datos_subcontratador', 'datos_pagador_flete'];

/**
 * Guía de remisión remitente (09) o transportista (31) (§11.7): `POST tenants/{id}/guias-remision` o
 * `…/guias-remision-transportista` con el cuerpo de `/api/v1`.
 * - 09: destinatario, motivo y modalidad de traslado (público: transportista con registro MTC y, desde 2026-06-01, fecha de
 *   entrega al transportista; privado: vehículo y conductores), tercero (motivo 03), documentos relacionados (DAM / DS en
 *   los motivos 08, 09 y 19), indicador M1 / L.
 * - 31: remitente, destinatario, documentos relacionados con el RUC de su emisor, vehículo (con secundarios, TUC y tarjeta),
 *   conductores, subcontratista y pagador del flete.
 * Partida (prellenada con el domicilio fiscal de la empresa) y llegada con ubigeo y, en traslados entre establecimientos,
 * RUC y código de local. Bienes con código SUNAT opcional. Conductores van como `conductores` (lista).
 */
@Component({
  selector: 'app-guide-emit-form',
  imports: [FormsModule, ItemGridComponent, PartyBlockComponent, UbigeoSelectComponent, EmissionActionsComponent],
  template: `
    <form class="erp-form" novalidate (ngSubmit)="submit()">
      <div class="row g-2 mb-3">
        <div class="col-6 col-md-3">
          <label class="form-label small" for="ge-serie">Serie <span class="erp-required">*</span></label>
          <select id="ge-serie" class="form-select form-select-sm" name="serie" [(ngModel)]="serie" [class.is-invalid]="!!err('serie')">
            <option [ngValue]="''">Elija…</option>
            @for (o of seriesList; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
          @if (err('serie')) {<div class="invalid-feedback">{{ err('serie') }}</div>}
          @if (!seriesList.length) {<div class="form-text text-danger">Sin series activas de {{ isGrt ? 'guía transportista' : 'guía remitente' }}: créelas en Configuración.</div>}
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label small" for="ge-fecha">Fecha de emisión <span class="erp-required">*</span></label>
          <input id="ge-fecha" type="date" class="form-control form-control-sm" name="fecha_emision" [(ngModel)]="fechaEmision" [max]="today"
            [class.is-invalid]="!!err('fecha_emision')" />
          @if (err('fecha_emision')) {<div class="invalid-feedback">{{ err('fecha_emision') }}</div>}
        </div>
      </div>

      @if (isGrt) {
      <app-party-block title="Remitente (quien envía la carga)" [(value)]="remitente" prefix="remitente" [errors]="sub.errors()" [docTypes]="senderTypes"
        [showAddress]="false" [tenantId]="ctx().tenantId" [lookup]="true" [disabled]="sub.sending()"></app-party-block>
      }
      <app-party-block title="Destinatario" [(value)]="destinatario" prefix="destinatario" [errors]="sub.errors()" [showAddress]="false"
        [tenantId]="ctx().tenantId" [lookup]="true" [disabled]="sub.sending()" [hint]="destinatarioHint()"></app-party-block>

      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">Traslado</legend>
        <div class="row g-2">
          @if (!isGrt) {
          <div class="col-md-6">
            <label class="form-label small" for="ge-cod">Motivo de traslado <span class="erp-required">*</span></label>
            <select id="ge-cod" class="form-select form-select-sm" name="cod_traslado" [(ngModel)]="codTraslado" [class.is-invalid]="!!err('cod_traslado')">
              @for (o of reasons; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
            @if (err('cod_traslado')) {<div class="invalid-feedback">{{ err('cod_traslado') }}</div>}
          </div>
          <div class="col-md-6">
            <label class="form-label small" for="ge-mod">Modalidad <span class="erp-required">*</span></label>
            <select id="ge-mod" class="form-select form-select-sm" name="mod_traslado" [(ngModel)]="modTraslado" [class.is-invalid]="!!err('mod_traslado')">
              @for (o of modes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
            @if (err('mod_traslado')) {<div class="invalid-feedback">{{ err('mod_traslado') }}</div>}
          </div>
          }
          <div class="col-6 col-md-3">
            <label class="form-label small" for="ge-ftras">Fecha de traslado <span class="erp-required">*</span></label>
            <input id="ge-ftras" type="date" class="form-control form-control-sm" name="fecha_traslado" [(ngModel)]="fechaTraslado" [min]="fechaEmision"
              [class.is-invalid]="!!err('fecha_traslado')" />
            @if (err('fecha_traslado')) {<div class="invalid-feedback">{{ err('fecha_traslado') }}</div>}
          </div>
          @if (!isGrt && isPublic()) {
          <div class="col-6 col-md-3">
            <label class="form-label small" for="ge-fent">Entrega al transportista @if (deliveryRequired()) {<span class="erp-required">*</span>}</label>
            <input id="ge-fent" type="date" class="form-control form-control-sm" name="fecha_entrega_transportista" [(ngModel)]="fechaEntrega" [min]="fechaTraslado"
              [class.is-invalid]="!!err('fecha_entrega_transportista')" />
            @if (err('fecha_entrega_transportista')) {<div class="invalid-feedback">{{ err('fecha_entrega_transportista') }}</div>}
          </div>
          }
          <div class="col-6 col-md-2">
            <label class="form-label small" for="ge-peso">Peso total <span class="erp-required">*</span></label>
            <input id="ge-peso" type="number" min="0" step="any" class="form-control form-control-sm text-end" name="peso_total" [(ngModel)]="pesoTotal"
              [class.is-invalid]="!!err('peso_total')" />
            @if (err('peso_total')) {<div class="invalid-feedback">{{ err('peso_total') }}</div>}
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small" for="ge-und">Unidad</label>
            <select id="ge-und" class="form-select form-select-sm" name="und_peso_total" [(ngModel)]="undPeso">
              @for (o of weightUnits; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small" for="ge-bultos">Bultos</label>
            <input id="ge-bultos" type="number" min="1" step="1" class="form-control form-control-sm text-end" name="num_bultos" [(ngModel)]="numBultos"
              [class.is-invalid]="!!err('num_bultos')" />
            @if (err('num_bultos')) {<div class="invalid-feedback">{{ err('num_bultos') }}</div>}
          </div>
          @if (!isGrt) {
          <div class="col-12">
            <div class="form-check">
              <input id="ge-m1l" type="checkbox" class="form-check-input" name="m1l" [(ngModel)]="m1l" />
              <label class="form-check-label small" for="ge-m1l">Traslado en vehículo de categoría M1 o L (no exige transportista, vehículo ni conductor)</label>
            </div>
          </div>
          }
        </div>
      </fieldset>

      @if (!isGrt && codTraslado === '03') {
      <app-party-block title="Tercero (venta con entrega a terceros)" [(value)]="tercero" prefix="tercero" [errors]="sub.errors()" [showAddress]="false"
        [tenantId]="ctx().tenantId" [lookup]="true" [disabled]="sub.sending()" hint="Quien recibe los bienes por encargo del comprador (opcional)."></app-party-block>
      }

      @for (side of sides; track side.id) {
      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">{{ side.name }}</legend>
        <!-- El selector toma el ubigeo al crearse: "Usar el domicilio fiscal" lo vuelve a crear. -->
        @for (k of [side.id === 'partida' ? partidaKey : 0]; track k) {
        <app-ubigeo-select [idPrefix]="'ge-' + side.id" [value]="addr[side.id].ubigeo" [error]="err(side.id + '_ubigeo')" (changed)="setUbigeo(side.id, $event)"></app-ubigeo-select>
        }
        <div class="row g-2 mt-1">
          <div class="col-12">
            <label class="form-label small" [for]="'ge-' + side.id + '-dir'">Dirección <span class="erp-required">*</span></label>
            <input [id]="'ge-' + side.id + '-dir'" class="form-control form-control-sm" maxlength="500" [name]="side.id + '_direccion'"
              [(ngModel)]="addr[side.id].direccion" [class.is-invalid]="!!err(side.id + '_direccion')" />
            @if (err(side.id + '_direccion')) {<div class="invalid-feedback">{{ err(side.id + '_direccion') }}</div>}
          </div>
          <div class="col-6 col-md-4">
            <label class="form-label small" [for]="'ge-' + side.id + '-ruc'">RUC del establecimiento</label>
            <input [id]="'ge-' + side.id + '-ruc'" class="form-control form-control-sm" maxlength="11" inputmode="numeric" [name]="side.id + '_ruc'"
              [(ngModel)]="addr[side.id].ruc" [class.is-invalid]="!!err(side.id + '_ruc')" />
            @if (err(side.id + '_ruc')) {<div class="invalid-feedback">{{ err(side.id + '_ruc') }}</div>}
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small" [for]="'ge-' + side.id + '-cod'">Código de local</label>
            <input [id]="'ge-' + side.id + '-cod'" class="form-control form-control-sm" maxlength="5" [name]="side.id + '_cod_local'"
              [(ngModel)]="addr[side.id].codLocal" [class.is-invalid]="!!err(side.id + '_cod_local')" />
            @if (err(side.id + '_cod_local')) {<div class="invalid-feedback">{{ err(side.id + '_cod_local') }}</div>}
          </div>
          <div class="col-12 col-md-5 d-flex align-items-end"><span class="form-text">RUC y código: para traslados entre establecimientos (motivo 04).</span></div>
        </div>
        @if (side.id === 'partida' && ctx().companyAddress) {
        <button type="button" class="btn btn-sm btn-link px-0 mt-1" (click)="useCompanyAddress()">Usar el domicilio fiscal de la empresa</button>
        }
      </fieldset>
      }

      @if (!isGrt && isPublic() && !m1l) {
      <app-party-block title="Transportista (transporte público)" [(value)]="transportista" prefix="transportista" [errors]="sub.errors()" [docTypes]="rucOnly"
        [showAddress]="false" nameLabel="Razón social" [tenantId]="ctx().tenantId" [lookup]="true" [disabled]="sub.sending()"
        hint="Empresa de transporte distinta del emisor."></app-party-block>
      <div class="row g-2 mb-3" style="margin-top: -0.5rem">
        <div class="col-md-4">
          <label class="form-label small" for="ge-mtc">Registro MTC del transportista</label>
          <input id="ge-mtc" class="form-control form-control-sm" maxlength="20" name="nro_mtc" [(ngModel)]="nroMtc" [class.is-invalid]="!!err('transportista.nro_mtc')" />
          @if (err('transportista.nro_mtc')) {<div class="invalid-feedback">{{ err('transportista.nro_mtc') }}</div>}
        </div>
      </div>
      }

      @if (needsVehicle()) {
      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">Vehículo y conductores</legend>
        @if (err('vehiculo') || err('conductor') || err('conductores')) {
        <div class="text-danger small mb-2">{{ err('vehiculo') }} {{ err('conductor') }} {{ err('conductores') }}</div>
        }
        <div class="row g-2 mb-2">
          <div class="col-md-3">
            <label class="form-label small" for="ge-placa">Placa principal <span class="erp-required">*</span></label>
            <input id="ge-placa" class="form-control form-control-sm text-uppercase" maxlength="8" name="placa" [ngModel]="placa"
              (ngModelChange)="placa = plate($event)" [class.is-invalid]="!!err('vehiculo.placa')" />
            @if (err('vehiculo.placa')) {<div class="invalid-feedback">{{ err('vehiculo.placa') }}</div>}
          </div>
          @if (isGrt) {
          <div class="col-md-3">
            <label class="form-label small" for="ge-circ">Tarjeta de circulación / TUCE</label>
            <input id="ge-circ" class="form-control form-control-sm text-uppercase" maxlength="15" name="nro_circulacion" [ngModel]="nroCirculacion"
              (ngModelChange)="nroCirculacion = alnum($event)" [class.is-invalid]="!!err('vehiculo.nro_circulacion')" />
            @if (err('vehiculo.nro_circulacion')) {<div class="invalid-feedback">{{ err('vehiculo.nro_circulacion') }}</div>}
          </div>
          <div class="col-md-3">
            <label class="form-label small" for="ge-tuc">Certificado de habilitación (TUC)</label>
            <input id="ge-tuc" class="form-control form-control-sm text-uppercase" maxlength="15" name="tuc" [ngModel]="tuc" (ngModelChange)="tuc = alnum($event)"
              [class.is-invalid]="!!err('vehiculo.tuc')" />
            @if (err('vehiculo.tuc')) {<div class="invalid-feedback">{{ err('vehiculo.tuc') }}</div>}
          </div>
          }
          <div class="col-md-3">
            <span class="form-label small d-block">Placas secundarias (máx. 2)</span>
            @for (s of secondary; track $index; let j = $index) {
            <div class="input-group input-group-sm mb-1">
              <input class="form-control text-uppercase" maxlength="8" [attr.aria-label]="'Placa secundaria ' + (j + 1)" [name]="'ge-sec-' + j" [ngModel]="s"
                (ngModelChange)="secondary[j] = plate($event)" [class.is-invalid]="!!err('vehiculo.secundarios.' + j + '.placa')" />
              <button type="button" class="btn btn-outline-danger" (click)="secondary.splice(j, 1)" [attr.aria-label]="'Quitar la placa ' + (j + 1)"><em class="feather icon-trash-2"></em></button>
            </div>
            }
            @if (secondary.length < 2) {<button type="button" class="btn btn-sm btn-link px-0" (click)="secondary.push('')">Agregar placa</button>}
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-top small mb-2">
            <thead>
              <tr><th scope="col">Rol</th><th scope="col">Documento</th><th scope="col">Número</th><th scope="col">Nombres</th><th scope="col">Apellidos</th>
                <th scope="col">Licencia</th><th scope="col"><span class="visually-hidden">Quitar</span></th></tr>
            </thead>
            <tbody>
              @for (d of drivers; track d.key; let i = $index) {
              <tr>
                <td class="pt-2">{{ i === 0 ? 'Principal' : 'Secundario' }}</td>
                <td>
                  <select class="form-select form-select-sm" [attr.aria-label]="'Documento del conductor ' + (i + 1)" [name]="'drv-td-' + d.key" [(ngModel)]="d.tipo_doc">
                    @for (o of driverDocTypes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
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
                  <button type="button" class="btn btn-sm btn-link text-danger px-1" (click)="drivers.splice(i, 1)" [attr.aria-label]="'Quitar el conductor ' + (i + 1)"
                    title="Quitar"><em class="feather icon-trash-2"></em></button>
                </td>
              </tr>
              } @empty {
              <tr><td colspan="7" class="text-muted">Sin conductores (se exige al menos uno).</td></tr>
              }
            </tbody>
          </table>
        </div>
        <button type="button" class="btn btn-sm btn-outline-primary" (click)="addDriver()"><em class="feather icon-plus me-1"></em>Agregar conductor</button>
      </fieldset>
      }

      @if (isGrt || relatedNeeded() || related.length) {
      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">Documentos relacionados @if (isGrt || relatedNeeded()) {<span class="erp-required">*</span>}</legend>
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
        <button type="button" class="btn btn-sm btn-outline-primary" [disabled]="related.length >= 5" (click)="addRelated()"><em class="feather icon-plus me-1"></em>Agregar documento</button>
        <span class="form-text ms-2">Máximo 5. {{ isGrt ? 'Factura, boleta o guía llevan el RUC de su emisor.' : 'Los motivos 08, 09 y 19 exigen una DAM, DS o manifiesto.' }}</span>
      </fieldset>
      } @else {
      <button type="button" class="btn btn-sm btn-link px-0 mb-3" (click)="addRelated()"><em class="feather icon-plus me-1"></em>Agregar documentos relacionados</button>
      }

      @if (isGrt) {
      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">Subcontratación y flete</legend>
        <div class="row g-2">
          <div class="col-md-4">
            <label class="form-label small" for="ge-sub-ruc">RUC del subcontratador</label>
            <input id="ge-sub-ruc" class="form-control form-control-sm" maxlength="11" inputmode="numeric" name="sub_ruc" [(ngModel)]="subRuc"
              [class.is-invalid]="!!err('datos_subcontratador.num_doc')" />
            @if (err('datos_subcontratador.num_doc')) {<div class="invalid-feedback">{{ err('datos_subcontratador.num_doc') }}</div>}
          </div>
          <div class="col-md-8">
            <label class="form-label small" for="ge-sub-rs">Razón social del subcontratador</label>
            <input id="ge-sub-rs" class="form-control form-control-sm" maxlength="250" name="sub_rs" [(ngModel)]="subRazon"
              [class.is-invalid]="!!err('datos_subcontratador.razon_social')" />
            @if (err('datos_subcontratador.razon_social')) {<div class="invalid-feedback">{{ err('datos_subcontratador.razon_social') }}</div>}
          </div>
          <div class="col-md-4">
            <label class="form-label small" for="ge-pag">Quién paga el flete @if (subRuc.trim()) {<span class="erp-required">*</span>}</label>
            <select id="ge-pag" class="form-select form-select-sm" name="pagador" [(ngModel)]="pagadorTipo" [class.is-invalid]="!!err('datos_pagador_flete') || !!err('datos_pagador_flete.tipo')">
              <option [ngValue]="''">Sin indicar</option>
              @for (o of payerTypes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
            @if (err('datos_pagador_flete') || err('datos_pagador_flete.tipo')) {<div class="invalid-feedback">{{ err('datos_pagador_flete') || err('datos_pagador_flete.tipo') }}</div>}
          </div>
          @if (pagadorTipo === 'tercero') {
          <div class="col-md-3">
            <label class="form-label small" for="ge-pag-doc">RUC / DNI del tercero <span class="erp-required">*</span></label>
            <input id="ge-pag-doc" class="form-control form-control-sm" maxlength="15" name="pag_doc" [(ngModel)]="pagadorDoc"
              [class.is-invalid]="!!err('datos_pagador_flete.num_doc')" />
            @if (err('datos_pagador_flete.num_doc')) {<div class="invalid-feedback">{{ err('datos_pagador_flete.num_doc') }}</div>}
          </div>
          <div class="col-md-5">
            <label class="form-label small" for="ge-pag-rs">Razón social del tercero <span class="erp-required">*</span></label>
            <input id="ge-pag-rs" class="form-control form-control-sm" maxlength="250" name="pag_rs" [(ngModel)]="pagadorRazon"
              [class.is-invalid]="!!err('datos_pagador_flete.razon_social')" />
            @if (err('datos_pagador_flete.razon_social')) {<div class="invalid-feedback">{{ err('datos_pagador_flete.razon_social') }}</div>}
          </div>
          }
        </div>
      </fieldset>
      }

      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto px-2 fs-6 mb-0">Bienes</legend>
        <app-item-grid [(items)]="items" [fields]="itemFields" [errors]="sub.errors()" [disabled]="sub.sending()"></app-item-grid>
      </fieldset>

      <div class="row g-2">
        <div class="col-md-8">
          <label class="form-label small" for="ge-obs">Observación</label>
          <textarea id="ge-obs" class="form-control form-control-sm" rows="2" maxlength="500" name="observacion" [(ngModel)]="observacion"></textarea>
        </div>
        <div class="col-md-4">
          <label class="form-label small" for="ge-envio">Envío a SUNAT</label>
          <select id="ge-envio" class="form-select form-select-sm" name="envio" [(ngModel)]="auto">
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
export class GuideEmitFormComponent implements OnInit {
  private service = inject(EmissionService);

  readonly ctx = input.required<EmissionContext>();
  readonly type = input.required<EmitType>();
  readonly issued = output<IssueOutcome>();

  readonly sub = new EmissionSubmitter(this.service, (k) => KNOWN_FIELDS.includes(k) || KNOWN_PREFIXES.some((p) => k === p || k.startsWith(`${p}.`)));
  readonly reasons = TRANSFER_REASON_OPTIONS;
  readonly modes = TRANSFER_MODE_OPTIONS;
  readonly weightUnits = WEIGHT_UNIT_OPTIONS;
  readonly senderTypes = PARTY_DOC_OPTIONS.filter((o) => o.id === '1' || o.id === '6');
  readonly rucOnly = PARTY_DOC_OPTIONS.filter((o) => o.id === '6');
  readonly driverDocTypes = PARTY_DOC_OPTIONS.filter((o) => ['1', '4', '7', '6'].includes(o.id));
  readonly payerTypes = FREIGHT_PAYER_OPTIONS;
  readonly itemFields = GUIDE_EMIT_ITEM_FIELDS;
  readonly today = limaTodayYmd();
  readonly sides: { id: 'partida' | 'llegada'; name: string }[] = [{ id: 'partida', name: 'Punto de partida' }, { id: 'llegada', name: 'Punto de llegada' }];
  readonly driverFields: { id: DriverField; name: string; max: number }[] = [
    { id: 'num_doc', name: 'Número', max: 15 }, { id: 'nombres', name: 'Nombres', max: 100 }, { id: 'apellidos', name: 'Apellidos', max: 100 },
    { id: 'licencia', name: 'Licencia', max: 20 }
  ];

  isGrt = false;
  relatedTypes: Option<string>[] = GUIDE_RELATED_DOC_OPTIONS;
  seriesList: Option<string>[] = [];
  serie = '';
  fechaEmision = limaTodayYmd();
  fechaTraslado = limaTodayYmd();
  fechaEntrega = '';
  destinatario: PartyValue = emptyParty('6');
  remitente: PartyValue = emptyParty('6');
  tercero: PartyValue = emptyParty('6');
  codTraslado = '01';
  modTraslado = '02';
  pesoTotal: number | null = null;
  undPeso = 'KGM';
  numBultos: number | null = null;
  m1l = false;
  addr: Record<'partida' | 'llegada', Place> = {
    partida: { ubigeo: '', direccion: '', ruc: '', codLocal: '' }, llegada: { ubigeo: '', direccion: '', ruc: '', codLocal: '' }
  };
  transportista: PartyValue = emptyParty('6');
  nroMtc = '';
  placa = '';
  nroCirculacion = '';
  tuc = '';
  secondary: string[] = [];
  drivers: Driver[] = [];
  related: RelatedDoc[] = [];
  subRuc = '';
  subRazon = '';
  pagadorTipo = '';
  pagadorDoc = '';
  pagadorRazon = '';
  items: EmissionItem[] = [emptyItem()];
  observacion = '';
  auto = true;
  motivo = '';
  partidaKey = 0;

  ngOnInit(): void {
    this.isGrt = this.type().id === 'guias-remision-transportista';
    this.relatedTypes = this.isGrt ? RELATED_DOC_OPTIONS : GUIDE_RELATED_DOC_OPTIONS;
    this.seriesList = seriesOptions(this.ctx(), this.type().seriesType);
    this.serie = this.seriesList[0]?.id ?? '';
    this.useCompanyAddress();
    if (this.isGrt) {
      this.related = [{ key: key('rel'), tipo_codigo: '', numero: '', ruc_emisor: '' }];
    }
    this.addDriver();
  }

  err(k: string): string {
    return this.sub.errors()[k] ?? '';
  }

  /** La API valida `conductores.N.campo` (lista) o `conductor.campo`. */
  dErr(i: number, f: string): string {
    return this.err(`conductores.${i}.${f}`) || (i === 0 ? this.err(`conductor.${f}`) : '');
  }

  rErr(i: number, f: string): string {
    return this.err(`doc_relacionado.${i}.${f}`);
  }

  plate(v: unknown): string {
    return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8);
  }

  alnum(v: unknown): string {
    return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 15);
  }

  isPublic(): boolean {
    return this.modTraslado === '01';
  }

  needsVehicle(): boolean {
    return this.isGrt || (!this.m1l && this.modTraslado === '02');
  }

  relatedNeeded(): boolean {
    return !this.isGrt && ['08', '09', '19'].includes(this.codTraslado);
  }

  /** Desde el 2026-06-01, la GRE remitente con transporte público exige la fecha de entrega al transportista. */
  deliveryRequired(): boolean {
    return this.isPublic() && !this.m1l && this.fechaEmision >= '2026-06-01';
  }

  destinatarioHint(): string {
    if (this.isGrt) {
      return '';
    }
    if (['02', '04', '07'].includes(this.codTraslado)) {
      return `Con el motivo ${this.codTraslado}, el destinatario es la misma empresa (RUC ${this.ctx().ruc}).`;
    }
    return ['06', '17', '19'].includes(this.codTraslado) ? `Con el motivo ${this.codTraslado}, el destinatario debe tener RUC.` : '';
  }

  useCompanyAddress(): void {
    if (this.ctx().companyAddress) {
      this.addr.partida = { ...this.addr.partida, direccion: this.ctx().companyAddress, ubigeo: /^\d{6}$/.test(this.ctx().companyUbigeo) ? this.ctx().companyUbigeo : this.addr.partida.ubigeo };
      this.partidaKey++;
    }
  }

  setUbigeo(side: 'partida' | 'llegada', choice: UbigeoChoice | null): void {
    this.addr[side] = { ...this.addr[side], ubigeo: choice?.ubigeo ?? '' };
  }

  addDriver(): void {
    this.drivers.push({ key: key('drv'), tipo_doc: '1', num_doc: '', nombres: '', apellidos: '', licencia: '' });
  }

  addRelated(): void {
    this.related.push({ key: key('rel'), tipo_codigo: '', numero: '', ruc_emisor: '' });
  }

  build(): { body: Json; errors: Record<string, string> } {
    const e: Record<string, string> = {};
    const text = (v: string) => v.trim();
    if (!this.serie) {
      e['serie'] = 'Elija la serie.';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.fechaEmision)) {
      e['fecha_emision'] = 'Indique la fecha de emisión.';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.fechaTraslado)) {
      e['fecha_traslado'] = 'Indique la fecha de traslado.';
    }
    Object.assign(e, partyErrors(this.destinatario, 'destinatario'));
    if (!((this.pesoTotal ?? 0) > 0)) {
      e['peso_total'] = 'El peso total debe ser mayor que 0.';
    }
    if (this.numBultos != null && String(this.numBultos) !== '' && !(Number.isInteger(Number(this.numBultos)) && Number(this.numBultos) >= 1)) {
      e['num_bultos'] = 'Número entero de 1 o más.';
    }
    const b: Json = {
      serie: this.serie, fecha_emision: this.fechaEmision, destinatario: partyToBody(this.destinatario, false), fecha_traslado: this.fechaTraslado,
      peso_total: Number(this.pesoTotal ?? 0), und_peso_total: this.undPeso
    };
    if (this.isGrt) {
      b['tipo_documento'] = '31';
    } else {
      b['tipo_documento'] = '09';
      b['cod_traslado'] = this.codTraslado;
      b['mod_traslado'] = this.modTraslado;
      if (this.m1l) {
        b['indicadores'] = [GUIDE_M1L_INDICATOR];
      }
    }
    if (this.numBultos != null && String(this.numBultos) !== '') {
      b['num_bultos'] = Number(this.numBultos);
    }
    this.sides.forEach((side) => {
      const a = this.addr[side.id];
      if (!/^\d{6}$/.test(a.ubigeo)) {
        e[`${side.id}_ubigeo`] = 'Elija el distrito (ubigeo de 6 dígitos).';
      }
      if (!text(a.direccion)) {
        e[`${side.id}_direccion`] = 'Indique la dirección.';
      }
      if (text(a.ruc) && !/^\d{11}$/.test(text(a.ruc))) {
        e[`${side.id}_ruc`] = 'El RUC tiene 11 dígitos.';
      }
      b[`${side.id}_ubigeo`] = a.ubigeo;
      b[`${side.id}_direccion`] = text(a.direccion);
      if (text(a.ruc)) {
        b[`${side.id}_ruc`] = text(a.ruc);
      }
      if (text(a.codLocal)) {
        b[`${side.id}_cod_local`] = text(a.codLocal);
      }
    });
    if (!this.isGrt && this.isPublic() && !this.m1l) {
      Object.assign(e, partyErrors(this.transportista, 'transportista', ['6']));
      if (this.transportista.num_doc.trim() === this.ctx().ruc) {
        e['transportista.num_doc'] = 'El transportista debe ser una empresa distinta del emisor (si traslada la misma empresa, use transporte privado).';
      }
      const t: Json = partyToBody(this.transportista, false);
      if (text(this.nroMtc)) {
        t['nro_mtc'] = text(this.nroMtc);
      }
      b['transportista'] = t;
      if (this.deliveryRequired() && !this.fechaEntrega) {
        e['fecha_entrega_transportista'] = 'Obligatoria con transporte público desde el 2026-06-01.';
      }
      if (this.fechaEntrega) {
        if (this.fechaEntrega < this.fechaTraslado) {
          e['fecha_entrega_transportista'] = 'No puede ser anterior a la fecha de traslado.';
        }
        b['fecha_entrega_transportista'] = this.fechaEntrega;
      }
    }
    if (!this.isGrt && this.codTraslado === '03' && (this.tercero.num_doc.trim() || this.tercero.razon_social.trim())) {
      Object.assign(e, partyErrors(this.tercero, 'tercero'));
      b['tercero'] = partyToBody(this.tercero, false);
    }
    if (this.needsVehicle()) {
      if (!this.placa) {
        e['vehiculo.placa'] = 'Indique la placa del vehículo.';
      } else if (!PLATE_RE.test(this.placa)) {
        e['vehiculo.placa'] = 'Placa de 6 a 8 letras o números, sin guion.';
      }
      const v: Json = { placa: this.placa };
      if (this.isGrt && this.nroCirculacion) {
        if (!ALNUM_RE.test(this.nroCirculacion)) {
          e['vehiculo.nro_circulacion'] = 'De 10 a 15 letras o números.';
        }
        v['nro_circulacion'] = this.nroCirculacion;
      }
      if (this.isGrt && this.tuc) {
        if (!ALNUM_RE.test(this.tuc)) {
          e['vehiculo.tuc'] = 'De 10 a 15 letras o números.';
        }
        v['tuc'] = this.tuc;
      }
      const secondary = this.secondary.filter(Boolean);
      secondary.forEach((p, j) => {
        if (!PLATE_RE.test(p)) {
          e[`vehiculo.secundarios.${j}.placa`] = 'Placa de 6 a 8 caracteres.';
        }
      });
      if (secondary.length) {
        v['secundarios'] = secondary.map((p) => ({ placa: p }));
      }
      b['vehiculo'] = v;
      if (!this.drivers.length) {
        e['conductor'] = 'Agregue al menos un conductor.';
      }
      this.drivers.forEach((d, i) => {
        this.driverFields.forEach((f) => {
          if (!d[f.id].trim()) {
            e[`conductores.${i}.${f.id}`] = 'Obligatorio.';
          }
        });
      });
      b['conductores'] = this.drivers.map((d, i) => ({
        tipo: i === 0 ? 'Principal' : 'Secundario', tipo_doc: d.tipo_doc, num_doc: d.num_doc.trim(), nombres: d.nombres.trim(), apellidos: d.apellidos.trim(),
        licencia: d.licencia.trim().toUpperCase()
      }));
    }
    if (this.isGrt) {
      Object.assign(e, partyErrors(this.remitente, 'remitente', ['1', '6']));
      if (this.remitente.num_doc.trim() === this.ctx().ruc) {
        e['remitente.num_doc'] = 'El remitente no puede ser la misma empresa transportista.';
      }
      b['remitente'] = partyToBody(this.remitente, false);
    }
    const related = this.related.filter((r) => r.tipo_codigo || r.numero.trim() || r.ruc_emisor.trim());
    if ((this.isGrt || this.relatedNeeded()) && !related.length) {
      e['doc_relacionado'] = this.isGrt ? 'La guía transportista requiere al menos un documento relacionado.' : 'Este motivo exige un documento relacionado (DAM, DS o manifiesto).';
    }
    related.forEach((r) => {
      const i = this.related.indexOf(r);
      if (!r.tipo_codigo) {
        e[`doc_relacionado.${i}.tipo_codigo`] = 'Elija el tipo.';
      }
      if (!r.numero.trim()) {
        e[`doc_relacionado.${i}.numero`] = 'Indique el número.';
      }
      if (this.isGrt && ['01', '03', '09', '31'].includes(r.tipo_codigo) && !r.ruc_emisor.trim()) {
        e[`doc_relacionado.${i}.ruc_emisor`] = 'Indique el RUC del emisor.';
      } else if (r.ruc_emisor.trim() && rucError(r.ruc_emisor.trim())) {
        e[`doc_relacionado.${i}.ruc_emisor`] = rucError(r.ruc_emisor.trim());
      }
    });
    if (related.length) {
      b['doc_relacionado'] = related.map((r) => {
        const x: Json = { tipo_codigo: r.tipo_codigo, numero: r.numero.trim() };
        if (r.ruc_emisor.trim()) {
          x['ruc_emisor'] = r.ruc_emisor.trim();
        }
        return x;
      });
    }
    if (this.isGrt) {
      if (this.subRuc.trim() || this.subRazon.trim()) {
        if (!/^\d{11}$/.test(this.subRuc.trim())) {
          e['datos_subcontratador.num_doc'] = 'RUC de 11 dígitos.';
        }
        if (!this.subRazon.trim()) {
          e['datos_subcontratador.razon_social'] = 'Indique la razón social.';
        }
        b['datos_subcontratador'] = { num_doc: this.subRuc.trim(), razon_social: this.subRazon.trim() };
        if (!this.pagadorTipo) {
          e['datos_pagador_flete'] = 'Con transporte subcontratado, indique quién paga el flete.';
        }
      }
      if (this.pagadorTipo) {
        const p: Json = { tipo: this.pagadorTipo };
        if (this.pagadorTipo === 'tercero') {
          if (!this.pagadorDoc.trim()) {
            e['datos_pagador_flete.num_doc'] = 'Indique el documento del tercero.';
          }
          if (!this.pagadorRazon.trim()) {
            e['datos_pagador_flete.razon_social'] = 'Indique la razón social del tercero.';
          }
          p['tipo_doc'] = this.pagadorDoc.trim().length === 11 ? '6' : '1';
          p['num_doc'] = this.pagadorDoc.trim();
          p['razon_social'] = this.pagadorRazon.trim();
        }
        b['datos_pagador_flete'] = p;
      }
    }
    Object.assign(e, itemErrors(this.items, this.itemFields));
    b['items'] = this.items.map((i) => itemToBody(i, this.itemFields));
    if (this.observacion.trim()) {
      b['observacion'] = this.observacion.trim();
    }
    b['enviar_automatico'] = this.auto;
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
