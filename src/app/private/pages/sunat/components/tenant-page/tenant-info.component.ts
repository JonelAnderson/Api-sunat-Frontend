import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgClass } from '@angular/common';
import { formatNumber } from '@shared/functions/list-helpers';
import { isoToLima, ymdToDisplay } from '@shared/functions/lima-dates';
import { CERTIFICATE_BADGE, TenantDetailResponse, certificateStatusName, environmentName, planName, quotaLimitText } from '../../models/sunat.models';
import { TenantPlanStateComponent, hasPlanState } from '../tenants/tenant-plan-state.component';

/** Nombres de `documentsByStatus` (§8: siempre pendiente, enviado, aceptado, rechazado, anulado, anulacionEnProceso). */
const STATUS_NAMES: Record<string, string> = {
  pendiente: 'Pendientes',
  enviado: 'Enviados',
  aceptado: 'Aceptados',
  rechazado: 'Rechazados',
  anulado: 'Anulados',
  anulacionEnProceso: 'Anulación en proceso',
  observado: 'Observados',
  error: 'Con error'
};

/** Texto de una lista que puede llegar como número, texto o arreglo (de textos u objetos con código / nombre). */
function describe(value: unknown): string[] {
  if (value == null || value === '') {
    return [];
  }
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item == null) {
        return '';
      }
      if (typeof item !== 'object') {
        return String(item);
      }
      const o = item as Record<string, unknown>;
      const main = o['serie'] ?? o['nombre'] ?? o['codigo'] ?? o['name'] ?? o['id'];
      const extra = o['codLocal'] ?? o['tipoDocumento'] ?? o['sucursalNombre'] ?? o['direccion'] ?? o['descripcion'];
      const inactive = o['isActive'] === false ? ' (inactiva)' : '';
      return ([main, extra].filter((v) => v != null && v !== '').map(String).join(' · ') || JSON.stringify(item)) + inactive;
    }).filter(Boolean);
  }
  return [JSON.stringify(value)];
}

/**
 * Datos de la empresa (`GET tenants/{id}`, camelCase del panel): lo que mostraba el antiguo modal de detalle. Solo
 * lectura: el contrato no devuelve secretos y aquí no se muestra ninguno.
 */
@Component({
  selector: 'app-tenant-info',
  imports: [NgClass, TenantPlanStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tenant(); as t) {
    <div class="row g-3">
      <div class="col-12 col-xl-6">
        <section class="erp-form-section">
          <h6 class="erp-form-section__title"><em class="feather icon-hash"></em>Empresa</h6>
          @if (!t.isActive && t.suspensionReason) {
          <div class="alert alert-danger py-2 small">Suspendida: {{ t.suspensionReason }}</div>
          }
          <dl class="row small mb-0">
            <dt class="col-sm-4">RUC</dt><dd class="col-sm-8">{{ t.ruc }}</dd>
            <dt class="col-sm-4">Razón social</dt><dd class="col-sm-8">{{ t.razonSocial }}</dd>
            <dt class="col-sm-4">Nombre comercial</dt><dd class="col-sm-8">{{ t.nombreComercial || '—' }}</dd>
            <dt class="col-sm-4">Dirección</dt><dd class="col-sm-8">{{ t.direccion || '—' }}</dd>
            <dt class="col-sm-4">Correos</dt><dd class="col-sm-8">{{ emails() || '—' }}</dd>
            <dt class="col-sm-4">Registrada</dt><dd class="col-sm-8">{{ created() || '—' }}</dd>
          </dl>
        </section>
        <section class="erp-form-section">
          <h6 class="erp-form-section__title"><em class="feather icon-award"></em>Certificado digital</h6>
          @if (t.certificate; as c) {
          <div class="d-flex flex-wrap align-items-center gap-2 small">
            <span class="badge" [ngClass]="certBadge(c.status)">{{ certName(c.status) }}</span>
            @if (c.expiresOn) {<span>Vence el {{ ymd(c.expiresOn) }}</span>}
          </div>
          @if (c.message) {<p class="small text-muted mt-2 mb-0">{{ c.message }}</p>}
          } @else {
          <p class="small text-muted mb-0">Sin datos del certificado.</p>
          }
        </section>
      </div>
      <div class="col-12 col-xl-6">
        <section class="erp-form-section">
          <h6 class="erp-form-section__title"><em class="feather icon-sliders"></em>Plan y emisión</h6>
          <dl class="row small mb-0">
            <dt class="col-sm-4">Ambiente</dt><dd class="col-sm-8">{{ envName(t.environment) }}</dd>
            @if (!planState()) {
            <dt class="col-sm-4">Plan</dt><dd class="col-sm-8">{{ plan(t.plan) }}</dd>
            }
            <dt class="col-sm-4">Modo de emisión</dt><dd class="col-sm-8">{{ t.emissionMode === 'unlimited' ? 'Ilimitada' : t.emissionMode === 'plan' ? 'Según el plan' : t.emissionMode }}</dd>
            @if (!planState()) {
            <dt class="col-sm-4">Uso del mes</dt><dd class="col-sm-8">{{ num(t.documentsThisMonth) }} de {{ limit(t.maxDocumentsMonth) }}</dd>
            }
            <dt class="col-sm-4">Último comprobante</dt><dd class="col-sm-8">{{ lastDocument() || '—' }}</dd>
            <dt class="col-sm-4">SIRE</dt><dd class="col-sm-8">{{ t.sireEnabled ? 'Activado' : 'No activado' }}</dd>
            <dt class="col-sm-4">Webhook</dt><dd class="col-sm-8 text-break">{{ t.webhookUrl || 'Sin webhook' }}</dd>
          </dl>
        </section>
        @if (planState()) {
        <section class="erp-form-section">
          <h6 class="erp-form-section__title"><em class="feather icon-credit-card"></em>Plan efectivo, cupo y suscripción</h6>
          <app-tenant-plan-state [tenant]="t" [canResave]="canResave()" (resave)="resavePlan.emit()"></app-tenant-plan-state>
          <p class="form-text mb-0 mt-2">Comprobantes del mes de la fila: {{ num(t.documentsThisMonth) }}. El cupo del panel o el del plan es el que aplica la API (429 al agotarse).</p>
        </section>
        }
        <section class="erp-form-section">
          <h6 class="erp-form-section__title"><em class="feather icon-file-text"></em>Comprobantes del mes por estado</h6>
          @if (statuses().length) {
          <div class="d-flex flex-wrap gap-2">
            @for (s of statuses(); track s.key) {
            <span class="badge badge-light-primary px-3 py-2">{{ s.label }}: {{ num(s.value) }}</span>
            }
          </div>
          } @else {
          <p class="small text-muted mb-0">Sin comprobantes este mes.</p>
          }
        </section>
        <section class="erp-form-section">
          <h6 class="erp-form-section__title"><em class="feather icon-map-pin"></em>Sucursales y series</h6>
          <div class="row small">
            <div class="col-md-6">
              <p class="fw-semibold mb-1">Sucursales</p>
              @for (s of sucursales(); track $index) {<div>{{ s }}</div>} @empty {<div class="text-muted">—</div>}
            </div>
            <div class="col-md-6">
              <p class="fw-semibold mb-1">Series</p>
              @for (s of series(); track $index) {<div>{{ s }}</div>} @empty {<div class="text-muted">—</div>}
            </div>
          </div>
        </section>
      </div>
    </div>
    }
  `
})
export class TenantInfoComponent {
  readonly tenant = input<TenantDetailResponse | null>(null);
  /** Con `Admin.Tenants.Manage`: botón "Volver a guardar el plan" si `planInSync` es `false` (§12.2). */
  readonly canResave = input(false);
  readonly resavePlan = output<void>();
  /** El detalle trae plan efectivo / cupo / suscripción (§12.2). */
  readonly planState = computed(() => hasPlanState(this.tenant()));

  readonly emails = computed(() => {
    const e = this.tenant()?.emails;
    return Array.isArray(e) ? e.join(', ') : (e ?? '');
  });
  readonly created = computed(() => isoToLima(this.tenant()?.createdAt));
  readonly lastDocument = computed(() => isoToLima(this.tenant()?.lastDocumentAt));
  readonly sucursales = computed(() => describe(this.tenant()?.sucursales));
  readonly series = computed(() => describe(this.tenant()?.series));
  readonly statuses = computed(() => Object.entries(this.tenant()?.documentsByStatus ?? {})
    .map(([key, value]) => ({ key, label: STATUS_NAMES[key] ?? key, value: Number(value) || 0 })));

  num(value?: number | null): string {
    return formatNumber(value ?? 0);
  }

  limit(value?: number | null): string {
    return quotaLimitText(value);
  }

  ymd(value?: string | null): string {
    return ymdToDisplay(value);
  }

  envName(value?: string | null): string {
    return environmentName(value);
  }

  plan(value?: string | null): string {
    return planName(value);
  }

  certName(status?: string | null): string {
    return status === 'SIN_CERTIFICADO' || !status ? 'Sin certificado' : certificateStatusName(status);
  }

  certBadge(status?: string | null): string {
    return CERTIFICATE_BADGE[status ?? ''] ?? 'badge-light-secondary';
  }
}
