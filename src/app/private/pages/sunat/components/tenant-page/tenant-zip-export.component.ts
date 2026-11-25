import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { daysInRangeYmd, limaTodayYmd } from '@shared/functions/lima-dates';
import { rows } from '@shared/functions/list-helpers';
import { Option } from '../../models/sunat.models';
import { Json, SALE_KINDS, SUNAT_STATUS_OPTIONS, SaleKind, monthStartYmd, num, str } from '../../models/tenant-views.models';
import { TenantViewsService } from '../../services/tenant-views.service';

/** Tope del panel para el ZIP (§10.1 / §10.3): 31 días, 2 000 archivos, 200 MB (los dos últimos los valida la API). */
const MAX_DAYS = 31;

/**
 * Exportar ZIP de los comprobantes de una empresa (`GET tenants/{id}/comprobantes/exportar-zip`, §10.3): XML, PDF o ambos de
 * facturas, boletas y notas, en carpetas por tipo y mes. La API lo arma en streaming y comprueba antes los topes (31 días,
 * 2 000 archivos, 200 MB); si no se cumplen o no hay archivos, responde con el sobre y aquí se muestra su mensaje. Cada ZIP
 * queda en la auditoría.
 */
@Component({
  selector: 'app-tenant-zip-export',
  imports: [FormsModule],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-archive"></em>Exportar ZIP</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" [disabled]="busy()" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      @if (tenantName) {<p class="text-muted">{{ tenantName }}</p>}
      <form class="erp-form" (ngSubmit)="export()" novalidate>
        <div class="row g-3">
          <div class="col-6">
            <label class="form-label" for="zip-desde">Emisión desde <span class="erp-required">*</span></label>
            <input id="zip-desde" type="date" class="form-control" name="fecha_desde" [(ngModel)]="desde" />
          </div>
          <div class="col-6">
            <label class="form-label" for="zip-hasta">Emisión hasta <span class="erp-required">*</span></label>
            <input id="zip-hasta" type="date" class="form-control" name="fecha_hasta" [(ngModel)]="hasta" />
          </div>
          <div class="col-12">
            <span class="form-label d-block">Archivos</span>
            @for (t of fileTypes; track t.id) {
            <div class="form-check form-check-inline">
              <input class="form-check-input" type="radio" name="tipo" [id]="'zip-tipo-' + t.id" [value]="t.id" [(ngModel)]="tipo" />
              <label class="form-check-label" [for]="'zip-tipo-' + t.id">{{ t.name }}</label>
            </div>
            }
          </div>
          <div class="col-12">
            <span class="form-label d-block">Comprobantes <span class="erp-required">*</span></span>
            @for (k of kinds; track k.id) {
            <div class="form-check form-check-inline">
              <input class="form-check-input" type="checkbox" [id]="'zip-doc-' + k.id" [name]="'doc-' + k.id" [(ngModel)]="docs[k.id]" />
              <label class="form-check-label" [for]="'zip-doc-' + k.id">{{ k.name }}</label>
            </div>
            }
          </div>
          <div class="col-md-6">
            <label class="form-label" for="zip-sucursal">Sucursal</label>
            <select id="zip-sucursal" class="form-select" name="sucursal_id" [(ngModel)]="sucursalId">
              <option [ngValue]="null">Todas</option>
              @for (o of branches(); track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="zip-estado">Estado SUNAT</label>
            <select id="zip-estado" class="form-select" name="estado" [(ngModel)]="estado">
              <option [ngValue]="null">Todos</option>
              @for (o of states; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
            </select>
          </div>
        </div>
        @if (problem()) {<div class="text-danger small mt-3">{{ problem() }}</div>}
        <div class="erp-callout mt-3 mb-0" role="note">
          <em class="feather icon-info" aria-hidden="true"></em>
          <div>Desde el panel el ZIP abarca como máximo {{ maxDays }} días, 2 000 archivos y 200 MB. Si el periodo es más grande, divídalo en meses.
            La descarga queda en la auditoría.</div>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" [disabled]="busy()" (click)="activeModal.dismiss()">Cancelar</button>
      <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="export()">
        @if (busy()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Preparando…}
        @else {<em class="feather icon-download me-1"></em>Descargar ZIP}
      </button>
    </div>
  `
})
export class TenantZipExportComponent implements OnInit {
  readonly activeModal = inject(NgbActiveModal);
  private views = inject(TenantViewsService);

  tenantId!: number;
  ruc = '';
  tenantName = '';

  readonly maxDays = MAX_DAYS;
  readonly kinds = SALE_KINDS;
  readonly states = SUNAT_STATUS_OPTIONS;
  readonly fileTypes: Option<string>[] = [{ id: 'xml', name: 'XML' }, { id: 'pdf', name: 'PDF' }, { id: 'ambos', name: 'XML y PDF' }];
  readonly branches = signal<Option<number>[]>([]);
  readonly busy = signal(false);
  readonly problem = signal('');

  desde = '';
  hasta = '';
  tipo = 'xml';
  docs: Record<SaleKind, boolean> = { facturas: true, boletas: true, 'notas-credito': true, 'notas-debito': true };
  sucursalId: number | null = null;
  estado: string | null = null;

  ngOnInit(): void {
    this.hasta = limaTodayYmd();
    this.desde = monthStartYmd(this.hasta);
    this.views.get(this.tenantId, 'sucursales').subscribe({
      next: (resp) => {
        if (resp.succeeded) {
          this.branches.set(rows<Json>(resp).map((s) => ({ id: num(s['id']) ?? 0, name: `${str(s['nombre'])} (${str(s['cod_local'])})` })));
        }
      },
      error: () => undefined
    });
  }

  private validate(): string {
    if (!this.desde || !this.hasta) {
      return 'Indique las dos fechas.';
    }
    const days = daysInRangeYmd(this.desde, this.hasta);
    if (days < 1) {
      return 'La fecha "desde" no puede ser posterior a la fecha "hasta".';
    }
    if (days > MAX_DAYS) {
      return `Desde el panel el ZIP abarca como máximo ${MAX_DAYS} días. Divida el rango en meses.`;
    }
    if (!this.kinds.some((k) => this.docs[k.id])) {
      return 'Elija al menos un tipo de comprobante.';
    }
    return '';
  }

  async export(): Promise<void> {
    this.problem.set(this.validate());
    if (this.problem() || this.busy()) {
      return;
    }
    const documentos = this.kinds.filter((k) => this.docs[k.id]).map((k) => k.id).join(',');
    const fallback = `comprobantes_${this.ruc || this.tenantId}_${this.desde}_${this.hasta}_${this.tipo}.zip`;
    this.busy.set(true);
    try {
      const ok = await this.views.exportZip(this.tenantId, {
        fecha_desde: this.desde, fecha_hasta: this.hasta, tipo: this.tipo, documentos, sucursal_id: this.sucursalId, estado: this.estado
      }, fallback);
      if (ok) {
        this.activeModal.close(true);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
