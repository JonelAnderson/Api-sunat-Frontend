# Panel API SUNAT (frontend) — reglas para el agente

Frontend Angular 22 (zoneless) del panel **interno** con el que el equipo administra **todas** las empresas emisoras de la API
SUNAT (`Source-code/API-SUNAT`, Spring Boot). Habla **directo** con la API (`/api/admin/**`), sin pasar por la consola de
plataforma. Contrato y pantallas: `Docs/api-sunat-panel-admin-diseno.md` (§5 endpoints y campos, §6 pantallas, §9 vistas de
empresa, §10 fases A y B: rol `soporte`, matriz rol × permiso, comprobantes, envíos, catálogos, consultas en vivo, planes,
configuración de emisión y perfil propio; §11 fases C y D). Nació el 2026-11-23 como copia de `Admin-saas-Frontend` (que a
su vez viene de `ERP-Frontend`). **Fase C hecha en el frontend** (2026-11-24, entrega 1 de 3: alta / edición / logo /
eliminación de empresas, credenciales de solo escritura, sucursales, series y clientes, §11.3–§11.5 y §11.9). **Fase D,
entrega 2 hecha** (2026-11-24: reenviar, anular / revertir, refrescar y corregir y reenviar, §11.8). **Entrega 3 hecha**
(2026-11-24: emitir documentos nuevos con `Idempotency-Key`, §11.6–§11.7 y §11.9; ver "Emitir"). **§12 hecho** (2026-11-24:
corregir y reenviar con `datos_edicion`, plan efectivo y cupo del panel; ver "Acciones sobre documentos" y "Empresas").

## Reglas generales

- Hablar con el usuario en español. No usar git. Leer un archivo completo antes de borrarlo o sobrescribirlo.
- Varios archivos usan `\r\n`: editar con la herramienta Edit o con un script de node que respete el fin de línea (no hay
  python).
- `eslint` marca `prefer-inject` en los constructores: es el estilo heredado del ERP, no un error nuevo.
- Programar contra el contrato: rutas, nombres de campo (camelCase), permisos y el sobre
  `{ succeeded, messages, data, totalRecords, errors }`. Un dato que el contrato no trae no se inventa: se deja fuera.
  **Excepción:** en las vistas de empresa (§9, `admin/tenants/{id}/…`) `data` es el recurso de `/api/v1` tal cual, en
  **snake_case**: no se mapea a camelCase; se lee con `obj` / `arr` / `str` / `num` de `sunat/models/tenant-views.models.ts`.
  Lo mismo las consultas en vivo (`tenants/{id}/consultar-cpe|cdr`, §10.5). En cambio la vista unificada, su resumen, la
  constancia de anulación, sucursales / series globales, planes y configuración (§10.3–§10.6) son del panel: camelCase.
- Nunca se muestran secretos (clave SOL, certificado, `api_secret`, `client_secret`, tokens): la API no los devuelve. Las
  credenciales de la empresa son **de solo escritura** (inputs vacíos, `password`, nunca prellenados, se borran al guardar).
- **Credenciales API de una sola vez:** `apiKey` / `apiSecret` solo llegan en la respuesta del alta (`POST tenants`) y de
  "Regenerar" (`POST tenants/{id}/credenciales/regenerar`). Pasan directo de la respuesta a `ApiCredentialsModalComponent`
  (`openApiCredentials`): copiar, descargar .txt, aviso fuerte y casilla "Ya los guardé" obligatoria para cerrar (sin Esc ni
  clic afuera); al cerrar se borran del componente. Nunca en signals de otras pantallas, servicios, localStorage ni
  sessionStorage.
- Permisos y menú solo en memoria (`SessionBootstrapService`); en localStorage solo los tokens. El JWT no lleva datos
  personales: nombre / correo / rol salen de `GET admin/auth/me` (`CurrentUserProfileService`).

## Lo que se quitó de la consola

- **Comercial** (`private/pages/billing`: clientes, suscripciones, pagos, planes) y la **administración de la consola**
  (usuarios, roles, menús y auditoría contra la identidad del ERP). Sus ayudantes genéricos pasaron a `shared/`.
- **"Olvidé mi contraseña"** (ruta, enlace y endpoints): la restablece un superadmin con una contraseña temporal.
- **"Recordar este dispositivo"** (casilla y `deviceToken`): la API no lo admite, cada login pide el código.
- Selector de idioma y su `Preferences/changeLanguage`, `UserNameService` / `userName` pipe (`identity/user/Names`),
  `jwt-roles`, `IdTransferService`, `feature-page-shell` y utilidades del ERP sin uso.
- **No es multiempresa:** sin selector de empresa / sucursal ni cabeceras `X-Company-Id` / `X-Branch-Id`. No agregarlos.

## Lo que se conserva (mismo comportamiento)

- **Login con MFA TOTP obligatorio** (`sign-in` + `mfa-setup` con QR y códigos de recuperación), `AuthService` (ticket MFA solo
  en memoria, renovación 2 min antes de vencer con una sola petición, logout con `fetch` keepalive) y `AuthInterceptor`
  (login y refresh van sin bearer; ante 401 renueva una vez y repite). Endpoints en `shared/apis/endpoint.ts` (`admin/auth/...`).
- `app-list-table` (el servicio expone `GetAll(size, page, getInputs)`; tamaños 10 / 20 / 50, el tope del contrato; sin
  cursor `lastId`), `app-page-header`, filtros (`app-filter-by-state`, `app-filter-select`, `app-filter-date-range-ymd`,
  `app-search-box-multiple`), `AlertModalService` y `RoleGuard` (`data.requiredPermission`).
- Menú lateral desde `GET admin/auth/menu` (`MenuNavService`, forma `MenuNavApiItem`).

## Piezas comunes

- `shared/functions/list-helpers.ts`: `col`, `actionsCol`, `STATE_MENU`, `query`, `listUrl`, `rows`, `openModal`, `runAction`,
  `serverMessages`, `formatNumber`.
- `shared/functions/lima-dates.ts`: días `yyyy-MM-dd` (Lima) sin pasar por `new Date()` (`ymdToDisplay`, `limaTodayYmd`,
  `limaMonthYm`, `addDaysYmd`, `ymToDisplay`) e instantes ISO-8601 UTC mostrados en hora de Lima (`isoToLima`).
- `shared/components/reusables/reason-modal`: motivo obligatorio u opcional (`required`).
- `FileDownloadService`: `download(url, nombre, params)` (muestra los `messages` del sobre si llega JSON o un error),
  `fetchBlob` (sin avisos: el blob o `{ error, status }`; lo usa la vista previa del PDF), `saveBlob` y `base64ToBlob` (el CDR de
  la consulta en vivo llega en base64).
- `sunat/components/common/tenant-picker` (`app-tenant-picker`): selector de empresa con búsqueda en el servidor
  (`GET tenants?textFilter=`, 20 filas). Nunca cargar todas las empresas.
- `lima-dates.daysInRangeYmd(desde, hasta)`: días del rango contando los extremos (topes de 366 y 31 días).
- Política de contraseña (`shared/validators/password-policy.ts`): 8–64 caracteres con mayúscula, minúscula, número y especial.
- Fase C: `TenantAdminService` (`sunat/services/tenant-admin.service.ts`: todas las escrituras de §11.3–§11.5 y
  `buscar-documento`), `UbigeoService` + `app-ubigeo-select` (`sunat/components/common`: región → provincia → distrito de
  `catalogos/ubigeo/…`, caché en memoria; si el catálogo falla deja escribir el ubigeo), `ApiCredentialsModalComponent`, y en
  `sunat/models/tenant-admin.models.ts` `rucError` (módulo 11 y prefijos 10 / 15 / 16 / 17 / 20, con los mensajes de la API),
  `seriesError` y `fieldErrors` (`errors[]` → mapa por `propertyName`). `app-view-block` acepta acciones por fila
  (`ViewRow.actions` + `data`, salida `rowAction`).
- Fase D (entrega 2): `sunat/models/document-actions.models.ts` (funciones puras: `ActionTarget` desde una fila / detalle de §9
  con `targetFromResource` o desde la fila común con `targetFromRow`; `docActions` = acciones visibles, habilitadas o con su
  motivo; `voidInfo` / `voidBlockReason` = mecanismo RA / RC / RR, plazo y bloqueos; `actionHttpError` para 0 / 403 / 404 /
  409 / 429 / 503; `actionSuccessText`), `TenantAdminService.resendDocument` / `voidDocument` / `refreshDocument` /
  `fixDocument`, y `sunat/components/document-actions/`: `runDocAction(modal, alerts, target, acción)` (abre el modal, avisa
  con los `messages` del sobre y devuelve `true` si cambió), `docTableActions` + `tableDocAction` (menú de `app-list-table`,
  ids `doc:fix|resend|refresh|void`), `DocActionModalComponent` (reenviar / anular / refrescar) y los formularios
  `SaleFixFormComponent` / `GuideFixFormComponent`. `ListTableComponent.reload()` vuelve a pedir la página actual.
- **Piezas para emitir (entrega 3)**, `sunat/components/emission/`: `emission.models.ts` (catálogos: unidades, afectación del
  IGV, monedas, forma de pago, motivos de NC (09) y ND (10), motivo y modalidad de traslado, documentos relacionados de la
  GRT; `EmissionItem` con `saleItemsFromResource` / `guideItemsFromResource` / `itemToBody` / `itemErrors`, estimado con
  IGV 18 % dentro del precio; `PartyValue` con `partyFromResource` / `partyToBody` / `partyErrors`; `sameJson`,
  `otherErrors`), `app-item-grid` (`[(items)]`, `fields`, errores `items.N.campo`) y `app-party-block` (`[(value)]`,
  `prefix` de los errores, "Consultar" con `buscar-documento`). Entrega 3 los amplió: catálogos de emisión (tipo de
  operación 51, detracción 54 con tasa, medio de pago 59, percepción 22, retención 23, métodos de pago, catálogo 60, oro 55,
  pagador del flete); columnas `cod_producto_sunat` / `cod_prod_sunat` (lupa → `ProductSunatModalComponent`, catálogo 25),
  `valor_unitario` (sin IGV, liquidación) y `descuento_pct` (→ `descuentos: [{ cod_tipo: "00", porcentaje }]`); entradas
  `rate` (tasa de la empresa en %), `igvTypes`, `lockedFields`, `allowAdd` / `allowRemove`, `sunatCodeRequired`; vista previa
  por afectación (`totalsPreview`), `round2`, `splitInstallments` (cuotas). Los motivos de NC / ND son solo los códigos que
  acepta `/api/v1` (`@SunatCatalog:09` = 01–09; `:10` = 01, 02, 03, 11, 12, 13).

## Pantallas

Permisos de `GET admin/auth/permissions` (§3; matriz rol × permiso en §10.2). Constantes en `sunat/models/sunat.models.ts`
(`PERM`). Roles: `superadmin`, `operador`, `soporte` (lee todo menos la auditoría y consulta SUNAT en vivo; solo escribe reenviar,
anular y refrescar documentos) y `lectura` (solo datos guardados, sin consultas en vivo ni escrituras). La UI oculta cada escritura sin su permiso; la API además
responde 403.

| Pantalla | Ruta | Permiso de la ruta | Escrituras / acciones | Componente |
| --- | --- | --- | --- | --- |
| Inicio (tablero) | `/private/home` | — (el tablero solo con `Admin.Dashboard.View`) | — | `home/components/home` |
| Empresas | `/private/sunat/tenants` | `Admin.Tenants.View` | suspender / activar, cambiar plan: `Admin.Tenants.Manage`; "Nueva empresa": `Admin.Tenants.Edit` | `sunat/components/tenants/*` (`tenant-form`: alta y edición) |
| Página de la empresa | `/private/sunat/tenants/:id` (carga diferida) | `Admin.Tenants.View` | las mismas de Empresas; ZIP (`Admin.Tenants.View`); consultas en vivo `Admin.Sunat.Query`; editar datos, logo, sucursales / series / clientes: `Admin.Tenants.Edit`; credenciales (SOL, GRE, certificado, regenerar): `Admin.Tenants.Credentials`; eliminar: `Admin.Tenants.Delete` (solo superadmin); acciones sobre documentos (ver "Acciones sobre documentos") | `sunat/components/tenant-page/*` |
| Emitir (de una empresa) | `/private/sunat/tenants/:id/emitir/:tipo` (diferida) | `Admin.Documents.Issue` | emitir los 10 tipos de §11.7 (ver "Emitir") | `sunat/components/emission/*` (`EmissionPageComponent`) |
| Comprobantes | `/private/sunat/documents` (diferida) | `Admin.Tenants.View` | acciones sobre documentos (fila común) | `sunat/components/documents/*` (`DocumentListComponent`) |
| Sucursales | `/private/sunat/branches` (diferida) | `Admin.Tenants.View` | — (se editan en la Configuración de la empresa) | `sunat/components/catalogs/catalog-lists` |
| Series | `/private/sunat/series` (diferida) | `Admin.Tenants.View` | — | `sunat/components/catalogs/catalog-lists` |
| Certificados | `/private/sunat/certificates` | `Admin.Certificates.View` | — | `certificate-list` |
| Envíos SUNAT | `/private/sunat/submissions` (diferida) | `Admin.Rejections.View` | acciones sobre documentos (fila común) | `sunat/components/documents/*` (`SubmissionListComponent`) |
| Uso del mes | `/private/sunat/usage` | `Admin.Usage.View` | — | `usage-list` |
| Rechazos SUNAT | `/private/sunat/rejections` | `Admin.Rejections.View` | — | `rejection-list` |
| Consulta CPE | `/private/sunat/cpe-query` (diferida) | `Admin.Sunat.Query` | consultas en vivo (auditadas) | `sunat/components/cpe-query/*` |
| Trabajos fallidos | `/private/sunat/jobs` | `Admin.Jobs.View` | reintentar uno / todos: `Admin.Jobs.Retry` | `job-list` |
| Salud | `/private/sunat/health` | `Admin.Health.View` | — | `health` |
| Planes | `/private/platform/plans` (diferida) | `Admin.Plans.View` | crear / editar / activar: `Admin.Plans.Manage`; eliminar: `Admin.Plans.Delete` | `platform/plans/*` |
| Configuración de emisión | `/private/platform/settings` (diferida) | `Admin.Settings.View` | todo: `Admin.Settings.Manage` (solo superadmin) | `platform/settings/platform-settings` |
| Administradores | `/private/admin/users` | `Admin.Users.Manage` | todas (solo superadmin) | `admin/users/*` |
| Auditoría | `/private/admin/audit` | `Admin.Audit.View` | — | `admin/audit/audit-list` |
| Mi cuenta | `/private/account` | — | editar nombre y correo, cambiar contraseña, regenerar códigos | `account/*` (menú del usuario en la barra) |
| Ayuda | `/private/help` | — | — | `support` (contenido en `support/models/help-content.ts`) |

### Acciones sobre documentos (fase D, entrega 2, §11.8)

Dónde: menú de cada fila de Comprobantes (vista "Todos los tipos" y "Por tipo"), Otros comprobantes, las vistas globales
Comprobantes y Envíos SUNAT (la fila común trae `tenantId`, `vista`, `id`, `tipo`, estado y fecha) y el detalle de cada
documento (sección "Acciones ante SUNAT"; también el que se abre desde el tablero o el panel de la empresa). Rutas
`POST|PUT tenants/{id}/{vista}/{docId}/…`; todas devuelven en `data` el recurso de `/api/v1` (snake_case); sin
`Idempotency-Key`.

| Acción | Permiso (roles) | Tipos (vista) | Cuándo se muestra | Ruta y cuerpo |
| --- | --- | --- | --- | --- |
| Corregir y reenviar | `Admin.Documents.Issue` (superadmin, operador) | facturas, boletas, notas de crédito / débito; guías (09 y 31) | comprobantes no aceptados ni `observado` / `enviado` (espera a SUNAT: refrescar primero) / anulados / en anulación (§12.1); guías `rechazado` o `pendiente` | `PUT {vista}/{docId}`: `data.datos_edicion` del detalle con lo corregido encima + `motivo` obligatorio (+ `enviar_automatico` opcional en comprobantes); sin `datos_edicion` (API anterior), comprobantes con solo lo que cambió y guías con el cuerpo armado a mano |
| Reenviar a SUNAT | `Admin.Documents.Resend` (+ soporte) | todos (también resúmenes y bajas / reversiones) | no aceptado ni `anulado` / `anulacion_en_proceso` / `reversion_en_proceso` / `revertido` | `POST {vista}/{docId}/enviar` `{ motivo }` obligatorio (máx. 400) |
| Refrescar estado (SUNAT) | `Admin.Documents.Refresh` (+ soporte) | comprobantes y guías; resúmenes y anulaciones | comprobantes / guías `pendiente` o `enviado`; resúmenes / bajas `enviado` | `POST {vista}/{docId}/refrescar` `{}` o `{ motivo }` (consulta en vivo y guarda; auditada) |
| Anular (RA) | `Admin.Documents.Void` (+ soporte) | facturas, notas de crédito / débito (también de boletas) | `aceptado`; deshabilitado pasada la emisión + 7 días (Lima) | `POST {vista}/{docId}/anular` `{ motivo }` (va a SUNAT, máx. 255); la API usa la emisión como `fecha_generacion` |
| Anular (RC) | `Admin.Documents.Void` (+ soporte) | boletas | `aceptado`; mismo plazo de 7 días | `POST boletas/{docId}/anular` `{ motivo }`; `fecha_resumen` = emisión |
| Revertir (RR) | `Admin.Documents.Void` (+ soporte) | retenciones, percepciones | `aceptado` (sin plazo en la API; sin otra reversión vigente) | `POST {vista}/{docId}/revertir` `{ motivo }` |
| Revertir (RR) con causal | `Admin.Documents.Void` (+ soporte) | liquidaciones de compra | `aceptado`; deshabilitado si `reversion.disponible` es `false`, pasado `reversion.plazo_hasta` (o emisión + 5) o con pagos | `POST liquidaciones-compra/{docId}/revertir` `{ causal, motivo }` (`vendedor_nombre` / `vendedor_documento` / `producto`; motivo 3–100) |

- `lectura` no ve ninguna; `soporte` no ve "Corregir y reenviar". Con la empresa suspendida (`isActive: false`, se sabe en su
  página) quedan deshabilitadas con el aviso; en las vistas globales no se sabe y la API responde 403 con el mensaje.
- El modal de anular vuelve a leer el detalle (estado, fecha, plazo, pagos), muestra el mecanismo, las reglas de `/api/v1` y
  el último día, y pide confirmar con una casilla. Los errores van junto al campo (`motivo`, `causal`, `cliente.num_doc`,
  `items.0.cantidad`, `conductores.0.licencia`…) o en un aviso (403, 404, 409, 429, 503, 500 con referencia).
- Después de una acción: aviso con los `messages` (más la baja creada o el siguiente paso de una guía sin ticket), se recarga la
  página actual del listado (y el resumen en la vista unificada) o el detalle; el detalle avisa al listado al cerrar.
- **Corregir con `datos_edicion` (§12.1):** el detalle (`GET {tipo}/{docId}`, `GET guias-remision/{docId}`) trae al final de
  `data` el cuerpo exacto del `PUT` (snake_case). `SaleFixFormComponent` / `GuideFixFormComponent` lo precargan y envían
  **ese objeto** (`structuredClone`) con los campos del formulario encima, más `motivo`; lo que el formulario no muestra
  vuelve igual y lo que se vacía va en `null`. Nunca `correlativo` ni `leyenda` (ni `motivo` / `enviar_automatico` de
  `datos_edicion`). Ítems con `editItemsFromData` / `editItemToBody` (`emission.models.ts`): columnas del formulario
  (código, código SUNAT, descripción, unidad, cantidad, precio con IGV, `tip_afe_igv` guardado; `igvOptionsWith` agrega las
  afectaciones guardadas fuera de la lista, p. ej. gratuitas) y en `extra` todas las demás claves (`porcentaje_igv`,
  `descuentos`, `descuento`, ISC, ICBPER), que se avisan con `keptItemData`; si cambia la afectación de un ítem, su
  `porcentaje_igv` pasa a `null`. Comprobantes: `tipo_operacion`, `descuentos_globales`, `anticipos` y `percepcion` vuelven
  tal cual ("Se reenvían sin cambios"); cuotas, detracción, guías, extras, leyenda, sucursal y serie / número se muestran
  de solo lectura ("No se corrige aquí", del recurso de `/api/v1`); solo se validan las partes que cambiaron y sin cambios
  no se envía. Guías: remitente (31), destinatario, tercero y comprador (09), traslado (`cod_traslado` / `mod_traslado` solo
  si vienen: la 31 no los lleva), indicadores (M1L con casilla; los demás se conservan), partida / llegada con RUC y código
  de local, transportista (09; en la 31 vuelve igual), vehículo (placa, tarjeta, TUC, secundarios; `cod_emisor` /
  `nro_autorizacion` vuelven igual), conductores con la forma guardada (`conductor` objeto o `conductores` lista, el otro
  `null`), documentos relacionados (09 y 31), subcontratista y pagador (31), autorización especial e ítems con
  `cod_prod_sunat`.
- Sin `datos_edicion` (API anterior) los formularios siguen como en la entrega 2: comprobantes con IGV > 0 ⇒ gravado y solo lo
  que cambió; la guía se arma con el detalle y se piden a mano remitente, documentos, RUC / código y M1L (aviso de lo que se
  pierde).
- La baja de varios documentos a la vez (Laravel `anulaciones/nueva`) no existe: §11.7 no tiene `POST anulaciones` (la baja
  va por documento). Emitir una nota desde un comprobante aceptado está en "Emitir".

### Emitir (fase D, entrega 3, §11.6–§11.7)

- **Entradas:** botón "Emitir" (menú desplegable) en la cabecera de la página de la empresa, solo con `Admin.Documents.Issue`
  y la empresa activa; y, en el detalle de una factura o boleta `aceptado` / `observado`, "Emitir nota de crédito / débito"
  (cierra los modales y navega con `?origen=facturas|boletas&origenId=`). Ruta diferida `tenants/:id/emitir/:tipo`
  (`tenants/:id/emitir` → `facturas`), con pestañas para cambiar de tipo. La página lee `GET tenants/{id}` (estado, ambiente),
  `GET tenants/{id}/series` (solo las activas, `seriesFromResource`) y `GET tenants/{id}/empresa` (`tasa_igv_vigente`,
  `tax_regime`, domicilio fiscal); suspendida → aviso y botón deshabilitado.
- **Tipos, rutas y cuerpos** (`EMIT_TYPES` en `emission-types.ts`; cuerpos = `/api/v1` en snake_case + `motivo` opcional +
  `enviar_automatico`; validación local con las mismas claves de error de la API):
  | Tipo (`:tipo`) | `POST tenants/{id}/…` | Formulario | Campos principales |
  | --- | --- | --- | --- |
  | facturas, boletas | `facturas` / `boletas` | `SaleEmitFormComponent` | `serie`, `fecha_emision`, `tipo_moneda`, `tipo_operacion` (51), `forma_pago` Contado / Credito (+ `cuotas[{monto, fecha_pago}]` repartidas sobre total − detracción, `fecha_vencimiento` = última cuota si se deja vacía), `cliente` (factura: RUC; exportación 02xx: 0/4/7/A), `items` (código, `cod_producto_sunat`, descuento %, afectación), `detraccion{cod_bien, porcentaje, monto = total × %, cta_banco, cod_medio_pago}` (solo factura, 1001–1004), `percepcion{cod_regimen, porcentaje, monto, base}` (2001), `guias[{tipo_doc, nro_doc}]`, `pagos[{metodo, monto, referencia}]`, `extras.orden_compra` (factura), `observacion`; boleta: `solo_registro: true` ("solo registrar" para el resumen) |
  | notas-credito, notas-debito | `notas-credito` / `notas-debito` | `SaleEmitFormComponent` | `doc_afectado_tipo` (01 / 03 / 12) / `_serie` / `_correlativo` ("Traer datos": `GET {facturas\|boletas}?serie=&correlativo=&con=items`; desde el detalle: `GET {tipo}/{docId}`; copia cliente, moneda e ítems), `cod_motivo` / `des_motivo` (se llena con el nombre), ítems bloqueados según el motivo como la referencia (NC 01/02/04/06 fijos, 03 descripción, 05 descuento %, 07 cantidad y quitar, 09 precio; ND 02 precio), NC 04 `descuentos_globales[{cod_tipo: "02", monto}]` (base sin IGV), ND 13 sin documento obligatorio; serie filtrada por la letra (F / B) |
  | guias-remision (09) | `guias-remision` | `GuideEmitFormComponent` | `tipo_documento: "09"`, destinatario, `cod_traslado`, `mod_traslado`, `fecha_traslado`, `fecha_entrega_transportista` (público, obligatoria desde 2026-06-01), `peso_total` / `und_peso_total` / `num_bultos`, `indicadores` M1L, partida (prellenada con el domicilio fiscal) / llegada con `_ruc` / `_cod_local`, `transportista{… nro_mtc}` (público), `vehiculo{placa, secundarios}` + `conductores[]` (privado), `tercero` (motivo 03), `doc_relacionado` (08 / 09 / 19 exigen DAM / DS / manifiesto), `items` con `cod_prod_sunat` |
  | guias-remision-transportista (31) | `guias-remision-transportista` | `GuideEmitFormComponent` | `remitente` (1 / 6), destinatario, `doc_relacionado` (01 / 03 / 09 / 31 / 50 / 52, RUC del emisor), `vehiculo{placa, nro_circulacion, tuc, secundarios}`, `conductores[]`, `datos_subcontratador`, `datos_pagador_flete{tipo, …}` |
  | retenciones, percepciones | `retenciones` / `percepciones` | `RetPerEmitFormComponent` | `serie`, `fecha_emision`, `regimen` (23 / 22) + `tasa`, `proveedor` / `cliente`, `documentos[{tipo_doc, num_doc, fecha_emision, imp_total, moneda, fecha_retencion\|fecha_percepcion, pagos\|cobros[{importe, fecha, moneda}], tipo_cambio{moneda_ref, moneda_obj: "PEN", factor, fecha}}]`; importes retenidos / percibidos: los calcula la API (no se envían) |
  | liquidaciones-compra | `liquidaciones-compra` | `SettlementEmitFormComponent` | `serie` (L…), `tipo_operacion` 0501 / 0503 (oro: `items[].oro{…}`), `tipo_moneda: "PEN"`, `productos_agropecuarios`, `vendedor{tipo_doc 1/4, num_doc, nombre, direccion, ubigeo, tipo_domicilio}`, `lugar{direccion, ubigeo, tipo}`, `items` con `cod_producto_sunat` obligatorio y `valor_unitario` (10 / 20 / 30), `guias[{tipo, numero}]`, `placa_vehiculo` |
  | resumenes | `resumenes` | `SummaryEmitFormComponent` | `{ fecha_resumen }` (hoy o hasta 7 días antes); nunca `anular` (la API lo rechaza: se anula por documento) |
- **Idempotencia (`EmissionSubmitter`, `emission-submit.ts`):** `Idempotency-Key` = UUID (`crypto.randomUUID`, con respaldo
  `getRandomValues`) por intento. Se conserva mientras se reenvíe **el mismo cuerpo** a la misma ruta y empresa; cualquier
  cambio del formulario cambia el cuerpo y genera otra; después de un éxito se descarta ("Emitir otro" vuelve a crear el
  formulario). Sin respuesta clara (sin conexión, tiempo agotado de 120 s, 409 "en curso", 500 / 502 / 504) se ofrece
  "Reintentar la misma emisión" (reenvía el último cuerpo con la misma clave) y se avisa si el formulario cambió desde entonces.
  `Idempotency-Replayed: true` → el resultado se muestra como existente ("no se emitió otro"). Un error de negocio (200 con
  `succeeded: false`), 403 / 404 / 429 liberan la clave en la API: se muestran junto al campo (`items.N.*`, `cuotas.N.*`,
  `documentos.N.pagos.M.*`, `conductores.N.*`…) o al final, con explicación del cupo agotado, la suscripción vencida, la
  empresa suspendida y el 429. La clave nunca se guarda en el navegador (tampoco el formulario: no hay borradores).
- **Resultado (`EmissionResultComponent`):** número, estado SUNAT, total, `messages` (con las advertencias, p. ej. GRT en
  beta), y "Ver documento" (detalle de §9 con sus acciones), vista previa del PDF, PDF / XML / CDR por las rutas del panel,
  "Emitir otro" y "Ver comprobantes de la empresa". En resúmenes, las boletas incluidas.
- **Vista previa de totales:** con la tasa de la empresa y la afectación de cada ítem (precio con IGV; en la liquidación
  valor sin IGV), rotulada "Vista previa"; la API calcula los oficiales, la leyenda y la retención de renta.
- **Paridad con Laravel** (`plataform-api-sunat/resources/js/pages/sunat/**`): cubre lo de facturas / boletas (detracción,
  cuotas con reparto, orden de compra, descuento por ítem, borrador → "dejar pendiente" / "solo registrar"), notas (buscar el
  comprobante, copiar datos, bloqueo por motivo, descuento global), guías 09 / 31 (subcontratista, pagador del flete), retención
  / percepción y resumen; además lo que §11.7 acepta y Laravel no ofrecía (percepción en factura, guías y pagos relacionados,
  tercero, TUC, RUC / código de local, documentos relacionados en la 09, M1L, buscador del catálogo 25, liquidación de compra).
  No se portan: cotización / nota de venta (no existen en Spring), autocompletar clientes por nombre (no hay endpoint en §11.9;
  se usa "Consultar" por número), el modal automático del PDF (aquí "Vista previa del PDF" en el resultado), retención dentro
  de la factura, ICBPER y operaciones gratuitas (no están en el formulario), `autorizacion_especial`, anticipos y la baja de
  varios documentos.

### Notas de las pantallas

- **Inicio no lleva `RoleGuard`**: el guard redirige a Inicio cuando falta un permiso, así que exigirlo ahí haría un bucle.
- **Tablero (§10.3):** las ocho tarjetas de siempre y, si la API trae las métricas globales, una segunda tarjeta: empresas
  registradas, comprobantes de hoy y del mes anterior (crecimiento), ventas del mes en soles (aceptadas), gráfico de 30 días
  con barras CSS (`documentsByDay`), por tipo, estados del mes (`sunatStatusThisMonth`, clave `anulacionEnProceso`), empresas
  por plan / régimen / ambiente, las 5 empresas con más ventas y los 8 últimos envíos (el detalle se carga en diferido).
- **Fila común de documentos (§10.3, camelCase):** la usan Comprobantes, Envíos SUNAT, la vista unificada de la empresa y
  `recentSubmissions` (`DocumentRow`, `decorateDocumentRow`). `vista` es el segmento de §9 para detalle y descargas
  (`tenants/{tenantId}/{vista}/{id}`, `kindFromVista`). Un solo componente, `app-unified-documents` con `mode`
  `submissions` / `documents` / `tenant`: filtros comunes (`startDate`, `endDate`, `tipo` varios con coma, `estado` incluido
  `observado`, `serie` máx. 4, `sucursalId` (de `GET branches?tenantId=`), `textFilter`, y `orderBy` / `orderDir` salvo en el
  feed), validación del rango ≤ 366 días y resumen (`documents/summary` o `tenants/{id}/comprobantes/resumen`, sin `tipo`,
  `estado` ni orden). El feed **siempre** pide las dos fechas (por defecto los últimos 30 días, §10.1). `?tenantId=&tenant=&estado=&tipo=`
  llega por la URL.
- **Sucursales / Series:** `GET branches` / `GET series` con `tenantId` (selector), `stateFilter`, `textFilter` y en series
  `tipo` (`SERIES_TYPE_OPTIONS`). Solo lectura; "Ver empresa" abre la pestaña Configuración.
- **Consulta CPE (§10.5):** `app-sunat-live-query` (formularios de `consultar-cpe` y `consultar-cdr`, `data` en snake_case),
  usado en la pantalla (con el selector de empresa; `?tenantId=&tenant=` la deja elegida; la página de la empresa tiene el
  botón "Consulta CPE") y en el detalle de cada documento (prellenado; CPE en facturas, boletas, notas y liquidaciones, CDR
  solo en facturas, boletas y notas; solo se consulta al pulsar). `fecha_emision` va como `dd/mm/aaaa` (`ymdToDisplay`). El
  CDR en base64 se descarga con `base64ToBlob`. 429 / 500 / credenciales rechazadas se muestran en el formulario.
- **Planes (§10.4 / §10.6):** formulario con el catálogo (`GET plans/catalog`): límites agrupados (vacío = sin límite, -1 =
  ilimitado), funcionalidades con casillas, y las claves del plan que no están en el catálogo se conservan sin etiqueta. Los
  errores por campo (`propertyName`, también `limits.{clave}`) se muestran junto al campo. `free` / `pro` / `business`
  (`SYSTEM_PLAN_SLUGS` o `isSystem`): slug bloqueado y sin "Eliminar". El contrato no indica la moneda del precio: se
  muestra solo el monto.
- **Configuración de emisión (§10.6):** con `Admin.Settings.Manage`, interruptores `globalUnlimited` (si cambia, motivo
  obligatorio y confirmación) y `newTenantsUnlimited`; `globalUnlimitedByEnvironment` solo se muestra. Token de consulta
  **de solo escritura**: input `password`, se borra al guardar; se muestran solo `configured`, `source`, `last4` y
  `updatedAt`. Eliminar solo si `source = panel`.
- **Fase C (§11.3–§11.5, `sunat/models/tenant-admin.models.ts`):** los cuerpos que reutilizan `/api/v1` van en **snake_case**
  (mismos nombres de `/api/v1`) con `motivo` opcional, y su `data` es el recurso de `/api/v1`; las respuestas propias (alta,
  credenciales, logo) en camelCase. Los errores por campo (`errors[].propertyName`, también `emails.0`,
  `cuentas_bancarias.0.numero`) van junto al campo; los que no tienen campo se listan al final del formulario. 409 (RUC ya
  registrado) y 404 llegan como error HTTP con el sobre: se muestran sus `messages`.
  - **Alta** ("Nueva empresa", `tenant-form` en modal xl): RUC con `rucError` y "Consultar" (`GET tenants/ruc-lookup?ruc=`, solo
    al pulsar; llena `razon_social` y `direccion`, lo único que trae el contrato), razón social, nombre comercial, dirección,
    ubigeo (`app-ubigeo-select` llena también departamento / provincia / distrito), teléfonos y correos (máx. 5), régimen
    (`general` / `mype` / `rer` / `rus`), IGV especial 0–30 (no con `rus`), categoría NRUS (solo `rus`), ambiente, plan,
    cupo (vacío por defecto y no se envía = el del plan, con la ayuda del cupo de `GET plans`; §12.2: ya no hay 20 por
    defecto), modo de emisión (vacío = `newTenantsUnlimited`), series por defecto, webhook (`url_webhook`), mensajes, cuentas
    (`banco`, `tipo_cuenta`, `moneda`, `numero`, `cci`, `titular`) y billeteras (`tipo` yape / plin / tunki / otro). Nunca
    credenciales, logo ni certificado. Al crear: modal de una sola vez y luego abre la página de la empresa.
  - **Editar datos** (cabecera de la página): se llena con `GET tenants/{id}/empresa` (`webhook_url` → `url_webhook`) y
    `PUT tenants/{id}` envía **solo lo que cambió** (+ `motivo`); el RUC no se edita; plan y estado siguen con sus botones.
  - **Logo** (`tenant-logo`): `POST tenants/{id}/logo` multipart, campo `logo`, PNG / JPG / WEBP ≤ 2 MB, vista previa con
    `createObjectURL` (se revoca). **Eliminar** (`tenant-delete`): `DELETE tenants/{id}` con `{ motivo, ruc }` (escribir el
    RUC); después vuelve al listado.
  - **Pestaña Credenciales** (`tenant-credentials`): `GET tenants/{id}/credenciales` (indicadores, `apiKeyLast4`, certificado:
    estado, titular, emisor, serie, vigencia); formularios `PUT …/credenciales/sol` (`sol_user`, `sol_pass`),
    `PUT …/credenciales/gre` (`client_id`, `client_secret`), `POST …/certificado` multipart (`certificado` .pfx / .p12
    ≤ 100 KB, `contrasena_certificado`, `motivo`) y "Regenerar credenciales API" (motivo obligatorio + confirmación → modal
    de una sola vez). Sin `Admin.Tenants.Credentials` solo se ven los indicadores.
  - **Configuración:** sucursales (`POST` / `PUT` / `DELETE tenants/{id}/sucursales`; activar / desactivar con `PUT { activo }`;
    sin "Eliminar" en la principal), series (`POST` con `tipo` / `serie` / `sucursal_id` obligatorio / `correlativo_inicial`;
    `PUT { correlativo, sucursal_id, activo }` solo con lo que cambió; `DELETE` = desactivar) y clientes (`POST` / `PUT` /
    `DELETE`; "Consultar" con `GET tenants/{id}/buscar-documento` solo con `Admin.Documents.Issue`). Eliminar o desactivar
    pide confirmación con motivo opcional; después de cada acción se recargan sucursales, series y la cabecera.
- **Empresas:** filtros `textFilter`, `stateFilter`, `environment` (beta / production), `plan` (free / pro / business). Estado
  con tooltip `suspensionReason`. "Ver empresa" abre su página (abajo). Suspender exige motivo; activar lo pide opcional
  (`PUT tenants/{id}/estado { activo, motivo }`). Cambiar plan (§12.2, `tenant-plan`): `PUT tenants/{id}/plan { plan,
  maxDocumentsMonth, emissionMode, motivo }` con `maxDocumentsMonth` **opcional** (vacío = `null` = el cupo del plan; otro
  valor = cupo del panel, se precarga solo si `quota.source = panel`), `emissionMode` `plan` / `unlimited` (los valores de
  `Tenant.EMISSION_PLAN` / `EMISSION_UNLIMITED` de la API) y `motivo` opcional (máx. 400). El modal lee `GET tenants/{id}`
  (estado actual), el cupo de cada plan de `GET plans` (`Admin.Plans.View`; si no, `quota.planDefault` del plan efectivo),
  explica que rige de inmediato (conserva o crea la suscripción del panel, cancela las reducciones programadas) y al
  guardar muestra el estado nuevo de la respuesta (`data` = fila + bloques del detalle). La fila del listado no trae los
  bloques: `maxDocumentsMonth` ya es la copia del cupo efectivo (-1 → "ilimitado" en "Uso del mes"). "Ver rechazos" abre
  Rechazos con `?tenantId=&tenant=`.
- **Plan efectivo (§12.2, `tenant-plan-state`, `hasPlanState`):** `effectivePlan`, `planInSync`, `quota` (`documentsMonth`
  -1 = ilimitado, `source` panel / plan, `planDefault`, `override`, `usedThisMonth`, `exemptReason` global / beta /
  unlimited con `exemptReasonText`), `subscription` (estado, `setByPanel` = asignada por el panel, periodo con
  `isoToLima`, `periodEnd: null` = sin vencimiento, prueba, cancelación) y `pendingSubscription` (tipos en
  `sunat.models.ts`). Se muestran en el Resumen de la página de la empresa (sección "Plan efectivo, cupo y suscripción"),
  en el modal de cambiar plan y en la cabecera (plan que rige · cupo · usados; insignia "PLAN SIN SINCRONIZAR"). Con
  `planInSync: false` un aviso y, con `Admin.Tenants.Manage`, "Volver a guardar el plan" (abre el modal). Sin los bloques
  (API anterior) se ve lo de antes.
- **Página de la empresa** (§9; "Ver empresa" en el listado; el antiguo modal de detalle se quitó): cabecera
  con `GET tenants/{id}` y las acciones de Empresas; pestañas que se crean la primera vez que se abren y conservan su estado:
  - **Resumen:** datos de `GET tenants/{id}` (`tenant-info`) y el panel (`tenant-panel`: las once secciones de `GET panel/…`,
    cada una con su carga / error; periodo `mes` o `desde` + `hasta`, solo recarga las secciones con periodo; documentos
    recientes con `limit` y su detalle). Gráficos: tablas con barras CSS (`app-view-block`), sin librerías de gráficos.
  - **Comprobantes:** dos vistas con un interruptor: "Todos los tipos" (por defecto; `app-unified-documents` en modo
    `tenant`, §10.3) y "Por tipo": facturas / boletas / notas de crédito / débito (`GET {tipo}` con los filtros de `/api/v1` y
    sus mismos nombres; las notas solo `sunat_status`, `fecha_desde` + `fecha_hasta` juntas, `serie`, `client_num_doc`,
    `tipo_moneda`, `sucursal_id`). `?tab=comprobantes&tipo=&serie=&correlativo=&fecha=` abre "Por tipo" ya filtrado (lo usa
    Rechazos). **Exportar ZIP** (`tenant-zip-export`, `GET tenants/{id}/comprobantes/exportar-zip`): fechas obligatorias
    ≤ 31 días, `tipo` xml / pdf / ambos, `documentos`, `sucursal_id`, `estado`; los topes de archivos / MB y la validación
    llegan como sobre y se muestran.
  - **Otros comprobantes:** guías, retenciones, percepciones, liquidaciones de compra (detalle + `…/pagos`), resúmenes y
    anulaciones. Nunca mostrar `tenant_id`, `xml_path` ni `cdr_path` (las anulaciones los traen en la fila).
  - **Configuración:** empresa, sucursales, series (`include_inactive`, `sucursal_id`, `tipo` con los 9 tipos de §11.5),
    clientes (paginado, `textFilter`) y suscripción (`GET suscripcion`, que ya trae `uso`, + `suscripcion/pagos`); las
    escrituras están en Fase C.
  - **Credenciales:** ver Fase C.
  - **Reportes:** registro de ventas, ventas consolidado (`agrupacion`), por cliente (`client_num_doc` obligatorio) y
    retenciones (`periodo`); siempre JSON, mostrados como tablas.
  - El armado de lo que se ve está en funciones puras (`tenant-doc.views.ts`, `tenant-panel.views.ts`,
    `tenant-config.views.ts`, `tenant-report.views.ts`) que devuelven `ViewBlock` para `app-view-block`.
- **Descargas (XML / CDR / PDF, §9.6):** siempre por las rutas del panel (`TenantViewsService.download` →
  `FileDownloadService`: `responseType: 'blob'` + `observe: 'response'`, nombre de `Content-Disposition` o
  `{serie}-{correlativo}.{ext}`; si llega JSON o un error, lee el blob como texto y muestra `messages`). Las URLs de
  `archivos` son de `/api/v1` (piden las credenciales de la empresa): solo sirven para saber si el archivo existe. PDF con
  `formato` a4 / a5 / ticket-80 / ticket-58 (en el detalle); las descargas mandan `inline=0`.
- **Vista previa del PDF (§10.3):** `pdf-preview.component` (`openPdfPreview`): pide el PDF con `inline=1` como blob (con el
  bearer, nunca una URL externa), lo muestra en un `<iframe>` desde `URL.createObjectURL` y revoca la URL al cambiar de
  formato y al cerrar. Si el despliegue pone una CSP estricta, necesita `frame-src blob:` (hoy `src/web.config` es abierta).
- **Detalle de un documento (fase A; acciones de la fase D arriba):** además de lo de §9, en facturas / boletas / notas la **constancia de anulación**
  (`doc-void-record`, `GET …/{tipo}/{docId}/anulacion` + `/xml` / `/cdr`; se busca sola si el estado es anulado o en
  anulación, si no con un botón; "Ver su detalle" abre la baja / resumen) y, con `Admin.Sunat.Query`, la consulta en vivo.
- **Rechazos:** rango por defecto los últimos 7 días (Lima); `textFilter` busca por RUC o serie; `tenantId` llega por query string.
  "Ver comprobante" (tipos 01 / 03 / 07 / 08) abre la página de la empresa en Comprobantes filtrada por serie y correlativo.
- **Certificados:** `status` y `dias` (vacío = el aviso de la API); el tablero abre `?status=POR_VENCER`.
- **Administradores:** el contrato no tiene `GET users/{id}`: editar parte de la fila. No se ofrece desactivarse a uno mismo
  (la API además lo impide). Contraseña temporal y restablecer el MFA revocan las sesiones del usuario. Roles en
  `ADMIN_ROLE_OPTIONS` (con `soporte`) y nombres en `ADMIN_ROLE_NAMES`; V7 convirtió el `soporte` de API-PRO en `lectura`
  (se reasigna a mano).
- **Mi cuenta:** cambiar la contraseña incrementa `session_version`: el frontend limpia el navegador y vuelve al login.
  `POST mfa/recovery-codes` devuelve `{ recoveryCodes }`. Editar nombre y correo (`edit-profile`, `PUT auth/me` con
  `{ name, email, password }` = contraseña actual): no cierra la sesión; el perfil en memoria se reemplaza con la respuesta;
  los errores por campo (`email` repetido) van junto al campo.
- Una pantalla nueva va también en el menú fijo de la API (`GET admin/auth/menu`) y en `help-content.ts`.

## Desarrollo

- `npm ci --legacy-peer-deps` (los peer deps del proyecto lo exigen).
- `ng serve`: https://localhost:4220 (ERP 4200, consola 4210). `proxy.conf.json` reenvía `/api` a la API SUNAT en
  http://127.0.0.1:8081 (Docker / WSL). La API debe tener `ADMIN_JWT_SECRET` (si no, responde 503) y
  `ADMIN_ALLOWED_ORIGINS=https://localhost:4220`. **Nunca apuntar el proxy ni `src/_redirects` al ERP ni a la consola.**
- Verificar después de cada cambio: `npx ng build --configuration development` y, antes de publicar,
  `npx ng build --configuration production`.
