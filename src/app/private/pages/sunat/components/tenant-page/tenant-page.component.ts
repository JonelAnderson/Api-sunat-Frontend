import { Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { NgClass } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { NgbDropdownModule, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { combineLatest } from 'rxjs';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { ReasonModalComponent, ReasonModalResult } from '@shared/components/reusables/reason-modal/reason-modal.component';
import { openModal, runAction, serverMessages } from '@shared/functions/list-helpers';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { PermissionService } from '@shared/service/permission.service';
import { PERM, TenantDetailResponse, anyPlanName, environmentName, quotaLimitText } from '../../models/sunat.models';
import { DocumentsPreset, isSaleKind } from '../../models/tenant-views.models';
import { TenantService } from '../../services/sunat.services';
import { TenantPlanComponent } from '../tenants/tenant-plan.component';
import { TenantInfoComponent } from './tenant-info.component';
import { TenantPanelComponent } from './tenant-panel.component';
import { TenantDocumentsComponent } from './tenant-documents.component';
import { TenantOtherDocsComponent } from './tenant-other-docs.component';
import { TenantConfigComponent } from './tenant-config.component';
import { TenantReportsComponent } from './tenant-reports.component';
import { TenantCredentialsComponent } from './tenant-credentials.component';
import { TenantLogoComponent } from './tenant-logo.component';
import { TenantDeleteComponent } from './tenant-delete.component';
import { TenantFormComponent } from '../tenants/tenant-form.component';
import { EMIT_TYPES } from '../emission/emission-types';

export type TenantTab = 'resumen' | 'comprobantes' | 'otros' | 'configuracion' | 'credenciales' | 'reportes';

const TABS: { id: TenantTab; name: string; icon: string }[] = [
  { id: 'resumen', name: 'Resumen', icon: 'icon-home' },
  { id: 'comprobantes', name: 'Comprobantes', icon: 'icon-file-text' },
  { id: 'otros', name: 'Otros comprobantes', icon: 'icon-folder' },
  { id: 'configuracion', name: 'Configuración', icon: 'icon-settings' },
  { id: 'credenciales', name: 'Credenciales', icon: 'icon-lock' },
  { id: 'reportes', name: 'Reportes', icon: 'icon-bar-chart-2' }
];

/**
 * Página de una empresa (`/private/sunat/tenants/:id`): las acciones de siempre (suspender / activar y cambiar plan, con
 * `Admin.Tenants.Manage`) y las de la fase C (§11.3–§11.5): editar datos y logo (`Admin.Tenants.Edit`), eliminar
 * (`Admin.Tenants.Delete`, vuelve al listado), pestaña Credenciales (solo escritura) y sucursales / series / clientes en
 * Configuración; fase D (§11.8): acciones sobre los documentos en Comprobantes y Otros comprobantes (con la empresa
 * suspendida quedan deshabilitadas). Cabecera con `GET tenants/{id}` y pestañas con las vistas de §9; cada pestaña
 * se carga la primera vez que se abre y conserva su estado al cambiar de pestaña. `?tab=comprobantes&tipo=facturas&serie=
 * &correlativo=&fecha=` abre Comprobantes ya filtrado (lo usa Rechazos).
 */
@Component({
  selector: 'app-tenant-page',
  imports: [NgClass, RouterModule, NgbDropdownModule, PageHeaderComponent, TenantInfoComponent, TenantPanelComponent, TenantDocumentsComponent,
    TenantOtherDocsComponent, TenantConfigComponent, TenantCredentialsComponent, TenantReportsComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-briefcase" [title]="title()" [subtitle]="subtitle()"
            help="Los mismos datos que la empresa ve en la API. Las escrituras (datos, logo, credenciales, sucursales, series y clientes) pasan por las reglas de /api/v1; consultas, descargas y cambios quedan en la auditoría.">
            <ng-container ngProjectAs="[headerMeta]">
              @if (tenant(); as t) {
              <span class="badge ms-2" [ngClass]="t.isActive ? 'badge-light-success' : 'badge-light-danger'">{{ t.isActive ? 'ACTIVA' : 'SUSPENDIDA' }}</span>
              @if (t.planInSync === false) {
              <span class="badge badge-light-warning ms-1" title="El plan de la empresa no es el que rige: vuelva a guardarlo con Cambiar plan">PLAN SIN SINCRONIZAR</span>
              }
              }
            </ng-container>
            <ng-container ngProjectAs="[headerActions]">
              <a class="btn btn-light btn-sm" routerLink="/private/sunat/tenants"><em class="feather icon-arrow-left me-1"></em>Empresas</a>
              @if (tenant(); as t) {
              @if (canRejections) {
              <a class="btn btn-outline-primary btn-sm" routerLink="/private/sunat/rejections"
                [queryParams]="{ tenantId: t.id, tenant: t.razonSocial + ' (' + t.ruc + ')' }"><em class="feather icon-alert-octagon me-1"></em>Rechazos</a>
              }
              @if (canSunatQuery) {
              <a class="btn btn-outline-primary btn-sm" routerLink="/private/sunat/cpe-query" title="Consulta en vivo a SUNAT con las credenciales de la empresa"
                [queryParams]="{ tenantId: t.id, tenant: t.razonSocial + ' (' + t.ruc + ')' }"><em class="feather icon-search me-1"></em>Consulta CPE</a>
              }
              @if (canIssue && t.isActive) {
              <div ngbDropdown class="d-inline-block" placement="bottom-end">
                <button type="button" class="btn btn-primary btn-sm" ngbDropdownToggle title="Emitir un documento nuevo en nombre de la empresa (con idempotencia)">
                  <em class="feather icon-send me-1"></em>Emitir</button>
                <div ngbDropdownMenu>
                  @for (e of emitTypes; track e.id) {
                  @if (e.id === 'guias-remision') {<div class="dropdown-divider"></div>}
                  <a ngbDropdownItem [routerLink]="['/private/sunat/tenants', t.id, 'emitir', e.id]"><em class="feather {{ e.icon }} me-1"></em>{{ e.name }}</a>
                  }
                </div>
              </div>
              }
              @if (canEdit) {
              <button type="button" class="btn btn-outline-primary btn-sm" (click)="editData()"><em class="feather icon-edit me-1"></em>Editar datos</button>
              <button type="button" class="btn btn-outline-primary btn-sm" (click)="editLogo()"><em class="feather icon-image me-1"></em>Logo</button>
              }
              @if (canManage) {
              <button type="button" class="btn btn-outline-primary btn-sm" (click)="changePlan()"><em class="feather icon-sliders me-1"></em>Cambiar plan</button>
              @if (t.isActive) {
              <button type="button" class="btn btn-outline-danger btn-sm" (click)="suspend()"><em class="feather icon-pause-circle me-1"></em>Suspender</button>
              } @else {
              <button type="button" class="btn btn-outline-success btn-sm" (click)="activate()"><em class="feather icon-play-circle me-1"></em>Activar</button>
              }
              }
              @if (canDelete) {
              <button type="button" class="btn btn-outline-danger btn-sm" (click)="remove()"><em class="feather icon-trash-2 me-1"></em>Eliminar</button>
              }
              }
            </ng-container>
          </app-page-header>

          <div class="card-body">
            @if (loading()) {
            <div class="erp-loading" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Cargando…</div>
            } @else if (error()) {
            <div class="alert alert-warning mb-0">{{ error() }}</div>
            } @else {
            <ul class="nav nav-tabs mb-3" role="tablist">
              @for (tab of tabs; track tab.id) {
              <li class="nav-item" role="presentation">
                <button type="button" role="tab" class="nav-link" [class.active]="active() === tab.id" [attr.aria-selected]="active() === tab.id"
                  (click)="select(tab.id)"><em class="feather {{ tab.icon }} me-1"></em>{{ tab.name }}</button>
              </li>
              }
            </ul>

            @for (key of [renderKey()]; track key) {
            @if (seen().has('resumen')) {
            <div [hidden]="active() !== 'resumen'" role="tabpanel">
              <app-tenant-info [tenant]="tenant()" [canResave]="canManage" (resavePlan)="changePlan()"></app-tenant-info>
              <h5 class="mt-4 mb-3"><em class="feather icon-pie-chart me-1 text-primary"></em>Panel de la empresa</h5>
              <app-tenant-panel [tenantId]="tenantId()"></app-tenant-panel>
            </div>
            }
            @if (seen().has('comprobantes')) {
            <div [hidden]="active() !== 'comprobantes'" role="tabpanel">
              <app-tenant-documents [tenantId]="tenantId()" [preset]="preset" [ruc]="tenant()?.ruc ?? ''" [tenantActive]="tenant()?.isActive ?? null"
                [tenantName]="tenant() ? tenant()!.razonSocial + ' (' + tenant()!.ruc + ')' : ''"></app-tenant-documents>
            </div>
            }
            @if (seen().has('otros')) {
            <div [hidden]="active() !== 'otros'" role="tabpanel"><app-tenant-other-docs [tenantId]="tenantId()" [tenantActive]="tenant()?.isActive ?? null"
              [tenantName]="tenant() ? tenant()!.razonSocial + ' (' + tenant()!.ruc + ')' : ''"></app-tenant-other-docs></div>
            }
            @if (seen().has('configuracion')) {
            <div [hidden]="active() !== 'configuracion'" role="tabpanel"><app-tenant-config [tenantId]="tenantId()" (changed)="loadTenant(false)"></app-tenant-config></div>
            }
            @if (seen().has('credenciales')) {
            <div [hidden]="active() !== 'credenciales'" role="tabpanel">
              <app-tenant-credentials [tenantId]="tenantId()" [ruc]="tenant()?.ruc ?? ''" [tenantLabel]="tenant() ? tenant()!.razonSocial + ' (' + tenant()!.ruc + ')' : ''"
                (changed)="afterDataChange()"></app-tenant-credentials>
            </div>
            }
            @if (seen().has('reportes')) {
            <div [hidden]="active() !== 'reportes'" role="tabpanel"><app-tenant-reports [tenantId]="tenantId()"></app-tenant-reports></div>
            }
            }
            }
          </div>
        </div>
      </div>
    </div>
  `
})
export class TenantPageComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private tenants = inject(TenantService);
  private perms = inject(PermissionService);
  private modal = inject(NgbModal);
  private alerts = inject(AlertModalService);
  private titleService = inject(CustomTitleService);
  private destroyRef = inject(DestroyRef);

  readonly tabs = TABS;
  readonly canManage = this.perms.hasPermission(PERM.tenantsManage);
  readonly canRejections = this.perms.hasPermission(PERM.rejections);
  readonly canSunatQuery = this.perms.hasPermission(PERM.sunatQuery);
  readonly canEdit = this.perms.hasPermission(PERM.tenantsEdit);
  readonly canDelete = this.perms.hasPermission(PERM.tenantsDelete);
  /** Fase D, entrega 3: menú "Emitir" (solo con la empresa activa; la API además responde 403 si está suspendida). */
  readonly canIssue = this.perms.hasPermission(PERM.documentsIssue);
  readonly emitTypes = EMIT_TYPES;
  /** La pestaña Configuración (si ya se abrió): se recarga su parte Empresa después de editar. */
  private readonly config = viewChild(TenantConfigComponent);
  readonly tenantId = signal(0);
  /** Cambia con cada navegación (otra empresa o un filtro nuevo desde Rechazos): vuelve a crear las pestañas. */
  readonly renderKey = signal(0);
  readonly tenant = signal<TenantDetailResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly active = signal<TenantTab>('resumen');
  readonly seen = signal<Set<TenantTab>>(new Set<TenantTab>());
  readonly title = signal('EMPRESA');
  readonly subtitle = signal('');
  preset: DocumentsPreset | null = null;

  constructor() {
    this.titleService.set('Empresa');
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(([params, query]) => {
      const id = Number(params.get('id'));
      if (!(id > 0)) {
        void this.router.navigate(['/private/sunat/tenants']);
        return;
      }
      const tipo = query.get('tipo');
      this.preset = isSaleKind(tipo)
        ? { kind: tipo, serie: query.get('serie') ?? undefined, correlativo: query.get('correlativo') ?? undefined, fecha: query.get('fecha') ?? undefined }
        : null;
      const tab = TABS.find((t) => t.id === query.get('tab'))?.id ?? (this.preset ? 'comprobantes' : 'resumen');
      // Otra empresa o un filtro nuevo desde Rechazos: las pestañas se vuelven a crear.
      this.seen.set(new Set<TenantTab>([tab]));
      this.renderKey.update((n) => n + 1);
      this.active.set(tab);
      if (id !== this.tenantId()) {
        this.tenantId.set(id);
        this.loadTenant();
      }
    });
  }

  select(tab: TenantTab): void {
    this.active.set(tab);
    if (!this.seen().has(tab)) {
      this.seen.update((s) => new Set<TenantTab>([...s, tab]));
    }
  }

  loadTenant(showSpinner = true): void {
    if (showSpinner) {
      this.loading.set(true);
    }
    this.error.set('');
    this.tenants.byId(this.tenantId()).subscribe({
      next: (resp) => {
        this.loading.set(false);
        if (resp.succeeded && resp.data) {
          const t = resp.data as TenantDetailResponse;
          this.tenant.set(t);
          this.title.set(t.razonSocial || 'EMPRESA');
          this.subtitle.set([`RUC ${t.ruc}`, t.nombreComercial, environmentName(t.environment), this.planText(t)].filter(Boolean).join(' · '));
          this.titleService.set(`Empresa ${t.ruc}`);
        } else {
          this.error.set(serverMessages(resp, 'No se pudo cargar la empresa.'));
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(serverMessages(err?.error, 'No se pudo cargar la empresa.'));
      }
    });
  }

  /** Plan que rige y cupo (§12.2); con una API anterior, el plan guardado. */
  private planText(t: TenantDetailResponse): string {
    const plan = `Plan ${anyPlanName(t.effectivePlan ?? t.plan)}`;
    const q = t.quota;
    if (!q) {
      return plan;
    }
    const quota = q.exemptReason ? 'sin cupo' : q.unlimited || q.documentsMonth === -1 ? 'cupo ilimitado'
      : `cupo ${quotaLimitText(q.documentsMonth)}${q.source === 'panel' ? ' (panel)' : ''}`;
    return `${plan} · ${quota} · ${quotaLimitText(q.usedThisMonth)} usados`;
  }

  /** Después de editar datos, logo o credenciales: cabecera y parte Empresa de Configuración. */
  afterDataChange(): void {
    this.loadTenant(false);
    this.config()?.reloadCompany();
  }

  editData(): void {
    openModal<boolean>(this.modal, TenantFormComponent, (ref) => (ref.componentInstance.tenantId = this.tenantId()), () => this.afterDataChange(), 'xl');
  }

  editLogo(): void {
    const t = this.tenant();
    if (t) {
      openModal<boolean>(this.modal, TenantLogoComponent, (ref) => Object.assign(ref.componentInstance, { tenantId: t.id, tenantLabel: this.who(t) }),
        () => this.afterDataChange());
    }
  }

  /** Solo superadmin: motivo + RUC; al terminar vuelve al listado (la empresa ya responde 404). */
  remove(): void {
    const t = this.tenant();
    if (t) {
      openModal<boolean>(this.modal, TenantDeleteComponent, (ref) => Object.assign(ref.componentInstance, { tenantId: t.id, ruc: t.ruc, razonSocial: t.razonSocial }),
        () => void this.router.navigate(['/private/sunat/tenants']));
    }
  }

  private who(t: TenantDetailResponse): string {
    return `${t.razonSocial} (${t.ruc})`;
  }

  changePlan(): void {
    const t = this.tenant();
    if (t) {
      openModal<boolean>(this.modal, TenantPlanComponent, (ref) => (ref.componentInstance.tenant = t), () => this.loadTenant(false));
    }
  }

  suspend(): void {
    const t = this.tenant();
    if (!t) {
      return;
    }
    openModal<ReasonModalResult>(this.modal, ReasonModalComponent, (ref) => Object.assign(ref.componentInstance, {
      title: 'Suspender empresa', icon: 'icon-pause-circle', confirmText: 'Suspender', confirmClass: 'btn-danger',
      description: `${this.who(t)}. Mientras esté suspendida, la API responde 403 a todas sus peticiones (no emite ni consulta).`,
      placeholder: 'Por qué se suspende (lo verá el equipo en el listado y en la auditoría)'
    }), (r) => runAction(this.alerts, this.tenants.changeState(t.id, { activo: false, motivo: r.reason }),
      'No se pudo suspender la empresa.', () => this.loadTenant(false), 'Empresa suspendida.'));
  }

  activate(): void {
    const t = this.tenant();
    if (!t) {
      return;
    }
    openModal<ReasonModalResult>(this.modal, ReasonModalComponent, (ref) => Object.assign(ref.componentInstance, {
      title: 'Activar empresa', icon: 'icon-play-circle', confirmText: 'Activar', required: false,
      description: `${this.who(t)}. Vuelve a emitir de inmediato. Motivo de la suspensión: ${t.suspensionReason || 'sin motivo registrado'}.`,
      placeholder: 'Opcional'
    }), (r) => runAction(this.alerts, this.tenants.changeState(t.id, { activo: true, motivo: r.reason }),
      'No se pudo activar la empresa.', () => this.loadTenant(false), 'Empresa activada.'));
  }
}
