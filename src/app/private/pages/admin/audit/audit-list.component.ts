import { Component, ViewChild, signal } from '@angular/core';
import { SharedModule } from '@shared/shared.module';
import { ListTableComponent } from '@shared/components/reusables/list-table/list-table.component';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { SearchBoxMultipleComponent } from '@shared/components/reusables/search-box-multiple/search-box-multiple.component';
import { ButtonResetFiltersComponent } from '@shared/components/reusables/button-reset-filters/button-reset-filters.component';
import { FilterSelectComponent } from '@shared/components/reusables/filter-select/filter-select.component';
import { DateRangeYmd, FilterDateRangeYmdComponent } from '@shared/components/reusables/filter-date-range-ymd/filter-date-range-ymd.component';
import { FiltersBox, SearchOptions } from '@shared/models/search-options.interface';
import { TableColumns } from '@shared/models/list-table.interface';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { col, query } from '@shared/functions/list-helpers';
import { addDaysYmd, limaTodayYmd } from '@shared/functions/lima-dates';
import { ACTOR_TYPE_OPTIONS, AuditLogResponse } from '../models/admin.models';
import { AuditService } from '../services/admin.services';

/**
 * Auditoría de la API SUNAT (`GET admin/audit`, solo superadmin): acciones del panel, de las empresas por la API y de las
 * tareas del sistema, con logins correctos / fallidos y bloqueos. Por defecto, los últimos 7 días (hora de Lima).
 */
@Component({
  selector: 'app-audit-list',
  imports: [SharedModule, ListTableComponent, PageHeaderComponent, SearchBoxMultipleComponent, ButtonResetFiltersComponent,
    FilterSelectComponent, FilterDateRangeYmdComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-file-text" title="AUDITORÍA" subtitle="Quién hizo qué y cuándo en la API SUNAT">
            <app-filter-date-range-ymd headerFilters #dateFilter [start]="startDate" [end]="endDate" (rangeDate)="setRange($event)"></app-filter-date-range-ymd>
            <app-filter-select headerFilters #actorFilter [items]="actorTypes" placeholder="Origen" [currentValue]="actorTipo" (filterChange)="actorTipo = $event; refresh()"></app-filter-select>
            <app-search-box-multiple headerFilters #searchBox [searchOptions]="searchOptions" (search)="search($event)" [currentValue]="text"></app-search-box-multiple>
            <app-button-reset-filters headerActions (buttonClick)="reset()"></app-button-reset-filters>
          </app-page-header>
          <div class="card-body p-0">
            <app-list-table [service]="audit" [columns]="columns" [getInputs]="getInputs()"></app-list-table>
          </div>
        </div>
      </div>
    </div>
  `
})
export class AuditListComponent {
  @ViewChild('actorFilter') actorFilter?: FilterSelectComponent;
  @ViewChild('searchBox') searchBox?: SearchBoxMultipleComponent;

  readonly actorTypes = ACTOR_TYPE_OPTIONS;
  readonly searchOptions: SearchOptions[] = [
    { label: 'Acción / Descripción / Actor', value: 1, placeholder: 'Buscar por acción, descripción o actor', validation: [], validation_desc: '', icon: 'search' }
  ];
  readonly columns: TableColumns<AuditLogResponse>[] = [
    col('FECHA', 'createdAtText'), { ...col<AuditLogResponse>('ORIGEN', 'actorText'), subProperty: 'actorEtiqueta' }, col('ACCIÓN', 'accion'),
    col('EMPRESA', 'tenantId'), col('DESCRIPCIÓN', 'descripcion'), col('IP', 'ip')
  ];

  startDate = '';
  endDate = '';
  actorTipo: string | null = null;
  text = '';
  readonly getInputs = signal('');

  constructor(public audit: AuditService, title: CustomTitleService) {
    title.set('Auditoría');
    this.defaultRange();
    this.refresh();
  }

  private defaultRange(): void {
    this.endDate = limaTodayYmd();
    this.startDate = addDaysYmd(this.endDate, -6);
  }

  /** Con las dos fechas filtra; al quitarlas (×) busca en todo el historial. */
  setRange(range: DateRangeYmd): void {
    this.startDate = range.startDate;
    this.endDate = range.endDate;
    this.refresh();
  }

  search(data: FiltersBox): void {
    this.text = data.searchData;
    this.refresh();
  }

  reset(): void {
    this.defaultRange();
    this.actorTipo = null;
    this.text = '';
    this.actorFilter?.resetFilter();
    this.searchBox?.resetComplete();
    this.refresh();
  }

  refresh(): void {
    this.getInputs.set(query({
      startDate: this.startDate, endDate: this.endDate, actorTipo: this.actorTipo, textFilter: this.text, refresh: Math.random()
    }));
  }
}
