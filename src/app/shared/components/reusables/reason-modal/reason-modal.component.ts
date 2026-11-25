import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { SharedModule } from '@shared/shared.module';

export interface ReasonModalResult {
  reason: string;
}

/**
 * Pide el motivo de una acción (suspender o activar una empresa). Con `required` (por defecto) el motivo es obligatorio;
 * sin él, es opcional. Cierra con { reason }.
 */
@Component({
  selector: 'app-reason-modal',
  imports: [SharedModule],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather {{ icon }}"></em>{{ title }}</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      @if (description) {
      <p class="text-muted">{{ description }}</p>
      }
      <form [formGroup]="form" class="erp-form" novalidate>
        <label class="form-label" for="reason-text">Motivo @if (required) {<span class="erp-required">*</span>}</label>
        <textarea id="reason-text" class="form-control" rows="3" formControlName="reason" [attr.maxlength]="maxLength"
          [placeholder]="placeholder" [class.is-invalid]="invalid()"></textarea>
        @if (invalid()) {
        <div class="invalid-feedback">Indique el motivo.</div>
        }
      </form>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" (click)="activeModal.dismiss()">Cerrar</button>
      <button type="button" class="btn {{ confirmClass }}" (click)="confirm()">{{ confirmText }}</button>
    </div>
  `
})
export class ReasonModalComponent implements OnInit {
  @Input() title = 'Motivo';
  @Input() description = '';
  @Input() icon = 'icon-edit-3';
  @Input() confirmText = 'Confirmar';
  @Input() confirmClass = 'btn-primary';
  @Input() placeholder = 'Queda registrado en la auditoría';
  @Input() required = true;
  @Input() maxLength = 400;

  form: FormGroup;
  private submitted = false;

  constructor(private fb: FormBuilder, public activeModal: NgbActiveModal) {
    this.form = this.fb.group({ reason: [''] });
  }

  ngOnInit(): void {
    const validators = [Validators.maxLength(this.maxLength)];
    if (this.required) {
      validators.push(Validators.required);
    }
    this.form.get('reason')!.setValidators(validators);
  }

  invalid(): boolean {
    const c = this.form.get('reason');
    return !!c && c.invalid && (c.touched || this.submitted);
  }

  confirm(): void {
    this.submitted = true;
    const reason = (this.form.value.reason ?? '').trim();
    if (this.required && !reason) {
      this.form.get('reason')!.setValue('');
    }
    if (this.form.invalid || (this.required && !reason)) {
      this.form.markAllAsTouched();
      return;
    }
    this.activeModal.close({ reason } as ReasonModalResult);
  }
}
