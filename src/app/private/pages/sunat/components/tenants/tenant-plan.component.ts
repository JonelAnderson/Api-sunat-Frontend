import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { serverMessages } from '@shared/functions/list-helpers';
import { PermissionService } from '@shared/service/permission.service';
import { PlanRow } from '../../../platform/models/platform.models';
import { PlanService } from '../../../platform/services/platform.services';
import {
  ChangeTenantPlanRequest, EMISSION_MODE_OPTIONS, EmissionMode, PERM, PLAN_OPTIONS, PlanCode, TenantDetailResponse, TenantResponse, anyPlanName, quotaLimitText
} from '../../models/sunat.models';
import { fieldErrors } from '../../models/tenant-admin.models';
import { TenantService } from '../../services/sunat.services';
import { TenantPlanStateComponent, hasPlanState } from './tenant-plan-state.component';

const REASON_MAX = 400;

/** Cupo de un plan de la tabla `plans` (`GET plans`): -1 = ilimitado; null = el plan no lo define (la API usa 30). */
function planQuota(p: PlanRow | undefined): number | null {
  if (!p) {
    return null;
  }
  return p.isUnlimited ? -1 : p.documentsMonth;
}

/**
 * Cambiar plan (`PUT tenants/{id}/plan`, `Admin.Tenants.Manage`, §12.2). El plan del panel es el **plan efectivo**: el cambio
 * es inmediato, cancela las reducciones programadas y conserva la suscripción vigente si ya es de ese plan (activa, sin
 * cancelación, sin vencer y sin cobro) o, si no, cancela las vigentes y crea una activa asignada por el panel. El cupo es
 * opcional: vacío (o igual al del plan) = el del plan; otro valor = cupo del panel. `emissionMode` y `motivo` opcionales.
 * Lee el detalle (`GET tenants/{id}`) para mostrar el estado actual y, al guardar, muestra el estado nuevo de la respuesta.
 */
@Component({
  selector: 'app-tenant-plan',
  imports: [FormsModule, TenantPlanStateComponent],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-sliders"></em>{{ result() ? 'Plan actualizado' : 'Cambiar plan' }}</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" [disabled]="saving()" (click)="close()"></button>
    </div>
    <div class="modal-body">
      <p class="text-muted">{{ tenant.razonSocial }} ({{ tenant.ruc }})</p>
      @if (result(); as r) {
      @if (resultMessage()) {<div class="alert alert-success py-2 small">{{ resultMessage() }}</div>}
      @if (hasState(r)) {
      <app-tenant-plan-state [tenant]="r"></app-tenant-plan-state>
      } @else {
      <p class="small mb-0">Plan {{ plan(r.plan) }} · cupo {{ limit(r.maxDocumentsMonth) }}.</p>
      }
      } @else {
      @if (loading()) {
      <div class="erp-loading" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Cargando el estado actual…</div>
      } @else if (current(); as c) {
      @if (hasState(c)) {
      <section class="border rounded p-3 mb-3">
        <h6 class="mb-2 small text-uppercase text-muted">Ahora</h6>
        <app-tenant-plan-state [tenant]="c"></app-tenant-plan-state>
      </section>
      }
      }
      <form class="erp-form" novalidate (ngSubmit)="save()">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label" for="tenant-plan">Plan <span class="erp-required">*</span></label>
            <select id="tenant-plan" class="form-select" name="plan" [(ngModel)]="planCode" [class.is-invalid]="!!err('plan')">
              @for (p of plans; track p.id) {<option [ngValue]="p.id">{{ p.name }}</option>}
            </select>
            @if (err('plan')) {<div class="invalid-feedback">{{ err('plan') }}</div>}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="tenant-max">Cupo de comprobantes por mes</label>
            <input id="tenant-max" type="number" min="0" step="1" class="form-control" name="maxDocumentsMonth" [(ngModel)]="max"
              [placeholder]="'Vacío = el del plan' + (defaultFor(planCode) !== null ? ' (' + limit(defaultFor(planCode)) + ')' : '')"
              [class.is-invalid]="!!err('maxDocumentsMonth')" />
            @if (err('maxDocumentsMonth')) {<div class="invalid-feedback">{{ err('maxDocumentsMonth') }}</div>}
            <div class="form-text">{{ quotaHint() }}</div>
          </div>
          <div class="col-12">
            <label class="form-label" for="tenant-mode">Modo de emisión</label>
            <select id="tenant-mode" class="form-select" name="emissionMode" [(ngModel)]="mode" [class.is-invalid]="!!err('emissionMode')">
              @for (m of modes; track m.id) {<option [ngValue]="m.id">{{ m.name }}</option>}
            </select>
            @if (err('emissionMode')) {<div class="invalid-feedback">{{ err('emissionMode') }}</div>}
            <div class="form-text">"Ilimitada", el ambiente beta y la emisión ilimitada global no aplican cupo. El cupo del panel manda aunque el plan sea ilimitado.</div>
          </div>
          <div class="col-12">
            <label class="form-label" for="tenant-plan-motivo">Motivo (opcional, queda en la auditoría)</label>
            <textarea id="tenant-plan-motivo" class="form-control" rows="2" name="motivo" [attr.maxlength]="reasonMax" [(ngModel)]="motivo"
              placeholder="Ej.: acuerdo comercial (ticket 1234)" [class.is-invalid]="!!err('motivo')"></textarea>
            @if (err('motivo')) {<div class="invalid-feedback">{{ err('motivo') }}</div>}
          </div>
        </div>
        <button type="submit" class="d-none" aria-hidden="true" tabindex="-1"></button>
      </form>
      <div class="erp-callout mt-3 small"><em class="feather icon-info"></em>
        <span>El cambio rige <strong>de inmediato</strong> (es el plan efectivo de la empresa) y cancela las reducciones programadas. Si la suscripción vigente ya es
          de ese plan, está activa (no en prueba), sin cancelación pedida, sin vencer y sin cobro, se conserva con su periodo; si no, se cancelan las vigentes
          (también una prueba o una de pago) y se crea una activa asignada por el panel, sin cobro, por la duración del plan o sin vencimiento. Si después la
          empresa cambia su plan por la API, rige ese plan con su cupo (el cupo del panel se borra).</span>
      </div>
      @if (error()) {<div class="alert alert-danger py-2 small mt-3 mb-0" role="alert">{{ error() }}</div>}
      }
    </div>
    <div class="modal-footer">
      @if (result()) {
      <button type="button" class="btn btn-primary" (click)="close()">Cerrar</button>
      } @else {
      <button type="button" class="btn btn-light" [disabled]="saving()" (click)="activeModal.dismiss()">Cancelar</button>
      <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">
        @if (saving()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
        Guardar
      </button>
      }
    </div>
  `
})
export class TenantPlanComponent implements OnInit {
  readonly activeModal = inject(NgbActiveModal);
  private tenants = inject(TenantService);
  private planService = inject(PlanService);
  private perms = inject(PermissionService);

  /** Fila del listado o detalle de la empresa. */
  @Input() tenant!: TenantResponse;

  readonly plans = PLAN_OPTIONS;
  readonly modes = EMISSION_MODE_OPTIONS;
  readonly reasonMax = REASON_MAX;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly errors = signal<Record<string, string>>({});
  readonly current = signal<TenantDetailResponse | null>(null);
  readonly result = signal<TenantDetailResponse | null>(null);
  readonly resultMessage = signal('');
  /** Cupo de cada plan (`GET plans`, por slug). */
  private readonly planQuotas = signal<Record<string, number | null>>({});

  planCode: PlanCode = 'free';
  /** Vacío = el cupo del plan. */
  max: number | string | null = null;
  mode: EmissionMode = 'plan';
  motivo = '';

  ngOnInit(): void {
    this.prefill(this.tenant as TenantDetailResponse);
    this.tenants.byId(this.tenant.id).subscribe({
      next: (resp) => {
        this.loading.set(false);
        if (resp.succeeded && resp.data) {
          const d = resp.data as TenantDetailResponse;
          this.current.set(d);
          this.prefill(d);
        }
      },
      error: () => this.loading.set(false)
    });
    if (this.perms.hasPermission(PERM.plansView)) {
      this.planService.GetAll(50, 1, '').subscribe({
        next: (resp) => {
          const map: Record<string, number | null> = {};
          (Array.isArray(resp?.data) ? (resp.data as PlanRow[]) : []).forEach((p) => (map[p.slug] = planQuota(p)));
          this.planQuotas.set(map);
        }
      });
    }
  }

  /** Plan y modo guardados; el cupo solo si es del panel (con una API anterior, el guardado). */
  private prefill(t: TenantDetailResponse): void {
    this.planCode = PLAN_OPTIONS.some((p) => p.id === t.plan) ? t.plan : 'free';
    this.mode = this.modes.some((m) => m.id === t.emissionMode) ? (t.emissionMode as EmissionMode) : 'plan';
    if (t.quota) {
      this.max = t.quota.source === 'panel' && t.quota.override != null ? t.quota.override : null;
    } else if (!hasPlanState(t)) {
      this.max = t.maxDocumentsMonth != null && t.maxDocumentsMonth >= 0 ? t.maxDocumentsMonth : null;
    }
  }

  hasState(t: TenantDetailResponse): boolean {
    return hasPlanState(t);
  }

  err(key: string): string {
    return this.errors()[key] ?? '';
  }

  plan(slug?: string | null): string {
    return anyPlanName(slug);
  }

  limit(value?: number | null): string {
    return quotaLimitText(value);
  }

  /** Cupo del plan elegido: de `GET plans` o, si es el plan efectivo, `quota.planDefault`. */
  defaultFor(slug: string): number | null {
    const fromPlans = this.planQuotas()[slug];
    if (fromPlans !== undefined) {
      return fromPlans;
    }
    const c = this.current();
    return c?.quota && (c.effectivePlan ?? c.plan) === slug ? c.quota.planDefault : null;
  }

  quotaHint(): string {
    const def = this.defaultFor(this.planCode);
    const planText = def == null ? `el del plan ${this.plan(this.planCode)}` : `el del plan ${this.plan(this.planCode)}: ${this.limit(def)}`;
    return `Vacío = ${planText}. Otro valor queda como cupo del panel (se aplica aunque el plan sea ilimitado).`;
  }

  close(): void {
    if (this.result()) {
      this.activeModal.close(true);
    } else if (!this.saving()) {
      this.activeModal.dismiss();
    }
  }

  save(): void {
    if (this.saving()) {
      return;
    }
    const e: Record<string, string> = {};
    const raw = this.max == null ? '' : String(this.max).trim();
    if (raw && !/^\d+$/.test(raw)) {
      e['maxDocumentsMonth'] = 'El cupo mensual debe ser un número entero mayor o igual a 0 (vacío = el cupo del plan).';
    }
    const motivo = this.motivo.trim();
    if (motivo.length > REASON_MAX) {
      e['motivo'] = `Máximo ${REASON_MAX} caracteres.`;
    }
    this.errors.set(e);
    this.error.set('');
    if (Object.keys(e).length) {
      return;
    }
    const body: ChangeTenantPlanRequest = { plan: this.planCode, maxDocumentsMonth: raw ? Number(raw) : null, emissionMode: this.mode };
    if (motivo) {
      body.motivo = motivo;
    }
    this.saving.set(true);
    this.tenants.changePlan(this.tenant.id, body).subscribe({
      next: (resp) => {
        this.saving.set(false);
        if (resp.succeeded) {
          this.resultMessage.set(serverMessages(resp, 'Plan actualizado.'));
          this.result.set((resp.data as TenantDetailResponse) ?? { ...this.tenant, plan: this.planCode });
          return;
        }
        this.showErrors(fieldErrors(resp), serverMessages({ messages: resp.messages }, 'No se pudo cambiar el plan.'));
      },
      error: (err) => {
        this.saving.set(false);
        this.showErrors(fieldErrors(err?.error), serverMessages(err?.error, 'No se pudo cambiar el plan.'));
      }
    });
  }

  private showErrors(fields: Record<string, string>, message: string): void {
    this.errors.set(fields);
    const shown = ['plan', 'maxDocumentsMonth', 'emissionMode', 'motivo'];
    const rest = Object.entries(fields).filter(([k]) => !shown.includes(k)).map(([, v]) => v).filter((m) => !message.includes(m));
    this.error.set([message, ...rest].join(' '));
  }
}
