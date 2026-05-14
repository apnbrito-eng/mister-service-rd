# QA Browser Claude — Kit de prompts QA visual

> **Qué es esto.** Un catálogo de prompts listos para copiar/pegar en la **Claude del sidepanel del Chrome** (extensión Claude in Chrome) para que ella pruebe la app de Mister Service RD desde adentro del navegador, simulando un usuario real. Reemplaza el QA manual de Jorge — la Claude del browser hace clicks, escribe texto, lee toasts y reporta hallazgos.
>
> **Cuándo usar.** Después de cada sprint que toca UI/UX. Antes de cualquier deploy importante. Para regression testing periódico de flujos críticos.
>
> **Quién lo usa.** Jorge abre la Claude del sidepanel en Chrome (mismo browser donde está logueado a `app.misterservicerd.com`), copia un prompt de este doc, lo pega, y mira cómo la Claude del browser prueba. Después pega el reporte de vuelta a Cowork (el chat del desktop app) o al coordinator de Claude Code para análisis.

---

## Las 3 Claudes — quién hace qué

| Claude | Dónde vive | Qué puede hacer | NO puede |
|---|---|---|---|
| **Cowork** | Claude desktop app | Filesystem, controla Chrome MCP (tabs nuevos sin sesión), conversa con Jorge | No tiene la sesión de admin de Jorge en su tab MCP |
| **Coordinator** (Claude Code) | Terminal | Filesystem + shell + agentes (builder, tester, reviewer, qa, devops) | NO tiene browser |
| **Claude in Chrome** (sidepanel) | Sidepanel del browser | DENTRO del tab logueado, clicks reales, lee DOM, screenshots | Solo lo que el rol logueado puede ver |

La Claude del sidepanel es la que ejecuta este kit.

---

## Protocolo de uso

### Antes de pegar un prompt

1. Confirmar que estás logueado en el rol correcto que el prompt asume (admin / coord / técnico / operaria / secretaria).
2. Si vas a probar con otro rol y no tenés cuenta de prueba dedicada, hacé logout y login con la cuenta correspondiente.
3. Hard refresh la app (Cmd+Shift+R) antes de empezar para descartar cache.

### Después del reporte

1. Si todo PASS — copiale el reporte a Cowork (o al coordinator) y pedile que cierre el sprint correspondiente.
2. Si hay FAIL — copialo igual + screenshot del error si es visual. Cowork o el coordinator deciden si abrir sprint de fix.
3. Si hay UX raro pero no roto — anotalo en `docs/sprints/HALLAZGOS_QA.md` para considerarlo en próximo sprint.

### Cuentas de prueba (recomendado armar)

Antes de usar este kit en serio, crear cuentas dedicadas en `/admin/usuarios` para no contaminar las reales:

- `test-admin@misterservicerd.com` — admin de prueba.
- `test-coord@misterservicerd.com` — coordinadora de prueba.
- `test-tec@misterservicerd.com` — técnico de prueba.
- `test-op@misterservicerd.com` — operaria de prueba.
- `test-sec@misterservicerd.com` — secretaria de prueba.

Guardar passwords en password manager local (1Password / Apple Keychain / etc.) — NO escribirlos en chats ni en este doc.

---

## Plantillas por rol

Cada plantilla arranca con el contexto del usuario. Después de pegar el prompt, la Claude del sidepanel sabe qué tipo de cuenta tiene y qué puede tocar.

### ADMIN

```
Estoy logueado como ADMIN en (usuario ya logueado en su tab).
Esto es ambiente de pruebas pre-producción (todos los datos son test).
Probá lo siguiente paso por paso. Reportá en español simple después de cada paso.
Si algo falla, parate, describime qué viste, y esperá mi respuesta antes de seguir.

[INSERTAR PASOS DEL PROMPT ESPECÍFICO]
```

### COORDINADORA

```
Estoy logueado como COORDINADORA en (usuario ya logueado en su tab).
Esto es ambiente de pruebas pre-producción.
La coord puede emitir conduces, ver dashboard, gestionar clientes,
asignar técnicos. NO puede modificar permisos ni rules.
Probá lo siguiente paso por paso.
Si encontrás un botón o sección que dice "no autorizado", reportámelo.

[INSERTAR PASOS]
```

### TÉCNICO

```
Estoy logueado como TÉCNICO en (usuario ya logueado en su tab).
Esto es ambiente de pruebas pre-producción.
La interfaz del técnico está en /tecnico (no en /admin). Probá lo siguiente.
Si caés en /admin algún momento, reportámelo porque el rol técnico nunca
debería ver esa sección.

[INSERTAR PASOS]
```

### OPERARIA

```
Estoy logueado como OPERARIA en (usuario ya logueado en su tab).
La operaria gestiona órdenes, agenda, ruta, comisiones de su grupo
de técnicos. Puede emitir conduces de garantía si tiene el permiso
ordenesEliminar = false por defecto.
Probá lo siguiente paso por paso. Si ves campos o botones que crees
que la operaria no debería ver, reportámelo.

[INSERTAR PASOS]
```

### SECRETARIA

```
Estoy logueado como SECRETARIA en (usuario ya logueado en su tab).
La secretaria recibe leads, agenda citas, gestiona la bandeja de
entrada. Tiene acceso limitado al dashboard.
Probá lo siguiente paso por paso. Si ves algún flujo financiero
o configuración, reportámelo (la secretaria no debería).

[INSERTAR PASOS]
```

---

## Catálogo de flujos críticos

Cada flujo es un prompt completo, listo para copiar y pegar.

### FLUJO 1 — Emitir conduce de garantía (SPRINT-151)

> **Rol:** admin o coord. **Tiempo estimado:** 5 minutos. **Pre-condición:** existe al menos una orden cerrada lista para facturar.

```
Estoy logueado como ADMIN. Probá el modal "Emitir conduce de garantía"
del SPRINT-151. Reportá qué ves después de cada paso. Si algo falla, parate.

1. Andá a /admin/facturacion-pendiente y hard refresh.
2. Buscá una orden cerrada lista para facturar. Decime cuál elegiste (OS-XXXX).
3. Click "Procesar" en esa orden. Se abre un modal con stepper de 2 pasos.

PASO 1 (Aprobar contenido):
4. Click sobre la descripción de un ítem e intentá tipear.
   - ¿Es editable o readonly?
   - Si es de inventario, ¿se puede editar el texto manteniendo el vínculo al producto?
5. Buscá el campo nuevo "Nota para el conduce" (textarea con contador).
   Escribí "Prueba SPRINT-151 — QA browser".
   - ¿El contador muestra los caracteres usados?
   - ¿Llega hasta 500?

PASO 2 (Confirmar pagos):
6. Click "Siguiente: Confirmar pagos".
7. ¿Ya NO dice "hazlo desde la orden antes de continuar"?
8. ¿Aparece un bloque "Registrar pago de este conduce"?
   Si sí, llenálo:
   - Método: transferencia
   - Monto: default
   - Banco: cualquiera
   - Referencia: TEST-001
   - Tildá "Pago verificado"
9. tiempoGarantiaDias debe estar en 60 por default. ¿Lo está?
10. Click "Generar conduce de garantía".
11. Decime el número CG-XXXXX del toast.

DESPUÉS:
12. Andá a /admin/facturas. Buscá el conduce nuevo. ¿Aparece con OS-XXXX vinculada?
13. Mirá la campanita arriba a la derecha. ¿Hay notificación "Conduce CG-XXXXX emitido"?

Reportame todo en orden.
```

### FLUJO 2 — Cerrar orden con wizard del técnico

> **Rol:** técnico. **Tiempo:** 3 minutos. **Pre-condición:** existe orden agendada al técnico.

```
Estoy logueado como TÉCNICO. Probá el wizard de cierre de orden con período
de garantía. Reportá qué ves en cada paso.

1. Andá a /tecnico.
2. Buscá una orden en estado "trabajo_realizado" o lista para cerrar.
   Decime cuál (OS-XXXX).
3. Click "Cerrar orden" o equivalente.
4. El wizard tiene 4-5 pasos. En cada uno reportame qué pide:
   - Paso 1: ¿Pregunta si equipo funciona? ¿Cliente satisfecho?
   - Paso 2: ¿Pide foto del cierre?
   - Paso 3: ¿Revisó conexiones (toggle)?
   - Paso 4: PERÍODO DE GARANTÍA — elegí 1 día.
     Reportame qué opciones de período te muestra (1d / 30d / 60d / 90d / etc.).
   - Paso siguiente: ¿pide firma del cliente?
5. Finalizá el wizard.
6. Volvé al listado. ¿La orden quedó marcada como cerrada?

Reportá todo.
```

### FLUJO 3 — Crear orden nueva desde admin

> **Rol:** admin o coord. **Tiempo:** 5 minutos.

```
Estoy logueado como ADMIN. Probá el flujo de crear orden nueva.

1. Andá a /admin/ordenes.
2. Click "Nueva orden" (o similar).
3. Llená:
   - Cliente: elegí uno existente o crea uno test "Cliente QA Browser".
   - Equipo tipo: lavadora.
   - Equipo marca: Samsung.
   - Equipo modelo: WA-TEST-001.
   - Descripción falla: "Test SPRINT — la lavadora no centrifuga".
   - Técnico: elegí Aury Mon (o el primero del dropdown).
   - Fecha cita: mañana.
4. Guardá la orden.
5. Decime el OS-XXXX que se generó.
6. Verificá:
   - ¿El número OS-XXXX es secuencial (último OS conocido + 1)?
   - ¿Aparece en la lista con técnico Aury Mon?
   - ¿Aparece con operaria asignada (debería derivarse del técnico)?
7. Abrila desde la lista. Confirmame que cliente, equipo, técnico, operaria,
   fecha cita están todos visibles.

Reportá.
```

### FLUJO 4 — Reclamar garantía como cliente (endpoint público)

> **Rol:** cliente (sin login). **Tiempo:** 2 minutos. **Pre-condición:** existe conduce CG-XXXXX con token de garantía emitido.

```
NO estoy logueado. Voy a probar el flujo del cliente que reclama garantía.

1. Conseguí un token de garantía válido. Pidemelo si no lo tenés.
2. Andá a (usuario ya logueado en su tab)/garantia/<TOKEN>.
3. Reportame qué ves:
   - ¿Aparece el countdown de días restantes?
   - ¿Muestra cliente, equipo, fecha del servicio?
   - ¿Hay botón "Reclamar garantía"?
   - ¿Está enabled o disabled?
4. Si el botón está enabled, NO lo cliquees (todavía).
   Reportame si visualmente todo se ve coherente.

Reportá.
```

### FLUJO 5 — Marcar garantía manual desde Conduces

> **Rol:** admin o coord. **Tiempo:** 3 minutos.

```
Estoy logueado como ADMIN. Probá el flujo de "Marcar como garantía manual"
de SPRINT-148.

1. Andá a /admin/facturas.
2. Elegí un conduce CG-XXXXX (decime cuál).
3. Click "Marcar garantía" (botón nuevo de SPRINT-148).
4. Se abre un modal ensanchado. ¿Muestra la orden completa antes del form?
5. Si el conduce es de orden "Solo chequeo · sin reparación", ¿hay un
   badge amber prominente arriba que diga eso?
6. Mirá los datos: técnico responsable, equipo, fotos del cierre,
   satisfacción del cliente. ¿Aparece todo?
7. NO completes el form (cancelá). Solo reportame qué visualizaste.

Reportá.
```

### FLUJO 6 — Agenda diaria (SPRINT-145 fix P-006)

> **Rol:** admin, coord u operaria. **Tiempo:** 2 minutos.

```
Estoy logueado como ADMIN. Probá la página /admin/agenda con el fix de SPRINT-145.

1. Andá a /admin/agenda.
2. Hoy debería haber al menos 1 orden agendada para hoy con técnico Aury Mon.
   Si no, decímelo.
3. Verificá:
   - ¿KPIs arriba muestran números > 0 (no todos en 0)?
   - ¿Aury Mon aparece en la lista de técnicos del día con sus órdenes?
   - ¿Aury Mon NO aparece en "Sin citas hoy"?
4. Si todo OK, decime "AGENDA OK".
   Si algo está mal, screenshot mental del estado.

Reportá.
```

---

## Catálogo de regresiones (correr después de cualquier sprint que toca UI)

> Listas más cortas, pensadas para confirmar que un cambio no rompió funcionalidad existente.

### Regression 1 — Dashboard admin

```
Estoy logueado como ADMIN. Después del último deploy quiero confirmar
que el dashboard sigue OK.

1. Andá a /admin/dashboard.
2. Mirá los 4-6 KPIs principales. Decime si todos muestran datos (no errores).
3. Mirá si hay banner nuevo de versión (SPRINT-versión-banner).
4. Click cualquier KPI clickeable. ¿Lleva a la página correcta?

Reportá.
```

### Regression 2 — Sidebar y permisos

```
Estoy logueado como ADMIN. Quiero confirmar que el sidebar no perdió ítems
después del lote SPRINT-117c.

1. Listá todos los ítems del sidebar.
2. Click en cada uno secuencialmente. Decime cuál carga OK y cuál tira
   "no autorizado" o página en blanco.
3. Si encontrás un ítem que está pero no debería para admin, decímelo.

Reportá.
```

### Regression 3 — Modal de orden en mobile

```
Estoy logueado como ADMIN. Cambiá el browser a vista mobile (DevTools
responsive, ~390x844, iPhone 14 Pro).

1. Andá a /admin/ordenes.
2. ¿El layout es column (cards apiladas) o se rompe?
3. Abrí una orden. ¿Los botones Cancelar / Cómo llegar / Eliminar son
   todos clickeables sin recorte?
4. Cambiá a iPad portrait (~810x1080).
5. ¿Cómo cambia el layout? ¿Sigue todo accesible?

Reportá.
```

---

## Cómo reportar (formato sugerido)

Cuando termines, pegale a Cowork o al coordinator algo como:

```
QA <FLUJO> ejecutado el YYYY-MM-DD HH:MM como <ROL>.

Paso 1: OK — descripción de qué vi.
Paso 2: OK — ...
Paso 4: FAIL — el campo "X" no aparece. Esperaba textarea, vi readonly.
         Screenshot mental: en el lado derecho del modal, debajo de la tabla
         de ítems, no hay nada.
Paso 5: skip (no llegué porque paso 4 falló).

Resumen: 3/5 PASS, 1 FAIL crítico, 1 skip.
Recomendación: abrir sprint de fix para paso 4.
```

Esto le da a Cowork/coordinator información estructurada para decidir si cerrar el sprint o abrir uno nuevo.

---

## Mantenimiento del kit

- **Cuando se agrega una feature nueva** → agregar flujo correspondiente acá.
- **Cuando se cambia el UI de un flujo existente** → actualizar el prompt.
- **Cuando un flujo deja de existir** → borrar (no mantener prompts muertos).
- **Cuando una cuenta de prueba cambia rol** → actualizar la sección "Cuentas de prueba".

Responsable de mantener este doc: el agente `archivist` cuando cierra sprints UI/UX, o Cowork cuando agrega features visuales nuevas.

---

## Histórico de versiones

- **2026-05-12** — v1 creado por Cowork tras SPRINT-149 + SPRINT-151. Base inicial: 6 flujos críticos + 3 regressions + 5 plantillas de rol.
