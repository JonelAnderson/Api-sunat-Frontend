import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { SharedModule } from '@shared/shared.module';
import { ListTableComponent } from '@shared/components/reusables/list-table/list-table.component';
import { ReasonModalComponent, ReasonModalResult } from '@shared/components/reusables/reason-modal/reason-modal.component';
import { TableColumns } from '@shared/models/list-table.interface';
import { TableAction } from '@shared/models/table-action.interface';
import { actionsCol, col, openModal, query, runAction, serverMessages } from '@shared/functions/list-helpers';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { PermissionService } from '@shared/service/permission.service';
import { Observable } from 'rxjs';
import { Option, PERM } from '../../models/sunat.models';
import { Json, ViewBlock, ViewRow, ViewRowAction, arr, num, obj, str } from '../../models/tenant-views.models';
import { ListSource, QueryValues, TenantViewsService } from '../../services/tenant-views.service';
import { TenantAdminService } from '../../services/tenant-admin.service';
import { SERIES_TYPES, branchesBlock, companyBlock, decorateClient, paymentsBlock, seriesBlock, subscriptionBlock } from './tenant-config.views';
import { ViewBlockComponent } from './view-block.component';
import { BranchFormComponent } from './branch-form.component';
import { SeriesFormComponent } from './series-form.component';
import { ClientFormComponent } from './client-form.component';

type ConfigPart = 'empresa' | 'sucursales' | 'series' | 'clientes' | 'suscripcion';

interface PartState {
  loading: boolean;
  error: string;
  block: ViewBlock | null;
}

const PARTS: { id: ConfigPart; name: string; icon: string }[] = [
  { id: 'empresa', name: 'Empresa', icon: 'icon-briefcase' },
  { id: 'sucursales', name: 'Sucursales', icon: 'icon-map-pin' },
  { id: 'series', name: 'Series', icon: 'icon-hash' },
  { id: 'clientes', name: 'Clientes', icon: 'icon-users' },
  { id: 'suscripcion', name: 'Suscripción', icon: 'icon-repeat' }
];

/**
 * Pestaña Configuración (§9.5): `GET empresa`, `sucursales`, `series` (filtros `include_inactive`, `sucursal_id`, `tipo`),
 * `clientes` (paginado, `textFilter`) y `suscripcion` + `suscripcion/pagos`. Cada parte se carga al abrirla. Con
 * `Admin.Tenants.Edit` (§11.5): crear / editar / activar / eliminar sucursales, crear / editar / activar / desactivar series y
 * crear / editar / eliminar clientes, con confirmación (motivo opcional) y recarga después de cada acción.
 */
@Component({
  selector: 'app-tenant-config',
  imports: [SharedModule, ListTableComponent, ViewBlockComponent],
  template: `
    <ul class="nav nav-pills mb-3 gap-1">
      @for (p of parts; track p.id) {
      <li class="nav-item">
        <button type="button" class="nav-link py-1 px-3" [class.active]="part() === p.id" (click)="open(p.id)">
          <em class="feather {{ p.icon }} me-1"></em>{{ p.name }}
        </button>
      </li>
      }
    </ul>

    @switch (part()) {
    @case ('sucursales') {
    @if (canEdit) {
    <div class="d-flex justify-content-end mb-2">
      <button type="button" class="btn btn-sm btn-primary" (click)="branchForm(null)"><em class="feather icon-plus me-1"></em>Nueva sucursal</button>
    </div>
    }
    <ng-container *ngTemplateOutlet="partView; context: { $implicit: state()['sucursales'] }"></ng-container>
    }
    @case ('series') {
    <div class="d-flex flex-wrap align-items-end gap-2 mb-3">
      <div>
        <label class="form-label small mb-1" for="cfg-serie-tipo">Tipo</label>
        <select id="cfg-serie-tipo" class="form-select form-select-sm" [(ngModel)]="seriesTipo" (ngModelChange)="loadSeries()">
          <option [ngValue]="null">Todos</option>
          @for (t of seriesTypes; track t.id) {<option [ngValue]="t.id">{{ t.name }}</option>}
        </select>
      </div>
      <div>
        <label class="form-label small mb-1" for="cfg-serie-suc">Sucursal</label>
        <select id="cfg-serie-suc" class="form-select form-select-sm" [(ngModel)]="seriesSucursal" (ngModelChange)="loadSeries()">
          <option [ngValue]="null">Todas</option>
          @for (s of sucursales(); track s.id) {<option [ngValue]="s.id">{{ s.name }}</option>}
        </select>
      </div>
      <div class="form-check mb-1">
        <input id="cfg-serie-inact" type="checkbox" class="form-check-input" [(ngModel)]="seriesInactive" (ngModelChange)="loadSeries()" />
        <label class="form-check-label small" for="cfg-serie-inact">Incluir inactivas</label>
      </div>
      @if (canEdit) {
      <button type="button" class="btn btn-sm btn-primary ms-auto" (click)="seriesForm(null)"><em class="feather icon-plus me-1"></em>Nueva serie</button>
      }
    </div>
    <ng-container *ngTemplateOutlet="partView; context: { $implicit: state()['series'] }"></ng-container>
    }
    @case ('clientes') {
    <form class="d-flex flex-wrap align-items-end gap-2 mb-3" (ngSubmit)="searchClients()" novalidate>
      <div class="flex-grow-1" style="max-width: 420px">
        <label class="form-label small mb-1" for="cfg-cli-text">Buscar cliente</label>
        <input id="cfg-cli-text" type="search" class="form-control form-control-sm" name="clientText" [(ngModel)]="clientText"
          placeholder="Documento, razón social o nombre comercial" maxlength="100" />
      </div>
      <button type="submit" class="btn btn-sm btn-primary"><em class="feather icon-search me-1"></em>Buscar</button>
      <button type="button" class="btn btn-sm btn-light" (click)="clientText = ''; searchClients()">Limpiar</button>
      @if (canEdit) {
      <button type="button" class="btn btn-sm btn-primary ms-auto" (click)="clientForm(null)"><em class="feather icon-plus me-1"></em>Nuevo cliente</button>
      }
    </form>
    <app-list-table [service]="clients" [columns]="clientColumns" [getInputs]="clientInputs()" [actions]="clientActions"
      (actionTriggered)="onClientAction($event)"></app-list-table>
    }
    @case ('suscripcion') {
    <ng-container *ngTemplateOutlet="partView; context: { $implicit: state()['suscripcion'] }"></ng-container>
    <ng-container *ngTemplateOutlet="partView; context: { $implicit: state()['pagos'] }"></ng-container>
    }
    @default {
    <ng-container *ngTemplateOutlet="partView; context: { $implicit: state()[part()] }"></ng-container>
    }
    }

    <ng-template #partView let-st>
      @if (!st || st.loading) {
      <div class="erp-loading py-3" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Cargando…</div>
      } @else if (st.error) {
      <div class="alert alert-warning small">{{ st.error }}</div>
      } @else {
      <app-view-block [block]="st.block" (rowAction)="onRowAction($event)"></app-view-block>
      }
    </ng-template>
  `
})
export class TenantConfigComponent implements OnInit {
  private views = inject(TenantViewsService);
  private admin = inject(TenantAdminService);
  private perms = inject(PermissionService);
  private modal = inject(NgbModal);
  private alerts = inject(AlertModalService);

  readonly tenantId = input.required<number>();
  /** Cambió una sucursal o serie: la página recarga su cabecera (`GET tenants/{id}` trae sucursales y series). */
  readonly changed = output<void>();

  readonly canEdit = this.perms.hasPermission(PERM.tenantsEdit);
  readonly parts = PARTS;
  readonly seriesTypes = SERIES_TYPES;
  readonly part = signal<ConfigPart>('empresa');
  readonly state = signal<Record<string, PartState>>({});
  readonly sucursales = signal<Option<number>[]>([]);
  readonly clientInputs = signal('');
  private loaded = new Set<ConfigPart>();

  seriesTipo: string | null = null;
  seriesSucursal: number | null = null;
  seriesInactive = false;
  clientText = '';
  clients!: ListSource;
  readonly clientColumns: TableColumns<Json>[] = [
    col('DOCUMENTO', '_doc'), { ...col<Json>('RAZÓN SOCIAL', 'razon_social'), subProperty: 'nombre_comercial' }, col('DIRECCIÓN', 'direccion'),
    col('CONTACTO', '_contacto'), col('REGISTRADO', '_creado'), ...(this.canEdit ? [actionsCol<Json>()] : [])
  ];
  readonly clientActions: TableAction[] = this.canEdit ? [
    { id: 'edit', label: 'Editar', icon: 'edit', color: 'primary', tooltip: 'Editar el cliente' },
    { id: 'delete', label: 'Eliminar', icon: 'delete', color: 'warn', tooltip: 'Eliminar el cliente' }
  ] : [];

  ngOnInit(): void {
    this.clients = this.views.listSource(this.tenantId(), () => 'clientes', decorateClient);
    this.open('empresa');
  }

  open(part: ConfigPart): void {
    this.part.set(part);
    if (this.loaded.has(part)) {
      return;
    }
    this.loaded.add(part);
    switch (part) {
      case 'empresa':
        this.reloadCompany();
        break;
      case 'sucursales':
        this.loadBranches();
        break;
      case 'series':
        if (!this.sucursales().length) {
          this.loadBranches(false);
        }
        this.loadSeries();
        break;
      case 'clientes':
        this.searchClients();
        break;
      case 'suscripcion':
        this.load('suscripcion', this.views.get(this.tenantId(), 'suscripcion'), (d) => subscriptionBlock(obj(d)));
        this.load('pagos', this.views.get(this.tenantId(), 'suscripcion/pagos'), (d) => paymentsBlock(list(d)));
        break;
    }
  }

  /** Vuelve a leer `GET empresa` (después de editar datos, logo o credenciales); si aún no se abrió, se lee al abrirla. */
  reloadCompany(): void {
    if (!this.loaded.has('empresa')) {
      return;
    }
    this.load('empresa', this.views.get(this.tenantId(), 'empresa'), (d) => companyBlock(obj(d)));
  }

  loadSeries(): void {
    const values: QueryValues = { include_inactive: this.seriesInactive ? 1 : null, sucursal_id: this.seriesSucursal, tipo: this.seriesTipo };
    this.load('series', this.views.get(this.tenantId(), 'series', values), (d) => seriesBlock(list(d), this.canEdit ? seriesActions : undefined));
  }

  searchClients(): void {
    this.clientInputs.set(query({ textFilter: this.clientText.trim(), refresh: Math.random() }));
  }

  /** Sucursales: la tabla y la lista del filtro de series (y del formulario de series). */
  private loadBranches(showTable = true): void {
    const call = this.views.get(this.tenantId(), 'sucursales');
    this.load(showTable ? 'sucursales' : '_sucursales', call, (d) => {
      const data = list(d);
      this.sucursales.set(data.map((s) => ({ id: num(s['id']) ?? 0, name: `${str(s['nombre'])} (${str(s['cod_local'])})` })));
      return branchesBlock(data, this.canEdit ? branchActions : undefined);
    });
  }

  /** Después de escribir: recarga lo abierto de sucursales y series y avisa a la página. */
  private afterWrite(): void {
    this.loadBranches(this.loaded.has('sucursales'));
    if (this.loaded.has('series')) {
      this.loadSeries();
    }
    this.changed.emit();
  }

  private load(key: string, call: Observable<BaseResponse>, build: (data: unknown) => ViewBlock): void {
    this.patch(key, { loading: true, error: '', block: null });
    call.subscribe({
      next: (resp) => {
        if (resp.succeeded) {
          this.patch(key, { loading: false, error: '', block: build(resp.data) });
        } else {
          this.patch(key, { loading: false, error: serverMessages(resp, 'No se pudo cargar la información.'), block: null });
        }
      },
      error: (err) => this.patch(key, { loading: false, error: serverMessages(err?.error, 'No se pudo cargar la información.'), block: null })
    });
  }

  private patch(key: string, value: PartState): void {
    this.state.update((s) => ({ ...s, [key]: value }));
  }

  // ---------------------------------------------------------------- Escrituras (§11.5)
  /** Confirmación con motivo opcional; luego la acción y la recarga. */
  private confirm(title: string, description: string, confirmText: string, danger: boolean, run: (motivo: string) => Observable<BaseResponse>,
    failText: string, okText: string, done: () => void): void {
    openModal<ReasonModalResult>(this.modal, ReasonModalComponent, (ref) => Object.assign(ref.componentInstance, {
      title, description, confirmText, required: false, confirmClass: danger ? 'btn-danger' : 'btn-primary',
      icon: danger ? 'icon-trash-2' : 'icon-check-circle', placeholder: 'Opcional: queda en la auditoría'
    }), (r) => runAction(this.alerts, run(r.reason), failText, () => done(), okText));
  }

  branchForm(branch: Json | null): void {
    openModal<boolean>(this.modal, BranchFormComponent, (ref) => Object.assign(ref.componentInstance, { tenantId: this.tenantId(), branch }),
      () => this.afterWrite(), 'lg');
  }

  seriesForm(series: Json | null): void {
    openModal<boolean>(this.modal, SeriesFormComponent, (ref) => Object.assign(ref.componentInstance, {
      tenantId: this.tenantId(), series, branches: this.sucursales()
    }), () => this.afterWrite(), 'lg');
  }

  clientForm(client: Json | null): void {
    openModal<boolean>(this.modal, ClientFormComponent, (ref) => Object.assign(ref.componentInstance, { tenantId: this.tenantId(), client }),
      () => this.searchClients(), 'lg');
  }

  onRowAction(event: { action: string; row: ViewRow }): void {
    const d = event.row.data;
    if (!d) {
      return;
    }
    const id = Number(d['id']);
    const tenantId = this.tenantId();
    switch (event.action) {
      case 'branch-edit':
        this.branchForm(d);
        break;
      case 'branch-toggle': {
        const activate = d['activo'] === false;
        this.confirm(activate ? 'Activar sucursal' : 'Desactivar sucursal', `${str(d['nombre'])} (${str(d['cod_local'])}).`
          + (activate ? '' : ' Sus series siguen existiendo, pero la sucursal queda inactiva.'), activate ? 'Activar' : 'Desactivar', !activate,
        (motivo) => this.admin.updateBranch(tenantId, id, { activo: activate, ...(motivo ? { motivo } : {}) }),
        'No se pudo cambiar la sucursal.', activate ? 'Sucursal activada.' : 'Sucursal desactivada.', () => this.afterWrite());
        break;
      }
      case 'branch-delete':
        this.confirm('Eliminar sucursal', `${str(d['nombre'])} (${str(d['cod_local'])}). No se puede eliminar la principal ni una sucursal con series.`,
          'Eliminar', true, (motivo) => this.admin.deleteBranch(tenantId, id, motivo), 'No se pudo eliminar la sucursal.', 'Sucursal eliminada.',
          () => this.afterWrite());
        break;
      case 'series-edit':
        if (!this.sucursales().length) {
          this.loadBranches(this.loaded.has('sucursales'));
        }
        this.seriesForm(d);
        break;
      case 'series-activate':
        this.confirm('Activar serie', `${str(d['serie'])}: vuelve a estar disponible para emitir.`, 'Activar', false,
          (motivo) => this.admin.updateSeries(tenantId, id, { activo: true, ...(motivo ? { motivo } : {}) }), 'No se pudo activar la serie.',
          'Serie activada.', () => this.afterWrite());
        break;
      case 'series-deactivate':
        this.confirm('Desactivar serie', `${str(d['serie'])}: ya no se podrá emitir con ella. Los comprobantes emitidos no cambian (borrado lógico; se puede volver a activar).`,
          'Desactivar', true, (motivo) => this.admin.deactivateSeries(tenantId, id, motivo), 'No se pudo desactivar la serie.', 'Serie desactivada.',
          () => this.afterWrite());
        break;
    }
  }

  onClientAction(event: { action: string; row: Json }): void {
    const c = event.row;
    if (event.action === 'edit') {
      this.clientForm(c);
    } else if (event.action === 'delete') {
      this.confirm('Eliminar cliente', `${str(c['razon_social'])} (${str(c['_doc'])}). Los comprobantes ya emitidos no cambian.`, 'Eliminar', true,
        (motivo) => this.admin.deleteClient(this.tenantId(), Number(c['id']), motivo), 'No se pudo eliminar el cliente.', 'Cliente eliminado.',
        () => this.searchClients());
    }
  }
}

/** Listas sin paginar (sucursales, series, pagos): `data` es la lista completa. */
function list(data: unknown): Json[] {
  return arr(data);
}

function branchActions(s: Json): ViewRowAction[] {
  const actions: ViewRowAction[] = [{ id: 'branch-edit', label: 'Editar', icon: 'icon-edit' }];
  actions.push(s['activo'] === false
    ? { id: 'branch-toggle', label: 'Activar', icon: 'icon-play-circle' }
    : { id: 'branch-toggle', label: 'Desactivar', icon: 'icon-pause-circle' });
  if (s['es_principal'] !== true) {
    actions.push({ id: 'branch-delete', label: 'Eliminar', icon: 'icon-trash-2', danger: true });
  }
  return actions;
}

function seriesActions(s: Json): ViewRowAction[] {
  return [
    { id: 'series-edit', label: 'Editar', icon: 'icon-edit' },
    s['activo'] === false
      ? { id: 'series-activate', label: 'Activar', icon: 'icon-play-circle' }
      : { id: 'series-deactivate', label: 'Desactivar', icon: 'icon-slash', danger: true }
  ];
}
