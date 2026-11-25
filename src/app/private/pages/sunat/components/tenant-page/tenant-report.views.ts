/** Reportes de la empresa (§9.5), siempre JSON: registro de ventas, ventas consolidado, por cliente y retenciones. */
import {
  Json, ViewBlock, ViewCol, ViewRow, arr, c, cpeTypeName, dayText, filled, identityTypeName, item, money, num, obj, paymentBadge,
  paymentStatusName, percent, qty, str, sunatBadge, sunatStatusName, table, withBars
} from '../../models/tenant-views.models';

export type ReportKind = 'registro-ventas' | 'ventas-consolidado' | 'por-cliente' | 'retenciones';

export const REPORTS: { id: ReportKind; name: string; icon: string }[] = [
  { id: 'registro-ventas', name: 'Registro de ventas', icon: 'icon-book' },
  { id: 'ventas-consolidado', name: 'Ventas consolidado', icon: 'icon-layers' },
  { id: 'por-cliente', name: 'Estado de cuenta por cliente', icon: 'icon-user' },
  { id: 'retenciones', name: 'Retenciones de liquidaciones de compra', icon: 'icon-minus-circle' }
];

const AMOUNT_COLS: [string, string][] = [
  ['mto_oper_gravadas', 'Gravadas'], ['mto_oper_exoneradas', 'Exoneradas'], ['mto_oper_inafectas', 'Inafectas'], ['mto_oper_gratuitas', 'Gratuitas'],
  ['mto_igv', 'IGV'], ['mto_isc', 'ISC'], ['mto_icbper', 'ICBPER']
];

function filtersGroup(d: Json) {
  const period = obj(d['periodo']);
  return {
    title: str(d['titulo']) || 'Reporte', icon: 'icon-filter', items: filled([
      item('Periodo', [dayText(period['desde']), dayText(period['hasta'])].filter(Boolean).join(' al ')),
      ...arr(d['filtros']).map((f) => item(str(f['filtro']), f['valor']))
    ])
  };
}

function amounts(o: Json): Record<string, string> {
  return Object.fromEntries(AMOUNT_COLS.map(([k]) => [k, money(o[k])]));
}

function salesRegister(d: Json): ViewBlock {
  const amountCols: ViewCol[] = AMOUNT_COLS.map(([k, l]) => c(k, l, 'end'));
  const byType = obj(d['totales_por_tipo']);
  const grand = obj(d['gran_total']);
  return {
    stats: [
      { label: 'Documentos', value: qty(d['total_documentos']) },
      { label: 'Venta neta', value: money(d['venta_neta']) },
      { label: 'Importe total', value: money(grand['mto_imp_venta']) },
      { label: 'IGV', value: money(grand['mto_igv']) }
    ],
    groups: [filtersGroup(d)],
    tables: [
      { ...table([c('tipo', 'Tipo'), c('cantidad', 'Cantidad', 'end'), ...amountCols, c('total', 'Total', 'end')],
        Object.entries(byType).map(([k, v]) => {
          const o = obj(v);
          return { cells: { tipo: cpeTypeName(k), cantidad: qty(o['cantidad']), ...amounts(o), total: money(o['mto_imp_venta']) } };
        }), 'Totales por tipo', 'Sin totales.', 'icon-grid'),
        total: { cells: { tipo: 'Gran total', cantidad: qty(grand['cantidad']), ...amounts(grand), total: money(grand['mto_imp_venta']) } } },
      table([c('fecha', 'Emisión'), c('vence', 'Vence'), c('tipo', 'Tipo'), c('numero', 'Número'), c('cliente', 'Cliente'), ...amountCols,
        c('otros', 'Otros tributos', 'end'), c('total', 'Total', 'end'), c('moneda', 'Moneda'), c('estado', 'SUNAT', undefined, true)],
        arr(d['documentos']).map((x) => ({
          cells: { fecha: dayText(x['fecha_emision']), vence: dayText(x['fecha_vencimiento']), tipo: str(x['tipo_doc_nombre']) || cpeTypeName(x['tipo_doc']),
            numero: str(x['numero_completo']), cliente: [str(x['client_razon_social']), `${identityTypeName(x['client_tipo_doc'])} ${str(x['client_num_doc'])}`.trim()]
              .filter(Boolean).join(' · '), ...amounts(x), otros: money(x['otros_tributos']), total: money(x['mto_imp_venta']), moneda: str(x['tipo_moneda']),
            estado: sunatStatusName(x['estado_sunat']) },
          badges: { estado: sunatBadge(x['estado_sunat']) }
        })), 'Documentos', 'Sin documentos con estos filtros.', 'icon-list')
    ]
  };
}

function consolidated(d: Json): ViewBlock {
  const k = obj(d['kpis']);
  const clients = arr(d['top_clientes']);
  const products = arr(d['top_productos']);
  return {
    stats: [
      { label: 'Total facturado', value: money(k['total_facturado']) }, { label: 'IGV', value: money(k['total_igv']) },
      { label: 'Documentos emitidos', value: qty(k['docs_emitidos']) }, { label: 'Ticket promedio', value: money(k['ticket_promedio']) },
      { label: 'Notas de crédito', value: qty(k['nc_emitidas']) }, { label: 'Notas de débito', value: qty(k['nd_emitidas']) },
      { label: 'Venta neta', value: money(k['venta_neta']) },
      { label: 'Total cobrado', value: money(k['total_cobrado']), hint: `${percent(k['porcentaje_cobrado'])} cobrado`, tone: 'success' }
    ],
    groups: [filtersGroup(d)],
    tables: [
      table([c('periodo', 'Periodo'), c('f', 'Facturas', 'end'), c('fm', 'Monto', 'end'), c('b', 'Boletas', 'end'), c('bm', 'Monto', 'end'), c('nc', 'NC', 'end'),
        c('ncm', 'Monto NC', 'end'), c('nd', 'ND', 'end'), c('ndm', 'Monto ND', 'end'), c('neto', 'Neto', 'end'), c('igv', 'IGV', 'end')],
        arr(d['desglose_temporal']).map((x) => ({ cells: {
          periodo: dayText(x['periodo']), f: qty(x['facturas']), fm: money(x['facturas_monto']), b: qty(x['boletas']), bm: money(x['boletas_monto']),
          nc: qty(x['nc']), ncm: money(x['nc_monto']), nd: qty(x['nd']), ndm: money(x['nd_monto']), neto: money(x['neto']), igv: money(x['igv'])
        } })), 'Desglose por periodo', 'Sin datos.', 'icon-calendar'),
      table([c('tipo', 'Tipo'), c('cantidad', 'Cantidad', 'end'), c('monto', 'Monto', 'end')],
        arr(d['desglose_por_tipo']).map((x) => ({ cells: { tipo: str(x['nombre']) || cpeTypeName(x['tipo']), cantidad: qty(x['cantidad']), monto: money(x['monto']) } })),
        'Por tipo de comprobante', 'Sin datos.', 'icon-grid'),
      table([c('sucursal', 'Sucursal'), c('f', 'Facturas', 'end'), c('b', 'Boletas', 'end'), c('nc', 'NC', 'end'), c('nd', 'ND', 'end'), c('monto', 'Monto', 'end')],
        arr(d['desglose_por_sucursal']).map((x) => ({ cells: { sucursal: `${str(x['sucursal'])} (${str(x['cod_local'])})`, f: qty(x['facturas']), b: qty(x['boletas']),
          nc: qty(x['nc']), nd: qty(x['nd']), monto: money(x['monto']) } })), 'Por sucursal', 'Sin datos.', 'icon-map-pin'),
      table([c('cliente', 'Cliente'), c('doc', 'Documento'), c('docs', 'Comprobantes', 'end'), c('monto', 'Monto bruto', 'end')],
        withBars(clients.map((x) => ({ cells: { cliente: str(x['razon_social']), doc: str(x['num_doc']), docs: qty(x['cantidad_docs']), monto: money(x['monto_bruto']) } })),
          'monto', clients.map((x) => num(x['monto_bruto']))), 'Principales clientes', 'Sin datos.', 'icon-users'),
      table([c('descripcion', 'Producto'), c('cantidad', 'Cantidad', 'end'), c('monto', 'Monto', 'end')],
        withBars(products.map((x) => ({ cells: { descripcion: str(x['descripcion']), cantidad: qty(x['cantidad']), monto: money(x['monto']) } })),
          'monto', products.map((x) => num(x['monto']))), 'Principales productos', 'Sin datos.', 'icon-package'),
      table([c('moneda', 'Moneda'), c('cantidad', 'Cantidad', 'end'), c('monto', 'Monto', 'end')],
        arr(d['desglose_por_moneda']).map((x) => ({ cells: { moneda: str(x['moneda']), cantidad: qty(x['cantidad']), monto: money(x['monto']) } })),
        'Por moneda', 'Sin datos.', 'icon-globe')
    ]
  };
}

function byClient(d: Json): ViewBlock {
  const cl = obj(d['cliente']);
  const r = obj(d['resumen']);
  const aging = obj(d['aging']);
  return {
    stats: [
      { label: 'Total facturado', value: money(r['total_facturado']) }, { label: 'Notas de crédito', value: money(r['nc_emitidas']) },
      { label: 'Notas de débito', value: money(r['nd_emitidas']) }, { label: 'Neto', value: money(r['neto']) },
      { label: 'Cobrado', value: money(r['cobrado']), tone: 'success' },
      { label: 'Pendiente', value: money(r['pendiente']), tone: (num(r['pendiente']) ?? 0) > 0 ? 'warning' : 'muted' }
    ],
    groups: [
      filtersGroup(d),
      { title: 'Cliente', icon: 'icon-user', items: filled([
        item('Documento', `${identityTypeName(cl['tipo_documento'])} ${str(cl['numero_documento'])}`.trim()), item('Razón social', cl['razon_social']),
        item('Nombre comercial', cl['nombre_comercial']), item('Dirección', cl['direccion']), item('Correo', cl['email']), item('Teléfono', cl['telefono'])
      ]) },
      { title: 'Antigüedad del saldo (días)', icon: 'icon-clock', items: Object.entries(aging).map(([k, v]) => item(k, money(v))) }
    ],
    tables: [
      table([c('fecha', 'Emisión'), c('vence', 'Vence'), c('tipo', 'Tipo'), c('numero', 'Número'), c('total', 'Importe', 'end'), c('moneda', 'Moneda'),
        c('sunat', 'SUNAT', undefined, true), c('pago', 'Pago', undefined, true), c('pagado', 'Pagado', 'end')],
        arr(d['detalle_documentos']).map((x): ViewRow => ({
          cells: { fecha: dayText(x['fecha_emision']), vence: dayText(x['fecha_vencimiento']), tipo: str(x['tipo_nombre']) || cpeTypeName(x['tipo']),
            numero: str(x['numero_completo']), total: money(x['mto_imp_venta']), moneda: str(x['tipo_moneda']), sunat: sunatStatusName(x['estado_sunat']),
            pago: paymentStatusName(x['estado_pago']), pagado: money(x['monto_pagado']) },
          badges: { sunat: sunatBadge(x['estado_sunat']), pago: paymentBadge(x['estado_pago']) }
        })), 'Documentos', 'Sin documentos en el periodo.', 'icon-list'),
      table([c('fecha', 'Fecha'), c('metodo', 'Método'), c('monto', 'Monto', 'end'), c('referencia', 'Referencia'), c('notas', 'Notas')],
        arr(d['historial_pagos']).map((x) => ({ cells: { fecha: dayText(x['fecha']), metodo: str(x['metodo']), monto: money(x['monto']), referencia: str(x['referencia']),
          notas: str(x['notas']) } })), 'Pagos', 'Sin pagos en el periodo.', 'icon-credit-card')
    ]
  };
}

function withholdings(d: Json): ViewBlock {
  const t = obj(d['totales']);
  return {
    stats: [
      { label: 'Liquidaciones', value: qty(t['cantidad']) }, { label: 'Base imponible IGV', value: money(t['base_imponible_igv']) },
      { label: 'IGV retenido', value: money(t['igv_retenido']), tone: 'warning' }, { label: 'Base renta', value: money(t['base_renta']) },
      { label: 'Renta retenida', value: money(t['renta_retenida']), tone: 'warning' }, { label: 'Neto pagado a vendedores', value: money(t['neto_pagado_vendedor']) }
    ],
    tables: [table(
      [c('numero', 'Número'), c('fecha', 'Emisión'), c('vendedor', 'Vendedor'), c('base_igv', 'Base IGV', 'end'), c('igv', 'IGV retenido', 'end'),
        c('base_renta', 'Base renta', 'end'), c('pct', '% renta', 'end'), c('renta', 'Renta retenida', 'end'), c('neto', 'Neto pagado', 'end'),
        c('sunat', 'SUNAT', undefined, true), c('pago', 'Pago', undefined, true)],
      arr(d['liquidaciones']).map((x): ViewRow => {
        const v = obj(x['vendedor']);
        return {
          cells: { numero: str(x['numero']), fecha: dayText(x['fecha_emision']),
            vendedor: [str(v['nombre']), `${identityTypeName(v['tipo_doc'])} ${str(v['num_doc'])}`.trim()].filter(Boolean).join(' · '),
            base_igv: money(x['base_imponible_igv']), igv: money(x['igv_retenido']), base_renta: money(x['base_renta']), pct: percent(x['porcentaje_renta']),
            renta: money(x['renta_retenida']), neto: money(x['neto_pagado_vendedor']), sunat: sunatStatusName(x['estado_sunat']),
            pago: paymentStatusName(x['estado_pago']) },
          badges: { sunat: sunatBadge(x['estado_sunat']), pago: paymentBadge(x['estado_pago']) }
        };
      }), `Liquidaciones de compra del periodo ${str(d['periodo'])}`, 'Sin liquidaciones en el periodo.', 'icon-list')],
    notes: str(d['nota']) ? [str(d['nota'])] : []
  };
}

export function buildReport(kind: ReportKind, d: Json): ViewBlock {
  switch (kind) {
    case 'registro-ventas':
      return salesRegister(d);
    case 'ventas-consolidado':
      return consolidated(d);
    case 'por-cliente':
      return byClient(d);
    case 'retenciones':
      return withholdings(d);
  }
}
