# QA Prompt Maestro — E2E completo en 1 prompt para sidepanel Claude

> **Qué es esto.** Un único prompt copy-paste para `Claude in Chrome` (sidepanel) que ejerce el ciclo completo de una orden de servicio de Mister Service RD, pasando por los 5 roles definidos en `docs/QA_SUPER_USER.md` y reportando bugs + sugerencias UX al final. Pensado para que Jorge lo dispare 1 vez y obtenga cobertura E2E sin pausas humanas.
>
> **Cuándo usar.** Después de cualquier sprint que toque UI de órdenes, conduces, dashboard o notificaciones. Antes de cada deploy importante. Para regression semanal periódico.
>
> **Pre-requisitos.**
> 1. Las 5 cuentas QA existen y pasan el sanity check (`npx tsx scripts/qa-sanity-check.ts` → exit 0).
> 2. Cliente "QA Test" + teléfono `8090000000` existe en `/admin/clientes`. Si no, crearlo antes.
> 3. El browser donde corre Claude in Chrome tiene logout limpio (hard refresh + signout).
> 4. Jorge tiene las 5 passwords a mano (password manager) — la Claude pedirá login en cada switch de rol.
>
> **Política operativa** (replica de `docs/QA_SUPER_USER.md` — no la rompas):
> - NO crear datos con cliente real. Siempre "QA Test".
> - NO borrar órdenes / conduces de prueba al terminar.
> - NO ajustar rules ni configs globales aunque la Claude detecte un bloqueo.
> - Si una rule bloquea acción legítima del rol QA → es bug real del software.

---

## El prompt — copy/paste exacto

Pegá el bloque entre `>>>>>` y `<<<<<` (sin las líneas de marca) al sidepanel Claude. Jorge debe estar logueado como `qa-secretaria@misterservicerd.com` antes de pegar.

```
>>>>>
Sos Claude QA E2E para Mister Service RD. Estás en el sidepanel del Chrome de Jorge.
Vamos a hacer un ciclo COMPLETO de una orden de servicio pasando por 5 roles
distintos. Yo (Jorge) te aviso cuando cambie de cuenta logueada. Vos hacés los
clicks, leés DOM, y al final me das un reporte estructurado.

REGLAS INVIOLABLES:
1. Cliente siempre "QA Test" (ya existe en /admin/clientes — buscalo, NO lo crees).
2. Teléfono siempre 8090000000.
3. Observaciones: "TEST QA " + fecha de hoy.
4. Equipo: "Samsung TEST" / "Modelo QA-DUMMY-001".
5. NO mandes WhatsApp real (el número 8090000000 es placeholder reservado).
6. NO modifiques configs globales, NO crees clientes nuevos, NO borres nada.
7. Si algo está bloqueado por permisos para el rol QA correspondiente, REPORTÁLO
   como bug — significa que un usuario real con ese rol también está bloqueado.
8. Si una acción tarda más de 10 segundos sin feedback visible, anotálo como bug UX.
9. NO uses emojis en el reporte.

ROL 1 — qa-secretaria@misterservicerd.com (ya estoy logueada)

a. Andá a /admin/citas-por-confirmar. Esperá a que cargue. Reportá cuántas citas hay.
b. Click "Nueva cita" o equivalente. Llená:
   - Cliente: buscar "QA Test" (debe autocompletar).
   - Teléfono: 8090000000.
   - Equipo: Samsung TEST / QA-DUMMY-001.
   - Falla: "QA dummy fallo - no enciende".
   - Fecha: mañana 10:00 AM.
   - Observaciones: "TEST QA " + fecha de hoy.
   - Guardá.
c. Confirmá la cita recién creada. Andá a /admin/ordenes. Buscá la orden recién creada (la última con observación "TEST QA"). Anotá su número OS-XXXX.
d. Asigná un técnico. Click "Editar orden" o "Asignar técnico" → seleccioná QA Técnica Sidepanel. Esperá. Reportá:
   - ¿El selector de operaria se autocompletó al elegir técnico? (debe pasar — SPRINT-170)
   - ¿Apareció notificación toast?
   - ¿La fase de la orden se ve correcta?
e. Pegá el número OS-XXXX en tu reporte para que pueda hacer cross-check.

PAUSA — Jorge va a hacer logout y login como qa-tecnica@misterservicerd.com.
Decime "listo" en mi siguiente mensaje cuando termine.

ROL 2 — qa-tecnica@misterservicerd.com

a. Estás en /tecnico. Reportá si la orden OS-XXXX aparece en tu agenda.
b. Tocá la orden. Reportá la fase actual.
c. Click "Iniciar chequeo". Reportá si el botón funciona (en el pasado dio
   permission-denied — ver postmortem 2026-05-07).
d. Llená el wizard de diagnóstico. Pasos típicos:
   - Equipo prende? No.
   - Conexiones OK? Sí.
   - Diagnóstico: "QA - posible falla del módulo principal".
   - Sugerir precio: RD$ 2500.
   - Submit.
e. Reportá cualquier validación rara, botón con label confuso, transición de fase no esperada.

PAUSA — logout, login como qa-coordinadora@misterservicerd.com.

ROL 3 — qa-coordinadora@misterservicerd.com

a. Andá a /admin/ordenes. Buscá la OS-XXXX. Debe estar en fase "en_cotizacion" o
   "en_diagnostico" (depende del flujo — reportá cuál).
b. Abrí la orden. Buscá botón "Aprobar precio sugerido" o equivalente. Click.
c. Reportá la transición:
   - ¿La fase pasó a "aprobado"? (SPRINT-173 lo arregló para varios handlers — verificar).
   - ¿Llegó notificación toast?
   - ¿El historial de fases registró el cambio?
d. Cerrá la orden de tu lado (sin marcar trabajo_realizado — eso lo hace el técnico).

PAUSA — logout, login como qa-tecnica@misterservicerd.com (de nuevo).

ROL 4 — qa-tecnica@misterservicerd.com (cierre)

a. Volvé a /tecnico. Abrí la OS-XXXX.
b. Click "Marcar trabajo realizado" o "Cerrar servicio". Wizard de cierre:
   - Equipo funciona? Sí.
   - Cliente satisfecho? Sí.
   - Revisó conexiones? Sí.
   - Foto de cierre: usá cualquier imagen del Desktop (canvas con texto "QA TEST" sirve).
   - Firma del cliente: trazá una línea o "QA" con el mouse (SPRINT-159).
   - Período de garantía: 60 días (default).
   - Submit.
c. Reportá:
   - ¿La foto subió sin error?
   - ¿La firma se capturó?
   - ¿La orden transicionó a "trabajo_realizado"?

PAUSA — logout, login como qa-operaria@misterservicerd.com.

ROL 5 — qa-operaria@misterservicerd.com

a. Andá a /admin/facturas-pendientes (o equivalente — "Facturación pendiente").
b. Buscá la OS-XXXX. Debe aparecer porque está en trabajo_realizado.
c. Click "Emitir conduce" o equivalente. Validá el modal:
   - Monto pre-cargado correcto (RD$ 2500 menos lo que corresponda — reportá).
   - Período de garantía default 60 días (SPRINT-160).
   - Default deriva de wizard del técnico (debe coincidir con lo que pusiste en
     ROL 4 — si no coincide, BUG SPRINT-160 reabierto).
   - Botón "Verificar pago" presente (SPRINT-151).
   - Items editables (SPRINT-151).
d. Emití el conduce. Anotá el número CG-XXXXX.
e. Reportá:
   - ¿La orden transicionó a "cerrado"? (SPRINT-161 fixeó esto — verificar).
   - ¿Aparece en /admin/facturas con el conduce?
   - ¿Llegó notificación al emisor? (NO debería — SPRINT-176 decisión A).

PAUSA — logout, login como qa-admin@misterservicerd.com.

ROL 6 — qa-admin@misterservicerd.com (validación final)

a. Dashboard /admin/dashboard. Reportá:
   - KPI "Conduces emitidos" subió en 1? (SPRINT-162 — verificar).
   - KPI "Órdenes en curso" bajó en 1?
   - Hay alguna alerta visible que no debería estar?
b. Andá a /admin/ordenes. Abrí la OS-XXXX (modal). Reportá:
   - ¿Renderiza el bloque "Firma del cliente" con thumbnail? (SPRINT-168 — verificar).
   - ¿Renderiza foto del cierre? (SPRINT-158a — verificar).
   - ¿Período de garantía visible?
c. Andá a /admin/facturas. Expandí fila de CG-XXXXX. Mismas validaciones que (b).
d. Andá a /admin/notificaciones. Reportá:
   - ¿La ruta carga? (SPRINT-171 — antes redirigía al landing público).
   - ¿Cuántas notifs hay de tu sesión QA?
e. Bonus: navegá a /admin/notif-que-no-existe — debe mostrar 404 dentro del layout admin, NO redirigir al público.

FIN — REPORTE ESTRUCTURADO

Dame 4 secciones, cada una numerada y concisa. NO uses emojis.

## 1. Bugs estructurados
Por cada bug que encontraste:
- Rol que lo disparó.
- Pasos exactos para reproducir.
- Comportamiento esperado vs observado.
- Severidad (crítico / alto / medio / bajo).
- Sospecha de sprint relacionado si lo identificás del contexto del prompt.

## 2. Sugerencias UX ("río que fluye")
Cosas que técnicamente funcionan pero que un usuario humano sentiría como fricción:
- Botones con label confuso.
- Pasos repetidos innecesarios.
- Falta de feedback visual.
- Validaciones tardías.
- Cualquier cosa que vos, como Claude que está observando con paciencia infinita, hubieras simplificado.

## 3. Cobertura de módulos
Lista cada módulo / página que tocaste y marcá:
- OK (anduvo, sin observaciones).
- WARN (anduvo pero con sugerencias).
- FAIL (no anduvo, bug reportado en sección 1).

## 4. Evidencia
- Número de OS-XXXX y CG-XXXXX creados.
- Screenshots clave si pudiste (modal del cierre, dashboard antes/después).
- Cualquier console.error que viste en DevTools.
<<<<<
```

---

## Cómo leer el reporte

Cuando la Claude del sidepanel termine, vas a tener 4 secciones. Procedimiento:

1. **Sección 1 (bugs estructurados)** → pegale el bloque entero a Cowork. Cowork crea sprints en `docs/sprints/COLA_AUTONOMA.md` priorizando por severidad. **No proceses ningún bug sin esto** — los reportes sueltos se pierden.
2. **Sección 2 (sugerencias UX)** → opcional. Si hay 1-2 buenas, pedile a Cowork que abra `SPRINT-UX-<algo>`. Si hay 5+, pedile a Cowork que las consolide en una retro UX y prioricen.
3. **Sección 3 (cobertura)** → archiválo en `docs/sprints/EJECUCION_AUTONOMA.md` o en la próxima retro como evidencia.
4. **Sección 4 (evidencia)** → screenshots a tu carpeta personal. NO los commitees al repo (peso muerto).

---

## Limitaciones conocidas del prompt

- **Login manual entre roles.** El sidepanel Claude NO maneja passwords. Jorge logout/login cada switch. Total: 5 cambios de cuenta. Tiempo total estimado: 30-45 min.
- **No prueba cron jobs.** Recordatorios automáticos, notifs scheduled, etc. quedan fuera. Para esos hay sprints específicos (`SPRINT-WA-7`).
- **No prueba flujo público.** `/`, `/servicios`, `/agendar`, `/f/:slug` requieren un prompt separado (no requiere cuentas QA — es público).
- **No prueba mobile.** El sidepanel corre en desktop Chrome. Para mobile, QA humano distribuido (`docs/QA_E2E_DISTRIBUIDO.md`).
- **Drift de datos.** Si la última sesión QA dejó la OS-XXXX en un estado raro, el prompt puede fallar en un paso. Solución: regenerar cliente "QA Test" o saltarse el paso afectado y reportar como hallazgo.

---

## Histórico de ejecuciones

Cuando se corra el prompt por primera vez post-deploy, agregar acá:

| Fecha | Sprint cuya integración valida | Resultado (PASS/WARN/FAIL) | OS creada | CG creado | Notas |
|---|---|---|---|---|---|
| (pendiente primera ejecución) | SPRINT-QA-USER (este sprint) | — | — | — | El primer run es el setup inicial — no espera bugs nuevos. |

---

## Referencias cruzadas

- **Catálogo de cuentas + política:** `docs/QA_SUPER_USER.md`.
- **Sanity check:** `scripts/qa-sanity-check.ts`.
- **Kit QA browser general** (prompts puntuales, no E2E): `docs/QA_BROWSER_CLAUDE.md`.
- **QA E2E distribuido humano:** `docs/QA_E2E_DISTRIBUIDO.md`.
- **Sprint origen:** `docs/sprints/COLA_AUTONOMA.md` → `SPRINT-QA-USER`.
