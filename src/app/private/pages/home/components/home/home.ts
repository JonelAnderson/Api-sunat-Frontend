import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { PermissionService } from '@shared/service/permission.service';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { formatNumber, serverMessages } from '@shared/functions/list-helpers';
import { isoToLima, ymdToDisplay } from '@shared/functions/lima-dates';
import { DashboardBucket, DashboardResponse, DocumentRow, PERM } from '../../../sunat/models/sunat.models';
import { ViewBlock, ViewRow, c, kindFromVista, money, qty, sunatBadge, sunatStatusName, table, withBars } from '../../../sunat/models/tenant-views.models';
import { DashboardService, decorateDocumentRow } from '../../../sunat/services/sunat.services';
import { ViewBlockComponent } from '../../../sunat/components/tenant-page/view-block.component';

interface DashboardCard {
  label: string;
  value: string;
  hint: string;
  icon: string;
  /** Color del número: cuando hay algo que revisar se resalta. */
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'muted';
  url: string | null;
  queryParams?: Record<string, string>;
}

interface Shortcut {
  label: string;
  description: string;
  icon: string;
  url: string;
  permission: string | null;
}

/** Una columna del gráfico de 30 días (alturas en % del día con más documentos). */
interface DayBar {
  date: string;
  label: string;
  title: string;
  facturas: number;
  boletas: number;
  notas: number;
  showLabel: boolean;
}

/** Métricas globales de §10.3 (solo si la API las trae). */
interface GlobalMetrics {
  cards: DashboardCard[];
  days: DayBar[];
  byType: ViewBlock;
  tenants: ViewBlock;
  status: ViewBlock;
  top: { tenantId: number; name: string; ruc: string; sales: string; documents: string }[];
  recent: DocumentRow[];
  period: string;
  metricsAt: string;
}

const SHORTCUTS: Shortcut[] = [
  { label: 'Empresas', description: 'Emisores, planes y suspensiones', icon: 'icon-briefcase', url: '/private/sunat/tenants', permission: PERM.tenantsView },
  { label: 'Comprobantes', description: 'Todos los documentos de todas las empresas', icon: 'icon-file-text', url: '/private/sunat/documents', permission: PERM.tenantsView },
  { label: 'Envíos SUNAT', description: 'Lo último enviado, en todos los estados', icon: 'icon-send', url: '/private/sunat/submissions', permission: PERM.rejections },
  { label: 'Sucursales', description: 'Establecimientos de todas las empresas', icon: 'icon-map-pin', url: '/private/sunat/branches', permission: PERM.tenantsView },
  { label: 'Series', description: 'Series y correlativos de todas las empresas', icon: 'icon-hash', url: '/private/sunat/series', permission: PERM.tenantsView },
  { label: 'Certificados', description: 'Vencimientos y certificados rotos', icon: 'icon-award', url: '/private/sunat/certificates', permission: PERM.certificates },
  { label: 'Uso del mes', description: 'Comprobantes por empresa', icon: 'icon-bar-chart-2', url: '/private/sunat/usage', permission: PERM.usage },
  { label: 'Rechazos SUNAT', description: 'Códigos y motivos de rechazo', icon: 'icon-alert-octagon', url: '/private/sunat/rejections', permission: PERM.rejections },
  { label: 'Consulta CPE', description: 'Consulta en vivo a SUNAT', icon: 'icon-search', url: '/private/sunat/cpe-query', permission: PERM.sunatQuery },
  { label: 'Trabajos fallidos', description: 'Reintentar envíos de la cola', icon: 'icon-alert-triangle', url: '/private/sunat/jobs', permission: PERM.jobsView },
  { label: 'Salud', description: 'Base de datos, Redis, cola y SUNAT', icon: 'icon-activity', url: '/private/sunat/health', permission: PERM.health },
  { label: 'Planes', description: 'Precios, límites y funcionalidades', icon: 'icon-package', url: '/private/platform/plans', permission: PERM.plansView },
  { label: 'Configuración de emisión', description: 'Emisión ilimitada y token de consulta', icon: 'icon-sliders', url: '/private/platform/settings', permission: PERM.settingsView },
  { label: 'Administradores', description: 'Accesos a este panel', icon: 'icon-users', url: '/private/admin/users', permission: PERM.users },
  { label: 'Auditoría', description: 'Quién hizo qué y cuándo', icon: 'icon-file-text', url: '/private/admin/audit', permission: PERM.audit },
  { label: 'Ayuda', description: 'Guías del panel', icon: 'icon-help-circle', url: '/private/help', permission: null }
];

/** Estados del mes (`sunatStatusThisMonth`): la API usa camelCase en `anulacionEnProceso`. */
const MONTH_STATES: { key: string; status: string }[] = [
  { key: 'pendiente', status: 'pendiente' }, { key: 'enviado', status: 'enviado' }, { key: 'aceptado', status: 'aceptado' },
  { key: 'rechazado', status: 'rechazado' }, { key: 'anulado', status: 'anulado' }, { key: 'anulacionEnProceso', status: 'anulacion_en_proceso' }
];

/**
 * Inicio: tablero de `GET admin/dashboard` (tarjetas con enlace a cada pantalla y, desde §10.3, las métricas globales: hoy,
 * mes anterior, ventas en soles, gráfico de 30 días, tipos, empresas por plan / régimen / ambiente, estados del mes, empresas
 * con más ventas y últimos envíos) y accesos directos según los permisos. Gráficos con barras CSS, sin librerías.
 */
@Component({
  selector: 'app-home',
  imports: [RouterModule, NgTemplateOutlet, ViewBlockComponent],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {
  private permissions = inject(PermissionService);
  private dashboard = inject(DashboardService);
  private modal = inject(NgbModal);

  readonly canSeeDashboard = this.permissions.hasPermission(PERM.dashboard);
  readonly canOpenTenant = this.permissions.hasPermission(PERM.tenantsView);
  readonly canSubmissions = this.permissions.hasPermission(PERM.rejections);
  readonly shortcuts = SHORTCUTS.filter((s) => !s.permission || this.permissions.hasPermission(s.permission));
  readonly loading = signal(false);
  readonly error = signal('');
  readonly cards = signal<DashboardCard[]>([]);
  readonly metrics = signal<GlobalMetrics | null>(null);

  constructor(title: CustomTitleService) {
    title.set('Inicio');
    if (this.canSeeDashboard) {
      this.load();
    }
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.dashboard.get().subscribe({
      next: (resp) => {
        this.loading.set(false);
        if (resp.succeeded && resp.data) {
          const d = resp.data as DashboardResponse;
          this.cards.set(this.toCards(d));
          this.metrics.set(this.toMetrics(d));
        } else {
          this.error.set(serverMessages(resp, 'No se pudo cargar el tablero.'));
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(serverMessages(err?.error, 'No se pudo conectar con la API.'));
      }
    });
  }

  /** Detalle de un envío reciente (carga diferida del modal de la página de la empresa). */
  async openRecent(r: DocumentRow): Promise<void> {
    const kind = kindFromVista(r.vista);
    if (!kind || !this.canOpenTenant) {
      return;
    }
    const { openDocDetail } = await import('../../../sunat/components/tenant-page/tenant-doc-detail.component');
    openDocDetail(this.modal, r.tenantId, kind, r.id, null);
  }

  /** Enlace solo si el usuario puede abrir la pantalla. */
  private link(url: string, permission: string): string | null {
    return this.permissions.hasPermission(permission) ? url : null;
  }

  private toCards(d: DashboardResponse): DashboardCard[] {
    const n = (v?: number | null) => formatNumber(v ?? 0);
    const alert = (v?: number | null, tone: DashboardCard['tone'] = 'danger') => ((v ?? 0) > 0 ? tone : 'success');
    return [
      { label: 'Empresas activas', value: n(d.tenantsActive), hint: `${n(d.tenantsInactive)} suspendidas`, icon: 'icon-briefcase',
        tone: 'primary', url: this.link('/private/sunat/tenants', PERM.tenantsView) },
      { label: 'En producción', value: n(d.tenantsProduction), hint: `${n(d.tenantsBeta)} en beta (pruebas)`, icon: 'icon-globe',
        tone: 'primary', url: this.link('/private/sunat/tenants', PERM.tenantsView) },
      { label: 'Comprobantes del mes', value: n(d.documentsThisMonth), hint: 'Facturas, boletas y notas', icon: 'icon-file-text',
        tone: 'primary', url: this.link('/private/sunat/usage', PERM.usage) },
      { label: 'Rechazados del mes', value: n(d.rejectedThisMonth), hint: 'Rechazados u observados por SUNAT', icon: 'icon-alert-octagon',
        tone: alert(d.rejectedThisMonth, 'warning'), url: this.link('/private/sunat/rejections', PERM.rejections) },
      { label: 'Pendientes ahora', value: n(d.pendingNow), hint: 'Esperando respuesta de SUNAT', icon: 'icon-clock',
        tone: alert(d.pendingNow, 'warning'), url: this.link('/private/sunat/health', PERM.health) },
      { label: 'Trabajos fallidos', value: n(d.failedJobs), hint: 'Agotaron sus intentos en la cola', icon: 'icon-alert-triangle',
        tone: alert(d.failedJobs), url: this.link('/private/sunat/jobs', PERM.jobsView) },
      { label: 'Certificados por vencer', value: n(d.certificatesExpiring), hint: 'Dentro del plazo de aviso', icon: 'icon-award',
        tone: alert(d.certificatesExpiring, 'warning'), url: this.link('/private/sunat/certificates', PERM.certificates),
        queryParams: { status: 'POR_VENCER' } },
      { label: 'Certificados con problema', value: n(d.certificatesBroken), hint: 'Requieren atención (vea su estado)', icon: 'icon-x-octagon',
        tone: alert(d.certificatesBroken), url: this.link('/private/sunat/certificates', PERM.certificates) }
    ];
  }

  private growth(value: number | null | undefined): { text: string; tone: DashboardCard['tone'] } {
    if (value == null) {
      return { text: 'sin datos del mes anterior', tone: 'muted' };
    }
    const sign = value > 0 ? '+' : '';
    return { text: `${sign}${value.toLocaleString('es-PE', { maximumFractionDigits: 1 })} % frente al mes anterior`, tone: value < 0 ? 'warning' : 'success' };
  }

  /** null si la API no trae las métricas de §10.3. */
  private toMetrics(d: DashboardResponse): GlobalMetrics | null {
    if (d.documentsToday === undefined && !d.documentsByDay) {
      return null;
    }
    const n = (v?: number | null) => formatNumber(v ?? 0);
    const soles = (v?: number | null) => money(v ?? 0, 'S/');
    const docGrowth = this.growth(d.documentsGrowth);
    const salesGrowth = this.growth(d.salesGrowth);
    const cards: DashboardCard[] = [
      { label: 'Empresas registradas', value: n(d.tenantsTotal), hint: 'No eliminadas, activas o suspendidas', icon: 'icon-layers', tone: 'primary',
        url: this.link('/private/sunat/tenants', PERM.tenantsView) },
      { label: 'Comprobantes de hoy', value: n(d.documentsToday), hint: 'Facturas, boletas y notas', icon: 'icon-calendar', tone: 'primary',
        url: this.link('/private/sunat/submissions', PERM.rejections) },
      { label: 'Comprobantes del mes anterior', value: n(d.documentsPreviousMonth), hint: `Este mes: ${docGrowth.text}`, icon: 'icon-trending-up',
        tone: docGrowth.tone, url: this.link('/private/sunat/usage', PERM.usage) },
      { label: 'Ventas del mes (aceptadas, S/)', value: soles(d.salesThisMonth), hint: `Mes anterior ${soles(d.salesPreviousMonth)}: ${salesGrowth.text}`,
        icon: 'icon-dollar-sign', tone: salesGrowth.tone, url: null }
    ];

    const byDay = d.documentsByDay ?? [];
    const max = Math.max(1, ...byDay.map((x) => (x.facturas ?? 0) + (x.boletas ?? 0) + (x.notas ?? 0)));
    const pct = (v: number) => Math.round(((v ?? 0) / max) * 1000) / 10;
    const days: DayBar[] = byDay.map((x, i) => ({
      date: x.date, label: ymdToDisplay(x.date).substring(0, 5), facturas: pct(x.facturas), boletas: pct(x.boletas), notas: pct(x.notas),
      title: `${ymdToDisplay(x.date)}: ${n(x.facturas)} facturas, ${n(x.boletas)} boletas, ${n(x.notas)} notas`,
      showLabel: i % 5 === 0 || i === byDay.length - 1
    }));

    const types = d.documentsByType ?? [];
    const typeRows: ViewRow[] = types.map((t) => ({ cells: { tipo: `${t.nombre} (${t.tipo})`, total: qty(t.total) } }));
    const bucketTable = (title: string, list: DashboardBucket[] | undefined, icon: string) => {
      const l = list ?? [];
      const r: ViewRow[] = l.map((b) => ({ cells: { label: b.label || 'Sin definir', total: qty(b.total) } }));
      return table([c('label', title), c('total', 'Empresas', 'end')], withBars(r, 'total', l.map((b) => b.total)), title, 'Sin datos.', icon);
    };
    const states = d.sunatStatusThisMonth ?? {};
    const stateList = MONTH_STATES.map((s) => ({ ...s, total: states[s.key] ?? 0 }));
    const stateRows: ViewRow[] = stateList.map((s) => ({ cells: { estado: sunatStatusName(s.status), total: qty(s.total) }, badges: { estado: sunatBadge(s.status) } }));

    return {
      cards,
      days,
      byType: { tables: [table([c('tipo', 'Tipo'), c('total', 'Documentos', 'end')], withBars(typeRows, 'total', types.map((t) => t.total)),
        'Documentos del mes por tipo', 'Sin documentos este mes.', 'icon-layers')] },
      tenants: { tables: [bucketTable('Plan', d.tenantsByPlan, 'icon-package'), bucketTable('Régimen tributario', d.tenantsByRegime, 'icon-percent'),
        bucketTable('Ambiente', d.tenantsByEnvironment, 'icon-globe')] },
      status: { tables: [table([c('estado', 'Estado SUNAT', undefined, true), c('total', 'Documentos', 'end')],
        withBars(stateRows, 'total', stateList.map((s) => s.total)), 'Estado SUNAT del mes', 'Sin documentos este mes.', 'icon-send')] },
      top: (d.topTenants ?? []).map((t) => ({ tenantId: t.tenantId, name: t.razonSocial, ruc: t.ruc, sales: soles(t.sales), documents: n(t.documents) })),
      recent: (d.recentSubmissions ?? []).map((r) => decorateDocumentRow({ ...r })),
      period: d.period ? `Del ${ymdToDisplay(d.period.monthStart)} al ${ymdToDisplay(d.period.today)}` : '',
      metricsAt: d.metricsAt ? isoToLima(d.metricsAt) : ''
    };
  }
}
