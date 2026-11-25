/**
 * Consultas en vivo a SUNAT (§10.5): opciones de los formularios y armado del resultado. `data` es el recurso de `/api/v1`
 * tal cual (snake_case). Nada se guarda: cada consulta va a SUNAT con las credenciales guardadas de la empresa y queda en
 * la auditoría (`admin.empresa.consulta_sunat`).
 */
import { Option } from '../../models/sunat.models';
import { Json, ViewBlock, cpeTypeName, filled, has, item, str } from '../../models/tenant-views.models';

/** `tipo_doc` de `consultar-cpe`. */
export const CPE_TYPE_OPTIONS: Option<string>[] = [
  { id: '01', name: 'Factura (01)' },
  { id: '03', name: 'Boleta (03)' },
  { id: '04', name: 'Liquidación de compra (04)' },
  { id: '07', name: 'Nota de crédito (07)' },
  { id: '08', name: 'Nota de débito (08)' },
  { id: 'R1', name: 'Recibo por honorarios (R1)' },
  { id: 'R7', name: 'Nota de crédito de recibo por honorarios (R7)' }
];

/** `tipo_documento` de `consultar-cdr`. */
export const CDR_TYPE_OPTIONS: Option<string>[] = CPE_TYPE_OPTIONS.filter((o) => ['01', '03', '07', '08'].includes(o.id));

/** Datos de un documento para prellenar las consultas (desde su detalle). `fechaYmd` = yyyy-MM-dd. */
export interface LiveQueryPreset {
  tipo: string;
  serie: string;
  correlativo: string;
  fechaYmd: string;
  monto: number | null;
}

/** `estado_cp` de la Consulta Integrada: 0 no existe, 1 aceptado, 2 anulado, 3 autorizado, 4 no autorizado. */
const CPE_STATE_BADGE: Record<string, string> = {
  '0': 'badge-light-danger',
  '1': 'badge-light-success',
  '2': 'badge-light-secondary',
  '3': 'badge-light-info',
  '4': 'badge-light-danger'
};

const CPE_STATE_NAME: Record<string, string> = { '0': 'No existe', '1': 'Aceptado', '2': 'Anulado', '3': 'Autorizado', '4': 'No autorizado' };

function texts(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => (v != null && typeof v === 'object' ? Object.values(v as Json).map(str).filter(Boolean).join(' – ') : str(v))).filter(Boolean);
  }
  return has(value) ? [str(value)] : [];
}

/** Resultado de `consultar-cpe`. */
export function cpeResultBlock(d: Json): ViewBlock {
  const consulta = {
    title: 'Consulta', icon: 'icon-search', items: filled([
      item('Tipo', cpeTypeName(d['tipo_doc'])), item('Número', [str(d['serie']), str(d['correlativo'])].filter(Boolean).join('-')),
      item('RUC del emisor', d['ruc_emisor']), item('Consultado con el RUC', d['consultado_por_ruc'])
    ])
  };
  if (d['encontrado'] !== true) {
    return {
      stats: [{ label: 'Resultado', value: 'No encontrado', tone: 'danger' }],
      groups: [consulta],
      notes: texts(d['mensaje']).length ? texts(d['mensaje']) : ['SUNAT no encontró el comprobante con esos datos.']
    };
  }
  const state = str(d['estado_cp']);
  return {
    groups: [
      { title: 'Comprobante en SUNAT', icon: 'icon-file-text', items: filled([
        item('Estado', str(d['estado_cp_descripcion']) || CPE_STATE_NAME[state] || state, CPE_STATE_BADGE[state] ?? 'badge-light-secondary'),
        item('Código de estado', state)
      ]) },
      { title: 'Contribuyente emisor', icon: 'icon-briefcase', items: filled([
        item('Estado del RUC', [str(d['estado_ruc_descripcion']), has(d['estado_ruc']) ? `(${str(d['estado_ruc'])})` : ''].filter(Boolean).join(' ')),
        item('Condición de domicilio', [str(d['cond_domi_ruc_descripcion']), has(d['cond_domi_ruc']) ? `(${str(d['cond_domi_ruc'])})` : ''].filter(Boolean).join(' '))
      ]) },
      consulta
    ],
    notes: texts(d['observaciones']).map((o) => `Observación: ${o}`)
  };
}

/** Resultado de `consultar-cdr` (sin el CDR en base64: se descarga aparte). */
export function cdrResultBlock(d: Json): ViewBlock {
  if (d['success'] !== true) {
    return {
      stats: [{ label: 'Resultado', value: 'Error de SUNAT', tone: 'danger' }],
      groups: [{ title: 'Respuesta', icon: 'icon-alert-octagon', items: filled([item('Código', d['error_code']), item('Mensaje', d['error_message'])]) }]
    };
  }
  const accepted = d['accepted'] === true;
  return {
    groups: [{ title: 'Constancia de recepción (CDR)', icon: 'icon-check-square', items: filled([
      item('Aceptado', accepted ? 'Sí' : 'No', accepted ? 'badge-light-success' : 'badge-light-danger'), item('Código', d['code']),
      item('Descripción', d['description']), item('CDR', has(d['cdr_zip']) ? 'Disponible para descargar' : 'SUNAT no devolvió el CDR')
    ]) }],
    notes: texts(d['notes']).map((n) => `Nota: ${n}`)
  };
}
