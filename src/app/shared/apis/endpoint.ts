import { HttpHeaders } from "@angular/common/http";

/**
 * Rutas de la API SUNAT para el panel de administración (contrato: Docs/api-sunat-panel-admin-diseno.md §5). Se concatenan a
 * `environment.apiUrl` (`/api/`). Solo las claves que se usan: una pantalla nueva agrega las suyas.
 */
export const endpoint = {

  // AUTENTICACIÓN (§5.1). LOGIN es prefijo de login/mfa y login/mfa/setup(/confirm): el interceptor no les pone el bearer.
  LOGIN: 'admin/auth/login',
  LOGIN_MFA: 'admin/auth/login/mfa',
  LOGIN_MFA_SETUP: 'admin/auth/login/mfa/setup',
  LOGIN_MFA_SETUP_CONFIRM: 'admin/auth/login/mfa/setup/confirm',
  REFRSHTOKEN: 'admin/auth/refreshToken',
  LOGOUT: 'admin/auth/logout',
  /** GET: perfil propio; PUT (§10.4): `{ name, email, password }` con la contraseña actual. */
  ACCOUNT_ME: 'admin/auth/me',
  GET_PERMISSIONS: 'admin/auth/permissions',
  MENU_NAV: 'admin/auth/menu',
  CHANGE_PASSWORD: 'admin/auth/password',
  MFA_STATUS: 'admin/auth/mfa/status',
  MFA_RECOVERY_CODES: 'admin/auth/mfa/recovery-codes',

  // ADMINISTRADORES (§5.2, solo superadmin). Con id: users/{id}, users/{id}/toggle-status, /mfa/reset, /unlock, /password.
  ADMIN_USERS: 'admin/users',

  // PANEL (§5.3)
  DASHBOARD: 'admin/dashboard',
  /**
   * Con id: tenants/{id}, tenants/{id}/estado y tenants/{id}/plan. Vistas de empresa (§9, solo GET, `data` en snake_case):
   * tenants/{id}/{facturas|boletas|notas-credito|notas-debito|guias-remision|…}, /panel/…, /empresa, /reportes/… (las arma
   * TenantViewsService).
   */
  TENANTS: 'admin/tenants',
  USAGE: 'admin/usage',
  CERTIFICATES: 'admin/certificates',
  REJECTIONS: 'admin/rejections',
  /** Con id: jobs/{id}/retry. */
  JOBS: 'admin/jobs',
  JOBS_RETRY_ALL: 'admin/jobs/retry-all',
  HEALTH: 'admin/health',
  AUDIT: 'admin/audit',

  // FASE A (§10.3–§10.5). Fila común de documentos en camelCase. Vista unificada de una empresa: tenants/{id}/comprobantes(/resumen),
  // ZIP: tenants/{id}/comprobantes/exportar-zip, constancia: tenants/{id}/{tipo}/{docId}/anulacion(/xml|/cdr), consultas en vivo:
  // tenants/{id}/consultar-cpe y /consultar-cdr (las arma TenantViewsService).
  SUBMISSIONS: 'admin/submissions',
  DOCUMENTS: 'admin/documents',
  DOCUMENTS_SUMMARY: 'admin/documents/summary',
  BRANCHES: 'admin/branches',
  SERIES: 'admin/series',
  /** Con id: plans/{id}, plans/{id}/toggle (PUT) y DELETE plans/{id} (fase B). */
  PLANS: 'admin/plans',
  PLANS_CATALOG: 'admin/plans/catalog',

  // FASE B (§10.6): configuración global de emisión.
  SETTINGS: 'admin/settings',
  SETTINGS_EMISSION: 'admin/settings/emission',
  SETTINGS_LOOKUP_TOKEN: 'admin/settings/lookup-token',

  // FASE C (§11.3–§11.5): POST / PUT / DELETE tenants(/{id}), tenants/{id}/logo, tenants/{id}/credenciales(/sol|/gre|/regenerar),
  // tenants/{id}/certificado, tenants/{id}/{sucursales|series|clientes}(/{registroId}) y tenants/{id}/buscar-documento (§11.9).
  // Las arma TenantAdminService sobre TENANTS.
  TENANTS_RUC_LOOKUP: 'admin/tenants/ruc-lookup',
  /** §11.9: catalogos/ubigeo/regiones, /provincias?region_id=, /distritos?provincia_id=. */
  UBIGEO: 'admin/catalogos/ubigeo',
  /** §11.9: catálogo 25 (UNSPSC): ?q=&per_page=&page=, /segmentos, /familias?segmento=, /clases?familia=, /productos?clase=, /{codigo}. */
  PRODUCTO_SUNAT: 'admin/catalogos/producto-sunat',
  // FASE D (§11.6–§11.7): emitir con POST tenants/{id}/{facturas|boletas|notas-credito|notas-debito|guias-remision|
  // guias-remision-transportista|retenciones|percepciones|liquidaciones-compra|resumenes} y cabecera Idempotency-Key
  // (las arma EmissionService sobre TENANTS).

};

export const httpOptions = {
  headers: new HttpHeaders({
    "Content-Type": "application/json",
  }),
};
