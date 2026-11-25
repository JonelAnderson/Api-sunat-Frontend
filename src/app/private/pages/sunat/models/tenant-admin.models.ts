/**
 * Fase C del panel (Docs/api-sunat-panel-admin-diseno.md §11.3–§11.5 y §11.9): alta, edición, logo y eliminación de una
 * empresa, credenciales de solo escritura y sucursales / series / clientes.
 * - Los cuerpos que reutilizan `/api/v1` (alta, edición, sucursales, series, clientes) van en **snake_case**, con los mismos
 *   nombres de `/api/v1`, más `motivo` opcional; su `data` es el recurso de `/api/v1` en snake_case.
 * - Las respuestas propias del panel (alta: `tenantId` / `apiKey` / `apiSecret` / `aviso`; credenciales; logo) van en camelCase.
 * - `apiKey` / `apiSecret` solo llegan en la respuesta del alta y de "regenerar": se muestran una vez en
 *   `ApiCredentialsModalComponent` y se descartan (nunca en el estado, localStorage ni sessionStorage).
 */
import { CertificateStatus, EmissionMode, Environment, Option, PlanCode } from './sunat.models';

// ---------------------------------------------------------------- RUC (§11.1-10, hallazgo H13)
/** RUC de 11 dígitos con prefijo 10 / 15 / 16 / 17 / 20 y dígito verificador módulo 11 (la misma regla de la API). */
export function rucError(value: unknown): string {
  const ruc = String(value ?? '').trim();
  if (!ruc) {
    return 'El RUC es obligatorio.';
  }
  if (!/^\d{11}$/.test(ruc)) {
    return 'El RUC debe tener exactamente 11 dígitos.';
  }
  if (!['10', '15', '16', '17', '20'].includes(ruc.substring(0, 2))) {
    return 'El RUC debe empezar con 10, 15, 16, 17 o 20.';
  }
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(ruc[i]), 0);
  let check = 11 - (sum % 11);
  check = check === 10 ? 0 : check === 11 ? 1 : check;
  return check === Number(ruc[10]) ? '' : 'El RUC no es válido: el dígito verificador no corresponde.';
}

// ---------------------------------------------------------------- Empresa: alta y edición (§11.3)
export type TaxRegime = 'rus' | 'rer' | 'mype' | 'general';

export const TAX_REGIME_OPTIONS: Option<TaxRegime>[] = [
  { id: 'general', name: 'Régimen general' },
  { id: 'mype', name: 'Régimen MYPE tributario' },
  { id: 'rer', name: 'Régimen especial (RER)' },
  { id: 'rus', name: 'Nuevo RUS (solo boletas)' }
];

export const NRUS_OPTIONS: Option<number>[] = [
  { id: 1, name: 'Categoría 1' },
  { id: 2, name: 'Categoría 2' }
];

export type WalletType = 'yape' | 'plin' | 'tunki' | 'otro';

export const WALLET_OPTIONS: Option<WalletType>[] = [
  { id: 'yape', name: 'Yape' },
  { id: 'plin', name: 'Plin' },
  { id: 'tunki', name: 'Tunki' },
  { id: 'otro', name: 'Otro' }
];

/** Tope de teléfonos, correos, cuentas y billeteras (§11.3). */
export const MAX_REPEATED = 5;

export interface BankAccount {
  banco: string;
  tipo_cuenta: string | null;
  moneda: 'PEN' | 'USD';
  numero: string;
  cci: string | null;
  titular: string | null;
}

export interface DigitalWallet {
  tipo: WalletType;
  numero: string;
  titular: string | null;
}

/** Campos de `PUT /api/v1/empresa` que acepta el panel (alta y edición). Nunca credenciales, logo ni certificado. */
export interface TenantDataBody {
  razon_social?: string;
  nombre_comercial?: string | null;
  direccion?: string;
  ubigeo?: string;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  telefonos?: string[];
  emails?: string[];
  cuentas_bancarias?: BankAccount[];
  billeteras_digitales?: DigitalWallet[];
  mensaje_agradecimiento?: string | null;
  mensaje_promocional?: string | null;
  url_webhook?: string | null;
  entorno?: Environment;
  tax_regime?: TaxRegime;
  igv_rate_override?: number | null;
  nrus_categoria?: number | null;
  motivo?: string;
}

/** `POST tenants`: lo anterior más el RUC y los propios del alta. */
export interface CreateTenantBody extends TenantDataBody {
  ruc: string;
  razon_social: string;
  direccion: string;
  ubigeo: string;
  plan?: PlanCode;
  max_documents_month?: number;
  emission_mode?: EmissionMode;
  series_por_defecto?: boolean;
}

/** `data` del alta (camelCase del panel; `empresa` es el recurso de §9.5 en snake_case). */
export interface CreateTenantResult {
  tenantId: number;
  empresa: Record<string, unknown>;
  apiKey: string;
  apiSecret: string;
  aviso?: string;
}

/** Lo que el formulario de alta entrega al cerrar: se usa al instante para el modal de una sola vez y se descarta. */
export interface OneTimeCredentials {
  tenantId: number;
  tenantLabel: string;
  ruc: string;
  apiKey: string;
  apiSecret: string;
  aviso?: string;
}

/** `data` de `GET tenants/ruc-lookup` (resultado del proveedor, snake_case). */
export interface RucLookupResult {
  tipo_doc?: string;
  num_doc?: string;
  razon_social?: string;
  direccion?: string;
  estado?: string;
  condicion?: string;
  source?: string;
}

/** `data` de `POST tenants/{id}/logo`. */
export interface LogoResult {
  logoUrl: string;
  formato: string;
}

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// ---------------------------------------------------------------- Credenciales (§11.4, solo escritura)
export interface CredentialsCertificate {
  present: boolean;
  status: CertificateStatus | string;
  expiresOn: string | null;
  daysLeft: number | null;
  message: string | null;
  subject: string | null;
  issuer: string | null;
  serialNumber: string | null;
  validFrom: string | null;
  validTo: string | null;
}

/** `GET tenants/{id}/credenciales`: solo indicadores y metadatos, nunca valores. */
export interface CredentialsStatus {
  hasSolUser: boolean;
  hasSolPassword: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  apiKeyLast4: string | null;
  certificate: CredentialsCertificate | null;
}

export interface SolCredentialsBody {
  sol_user: string;
  sol_pass: string;
  motivo?: string;
}

export interface GreCredentialsBody {
  client_id: string;
  client_secret: string;
  motivo?: string;
}

export const CERTIFICATE_MAX_BYTES = 100 * 1024;

// ---------------------------------------------------------------- Sucursales, series y clientes (§11.5)
export interface BranchBody {
  nombre?: string;
  cod_local?: string;
  direccion?: string;
  ubigeo?: string;
  telefono?: string | null;
  email?: string | null;
  es_principal?: boolean;
  activo?: boolean;
  motivo?: string;
}

/** `tipo` de serie de §11.5 (y del filtro `tipo` de `GET series`). */
export const SERIES_KIND_OPTIONS: Option<string>[] = [
  { id: 'factura', name: 'Factura' },
  { id: 'boleta', name: 'Boleta' },
  { id: 'nota_credito', name: 'Nota de crédito' },
  { id: 'nota_debito', name: 'Nota de débito' },
  { id: 'guia_remision', name: 'Guía de remisión remitente' },
  { id: 'guia_transportista', name: 'Guía de remisión transportista' },
  { id: 'retencion', name: 'Retención' },
  { id: 'percepcion', name: 'Percepción' },
  { id: 'liquidacion_compra', name: 'Liquidación de compra' }
];

/** Prefijos que la API exige (§11.5); el resto de tipos solo pide 4 caracteres en mayúscula. */
export const SERIES_PREFIXES: Record<string, string[]> = {
  factura: ['F'],
  boleta: ['B'],
  nota_credito: ['F', 'B'],
  nota_debito: ['F', 'B']
};

export function seriesError(kind: string, serie: string): string {
  const s = (serie ?? '').trim();
  if (!s) {
    return 'Indique la serie.';
  }
  if (!/^[A-Z0-9]{4}$/.test(s)) {
    return 'La serie tiene 4 caracteres en mayúscula (letras o números).';
  }
  const prefixes = SERIES_PREFIXES[kind];
  if (prefixes && !prefixes.includes(s[0])) {
    return `La serie de este tipo empieza con ${prefixes.join(' o ')}.`;
  }
  return '';
}

export interface SeriesCreateBody {
  tipo: string;
  serie: string;
  sucursal_id: number;
  correlativo_inicial?: number;
  motivo?: string;
}

export interface SeriesUpdateBody {
  activo?: boolean;
  correlativo?: number;
  sucursal_id?: number;
  motivo?: string;
}

/** Tipos de documento del cliente (§11.5: 0, 1, 4, 6, 7, A). */
export const CLIENT_DOC_OPTIONS: Option<string>[] = [
  { id: '6', name: 'RUC' },
  { id: '1', name: 'DNI' },
  { id: '4', name: 'Carné de extranjería' },
  { id: '7', name: 'Pasaporte' },
  { id: 'A', name: 'Cédula diplomática' },
  { id: '0', name: 'Sin documento' }
];

/** Tipos que acepta `buscar-documento` (§11.9). */
export const LOOKUP_DOC_TYPES = ['1', '4', '6', '7', '0'];

export interface ClientBody {
  tipo_documento?: string;
  numero_documento?: string;
  razon_social?: string;
  nombre_comercial?: string | null;
  direccion?: string | null;
  email?: string | null;
  telefono?: string | null;
  motivo?: string;
}

// ---------------------------------------------------------------- Ubigeo (§11.9)
export interface UbigeoItem {
  id: string;
  nombre: string;
}

/** Lo que elige `app-ubigeo-select`: el ubigeo (id del distrito) y los nombres para departamento / provincia / distrito. */
export interface UbigeoChoice {
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
}

// ---------------------------------------------------------------- Ayudas
/** Errores por campo del sobre (`errors[].propertyName` → mensaje). */
export function fieldErrors(resp: { errors?: unknown } | null | undefined): Record<string, string> {
  const e: Record<string, string> = {};
  (Array.isArray(resp?.errors) ? resp!.errors : []).forEach((x: { propertyName?: string; errorMessage?: string }) => {
    if (x?.propertyName && x.errorMessage && !e[x.propertyName]) {
      e[x.propertyName] = x.errorMessage;
    }
  });
  return e;
}

/** Texto recortado; vacío → null. */
export function textOrNull(value: unknown): string | null {
  const t = value == null ? '' : String(value).trim();
  return t ? t : null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^[0-9+\s()-]{6,20}$/;
