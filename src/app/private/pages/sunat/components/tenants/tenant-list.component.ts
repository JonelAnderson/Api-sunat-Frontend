import { Component, ViewChild, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { SharedModule } from '@shared/shared.module';
import { ListTableComponent } from '@shared/components/reusables/list-table/list-table.component';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { SearchBoxMultipleComponent } from '@shared/components/reusables/search-box-multiple/search-box-multiple.component';
import { ButtonResetFiltersComponent } from '@shared/components/reusables/button-reset-filters/button-reset-filters.component';
import { FilterByStateComponent } from '@shared/components/reusables/filter-by-state/filter-by-state.component';
import { FilterSelectComponent } from '@shared/components/reusables/filter-select/filter-select.component';
import { ReasonModalComponent, ReasonModalResult } from '@shared/components/reusables/reason-modal/reason-modal.component';
import { FiltersBox, SearchOptions } from '@shared/models/search-options.interface';
import { TableAction } from '@shared/models/table-action.interface';
import { TableColumns } from '@shared/models/list-table.interface';
import { PermissionService } from '@shared/service/permission.service';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { MenuItems } from '@shared/models/menu-items.interface';
import { actionsCol, col, openModal, query, runAction } from '@shared/functions/list-helpers';
import { ENVIRONMENT_OPTIONS, Environment, PERM, PLAN_OPTIONS, PlanCode, TenantResponse } from '../../models/sunat.models';
import { TenantService } from '../../services/sunat.services';
import { TenantPlanComponent } from './tenant-plan.component';
import { TenantFormComponent } from './tenant-form.component';
import { openApiCredentials } from '../common/api-credentials-modal.component';
import { OneTimeCredentials } from '../../models/tenant-admin.models';

const STATE_ITEMS: MenuItems[] = [
  { type: 'link', id: 'all', icon: 'layers', label: 'Todas' },
  { type: 'link', id: 'Activo', value: 1, icon: 'check-circle', label: 'Activas', class: { icon: 'text-success' } },
  { type: 'link', id: 'Inactivo', value: 0, icon: 'x-circle', label: 'Suspendidas', class: { icon: 'text-danger' } }
];

/**
 * Empresas emisoras de la API SUNAT: filtros, página de la empresa, suspender / activar (con motivo), cambiar plan y, con
 * `Admin.Tenants.Edit`, "Nueva empresa" (§11.3): al crearla muestra una sola vez la api_key y el api_secret y abre su página.
 */
@Component({
  selector: 'app-tenant-list',
  imports: [SharedModule, ListTableComponent, PageHeaderComponent, SearchBoxMultipleComponent, ButtonResetFiltersComponent,
    FilterByStateComponent, FilterSelectComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-briefcase" title="EMPRESAS EMISORAS" subtitle="Todas las empresas que emiten con la API SUNAT"
            help="Una empresa suspendida recibe 403 en toda la API hasta que se active. El uso del mes cuenta facturas, boletas y notas.">
            <app-filter-by-state headerFilters #stateFilter [currentMenu]="state!" [items]="stateItems" (filterChange)="state = $event; refresh()"></app-filter-by-state>
            <app-filter-select headerFilters #envFilter [items]="environments" placeholder="Ambiente" [currentValue]="environment" (filterChange)="environment = $event; refresh()"></app-filter-select>
            <app-filter-select headerFilters #planFilter [items]="plans" placeholder="Plan" minWidth="140px" [currentValue]="plan" (filterChange)="plan = $event; refresh()"></app-filter-select>
            <app-search-box-multiple headerFilters #searchBox [searchOptions]="searchOptions" (search)="search($event)" [currentValue]="text"></app-search-box-multiple>
            <app-button-reset-filters headerActions (buttonClick)="reset()"></app-button-reset-filters>
            @if (canEdit) {
            <button headerActions type="button" class="btn btn-primary" (click)="create()"><em class="feather icon-plus me-1"></em>Nueva empresa</button>
            }
          </app-page-header>
          <div class="card-body p-0">
            <app-list-table [service]="tenants" [columns]="columns" [getInputs]="getInputs()" [actions]="actions" (actionTriggered)="onAction($event)"></app-list-table>
          </div>
        </div>
      </div>
    </div>
  `
})
export class TenantListComponent {
  @ViewChild('stateFilter') stateFilter?: FilterByStateComponent;
  @ViewChild('envFilter') envFilter?: FilterSelectComponent;
  @ViewChild('planFilter') planFilter?: FilterSelectComponent;
  @ViewChild('searchBox') searchBox?: SearchBoxMultipleComponent;

  readonly stateItems = STATE_ITEMS;
  readonly environments = ENVIRONMENT_OPTIONS;
  readonly plans = PLAN_OPTIONS;
  readonly searchOptions: SearchOptions[] = [
    { label: 'RUC / Nombre', value: 1, placeholder: 'Buscar por RUC, razón social o nombre comercial', validation: [], validation_desc: '', icon: 'search' }
  ];
  readonly columns: TableColumns<TenantResponse>[] = [
    col('RUC', 'ruc'), col('RAZÓN SOCIAL', 'razonSocial'), col('NOMBRE COMERCIAL', 'nombreComercial'), col('AMBIENTE', 'environmentText'),
    col('PLAN', 'planText'), col('USO DEL MES', 'usageText'),
    { ...col<TenantResponse>('ESTADO', 'statusText', 'badge'), tooltip: 'suspensionReason' }, actionsCol()
  ];
  readonly actions: TableAction[] = [
    { id: 'detail', label: 'Ver empresa', icon: 'visibility', color: 'primary', tooltip: 'Resumen, panel, comprobantes, configuración y reportes' },
    { id: 'rejections', label: 'Ver rechazos', icon: 'report', color: 'primary', tooltip: 'Rechazos SUNAT de esta empresa',
      visible: () => this.perms.hasPermission(PERM.rejections) },
    { id: 'plan', label: 'Cambiar plan', icon: 'card_membership', color: 'primary', tooltip: 'Plan, límite del mes y modo de emisión',
      visible: () => this.canManage() },
    { id: 'suspend', label: 'Suspender', icon: 'pause_circle', color: 'warn', tooltip: 'La API responderá 403 a esta empresa',
      visible: (r: TenantResponse) => r.isActive && this.canManage() },
    { id: 'activate', label: 'Activar', icon: 'play_circle', color: 'primary', tooltip: 'Levanta la suspensión',
      visible: (r: TenantResponse) => !r.isActive && this.canManage() }
  ];

  state: number | null = null;
  environment: Environment | null = null;
  plan: PlanCode | null = null;
  text = '';
  readonly getInputs = signal('');

  constructor(public tenants: TenantService, private perms: PermissionService, private modal: NgbModal, private alerts: AlertModalService,
    private router: Router, title: CustomTitleService) {
    title.set('Empresas');
    this.refresh();
  }

  get canEdit(): boolean {
    return this.perms.hasPermission(PERM.tenantsEdit);
  }

  /** Alta: el formulario cierra con las credenciales de una sola vez, que pasan directo al modal y no se guardan. */
  create(): void {
    openModal<OneTimeCredentials>(this.modal, TenantFormComponent, () => undefined, (r) => {
      this.refresh();
      const open = () => void this.router.navigate(['/private/sunat/tenants', r.tenantId]);
      if (!r.apiKey || !r.apiSecret) {
        void this.alerts.showNotification('Empresa creada', 'La respuesta no trajo las credenciales API: regenérelas desde la pestaña Credenciales.', 'warning').then(open);
        return;
      }
      openApiCredentials(this.modal, { title: 'Empresa creada: credenciales de la API', tenantLabel: r.tenantLabel, ruc: r.ruc, apiKey: r.apiKey,
        apiSecret: r.apiSecret, aviso: r.aviso, closeText: 'Ya los guardé: abrir la empresa' }, open);
    }, 'xl');
  }

  canManage(): boolean {
    return this.perms.hasPermission(PERM.tenantsManage);
  }

  search(data: FiltersBox): void {
    this.text = data.searchData;
    this.refresh();
  }

  reset(): void {
    this.state = null;
    this.environment = null;
    this.plan = null;
    this.text = '';
    this.stateFilter?.resetFilter();
    this.envFilter?.resetFilter();
    this.planFilter?.resetFilter();
    this.searchBox?.resetComplete();
    this.refresh();
  }

  refresh(): void {
    this.getInputs.set(query({
      stateFilter: this.state, environment: this.environment, plan: this.plan, textFilter: this.text, refresh: Math.random()
    }));
  }

  onAction(event: { action: string; row: TenantResponse }): void {
    const t = event.row;
    const who = `${t.razonSocial} (${t.ruc})`;
    switch (event.action) {
      case 'detail':
        void this.router.navigate(['/private/sunat/tenants', t.id]);
        break;
      case 'rejections':
        void this.router.navigate(['/private/sunat/rejections'], { queryParams: { tenantId: t.id, tenant: who } });
        break;
      case 'plan':
        openModal<boolean>(this.modal, TenantPlanComponent, (ref) => (ref.componentInstance.tenant = t), () => this.refresh());
        break;
      case 'suspend':
        openModal<ReasonModalResult>(this.modal, ReasonModalComponent, (ref) => Object.assign(ref.componentInstance, {
          title: 'Suspender empresa', icon: 'icon-pause-circle', confirmText: 'Suspender', confirmClass: 'btn-danger',
          description: `${who}. Mientras esté suspendida, la API responde 403 a todas sus peticiones (no emite ni consulta).`,
          placeholder: 'Por qué se suspende (lo verá el equipo en el listado y en la auditoría)'
        }), (r) => runAction(this.alerts, this.tenants.changeState(t.id, { activo: false, motivo: r.reason }),
          'No se pudo suspender la empresa.', () => this.refresh(), 'Empresa suspendida.'));
        break;
      case 'activate':
        openModal<ReasonModalResult>(this.modal, ReasonModalComponent, (ref) => Object.assign(ref.componentInstance, {
          title: 'Activar empresa', icon: 'icon-play-circle', confirmText: 'Activar', required: false,
          description: `${who}. Vuelve a emitir de inmediato. Motivo de la suspensión: ${t.suspensionReason || 'sin motivo registrado'}.`,
          placeholder: 'Opcional'
        }), (r) => runAction(this.alerts, this.tenants.changeState(t.id, { activo: true, motivo: r.reason }),
          'No se pudo activar la empresa.', () => this.refresh(), 'Empresa activada.'));
        break;
    }
  }
}
