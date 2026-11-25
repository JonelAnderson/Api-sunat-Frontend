import { Component, computed, inject, input, output, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { serverMessages } from '@shared/functions/list-helpers';
import { targetFromResource } from '../../models/document-actions.models';
import { DocFile, Json, arr, fileAvailable, kindInfo, money, obj, str, sunatBadge, sunatStatusName } from '../../models/tenant-views.models';
import { TenantViewsService } from '../../services/tenant-views.service';
import { openDocDetail } from '../tenant-page/tenant-doc-detail.component';
import { openPdfPreview } from '../tenant-page/pdf-preview.component';
import { IssueOutcome } from './emission-submit';
import { EmissionContext, EmitType } from './emission-types';

/**
 * Resultado de una emisión: número (serie-correlativo o identificador del resumen), estado SUNAT guardado, `messages` de la
 * API (con sus advertencias), y si la respuesta fue **repetida** por la idempotencia (no se emitió otro). Acciones: ver el
 * documento (detalle de §9 con sus acciones), vista previa del PDF y descargas por las rutas del panel, "Emitir otro" (el
 * formulario y su clave se crean de nuevo) y volver a los comprobantes de la empresa.
 */
@Component({
  selector: 'app-emission-result',
  imports: [NgClass, RouterModule],
  template: `
    <div class="border rounded p-3 mb-3" [class.border-success]="!outcome().replayed" [class.border-info]="outcome().replayed">
      <div class="d-flex flex-wrap justify-content-between gap-3">
        <div>
          <div class="small text-muted">{{ type().name }} · {{ ctx().tenantName }}</div>
          <h4 class="mb-1">{{ number() || 'Documento creado' }}</h4>
          @if (status()) {<span class="badge" [ngClass]="badge()">{{ statusName() }}</span>}
          @if (total()) {<span class="ms-2 fw-semibold">{{ total() }}</span>}
        </div>
        <em class="feather icon-check-circle text-success" style="font-size: 2rem" aria-hidden="true"></em>
      </div>
      @if (outcome().replayed) {
      <div class="alert alert-info small mt-3 mb-0">La API ya había procesado esta misma emisión (misma clave de idempotencia): se muestra el resultado existente y
        <strong>no se emitió otro comprobante</strong>.</div>
      }
      @if (messages()) {<p class="small mt-3 mb-0">{{ messages() }}</p>}
      @if (status() === 'pendiente') {
      <p class="small text-muted mt-2 mb-0">Quedó pendiente: envíelo a SUNAT con "Reenviar a SUNAT" desde su detalle{{ type().id === 'boletas' ? ', o inclúyalo en el resumen diario de su fecha' : '' }}.</p>
      } @else if (status() === 'enviado') {
      <p class="small text-muted mt-2 mb-0">Encolado para SUNAT: el estado final (aceptado o rechazado) llega en unos segundos; ábralo o refresque su estado.</p>
      }
    </div>

    @if (summaryDocs().length) {
    <div class="table-responsive mb-3">
      <table class="table table-sm small mb-0">
        <thead><tr><th scope="col">Boleta</th><th scope="col">Cliente</th><th scope="col" class="text-end">Total</th><th scope="col">Estado</th></tr></thead>
        <tbody>
          @for (d of summaryDocs(); track $index) {
          <tr><td>{{ d['serie_nro'] }}</td><td>{{ client(d) }}</td><td class="text-end erp-num">{{ amount(d['total']) }}</td><td>{{ statusText(d['estado_sunat']) }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    }

    <div class="d-flex flex-wrap gap-2">
      @if (docId() !== null) {
      <button type="button" class="btn btn-primary btn-sm" (click)="view()"><em class="feather icon-eye me-1"></em>Ver documento</button>
      @if (hasPdf()) {
      <button type="button" class="btn btn-outline-primary btn-sm" (click)="preview()"><em class="feather icon-file me-1"></em>Vista previa del PDF</button>
      <button type="button" class="btn btn-outline-primary btn-sm" [disabled]="busy()" (click)="download('pdf')"><em class="feather icon-download me-1"></em>PDF</button>
      }
      <button type="button" class="btn btn-outline-primary btn-sm" [disabled]="busy() || !can('xml')" (click)="download('xml')"
        [title]="can('xml') ? 'Descargar el XML' : 'La API aún no tiene el XML'"><em class="feather icon-code me-1"></em>XML</button>
      <button type="button" class="btn btn-outline-primary btn-sm" [disabled]="busy() || !can('cdr')" (click)="download('cdr')"
        [title]="can('cdr') ? 'Descargar el CDR' : 'SUNAT aún no responde'"><em class="feather icon-check-square me-1"></em>CDR</button>
      }
      <button type="button" class="btn btn-outline-success btn-sm" (click)="again.emit()"><em class="feather icon-plus me-1"></em>Emitir otro</button>
      <a class="btn btn-light btn-sm" [routerLink]="['/private/sunat/tenants', ctx().tenantId]" [queryParams]="{ tab: type().group === 'venta' ? 'comprobantes' : 'otros' }">
        <em class="feather icon-list me-1"></em>Ver comprobantes de la empresa</a>
    </div>
  `
})
export class EmissionResultComponent {
  private modal = inject(NgbModal);
  private views = inject(TenantViewsService);

  readonly ctx = input.required<EmissionContext>();
  readonly type = input.required<EmitType>();
  readonly outcome = input.required<IssueOutcome>();
  readonly again = output<void>();

  readonly busy = signal(false);
  /** Datos actuales del documento (se actualizan si una acción del detalle lo cambia). */
  private readonly override = signal<Json | null>(null);

  readonly data = computed(() => this.override() ?? obj(this.outcome().resp?.data));
  private readonly target = computed(() => targetFromResource(this.ctx().tenantId, this.type().view, this.data(), this.ctx().active, this.ctx().tenantName));
  readonly docId = computed(() => this.target()?.docId ?? null);
  readonly number = computed(() => this.target()?.number ?? '');
  readonly status = computed(() => this.target()?.status ?? '');
  readonly messages = computed(() => serverMessages({ messages: this.outcome().resp?.messages }, ''));
  readonly summaryDocs = computed(() => (this.type().id === 'resumenes' ? arr(this.data()['documentos']) : []));
  readonly total = computed(() => {
    const d = this.data();
    const t = obj(d['totales']);
    const currency = str(d['tipo_moneda']) || 'PEN';
    if (t['total'] != null) {
      return money(t['total'], currency);
    }
    if (d['imp_retenido'] != null) {
      return `Retenido ${money(d['imp_retenido'], 'PEN')} · pagado ${money(d['imp_pagado'], 'PEN')}`;
    }
    if (d['imp_percibido'] != null) {
      return `Percibido ${money(d['imp_percibido'], 'PEN')} · cobrado ${money(d['imp_cobrado'], 'PEN')}`;
    }
    return '';
  });

  hasPdf(): boolean {
    return kindInfo(this.type().view).pdf;
  }

  statusName(): string {
    return sunatStatusName(this.status());
  }

  badge(): string {
    return sunatBadge(this.status());
  }

  statusText(v: unknown): string {
    return sunatStatusName(v);
  }

  amount(v: unknown): string {
    return money(v);
  }

  client(d: Json): string {
    const c = obj(d['cliente']);
    return [str(c['tipo_doc']), str(c['num_doc'])].filter(Boolean).join(' · ');
  }

  can(file: DocFile): boolean {
    return fileAvailable(this.type().view, this.data(), file);
  }

  view(): void {
    const id = this.docId();
    if (id == null) {
      return;
    }
    openDocDetail(this.modal, this.ctx().tenantId, this.type().view, id, null, {
      tenantActive: this.ctx().active, tenantName: this.ctx().tenantName, onChanged: () => this.reload()
    });
  }

  /** Después de una acción en el detalle (reenviar, refrescar…), vuelve a leer el documento para el estado de arriba. */
  private reload(): void {
    const id = this.docId();
    if (id == null) {
      return;
    }
    this.views.get(this.ctx().tenantId, `${this.type().view}/${id}`).subscribe({
      next: (resp) => {
        if (resp.succeeded && resp.data) {
          this.override.set(obj(resp.data));
        }
      },
      error: () => undefined
    });
  }

  preview(): void {
    const id = this.docId();
    if (id != null) {
      openPdfPreview(this.modal, this.ctx().tenantId, this.type().view, id, this.number());
    }
  }

  async download(file: DocFile): Promise<void> {
    const id = this.docId();
    if (id == null) {
      return;
    }
    this.busy.set(true);
    try {
      await this.views.download(this.ctx().tenantId, this.type().view, id, file, this.data());
    } finally {
      this.busy.set(false);
    }
  }
}
