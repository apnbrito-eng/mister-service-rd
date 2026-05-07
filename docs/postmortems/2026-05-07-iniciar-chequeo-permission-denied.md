# Postmortem — Iniciar Chequeo permission-denied (Aury Mon)

**Fecha del incidente:** 2026-05-07
**Detectado por:** Jorge (Aury Mon, técnica, reportó "Error al iniciar chequeo")
**Severidad:** alta
**Patrón asociado:** doble — P-006 nuevo (tecnicoId con personal.id) + P-002 variante (rules con `!=` sobre campo opcional sin `.get()`)
**Commits relacionados:**
- Introduce 1: dropdowns históricos en `OrdenCreateModal.tsx`, `OrdenEditForm.tsx`, `ModalEditarOrdenAdmin.tsx`, `MapaRutas.tsx`, `AgendaDia.tsx` (preexistente — guardaban `t.id` en `tecnicoId`).
- Introduce 2: `firestore.rules:113-116` (`modificaPrecioFinal`) — preexistente, expuesto cuando se intentó asignar técnico con `auth.uid` correcto.
- Fix 1: `c4be345` (2026-05-07) — dropdowns guardan `t.uid` + script `migrar-tecnicoid-a-authuid.ts` corrió en producción (47 órdenes migradas, 4 huérfanas).
- Fix 2: `b7b6464` (2026-05-07) — `modificaPrecioFinal` usa `.get('precioFinal', null)`.

---

## Resumen ejecutivo

Aury Mon, técnica recién dada de alta, no podía iniciar chequeo en sus órdenes. El botón devolvía `permission-denied` silencioso. Causa real fue una **cadena de dos bugs**: (1) las órdenes asignadas a Aury tenían `tecnicoId == personal.id`, no `auth.uid`, porque los dropdowns de "Asignar técnico" guardaban el doc id de `personal/`, no el campo `uid` adentro; (2) la rule `modificaPrecioFinal()` comparaba `precioFinal != precioFinal` con acceso directo, y como `precioFinal` es opcional (no existe todavía cuando el técnico inicia chequeo), Firestore Rules tira evaluation error y rechaza el update. El fix combinado fue migrar 47 órdenes a `auth.uid` + cambiar la rule a `.get('precioFinal', null)`. El cazador P-002 NO atrapó esto porque solo buscaba `==`, no `!=`.

---

## Timeline

| Hora (RD, UTC-4) | Evento |
|---|---|
| Pre-2026-05-07 | Dropdowns de "Asignar técnico" en 5 archivos guardan `t.id` (preexistente) |
| Pre-2026-05-07 | Rule `modificaPrecioFinal()` usa `!=` directo sobre `precioFinal` opcional (preexistente) |
| 2026-05-06 ~16:00 | SPRINT-103 corrige rules de inmutabilidad similares con `.get(field, null)`, pero NO toca `modificaPrecioFinal` (gap del cazador P-002) |
| 2026-05-07 mañana | Aury Mon es dada de alta como técnica, recibe órdenes asignadas |
| 2026-05-07 ~17:30 | Aury intenta iniciar chequeo — toast "permission-denied" sin código |
| 2026-05-07 ~17:50 | Jorge agrega `code` al toast (commit `f13faef`) para diagnóstico |
| 2026-05-07 ~18:18 | Diagnóstico confirma `tecnicoId != auth.uid`. Fix 1: dropdowns + migración (commit `c4be345`) |
| 2026-05-07 ~18:30 | Aury vuelve a intentar — sigue fallando, ahora por `modificaPrecioFinal` |
| 2026-05-07 ~18:37 | Fix 2: rule con `.get` (commit `b7b6464`) + `npm run deploy:rules` |
| 2026-05-07 ~18:40 | Validación: Aury inicia chequeo correctamente |

---

## Impacto

- **Usuarios afectados:** todos los técnicos cuyo `personal/{id}.id !== auth.uid`. Estimado por la migración: 47 órdenes activas con `tecnicoId` viejo (de Aury y técnicos previos al fix de P-004 SPRINT-105).
- **Funcionalidad bloqueada:** "Iniciar Chequeo" — flujo crítico de operación diaria. Sin chequeo no hay diagnóstico, sin diagnóstico no hay cotización, sin cotización no hay ingreso.
- **Tiempo total fuera:** ~3 horas desde reporte hasta fix completo. La condición latente (dropdowns mal) existía hace meses, pero solo se manifestó cuando se sumaron tres factores: técnico nuevo + alta correcta del espejo `usuarios/` (post-SPRINT-105) + asignación a orden con dropdown viejo.
- **Severidad de negocio:** alta — Aury, recién contratada, primer día bloqueada operativamente. Riesgo retención + frustración del cliente cuya orden quedó sin chequear ese día.
- **Pérdida de datos:** no. La migración fue idempotente con dry-run.

---

## Causa raíz (5 porqués)

1. **¿Por qué Aury no podía iniciar chequeo?** — Porque `firestore.rules` rechazaba el update con `permission-denied`.
2. **¿Por qué la rule rechazaba?** — Por dos razones independientes encadenadas: (a) `tecnicoId == request.auth.uid` evaluaba false porque `tecnicoId` guardaba el doc id de `personal/`; (b) aunque (a) se arreglara, `modificaPrecioFinal()` tiraba evaluation error sobre `precioFinal` missing.
3. **¿Por qué `tecnicoId` guardaba el doc id de `personal/`?** — Porque los dropdowns en 5 archivos hacían `<option value={t.id}>` en lugar de `<option value={t.uid}>`. El campo `uid` existe en `personal/` (escrito por SPRINT-104) pero el código viejo nunca se actualizó para usarlo.
4. **¿Por qué `modificaPrecioFinal()` no usa `.get()`?** — Porque la rule fue escrita asumiendo que `precioFinal` siempre existía cuando se modificaba, sin considerar el caso "técnico actualiza orden sin tocar precioFinal todavía". El cazador P-002 que detectó otros casos similares en SPRINT-103 NO la atrapó porque solo busca el operador `==`, y esta rule usa `!=`.
5. **¿Por qué los dos bugs convivieron sin manifestarse antes?** — **Causa raíz:** *los técnicos viejos del sistema tenían `personal/{id}.id == auth.uid` por convención manual* (Jorge creaba el doc con id = uid en GestionUsuarios viejo). Aury fue la primera técnica creada con el flujo nuevo (post-SPRINT-105) que respeta auto-id de Firestore. La asunción frágil "doc id de personal == auth.uid" estaba documentada en CLAUDE.md como gotcha, pero nadie pasó a action item: auditar todos los lugares donde se escribía un id de técnico.

---

## Lo que funcionó bien

- **El reporte de Aury fue inmediato** — primer día y primera orden, no hubo "se acumuló por días".
- **El cazador P-005 (rules sin deploy)** ya estaba activo desde SPRINT-106. Cuando se aplicó el fix `b7b6464`, el pre-commit hook bloqueó hasta correr `npm run deploy:rules`. Sin eso, hubieran quedado las rules nuevas en repo y las viejas en producción otra vez.
- **El catálogo P-XXX existente** ayudó a clasificar rápido: P-006 = nueva clase, P-002 = variante de existente. Esto permitió priorizar acciones preventivas.
- **El toast con `code` (commit `f13faef`)** convirtió "no funciona" en "permission-denied" en menos de 30 minutos. Sin ese diagnóstico hubieran sido horas de bisect.

---

## Lo que falló

- **El cazador P-002 tenía un gap conocido implícitamente**: solo cubría `==`. La regla del catálogo dice "comparaciones de inmutabilidad", lo cual incluye `!=` (también compara), pero el código del cazador (regex `==`) era más estrecho que el patrón. Nadie lo notó porque no había hits visibles de variante `!=`.
- **No había cazador para "dropdown que asigna técnico debe usar uid, no id"**. El patrón era visible al revisar el diff de SPRINT-105 (que arreglaba upstream el alta de empleado), pero nadie pensó "y si los lugares que ya CONSUMEN el id están mal?".
- **La gotcha en CLAUDE.md "asunción frágil personal/{id}.id == auth.uid"** estaba documentada hace meses pero nunca se convirtió en acción concreta. Era nota mental, no enforcement.
- **Los 22 hits del cazador P-001** del baseline 2026-05-06 NO habían sido auditados a fondo; algunos de los hits cerca de `tecnicoId` podrían haber predicho este bug si se hubieran fixeado proactivamente (queda como SPRINT-109 pendiente).

---

## Acciones tomadas (fix inmediato)

- Cambiar `value={t.id}` → `value={t.uid}` en 5 dropdowns: `OrdenCreateModal.tsx:696`, `OrdenEditForm.tsx:306`, `ModalEditarOrdenAdmin.tsx:629`, `AgendaDia.tsx:378`, `MapaRutas.tsx:759`. Filtrar `tecnicos.filter(t => t.uid)`.
- Script `scripts/migrar-tecnicoid-a-authuid.ts` con dry-run + idempotencia. Walk-ea `ordenes_servicio`, mapea `personal.id → personal.uid`, registra en `auditoria_admin`.
- Migración ejecutada en producción: 47 órdenes migradas, 4 huérfanas (técnicos viejos ya no en `personal/`).
- `firestore.rules:113-121` cambiado a `request.resource.data.get('precioFinal', null) != resource.data.get('precioFinal', null)`.
- `npm run deploy:rules` ejecutado, lock actualizado.

---

## Acciones preventivas (para que no vuelva)

- [x] **Cazador determinístico nuevo:** `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts` (P-006). Detecta `<option value={t.id}>` o `value={p.id}` cerca de un select de personal/técnico que se va a guardar en Firestore.
- [x] **Refinamiento de cazador existente:** `check-rules-immutability.ts` ahora detecta tanto `==` como `!=` en comparaciones de inmutabilidad. Re-corrido del cazador post-fix verifica 0 hits en `firestore.rules`.
- [x] **Sub-regla nueva en CLAUDE.md:** "Dropdowns que asignan técnico/operaria/secretaria a un campo guardado en Firestore deben usar `t.uid`/`p.uid`, NO `t.id`/`p.id`. La rule de Firestore valida `auth.uid`, no el doc id de `personal/`."
- [x] **Postmortem registrado** y referenciado desde `docs/PATRONES_REGRESION.md` (P-006).
- [ ] **SPRINT-111 pendiente:** auditar TODOS los campos que guardan ID de empleado (`operariaId`, `ayudanteId`, `responsableId`, etc.) por el mismo vector. Está en cola, NO se hizo en este sprint para mantener el scope acotado.

---

## Métricas

- **Tiempo desde introducción hasta detección:** los dropdowns existían hace meses (introducción originaria desconocida sin git blame profundo). Se manifestó solo al combinarse con técnico-nuevo-via-SPRINT-105. Tiempo entre SPRINT-105 (fix de alta) y manifestación: ~24h.
- **MTTR (detección hasta fix completo):** ~70 minutos (17:30 reporte → 18:40 validación).
- **Es recurrencia de clase ya catalogada:** parcial.
  - P-006 (tecnicoId vs auth.uid): clase nueva — propuesta agregada al catálogo.
  - P-002 variante `!=`: recurrencia. **Fallo del cazador P-002**: regex solo cubría `==`, no `!=`. Refinamiento concreto: ampliar regex a `(==|!=)` y testear post-cambio.

---

## Lecciones aprendidas

- **Las gotchas en CLAUDE.md sin acción concreta envejecen mal.** "Asunción frágil X" sin un cazador asociado es deuda silenciosa. Toda gotcha ≥ 1 mes vieja debería tener cazador o estar marcada como riesgo aceptado explícitamente.
- **Los cazadores tienen blind spots y no nos enteramos hasta que duele.** P-002 cubría `==` pero el patrón conceptual incluye `!=`, `<`, `>`. Cuando se agrega un cazador, hay que listar variantes del patrón (operadores, sinónimos sintácticos) y testearlas.
- **Los fixes upstream (alta correcta) exponen bugs downstream (consumidores con asunciones viejas).** SPRINT-105 mejoró el alta de empleado pero NO auditó qué hacía con los datos viejos. La pregunta "¿qué se rompe cuando arreglo X correctamente?" debería ser parte del checklist del builder cuando un fix cambia una asunción de larga data.
- **Un técnico nuevo es el caso de prueba más fiel del onboarding.** Cualquier feature que afecte el flujo "alta → primera orden" debería QA'arse con un usuario sintético recién creado, no solo con admins existentes.

---

## Referencias

- Sprint que cierra disciplina: `docs/sprints/COLA_AUTONOMA.md` SPRINT-108.
- Log de ejecución: `docs/sprints/EJECUCION_AUTONOMA.md` (sección 2026-05-07 tercera pasada).
- Patrón nuevo: `docs/PATRONES_REGRESION.md` P-006.
- Patrón refinado: `docs/PATRONES_REGRESION.md` P-002.
- Cazadores: `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts`, `scripts/invariantes/check-rules-immutability.ts`.
- Commits: `c4be345`, `b7b6464`, `f13faef`.
