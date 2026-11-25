/**
 * Configuración de la empresa (§9.5): empresa (sin `sol_user` ni `client_id`, ya los quita la API), sucursales, series,
 * clientes y suscripción con su uso y pagos. De las credenciales solo se muestra si están registradas. Las filas de sucursales
 * y series pueden llevar acciones (fase C, §11.5) que arma la pestaña según los permisos.
 */
import { environmentName, planName } from '../../models/sunat.models';
import { SERIES_KIND_OPTIONS } from '../../models/tenant-admin.models';
import {
  Json, ViewBlock, ViewRowAction, arr, c, dayText, filled, has, identityTypeName, instantText, item, money, num, obj, qty, str, table, yesNo
} from '../../models/tenant-views.models';

const active = (v: unknown) => (v === true ? 'Activa' : v === false ? 'Inactiva' : str(v));
const activeBadge = (v: unknown) => (v === true ? 'badge-light-success' : 'badge-light-secondary');

const TAX_REGIMES: Record<string, string> = {
  general: 'Régimen general', mype: 'Régimen MYPE tributario', rer: 'Régimen especial (RER)', rus: 'Nuevo RUS', especial: 'Régimen especial',
  nrus: 'Nuevo RUS'
};

export function companyBlock(d: Json): ViewBlock {
  const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean).join(', ') : str(v));
  const block: ViewBlock = {
    groups: [
      { title: 'Empresa', icon: 'icon-briefcase', items: filled([
        item('RUC', d['ruc']), item('Razón social', d['razon_social']), item('Nombre comercial', d['nombre_comercial']),
        item('Ambiente', environmentName(str(d['entorno']))), item('Estado', active(d['activo']), activeBadge(d['activo'])),
        item('Registrada', instantText(d['creado_en']))
      ]) },
      { title: 'Ubicación', icon: 'icon-map-pin', items: filled([
        item('Dirección', d['direccion']), item('Ubigeo', d['ubigeo']), item('Departamento', d['departamento']), item('Provincia', d['provincia']),
        item('Distrito', d['distrito'])
      ]) },
      { title: 'Tributación', icon: 'icon-percent', items: filled([
        item('Régimen', TAX_REGIMES[str(d['tax_regime'])] ?? d['tax_regime']), item('Tasa de IGV vigente', has(d['tasa_igv_vigente']) ? `${qty(d['tasa_igv_vigente'])} %` : ''),
        item('Tasa de IGV especial', has(d['igv_rate_override']) ? `${qty(d['igv_rate_override'])} %` : ''), item('Categoría NRUS', d['nrus_categoria'])
      ]) },
      { title: 'Plan', icon: 'icon-sliders', items: filled([
        item('Plan', planName(str(d['plan']))), item('Comprobantes por mes', qty(d['max_documentos_mes'])), item('Emitidos este mes', qty(d['documentos_este_mes']))
      ]) },
      { title: 'Credenciales e integración (sin valores)', icon: 'icon-lock', items: filled([
        item('Clave SOL registrada', yesNo(d['tiene_sol_pass'])), item('Client secret registrado', yesNo(d['tiene_client_secret'])),
        item('Certificado registrado', yesNo(d['tiene_certificado'])), item('Webhook configurado', yesNo(d['tiene_webhook'])),
        item('URL del webhook', d['webhook_url']), item('Logo', has(d['logo_url']) ? 'Registrado' : 'Sin logo')
      ]) },
      { title: 'Contacto y mensajes', icon: 'icon-phone', items: filled([
        item('Teléfonos', list(d['telefonos'])), item('Correos', list(d['emails'])), item('Mensaje de agradecimiento', d['mensaje_agradecimiento']),
        item('Mensaje promocional', d['mensaje_promocional'])
      ]) }
    ],
    tables: [
      table([c('banco', 'Banco'), c('tipo', 'Tipo de cuenta'), c('moneda', 'Moneda'), c('numero', 'Número'), c('cci', 'CCI'), c('titular', 'Titular')],
        arr(d['cuentas_bancarias']).map((b) => ({ cells: { banco: str(b['banco']), tipo: str(b['tipo_cuenta']), moneda: str(b['moneda']), numero: str(b['numero']),
          cci: str(b['cci']), titular: str(b['titular']) } })), 'Cuentas bancarias', 'Sin cuentas bancarias.', 'icon-credit-card'),
      table([c('tipo', 'Billetera'), c('numero', 'Número'), c('titular', 'Titular')],
        arr(d['billeteras_digitales']).map((b) => ({ cells: { tipo: str(b['tipo']), numero: str(b['numero']), titular: str(b['titular']) } })),
        'Billeteras digitales', 'Sin billeteras digitales.', 'icon-smartphone')
    ]
  };
  return block;
}

/** Acciones de cada fila (vacío = sin acciones). */
export type RowActions = (row: Json) => ViewRowAction[];

export function branchesBlock(list: Json[], actions?: RowActions): ViewBlock {
  return {
    tables: [table(
      [c('nombre', 'Sucursal'), c('cod_local', 'Código SUNAT'), c('direccion', 'Dirección'), c('ubigeo', 'Ubigeo'), c('contacto', 'Contacto'),
        c('principal', 'Principal', 'center'), c('series', 'Series', 'end'), c('activo', 'Estado', undefined, true)],
      list.map((s) => ({
        cells: { nombre: str(s['nombre']), cod_local: str(s['cod_local']), direccion: str(s['direccion']), ubigeo: str(s['ubigeo']),
          contacto: [str(s['telefono']), str(s['email'])].filter(Boolean).join(' · '), principal: s['es_principal'] === true ? 'Sí' : '',
          series: qty(s['total_series']), activo: active(s['activo']) },
        badges: { activo: activeBadge(s['activo']) },
        actions: actions?.(s), data: s
      })), undefined, 'La empresa no tiene sucursales.')]
  };
}

/** `tipo` de serie (§11.5): también filtra `GET series`. */
export const SERIES_TYPES = SERIES_KIND_OPTIONS;

export function seriesBlock(list: Json[], actions?: RowActions): ViewBlock {
  return {
    tables: [table(
      [c('tipo', 'Tipo'), c('serie', 'Serie'), c('correlativo', 'Último correlativo', 'end'), c('siguiente', 'Siguiente número'), c('sucursal', 'Sucursal'),
        c('activo', 'Estado', undefined, true)],
      list.map((s) => {
        const b = obj(s['sucursal']);
        const type = SERIES_TYPES.find((t) => t.id === s['tipo'])?.name ?? str(s['tipo']);
        return {
          cells: { tipo: has(s['tipo_documento']) ? `${type} (${str(s['tipo_documento'])})` : type, serie: str(s['serie']), correlativo: qty(s['correlativo']),
            siguiente: str(s['siguiente_numero']), sucursal: Object.keys(b).length ? `${str(b['nombre'])} (${str(b['cod_local'])})` : 'Sin sucursal',
            activo: s['activo'] === true ? 'Activa' : s['activo'] === false ? 'Inactiva' : str(s['activo']) },
          badges: { activo: activeBadge(s['activo']) },
          actions: actions?.(s), data: s
        };
      }), undefined, 'Sin series con estos filtros.')]
  };
}

/** Filas de clientes para app-list-table. */
export function decorateClient(r: Json): void {
  r['_doc'] = `${identityTypeName(r['tipo_documento'])} ${str(r['numero_documento'])}`.trim();
  r['_contacto'] = [str(r['email']), str(r['telefono'])].filter(Boolean).join(' · ');
  r['_creado'] = instantText(r['creado_en']);
}

const SUBSCRIPTION_STATES: Record<string, string> = {
  active: 'Activa', trialing: 'En prueba', past_due: 'Pago vencido', canceled: 'Cancelada', cancelled: 'Cancelada', incomplete: 'Incompleta',
  unpaid: 'Sin pagar', paused: 'Pausada'
};
const CYCLES: Record<string, string> = { monthly: 'Mensual', yearly: 'Anual', annual: 'Anual' };
const USAGE_NAMES: Record<string, string> = {
  documents_month: 'Comprobantes del mes', ai_messages_month: 'Mensajes de IA del mes', team_members: 'Miembros del equipo',
  sucursales: 'Sucursales', productos: 'Productos'
};
const PAYMENT_STATES: Record<string, string> = { paid: 'Pagado', pending: 'Pendiente', failed: 'Fallido', refunded: 'Reembolsado', void: 'Anulado' };

function limitText(limit: unknown, unlimited: unknown): string {
  return unlimited === true || num(limit) === -1 ? 'Ilimitado' : qty(limit);
}

/** `GET suscripcion`: `{suscripcion, uso}` (`uso` con la forma de `suscripcion/uso`). */
export function subscriptionBlock(d: Json): ViewBlock {
  const s = d['suscripcion'];
  const blocks: ViewBlock = { groups: [], tables: [], notes: [] };
  if (s && typeof s === 'object') {
    const o = obj(s);
    const plan = obj(o['plan']);
    const card = [str(o['marca_tarjeta']), has(o['ultimos_cuatro_tarjeta']) ? `•••• ${str(o['ultimos_cuatro_tarjeta'])}` : ''].filter(Boolean).join(' ');
    blocks.groups!.push({ title: 'Suscripción', icon: 'icon-repeat', items: filled([
      item('Plan', str(plan['nombre']) || str(plan['slug'])), item('Estado', SUBSCRIPTION_STATES[str(o['estado'])] ?? o['estado'],
        o['estado'] === 'active' ? 'badge-light-success' : o['estado'] === 'trialing' ? 'badge-light-info' : 'badge-light-warning'),
      item('Ciclo', CYCLES[str(o['ciclo_facturacion'])] ?? o['ciclo_facturacion']), item('Fin de la prueba', instantText(o['fin_prueba'])),
      item('Fin del periodo actual', instantText(o['fin_periodo_actual'])), item('Cancelada el', instantText(o['cancelado_en'])), item('Tarjeta', card)
    ]) });
  } else {
    blocks.notes!.push('La empresa no tiene una suscripción activa ni en prueba.');
  }
  const uso = usageBlock(obj(d['uso']));
  blocks.groups!.push(...(uso.groups ?? []));
  blocks.tables!.push(...(uso.tables ?? []));
  return blocks;
}

export function usageBlock(d: Json): ViewBlock {
  const plan = obj(d['plan']);
  const usage = obj(d['usage']);
  const next = d['next_upgrade'];
  const features = Array.isArray(d['features']) ? d['features'].map(str).filter(Boolean) : [];
  return {
    groups: [{ title: 'Plan contratado', icon: 'icon-sliders', items: filled([
      item('Plan', planName(str(plan['slug']))), item('Nivel', plan['tier']), item('Precio', money(plan['price'])),
      item('Funciones', features.join(', ') || 'Ninguna adicional'),
      item('Siguiente plan', next && typeof next === 'object' ? `${planName(str(obj(next)['slug']))} (${money(obj(next)['price'])})` : 'Es el plan más alto')
    ]) }],
    tables: [table([c('recurso', 'Recurso'), c('actual', 'En uso', 'end'), c('limite', 'Límite', 'end')],
      Object.entries(usage).map(([k, v]) => {
        const o = obj(v);
        return { cells: { recurso: USAGE_NAMES[k] ?? k, actual: has(o['current']) ? qty(o['current']) : '—', limite: limitText(o['limit'], o['unlimited']) } };
      }), 'Uso del plan', 'Sin datos de uso.', 'icon-bar-chart')]
  };
}

export function paymentsBlock(list: Json[]): ViewBlock {
  return {
    tables: [table(
      [c('pagado', 'Pagado el'), c('monto', 'Monto', 'end'), c('estado', 'Estado', undefined, true), c('inicio', 'Inicio del periodo'), c('fin', 'Fin del periodo')],
      list.map((p) => ({
        cells: { pagado: instantText(p['pagado_en']), monto: money(p['monto'], str(p['moneda'])), estado: PAYMENT_STATES[str(p['estado'])] ?? str(p['estado']),
          inicio: dayText(p['inicio_periodo']), fin: dayText(p['fin_periodo']) },
        badges: { estado: p['estado'] === 'paid' ? 'badge-light-success' : p['estado'] === 'failed' ? 'badge-light-danger' : 'badge-light-secondary' }
      })), 'Pagos de la suscripción', 'Sin pagos registrados.', 'icon-credit-card')]
  };
}
