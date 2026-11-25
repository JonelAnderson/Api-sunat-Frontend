import { Component, ViewChild, inject, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { SharedModule } from '@shared/shared.module';
import { ListTableComponent } from '@shared/components/reusables/list-table/list-table.component';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { SearchBoxMultipleComponent } from '@shared/components/reusables/search-box-multiple/search-box-multiple.component';
import { ButtonResetFiltersComponent } from '@shared/components/reusables/button-reset-filters/button-reset-filters.component';
import { FilterByStateComponent } from '@shared/components/reusables/filter-by-state/filter-by-state.component';
import { FiltersBox, SearchOptions } from '@shared/models/search-options.interface';
import { TableAction } from '@shared/models/table-action.interface';
import { TableColumns } from '@shared/models/list-table.interface';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { PermissionService } from '@shared/service/permission.service';
import { STATE_MENU, actionsCol, col, openModal, query, runAction } from '@shared/functions/list-helpers';
import { PERM } from '../../sunat/models/sunat.models';
import { PlanRow, SYSTEM_PLAN_SLUGS } from '../models/platform.models';
import { PlanService } from '../services/platform.services';
import { PlanDetailComponent } from './plan-detail.component';
import { PlanFormComponent } from './plan-form.component';

/**
 * Planes (`/private/platform/plans`, `Admin.Plans.View`): la tabla `plans` que leen `/api/v1/planes`, la suscripción y el
 * cupo. Crear, editar y activar / desactivar con `Admin.Plans.Manage` (operador o superior); eliminar con
 * `Admin.Plans.Delete` (solo superadmin, solo sin suscripciones). `free`, `pro` y `business` son del sistema: no se ofrece
 * eliminarlos y su slug no se edita (§10.1).
 */
@Component({
  selector: 'app-plan-list',
  imports: [SharedModule, ListTableComponent, PageHeaderComponent, SearchBoxMultipleComponent, ButtonResetFiltersComponent, FilterByStateComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-package" title="PLANES" subtitle="Planes de suscripción de la API SUNAT: precios, límites y funcionalidades"
            help="Free, Pro y Business son del sistema: no cambian de slug ni se eliminan. Un plan inactivo no se ofrece en /api/v1/planes. Eliminar solo es posible sin suscripciones.">
            <app-filter-by-state headerFilters #stateFilter [currentMenu]="state!" [items]="stateMenu" (filterChange)="state = $event; refresh()"></app-filter-by-state>
            <app-search-box-multiple headerFilters #searchBox [searchOptions]="searchOptions" (search)="search($event)" [currentValue]="text"></app-search-box-multiple>
            <app-button-reset-filters headerActions (buttonClick)="reset()"></app-button-reset-filters>
            @if (canManage) {
            <button headerActions type="button" class="btn btn-primary" (click)="openForm(null)"><em class="feather icon-plus"></em>NUEVO PLAN</button>
            }
          </app-page-header>
          <div class="card-body p-0">
            <app-list-table [service]="plans" [columns]="columns" [getInputs]="getInputs()" [actions]="actions" (actionTriggered)="onAction($event)"></app-list-table>
          </div>
        </div>
      </div>
    </div>
  `
})
export class PlanListComponent {
  readonly plans = inject(PlanService);
  private modal = inject(NgbModal);
  private alerts = inject(AlertModalService);
  private perms = inject(PermissionService);
  @ViewChild('stateFilter') stateFilter?: FilterByStateComponent;
  @ViewChild('searchBox') searchBox?: SearchBoxMultipleComponent;

  readonly canManage = this.perms.hasPermission(PERM.plansManage);
  readonly canDelete = this.perms.hasPermission(PERM.plansDelete);
  readonly stateMenu = STATE_MENU;
  readonly searchOptions: SearchOptions[] = [
    { label: 'Slug / Nombre', value: 1, placeholder: 'Buscar por slug o nombre', validation: [], validation_desc: '', icon: 'search' }
  ];
  readonly columns: TableColumns<PlanRow>[] = [
    { ...col<PlanRow>('PLAN', 'name'), subProperty: 'kindText' }, col('PRECIO', 'priceText'), col('DOCUMENTOS / MES', 'documentsText'),
    col('FUNCIONALIDADES', 'featuresCount', 'number'), col('USO', 'usageText'), col('ORDEN', 'sortOrder', 'number'),
    col('ESTADO', 'statusText', 'badge'), actionsCol()
  ];
  readonly actions: TableAction[] = [
    { id: 'detail', label: 'Ver detalle', icon: 'visibility', color: 'primary', tooltip: 'Límites y funcionalidades' },
    { id: 'edit', label: 'Editar', icon: 'border_color', color: 'primary', visible: () => this.canManage },
    { id: 'toggle', label: (r: PlanRow) => (r.isActive ? 'Desactivar' : 'Activar'), icon: (r: PlanRow) => (r.isActive ? 'toggle_off' : 'toggle_on'),
      color: 'accent', visible: () => this.canManage },
    { id: 'delete', label: 'Eliminar', icon: 'delete', color: 'warn', tooltip: 'Solo planes sin suscripciones',
      visible: (r: PlanRow) => this.canDelete && !this.isSystem(r) }
  ];

  state: number | null = null;
  text = '';
  readonly getInputs = signal('');

  constructor() {
    inject(CustomTitleService).set('Planes');
    this.refresh();
  }

  private isSystem(r: PlanRow): boolean {
    return r.isSystem || SYSTEM_PLAN_SLUGS.includes(r.slug);
  }

  search(data: FiltersBox): void {
    this.text = data.searchData;
    this.refresh();
  }

  reset(): void {
    this.state = null;
    this.text = '';
    this.stateFilter?.resetFilter();
    this.searchBox?.resetComplete();
    this.refresh();
  }

  refresh(): void {
    this.getInputs.set(query({ stateFilter: this.state, textFilter: this.text, refresh: Math.random() }));
  }

  openForm(plan: PlanRow | null): void {
    openModal<boolean>(this.modal, PlanFormComponent, (ref) => (ref.componentInstance.plan = plan), () => this.refresh(), 'xl');
  }

  async onAction(event: { action: string; row: PlanRow }): Promise<void> {
    const p = event.row;
    switch (event.action) {
      case 'detail':
        openModal<boolean>(this.modal, PlanDetailComponent, (ref) => (ref.componentInstance.plan = p), () => undefined, 'lg');
        break;
      case 'edit':
        this.openForm(p);
        break;
      case 'toggle': {
        const ok = await this.alerts.show({
          title: p.isActive ? 'Desactivar plan' : 'Activar plan', type: 'warning', showCancel: true, confirmText: p.isActive ? 'Desactivar' : 'Activar',
          message: p.isActive
            ? `¿Desactivar el plan ${p.name} (${p.slug})? Dejará de ofrecerse en /api/v1/planes; las suscripciones que ya lo tienen no cambian.`
            : `¿Activar el plan ${p.name} (${p.slug})? Volverá a ofrecerse en /api/v1/planes.`
        });
        if (ok) {
          runAction(this.alerts, this.plans.toggle(p.id), 'No se pudo cambiar el estado del plan.', () => this.refresh(),
            p.isActive ? 'Plan desactivado.' : 'Plan activado.');
        }
        break;
      }
      case 'delete': {
        if ((p.subscriptionsCount ?? 0) > 0) {
          await this.alerts.showNotification('Atención', `El plan ${p.name} tiene ${p.subscriptionsCount} suscripción(es): no se puede eliminar. Puede desactivarlo.`, 'warning');
          return;
        }
        const ok = await this.alerts.show({
          title: 'Eliminar plan', type: 'danger', showCancel: true, confirmText: 'Eliminar',
          message: `¿Eliminar el plan ${p.name} (${p.slug})? No se puede deshacer.`
        });
        if (ok) {
          runAction(this.alerts, this.plans.remove(p.id), 'No se pudo eliminar el plan.', () => this.refresh(), 'Plan eliminado.');
        }
        break;
      }
    }
  }
}
