import { Component, Input, signal } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { SharedModule } from '@shared/shared.module';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { PasswordRequirementsComponent } from '@shared/components/reusables/password-requirements/password-requirements.component';
import { PASSWORD_MAX_LENGTH, PASSWORD_POLICY_MESSAGE, passwordPolicyValidator } from '@shared/validators/password-policy';
import { serverMessages } from '@shared/functions/list-helpers';
import { AdminUserResponse } from '../models/admin.models';
import { AdminUserService } from '../services/admin.services';

function sameAsPassword(group: AbstractControl): ValidationErrors | null {
  const confirm = group.get('confirm');
  if (confirm && confirm.value && confirm.value !== group.get('password')?.value) {
    confirm.setErrors({ mismatch: true });
  } else if (confirm?.hasError('mismatch')) {
    confirm.setErrors(null);
  }
  return null;
}

/** Contraseña temporal de un administrador (`POST users/{id}/password`): cumple la política y revoca sus sesiones. */
@Component({
  selector: 'app-admin-user-password',
  imports: [SharedModule, PasswordRequirementsComponent],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-key"></em>Contraseña temporal</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      <p class="text-muted">{{ user.name }} ({{ user.email }}). Se cerrarán todas sus sesiones; su verificación en dos pasos no cambia.</p>
      <form [formGroup]="form" class="erp-form" novalidate>
        <div class="mb-3">
          <label class="form-label" for="temp-password">Nueva contraseña <span class="erp-required">*</span></label>
          <input id="temp-password" type="password" class="form-control" formControlName="password" [attr.maxlength]="maxLength"
            autocomplete="new-password" [class.is-invalid]="invalid('password')" />
          @if (invalid('password')) {<div class="invalid-feedback">{{ policyMessage }}</div>}
        </div>
        <div class="mb-2">
          <label class="form-label" for="temp-password-confirm">Confirmar <span class="erp-required">*</span></label>
          <input id="temp-password-confirm" type="password" class="form-control" formControlName="confirm" [attr.maxlength]="maxLength"
            autocomplete="new-password" [class.is-invalid]="invalid('confirm')" />
          @if (invalid('confirm')) {<div class="invalid-feedback">Las contraseñas no coinciden.</div>}
        </div>
        <app-password-requirements [value]="form.get('password')?.value"></app-password-requirements>
      </form>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" (click)="activeModal.dismiss()">Cancelar</button>
      <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">
        @if (saving()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
        Asignar contraseña
      </button>
    </div>
  `
})
export class AdminUserPasswordComponent {
  @Input() user!: AdminUserResponse;

  readonly maxLength = PASSWORD_MAX_LENGTH;
  readonly policyMessage = PASSWORD_POLICY_MESSAGE;
  readonly saving = signal(false);
  form: FormGroup;
  private submitted = false;

  constructor(private fb: FormBuilder, private users: AdminUserService, private alerts: AlertModalService, public activeModal: NgbActiveModal) {
    this.form = this.fb.group({
      password: ['', [Validators.required, passwordPolicyValidator]],
      confirm: ['', Validators.required]
    }, { validators: sameAsPassword });
  }

  invalid(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.touched || this.submitted);
  }

  save(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.users.setPassword(this.user.id, this.form.value.password).subscribe({
      next: async (resp) => {
        this.saving.set(false);
        if (resp.succeeded) {
          this.activeModal.close(true);
          await this.alerts.showNotification('Listo', serverMessages(resp, 'Contraseña temporal asignada.'), 'success');
        } else {
          await this.alerts.showNotification('Atención', serverMessages(resp, 'No se pudo asignar la contraseña.'), 'warning');
        }
      },
      error: async (err) => {
        this.saving.set(false);
        await this.alerts.showNotification('Error', serverMessages(err?.error, 'No se pudo asignar la contraseña.'), 'danger');
      }
    });
  }
}
