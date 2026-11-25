/**
 * Fase D, entrega 2 (Docs/api-sunat-panel-admin-diseno.md §11.8): reenviar, anular / revertir, refrescar y corregir un
 * documento de una empresa. Aquí solo hay funciones puras: qué acciones tiene un documento según su tipo, su estado, los
 * permisos (§11.2) y la empresa; qué mecanismo de anulación aplica (RA / RC / RR) con sus plazos; y los textos de error.
 * - Un documento llega de tres formas: fila o detalle de §9 (`data` de `/api/v1`, snake_case) o fila común de §10.3
 *   (camelCase). `targetFromResource` / `targetFromRow` los llevan a `ActionTarget`.
 * - Fechas: días `yyyy-MM-dd` de Lima, comparados como texto (nunca `new Date()`); hoy = `limaTodayYmd()`.
 * - La UI oculta lo que no corresponde y deshabilita con el motivo lo que no se puede hacer ahora; la API vuelve a comprobar
 *   todo (permiso, empresa activa, estado, plazos) y su mensaje es el que manda.
 */
import { HttpErrorResponse } from '@angular/common/http';
import { addDaysYmd, limaTodayYmd, ymdToDisplay } from '@shared/functions/lima-dates';
import { serverMessages } from '@shared/functions/list-helpers';
import { DocumentRow, Option, PERM } from './sunat.models';
import { DocKind, Json, SALE_KINDS, SaleKind, docNumber, isSaleKind, kindFromVista, kindInfo, num, obj, str } from './tenant-views.models';

export type DocAction = 'resend' | 'void' | 'refresh' | 'fix';

/** Lo que necesitan las acciones de un documento. */
export interface ActionTarget {
  tenantId: number;
  /** Razón social (RUC) de la empresa, si se conoce (vistas globales). */
  tenantName?: string;
  kind: DocKind;
  docId: number;
  number: string;
  typeName: string;
  /** `01`, `03`, `07`, `08`, `09`, `31`, `20`, `40`, `04`, `RC`, `RA` o `RR` (vacío si no se sabe). */
  tipo: string;
  /** Estado SUNAT guardado (`pendiente`, `enviado`, `aceptado`, `rechazado`, `anulado`, …). */
  status: string;
  /** Día de emisión `yyyy-MM-dd` (Lima); en resúmenes la fecha de referencia y en bajas la de generación. */
  issueYmd: string;
  /** Cliente, destinatario, proveedor o vendedor. */
  party: string;
  /** Liquidación de compra (detalle, §9.3): `reversion.plazo_hasta` y `reversion.disponible`. */
  reversalUntil?: string;
  reversalAvailable?: boolean | null;
  /** Liquidación de compra: monto pagado (la reversión exige que no tenga pagos). */
  paidAmount?: number | null;
  /** `isActive` de la empresa; `null` = no se sabe (vistas globales): si está suspendida, lo dice la API (403). */
  tenantActive: boolean | null;
}

/** Permisos de la fase D (§11.2). `soporte` tiene reenviar, anular y refrescar; `lectura`, ninguno. */
export interface ActionPerms {
  resend: boolean;
  void: boolean;
  refresh: boolean;
  issue: boolean;
}

export function actionPerms(has: (permission: string) => boolean): ActionPerms {
  return { resend: has(PERM.documentsResend), void: has(PERM.documentsVoid), refresh: has(PERM.documentsRefresh), issue: has(PERM.documentsIssue) };
}

export function anyActionPerm(p: ActionPerms): boolean {
  return p.resend || p.void || p.refresh || p.issue;
}

// ---------------------------------------------------------------- Lectura del documento
/** Estados finales: no se reenvían, no se anulan ni se corrigen. */
export const FINAL_STATES = ['anulado', 'anulacion_en_proceso', 'reversion_en_proceso', 'revertido'];

export const SUSPENDED_MESSAGE = 'La empresa está suspendida: actívala antes de operar sus comprobantes.';

function statusOf(kind: DocKind, d: Json): string {
  switch (kind) {
    case 'retenciones':
    case 'percepciones':
      return str(d['sunat_status']);
    case 'resumenes':
      return str(d['estado_sunat']);
    case 'anulaciones':
      // El detalle trae `estado_sunat` y la fila `sunat_status`: si vienen las dos (fila + detalle), manda el detalle.
      return str(d['estado_sunat'] ?? d['sunat_status']);
    default:
      return str(obj(d['sunat'])['estado']);
  }
}

function tipoOf(kind: DocKind, d: Json): string {
  const sale = SALE_KINDS.find((k) => k.id === kind);
  if (sale) {
    return sale.code;
  }
  switch (kind) {
    case 'guias-remision':
      return str(d['tipo_documento']) || '09';
    case 'retenciones':
      return '20';
    case 'percepciones':
      return '40';
    case 'liquidaciones-compra':
      return '04';
    case 'resumenes':
      return 'RC';
    default:
      return str(d['identifier']).startsWith('RR-') ? 'RR' : 'RA';
  }
}

function issueOf(kind: DocKind, d: Json): string {
  const v = kind === 'resumenes' ? d['fecha_referencia'] : kind === 'anulaciones' ? d['fecha_generacion'] : d['fecha_emision'];
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.substring(0, 10) : '';
}

function partyOf(kind: DocKind, d: Json): string {
  const key = kind === 'guias-remision' ? 'destinatario' : kind === 'retenciones' ? 'proveedor' : kind === 'liquidaciones-compra' ? 'vendedor' : 'cliente';
  const p = obj(d[key]);
  const name = str(p['razon_social'] ?? p['nombre']);
  const doc = str(p['num_doc']);
  return [name, doc].filter(Boolean).join(' · ');
}

/** Documento de una vista de §9 (fila o detalle, snake_case). */
export function targetFromResource(tenantId: number, kind: DocKind, d: Json, tenantActive: boolean | null, tenantName?: string): ActionTarget | null {
  const id = num(d['id'] ?? d['id_resumen'] ?? d['id_anulacion']);
  if (id == null) {
    return null;
  }
  const r = obj(d['reversion']);
  const t: ActionTarget = {
    tenantId, tenantName, kind, docId: id, number: docNumber(d), typeName: kindInfo(kind).singular, tipo: tipoOf(kind, d), status: statusOf(kind, d),
    issueYmd: issueOf(kind, d), party: partyOf(kind, d), tenantActive
  };
  if (kind === 'anulaciones') {
    t.typeName = t.tipo === 'RR' ? 'Reversión' : 'Comunicación de baja';
  }
  if (kind === 'liquidaciones-compra') {
    t.reversalUntil = /^\d{4}-\d{2}-\d{2}$/.test(str(r['plazo_hasta'])) ? str(r['plazo_hasta']) : undefined;
    t.reversalAvailable = typeof r['disponible'] === 'boolean' ? (r['disponible'] as boolean) : null;
    t.paidAmount = num(d['monto_pagado']);
  }
  return t;
}

/** Documento de la fila común de §10.3 (camelCase; trae `tenantId`, `vista`, `id`, `tipo` y el estado). */
export function targetFromRow(row: DocumentRow, tenantActive: boolean | null): ActionTarget | null {
  const kind = kindFromVista(row.vista);
  if (!kind || row.id == null || row.tenantId == null) {
    return null;
  }
  return {
    tenantId: row.tenantId, tenantName: row.razonSocial ? `${row.razonSocial} (${row.ruc})` : undefined, kind, docId: row.id, number: row.numero,
    typeName: row.tipoNombre || kindInfo(kind).singular, tipo: row.tipo, status: row.sunatStatus, issueYmd: /^\d{4}-\d{2}-\d{2}/.test(row.fechaEmision ?? '')
      ? row.fechaEmision.substring(0, 10) : '',
    party: [row.cliente, row.clienteDoc].filter(Boolean).join(' · '), tenantActive
  };
}

// ---------------------------------------------------------------- Anular: mecanismo, plazo y reglas (§11.1-11, §11.8.2)
export type VoidMechanism = 'RA' | 'RC' | 'RR';

/** Días que da `/api/v1` para dar de baja facturas, notas y boletas (se compara como fecha de Lima). */
export const VOID_DAYS = 7;
/** Plazo de reversión de una liquidación que usa la UI si el detalle no trae `reversion.plazo_hasta` (config de la API, 5). */
export const SETTLEMENT_REVERSAL_DAYS = 5;
/** Largo del motivo que va a SUNAT (§11.1-3): 255; en la reversión de una liquidación 3–100. */
export const SUNAT_REASON_MAX = 255;
export const SETTLEMENT_REASON_MIN = 3;
export const SETTLEMENT_REASON_MAX = 100;
/** Motivo de reenviar, refrescar y corregir (queda en la auditoría). */
export const REASON_MAX = 400;

/** `causal` de la reversión de una liquidación de compra (§11.8.2). */
export const SETTLEMENT_CAUSAL_OPTIONS: Option<string>[] = [
  { id: 'vendedor_nombre', name: 'Error en el nombre del vendedor' },
  { id: 'vendedor_documento', name: 'Error en el documento del vendedor' },
  { id: 'producto', name: 'Error en la descripción del producto' }
];

export interface VoidInfo {
  mechanism: VoidMechanism;
  /** Nombre del mecanismo para el usuario. */
  title: string;
  /** Qué hace y qué fecha usa. */
  description: string;
  /** Condiciones de `/api/v1` que hay que cumplir. */
  rules: string[];
  /** Último día para anular (yyyy-MM-dd) o '' si no hay plazo en la API. */
  deadlineYmd: string;
  /** Motivo: largo máximo y mínimo. */
  reasonMax: number;
  reasonMin: number;
  /** Liquidación de compra: pide `causal`. */
  causal: boolean;
  /** Texto del botón y del menú. */
  verb: string;
}

export function voidInfo(t: ActionTarget): VoidInfo | null {
  const issue = t.issueYmd ? ymdToDisplay(t.issueYmd) : 'la fecha de emisión';
  const deadline = t.issueYmd ? addDaysYmd(t.issueYmd, VOID_DAYS) : '';
  const lastDay = deadline ? ` (hasta el ${ymdToDisplay(deadline)})` : '';
  switch (t.kind) {
    case 'facturas':
    case 'notas-credito':
    case 'notas-debito':
      return {
        mechanism: 'RA', title: 'Comunicación de baja (RA)', verb: 'Anular',
        description: `Se crea una comunicación de baja con fecha de generación igual a la emisión del comprobante (${issue}) y se envía a SUNAT. `
          + 'El comprobante queda "Anulación en proceso" hasta que SUNAT responde (refresque la baja o espere a la cola).',
        rules: [
          'El comprobante debe estar aceptado por SUNAT.',
          `Plazo: hasta ${VOID_DAYS} días calendario después de la emisión${lastDay}.`,
          ...(t.kind === 'facturas' ? ['La factura no debe tener una nota de crédito vigente: si la tiene, use la nota en vez de anular.'] : []),
          'No debe existir otra comunicación de baja vigente para el mismo comprobante.',
          ...(t.kind !== 'facturas' ? ['Las notas de crédito y débito, también las de boletas, se dan de baja por comunicación de baja (RA).'] : [])
        ],
        deadlineYmd: deadline, reasonMax: SUNAT_REASON_MAX, reasonMin: 1, causal: false
      };
    case 'boletas':
      return {
        mechanism: 'RC', title: 'Resumen diario de anulación (RC)', verb: 'Anular',
        description: `Las boletas se anulan con un resumen diario de anulación con fecha de resumen igual a la emisión de la boleta (${issue}). `
          + 'La anulación se confirma cuando SUNAT procesa el ticket del resumen (refresque el resumen o espere a la cola).',
        rules: [
          'La boleta debe estar aceptada por SUNAT.',
          `Plazo: hasta ${VOID_DAYS} días calendario después de la emisión${lastDay}.`,
          'La boleta no debe tener una nota de crédito asociada.'
        ],
        deadlineYmd: deadline, reasonMax: SUNAT_REASON_MAX, reasonMin: 1, causal: false
      };
    case 'retenciones':
    case 'percepciones':
      return {
        mechanism: 'RR', title: 'Reversión (RR)', verb: 'Revertir',
        description: `Se crea una reversión con la fecha de emisión del comprobante (${issue}) y se envía a SUNAT.`,
        rules: [`La ${t.kind === 'retenciones' ? 'retención' : 'percepción'} debe estar aceptada por SUNAT.`, 'No debe tener otra reversión vigente.'],
        deadlineYmd: '', reasonMax: SUNAT_REASON_MAX, reasonMin: 1, causal: false
      };
    case 'liquidaciones-compra': {
      const until = t.reversalUntil || (t.issueYmd ? addDaysYmd(t.issueYmd, SETTLEMENT_REVERSAL_DAYS) : '');
      return {
        mechanism: 'RR', title: 'Reversión de la liquidación de compra (RR)', verb: 'Revertir',
        description: 'Se crea una reversión con la causal elegida y se envía a SUNAT. La liquidación queda "Reversión en proceso" hasta la respuesta.',
        rules: [
          'La liquidación debe estar aceptada por SUNAT.',
          `Plazo: hasta el ${SETTLEMENT_REVERSAL_DAYS}.º día calendario siguiente a la emisión${until ? ` (hasta el ${ymdToDisplay(until)})` : ''}.`,
          'No debe tener pagos registrados.',
          `Motivo de ${SETTLEMENT_REASON_MIN} a ${SETTLEMENT_REASON_MAX} caracteres.`
        ],
        deadlineYmd: until, reasonMax: SETTLEMENT_REASON_MAX, reasonMin: SETTLEMENT_REASON_MIN, causal: true
      };
    }
    default:
      return null;
  }
}

/** Por qué no se puede anular ahora ('' si se puede; la API lo vuelve a comprobar). */
export function voidBlockReason(t: ActionTarget): string {
  const info = voidInfo(t);
  if (!info) {
    return 'Este tipo de documento no se anula desde aquí.';
  }
  if (t.tenantActive === false) {
    return SUSPENDED_MESSAGE;
  }
  if (t.status !== 'aceptado') {
    return `Solo se anula un documento aceptado por SUNAT (estado actual: ${t.status || 'sin estado'}).`;
  }
  if (t.kind === 'liquidaciones-compra') {
    if ((t.paidAmount ?? 0) > 0) {
      return 'La liquidación tiene pagos registrados: la API no permite revertirla.';
    }
    if (t.reversalAvailable === false) {
      return `El plazo de reversión venció${t.reversalUntil ? ` (era hasta el ${ymdToDisplay(t.reversalUntil)})` : ''}.`;
    }
  }
  if (info.deadlineYmd && limaTodayYmd() > info.deadlineYmd) {
    const alt = t.kind === 'facturas' || t.kind === 'boletas' ? ' Corresponde emitir una nota de crédito.' : '';
    return `Venció el plazo para ${info.verb.toLowerCase()} (era hasta el ${ymdToDisplay(info.deadlineYmd)}).${alt}`;
  }
  return '';
}

// ---------------------------------------------------------------- Qué acciones tiene un documento
export interface ActionState {
  id: DocAction;
  label: string;
  /** Ícono de Material (menú de app-list-table). */
  icon: string;
  /** Ícono feather (botones del detalle). */
  feather: string;
  enabled: boolean;
  /** Por qué está deshabilitada. */
  reason: string;
  /** El motivo en pocas palabras (menú de la fila). */
  short: string;
  danger?: boolean;
}

function shortReason(reason: string): string {
  if (!reason) {
    return '';
  }
  if (reason === SUSPENDED_MESSAGE) {
    return 'empresa suspendida';
  }
  if (reason.includes('pagos')) {
    return 'tiene pagos';
  }
  return reason.includes('plazo') ? 'plazo vencido' : 'no disponible';
}

/** Comprobantes que se corrigen con `PUT` (§11.8.4): facturas, boletas, notas y guías. */
export function isFixableKind(kind: DocKind): kind is SaleKind | 'guias-remision' {
  return isSaleKind(kind) || kind === 'guias-remision';
}

/**
 * Acciones visibles del documento (las que no corresponden no se devuelven). Reglas de §11.8:
 * - Reenviar: cualquier tipo, si no está aceptado ni anulado / revertido (ni en proceso).
 * - Refrescar: comprobantes y guías pendientes o enviados; resúmenes y bajas / reversiones enviados.
 * - Anular / revertir: facturas, boletas, notas, retenciones, percepciones y liquidaciones aceptadas (deshabilitado si
 *   venció el plazo o tiene pagos).
 * - Corregir y reenviar (§12.1): facturas, boletas y notas no aceptadas, observadas, enviadas (esperan a SUNAT: refrescar
 *   primero) ni anuladas / en anulación; guías pendientes o rechazadas.
 * Con la empresa suspendida (si se sabe) quedan deshabilitadas con el aviso.
 */
export function docActions(t: ActionTarget | null, p: ActionPerms): ActionState[] {
  if (!t) {
    return [];
  }
  const s = t.status;
  const finalOrAccepted = s === 'aceptado' || FINAL_STATES.includes(s);
  const suspended = t.tenantActive === false ? SUSPENDED_MESSAGE : '';
  const short = shortReason(suspended);
  const out: ActionState[] = [];
  // "enviado" espera la respuesta de SUNAT: editarlo podría dejar datos distintos a los que SUNAT acepte (primero refrescar).
  const fixable = isSaleKind(t.kind)
    ? !finalOrAccepted && s !== 'observado' && s !== 'enviado'
    : t.kind === 'guias-remision' && (s === 'rechazado' || s === 'pendiente');
  if (p.issue && isFixableKind(t.kind) && fixable) {
    out.push({ id: 'fix', label: 'Corregir y reenviar', icon: 'edit_note', feather: 'icon-edit', enabled: !suspended, reason: suspended, short });
  }
  if (p.resend && !finalOrAccepted) {
    out.push({ id: 'resend', label: 'Reenviar a SUNAT', icon: 'send', feather: 'icon-send', enabled: !suspended, reason: suspended, short });
  }
  const refreshable = (isSaleKind(t.kind) || t.kind === 'guias-remision') ? (s === 'pendiente' || s === 'enviado')
    : (t.kind === 'resumenes' || t.kind === 'anulaciones') ? s === 'enviado' : false;
  if (p.refresh && refreshable) {
    out.push({ id: 'refresh', label: 'Refrescar estado (SUNAT)', icon: 'sync', feather: 'icon-refresh-cw', enabled: !suspended, reason: suspended, short });
  }
  const info = voidInfo(t);
  if (p.void && info && s === 'aceptado') {
    const reason = voidBlockReason(t);
    out.push({
      id: 'void', label: info.mechanism === 'RR' ? 'Revertir (RR)' : `Anular (${info.mechanism})`, icon: 'block', feather: 'icon-slash',
      enabled: !reason, reason, short: shortReason(reason), danger: true
    });
  }
  return out;
}

// ---------------------------------------------------------------- Mensajes
/** Texto de un error HTTP de una acción (403 permiso o empresa suspendida, 404, 409, 429, 503, 500 con referencia). */
export function actionHttpError(err: unknown, fallback: string): string {
  const e = err as HttpErrorResponse;
  const msg = serverMessages(e?.error, '');
  switch (e?.status) {
    case 0:
      return 'No se pudo conectar con la API. Revise la conexión e intente de nuevo.';
    case 403:
      return msg || 'No tiene permiso para esta acción, o la empresa está suspendida.';
    case 404:
      return msg || 'El documento ya no existe o no es de esta empresa.';
    case 409:
      return msg || 'Hay otra operación en curso sobre este documento. Espere su respuesta e intente de nuevo.';
    case 429:
      return msg || 'Se alcanzó el límite de acciones por minuto. Intente de nuevo en un momento.';
    case 503:
      return msg || 'No se pudo verificar el límite de solicitudes de la empresa. Intente de nuevo.';
    default:
      return msg || fallback;
  }
}

/** Mensaje de éxito: los `messages` del sobre más lo útil de `data` (la baja creada, el siguiente paso de una guía). */
export function actionSuccessText(action: DocAction, resp: { messages?: unknown; data?: unknown }, fallback: string): string {
  const base = serverMessages(resp as { messages?: string[] }, fallback);
  const d = obj(resp?.data);
  const extra: string[] = [];
  if (action === 'void') {
    const id = str(d['identifier']);
    if (id) {
      extra.push(`Se creó ${id} (${str(d['estado_sunat'] ?? d['sunat_status']) || 'enviado'}).`);
    }
  }
  if (action === 'refresh' && str(d['siguiente_accion'])) {
    extra.push(str(d['siguiente_accion']));
  }
  return [base, ...extra].filter(Boolean).join(' ');
}
