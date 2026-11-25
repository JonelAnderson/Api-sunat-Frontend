import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { serverMessages } from '@shared/functions/list-helpers';
import { isoToLima } from '@shared/functions/lima-dates';
import { DocKind, SaleKind, kindFromVista, sunatBadge, sunatStatusName } from '../../models/tenant-views.models';
import { TenantViewsService } from '../../services/tenant-views.service';

/** `data` de `GET tenants/{id}/{tipo}/{docId}/anulacion` (camelCase, §10.3). */
interface VoidRecord {
  tipo: 'RA' | 'RC' | string;
  id: number;
  identifier: string;
  vista: 'anulaciones' | 'resumenes' | string;
  sunatStatus: string;
  sunatCode?: string | null;
  sunatDescription?: string | null;
  ticket?: string | null;
  hasXml: boolean;
  hasCdr: boolean;
  createdAt?: string | null;
}

/**
 * Constancia de anulación de una factura, boleta o nota (§10.3): la comunicación de baja (RA) o el resumen de anulación (RC)
 * más reciente que contiene el comprobante, con su estado SUNAT y la descarga de su XML y su CDR. `autoload` la busca al
 * abrir (comprobante anulado o en anulación); si no, hay un botón para buscarla.
 */
@Component({
  selector: 'app-doc-void-record',
  imports: [NgClass],
  template: `
    <div class="erp-doc__section">
      <h6 class="erp-doc__section-title"><em class="feather icon-slash"></em>Constancia de anulación</h6>
      @if (loading()) {
      <div class="erp-loading py-2" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Buscando…</div>
      } @else if (record(); as r) {
      <div class="erp-doc__grid mb-2">
        <div><span class="erp-doc__label">{{ r.tipo === 'RC' ? 'Resumen de anulación' : 'Comunicación de baja' }}</span><span class="erp-doc__value">{{ r.identifier }}</span></div>
        <div><span class="erp-doc__label">Estado SUNAT</span><span class="badge" [ngClass]="badge(r.sunatStatus)">{{ status(r.sunatStatus) }}</span></div>
        @if (r.sunatCode) {<div><span class="erp-doc__label">Código</span><span class="erp-doc__value">{{ r.sunatCode }}</span></div>}
        @if (r.ticket) {<div><span class="erp-doc__label">Ticket</span><span class="erp-doc__value">{{ r.ticket }}</span></div>}
        @if (r.createdAt) {<div><span class="erp-doc__label">Registrada</span><span class="erp-doc__value">{{ when(r.createdAt) }}</span></div>}
      </div>
      @if (r.sunatDescription) {<p class="small mb-2">{{ r.sunatDescription }}</p>}
      <div class="d-flex flex-wrap gap-2">
        <button type="button" class="btn btn-sm btn-outline-primary" [disabled]="!r.hasXml || busy()" (click)="download('xml', r)"><em class="feather icon-code me-1"></em>XML</button>
        <button type="button" class="btn btn-sm btn-outline-primary" [disabled]="!r.hasCdr || busy()" (click)="download('cdr', r)"><em class="feather icon-check-square me-1"></em>CDR</button>
        @if (r.vista === 'anulaciones' || r.vista === 'resumenes') {
        <button type="button" class="btn btn-sm btn-link" (click)="openDetail(r)"><em class="feather icon-eye me-1"></em>Ver su detalle</button>
        }
      </div>
      } @else if (message()) {
      <p class="small text-muted mb-0">{{ message() }}</p>
      } @else {
      <button type="button" class="btn btn-sm btn-outline-secondary" (click)="load()"><em class="feather icon-search me-1"></em>Buscar la constancia de anulación</button>
      }
    </div>
  `
})
export class DocVoidRecordComponent implements OnInit {
  private views = inject(TenantViewsService);

  readonly tenantId = input.required<number>();
  readonly kind = input.required<SaleKind>();
  readonly docId = input.required<number>();
  readonly autoload = input(false);
  readonly openRecord = output<{ kind: DocKind; id: number }>();

  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly record = signal<VoidRecord | null>(null);
  readonly message = signal('');

  ngOnInit(): void {
    if (this.autoload()) {
      this.load();
    }
  }

  status(value: string): string {
    return sunatStatusName(value);
  }

  badge(value: string): string {
    return sunatBadge(value);
  }

  when(value: string): string {
    return isoToLima(value);
  }

  load(): void {
    this.loading.set(true);
    this.message.set('');
    this.views.voidRecord(this.tenantId(), this.kind(), this.docId()).subscribe({
      next: (resp) => {
        this.loading.set(false);
        if (resp.succeeded && resp.data) {
          this.record.set(resp.data as VoidRecord);
        } else {
          this.message.set(serverMessages(resp, 'El comprobante no tiene una comunicación de baja ni un resumen de anulación.'));
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.message.set(serverMessages(err?.error, 'No se pudo consultar la constancia de anulación.'));
      }
    });
  }

  openDetail(r: VoidRecord): void {
    const kind = kindFromVista(r.vista);
    if (kind) {
      this.openRecord.emit({ kind, id: r.id });
    }
  }

  async download(file: 'xml' | 'cdr', r: VoidRecord): Promise<void> {
    this.busy.set(true);
    try {
      await this.views.downloadVoidFile(this.tenantId(), this.kind(), this.docId(), file, r.identifier);
    } finally {
      this.busy.set(false);
    }
  }
}
