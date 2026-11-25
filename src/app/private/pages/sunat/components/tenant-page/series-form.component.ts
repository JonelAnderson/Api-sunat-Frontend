import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { serverMessages } from '@shared/functions/list-helpers';
import { Option } from '../../models/sunat.models';
import { Json, num, obj, str } from '../../models/tenant-views.models';
import { SERIES_KIND_OPTIONS, SERIES_PREFIXES, SeriesCreateBody, SeriesUpdateBody, fieldErrors, seriesError } from '../../models/tenant-admin.models';
import { TenantAdminService } from '../../services/tenant-admin.service';

/**
 * Crear (`POST tenants/{id}/series`: `tipo`, `serie`, `sucursal_id`, `correlativo_inicial`) o editar (`PUT …/{serieId}`:
 * `correlativo`, `sucursal_id`, `activo`) una serie (§11.5, `Admin.Tenants.Edit`), con las reglas de `/api/v1/series`: 4
 * caracteres en mayúscula, facturas `F…`, boletas `B…`, notas `F…` o `B…`; el correlativo no baja de lo ya emitido (lo
 * valida la API). El tipo y la serie no cambian al editar. Cierra con `true`.
 */
@Component({
  selector: 'app-series-form',
  imports: [FormsModule],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-hash"></em>{{ series ? 'Editar serie ' + serie : 'Nueva serie' }}</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      <form class="erp-form" novalidate (ngSubmit)="save()">
        <div class="row g-3">
          <div class="col-md-7">
            <label class="form-label" for="sf-tipo">Tipo de comprobante <span class="erp-required">*</span></label>
            <select id="sf-tipo" class="form-select" name="tipo" [(ngModel)]="tipo" [disabled]="!!series" [class.is-invalid]="!!err('tipo')">
              @for (k of kinds; track k.id) {<option [ngValue]="k.id">{{ k.name }}</option>}
            </select>
            @if (err('tipo')) {<div class="invalid-feedback">{{ err('tipo') }}</div>}
          </div>
          <div class="col-md-5">
            <label class="form-label" for="sf-serie">Serie <span class="erp-required">*</span></label>
            <input id="sf-serie" class="form-control font-monospace" name="serie" [ngModel]="serie" (ngModelChange)="serie = upper($event)" maxlength="4"
              [readonly]="!!series" [class.is-invalid]="!!err('serie')" [placeholder]="prefixHint() + '001'" autocomplete="off" />
            @if (err('serie')) {<div class="invalid-feedback">{{ err('serie') }}</div>}
            @if (!series) {<div class="form-text">4 caracteres en mayúscula{{ prefixHint() ? ', empieza con ' + prefixHint() : '' }}.</div>}
          </div>
          <div class="col-md-7">
            <label class="form-label" for="sf-suc">Sucursal <span class="erp-required">*</span></label>
            <select id="sf-suc" class="form-select" name="sucursal_id" [(ngModel)]="sucursalId" [class.is-invalid]="!!err('sucursal_id')">
              @if (sucursalId === null) {<option [ngValue]="null">{{ series ? 'Sin sucursal' : 'Elija…' }}</option>}
              @for (b of branches; track b.id) {<option [ngValue]="b.id">{{ b.name }}</option>}
            </select>
            @if (err('sucursal_id')) {<div class="invalid-feedback">{{ err('sucursal_id') }}</div>}
            @if (!branches.length) {<div class="form-text text-warning">La empresa no tiene sucursales: cree una primero.</div>}
          </div>
          <div class="col-md-5">
            <label class="form-label" for="sf-corr">{{ series ? 'Último correlativo emitido' : 'Correlativo inicial' }}</label>
            <input id="sf-corr" type="number" min="0" step="1" class="form-control" name="correlativo" [(ngModel)]="correlativo"
              [class.is-invalid]="!!err(series ? 'correlativo' : 'correlativo_inicial')" placeholder="0" />
            @if (err(series ? 'correlativo' : 'correlativo_inicial')) {<div class="invalid-feedback">{{ err(series ? 'correlativo' : 'correlativo_inicial') }}</div>}
            <div class="form-text">Siguiente número: {{ (serie || '····') + '-' + next() }}. No puede quedar por debajo de lo ya emitido.</div>
          </div>
          @if (series) {
          <div class="col-12">
            <div class="form-check form-switch">
              <input id="sf-active" class="form-check-input" type="checkbox" role="switch" name="activo" [(ngModel)]="activo" />
              <label class="form-check-label" for="sf-active">Activa</label>
            </div>
          </div>
          }
          <div class="col-12">
            <label class="form-label" for="sf-motivo">Motivo (opcional)</label>
            <input id="sf-motivo" class="form-control" name="motivo" [(ngModel)]="motivo" maxlength="400" placeholder="Queda en la auditoría" />
          </div>
        </div>
        <button type="submit" class="d-none" aria-hidden="true" tabindex="-1"></button>
      </form>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" (click)="activeModal.dismiss()">Cancelar</button>
      <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">
        @if (saving()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
        Guardar
      </button>
    </div>
  `
})
export class SeriesFormComponent implements OnInit {
  private admin = inject(TenantAdminService);
  private alerts = inject(AlertModalService);
  readonly activeModal = inject(NgbActiveModal);

  @Input() tenantId!: number;
  /** La fila de `GET series` (snake_case) al editar; `null` crea. */
  @Input() series: Json | null = null;
  @Input() branches: Option<number>[] = [];

  readonly kinds = SERIES_KIND_OPTIONS;
  tipo = 'factura';
  serie = '';
  sucursalId: number | null = null;
  correlativo: number | string = 0;
  activo = true;
  motivo = '';
  private original: { correlativo: number | null; sucursalId: number | null; activo: boolean } | null = null;
  readonly saving = signal(false);
  readonly errors = signal<Record<string, string>>({});

  ngOnInit(): void {
    const s = this.series;
    if (s) {
      this.tipo = str(s['tipo']);
      this.serie = str(s['serie']);
      const b = obj(s['sucursal']);
      this.sucursalId = num(b['id']);
      this.correlativo = num(s['correlativo']) ?? 0;
      this.activo = s['activo'] !== false;
      this.original = { correlativo: num(s['correlativo']), sucursalId: this.sucursalId, activo: this.activo };
    } else if (this.branches.length === 1) {
      this.sucursalId = this.branches[0].id;
    }
  }

  err(key: string): string {
    return this.errors()[key] ?? '';
  }

  upper(v: string): string {
    return (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 4);
  }

  prefixHint(): string {
    return (SERIES_PREFIXES[this.tipo] ?? []).join(' o ');
  }

  next(): number {
    const n = Number(this.correlativo);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) + 1 : 1;
  }

  save(): void {
    const e: Record<string, string> = {};
    const corrKey = this.series ? 'correlativo' : 'correlativo_inicial';
    const corrText = String(this.correlativo ?? '').trim();
    if (corrText && !/^\d+$/.test(corrText)) {
      e[corrKey] = 'Número entero de 0 o más.';
    }
    if (!this.series) {
      const se = seriesError(this.tipo, this.serie);
      if (se) {
        e['serie'] = se;
      }
      if (this.sucursalId == null) {
        e['sucursal_id'] = 'Elija la sucursal.';
      }
    }
    this.errors.set(e);
    if (Object.keys(e).length || this.saving()) {
      return;
    }
    const motivo = this.motivo.trim() ? { motivo: this.motivo.trim() } : {};
    let call: Observable<BaseResponse>;
    if (this.series) {
      const body: SeriesUpdateBody = { ...motivo };
      const o = this.original!;
      if (corrText && Number(corrText) !== o.correlativo) {
        body.correlativo = Number(corrText);
      }
      if (this.sucursalId != null && this.sucursalId !== o.sucursalId) {
        body.sucursal_id = this.sucursalId;
      }
      if (this.activo !== o.activo) {
        body.activo = this.activo;
      }
      if (!Object.keys(body).some((k) => k !== 'motivo')) {
        void this.alerts.showNotification('Sin cambios', 'No modificó ningún dato de la serie.', 'info');
        return;
      }
      call = this.admin.updateSeries(this.tenantId, Number(this.series['id']), body);
    } else {
      const body: SeriesCreateBody = { tipo: this.tipo, serie: this.serie, sucursal_id: this.sucursalId!, ...motivo };
      if (corrText) {
        body.correlativo_inicial = Number(corrText);
      }
      call = this.admin.createSeries(this.tenantId, body);
    }
    this.saving.set(true);
    call.subscribe({
      next: async (resp) => {
        this.saving.set(false);
        // Alta: `{ creadas, errores? }`; si la API devolvió errores de alguna serie, se muestran.
        const errores = !this.series && Array.isArray(resp.data?.errores) ? (resp.data.errores as unknown[]).map(String).filter(Boolean) : [];
        if (resp.succeeded && !(errores.length && !(resp.data?.creadas ?? []).length)) {
          this.activeModal.close(true);
          const extra = errores.length ? ` ${errores.join(' ')}` : '';
          await this.alerts.showNotification(errores.length ? 'Atención' : 'Listo', serverMessages(resp, 'Serie guardada.') + extra,
            errores.length ? 'warning' : 'success');
        } else {
          this.errors.set(fieldErrors(resp));
          await this.alerts.showNotification('Atención', errores.length ? errores.join(' ') : serverMessages(resp, 'No se pudo guardar la serie.'), 'warning');
        }
      },
      error: async (err) => {
        this.saving.set(false);
        this.errors.set(fieldErrors(err?.error));
        await this.alerts.showNotification('Error', serverMessages(err?.error, 'No se pudo guardar la serie.'), 'danger');
      }
    });
  }
}
