import { Component, Input, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { SharedModule } from '@shared/shared.module';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { PasswordRequirementsComponent } from '@shared/components/reusables/password-requirements/password-requirements.component';
import { PASSWORD_MAX_LENGTH, PASSWORD_POLICY_MESSAGE, passwordPolicyValidator } from '@shared/validators/password-policy';
import { serverMessages } from '@shared/functions/list-helpers';
import { ADMIN_ROLE_OPTIONS, AdminUserResponse } from '../models/admin.models';
import { AdminUserService } from '../services/admin.services';

/**
 * Crear (`POST users`, con contraseña inicial) o editar (`PUT users/{id}`: nombre, correo y rol) un administrador. El contrato
 * no tiene `GET users/{id}`: al editar se parte de la fila del listado. El MFA lo configura el usuario en su primer ingreso.
 */
@Component({
  selector: 'app-admin-user-form',
  imports: [SharedModule, PasswordRequirementsComponent],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-user"></em>{{ user ? 'Editar' : 'Nuevo' }} administrador</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      <form [formGroup]="form" class="erp-form" novalidate>
        <p class="form-text mt-0 mb-3">Los campos marcados con <span class="erp-required">*</span> son obligatorios.</p>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label" for="admin-name">Nombre <span class="erp-required">*</span></label>
            <input id="admin-name" class="form-control" formControlName="name" maxlength="150" [class.is-invalid]="invalid('name')" />
            @if (invalid('name')) {<div class="invalid-feedback">Indique el nombre.</div>}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="admin-email">Correo (usuario) <span class="erp-required">*</span></label>
            <input id="admin-email" type="email" class="form-control" formControlName="email" maxlength="190" autocomplete="off"
              [class.is-invalid]="invalid('email')" />
            @if (invalid('email')) {<div class="invalid-feedback">Correo no válido.</div>}
          </div>
          <div class="col-12">
            <label class="form-label" for="admin-role">Rol <span class="erp-required">*</span></label>
            <select id="admin-role" class="form-select" formControlName="role">
              @for (r of roles; track r.id) {<option [value]="r.id">{{ r.name }}</option>}
            </select>
            <div class="form-text">Quienes eran "soporte" en API-PRO quedaron como Solo lectura al migrar: si corresponde, asígneles Soporte aquí.</div>
          </div>
          @if (!user) {
          <div class="col-12">
            <label class="form-label" for="admin-password">Contraseña inicial <span class="erp-required">*</span></label>
            <div class="input-group has-validation">
              <input id="admin-password" [type]="showPassword ? 'text' : 'password'" class="form-control" formControlName="password"
                [attr.maxlength]="maxLength" autocomplete="new-password" [class.is-invalid]="invalid('password')" />
              <button type="button" class="btn btn-outline-secondary" (click)="showPassword = !showPassword"
                [attr.aria-label]="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                <em class="feather" [ngClass]="showPassword ? 'icon-eye-off' : 'icon-eye'"></em>
              </button>
              @if (invalid('password')) {<div class="invalid-feedback">{{ policyMessage }}</div>}
            </div>
            <app-password-requirements class="d-block mt-2" [value]="form.get('password')?.value"></app-password-requirements>
            <div class="form-text">Entréguela por un canal seguro. En su primer ingreso configurará la verificación en dos pasos.</div>
          </div>
          }
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
export class AdminUserFormComponent implements OnInit {
  /** Fila a editar; null = crear. */
  @Input() user: AdminUserResponse | null = null;

  readonly roles = ADMIN_ROLE_OPTIONS;
  readonly maxLength = PASSWORD_MAX_LENGTH;
  readonly policyMessage = PASSWORD_POLICY_MESSAGE;
  readonly saving = signal(false);
  showPassword = false;
  form: FormGroup;
  private submitted = false;

  constructor(private fb: FormBuilder, private users: AdminUserService, private alerts: AlertModalService, public activeModal: NgbActiveModal) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(150)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(190)]],
      role: ['operador', Validators.required],
      password: ['', [Validators.required, passwordPolicyValidator]]
    });
  }

  ngOnInit(): void {
    if (this.user) {
      this.form.removeControl('password');
      this.form.patchValue({ name: this.user.name, email: this.user.email, role: this.user.role });
    }
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
    const v = this.form.getRawValue();
    const base = { name: String(v.name).trim(), email: String(v.email).trim(), role: v.role };
    const call = this.user ? this.users.update(this.user.id, base) : this.users.create({ ...base, password: v.password });
    this.saving.set(true);
    call.subscribe({
      next: async (resp) => {
        this.saving.set(false);
        if (resp.succeeded) {
          this.activeModal.close(true);
          await this.alerts.showNotification('Listo', serverMessages(resp, 'Administrador guardado.'), 'success');
        } else {
          await this.alerts.showNotification('Atención', serverMessages(resp, 'No se pudo guardar el administrador.'), 'warning');
        }
      },
      error: async (err) => {
        this.saving.set(false);
        await this.alerts.showNotification('Error', serverMessages(err?.error, 'No se pudo guardar el administrador.'), 'danger');
      }
    });
  }
}
