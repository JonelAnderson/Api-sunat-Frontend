/**
 * Armado de lo que se muestra de la fila común y del resumen de documentos (§10.3): columnas de app-list-table y bloque de
 * contadores para `app-view-block`. JSON en camelCase.
 */
import { TableColumns } from '@shared/models/list-table.interface';
import { col } from '@shared/functions/list-helpers';
import { DOC_STATUS_OPTIONS, DOC_TYPE_OPTIONS, DocumentRow, DocumentSummary } from '../../models/sunat.models';
import { ViewBlock, ViewRow, c, qty, sunatBadge, table, withBars } from '../../models/tenant-views.models';

type Col = TableColumns<DocumentRow>;

/** Columnas del listado (sin la de acciones). Sin empresa fija se agrega la columna de la empresa; en el feed, el envío. */
export function documentColumns(withTenant: boolean, withSent: boolean): Col[] {
  const cols: Col[] = [];
  if (withTenant) {
    cols.push({ ...col<DocumentRow>('EMPRESA', 'razonSocial'), subProperty: 'ruc' });
  }
  cols.push(
    { ...col<DocumentRow>('TIPO', 'tipoNombre'), subProperty: 'tipo' },
    { ...col<DocumentRow>('NÚMERO', 'numero'), subProperty: 'fechaText' },
    { ...col<DocumentRow>('CLIENTE / TERCERO', 'cliente'), subProperty: 'clienteDoc' },
    col('IMPORTE', 'totalText'),
    { ...col<DocumentRow>('SUNAT', 'statusText', 'badge'), tooltip: 'sunatText' }
  );
  if (withSent) {
    cols.push(col('ENVIADO', 'sentText'));
  }
  return cols;
}

/** Contadores del resumen: tarjetas por estado y tabla por tipo (solo los tipos con documentos). */
export function summaryBlock(s: DocumentSummary): ViewBlock {
  const e = s.porEstado ?? {};
  const count = (k: string) => e[k] ?? 0;
  const tone = (n: number, t: 'warning' | 'danger') => (n > 0 ? t : 'muted');
  const pending = count('pendiente') + count('enviado');
  const voided = count('anulado') + count('anulacion_en_proceso') + count('reversion_en_proceso') + count('revertido');
  const types = DOC_TYPE_OPTIONS.map((o) => ({ ...o, total: s.porTipo?.[o.id] ?? 0 })).filter((o) => o.total > 0);
  const typeRows: ViewRow[] = types.map((o) => ({ cells: { tipo: `${o.name} (${o.id})`, total: qty(o.total) } }));
  const states = DOC_STATUS_OPTIONS.filter((o) => o.id !== 'observado').map((o) => ({ ...o, total: count(o.id) }));
  const stateRows: ViewRow[] = states.map((o) => ({ cells: { estado: o.name, total: qty(o.total) }, badges: { estado: sunatBadge(o.id) } }));
  return {
    stats: [
      { label: 'Documentos', value: qty(s.total), tone: 'primary' },
      { label: 'Aceptados', value: qty(count('aceptado')), hint: `${qty(s.observados ?? 0)} con observaciones`, tone: 'success' },
      { label: 'Rechazados', value: qty(count('rechazado')), tone: tone(count('rechazado'), 'danger') },
      { label: 'Pendientes / enviados', value: qty(pending), hint: 'Sin respuesta de SUNAT', tone: tone(pending, 'warning') },
      { label: 'Anulados / revertidos', value: qty(voided), hint: 'Incluye los que están en proceso', tone: 'muted' }
    ],
    tables: [
      table([c('tipo', 'Tipo'), c('total', 'Documentos', 'end')], withBars(typeRows, 'total', types.map((t) => t.total)), 'Por tipo',
        'Sin documentos con estos filtros.', 'icon-layers'),
      table([c('estado', 'Estado SUNAT', undefined, true), c('total', 'Documentos', 'end')], withBars(stateRows, 'total', states.map((t) => t.total)),
        'Por estado', 'Sin documentos con estos filtros.', 'icon-send')
    ]
  };
}
