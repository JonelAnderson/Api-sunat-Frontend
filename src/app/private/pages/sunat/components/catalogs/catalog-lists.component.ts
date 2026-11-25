import { Component, Directive, ViewChild, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { ListTableComponent } from '@shared/components/reusables/list-table/list-table.component';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { SearchBoxMultipleComponent } from '@shared/components/reusables/search-box-multiple/search-box-multiple.component';
import { ButtonResetFiltersComponent } from '@shared/components/reusables/button-reset-filters/button-reset-filters.component';
import { FilterByStateComponent } from '@shared/components/reusables/filter-by-state/filter-by-state.component';
import { FilterSelectComponent } from '@shared/components/reusables/filter-select/filter-select.component';
import { FiltersBox, SearchOptions } from '@shared/models/search-options.interface';
import { TableAction } from '@shared/models/table-action.interface';
import { TableColumns } from '@shared/models/list-table.interface';
import { MenuItems } from '@shared/models/menu-items.interface';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { actionsCol, col, query } from '@shared/functions/list-helpers';
import { BranchRow, SERIES_TYPE_OPTIONS, SeriesRow } from '../../models/sunat.models';
import { BranchService, SeriesService } from '../../services/sunat.services';
import { TenantPickerComponent, TenantPick } from '../common/tenant-picker.component';

const STATE_ITEMS: MenuItems[] = [
  { type: 'link', id: 'all', icon: 'layers', label: 'Todas' },
  { type: 'link', id: 'Activo', value: 1, icon: 'check-circle', label: 'Activas', class: { icon: 'text-success' } },
  { type: 'link', id: 'Inactivo', value: 0, icon: 'x-circle', label: 'Inactivas', class: { icon: 'text-danger' } }
];

/** Filtros comunes de Sucursales y Series: empresa (`tenantId`), estado (`stateFilter`) y texto. */
@Directive()
abstract class CatalogList<T extends { tenantId: number }> {
  protected router = inject(Router);
  @ViewChild('stateFilter') stateFilter?: FilterByStateComponent;
  @ViewChild('searchBox') searchBox?: SearchBoxMultipleComponent;

  readonly stateItems = STATE_ITEMS;
  readonly tenantId = signal<number | null>(null);
  readonly tenantLabel = signal('');
  readonly getInputs = signal('');
  readonly actions: TableAction[] = [
    { id: 'tenant', label: 'Ver empresa', icon: 'business', color: 'primary', tooltip: 'Abre la página de la empresa (pestaña Configuración)' }
  ];
  state: number | null = null;
  text = '';

  constructor() {
    const p = inject(ActivatedRoute).snapshot.queryParamMap;
    const id = Number(p.get('tenantId'));
    if (id > 0) {
      this.tenantId.set(id);
      this.tenantLabel.set(p.get('tenant') ?? '');
    }
  }

  setTenant(t: TenantPick | null): void {
    this.tenantId.set(t?.id ?? null);
    this.tenantLabel.set(t?.label ?? '');
    this.refresh();
  }

  search(data: FiltersBox): void {
    this.text = data.searchData;
    this.refresh();
  }

  protected resetCommon(): void {
    this.state = null;
    this.text = '';
    this.tenantId.set(null);
    this.tenantLabel.set('');
    this.stateFilter?.resetFilter();
    this.searchBox?.resetComplete();
  }

  protected setInputs(extra: Record<string, string | number | null> = {}): void {
    this.getInputs.set(query({ tenantId: this.tenantId(), stateFilter: this.state, textFilter: this.text, ...extra, refresh: Math.random() }));
  }

  onAction(event: { action: string; row: T }): void {
    if (event.action === 'tenant') {
      void this.router.navigate(['/private/sunat/tenants', event.row.tenantId], { queryParams: { tab: 'configuracion' } });
    }
  }

  abstract refresh(): void;
}

/** Sucursales de todas las empresas (`GET branches`, `Admin.Tenants.View`, solo lectura: se editan en la Configuración de cada empresa, fase C). */
@Component({
  selector: 'app-branch-list',
  imports: [SharedModule, ListTableComponent, PageHeaderComponent, SearchBoxMultipleComponent, ButtonResetFiltersComponent, FilterByStateComponent,
    TenantPickerComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-map-pin" title="SUCURSALES" subtitle="Establecimientos de todas las empresas emisoras"
            help="Solo lectura (se editan en la Configuración de la empresa: Ver empresa). Orden: razón social, la principal primero y luego por nombre. El código de local es el anexo SUNAT del establecimiento.">
            <app-tenant-picker headerFilters [value]="tenantId()" [label]="tenantLabel()" (tenantChange)="setTenant($event)"></app-tenant-picker>
            <app-filter-by-state headerFilters #stateFilter [currentMenu]="state!" [items]="stateItems" (filterChange)="state = $event; refresh()"></app-filter-by-state>
            <app-search-box-multiple headerFilters #searchBox [searchOptions]="searchOptions" (search)="search($event)" [currentValue]="text"></app-search-box-multiple>
            <app-button-reset-filters headerActions (buttonClick)="reset()"></app-button-reset-filters>
          </app-page-header>
          <div class="card-body p-0">
            <app-list-table [service]="service" [columns]="columns" [getInputs]="getInputs()" [actions]="actions" (actionTriggered)="onAction($event)"></app-list-table>
          </div>
        </div>
      </div>
    </div>
  `
})
export class BranchListComponent extends CatalogList<BranchRow> {
  readonly service = inject(BranchService);
  readonly searchOptions: SearchOptions[] = [
    { label: 'Sucursal / Empresa', value: 1, placeholder: 'Nombre, código de local, RUC o razón social', validation: [], validation_desc: '', icon: 'search' }
  ];
  readonly columns: TableColumns<BranchRow>[] = [
    { ...col<BranchRow>('EMPRESA', 'razonSocial'), subProperty: 'ruc' }, { ...col<BranchRow>('SUCURSAL', 'nombre'), subProperty: 'principalText' },
    col('CÓDIGO DE LOCAL', 'codLocal'), { ...col<BranchRow>('DIRECCIÓN', 'direccion'), subProperty: 'ubigeo' }, col('SERIES', 'totalSeries', 'number'),
    col('ESTADO', 'statusText', 'badge'), actionsCol()
  ];

  constructor() {
    super();
    inject(CustomTitleService).set('Sucursales');
    this.refresh();
  }

  reset(): void {
    this.resetCommon();
    this.refresh();
  }

  refresh(): void {
    this.setInputs();
  }
}

/** Series de todas las empresas (`GET series`, `Admin.Tenants.View`, solo lectura). */
@Component({
  selector: 'app-series-list',
  imports: [SharedModule, ListTableComponent, PageHeaderComponent, SearchBoxMultipleComponent, ButtonResetFiltersComponent, FilterByStateComponent,
    FilterSelectComponent, TenantPickerComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-hash" title="SERIES" subtitle="Series de comprobantes de todas las empresas emisoras"
            help="Solo lectura (se editan en la Configuración de la empresa). Correlativo = el último emitido; siguiente número = el que tomará la próxima emisión. Orden: razón social, tipo y serie.">
            <app-tenant-picker headerFilters [value]="tenantId()" [label]="tenantLabel()" (tenantChange)="setTenant($event)"></app-tenant-picker>
            <app-filter-select headerFilters #typeFilter [items]="types" placeholder="Tipo" minWidth="200px" [currentValue]="tipo" (filterChange)="tipo = $event; refresh()"></app-filter-select>
            <app-filter-by-state headerFilters #stateFilter [currentMenu]="state!" [items]="stateItems" (filterChange)="state = $event; refresh()"></app-filter-by-state>
            <app-search-box-multiple headerFilters #searchBox [searchOptions]="searchOptions" (search)="search($event)" [currentValue]="text"></app-search-box-multiple>
            <app-button-reset-filters headerActions (buttonClick)="reset()"></app-button-reset-filters>
          </app-page-header>
          <div class="card-body p-0">
            <app-list-table [service]="service" [columns]="columns" [getInputs]="getInputs()" [actions]="actions" (actionTriggered)="onAction($event)"></app-list-table>
          </div>
        </div>
      </div>
    </div>
  `
})
export class SeriesListComponent extends CatalogList<SeriesRow> {
  @ViewChild('typeFilter') typeFilter?: FilterSelectComponent;
  readonly service = inject(SeriesService);
  readonly types = SERIES_TYPE_OPTIONS;
  readonly searchOptions: SearchOptions[] = [
    { label: 'Serie / Empresa', value: 1, placeholder: 'Serie, RUC o razón social', validation: [], validation_desc: '', icon: 'search' }
  ];
  readonly columns: TableColumns<SeriesRow>[] = [
    { ...col<SeriesRow>('EMPRESA', 'razonSocial'), subProperty: 'ruc' }, { ...col<SeriesRow>('TIPO', 'tipoNombre'), subProperty: 'tipoDocumento' },
    col('SERIE', 'serie'), col('CORRELATIVO', 'correlativoText'), col('SIGUIENTE', 'siguienteNumero'), col('SUCURSAL', 'sucursalNombre'),
    col('ESTADO', 'statusText', 'badge'), actionsCol()
  ];
  tipo: string | null = null;

  constructor() {
    super();
    inject(CustomTitleService).set('Series');
    this.refresh();
  }

  reset(): void {
    this.resetCommon();
    this.tipo = null;
    this.typeFilter?.resetFilter();
    this.refresh();
  }

  refresh(): void {
    this.setInputs({ tipo: this.tipo });
  }
}
