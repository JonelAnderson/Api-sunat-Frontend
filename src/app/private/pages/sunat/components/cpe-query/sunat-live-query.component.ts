import { Component, OnChanges, SimpleChanges, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { SharedModule } from '@shared/shared.module';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { serverMessages } from '@shared/functions/list-helpers';
import { ymdToDisplay } from '@shared/functions/lima-dates';
import { FileDownloadService, base64ToBlob } from '@shared/service/file-download.service';
import { Json, ViewBlock, obj, str } from '../../models/tenant-views.models';
import { TenantViewsService } from '../../services/tenant-views.service';
import { ViewBlockComponent } from '../tenant-page/view-block.component';
import { CDR_TYPE_OPTIONS, CPE_TYPE_OPTIONS, LiveQueryPreset, cdrResultBlock, cpeResultBlock } from './sunat-live.views';

interface CpeForm {
  tipo_doc: string;
  serie: string;
  correlativo: string;
  fecha: string;
  monto: string;
  ruc_emisor: string;
}

interface CdrForm {
  tipo_documento: string;
  serie: string;
  correlativo: string;
}

/** Mensaje de una respuesta con error HTTP (429 límite, 500 SUNAT, 404 empresa). */
function httpError(err: unknown): string {
  const e = err instanceof HttpErrorResponse ? err : null;
  const fallback = e?.status === 429 ? 'Se agotó el límite de consultas por minuto (de la empresa o suyo). Espere un minuto y vuelva a intentarlo.'
    : e?.status === 404 ? 'No existe la empresa.'
      : e?.status === 0 ? 'No se pudo conectar con la API.'
        : 'SUNAT no respondió o devolvió un error. Intente de nuevo en unos minutos.';
  return serverMessages(e?.error, fallback);
}

/**
 * Formularios de las consultas en vivo a SUNAT de una empresa (§10.5, `Admin.Sunat.Query`): Consulta Integrada de CPE
 * (`GET tenants/{id}/consultar-cpe`) y consulta del CDR (`GET tenants/{id}/consultar-cdr`). Usan las credenciales guardadas
 * de la empresa (nunca se ven), no guardan nada, cuentan en el límite por minuto de la empresa y del administrador (20) y
 * quedan siempre en la auditoría. Lo usan la pantalla Consulta CPE y el detalle de un documento (prellenado).
 */
@Component({
  selector: 'app-sunat-live-query',
  imports: [SharedModule, ViewBlockComponent],
  template: `
    <div class="row g-3">
      <div [class]="compact() ? 'col-12' : 'col-xl-6'">
        <form class="erp-form border rounded p-3 h-100" (ngSubmit)="runCpe()" novalidate>
          <h6 class="mb-1"><em class="feather icon-search me-1 text-primary"></em>Consulta integrada de comprobantes (CPE)</h6>
          <p class="small text-muted">Estado del comprobante en SUNAT y del RUC del emisor.</p>
          <div class="row g-2">
            <div class="col-12 col-md-6">
              <label class="form-label small" [for]="id('cpe-tipo')">Tipo <span class="erp-required">*</span></label>
              <select [id]="id('cpe-tipo')" class="form-select form-select-sm" name="tipo_doc" [(ngModel)]="cpe.tipo_doc">
                @for (o of cpeTypes; track o.id) {<option [value]="o.id">{{ o.name }}</option>}
              </select>
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label small" [for]="id('cpe-serie')">Serie <span class="erp-required">*</span></label>
              <input [id]="id('cpe-serie')" class="form-control form-control-sm text-uppercase" name="serie" [(ngModel)]="cpe.serie" maxlength="4" placeholder="F001" />
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label small" [for]="id('cpe-corr')">Correlativo <span class="erp-required">*</span></label>
              <input [id]="id('cpe-corr')" class="form-control form-control-sm" name="correlativo" [(ngModel)]="cpe.correlativo" maxlength="8" inputmode="numeric" />
            </div>
            <div class="col-6 col-md-4">
              <label class="form-label small" [for]="id('cpe-fecha')">Fecha de emisión <span class="erp-required">*</span></label>
              <input [id]="id('cpe-fecha')" type="date" class="form-control form-control-sm" name="fecha" [(ngModel)]="cpe.fecha" />
            </div>
            <div class="col-6 col-md-4">
              <label class="form-label small" [for]="id('cpe-monto')">Importe total <span class="erp-required">*</span></label>
              <input [id]="id('cpe-monto')" type="number" min="0" step="0.01" class="form-control form-control-sm" name="monto" [(ngModel)]="cpe.monto" />
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label small" [for]="id('cpe-ruc')">RUC del emisor</label>
              <input [id]="id('cpe-ruc')" class="form-control form-control-sm" name="ruc_emisor" [(ngModel)]="cpe.ruc_emisor" maxlength="11" inputmode="numeric"
                placeholder="El de la empresa" />
            </div>
          </div>
          @if (cpeInvalid()) {<div class="text-danger small mt-2">{{ cpeInvalid() }}</div>}
          <div class="d-flex align-items-center gap-2 mt-3">
            <button type="submit" class="btn btn-sm btn-primary" [disabled]="!tenantId() || cpeBusy()">
              @if (cpeBusy()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
              @else {<em class="feather icon-send me-1"></em>}
              Consultar en SUNAT
            </button>
            @if (!tenantId()) {<span class="small text-muted">Elija la empresa.</span>}
          </div>
          @if (cpeError()) {<div class="alert alert-warning small mt-3 mb-0">{{ cpeError() }}</div>}
          @if (cpeResult(); as r) {<div class="mt-3"><app-view-block [block]="r"></app-view-block></div>}
        </form>
      </div>

      @if (showCdr()) {
      <div [class]="compact() ? 'col-12' : 'col-xl-6'">
        <form class="erp-form border rounded p-3 h-100" (ngSubmit)="runCdr()" novalidate>
          <h6 class="mb-1"><em class="feather icon-check-square me-1 text-primary"></em>Consulta del CDR</h6>
          <p class="small text-muted">Respuesta de SUNAT (aceptado o no, código y notas) y su constancia en ZIP. Solo facturas, boletas y notas.</p>
          <div class="row g-2">
            <div class="col-12 col-md-6">
              <label class="form-label small" [for]="id('cdr-tipo')">Tipo <span class="erp-required">*</span></label>
              <select [id]="id('cdr-tipo')" class="form-select form-select-sm" name="tipo_documento" [(ngModel)]="cdr.tipo_documento">
                @for (o of cdrTypes; track o.id) {<option [value]="o.id">{{ o.name }}</option>}
              </select>
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label small" [for]="id('cdr-serie')">Serie <span class="erp-required">*</span></label>
              <input [id]="id('cdr-serie')" class="form-control form-control-sm text-uppercase" name="serie" [(ngModel)]="cdr.serie" maxlength="4" placeholder="F001" />
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label small" [for]="id('cdr-corr')">Correlativo <span class="erp-required">*</span></label>
              <input [id]="id('cdr-corr')" class="form-control form-control-sm" name="correlativo" [(ngModel)]="cdr.correlativo" maxlength="8" inputmode="numeric" />
            </div>
          </div>
          @if (cdrInvalid()) {<div class="text-danger small mt-2">{{ cdrInvalid() }}</div>}
          <div class="d-flex align-items-center gap-2 mt-3">
            <button type="submit" class="btn btn-sm btn-primary" [disabled]="!tenantId() || cdrBusy()">
              @if (cdrBusy()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
              @else {<em class="feather icon-send me-1"></em>}
              Consultar CDR
            </button>
            @if (cdrZip()) {
            <button type="button" class="btn btn-sm btn-outline-primary" (click)="saveCdr()"><em class="feather icon-download me-1"></em>Descargar CDR (ZIP)</button>
            }
          </div>
          @if (cdrError()) {<div class="alert alert-warning small mt-3 mb-0">{{ cdrError() }}</div>}
          @if (cdrResult(); as r) {<div class="mt-3"><app-view-block [block]="r"></app-view-block></div>}
        </form>
      </div>
      }
    </div>
  `
})
export class SunatLiveQueryComponent implements OnChanges {
  private views = inject(TenantViewsService);
  private files = inject(FileDownloadService);

  readonly tenantId = input<number | null>(null);
  readonly preset = input<LiveQueryPreset | null>(null);
  /** Muestra la consulta del CDR (solo facturas, boletas y notas). */
  readonly showCdr = input(true);
  /** Una columna (dentro del detalle de un documento). */
  readonly compact = input(false);

  readonly cpeTypes = CPE_TYPE_OPTIONS;
  readonly cdrTypes = CDR_TYPE_OPTIONS;
  cpe: CpeForm = { tipo_doc: '01', serie: '', correlativo: '', fecha: '', monto: '', ruc_emisor: '' };
  cdr: CdrForm = { tipo_documento: '01', serie: '', correlativo: '' };

  readonly cpeBusy = signal(false);
  readonly cpeError = signal('');
  readonly cpeInvalid = signal('');
  readonly cpeResult = signal<ViewBlock | null>(null);
  readonly cdrBusy = signal(false);
  readonly cdrError = signal('');
  readonly cdrInvalid = signal('');
  readonly cdrResult = signal<ViewBlock | null>(null);
  readonly cdrZip = signal('');
  private cdrName = '';
  private readonly uid = Math.random().toString(36).substring(2, 8);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['preset'] && this.preset()) {
      const p = this.preset()!;
      this.cpe = {
        tipo_doc: CPE_TYPE_OPTIONS.some((o) => o.id === p.tipo) ? p.tipo : '01', serie: p.serie, correlativo: p.correlativo, fecha: p.fechaYmd,
        monto: p.monto != null ? String(p.monto) : '', ruc_emisor: ''
      };
      this.cdr = { tipo_documento: CDR_TYPE_OPTIONS.some((o) => o.id === p.tipo) ? p.tipo : '01', serie: p.serie, correlativo: p.correlativo };
    }
    if (changes['tenantId'] && !changes['tenantId'].firstChange) {
      // Otra empresa: el resultado anterior ya no corresponde.
      this.cpeResult.set(null);
      this.cpeError.set('');
      this.cdrResult.set(null);
      this.cdrError.set('');
      this.cdrZip.set('');
    }
  }

  id(name: string): string {
    return `slq-${this.uid}-${name}`;
  }

  private cpeProblem(): string {
    const c = this.cpe;
    if (!/^[A-Za-z0-9]{1,4}$/.test(c.serie.trim())) {
      return 'La serie tiene de 1 a 4 letras o números.';
    }
    if (!/^\d{1,8}$/.test(str(c.correlativo).trim())) {
      return 'El correlativo es un número de hasta 8 dígitos.';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) {
      return 'Indique la fecha de emisión.';
    }
    if (str(c.monto) === '' || !(Number(c.monto) >= 0)) {
      return 'Indique el importe total del comprobante.';
    }
    if (c.ruc_emisor.trim() && !/^\d{11}$/.test(c.ruc_emisor.trim())) {
      return 'El RUC del emisor tiene 11 dígitos (o déjelo vacío para usar el de la empresa).';
    }
    return '';
  }

  runCpe(): void {
    const tenantId = this.tenantId();
    this.cpeInvalid.set(this.cpeProblem());
    if (!tenantId || this.cpeInvalid() || this.cpeBusy()) {
      return;
    }
    const c = this.cpe;
    this.cpeBusy.set(true);
    this.cpeError.set('');
    this.cpeResult.set(null);
    this.views.consultarCpe(tenantId, {
      tipo_doc: c.tipo_doc, serie: c.serie.trim().toUpperCase(), correlativo: str(c.correlativo).trim(), fecha_emision: ymdToDisplay(c.fecha),
      monto: str(c.monto), ruc_emisor: c.ruc_emisor.trim()
    }).subscribe({
      next: (resp: BaseResponse) => {
        this.cpeBusy.set(false);
        if (resp.succeeded && resp.data) {
          this.cpeResult.set(cpeResultBlock(obj(resp.data)));
        } else {
          this.cpeError.set(serverMessages(resp, 'SUNAT no devolvió un resultado.'));
        }
      },
      error: (err) => {
        this.cpeBusy.set(false);
        this.cpeError.set(httpError(err));
      }
    });
  }

  private cdrProblem(): string {
    if (!/^[A-Za-z0-9]{4}$/.test(this.cdr.serie.trim())) {
      return 'La serie tiene 4 letras o números.';
    }
    if (!/^\d{1,8}$/.test(str(this.cdr.correlativo).trim())) {
      return 'El correlativo es un número de hasta 8 dígitos.';
    }
    return '';
  }

  runCdr(): void {
    const tenantId = this.tenantId();
    this.cdrInvalid.set(this.cdrProblem());
    if (!tenantId || this.cdrInvalid() || this.cdrBusy()) {
      return;
    }
    const values = { tipo_documento: this.cdr.tipo_documento, serie: this.cdr.serie.trim().toUpperCase(), correlativo: str(this.cdr.correlativo).trim() };
    this.cdrBusy.set(true);
    this.cdrError.set('');
    this.cdrResult.set(null);
    this.cdrZip.set('');
    this.views.consultarCdr(tenantId, values).subscribe({
      next: (resp: BaseResponse) => {
        this.cdrBusy.set(false);
        if (resp.succeeded && resp.data) {
          const d: Json = obj(resp.data);
          this.cdrResult.set(cdrResultBlock(d));
          this.cdrZip.set(typeof d['cdr_zip'] === 'string' ? d['cdr_zip'] : '');
          this.cdrName = `R-${values.tipo_documento}-${values.serie}-${values.correlativo}.zip`;
        } else {
          this.cdrError.set(serverMessages(resp, 'SUNAT no devolvió un resultado.'));
        }
      },
      error: (err) => {
        this.cdrBusy.set(false);
        this.cdrError.set(httpError(err));
      }
    });
  }

  saveCdr(): void {
    try {
      this.files.saveBlob(base64ToBlob(this.cdrZip(), 'application/zip'), this.cdrName);
    } catch {
      this.cdrError.set('El CDR que devolvió SUNAT no se pudo leer.');
    }
  }
}
