import { Component, Input, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { serverMessages } from '@shared/functions/list-helpers';
import { fieldErrors } from '../../models/tenant-admin.models';
import { TenantAdminService } from '../../services/tenant-admin.service';

/**
 * Eliminar una empresa (`DELETE tenants/{id}` con `{ motivo, ruc }`, §11.3; solo `Admin.Tenants.Delete` = superadmin).
 * Borrado lógico: no borra comprobantes ni archivos, la API deja de reconocer sus credenciales al instante, el RUC queda
 * reservado y no hay "restaurar" desde el panel. Pide motivo y escribir el RUC. Cierra con `true`.
 */
@Component({
  selector: 'app-tenant-delete',
  imports: [FormsModule],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title text-danger"><em class="feather icon-trash-2"></em>Eliminar empresa</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      <div class="alert alert-danger small">
        <p class="fw-semibold mb-1">{{ razonSocial }} ({{ ruc }})</p>
        <ul class="mb-0 ps-3">
          <li>La API deja de aceptar sus credenciales de inmediato y la empresa sale de los listados.</li>
          <li>No se borran sus comprobantes ni archivos (obligación de conservación).</li>
          <li>El RUC queda reservado: no se puede volver a dar de alta.</li>
          <li>No se puede restaurar desde el panel.</li>
        </ul>
      </div>
      <form class="erp-form" novalidate (ngSubmit)="confirm()">
        <label class="form-label" for="del-reason">Motivo <span class="erp-required">*</span></label>
        <textarea id="del-reason" rows="3" class="form-control mb-3" name="motivo" [(ngModel)]="motivo" maxlength="400"
          [class.is-invalid]="!!err('motivo')" placeholder="Ej.: baja del servicio solicitada por la empresa"></textarea>
        @if (err('motivo')) {<div class="invalid-feedback mb-2">{{ err('motivo') }}</div>}
        <label class="form-label" for="del-ruc">Escriba el RUC <strong>{{ ruc }}</strong> para confirmar <span class="erp-required">*</span></label>
        <input id="del-ruc" class="form-control" name="ruc" [(ngModel)]="typed" maxlength="11" inputmode="numeric" autocomplete="off"
          [class.is-invalid]="!!err('ruc')" />
        @if (err('ruc')) {<div class="invalid-feedback">{{ err('ruc') }}</div>}
      </form>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" (click)="activeModal.dismiss()">Cancelar</button>
      <button type="button" class="btn btn-danger" [disabled]="saving() || typed.trim() !== ruc || !motivo.trim()" (click)="confirm()">
        @if (saving()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
        Eliminar empresa
      </button>
    </div>
  `
})
export class TenantDeleteComponent {
  private admin = inject(TenantAdminService);
  private alerts = inject(AlertModalService);
  readonly activeModal = inject(NgbActiveModal);

  @Input() tenantId!: number;
  @Input() ruc = '';
  @Input() razonSocial = '';

  motivo = '';
  typed = '';
  readonly saving = signal(false);
  readonly errors = signal<Record<string, string>>({});

  err(key: string): string {
    return this.errors()[key] ?? '';
  }

  confirm(): void {
    const e: Record<string, string> = {};
    if (!this.motivo.trim()) {
      e['motivo'] = 'El motivo es obligatorio.';
    }
    if (this.typed.trim() !== this.ruc) {
      e['ruc'] = 'Escribe el RUC de la empresa para confirmar la eliminación.';
    }
    this.errors.set(e);
    if (Object.keys(e).length || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.admin.remove(this.tenantId, this.motivo.trim(), this.typed.trim()).subscribe({
      next: async (resp) => {
        this.saving.set(false);
        if (resp.succeeded) {
          this.activeModal.close(true);
          await this.alerts.showNotification('Listo', serverMessages(resp, 'Empresa eliminada.'), 'success');
        } else {
          this.errors.set(fieldErrors(resp));
          await this.alerts.showNotification('Atención', serverMessages(resp, 'No se pudo eliminar la empresa.'), 'warning');
        }
      },
      error: async (err) => {
        this.saving.set(false);
        this.errors.set(fieldErrors(err?.error));
        await this.alerts.showNotification('Error', serverMessages(err?.error, 'No se pudo eliminar la empresa.'), 'danger');
      }
    });
  }
}
