import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { formatNumber } from '@shared/functions/list-helpers';
import { isoToLima } from '@shared/functions/lima-dates';
import { TenantDetailResponse, anyPlanName, exemptReasonText, quotaLimitText, subscriptionStatusName } from '../../models/sunat.models';

/** ¿El detalle trae los bloques de §12.2 (plan efectivo, cupo, suscripción)? Una API anterior no los trae. */
export function hasPlanState(t: TenantDetailResponse | null | undefined): boolean {
  return !!t && (t.quota != null || t.effectivePlan != null || t.subscription !== undefined);
}

/**
 * Plan efectivo, cupo y suscripción de una empresa (§12.2, bloques `effectivePlan`, `planInSync`, `quota`, `subscription` y
 * `pendingSubscription` de `GET tenants/{id}` y de la respuesta de `PUT tenants/{id}/plan`). Solo lectura; con
 * `planInSync: false` avisa y, si `canResave`, ofrece "Volver a guardar el plan" (salida `resave`).
 */
@Component({
  selector: 'app-tenant-plan-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tenant(); as t) {
    @if (t.planInSync === false) {
    <div class="alert alert-warning py-2 small">
      <strong>El plan no está sincronizado.</strong> La empresa figura con el plan {{ plan(t.plan) }}, pero rige {{ plan(t.effectivePlan) || 'Free' }}
      (por la suscripción vigente). Pasa con empresas a las que el panel les cambió el plan antes de esta versión, o cuya suscripción de pago quedó
      con el pago vencido. Volver a guardar el plan desde el panel crea la suscripción del panel y lo hace regir.
      @if (canResave()) {
      <div class="mt-2"><button type="button" class="btn btn-sm btn-warning" (click)="resave.emit()"><em class="feather icon-refresh-cw me-1"></em>Volver a guardar el plan</button></div>
      }
    </div>
    }
    <dl class="row small mb-0">
      <dt class="col-sm-4">Plan que rige</dt>
      <dd class="col-sm-8">{{ plan(t.effectivePlan ?? t.plan) }}@if (t.planInSync === false) {<span class="text-warning"> (la empresa figura con {{ plan(t.plan) }})</span>}</dd>
      <dt class="col-sm-4">Cupo del mes</dt>
      <dd class="col-sm-8">
        @if (t.quota; as q) {
        {{ q.unlimited || q.documentsMonth === -1 ? 'Ilimitado' : num(q.documentsMonth) + ' comprobantes' }}
        <span class="text-muted">· {{ q.source === 'panel' ? 'cupo del panel' : 'cupo del plan' }}@if (q.source === 'panel' && q.planDefault !== null) { (el plan trae {{ limit(q.planDefault) }})}</span>
        } @else {
        {{ limit(t.maxDocumentsMonth) }}
        }
      </dd>
      @if (t.quota; as q) {
      <dt class="col-sm-4">Usados este mes</dt>
      <dd class="col-sm-8">{{ num(q.usedThisMonth) }}@if (!q.unlimited && q.documentsMonth !== -1) { de {{ num(q.documentsMonth) }}}
        <div class="form-text mt-0">Comprobantes y guías creados en el mes (UTC), incluidos los eliminados: lo que cuenta la API para el cupo.</div>
      </dd>
      @if (q.exemptReason) {
      <dt class="col-sm-4">Sin cupo</dt>
      <dd class="col-sm-8"><span class="badge badge-light-info me-1">{{ q.exemptReason }}</span>{{ exempt(q.exemptReason) }}</dd>
      }
      }
      <dt class="col-sm-4">Suscripción</dt>
      <dd class="col-sm-8">
        @if (t.subscription; as s) {
        <div>{{ plan(s.plan) }} · {{ status(s.status) }} · {{ s.setByPanel ? 'asignada por el panel (sin cobro)' : 'contratada por la empresa' }}
          @if (s.billingCycle) {<span class="text-muted"> · {{ s.billingCycle === 'monthly' ? 'mensual' : s.billingCycle === 'yearly' ? 'anual' : s.billingCycle }}</span>}</div>
        <div class="text-muted">Desde {{ when(s.periodStart) || '—' }} · {{ s.periodEnd ? 'hasta ' + when(s.periodEnd) : 'sin vencimiento' }}</div>
        @if (s.trialEndsAt) {<div class="text-muted">Prueba hasta {{ when(s.trialEndsAt) }}</div>}
        @if (s.cancelledAt) {<div class="text-danger">Cancelación pedida el {{ when(s.cancelledAt) }} (rige hasta el fin del periodo)</div>}
        } @else {
        <span class="text-muted">Sin suscripción vigente: rige el plan Free.</span>
        }
      </dd>
      @if (t.pendingSubscription; as p) {
      <dt class="col-sm-4">Programado</dt>
      <dd class="col-sm-8 text-warning">Pasa al plan {{ plan(p.plan) }} el {{ when(p.startsAt) || '—' }} (reducción programada; cambiar el plan desde el panel la cancela).</dd>
      }
    </dl>
    }
  `
})
export class TenantPlanStateComponent {
  readonly tenant = input<TenantDetailResponse | null>(null);
  /** Muestra "Volver a guardar el plan" cuando `planInSync` es `false` (con `Admin.Tenants.Manage`). */
  readonly canResave = input(false);
  readonly resave = output<void>();

  plan(slug?: string | null): string {
    return anyPlanName(slug);
  }

  num(value?: number | null): string {
    return formatNumber(value ?? 0);
  }

  limit(value?: number | null): string {
    return quotaLimitText(value);
  }

  exempt(reason: string): string {
    return exemptReasonText(reason);
  }

  status(value?: string | null): string {
    return subscriptionStatusName(value);
  }

  when(value?: string | null): string {
    return isoToLima(value);
  }
}
