/**
 * Modelos del panel de la API SUNAT (contrato: Docs/api-sunat-panel-admin-diseno.md §5.3). JSON en camelCase; días como
 * `yyyy-MM-dd` (Lima) e instantes como ISO-8601 UTC. Nunca llegan secretos (clave SOL, certificado, api_secret…).
 * Los campos marcados "para la tabla" los calcula el servicio al recibir la página.
 */

export interface Option<T> {
  id: T;
  name: string;
}

/** Permisos que devuelve `GET admin/auth/permissions` (§3). */
export const PERM = {
  dashboard: 'Admin.Dashboard.View',
  tenantsView: 'Admin.Tenants.View',
  tenantsManage: 'Admin.Tenants.Manage',
  usage: 'Admin.Usage.View',
  certificates: 'Admin.Certificates.View',
  rejections: 'Admin.Rejections.View',
  jobsView: 'Admin.Jobs.View',
  jobsRetry: 'Admin.Jobs.Retry',
  health: 'Admin.Health.View',
  // Fases A y B (§10.2)
  plansView: 'Admin.Plans.View',
  plansManage: 'Admin.Plans.Manage',
  plansDelete: 'Admin.Plans.Delete',
  settingsView: 'Admin.Settings.View',
  settingsManage: 'Admin.Settings.Manage',
  sunatQuery: 'Admin.Sunat.Query',
  users: 'Admin.Users.Manage',
  audit: 'Admin.Audit.View',
  // Fase C (§11.2): alta / edición / logo / sucursales / series / clientes, credenciales (solo escritura) y eliminar (solo superadmin).
  tenantsEdit: 'Admin.Tenants.Edit',
  tenantsCredentials: 'Admin.Tenants.Credentials',
  tenantsDelete: 'Admin.Tenants.Delete',
  // Fase D (§11.2, §10.2). Issue: corregir y reenviar un rechazado (§11.8.4), `buscar-documento` (§11.9) y emitir (entrega 3).
  documentsIssue: 'Admin.Documents.Issue',
  // Reenviar (§11.8.1), anular / revertir (§11.8.2) y refrescar en SUNAT (§11.8.3): superadmin, operador y soporte.
  documentsResend: 'Admin.Documents.Resend',
  documentsVoid: 'Admin.Documents.Void',
  documentsRefresh: 'Admin.Documents.Refresh'
} as const;

export type Environment = 'beta' | 'production';
export type PlanCode = 'free' | 'pro' | 'business';
/** Valores de `tenants.emission_mode` en la API (Tenant.EMISSION_PLAN / EMISSION_UNLIMITED). */
export type EmissionMode = 'plan' | 'unlimited';
export type CertificateStatus = 'OK' | 'POR_VENCER' | 'VENCIDO' | 'ROTO' | 'SIN_CERTIFICADO';

export const ENVIRONMENT_OPTIONS: Option<Environment>[] = [
  { id: 'beta', name: 'Beta (pruebas)' },
  { id: 'production', name: 'Producción' }
];

export const PLAN_OPTIONS: Option<PlanCode>[] = [
  { id: 'free', name: 'Free' },
  { id: 'pro', name: 'Pro' },
  { id: 'business', name: 'Business' }
];

export const EMISSION_MODE_OPTIONS: Option<EmissionMode>[] = [
  { id: 'plan', name: 'Según el plan (respeta el límite del mes)' },
  { id: 'unlimited', name: 'Ilimitada (sin límite del plan)' }
];

export const CERTIFICATE_STATUS_OPTIONS: Option<CertificateStatus>[] = [
  { id: 'OK', name: 'Vigente' },
  { id: 'POR_VENCER', name: 'Por vencer' },
  { id: 'VENCIDO', name: 'Vencido' },
  { id: 'ROTO', name: 'Roto (no se puede leer)' },
  { id: 'SIN_CERTIFICADO', name: 'Sin certificado' }
];

export const CERTIFICATE_BADGE: Record<string, string> = {
  OK: 'badge-light-success',
  POR_VENCER: 'badge-light-warning',
  VENCIDO: 'badge-light-danger',
  ROTO: 'badge-light-danger',
  SIN_CERTIFICADO: 'badge-light-secondary'
};

/** Tipos de comprobante SUNAT (catálogo 01) que pueden aparecer en los rechazos. */
const DOCUMENT_TYPES: Record<string, string> = {
  '01': 'Factura',
  '03': 'Boleta',
  '07': 'Nota de crédito',
  '08': 'Nota de débito',
  '09': 'Guía de remisión',
  '20': 'Retención',
  '40': 'Percepción'
};

export function optionName<T>(options: Option<T>[], id: T | null | undefined): string {
  return options.find((o) => o.id === id)?.name ?? (id == null ? '' : String(id));
}

export function environmentName(env?: string | null): string {
  return env === 'production' ? 'Producción' : env === 'beta' ? 'Beta' : env ?? '';
}

export function planName(plan?: string | null): string {
  return optionName(PLAN_OPTIONS, plan as PlanCode);
}

export function documentTypeName(tipo?: string | null): string {
  if (!tipo) {
    return '';
  }
  return DOCUMENT_TYPES[tipo] ?? tipo;
}

export function certificateStatusName(status?: string | null): string {
  return optionName(CERTIFICATE_STATUS_OPTIONS, status as CertificateStatus);
}

// ---------------------------------------------------------------- Tablero
export interface DashboardResponse {
  tenantsActive: number;
  tenantsInactive: number;
  tenantsProduction: number;
  tenantsBeta: number;
  documentsThisMonth: number;
  rejectedThisMonth: number;
  pendingNow: number;
  failedJobs: number;
  certificatesExpiring: number;
  certificatesBroken: number;
  // Métricas globales (§10.3, caché de 60 s en la API). Opcionales: una API anterior no las trae.
  tenantsTotal?: number;
  documentsToday?: number;
  documentsPreviousMonth?: number;
  /** % con un decimal frente al mes anterior completo; null si el anterior es 0. */
  documentsGrowth?: number | null;
  /** Facturas y boletas aceptadas en soles (PEN). */
  salesThisMonth?: number;
  salesPreviousMonth?: number;
  salesGrowth?: number | null;
  /** Siempre 30 días, del más antiguo a hoy; `notas` = crédito + débito. */
  documentsByDay?: { date: string; facturas: number; boletas: number; notas: number }[];
  /** Los 12 tipos de la fila común, en ese orden, también en 0. */
  documentsByType?: { tipo: string; nombre: string; total: number }[];
  tenantsByPlan?: DashboardBucket[];
  tenantsByRegime?: DashboardBucket[];
  tenantsByEnvironment?: DashboardBucket[];
  sunatStatusThisMonth?: Record<string, number>;
  topTenants?: { tenantId: number; ruc: string; razonSocial: string; sales: number; documents: number }[];
  /** Los 8 envíos más recientes de los últimos 30 días (fila común). */
  recentSubmissions?: DocumentRow[];
  period?: { monthStart: string; today: string };
  metricsAt?: string | null;
}

/** `key` = valor de la columna (`plan`, `tax_regime`, `environment`); `label` su nombre (`Sin definir` si es null). */
export interface DashboardBucket {
  key: string | null;
  label: string;
  total: number;
}

// ---------------------------------------------------------------- Documentos: fila común (§10.3)
/** Tipos de la fila común (`tipo`), en el orden de `porTipo` y `documentsByType`. */
export const DOC_TYPE_OPTIONS: Option<string>[] = [
  { id: '01', name: 'Factura' },
  { id: '03', name: 'Boleta' },
  { id: '07', name: 'Nota de crédito' },
  { id: '08', name: 'Nota de débito' },
  { id: '09', name: 'Guía de remisión remitente' },
  { id: '31', name: 'Guía de remisión transportista' },
  { id: '20', name: 'Retención' },
  { id: '40', name: 'Percepción' },
  { id: '04', name: 'Liquidación de compra' },
  { id: 'RC', name: 'Resumen diario' },
  { id: 'RA', name: 'Comunicación de baja' },
  { id: 'RR', name: 'Reversión' }
];

/** `estado` del filtro: un `sunatStatus` o `observado` (aceptado con observaciones del CDR). */
export const DOC_STATUS_OPTIONS: Option<string>[] = [
  { id: 'pendiente', name: 'Pendiente' },
  { id: 'enviado', name: 'Enviado' },
  { id: 'aceptado', name: 'Aceptado' },
  { id: 'observado', name: 'Aceptado con observaciones' },
  { id: 'rechazado', name: 'Rechazado' },
  { id: 'anulado', name: 'Anulado' },
  { id: 'anulacion_en_proceso', name: 'Anulación en proceso' },
  { id: 'reversion_en_proceso', name: 'Reversión en proceso' },
  { id: 'revertido', name: 'Revertido' }
];

/** Orden de `GET documents` / `tenants/{id}/comprobantes` (`orderBy`; otro valor → error de la API). */
export const DOC_ORDER_OPTIONS: Option<string>[] = [
  { id: 'fechaEmision', name: 'Fecha de emisión' },
  { id: 'createdAt', name: 'Fecha de registro' },
  { id: 'sentAt', name: 'Envío a SUNAT' },
  { id: 'total', name: 'Importe' },
  { id: 'tipo', name: 'Tipo' },
  { id: 'serie', name: 'Serie' },
  { id: 'numero', name: 'Número' },
  { id: 'estado', name: 'Estado' }
];

/** Fila común de `submissions`, `documents`, `tenants/{id}/comprobantes` y `dashboard.recentSubmissions` (25 claves). */
export interface DocumentRow {
  id: number;
  tipo: string;
  tipoNombre: string;
  /** Segmento de §9 para el detalle y las descargas: `GET tenants/{tenantId}/{vista}/{id}`. */
  vista: string;
  tenantId: number;
  ruc: string;
  razonSocial: string;
  serie: string | null;
  correlativo: string;
  numero: string;
  cliente: string | null;
  clienteDoc: string | null;
  moneda: string | null;
  total: number | null;
  sunatStatus: string;
  sunatCode: string | null;
  sunatDescription: string | null;
  observado: boolean;
  fechaEmision: string;
  sentAt: string | null;
  createdAt: string;
  sucursalId: number | null;
  hasXml: boolean;
  hasCdr: boolean;
  hasPdf: boolean;
  // Para la tabla
  badgeColor?: string;
  statusText?: string;
  sunatText?: string;
  fechaText?: string;
  sentText?: string;
  totalText?: string;
  tenantText?: string;
}

/** `GET documents/summary` y `tenants/{id}/comprobantes/resumen`. */
export interface DocumentSummary {
  total: number;
  porTipo: Record<string, number>;
  porEstado: Record<string, number>;
  observados: number;
}

// ---------------------------------------------------------------- Sucursales y series de todas las empresas (§10.3)
export interface BranchRow {
  id: number;
  tenantId: number;
  ruc: string;
  razonSocial: string;
  nombre: string;
  codLocal: string;
  direccion?: string | null;
  ubigeo?: string | null;
  isPrincipal: boolean;
  isActive: boolean;
  totalSeries: number;
  // Para la tabla
  badgeColor?: string;
  statusText?: string;
  principalText?: string;
}

export interface SeriesRow {
  id: number;
  tenantId: number;
  ruc: string;
  razonSocial: string;
  tipoDocumento: string;
  tipoNombre: string;
  serie: string;
  correlativo: number;
  siguienteNumero: string;
  sucursalId: number | null;
  sucursalNombre: string | null;
  isActive: boolean;
  // Para la tabla
  badgeColor?: string;
  statusText?: string;
  correlativoText?: string;
}

/** `tipo` del filtro de `GET series` (otro valor → error de la API). */
export const SERIES_TYPE_OPTIONS: Option<string>[] = DOC_TYPE_OPTIONS.filter((o) => !['RC', 'RA', 'RR'].includes(o.id))
  .map((o) => ({ id: o.id, name: `${o.name} (${o.id})` }));

// ---------------------------------------------------------------- Empresas
export interface TenantResponse {
  id: number;
  ruc: string;
  razonSocial: string;
  nombreComercial?: string | null;
  environment: Environment;
  plan: PlanCode;
  emissionMode: EmissionMode | string;
  isActive: boolean;
  documentsThisMonth: number;
  maxDocumentsMonth: number;
  suspensionReason?: string | null;
  createdAt?: string | null;
  // Para la tabla
  badgeColor?: string;
  statusText?: string;
  environmentText?: string;
  planText?: string;
  usageText?: string;
}

export interface TenantCertificate {
  status: CertificateStatus | string;
  expiresOn?: string | null;
  message?: string | null;
}

/**
 * Suscripción vigente (`active` / `trialing`) del detalle (§12.2); `null` = rige Free. `setByPanel` = la asignó el panel
 * (`payment_gateway: "admin"`); `periodEnd: null` = sin vencimiento.
 */
export interface TenantSubscription {
  id: number;
  plan: string;
  status: string;
  setByPanel: boolean;
  billingCycle?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  trialEndsAt?: string | null;
  cancelledAt?: string | null;
}

/** Reducción programada (`pending`): pasa a `plan` en `startsAt`. */
export interface TenantPendingSubscription {
  id: number;
  plan: string;
  startsAt?: string | null;
}

/** Por qué no se aplica cupo: emisión ilimitada global, ambiente beta o `emissionMode: unlimited`. */
export type QuotaExemptReason = 'global' | 'beta' | 'unlimited';

/**
 * Cupo que se aplica (§12.2). `documentsMonth` -1 = ilimitado (`unlimited: true`); `source` `panel` (cupo del panel, `override`)
 * o `plan` (el del plan efectivo, `planDefault`); `usedThisMonth` = lo que cuenta la API en el mes (UTC), incluidos los
 * eliminados; `exemptReason` = por qué no se aplica cupo (o `null`).
 */
export interface TenantQuota {
  documentsMonth: number;
  unlimited: boolean;
  source: 'panel' | 'plan' | string;
  planDefault: number | null;
  override: number | null;
  usedThisMonth: number;
  exemptReason: QuotaExemptReason | string | null;
}

/** `GET tenants/{id}`: la fila más el detalle. `sucursales` y `series` pueden llegar como número o como lista. */
export interface TenantDetailResponse extends TenantResponse {
  direccion?: string | null;
  emails?: string[] | string | null;
  sucursales?: unknown;
  series?: unknown;
  lastDocumentAt?: string | null;
  documentsByStatus?: Record<string, number> | null;
  certificate?: TenantCertificate | null;
  webhookUrl?: string | null;
  sireEnabled?: boolean;
  // §12.2 (opcionales: una API anterior no los trae)
  /** Slug del plan efectivo (el de la suscripción vigente, o Free). */
  effectivePlan?: string | null;
  /** `tenants.plan` = plan efectivo; `false` → volver a guardar el plan en el panel. */
  planInSync?: boolean | null;
  subscription?: TenantSubscription | null;
  pendingSubscription?: TenantPendingSubscription | null;
  quota?: TenantQuota | null;
}

export interface ChangeTenantStateRequest {
  activo: boolean;
  motivo: string;
}

/**
 * `PUT tenants/{id}/plan` (§12.2): `maxDocumentsMonth` opcional (`null` / ausente = el cupo del plan), `emissionMode`
 * opcional (si no viene se conserva) y `motivo` opcional (máx. 400, queda en la auditoría).
 */
export interface ChangeTenantPlanRequest {
  plan: PlanCode;
  maxDocumentsMonth?: number | null;
  emissionMode?: EmissionMode;
  motivo?: string;
}

/** Cupo para mostrar: -1 = ilimitado. */
export function quotaLimitText(value: number | null | undefined): string {
  if (value == null) {
    return '—';
  }
  return value === -1 ? 'Ilimitado' : value.toLocaleString('es-PE');
}

/** Explicación de `quota.exemptReason`. */
export function exemptReasonText(reason: string | null | undefined): string {
  switch (reason) {
    case 'global':
      return 'Emisión ilimitada global activada (Configuración de emisión): no se aplica cupo a ninguna empresa.';
    case 'beta':
      return 'Ambiente beta: la API no aplica cupo a los comprobantes de prueba.';
    case 'unlimited':
      return 'Modo de emisión "Ilimitada": la empresa no tiene cupo mientras siga así.';
    default:
      return reason ? `Sin cupo (${reason}).` : '';
  }
}

/** Nombre del estado de una suscripción. */
export function subscriptionStatusName(status: string | null | undefined): string {
  const names: Record<string, string> = {
    active: 'Activa', trialing: 'En prueba', past_due: 'Pago vencido', cancelled: 'Cancelada', canceled: 'Cancelada', pending: 'Programada', expired: 'Vencida'
  };
  return names[status ?? ''] ?? (status ?? '');
}

/** Nombre de un plan por su slug (los de la tabla `plans` fuera de los tres del sistema se muestran tal cual). */
export function anyPlanName(slug: string | null | undefined): string {
  return planName(slug) || (slug ?? '');
}

// ---------------------------------------------------------------- Uso del mes
export interface UsageResponse {
  tenantId: number;
  ruc: string;
  razonSocial: string;
  plan: PlanCode;
  maxDocumentsMonth: number;
  issued: number;
  accepted: number;
  rejected: number;
  pending: number;
  voided: number;
  // Para la tabla
  planText?: string;
  usageText?: string;
  tenantText?: string;
}

// ---------------------------------------------------------------- Certificados
export interface CertificateResponse {
  tenantId: number;
  ruc: string;
  razonSocial: string;
  environment: Environment;
  status: CertificateStatus | string;
  expiresOn?: string | null;
  daysLeft?: number | null;
  message?: string | null;
  // Para la tabla
  badgeColor?: string;
  statusText?: string;
  expiresOnText?: string;
  environmentText?: string;
  tenantText?: string;
}

// ---------------------------------------------------------------- Rechazos
export interface RejectionResponse {
  tenantId: number;
  ruc: string;
  razonSocial: string;
  tipo: string;
  serie: string;
  correlativo: number | string;
  fechaEmision: string;
  sunatCode?: string | null;
  sunatDescription?: string | null;
  // Para la tabla
  tenantText?: string;
  documentText?: string;
  tipoText?: string;
  fechaText?: string;
}

// ---------------------------------------------------------------- Trabajos fallidos
export interface FailedJobResponse {
  id: number;
  queue: string;
  type: string;
  documentId?: number | string | null;
  attempts: number;
  exception?: string | null;
  failedAt?: string | null;
  // Para la tabla
  failedAtText?: string;
  exceptionShort?: string;
}

// ---------------------------------------------------------------- Salud
/** Una comprobación de `GET health`: el contrato dice "ok / error y mensaje"; se aceptan texto u objeto. */
export type HealthCheckValue = string | { status?: string; estado?: string; ok?: boolean; message?: string; mensaje?: string } | null | undefined;

export interface HealthResponse {
  database: HealthCheckValue;
  redis: HealthCheckValue;
  queue: ({ pending?: number; failed?: number } & Exclude<HealthCheckValue, string | null | undefined>) | null;
  scheduler: HealthCheckValue;
  sunat: { beta?: HealthCheckValue; production?: HealthCheckValue } | null;
}

export interface HealthCard {
  key: string;
  label: string;
  icon: string;
  ok: boolean | null;
  message: string;
  extra?: string;
}

/** Lee una comprobación de salud: `ok` true / false (null si no vino) y su mensaje. */
export function readHealth(value: HealthCheckValue): { ok: boolean | null; message: string } {
  if (value == null) {
    return { ok: null, message: 'Sin dato' };
  }
  if (typeof value === 'string') {
    return { ok: value.toLowerCase() === 'ok', message: value.toLowerCase() === 'ok' ? 'Funciona' : value };
  }
  const state = (value.status ?? value.estado ?? (value.ok === undefined ? undefined : value.ok ? 'ok' : 'error'))?.toString().toLowerCase();
  const message = value.message ?? value.mensaje ?? '';
  if (state === undefined) {
    return { ok: null, message: message || 'Sin dato' };
  }
  return { ok: state === 'ok', message: message || (state === 'ok' ? 'Funciona' : 'Con error') };
}
