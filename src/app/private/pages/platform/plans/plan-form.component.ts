import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { serverMessages } from '@shared/functions/list-helpers';
import { PlanCatalog, PlanCatalogFeature, PlanCatalogLimit, PlanDetail, PlanRequest, PlanRow, SYSTEM_PLAN_SLUGS } from '../models/platform.models';
import { PlanService } from '../services/platform.services';

const SLUG = /^[a-z0-9_-]{1,50}$/;
const LIMIT_KEY = /^[a-z0-9_]{1,50}$/;
const FEATURE_KEY = /^[a-z0-9_]{1,100}$/;
const MAX_LIMITS = 50;

interface LimitGroup {
  group: string;
  items: PlanCatalogLimit[];
}

interface FeatureGroup {
  group: string;
  items: PlanCatalogFeature[];
}

function groupBy<T extends { group: string }>(list: T[]): { group: string; items: T[] }[] {
  const groups: { group: string; items: T[] }[] = [];
  list.forEach((i) => {
    const g = groups.find((x) => x.group === (i.group || 'Otros'));
    if (g) {
      g.items.push(i);
    } else {
      groups.push({ group: i.group || 'Otros', items: [i] });
    }
  });
  return groups;
}

/** Monto con hasta 2 decimales entre 0 y 99 999 999.99. */
function validMoney(value: string): boolean {
  return /^\d{1,8}(\.\d{1,2})?$/.test(value.trim());
}

/**
 * Crear (`POST plans`) o editar (`PUT plans/{id}`, reemplaza límites y funcionalidades) un plan, con `Admin.Plans.Manage`
 * (§10.6). Los límites y funcionalidades salen del catálogo (`GET plans/catalog`); las claves del plan que no están en el
 * catálogo se muestran sin etiqueta y se conservan. En `free`, `pro` y `business` el slug no cambia. Los errores por campo de
 * la API (`propertyName`, p. ej. `limits.sucursales`) se muestran junto a su campo.
 */
@Component({
  selector: 'app-plan-form',
  imports: [FormsModule],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-package"></em>{{ plan ? 'Editar plan' : 'Nuevo plan' }}</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      @if (loading()) {
      <div class="erp-loading" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Cargando…</div>
      } @else if (loadError()) {
      <div class="alert alert-warning mb-0">{{ loadError() }}</div>
      } @else {
      <form class="erp-form" novalidate (ngSubmit)="save()">
        <p class="form-text mt-0 mb-3">Los campos marcados con <span class="erp-required">*</span> son obligatorios.</p>
        <section class="erp-form-section">
          <h6 class="erp-form-section__title"><em class="feather icon-info"></em>Datos del plan</h6>
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label" for="plan-slug">Slug <span class="erp-required">*</span></label>
              <input id="plan-slug" class="form-control" name="slug" [(ngModel)]="m.slug" maxlength="50" [disabled]="system"
                [class.is-invalid]="!!err('slug')" autocomplete="off" />
              @if (err('slug')) {<div class="invalid-feedback">{{ err('slug') }}</div>}
              <div class="form-text">{{ system ? 'Plan del sistema: el slug no se puede cambiar.' : 'Minúsculas, números, guiones y guiones bajos.' }}</div>
            </div>
            <div class="col-md-8">
              <label class="form-label" for="plan-name">Nombre <span class="erp-required">*</span></label>
              <input id="plan-name" class="form-control" name="name" [(ngModel)]="m.name" maxlength="100" [class.is-invalid]="!!err('name')" />
              @if (err('name')) {<div class="invalid-feedback">{{ err('name') }}</div>}
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label" for="plan-pm">Precio mensual <span class="erp-required">*</span></label>
              <input id="plan-pm" type="number" min="0" step="0.01" class="form-control" name="priceMonthly" [(ngModel)]="m.priceMonthly"
                [class.is-invalid]="!!err('priceMonthly')" />
              @if (err('priceMonthly')) {<div class="invalid-feedback">{{ err('priceMonthly') }}</div>}
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label" for="plan-py">Precio anual</label>
              <input id="plan-py" type="number" min="0" step="0.01" class="form-control" name="priceYearly" [(ngModel)]="m.priceYearly"
                [class.is-invalid]="!!err('priceYearly')" placeholder="0" />
              @if (err('priceYearly')) {<div class="invalid-feedback">{{ err('priceYearly') }}</div>}
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label" for="plan-order">Orden</label>
              <input id="plan-order" type="number" min="0" max="100000" step="1" class="form-control" name="sortOrder" [(ngModel)]="m.sortOrder"
                [class.is-invalid]="!!err('sortOrder')" placeholder="0" />
              @if (err('sortOrder')) {<div class="invalid-feedback">{{ err('sortOrder') }}</div>}
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label" for="plan-days">Duración (días)</label>
              <input id="plan-days" type="number" min="1" max="3650" step="1" class="form-control" name="durationDays" [(ngModel)]="m.durationDays"
                [class.is-invalid]="!!err('durationDays')" placeholder="Sin vencimiento" />
              @if (err('durationDays')) {<div class="invalid-feedback">{{ err('durationDays') }}</div>}
            </div>
            <div class="col-md-6">
              <div class="form-check form-switch">
                <input id="plan-unlimited" class="form-check-input" type="checkbox" role="switch" name="isUnlimited" [(ngModel)]="m.isUnlimited" />
                <label class="form-check-label" for="plan-unlimited">Plan ilimitado</label>
              </div>
              <div class="form-text">Pone los documentos SUNAT e internos del mes en -1 (ilimitado).</div>
            </div>
            <div class="col-md-6">
              <div class="form-check form-switch">
                <input id="plan-active" class="form-check-input" type="checkbox" role="switch" name="isActive" [(ngModel)]="m.isActive" />
                <label class="form-check-label" for="plan-active">Activo</label>
              </div>
              <div class="form-text">Un plan inactivo no se ofrece en <code>/api/v1/planes</code>.</div>
            </div>
          </div>
        </section>

        <section class="erp-form-section">
          <h6 class="erp-form-section__title"><em class="feather icon-sliders"></em>Límites</h6>
          <p class="small text-muted">Número entero; -1 = ilimitado; vacío = sin ese límite.</p>
          @for (g of limitGroups; track g.group) {
          <p class="small fw-semibold mb-2 mt-3">{{ g.group }}</p>
          <div class="row g-2">
            @for (l of g.items; track l.key) {
            <div class="col-md-6 col-xl-4">
              <label class="form-label small" [for]="'lim-' + l.key">{{ l.label }}</label>
              <input [id]="'lim-' + l.key" type="number" min="-1" step="1" class="form-control form-control-sm" [name]="'lim-' + l.key"
                [(ngModel)]="limits[l.key]" [class.is-invalid]="!!err('limits.' + l.key)" [disabled]="m.isUnlimited && unlimitedKeys.includes(l.key)" />
              @if (err('limits.' + l.key)) {<div class="invalid-feedback">{{ err('limits.' + l.key) }}</div>}
              @if (l.help) {<div class="form-text">{{ l.help }}</div>}
            </div>
            }
          </div>
          }
          @if (extraLimits.length) {
          <p class="small fw-semibold mb-2 mt-3">Otras claves del plan (sin etiqueta en el catálogo)</p>
          <div class="row g-2">
            @for (k of extraLimits; track k) {
            <div class="col-md-6 col-xl-4">
              <label class="form-label small" [for]="'lim-' + k"><code>{{ k }}</code></label>
              <div class="input-group input-group-sm has-validation">
                <input [id]="'lim-' + k" type="number" min="-1" step="1" class="form-control" [name]="'lim-' + k" [(ngModel)]="limits[k]"
                  [class.is-invalid]="!!err('limits.' + k)" />
                <button type="button" class="btn btn-outline-secondary" (click)="removeLimit(k)" [attr.aria-label]="'Quitar ' + k"><em class="feather icon-x"></em></button>
                @if (err('limits.' + k)) {<div class="invalid-feedback">{{ err('limits.' + k) }}</div>}
              </div>
            </div>
            }
          </div>
          }
          <div class="row g-2 mt-2 align-items-end">
            <div class="col-6 col-md-4">
              <label class="form-label small" for="lim-new-key">Otra clave</label>
              <input id="lim-new-key" class="form-control form-control-sm" name="newLimitKey" [(ngModel)]="newLimitKey" maxlength="50" placeholder="clave_en_minusculas" />
            </div>
            <div class="col-3 col-md-2">
              <label class="form-label small" for="lim-new-value">Valor</label>
              <input id="lim-new-value" type="number" min="-1" step="1" class="form-control form-control-sm" name="newLimitValue" [(ngModel)]="newLimitValue" />
            </div>
            <div class="col-3 col-md-2">
              <button type="button" class="btn btn-sm btn-outline-primary w-100" (click)="addLimit()"><em class="feather icon-plus me-1"></em>Agregar</button>
            </div>
          </div>
          @if (err('limits')) {<div class="text-danger small mt-2">{{ err('limits') }}</div>}
        </section>

        <section class="erp-form-section mb-0">
          <h6 class="erp-form-section__title"><em class="feather icon-check-square"></em>Funcionalidades</h6>
          @for (g of featureGroups; track g.group) {
          <p class="small fw-semibold mb-1 mt-3">{{ g.group }}</p>
          <div class="row g-1">
            @for (f of g.items; track f.key) {
            <div class="col-md-6 col-xl-4">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" [id]="'feat-' + f.key" [name]="'feat-' + f.key" [ngModel]="features.has(f.key)"
                  (ngModelChange)="toggleFeature(f.key, $event)" />
                <label class="form-check-label small" [for]="'feat-' + f.key">{{ f.label }}</label>
              </div>
            </div>
            }
          </div>
          }
          @if (extraFeatures().length) {
          <p class="small fw-semibold mb-1 mt-3">Otras funcionalidades del plan (sin etiqueta en el catálogo)</p>
          <div class="d-flex flex-wrap gap-2">
            @for (k of extraFeatures(); track k) {
            <span class="badge bg-light-primary text-primary d-inline-flex align-items-center gap-1"><code>{{ k }}</code>
              <button type="button" class="btn-close btn-sm" [attr.aria-label]="'Quitar ' + k" (click)="toggleFeature(k, false)"></button></span>
            }
          </div>
          }
          <div class="row g-2 mt-2 align-items-end">
            <div class="col-8 col-md-5">
              <label class="form-label small" for="feat-new">Otra funcionalidad</label>
              <input id="feat-new" class="form-control form-control-sm" name="newFeature" [(ngModel)]="newFeature" maxlength="100" placeholder="clave_en_minusculas" />
            </div>
            <div class="col-4 col-md-2">
              <button type="button" class="btn btn-sm btn-outline-primary w-100" (click)="addFeature()"><em class="feather icon-plus me-1"></em>Agregar</button>
            </div>
          </div>
          @if (err('features')) {<div class="text-danger small mt-2">{{ err('features') }}</div>}
        </section>
      </form>
      }
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" (click)="activeModal.dismiss()">Cancelar</button>
      <button type="button" class="btn btn-primary" [disabled]="saving() || loading() || !!loadError()" (click)="save()">
        @if (saving()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
        Guardar
      </button>
    </div>
  `
})
export class PlanFormComponent implements OnInit {
  readonly activeModal = inject(NgbActiveModal);
  private plans = inject(PlanService);
  private alerts = inject(AlertModalService);

  /** Fila a editar; null = crear. */
  plan: PlanRow | null = null;

  /** Claves que `isUnlimited` pone en -1. */
  readonly unlimitedKeys = ['documents_month', 'internal_documents_month'];
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly saving = signal(false);
  readonly errors = signal<Record<string, string>>({});
  readonly extraFeatures = signal<string[]>([]);

  m = { slug: '', name: '', priceMonthly: '' as string | number, priceYearly: '' as string | number, sortOrder: '' as string | number,
    durationDays: '' as string | number, isUnlimited: false, isActive: true };
  /** Valores de los límites por clave (texto o número del input; vacío = sin límite). */
  limits: Record<string, string | number | null> = {};
  features = new Set<string>();
  limitGroups: LimitGroup[] = [];
  featureGroups: FeatureGroup[] = [];
  extraLimits: string[] = [];
  system = false;
  newLimitKey = '';
  newLimitValue: string | number = '';
  newFeature = '';
  private catalogLimitKeys = new Set<string>();
  private catalogFeatureKeys = new Set<string>();

  ngOnInit(): void {
    const detail$ = this.plan ? this.plans.byId(this.plan.id) : of(null as BaseResponse | null);
    forkJoin([this.plans.catalog().pipe(catchError(() => of(null as BaseResponse | null))), detail$]).subscribe({
      next: ([catalog, detail]) => {
        this.loading.set(false);
        const cat: PlanCatalog = catalog?.succeeded && catalog.data ? (catalog.data as PlanCatalog) : { limits: [], features: [] };
        this.limitGroups = groupBy(cat.limits ?? []);
        this.featureGroups = groupBy(cat.features ?? []);
        this.catalogLimitKeys = new Set((cat.limits ?? []).map((l) => l.key));
        this.catalogFeatureKeys = new Set((cat.features ?? []).map((f) => f.key));
        if (this.plan) {
          if (!detail?.succeeded || !detail.data) {
            this.loadError.set(serverMessages(detail, 'No se pudo cargar el plan.'));
            return;
          }
          this.fill(detail.data as PlanDetail);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(serverMessages(err?.error, 'No se pudo cargar el plan.'));
      }
    });
  }

  private fill(p: PlanDetail): void {
    this.system = p.isSystem || SYSTEM_PLAN_SLUGS.includes(p.slug);
    this.m = {
      slug: p.slug, name: p.name, priceMonthly: p.priceMonthly ?? '', priceYearly: p.priceYearly ?? '', sortOrder: p.sortOrder ?? '',
      durationDays: p.durationDays ?? '', isUnlimited: !!p.isUnlimited, isActive: !!p.isActive
    };
    this.limits = { ...(p.limits ?? {}) };
    this.extraLimits = Object.keys(this.limits).filter((k) => !this.catalogLimitKeys.has(k));
    this.features = new Set(p.features ?? []);
    this.syncExtraFeatures();
  }

  err(key: string): string {
    return this.errors()[key] ?? '';
  }

  private syncExtraFeatures(): void {
    this.extraFeatures.set([...this.features].filter((k) => !this.catalogFeatureKeys.has(k)));
  }

  toggleFeature(key: string, on: boolean): void {
    if (on) {
      this.features.add(key);
    } else {
      this.features.delete(key);
    }
    this.syncExtraFeatures();
  }

  addFeature(): void {
    const key = this.newFeature.trim();
    if (!FEATURE_KEY.test(key)) {
      this.errors.update((e) => ({ ...e, features: 'Use minúsculas, números y guiones bajos (máximo 100).' }));
      return;
    }
    this.toggleFeature(key, true);
    this.newFeature = '';
    this.errors.update((e) => ({ ...e, features: '' }));
  }

  addLimit(): void {
    const key = this.newLimitKey.trim();
    if (!LIMIT_KEY.test(key)) {
      this.errors.update((e) => ({ ...e, limits: 'La clave usa minúsculas, números y guiones bajos (máximo 50).' }));
      return;
    }
    this.limits[key] = this.newLimitValue === '' ? null : this.newLimitValue;
    if (!this.catalogLimitKeys.has(key) && !this.extraLimits.includes(key)) {
      this.extraLimits = [...this.extraLimits, key];
    }
    this.newLimitKey = '';
    this.newLimitValue = '';
    this.errors.update((e) => ({ ...e, limits: '' }));
  }

  removeLimit(key: string): void {
    delete this.limits[key];
    this.extraLimits = this.extraLimits.filter((k) => k !== key);
  }

  /** Validación local con las reglas de §10.6 (la API vuelve a validar todo). */
  private validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const m = this.m;
    const text = (v: unknown) => (v == null ? '' : String(v).trim());
    if (!SLUG.test(m.slug.trim())) {
      e['slug'] = 'El slug solo puede contener minúsculas, números, guiones y guiones bajos (máximo 50).';
    }
    if (!m.name.trim() || m.name.trim().length > 100) {
      e['name'] = 'Indique el nombre (máximo 100 caracteres).';
    }
    if (!validMoney(text(m.priceMonthly))) {
      e['priceMonthly'] = 'Monto de 0 a 99 999 999.99, con hasta 2 decimales.';
    }
    if (text(m.priceYearly) && !validMoney(text(m.priceYearly))) {
      e['priceYearly'] = 'Monto de 0 a 99 999 999.99, con hasta 2 decimales (vacío = 0).';
    }
    if (text(m.sortOrder) && !(/^\d+$/.test(text(m.sortOrder)) && Number(m.sortOrder) <= 100000)) {
      e['sortOrder'] = 'Número entero de 0 a 100 000.';
    }
    if (text(m.durationDays) && !(/^\d+$/.test(text(m.durationDays)) && Number(m.durationDays) >= 1 && Number(m.durationDays) <= 3650)) {
      e['durationDays'] = 'Número entero de 1 a 3 650 (vacío = sin vencimiento).';
    }
    Object.entries(this.limits).forEach(([k, v]) => {
      const t = text(v);
      if (t && !(/^-?\d+$/.test(t) && Number(t) >= -1)) {
        e[`limits.${k}`] = 'Número entero de -1 (ilimitado) o más.';
      }
    });
    if (Object.values(this.limits).filter((v) => text(v) !== '').length > MAX_LIMITS) {
      e['limits'] = `Como máximo ${MAX_LIMITS} límites.`;
    }
    return e;
  }

  private body(): PlanRequest {
    const text = (v: unknown) => (v == null ? '' : String(v).trim());
    const limits: Record<string, number> = {};
    Object.entries(this.limits).forEach(([k, v]) => {
      if (text(v) !== '') {
        limits[k] = Number(v);
      }
    });
    return {
      slug: this.m.slug.trim(), name: this.m.name.trim(), priceMonthly: Number(this.m.priceMonthly),
      priceYearly: text(this.m.priceYearly) ? Number(this.m.priceYearly) : null, sortOrder: text(this.m.sortOrder) ? Number(this.m.sortOrder) : null,
      limits, features: [...this.features], isUnlimited: this.m.isUnlimited,
      durationDays: text(this.m.durationDays) ? Number(this.m.durationDays) : null, isActive: this.m.isActive
    };
  }

  /** Errores por campo de la API (`errors[].propertyName`). */
  private serverErrors(resp: BaseResponse | null | undefined): void {
    const e: Record<string, string> = {};
    (Array.isArray(resp?.errors) ? resp!.errors : []).forEach((x: { propertyName?: string; errorMessage?: string }) => {
      if (x?.propertyName && x.errorMessage) {
        e[x.propertyName] = x.errorMessage;
      }
    });
    this.errors.set(e);
  }

  save(): void {
    if (this.saving() || this.loading() || this.loadError()) {
      return;
    }
    const local = this.validate();
    this.errors.set(local);
    if (Object.keys(local).length) {
      return;
    }
    const call = this.plan ? this.plans.update(this.plan.id, this.body()) : this.plans.create(this.body());
    this.saving.set(true);
    call.subscribe({
      next: async (resp) => {
        this.saving.set(false);
        if (resp.succeeded) {
          this.activeModal.close(true);
          await this.alerts.showNotification('Listo', serverMessages(resp, this.plan ? 'Plan actualizado.' : 'Plan creado.'), 'success');
        } else {
          this.serverErrors(resp);
          await this.alerts.showNotification('Atención', serverMessages(resp, 'No se pudo guardar el plan.'), 'warning');
        }
      },
      error: async (err) => {
        this.saving.set(false);
        this.serverErrors(err?.error);
        await this.alerts.showNotification('Error', serverMessages(err?.error, 'No se pudo guardar el plan.'), 'danger');
      }
    });
  }
}
