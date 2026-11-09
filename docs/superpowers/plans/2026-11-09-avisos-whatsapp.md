# Avisos por WhatsApp con confirmación de lectura · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el director prepare desde Pasar Lista avisos por WhatsApp (recordatorios y avisos importantes con confirmación «Lo he leído»), vea quién falta por confirmar y les recuerde por WhatsApp o SMS.

**Architecture:** El servidor Apps Script «Residencia Santa Espina - Servidor» gana un archivo nuevo `AvisosWhatsApp.gs` con la lógica pura (probada en Node) y los endpoints; `doGet` sirve la página pública de confirmación. Pasar Lista (`index.html`, PWA de un solo archivo en GitHub Pages) amplía la pantalla «Avisos generales» con tres pestañas. El envío real lo hace la persona desde WhatsApp Business (enlaces `wa.me` / `whatsapp://send`); no hay API de WhatsApp.

**Tech Stack:** Google Apps Script (V8), HtmlService, SpreadsheetApp, CacheService; HTML+JS sin dependencias; Node (sin paquetes) para pruebas locales con `vm`.

**Spec:** Claude Doc «Avisos importantes con confirmación de lectura · Pasar Lista» (https://claude.ai/artifact/5kKFP8qYigVDLQWzm24Nag), aprobado el 2026-11-09.

## Global Constraints

- Acceso solo para el director: todas las operaciones nuevas exigen el código existente `AVISOS_CODIGO` (Script Properties) validado con `agCodigoError_(d)`; sin código válido la sección no muestra nada.
- Destinatarios: residente menor → su tutor; residente mayor de edad → su tutor **y** el propio residente.
- Un aviso importante cuenta como confirmado para un residente mayor solo cuando confirman los dos (residente y tutor); cada uno es un pendiente separado.
- Un mismo teléfono recibe un solo mensaje y un solo código; confirmar con ese código marca todas sus filas del aviso.
- Códigos: 6 caracteres de `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sin 0/O/1/I/L), uno por teléfono, generados por el script, guardados solo en la hoja privada «Códigos WhatsApp». Nunca en registros, correos ni `console`.
- Identificador de aviso: 24 caracteres aleatorios base32 (`Utilities.getUuid()` sin guiones, recortado).
- Página «Lo he leído»: solo muestra el texto del aviso y el botón; ningún nombre ni dato de residente. Máximo 20 códigos incorrectos por aviso y hora (CacheService); después responde `bloqueado`.
- Los avisos importantes no deben llevar datos personales de un alumno: la pantalla lo recuerda junto al cuadro de texto.
- Textos de la interfaz en español, mismo estilo que el resto de Pasar Lista.
- Cada cambio de `index.html` sube la constante de versión de `service-worker.js` (`pasar-lista-vNN`).
- No se envía nada a familias durante las pruebas: alcance especial `prueba`, que solo incluye el teléfono de la propiedad `WA_TEL_PRUEBA`.

## Review Focus

- Teléfono compartido entre hermanos o entre tutor y residente: un solo mensaje, una confirmación que marca todas sus filas → Task 1 `waAgrupar_ agrupa teléfonos repetidos`.
- Mayor de edad sin móvil propio o sin edad conocida: el tutor sigue recibiendo y el residente queda en «Contacto manual», sin romper el recuento → Task 1 `mayor sin móvil: tutor listo, residente manual`.
- Código mal escrito, en minúsculas o con espacios: se normaliza; códigos al azar se bloquean tras 20 fallos → Task 2 `waNormalizaCodigo_` y Task 3 `bloqueo tras 20 fallos`.
- Confirmar dos veces o abrir un enlace de aviso inexistente: idempotente y mensaje claro, nunca error del servidor → Task 3 `confirmar dos veces no duplica` y `aviso inexistente`.
- Residente que entra después de crear el aviso: no altera el recuento porque la lista se fija al crear → Task 3 `lista fijada al crear`.

---

### Task 1: Nueva regla de destinatarios (tutor + mayor de edad)

**Files:**
- Modify: servidor `AvisosYPartes.gs` → `agDestinatarios_` (copia local `servidor/AvisosYPartes.gs` descargada del editor)
- Test: `servidor/test/destinatarios.test.js`

**Interfaces:**
- Produces: `agDestinatarios_(alcance, grupo, residentes, contactos, hoy) -> Array<{nombre, tipo:'Tutor'|'Residente'|'Por comprobar', telefono, estado, nota}>` — ahora un residente mayor genera dos entradas (Tutor y Residente). Las SMS de avisos generales existentes heredan la regla.

- [ ] **Step 1:** Descargar los 4 archivos del editor a `servidor/` (monaco `getModels()`), y escribir `servidor/test/carga.js` que evalúa los `.gs` en `vm` con stubs de `PropertiesService`, `CacheService`, `Utilities`, `SpreadsheetApp`.
- [ ] **Step 2: Tests que fallan** — `menor → solo tutor`; `mayor → tutor y residente`; `mayor sin móvil: tutor listo, residente manual`; `tutor compartido por dos hermanos: un solo Listo`.
- [ ] **Step 3:** Correr `node servidor/test/destinatarios.test.js` → FAIL en `mayor → tutor y residente`.
- [ ] **Step 4:** Cambiar `agDestinatarios_`: para mayor de edad, empujar una entrada `Tutor` (telT) y otra `Residente` (telR), cada una con su propio estado y la deduplicación por `porTelefono` actual.
- [ ] **Step 5:** Correr los tests → PASS; ajustar las expectativas de `probarAvisosGeneralesYPartes()` que asumían una sola entrada por mayor.

### Task 2: Núcleo puro de avisos WhatsApp

**Files:**
- Create: `servidor/AvisosWhatsApp.gs`
- Test: `servidor/test/whatsapp.test.js`

**Interfaces:**
- Consumes: `agDestinatarios_` (Task 1).
- Produces:
  - `waNuevoCodigo_(usados:Set<string>) -> string` (6 caracteres del alfabeto de Global Constraints, no repetido).
  - `waNormalizaCodigo_(s) -> string` (mayúsculas, sin espacios ni guiones, O→0 no: solo se quitan separadores).
  - `waAgrupar_(lista) -> Array<{telefono, filas: Array<{nombre, tipo}>}>` solo con `estado==='Listo'` o compartidos (agrupa por teléfono, incluyendo las filas que `agDestinatarios_` marcó como «Número compartido»).
  - `waResumen_(filas) -> {total, confirmados, pendientes: Array<{nombre, tipo, casa, telefono}>, completos}` donde `filas` son las del aviso en la hoja «Confirmaciones» y `completos` cuenta residentes con todas sus filas confirmadas.

- [ ] **Step 1: Tests que fallan** — `código de 6 sin caracteres ambiguos`; `waNormalizaCodigo_(' ab-c 12 ') === 'ABC12'`; `waAgrupar_ agrupa teléfonos repetidos`; `waResumen_ mayor con solo tutor confirmado no está completo`.
- [ ] **Step 2:** `node servidor/test/whatsapp.test.js` → FAIL (funciones no definidas).
- [ ] **Step 3:** Implementar las cuatro funciones en `AvisosWhatsApp.gs`.
- [ ] **Step 4:** Tests → PASS.

### Task 3: Hojas y endpoints del servidor

**Files:**
- Modify: `servidor/AvisosWhatsApp.gs`, `servidor/Servidor.gs` (`doPost`, `doGet`)
- Create: `servidor/Confirmar.html` (archivo HTML de Apps Script)
- Test: `servidor/test/endpoints.test.js` (hojas simuladas en memoria) y `probarAvisosWhatsApp()` en el editor

**Interfaces:**
- Hojas (se crean solas si faltan, cabecera en negrita y fila fija):
  - «Códigos WhatsApp»: `Teléfono | Código | Creado`.
  - «Avisos importantes»: `ID | Fecha | Alcance | Grupo | Texto | Quién | Total`.
  - «Confirmaciones»: `ID aviso | Residente | Casa | Destinatario | Teléfono | Confirmado | Cómo` (`Cómo` = `Enlace` o `Manual · <quién>`).
- `doPost` nuevos `tipo` (todos pasan antes por `agCodigoError_`):
  - `waVista {alcance, grupo, texto}` → `{ok, recuento:{tutoresMenores, tutoresMayores, residentesMayores, manuales, compartidos}}`.
  - `waCrear {alcance, grupo, texto, quien}` → `{ok, id, url, texto}` donde `texto` = texto + `\n\nConfirma que lo has leído: ` + url.
  - `waEstado {id?}` → sin `id`: `{ok, avisos:[{id, fecha, alcance, grupo, total, confirmados}]}` (más recientes primero, máx. 30); con `id`: `{ok, aviso, resumen}` (`waResumen_`) más `enlaces:[{telefono, url}]` con el enlace personal `url + '&c=' + código`.
  - `waMarcar {id, telefono, quien}` → marca como `Manual · quien` todas las filas de ese teléfono.
  - `waContactos {}` → `{ok, csv}` cabecera `Name,Phone 1 - Value,Labels`, un contacto por teléfono, nombre «Tutor · <residente> (<casa>)» o «<residente> · residente (<casa>)», `Labels` = `Menor de edad · tutor` | `Mayor de edad · tutor` | `Mayor de edad · residente`, más `* myContacts`.
- `doGet(e)`: sin `e.parameter.a` → `'OK'` (como ahora). Con `a` → `HtmlService` de `Confirmar.html` con el texto del aviso; `google.script.run.waConfirmar(a, codigo)` → `{ok}` | `{ok:false, error:'codigo'|'bloqueado'|'aviso'}`. El código se recuerda en `localStorage` de la página.
- Alcance `prueba`: una sola fila «Prueba» con `WA_TEL_PRUEBA`.

- [ ] **Step 1: Tests que fallan** — `lista fijada al crear` (añadir residente tras `waCrear` no cambia `total`); `confirmar dos veces no duplica`; `aviso inexistente` → `error:'aviso'`; `bloqueo tras 20 fallos`; `waContactos sin teléfonos repetidos y con etiquetas`; `sin código de director → error codigo`.
- [ ] **Step 2:** `node servidor/test/endpoints.test.js` → FAIL.
- [ ] **Step 3:** Implementar hojas, endpoints, `doGet` y `Confirmar.html`.
- [ ] **Step 4:** Tests → PASS.

### Task 4: Pantalla de avisos en Pasar Lista

**Files:**
- Modify: `index.html` (sección `renderGenerales` / `AG`, ~líneas 594-715 y el `click`/`change` delegado ~826-856)
- Modify: `service-worker.js` (versión)
- Test: `test/wa-helpers.test.js` (Node, extrae el bloque marcado `// <wa-helpers>` … `// </wa-helpers>` de `index.html`)

**Interfaces:**
- Consumes: endpoints `waVista`, `waCrear`, `waEstado`, `waMarcar`, `waContactos` (Task 3) vía `post()` existente con `codigo: agCodigo()`.
- Produces (helpers puros dentro del bloque marcado): `waEnlaceDirecto(tel, texto) -> 'https://wa.me/<sin +>?text=<enc>'`, `waEnlaceLibre(texto) -> 'whatsapp://send?text=<enc>'`, `waBarra(confirmados,total) -> string HTML`.

Pantalla: pestañas **Nuevo aviso** (selector Recordatorio/Importante + alcance actual + texto + vista previa con recuento; botones «Copiar y abrir WhatsApp» o «Crear aviso» → «Copiar texto con enlace» y «Abrir WhatsApp»), **Avisos enviados** (lista con barra; detalle con pendientes por casa, botón WhatsApp por pendiente, «SMS a todos los pendientes» reutilizando el flujo SMS existente con alcance de pendientes, «Marcar como confirmado» con hoja de confirmación) y **Contactos** (descargar CSV). El SMS por grupo de siempre sigue disponible dentro de «Nuevo aviso».

- [ ] **Step 1: Tests que fallan** — `waEnlaceDirecto('+34600111222','a b') === 'https://wa.me/34600111222?text=a%20b'`; `waEnlaceLibre` codifica saltos de línea; `waBarra(3,4)` contiene `3 de 4`.
- [ ] **Step 2:** `node test/wa-helpers.test.js` → FAIL.
- [ ] **Step 3:** Implementar helpers y pantalla; subir versión del service worker.
- [ ] **Step 4:** Tests → PASS; abrir `index.html` con el modo de servidor simulado y revisar las tres pestañas en móvil (375 px).

### Task 5: Publicación y prueba real sin familias

- [ ] **Step 1:** Pegar `AvisosWhatsApp.gs`, `Confirmar.html` y los cambios en el editor (comprobar hash del archivo antes de editar), guardar, ejecutar `probarAvisosWhatsApp()` y `probarAvisosGeneralesYPartes()` → todo OK en el registro.
- [ ] **Step 2:** Propiedad `WA_TEL_PRUEBA` = móvil del responsable; ejecutar `waPrepararCodigos()` (genera los códigos de todos los teléfonos actuales).
- [ ] **Step 3:** Nueva versión de la implementación web existente (misma URL), acceso «Cualquier usuario».
- [ ] **Step 4:** Push de `index.html` y `service-worker.js` a `main`; esperar a GitHub Pages.
- [ ] **Step 5:** Aviso importante con alcance `prueba` → confirmar desde el enlace → la ficha muestra 1 de 1; repetir recordatorio y «Marcar como confirmado».
- [ ] **Step 6:** El responsable comunica a César el código de avisos (`AVISOS_CODIGO`).
