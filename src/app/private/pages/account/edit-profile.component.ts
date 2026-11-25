import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { SharedModule } from '@shared/shared.module';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { CurrentUserProfile, CurrentUserProfileService } from '@shared/service/current-user-profile.service';
import { serverMessages } from '@shared/functions/list-helpers';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { AccountService } from './account.service';

/**
 * Editar el perfil propio (`PUT admin/auth/me`, §10.4): nombre y correo, confirmando con la contraseña actual (un fallo cuenta
 * para el bloqueo de 5 intentos). El correo se guarda en minúsculas y es único. No cierra las sesiones: el perfil en memoria
 * se reemplaza con lo que devuelve la API.
 */
@Component({
  selector: 'app-edit-profile',
  imports: [SharedModule],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-user"></em>Editar mis datos</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      <form [formGroup]="form" class="erp-form" novalidate (ngSubmit)="save()">
        <div class="mb-3">
          <label class="form-label" for="ep-name">Nombre <span class="erp-required">*</span></label>
          <input id="ep-name" class="form-control" formControlName="name" maxlength="255" autocomplete="name" [class.is-invalid]="invalid('name')" />
          @if (invalid('name')) {<div class="invalid-feedback">{{ serverError('name') || 'Indique su nombre (máximo 255 caracteres).' }}</div>}
        </div>
        <div class="mb-3">
          <label class="form-label" for="ep-email">Correo (usuario) <span class="erp-required">*</span></label>
          <input id="ep-email" type="email" class="form-control" formControlName="email" maxlength="190" autocomplete="email" [class.is-invalid]="invalid('email')" />
          @if (invalid('email')) {<div class="invalid-feedback">{{ serverError('email') || 'Correo no válido.' }}</div>}
          <div class="form-text">Es el usuario con el que ingresa. Se guarda en minúsculas.</div>
        </div>
        <div class="mb-2">
          <label class="form-label" for="ep-password">Contraseña actual <span class="erp-required">*</span></label>
          <input id="ep-password" type="password" class="form-control" formControlName="password" autocomplete="current-password"
            [class.is-invalid]="invalid('password')" />
          @if (invalid('password')) {<div class="invalid-feedback">{{ serverError('password') || 'Indique su contraseña actual para confirmar.' }}</div>}
          <div class="form-text">Una contraseña incorrecta cuenta como intento fallido (5 bloquean la cuenta 15 minutos).</div>
        </div>
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
export class EditProfileComponent implements OnInit {
  readonly activeModal = inject(NgbActiveModal);
  private fb = inject(FormBuilder);
  private account = inject(AccountService);
  private alerts = inject(AlertModalService);
  private profile = inject(CurrentUserProfileService);

  readonly saving = signal(false);
  readonly errors = signal<Record<string, string>>({});
  readonly form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(190)]],
    password: ['', Validators.required]
  });
  private submitted = false;

  ngOnInit(): void {
    const p = this.profile.profile();
    this.form.patchValue({ name: p?.fullName || [p?.firstName, p?.lastName].filter(Boolean).join(' '), email: p?.email ?? p?.userName ?? '' });
    // Un error del servidor en un campo se limpia al editarlo.
    this.form.valueChanges.subscribe(() => {
      if (Object.keys(this.errors()).length) {
        Object.keys(this.errors()).forEach((k) => this.form.get(k)?.setErrors(null));
        this.errors.set({});
        this.form.updateValueAndValidity({ emitEvent: false });
      }
    });
  }

  invalid(name: string): boolean {
    const c = this.form.get(name);
    return !!this.serverError(name) || (!!c && c.invalid && (c.touched || this.submitted));
  }

  serverError(name: string): string {
    return this.errors()[name] ?? '';
  }

  private applyServerErrors(resp: BaseResponse | null | undefined): void {
    const e: Record<string, string> = {};
    (Array.isArray(resp?.errors) ? resp!.errors : []).forEach((x: { propertyName?: string; errorMessage?: string }) => {
      if (x?.propertyName && x.errorMessage && this.form.get(x.propertyName)) {
        e[x.propertyName] = x.errorMessage;
      }
    });
    this.errors.set(e);
  }

  save(): void {
    this.submitted = true;
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.account.updateProfile({ name: String(v.name).trim(), email: String(v.email).trim(), password: v.password }).subscribe({
      next: async (resp) => {
        this.saving.set(false);
        if (resp.succeeded) {
          if (resp.data) {
            this.profile.profile.set(resp.data as CurrentUserProfile);
          }
          this.activeModal.close(true);
          await this.alerts.showNotification('Listo', serverMessages(resp, 'Perfil actualizado.'), 'success');
        } else {
          this.form.patchValue({ password: '' }, { emitEvent: false });
          this.applyServerErrors(resp);
          await this.alerts.showNotification('Atención', serverMessages(resp, 'No se pudo actualizar el perfil.'), 'warning');
        }
      },
      error: async (err) => {
        this.saving.set(false);
        this.form.patchValue({ password: '' }, { emitEvent: false });
        const status = err?.status;
        await this.alerts.showNotification('Error', serverMessages(err?.error,
          status === 429 ? 'Demasiados intentos seguidos. Espere un minuto.' : 'No se pudo actualizar el perfil.'), 'danger');
      }
    });
  }
}
