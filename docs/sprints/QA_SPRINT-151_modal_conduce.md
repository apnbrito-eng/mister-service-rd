# QA SPRINT-151 — Modal "Emitir conduce de garantía"

Commit: `863e804` (feat: editar ítems + nota + verificación pago en modal emitir conduce).
Branch en revisión: `main` (post-merge).
Ejecutor sugerido: Jorge (administrador).
Tiempo estimado: 10 minutos.
Severidad de cada caso: **bloqueante** / **mayor** / **menor** / **cosmético**.

> Si encontrás un FAIL bloqueante: parar la ejecución y reportarlo al coordinator antes de cerrar el sprint como COMPLETADO.

═══════════════════════════════════════════════════════
## PRE-REQUISITOS
═══════════════════════════════════════════════════════

- [ ] Branch actual: `main` (debe contener commit `863e804`).
- [ ] `npm install` si cambió `package.json` (no debería en este sprint).
- [ ] `npm run dev` levantado en `http://localhost:5173` (o probar contra preview de Vercel del último deploy `main`).
- [ ] Login como **administrador** (`apnbrito@gmail.com`).
- [ ] Hard refresh (Cmd+Shift+R) la primera vez para no quedarse con bundle viejo. Si aparece el banner "Nueva versión disponible", clickear "Recargar ahora".
- [ ] DevTools abierto en pestaña Console (filtrar por "error" y "warning") + pestaña Network.

═══════════════════════════════════════════════════════
## SETUP — Encontrar una orden para testear
═══════════════════════════════════════════════════════

**Paso S1**: Navegar a `/admin/facturacion-pendiente`.
- **Resultado esperado**: título "Conduces Pendientes", contador en chip azul arriba a la derecha ("N pendientes"), lista de cards en grid 2-columnas con OS-XXXX cada una.
- **Fail si**: pantalla "No tienes permisos…" (significa que el usuario no es admin/coord), error 404, o card en blanco.
- **Severidad**: bloqueante.

**Paso S2**: Identificar una orden candidata.
- **Criterio preferido**: buscar `OS-0054` recorriendo las cards. Las cards muestran número en mono arriba a la izquierda.
- **Si OS-0054 NO aparece**: elegir cualquier card que tenga estos atributos visibles:
  - Total > 0 (chip "Total" del grid 3-col interno).
  - Pendiente > 0 (chip "Pendiente" en naranja) — ideal para ejercer el cobro nuevo del paso 2.
  - Si tiene piezas: idealmente piezas ya **Validadas** (badge verde). Si están "Pendientes de validar", aprobarlas primero con el botón "Aprobar piezas" (admin only) para no contaminar el flujo de conduce.
- **Anotar**: número OS, cliente, total, pendiente. Se usan para verificación post-emisión.
- **Resultado esperado**: orden seleccionada con datos legibles.
- **Fail si**: la lista está completamente vacía (no se puede testear nada hoy — reportar como bloqueante y mover sprint a BLOQUEOS hasta tener data).
- **Severidad**: bloqueante (si lista vacía) / no aplica (si hay candidatas).

**Paso S3**: Confirmar columnas/filtros disponibles.
- **Resultado esperado**: arriba aparece el `FiltroAvanzadoFinanzas` (filtros por fecha "Enviadas a facturación" + otros). Cada card muestra: número OS (mono), cliente, equipoTipo · equipoMarca, botón "Procesar" azul, botón "Editar orden completa" (solo admin), grid 3-col Total/Pagado/Pendiente, sección expandible de piezas si las hay, y línea de pie "Enviada por … · fecha".
- **Fail si**: falta el filtro de fechas o la card no muestra "Pendiente" en naranja.
- **Severidad**: menor (no bloquea el modal).

═══════════════════════════════════════════════════════
## PASO 1 DEL MODAL — Aprobar contenido del conduce
═══════════════════════════════════════════════════════

**Paso 1.1**: Click "Procesar" en la card elegida.
- **Resultado esperado**: se abre modal `lg` con título "Emitir conduce de garantía — OS-XXXX", stepper arriba con dot 1 activo (azul oscuro) y dot 2 gris, label "Aprobar contenido" y "Confirmar pagos".
- **Fail si**: modal no abre, título sin número, dots invertidos, o consola muestra error de carga de cotización.
- **Severidad**: bloqueante.

**Paso 1.2**: Verificar si aparece banner azul "Borrador encontrado del …".
- Si aparece: clickear el botón **X** (descartar) para arrancar desde cero el QA. Si querés probar Restaurar después como caso bonus, anotalo.
- **Resultado esperado**: banner desaparece sin error.
- **Fail si**: clickear descartar deja el banner visible o tira error.
- **Severidad**: mayor.

**Paso 1.3** — **CRITERIO NUEVO DEL SPRINT — descripción de ítems de inventario EDITABLE**.
- Buscar en la lista de ítems uno marcado con chip **"Inv"** (azul) a la izquierda de la descripción. Si todos los ítems son chip **"Lib"** (manual), agregar uno de inventario con "+ Agregar → De inventario" para poder testear el criterio nuevo.
- Click en el texto de descripción del ítem "Inv" y modificarlo (ej: agregar " — nota test SPRINT-151" al final).
- **Resultado esperado**: el input acepta el texto, se ve actualizado en pantalla. El chip "Inv" SIGUE ahí (el vínculo `piezaInventarioId`/`servicioPrecioId` se preserva, solo cambia el texto impreso).
- **Fail si**: el input está disabled, no se puede tipear, o pierde el chip "Inv" al editar.
- **Severidad**: **bloqueante** (es el criterio núcleo nuevo del sprint).

**Paso 1.4** — **Textarea "Nota para el conduce" con contador**.
- Verificar que debajo del bloque "Total conduce" hay un campo con label "Nota para el conduce (opcional)" y contador "0/500" a la derecha.
- Escribir el texto: `Cliente solicita pasar factura legal aparte. Test QA SPRINT-151.`
- **Resultado esperado**: el texto se acepta, el contador incrementa en tiempo real hasta el largo del texto (debe quedar alrededor de 65/500), gris.
- **Fail si**: textarea no existe, contador no incrementa, o el contador queda rojo siendo el largo < 500.
- **Severidad**: bloqueante (otro criterio núcleo).

**Paso 1.5** — Probar contador en límite.
- Pegar (`Cmd+V`) un texto largo de ~600 caracteres. Generar uno: copiar el texto de Lorem ipsum o repetir "abc " hasta 600.
- **Resultado esperado**: el textarea **trunca a 500** caracteres (el slice está en el `onChange`). Contador queda en `500/500` en color rojo y negrita.
- **Fail si**: acepta más de 500 o el contador queda gris en 500.
- **Severidad**: mayor.

Limpiar el textarea y volver a dejar la nota del paso 1.4 (`Cliente solicita pasar factura legal aparte. Test QA SPRINT-151.`).

**Paso 1.6** — Editar/eliminar ítems del listado.
- Click papelera en algún ítem que **no** tenga técnico asignado (si todos tienen, agregar un manual con "+ Agregar → Manual" y borralo).
- **Resultado esperado**: el ítem desaparece sin pedir confirmación (si no tenía técnico). Si tenía técnico, debería pedir confirmación.
- **Fail si**: borra cualquier ítem con técnico sin confirmar, o no se puede borrar.
- **Severidad**: mayor.

Reagregar al menos un ítem si la lista quedó vacía (no se puede emitir conduce vacío).

**Paso 1.7** — Click botón "Siguiente: Confirmar pagos".
- **Resultado esperado**: dot 1 pasa a verde con check, dot 2 pasa a activo (azul oscuro), contenido del paso 2 se renderiza.
- **Fail si**: el botón sigue disabled aunque hay ítems, o no avanza.
- **Severidad**: bloqueante.

═══════════════════════════════════════════════════════
## PASO 2 DEL MODAL — Confirmar pagos
═══════════════════════════════════════════════════════

**Paso 2.1** — Verificar que el bloque pasivo viejo YA NO está.
- Buscar en la UI cualquier texto del tipo "hazlo desde la orden antes de continuar" o "Si necesitas agregar o modificar algún pago…".
- **Resultado esperado**: ese texto **NO aparece**. En su lugar, debajo de los pagos previos hay un grid azul Total pagado / Total conduce y debajo un bloque blanco titulado **"Registrar pago de este conduce"** con badge gris "(opcional · dejá monto en 0 si no hay cobro)".
- **Fail si**: aparece el texto viejo.
- **Severidad**: mayor.

**Paso 2.2** — Verificar pagos previos.
- Si la orden tiene pagos previos, cada uno debe verse con icono según método (Banknote/ArrowRightLeft/CreditCard), monto, método capitalizado, banco/recibidoPor según corresponda, referencia si tiene, y badge "VERIFICADO" verde si el pago tiene `verificado === true` (criterio nuevo del sprint).
- Si la orden no tiene pagos previos, debe aparecer caja gris "Esta orden no tiene pagos previos. Si la operaria está cobrando ahora, registralo en el bloque … abajo."
- **Resultado esperado**: render coherente con el estado real.
- **Fail si**: pagos pre-SPRINT-151 (sin campo `verificado`) muestran badge verde por error, o pagos verificados nuevos no lo muestran.
- **Severidad**: menor.

**Paso 2.3** — Default del monto del pago nuevo.
- En el bloque "Registrar pago de este conduce", verificar que el campo **Monto** se prellenó automáticamente con un número > 0 (debería ser `totalItems - totalPagado` = pendiente actual).
- **Resultado esperado**: monto = pendiente, NO vacío y NO 0 (asumiendo que la orden tenía saldo pendiente).
- **Fail si**: monto = 0 a pesar de haber saldo.
- **Severidad**: mayor.

**Paso 2.4** — Editor de pago activo.
- Verificar que existen los siguientes campos editables: `Método` (select con efectivo/transferencia/tarjeta), `Monto` (number), `Recibido por` o `Banco` (cambia según método), `Referencia / Recibo` (text opcional), y checkbox **"Pago verificado (cotejado con banco / efectivo en mano)"**.
- Cambiar método a **transferencia** → el campo "Recibido por" debe reemplazarse por **"Banco"** con placeholder `BHD, Popular, Scotiabank...`.
- **Resultado esperado**: cambio fluido sin perder el monto.
- **Fail si**: no aparece selector de método, banco no se renderiza al elegir transferencia, o el checkbox no existe.
- **Severidad**: bloqueante.

**Paso 2.5** — Comportamiento del checkbox "Pago verificado".
- Con monto = 0 (cambialo a 0 manualmente): el checkbox debe verse **disabled / opacidad 50%** y label "cursor-not-allowed".
- Volver el monto al pendiente original (> 0): el checkbox debe quedar habilitado.
- **Resultado esperado**: el checkbox solo es interactuable cuando monto > 0.
- **Fail si**: se puede tildar con monto 0, o queda disabled con monto > 0.
- **Severidad**: mayor.

**Paso 2.6** — Warning inline "verificado faltante".
- Con monto > 0 y checkbox **destildado**: debe aparecer texto ámbar debajo `Tildá "Pago verificado" para poder emitir, o dejá el monto en 0 si todavía no se cobró.`
- **Resultado esperado**: warning visible y el botón "Generar conduce de garantía" sigue clicable (la validación es en click, no en estado).
- **Fail si**: warning no aparece, o el botón queda disabled (debería bloquear en el click via toast, no en disabled del botón).
- **Severidad**: menor.

**Paso 2.7** — Warning inline "total supera".
- Setear monto manualmente a un valor que sumado a `totalPagado` supere el `totalItems` (ej: si pendiente real es RD$ 5,000, escribir 99999).
- **Resultado esperado**: aparece texto rojo `Total cobrado supera el total del conduce (RD$ X > RD$ Y). Ajustá el monto.`
- **Fail si**: warning no aparece o muestra cifras incorrectas.
- **Severidad**: mayor.

Restaurar el monto al pendiente correcto antes de continuar.

**Paso 2.8** — Configurar pago para emisión exitosa.
- Método: `transferencia`.
- Monto: pendiente real (default del paso 2.3, o reescribirlo).
- Banco: `BHD` (o cualquier nombre).
- Referencia: `TEST-QA-151`.
- Checkbox **"Pago verificado"**: **TILDADO**.
- **Resultado esperado**: todos los warnings ámbar/rojo desaparecen. El campo monto queda con valor numérico > 0, banco lleno, checkbox tildado en verde.
- **Severidad**: bloqueante si no se logra dejar limpio.

**Paso 2.9** — Selector de tiempo de garantía (admin/coord).
- En el bloque ámbar "Tiempo de Garantía", verificar que el preset "60 días" tiene un default visual (NO debería estar pre-seleccionado — el código pone `tiempoGarantiaDias` en `null` y exige selección antes de emitir; si "60 días" sale activo, anotarlo).
- **Resultado esperado real según código**: ninguno pre-seleccionado, chip rojo "Requerido para emitir" visible.
- **Fail si**: el botón "Generar conduce…" está habilitado sin haber seleccionado preset.
- **Severidad**: mayor (la consigna del usuario decía "60 por defecto" pero el código actual no lo pre-selecciona — discrepancia legítima a reportar a coordinator/builder).

Click en preset **"60 días"** → debe quedar resaltado naranja/ámbar contrastado.

═══════════════════════════════════════════════════════
## GENERACIÓN DEL CONDUCE
═══════════════════════════════════════════════════════

**Paso G1** — Click "Generar conduce de garantía".
- **Resultado esperado**:
  - Botón cambia a "Generando conduce..." con icon check y se deshabilita.
  - En 1-3 segundos: toast custom blanco con shadow + título "Conduce CG-XXXXX generado" + botón verde "Enviar por WhatsApp" + botón X "Cerrar" (si la orden tiene `clienteTelefono`). Si no hay teléfono, toast verde simple "Conduce CG-XXXXX generado".
  - Modal se cierra automáticamente.
  - Consola: cero errores rojos. Pueden aparecer warnings amarillos no bloqueantes (audit log best-effort, notif).
- **Anotar**: número CG-XXXXX exacto que se mostró.
- **Fail si**:
  - Toast rojo "Error al generar el conduce de garantía".
  - Consola muestra `permission-denied` (gotcha userProfile.id vs auth.uid — ver casos negativos N4).
  - Modal no cierra.
  - Toast no aparece pero modal cierra (síntoma raro — anotar).
- **Severidad**: bloqueante.

═══════════════════════════════════════════════════════
## VALIDACIÓN POST-EMISIÓN
═══════════════════════════════════════════════════════

**Paso V1** — Navegar a `/admin/facturas`.
- Buscar el CG-XXXXX recién generado en la tabla/lista.
- **Resultado esperado**: aparece con OS-XXXX vinculada, total = `totalItems`, estado **"pagada"** (si el monto del pago nuevo cubrió el saldo) o **"emitida"** (si quedó saldo). Si el cliente tiene teléfono, debería haber botón de enviar WhatsApp.
- **Fail si**: no aparece, aparece con estado inconsistente, o sin OS vinculada.
- **Severidad**: bloqueante.

**Paso V2** — Verificar campanita de notificaciones.
- Icono campanita en el header → abrir dropdown.
- **Resultado esperado**: aparece **"Conduce CG-XXXXX emitido"** (tipo `conduce_emitido`) con preview del cliente, total, "Pago verificado: sí". Como el ejecutor es admin (`apnbrito@gmail.com`) y la regla excluye self-notificación, **NO debería aparecer en su propia campanita** — solo en la de OTROS admins/coord activos. Si hay otro admin/coord en `personal` con `uid` y `activo=true`, la notif iría para él.
- **Fail si**:
  - Aparece en la propia campanita del admin (self-notificación rota).
  - No aparece para NINGÚN admin/coord (revisar consola por `crearNotificacion … falló`).
- **Severidad**: mayor (es feature nueva del sprint pero best-effort, no bloquea emisión).
- **Tip**: para verificar fácil sin segundo login, abrir Firebase Console → `notificaciones` y filtrar por `tipo == 'conduce_emitido'` y `createdAt` reciente.

**Paso V3** — Volver a `/admin/facturacion-pendiente`.
- **Resultado esperado**: la orden OS-XXXX **ya no aparece** en la bandeja de pendientes (porque ahora tiene `facturada=true`).
- **Fail si**: sigue ahí (significa que el update a `ordenes_servicio` falló silenciosamente — revisar consola).
- **Severidad**: bloqueante.

**Paso V4** — Abrir la orden en `/admin/ordenes` (buscar por número OS-XXXX) y verificar:
- Campo `facturada` = true.
- Campo `facturaNumero` = CG-XXXXX recién emitido.
- En la lista de pagos: el nuevo pago aparece con monto correcto, método transferencia, banco BHD, referencia TEST-QA-151, badge **VERIFICADO** verde, y "registrado por" = nombre del admin.
- **Fail si**: el pago nuevo no aparece, monto incorrecto, falta badge VERIFICADO, o duplicado.
- **Severidad**: bloqueante (toca dinero).

**Paso V5** — Verificación manual de dinero (cinturón + tirantes).
- Pre-cierre: total orden = X, pagado = Y, pendiente = Z = X - Y.
- Pago nuevo registrado = Z (default).
- Post-cierre esperado: `montoPagado` orden = Y + Z = X. `factura.estado` = "pagada". `factura.fechaPago` = ahora.
- **Hacer la cuenta en papel/calculadora** y comparar.
- **Fail si**: cifras no coinciden, falta `fechaPago`, o `estado` != "pagada" cuando el cobro fue completo.
- **Severidad**: bloqueante (gotcha dinero — CLAUDE.md exige verificación manual).

═══════════════════════════════════════════════════════
## CASOS NEGATIVOS A EJERCER
═══════════════════════════════════════════════════════

> Estos casos requieren elegir **otra orden** distinta a la del flujo principal (la primera ya está facturada).

**Caso N1** — Generar SIN tildar "Pago verificado" (con monto > 0).
- Setup: paso 1 OK, paso 2 con monto > 0, banco lleno, garantía elegida, checkbox **destildado**.
- Acción: click "Generar conduce de garantía".
- **Resultado esperado**: toast rojo `Tildá "Pago verificado" antes de emitir, o dejá el monto en 0.` Modal **NO se cierra**. No se crea factura en `facturas`. Consola sin errores rojos.
- **Fail si**: se emite igual, o toast no aparece, o modal cierra.
- **Severidad**: bloqueante (es la validación dura del sprint).

**Caso N2** — Generar con nota vacía.
- Setup: paso 1 con textarea de nota **vacío**, paso 2 con pago verificado correcto, garantía elegida.
- Acción: click "Generar conduce".
- **Resultado esperado**: emite normal (la nota es opcional según código línea 526-527: solo se persiste si `notaTrim` no vacío). Toast verde. En `facturas/{id}` el campo `notaConduce` **no debe existir** (no se persisten campos vacíos).
- **Fail si**: bloquea pidiendo nota, o persiste `notaConduce: ''` en Firestore.
- **Severidad**: menor.

**Caso N3** — Ítem con descripción vacía después de editar.
- Setup: paso 1, editar la descripción de un ítem hasta dejarlo en blanco (solo espacios).
- Acción: ir a paso 2 (válido si hay al menos 1 ítem) y clickear "Generar".
- **Resultado esperado**: toast rojo `Todos los items necesitan descripción.` Modal NO cierra.
- **Fail si**: emite igual, factura con ítem sin descripción.
- **Severidad**: mayor.

**Caso N4** — Probar con usuario operaria/técnico (gotcha userProfile.id vs auth.uid).
- Solo si hay credencial de operaria a mano. Si no, **anotar como pendiente** y reportar al coordinator.
- Setup: logout del admin → login como operaria. Navegar a `/admin/facturacion-pendiente`.
- **Resultado esperado**: si la operaria tiene rol con permiso `facturasVer`/equivalente, ve la lista y puede procesar. El `currentUser.uid` es el auth.uid, así que `solicitanteUid` en audit logs y `verificadoPorId` en pago debe ser el uid real (no el doc id de `personal`).
- **Fail si**: `permission-denied` silencioso en consola, o el pago queda con `verificadoPorId` que no matchea el `auth.uid` de la operaria.
- **Severidad**: mayor (gotcha conocido del repo, vector P-001).
- **Tip**: verificar `personal/{...}` de la operaria → confirmar que `uid` está seteado.

**Caso N5** — Total cobrado supera el total del conduce.
- Setup: paso 2, monto del pago nuevo = un número que sume con pagos previos > totalItems.
- Acción: click "Generar".
- **Resultado esperado**: toast rojo `Total cobrado supera el total del conduce. Ajustá el monto.`
- **Fail si**: emite igual o no bloquea.
- **Severidad**: bloqueante (toca dinero).

**Caso N6** — Doble-click rápido en "Generar".
- Setup: estado válido para emitir.
- Acción: dos clicks rápidos consecutivos en "Generar conduce de garantía".
- **Resultado esperado**: solo se crea **un** CG-XXXXX (el flag `generando` deshabilita el botón al primer click). Verificar en `/admin/facturas` que NO hay duplicado.
- **Fail si**: dos facturas con el mismo OS, dos pagos sumados al doble del esperado, o dos counters consumidos.
- **Severidad**: bloqueante (regression — el reviewer dijo PASS gracias a este flag, hay que confirmarlo en producción).

═══════════════════════════════════════════════════════
## VERIFICACIONES UI / CONSOLA
═══════════════════════════════════════════════════════

- [ ] Sin errores rojos en consola del browser durante todo el flujo.
- [ ] Sin warnings de React (key duplicada, hook order, etc.).
- [ ] Modal se ve bien en desktop (≥ 1280px). Opcional: probar en móvil con DevTools responsive (375px) — el grid `sm:grid-cols-2` del bloque "Registrar pago" debe colapsar a 1 columna.
- [ ] Spanish dominicano consistente ("Tildá", "Seleccioná", "dejá", "Ajustá").
- [ ] Loading states visibles: botón "Generando conduce..." durante emisión.
- [ ] Empty states claros: caja gris "Esta orden no tiene pagos previos…" si aplica.

═══════════════════════════════════════════════════════
## VERIFICACIONES FIRESTORE (admin → Firebase Console)
═══════════════════════════════════════════════════════

Recomendado al final para validar persistencia exacta (Firebase Console → Firestore Data):

- [ ] `facturas/{nuevoId}`:
  - `numero` = CG-XXXXX (counter consumido correctamente, no salteado).
  - `notaConduce` presente si se escribió, ausente si vacío (NO `''`).
  - `estado` = 'pagada' o 'emitida' según corresponda.
  - `fechaPago` presente si `estado='pagada'`, ausente si `'emitida'`.
  - `tipoCierre` presente (`reparacion_completa`/`solo_chequeo`).
  - `garantia.tiempoDias` = 60, `estado: 'vigente'`, `token` UUID.
  - `clienteTipoEnEmision` = 'particular' o 'b2b'.
- [ ] `ordenes_servicio/{ordenId}`:
  - `facturada: true`, `facturaId`, `facturaNumero` correctos.
  - `pagos` array contiene el nuevo pago con `id` único, `verificado: true`, `verificadoPorId`, `verificadoAt`.
  - `auditoria` array tiene un registro nuevo con accion 'editar' descripción "Factura generada CG-XXXXX (RD$ X)".
- [ ] `auditoria_admin` colección:
  - doc con `accion: 'emitir_conduce_con_pago'`, `solicitanteUid` = auth.uid del ejecutor, `conduceNumero`, `tieneNota`, `pagoNuevo` con verificado/banco/referencia.
  - doc con `accion: 'emitir_garantia'` adicional (best-effort).
- [ ] `notificaciones` colección:
  - 1 doc por cada admin/coord activo distinto del ejecutor, con `tipo: 'conduce_emitido'`, `userId` = uid del destinatario, `ordenId`, `ordenNumero`.
  - 0 docs con `destinatarioId` (gotcha resuelto SPRINT-127).
- [ ] Counter `config/contador` (o donde viva):
  - `facturas` incrementado en 1 respecto al pre-test (consumido atómicamente).
  - No hay saltos.

═══════════════════════════════════════════════════════
## VEREDICTO ESPERADO
═══════════════════════════════════════════════════════

- **PASS**: todos los casos bloqueantes y mayores en GREEN. Casos menores/cosméticos pueden quedar con observación pero no bloquean cierre del sprint.
- **PARTIAL**: hay 1-2 fallos menores. Anotar y abrir sprint follow-up; el sprint actual se cierra con observación.
- **FAIL_AT_<paso>**: bloquear cierre del sprint, volver al coordinator con bug report.

> Recordatorio: este plan reemplaza la suite automatizada (que `test_engineer` está construyendo). Su valor depende de que Jorge lo ejecute de corrido en una sentada — saltarse pasos invalida el QA.
