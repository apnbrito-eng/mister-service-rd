# Revisión Android + prueba cruzada técnico–administración — 28 sep 2026

**Modo:** solo lectura. No se modificó código de producción, ni rules, ni se publicó.
**Evidencia:** APK 1.0.16 (17) · Samsung S24 Ultra, Android 16 físico · control local Mobile Next MCP · web PC como administración.
**Informe de campo:** `2026-09-28-android-fisico.md` · **Informe extendido con snippets:** `~/.claude/plans/revisa-en-modo-lectura-elegant-reddy.md`
**Evidencias gráficas:** `evidencias-android-20260928/` — `orden-qa-chequeo.jpg`, `orden-qa-realizada.jpg`, `orden-qa-cerrada.jpg`

---

## Resumen de estado por hallazgo

| # | Hallazgo | Prioridad | Estado tras contrastar con código |
|---|---|---|---|
| H1 | GPS en segundo plano no confiable | Alta | **Reproducido en código** + hipótesis complementaria sin traza |
| H2 | Jornada local detenida con servidor activo | Alta | **Reproducido en código.** Hipótesis de Jorge confirmada |
| H3 | Ponche no controla la jornada | Función pendiente | **Confirmado** — no existe el acoplamiento |
| H4 | Cabecera de técnico comprimida | Media | **Reproducido.** Cosmético |
| H5 | Comisión devengada sin cobro | Contable | **Diseño existente, no documentado.** Requiere decisión de negocio |

---

## H1 — Seguimiento GPS en segundo plano (Alta)

**Observado en el dispositivo:** la primera recepción llegó al servidor. Al enviar la app a segundo plano, la muestra envejeció hasta 133 s sin nueva recepción. Al volver a primer plano apareció retraso y error de sincronización.

**Lo que confirma el código:**

- `src/mobile/jornada.ts:18` — `enviarPendiente` tiene un rate limit interno de **60 s** que compite con el rate limit de **15 s** del servidor y con el ritmo de muestreo. Las muestras pueden descartarse en silencio.
- **No hay `App.addListener('resume', ...)`** que fuerce reenvío ni reconciliación al volver a primer plano.
- `AndroidManifest.xml` **no declara `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`** — One UI de Samsung puede matar el foreground service.

**Límite de la evidencia:** los 133 s son consistentes con los tres caminos a la vez. Sin logcat ni traza de red no se puede determinar cuál dominó. La duración observada tampoco cubre ahorro de batería agresivo, pantalla bloqueada prolongada ni pérdida de red.

**Corrección mínima propuesta:**
1. Unificar los rate limits: que el cliente no descarte por debajo de la ventana del servidor.
2. Agregar listener de `resume` que dispare reenvío de pendientes + reconciliación de estado con `api/movil/estado.ts`.
3. Declarar el permiso de exención de optimización de batería y pedirlo explícitamente.

**Pruebas que faltan:** pasada con logcat activo · pantalla bloqueada 10+ min · modo avión intermedio con recuperación · app matada por el sistema.

---

## H2 — Jornada local detenida con el servidor activo (Alta)

**Observado:** segundo intento, con permisos ya concedidos, reprodujo la divergencia. Se cerró solo esa jornada QA con una transacción condicionada a su inicio.

**Causa confirmada en código:** `src/mobile/jornada.ts:29` trata **401, 403 y 409 como una misma clase terminal** y llama a `detenerJornada(false)`. El servidor queda con la jornada abierta hasta el timeout de 12 h.

Solo el **409** es realmente terminal. **401 y 403 son recuperables** con refresh de token (Auth o App Check).

**Corrección mínima propuesta:** separar el manejo por código de estado — 401/403 → intentar refresh y reintentar; 409 → cerrar local. Y agregar reconciliación al arrancar la app: si el servidor tiene jornada abierta y el cliente no, decidir explícitamente en vez de dejar la divergencia.

**Consecuencia de producto:** esto en la práctica **bloquea promocionar la función "GPS por jornada"** hasta cerrarlo. Una jornada fantasma abierta 12 h en el servidor contamina cualquier reporte de horas.

---

## H3 — Conexión Ponche ↔ Jornada (función pendiente)

**Confirmado:** `Ponche.tsx` no importa `iniciarJornada` ni `detenerJornada`. El grep cruzado no arroja coincidencias. Hoy la jornada tiene botones independientes y el ponche no invoca su inicio ni su cierre.

**Diseño sugerido:**
- Acoplar en `confirmarPonche()`: entrada inicia jornada, salida la cierra.
- Persistir `jornada.id` en `localStorage` para reanudar tras cierre de la app.
- UX de permisos: pedir al entrar a `/tecnico`, **no** al momento de ponchar — pedirlo en el ponche bloquea la acción más sensible del día.
- No ampliar el alcance de permisos más allá de lo necesario.

---

## H4 — Cabecera de técnico comprimida (Media, cosmético)

- `TecnicoVista.tsx:809` — falta `whitespace-nowrap`, el contador se parte en vertical.
- `TecnicoVista.tsx:814` — "Conocimientos" sin `hidden md:inline`, patrón que **ya usa el badge de GPS al lado**. El nombre se reduce a "Q…".

No hay tests visuales en el repo. Sugerido: test de assertion de clases en viewport 384 px.

---

## H5 — Comisión devengada sin cobro (contable) — REQUIERE DECISIÓN DE JORGE

**Reproducido en la prueba cruzada:** al cerrar OS-0011 desde administración se creó comisión de RD$10 sobre un precio de RD$100. El Samsung mostró RD$10 / 1 orden. La web conserva total RD$100, pagado RD$0, pendiente RD$100. **No hubo cobro al cliente ni pago de comisión.**

**Lo que dice el código:**

- `src/utils/comisiones.ts:952` (`registrarComisionPorOrden`) verifica precio, aprobación y fase — pero calcula sobre `precioFinal` y **no valida pago recibido** en ese recorrido.
- `comisiones.ts:1003` asigna `fechaCobro = new Date()` al cerrar la orden.
- `comisiones.ts:1016` crea la comisión con `estadoLiquidacion: 'pendiente'`.
- El patrón es **consistente en 3 funciones** — no parece un descuido, parece una decisión de diseño que nunca se documentó.
- `confirmarPagoOrden` (`ordenes.service.ts:1266`) verifica pagos pero **no toca comisiones**. Los dos flujos están desconectados.
- **No existe reversión automática**: no hay `revertirComision` ni `anularComision`.

**La decisión de negocio, en términos simples:** ¿el técnico gana su comisión cuando **termina el trabajo**, o cuando el **cliente paga**?

| Camino | Qué implica |
|---|---|
| **A — Devengar al cerrar** (lo que hace hoy el código) | Documentar la política, fijarla con un test que la proteja, y aceptar que una orden cerrada sin cobrar genera comisión. Riesgo: si el cliente nunca paga, hay que revertir a mano. |
| **B — Devengar al cobrar** | Introducir estado `'devengada'`, agregar la transición desde `confirmarPagoOrden`, y un cazador P-XXX que impida reintroducir el devengo temprano. Más trabajo, pero la comisión nunca precede al dinero. |

En ambos caminos hace falta lo mismo: función de reversión, y **excluir los datos ficticios de OS-0011 antes del próximo cierre de nómina real**.

---

## Lo que funcionó bien

**Móvil:** acceso QA · asignación y carga de OS-0011 · cámara nativa · subida de foto · ubicación puntual de inicio · cambio a diagnóstico · nota técnica · detalle y persistencia al relanzar.

**Administración (web):** arrastre y toque del botón IA · teclado · mapa de cliente · giro de pantalla · navegación · cierre contextual al tocar fuera.

**Prueba cruzada completa (16:29–16:35):** la web confirmó foto, ubicación y nota del Samsung · administración avanzó a "En cotización" y el Samsung lo reflejó **sin reinicio** · nota con propuesta de precio llegó automáticamente a la web · aprobación habilitó "Marcar realizado" en el móvil · cierre técnico con segunda foto, checklist y firma guardó todo y pasó a "Trabajo realizado" · administración avanzó a "Cerrado" y el Samsung pasó a 0 citas.

**Detalle de diseño que funcionó:** sin firma, "Cerrar servicio" permaneció **desactivado**. El gate funciona.

---

## No son fallas confirmadas

- Título del Inbox inicialmente recortado — **no se reprodujo** esperando carga nueva.
- Cambio de la primera fila durante la carga de clientes — **no se reprodujo**.
- Primer llenado de fecha por automatización que no actualizó React — **artefacto de la automatización**, no de la app. Se corrigió con interacción de teclado y el guardado quedó verificado.

No contarlos como bugs probados.

---

## Escenario QA conservado — NO BORRAR

**OS-0011** · cliente QA Test · modelo QA-ANDROID-20260928 · técnico QA Técnica sidepanel.

Estado: **cerrada**, con precio ficticio RD$100, saldo ficticio RD$100, comisión pendiente ficticia RD$10, garantía simulada de 60 días y una marca "T" de prueba en lugar de firma. Jornada GPS detenida. Sin pagos ni ponches nuevos. La auditoría registra la comisión creada por Jorge durante el ensayo.

> **Antes de liquidar nómina o usar reportes productivos, estos registros deben excluirse o revertirse.** No se eliminaron registros ni se registraron pagos ficticios para saldar el balance.

---

## Pendiente de una pasada específica

Cotización real · aprobación · cierre · pago y comisión (la prueba de cobro/facturación **no está realizada**) · desconexión prolongada · pantalla bloqueada · denegación y revocación de permisos.

---

## Para decidir antes de shippear

1. **H5 — política de comisión: devengar al cerrar o al cobrar.** Es la única decisión puramente de negocio de esta lista.
2. **H2 bloquea promocionar la función GPS-por-jornada.** El resto no impide shippear 1.0.16 si se acepta el estado actual con las salvedades documentadas.
