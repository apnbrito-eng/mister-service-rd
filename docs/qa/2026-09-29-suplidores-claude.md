# Suplidores y consulta de piezas desde Standby — entrega Claude (Cowork)

29/09/2026. Local, sin publicar. No se tocaron reglas, APIs de envío, tipos centrales, App/Sidebar ni flujoPiezasTaller.service.

## Qué hace

- **Pestaña "Suplidores" dentro de Pendiente de piezas** (`/admin/standby`): listado con nombre, teléfono, especialidad y notas; búsqueda sin tildes por nombre, especialidad o teléfono; alta, edición y baja lógica (desactivar/reactivar, nunca borrar). Botones solo para quien ya gestiona piezas (`puede(ordenesModificar)` + rol de oficina, igual que Standby).
- **"Consultar a suplidor" en cada pieza activa**: abre un asistente de 4 pasos.
  1. Elegir suplidor activo.
  2. Mensaje prellenado con pieza, tipo de equipo, marca y modelo (`equipoModeloFabricante` o `equipoModelo` de la orden) más un detalle técnico opcional. Es editable. Nunca incluye nombre, teléfono, dirección, notas ni número de orden del cliente. Teléfonos RD, internacionales con "+" y correos escritos por error se sustituyen por "[dato oculto]" al generar y otra vez al copiar. Los números de pieza (DC97-16350, WF45R6100AW, 8PJ-1245…) no se alteran.
  3. Foto opcional: sin foto, foto registrada de la pieza (solo si su URL es de Firebase Storage en `fotos-piezas/{orden}/{pieza}.jpg`; cualquier otra URL no se muestra ni se abre) o foto del dispositivo (validada con `validarFoto`). Hay vista previa y una casilla obligatoria confirmando que la foto no muestra datos del cliente antes de ofrecer guardarla.
  4. Abrir chat. Nada se envía automáticamente:
     - **Copiar mensaje.**
     - **Inbox empresarial**: solo lee `whatsapp_conversaciones/{1XXXXXXXXXX | XXXXXXXXXX}`. Navega a `/admin/inbox/{waId}` si el teléfono no corresponde a un cliente (consulta adicional a clientes) ni tiene vínculo de cliente en la conversación. Con ventana abierta copia el texto; con ventana cerrada o sin conversación muestra aviso y requiere otro clic para abrir el selector existente de plantillas. Abrir no crea conversación ni cliente, ni envía mensajes.
     - **WhatsApp de este dispositivo**: enlace `wa.me` con el texto, abierto con `noopener,noreferrer`; rotulado como cuenta del dispositivo, no línea empresarial.

## Límite exacto de WhatsApp empresarial

- La línea central usa la API de WhatsApp Business. Para escribir primero a un suplidor, o fuera de la ventana de 24 h, Meta exige una plantilla aprobada. El Inbox sí tiene SelectorPlantillas cuando no hay ventana abierta, incluso con waId sin conversación. El usuario debe elegir una plantilla adecuada disponible; este cambio no aprueba ni inventa plantillas.
- Existe soporte enviarMedia en servicio/backend. Este modal no transfiere la foto al Inbox y el nuevo AdjuntarImagen del Inbox permite seleccionar manualmente JPEG/PNG con ventana abierta; la foto de este modal no se transfiere automáticamente. La foto puede guardarse para el WhatsApp del dispositivo.
- Ruta futura soportada (no implementada, fuera de mi alcance: API de envío): plantilla aprobada "consulta_pieza" con cabecera de imagen subida por media upload del servidor, respetando opt-outs y ventana.
- El número de compras distinto del central sigue sin decidir.

## Persistencia y permisos

- Colección nueva `suplidores`, ID = teléfono normalizado (10 dígitos), para que el mismo número no se registre dos veces, ni con dos usuarios a la vez (transacción). Campos: nombre, telefono, telefonoNormalizado, especialidad, notas, activo, creadoPor, actualizadoPor, createdAt, updatedAt (`serverTimestamp`).
- **Hoy Firestore la bloquea** (default-deny). La UI lo detecta (`permission-denied`) y dice "El directorio de suplidores todavía no está habilitado en el servidor (falta publicar su regla). No se guardó nada." No hay localStorage ni datos falsos.
- **Propuesta de regla pendiente de Codex + reviewer de rules** (no publicada): `docs/qa/propuesta-suplidores/suplidores.rules.snippet`. Lectura y escritura solo personal de oficina (mismo alcance que `standby_piezas`), campos cerrados, ID = teléfono, actor = `request.auth.uid`, fechas del servidor, creador inmutable, sin borrado.
- Prueba de emulador propuesta: `docs/qa/propuesta-suplidores/suplidores.rules.test.ts`. Está fuera de `tests/` a propósito para no romper la suite actual; moverla a `tests/rules/` al integrar la regla.

## Archivos

- Nuevos: `src/utils/consultaSuplidor.ts`, `src/services/suplidores.service.ts`, `src/components/standby/DirectorioSuplidores.tsx`, `src/components/standby/ConsultaSuplidorModal.tsx`, `tests/integraciones/consulta-suplidor.test.ts`, `docs/qa/propuesta-suplidores/*`.
- Editado: `src/pages/Standby.tsx` (import de 2 componentes e icono, pestaña, estado `consultaPieza`, botón por pieza, modal). Sin cambios en la lógica existente de Standby.

## Correcciones tras la corrida intermedia de Codex

- `construirMensajeConsulta` devolvía `{ texto }`; ahora devuelve `{ mensaje, ocultados }` según el contrato (tsc línea 93).
- `ocultarContactos` ya no toma números de pieza por teléfonos: solo formatos RD 809/829/849 (con o sin +1, paréntesis o separadores), 7 dígitos locales `###-####` sueltos y números con "+". Casos añadidos al test.

## Verificación

Ejecutada por Claude en una copia aislada (el `node_modules` de la carpeta compartida es de macOS y no corre en el entorno Linux de Claude; no se tocó), con las mismas versiones de vitest 3.2.7, firebase 11.10.0 y TypeScript 5:

- `vitest run tests/integraciones/consulta-suplidor.test.ts`: **30/30**. Cubre validación de suplidor, búsqueda sin tildes y por teléfono, inactivos, mensaje sin datos del cliente, ocultación de teléfonos RD/internacionales/correos, cuatro números de pieza que no se alteran (DC97-16350, WF45R6100AW, 5304511738, 8PJ-1245), URL de foto segura frente a 8 URLs rechazadas, enlace wa.me y reglas de uso del Inbox empresarial.
- `tsc --noEmit` estricto (opciones de `tsconfig.json`) sobre Standby.tsx y los 4 archivos nuevos con sus dependencias: **0 errores**.
- No ejecutado por Claude: suite general, lint del repo, build, emulador de reglas (la regla no está insertada) ni QA visual. Queda para Codex en la Mac.

## Pendiente / no declarado listo

- Publicar la regla (requiere reviewer y OK de Jorge).
- QA visual en 390 px y Samsung.
- Decidir número de compras y plantilla aprobada para iniciar conversaciones.
- No se registra historial de consultas enviadas (no pedido; si se quiere, requiere otra colección y regla).


## Corrección de contraste (revisión Codex)

- Se corrigió la afirmación obsoleta sobre ausencia de selector: existe en InboxConversacion y recibe waId aunque no exista conversación.
- Botón respeta los cuatro roles de la ruta Inbox; comprobación cliente por teléfono y vínculo de conversación falla cerrada si la lectura devuelve error.
- Ventana cerrada/sin conversación permite navegación con aviso previo y segundo clic. No copia la consulta como si fuera plantilla ni envía nada automáticamente.
- Las pruebas de helper verifican ambos casos y bloqueo por cliente; no validan envío real ni aprobación Meta. Sin cambios de API, Inbox, reglas ni datos reales.
