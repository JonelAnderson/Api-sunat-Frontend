import { Component, ViewChild, computed, signal } from '@angular/core';
import { SharedModule } from '@shared/shared.module';
import { ListTableComponent } from '@shared/components/reusables/list-table/list-table.component';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { SearchBoxMultipleComponent } from '@shared/components/reusables/search-box-multiple/search-box-multiple.component';
import { ButtonResetFiltersComponent } from '@shared/components/reusables/button-reset-filters/button-reset-filters.component';
import { FiltersBox, SearchOptions } from '@shared/models/search-options.interface';
import { TableColumns } from '@shared/models/list-table.interface';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { col, query } from '@shared/functions/list-helpers';
import { limaMonthYm, ymToDisplay } from '@shared/functions/lima-dates';
import { UsageResponse } from '../../models/sunat.models';
import { UsageService } from '../../services/sunat.services';

/** Comprobantes emitidos por empresa en un mes (`GET usage?mes=yyyy-MM`; por defecto el mes actual de Lima). */
@Component({
  selector: 'app-usage-list',
  imports: [SharedModule, ListTableComponent, PageHeaderComponent, SearchBoxMultipleComponent, ButtonResetFiltersComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-bar-chart-2" title="USO DEL MES" [subtitle]="'Comprobantes por empresa · ' + monthText()"
            help="Suma facturas, boletas, notas de crédito y de débito por fecha de emisión del mes elegido. El límite es el del plan de la empresa.">
            <input headerFilters type="month" class="form-control" style="width: 170px;" aria-label="Mes" [value]="month()"
              [max]="currentMonth" (change)="setMonth($any($event.target).value)" />
            <app-search-box-multiple headerFilters #searchBox [searchOptions]="searchOptions" (search)="search($event)" [currentValue]="text"></app-search-box-multiple>
            <app-button-reset-filters headerActions (buttonClick)="reset()"></app-button-reset-filters>
          </app-page-header>
          <div class="card-body p-0">
            <app-list-table [service]="usage" [columns]="columns" [getInputs]="getInputs()"></app-list-table>
          </div>
        </div>
      </div>
    </div>
  `
})
export class UsageListComponent {
  @ViewChild('searchBox') searchBox?: SearchBoxMultipleComponent;

  readonly currentMonth = limaMonthYm();
  readonly searchOptions: SearchOptions[] = [
    { label: 'RUC / Nombre', value: 1, placeholder: 'Buscar por RUC o razón social', validation: [], validation_desc: '', icon: 'search' }
  ];
  readonly columns: TableColumns<UsageResponse>[] = [
    col('RUC', 'ruc'), col('RAZÓN SOCIAL', 'razonSocial'), col('PLAN', 'planText'), col('EMITIDOS / LÍMITE', 'usageText'),
    col('ACEPTADOS', 'accepted', 'number'), col('RECHAZADOS', 'rejected', 'number'), col('PENDIENTES', 'pending', 'number'),
    col('ANULADOS', 'voided', 'number')
  ];

  readonly month = signal(this.currentMonth);
  readonly monthText = computed(() => ymToDisplay(this.month()));
  text = '';
  readonly getInputs = signal('');

  constructor(public usage: UsageService, title: CustomTitleService) {
    title.set('Uso del mes');
    this.refresh();
  }

  setMonth(value: string): void {
    this.month.set(/^\d{4}-\d{2}$/.test(value) ? value : this.currentMonth);
    this.refresh();
  }

  search(data: FiltersBox): void {
    this.text = data.searchData;
    this.refresh();
  }

  reset(): void {
    this.month.set(this.currentMonth);
    this.text = '';
    this.searchBox?.resetComplete();
    this.refresh();
  }

  refresh(): void {
    this.getInputs.set(query({ mes: this.month(), textFilter: this.text, refresh: Math.random() }));
  }
}
