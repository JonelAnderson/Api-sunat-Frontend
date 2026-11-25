import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { serverMessages } from '@shared/functions/list-helpers';
import { Json, str } from '../../models/tenant-views.models';
import { BranchBody, EMAIL_RE, PHONE_RE, UbigeoChoice, fieldErrors, textOrNull } from '../../models/tenant-admin.models';
import { TenantAdminService } from '../../services/tenant-admin.service';
import { UbigeoSelectComponent } from '../common/ubigeo-select.component';

/**
 * Crear (`POST tenants/{id}/sucursales`) o editar (`PUT …/{sucursalId}`) una sucursal (§11.5, `Admin.Tenants.Edit`), con las
 * reglas de `/api/v1/sucursales`: `cod_local` de 4 dígitos y único (no cambia al editar), ubigeo del catálogo (§11.9). Al
 * editar también se activa o desactiva. Errores por campo junto al campo; los de negocio en el aviso. Cierra con `true`.
 */
@Component({
  selector: 'app-branch-form',
  imports: [FormsModule, UbigeoSelectComponent],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-map-pin"></em>{{ branch ? 'Editar sucursal' : 'Nueva sucursal' }}</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      <form class="erp-form" novalidate (ngSubmit)="save()">
        <div class="row g-3">
          <div class="col-md-8">
            <label class="form-label" for="bf-name">Nombre <span class="erp-required">*</span></label>
            <input id="bf-name" class="form-control" name="nombre" [(ngModel)]="nombre" maxlength="150" [class.is-invalid]="!!err('nombre')" placeholder="Anexo Norte" />
            @if (err('nombre')) {<div class="invalid-feedback">{{ err('nombre') }}</div>}
          </div>
          <div class="col-md-4">
            <label class="form-label" for="bf-cod">Código SUNAT (anexo) <span class="erp-required">*</span></label>
            <input id="bf-cod" class="form-control" name="cod_local" [ngModel]="codLocal" (ngModelChange)="codLocal = digits($event)" maxlength="4" inputmode="numeric"
              [readonly]="!!branch" [class.is-invalid]="!!err('cod_local')" placeholder="0001" />
            @if (err('cod_local')) {<div class="invalid-feedback">{{ err('cod_local') }}</div>}
            <div class="form-text">{{ branch ? 'No cambia al editar.' : '4 dígitos, único en la empresa (0000 es la principal).' }}</div>
          </div>
          <div class="col-12">
            <label class="form-label" for="bf-dir">Dirección <span class="erp-required">*</span></label>
            <input id="bf-dir" class="form-control" name="direccion" [(ngModel)]="direccion" maxlength="500" [class.is-invalid]="!!err('direccion')" />
            @if (err('direccion')) {<div class="invalid-feedback">{{ err('direccion') }}</div>}
          </div>
          <div class="col-12">
            <app-ubigeo-select idPrefix="bf-ubigeo" [value]="ubigeo" [error]="err('ubigeo')" (changed)="onUbigeo($event)"></app-ubigeo-select>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="bf-tel">Teléfono</label>
            <input id="bf-tel" class="form-control" name="telefono" [(ngModel)]="telefono" maxlength="20" inputmode="tel" [class.is-invalid]="!!err('telefono')" />
            @if (err('telefono')) {<div class="invalid-feedback">{{ err('telefono') }}</div>}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="bf-mail">Correo</label>
            <input id="bf-mail" type="email" class="form-control" name="email" [(ngModel)]="email" maxlength="100" [class.is-invalid]="!!err('email')" />
            @if (err('email')) {<div class="invalid-feedback">{{ err('email') }}</div>}
          </div>
          <div class="col-md-6">
            <div class="form-check form-switch">
              <input id="bf-main" class="form-check-input" type="checkbox" role="switch" name="es_principal" [(ngModel)]="principal" />
              <label class="form-check-label" for="bf-main">Sucursal principal</label>
            </div>
          </div>
          @if (branch) {
          <div class="col-md-6">
            <div class="form-check form-switch">
              <input id="bf-active" class="form-check-input" type="checkbox" role="switch" name="activo" [(ngModel)]="activo" />
              <label class="form-check-label" for="bf-active">Activa</label>
            </div>
          </div>
          }
          <div class="col-12">
            <label class="form-label" for="bf-motivo">Motivo (opcional)</label>
            <input id="bf-motivo" class="form-control" name="motivo" [(ngModel)]="motivo" maxlength="400" placeholder="Queda en la auditoría" />
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
export class BranchFormComponent implements OnInit {
  private admin = inject(TenantAdminService);
  private alerts = inject(AlertModalService);
  readonly activeModal = inject(NgbActiveModal);

  @Input() tenantId!: number;
  /** La fila de `GET sucursales` (snake_case) al editar; `null` crea. */
  @Input() branch: Json | null = null;

  nombre = '';
  codLocal = '';
  direccion = '';
  ubigeo = '';
  telefono = '';
  email = '';
  principal = false;
  activo = true;
  motivo = '';
  readonly saving = signal(false);
  readonly errors = signal<Record<string, string>>({});

  ngOnInit(): void {
    const b = this.branch;
    if (b) {
      this.nombre = str(b['nombre']);
      this.codLocal = str(b['cod_local']);
      this.direccion = str(b['direccion']);
      this.ubigeo = str(b['ubigeo']);
      this.telefono = str(b['telefono']);
      this.email = str(b['email']);
      this.principal = b['es_principal'] === true;
      this.activo = b['activo'] !== false;
    }
  }

  err(key: string): string {
    return this.errors()[key] ?? '';
  }

  digits(v: string): string {
    return (v ?? '').replace(/\D/g, '').substring(0, 4);
  }

  onUbigeo(choice: UbigeoChoice | null): void {
    this.ubigeo = choice?.ubigeo ?? '';
  }

  save(): void {
    const e: Record<string, string> = {};
    if (!this.nombre.trim()) {
      e['nombre'] = 'Indique el nombre.';
    }
    if (!this.branch && !/^\d{4}$/.test(this.codLocal)) {
      e['cod_local'] = 'El código SUNAT tiene 4 dígitos.';
    }
    if (!this.direccion.trim()) {
      e['direccion'] = 'Indique la dirección.';
    }
    if (!/^\d{6}$/.test(this.ubigeo)) {
      e['ubigeo'] = 'Elija el departamento, la provincia y el distrito.';
    }
    if (this.telefono.trim() && !PHONE_RE.test(this.telefono.trim())) {
      e['telefono'] = 'Teléfono no válido.';
    }
    if (this.email.trim() && !EMAIL_RE.test(this.email.trim())) {
      e['email'] = 'Correo no válido.';
    }
    this.errors.set(e);
    if (Object.keys(e).length || this.saving()) {
      return;
    }
    const body: BranchBody = {
      nombre: this.nombre.trim(), direccion: this.direccion.trim(), ubigeo: this.ubigeo, telefono: textOrNull(this.telefono),
      email: textOrNull(this.email), es_principal: this.principal
    };
    if (this.branch) {
      body.activo = this.activo;
    } else {
      body.cod_local = this.codLocal;
    }
    if (this.motivo.trim()) {
      body.motivo = this.motivo.trim();
    }
    const call: Observable<BaseResponse> = this.branch
      ? this.admin.updateBranch(this.tenantId, Number(this.branch['id']), body)
      : this.admin.createBranch(this.tenantId, body);
    this.saving.set(true);
    call.subscribe({
      next: async (resp) => {
        this.saving.set(false);
        if (resp.succeeded) {
          this.activeModal.close(true);
          await this.alerts.showNotification('Listo', serverMessages(resp, 'Sucursal guardada.'), 'success');
        } else {
          this.errors.set(fieldErrors(resp));
          await this.alerts.showNotification('Atención', serverMessages(resp, 'No se pudo guardar la sucursal.'), 'warning');
        }
      },
      error: async (err) => {
        this.saving.set(false);
        this.errors.set(fieldErrors(err?.error));
        await this.alerts.showNotification('Error', serverMessages(err?.error, 'No se pudo guardar la sucursal.'), 'danger');
      }
    });
  }
}
