/**
 * Piezas comunes de los formularios de comprobantes (corregir un rechazado en la entrega 2; emitir en la entrega 3):
 * catálogos SUNAT, la fila de ítem y el bloque de cliente / tercero, con su lectura desde el recurso de `/api/v1`
 * (snake_case) y su paso al cuerpo de `/api/v1` (mismos nombres). Funciones puras, sin `new Date()`.
 */
import { Option } from '../../models/sunat.models';
import { rucError } from '../../models/tenant-admin.models';
import { IDENTITY_TYPE_OPTIONS, Json, num, obj, str } from '../../models/tenant-views.models';

// ---------------------------------------------------------------- Catálogos
/** Unidades de medida más usadas (catálogo 03). El campo acepta cualquier código (lista de sugerencias). */
export const UNIT_OPTIONS: Option<string>[] = [
  { id: 'NIU', name: 'NIU - Unidad (bienes)' }, { id: 'ZZ', name: 'ZZ - Unidad (servicios)' }, { id: 'KGM', name: 'KGM - Kilogramo' },
  { id: 'GRM', name: 'GRM - Gramo' }, { id: 'TNE', name: 'TNE - Tonelada' }, { id: 'LTR', name: 'LTR - Litro' }, { id: 'GLI', name: 'GLI - Galón' },
  { id: 'MTR', name: 'MTR - Metro' }, { id: 'MTK', name: 'MTK - Metro cuadrado' }, { id: 'MTQ', name: 'MTQ - Metro cúbico' },
  { id: 'BX', name: 'BX - Caja' }, { id: 'PK', name: 'PK - Paquete' }, { id: 'SET', name: 'SET - Juego' }, { id: 'KT', name: 'KT - Kit' },
  { id: 'HUR', name: 'HUR - Hora' }, { id: 'DAY', name: 'DAY - Día' }, { id: 'MON', name: 'MON - Mes' }, { id: 'C62', name: 'C62 - Sin unidad específica' }
];

/** Tipo de afectación del IGV (catálogo 07), los onerosos. */
export const IGV_AFFECTATION_OPTIONS: Option<string>[] = [
  { id: '10', name: '10 - Gravado' },
  { id: '20', name: '20 - Exonerado' },
  { id: '30', name: '30 - Inafecto' },
  { id: '40', name: '40 - Exportación' }
];

/** Monedas que acepta `/api/v1` en comprobantes. */
export const SALE_CURRENCY_OPTIONS: Option<string>[] = [
  { id: 'PEN', name: 'Soles (PEN)' },
  { id: 'USD', name: 'Dólares (USD)' },
  { id: 'EUR', name: 'Euros (EUR)' }
];

/** `forma_pago` de facturas y boletas (`/api/v1`). */
export const PAYMENT_FORM_OPTIONS: Option<string>[] = [
  { id: 'Contado', name: 'Contado' }, { id: 'Credito', name: 'Crédito' }, { id: 'Tarjeta', name: 'Tarjeta' },
  { id: 'Billetera Digital', name: 'Billetera digital' }, { id: 'Deposito', name: 'Depósito' }, { id: 'Transferencia', name: 'Transferencia' }
];

/** Tipo del documento que modifica una nota (`doc_afectado_tipo`). */
export const AFFECTED_DOC_OPTIONS: Option<string>[] = [
  { id: '01', name: 'Factura (01)' },
  { id: '03', name: 'Boleta (03)' },
  { id: '12', name: 'Ticket de máquina registradora (12)' }
];

/**
 * Motivos de la nota de crédito (catálogo 09): solo los códigos que acepta la validación de `/api/v1`
 * (`@SunatCatalog:09` = 01 a 09; 10 a 13 los rechaza), con los nombres del catálogo de SUNAT.
 */
export const CREDIT_NOTE_REASONS: Option<string>[] = [
  { id: '01', name: '01 - Anulación de la operación' }, { id: '02', name: '02 - Anulación por error en el RUC' },
  { id: '03', name: '03 - Corrección por error en la descripción' }, { id: '04', name: '04 - Descuento global' },
  { id: '05', name: '05 - Descuento por ítem' }, { id: '06', name: '06 - Devolución total' }, { id: '07', name: '07 - Devolución por ítem' },
  { id: '08', name: '08 - Bonificación' }, { id: '09', name: '09 - Disminución en el valor' }
];

/**
 * Motivos de la nota de débito (catálogo 10) que acepta `/api/v1` (`@SunatCatalog:10`). Con 13 (penalidades) el documento
 * que modifica es opcional y la nota solo admite operaciones inafectas (ERR-3507).
 */
export const DEBIT_NOTE_REASONS: Option<string>[] = [
  { id: '01', name: '01 - Intereses por mora' }, { id: '02', name: '02 - Aumento en el valor' },
  { id: '03', name: '03 - Otros conceptos' }, { id: '11', name: '11 - Ajustes de operaciones de exportación' },
  { id: '12', name: '12 - Ajustes afectos al IVAP' }, { id: '13', name: '13 - Penalidades (sin documento que modifica, inafecta)' }
];

/** Tipo de operación de facturas y boletas (catálogo 51, los que acepta `/api/v1`). */
export const OPERATION_TYPE_OPTIONS: Option<string>[] = [
  { id: '0101', name: '0101 - Venta interna' },
  { id: '0112', name: '0112 - Venta interna: gastos deducibles persona natural' },
  { id: '0113', name: '0113 - Venta interna: NRUS' },
  { id: '0200', name: '0200 - Exportación de bienes' },
  { id: '0201', name: '0201 - Exportación de servicios: prestación íntegra en el país' },
  { id: '0202', name: '0202 - Exportación de servicios: hospedaje de no domiciliado' },
  { id: '0205', name: '0205 - Exportación de servicios: paquete turístico' },
  { id: '0208', name: '0208 - Exportación de servicios: prestación parcial en el extranjero' },
  { id: '0401', name: '0401 - Venta a no domiciliado que no califica como exportación' },
  { id: '1001', name: '1001 - Operación sujeta a detracción' },
  { id: '1002', name: '1002 - Detracción: recursos hidrobiológicos' },
  { id: '1003', name: '1003 - Detracción: transporte de pasajeros' },
  { id: '1004', name: '1004 - Detracción: transporte de carga' },
  { id: '2001', name: '2001 - Operación sujeta a percepción' }
];

export const DETRACTION_OPERATIONS = ['1001', '1002', '1003', '1004'];
export const PERCEPTION_OPERATION = '2001';

/** Bienes y servicios sujetos a detracción (catálogo 54) con su tasa de `/api/v1` (null = la indica el usuario). */
export const DETRACTION_GOODS: (Option<string> & { rate: number | null })[] = [
  ['001', 'Azúcar y melaza de caña', 10], ['003', 'Alcohol etílico', 10], ['004', 'Recursos hidrobiológicos', 4],
  ['005', 'Maíz amarillo duro', 4], ['007', 'Caña de azúcar', 10], ['008', 'Madera', 4], ['009', 'Arena y piedra', 10],
  ['010', 'Residuos, subproductos, desechos', 15], ['012', 'Intermediación laboral y tercerización', 10],
  ['014', 'Carnes y despojos comestibles', 4], ['017', 'Harina, polvo y pellets de pescado', 4], ['019', 'Arrendamiento de bienes muebles', 10],
  ['020', 'Mantenimiento y reparación de bienes muebles', 10], ['021', 'Movimiento de carga', 10], ['022', 'Otros servicios empresariales', 10],
  ['023', 'Leche', 4], ['024', 'Comisión mercantil', 10], ['025', 'Fabricación de bienes por encargo', 10],
  ['026', 'Servicio de transporte de personas', 10], ['027', 'Servicio de transporte de carga', 4], ['030', 'Contratos de construcción', 4],
  ['031', 'Oro gravado con el IGV', 10], ['034', 'Minerales metálicos no auríferos', 10], ['035', 'Bienes exonerados del IGV', 1.5],
  ['036', 'Oro y demás minerales metálicos exonerados del IGV', 1.5], ['037', 'Demás servicios gravados con el IGV', 12],
  ['038', 'Espectáculos públicos gravados con el IGV', null], ['039', 'Minerales no metálicos', 10], ['040', 'Bien inmueble gravado con IGV', 4],
  ['042', 'Ladrillos de construcción y artículos similares de cerámica', null], ['043', 'Estructuras metálicas para la construcción', null],
  ['046', 'Cobre gravado con el IGV', null], ['047', 'Plata gravada con el IGV', null]
].map(([id, name, rate]) => ({ id: id as string, name: `${id} - ${name}`, rate: rate as number | null }));

/** Medio de pago de la detracción (catálogo 59, los más usados). */
export const PAYMENT_MEANS_OPTIONS: Option<string>[] = [
  { id: '001', name: '001 - Depósito en cuenta' }, { id: '003', name: '003 - Transferencia de fondos' }, { id: '004', name: '004 - Orden de pago' },
  { id: '005', name: '005 - Tarjeta de débito' }, { id: '006', name: '006 - Tarjeta de crédito emitida en el país' },
  { id: '009', name: '009 - Efectivo, en los demás casos' }, { id: '999', name: '999 - Otros medios de pago' }
];

/** Régimen de percepción (catálogo 22) con su tasa. */
export const PERCEPTION_REGIMES: (Option<string> & { rate: number })[] = [
  { id: '01', name: '01 - Venta interna (2 %)', rate: 2 },
  { id: '02', name: '02 - Adquisición de combustible (1 %)', rate: 1 },
  { id: '03', name: '03 - Agente con tasa especial (0,5 %)', rate: 0.5 }
];

/** Régimen de retención (catálogo 23) con su tasa. */
export const RETENTION_REGIMES: (Option<string> & { rate: number })[] = [
  { id: '01', name: '01 - Tasa 3 %', rate: 3 },
  { id: '02', name: '02 - Tasa 6 %', rate: 6 }
];

/** `pagos[].metodo` de facturas y boletas (`Payment::METODOS` de `/api/v1`). */
export const SALE_PAYMENT_METHODS: Option<string>[] = [
  { id: 'efectivo', name: 'Efectivo' }, { id: 'yape', name: 'Yape' }, { id: 'plin', name: 'Plin' }, { id: 'transferencia', name: 'Transferencia' },
  { id: 'tarjeta', name: 'Tarjeta' }, { id: 'cheque', name: 'Cheque' }, { id: 'otro', name: 'Otro' }
];

/** Guías que se relacionan con una factura o boleta (`guias[].tipo_doc`) o una liquidación (`guias[].tipo`). */
export const SALE_GUIDE_TYPES: Option<string>[] = [
  { id: '09', name: 'Guía de remisión remitente (09)' },
  { id: '31', name: 'Guía de remisión transportista (31)' }
];

/** Documentos que sustentan una retención o percepción (`documentos[].tipo_doc`). */
export const RETPER_DOC_TYPES: Option<string>[] = [
  { id: '01', name: 'Factura (01)' }, { id: '03', name: 'Boleta (03)' }, { id: '12', name: 'Ticket (12)' }
];

/** Tipo de operación de la liquidación de compra (0502, anticipos, aún no la admite `/api/v1`). */
export const SETTLEMENT_OPERATION_OPTIONS: Option<string>[] = [
  { id: '0501', name: '0501 - Compra interna' },
  { id: '0503', name: '0503 - Compra de oro' }
];

/** Catálogo 60 (tipo de dirección): domicilio del vendedor y lugar de la operación de una liquidación. */
export const ADDRESS_TYPE_OPTIONS: Option<string>[] = [
  { id: '01', name: '01 - Punto de venta' }, { id: '02', name: '02 - Producción' }, { id: '03', name: '03 - Extracción' },
  { id: '04', name: '04 - Explotación' }, { id: '05', name: '05 - Otros' }
];

/** Vendedor de una liquidación de compra: DNI o carné de extranjería. */
export const SELLER_DOC_OPTIONS: Option<string>[] = [
  { id: '1', name: 'DNI' },
  { id: '4', name: 'Carné de extranjería' }
];

/** Naturaleza del mineral en la compra de oro (catálogo 55). */
export const GOLD_NATURE_CODES = ['6000', '6004', '6005', '6006'];

/** Indicador SUNAT de traslado en vehículo M1 o L (guías). */
export const GUIDE_M1L_INDICATOR = 'SUNAT_Envio_IndicadorTrasladoVehiculoM1L';

/** Quién paga el flete en la guía transportista. */
export const FREIGHT_PAYER_OPTIONS: Option<string>[] = [
  { id: 'remitente', name: 'El remitente' },
  { id: 'subcontratador', name: 'El subcontratador' },
  { id: 'tercero', name: 'Un tercero' }
];

/** Motivo de traslado de la guía (catálogo 20, los que acepta `/api/v1`). */
export const TRANSFER_REASON_OPTIONS: Option<string>[] = [
  { id: '01', name: '01 - Venta' }, { id: '02', name: '02 - Compra' }, { id: '03', name: '03 - Venta con entrega a terceros' },
  { id: '04', name: '04 - Traslado entre establecimientos de la misma empresa' }, { id: '05', name: '05 - Consignación' },
  { id: '06', name: '06 - Devolución' }, { id: '07', name: '07 - Recojo de bienes transformados' }, { id: '08', name: '08 - Importación' },
  { id: '09', name: '09 - Exportación' }, { id: '13', name: '13 - Otros' }, { id: '14', name: '14 - Venta sujeta a confirmación del comprador' },
  { id: '17', name: '17 - Traslado de bienes para transformación' }, { id: '18', name: '18 - Traslado emisor itinerante' },
  { id: '19', name: '19 - Traslado a zona primaria' }
];

export const TRANSFER_MODE_OPTIONS: Option<string>[] = [
  { id: '01', name: '01 - Transporte público' },
  { id: '02', name: '02 - Transporte privado' }
];

export const WEIGHT_UNIT_OPTIONS: Option<string>[] = [
  { id: 'KGM', name: 'Kilogramos (KGM)' },
  { id: 'TNE', name: 'Toneladas (TNE)' }
];

/** Documentos relacionados que acepta la guía transportista. */
export const RELATED_DOC_OPTIONS: Option<string>[] = [
  { id: '01', name: 'Factura (01)' }, { id: '03', name: 'Boleta (03)' }, { id: '09', name: 'Guía remitente (09)' },
  { id: '31', name: 'Guía transportista (31)' }, { id: '50', name: 'DAM (50)' }, { id: '52', name: 'DS (52)' }
];

/** Documentos relacionados de la guía remitente (motivos 08 / 09 / 19 exigen DAM, DS o manifiesto). */
export const GUIDE_RELATED_DOC_OPTIONS: Option<string>[] = [
  ...RELATED_DOC_OPTIONS, { id: '04', name: 'Liquidación de compra (04)' }, { id: '12', name: 'Ticket (12)' },
  { id: '91', name: 'Manifiesto de carga (91)' }
];

/** Tipos de documento de identidad (catálogo 06). */
export const PARTY_DOC_OPTIONS: Option<string>[] = IDENTITY_TYPE_OPTIONS;

/** Tasa con la que la pantalla estima los totales (la API recalcula con la de la empresa: régimen y tasa especial). */
export const ESTIMATE_IGV_RATE = 0.18;

// ---------------------------------------------------------------- Ítems
/**
 * Columnas de la grilla. `cod_producto_sunat` (comprobantes y liquidaciones) y `cod_prod_sunat` (guías) son el mismo dato
 * con el nombre de cada cuerpo de `/api/v1` (catálogo 25, UNSPSC de 8 dígitos). `valor_unitario` es el precio **sin** IGV
 * (liquidación de compra); `descuento_pct` va como `descuentos: [{ cod_tipo: "00", porcentaje }]` (la API calcula el monto).
 */
export type ItemField = 'codigo' | 'cod_producto_sunat' | 'cod_prod_sunat' | 'descripcion' | 'unidad' | 'cantidad' | 'precio_unitario' | 'valor_unitario'
  | 'descuento_pct' | 'tip_afe_igv';

/** Columnas de cada formulario. */
export const SALE_ITEM_FIELDS: ItemField[] = ['codigo', 'descripcion', 'unidad', 'cantidad', 'precio_unitario', 'tip_afe_igv'];
export const GUIDE_ITEM_FIELDS: ItemField[] = ['codigo', 'descripcion', 'unidad', 'cantidad'];
/** Emitir (entrega 3): con código SUNAT y, en comprobantes, descuento por ítem. */
export const SALE_EMIT_ITEM_FIELDS: ItemField[] = ['codigo', 'cod_producto_sunat', 'descripcion', 'unidad', 'cantidad', 'precio_unitario', 'descuento_pct', 'tip_afe_igv'];
export const NOTE_EMIT_ITEM_FIELDS: ItemField[] = ['codigo', 'cod_producto_sunat', 'descripcion', 'unidad', 'cantidad', 'precio_unitario', 'tip_afe_igv'];
export const GUIDE_EMIT_ITEM_FIELDS: ItemField[] = ['codigo', 'cod_prod_sunat', 'descripcion', 'unidad', 'cantidad'];
export const SETTLEMENT_ITEM_FIELDS: ItemField[] = ['codigo', 'cod_producto_sunat', 'descripcion', 'unidad', 'cantidad', 'valor_unitario', 'tip_afe_igv'];

/** Afectaciones que acepta la liquidación de compra. */
export const SETTLEMENT_IGV_OPTIONS: Option<string>[] = IGV_AFFECTATION_OPTIONS.filter((o) => ['10', '20', '30'].includes(o.id));

export interface EmissionItem {
  /** Clave local para `track` (no viaja a la API). */
  key: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: number | null;
  /** Precio de venta por unidad **con** IGV (como `/api/v1`). */
  precio_unitario: number | null;
  tip_afe_igv: string;
  /** Código de producto SUNAT (catálogo 25); va como `cod_producto_sunat` o `cod_prod_sunat` según la columna. */
  cod_sunat?: string;
  /** Valor unitario **sin** IGV (liquidación de compra). */
  valor_unitario?: number | null;
  /** Descuento por ítem en % (0–100). */
  descuento_pct?: number | null;
  /** Claves del ítem original que se conservan al enviar (p. ej. `cod_prod_sunat` de una guía, `oro` de una liquidación). */
  extra?: Json;
}

let seq = 0;
export function itemKey(): string {
  seq += 1;
  return `it-${seq}`;
}

export function emptyItem(unidad = 'NIU'): EmissionItem {
  return {
    key: itemKey(), codigo: '', descripcion: '', unidad, cantidad: 1, precio_unitario: null, tip_afe_igv: '10', cod_sunat: '', valor_unitario: null,
    descuento_pct: null
  };
}

/** ¿La columna es el código de producto SUNAT? */
export function isSunatCodeField(f: ItemField): f is 'cod_producto_sunat' | 'cod_prod_sunat' {
  return f === 'cod_producto_sunat' || f === 'cod_prod_sunat';
}

/**
 * Ítems de un comprobante (§9.2: `codigo, descripcion, unidad, cantidad, precio_unitario, valor_unitario, igv, total`). El
 * recurso no trae `tip_afe_igv`: con IGV > 0 es gravado (10); sin IGV queda sin elegir para que el usuario lo indique.
 * Solo para una API sin `datos_edicion` (§12.1); con ella se usa `editItemsFromData`.
 */
export function saleItemsFromResource(items: unknown): EmissionItem[] {
  return (Array.isArray(items) ? items : []).map((x) => {
    const i = obj(x);
    const igv = num(i['igv']) ?? 0;
    return {
      key: itemKey(), codigo: str(i['codigo']), descripcion: str(i['descripcion']), unidad: str(i['unidad']) || 'NIU', cantidad: num(i['cantidad']),
      precio_unitario: num(i['precio_unitario']), tip_afe_igv: str(i['tip_afe_igv']) || (igv > 0 ? '10' : ''),
      cod_sunat: str(i['cod_producto_sunat']), valor_unitario: null, descuento_pct: null
    };
  });
}

/** Ítems de una guía (el JSON guardado al emitirla): se conservan las claves que el formulario no muestra. */
export function guideItemsFromResource(items: unknown): EmissionItem[] {
  return (Array.isArray(items) ? items : []).map((x) => {
    const i = obj(x);
    const extra: Json = {};
    Object.entries(i).forEach(([k, v]) => {
      if (!['codigo', 'descripcion', 'unidad', 'cantidad'].includes(k) && v != null && v !== '') {
        extra[k] = v;
      }
    });
    return {
      key: itemKey(), codigo: str(i['codigo']), descripcion: str(i['descripcion']), unidad: str(i['unidad']) || 'NIU', cantidad: num(i['cantidad']),
      precio_unitario: null, tip_afe_igv: '', extra
    };
  });
}

/** El ítem como lo pide `/api/v1` (solo las columnas del formulario, más `extra`). */
export function itemToBody(item: EmissionItem, fields: ItemField[]): Json {
  const b: Json = { ...(item.extra ?? {}) };
  fields.forEach((f) => {
    if (f === 'codigo') {
      if (item.codigo.trim()) {
        b['codigo'] = item.codigo.trim();
      }
    } else if (isSunatCodeField(f)) {
      const code = (item.cod_sunat ?? '').trim();
      if (code) {
        b[f] = code;
      } else {
        delete b[f];
      }
    } else if (f === 'descuento_pct') {
      const pct = Number(item.descuento_pct ?? 0);
      if (pct > 0) {
        b['descuentos'] = [{ cod_tipo: '00', porcentaje: pct }];
      }
    } else if (f === 'cantidad' || f === 'precio_unitario' || f === 'valor_unitario') {
      const v = item[f];
      b[f] = v == null ? null : Number(v);
    } else {
      b[f] = str(item[f]).trim();
    }
  });
  return b;
}

// ---------------------------------------------------------------- Corregir con `datos_edicion` (§12.1)
/** Nombres del catálogo 07 completo: para mostrar una afectación guardada que el formulario de emisión no ofrece. */
const IGV_AFFECTATION_NAMES: Record<string, string> = {
  '10': 'Gravado', '11': 'Gravado – retiro por premio', '12': 'Gravado – retiro por donación', '13': 'Gravado – retiro',
  '14': 'Gravado – retiro por publicidad', '15': 'Gravado – bonificaciones', '16': 'Gravado – retiro por entrega a trabajadores', '17': 'Gravado – IVAP',
  '20': 'Exonerado', '21': 'Exonerado – transferencia gratuita', '30': 'Inafecto', '31': 'Inafecto – retiro por bonificación', '32': 'Inafecto – retiro',
  '33': 'Inafecto – retiro por muestras médicas', '34': 'Inafecto – retiro por convenio colectivo', '35': 'Inafecto – retiro por premio',
  '36': 'Inafecto – retiro por publicidad', '37': 'Inafecto – transferencia gratuita', '40': 'Exportación'
};

/** Afectaciones del formulario más las guardadas en los ítems que no están en la lista (p. ej. gratuitas), para no perderlas. */
export function igvOptionsWith(codes: string[]): Option<string>[] {
  const extra = [...new Set(codes.filter((c) => c && !IGV_AFFECTATION_OPTIONS.some((o) => o.id === c)))]
    .map((c) => ({ id: c, name: `${c} - ${IGV_AFFECTATION_NAMES[c] ?? 'Guardada'}` }));
  return [...IGV_AFFECTATION_OPTIONS, ...extra];
}

/** Columnas que el formulario de corrección muestra de cada ítem de `datos_edicion`. */
const EDIT_ITEM_KEYS = ['codigo', 'cod_producto_sunat', 'cod_prod_sunat', 'descripcion', 'unidad', 'cantidad', 'precio_unitario', 'tip_afe_igv'];

/**
 * Ítems de `datos_edicion` (§12.1): las columnas del formulario (con `tip_afe_igv` y el código SUNAT guardados) y, en
 * `extra`, **todas** las demás claves tal cual (también las `null`: `porcentaje_igv`, `descuentos`, `descuento`, ISC,
 * ICBPER…), para devolverlas sin tocar.
 */
export function editItemsFromData(items: unknown): EmissionItem[] {
  return (Array.isArray(items) ? items : []).map((x) => {
    const i = obj(x);
    const extra: Json = {};
    Object.entries(i).forEach(([k, v]) => {
      if (!EDIT_ITEM_KEYS.includes(k)) {
        extra[k] = v;
      }
    });
    return {
      key: itemKey(), codigo: str(i['codigo']), descripcion: str(i['descripcion']), unidad: str(i['unidad']) || 'NIU', cantidad: num(i['cantidad']),
      precio_unitario: num(i['precio_unitario']), tip_afe_igv: str(i['tip_afe_igv']), cod_sunat: str(i['cod_producto_sunat'] ?? i['cod_prod_sunat']),
      valor_unitario: null, descuento_pct: null, extra
    };
  });
}

/** El ítem de vuelta al `PUT`: las claves guardadas (`extra`) con las columnas del formulario encima; vacío → `null`. */
export function editItemToBody(item: EmissionItem, fields: ItemField[]): Json {
  const b: Json = { ...(item.extra ?? {}) };
  const textOrNull = (v: unknown) => (str(v).trim() ? str(v).trim() : null);
  fields.forEach((f) => {
    if (isSunatCodeField(f)) {
      b[f] = textOrNull(item.cod_sunat);
    } else if (f === 'codigo') {
      b['codigo'] = textOrNull(item.codigo);
    } else if (f === 'cantidad' || f === 'precio_unitario') {
      const v = item[f];
      b[f] = v == null ? null : Number(v);
    } else if (f === 'descripcion' || f === 'unidad' || f === 'tip_afe_igv') {
      b[f] = str(item[f]).trim();
    }
  });
  return b;
}

/** Nombres de las claves de un ítem que el formulario no muestra pero se devuelven (para avisarlo). */
const KEPT_ITEM_KEY_NAMES: Record<string, string> = {
  porcentaje_igv: 'tasa de IGV propia', descuentos: 'descuentos', descuento: 'descuento', tip_sis_isc: 'ISC', porcentaje_isc: 'ISC', isc: 'ISC',
  factor_icbper: 'ICBPER', icbper: 'ICBPER'
};

/** Qué conserva un ítem sin mostrarlo (solo las claves con valor), p. ej. `["descuentos", "ISC"]`. */
export function keptItemData(item: EmissionItem): string[] {
  const names = Object.entries(item.extra ?? {})
    .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k]) => KEPT_ITEM_KEY_NAMES[k] ?? k);
  return [...new Set(names)];
}

/** Resumen legible de un valor guardado (lista u objeto en snake_case) para mostrarlo de solo lectura. */
export function jsonSummary(value: unknown): string[] {
  const one = (v: unknown): string => {
    if (v == null || v === '') {
      return '';
    }
    if (typeof v !== 'object') {
      return String(v);
    }
    if (Array.isArray(v)) {
      return v.map(one).filter(Boolean).join('; ');
    }
    return Object.entries(v as Json).filter(([, x]) => x != null && x !== '').map(([k, x]) => `${k.replace(/_/g, ' ')}: ${one(x)}`).join(' · ');
  };
  if (Array.isArray(value)) {
    return value.map(one).filter(Boolean);
  }
  const s = one(value);
  return s ? [s] : [];
}

/** Opciones de validación de los ítems al emitir. */
export interface ItemRules {
  /** El código SUNAT es obligatorio (liquidación de compra). */
  sunatCodeRequired?: boolean;
}

/** Errores de los ítems con las claves de la API (`items.0.cantidad`); `items` si la lista está vacía. */
export function itemErrors(items: EmissionItem[], fields: ItemField[], prefix = 'items', rules: ItemRules = {}): Record<string, string> {
  const e: Record<string, string> = {};
  if (!items.length) {
    e[prefix] = 'Agregue al menos un ítem.';
  }
  items.forEach((it, i) => {
    const k = (f: string) => `${prefix}.${i}.${f}`;
    if (fields.includes('descripcion') && !it.descripcion.trim()) {
      e[k('descripcion')] = 'Indique la descripción.';
    } else if (it.descripcion.length > 500) {
      e[k('descripcion')] = 'Máximo 500 caracteres.';
    }
    if (fields.includes('unidad') && !it.unidad.trim()) {
      e[k('unidad')] = 'Indique la unidad.';
    }
    if (fields.includes('cantidad') && !((it.cantidad ?? 0) > 0)) {
      e[k('cantidad')] = 'La cantidad debe ser mayor que 0.';
    }
    if (fields.includes('precio_unitario') && (it.precio_unitario == null || it.precio_unitario < 0)) {
      e[k('precio_unitario')] = 'Indique el precio (0 o más).';
    }
    if (fields.includes('valor_unitario') && !((it.valor_unitario ?? 0) > 0)) {
      e[k('valor_unitario')] = 'El valor unitario debe ser mayor que 0.';
    }
    if (fields.includes('descuento_pct') && it.descuento_pct != null && (it.descuento_pct < 0 || it.descuento_pct > 100)) {
      e[k('descuento_pct')] = 'De 0 a 100 %.';
    }
    if (fields.includes('tip_afe_igv') && !it.tip_afe_igv) {
      e[k('tip_afe_igv')] = 'Elija la afectación del IGV.';
    }
    const codeField = fields.find(isSunatCodeField);
    if (codeField) {
      const code = (it.cod_sunat ?? '').trim();
      if (!code && rules.sunatCodeRequired) {
        e[k(codeField)] = 'Indique el código de producto SUNAT.';
      } else if (code && codeField === 'cod_producto_sunat' && !/^\d{8}$/.test(code)) {
        e[k(codeField)] = 'El código SUNAT tiene 8 dígitos (catálogo 25).';
      } else if (code && codeField === 'cod_producto_sunat' && code.endsWith('0000')) {
        e[k(codeField)] = 'Indique al menos la clase UNSPSC (no puede terminar en 0000).';
      }
    }
  });
  return e;
}

/** Línea estimada: base, IGV y total. */
export interface LineEstimate {
  base: number;
  igv: number;
  total: number;
}

/**
 * Estimado de la línea (vista previa, no oficial). Con `precio_unitario` el precio incluye el IGV en los gravados (como la
 * API: base = total / (1 + tasa)); con `valor_unitario` (liquidación) el IGV se suma a la base. El descuento % se aplica sobre
 * el importe de la línea. Exonerado, inafecto y exportación no llevan IGV.
 */
export function lineEstimate(item: EmissionItem, rate = ESTIMATE_IGV_RATE, withoutIgv = false): LineEstimate {
  const qtyValue = item.cantidad ?? 0;
  const factor = 1 - Math.min(Math.max(Number(item.descuento_pct ?? 0), 0), 100) / 100;
  const taxed = item.tip_afe_igv === '10';
  if (withoutIgv) {
    const base = qtyValue * (item.valor_unitario ?? 0) * factor;
    const igv = taxed ? base * rate : 0;
    return { base, igv, total: base + igv };
  }
  const total = qtyValue * (item.precio_unitario ?? 0) * factor;
  const base = taxed ? total / (1 + rate) : total;
  return { base, igv: total - base, total };
}

export function itemsEstimate(items: EmissionItem[], rate = ESTIMATE_IGV_RATE, withoutIgv = false): LineEstimate {
  return items.map((i) => lineEstimate(i, rate, withoutIgv))
    .reduce((a, l) => ({ base: a.base + l.base, igv: a.igv + l.igv, total: a.total + l.total }), { base: 0, igv: 0, total: 0 });
}

/** Vista previa por afectación (gravadas, exoneradas, inafectas, exportación), IGV y total. */
export interface TotalsPreview {
  gravadas: number;
  exoneradas: number;
  inafectas: number;
  exportacion: number;
  igv: number;
  total: number;
}

export function totalsPreview(items: EmissionItem[], rate = ESTIMATE_IGV_RATE, withoutIgv = false): TotalsPreview {
  const t: TotalsPreview = { gravadas: 0, exoneradas: 0, inafectas: 0, exportacion: 0, igv: 0, total: 0 };
  items.forEach((i) => {
    const l = lineEstimate(i, rate, withoutIgv);
    const key = i.tip_afe_igv === '10' ? 'gravadas' : i.tip_afe_igv === '20' ? 'exoneradas' : i.tip_afe_igv === '40' ? 'exportacion' : 'inafectas';
    t[key] += l.base;
    t.igv += l.igv;
    t.total += l.total;
  });
  return t;
}

/** Redondeo a 2 decimales (montos de la vista previa, detracción, cuotas). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Reparte un total en `n` cuotas de 2 decimales (la última absorbe el resto, como la referencia) con fechas cada 30 días
 * desde `fromYmd` (días de Lima, sin `new Date()`).
 */
export function splitInstallments(total: number, n: number, fromYmd: string, addDays: (ymd: string, d: number) => string): { monto: number; fecha_pago: string }[] {
  const count = Math.max(1, Math.min(36, Math.floor(n)));
  const each = Math.floor((total / count) * 100) / 100;
  return Array.from({ length: count }, (_, i) => ({
    monto: i === count - 1 ? round2(total - each * (count - 1)) : each,
    fecha_pago: addDays(fromYmd, 30 * (i + 1))
  }));
}

// ---------------------------------------------------------------- Cliente / tercero
export interface PartyValue {
  tipo_doc: string;
  num_doc: string;
  razon_social: string;
  direccion: string;
}

export function emptyParty(tipo = '6'): PartyValue {
  return { tipo_doc: tipo, num_doc: '', razon_social: '', direccion: '' };
}

/** Cliente, destinatario o remitente del recurso (`nombre` en el vendedor de una liquidación). */
export function partyFromResource(value: unknown, nameKey = 'razon_social'): PartyValue {
  const p = obj(value);
  return { tipo_doc: str(p['tipo_doc']), num_doc: str(p['num_doc']), razon_social: str(p[nameKey] ?? p['razon_social'] ?? p['nombre']), direccion: str(p['direccion']) };
}

/** El tercero como lo pide `/api/v1` (`direccion` solo si se pide y tiene valor). */
export function partyToBody(p: PartyValue, withAddress: boolean): Json {
  const b: Json = { tipo_doc: p.tipo_doc, num_doc: p.num_doc.trim(), razon_social: p.razon_social.trim() };
  if (withAddress && p.direccion.trim()) {
    b['direccion'] = p.direccion.trim();
  }
  return b;
}

/** Validación local con las claves de la API (`cliente.num_doc`…). */
export function partyErrors(p: PartyValue, prefix: string, allowedTypes?: string[]): Record<string, string> {
  const e: Record<string, string> = {};
  const n = p.num_doc.trim();
  if (!p.tipo_doc) {
    e[`${prefix}.tipo_doc`] = 'Elija el tipo de documento.';
  } else if (allowedTypes && !allowedTypes.includes(p.tipo_doc)) {
    e[`${prefix}.tipo_doc`] = 'Tipo de documento no permitido aquí.';
  }
  if (!n) {
    e[`${prefix}.num_doc`] = 'Indique el número de documento.';
  } else if (p.tipo_doc === '6' && rucError(n)) {
    e[`${prefix}.num_doc`] = rucError(n);
  } else if (p.tipo_doc === '1' && !/^\d{8}$/.test(n)) {
    e[`${prefix}.num_doc`] = 'El DNI tiene 8 dígitos.';
  } else if (n.length > 15) {
    e[`${prefix}.num_doc`] = 'Máximo 15 caracteres.';
  }
  if (!p.razon_social.trim()) {
    e[`${prefix}.razon_social`] = 'Indique la razón social o el nombre.';
  }
  return e;
}

/** ¿Dos valores son iguales para "solo lo que cambió"? (JSON con claves en el mismo orden). */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Errores que no tienen un campo en el formulario (se listan al final). */
export function otherErrors(errors: Record<string, string>, known: (key: string) => boolean): string[] {
  return Object.entries(errors).filter(([k]) => !known(k)).map(([, v]) => v);
}
