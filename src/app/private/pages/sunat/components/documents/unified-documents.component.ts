import { Component, OnInit, inject, input, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';
import { SharedModule } from '@shared/shared.module';
import { ListTableComponent } from '@shared/components/reusables/list-table/list-table.component';
import { TableAction } from '@shared/models/table-action.interface';
import { TableColumns } from '@shared/models/list-table.interface';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { PermissionService } from '@shared/service/permission.service';
import { actionsCol, query, serverMessages } from '@shared/functions/list-helpers';
import { addDaysYmd, daysInRangeYmd, limaTodayYmd } from '@shared/functions/lima-dates';
import { fetchAllPages } from '@shared/functions/fetch-all-pages';
import {
  BranchRow, DOC_ORDER_OPTIONS, DOC_STATUS_OPTIONS, DOC_TYPE_OPTIONS, DocumentRow, DocumentSummary, Option, PERM
} from '../../models/sunat.models';
import { DocFile, Json, ViewBlock, kindFromVista, kindInfo } from '../../models/tenant-views.models';
import { ActionTarget, actionPerms, targetFromRow } from '../../models/document-actions.models';
import { BranchService, DocumentFeed, DocumentFeedService } from '../../services/sunat.services';
import { TenantViewsService } from '../../services/tenant-views.service';
import { TenantPickerComponent, TenantPick } from '../common/tenant-picker.component';
import { ViewBlockComponent } from '../tenant-page/view-block.component';
import { openDocDetail } from '../tenant-page/tenant-doc-detail.component';
import { openPdfPreview } from '../tenant-page/pdf-preview.component';
import { documentColumns, summaryBlock } from './document-feed.views';
import { docTableActions, runDocAction, tableDocAction } from '../document-actions/doc-actions';

/** Vista del componente: feed de envíos, vista global de comprobantes o vista unificada de una empresa. */
export type UnifiedMode = DocumentFeed | 'tenant';

/** Filtro que llega por la URL (desde el tablero, Empresas o Rechazos). */
export interface FeedPreset {
  tenantId?: number | null;
  tenant?: string | null;
  estado?: string | null;
  tipo?: string | null;
}

interface FeedFilters {
  startDate: string;
  endDate: string;
  tipos: string[];
  estado: string | null;
  serie: string;
  sucursalId: number | null;
  textFilter: string;
  orderBy: string | null;
  orderDir: string | null;
}

const EMPTY: FeedFilters = { startDate: '', endDate: '', tipos: [], estado: null, serie: '', sucursalId: null, textFilter: '', orderBy: null, orderDir: null };
/** Máximo del rango de fechas de los filtros comunes (§10.3). */
const MAX_DAYS = 366;

/**
 * Listado de documentos con la fila común de §10.3, de todos los tipos (facturas, boletas, notas, guías, retenciones,
 * percepciones, liquidaciones, resúmenes, bajas y reversiones):
 * - `submissions`: feed de envíos SUNAT (`GET submissions`, `Admin.Rejections.View`). Siempre con fechas (por defecto los
 *   últimos 30 días; una búsqueda no levanta la ventana, §10.1). Orden fijo: el envío más reciente primero.
 * - `documents`: comprobantes de todas las empresas (`GET documents` + `documents/summary`, `Admin.Tenants.View`). Sin
 *   empresa ni fechas, la API usa los últimos 30 días.
 * - `tenant`: vista unificada de una empresa (`tenants/{id}/comprobantes` + `/resumen`, sin ventana por defecto).
 * El detalle, la vista previa del PDF y las descargas van por las rutas de §9 (`tenants/{tenantId}/{vista}/{id}`).
 * Fase D (§11.8): la fila común trae `tenantId`, `vista`, `id`, `tipo`, estado y fecha, así que en los tres modos el menú
 * de la fila ofrece corregir y reenviar, reenviar, refrescar y anular / revertir según el estado y los permisos (en las
 * vistas globales no se sabe si la empresa está suspendida: si lo está, la API responde 403 con el aviso).
 */
@Component({
  selector: 'app-unified-documents',
  imports: [SharedModule, NgSelectModule, ListTableComponent, TenantPickerComponent, ViewBlockComponent],
  template: `
    <form class="erp-form border rounded p-3 mb-3" (ngSubmit)="search()" novalidate>
      <div class="row g-2">
        @if (mode() !== 'tenant') {
        <div class="col-12 col-md-6 col-xl-4">
          <label class="form-label small" [for]="id('tenant')">Empresa</label>
          <app-tenant-picker [inputId]="id('tenant')" [value]="tenantId()" [label]="tenantLabel()" minWidth="100%"
            (tenantChange)="setTenant($event)"></app-tenant-picker>
        </div>
        }
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" [for]="id('desde')">Emisión desde @if (mode() === 'submissions') {<span class="erp-required">*</span>}</label>
          <input [id]="id('desde')" type="date" class="form-control form-control-sm" name="startDate" [(ngModel)]="f.startDate" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" [for]="id('hasta')">Emisión hasta @if (mode() === 'submissions') {<span class="erp-required">*</span>}</label>
          <input [id]="id('hasta')" type="date" class="form-control form-control-sm" name="endDate" [(ngModel)]="f.endDate" />
        </div>
        <div class="col-12 col-md-6 col-xl-4">
          <label class="form-label small" [for]="id('tipo')">Tipos</label>
          <ng-select [labelForId]="id('tipo')" [items]="types" bindLabel="name" bindValue="id" [multiple]="true"
            [closeOnSelect]="false" placeholder="Todos los tipos" name="tipos" [(ngModel)]="f.tipos" appendTo="body"></ng-select>
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" [for]="id('estado')">Estado SUNAT</label>
          <select [id]="id('estado')" class="form-select form-select-sm" name="estado" [(ngModel)]="f.estado">
            <option [ngValue]="null">Todos</option>
            @for (o of states; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" [for]="id('serie')">Serie (contiene)</label>
          <input [id]="id('serie')" type="text" class="form-control form-control-sm" name="serie" [(ngModel)]="f.serie" maxlength="4" placeholder="F001" />
        </div>
        @if (branches().length) {
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" [for]="id('sucursal')">Sucursal</label>
          <select [id]="id('sucursal')" class="form-select form-select-sm" name="sucursalId" [(ngModel)]="f.sucursalId">
            <option [ngValue]="null">Todas</option>
            @for (o of branches(); track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
        </div>
        }
        <div class="col-12 col-md-6 col-xl-4">
          <label class="form-label small" [for]="id('text')">Búsqueda</label>
          <input [id]="id('text')" type="search" class="form-control form-control-sm" name="textFilter" [(ngModel)]="f.textFilter" maxlength="100"
            [placeholder]="mode() === 'tenant' ? 'Número, serie, cliente o su documento' : 'Número, serie, cliente, RUC o razón social del emisor, descripción SUNAT'" />
        </div>
        @if (mode() !== 'submissions') {
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" [for]="id('orden-por')">Ordenar por</label>
          <select [id]="id('orden-por')" class="form-select form-select-sm" name="orderBy" [(ngModel)]="f.orderBy">
            <option [ngValue]="null">Fecha de emisión (por defecto)</option>
            @for (o of orders; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" [for]="id('orden')">Orden</label>
          <select [id]="id('orden')" class="form-select form-select-sm" name="orderDir" [(ngModel)]="f.orderDir">
            <option [ngValue]="null">Descendente (por defecto)</option>
            <option ngValue="asc">Ascendente</option>
            <option ngValue="desc">Descendente</option>
          </select>
        </div>
        }
      </div>
      <div class="d-flex flex-wrap gap-2 mt-3">
        <button type="submit" class="btn btn-sm btn-primary"><em class="feather icon-search me-1"></em>Buscar</button>
        <button type="button" class="btn btn-sm btn-light" (click)="clear()"><em class="feather icon-x me-1"></em>Limpiar</button>
        <span class="small text-muted align-self-center">{{ hint() }}</span>
      </div>
    </form>

    @if (mode() !== 'submissions') {
    @if (summaryError()) {
    <div class="alert alert-warning py-2 small">{{ summaryError() }}</div>
    } @else if (summary(); as s) {
    <div class="mb-3">
      <button type="button" class="btn btn-sm btn-link px-0 mb-2" (click)="showSummary.set(!showSummary())" [attr.aria-expanded]="showSummary()">
        <em class="feather me-1" [class.icon-chevron-down]="showSummary()" [class.icon-chevron-right]="!showSummary()"></em>Resumen de los documentos filtrados
      </button>
      @if (showSummary()) {<app-view-block [block]="s"></app-view-block>}
    </div>
    }
    }

    <app-list-table [service]="source" [columns]="columns" [getInputs]="getInputs()" [actions]="actions" (actionTriggered)="onAction($event)"></app-list-table>
  `
})
export class UnifiedDocumentsComponent implements OnInit {
  private feed = inject(DocumentFeedService);
  private branchService = inject(BranchService);
  private views = inject(TenantViewsService);
  private perms = inject(PermissionService);
  private modal = inject(NgbModal);
  private alerts = inject(AlertModalService);
  private router = inject(Router);

  readonly mode = input.required<UnifiedMode>();
  /** Empresa fija (modo `tenant`). */
  readonly fixedTenantId = input<number | null>(null);
  readonly preset = input<FeedPreset | null>(null);
  /** Modo `tenant`: `isActive` y nombre de la empresa (suspendida, las acciones quedan deshabilitadas). */
  readonly tenantActive = input<boolean | null>(null);
  readonly tenantName = input('');

  readonly types = DOC_TYPE_OPTIONS.map((o) => ({ id: o.id, name: `${o.name} (${o.id})` }));
  readonly states = DOC_STATUS_OPTIONS;
  readonly orders = DOC_ORDER_OPTIONS;
  readonly tenantId = signal<number | null>(null);
  readonly tenantLabel = signal('');
  readonly branches = signal<Option<number>[]>([]);
  readonly getInputs = signal('');
  readonly summary = signal<ViewBlock | null>(null);
  readonly summaryError = signal('');
  readonly showSummary = signal(true);
  readonly canDetail = this.perms.hasPermission(PERM.tenantsView);

  f: FeedFilters = { ...EMPTY };
  source!: ReturnType<DocumentFeedService['source']>;
  columns: TableColumns<DocumentRow>[] = [];
  private readonly uid = Math.random().toString(36).substring(2, 8);

  readonly actions: TableAction[] = [
    { id: 'detail', label: 'Ver detalle', icon: 'visibility', color: 'primary', tooltip: 'Datos, ítems, estado SUNAT y archivos',
      visible: (r: DocumentRow) => this.canDetail && !!kindFromVista(r.vista) },
    { id: 'preview', label: 'Vista previa del PDF', icon: 'preview', color: 'primary', visible: (r: DocumentRow) => this.canDetail && this.hasPdf(r) },
    { id: 'xml', label: 'Descargar XML', icon: 'code', color: 'primary', visible: (r: DocumentRow) => this.canDetail && r.hasXml && !!kindFromVista(r.vista) },
    { id: 'cdr', label: 'Descargar CDR', icon: 'verified', color: 'primary', visible: (r: DocumentRow) => this.canDetail && r.hasCdr && !!kindFromVista(r.vista) },
    { id: 'pdf', label: 'Descargar PDF (A4)', icon: 'picture_as_pdf', color: 'primary', visible: (r: DocumentRow) => this.canDetail && this.hasPdf(r) },
    { id: 'tenant', label: 'Ver empresa', icon: 'business', color: 'primary', tooltip: 'Abre la página de la empresa',
      visible: () => this.canDetail && this.mode() !== 'tenant' },
    ...docTableActions<DocumentRow>((r) => this.targetOf(r), actionPerms((p) => this.perms.hasPermission(p)))
  ];
  private readonly list = viewChild(ListTableComponent);

  /** Documento de la fila para las acciones de la fase D (en modo `tenant` se sabe si la empresa está activa). */
  private targetOf(r: DocumentRow): ActionTarget | null {
    const t = targetFromRow(r, this.mode() === 'tenant' ? this.tenantActive() : null);
    if (t && this.mode() === 'tenant' && this.tenantName()) {
      t.tenantName = this.tenantName();
    }
    return t;
  }

  ngOnInit(): void {
    const mode = this.mode();
    this.source = this.feed.source(() => mode, () => this.tenantId());
    this.columns = [...documentColumns(mode !== 'tenant', mode === 'submissions'), actionsCol<DocumentRow>()];
    const p = this.preset();
    if (mode === 'tenant') {
      this.tenantId.set(this.fixedTenantId());
    } else if (p?.tenantId) {
      this.tenantId.set(p.tenantId);
      this.tenantLabel.set(p.tenant ?? '');
    }
    if (p?.estado && DOC_STATUS_OPTIONS.some((o) => o.id === p.estado)) {
      this.f.estado = p.estado;
    }
    if (p?.tipo) {
      this.f.tipos = p.tipo.split(',').filter((t) => DOC_TYPE_OPTIONS.some((o) => o.id === t));
    }
    this.defaultRange();
    this.loadBranches();
    this.refresh();
  }

  id(name: string): string {
    return `ud-${this.uid}-${name}`;
  }

  hint(): string {
    switch (this.mode()) {
      case 'submissions':
        return `Fechas obligatorias (máximo ${MAX_DAYS} días): la búsqueda por texto no recorre todo el histórico. El envío más reciente primero.`;
      case 'documents':
        return `Sin empresa ni fechas se muestran los últimos 30 días. Rango máximo: ${MAX_DAYS} días.`;
      default:
        return `Todos los tipos de la empresa. Rango máximo: ${MAX_DAYS} días.`;
    }
  }

  private defaultRange(): void {
    if (this.mode() === 'submissions') {
      this.f.endDate = limaTodayYmd();
      this.f.startDate = addDaysYmd(this.f.endDate, -29);
    }
  }

  private hasPdf(r: DocumentRow): boolean {
    const kind = kindFromVista(r.vista);
    return !!kind && kindInfo(kind).pdf;
  }

  setTenant(t: TenantPick | null): void {
    this.tenantId.set(t?.id ?? null);
    this.tenantLabel.set(t?.label ?? '');
    this.f.sucursalId = null;
    this.loadBranches();
    this.refresh();
  }

  /** Sucursales de la empresa elegida (para el filtro `sucursalId`), de 50 en 50 por `GET branches?tenantId=`. */
  private loadBranches(): void {
    const tenantId = this.tenantId();
    this.branches.set([]);
    if (!tenantId) {
      return;
    }
    fetchAllPages<BranchRow>((page, size) => this.branchService.GetAll(size, page, query({ tenantId }))).subscribe({
      next: (list) => this.branches.set(list.filter((b) => b.tenantId === tenantId).map((b) => ({ id: b.id, name: `${b.nombre} (${b.codLocal})` }))),
      error: () => this.branches.set([])
    });
  }

  clear(): void {
    this.f = { ...EMPTY };
    this.defaultRange();
    this.refresh();
  }

  async search(): Promise<void> {
    const { startDate, endDate } = this.f;
    if (this.mode() === 'submissions' && (!startDate || !endDate)) {
      await this.alerts.showNotification('Atención', 'Indique las dos fechas: el feed de envíos siempre busca dentro de un rango.', 'warning');
      return;
    }
    if (startDate && endDate) {
      const days = daysInRangeYmd(startDate, endDate);
      if (days < 1) {
        await this.alerts.showNotification('Atención', 'La fecha "desde" no puede ser posterior a la fecha "hasta".', 'warning');
        return;
      }
      if (days > MAX_DAYS) {
        await this.alerts.showNotification('Atención', `El rango puede abarcar como máximo ${MAX_DAYS} días.`, 'warning');
        return;
      }
    }
    this.refresh();
  }

  /** Filtros comunes de §10.3. Sin `withListOnly` quedan los del resumen (sin `tipo`, `estado` ni el orden). */
  private filterValues(withListOnly: boolean): Record<string, string | number | null> {
    const f = this.f;
    const values: Record<string, string | number | null> = {
      startDate: f.startDate, endDate: f.endDate, serie: f.serie.trim(), sucursalId: f.sucursalId, textFilter: f.textFilter.trim().substring(0, 100)
    };
    if (this.mode() !== 'tenant') {
      values['tenantId'] = this.tenantId();
    }
    if (withListOnly) {
      values['tipo'] = f.tipos.length ? f.tipos.join(',') : null;
      values['estado'] = f.estado;
      if (this.mode() !== 'submissions') {
        values['orderBy'] = f.orderBy;
        values['orderDir'] = f.orderDir;
      }
    }
    return values;
  }

  refresh(): void {
    this.getInputs.set(query({ ...this.filterValues(true), refresh: Math.random() }));
    if (this.mode() !== 'submissions') {
      this.loadSummary();
    }
  }

  /** Después de una acción: la página actual y el resumen (los contadores por estado cambian). */
  private afterChange(): void {
    this.list()?.reload();
    if (this.mode() !== 'submissions') {
      this.loadSummary();
    }
  }

  private loadSummary(): void {
    const tenantId = this.mode() === 'tenant' ? this.tenantId() : null;
    this.summaryError.set('');
    this.feed.summary(tenantId, query(this.filterValues(false))).subscribe({
      next: (resp) => {
        if (resp.succeeded && resp.data) {
          this.summary.set(summaryBlock(resp.data as DocumentSummary));
        } else {
          this.summary.set(null);
          this.summaryError.set(serverMessages(resp, 'No se pudo cargar el resumen.'));
        }
      },
      error: (err) => {
        this.summary.set(null);
        this.summaryError.set(serverMessages(err?.error, 'No se pudo cargar el resumen.'));
      }
    });
  }

  onAction(event: { action: string; row: DocumentRow }): void {
    const r = event.row;
    if (event.action === 'tenant') {
      void this.router.navigate(['/private/sunat/tenants', r.tenantId]);
      return;
    }
    const act = tableDocAction(event.action);
    if (act) {
      const target = this.targetOf(r);
      if (target) {
        void runDocAction(this.modal, this.alerts, target, act).then((ok) => ok && this.afterChange());
      }
      return;
    }
    const kind = kindFromVista(r.vista);
    if (!kind) {
      return;
    }
    switch (event.action) {
      case 'detail':
        openDocDetail(this.modal, r.tenantId, kind, r.id, null, {
          tenantActive: this.mode() === 'tenant' ? this.tenantActive() : null, tenantName: this.targetOf(r)?.tenantName ?? '',
          onChanged: () => this.afterChange()
        });
        break;
      case 'preview':
        openPdfPreview(this.modal, r.tenantId, kind, r.id, r.numero);
        break;
      default:
        void this.views.download(r.tenantId, kind, r.id, event.action as DocFile, r as unknown as Json);
    }
  }
}
