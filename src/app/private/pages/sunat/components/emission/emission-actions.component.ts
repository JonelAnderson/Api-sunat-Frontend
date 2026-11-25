import { Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { REASON_MAX } from '../../models/document-actions.models';
import { EmissionSubmitter } from './emission-submit';

/**
 * Pie común de los formularios de emisión: motivo opcional del panel (queda en la auditoría, no viaja a `/api/v1`), los
 * errores sin campo, el aviso de "resultado desconocido" con "Reintentar la misma emisión" (misma `Idempotency-Key`) y el
 * botón de emitir. El botón se deshabilita mientras se envía (un doble clic no manda dos peticiones).
 */
@Component({
  selector: 'app-emission-actions',
  imports: [FormsModule],
  template: `
    <div class="row g-2 mt-1">
      <div class="col-md-8">
        <label class="form-label small" [for]="uid + '-motivo'">Motivo (opcional, queda en la auditoría)</label>
        <textarea [id]="uid + '-motivo'" class="form-control form-control-sm" rows="2" [attr.maxlength]="reasonMax" [ngModel]="motivo()"
          (ngModelChange)="motivo.set($event)" [disabled]="submitter().sending()" placeholder="Por ejemplo: emitida por soporte a pedido de la empresa"
          [class.is-invalid]="!!submitter().errors()['motivo']"></textarea>
        @if (submitter().errors()['motivo']) {<div class="invalid-feedback">{{ submitter().errors()['motivo'] }}</div>}
      </div>
    </div>

    @if (submitter().unknown()) {
    <div class="alert alert-warning small mt-3 mb-0" role="alert">
      <div class="d-flex flex-wrap gap-2 align-items-start justify-content-between">
        <span><em class="feather icon-alert-triangle me-1"></em>{{ submitter().unknown() }}</span>
        <button type="button" class="btn btn-sm btn-warning" [disabled]="submitter().sending()" (click)="retry.emit()">
          @if (submitter().sending()) {<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>}Reintentar la misma emisión
        </button>
      </div>
      @if (changed()) {
      <div class="mt-2"><strong>Cambió el formulario:</strong> "Reintentar" envía lo del último intento; "{{ label() }}" enviaría lo nuevo con otra clave y, si el
        intento anterior sí se emitió, quedarían dos comprobantes. Reintente primero.</div>
      }
    </div>
    }

    @if (submitter().error() || submitter().others().length) {
    <div class="alert alert-danger py-2 small mt-3 mb-0" role="alert">
      @if (submitter().error()) {<div>{{ submitter().error() }}</div>}
      @for (o of submitter().others(); track $index) {<div>{{ o }}</div>}
    </div>
    }

    <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center border-top pt-3 mt-3">
      <span class="small text-muted">
        La API valida y calcula los totales oficiales. Cada emisión lleva una clave de idempotencia: un doble clic o un reintento no emiten dos veces.
        @if (submitter().currentKey()) {<span class="ms-1">Clave: …{{ submitter().currentKey().slice(-8) }}</span>}
      </span>
      <button type="button" class="btn btn-primary" [disabled]="disabled() || submitter().sending()" (click)="send.emit()">
        @if (submitter().sending()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
        <em class="feather icon-send me-1"></em>{{ label() }}
      </button>
    </div>
  `
})
export class EmissionActionsComponent {
  readonly submitter = input.required<EmissionSubmitter>();
  readonly label = input('Emitir');
  readonly disabled = input(false);
  /** El formulario cambió después de un intento sin respuesta clara (`EmissionSubmitter.differsFromLast`). */
  readonly changed = input(false);
  readonly motivo = model('');
  readonly send = output<void>();
  readonly retry = output<void>();

  readonly reasonMax = REASON_MAX;
  readonly uid = `ea-${Math.random().toString(36).substring(2, 8)}`;
}

/** Valida el motivo opcional (máx. 400) y lo agrega al cuerpo si tiene texto. */
export function withReason(body: Record<string, unknown>, motivo: string, errors: Record<string, string>): void {
  const m = (motivo ?? '').trim();
  if (m.length > REASON_MAX) {
    errors['motivo'] = `Máximo ${REASON_MAX} caracteres.`;
  } else if (m) {
    body['motivo'] = m;
  }
}
