# Encargo para Codex — hallazgos QA Android 28/09/2026

**Origen:** revisión en solo lectura del APK 1.0.16 (17) sobre Samsung S24 Ultra / Android 16, más prueba cruzada técnico–administración. Informe completo: `claude/revision-android-qa-2026-09-28.md` en el proyecto; informe extendido con snippets en `~/.claude/plans/revisa-en-modo-lectura-elegant-reddy.md`.

**Nada de esto está corregido todavía.** Ningún archivo de producción se tocó en la pasada de revisión.

---

## Antes de empezar — protocolo del repo

Para cada sprint de abajo, en este orden:

1. **`archivist` modo PRE-CHANGE** sobre el touch-list (obligatorio, touch-list ≥1 archivo).
2. **Leer la sección del módulo en `docs/sprints/MAPA_RIESGOS_MODULOS.md`** — Órdenes, Comisiones, Técnicos según corresponda.
3. **Touch-list expandido**: archivos a modificar · consumidores verificados con `grep -rn` (archivo + líneas) · consumidores no afectados con justificación · hallazgos laterales documentados como deuda, **sin fixear en el sprint en curso**.
4. Flujo: `builder` → `tester` → `regression_guardian` → `reviewer`. Si el guardián devuelve `CHANGES_NEEDED`, volver al builder antes de cerrar.
5. Cada bug de producción cerrado produce **dos** cosas: gotcha en `AGENTS.md` **y** entrada `P-XXX` en `docs/PATRONES_REGRESION.md` + cazador en `scripts/invariantes/`.

**Orden recomendado:** S1 (H2) → S2 (H1) → S3 (H4) → S4 (H3). S5 (H5) está bloqueado esperando decisión de Jorge.

---

## S1 — Jornada: separar 401/403 de 409 (Alta, primero)

**Problema reproducido.** `src/mobile/jornada.ts:29` trata **401, 403 y 409 como una misma clase terminal** y llama a `detenerJornada(false)`. Resultado: el cliente cierra la jornada local pero el servidor la deja abierta hasta el timeout de 12 h. Una jornada fantasma de 12 h contamina cualquier reporte de horas.

Solo el **409** es terminal. **401 y 403 son recuperables** con refresh de token — Auth o App Check.

**Cambio propuesto:**

- Separar el manejo por código de estado:
  - `401` / `403` → intentar refresh de token (Firebase Auth y/o App Check según cuál falló) y **reintentar la llamada**. Si el reintento vuelve a fallar, no cerrar en silencio: dejar la jornada local marcada como "desincronizada" y avisar en UI.
  - `409` → cerrar local, es el único caso donde el servidor ya no tiene la jornada.
- Agregar **reconciliación al arrancar la app**: consultar `api/movil/estado.ts`; si el servidor tiene jornada abierta y el cliente no (o al revés), resolver explícitamente en vez de dejar la divergencia.

**Touch-list de partida** (verificar consumidores, no asumir): `src/mobile/jornada.ts`, `api/movil/estado.ts`, la vista que renderiza el estado de jornada en `src/pages/TecnicoVista.tsx`.

**Pruebas exigidas antes de cerrar:**
1. Forzar 401 (token expirado a mano) → debe refrescar y reintentar, no cerrar.
2. Forzar 403 (App Check inválido) → mismo comportamiento.
3. Forzar 409 → debe cerrar local, sin reintento.
4. Arrancar la app con jornada abierta en el servidor y ninguna local → debe reconciliar.
5. `npm run check:regression` verde.

**Cazador a agregar:** que detecte `detenerJornada(false)` alcanzable desde un bloque que agrupe 401/403 con 409.

**Nota de producto:** hasta que esto cierre, **no promocionar la función "GPS por jornada"**.

---

## S2 — GPS en segundo plano (Alta)

**Observado en dispositivo.** Primera recepción llegó al servidor. Con la app en segundo plano, la muestra envejeció **133 s** sin nueva recepción; al volver a primer plano, retraso y error de sincronización.

**Tres causas concurrentes confirmadas en código:**

1. `src/mobile/jornada.ts:18` — `enviarPendiente` tiene rate limit interno de **60 s**, que compite con el rate limit de **15 s** del servidor y con el ritmo de muestreo. Las muestras se descartan **en silencio**.
2. **No existe `App.addListener('resume', ...)`** que fuerce reenvío de pendientes ni reconciliación al volver a primer plano.
3. `AndroidManifest.xml` **no declara `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`** — One UI de Samsung puede matar el foreground service.

**Los 133 s son consistentes con las tres a la vez.** Sin logcat ni traza de red no se puede determinar cuál dominó — así que el sprint arregla las tres y **después** se mide.

**Cambio propuesto:**

- Unificar la ventana de rate limit: el cliente no debe descartar por debajo de la ventana que acepta el servidor. Y cuando descarte, que quede registrado — no en silencio.
- Agregar listener de `resume` → reenvío de pendientes + reconciliación contra `api/movil/estado.ts` (comparte diseño con S1; conviene hacer S1 primero y reusar).
- Declarar `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` y pedirlo explícitamente. **No ampliar más permisos que ese.**

**Pruebas exigidas:**
1. Pasada en dispositivo **con logcat activo**, para dejar traza de cuál camino dominaba.
2. Pantalla bloqueada 10+ minutos.
3. Modo avión intermedio y recuperación de red — verificar que los pendientes se reenvían.
4. App matada por el sistema.
5. Ahorro de batería agresivo activado.

Los escenarios 2–5 no se probaron en esta pasada. Ninguno de ellos está cubierto por los 133 s observados.

---

## S3 — Cabecera de técnico (Media, cosmético)

**Reproducido.** El nombre se reduce a "Q…" y el contador se parte en vertical.

- `src/pages/TecnicoVista.tsx:809` — falta `whitespace-nowrap`; por eso el contador se parte.
- `src/pages/TecnicoVista.tsx:814` — "Conocimientos" sin `hidden md:inline`. **El badge de GPS justo al lado ya usa ese patrón** — seguirlo, no inventar otro.

Evidencia: `evidencias-android-20260928/orden-qa-chequeo.jpg`.

**Prueba sugerida:** assertion de clases en viewport 384 px. No hay tests visuales en el repo; este sería el primero, así que mantenerlo mínimo.

---

## S4 — Ponche ↔ Jornada (función nueva, no un arreglo)

**Confirmado:** `Ponche.tsx` no importa `iniciarJornada` ni `detenerJornada`; el grep cruzado no arroja coincidencias. Hoy la jornada tiene botones independientes y el ponche no la controla.

**Diseño acordado:**

- Acoplar en `confirmarPonche()`: **entrada inicia** jornada, **salida la cierra**.
- Persistir `jornada.id` en `localStorage` para **reanudar tras cierre de la app**.
- **Permisos: pedirlos al entrar a `/tecnico`, no al ponchar.** Pedir permiso de ubicación en el momento del ponche bloquea la acción más sensible del día del técnico.
- Reconciliación con servidor al reanudar — reusa lo de S1.
- No ampliar el alcance de permisos más allá de lo que ya se necesita.

**Hacerlo después de S1.** Acoplar el ponche a una jornada que todavía se desincroniza multiplica el problema en lugar de contenerlo.

---

## S5 — Comisión sin cobro — BLOQUEADO, no tocar

**Va a `docs/sprints/BLOQUEOS.md`.** Toca código de dinero y la política de negocio todavía no está decidida. **Codex no debe modificar `src/utils/comisiones.ts` en esta ronda.**

**Lo reproducido:** al cerrar OS-0011 desde administración se creó comisión de RD$10 sobre precio de RD$100. La web conserva total RD$100, pagado RD$0, pendiente RD$100. No hubo cobro al cliente ni pago de comisión.

**Lo que dice el código:**

- `src/utils/comisiones.ts:952` (`registrarComisionPorOrden`) verifica precio, aprobación y fase, calcula sobre `precioFinal`, y **no valida pago recibido**.
- `comisiones.ts:1003` asigna `fechaCobro = new Date()` al cerrar la orden.
- `comisiones.ts:1016` crea con `estadoLiquidacion: 'pendiente'`.
- El patrón es **consistente en 3 funciones** — es diseño, no descuido. Simplemente nunca se documentó.
- `confirmarPagoOrden` (`src/services/ordenes.service.ts:1266`) verifica pagos pero **no toca comisiones**. Los dos flujos están desconectados.
- **No existe reversión**: no hay `revertirComision` ni `anularComision`.

**La pregunta para Jorge:** ¿el técnico gana la comisión cuando **termina el trabajo** o cuando el **cliente paga**?

| Camino | Trabajo que implica |
|---|---|
| **A — al cerrar** (comportamiento actual) | Documentar la política en `AGENTS.md`, fijarla con un test que la proteja. Falta igual: función de reversión para cuando el cliente no paga. |
| **B — al cobrar** | Estado `'devengada'` nuevo · transición desde `confirmarPagoOrden` · cazador `P-XXX` que impida reintroducir el devengo temprano · función de reversión. |

**Los dos caminos necesitan la función de reversión.** Eso se puede empezar sin decidir A o B.

---

## Datos QA a excluir antes de nómina real

**OS-0011** · cliente QA Test · modelo QA-ANDROID-20260928 · técnico QA Técnica sidepanel.

Cerrada, con precio ficticio RD$100, saldo ficticio RD$100, comisión pendiente ficticia RD$10, garantía simulada de 60 días y una marca "T" en lugar de firma real. La auditoría registra la comisión creada durante el ensayo.

**No borrar** — es la evidencia de la pasada. Pero **excluir o revertir antes de liquidar nómina o sacar reportes productivos**. No se registraron pagos ficticios para saldar el balance, así que el saldo pendiente de RD$100 también es ficticio.

---

## Fuera de alcance de esta ronda

No probado todavía, queda para una pasada específica: cotización real · aprobación · cierre · **pago y facturación** (la prueba de cobro no se hizo) · desconexión prolongada · pantalla bloqueada · denegación y revocación de permisos.

---

## No son bugs — no perseguirlos

- Título del Inbox recortado → **no se reprodujo** esperando carga nueva.
- Cambio de primera fila durante carga de clientes → **no se reprodujo**.
- Fecha que no actualizó React en el primer llenado → **artefacto de la automatización**, no de la app. Se corrigió con interacción de teclado y el guardado quedó verificado.
