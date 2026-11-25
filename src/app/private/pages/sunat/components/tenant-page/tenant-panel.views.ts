/**
 * Panel de la empresa (§9.4): lo que muestra cada sección de `GET panel/…` (mismos datos de `GET /api/v1/panel`). Los
 * montos se muestran sin moneda porque el panel suma todas (la sección "Por moneda" las separa).
 */
import {
  Json, ViewBlock, ViewRow, arr, c, dayText, filled, has, identityTypeName, item, money, num, obj, percent, qty, saleKindFromPanel, str,
  sunatBadge, sunatStatusName, table, withBars
} from '../../models/tenant-views.models';

export interface PanelSection {
  key: string;
  title: string;
  icon: string;
  path: string;
  /** Usa el periodo (`mes` o `desde` + `hasta`). */
  period: boolean;
  build: (data: Json) => ViewBlock;
}

const INDICATOR_ROWS: [string, string][] = [
  ['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', 'Semana'], ['mes_actual', 'Mes actual'], ['mes_anterior', 'Mes anterior'],
  ['anio_actual', 'Año actual'], ['anio_anterior', 'Año anterior']
];

function growthTone(value: unknown): 'success' | 'danger' | 'muted' {
  const n = num(value);
  return n == null || n === 0 ? 'muted' : n > 0 ? 'success' : 'danger';
}

function summary(d: Json): ViewBlock {
  const kinds: [string, string][] = [['facturas', 'Facturas'], ['boletas', 'Boletas'], ['notas_credito', 'Notas de crédito'],
    ['notas_debito', 'Notas de débito'], ['notas_venta', 'Notas de venta']];
  const comp = obj(d['comparacion']);
  const chart = arr(d['grafico']);
  const products = arr(d['top_productos']);
  const clients = arr(d['top_clientes']);
  return {
    stats: [
      ...kinds.map(([k, label]) => {
        const o = obj(d[k]);
        return { label, value: money(o['total']), hint: `${qty(o['count'] ?? 0)} documentos` };
      }),
      { label: 'Ventas vs. periodo anterior', value: money(comp['ventas_actuales']), hint: `Antes: ${money(comp['ventas_anteriores'])} · ${percent(comp['cambio_ventas_porcentaje'])}`,
        tone: growthTone(comp['cambio_ventas_porcentaje']) },
      { label: 'Documentos vs. periodo anterior', value: qty(comp['documentos_actuales']),
        hint: `Antes: ${qty(comp['documentos_anteriores'])} · ${percent(comp['cambio_documentos_porcentaje'])}`, tone: growthTone(comp['cambio_documentos_porcentaje']) }
    ],
    tables: [
      table([c('fecha', 'Día'), c('ventas', 'Ventas', 'end')],
        withBars(chart.map((g) => ({ cells: { fecha: dayText(g['fecha']), ventas: money(g['ventas']) } })), 'ventas', chart.map((g) => num(g['ventas']))),
        'Ventas por día', 'Sin ventas en el periodo.', 'icon-bar-chart-2'),
      table([c('nombre', 'Producto'), c('total', 'Total', 'end')],
        withBars(products.map((p) => ({ cells: { nombre: str(p['nombre']), total: money(p['total']) } })), 'total', products.map((p) => num(p['total']))),
        'Productos más vendidos', 'Sin productos en el periodo.', 'icon-package'),
      table([c('nombre', 'Cliente'), c('documentos', 'Documentos', 'end'), c('total', 'Total', 'end')],
        withBars(clients.map((p) => ({ cells: { nombre: str(p['nombre']), documentos: qty(p['documentos']), total: money(p['total']) } })), 'total',
          clients.map((p) => num(p['total']))),
        'Principales clientes', 'Sin clientes en el periodo.', 'icon-users')
    ],
    notes: has(obj(d['periodo'])['label']) ? [`Periodo: ${str(obj(d['periodo'])['label'])}.`] : []
  };
}

function indicators(d: Json): ViewBlock {
  const g = obj(d['crecimiento']);
  return {
    stats: [
      { label: 'Crecimiento vs. ayer', value: percent(g['vs_ayer']), tone: growthTone(g['vs_ayer']) },
      { label: 'Crecimiento vs. mes anterior', value: percent(g['vs_mes_anterior']), tone: growthTone(g['vs_mes_anterior']) },
      { label: 'Crecimiento vs. año anterior', value: percent(g['vs_anio_anterior']), tone: growthTone(g['vs_anio_anterior']) }
    ],
    tables: [table(
      [c('periodo', 'Periodo'), c('documentos', 'Documentos', 'end'), c('ventas', 'Ventas', 'end'), c('igv', 'IGV', 'end'), c('gratuitas', 'Gratuitas', 'end'),
        c('icbper', 'ICBPER', 'end'), c('ticket', 'Ticket promedio', 'end')],
      INDICATOR_ROWS.map(([k, label]) => {
        const o = obj(d[k]);
        return { cells: { periodo: label, documentos: qty(o['documentos']), ventas: money(o['ventas']), igv: money(o['igv']), gratuitas: money(o['gratuitas']),
          icbper: money(o['icbper']), ticket: money(o['ticket_promedio']) } };
      }))]
  };
}

const KIND_NAMES: Record<string, string> = { facturas: 'Facturas', boletas: 'Boletas', notas_credito: 'Notas de crédito', notas_debito: 'Notas de débito' };

function sunatState(d: Json): ViewBlock {
  const byState = obj(d['por_estado']);
  const byKind = obj(d['por_tipo']);
  const states = Object.keys(byState);
  Object.values(byKind).forEach((v) => Object.keys(obj(v)).forEach((s) => {
    if (!states.includes(s)) {
      states.push(s);
    }
  }));
  const rejections = arr(d['ultimos_rechazos']);
  return {
    stats: [
      { label: 'Documentos del periodo', value: qty(d['total_documentos']) },
      { label: 'Tasa de aceptación', value: percent(d['tasa_aceptacion']), tone: 'success' },
      { label: 'Observados', value: qty(d['observados']), tone: (num(d['observados']) ?? 0) > 0 ? 'warning' : 'muted' }
    ],
    groups: [{ title: 'Por estado', icon: 'icon-flag', items: states.map((s) => item(sunatStatusName(s), qty(byState[s] ?? 0), sunatBadge(s))) }],
    tables: [
      table([c('tipo', 'Tipo'), ...states.map((s) => c(s, sunatStatusName(s), 'end'))],
        Object.entries(byKind).map(([k, v]) => ({ cells: { tipo: KIND_NAMES[k] ?? k, ...Object.fromEntries(states.map((s) => [s, qty(obj(v)[s] ?? 0)])) } })),
        'Por tipo de comprobante', 'Sin documentos en el periodo.', 'icon-grid'),
      table([c('fecha', 'Fecha'), c('tipo', 'Tipo'), c('numero', 'Número'), c('codigo', 'Código'), c('motivo', 'Motivo')],
        rejections.map((r) => ({ cells: { fecha: dayText(r['fecha']), tipo: str(r['tipo']), numero: str(r['numero']), codigo: str(r['codigo_sunat']), motivo: str(r['motivo']) } })),
        'Últimos rechazos', 'Sin rechazos en el periodo.', 'icon-alert-octagon')
    ]
  };
}

function collections(d: Json): ViewBlock {
  const r = obj(d['resumen']);
  const aging = obj(d['aging']);
  const debtors = arr(d['top_deudores']);
  const states: [string, string][] = [['pagado', 'Pagado'], ['parcial', 'Parcial'], ['pendiente', 'Pendiente']];
  return {
    groups: [{ title: 'Antigüedad de saldos', icon: 'icon-clock', items: filled([
      item('Por vencer', money(aging['por_vencer'])), item('Vencido 0–30 días', money(aging['vencido_0_30'])),
      item('Vencido 31–60 días', money(aging['vencido_31_60'])), item('Vencido 61–90 días', money(aging['vencido_61_90'])),
      item('Vencido más de 90 días', money(aging['vencido_mas_90'])), item('Documentos con saldo', qty(aging['documentos_con_saldo']))
    ]) }],
    tables: [
      table([c('estado', 'Estado de pago'), c('documentos', 'Documentos', 'end'), c('monto_total', 'Monto total', 'end'), c('monto_pagado', 'Pagado', 'end'),
        c('saldo', 'Saldo', 'end')],
      states.map(([k, label]) => {
        const o = obj(r[k]);
        return { cells: { estado: label, documentos: qty(o['documentos']), monto_total: money(o['monto_total']), monto_pagado: money(o['monto_pagado']),
          saldo: money(o['saldo']) } };
      }), 'Resumen de cobranzas', undefined, 'icon-dollar-sign'),
      table([c('cliente', 'Cliente'), c('ruc', 'Documento'), c('documentos', 'Documentos', 'end'), c('saldo', 'Saldo', 'end')],
        withBars(debtors.map((x) => ({ cells: { cliente: str(x['cliente']), ruc: str(x['ruc']), documentos: qty(x['documentos']), saldo: money(x['saldo']) } })),
          'saldo', debtors.map((x) => num(x['saldo']))),
        'Principales deudores', 'Sin saldos pendientes.', 'icon-user-x')
    ]
  };
}

function monthly(d: Json): ViewBlock {
  const months = arr(d['meses']);
  return {
    stats: [
      { label: 'Total 12 meses', value: money(d['total_12_meses']) },
      { label: '12 meses anteriores', value: money(d['total_12_meses_anterior']) },
      { label: 'Crecimiento', value: percent(d['crecimiento_porcentaje']), tone: growthTone(d['crecimiento_porcentaje']) },
      { label: 'Promedio mensual', value: money(d['promedio_mensual']) }
    ],
    tables: [table([c('mes', 'Mes'), c('ventas', 'Ventas', 'end'), c('anterior', 'Año anterior', 'end')],
      withBars(months.map((m) => ({ cells: { mes: str(m['mes_label'] || m['mes']), ventas: money(m['ventas']), anterior: money(m['ventas_anio_anterior']) } })),
        'ventas', months.map((m) => num(m['ventas']))), undefined, 'Sin datos.')]
  };
}

function byBranch(d: Json): ViewBlock {
  const list = arr(d['sucursales']);
  return {
    stats: [{ label: 'Total general', value: money(d['total_general']) }],
    tables: [table(
      [c('nombre', 'Sucursal'), c('fc', 'Facturas', 'end'), c('fm', 'Monto facturas', 'end'), c('bc', 'Boletas', 'end'), c('bm', 'Monto boletas', 'end'),
        c('total', 'Total', 'end'), c('share', 'Participación', 'end')],
      withBars(list.map((s) => {
        const f = obj(s['facturas']);
        const b = obj(s['boletas']);
        return { cells: { nombre: `${str(s['nombre'])} (${str(s['cod_local'])})`, fc: qty(f['cantidad']), fm: money(f['monto']), bc: qty(b['cantidad']),
          bm: money(b['monto']), total: money(s['total']), share: percent(s['share_porcentaje']) } };
      }), 'total', list.map((s) => num(s['total']))), undefined, 'Sin ventas en el periodo.')]
  };
}

function byCurrency(d: Json): ViewBlock {
  return {
    tables: [table([c('moneda', 'Moneda'), c('documentos', 'Documentos', 'end'), c('total', 'Total', 'end'), c('igv', 'IGV', 'end')],
      arr(d['monedas']).map((m) => ({ cells: { moneda: str(m['moneda']), documentos: qty(m['documentos']), total: money(m['total']), igv: money(m['igv']) } })),
      undefined, 'Sin ventas en el periodo.')]
  };
}

function clients(d: Json): ViewBlock {
  const top = arr(d['top_20']);
  return {
    stats: [
      { label: 'Clientes registrados', value: qty(d['total_registrados']) },
      { label: 'Clientes con compras en el periodo', value: qty(d['clientes_unicos_periodo']) },
      { label: 'Nuevos', value: qty(d['clientes_nuevos']), tone: 'success' },
      { label: 'Recurrentes', value: qty(d['clientes_recurrentes']) }
    ],
    tables: [table([c('nombre', 'Cliente'), c('doc', 'Documento'), c('documentos', 'Comprobantes', 'end'), c('total', 'Total', 'end')],
      withBars(top.map((x) => ({ cells: { nombre: str(x['nombre']), doc: `${identityTypeName(x['tipo_documento'])} ${str(x['ruc'])}`.trim(),
        documentos: qty(x['documentos']), total: money(x['total']) } })), 'total', top.map((x) => num(x['total']))),
      'Principales clientes (20)', 'Sin clientes en el periodo.', 'icon-users')]
  };
}

function products(d: Json): ViewBlock {
  const productTable = (key: string, title: string, bar: 'total' | 'cantidad') => {
    const list = arr(d[key]);
    return table([c('codigo', 'Código'), c('descripcion', 'Descripción'), c('cantidad', 'Cantidad', 'end'), c('total', 'Total', 'end')],
      withBars(list.map((p) => ({ cells: { codigo: str(p['codigo']), descripcion: str(p['descripcion']), cantidad: qty(p['cantidad']), total: money(p['total']) } })),
        bar, list.map((p) => num(p[bar]))), title, 'Sin productos en el periodo.', 'icon-package');
  };
  return {
    tables: [
      productTable('top_por_venta', 'Más vendidos por importe', 'total'),
      productTable('top_por_cantidad', 'Más vendidos por cantidad', 'cantidad'),
      table([c('codigo', 'Código'), c('descripcion', 'Afectación del IGV'), c('items', 'Ítems', 'end'), c('total', 'Total', 'end')],
        arr(d['por_tipo_igv']).map((p) => ({ cells: { codigo: str(p['codigo']), descripcion: str(p['descripcion']), items: qty(p['items']), total: money(p['total']) } })),
        'Por afectación del IGV', 'Sin datos.', 'icon-percent')
    ]
  };
}

const RECENT_TYPES: Record<string, string> = { factura: 'Factura', boleta: 'Boleta', nota_credito: 'Nota de crédito', nota_debito: 'Nota de débito' };

function recent(d: Json): ViewBlock {
  return {
    tables: [table(
      [c('fecha', 'Emisión'), c('tipo', 'Tipo'), c('numero', 'Número'), c('cliente', 'Cliente'), c('total', 'Total', 'end'), c('estado', 'SUNAT', undefined, true)],
      arr(d['documentos']).map((x): ViewRow => {
        const kind = saleKindFromPanel(x['tipo']);
        const id = num(x['id']);
        return {
          cells: { fecha: dayText(x['fecha_emision']), tipo: RECENT_TYPES[str(x['tipo'])] ?? str(x['tipo']), numero: str(x['numero']),
            cliente: [str(x['cliente']), str(x['cliente_documento'])].filter(Boolean).join(' · '), total: money(x['total'], str(x['moneda'])),
            estado: sunatStatusName(x['estado_sunat']) },
          badges: { estado: sunatBadge(x['estado_sunat']) },
          ref: kind && id != null ? { kind, id } : undefined
        };
      }), undefined, 'Sin comprobantes.')]
  };
}

function alerts(d: Json): ViewBlock {
  const count = (k: string) => num(obj(d[k])['cantidad']) ?? 0;
  return {
    stats: [
      { label: 'Rechazados (7 días)', value: qty(count('rechazados_7_dias')), tone: count('rechazados_7_dias') ? 'danger' : 'muted' },
      { label: 'Vencen en 7 días', value: qty(count('vencen_proximos_7_dias')), hint: money(obj(d['vencen_proximos_7_dias'])['monto']),
        tone: count('vencen_proximos_7_dias') ? 'warning' : 'muted' },
      { label: 'Vencidos', value: qty(count('vencidos')), hint: money(obj(d['vencidos'])['monto']), tone: count('vencidos') ? 'danger' : 'muted' },
      { label: 'Pendientes de envío a SUNAT', value: qty(count('pendientes_envio_sunat')), tone: count('pendientes_envio_sunat') ? 'warning' : 'muted' }
    ],
    tables: [table([c('tipo', 'Tipo'), c('serie', 'Serie'), c('correlativo', 'Correlativo actual', 'end')],
      arr(d['series_por_agotar']).map((s) => ({ cells: { tipo: str(s['tipo_documento']), serie: str(s['serie']), correlativo: qty(s['correlativo']) } })),
      'Series por agotar', 'Ninguna serie por agotar.', 'icon-hash')]
  };
}

/** Secciones del panel en el orden en que se muestran. */
export const PANEL_SECTIONS: PanelSection[] = [
  { key: 'panel', title: 'Resumen del periodo', icon: 'icon-pie-chart', path: 'panel', period: true, build: summary },
  { key: 'indicadores', title: 'Indicadores', icon: 'icon-trending-up', path: 'panel/indicadores', period: false, build: indicators },
  { key: 'alertas', title: 'Alertas', icon: 'icon-alert-triangle', path: 'panel/alertas', period: false, build: alerts },
  { key: 'estado-sunat', title: 'Estado SUNAT', icon: 'icon-send', path: 'panel/estado-sunat', period: true, build: sunatState },
  { key: 'cobranzas', title: 'Cobranzas', icon: 'icon-dollar-sign', path: 'panel/cobranzas', period: false, build: collections },
  { key: 'ventas-mensuales', title: 'Ventas mensuales (12 meses)', icon: 'icon-bar-chart-2', path: 'panel/ventas-mensuales', period: false, build: monthly },
  { key: 'por-sucursal', title: 'Por sucursal', icon: 'icon-map-pin', path: 'panel/por-sucursal', period: true, build: byBranch },
  { key: 'por-moneda', title: 'Por moneda', icon: 'icon-globe', path: 'panel/por-moneda', period: true, build: byCurrency },
  { key: 'clientes', title: 'Clientes', icon: 'icon-users', path: 'panel/clientes', period: true, build: clients },
  { key: 'productos', title: 'Productos', icon: 'icon-package', path: 'panel/productos', period: true, build: products },
  { key: 'documentos-recientes', title: 'Documentos recientes', icon: 'icon-clock', path: 'panel/documentos-recientes', period: false, build: recent }
];
