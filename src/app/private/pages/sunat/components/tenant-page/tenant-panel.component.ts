import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { serverMessages } from '@shared/functions/list-helpers';
import { limaMonthYm, limaTodayYmd, ymToDisplay, ymdToDisplay } from '@shared/functions/lima-dates';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { DocKind, ViewBlock, monthStartYmd, obj } from '../../models/tenant-views.models';
import { QueryValues, TenantViewsService } from '../../services/tenant-views.service';
import { PANEL_SECTIONS, PanelSection } from './tenant-panel.views';
import { ViewBlockComponent } from './view-block.component';
import { openDocDetail } from './tenant-doc-detail.component';

interface SectionState {
  loading: boolean;
  error: string;
  block: ViewBlock | null;
}

/** Secciones que van a media columna en pantallas grandes. */
const HALF = new Set(['alertas', 'estado-sunat', 'cobranzas', 'ventas-mensuales', 'por-moneda', 'clientes']);

/**
 * Panel de la empresa (§9.4): las once secciones de `GET panel/…`, cada una con su carga y su error. Periodo: `mes`
 * (yyyy-MM) o `desde` + `hasta` (yyyy-MM-dd); solo las secciones con periodo se recargan al cambiarlo.
 */
@Component({
  selector: 'app-tenant-panel',
  imports: [FormsModule, ViewBlockComponent],
  template: `
    <div class="d-flex flex-wrap align-items-end gap-2 mb-3">
      <div>
        <label class="form-label small mb-1" for="panel-mode">Periodo</label>
        <select id="panel-mode" class="form-select form-select-sm" [(ngModel)]="mode">
          <option value="mes">Mes</option>
          <option value="rango">Desde / hasta</option>
        </select>
      </div>
      @if (mode === 'mes') {
      <div>
        <label class="form-label small mb-1" for="panel-mes">Mes</label>
        <input id="panel-mes" type="month" class="form-control form-control-sm" [(ngModel)]="mes" />
      </div>
      } @else {
      <div>
        <label class="form-label small mb-1" for="panel-desde">Desde</label>
        <input id="panel-desde" type="date" class="form-control form-control-sm" [(ngModel)]="desde" />
      </div>
      <div>
        <label class="form-label small mb-1" for="panel-hasta">Hasta</label>
        <input id="panel-hasta" type="date" class="form-control form-control-sm" [(ngModel)]="hasta" />
      </div>
      }
      <button type="button" class="btn btn-sm btn-primary" (click)="applyPeriod()"><em class="feather icon-check me-1"></em>Aplicar</button>
      <button type="button" class="btn btn-sm btn-outline-primary" (click)="loadAll()"><em class="feather icon-refresh-cw me-1"></em>Actualizar todo</button>
      <span class="small text-muted ms-md-2 align-self-center">Periodo aplicado: {{ periodText() }}</span>
    </div>

    <div class="row g-3">
      @for (s of sections; track s.key) {
      <div [class]="half.has(s.key) ? 'col-12 col-xl-6' : 'col-12'">
        <section class="border rounded p-3 h-100">
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <h6 class="erp-form-section__title mb-0"><em class="feather {{ s.icon }}"></em>{{ s.title }}</h6>
            <div class="d-flex align-items-center gap-2">
              @if (s.key === 'documentos-recientes') {
              <label class="small text-muted" for="panel-limit">Mostrar</label>
              <select id="panel-limit" class="form-select form-select-sm w-auto" [(ngModel)]="limit" (ngModelChange)="load(s)">
                @for (n of limits; track n) {<option [ngValue]="n">{{ n }}</option>}
              </select>
              }
              @if (s.period) {<span class="badge badge-light-primary">Periodo</span>}
              <button type="button" class="btn btn-sm btn-link p-0" (click)="load(s)" [attr.aria-label]="'Actualizar ' + s.title">
                <em class="feather icon-refresh-cw"></em>
              </button>
            </div>
          </div>
          @let st = state()[s.key];
          @if (!st || st.loading) {
          <div class="erp-loading py-3" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Cargando…</div>
          } @else if (st.error) {
          <div class="alert alert-warning small mb-0">{{ st.error }}</div>
          } @else {
          <app-view-block [block]="st.block" (open)="openDoc($event)"></app-view-block>
          }
        </section>
      </div>
      }
    </div>
  `
})
export class TenantPanelComponent implements OnInit {
  private views = inject(TenantViewsService);
  private modal = inject(NgbModal);
  private alerts = inject(AlertModalService);

  readonly tenantId = input.required<number>();

  readonly sections = PANEL_SECTIONS;
  readonly half = HALF;
  readonly limits = [10, 20, 50, 100];
  readonly state = signal<Record<string, SectionState>>({});
  readonly periodText = signal('');

  mode: 'mes' | 'rango' = 'mes';
  mes = limaMonthYm();
  desde = monthStartYmd(limaTodayYmd());
  hasta = limaTodayYmd();
  limit = 20;
  private period: QueryValues = { mes: this.mes };

  ngOnInit(): void {
    this.periodText.set(ymToDisplay(this.mes));
    this.loadAll();
  }

  async applyPeriod(): Promise<void> {
    if (this.mode === 'mes') {
      if (!/^\d{4}-\d{2}$/.test(this.mes ?? '')) {
        await this.alerts.showNotification('Atención', 'Elija un mes.', 'warning');
        return;
      }
      this.period = { mes: this.mes };
      this.periodText.set(ymToDisplay(this.mes));
    } else {
      if (!this.desde || !this.hasta || this.desde > this.hasta) {
        await this.alerts.showNotification('Atención', 'Elija las dos fechas; "desde" no puede ser posterior a "hasta".', 'warning');
        return;
      }
      this.period = { desde: this.desde, hasta: this.hasta };
      this.periodText.set(`${ymdToDisplay(this.desde)} al ${ymdToDisplay(this.hasta)}`);
    }
    this.sections.filter((s) => s.period).forEach((s) => this.load(s));
  }

  loadAll(): void {
    this.sections.forEach((s) => this.load(s));
  }

  load(section: PanelSection): void {
    this.patch(section.key, { loading: true, error: '', block: null });
    const values: QueryValues = section.period ? this.period : section.key === 'documentos-recientes' ? { limit: this.limit } : undefined;
    this.views.get(this.tenantId(), section.path, values).subscribe({
      next: (resp) => {
        if (resp.succeeded) {
          try {
            this.patch(section.key, { loading: false, error: '', block: section.build(obj(resp.data)) });
          } catch {
            this.patch(section.key, { loading: false, error: 'La respuesta de la API no tiene la forma esperada.', block: null });
          }
        } else {
          this.patch(section.key, { loading: false, error: serverMessages(resp, 'No se pudo cargar la sección.'), block: null });
        }
      },
      error: (err) => this.patch(section.key, { loading: false, error: serverMessages(err?.error, 'No se pudo cargar la sección.'), block: null })
    });
  }

  openDoc(ref: { kind: DocKind; id: number }): void {
    openDocDetail(this.modal, this.tenantId(), ref.kind, ref.id);
  }

  private patch(key: string, value: SectionState): void {
    this.state.update((s) => ({ ...s, [key]: value }));
  }
}
