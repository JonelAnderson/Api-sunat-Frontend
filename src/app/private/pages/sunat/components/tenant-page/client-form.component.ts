import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { PermissionService } from '@shared/service/permission.service';
import { serverMessages } from '@shared/functions/list-helpers';
import { PERM } from '../../models/sunat.models';
import { Json, identityTypeName, obj, str } from '../../models/tenant-views.models';
import { CLIENT_DOC_OPTIONS, ClientBody, EMAIL_RE, LOOKUP_DOC_TYPES, PHONE_RE, fieldErrors, rucError, textOrNull } from '../../models/tenant-admin.models';
import { TenantAdminService } from '../../services/tenant-admin.service';

/**
 * Crear (`POST tenants/{id}/clientes`; si el documento ya existe, la API lo actualiza) o editar (`PUT …/{clienteId}`: razón
 * social, nombre comercial, dirección, correo, teléfono; el documento no cambia) un cliente (§11.5, `Admin.Tenants.Edit`).
 * "Consultar" (como el `buscar-ruc` de la referencia) usa `GET tenants/{id}/buscar-documento` (§11.9), que pide
 * `Admin.Documents.Issue`: sin ese permiso el botón no aparece. Cierra con `true`.
 */
@Component({
  selector: 'app-client-form',
  imports: [FormsModule],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-user"></em>{{ client ? 'Editar cliente' : 'Nuevo cliente' }}</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      <form class="erp-form" novalidate (ngSubmit)="save()">
        <div class="row g-3">
          <div class="col-md-5">
            <label class="form-label" for="cf-tipo">Tipo de documento <span class="erp-required">*</span></label>
            @if (client) {
            <input id="cf-tipo" class="form-control" [value]="docName(tipo)" readonly />
            } @else {
            <select id="cf-tipo" class="form-select" name="tipo_documento" [(ngModel)]="tipo" [class.is-invalid]="!!err('tipo_documento')">
              @for (d of docTypes; track d.id) {<option [ngValue]="d.id">{{ d.name }}</option>}
            </select>
            }
            @if (err('tipo_documento')) {<div class="invalid-feedback">{{ err('tipo_documento') }}</div>}
          </div>
          <div class="col-md-7">
            <label class="form-label" for="cf-num">Número <span class="erp-required">*</span></label>
            <div class="input-group has-validation">
              <input id="cf-num" class="form-control" name="numero_documento" [(ngModel)]="numero" maxlength="15" autocomplete="off" [readonly]="!!client"
                [class.is-invalid]="!!err('numero_documento')" />
              @if (!client && canLookup && lookupAllowed()) {
              <button type="button" class="btn btn-outline-primary" [disabled]="lookingUp()" (click)="lookup()" title="Cliente de la empresa, SUNAT o RENIEC">
                @if (lookingUp()) {<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>} @else {<em class="feather icon-search me-1"></em>}Consultar
              </button>
              }
              @if (err('numero_documento')) {<div class="invalid-feedback">{{ err('numero_documento') }}</div>}
            </div>
            @if (lookupMsg(); as lm) {<div class="small mt-1" [class.text-success]="lm.ok" [class.text-danger]="!lm.ok">{{ lm.text }}</div>}
            @if (client) {<div class="form-text">El documento no cambia al editar.</div>}
          </div>
          <div class="col-12">
            <label class="form-label" for="cf-rs">Razón social o nombre <span class="erp-required">*</span></label>
            <input id="cf-rs" class="form-control" name="razon_social" [(ngModel)]="razonSocial" maxlength="255" [class.is-invalid]="!!err('razon_social')" />
            @if (err('razon_social')) {<div class="invalid-feedback">{{ err('razon_social') }}</div>}
          </div>
          <div class="col-12">
            <label class="form-label" for="cf-nc">Nombre comercial</label>
            <input id="cf-nc" class="form-control" name="nombre_comercial" [(ngModel)]="nombreComercial" maxlength="255" [class.is-invalid]="!!err('nombre_comercial')" />
            @if (err('nombre_comercial')) {<div class="invalid-feedback">{{ err('nombre_comercial') }}</div>}
          </div>
          <div class="col-12">
            <label class="form-label" for="cf-dir">Dirección</label>
            <input id="cf-dir" class="form-control" name="direccion" [(ngModel)]="direccion" maxlength="500" [class.is-invalid]="!!err('direccion')" />
            @if (err('direccion')) {<div class="invalid-feedback">{{ err('direccion') }}</div>}
          </div>
          <div class="col-md-7">
            <label class="form-label" for="cf-mail">Correo</label>
            <input id="cf-mail" type="email" class="form-control" name="email" [(ngModel)]="email" maxlength="100" [class.is-invalid]="!!err('email')" />
            @if (err('email')) {<div class="invalid-feedback">{{ err('email') }}</div>}
          </div>
          <div class="col-md-5">
            <label class="form-label" for="cf-tel">Teléfono</label>
            <input id="cf-tel" class="form-control" name="telefono" [(ngModel)]="telefono" maxlength="20" inputmode="tel" [class.is-invalid]="!!err('telefono')" />
            @if (err('telefono')) {<div class="invalid-feedback">{{ err('telefono') }}</div>}
          </div>
          <div class="col-12">
            <label class="form-label" for="cf-motivo">Motivo (opcional)</label>
            <input id="cf-motivo" class="form-control" name="motivo" [(ngModel)]="motivo" maxlength="400" placeholder="Queda en la auditoría" />
          </div>
        </div>
        <button type="submit" class="d-none" aria-hidden="true" tabindex="-1"></button>
      </form>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" (click)="activeModal.dismiss()">Cancelar</button>
      <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">
        @if (saving()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
        Guardar
      </button>
    </div>
  `
})
export class ClientFormComponent implements OnInit {
  private admin = inject(TenantAdminService);
  private alerts = inject(AlertModalService);
  private perms = inject(PermissionService);
  readonly activeModal = inject(NgbActiveModal);

  @Input() tenantId!: number;
  /** La fila de `GET clientes` (snake_case) al editar; `null` crea. */
  @Input() client: Json | null = null;

  readonly docTypes = CLIENT_DOC_OPTIONS;
  readonly canLookup = this.perms.hasPermission(PERM.documentsIssue);
  tipo = '6';
  numero = '';
  razonSocial = '';
  nombreComercial = '';
  direccion = '';
  email = '';
  telefono = '';
  motivo = '';
  readonly saving = signal(false);
  readonly lookingUp = signal(false);
  readonly lookupMsg = signal<{ ok: boolean; text: string } | null>(null);
  readonly errors = signal<Record<string, string>>({});

  ngOnInit(): void {
    const c = this.client;
    if (c) {
      this.tipo = str(c['tipo_documento']);
      this.numero = str(c['numero_documento']);
      this.razonSocial = str(c['razon_social']);
      this.nombreComercial = str(c['nombre_comercial']);
      this.direccion = str(c['direccion']);
      this.email = str(c['email']);
      this.telefono = str(c['telefono']);
    }
  }

  err(key: string): string {
    return this.errors()[key] ?? '';
  }

  docName(tipo: string): string {
    return identityTypeName(tipo);
  }

  lookupAllowed(): boolean {
    return LOOKUP_DOC_TYPES.includes(this.tipo);
  }

  /** Solo al pulsar "Consultar" (cuenta en el límite de 20 consultas por minuto del administrador). */
  lookup(): void {
    const n = this.numero.trim();
    if (!/^[A-Za-z0-9-]{8,15}$/.test(n)) {
      this.errors.set({ ...this.errors(), numero_documento: 'Escriba de 8 a 15 caracteres para consultar.' });
      return;
    }
    this.lookingUp.set(true);
    this.lookupMsg.set(null);
    this.admin.lookupDocument(this.tenantId, this.tipo, n).subscribe({
      next: (resp) => {
        if (resp.succeeded && resp.data) {
          const d = obj(resp.data);
          if (str(d['razon_social'])) {
            this.razonSocial = str(d['razon_social']);
          }
          if (str(d['direccion'])) {
            this.direccion = str(d['direccion']);
          }
          const source = str(d['fuente'] ?? d['source']);
          const from = source === 'local' ? 'ya es cliente de la empresa' : source ? `de ${source.toUpperCase()}` : '';
          this.lookupMsg.set({ ok: true, text: `${str(d['razon_social']) || 'Encontrado'}${from ? ` (${from})` : ''}.` });
        } else {
          this.lookupMsg.set({ ok: false, text: serverMessages(resp, 'No se encontró información para el documento ingresado.') });
        }
        this.lookingUp.set(false);
      },
      error: (err) => {
        this.lookupMsg.set({ ok: false, text: serverMessages(err?.error, 'No se pudo consultar el documento.') });
        this.lookingUp.set(false);
      }
    });
  }

  save(): void {
    const e: Record<string, string> = {};
    const n = this.numero.trim();
    if (!this.client) {
      if (!n) {
        e['numero_documento'] = 'Indique el número de documento.';
      } else if (this.tipo === '6' && rucError(n)) {
        e['numero_documento'] = rucError(n);
      } else if (this.tipo === '1' && !/^\d{8}$/.test(n)) {
        e['numero_documento'] = 'El DNI tiene 8 dígitos.';
      }
    }
    if (!this.razonSocial.trim()) {
      e['razon_social'] = 'Indique la razón social o el nombre.';
    }
    if (this.email.trim() && !EMAIL_RE.test(this.email.trim())) {
      e['email'] = 'Correo no válido.';
    }
    if (this.telefono.trim() && !PHONE_RE.test(this.telefono.trim())) {
      e['telefono'] = 'Teléfono no válido.';
    }
    this.errors.set(e);
    if (Object.keys(e).length || this.saving()) {
      return;
    }
    const body: ClientBody = {
      razon_social: this.razonSocial.trim(), nombre_comercial: textOrNull(this.nombreComercial), direccion: textOrNull(this.direccion),
      email: textOrNull(this.email), telefono: textOrNull(this.telefono)
    };
    if (!this.client) {
      body.tipo_documento = this.tipo;
      body.numero_documento = n;
    }
    if (this.motivo.trim()) {
      body.motivo = this.motivo.trim();
    }
    const call: Observable<BaseResponse> = this.client
      ? this.admin.updateClient(this.tenantId, Number(this.client['id']), body)
      : this.admin.createClient(this.tenantId, body);
    this.saving.set(true);
    call.subscribe({
      next: async (resp) => {
        this.saving.set(false);
        if (resp.succeeded) {
          this.activeModal.close(true);
          await this.alerts.showNotification('Listo', serverMessages(resp, 'Cliente guardado.'), 'success');
        } else {
          this.errors.set(fieldErrors(resp));
          await this.alerts.showNotification('Atención', serverMessages(resp, 'No se pudo guardar el cliente.'), 'warning');
        }
      },
      error: async (err) => {
        this.saving.set(false);
        this.errors.set(fieldErrors(err?.error));
        await this.alerts.showNotification('Error', serverMessages(err?.error, 'No se pudo guardar el cliente.'), 'danger');
      }
    });
  }
}
