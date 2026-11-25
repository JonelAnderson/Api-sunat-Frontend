import { Component, OnInit, inject, input, signal, viewChild } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { SharedModule } from '@shared/shared.module';
import { ListTableComponent } from '@shared/components/reusables/list-table/list-table.component';
import { TableAction } from '@shared/models/table-action.interface';
import { TableColumns } from '@shared/models/list-table.interface';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { PermissionService } from '@shared/service/permission.service';
import { actionsCol, openModal, query, rows } from '@shared/functions/list-helpers';
import { Option } from '../../models/sunat.models';
import { actionPerms, targetFromResource } from '../../models/document-actions.models';
import {
  CURRENCY_OPTIONS, DocFile, DocumentsPreset, IDENTITY_TYPE_OPTIONS, Json, PAYMENT_STATUS_OPTIONS, SALE_KINDS, SUNAT_STATUS_OPTIONS, SaleKind,
  fileAvailable, num, str
} from '../../models/tenant-views.models';
import { ListSource, TenantViewsService } from '../../services/tenant-views.service';
import { decorateRow, listColumns, rowId } from './tenant-doc.views';
import { openDocDetail } from './tenant-doc-detail.component';
import { openPdfPreview } from './pdf-preview.component';
import { TenantZipExportComponent } from './tenant-zip-export.component';
import { UnifiedDocumentsComponent } from '../documents/unified-documents.component';
import { docTableActions, runDocAction, tableDocAction } from '../document-actions/doc-actions';

/** Filtros de `/api/v1/{tipo}` (§9.2) con su mismo nombre. Las notas solo usan una parte. */
interface SaleFilters {
  fecha_desde: string;
  fecha_hasta: string;
  sunat_status: string | null;
  estado_pago: string | null;
  serie: string;
  correlativo: string;
  textFilter: string;
  vencimiento_desde: string;
  vencimiento_hasta: string;
  correlativo_desde: string;
  correlativo_hasta: string;
  client_tipo_doc: string | null;
  client_num_doc: string;
  cliente: string;
  tipo_moneda: string | null;
  tipo_operacion: string;
  forma_pago: string | null;
  sucursal_id: number | null;
  monto_min: string;
  monto_max: string;
  con_cdr: boolean;
  ordenar_por: string | null;
  orden: string | null;
}

const EMPTY: SaleFilters = {
  fecha_desde: '', fecha_hasta: '', sunat_status: null, estado_pago: null, serie: '', correlativo: '', textFilter: '', vencimiento_desde: '',
  vencimiento_hasta: '', correlativo_desde: '', correlativo_hasta: '', client_tipo_doc: null, client_num_doc: '', cliente: '', tipo_moneda: null,
  tipo_operacion: '', forma_pago: null, sucursal_id: null, monto_min: '', monto_max: '', con_cdr: false, ordenar_por: null, orden: null
};

const ORDER_OPTIONS: Option<string>[] = [
  { id: 'created_at', name: 'Fecha de registro' }, { id: 'fecha_emision', name: 'Fecha de emisión' },
  { id: 'fecha_vencimiento', name: 'Fecha de vencimiento' }, { id: 'updated_at', name: 'Última actualización' },
  { id: 'correlativo', name: 'Correlativo' }, { id: 'mto_imp_venta', name: 'Importe total' }, { id: 'sunat_status', name: 'Estado SUNAT' },
  { id: 'payment_status', name: 'Estado de pago' }, { id: 'client_razon_social', name: 'Cliente' }
];

/**
 * Pestaña Comprobantes, con dos vistas:
 * - "Todos los tipos" (§10.3): la vista unificada de la empresa (`tenants/{id}/comprobantes` + `/resumen`).
 * - "Por tipo" (§9.2): facturas, boletas, notas de crédito y de débito (`GET {tipo}` paginado con los filtros de `/api/v1`).
 * Detalle en modal, vista previa del PDF, descargas por las rutas del panel y "Exportar ZIP" (§10.3). Fase D (§11.8): en el
 * menú de cada fila y en el detalle, corregir y reenviar, reenviar, refrescar y anular según el estado y los permisos.
 */
@Component({
  selector: 'app-tenant-documents',
  imports: [SharedModule, ListTableComponent, UnifiedDocumentsComponent],
  template: `
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      <div class="btn-group btn-group-sm" role="group" aria-label="Vista de los comprobantes">
        <button type="button" class="btn" [class.btn-primary]="view() === 'unified'" [class.btn-outline-primary]="view() !== 'unified'"
          [attr.aria-pressed]="view() === 'unified'" (click)="setView('unified')"><em class="feather icon-layers me-1"></em>Todos los tipos</button>
        <button type="button" class="btn" [class.btn-primary]="view() === 'kind'" [class.btn-outline-primary]="view() !== 'kind'"
          [attr.aria-pressed]="view() === 'kind'" (click)="setView('kind')"><em class="feather icon-filter me-1"></em>Por tipo (todos los filtros)</button>
      </div>
      <button type="button" class="btn btn-sm btn-outline-primary" (click)="exportZip()" title="XML / PDF de facturas, boletas y notas (máximo 31 días)">
        <em class="feather icon-archive me-1"></em>Exportar ZIP
      </button>
    </div>

    @if (unifiedSeen()) {
    <div [hidden]="view() !== 'unified'">
      <p class="small text-muted">Facturas, boletas, notas, guías, retenciones, percepciones, liquidaciones, resúmenes, bajas y reversiones en una sola lista, con su resumen.</p>
      <app-unified-documents mode="tenant" [fixedTenantId]="tenantId()" [tenantActive]="tenantActive()" [tenantName]="tenantName()"></app-unified-documents>
    </div>
    }

    <div [hidden]="view() !== 'kind'">
    <div class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Tipo de comprobante">
      @for (k of kinds; track k.id) {
      <button type="button" class="btn btn-sm" [class.btn-primary]="kind() === k.id" [class.btn-outline-primary]="kind() !== k.id" (click)="setKind(k.id)">
        <em class="feather {{ k.icon }} me-1"></em>{{ k.name }}
      </button>
      }
    </div>

    <form class="erp-form border rounded p-3 mb-3" (ngSubmit)="search()" novalidate>
      <div class="row g-2">
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-desde">Emisión desde</label>
          <input id="doc-desde" type="date" class="form-control form-control-sm" name="fecha_desde" [(ngModel)]="f.fecha_desde" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-hasta">Emisión hasta</label>
          <input id="doc-hasta" type="date" class="form-control form-control-sm" name="fecha_hasta" [(ngModel)]="f.fecha_hasta" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-sunat">Estado SUNAT</label>
          <select id="doc-sunat" class="form-select form-select-sm" name="sunat_status" [(ngModel)]="f.sunat_status">
            <option [ngValue]="null">Todos</option>
            @for (o of sunatStates; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
        </div>
        @if (full()) {
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-pago">Estado de pago</label>
          <select id="doc-pago" class="form-select form-select-sm" name="estado_pago" [(ngModel)]="f.estado_pago">
            <option [ngValue]="null">Todos</option>
            @for (o of paymentStates; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
        </div>
        }
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-serie">Serie</label>
          <input id="doc-serie" type="text" class="form-control form-control-sm" name="serie" [(ngModel)]="f.serie" placeholder="F001 o F%" maxlength="10" />
        </div>
        @if (full()) {
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-correlativo">Correlativo</label>
          <input id="doc-correlativo" type="number" min="1" class="form-control form-control-sm" name="correlativo" [(ngModel)]="f.correlativo" />
        </div>
        <div class="col-12 col-md-6 col-xl-4">
          <label class="form-label small" for="doc-text">Búsqueda</label>
          <input id="doc-text" type="search" class="form-control form-control-sm" name="textFilter" [(ngModel)]="f.textFilter"
            placeholder="Razón social, documento, serie o correlativo" maxlength="100" />
        </div>
        }
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-cliente-doc">Documento del cliente</label>
          <input id="doc-cliente-doc" type="text" class="form-control form-control-sm" name="client_num_doc" [(ngModel)]="f.client_num_doc" maxlength="15" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-moneda">Moneda</label>
          <select id="doc-moneda" class="form-select form-select-sm" name="tipo_moneda" [(ngModel)]="f.tipo_moneda">
            <option [ngValue]="null">Todas</option>
            @for (o of currencies; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-sucursal">Sucursal</label>
          <select id="doc-sucursal" class="form-select form-select-sm" name="sucursal_id" [(ngModel)]="f.sucursal_id">
            <option [ngValue]="null">Todas</option>
            @for (o of sucursales(); track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
        </div>
      </div>

      @if (full() && showMore) {
      <div class="row g-2 mt-1">
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-venc-desde">Vence desde</label>
          <input id="doc-venc-desde" type="date" class="form-control form-control-sm" name="vencimiento_desde" [(ngModel)]="f.vencimiento_desde" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-venc-hasta">Vence hasta</label>
          <input id="doc-venc-hasta" type="date" class="form-control form-control-sm" name="vencimiento_hasta" [(ngModel)]="f.vencimiento_hasta" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-corr-desde">Correlativo desde</label>
          <input id="doc-corr-desde" type="number" min="1" class="form-control form-control-sm" name="correlativo_desde" [(ngModel)]="f.correlativo_desde" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-corr-hasta">Correlativo hasta</label>
          <input id="doc-corr-hasta" type="number" min="1" class="form-control form-control-sm" name="correlativo_hasta" [(ngModel)]="f.correlativo_hasta" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-tipo-doc">Tipo de documento del cliente</label>
          <select id="doc-tipo-doc" class="form-select form-select-sm" name="client_tipo_doc" [(ngModel)]="f.client_tipo_doc">
            <option [ngValue]="null">Todos</option>
            @for (o of identityTypes; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-cliente">Razón social del cliente</label>
          <input id="doc-cliente" type="text" class="form-control form-control-sm" name="cliente" [(ngModel)]="f.cliente" maxlength="100" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-forma">Forma de pago</label>
          <select id="doc-forma" class="form-select form-select-sm" name="forma_pago" [(ngModel)]="f.forma_pago">
            <option [ngValue]="null">Todas</option>
            <option ngValue="Contado">Contado</option>
            <option ngValue="Credito">Crédito</option>
          </select>
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-operacion">Tipo de operación</label>
          <input id="doc-operacion" type="text" class="form-control form-control-sm" name="tipo_operacion" [(ngModel)]="f.tipo_operacion" placeholder="0101" maxlength="4" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-min">Monto desde</label>
          <input id="doc-min" type="number" min="0" step="0.01" class="form-control form-control-sm" name="monto_min" [(ngModel)]="f.monto_min" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-max">Monto hasta</label>
          <input id="doc-max" type="number" min="0" step="0.01" class="form-control form-control-sm" name="monto_max" [(ngModel)]="f.monto_max" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-orden-por">Ordenar por</label>
          <select id="doc-orden-por" class="form-select form-select-sm" name="ordenar_por" [(ngModel)]="f.ordenar_por">
            <option [ngValue]="null">Fecha de registro (por defecto)</option>
            @for (o of orderOptions; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="doc-orden">Orden</label>
          <select id="doc-orden" class="form-select form-select-sm" name="orden" [(ngModel)]="f.orden">
            <option [ngValue]="null">Descendente (por defecto)</option>
            <option ngValue="asc">Ascendente</option>
            <option ngValue="desc">Descendente</option>
          </select>
        </div>
        <div class="col-12 col-md-6 col-xl-4 d-flex align-items-end">
          <div class="form-check mb-1">
            <input id="doc-cdr" type="checkbox" class="form-check-input" name="con_cdr" [(ngModel)]="f.con_cdr" />
            <label class="form-check-label small" for="doc-cdr">Solo con CDR</label>
          </div>
        </div>
      </div>
      }

      <div class="d-flex flex-wrap gap-2 mt-3">
        <button type="submit" class="btn btn-sm btn-primary"><em class="feather icon-search me-1"></em>Buscar</button>
        <button type="button" class="btn btn-sm btn-light" (click)="clear()"><em class="feather icon-x me-1"></em>Limpiar</button>
        @if (full()) {
        <button type="button" class="btn btn-sm btn-link" (click)="showMore = !showMore">{{ showMore ? 'Menos filtros' : 'Más filtros' }}</button>
        } @else {
        <span class="small text-muted align-self-center">Las notas filtran por fechas solo con las dos fechas, y no tienen búsqueda por texto.</span>
        }
      </div>
    </form>

    @if (kindSeen()) {
    @for (k of [kind()]; track k) {
    <app-list-table [service]="source" [columns]="columns" [getInputs]="getInputs()" [actions]="actions" (actionTriggered)="onAction($event)"></app-list-table>
    }
    }
    </div>
  `
})
export class TenantDocumentsComponent implements OnInit {
  private views = inject(TenantViewsService);
  private modal = inject(NgbModal);
  private alerts = inject(AlertModalService);
  private perms = inject(PermissionService);

  readonly tenantId = input.required<number>();
  /** `isActive` de la empresa: suspendida, las acciones de la fase D quedan deshabilitadas (la API respondería 403). */
  readonly tenantActive = input<boolean | null>(null);
  readonly preset = input<DocumentsPreset | null>(null);
  /** Para el nombre del ZIP y el título del modal. */
  readonly ruc = input('');
  readonly tenantName = input('');

  readonly kinds = SALE_KINDS;
  readonly sunatStates = SUNAT_STATUS_OPTIONS;
  readonly paymentStates = PAYMENT_STATUS_OPTIONS;
  readonly currencies = CURRENCY_OPTIONS;
  readonly identityTypes = IDENTITY_TYPE_OPTIONS;
  readonly orderOptions = ORDER_OPTIONS;
  readonly kind = signal<SaleKind>('facturas');
  readonly sucursales = signal<Option<number>[]>([]);
  readonly getInputs = signal('');

  f: SaleFilters = { ...EMPTY };
  showMore = false;
  source!: ListSource;
  columns: TableColumns<Json>[] = [];
  readonly actions: TableAction[] = [
    { id: 'detail', label: 'Ver detalle', icon: 'visibility', color: 'primary', tooltip: 'Datos, ítems, totales, estado SUNAT y pagos' },
    { id: 'xml', label: 'Descargar XML', icon: 'code', color: 'primary', visible: (r: Json) => fileAvailable(this.kind(), r, 'xml') },
    { id: 'cdr', label: 'Descargar CDR', icon: 'verified', color: 'primary', visible: (r: Json) => fileAvailable(this.kind(), r, 'cdr') },
    { id: 'preview', label: 'Vista previa del PDF', icon: 'preview', color: 'primary' },
    { id: 'pdf', label: 'Descargar PDF (A4)', icon: 'picture_as_pdf', color: 'primary', tooltip: 'Otros formatos en el detalle' },
    ...docTableActions<Json>((r) => targetFromResource(this.tenantId(), this.kind(), r, this.tenantActive(), this.tenantName() || undefined),
      actionPerms((p) => this.perms.hasPermission(p)))
  ];
  private readonly list = viewChild(ListTableComponent);

  /** Vista unificada (§10.3, todos los tipos) o por tipo (§9.2, con los filtros de `/api/v1`). */
  readonly view = signal<'unified' | 'kind'>('unified');
  readonly unifiedSeen = signal(false);
  readonly kindSeen = signal(false);

  setView(view: 'unified' | 'kind'): void {
    this.view.set(view);
    (view === 'unified' ? this.unifiedSeen : this.kindSeen).set(true);
  }

  exportZip(): void {
    openModal<boolean>(this.modal, TenantZipExportComponent, (ref) => Object.assign(ref.componentInstance, {
      tenantId: this.tenantId(), ruc: this.ruc(), tenantName: this.tenantName()
    }), () => undefined);
  }

  ngOnInit(): void {
    const id = this.tenantId();
    // Desde Rechazos (filtro por tipo, serie y correlativo) se abre la vista por tipo; si no, la unificada.
    this.setView(this.preset() ? 'kind' : 'unified');
    this.source = this.views.listSource(id, () => this.kind(), (row) => decorateRow(this.kind())(row));
    const p = this.preset();
    if (p) {
      this.kind.set(p.kind);
      this.f.serie = p.serie ?? '';
      if (this.full()) {
        this.f.correlativo = p.correlativo ?? '';
      } else if (p.fecha) {
        this.f.fecha_desde = p.fecha;
        this.f.fecha_hasta = p.fecha;
      }
    }
    this.columns = [...listColumns(this.kind()), actionsCol<Json>()];
    this.views.get(id, 'sucursales').subscribe({
      next: (resp) => {
        if (resp.succeeded) {
          this.sucursales.set(rows<Json>(resp).map((s) => ({ id: num(s['id']) ?? 0, name: `${str(s['nombre'])} (${str(s['cod_local'])})` })));
        }
      },
      error: () => undefined
    });
    this.refresh();
  }

  /** Facturas y boletas tienen todos los filtros; las notas, solo una parte. */
  full(): boolean {
    return this.kind() === 'facturas' || this.kind() === 'boletas';
  }

  setKind(kind: SaleKind): void {
    if (kind === this.kind()) {
      return;
    }
    this.kind.set(kind);
    this.columns = [...listColumns(kind), actionsCol<Json>()];
    this.refresh();
  }

  clear(): void {
    this.f = { ...EMPTY };
    this.refresh();
  }

  async search(): Promise<void> {
    if (!this.full() && !!this.f.fecha_desde !== !!this.f.fecha_hasta) {
      await this.alerts.showNotification('Atención', 'En las notas, el filtro por fecha necesita las dos fechas (desde y hasta).', 'warning');
      return;
    }
    if (this.f.fecha_desde && this.f.fecha_hasta && this.f.fecha_desde > this.f.fecha_hasta) {
      await this.alerts.showNotification('Atención', 'La fecha "desde" no puede ser posterior a la fecha "hasta".', 'warning');
      return;
    }
    this.refresh();
  }

  refresh(): void {
    const f = this.f;
    const common = {
      sunat_status: f.sunat_status, fecha_desde: f.fecha_desde, fecha_hasta: f.fecha_hasta, serie: f.serie.trim(),
      client_num_doc: f.client_num_doc.trim(), tipo_moneda: f.tipo_moneda, sucursal_id: f.sucursal_id
    };
    const values = this.full()
      ? {
        ...common, estado_pago: f.estado_pago, correlativo: str(f.correlativo), textFilter: f.textFilter.trim(),
        vencimiento_desde: f.vencimiento_desde, vencimiento_hasta: f.vencimiento_hasta, correlativo_desde: str(f.correlativo_desde),
        correlativo_hasta: str(f.correlativo_hasta), client_tipo_doc: f.client_tipo_doc, cliente: f.cliente.trim(), tipo_operacion: f.tipo_operacion.trim(),
        forma_pago: f.forma_pago, monto_min: str(f.monto_min), monto_max: str(f.monto_max), con_cdr: f.con_cdr ? 1 : null,
        ordenar_por: f.ordenar_por, orden: f.orden
      }
      : common;
    this.getInputs.set(query({ ...values, refresh: Math.random() }));
  }

  onAction(event: { action: string; row: Json }): void {
    const id = rowId(event.row);
    if (id == null) {
      return;
    }
    if (event.action === 'detail') {
      openDocDetail(this.modal, this.tenantId(), this.kind(), id, event.row, {
        tenantActive: this.tenantActive(), tenantName: this.tenantName(), onChanged: () => this.list()?.reload()
      });
      return;
    }
    const act = tableDocAction(event.action);
    if (act) {
      const target = targetFromResource(this.tenantId(), this.kind(), event.row, this.tenantActive(), this.tenantName() || undefined);
      if (target) {
        void runDocAction(this.modal, this.alerts, target, act).then((ok) => ok && this.list()?.reload());
      }
      return;
    }
    if (event.action === 'preview') {
      openPdfPreview(this.modal, this.tenantId(), this.kind(), id, str(event.row['numero_completo']));
      return;
    }
    void this.views.download(this.tenantId(), this.kind(), id, event.action as DocFile, event.row);
  }
}
