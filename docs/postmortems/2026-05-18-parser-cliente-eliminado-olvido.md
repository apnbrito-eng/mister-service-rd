# Postmortem — `parseCliente` olvida los 4 campos soft-delete (recurrencia #3 del patrón P-009)

**Fecha del incidente:** 2026-05-18 (detectado en QA visual sidepanel noche)
**Detectado por:** QA visual sidepanel Cowork post-deploy SPRINT-187 (Bug A)
**Severidad:** media (UI muestra soft-deleted como activos; datos en Firestore correctos; no hay corrupción)
**Patrón asociado:** **P-009 — recurrencia #3 del mismo patrón en 5 días**
**Commits relacionados:**
- Introduce: `a3b56bf` (SPRINT-185, 2026-05-18 mediodía) — agrega `eliminado/eliminadoEn/eliminadoPor/mergedaCon` al tipo `Cliente` + persistencia desde dedup
- Cazador previo (insuficiente): `ad4decc` (SPRINT-177-HOTFIX, 2026-05-16) — extiende P-009 a CierreServicio pero NO a Cliente
- Detección: QA visual sidepanel 2026-05-18 noche post-SPRINT-187 Bug A (fix de typeahead pasaba, listado seguía mostrando 3 entradas "QA Test")
- Fix: este sprint SPRINT-187-FIX2-HOTFIX

---

## Resumen ejecutivo

SPRINT-185 (dedup de clientes por teléfono) agregó 4 campos soft-delete (`eliminado`, `eliminadoEn`, `eliminadoPor`, `mergedaCon`) al tipo `Cliente` y los persistió desde el script de dedup. El listado `/admin/clientes` filtra `c.eliminado !== true` para esconder los duplicados mergeados. Pero `parseCliente` en `src/utils/index.ts:601-678` nunca incluyó los 4 campos en su return → el componente recibía siempre `undefined` → `undefined !== true === true` → soft-deleted se mostraban como activos.

Es la **TERCERA** vez en 5 días que el mismo patrón rompe producción:

| # | Sprint | Fecha | Parser afectado | Campos olvidados |
|---|---|---|---|---|
| 1 | SPRINT-153-FIX (`02bfded`) | 2026-05-13 | `parseFactura` | `notaConduce` |
| 2 | SPRINT-177-HOTFIX (`ad4decc`) | 2026-05-16 | `parseOrden` IIFE `cierreServicio` | `firmaClienteUrl`, `firmaClienteAt` |
| 3 | SPRINT-187-FIX2-HOTFIX (este) | 2026-05-18 | `parseCliente` | `eliminado`, `eliminadoEn`, `eliminadoPor`, `mergedaCon` |

La recurrencia #2 ocurrió sobre un sub-objeto que el cazador NO cubría (`CierreServicio`). La recurrencia #3 ocurrió sobre un parser root-level que el cazador NO cubría (`parseCliente`). Ambas estaban listadas como "follow-up si vuelve a ocurrir" en el JSDoc del cazador. La deuda follow-up es la prevención; postergarla equivale a desactivar el cazador para ese subset.

---

## Timeline

| Hora | Evento |
|---|---|
| 2026-05-18 mediodía | SPRINT-185 (`a3b56bf`) deployado: tipo `Cliente` extendido con 4 campos soft-delete + script dedup persiste el shape |
| 2026-05-18 mediodía+ | Jorge corre `npx tsx scripts/dedup-clientes-por-telefono.ts --apply` y mergea duplicados "QA Test" (operación correcta a nivel datos) |
| 2026-05-18 tarde | SPRINT-187 (`b6486e4`) deployado: agrega filter `c.eliminado !== true` en typeahead OrdenCreateModal + listado Clientes |
| 2026-05-18 noche | QA visual sidepanel: typeahead OK (filtra los soft-deleted), listado `/admin/clientes` FAIL (sigue mostrando 3 entradas "QA Test") |
| 2026-05-18 noche | Cowork investiga código: `parseCliente` retorna 19 campos del tipo `Cliente` pero NO los 4 soft-delete → bug aislado al parser |
| 2026-05-18 noche | SPRINT-187-FIX2-HOTFIX escrito a la cola con touch-list explícito + extensión del cazador |
| 2026-05-18 noche | Coordinator autónomo (pasada 25) procesa el sprint, verifica inversa con cazador ampliado, aplica fix, postmortem, push |

---

## Impacto

- **Usuarios afectados:** cualquiera que abra `/admin/clientes` (admins, coordinadores, secretarias). El typeahead del modal de creación de orden no se vio afectado porque ya filtraba client-side post-snapshot ANTES de pasar por `parseCliente` — el modal usa los docs raw del listener, no `parseCliente`. Esto fue parte del confusionismo: SPRINT-187 Bug A fix funcionó para el typeahead pero no para el listado.
- **Funcionalidad bloqueada:** UX confuso ("hice dedup pero sigo viendo 3 clientes idénticos"). No hay corrupción de datos: el dedup se aplicó correctamente en Firestore, sólo la UI miente.
- **Tiempo total fuera:** SPRINT-185 deployado mediodía → SPRINT-187-FIX2-HOTFIX commiteado noche del mismo día → ~6 horas con la regresión visible (menor severidad porque el feature nuevo del listado filter recién llegó con SPRINT-187 mismo, no llevaba días produciendo confusión).
- **Pérdida de datos:** ninguna.
- **Severidad de negocio:** media — la dedup funciona, sólo el UI de Clientes muestra los mergeados. Para producción real cuando se ejecute el dedup masivo, este fix es crítico.

---

## Causa raíz (5 porqués)

1. **¿Por qué `/admin/clientes` seguía mostrando soft-deleted?** — Porque `c.eliminado` evaluaba `undefined` aunque Firestore tuviera `eliminado: true`.
2. **¿Por qué `c.eliminado` era `undefined`?** — Porque `parseCliente` no listaba el campo en su return → la rehidratación silenciosamente lo descarta.
3. **¿Por qué no se actualizó `parseCliente` en SPRINT-185?** — Porque SPRINT-185 actualizó el tipo `Cliente` y el script de dedup que escribe los campos, pero no se cruzó "tipo agregado → parsers que rehidratan ese tipo". Es exactamente el patrón P-009 ya catalogado.
4. **¿Por qué el cazador P-009 no atajó esto en pre-commit?** — Porque el cazador, hasta este sprint, sólo cubría `Factura ↔ parseFactura` y `CierreServicio ↔ parseOrden.cierreServicio`. La cobertura de `Cliente ↔ parseCliente` estaba listada como "follow-up si vuelve a ocurrir" pero nunca materializada como sprint.
5. **¿Por qué la cobertura del cazador se dejó como anotación en lugar de sprint inmediato?** — **Causa raíz estructural:** el coordinator (yo) y Cowork tratan los "follow-up" identificados en postmortems o en sección "Limitación conocida" de cazadores como deuda pasiva (anotación). La anotación NO previene; solamente la materialización de un sprint con touch-list específico previene. La distancia entre "deuda anotada" y "deuda en cola" es 1 minuto de trabajo de Cowork; sin ese minuto, el bug recurre (en este caso, 2 veces).

---

## Lo que funcionó bien

- **El cazador P-009 ampliado a Cliente cazó los 4 campos faltantes en la verificación inversa** ANTES del fix en parseCliente. La estructura del cazador (extractor genérico `extractParserReturnKeys` + extractor de IIFE + extractor de interface fields) permitió ampliarlo con ~50 líneas adicionales (cobertura 3). El refactor del `extractInterfaceFields` para trackear `nest` corrigió un falso positivo sobre `legacyMetricas` / `contactosMarketing` (objetos anidados inline en el tipo `Cliente`) sin afectar a Factura/CierreServicio.
- **QA visual sidepanel post-deploy** cazó el bug el mismo día que se introdujo. La pasada 24 del coordinator ya había deployado SPRINT-187 Bug A en `b6486e4`; Cowork detectó la asimetría typeahead-OK vs listado-FAIL en menos de 1 hora.
- **Aislamiento del bug**: el coordinator confirmó que el bug era 100% del parser (datos Firestore OK, filter UI OK, persistencia OK, sólo la rehidratación intermedia descarta el campo). Diagnóstico claro en minutos.

---

## Lo que falló

- **El cazador P-009 no se amplió proactivamente a Cliente cuando SPRINT-185 agregó los 4 campos.** El sprint de dedup debió haber incluido "extender P-009 a parseCliente" como criterio de éxito, pero no lo hizo. Cowork lo escribió pero no materializó el sprint follow-up en cola.
- **El reviewer de SPRINT-185 no cruzó "campos nuevos en tipo Cliente" contra "parsers que rehidratan Cliente".** Es la misma falla que SPRINT-153 (notaConduce) y SPRINT-159 (firmaClienteUrl). Reviewer prompt no tiene el checklist explícito "si agregás campo a tipo X, verificar parser de X".
- **El typecheck NO obliga simetría tipo↔parser**: TS permite que `parseCliente` retorne un objeto que satisface `Cliente` aunque OMITA campos opcionales — son opcionales precisamente. Sin sistema de tipos exhaustive-checked, el cazador es la única red.
- **La deuda follow-up de cazador NO se materializa como sprint**. Es la pieza estructural más importante de este postmortem.

---

## Acciones tomadas (fix inmediato)

1. `src/utils/index.ts::parseCliente` — agregar 4 líneas con los 4 campos soft-delete + comentario explicando el contexto (SPRINT-185 + recurrencia #3 P-009).
2. `scripts/invariantes/check-parser-campos-faltantes.ts`:
   - JSDoc top-level actualizado con las 3 recurrencias en orden cronológico + advertencia de bandera roja estructural.
   - `PATTERN_NAME` extendido a "(Factura/CierreServicio/Cliente)".
   - Nuevo `SKIP_CLIENTE_FIELDS` allowlist (vacío inicialmente).
   - Nueva Cobertura 3 (`Cliente ↔ parseCliente`) usando `extractParserReturnKeys` (return directo, no IIFE).
   - `extractInterfaceFields` ahora trackea `nest` para evitar capturar keys de objetos anidados inline (necesario para `Cliente.legacyMetricas` y `Cliente.contactosMarketing`).
   - Nota "Limitación" actualizada con advertencia explícita de materializar follow-up como sprint, no anotación.
3. `docs/PATRONES_REGRESION.md` — entrada P-009 actualizada con tercer caso concreto + cobertura ampliada + advertencia sobre materialización de follow-up.
4. Verificación inversa: 4 hits pre-fix (los 4 campos exactos), 0 hits post-fix.
5. 12/12 cazadores PASS, typecheck 0 errores, lint 0 warnings.

---

## Acciones preventivas (para que no vuelva)

- [ ] **Sub-regla propuesta para CLAUDE.md** (Jorge la incorpora en commit aparte si la aprueba al cierre de pasada):

> **Sub-regla obligatoria — todo follow-up de cazador identificado en un postmortem o en una sección "Limitación conocida" de un cazador DEBE materializarse como sprint en `COLA_AUTONOMA.md` con touch-list específico en la misma sesión en que se identifica.** No basta dejarlo como comentario JSDoc, gotcha en CLAUDE.md, o "lo veremos si vuelve a romper". Antiprecedente: P-009 catalogado el 2026-05-13 con limitación "extender a otros sub-objetos / tipos como ServicioPrecio / PiezaInventario / parseCliente" → 2 recurrencias en producción en 5 días (SPRINT-177-HOTFIX firma cliente + SPRINT-187-FIX2-HOTFIX soft-delete cliente). La deuda de cazador ES la prevención; postergarla equivale a desactivar el cazador para ese subset.

- [ ] **Sprint follow-up materializado HOY** (no como anotación): extender P-009 a `ServicioPrecio ↔ parseServicioPrecio` y `PiezaInventario ↔ parsePiezaInventario` proactivamente, antes de la cuarta recurrencia. Cowork debe escribirlo a `COLA_AUTONOMA.md` antes de cerrar pasada 25 — caso testigo del cumplimiento de la sub-regla nueva.
- [ ] **Update al prompt del reviewer** (sprint follow-up): agregar checklist explícito "cuando un sprint agrega un campo opcional a un tipo `Cliente`/`Factura`/`OrdenServicio`/`ServicioPrecio`/`PiezaInventario`/`CierreServicio`, ¿el parser correspondiente fue actualizado? Hacer grep de `parse<Tipo>` y verificar la lista del return."
- [ ] **Update al prompt del builder** (sprint follow-up): cuando se agrega un campo a un tipo, el builder debe declarar explícitamente en su resumen "parser actualizado: sí/no/no aplica" antes de cerrar la implementación.

---

## Métricas

- **Tiempo desde introducción (SPRINT-185 deploy) hasta detección:** ~6 horas (mediodía → noche del mismo día).
- **MTTR (detección hasta fix):** ~30 min (4 líneas en parseCliente + extensión del cazador + postmortem + verificación inversa).
- **Es recurrencia de clase ya catalogada:** **SÍ — tercera vez en 5 días del mismo patrón P-009.**
- **Fallo del cazador X:** el cazador P-009 NO cazó esto porque su scope estaba limitado a `Factura` + `CierreServicio`. La extensión a `Cliente` corrige el alcance; la sub-regla estructural corrige el proceso que dejó la extensión sin materializar.

---

## Lecciones aprendidas

Tres frases para el equipo del futuro:

1. **Cuando agregás un campo opcional al tipo `Cliente` / `Factura` / `OrdenServicio` / etc., el parser correspondiente lo debe listar.** El typecheck NO te avisa porque el parser puede retornar un superset sin que TS proteste. El cazador P-009 es la red — pero sólo si está extendido al tipo correcto.

2. **Postmortems anteriores y secciones "Limitación conocida" de cazadores identifican follow-up como prevención — esa deuda anotada NO previene.** Sólo previene un sprint con touch-list materializado en `COLA_AUTONOMA.md`. La distancia entre "deuda anotada" y "deuda en cola" es 1 minuto de Cowork. Sin ese minuto, el bug recurre (en este caso, 2 veces más después de la cataloging original).

3. **Tercera recurrencia del mismo patrón en una semana es bandera roja estructural, no técnica.** El fix técnico (4 líneas + 50 líneas en cazador) es trivial; lo que está fallando es el PROCESO de materialización de follow-ups. Revisar TODOS los demás parsers (`parseServicioPrecio`, `parsePiezaInventario`, `parseInicioChequeo`, `parseSubitemServicio`, etc.) preventivamente en sprint dedicado, NO esperar a la cuarta recurrencia.

---

## Referencias

- Sprint: `docs/sprints/COLA_AUTONOMA.md` SPRINT-187-FIX2-HOTFIX
- Patrón: `docs/PATRONES_REGRESION.md` — P-009 actualizado con tercera recurrencia
- Cazador: `scripts/invariantes/check-parser-campos-faltantes.ts` — Cobertura 3 agregada (`Cliente ↔ parseCliente`)
- Bug original P-009: `docs/postmortems/...` (SPRINT-153-FIX, sin postmortem dedicado — la cataloging vivió en gotcha CLAUDE.md hasta el sistema de postmortems en SPRINT-107)
- Recurrencia #2 P-009: SPRINT-177-HOTFIX commit `ad4decc`
- SPRINT-185 dedup: commit `a3b56bf`
- SPRINT-187 Bug A: commit `b6486e4`
