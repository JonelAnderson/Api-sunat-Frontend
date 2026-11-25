import { Component, OnInit, inject, input, signal } from '@angular/core';
import { SharedModule } from '@shared/shared.module';
import { serverMessages } from '@shared/functions/list-helpers';
import { addDaysYmd, limaMonthYm, limaTodayYmd } from '@shared/functions/lima-dates';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { Option } from '../../models/sunat.models';
import {
  CURRENCY_OPTIONS, Json, PAYMENT_STATUS_OPTIONS, SUNAT_STATUS_OPTIONS, ViewBlock, arr, monthStartYmd, num, obj, str
} from '../../models/tenant-views.models';
import { QueryValues, TenantViewsService } from '../../services/tenant-views.service';
import { REPORTS, ReportKind, buildReport } from './tenant-report.views';
import { ViewBlockComponent } from './view-block.component';

/**
 * Pestaña Reportes (§9.5, solo JSON): `reportes/registro-ventas`, `ventas-consolidado`, `por-cliente` (con `fecha_desde` /
 * `fecha_hasta` obligatorias, máx. 366 días, y los filtros comunes) y `reportes/retenciones` (`periodo` yyyy-MM).
 */
@Component({
  selector: 'app-tenant-reports',
  imports: [SharedModule, ViewBlockComponent],
  template: `
    <div class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Reporte">
      @for (r of reports; track r.id) {
      <button type="button" class="btn btn-sm" [class.btn-primary]="kind() === r.id" [class.btn-outline-primary]="kind() !== r.id" (click)="setKind(r.id)">
        <em class="feather {{ r.icon }} me-1"></em>{{ r.name }}
      </button>
      }
    </div>

    <form class="erp-form border rounded p-3 mb-3" (ngSubmit)="run()" novalidate>
      <div class="row g-2">
        @if (kind() === 'retenciones') {
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="rep-periodo">Periodo <span class="erp-required">*</span></label>
          <input id="rep-periodo" type="month" class="form-control form-control-sm" name="periodo" [(ngModel)]="periodo" />
        </div>
        } @else {
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="rep-desde">Desde <span class="erp-required">*</span></label>
          <input id="rep-desde" type="date" class="form-control form-control-sm" name="fecha_desde" [(ngModel)]="desde" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="rep-hasta">Hasta <span class="erp-required">*</span></label>
          <input id="rep-hasta" type="date" class="form-control form-control-sm" name="fecha_hasta" [(ngModel)]="hasta" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="rep-cliente">Documento del cliente @if (kind() === 'por-cliente') {<span class="erp-required">*</span>}</label>
          <input id="rep-cliente" type="text" class="form-control form-control-sm" name="client_num_doc" [(ngModel)]="clientDoc" maxlength="15" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="rep-sucursal">Sucursal</label>
          <select id="rep-sucursal" class="form-select form-select-sm" name="sucursal_id" [(ngModel)]="sucursalId">
            <option [ngValue]="null">Todas</option>
            @for (s of sucursales(); track s.id) {<option [ngValue]="s.id">{{ s.name }}</option>}
          </select>
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="rep-serie">Serie</label>
          <input id="rep-serie" type="text" class="form-control form-control-sm" name="serie" [(ngModel)]="serie" maxlength="10" />
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="rep-sunat">Estado SUNAT</label>
          <select id="rep-sunat" class="form-select form-select-sm" name="estado_sunat" [(ngModel)]="estadoSunat">
            <option [ngValue]="null">Todos</option>
            @for (o of sunatStates; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="rep-pago">Estado de pago</label>
          <select id="rep-pago" class="form-select form-select-sm" name="estado_pago" [(ngModel)]="estadoPago">
            <option [ngValue]="null">Todos</option>
            @for (o of paymentStates; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
        </div>
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="rep-moneda">Moneda</label>
          <select id="rep-moneda" class="form-select form-select-sm" name="tipo_moneda" [(ngModel)]="moneda">
            <option [ngValue]="null">Todas</option>
            @for (o of currencies; track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
          </select>
        </div>
        @if (kind() === 'ventas-consolidado') {
        <div class="col-6 col-md-3 col-xl-2">
          <label class="form-label small" for="rep-agrupacion">Agrupación</label>
          <select id="rep-agrupacion" class="form-select form-select-sm" name="agrupacion" [(ngModel)]="agrupacion">
            <option [ngValue]="null">Por defecto</option>
            <option ngValue="dia">Por día</option>
            <option ngValue="semana">Por semana</option>
            <option ngValue="mes">Por mes</option>
          </select>
        </div>
        }
        }
      </div>
      <div class="d-flex flex-wrap gap-2 mt-3">
        <button type="submit" class="btn btn-sm btn-primary" [disabled]="loading()">
          @if (loading()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
          @else {<em class="feather icon-play me-1"></em>}
          Generar
        </button>
        @if (kind() !== 'retenciones') {<span class="small text-muted align-self-center">Rango de hasta 366 días. Los datos pueden tener hasta 5 minutos de antigüedad.</span>}
      </div>
    </form>

    @if (error()) {
    <div class="alert alert-warning small">{{ error() }}</div>
    } @else if (block()) {
    <app-view-block [block]="block()"></app-view-block>
    } @else if (!loading()) {
    <p class="small text-muted">Elija los filtros y pulse Generar.</p>
    }
  `
})
export class TenantReportsComponent implements OnInit {
  private views = inject(TenantViewsService);
  private alerts = inject(AlertModalService);

  readonly tenantId = input.required<number>();

  readonly reports = REPORTS;
  readonly sunatStates = SUNAT_STATUS_OPTIONS;
  readonly paymentStates = PAYMENT_STATUS_OPTIONS;
  readonly currencies = CURRENCY_OPTIONS;
  readonly kind = signal<ReportKind>('registro-ventas');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly block = signal<ViewBlock | null>(null);
  readonly sucursales = signal<Option<number>[]>([]);

  desde = monthStartYmd(limaTodayYmd());
  hasta = limaTodayYmd();
  periodo = limaMonthYm();
  clientDoc = '';
  sucursalId: number | null = null;
  serie = '';
  estadoSunat: string | null = null;
  estadoPago: string | null = null;
  moneda: string | null = null;
  agrupacion: string | null = null;

  ngOnInit(): void {
    this.views.get(this.tenantId(), 'sucursales').subscribe({
      next: (resp) => {
        if (resp.succeeded) {
          this.sucursales.set(arr(resp.data).map((s: Json) => ({ id: num(s['id']) ?? 0, name: `${str(s['nombre'])} (${str(s['cod_local'])})` })));
        }
      },
      error: () => undefined
    });
  }

  setKind(kind: ReportKind): void {
    this.kind.set(kind);
    this.block.set(null);
    this.error.set('');
  }

  async run(): Promise<void> {
    const kind = this.kind();
    let values: QueryValues;
    if (kind === 'retenciones') {
      if (!/^\d{4}-\d{2}$/.test(this.periodo ?? '')) {
        await this.alerts.showNotification('Atención', 'Elija el periodo (mes).', 'warning');
        return;
      }
      values = { periodo: this.periodo };
    } else {
      if (!this.desde || !this.hasta || this.desde > this.hasta) {
        await this.alerts.showNotification('Atención', 'Elija las dos fechas; "desde" no puede ser posterior a "hasta".', 'warning');
        return;
      }
      if (addDaysYmd(this.desde, 365) < this.hasta) {
        await this.alerts.showNotification('Atención', 'El rango puede ser de hasta 366 días.', 'warning');
        return;
      }
      if (kind === 'por-cliente' && !this.clientDoc.trim()) {
        await this.alerts.showNotification('Atención', 'Este reporte necesita el documento del cliente.', 'warning');
        return;
      }
      values = {
        fecha_desde: this.desde, fecha_hasta: this.hasta, sucursal_id: this.sucursalId, serie: this.serie.trim(), client_num_doc: this.clientDoc.trim(),
        estado_sunat: this.estadoSunat, estado_pago: this.estadoPago, tipo_moneda: this.moneda,
        agrupacion: kind === 'ventas-consolidado' ? this.agrupacion : null
      };
    }
    this.loading.set(true);
    this.error.set('');
    this.block.set(null);
    this.views.get(this.tenantId(), `reportes/${kind}`, values).subscribe({
      next: (resp) => {
        this.loading.set(false);
        if (resp.succeeded) {
          try {
            this.block.set(buildReport(kind, obj(resp.data)));
          } catch {
            this.error.set('La respuesta de la API no tiene la forma esperada.');
          }
        } else {
          this.error.set(serverMessages(resp, 'No se pudo generar el reporte.'));
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(serverMessages(err?.error, 'No se pudo generar el reporte.'));
      }
    });
  }
}
