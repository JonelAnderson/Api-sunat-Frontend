import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Observable, combineLatest, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { serverMessages } from '@shared/functions/list-helpers';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { PermissionService } from '@shared/service/permission.service';
import { PERM, TenantDetailResponse, environmentName } from '../../models/sunat.models';
import { actionHttpError } from '../../models/document-actions.models';
import { obj } from '../../models/tenant-views.models';
import { TenantService } from '../../services/sunat.services';
import { TenantViewsService } from '../../services/tenant-views.service';
import { IssueOutcome } from './emission-submit';
import { EMIT_TYPES, EmissionContext, EmitType, emitType, igvRateFromCompany, seriesFromResource } from './emission-types';
import { EmissionResultComponent } from './emission-result.component';
import { NoteSource, SaleEmitFormComponent } from './sale-emit-form.component';
import { GuideEmitFormComponent } from './guide-emit-form.component';
import { RetPerEmitFormComponent } from './retper-emit-form.component';
import { SettlementEmitFormComponent } from './settlement-emit-form.component';
import { SummaryEmitFormComponent } from './summary-emit-form.component';

/**
 * Emitir un documento nuevo en nombre de una empresa (fase D, entrega 3, §11.6–§11.7): `/private/sunat/tenants/:id/emitir/:tipo`
 * (carga diferida, `Admin.Documents.Issue`). Lee la empresa (`GET tenants/{id}`: estado y ambiente), sus series activas
 * (`GET tenants/{id}/series`) y la tasa del IGV (`GET tenants/{id}/empresa`), y muestra el formulario del tipo. Con la empresa
 * suspendida no se emite (la API respondería 403). Al emitir muestra el resultado; "Emitir otro" crea el formulario de nuevo
 * (con otra `Idempotency-Key`). `?origen=facturas|boletas&origenId=` prellena una nota con el comprobante.
 */
@Component({
  selector: 'app-emission-page',
  imports: [RouterModule, PageHeaderComponent, EmissionResultComponent, SaleEmitFormComponent, GuideEmitFormComponent, RetPerEmitFormComponent,
    SettlementEmitFormComponent, SummaryEmitFormComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header [icon]="type()?.icon ?? 'icon-send'" [title]="type()?.verb ?? 'Emitir'" [subtitle]="subtitle()"
            help="Emite con la misma tubería que /api/v1 (validación, cupo del plan, correlativo, envío a SUNAT y webhooks) y con las credenciales guardadas de la empresa. Cada emisión lleva una clave de idempotencia y queda en la auditoría.">
            <ng-container ngProjectAs="[headerActions]">
              <a class="btn btn-light btn-sm" [routerLink]="['/private/sunat/tenants', tenantId()]" [queryParams]="{ tab: type()?.group === 'otros' ? 'otros' : 'comprobantes' }">
                <em class="feather icon-arrow-left me-1"></em>Volver a la empresa</a>
            </ng-container>
          </app-page-header>

          <div class="card-body">
            <ul class="nav nav-pills flex-wrap gap-1 mb-3">
              @for (t of types; track t.id) {
              <li class="nav-item">
                <a class="nav-link py-1 px-2 small" [class.active]="t.id === type()?.id" [routerLink]="['/private/sunat/tenants', tenantId(), 'emitir', t.id]">
                  <em class="feather {{ t.icon }} me-1"></em>{{ t.name }}</a>
              </li>
              }
            </ul>

            @if (loading()) {
            <div class="erp-loading" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Cargando la empresa…</div>
            } @else if (error()) {
            <div class="alert alert-warning mb-0">{{ error() }}</div>
            } @else if (ctx(); as c) {
            @if (!c.active) {
            <div class="alert alert-danger"><em class="feather icon-pause-circle me-1"></em>La empresa está suspendida: no se puede emitir hasta activarla (la API respondería 403).</div>
            }
            @if (c.environment === 'beta') {
            <div class="erp-callout mb-3"><em class="feather icon-info"></em><span>Ambiente beta: se envía a SUNAT de pruebas (sin valor legal y sin cupo del plan).
              @if (type()?.id === 'guias-remision-transportista') { SUNAT beta no valida completamente las guías transportista. }</span></div>
            }
            @if (c.taxRegime === 'rus' && (type()?.id === 'facturas')) {
            <div class="alert alert-warning small">La empresa está en el Nuevo RUS: solo emite boletas (la API rechazará la factura).</div>
            }

            @if (outcome(); as o) {
            <app-emission-result [ctx]="c" [type]="type()!" [outcome]="o" (again)="again()"></app-emission-result>
            } @else {
            @for (k of [formKey()]; track k) {
            @switch (type()?.id) {
            @case ('facturas') {<app-sale-emit-form [ctx]="c" [type]="type()!" (issued)="onIssued($event)"></app-sale-emit-form>}
            @case ('boletas') {<app-sale-emit-form [ctx]="c" [type]="type()!" (issued)="onIssued($event)"></app-sale-emit-form>}
            @case ('notas-credito') {<app-sale-emit-form [ctx]="c" [type]="type()!" [source]="source()" (issued)="onIssued($event)"></app-sale-emit-form>}
            @case ('notas-debito') {<app-sale-emit-form [ctx]="c" [type]="type()!" [source]="source()" (issued)="onIssued($event)"></app-sale-emit-form>}
            @case ('guias-remision') {<app-guide-emit-form [ctx]="c" [type]="type()!" (issued)="onIssued($event)"></app-guide-emit-form>}
            @case ('guias-remision-transportista') {<app-guide-emit-form [ctx]="c" [type]="type()!" (issued)="onIssued($event)"></app-guide-emit-form>}
            @case ('retenciones') {<app-retper-emit-form [ctx]="c" [type]="type()!" (issued)="onIssued($event)"></app-retper-emit-form>}
            @case ('percepciones') {<app-retper-emit-form [ctx]="c" [type]="type()!" (issued)="onIssued($event)"></app-retper-emit-form>}
            @case ('liquidaciones-compra') {<app-settlement-emit-form [ctx]="c" [type]="type()!" (issued)="onIssued($event)"></app-settlement-emit-form>}
            @case ('resumenes') {<app-summary-emit-form [ctx]="c" [type]="type()!" (issued)="onIssued($event)"></app-summary-emit-form>}
            }
            }
            }
            }
          </div>
        </div>
      </div>
    </div>
  `
})
export class EmissionPageComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private tenants = inject(TenantService);
  private views = inject(TenantViewsService);
  private perms = inject(PermissionService);
  private titleService = inject(CustomTitleService);
  private destroyRef = inject(DestroyRef);

  readonly types = EMIT_TYPES;
  readonly tenantId = signal(0);
  readonly type = signal<EmitType | null>(null);
  readonly source = signal<NoteSource | null>(null);
  readonly ctx = signal<EmissionContext | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly subtitle = signal('');
  readonly outcome = signal<IssueOutcome | null>(null);
  /** Cambia con "Emitir otro" o con otro tipo: el formulario (y su clave) se crea de nuevo. */
  readonly formKey = signal(0);

  constructor() {
    this.titleService.set('Emitir');
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(([params, q]) => {
      const id = Number(params.get('id'));
      const type = emitType(params.get('tipo'));
      if (!(id > 0)) {
        void this.router.navigate(['/private/sunat/tenants']);
        return;
      }
      if (!type) {
        void this.router.navigate(['/private/sunat/tenants', id, 'emitir', 'facturas']);
        return;
      }
      const origen = q.get('origen');
      const origenId = Number(q.get('origenId'));
      this.source.set((type.id === 'notas-credito' || type.id === 'notas-debito') && (origen === 'facturas' || origen === 'boletas') && origenId > 0
        ? { kind: origen, id: origenId } : null);
      this.type.set(type);
      this.outcome.set(null);
      this.formKey.update((n) => n + 1);
      this.titleService.set(type.verb);
      if (id !== this.tenantId()) {
        this.tenantId.set(id);
        this.load();
      }
    });
  }

  private load(): void {
    const id = this.tenantId();
    this.loading.set(true);
    this.error.set('');
    this.ctx.set(null);
    if (!this.perms.hasPermission(PERM.documentsIssue)) {
      this.loading.set(false);
      this.error.set('Su rol no permite emitir documentos (Admin.Documents.Issue).');
      return;
    }
    const soft = <T>(o: Observable<T>) => o.pipe(catchError(() => of(null as T | null)));
    forkJoin([
      this.tenants.byId(id),
      soft(this.views.get(id, 'series')),
      soft(this.views.get(id, 'empresa'))
    ]).subscribe({
      next: ([tenant, series, company]: [BaseResponse, BaseResponse | null, BaseResponse | null]) => {
        this.loading.set(false);
        if (!tenant.succeeded || !tenant.data) {
          this.error.set(serverMessages(tenant, 'No se pudo cargar la empresa.'));
          return;
        }
        const t = tenant.data as TenantDetailResponse;
        const c = company?.succeeded ? obj(company.data) : {};
        this.ctx.set({
          tenantId: id, tenantName: `${t.razonSocial} (${t.ruc})`, ruc: t.ruc, active: t.isActive !== false, environment: t.environment,
          igvRatePct: igvRateFromCompany(c), taxRegime: String(c['tax_regime'] ?? ''), series: series?.succeeded ? seriesFromResource(series.data) : [],
          companyAddress: String(c['direccion'] ?? ''), companyUbigeo: String(c['ubigeo'] ?? '')
        });
        this.subtitle.set([`${t.razonSocial} · RUC ${t.ruc}`, environmentName(t.environment)].filter(Boolean).join(' · '));

      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(actionHttpError(err, 'No se pudo cargar la empresa.'));
      }
    });
  }

  onIssued(o: IssueOutcome): void {
    this.outcome.set(o);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** "Emitir otro": formulario nuevo (sin el comprobante origen) y clave nueva. */
  again(): void {
    const t = this.type();
    this.outcome.set(null);
    if (this.source() && t) {
      void this.router.navigate(['/private/sunat/tenants', this.tenantId(), 'emitir', t.id]);
      return;
    }
    this.formKey.update((n) => n + 1);
  }
}
