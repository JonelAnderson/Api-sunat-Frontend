import { Component, OnInit, inject, input, signal, viewChild } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { SharedModule } from '@shared/shared.module';
import { ListTableComponent } from '@shared/components/reusables/list-table/list-table.component';
import { TableAction } from '@shared/models/table-action.interface';
import { TableColumns } from '@shared/models/list-table.interface';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { PermissionService } from '@shared/service/permission.service';
import { actionsCol, query } from '@shared/functions/list-helpers';
import { actionPerms, targetFromResource } from '../../models/document-actions.models';
import { OTHER_KINDS, OtherKind, DocFile, Json, SUNAT_STATUS_OPTIONS, docNumber, fileAvailable, kindInfo } from '../../models/tenant-views.models';
import { ListSource, TenantViewsService } from '../../services/tenant-views.service';
import { decorateRow, listColumns, rowId } from './tenant-doc.views';
import { openDocDetail } from './tenant-doc-detail.component';
import { openPdfPreview } from './pdf-preview.component';
import { docTableActions, runDocAction, tableDocAction } from '../document-actions/doc-actions';

interface OtherFilters {
  sunat_status: string | null;
  tipo_documento: string | null;
  serie: string;
  fecha_desde: string;
  fecha_hasta: string;
  num_doc: string;
  mes: string;
  tipo: string | null;
}

const EMPTY: OtherFilters = { sunat_status: null, tipo_documento: null, serie: '', fecha_desde: '', fecha_hasta: '', num_doc: '', mes: '', tipo: null };

/** Filtro del documento del tercero según la vista (los nombres de `/api/v1`). */
const PARTY_PARAM: Partial<Record<OtherKind, { param: string; label: string }>> = {
  retenciones: { param: 'proveedor_num_doc', label: 'Documento del proveedor' },
  percepciones: { param: 'cliente_num_doc', label: 'Documento del cliente' },
  'liquidaciones-compra': { param: 'vendedor_num_doc', label: 'Documento del vendedor' }
};

/**
 * Pestaña Otros comprobantes (§9.3): guías de remisión, retenciones, percepciones, liquidaciones de compra, resúmenes
 * diarios y anulaciones. Cada vista con sus filtros de `/api/v1`, detalle en modal y descargas (resúmenes y anulaciones
 * sin PDF). Fase D (§11.8), en el menú de cada fila y en el detalle: reenviar (todos), refrescar (guías, resúmenes y bajas
 * en proceso), revertir (retenciones, percepciones y liquidaciones aceptadas) y corregir y reenviar (guías).
 */
@Component({
  selector: 'app-tenant-other-docs',
  imports: [SharedModule, ListTableComponent],
  template: `
    <div class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Tipo de documento">
      @for (k of kinds; track k.id) {
      <button type="button" class="btn btn-sm" [class.btn-primary]="kind() === k.id" [class.btn-outline-primary]="kind() !== k.id" (click)="setKind(k.id)">
        <em class="feather {{ k.icon }} me-1"></em>{{ k.name }}
      </button>
      }
    </div>

    <form class="erp-form border rounded p-3 mb-3" (ngSubmit)="search()" novalidate>
      <div class="row g-2">
        @if (kind() === 'resumenes') {
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="oth-mes">Mes de envío</label>
          <input id="oth-mes" type="month" class="form-control form-control-sm" name="mes" [(ngModel)]="f.mes" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="oth-tipo">Tipo</label>
          <select id="oth-tipo" class="form-select form-select-sm" name="tipo" [(ngModel)]="f.tipo">
            <option [ngValue]="null">Todos</option>
            <option ngValue="envio">Envío</option>
            <option ngValue="anulacion">Anulación</option>
          </select>
        </div>
        } @else {
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="oth-estado">Estado SUNAT</label>
          <select id="oth-estado" class="form-select form-select-sm" name="sunat_status" [(ngModel)]="f.sunat_status">
            <option [ngValue]="null">Todos</option>
            @for (o of sunatStates; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="oth-desde">{{ kind() === 'anulaciones' ? 'Comunicación desde' : 'Emisión desde' }}</label>
          <input id="oth-desde" type="date" class="form-control form-control-sm" name="fecha_desde" [(ngModel)]="f.fecha_desde" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="oth-hasta">{{ kind() === 'anulaciones' ? 'Comunicación hasta' : 'Emisión hasta' }}</label>
          <input id="oth-hasta" type="date" class="form-control form-control-sm" name="fecha_hasta" [(ngModel)]="f.fecha_hasta" />
        </div>
        @if (kind() !== 'anulaciones') {
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="oth-serie">Serie</label>
          <input id="oth-serie" type="text" class="form-control form-control-sm" name="serie" [(ngModel)]="f.serie" maxlength="10" />
        </div>
        }
        @if (kind() === 'guias-remision') {
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="oth-tipo-guia">Tipo de guía</label>
          <select id="oth-tipo-guia" class="form-select form-select-sm" name="tipo_documento" [(ngModel)]="f.tipo_documento">
            <option [ngValue]="null">Todas</option>
            <option ngValue="09">Remitente (09)</option>
            <option ngValue="31">Transportista (31)</option>
          </select>
        </div>
        }
        @if (party(); as p) {
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="oth-doc">{{ p.label }}</label>
          <input id="oth-doc" type="text" class="form-control form-control-sm" name="num_doc" [(ngModel)]="f.num_doc" maxlength="15" />
        </div>
        }
        }
      </div>
      <div class="d-flex flex-wrap gap-2 mt-3">
        <button type="submit" class="btn btn-sm btn-primary"><em class="feather icon-search me-1"></em>Buscar</button>
        <button type="button" class="btn btn-sm btn-light" (click)="clear()"><em class="feather icon-x me-1"></em>Limpiar</button>
        @if (bothDates()) {<span class="small text-muted align-self-center">El filtro por fecha necesita las dos fechas.</span>}
      </div>
    </form>

    @for (k of [kind()]; track k) {
    <app-list-table [service]="source" [columns]="columns" [getInputs]="getInputs()" [actions]="actions" (actionTriggered)="onAction($event)"></app-list-table>
    }
  `
})
export class TenantOtherDocsComponent implements OnInit {
  private views = inject(TenantViewsService);
  private modal = inject(NgbModal);
  private alerts = inject(AlertModalService);
  private perms = inject(PermissionService);

  readonly tenantId = input.required<number>();
  /** `isActive` de la empresa: suspendida, las acciones de la fase D quedan deshabilitadas. */
  readonly tenantActive = input<boolean | null>(null);
  readonly tenantName = input('');

  readonly kinds = OTHER_KINDS;
  /** Estados de SUNAT para el filtro (`estado` en anulaciones; mismo catálogo, ver el informe). */
  readonly sunatStates = SUNAT_STATUS_OPTIONS.filter((o) => ['pendiente', 'enviado', 'aceptado', 'rechazado', 'anulado'].includes(o.id));
  readonly kind = signal<OtherKind>('guias-remision');
  readonly getInputs = signal('');
  f: OtherFilters = { ...EMPTY };
  source!: ListSource;
  columns: TableColumns<Json>[] = [];
  readonly actions: TableAction[] = [
    { id: 'detail', label: 'Ver detalle', icon: 'visibility', color: 'primary' },
    { id: 'xml', label: 'Descargar XML', icon: 'code', color: 'primary', visible: (r: Json) => fileAvailable(this.kind(), r, 'xml') },
    { id: 'cdr', label: 'Descargar CDR', icon: 'verified', color: 'primary', visible: (r: Json) => fileAvailable(this.kind(), r, 'cdr') },
    { id: 'preview', label: 'Vista previa del PDF', icon: 'preview', color: 'primary', visible: () => kindInfo(this.kind()).pdf },
    { id: 'pdf', label: 'Descargar PDF (A4)', icon: 'picture_as_pdf', color: 'primary', visible: () => kindInfo(this.kind()).pdf },
    ...docTableActions<Json>((r) => targetFromResource(this.tenantId(), this.kind(), r, this.tenantActive(), this.tenantName() || undefined),
      actionPerms((p) => this.perms.hasPermission(p)))
  ];
  private readonly list = viewChild(ListTableComponent);

  ngOnInit(): void {
    this.source = this.views.listSource(this.tenantId(), () => this.kind(), (row) => decorateRow(this.kind())(row));
    this.columns = [...listColumns(this.kind()), actionsCol<Json>()];
    this.refresh();
  }

  party(): { param: string; label: string } | null {
    return PARTY_PARAM[this.kind()] ?? null;
  }

  /** Guías, retenciones y percepciones piden `fecha_desde` + `fecha_hasta` juntas. */
  bothDates(): boolean {
    return ['guias-remision', 'retenciones', 'percepciones'].includes(this.kind());
  }

  setKind(kind: OtherKind): void {
    if (kind === this.kind()) {
      return;
    }
    this.kind.set(kind);
    this.f = { ...EMPTY };
    this.columns = [...listColumns(kind), actionsCol<Json>()];
    this.refresh();
  }

  clear(): void {
    this.f = { ...EMPTY };
    this.refresh();
  }

  async search(): Promise<void> {
    if (this.bothDates() && !!this.f.fecha_desde !== !!this.f.fecha_hasta) {
      await this.alerts.showNotification('Atención', 'El filtro por fecha necesita las dos fechas (desde y hasta).', 'warning');
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
    const kind = this.kind();
    let values: Record<string, string | number | null>;
    if (kind === 'resumenes') {
      values = { mes: f.mes, tipo: f.tipo };
    } else if (kind === 'anulaciones') {
      values = { estado: f.sunat_status, fecha_desde: f.fecha_desde, fecha_hasta: f.fecha_hasta };
    } else {
      values = { sunat_status: f.sunat_status, fecha_desde: f.fecha_desde, fecha_hasta: f.fecha_hasta, serie: f.serie.trim() };
      if (kind === 'guias-remision') {
        values['tipo_documento'] = f.tipo_documento;
      }
      const p = this.party();
      if (p) {
        // Un filtro presente aplica aunque venga vacío (§9.3): query() solo manda los que tienen valor.
        values[p.param] = f.num_doc.trim();
      }
    }
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
      openPdfPreview(this.modal, this.tenantId(), this.kind(), id, docNumber(event.row));
      return;
    }
    void this.views.download(this.tenantId(), this.kind(), id, event.action as DocFile, event.row);
  }
}
