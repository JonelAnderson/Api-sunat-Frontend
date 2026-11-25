/**
 * Tipos que se emiten desde el panel (§11.7) y el contexto que comparten sus formularios (empresa, series activas, tasa del
 * IGV). Funciones puras.
 */
import { Option } from '../../models/sunat.models';
import { DocKind, Json, arr, num, obj, str } from '../../models/tenant-views.models';
import type { IssueKind } from '../../services/emission.service';

export interface EmitType {
  /** Segmento de la ruta del panel `/private/sunat/tenants/:id/emitir/:tipo` y de `POST tenants/{id}/…`. */
  id: IssueKind;
  name: string;
  /** "Emitir …" */
  verb: string;
  icon: string;
  /** `tipo_documento` de la serie (`GET series`); vacío si no usa serie (resúmenes). */
  seriesType: string;
  /** Vista de §9 donde queda el documento (detalle y descargas). */
  view: DocKind;
  group: 'venta' | 'otros';
}

export const EMIT_TYPES: EmitType[] = [
  { id: 'facturas', name: 'Factura', verb: 'Emitir factura', icon: 'icon-file-text', seriesType: '01', view: 'facturas', group: 'venta' },
  { id: 'boletas', name: 'Boleta de venta', verb: 'Emitir boleta', icon: 'icon-file', seriesType: '03', view: 'boletas', group: 'venta' },
  { id: 'notas-credito', name: 'Nota de crédito', verb: 'Emitir nota de crédito', icon: 'icon-corner-up-left', seriesType: '07', view: 'notas-credito', group: 'venta' },
  { id: 'notas-debito', name: 'Nota de débito', verb: 'Emitir nota de débito', icon: 'icon-corner-up-right', seriesType: '08', view: 'notas-debito', group: 'venta' },
  { id: 'guias-remision', name: 'Guía de remisión remitente (09)', verb: 'Emitir guía remitente', icon: 'icon-truck', seriesType: '09', view: 'guias-remision', group: 'otros' },
  { id: 'guias-remision-transportista', name: 'Guía de remisión transportista (31)', verb: 'Emitir guía transportista', icon: 'icon-truck', seriesType: '31', view: 'guias-remision', group: 'otros' },
  { id: 'retenciones', name: 'Comprobante de retención', verb: 'Emitir retención', icon: 'icon-minus-circle', seriesType: '20', view: 'retenciones', group: 'otros' },
  { id: 'percepciones', name: 'Comprobante de percepción', verb: 'Emitir percepción', icon: 'icon-plus-circle', seriesType: '40', view: 'percepciones', group: 'otros' },
  { id: 'liquidaciones-compra', name: 'Liquidación de compra', verb: 'Emitir liquidación de compra', icon: 'icon-shopping-bag', seriesType: '04', view: 'liquidaciones-compra', group: 'otros' },
  { id: 'resumenes', name: 'Resumen diario de boletas', verb: 'Enviar resumen diario', icon: 'icon-layers', seriesType: '', view: 'resumenes', group: 'otros' }
];

export function emitType(id: unknown): EmitType | null {
  return EMIT_TYPES.find((t) => t.id === id) ?? null;
}

/** Serie activa de la empresa (de `GET tenants/{id}/series`, §9.5). */
export interface SeriesOption {
  serie: string;
  tipo: string;
  next: string;
  branch: string;
}

/** Lo que reciben todos los formularios de emisión. */
export interface EmissionContext {
  tenantId: number;
  /** Razón social (RUC). */
  tenantName: string;
  ruc: string;
  active: boolean;
  environment: string;
  /** Tasa del IGV vigente de la empresa (`GET empresa` → `tasa_igv_vigente`, en %; 18 si no llega). */
  igvRatePct: number;
  /** `tax_regime`: con `rus` (NRUS) solo hay boletas y notas sobre boletas. */
  taxRegime: string;
  series: SeriesOption[];
  /** Domicilio fiscal (GET empresa): sugerencia del punto de partida de una guía. */
  companyAddress: string;
  companyUbigeo: string;
}

/** Series activas de la lista de §9.5. */
export function seriesFromResource(list: unknown): SeriesOption[] {
  return arr(list)
    .filter((s) => s['activo'] !== false)
    .map((s) => ({
      serie: str(s['serie']), tipo: str(s['tipo_documento']), next: str(s['siguiente_numero']), branch: str(obj(s['sucursal'])['nombre'])
    }))
    .filter((s) => s.serie);
}

/** Series del tipo (y, en notas, con la letra del comprobante que modifican: F para facturas, B para boletas). */
export function seriesOptions(ctx: EmissionContext, tipo: string, letter = ''): Option<string>[] {
  return ctx.series
    .filter((s) => s.tipo === tipo && (!letter || s.serie.startsWith(letter)))
    .map((s) => ({ id: s.serie, name: [s.serie, s.next ? `siguiente ${s.next}` : '', s.branch].filter(Boolean).join(' · ') }));
}

/** Tasa del IGV del recurso `GET empresa` (en %). */
export function igvRateFromCompany(company: Json): number {
  const rate = num(company['tasa_igv_vigente']);
  return rate != null && rate >= 0 && rate <= 30 ? rate : 18;
}
