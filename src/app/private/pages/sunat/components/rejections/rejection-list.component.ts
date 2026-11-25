import { Component, DestroyRef, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { ListTableComponent } from '@shared/components/reusables/list-table/list-table.component';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { SearchBoxMultipleComponent } from '@shared/components/reusables/search-box-multiple/search-box-multiple.component';
import { ButtonResetFiltersComponent } from '@shared/components/reusables/button-reset-filters/button-reset-filters.component';
import { DateRangeYmd, FilterDateRangeYmdComponent } from '@shared/components/reusables/filter-date-range-ymd/filter-date-range-ymd.component';
import { FiltersBox, SearchOptions } from '@shared/models/search-options.interface';
import { TableColumns } from '@shared/models/list-table.interface';
import { TableAction } from '@shared/models/table-action.interface';
import { PermissionService } from '@shared/service/permission.service';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { actionsCol, col, query } from '@shared/functions/list-helpers';
import { addDaysYmd, limaTodayYmd } from '@shared/functions/lima-dates';
import { PERM, RejectionResponse } from '../../models/sunat.models';
import { saleKindFromCode } from '../../models/tenant-views.models';
import { RejectionService } from '../../services/sunat.services';

/**
 * Comprobantes rechazados u observados por SUNAT (`GET rejections`). Rango por fecha de emisión (Lima, por defecto los
 * últimos 7 días). El filtro por empresa llega por query string desde Empresas (`?tenantId=&tenant=`); el texto busca por
 * RUC o serie. "Ver comprobante" abre la página de la empresa en Comprobantes, filtrada por serie y correlativo (solo
 * facturas, boletas y notas: `tipo` 01 / 03 / 07 / 08).
 */
@Component({
  selector: 'app-rejection-list',
  imports: [SharedModule, ListTableComponent, PageHeaderComponent, SearchBoxMultipleComponent, ButtonResetFiltersComponent,
    FilterDateRangeYmdComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-alert-octagon" title="RECHAZOS SUNAT" subtitle="Comprobantes rechazados u observados, con el código y el motivo de SUNAT">
            @if (tenantName()) {
            <span headerFilters class="badge bg-light-primary text-primary d-inline-flex align-items-center gap-2 px-3 py-2">
              Empresa: {{ tenantName() }}
              <button type="button" class="btn-close btn-sm" aria-label="Quitar filtro de empresa" (click)="clearTenant()"></button>
            </span>
            }
            <app-filter-date-range-ymd headerFilters #dateFilter [start]="startDate" [end]="endDate" [clearable]="false"
              (rangeDate)="setRange($event)"></app-filter-date-range-ymd>
            <app-search-box-multiple headerFilters #searchBox [searchOptions]="searchOptions" (search)="search($event)" [currentValue]="text"></app-search-box-multiple>
            <app-button-reset-filters headerActions (buttonClick)="reset()"></app-button-reset-filters>
          </app-page-header>
          <div class="card-body p-0">
            <app-list-table [service]="rejections" [columns]="columns" [getInputs]="getInputs()" [actions]="actions" (actionTriggered)="onAction($event)"></app-list-table>
          </div>
        </div>
      </div>
    </div>
  `
})
export class RejectionListComponent {
  private destroyRef = inject(DestroyRef);
  @ViewChild('searchBox') searchBox?: SearchBoxMultipleComponent;

  readonly searchOptions: SearchOptions[] = [
    { label: 'RUC / Serie', value: 1, placeholder: 'Buscar por RUC de la empresa o serie', validation: [], validation_desc: '', icon: 'search' }
  ];
  readonly columns: TableColumns<RejectionResponse>[] = [
    { ...col<RejectionResponse>('EMPRESA', 'razonSocial'), subProperty: 'ruc' }, col('TIPO', 'tipoText'), col('COMPROBANTE', 'documentText'),
    col('EMISIÓN', 'fechaText'), col('CÓDIGO', 'sunatCode'), col('MOTIVO SUNAT', 'sunatDescription'), actionsCol()
  ];
  readonly actions: TableAction[] = [
    { id: 'document', label: 'Ver comprobante', icon: 'visibility', color: 'primary', tooltip: 'Abre la empresa en Comprobantes con este documento',
      visible: (r: RejectionResponse) => !!saleKindFromCode(r.tipo) && this.perms.hasPermission(PERM.tenantsView) }
  ];

  tenantId: number | null = null;
  readonly tenantName = signal('');
  startDate = '';
  endDate = '';
  text = '';
  readonly getInputs = signal('');

  constructor(public rejections: RejectionService, private route: ActivatedRoute, private router: Router, private perms: PermissionService,
    title: CustomTitleService) {
    title.set('Rechazos SUNAT');
    this.defaultRange();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = Number(params.get('tenantId'));
      this.tenantId = id > 0 ? id : null;
      this.tenantName.set(this.tenantId ? params.get('tenant') ?? `#${this.tenantId}` : '');
      this.refresh();
    });
  }

  private defaultRange(): void {
    this.endDate = limaTodayYmd();
    this.startDate = addDaysYmd(this.endDate, -6);
  }

  setRange(range: DateRangeYmd): void {
    if (range.startDate && range.endDate) {
      this.startDate = range.startDate;
      this.endDate = range.endDate;
      this.refresh();
    }
  }

  search(data: FiltersBox): void {
    this.text = data.searchData;
    this.refresh();
  }

  clearTenant(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  reset(): void {
    this.defaultRange();
    this.text = '';
    this.searchBox?.resetComplete();
    if (this.tenantId) {
      this.clearTenant();
    } else {
      this.refresh();
    }
  }

  onAction(event: { action: string; row: RejectionResponse }): void {
    const r = event.row;
    const kind = saleKindFromCode(r.tipo);
    if (event.action !== 'document' || !kind || !r.tenantId) {
      return;
    }
    // fechaEmision (yyyy-MM-dd) solo filtra las notas, que no tienen filtro por correlativo.
    void this.router.navigate(['/private/sunat/tenants', r.tenantId], {
      queryParams: { tab: 'comprobantes', tipo: kind, serie: r.serie, correlativo: r.correlativo, fecha: (r.fechaEmision ?? '').substring(0, 10) || null }
    });
  }

  refresh(): void {
    this.getInputs.set(query({
      startDate: this.startDate, endDate: this.endDate, tenantId: this.tenantId, textFilter: this.text, refresh: Math.random()
    }));
  }
}
