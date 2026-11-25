/**
 * Plataforma (Docs/api-sunat-panel-admin-diseno.md §10.4 y §10.6): planes de la tabla `plans` y configuración global de
 * emisión (tabla `settings`). JSON en camelCase; instantes en ISO-8601 UTC. El token de consulta RUC / DNI nunca vuelve.
 */

/** Planes "del sistema": no cambian de slug ni se eliminan (`tenants.plan` solo admite esos tres, §10.1). */
export const SYSTEM_PLAN_SLUGS = ['free', 'pro', 'business'];

/** Fila de `GET plans`. `documentsMonth` = `limits.documents_month` o null; -1 = ilimitado. */
export interface PlanRow {
  id: number;
  slug: string;
  name: string;
  priceMonthly: number;
  priceYearly: number | null;
  documentsMonth: number | null;
  isUnlimited: boolean;
  durationDays: number | null;
  featuresCount: number;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  subscriptionsCount: number;
  /** Empresas con `tenants.plan` igual al slug. */
  tenantsCount: number;
  // Para la tabla
  badgeColor?: string;
  statusText?: string;
  priceText?: string;
  documentsText?: string;
  usageText?: string;
  /** Slug, con "del sistema" en free / pro / business. */
  kindText?: string;
}

/** `GET plans/{id}`: la fila más límites, funcionalidades y fechas. */
export interface PlanDetail extends PlanRow {
  limits: Record<string, number>;
  features: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PlanCatalogLimit {
  group: string;
  key: string;
  label: string;
  help?: string | null;
}

export interface PlanCatalogFeature {
  group: string;
  key: string;
  label: string;
}

/** `GET plans/catalog`: etiquetas para el formulario. Un plan puede llevar claves que no están aquí. */
export interface PlanCatalog {
  limits: PlanCatalogLimit[];
  features: PlanCatalogFeature[];
}

/** Cuerpo de `POST plans` / `PUT plans/{id}` (el PUT reemplaza límites y funcionalidades). */
export interface PlanRequest {
  slug: string;
  name: string;
  priceMonthly: number;
  priceYearly: number | null;
  sortOrder: number | null;
  limits: Record<string, number>;
  features: string[];
  isUnlimited: boolean;
  durationDays: number | null;
  isActive: boolean;
}

// ---------------------------------------------------------------- Configuración global de emisión
export interface EmissionSettings {
  globalUnlimited: boolean;
  /** La variable `EMISION_ILIMITADA_GLOBAL` del despliegue: el panel la muestra y no la puede apagar. */
  globalUnlimitedByEnvironment: boolean;
  /** Cualquiera de las dos. */
  globalUnlimitedEffective: boolean;
  newTenantsUnlimited: boolean;
  updatedAt: string | null;
}

export interface LookupTokenStatus {
  configured: boolean;
  /** `panel` (guardado aquí, cifrado), `environment` (`LOOKUP_API_TOKEN`) o `none`. */
  source: 'panel' | 'environment' | 'none' | string;
  /** Solo con `source: panel` y un token de 12 caracteres o más. */
  last4: string | null;
  updatedAt: string | null;
}

export interface PlatformSettings {
  emission: EmissionSettings;
  lookupToken: LookupTokenStatus;
  stats: { tenantsTotal: number; tenantsUnlimited: number; tenantsPlan: number };
}

export interface EmissionSettingsRequest {
  globalUnlimited: boolean;
  newTenantsUnlimited: boolean;
  /** Obligatorio si cambia `globalUnlimited` (máx. 400). */
  motivo: string | null;
}
