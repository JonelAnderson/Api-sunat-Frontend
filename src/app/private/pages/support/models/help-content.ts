/**
 * Contenido del Centro de ayuda del Panel API SUNAT (/private/help). Se mantiene aquí, separado de la pantalla.
 * - Las `url` son las del menú fijo de `GET admin/auth/menu` (Docs/api-sunat-panel-admin-diseno.md §5.1): el enlace "Ir a la
 *   pantalla" solo aparece si el usuario tiene esa pantalla en su menú; un módulo sin ninguna pantalla visible no se muestra.
 * - Textos verificados contra el contrato (§3 seguridad y roles, §5 endpoints, §10 fases A y B, §11 fase C y fase D §11.6–§11.8): si cambia una regla,
 *   actualizar aquí.
 */

export interface HelpTask {
  title: string;
  hint: string;
  url?: string;
}

export interface HelpModule {
  id: string;
  title: string;
  icon: string;
  summary: string;
  tasks: HelpTask[];
}

export interface HelpFaq {
  question: string;
  answer: string;
  /** Pantalla relacionada (opcional; solo se enlaza si está en el menú del usuario). */
  url?: string;
  urlLabel?: string;
}

export interface HelpStep {
  icon: string;
  title: string;
  text: string;
}

export interface HelpShortcut {
  keys: string;
  text: string;
}

/** Contacto de soporte. Vacíos = no se muestran (no se inventan teléfonos ni correos). */
export const SUPPORT_CONTACT: { email: string; phone: string; hours: string } = {
  email: '',
  phone: '',
  hours: ''
};

export const HELP_STEPS: HelpStep[] = [
  {
    icon: 'icon-shield',
    title: 'Ingrese con verificación en dos pasos',
    text: 'Con su correo y contraseña, y luego el código de 6 dígitos de su app autenticadora. La primera vez se configura con un código QR. Cada ingreso pide el código.'
  },
  {
    icon: 'icon-grid',
    title: 'Revise el tablero',
    text: 'Inicio resume empresas activas, comprobantes y rechazos del mes, pendientes, trabajos fallidos y certificados, y debajo las métricas globales: hoy, mes anterior, ventas en soles, los últimos 30 días, empresas por plan y los últimos envíos. Cada tarjeta lleva a su pantalla.'
  },
  {
    icon: 'icon-alert-triangle',
    title: 'Atienda lo que está en rojo',
    text: 'Trabajos fallidos, certificados vencidos o rotos y rechazos de SUNAT son lo primero que conviene revisar cada día.'
  },
  {
    icon: 'icon-help-circle',
    title: 'Use la ayuda de cada pantalla',
    text: 'El ícono de signo de pregunta junto al título explica qué muestra la pantalla y cómo se calculan sus datos.'
  }
];

/** El panel no tiene atajos de teclado propios (la sección se oculta si la lista está vacía). */
export const HELP_SHORTCUTS: HelpShortcut[] = [];

export const HELP_MODULES: HelpModule[] = [
  {
    id: 'issuers',
    title: 'Emisores',
    icon: 'icon-briefcase',
    summary: 'Empresas que emiten con la API SUNAT y sus certificados digitales.',
    tasks: [
      { title: 'Buscar una empresa', hint: 'Por RUC, razón social o nombre comercial; filtre por estado, ambiente (beta / producción) o plan.', url: '/private/sunat/tenants' },
      { title: 'Abrir la página de una empresa', hint: '"Ver empresa" en el listado: resumen y panel (ventas, estado SUNAT, cobranzas, alertas), comprobantes, otros comprobantes, configuración, credenciales y reportes.', url: '/private/sunat/tenants' },
      { title: 'Dar de alta una empresa', hint: '"Nueva empresa" en el listado (operador o superior): RUC (con "Consultar" para traer la razón social y la dirección de SUNAT), dirección y ubigeo, contacto, régimen, ambiente, plan (el cupo vacío = el del plan; un número queda como cupo del panel) y series por defecto. Al crearla se muestran una sola vez su api_key y su api_secret: cópielos o descargue el .txt antes de cerrar.', url: '/private/sunat/tenants' },
      { title: 'Editar los datos o el logo de una empresa', hint: 'En su página, "Editar datos" (se envía solo lo que cambió, con motivo opcional) y "Logo" (PNG, JPG o WEBP de hasta 2 MB). El RUC no se cambia; plan y estado tienen sus propios botones.', url: '/private/sunat/tenants' },
      { title: 'Cargar la clave SOL, el GRE o el certificado', hint: 'Pestaña Credenciales: se escriben y nunca se vuelven a mostrar (solo si están registradas). Certificado .pfx o .p12 de hasta 100 KB con su contraseña, que no se guarda.', url: '/private/sunat/tenants' },
      { title: 'Regenerar las credenciales API de una empresa', hint: 'Pestaña Credenciales → "Regenerar credenciales API": pide motivo y confirmación; las anteriores dejan de servir al instante y las nuevas se muestran una sola vez.', url: '/private/sunat/tenants' },
      { title: 'Administrar sucursales, series y clientes', hint: 'Pestaña Configuración: crear, editar, activar o desactivar y eliminar, con las mismas reglas de la API (código SUNAT único de 4 dígitos, serie de 4 caracteres, correlativo que no baja de lo emitido).', url: '/private/sunat/tenants' },
      { title: 'Eliminar una empresa', hint: 'Solo superadministrador: "Eliminar" en su página, con motivo y escribiendo el RUC. Es un borrado lógico: no borra comprobantes y el RUC queda reservado.', url: '/private/sunat/tenants' },
      { title: 'Revisar y descargar comprobantes de una empresa', hint: 'Pestaña Comprobantes u Otros comprobantes: filtre, abra el detalle (ítems, totales, estado SUNAT, pagos) y descargue el XML, el CDR o el PDF.', url: '/private/sunat/tenants' },
      { title: 'Suspender o activar una empresa', hint: 'Suspender pide motivo y la API responde 403 a esa empresa hasta activarla.', url: '/private/sunat/tenants' },
      { title: 'Cambiar el plan', hint: 'Plan (Free, Pro, Business), cupo del mes (vacío = el del plan) y modo de emisión, con motivo opcional. Rige de inmediato: es el plan efectivo de la empresa (crea o conserva su suscripción, asignada por el panel y sin cobro) y cancela las reducciones programadas. La página de la empresa muestra el plan que rige, el cupo, lo usado y la suscripción; si dice "plan sin sincronizar", vuelva a guardarlo.', url: '/private/sunat/tenants' },
      { title: 'Ver la vista unificada de una empresa', hint: 'Pestaña Comprobantes → "Todos los tipos": facturas, boletas, notas, guías, retenciones, percepciones, liquidaciones, resúmenes y bajas en una lista, con su resumen por tipo y estado. "Por tipo" conserva todos los filtros de la API.', url: '/private/sunat/tenants' },
      { title: 'Ver el PDF sin descargarlo', hint: 'En el detalle del documento o en el menú de la fila, "Vista previa del PDF" lo abre en una ventana (A4, A5 o ticket); "Descargar" guarda el mismo archivo.', url: '/private/sunat/tenants' },
      { title: 'Exportar un ZIP de comprobantes', hint: 'Pestaña Comprobantes → "Exportar ZIP": XML, PDF o ambos de facturas, boletas y notas; máximo 31 días, 2 000 archivos y 200 MB. Si el periodo es más grande, divídalo en meses.', url: '/private/sunat/tenants' },
      { title: 'Reenviar un comprobante a SUNAT', hint: 'Menú de la fila o detalle → "Reenviar a SUNAT" (cualquier documento que no esté aceptado ni anulado): pide motivo, usa las credenciales guardadas de la empresa y queda en la auditoría. Operador, superadministrador y soporte.', url: '/private/sunat/tenants' },
      { title: 'Anular o revertir un comprobante', hint: 'Solo aceptados. Factura y notas: comunicación de baja (RA); boleta: resumen de anulación (RC); retención y percepción: reversión (RR); liquidación de compra: reversión con causal. Plazo de 7 días desde la emisión (liquidación: 5 días y sin pagos). El motivo va a SUNAT (máximo 255; en liquidaciones de 3 a 100).', url: '/private/sunat/tenants' },
      { title: 'Refrescar el estado en SUNAT', hint: 'Para documentos pendientes o enviados: consulta en ese momento el CDR del comprobante o el ticket de la guía, del resumen o de la baja, y guarda la respuesta. Motivo opcional; queda en la auditoría.', url: '/private/sunat/tenants' },
      { title: 'Corregir y reenviar un rechazado', hint: 'Facturas, boletas y notas no aceptadas, y guías rechazadas o pendientes → "Corregir y reenviar": se llena con todo lo guardado (también la afectación del IGV de cada ítem, descuentos, ISC, ICBPER, descuentos globales, anticipos y percepción; en guías remitente, documentos relacionados, RUC y código de los locales, indicadores, vehículo, conductores, subcontratista, pagador del flete y autorización especial) y se reenvía completo con lo que corrija: no se pierde nada. Cuotas, detracción, guías, extras, leyenda, sucursal y número no se corrigen (se muestran de solo lectura). Motivo obligatorio. Operador o superadministrador.', url: '/private/sunat/tenants' },
      { title: 'Emitir un comprobante nuevo de una empresa', hint: 'En su página, botón "Emitir" (operador o superadministrador, con la empresa activa): factura, boleta, nota de crédito o de débito, guía remitente (09) o transportista (31), retención, percepción, liquidación de compra o resumen diario. Pasa por las mismas reglas de /api/v1 (validación, cupo del plan, correlativo, envío a SUNAT) y queda en la auditoría; el motivo es opcional.', url: '/private/sunat/tenants' },
      { title: 'Emitir una nota de crédito o de débito desde un comprobante', hint: 'En el detalle de una factura o boleta aceptada, "Emitir nota de crédito / débito": el formulario llega con el documento que modifica, el cliente, la moneda y los ítems copiados; según el motivo solo se editan las columnas que corresponden (por ejemplo, cantidades en la devolución por ítem). En el formulario también está "Traer datos del comprobante" por serie y correlativo.', url: '/private/sunat/tenants' },
      { title: 'Buscar el código de producto SUNAT', hint: 'En los ítems, la lupa junto a "Cód. SUNAT" busca en el catálogo 25 por texto o código, o por segmento, familia y clase. Es obligatorio en las liquidaciones de compra y para las empresas del padrón de SUNAT.', url: '/private/sunat/tenants' },      { title: 'Ver la constancia de anulación', hint: 'En el detalle de una factura, boleta o nota anulada: la comunicación de baja (RA) o el resumen de anulación (RC), con su estado SUNAT, XML y CDR.', url: '/private/sunat/tenants' },
      { title: 'Buscar comprobantes de todas las empresas', hint: 'Comprobantes: todos los tipos y empresas en una lista, con resumen por tipo y estado. Sin empresa ni fechas muestra los últimos 30 días; rango máximo 366 días.', url: '/private/sunat/documents' },
      { title: 'Ver sucursales de todas las empresas', hint: 'Filtre por empresa, estado o texto. Para editarlas, "Ver empresa" abre su configuración.', url: '/private/sunat/branches' },
      { title: 'Revisar series y correlativos', hint: 'Último correlativo y el siguiente número de cada serie, por empresa y tipo. Se editan en la configuración de cada empresa.', url: '/private/sunat/series' },
      { title: 'Revisar certificados', hint: 'Vigente, por vencer, vencido, roto o sin certificado; puede cambiar los días de aviso.', url: '/private/sunat/certificates' }
    ]
  },
  {
    id: 'operation',
    title: 'Operación',
    icon: 'icon-activity',
    summary: 'Uso del mes, rechazos de SUNAT, trabajos fallidos de la cola y salud del servicio.',
    tasks: [
      { title: 'Seguir los envíos a SUNAT', hint: 'Envíos SUNAT: lo último enviado de todas las empresas y en todos los estados, del más reciente al más antiguo. Siempre con un rango de fechas (por defecto 30 días, máximo 366).', url: '/private/sunat/submissions' },
      { title: 'Ver el uso del mes', hint: 'Emitidos, aceptados, rechazados, pendientes y anulados por empresa; elija el mes.', url: '/private/sunat/usage' },
      { title: 'Consultar un comprobante en SUNAT (en vivo)', hint: 'Consulta CPE: elija la empresa y escriba tipo, serie, correlativo, fecha e importe; o consulte el CDR. También desde el detalle de cada documento. Queda en la auditoría y cuenta en el límite por minuto.', url: '/private/sunat/cpe-query' },
      { title: 'Revisar rechazos de SUNAT', hint: 'Código y motivo de SUNAT por comprobante; por defecto los últimos 7 días. "Ver comprobante" abre la empresa en Comprobantes con ese documento.', url: '/private/sunat/rejections' },
      { title: 'Reintentar trabajos fallidos', hint: 'Uno por uno o todos a la vez (requiere el permiso de reintentar).', url: '/private/sunat/jobs' },
      { title: 'Ver la salud del servicio', hint: 'Base de datos, Redis, cola, programador y conexión con SUNAT beta y producción.', url: '/private/sunat/health' }
    ]
  },
  {
    id: 'platform',
    title: 'Plataforma',
    icon: 'icon-package',
    summary: 'Planes de suscripción y configuración global de emisión.',
    tasks: [
      { title: 'Ver los planes', hint: 'Precio, documentos por mes, funcionalidades, suscripciones y empresas de cada plan; el detalle muestra sus límites.', url: '/private/platform/plans' },
      { title: 'Crear, editar o desactivar un plan', hint: 'Requiere el permiso de planes (operador o superior). Un plan inactivo no se ofrece en /api/v1/planes. Free, Pro y Business no cambian de slug.', url: '/private/platform/plans' },
      { title: 'Eliminar un plan', hint: 'Solo superadministrador y solo planes sin suscripciones; los del sistema no se eliminan.', url: '/private/platform/plans' },
      { title: 'Encender o apagar la emisión ilimitada global', hint: 'Configuración de emisión (solo superadministrador): cambia el cobro de todas las empresas y pide un motivo.', url: '/private/platform/settings' },
      { title: 'Configurar el token de consulta RUC / DNI', hint: 'Se guarda cifrado y nunca se vuelve a mostrar (solo si está configurado y, si es largo, sus 4 últimos caracteres). Para cambiarlo, escriba uno nuevo.', url: '/private/platform/settings' }
    ]
  },
  {
    id: 'admin',
    title: 'Administración',
    icon: 'icon-settings',
    summary: 'Administradores del panel y auditoría (solo superadministrador).',
    tasks: [
      { title: 'Crear o editar administradores', hint: 'Nombre, correo y rol (superadministrador, operador, soporte o solo lectura); al crear se asigna una contraseña inicial.', url: '/private/admin/users' },
      { title: 'Restablecer el acceso de un administrador', hint: 'Contraseña temporal, restablecer la verificación en dos pasos o desbloquear.', url: '/private/admin/users' },
      { title: 'Revisar la auditoría', hint: 'Acciones del panel, de las empresas por la API y del sistema, con logins y bloqueos.', url: '/private/admin/audit' }
    ]
  }
];

export const HELP_FAQ: HelpFaq[] = [
  {
    question: '¿Qué pasa cuando suspendo una empresa?',
    answer:
      'La API responde 403 a todas sus peticiones (no emite ni consulta) hasta que se active. El motivo queda en la empresa (se ve al pasar el mouse por el estado) y en la auditoría. Al activarla se limpian el motivo y la fecha de suspensión.',
    url: '/private/sunat/tenants',
    urlLabel: 'Ir a Empresas'
  },
  {
    question: '¿Qué veo en la página de una empresa?',
    answer:
      'Lo mismo que la empresa ve con su API: comprobantes (también en una vista unificada de todos los tipos), guías, retenciones, resúmenes, anulaciones, su panel, su configuración (sin claves ni certificados) y sus reportes, más la exportación ZIP y la constancia de anulación. Con el permiso de edición también se cambian sus datos, logo, credenciales, sucursales, series y clientes. Las consultas, descargas y cambios quedan en la auditoría. Si un botón de XML o CDR no aparece, la API todavía no tiene ese archivo (sin firmar o sin respuesta de SUNAT).',
    url: '/private/sunat/tenants',
    urlLabel: 'Ir a Empresas'
  },
  {
    question: 'Cerré el aviso y no copié el api_secret, ¿dónde lo veo?',
    answer:
      'En ningún lado: el api_secret solo se muestra en la respuesta del alta o de "Regenerar credenciales API" y el panel no lo guarda (tampoco la auditoría ni el correo). Si se perdió, regenérelas desde la pestaña Credenciales; las anteriores dejan de servir y la empresa debe configurar las nuevas en sus sistemas.',
    url: '/private/sunat/tenants',
    urlLabel: 'Ir a Empresas'
  },
  {
    question: '¿Por qué no veo la clave SOL ni el client_secret guardados?',
    answer:
      'Son de solo escritura: la API nunca los devuelve. La pestaña Credenciales solo dice si están registrados (y los datos del certificado: titular, emisor y vigencia). Para cambiarlos, escriba los nuevos; reemplazan a los anteriores.',
    url: '/private/sunat/tenants',
    urlLabel: 'Ir a Empresas'
  },
  {
    question: '¿Qué significa "modo de emisión"?',
    answer:
      '"Según el plan" aplica el cupo de comprobantes del mes y la vigencia de la suscripción. "Ilimitada" no aplica cupo. En el ambiente beta (pruebas) y con la emisión ilimitada global la API tampoco limita la emisión. El cupo es el del panel si se puso uno en "Cambiar plan" (manda aunque el plan sea ilimitado) o, si está vacío, el del plan que rige.',
    url: '/private/sunat/tenants',
    urlLabel: 'Ir a Empresas'
  },
  {
    question: '¿Qué cuenta el uso del mes?',
    answer: 'Facturas, boletas, notas de crédito y notas de débito por su fecha de emisión dentro del mes elegido (hora de Lima).',
    url: '/private/sunat/usage',
    urlLabel: 'Ir a Uso del mes'
  },
  {
    question: '¿Cuándo un certificado sale "por vencer"?',
    answer:
      'Cuando vence dentro de los días de aviso configurados en la API (puede cambiarlos en el filtro de la pantalla). "Roto" significa que el archivo o su contraseña no se pueden leer: la empresa debe volver a subirlo.',
    url: '/private/sunat/certificates',
    urlLabel: 'Ir a Certificados'
  },
  {
    question: 'Reintenté un trabajo y volvió a fallar.',
    answer:
      'Reintentar lo vuelve a poner en su cola con los mismos datos. Si la causa sigue (SUNAT caído, certificado vencido, datos del comprobante), fallará de nuevo: revise el error y la pantalla de Salud antes de reintentar.',
    url: '/private/sunat/jobs',
    urlLabel: 'Ir a Trabajos fallidos'
  },
  {
    question: '¿Qué puede hacer cada rol?',
    answer:
      'Superadministrador: todo, también administradores, auditoría, configuración global de emisión y eliminar planes. Operador: todo lo demás (alta y edición de empresas, credenciales, sucursales, series y clientes, planes, reintentos, consultas en vivo, y emitir, reenviar, anular, refrescar y corregir comprobantes); eliminar una empresa es solo del superadministrador. Soporte: lee todo menos la auditoría, consulta SUNAT en vivo y, sobre los comprobantes, solo reenvía, anula y refresca (no corrige, no emite ni edita datos de empresas). Al actualizar una base de API-PRO que aún no tenía el panel, sus usuarios "soporte" siguen siendo soporte; si la base ya se había actualizado antes y quedaron como "solo lectura", reasígnelos en Administradores. Solo lectura: solo los datos guardados, sin escrituras ni consultas en vivo a SUNAT.',
    url: '/private/admin/users',
    urlLabel: 'Ir a Administradores'
  },
  {
    question: '¿Por qué el botón "Anular" aparece deshabilitado?',
    answer:
      'Porque la API no lo permitiría: venció el plazo (7 días calendario desde la emisión para facturas, boletas y notas; 5 días para una liquidación de compra), la liquidación tiene pagos, o la empresa está suspendida. Pasado el plazo, una factura o boleta se corrige con una nota de crédito. Además la API rechaza la baja si el comprobante tiene una nota de crédito vigente o ya tiene otra baja: su mensaje se muestra en la ventana.',
    url: '/private/sunat/tenants',
    urlLabel: 'Ir a Empresas'
  },
  {
    question: 'Anulé una factura y sigue "Anulación en proceso".',
    answer:
      'La comunicación de baja (o el resumen de anulación de una boleta) se envía a SUNAT y queda esperando su respuesta. Abra la baja (Otros comprobantes → Anulaciones o Resúmenes, o "Ver su detalle" en la constancia de anulación) y use "Refrescar estado (SUNAT)", o espere a que la cola la consulte.',
    url: '/private/sunat/tenants',
    urlLabel: 'Ir a Empresas'
  },
  {
    question: 'Se cortó la conexión al emitir, ¿se emitió o no?',
    answer:
      'Cada emisión lleva una clave de idempotencia. Si no llegó la respuesta (sin conexión, tiempo agotado, error del servidor o "emisión en curso"), use "Reintentar la misma emisión" sin cambiar nada: si ya se había emitido, la API devuelve ese mismo comprobante (lo indica en el resultado) y no emite otro. Si cambia el formulario, la emisión va con otra clave y podría quedar un segundo comprobante.',
    url: '/private/sunat/tenants',
    urlLabel: 'Ir a Empresas'
  },
  {
    question: '¿Los totales del formulario de emisión son los oficiales?',
    answer:
      'No: son una vista previa con la tasa del IGV de la empresa (el precio unitario incluye el IGV en los gravados; en la liquidación de compra se ingresa el valor sin IGV). La API calcula los totales, la leyenda y la retención de renta al emitir; el resultado y el detalle muestran los oficiales.',
    url: '/private/sunat/tenants',
    urlLabel: 'Ir a Empresas'
  },
  {
    question: 'La emisión dice que se alcanzó el límite de documentos.',
    answer:
      'El cupo de la empresa se agotó este mes (o su suscripción venció). En su página, "Plan efectivo, cupo y suscripción" muestra el cupo, de dónde sale (del panel o del plan) y lo usado. Cambie el plan, el cupo o el modo de emisión con "Cambiar plan" (rige de inmediato) y vuelva a emitir; en beta no hay cupo.',
    url: '/private/sunat/tenants',
    urlLabel: 'Ir a Empresas'
  },  {
    question: '¿Qué pasa si la empresa está suspendida?',
    answer:
      'No se emiten, reenvían, anulan, refrescan ni corrigen sus comprobantes: en su página esos botones quedan deshabilitados (y no se ofrece "Emitir") y la API responde 403 con el aviso. Sí se pueden editar sus datos y credenciales. Actívela para operar sus comprobantes.',
    url: '/private/sunat/tenants',
    urlLabel: 'Ir a Empresas'
  },
  {
    question: '¿La Consulta CPE cambia el estado del comprobante?',
    answer:
      'No. Pregunta a SUNAT en ese momento, con las credenciales guardadas de la empresa (usted no las ve), y muestra la respuesta sin guardarla (para guardar el estado use "Refrescar estado (SUNAT)" en el documento). Queda en la auditoría y cuenta en el límite por minuto de la empresa y en el suyo (20 por minuto): si se agota, espere un minuto. El rol Solo lectura no puede usarla.',
    url: '/private/sunat/cpe-query',
    urlLabel: 'Ir a Consulta CPE'
  },
  {
    question: 'El ZIP no se descarga: dice que supera el tope.',
    answer:
      'Desde el panel un ZIP abarca como máximo 31 días, 2 000 archivos y 200 MB. Divida el periodo (por ejemplo, por quincenas) o elija solo XML o solo algunos tipos de comprobante.',
    url: '/private/sunat/tenants',
    urlLabel: 'Ir a Empresas'
  },
  {
    question: '¿Por qué no puedo eliminar el plan Free, Pro o Business?',
    answer:
      'Son planes del sistema: las empresas guardan su plan con uno de esos tres nombres y la API busca Free por su slug. Se pueden editar (precio, límites, funcionalidades) y desactivar, pero no cambian de slug ni se eliminan. Un plan con suscripciones tampoco se elimina.',
    url: '/private/platform/plans',
    urlLabel: 'Ir a Planes'
  },
  {
    question: '¿Puedo ver el token de consulta RUC / DNI que se guardó?',
    answer:
      'No. Se guarda cifrado y nunca vuelve al panel (tampoco a la auditoría ni a los registros). Solo se muestra si está configurado, su origen y, si es largo, sus 4 últimos caracteres. Para cambiarlo, escriba uno nuevo.',
    url: '/private/platform/settings',
    urlLabel: 'Ir a Configuración de emisión'
  },
  {
    question: '¿Cómo cambio mi nombre o mi correo?',
    answer:
      'En Mi cuenta → "Editar nombre y correo", confirmando con su contraseña actual (una contraseña incorrecta cuenta como intento fallido). El correo es su usuario para ingresar y no puede repetirse. Su sesión sigue abierta.'
  },
  {
    question: 'Cambié o perdí mi teléfono con la app autenticadora, ¿cómo ingreso?',
    answer:
      'En el paso del código elija "Usar un código de recuperación" y escriba uno de los códigos que guardó (cada uno sirve una vez). Si no los tiene, pida a un superadministrador que restablezca su verificación en dos pasos.'
  },
  {
    question: 'Olvidé mi contraseña.',
    answer:
      'El panel no envía correos de recuperación: pida a un superadministrador una contraseña temporal desde Administradores y luego cámbiela en Mi cuenta.'
  },
  {
    question: 'Mi cuenta quedó bloqueada.',
    answer:
      'Después de 5 contraseñas o códigos fallidos la cuenta se bloquea por 15 minutos. Espere ese tiempo o pida a un superadministrador que la desbloquee.',
    url: '/private/admin/users',
    urlLabel: 'Ir a Administradores'
  },
  {
    question: '¿Qué contraseña puedo usar?',
    answer: 'De 8 a 64 caracteres, con al menos una mayúscula, una minúscula, un número y un carácter especial.'
  },
  {
    question: 'Me sacó del panel sin cerrar sesión.',
    answer:
      'La sesión dura 30 minutos y se renueva sola mientras use el panel. Se cierra en todos sus dispositivos si cambia su contraseña, si un superadministrador le asigna una temporal, restablece su verificación o lo desactiva, o si cierra sesión en otro equipo.'
  }
];
