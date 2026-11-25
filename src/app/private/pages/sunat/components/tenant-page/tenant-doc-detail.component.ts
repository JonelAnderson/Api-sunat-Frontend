import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { Router } from '@angular/router';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { openModal, serverMessages } from '@shared/functions/list-helpers';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { PermissionService } from '@shared/service/permission.service';
import { PERM } from '../../models/sunat.models';
import { ActionState, ActionTarget, actionPerms, docActions, targetFromResource } from '../../models/document-actions.models';
import { DocFile, DocKind, Json, PDF_FORMATS, SaleKind, fileAvailable, isSaleKind, kindInfo, num, obj, str } from '../../models/tenant-views.models';
import { TenantViewsService } from '../../services/tenant-views.service';
import { DocView, buildDocView } from './tenant-doc.views';
import { ViewBlockComponent } from './view-block.component';
import { DocVoidRecordComponent } from './doc-void-record.component';
import { openPdfPreview } from './pdf-preview.component';
import { SunatLiveQueryComponent } from '../cpe-query/sunat-live-query.component';
import { LiveQueryPreset } from '../cpe-query/sunat-live.views';
import { runDocAction } from '../document-actions/doc-actions';

/** Opciones de `openDocDetail`. */
export interface DocDetailOptions {
  /** `isActive` de la empresa si se conoce (página de la empresa); `null` = la API avisa si está suspendida. */
  tenantActive?: boolean | null;
  /** Razón social (RUC), para el resumen de los modales de acción. */
  tenantName?: string;
  /** Se llama al cerrar si alguna acción cambió el documento (el listado recarga). */
  onChanged?: () => void;
}

/**
 * Detalle de un documento de la empresa (`GET {tipo}/{docId}`; en liquidaciones de compra además `GET …/pagos`; facturas y
 * boletas ya traen `pagos` en el detalle). Muestra el estado SUNAT guardado y descarga XML / CDR / PDF por las rutas del
 * panel; el PDF también se ve en una vista previa (`inline=1`). Fase A (§10.3, §10.5): en facturas, boletas y notas, la
 * constancia de anulación (RA / RC); y, con `Admin.Sunat.Query`, la consulta en vivo de CPE (también liquidaciones de compra)
 * y de CDR, prellenadas con los datos del documento y solo al pulsar (son auditadas). Fase D (§11.8): las acciones del
 * documento según su tipo, estado y los permisos (corregir y reenviar, reenviar, refrescar en SUNAT, anular / revertir);
 * después de cada una vuelve a leer el detalle y, al cerrar, avisa al listado.
 */
@Component({
  selector: 'app-tenant-doc-detail',
  imports: [FormsModule, NgClass, ViewBlockComponent, DocVoidRecordComponent, SunatLiveQueryComponent],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather {{ icon }}"></em>Detalle del documento</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="close()"></button>
    </div>
    <div class="modal-body">
      @if (loading()) {
      <div class="erp-loading" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Cargando…</div>
      } @else if (error()) {
      <div class="alert alert-warning mb-0">{{ error() }}</div>
      } @else if (view(); as v) {
      <div class="erp-doc">
        <div class="erp-doc__head">
          <div>
            <p class="erp-doc__type">{{ v.type }}</p>
            <h4 class="erp-doc__number">{{ v.number || '—' }}</h4>
            @if (v.status) {<span class="badge" [ngClass]="v.status.badge">{{ v.status.text || 'Sin estado' }}</span>}
          </div>
          @if (v.total?.value) {
          <div class="erp-doc__total-box">
            <span class="erp-doc__label">{{ v.total.label }}</span>
            <div class="erp-doc__total-amount">{{ v.total.value }}</div>
          </div>
          }
        </div>

        @if (actions().length) {
        <div class="erp-doc__section">
          <h6 class="erp-doc__section-title"><em class="feather icon-zap"></em>Acciones ante SUNAT</h6>
          <div class="d-flex flex-wrap gap-2">
            @for (a of actions(); track a.id) {
            <button type="button" class="btn btn-sm" [ngClass]="a.danger ? 'btn-outline-danger' : 'btn-outline-primary'" [disabled]="!a.enabled || acting()"
              [title]="a.reason || a.label" (click)="act(a)"><em class="feather {{ a.feather }} me-1"></em>{{ a.label }}</button>
            }
          </div>
          @for (a of actions(); track a.id) {
          @if (!a.enabled && a.reason) {<p class="small text-muted mt-2 mb-0"><strong>{{ a.label }}:</strong> {{ a.reason }}</p>}
          }
          <p class="small text-muted mt-2 mb-0">Actúan en nombre de la empresa con sus credenciales guardadas, piden motivo y quedan en la auditoría.</p>
        </div>
        }

        @if (canEmitNote()) {
        <div class="erp-doc__section">
          <h6 class="erp-doc__section-title"><em class="feather icon-corner-up-left"></em>Emitir una nota sobre este comprobante</h6>
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm btn-outline-primary" (click)="emitNote('notas-credito')"><em class="feather icon-corner-up-left me-1"></em>Emitir nota de crédito</button>
            <button type="button" class="btn btn-sm btn-outline-primary" (click)="emitNote('notas-debito')"><em class="feather icon-corner-up-right me-1"></em>Emitir nota de débito</button>
          </div>
          <p class="small text-muted mt-2 mb-0">Abre el formulario con el documento que modifica, el cliente, la moneda y los ítems ya copiados.</p>
        </div>
        }

        <div class="erp-doc__section">
          <h6 class="erp-doc__section-title"><em class="feather icon-download"></em>Archivos</h6>
          <div class="erp-doc__links align-items-center">
            <button type="button" class="btn btn-sm btn-outline-primary" [disabled]="!can('xml') || busy()" (click)="download('xml')">
              <em class="feather icon-code"></em>XML
            </button>
            <button type="button" class="btn btn-sm btn-outline-primary" [disabled]="!can('cdr') || busy()" (click)="download('cdr')">
              <em class="feather icon-check-square"></em>CDR
            </button>
            @if (pdf) {
            <div class="input-group input-group-sm w-auto">
              <select class="form-select form-select-sm" aria-label="Formato del PDF" [(ngModel)]="pdfFormat">
                @for (f of formats; track f.id) {<option [value]="f.id">{{ f.name }}</option>}
              </select>
              <button type="button" class="btn btn-outline-primary" [disabled]="busy()" (click)="preview()" title="Ver el PDF aquí, sin descargarlo">
                <em class="feather icon-eye me-1"></em>Vista previa
              </button>
              <button type="button" class="btn btn-outline-primary" [disabled]="busy()" (click)="download('pdf')">
                <em class="feather icon-file me-1"></em>PDF
              </button>
            </div>
            }
            @if (busy()) {<span class="spinner-border spinner-border-sm text-primary" role="status" aria-label="Descargando"></span>}
          </div>
          @if (!can('xml') || !can('cdr')) {
          <p class="small text-muted mt-2 mb-0">Los botones deshabilitados indican que la API aún no tiene ese archivo (sin firmar o sin respuesta de SUNAT).</p>
          }
        </div>

        <app-view-block [block]="v.block"></app-view-block>

        @for (k of [reloadKey()]; track k) {
        @if (saleKind(); as sk) {
        <app-doc-void-record [tenantId]="tenantId" [kind]="sk" [docId]="docId" [autoload]="voided()" (openRecord)="openRelated($event)"></app-doc-void-record>
        }
        }

        @if (livePreset(); as p) {
        <div class="erp-doc__section">
          <h6 class="erp-doc__section-title"><em class="feather icon-radio"></em>Consultar en SUNAT (en vivo)</h6>
          @if (!showLive()) {
          <p class="small text-muted mb-2">Consulta a SUNAT con las credenciales guardadas de la empresa. No cambia el estado guardado; queda en la auditoría y
            cuenta en el límite por minuto de la empresa y en el suyo.</p>
          <button type="button" class="btn btn-sm btn-outline-primary" (click)="showLive.set(true)"><em class="feather icon-search me-1"></em>Consultar CPE / CDR</button>
          } @else {
          <app-sunat-live-query [tenantId]="tenantId" [preset]="p" [showCdr]="!!saleKind()" [compact]="true"></app-sunat-live-query>
          }
        </div>
        }

        @if (v.totals.length) {
        <div class="erp-doc__totals">
          @for (t of v.totals; track $index) {
          <div [class.erp-doc__grand]="$last"><span>{{ t.label }}</span><span>{{ t.value }}</span></div>
          }
        </div>
        }
      </div>
      }
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" (click)="close()">Cerrar</button>
    </div>
  `
})
export class TenantDocDetailComponent implements OnInit {
  readonly activeModal = inject(NgbActiveModal);
  private views = inject(TenantViewsService);
  private modal = inject(NgbModal);
  private perms = inject(PermissionService);
  private alerts = inject(AlertModalService);
  private router = inject(Router);

  tenantId!: number;
  kind!: DocKind;
  docId!: number;
  /** Fila del listado (opcional): completa lo que el detalle no trae. */
  row: Json | null = null;
  /** `isActive` de la empresa (null = no se sabe). */
  tenantActive: boolean | null = null;
  tenantName = '';

  readonly formats = PDF_FORMATS;
  pdfFormat = 'a4';
  icon = 'icon-file-text';
  pdf = true;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly acting = signal(false);
  readonly view = signal<DocView | null>(null);
  /** Factura, boleta o nota: tiene constancia de anulación y consulta del CDR. */
  readonly saleKind = signal<SaleKind | null>(null);
  /** Anulado o en anulación: la constancia se busca al abrir. */
  readonly voided = signal(false);
  /** Datos para prellenar las consultas en vivo (solo con `Admin.Sunat.Query` y tipos que SUNAT consulta). */
  readonly livePreset = signal<LiveQueryPreset | null>(null);
  readonly showLive = signal(false);
  /** Acciones de la fase D del documento (§11.8). */
  readonly actions = signal<ActionState[]>([]);
  /** Cambia después de una acción: vuelve a crear la constancia de anulación. */
  readonly reloadKey = signal(0);
  private target: ActionTarget | null = null;
  private changed = false;
  private data: Json = {};

  ngOnInit(): void {
    const info = kindInfo(this.kind);
    this.icon = info?.icon ?? 'icon-file-text';
    this.pdf = !!info?.pdf;
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');
    const detail$ = this.views.get(this.tenantId, `${this.kind}/${this.docId}`);
    const payments$ = this.kind === 'liquidaciones-compra'
      ? this.views.get(this.tenantId, `${this.kind}/${this.docId}/pagos`).pipe(catchError(() => of(null as BaseResponse | null)))
      : of(null as BaseResponse | null);
    forkJoin([detail$, payments$]).subscribe({
      next: ([detail, payments]) => {
        this.loading.set(false);
        if (detail.succeeded && detail.data) {
          this.data = { ...(this.row ?? {}), ...obj(detail.data) };
          this.view.set(buildDocView(this.kind, obj(detail.data), this.row, payments?.succeeded ? obj(payments.data) : null));
          this.setExtras(this.data);
        } else {
          this.error.set(serverMessages(detail, 'No se pudo cargar el documento.'));
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(serverMessages(err?.error, 'No se pudo cargar el documento.'));
      }
    });
  }

  /** Constancia de anulación, consultas en vivo y acciones según el tipo, el estado y los permisos. */
  private setExtras(d: Json): void {
    const sale = isSaleKind(this.kind) ? this.kind : null;
    this.saleKind.set(sale);
    const estado = str(obj(d['sunat'])['estado']);
    this.voided.set(estado === 'anulado' || estado === 'anulacion_en_proceso');
    if ((sale || this.kind === 'liquidaciones-compra') && this.perms.hasPermission(PERM.sunatQuery)) {
      const totals = obj(d['totales']);
      this.livePreset.set({
        tipo: str(d['tipo_documento']) || (this.kind === 'liquidaciones-compra' ? '04' : ''), serie: str(d['serie']),
        correlativo: str(d['correlativo']).replace(/^0+(?=\d)/, ''), fechaYmd: str(d['fecha_emision']).substring(0, 10),
        monto: num(totals['total']) ?? num(totals['sub_total'])
      });
    }
    this.target = targetFromResource(this.tenantId, this.kind, d, this.tenantActive, this.tenantName || undefined);
    this.actions.set(docActions(this.target, actionPerms((p) => this.perms.hasPermission(p))));
  }

  async act(a: ActionState): Promise<void> {
    if (!this.target || !a.enabled || this.acting()) {
      return;
    }
    this.acting.set(true);
    try {
      if (await runDocAction(this.modal, this.alerts, this.target, a.id)) {
        this.changed = true;
        this.showLive.set(false);
        this.reloadKey.update((n) => n + 1);
        this.load();
      }
    } finally {
      this.acting.set(false);
    }
  }

  /** Factura o boleta aceptada (u observada), con Admin.Documents.Issue y la empresa no suspendida: puede llevar una nota. */
  canEmitNote(): boolean {
    const estado = str(obj(this.data['sunat'])['estado']);
    return (this.kind === 'facturas' || this.kind === 'boletas') && (estado === 'aceptado' || estado === 'observado') && this.tenantActive !== false
      && this.perms.hasPermission(PERM.documentsIssue);
  }

  /** Abre la emisión de la nota (entrega 3) con este comprobante como origen. */
  emitNote(kind: 'notas-credito' | 'notas-debito'): void {
    this.activeModal.close(this.changed);
    // Si el detalle estaba sobre otro modal (constancia, panel), se cierran todos antes de cambiar de pantalla.
    this.modal.dismissAll();
    void this.router.navigate(['/private/sunat/tenants', this.tenantId, 'emitir', kind], { queryParams: { origen: this.kind, origenId: this.docId } });
  }

  /** Cierra avisando si alguna acción cambió el documento. */
  close(): void {
    this.activeModal.close(this.changed);
  }

  preview(): void {
    openPdfPreview(this.modal, this.tenantId, this.kind, this.docId, this.view()?.number, this.pdfFormat);
  }

  /** Abre el detalle de la baja o del resumen de la constancia (encima de este). */
  openRelated(ref: { kind: DocKind; id: number }): void {
    openDocDetail(this.modal, this.tenantId, ref.kind, ref.id, null, {
      tenantActive: this.tenantActive, tenantName: this.tenantName, onChanged: () => {
        this.changed = true;
        this.reloadKey.update((n) => n + 1);
        this.load();
      }
    });
  }

  can(file: DocFile): boolean {
    return fileAvailable(this.kind, this.data, file);
  }

  async download(file: DocFile): Promise<void> {
    this.busy.set(true);
    try {
      await this.views.download(this.tenantId, this.kind, this.docId, file, this.data, this.pdfFormat);
    } finally {
      this.busy.set(false);
    }
  }
}

/** Abre el detalle de un documento de la empresa. Con `onChanged`, avisa al cerrar si una acción lo cambió. */
export function openDocDetail(modal: NgbModal, tenantId: number, kind: DocKind, docId: number, row?: Json | null, options?: DocDetailOptions): void {
  openModal<boolean>(modal, TenantDocDetailComponent, (ref) => Object.assign(ref.componentInstance, {
    tenantId, kind, docId, row: row ?? null, tenantActive: options?.tenantActive ?? null, tenantName: options?.tenantName ?? ''
  }), () => options?.onChanged?.(), 'xl');
}
