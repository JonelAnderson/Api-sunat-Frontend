import { Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addDaysYmd, limaTodayYmd, ymdToDisplay } from '@shared/functions/lima-dates';
import { Json } from '../../models/tenant-views.models';
import { EmissionService } from '../../services/emission.service';
import { EmissionActionsComponent, withReason } from './emission-actions.component';
import { EmissionSubmitter, IssueOutcome } from './emission-submit';
import { EmissionContext, EmitType } from './emission-types';

/** Plazo de SUNAT para el resumen diario: el día de emisión o hasta 7 días calendario después. */
const SUMMARY_DAYS = 7;

/**
 * Resumen diario de boletas (§11.7): `POST tenants/{id}/resumenes` con `{ fecha_resumen }` (+ `enviar_automatico` y `motivo`
 * opcionales). La API junta las boletas **pendientes** de esa fecha que aún no están en otro resumen; si no hay, responde
 * con el error. Solo el envío: para anular una boleta se usa "Anular (RC)" desde su detalle (§11.8.2).
 */
@Component({
  selector: 'app-summary-emit-form',
  imports: [FormsModule, EmissionActionsComponent],
  template: `
    <div class="erp-callout mb-3"><em class="feather icon-info"></em>
      <span>Informa a SUNAT las boletas que quedaron <strong>pendientes</strong> (por ejemplo, las emitidas con "solo registrar") de la fecha elegida. SUNAT acepta el
        resumen del mismo día o hasta {{ days }} días después ({{ minText }} a {{ todayText }}). Las boletas ya incluidas en un resumen en proceso o aceptado no se
        vuelven a enviar.</span>
    </div>
    <form class="erp-form" novalidate (ngSubmit)="submit()">
      <div class="row g-2">
        <div class="col-6 col-md-3">
          <label class="form-label small" for="sm-fecha">Fecha de las boletas <span class="erp-required">*</span></label>
          <input id="sm-fecha" type="date" class="form-control form-control-sm" name="fecha_resumen" [(ngModel)]="fecha" [min]="min" [max]="today"
            [class.is-invalid]="!!err('fecha_resumen')" />
          @if (err('fecha_resumen')) {<div class="invalid-feedback">{{ err('fecha_resumen') }}</div>}
        </div>
        <div class="col-md-5">
          <label class="form-label small" for="sm-envio">Envío a SUNAT</label>
          <select id="sm-envio" class="form-select form-select-sm" name="envio" [(ngModel)]="auto">
            <option [ngValue]="true">Enviar a SUNAT al crear</option>
            <option [ngValue]="false">Dejar pendiente (enviar después)</option>
          </select>
        </div>
      </div>
      <button type="submit" class="d-none" aria-hidden="true" tabindex="-1"></button>
    </form>
    <app-emission-actions [submitter]="sub" [(motivo)]="motivo" [label]="type().verb" [disabled]="!ctx().active" [changed]="sub.differsFromLast(build().body)"
      (send)="submit()" (retry)="retry()"></app-emission-actions>
  `
})
export class SummaryEmitFormComponent {
  private service = inject(EmissionService);

  readonly ctx = input.required<EmissionContext>();
  readonly type = input.required<EmitType>();
  readonly issued = output<IssueOutcome>();

  readonly sub = new EmissionSubmitter(this.service, (k) => k === 'fecha_resumen' || k === 'motivo');
  readonly days = SUMMARY_DAYS;
  readonly today = limaTodayYmd();
  readonly min = addDaysYmd(this.today, -SUMMARY_DAYS);
  readonly todayText = ymdToDisplay(this.today);
  readonly minText = ymdToDisplay(this.min);
  fecha = this.today;
  auto = true;
  motivo = '';

  err(k: string): string {
    return this.sub.errors()[k] ?? '';
  }

  build(): { body: Json; errors: Record<string, string> } {
    const e: Record<string, string> = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.fecha)) {
      e['fecha_resumen'] = 'Indique la fecha.';
    } else if (this.fecha > this.today || this.fecha < this.min) {
      e['fecha_resumen'] = `Debe estar entre el ${this.minText} y hoy.`;
    }
    const b: Json = { fecha_resumen: this.fecha, enviar_automatico: this.auto };
    withReason(b, this.motivo, e);
    return { body: b, errors: e };
  }

  submit(): void {
    const { body, errors } = this.build();
    if (!this.ctx().active || this.sub.blockWith(errors)) {
      return;
    }
    this.sub.submit(this.ctx().tenantId, 'resumenes', body, (o) => this.issued.emit(o));
  }

  retry(): void {
    this.sub.retrySame((o) => this.issued.emit(o));
  }
}
