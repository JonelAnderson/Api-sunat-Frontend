import { Component, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { serverMessages } from '@shared/functions/list-helpers';
import { obj, str } from '../../models/tenant-views.models';
import { LOGO_MAX_BYTES, LOGO_TYPES, LogoResult, fieldErrors } from '../../models/tenant-admin.models';
import { TenantAdminService } from '../../services/tenant-admin.service';
import { TenantViewsService } from '../../services/tenant-views.service';

/**
 * Logo de la empresa (`POST tenants/{id}/logo`, `multipart/form-data` con el campo `logo`, §11.3; `Admin.Tenants.Edit`):
 * PNG, JPG o WEBP de hasta 2 MB, con vista previa local (`URL.createObjectURL`, se revoca al cambiar y al cerrar). La API
 * reconoce el formato por el contenido (un SVG o HTML renombrado se rechaza) y reemplaza al anterior. Cierra con `true`.
 */
@Component({
  selector: 'app-tenant-logo',
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-image"></em>Logo de la empresa</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      <p class="text-muted">{{ tenantLabel }}</p>
      <div class="d-flex gap-3 align-items-start">
        <div class="border rounded d-flex align-items-center justify-content-center bg-light flex-shrink-0" style="width: 120px; height: 120px">
          @if (preview()) {
          <img [src]="preview()" alt="Vista previa del logo nuevo" style="max-width: 100%; max-height: 100%; object-fit: contain" />
          } @else if (current() && !currentBroken()) {
          <img [src]="current()" alt="Logo actual" style="max-width: 100%; max-height: 100%; object-fit: contain" (error)="currentBroken.set(true)" />
          } @else {
          <em class="feather icon-image text-muted fs-3" aria-hidden="true"></em>
          }
        </div>
        <div class="flex-grow-1">
          <label class="form-label" for="logo-file">Archivo (PNG, JPG o WEBP)</label>
          <input id="logo-file" type="file" class="form-control" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            [class.is-invalid]="!!error()" (change)="pick($event)" />
          @if (error()) {<div class="invalid-feedback">{{ error() }}</div>}
          <div class="form-text">Recomendado: cuadrado de 300 × 300 px, PNG con fondo transparente. Máximo 2 MB. Sale en los PDF de sus comprobantes.</div>
          <div class="small mt-2 text-muted">
            @if (file(); as f) {Nuevo: {{ f.name }} ({{ size(f.size) }})} @else if (current()) {Hay un logo registrado; el nuevo lo reemplaza.} @else {La empresa aún no tiene logo.}
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" (click)="activeModal.dismiss()">Cancelar</button>
      <button type="button" class="btn btn-primary" [disabled]="!file() || saving()" (click)="save()">
        @if (saving()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
        Subir logo
      </button>
    </div>
  `
})
export class TenantLogoComponent implements OnInit, OnDestroy {
  private admin = inject(TenantAdminService);
  private views = inject(TenantViewsService);
  private alerts = inject(AlertModalService);
  readonly activeModal = inject(NgbActiveModal);

  @Input() tenantId!: number;
  @Input() tenantLabel = '';

  readonly file = signal<File | null>(null);
  readonly preview = signal('');
  readonly current = signal('');
  readonly currentBroken = signal(false);
  readonly error = signal('');
  readonly saving = signal(false);

  ngOnInit(): void {
    // El logo actual sale del recurso de la empresa (§9.5, `logo_url`).
    this.views.get(this.tenantId, 'empresa').subscribe({
      next: (resp) => this.current.set(resp.succeeded ? str(obj(resp.data)['logo_url']) : ''),
      error: () => this.current.set('')
    });
  }

  size(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.ceil(bytes / 1024)} KB`;
  }

  pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    this.revoke();
    this.error.set('');
    this.file.set(null);
    if (!f) {
      return;
    }
    if (!LOGO_TYPES.includes(f.type) && !/\.(png|jpe?g|webp)$/i.test(f.name)) {
      this.error.set('El logo debe ser una imagen PNG, JPG o WEBP.');
      input.value = '';
      return;
    }
    if (f.size > LOGO_MAX_BYTES) {
      this.error.set('El logo no debe superar los 2 MB.');
      input.value = '';
      return;
    }
    this.file.set(f);
    this.preview.set(URL.createObjectURL(f));
  }

  save(): void {
    const f = this.file();
    if (!f || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.admin.uploadLogo(this.tenantId, f).subscribe({
      next: async (resp) => {
        this.saving.set(false);
        if (resp.succeeded) {
          const d = resp.data as LogoResult;
          this.activeModal.close(true);
          await this.alerts.showNotification('Listo', serverMessages(resp, `Logo actualizado${d?.formato ? ` (${d.formato.toUpperCase()})` : ''}.`), 'success');
        } else {
          this.error.set(fieldErrors(resp)['logo'] ?? '');
          await this.alerts.showNotification('Atención', serverMessages(resp, 'No se pudo subir el logo.'), 'warning');
        }
      },
      error: async (err) => {
        this.saving.set(false);
        this.error.set(fieldErrors(err?.error)['logo'] ?? '');
        await this.alerts.showNotification('Error', serverMessages(err?.error, 'No se pudo subir el logo.'), 'danger');
      }
    });
  }

  ngOnDestroy(): void {
    this.revoke();
  }

  private revoke(): void {
    if (this.preview()) {
      URL.revokeObjectURL(this.preview());
      this.preview.set('');
    }
  }
}
