import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { serverMessages } from '@shared/functions/list-helpers';
import { PermissionService } from '@shared/service/permission.service';
import { PlanRow } from '../../../platform/models/platform.models';
import { PlanService } from '../../../platform/services/platform.services';
import { EMISSION_MODE_OPTIONS, ENVIRONMENT_OPTIONS, EmissionMode, Environment, PERM, PLAN_OPTIONS, PlanCode, planName, quotaLimitText } from '../../models/sunat.models';
import { Json, arr, obj, str } from '../../models/tenant-views.models';
import {
  BankAccount, CreateTenantBody, CreateTenantResult, DigitalWallet, EMAIL_RE, MAX_REPEATED, NRUS_OPTIONS, OneTimeCredentials, PHONE_RE,
  RucLookupResult, TAX_REGIME_OPTIONS, TaxRegime, TenantDataBody, UbigeoChoice, WALLET_OPTIONS, WalletType, fieldErrors, rucError, textOrNull
} from '../../models/tenant-admin.models';
import { TenantAdminService } from '../../services/tenant-admin.service';
import { TenantViewsService } from '../../services/tenant-views.service';
import { UbigeoSelectComponent } from '../common/ubigeo-select.component';

interface BankRow {
  banco: string;
  tipo_cuenta: string;
  moneda: 'PEN' | 'USD';
  numero: string;
  cci: string;
  titular: string;
}

interface WalletRow {
  tipo: WalletType;
  numero: string;
  titular: string;
}

interface FormModel {
  ruc: string;
  razon_social: string;
  nombre_comercial: string;
  direccion: string;
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  telefonos: string[];
  emails: string[];
  cuentas: BankRow[];
  billeteras: WalletRow[];
  mensaje_agradecimiento: string;
  mensaje_promocional: string;
  url_webhook: string;
  entorno: Environment;
  tax_regime: TaxRegime;
  igv_rate_override: string;
  nrus_categoria: string;
  plan: PlanCode;
  max_documents_month: string;
  emission_mode: '' | EmissionMode;
  series_por_defecto: boolean;
  motivo: string;
}

/** Campos que el formulario muestra junto a su control; los demás errores de la API se listan al final. */
const SHOWN_KEYS = new Set([
  'ruc', 'razon_social', 'nombre_comercial', 'direccion', 'ubigeo', 'departamento', 'provincia', 'distrito', 'telefonos', 'emails',
  'cuentas_bancarias', 'billeteras_digitales', 'mensaje_agradecimiento', 'mensaje_promocional', 'url_webhook', 'entorno', 'tax_regime',
  'igv_rate_override', 'nrus_categoria', 'plan', 'max_documents_month', 'emission_mode', 'series_por_defecto', 'motivo'
]);
const SHOWN_PATTERNS = [/^(telefonos|emails)\.\d+$/, /^cuentas_bancarias\.\d+\.(banco|tipo_cuenta|moneda|numero|cci|titular)$/,
  /^billeteras_digitales\.\d+\.(tipo|numero|titular)$/];

const TAX_REGIMES = TAX_REGIME_OPTIONS.map((o) => o.id);

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function emptyModel(): FormModel {
  return {
    ruc: '', razon_social: '', nombre_comercial: '', direccion: '', ubigeo: '', departamento: '', provincia: '', distrito: '',
    telefonos: [''], emails: [''], cuentas: [], billeteras: [], mensaje_agradecimiento: '', mensaje_promocional: '', url_webhook: '',
    entorno: 'beta', tax_regime: 'general', igv_rate_override: '', nrus_categoria: '', plan: 'free', max_documents_month: '',
    emission_mode: '', series_por_defecto: true, motivo: ''
  };
}

/** El recurso `GET tenants/{id}/empresa` (§9.5, snake_case) como modelo del formulario. */
function fromResource(d: Json): FormModel {
  const m = emptyModel();
  const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  const regime = str(d['tax_regime']) as TaxRegime;
  return {
    ...m,
    ruc: str(d['ruc']), razon_social: str(d['razon_social']), nombre_comercial: str(d['nombre_comercial']), direccion: str(d['direccion']),
    ubigeo: str(d['ubigeo']), departamento: str(d['departamento']), provincia: str(d['provincia']), distrito: str(d['distrito']),
    telefonos: list(d['telefonos']), emails: list(d['emails']),
    cuentas: arr(d['cuentas_bancarias']).map((b) => ({
      banco: str(b['banco']), tipo_cuenta: str(b['tipo_cuenta']), moneda: str(b['moneda']) === 'USD' ? 'USD' : 'PEN', numero: str(b['numero']),
      cci: str(b['cci']), titular: str(b['titular'])
    })),
    billeteras: arr(d['billeteras_digitales']).map((w) => ({
      tipo: (WALLET_OPTIONS.some((o) => o.id === w['tipo']) ? w['tipo'] : 'otro') as WalletType, numero: str(w['numero']), titular: str(w['titular'])
    })),
    mensaje_agradecimiento: str(d['mensaje_agradecimiento']), mensaje_promocional: str(d['mensaje_promocional']),
    // `GET empresa` lo trae como `webhook_url`; `PUT` lo recibe como `url_webhook` (§11.3).
    url_webhook: str(d['webhook_url']),
    entorno: str(d['entorno']) === 'production' ? 'production' : 'beta',
    tax_regime: TAX_REGIMES.includes(regime) ? regime : 'general',
    igv_rate_override: str(d['igv_rate_override']), nrus_categoria: str(d['nrus_categoria'])
  };
}

/** Campos de datos (los de `PUT /api/v1/empresa`) normalizados: el alta omite los vacíos y la edición compara con lo guardado. */
function dataBody(m: FormModel): Required<Omit<TenantDataBody, 'motivo'>> {
  const rus = m.tax_regime === 'rus';
  return {
    razon_social: text(m.razon_social), nombre_comercial: textOrNull(m.nombre_comercial), direccion: text(m.direccion), ubigeo: text(m.ubigeo),
    departamento: textOrNull(m.departamento), provincia: textOrNull(m.provincia), distrito: textOrNull(m.distrito),
    telefonos: m.telefonos.map(text).filter(Boolean), emails: m.emails.map(text).filter(Boolean),
    cuentas_bancarias: m.cuentas.filter((c) => text(c.banco) || text(c.numero)).map((c): BankAccount => ({
      banco: text(c.banco), tipo_cuenta: textOrNull(c.tipo_cuenta), moneda: c.moneda, numero: text(c.numero), cci: textOrNull(c.cci),
      titular: textOrNull(c.titular)
    })),
    billeteras_digitales: m.billeteras.filter((w) => text(w.numero)).map((w): DigitalWallet => ({
      tipo: w.tipo, numero: text(w.numero), titular: textOrNull(w.titular)
    })),
    mensaje_agradecimiento: textOrNull(m.mensaje_agradecimiento), mensaje_promocional: textOrNull(m.mensaje_promocional),
    url_webhook: textOrNull(m.url_webhook), entorno: m.entorno, tax_regime: m.tax_regime,
    igv_rate_override: !rus && text(m.igv_rate_override) ? Number(m.igv_rate_override) : null,
    nrus_categoria: rus && text(m.nrus_categoria) ? Number(m.nrus_categoria) : null
  };
}

/**
 * Alta (`POST tenants`) o edición (`PUT tenants/{id}`) de una empresa, con `Admin.Tenants.Edit` (§11.3). Mismos campos que el
 * formulario de la referencia Laravel que acepta el contrato: identidad (RUC con módulo 11 y "Consultar" con
 * `GET tenants/ruc-lookup`, solo al pulsar), ubicación con ubigeo del catálogo (§11.9), contacto, régimen e IGV, entorno,
 * comercial (webhook, mensajes, cuentas y billeteras) y, solo en el alta, plan / cupo / modo de emisión / series por defecto.
 * Nunca pide credenciales, certificado ni logo (van por sus endpoints). La edición se llena con `GET tenants/{id}/empresa` y
 * envía solo lo que cambió. Errores por campo (`errors[].propertyName`) junto al campo. Alta: cierra con
 * `OneTimeCredentials` (para el modal de una sola vez, no se guarda); edición: cierra con `true`.
 */
@Component({
  selector: 'app-tenant-form',
  imports: [FormsModule, UbigeoSelectComponent],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather {{ editing ? 'icon-edit' : 'icon-plus-circle' }}"></em>{{ editing ? 'Editar datos de la empresa' : 'Nueva empresa' }}</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      @if (loading()) {
      <div class="erp-loading" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Cargando…</div>
      } @else if (loadError()) {
      <div class="alert alert-warning mb-0">{{ loadError() }}</div>
      } @else {
      <form class="erp-form" novalidate (ngSubmit)="save()">
        <p class="form-text mt-0 mb-3">Los campos marcados con <span class="erp-required">*</span> son obligatorios.
          @if (editing) {Plan, cupo y modo de emisión se cambian con "Cambiar plan"; el estado con Suspender / Activar; el logo y las credenciales con sus botones.}
          @else {El certificado, la clave SOL, el GRE y el logo se cargan después, en la página de la empresa.}</p>

        <section class="erp-form-section">
          <h6 class="erp-form-section__title"><em class="feather icon-hash"></em>Identidad</h6>
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label" for="tf-ruc">RUC <span class="erp-required">*</span></label>
              <div class="input-group has-validation">
                <input id="tf-ruc" class="form-control" name="ruc" [ngModel]="m.ruc" (ngModelChange)="m.ruc = digits($event, 11)" maxlength="11"
                  inputmode="numeric" autocomplete="off" [readonly]="editing" [class.is-invalid]="!!err('ruc')" placeholder="20512345678" />
                @if (!editing) {
                <button type="button" class="btn btn-outline-primary" (click)="lookup()" [disabled]="lookingUp() || m.ruc.length !== 11"
                  title="Traer razón social y dirección de SUNAT con el token de consulta global">
                  @if (lookingUp()) {<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>} @else {<em class="feather icon-search me-1"></em>}Consultar
                </button>
                }
                @if (err('ruc')) {<div class="invalid-feedback">{{ err('ruc') }}</div>}
              </div>
              @if (lookupMsg(); as lm) {
              <div class="small mt-1" [class.text-success]="lm.ok" [class.text-danger]="!lm.ok">{{ lm.text }}</div>
              } @else if (!editing) {
              <div class="form-text">11 dígitos (10, 15, 16, 17 o 20). "Consultar" completa la razón social y la dirección.</div>
              } @else {
              <div class="form-text">El RUC de una empresa no se puede cambiar.</div>
              }
            </div>
            <div class="col-md-8">
              <label class="form-label" for="tf-rs">Razón social <span class="erp-required">*</span></label>
              <input id="tf-rs" class="form-control" name="razon_social" [(ngModel)]="m.razon_social" maxlength="255" [class.is-invalid]="!!err('razon_social')"
                placeholder="EMPRESA EJEMPLO S.A.C." />
              @if (err('razon_social')) {<div class="invalid-feedback">{{ err('razon_social') }}</div>}
            </div>
            <div class="col-12">
              <label class="form-label" for="tf-nc">Nombre comercial</label>
              <input id="tf-nc" class="form-control" name="nombre_comercial" [(ngModel)]="m.nombre_comercial" maxlength="255"
                [class.is-invalid]="!!err('nombre_comercial')" placeholder="Opcional" />
              @if (err('nombre_comercial')) {<div class="invalid-feedback">{{ err('nombre_comercial') }}</div>}
            </div>
          </div>
        </section>

        <section class="erp-form-section">
          <h6 class="erp-form-section__title"><em class="feather icon-map-pin"></em>Ubicación y contacto</h6>
          <div class="row g-3">
            <div class="col-12">
              <label class="form-label" for="tf-dir">Dirección fiscal <span class="erp-required">*</span></label>
              <input id="tf-dir" class="form-control" name="direccion" [(ngModel)]="m.direccion" maxlength="500" [class.is-invalid]="!!err('direccion')"
                placeholder="AV. AREQUIPA 1234, SAN ISIDRO" />
              @if (err('direccion')) {<div class="invalid-feedback">{{ err('direccion') }}</div>}
            </div>
            <div class="col-12">
              <app-ubigeo-select idPrefix="tf-ubigeo" [value]="m.ubigeo" [error]="err('ubigeo') || err('departamento') || err('provincia') || err('distrito')"
                (changed)="onUbigeo($event)"></app-ubigeo-select>
            </div>
            <div class="col-md-6">
              <span class="form-label d-block">Teléfonos</span>
              @for (t of m.telefonos; track $index; let i = $index) {
              <div class="input-group mb-2 has-validation">
                <input class="form-control" [name]="'tel-' + i" [(ngModel)]="m.telefonos[i]" maxlength="20" inputmode="tel" placeholder="014445555"
                  [attr.aria-label]="'Teléfono ' + (i + 1)" [class.is-invalid]="!!err('telefonos.' + i)" />
                <button type="button" class="btn btn-outline-secondary" (click)="m.telefonos.splice(i, 1)" aria-label="Quitar teléfono"><em class="feather icon-x"></em></button>
                @if (err('telefonos.' + i)) {<div class="invalid-feedback">{{ err('telefonos.' + i) }}</div>}
              </div>
              }
              @if (m.telefonos.length < max) {
              <button type="button" class="btn btn-link btn-sm p-0" (click)="m.telefonos.push('')"><em class="feather icon-plus me-1"></em>Añadir teléfono</button>
              }
              @if (err('telefonos')) {<div class="small text-danger">{{ err('telefonos') }}</div>}
            </div>
            <div class="col-md-6">
              <span class="form-label d-block">Correos</span>
              @for (e of m.emails; track $index; let i = $index) {
              <div class="input-group mb-2 has-validation">
                <input type="email" class="form-control" [name]="'mail-' + i" [(ngModel)]="m.emails[i]" maxlength="100" placeholder="facturas@empresa.pe"
                  [attr.aria-label]="'Correo ' + (i + 1)" [class.is-invalid]="!!err('emails.' + i)" />
                <button type="button" class="btn btn-outline-secondary" (click)="m.emails.splice(i, 1)" aria-label="Quitar correo"><em class="feather icon-x"></em></button>
                @if (err('emails.' + i)) {<div class="invalid-feedback">{{ err('emails.' + i) }}</div>}
              </div>
              }
              @if (m.emails.length < max) {
              <button type="button" class="btn btn-link btn-sm p-0" (click)="m.emails.push('')"><em class="feather icon-plus me-1"></em>Añadir correo</button>
              }
              @if (err('emails')) {<div class="small text-danger">{{ err('emails') }}</div>}
            </div>
          </div>
        </section>

        <section class="erp-form-section">
          <h6 class="erp-form-section__title"><em class="feather icon-percent"></em>Tributación y ambiente</h6>
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label" for="tf-reg">Régimen <span class="erp-required">*</span></label>
              <select id="tf-reg" class="form-select" name="tax_regime" [(ngModel)]="m.tax_regime" [class.is-invalid]="!!err('tax_regime')">
                @for (r of regimes; track r.id) {<option [ngValue]="r.id">{{ r.name }}</option>}
              </select>
              @if (err('tax_regime')) {<div class="invalid-feedback">{{ err('tax_regime') }}</div>}
            </div>
            @if (m.tax_regime === 'rus') {
            <div class="col-md-4">
              <label class="form-label" for="tf-nrus">Categoría del Nuevo RUS</label>
              <select id="tf-nrus" class="form-select" name="nrus_categoria" [(ngModel)]="m.nrus_categoria" [class.is-invalid]="!!err('nrus_categoria')">
                <option value="">Sin categoría</option>
                @for (n of nrus; track n.id) {<option [value]="'' + n.id">{{ n.name }}</option>}
              </select>
              @if (err('nrus_categoria')) {<div class="invalid-feedback">{{ err('nrus_categoria') }}</div>}
            </div>
            } @else {
            <div class="col-md-4">
              <label class="form-label" for="tf-igv">Tasa de IGV especial (%)</label>
              <input id="tf-igv" type="number" min="0" max="30" step="0.01" class="form-control" name="igv_rate_override" [(ngModel)]="m.igv_rate_override"
                [class.is-invalid]="!!err('igv_rate_override')" placeholder="Vacío = la vigente" />
              @if (err('igv_rate_override')) {<div class="invalid-feedback">{{ err('igv_rate_override') }}</div>}
              <div class="form-text">De 0 a 30. Solo si la empresa tiene una tasa distinta a la general.</div>
            </div>
            }
            <div class="col-md-4">
              <label class="form-label" for="tf-env">Ambiente <span class="erp-required">*</span></label>
              <select id="tf-env" class="form-select" name="entorno" [(ngModel)]="m.entorno" [class.is-invalid]="!!err('entorno')">
                @for (e of environments; track e.id) {<option [ngValue]="e.id">{{ e.name }}</option>}
              </select>
              @if (err('entorno')) {<div class="invalid-feedback">{{ err('entorno') }}</div>}
              <div class="form-text">Producción envía a SUNAT de verdad: necesita certificado y clave SOL reales.</div>
            </div>
          </div>
        </section>

        @if (!editing) {
        <section class="erp-form-section">
          <h6 class="erp-form-section__title"><em class="feather icon-sliders"></em>Plan y emisión</h6>
          <div class="row g-3">
            <div class="col-md-3">
              <label class="form-label" for="tf-plan">Plan</label>
              <select id="tf-plan" class="form-select" name="plan" [(ngModel)]="m.plan" [class.is-invalid]="!!err('plan')">
                @for (p of plans; track p.id) {<option [ngValue]="p.id">{{ p.name }}</option>}
              </select>
              @if (err('plan')) {<div class="invalid-feedback">{{ err('plan') }}</div>}
            </div>
            <div class="col-md-3">
              <label class="form-label" for="tf-max">Cupo de comprobantes por mes</label>
              <input id="tf-max" type="number" min="0" step="1" class="form-control" name="max_documents_month" [(ngModel)]="m.max_documents_month"
                [class.is-invalid]="!!err('max_documents_month')" placeholder="Vacío = el del plan" />
              @if (err('max_documents_month')) {<div class="invalid-feedback">{{ err('max_documents_month') }}</div>}
              <div class="form-text">{{ quotaHint() }}</div>
            </div>
            <div class="col-md-6">
              <label class="form-label" for="tf-mode">Modo de emisión</label>
              <select id="tf-mode" class="form-select" name="emission_mode" [(ngModel)]="m.emission_mode" [class.is-invalid]="!!err('emission_mode')">
                <option value="">Según la configuración de emisión (nuevas empresas)</option>
                @for (o of modes; track o.id) {<option [value]="o.id">{{ o.name }}</option>}
              </select>
              @if (err('emission_mode')) {<div class="invalid-feedback">{{ err('emission_mode') }}</div>}
            </div>
            <div class="col-12">
              <div class="form-check">
                <input id="tf-series" type="checkbox" class="form-check-input" name="series_por_defecto" [(ngModel)]="m.series_por_defecto" />
                <label class="form-check-label" for="tf-series">Crear las 6 series por defecto (F001, FC01, FD01, B001, BC01, BD01, sin sucursal)</label>
              </div>
            </div>
          </div>
        </section>
        }

        <section class="erp-form-section">
          <h6 class="erp-form-section__title"><em class="feather icon-shopping-bag"></em>Comercial</h6>
          <div class="row g-3">
            <div class="col-12">
              <label class="form-label" for="tf-hook">URL del webhook</label>
              <input id="tf-hook" type="url" class="form-control" name="url_webhook" [(ngModel)]="m.url_webhook" maxlength="500"
                [class.is-invalid]="!!err('url_webhook')" placeholder="https://erp.empresa.pe/hooks/sunat (opcional)" />
              @if (err('url_webhook')) {<div class="invalid-feedback">{{ err('url_webhook') }}</div>}
            </div>
            <div class="col-md-6">
              <label class="form-label" for="tf-thanks">Mensaje de agradecimiento (PDF)</label>
              <textarea id="tf-thanks" rows="2" class="form-control" name="mensaje_agradecimiento" [(ngModel)]="m.mensaje_agradecimiento" maxlength="500"
                [class.is-invalid]="!!err('mensaje_agradecimiento')" placeholder="Gracias por su compra"></textarea>
              @if (err('mensaje_agradecimiento')) {<div class="invalid-feedback">{{ err('mensaje_agradecimiento') }}</div>}
            </div>
            <div class="col-md-6">
              <label class="form-label" for="tf-promo">Mensaje promocional</label>
              <textarea id="tf-promo" rows="2" class="form-control" name="mensaje_promocional" [(ngModel)]="m.mensaje_promocional" maxlength="500"
                [class.is-invalid]="!!err('mensaje_promocional')" placeholder="Síguenos en @empresa"></textarea>
              @if (err('mensaje_promocional')) {<div class="invalid-feedback">{{ err('mensaje_promocional') }}</div>}
            </div>

            <div class="col-12">
              <span class="form-label d-block">Cuentas bancarias</span>
              @for (c of m.cuentas; track $index; let i = $index) {
              <div class="row g-2 mb-2 border rounded p-2 mx-0">
                <div class="col-md-3">
                  <input class="form-control form-control-sm" [name]="'cb-banco-' + i" [(ngModel)]="c.banco" maxlength="100" placeholder="Banco *"
                    aria-label="Banco" [class.is-invalid]="!!err('cuentas_bancarias.' + i + '.banco')" />
                  @if (err('cuentas_bancarias.' + i + '.banco')) {<div class="invalid-feedback">{{ err('cuentas_bancarias.' + i + '.banco') }}</div>}
                </div>
                <div class="col-md-2">
                  <input class="form-control form-control-sm" [name]="'cb-tipo-' + i" [(ngModel)]="c.tipo_cuenta" maxlength="50" placeholder="Tipo (ahorros / corriente)"
                    aria-label="Tipo de cuenta" [class.is-invalid]="!!err('cuentas_bancarias.' + i + '.tipo_cuenta')" />
                </div>
                <div class="col-md-1">
                  <select class="form-select form-select-sm" [name]="'cb-mon-' + i" [(ngModel)]="c.moneda" aria-label="Moneda">
                    <option value="PEN">PEN</option><option value="USD">USD</option>
                  </select>
                </div>
                <div class="col-md-2">
                  <input class="form-control form-control-sm" [name]="'cb-num-' + i" [(ngModel)]="c.numero" maxlength="50" placeholder="Número *" aria-label="Número de cuenta"
                    [class.is-invalid]="!!err('cuentas_bancarias.' + i + '.numero')" />
                  @if (err('cuentas_bancarias.' + i + '.numero')) {<div class="invalid-feedback">{{ err('cuentas_bancarias.' + i + '.numero') }}</div>}
                </div>
                <div class="col-md-2">
                  <input class="form-control form-control-sm" [name]="'cb-cci-' + i" [(ngModel)]="c.cci" maxlength="50" placeholder="CCI" aria-label="CCI"
                    [class.is-invalid]="!!err('cuentas_bancarias.' + i + '.cci')" />
                </div>
                <div class="col-md-2 d-flex gap-1">
                  <input class="form-control form-control-sm" [name]="'cb-tit-' + i" [(ngModel)]="c.titular" maxlength="150" placeholder="Titular" aria-label="Titular" />
                  <button type="button" class="btn btn-sm btn-outline-danger" (click)="m.cuentas.splice(i, 1)" aria-label="Quitar cuenta"><em class="feather icon-trash-2"></em></button>
                </div>
              </div>
              }
              @if (m.cuentas.length < max) {
              <button type="button" class="btn btn-link btn-sm p-0" (click)="addAccount()"><em class="feather icon-plus me-1"></em>Añadir cuenta</button>
              }
              @if (err('cuentas_bancarias')) {<div class="small text-danger">{{ err('cuentas_bancarias') }}</div>}
            </div>

            <div class="col-12">
              <span class="form-label d-block">Billeteras digitales</span>
              @for (w of m.billeteras; track $index; let i = $index) {
              <div class="row g-2 mb-2 border rounded p-2 mx-0">
                <div class="col-md-3">
                  <select class="form-select form-select-sm" [name]="'bd-tipo-' + i" [(ngModel)]="w.tipo" aria-label="Billetera">
                    @for (o of wallets; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
                  </select>
                </div>
                <div class="col-md-4">
                  <input class="form-control form-control-sm" [name]="'bd-num-' + i" [(ngModel)]="w.numero" maxlength="20" inputmode="tel" placeholder="Número *"
                    aria-label="Número de la billetera" [class.is-invalid]="!!err('billeteras_digitales.' + i + '.numero')" />
                  @if (err('billeteras_digitales.' + i + '.numero')) {<div class="invalid-feedback">{{ err('billeteras_digitales.' + i + '.numero') }}</div>}
                </div>
                <div class="col-md-5 d-flex gap-1">
                  <input class="form-control form-control-sm" [name]="'bd-tit-' + i" [(ngModel)]="w.titular" maxlength="150" placeholder="Titular" aria-label="Titular" />
                  <button type="button" class="btn btn-sm btn-outline-danger" (click)="m.billeteras.splice(i, 1)" aria-label="Quitar billetera"><em class="feather icon-trash-2"></em></button>
                </div>
              </div>
              }
              @if (m.billeteras.length < max) {
              <button type="button" class="btn btn-link btn-sm p-0" (click)="m.billeteras.push({ tipo: 'yape', numero: '', titular: '' })"><em class="feather icon-plus me-1"></em>Añadir billetera</button>
              }
              @if (err('billeteras_digitales')) {<div class="small text-danger">{{ err('billeteras_digitales') }}</div>}
            </div>
          </div>
        </section>

        <section class="erp-form-section">
          <label class="form-label" for="tf-motivo">Motivo (opcional, queda en la auditoría)</label>
          <textarea id="tf-motivo" rows="2" class="form-control" name="motivo" [(ngModel)]="m.motivo" maxlength="400" [class.is-invalid]="!!err('motivo')"
            [placeholder]="editing ? 'Ej.: actualización pedida por la empresa (ticket 1234)' : 'Ej.: alta pedida por el área comercial'"></textarea>
          @if (err('motivo')) {<div class="invalid-feedback">{{ err('motivo') }}</div>}
        </section>

        @if (otherErrors().length) {
        <div class="alert alert-danger small mb-0">
          <p class="fw-semibold mb-1">Revise estos datos:</p>
          <ul class="mb-0">@for (e of otherErrors(); track e.key) {<li><code>{{ e.key }}</code>: {{ e.message }}</li>}</ul>
        </div>
        }
        <button type="submit" class="d-none" aria-hidden="true" tabindex="-1"></button>
      </form>
      }
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" (click)="activeModal.dismiss()">Cancelar</button>
      <button type="button" class="btn btn-primary" [disabled]="saving() || loading() || !!loadError()" (click)="save()">
        @if (saving()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
        {{ editing ? 'Guardar cambios' : 'Registrar empresa' }}
      </button>
    </div>
  `
})
export class TenantFormComponent implements OnInit {
  private admin = inject(TenantAdminService);
  private views = inject(TenantViewsService);
  private alerts = inject(AlertModalService);
  private planService = inject(PlanService);
  private perms = inject(PermissionService);
  readonly activeModal = inject(NgbActiveModal);

  /** `null` = alta; con id = edición. */
  @Input() tenantId: number | null = null;

  readonly max = MAX_REPEATED;
  readonly regimes = TAX_REGIME_OPTIONS;
  readonly nrus = NRUS_OPTIONS;
  readonly environments = ENVIRONMENT_OPTIONS;
  readonly plans = PLAN_OPTIONS;
  readonly modes = EMISSION_MODE_OPTIONS;
  readonly wallets = WALLET_OPTIONS;

  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly saving = signal(false);
  readonly lookingUp = signal(false);
  readonly lookupMsg = signal<{ ok: boolean; text: string } | null>(null);
  readonly errors = signal<Record<string, string>>({});
  readonly otherErrors = signal<{ key: string; message: string }[]>([]);

  m: FormModel = emptyModel();
  /** Lo guardado (edición): se envía solo lo que cambió. */
  private original: FormModel | null = null;

  get editing(): boolean {
    return this.tenantId != null;
  }

  /** Cupo de cada plan (`GET plans`, por slug; -1 = ilimitado, null = sin definir): para la ayuda del alta (§12.2). */
  readonly planQuotas = signal<Record<string, number | null>>({});

  ngOnInit(): void {
    if (this.tenantId == null) {
      this.loadPlanQuotas();
      return;
    }
    this.loading.set(true);
    this.views.get(this.tenantId, 'empresa').subscribe({
      next: (resp) => {
        if (resp.succeeded && resp.data) {
          this.original = fromResource(obj(resp.data));
          this.m = fromResource(obj(resp.data));
          if (!this.m.telefonos.length) {
            this.m.telefonos.push('');
          }
          if (!this.m.emails.length) {
            this.m.emails.push('');
          }
        } else {
          this.loadError.set(serverMessages(resp, 'No se pudieron cargar los datos de la empresa.'));
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(serverMessages(err?.error, 'No se pudieron cargar los datos de la empresa.'));
        this.loading.set(false);
      }
    });
  }

  err(key: string): string {
    return this.errors()[key] ?? '';
  }

  private loadPlanQuotas(): void {
    if (!this.perms.hasPermission(PERM.plansView)) {
      return;
    }
    this.planService.GetAll(50, 1, '').subscribe({
      next: (resp) => {
        const map: Record<string, number | null> = {};
        (Array.isArray(resp?.data) ? (resp.data as PlanRow[]) : []).forEach((p) => (map[p.slug] = p.isUnlimited ? -1 : p.documentsMonth));
        this.planQuotas.set(map);
      }
    });
  }

  /** Vacío = el cupo del plan (la API ya no pone 20 por defecto); un valor queda como cupo del panel. */
  quotaHint(): string {
    const q = this.planQuotas()[this.m.plan];
    const plan = `el del plan ${planName(this.m.plan)}${q !== undefined && q !== null ? `: ${quotaLimitText(q)}` : ''}`;
    return `Vacío = ${plan}. Un valor queda como cupo del panel (manda sobre el del plan).`;
  }

  digits(value: string, max: number): string {
    return (value ?? '').replace(/\D/g, '').substring(0, max);
  }

  addAccount(): void {
    this.m.cuentas.push({ banco: '', tipo_cuenta: '', moneda: 'PEN', numero: '', cci: '', titular: '' });
  }

  onUbigeo(choice: UbigeoChoice | null): void {
    if (!choice) {
      this.m.ubigeo = '';
      return;
    }
    this.m.ubigeo = choice.ubigeo;
    if (choice.departamento || choice.provincia || choice.distrito) {
      this.m.departamento = choice.departamento;
      this.m.provincia = choice.provincia;
      this.m.distrito = choice.distrito;
    }
  }

  /** Autocompletar con `GET tenants/ruc-lookup` (solo al pulsar "Consultar"). */
  lookup(): void {
    const local = rucError(this.m.ruc);
    if (local) {
      this.setErrors({ ...this.errors(), ruc: local });
      return;
    }
    this.lookingUp.set(true);
    this.lookupMsg.set(null);
    this.admin.rucLookup(this.m.ruc).subscribe({
      next: (resp) => {
        if (resp.succeeded && resp.data) {
          const d = resp.data as RucLookupResult;
          if (d.razon_social) {
            this.m.razon_social = d.razon_social;
          }
          if (d.direccion) {
            this.m.direccion = d.direccion;
          }
          const state = [d.estado, d.condicion].filter(Boolean).join(' / ');
          this.lookupMsg.set({ ok: true, text: `${d.razon_social || 'Encontrado'}${state ? ` · ${state}` : ''}. Revise la dirección y elija el ubigeo.` });
          const rest = { ...this.errors() };
          delete rest['ruc'];
          this.setErrors(rest);
        } else {
          this.lookupMsg.set({ ok: false, text: serverMessages(resp, 'No se encontró información del RUC. Completa los datos a mano.') });
        }
        this.lookingUp.set(false);
      },
      error: (err) => {
        this.lookupMsg.set({ ok: false, text: serverMessages(err?.error, 'No se pudo consultar el RUC. Completa los datos a mano.') });
        this.lookingUp.set(false);
      }
    });
  }

  /** Validación local con las reglas de §11.3 (la API vuelve a validar todo). */
  private validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const m = this.m;
    if (!this.editing) {
      const ruc = rucError(m.ruc);
      if (ruc) {
        e['ruc'] = ruc;
      }
    }
    if (!text(m.razon_social)) {
      e['razon_social'] = 'Indique la razón social.';
    }
    if (!text(m.direccion)) {
      e['direccion'] = 'Indique la dirección fiscal.';
    }
    if (!/^\d{6}$/.test(text(m.ubigeo))) {
      e['ubigeo'] = 'Elija el departamento, la provincia y el distrito.';
    }
    m.telefonos.forEach((t, i) => {
      if (text(t) && !PHONE_RE.test(text(t))) {
        e[`telefonos.${i}`] = 'Teléfono no válido (6 a 20 números, +, espacios, guiones o paréntesis).';
      }
    });
    m.emails.forEach((x, i) => {
      if (text(x) && !EMAIL_RE.test(text(x))) {
        e[`emails.${i}`] = 'Correo no válido.';
      }
    });
    m.cuentas.forEach((c, i) => {
      if (text(c.banco) || text(c.numero) || text(c.cci) || text(c.titular) || text(c.tipo_cuenta)) {
        if (!text(c.banco)) {
          e[`cuentas_bancarias.${i}.banco`] = 'Indique el banco.';
        }
        if (!text(c.numero)) {
          e[`cuentas_bancarias.${i}.numero`] = 'Indique el número.';
        }
      }
    });
    m.billeteras.forEach((w, i) => {
      if (text(w.titular) && !text(w.numero)) {
        e[`billeteras_digitales.${i}.numero`] = 'Indique el número.';
      }
    });
    const hook = text(m.url_webhook);
    if (hook && !/^https?:\/\/[^\s]+$/i.test(hook)) {
      e['url_webhook'] = 'Debe ser una URL que empiece con http:// o https://.';
    }
    const igv = text(m.igv_rate_override);
    if (m.tax_regime !== 'rus' && igv && !(Number.isFinite(Number(igv)) && Number(igv) >= 0 && Number(igv) <= 30)) {
      e['igv_rate_override'] = 'Tasa de 0 a 30.';
    }
    if (!this.editing && text(m.max_documents_month) && !(/^\d+$/.test(text(m.max_documents_month)))) {
      e['max_documents_month'] = 'El cupo mensual debe ser un número entero mayor o igual a 0 (vacío = el cupo del plan).';
    }
    return e;
  }

  private setErrors(e: Record<string, string>): void {
    this.errors.set(e);
    this.otherErrors.set(Object.entries(e)
      .filter(([k]) => !SHOWN_KEYS.has(k) && !SHOWN_PATTERNS.some((p) => p.test(k)))
      .map(([key, message]) => ({ key, message })));
  }

  private createBody(): CreateTenantBody {
    const data = dataBody(this.m);
    const kept = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0)));
    const body: CreateTenantBody = {
      ...kept, ruc: text(this.m.ruc), razon_social: data.razon_social, direccion: data.direccion, ubigeo: data.ubigeo,
      plan: this.m.plan, series_por_defecto: this.m.series_por_defecto
    };
    // Sin valor no se envía: rige el cupo del plan (§12.2).
    if (text(this.m.max_documents_month)) {
      body.max_documents_month = Number(this.m.max_documents_month);
    }
    if (this.m.emission_mode) {
      body.emission_mode = this.m.emission_mode;
    }
    if (text(this.m.motivo)) {
      body.motivo = text(this.m.motivo);
    }
    return body;
  }

  /** Solo los campos que cambiaron respecto de lo guardado. */
  private updateBody(): TenantDataBody {
    const now = dataBody(this.m);
    const before = dataBody(this.original ?? emptyModel());
    const changed = Object.fromEntries(Object.entries(now)
      .filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((before as Record<string, unknown>)[k]))) as TenantDataBody;
    if (text(this.m.motivo)) {
      changed.motivo = text(this.m.motivo);
    }
    return changed;
  }

  save(): void {
    if (this.saving() || this.loading() || this.loadError()) {
      return;
    }
    const local = this.validate();
    this.setErrors(local);
    if (Object.keys(local).length) {
      return;
    }
    if (this.editing) {
      const body = this.updateBody();
      if (!Object.keys(body).some((k) => k !== 'motivo')) {
        void this.alerts.showNotification('Sin cambios', 'No modificó ningún dato de la empresa.', 'info');
        return;
      }
      this.send(this.admin.update(this.tenantId!, body), () => this.activeModal.close(true), 'Empresa actualizada.');
    } else {
      const body = this.createBody();
      this.send(this.admin.create(body), (resp) => {
        const d = resp.data as CreateTenantResult;
        const result: OneTimeCredentials = {
          tenantId: Number(d?.tenantId), tenantLabel: `${body.razon_social} (${body.ruc})`, ruc: body.ruc,
          apiKey: d?.apiKey ?? '', apiSecret: d?.apiSecret ?? '', aviso: d?.aviso
        };
        // Se entrega al llamador para el modal de una sola vez; aquí no queda guardado.
        this.activeModal.close(result);
      }, 'Empresa creada.', false);
    }
  }

  private send(call: Observable<BaseResponse>, done: (resp: BaseResponse) => void, okText: string, notify = true): void {
    this.saving.set(true);
    call.subscribe({
      next: async (resp) => {
        this.saving.set(false);
        if (resp.succeeded) {
          done(resp);
          if (notify) {
            await this.alerts.showNotification('Listo', serverMessages(resp, okText), 'success');
          }
        } else {
          this.setErrors(fieldErrors(resp));
          await this.alerts.showNotification('Atención', serverMessages(resp, 'No se pudo guardar la empresa.'), 'warning');
        }
      },
      error: async (err) => {
        this.saving.set(false);
        this.setErrors(fieldErrors(err?.error));
        await this.alerts.showNotification('Error', serverMessages(err?.error, 'No se pudo guardar la empresa.'), 'danger');
      }
    });
  }
}
