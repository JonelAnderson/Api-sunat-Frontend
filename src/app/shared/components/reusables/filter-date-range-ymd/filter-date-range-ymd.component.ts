import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { SharedModule } from '../../../shared.module';
import { MomentDateModule } from '@angular/material-moment-adapter';
import { MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import { MY_DATE_FORMATS } from '../../../functions/date-format';
import moment, { Moment } from 'moment';
import 'moment/locale/es';
import { FormControl, FormGroup } from '@angular/forms';

/** Rango emitido: fechas `YYYY-MM-DD`; las dos vacías cuando se quita el filtro. */
export interface DateRangeYmd {
  startDate: string;
  endDate: string;
}

/**
 * Filtro de rango de fechas para las cabeceras de listados (mismo alto, borde y foco que `app-filter-select`).
 * Emite `rangeDate` con `YYYY-MM-DD` cuando están las dos fechas, y `{ startDate: '', endDate: '' }` al quitarlas.
 * `start` / `end` fijan el valor desde el padre; `resetFilter()` lo limpia sin emitir (como los demás filtros).
 */
@Component({
  selector: 'app-filter-date-range-ymd',
  standalone: true,
  imports: [SharedModule, MomentDateModule],
  templateUrl: './filter-date-range-ymd.component.html',
  styleUrls: ['./filter-date-range-ymd.component.scss'],
  providers: [
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS },
    { provide: MAT_DATE_LOCALE, useValue: 'es' }
  ]
})
export class FilterDateRangeYmdComponent implements OnChanges {
  @Input() start: string;
  @Input() end: string;
  /** Fecha máxima elegible (hoy por defecto); null = sin límite. */
  @Input() maxDate: Moment | null = moment();
  @Input() placeholderStart = 'Desde';
  @Input() placeholderEnd = 'Hasta';
  /** Muestra la × para quitar las fechas; false cuando el listado necesita siempre un rango (p. ej. libro mayor). */
  @Input() clearable = true;
  @Output() rangeDate = new EventEmitter<DateRangeYmd>();

  readonly range = new FormGroup({
    startDate: new FormControl<Moment | string | null>(null),
    endDate: new FormControl<Moment | string | null>(null)
  });

  /** Hay alguna fecha elegida (muestra el botón para quitarlas). */
  readonly hasValue = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['start'] || changes['end']) {
      this.range.setValue({ startDate: this.start || null, endDate: this.end || null }, { emitEvent: false });
      this.syncHasValue();
    }
  }

  /** El calendario cierra al elegir la fecha final: entonces se emite el rango. */
  onDateChange(): void {
    this.syncHasValue();
    this.emitDates();
  }

  emitDates(): void {
    const start = this.toYmd(this.range.controls.startDate.value);
    const end = this.toYmd(this.range.controls.endDate.value);
    if (start && end) this.rangeDate.emit({ startDate: start, endDate: end });
  }

  /** Quita las fechas y avisa al listado. */
  clear(event?: Event): void {
    event?.stopPropagation();
    this.resetFilter();
    this.rangeDate.emit({ startDate: '', endDate: '' });
  }

  /** Limpia el filtro sin emitir (lo llama "Limpiar filtros" del listado). */
  resetFilter(): void {
    this.range.reset({ startDate: null, endDate: null }, { emitEvent: false });
    this.syncHasValue();
  }

  /** Un valor del control (Moment del calendario o el texto YYYY-MM-DD que puso el padre) como YYYY-MM-DD. */
  private toYmd(value: Moment | string | null | undefined): string {
    if (!value) return '';
    const date = moment.isMoment(value) ? value : moment(value, ['YYYY-MM-DD', moment.ISO_8601], true);
    return date.isValid() ? date.format('YYYY-MM-DD') : '';
  }

  private syncHasValue(): void {
    const { startDate, endDate } = this.range.getRawValue();
    this.hasValue.set(!!startDate || !!endDate);
  }
}
