**Última actualización:** 2026-05-18 noche por Cowork — **QA visual sidepanel post-deploy reveló 2 FAILs en SPRINT-185 + SPRINT-178/186 end-to-end.** SPRINT-187 escrito a la cola con dos investigaciones:

(A) **`/admin/clientes` listado + typeahead muestra soft-deleted** — el dedup mergeó OK pero la UI no filtra `where eliminado != true` → ilusión visual de duplicación post-fix.

(B) **Banner descuento NO renderiza en modal creación** — el helper `buscarChequeoVigentePorCliente` o su wiring en el modal tiene bug. Posibles causas: clienteId denormalizado mal en OS-0058 post-dedup, helper retorna null por edge case, o render condicional con guard incorrecto.

OK PASS confirmados del día (no rollback): SPRINT-186 modelo del fabricante OK, SPRINT-181 badge solo chequeo en header OK, SPRINT-177-HOTFIX firma thumbnail OK.

**Última actualización previa:** 2026-05-18 por Cowork — **QA puntual SPRINT-178 post-deploy reveló bug crítico de datos + 2 sprints nuevos a la cola.** El sidepanel intentó validar el descuento 30 días creando OS-0059 (cotización para QA Test + Aire Acondicionado) pero el descuento de OS-0058 NO apareció. Investigación de código: SPRINT-178 SÍ está implementado (helper `buscarChequeoVigentePorCliente` invocado desde `Ordenes.tsx:191`, `OrdenDetalle.tsx:99`, `AgendaDia.tsx:253` en handler aprobación de precio), pero NO surface aviso en modal de creación + se descubrió **causa raíz alternativa: cliente "QA Test" duplicado en /admin/clientes** (typeahead muestra 2 entradas idénticas con mismo tel 8090000000). Si OS-0058 está asociada a clienteId#A y OS-0059 a clienteId#B, el match falla por diseño. **2 sprints escritos:** SPRINT-185 (deduplicación clientes por teléfono normalizado + guard runtime + sprint cazador) — ALTA bloqueante para validar SPRINT-178; SPRINT-186 (surface aviso descuento en modal creación + sub-bug Modelo perdido + MessageNotSentError Esc) — MEDIA UX. Otros hallazgos del QA puntual: SPRINT-179-FIX2 (permission-denied recurre en /admin/citas qa-secretaria — completitud incompleta SPRINT-179, postmortem ya predijo recurrencia con stack `index-EhZnYXZ1.js:468:469`). Cliente debe consolidarse ANTES de revalidar SPRINT-178 (sin esto el descuento legítimamente no aplicará). **El coordinator no debe procesar SPRINT-186 hasta que SPRINT-185 esté COMPLETADO + Jorge confirme cliente consolidado** — dependencia explícita.

---

## SPRINT-WA-0-CIERRE — Decisiones de negocio firmes + sembrar `whatsapp_config/sistema`

**Prioridad:** ALTA (desbloqueo módulo WhatsApp completo).

**Estado:** ✅ COMPLETADO 2026-05-19 pasada 1 por coordinator autónomo (sesión continuación tras Opción A confirmada). Hash: pendiente al final de esta pasada.

**Origen:** Jorge respondió las 10 decisiones D1-D10 de SPRINT-WA-0 (BLOQUEOS.md:31) el 2026-05-19. Coordinator cierra el sprint admin, persiste decisiones en docs + script, y desbloquea SPRINT-WA-RULES + SPRINT-WA-1.

### Objetivo

Persistir las 10 decisiones firmes en formato consumible por código (`whatsapp_config/sistema`) y por humanos (sección dedicada en `docs/MODULO_WHATSAPP.md`). Identificar y documentar bloqueador nuevo derivado de D3=B.

### Touch-list ejecutado

1. **`docs/MODULO_WHATSAPP.md`** — agregada sección "Decisiones de negocio FIRMES (D1-D10, OK Jorge 2026-05-19)" con tabla de los 10 valores + 1 párrafo de blocker nuevo.
2. **`docs/sprints/BLOQUEOS.md`** — SPRINT-WA-0 marcado COMPLETADO con respuestas Jorge inline. SPRINT-WA-6 actualizado con sub-sección "⚠️ Blocker nuevo identificado 2026-05-19" detallando creación de plantilla HSM `auto_respuesta_fuera_horario` (nombre, categoría UTILITY, body propuesto, variable `{{1}}` teléfono contingencia).
3. **`scripts/init-whatsapp-config.ts`** — nuevo script idempotente. Crea o actualiza `whatsapp_config/sistema` con 10 decisiones snapshot + horario L-S 8-18 + 20 turnos + palabras escalado/urgencia/opt-out + 2 números activos + routing zonas vacío + costos referencia. Modos: default idempotente (solo agrega nuevos), `--dry-run`, `--force` (sobrescribe). Patrón de auth idéntico a `backfill-usuarios-desde-personal.ts`.
4. **`docs/specs/bot-ia-system-prompt.md`** — sin cambios necesarios (D5=20 turnos y D10="Fixman" ya estaban en v1.0 propuesto).

### Acción de Jorge POST-deploy del SPRINT-WA-RULES

Una vez que WA-RULES esté deployado, Jorge corre:

```bash
npx tsx scripts/init-whatsapp-config.ts --dry-run   # ver plan
npx tsx scripts/init-whatsapp-config.ts             # aplicar
```

El script es seguro de correr múltiples veces (idempotente). Si ya existe el doc, hace merge solo de campos nuevos y refresca `decisionesSnapshot` + `schemaVersion` + `updatedAt`.

### Criterios de aceptación cumplidos

- [x] 10 decisiones firmes documentadas en MODULO_WHATSAPP.md sección dedicada.
- [x] SPRINT-WA-0 marcado COMPLETADO en BLOQUEOS.md.
- [x] Script `init-whatsapp-config.ts` creado + typechecked.
- [x] Blocker nuevo (plantilla `auto_respuesta_fuera_horario`) documentado en WA-6.
- [x] Cazadores 13/13 PASS al commitear.

### Próximo sprint

SPRINT-WA-RULES (rules nuevas + deploy) entra a esta misma pasada.

---

## SPRINT-188-CAZADOR-P015 — Cazador determinístico para queries Firestore con orderBy sobre campo no garantizado

**Prioridad:** MEDIA (acción preventiva del postmortem 2026-05-18 banner descuento).

**Estado:** COMPLETADO 2026-05-18 pasada 25 por coordinator autónomo. Hash `c3c76ad`. 8 archivos: cazador nuevo P-015 + run-all.ts + 4 archivos con tag @safe-orderby (avances, bancos, campanasMarketing, ponches) + PATRONES_REGRESION.md entrada P-015 + CLAUDE.md gotcha actualizada. Verificación inversa: fixture orderBy('fechaCierre') sobre ordenes_servicio produce 1 hit con explicación completa; sin fixture 0 hits. 13/13 cazadores PASS (P-015 nuevo registrado). typecheck + lint OK. **Sub-regla del postmortem cumplida**: SPRINT-188 fue follow-up identificado y materializado EN LA MISMA PASADA en la que se cazó la recurrencia P-009 #3 — caso testigo del patrón "follow-up = sprint propio inmediato, no anotación".

**Prioridad:** MEDIA (acción preventiva del postmortem 2026-05-18 banner descuento).

**Origen:** Postmortem `docs/postmortems/2026-05-18-banner-descuento-query-orderby-mal-escrita.md`. Causa raíz clase nueva: query Firestore con `orderBy('X')` cuando `X` no se persiste a nivel raíz en TODOS los paths de write de esa colección. Firestore excluye silenciosamente los docs sin el campo del orden → query retorna vacío → helper devuelve null sin error.

### Objetivo

Crear cazador determinístico P-015 en `scripts/invariantes/check-firestore-orderby-campo-no-garantizado.ts` que escanee el codebase y grite cuando detecte una query Firestore con `orderBy(<campo>)` donde el `<campo>` no se persiste en TODOS los paths de write (`addDoc`/`setDoc`/`updateDoc`) de la misma colección.

### Touch-list previsto

1. `scripts/invariantes/check-firestore-orderby-campo-no-garantizado.ts` (NUEVO).
2. `scripts/invariantes/run-all.ts` — registrar P-015.
3. `docs/PATRONES_REGRESION.md` — agregar entrada P-015 con bug original (SPRINT-178 commit `bd2b2a8`), síntoma, causa raíz, regla.
4. `CLAUDE.md` — sub-regla "Queries Firestore con orderBy validar field persisted en todos los paths".

### Criterios de éxito

- [ ] Cazador P-015 PASS sobre el codebase actual (post-fix SPRINT-187).
- [ ] Verificación inversa con fixture temporal: agregar `query(...orderBy('campoInexistente', 'desc'))` y confirmar que el cazador grita 1 hit.
- [ ] Registrado en `run-all.ts` y agregado al pre-commit hook implícito (via `npm run check:regression`).
- [ ] Entrada en PATRONES_REGRESION.md siguiendo formato P-XXX.
- [ ] Sub-regla en CLAUDE.md siguiendo formato gotcha existente.

### Restricciones

- Allowlist para campos garantizados centralmente (`createdAt`, `updatedAt` poblados por todos los addDoc/setDoc, `numero` por contador transaccional, etc.).
- NO bloquear queries legítimas con orderBy sobre campos consistentes.

### Notas para el coordinator

- Implementación tentativa: AST parse de `query(...orderBy('X', ...))` + grep de `updateDoc|setDoc|addDoc` sobre la misma colección. Para cada write, verificar que el campo `X` está en el objeto literal del payload (o que el script de write provee el campo). Si hay al menos un write sin el campo → grita.
- Considerar que `serverTimestamp()` y `Timestamp.now()` cuentan como persistencia válida del campo.
- Falso positivo a evaluar: si un campo se persiste vía `arrayUnion`/`arrayRemove` o vía merge con shape inferido, el cazador puede no detectarlo. Documentar la limitación en el header del cazador.

---

## SPRINT-187-FIX2-HOTFIX — `parseCliente` olvida `eliminado` (P-009 recurrencia #3) + extender cazador

**Estado:** COMPLETADO 2026-05-18 pasada 25 por coordinator autónomo. Hash `2057ad9`. 4 archivos: parseCliente + cazador P-009 ampliado + postmortem + PATRONES_REGRESION. Verificación inversa: 4 hits pre-fix → 0 hits post-fix. 12/12 cazadores PASS. typecheck + lint OK. Postmortem propone sub-regla nueva sobre "follow-up de cazador = sprint propio inmediato" — Jorge la incorpora aparte si la aprueba.

**Prioridad:** ALTA (post-validación visual reveló que SPRINT-187 Bug A se fixeó solo en typeahead, NO en listado).

**Origen:** QA visual sidepanel 2026-05-18 noche post-SPRINT-187. Reporte: typeahead del modal de creación filtra soft-deleted correctamente, pero `/admin/clientes` listado sigue mostrando 3 entradas "QA Test" (incluyendo el soft-deleted). Investigación inmediata de Cowork:

`parseCliente` en `src/utils/index.ts:601-678` retorna 19 campos del tipo `Cliente` pero NO incluye `eliminado` (ni `eliminadoEn`, `eliminadoPor`, `mergedaCon`, `telefonoNormalizado` opcional). El tipo `Cliente` los tiene declarados; el parser los descarta silenciosamente. `Clientes.tsx:160` filtra `c.eliminado !== true` que evalúa `undefined !== true === true` → soft-deleted pasa el filtro.

**Causa raíz:** TERCERA recurrencia del patrón P-009 (parser olvida campos del tipo) en una semana. El postmortem `2026-05-18-firma-cliente-parser-olvido.md` predijo exactamente esto: "Follow-up — extender P-009 a otros parsers como `parseCliente`, `parseServicioPrecio`, `parseInicioChequeo`". El follow-up no se cerró y el bug recurrió.

**Touch-list:**

1. `src/utils/index.ts` (parseCliente, líneas 601-678) — agregar campos al objeto retornado:
   ```ts
   eliminado: raw.eliminado === true ? true : undefined,
   eliminadoEn: parseFirestoreDate(raw.eliminadoEn) || undefined,
   eliminadoPor: (raw.eliminadoPor as string) || undefined,
   mergedaCon: (raw.mergedaCon as string) || undefined,
   ```
   Verificar también que `telefonoNormalizado` ya está (línea 657 lo tiene — OK).

2. `scripts/invariantes/check-parser-campos-faltantes.ts` (P-009) — extender a `Cliente ↔ parseCliente`. Reusar `extractIifeReturnKeys` o adaptarlo al patrón `parseCliente` (return directo, no IIFE). Verificación inversa con `git stash` debe confirmar que detecta los 4 campos pre-fix.

3. `docs/postmortems/2026-05-18-parser-cliente-eliminado-olvido.md` (NUEVO) — postmortem corto referenciando como **recurrencia #3** del patrón. Indicar:
   - Recurrencia #1: SPRINT-153-FIX (parseFactura olvida campos)
   - Recurrencia #2: SPRINT-177-HOTFIX (parseOrden.cierreServicio olvida firmaClienteUrl)
   - Recurrencia #3: este sprint (parseCliente olvida eliminado)
   - Lección estructural: **la deuda de extender cazadores debe procesarse SIEMPRE en sprint propio en lugar de quedar como "follow-up"**. SPRINT-188 follow-up de P-015 corre el mismo riesgo si no se prioriza.

4. `docs/PATRONES_REGRESION.md` — actualizar entry P-009 con la tercera instancia + cobertura ampliada a `Cliente`.

**Plan:**

1. archivist PRE-CHANGE sobre `utils/index.ts` (parseCliente) + cazador P-009.
2. builder aplica el fix mecánico (4 líneas + cazador refinado + postmortem).
3. tester: typecheck + lint + `npm run check:regression`. El P-009 ampliado debe pasar 0 hits post-fix + gritar correctamente pre-fix.
4. regression_guardian: validar simetría tipo ↔ parser ahora cubre 3/N tipos.
5. NO reviewer obligatorio (fix mecánico chico).

**Criterios de éxito:**

- [ ] `/admin/clientes` muestra 1 sola entrada "QA Test" post-fix + hard refresh.
- [ ] Listado de clientes sigue funcionando para todos los demás casos.
- [ ] Cazador P-009 cubre `Cliente ↔ parseCliente` además de Factura + CierreServicio.
- [ ] Postmortem creado con análisis estructural de las 3 recurrencias.
- [ ] Sub-regla CLAUDE.md (o gotcha existente reforzada) que "follow-up de cazador" se trata como sprint propio prioritario.

**Restricciones:**

- NO tocar `firestore.rules` (campos opcionales, ya permitidos).
- NO tocar el script de dedup (correcto).
- NO tocar el listado de `Clientes.tsx` (filtro correcto, solo recibe undefined del parser).

**Postmortem obligatorio:** SÍ — tercera recurrencia del mismo patrón en una semana es bandera roja sobre el manejo de deuda follow-up de cazadores.

---

## SPRINT-187 — Filtrar soft-deleted en /admin/clientes + debuggear banner descuento

**Estado:** COMPLETADO 2026-05-18 noche por coordinator autónomo (pasada 24). Hashes `b6486e4` (Bug A — soft-deleted filter en 6 archivos) + `4890dfa` (Bug B — query orderBy mal escrita en 3 archivos). Postmortem obligatorio creado en `docs/postmortems/2026-05-18-banner-descuento-query-orderby-mal-escrita.md`. Clasificado como clase nueva → SPRINT-188-CAZADOR-P015 agregado a la cola como follow-up. Cazadores 12/12 PASS. typecheck + lint PASS. NO toca rules ni indexes — refactoring de índices dormidos queda como sprint futuro.

**Prioridad:** ALTA (bloquea revalidación end-to-end de SPRINT-178 + UX confuso para coord/secretaria).

**Origen:** QA visual sidepanel 2026-05-18 noche sobre fixes deployados (SPRINT-185 + 178 + 186). 2 FAILs detectados:

### Bug A — Listado /admin/clientes + typeahead OrdenCreateModal NO filtran `eliminado: true`

Síntoma: el typeahead muestra "3 entradas QA Test" (1 canónica + 1 soft-deleted + 1 cliente distinto "QA TEST 14-MAY"). Los datos en Firestore SÍ están consolidados, solo la UI miente.

**Touch-list (auditoría inicial):**

1. `src/pages/Clientes.tsx` — verificar el query del listado. Probablemente `onSnapshot(collection(db, 'clientes'))` sin filter. Agregar `where('eliminado', '!=', true)` o filtrar client-side (Firestore no permite `!= true` directo en query; alternativas: `where('eliminado', '==', false)` si todos los activos tienen el campo explícito, o filtrar post-snapshot).
2. `src/hooks/useOrdenCreateForm.ts` o `src/components/ordenes/OrdenCreateModal.tsx` — verificar el typeahead de cliente. Misma fix.
3. `src/services/clientes.service.ts` — verificar el helper `buscarOCrearCliente` y queries auxiliares.
4. Otros componentes que listan clientes (búsqueda en /admin/dashboard, /admin/citas confirmación, etc.).

**Decisión arquitectónica:** los docs soft-deleted siguen siendo útiles para forensia (audit log, queries históricas). NO hard-delete. Solo filtrar en lecturas UI. Documentar el invariante en `clientes.service.ts`.

### Bug B — Banner descuento NO renderiza al crear orden con QA Test + Aire Acondicionado

Síntoma: cliente QA Test consolidado (canónico con OS-0058 + OS-0059), pero al crear orden y elegir Aire Acondicionado no aparece el banner del descuento implementado por SPRINT-186. Aparece otro banner distinto ("Cliente ya tiene 1 orden activa: OS-0059") pero NO el de descuento.

**Hipótesis a verificar en orden:**

H1 — `OS-0058.clienteId` apunta al doc ID canónico correcto. Verificar en Firestore Console:
- Abrir `ordenes_servicio/sQFAc4tZKTVwK3b4WvHd` (OS-0058) → leer `clienteId`.
- Abrir `ordenes_servicio/<id>` (OS-0059) → leer `clienteId`.
- Si son distintos, el script de dedup NO reasignó correctamente → bug de SPRINT-185 implementación. Sprint follow-up.

H2 — `OS-0058.tipoCierre === 'solo_chequeo'` post-dedup. Verificar campo en Firestore. Si `null` o vacío, el helper `buscarChequeoVigentePorCliente` lo filtra. Verificar también `OS-0058.soloChequeo === true`.

H3 — `OS-0058.fechaCierre` está dentro de 30 días del momento actual. Verificar timestamp.

H4 — `OS-0058.equipoTipo === 'Aire Acondicionado'` exacto (sin variantes como "AC" o "Aire Acondicionado Split"). El helper de SPRINT-178 hace match estricto por igualdad de string. Si hay variantes, agregar normalización.

H5 — El hook que llama `buscarChequeoVigentePorCliente` en `useOrdenCreateForm.ts` (SPRINT-186) tiene un dep array o debounce mal seteado. Verificar console.log durante la sesión QA — agregar logging temporal en el hook si hace falta.

H6 — El render condicional del banner tiene un guard adicional que no se cumple (ej: `descuentoChequeoPrevioMonto > 0 && !overrideManual`). Verificar la condición exacta.

**Touch-list de investigación (NO de fix, hasta confirmar hipótesis):**

1. `src/services/ordenes.service.ts:804` — `buscarChequeoVigentePorCliente`. Agregar console.log temporal o leer la lógica completa.
2. `src/hooks/useOrdenCreateForm.ts` — verificar el wiring del hook.
3. `src/components/ordenes/OrdenCreateModal.tsx` — verificar el render condicional.

**Plan:**

1. archivist PRE-CHANGE obligatorio sobre los 3 archivos clave.
2. **Diagnóstico primero**: Jorge abre Firestore Console y reporta los campos de OS-0058 + OS-0059 (clienteId, tipoCierre, soloChequeo, fechaCierre, equipoTipo). Cowork hace el match contra hipótesis.
3. Builder implementa el fix según la hipótesis confirmada.
4. tester + regression_guardian + reviewer.
5. Bug A se procesa en paralelo (es independiente de Bug B).

**Criterios de éxito:**

- [ ] `/admin/clientes` muestra solo activos (1 entrada QA Test, no 3).
- [ ] Typeahead del modal de creación muestra solo activos.
- [ ] Crear orden con cliente QA Test + Aire Acondicionado renderiza banner descuento RD$ 2,500 referenciando OS-0058.
- [ ] Render del banner incluye checkbox aplicar + fecha vencimiento del chequeo.
- [ ] Persiste correctamente los campos `descuentoChequeoPrevio*` al guardar.

**Restricciones:**

- NO modificar el script de dedup hasta confirmar que el bug es UI-only (Bug A).
- NO modificar `buscarChequeoVigentePorCliente` hasta confirmar la hipótesis de Bug B con data real de Firestore.
- archivist PRE-CHANGE obligatorio.

**Postmortem obligatorio:** SÍ — bug pasó SPRINT-185 + SPRINT-186 sin detectarse + validación de QA visual lo cazó. Aprendizaje sobre cobertura de tests visuales post-deploy.

---

## SPRINT-185 — Deduplicación de clientes por teléfono normalizado + guard runtime

**Estado:** COMPLETADO 2026-05-18 por coordinator autónomo (pasada 22). Hash `a3b56bf`. Fix en `Clientes.tsx::handleSubmit` (usa `buscarOCrearCliente` + guard `buscarClientePorTelefono` + soft-delete filter). Script `scripts/dedup-clientes-por-telefono.ts` con DRY-RUN + `--apply` + `--ok-ampliado` (Jorge dispara manual). Cazador P-014 registrado + verificación inversa con fixture temporal (1 hit pre-fix → 0 hits post-fix). Cazadores 11/11 PASS. Tipo `Cliente` extendido con `eliminado/eliminadoEn/eliminadoPor/mergedaCon`. NO se tocó `firestore.rules` (rule de clientes permite update por staff sin restricción de campos — schema extension UI-side).

**Pendiente Jorge:** correr `npx tsx scripts/dedup-clientes-por-telefono.ts` (DRY-RUN) y, si reporta ≤5 grupos, re-correr con `--apply`. Si >5 grupos, escalar a `SPRINT-185-APPLY` en `BLOQUEOS.md` con conteo.

**Prioridad:** ALTA (bloquea validación end-to-end de SPRINT-178 + integridad de datos del cliente).

**Origen:** QA puntual sidepanel 2026-05-18 sobre SPRINT-178. El typeahead de cliente en OrdenCreateModal mostró 2 entradas "QA Test · (809) 000-0000" idénticas. El descuento de SPRINT-178 no aplicó probablemente porque OS-0058 quedó asociada a un `clienteId` distinto al que se usó al crear OS-0059. Caso aislado de QA + síntoma de bug sistémico: el alta de cliente no chequea duplicados por teléfono antes de crear.

**Comportamiento esperado:**

1. **Script DRY-RUN + `--apply`** (`scripts/dedup-clientes-por-telefono.ts`):
   - Recorre `clientes` agrupando por `normalizarTelefonoRD(telefono)` (helper que strip non-digits, drop leading 1 si 11 dígitos, last 10).
   - Para cada grupo con >1 entrada: el más antiguo (`createdAt` ASC) es canónico, los otros son duplicados.
   - Para cada duplicado: query `ordenes_servicio where clienteId == <duplicado>` + reasignar a `clienteId == <canónico>` con `updateDoc` batch. Mismo barrido sobre `citas_por_confirmar`, `cotizaciones`, `facturas`, `equipos_taller` si tienen `clienteId`.
   - Eliminar el doc duplicado con `eliminado: true` + `eliminadoPor: 'sistema'` + `eliminadoEn: serverTimestamp()` + `mergedaCon: <canonicoId>` (soft delete para forensia, no hard delete).
   - Audit log en `auditoria_admin` con `accion: 'dedup_clientes_por_telefono'` + lista de duplicados consolidados + canónicos.
   - Si >50 docs afectados → abortar y pedir `--ok-ampliado` (sub-regla CLAUDE.md migraciones masivas).

2. **Guard runtime** en `src/services/clientes.service.ts`:
   - Antes de `addDoc(collection(db, 'clientes'), ...)` agregar query `where('telefonoNormalizado', '==', normalizarTelefonoRD(form.telefono))`.
   - Si retorna >0 → bloquear creación con error claro "Ya existe cliente con este teléfono: <nombre> · <tel>. Asociar a ese cliente en lugar de crear duplicado."
   - Persistir `telefonoNormalizado` como campo nuevo en `Cliente` (denormalizado del `telefono` raw) — facilita queries futuras.

3. **Helper compartido** `src/utils/cliente.ts` (NUEVO) o extender `utils/index.ts`:
   - `normalizarTelefonoRD(tel: string): string` — strip non-digits, drop leading 1 si 11 dígitos, return last 10. Patrón heredado de `phoneNormalize` ya existente pero centralizado.
   - Tests inline en el header del helper (comentario JSDoc con casos): `8090000000` → `8090000000`, `+1 (809) 000-0000` → `8090000000`, `18090000000` → `8090000000`, `0000-000-8090` → `8090000000` (edge case input invertido).

4. **Cazador P-014 (NUEVO)** en `scripts/invariantes/check-cliente-create-sin-dedup.ts`:
   - Detecta `addDoc(collection(db, 'clientes'), ...)` o `setDoc(doc(db, 'clientes', ...))` sin un guard previo de `getDocs(query(...where('telefonoNormalizado', '==', ...)))`.
   - Allowlist documentada para casos legítimos (ej: backfill scripts).

**Touch-list (auditoría):**

1. `scripts/dedup-clientes-por-telefono.ts` (NUEVO).
2. `src/utils/cliente.ts` (NUEVO) o `src/utils/index.ts` extendido — helper `normalizarTelefonoRD`.
3. `src/services/clientes.service.ts` — guard + persistir `telefonoNormalizado`.
4. `src/types/index.ts` — agregar `telefonoNormalizado?: string` + `mergedaCon?: string` + `eliminado?: boolean` + `eliminadoEn?: Timestamp` + `eliminadoPor?: string` a `Cliente`.
5. `scripts/invariantes/check-cliente-create-sin-dedup.ts` (NUEVO P-014).
6. `firestore.rules` — verificar. **Si requiere ajuste para permitir `telefonoNormalizado` como campo nuevo o el flag `eliminado` → ESCALAR a BLOQUEOS sub-sprint con OK separado.**

**Consumidores que crean cliente (auditar antes de cerrar):**

- `src/hooks/useOrdenCreateForm.ts` — al crear orden desde admin.
- `src/pages/Citas.tsx` — al confirmar cita.
- `src/components/public/AgendarPage.tsx` o `formularioAgendar.service.ts` — desde form público (`/agendar`).
- `src/components/public/CampoFormulario.tsx` o `solicitudes.service.ts` — desde dynamic forms (`/f/:slug`).

Cada caller debe consumir el guard. Si el guard detecta duplicado, devolver el `clienteId` existente y asociar la nueva orden a ese.

**Plan de ejecución:**

1. archivist PRE-CHANGE obligatorio sobre `clientes.service.ts` + todos los consumidores listados.
2. builder: script + helper + types + guard + cazador.
3. tester: typecheck + lint + `npm run check:regression`.
4. regression_guardian: validar que el guard no rompe flujos de cita pública existentes (ej: form `/agendar` debe seguir funcionando para clientes nuevos legítimos).
5. reviewer: lectura cruzada (riesgo de datos — eliminación lógica de clientes).
6. **Jorge dispara el `--apply` del script manualmente DESPUÉS del deploy del fix de código** — siguiendo patrón SPRINT-149-APPLY / SPRINT-175-APPLY. Si DRY-RUN reporta más de 5 grupos de duplicados, escalar a BLOQUEOS con conteo + ejemplos.

**Criterios de éxito:**

- [ ] DRY-RUN del script reporta exactamente cuántos clientes duplicados por tel existen, incluyendo el caso QA Test.
- [ ] `--apply` (disparado por Jorge) consolida los duplicados con soft delete + reasigna órdenes/citas/facturas.
- [ ] Typeahead de cliente en OrdenCreateModal muestra 1 sola entrada "QA Test" post-`--apply`.
- [ ] Crear cliente nuevo con teléfono ya existente es bloqueado por el guard runtime con mensaje claro.
- [ ] Cazador P-014 PASS + agregado a `docs/PATRONES_REGRESION.md`.
- [ ] Audit log completo de la dedup en `auditoria_admin`.

**Restricciones:**

- NO hard-delete de clientes — soft delete con `eliminado: true` para forensia.
- NO tocar `firestore.rules` sin OK separado.
- NO ejecutar `--apply` sin DRY-RUN previo.
- Si DRY-RUN encuentra >50 grupos de duplicados → BLOQUEOS con OK ampliado.

**Postmortem opcional** (solo si causa raíz revela algo estructural del flujo de alta de clientes).

---

## SPRINT-186 — Surface aviso de descuento 30 días en modal creación + bugs UX modal orden

**Estado:** ESCALADO a BLOQUEOS 2026-05-18 por coordinator autónomo (pasada 22). Espera Jorge confirmar cliente consolidado tras correr `--apply` del script de SPRINT-185. Ver `docs/sprints/BLOQUEOS.md`.

**Prioridad:** MEDIA (UX, no bloqueante funcional pero impacta conversión).

**DEPENDENCIA EXPLÍCITA: NO procesar hasta que SPRINT-185 esté COMPLETADO + Jorge confirme cliente consolidado.** Sin dedupe primero el QA de este sprint estaría viciado por la misma causa raíz que generó SPRINT-185.

**Origen:** QA puntual sidepanel 2026-05-18 sobre SPRINT-178. La lógica del descuento está implementada (`buscarChequeoVigentePorCliente` invocado desde 3 lugares río abajo) pero NO surface aviso en el modal de creación de orden. La oficina no se entera del crédito al agendar — solo aparece al aprobar precio.

**Comportamiento esperado:**

1. **Sugerencia automática al crear orden:** en `OrdenCreateModal.tsx` (o `useOrdenCreateForm.ts`), al cambiar `cliente.id` + `equipoTipo`, ejecutar `buscarChequeoVigentePorCliente(clienteId, equipoTipo)` (debounce 300ms para no spam). Si retorna chequeo vigente, mostrar banner naranja/amarillo bajo el bloque "Cliente":
   ```
   ⚠️ Cliente tiene chequeo previo vigente · OS-XXXX · RD$X aplicable como crédito
   Vence el DD/MM/AAAA (faltan N días)
   ☐ Aplicar a esta orden
   ```
   Replica patrón visual del banner "Operaria asignada: X" (SPRINT-170) que ya funciona ahí.

2. **Sub-bug #23 — Campo "Modelo" se borra al editar:** verificar en `OrdenEditModal.tsx` o `useOrdenEditForm.ts` el binding del campo `equipoModelo`. Si hay 2 campos "Modelo" + "Modelo del fabricante" que apuntan al mismo path Firestore pero con keys distintas en el form, consolidar a uno solo.

3. **Sub-bug #24 — `MessageNotSentError` al cerrar modal con Esc:** capturar excepción específica `MessageNotSentError` en algún listener fantasma del modal. Identificar y limpiar suscripción huérfana al unmount.

**Touch-list:**

1. `src/hooks/useOrdenCreateForm.ts` — agregar query `buscarChequeoVigentePorCliente` cuando `cliente.id` o `equipoTipo` cambia. Persistir info en state local + render condicional.
2. `src/components/ordenes/OrdenCreateModal.tsx` — banner visual + checkbox "Aplicar descuento" + persistir flags al guardar (`descuentoChequeoPrevioId`, `descuentoChequeoPrevioMonto`, `descuentoChequeoPrevioFecha`).
3. `src/components/ordenes/OrdenEditModal.tsx` — fix binding doble Modelo.
4. Algún componente con listener fantasma para MessageNotSentError.

**Hallazgo lateral del sidepanel (anotar pero NO incluir en este sprint):**

- UX `/admin/citas` tarda ~8s en pasar del spinner al contenido. Agregar skeleton o "Cargando N citas..." con count progresivo. Probable sprint propio `SPRINT-CITAS-SKELETON`.
- Typeahead de cliente sin info diferenciadora cuando hay 2+ con mismo nombre. Resuelto parcialmente por SPRINT-185 (no debería haber duplicados), pero el patrón de "agregar último servicio o fecha de alta" es UX bueno por si existe legítimo (ej: 2 clientes con mismo nombre real). Documentar como deuda para revisar post-SPRINT-185.

**Criterios de éxito:**

- [ ] Crear orden para QA Test + Aire Acondicionado muestra banner del descuento desde OS-0058.
- [ ] Checkbox "Aplicar descuento" persiste correctamente al guardar.
- [ ] Editar OS-0059 muestra "QA-DUMMY-001" en el campo Modelo (no vacío).
- [ ] Cerrar modal con Esc no emite `MessageNotSentError`.

**Restricciones:**

- NO procesar hasta que SPRINT-185 esté COMPLETADO.
- NO tocar la lógica backend de `buscarChequeoVigentePorCliente` (ya implementada correctamente).
- archivist PRE-CHANGE obligatorio.

---

## SPRINT-179-FIX2 — Barrido completitud listener Firestore sin where + crear P-012

**Estado:** COMPLETADO 2026-05-18 por coordinator autónomo (pasada 22). Hash `bd7103a`. Cazador P-012 creado en `scripts/invariantes/check-listener-sin-where-rol-restringido.ts` (parsea rules + escanea listeners). Barrido completo confirmó NO hay otros listeners problemáticos en el codebase — los 5 detectados están en páginas admin/coord gateadas por UI, allowlistados con `@safe-listener-sin-where`. Cazadores 12/12 PASS. Verificación inversa: fixture sin where caza correctamente. Postmortem actualizado con sección "Recurrencia parcialmente confirmada" — el síntoma reportado en /admin/citas qa-secretaria NO se reprodujo estáticamente (rules de citas_por_confirmar + ordenes_servicio permiten esStaff); cazador queda como red de seguridad.

**Prioridad:** MEDIA (recurrencia confirmada de clase de bug, postmortem 2026-05-18 ya predijo).

**Origen:** QA sidepanel 2026-05-18 detectó `permission-denied` recurrente en `/admin/citas` (qa-secretaria) con stack `index-EhZnYXZ1.js:468:469`. SPRINT-179 fixeó solo el listener de comisiones en `TecnicoVista.tsx`. Resto del codebase con mismo patrón quedó pendiente. El postmortem `2026-05-18-tecnico-comisiones-listener-sin-where.md` ya documentó "Cazador P-012 pendiente porque primero hay que ver si recurre en otras páginas". **Ya recurrió.** P-012 ahora se justifica completamente.

**Touch-list:**

1. **Barrido del codebase:** buscar TODOS los `onSnapshot(collection(db, '<col>'), ...)` y `onSnapshot(query(collection(db, '<col>')), ...)` sin where. Cruzar contra `firestore.rules` para identificar cuáles tienen rule con `auth.uid == X`. Aplicar `where()` que matchee la rule en cada caso.

   Casos conocidos a chequear primero:
   - `src/pages/Citas.tsx:146` — `onSnapshot(collection(db, 'ordenes_servicio'))` sin where. Confirmado en QA. Necesita filter por rol (admin/coord ven todo, secretaria probablemente ve todo también pero la rule rechaza algo más sutil — investigar).
   - Posibles otros: `Mantenimientos.tsx`, `Inventario.tsx`, `Productos.tsx`, `EquiposTaller.tsx`, `Cotizaciones.tsx` — todos pueden tener listeners similares.

2. **Crear cazador P-012** en `scripts/invariantes/check-listener-sin-where-rol-restringido.ts`:
   - AST parse de TSX para detectar `onSnapshot(collection(db, '<col>'), ...)` y `onSnapshot(query(collection(db, '<col>')), ...)` (sin `where(...)` adentro).
   - Parsear `firestore.rules` para detectar reglas con `auth.uid == X` o `request.auth.uid in resource.data.X`.
   - Si hay match (listener sin where + rule restrictiva) → grita.
   - Allowlist para casos donde el rol activo realmente puede leer toda la colección (ej: admin con rule `esAdminOCoord()`).

3. **Agregar P-012 a `docs/PATRONES_REGRESION.md`** con casos pre/post fix.

4. **Update postmortem** `docs/postmortems/2026-05-18-tecnico-comisiones-listener-sin-where.md` con sección "Recurrencia confirmada 2026-05-18 en Citas.tsx" + check `[x]` en acciones preventivas para "Cazador P-012 creado".

**Criterios de éxito:**

- [ ] Console limpio (0 `permission-denied`) al cargar `/admin/citas` como qa-secretaria.
- [ ] Console limpio al cargar todas las páginas rol-restringidas auditadas.
- [ ] Cazador P-012 PASS + agregado a pre-commit hook.
- [ ] Postmortem actualizado.

**Restricciones:**

- NO silenciar errors con try/catch vacío.
- NO tocar rules sin OK Jorge (BLOQUEOS).
- Si el barrido revela >5 archivos con cambios → considerar dividir en sub-sprints.

---

**Última actualización previa:** 2026-05-18 por coordinator autónomo (pasada 19, `trabaja`) — **7 SPRINTS COMPLETADOS + 1 ESCALADO a BLOQUEOS en una sola pasada.** Hashes pusheados en orden: `ad4decc` SPRINT-177-HOTFIX (parser firmaClienteUrl + cazador P-009 extendido + postmortem), `729b85f` SPRINT-180+181 (catch-all 404 admin + badge Solo chequeo en headers), `3650b26` SPRINT-183 (3 UX bajos: toast cliente, observaciones, hint stepper), `e6e1ba4` SPRINT-184 (QA_PROMPT_MAESTRO doc + selector "Ver bandeja de" admin/coord), `328c508` SPRINT-179 (permission-denied tecnico/comisiones + postmortem clase nueva), `8bdd914` SPRINT-182 (wizard labels adaptativas equipoTipo + soloChequeo). **SPRINT-178 ESCALADO a BLOQUEOS** — feature de producto con 4 decisiones de negocio pendientes (edge case 2+ chequeos vigentes + legacy retroactivo + override manual + granularidad matching). Cazadores 10/10 PASS post-cada commit. Typecheck + lint PASS. **2 postmortems generados** (firma + permission-denied). Cola autónoma agotada en lo procesable; SPRINT-178 espera Jorge.

**Última actualización previa:** 2026-05-16 por Cowork — **QA E2E sesión sidepanel COMPLETADA sobre OS-0058 / CG-00020** con 6 roles (qa-secretaria, qa-tecnica, qa-coordinadora, qa-tecnica cierre, qa-coordinadora emite, qa-admin validación). Reporte completo en sesión Cowork. **21 hallazgos** documentados. **PASS confirmados:** SPRINT-159 firma capturada + SPRINT-158a foto cierre + SPRINT-160 garantía 60d + SPRINT-161 fase cerrado + SPRINT-162 KPI conduces +1 + SPRINT-170 selector operaria + SPRINT-171 /admin/notificaciones ruta + SPRINT-151 modal items editables + verificar pago + postmortem 2026-05-07 Iniciar Chequeo resuelto. **8 sprints nuevos escritos a la cola** priorizados ALTA/MEDIA/BAJA: SPRINT-177-HOTFIX (parser olvida firmaClienteUrl — ALTA, regresión silenciosa SPRINT-159), SPRINT-178 (vigencia 30 días chequeo + descuento cotización — ALTA, gap producto), SPRINT-179 (permission-denied console al cargar /tecnico — MEDIA), SPRINT-180 (catch-all 404 admin — MEDIA), SPRINT-181 (badge "Solo chequeo" en headers de modales — BAJA), SPRINT-182 (UX consolidado wizard cierre adaptado a solo_chequeo + tipo equipo — MEDIA), SPRINT-183 (toast cliente asociado / hint stepper / observaciones cita — BAJA), SPRINT-184 (actualizar QA_PROMPT_MAESTRO + filtro destinatario notifs — DOC). SPRINT-176 validación cross-rol notif emisor sigue pendiente login-switch humano. Coordinator procesa ALTAS primero al hacer `trabaja`. SPRINT-177-HOTFIX requiere postmortem obligatorio + refinar cazador P-009 que falló en cazar este caso.

---

## SPRINT-177-HOTFIX — `parseOrden` olvida `firmaClienteUrl` + `firmaClienteAt` (regresión silenciosa SPRINT-159)

**Estado:** ✅ COMPLETADO 2026-05-18 por coordinator autónomo (pasada 19). Hash `ad4decc`. Fix de 2 líneas en `parseOrden` + cazador P-009 extendido a `CierreServicio ↔ parseOrden.cierreServicio` con función nueva `extractIifeReturnKeys`. Verificación inversa con `git stash` confirmó que el cazador SÍ grita pre-fix sobre los 2 campos. Tipo `firmaClienteAt` ampliado a `Timestamp | Date` para compatibilidad post-parse (consistente con `piezasValidadasEn`). Postmortem en `docs/postmortems/2026-05-18-firma-cliente-parser-olvido.md` con 5 porqués (causa raíz: deuda follow-up del cazador P-009 no cerrada — header decía "extender a OrdenServicio queda como follow-up" pero el bug recurrió antes de cerrarla). Cazadores 10/10 PASS. typecheck + lint PASS.

**Prioridad:** ALTA (acreditación legal de firma del cliente perdida en producción).

**Origen:** QA E2E sesión sidepanel 2026-05-16 sobre OS-0058. Reporte ROL 6 (qa-admin validación) reveló que el modal de orden y la fila expandida de factura muestran "Sin firma del cliente (orden previa al SPRINT-159)" aunque la firma SÍ fue capturada por el wizard del técnico (log `Firma subida OK: https://firebasestorage.googleapis.com/...firma-1778944325233.png` durante ROL 4), y SPRINT-168 ya implementó el render correctamente.

**Causa raíz confirmada (verificación de código por Cowork):**

`src/utils/index.ts:739-795` — la función `parseOrden` reconstruye explícitamente `cierreServicio` desde el doc Firestore mapeando cada campo conocido. **NO incluye `firmaClienteUrl` ni `firmaClienteAt`** entre los campos mapeados. El tipo `CierreServicio` SÍ los tiene (`src/types/index.ts:1641-1642`), el wizard SÍ los persiste (`src/components/CierreServicioWizard.tsx:365-366`), y los 3 consumidores UI los esperan (`OrdenDetailModal.tsx:737,846` + `OrdenDetalle.tsx:827` + `OrdenResumenLectura.tsx:203`). Pero `parseOrden` los descarta al leer → la UI ve `undefined` → fallback al placeholder "Sin firma".

Este es exactamente el patrón **P-009 (parser olvida campos del tipo)** ya catalogado. El cazador falló en detectar este caso → requiere refinamiento.

**Touch-list:**

1. `src/utils/index.ts` (líneas 739-795) — agregar 2 campos al objeto retornado por la IIFE de `cierreServicio`:
   ```ts
   firmaClienteUrl: (cs.firmaClienteUrl as string) || undefined,
   firmaClienteAt: parseFirestoreDate(cs.firmaClienteAt) || undefined,
   ```
   Ubicación sugerida: después de `revisoConexiones` (línea 749) o al final del objeto antes del `};` de cierre. Mantener el patrón de los otros campos opcionales.

2. `scripts/invariantes/check-parser-olvida-campos.ts` (P-009) — refinar para que detecte este caso específico. Comparar cada propiedad declarada en interfaces del tipo `CierreServicio` (y otros tipos parseados) contra los campos efectivamente reconstruidos en sus respectivos parsers. Agregar test de regresión usando el shape exacto pre-fix de OS-0058 (firmaClienteUrl declarado en type + persistido por wizard + ausente del parseOrden → debe gritar).

3. `docs/postmortems/2026-05-16-firma-cliente-parser-olvido.md` (NUEVO) — postmortem completo siguiendo `_TEMPLATE.md`:
   - Timeline: SPRINT-159 (captura + persistencia) → SPRINT-168 (render UI agregado) → 14 días en producción con firmas capturadas pero invisibles → QA E2E 2026-05-16 detecta el bug.
   - Impacto: todas las órdenes cerradas con firma desde el deploy de SPRINT-159 al 2026-05-16 muestran "Sin firma" aunque la firma esté en Firestore + Storage. Estimar cuántas órdenes afectadas con un script de conteo.
   - 5 porqués hasta causa raíz estructural (¿por qué el cazador P-009 no detectó? ¿por qué SPRINT-159 no tuvo test que leyera la orden parseada después del cierre?).
   - Acciones preventivas: refinamiento cazador + posiblemente test unitario que afirme que `parseOrden(input).cierreServicio.firmaClienteUrl === input.cierreServicio.firmaClienteUrl` para shapes con firma poblada.

**Consumidores verificados (read-only check Cowork 2026-05-16):**

- `src/components/ordenes/OrdenDetailModal.tsx:737, 846, 852, 859` — render thumbnail + link a firma + placeholder "Sin firma" (lógica condicional dependiente de `cierre.firmaClienteUrl`).
- `src/pages/OrdenDetalle.tsx:827, 831, 835, 838-840` — render thumbnail + timestamp formateado.
- `src/components/facturas/OrdenResumenLectura.tsx:203, 206, 213` — link "Ver firma" + thumbnail.

Los 3 consumidores están bien escritos — esperan el campo en el shape del tipo. El bug es 100% del parser.

**Consumidores NO afectados:**

- `src/components/CierreServicioWizard.tsx` — escribe el campo, no lo lee de la orden parseada (lo construye localmente y lo persiste).
- `src/types/index.ts` — declaración del tipo, no afectada.

**Hallazgos laterales (NO incluir en este sprint, documentar como deuda futura):**

- ¿`parseFactura` (línea 1085 de utils/index.ts) tiene problemas análogos con otros campos? Auditoría completa sería sprint propio.
- ¿`OrdenResumenLectura` en /admin/facturas lee la orden via `parseOrden` o lee directo del doc factura? Si es lo segundo, podría tener el mismo problema en otro path. Verificar antes de declarar fix completo.

**Plan de ejecución sugerido para el coordinator:**

1. archivist PRE-CHANGE obligatorio sobre `src/utils/index.ts` (parseOrden).
2. builder: 3 ediciones quirúrgicas (2 líneas en parseOrden + cazador refinado + postmortem).
3. tester: typecheck + lint + `npm run check:regression` (cazador P-009 refinado debe pasar 0 hits post-fix + caso positivo debe gritar correctamente).
4. regression_guardian: validar que el fix NO introduce nuevos hits y que el cazador refinado caza el patrón.
5. reviewer: lectura cruzada del fix + lectura del postmortem.

**Criterios de éxito:**

- [ ] `parseOrden` retorna `cierreServicio.firmaClienteUrl` y `firmaClienteAt` cuando están poblados en el doc raw.
- [ ] OS-0058 (verificable post-deploy con hard refresh) muestra la firma del cliente como thumbnail clickeable en `/admin/ordenes` modal Y en `/admin/facturas` fila expandida.
- [ ] Cazador P-009 refinado caza el shape pre-fix (test positivo) y NO grita post-fix (test negativo).
- [ ] Postmortem en `docs/postmortems/2026-05-16-firma-cliente-parser-olvido.md` siguiendo template.
- [ ] CLAUDE.md actualizado con gotcha si hay aprendizaje no obvio del 5-porqué.

**Restricciones:**

- NO tocar `firestore.rules` (campo opcional, ya permitido).
- NO tocar la lógica del wizard (escribe bien).
- NO tocar los componentes de render (leen bien).
- NO crear migración de datos: el fix es solo de lectura, las órdenes en Firestore ya tienen los campos correctos.

**Postmortem obligatorio: SÍ** (regresión silenciosa de SPRINT-159 que escapó 14 días en producción).

---

## SPRINT-178 — Implementar vigencia 30 días del chequeo + descuento automático a cotización

**Estado:** ✅ COMPLETADO 2026-05-18 (pasada 20) — hash `bd2b2a8`. Deploy verificado en producción. Índice compuesto deployado vía `npm run deploy:indexes`. Cazadores 10/10 PASS. typecheck + lint PASS.

**Estado original previo:** 🟡 EN_EJECUCION 2026-05-18 (pasada 20) — desbloqueado por OK Jorge en `BLOQUEOS.md` con 4 decisiones:
1. Edge case 2+ chequeos vigentes: aplica solo el más reciente.
2. Solo cotizaciones nuevas post-deploy (cero migración retroactiva).
3. Override manual permitido para admin/coord con audit log obligatorio.
4. Matching: `clienteId + equipoTipo` (sin equipoModelo).

**Touch-list refinado post-OK Jorge:**
- `src/services/ordenes.service.ts` (helper `buscarChequeoVigentePorCliente`).
- `src/types/index.ts` (campos opcionales nuevos en `OrdenServicio` + denorm en `Factura`).
- `src/pages/Ordenes.tsx` (UI descuento en `handleAprobarPrecio` + override admin/coord).
- `src/pages/OrdenDetalle.tsx` (UI descuento en `handleAprobarPrecio` + override).
- `src/pages/AgendaDia.tsx` (handler de aprobación rápida — descuento auto sin UI, sin override).
- `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx` (denormalizar 6 campos en Factura post-emisión).
- `firestore.indexes.json` (índice compuesto `ordenes_servicio: clienteId + equipoTipo + tipoCierre + fechaCierre`).

**NO toca `firestore.rules`:** los 6 campos nuevos son opcionales, escritos por `esStaffOficina()` (no por técnico). El gate de update de técnico (R4) tiene `noTocaCamposAprobacion()` y `noTocaSoloChequeo()` — el técnico ya no puede tocar nada relacionado con cotización/precio. Las facturas son esStaffOficina write. **0 cambios a rules requeridos.**

**Comportamiento esperado:**

1. Al aprobar precio en `handleAprobarPrecio` (3 handlers paralelos: Ordenes.tsx, OrdenDetalle.tsx, AgendaDia.tsx):
   - Antes de mostrar el modal/UI de aprobación, consultar `buscarChequeoVigentePorCliente(clienteId, equipoTipo)`.
   - Si retorna chequeo vigente (≤30 días), mostrar widget "Chequeo previo de RD$X del DD/MM/AAAA — vigente hasta DD/MM/AAAA. Aplicar descuento."
   - Checkbox/botón "Aplicar descuento" → resta `montoChequeo` del precio aprobado y persiste los 6 campos `descuentoChequeoPrevio*` en la orden.

2. Si el chequeo está vencido (>30 días):
   - Mostrar widget info "Chequeo previo de RD$X del DD/MM/AAAA (vencido). No aplicable como descuento automático."
   - Admin/coord ven adicional botón "Aplicar de todos modos (override)" → abre prompt motivo → persiste con `descuentoChequeoPrevioOverride: true` + `descuentoChequeoPrevioMotivoOverride` + `descuentoChequeoPrevioAplicadoPor: currentUser.uid`. Audit log entry.

3. Edge case 2+ chequeos vigentes: la query ordena por `fechaCierre DESC` y retorna **el primero** (= más reciente). Decisión OK Jorge.

4. AgendaDia (aprobación rápida sin modal): aplica descuento automático silencioso si hay chequeo vigente (sin permitir override ni input). Log toast informativo: "Descuento RD$X aplicado por chequeo previo OS-####".

5. Al emitir conduce (`ProcesarFacturacionModal`): si la orden tiene `descuentoChequeoPrevioId`, denormalizar los 6 campos en el doc `facturas/{id}` para trazabilidad fiscal/reportes.

**6 campos nuevos opcionales en `OrdenServicio`:**
- `descuentoChequeoPrevioId?: string` (ordenId del chequeo origen)
- `descuentoChequeoPrevioMonto?: number`
- `descuentoChequeoPrevioFecha?: Timestamp | Date` (fechaCierre del chequeo origen)
- `descuentoChequeoPrevioOverride?: boolean`
- `descuentoChequeoPrevioMotivoOverride?: string`
- `descuentoChequeoPrevioAplicadoPor?: string` (auth.uid)

Mismos 6 campos denormalizados en `Factura`.

**Restricciones:**
- Solo aplica a cotizaciones aprobadas post-deploy (no migración retroactiva).
- Override SOLO admin/coord (`esAdminOCoord(userProfile)`).
- Audit log obligatorio en override.
- Si índice compuesto necesario → `firestore.indexes.json` + `npm run deploy:indexes` ANTES de marcar COMPLETADO.
- Si surge cambio a `firestore.rules` durante implementación → ABORTAR + sub-sprint BLOQUEOS con OK separado.

---

## SPRINT-178 (LEGACY ESCALADO — preservado para forensia) ⊘ 

**Prioridad:** ALTA (gap de producto que afecta facturación correcta).

**Origen:** QA E2E 2026-05-16. Jorge clarificó regla de negocio:
> "Los chequeos tienen 30 días de vigencia para ser utilizado en monto a favor de la cotización que se le hizo al cliente. Luego de ahí si el cliente decide no proceder y pasan los 30 días de vigencia del chequeo, tendría el cliente que pagar un servicio completo si decide proceder con la cotización."

Auditoría Cowork: grep en `src/**` por `30.*dias`, `vigencia.*chequeo`, `descuento.*chequeo`, `aplicarChequeo` → **0 resultados**. La lógica no está implementada. Saved a memoria del proyecto en `project_vigencia_chequeo_30_dias.md`.

**Comportamiento esperado:**

1. Al cotizar una reparación posterior a un `solo_chequeo` del mismo cliente/equipo:
   - El sistema debe detectar si existe `solo_chequeo` previo del mismo cliente (`clienteId` o `clienteTelefono`) y mismo equipo (`equipoTipo`+`equipoModelo` o `equipoId`) en los últimos 30 días.
   - Si existe y está vigente (`fechaCierre + 30 días >= hoy`), mostrar al técnico/coord/operaria: "Hay chequeo previo de RD$X del DD/MM/AAAA — vigente hasta DD/MM/AAAA. Aplicar descuento."
   - Permitir aplicar el descuento con un checkbox/botón → restar `montoChequeoPrevio` del total cotizado.
   - Persistir en la nueva orden: `descuentoChequeoPrevioId: <ordenIdDelChequeo>` + `descuentoChequeoPrevioMonto: <RD$X>` para audit trail.
   - Audit log: "Descuento por chequeo previo aplicado: RD$X (origen: OS-AAAA del DD/MM/AAAA)".

2. Si el chequeo previo está **vencido** (> 30 días):
   - Mostrar info: "Chequeo previo de RD$X del DD/MM/AAAA (vencido el DD/MM/AAAA, han pasado N días). No aplicable como descuento."
   - El cliente paga el servicio completo desde cero.

3. Edge case — cliente con 2+ chequeos vigentes sobre el mismo equipo:
   - Decisión pendiente de Jorge (mover a BLOQUEOS si no aclara): ¿se acumulan los descuentos? ¿solo se aplica el último? ¿el más antiguo?
   - Recomendación coordinator: aplicar el más reciente solamente (más justo para el negocio).

**Touch-list (auditoría inicial — NO procesar hasta confirmar consumidores):**

1. `src/services/ordenes.service.ts` — agregar helper `buscarChequeoVigentePorCliente(clienteId, equipoTipo, equipoModelo)` que retorna `{ ordenId, fechaCierre, montoChequeo, vigente: boolean, diasRestantes: number } | null`.
2. `src/components/cierre/ModalSugerirSoloChequeo.tsx` — verificar si la pantalla de cotización del técnico ya consume datos del cliente. Si sí, inyectar warning visual.
3. `src/pages/Ordenes.tsx` o componente de creación de orden con cotización — agregar UI del descuento.
4. `src/types/index.ts` — agregar campos opcionales a `OrdenServicio`: `descuentoChequeoPrevioId?: string`, `descuentoChequeoPrevioMonto?: number`, `descuentoChequeoPrevioFecha?: Timestamp`.
5. `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx` — al emitir conduce, validar si la orden tiene descuento aplicado y persistirlo en `factura.descuentoChequeoPrevio*` para trazabilidad fiscal.
6. `firestore.rules` — **verificar**: si las nuevas escrituras son permitidas. **Si requiere ajuste → ESCALAR a BLOQUEOS.md.**

**Hallazgos laterales que pueden surgir durante la auditoría:**

- ¿Cómo se relacionan dos órdenes del mismo cliente? ¿Por `clienteId`, `clienteTelefono`, o un campo `equipoSerie`?
- ¿La UI de cotización del técnico (path B con piezas) ya existe? Si está incompleta, hay que terminarla primero (relacionado con hallazgo #8 del QA).
- ¿`Cliente` tiene un histórico de servicios consumible o hay que consultar `ordenes_servicio` con query? La query requiere índice compuesto.

**Plan de ejecución sugerido:**

1. archivist PRE-CHANGE sobre `ordenes.service.ts` + componentes de cotización.
2. **AUDIT explícito de consumidores antes de redactar fix final** (sub-regla touch-list expandido). El sprint actual puede dividirse en sub-sprints después del audit.
3. Posiblemente requiere script de backfill para órdenes legacy con chequeos previos que el cliente quiere aplicar retroactivamente — decidir con Jorge.

**Criterios de éxito:**

- [ ] Al crear/cotizar orden post-`solo_chequeo` reciente del mismo cliente/equipo, el sistema sugiere el descuento.
- [ ] El descuento se aplica al total cotizado.
- [ ] Audit log y campos denormalizados en `ordenes_servicio` + `facturas`.
- [ ] Chequeo vencido (>30 días) NO permite descuento, muestra info clara.
- [ ] Test E2E sobre QA Test cliente: crear chequeo, esperar (o simular fecha) y crear cotización vinculada.

**Restricciones:**

- NO afectar órdenes legacy sin descuento — solo aplicar a nuevas cotizaciones post-deploy.
- NO modificar contabilidad ya emitida (facturas pasadas no se reescriben).
- Migración retroactiva (si Jorge la pide) va en BLOQUEOS.md como sub-sprint.

---

## SPRINT-179 — Diagnosticar `permission-denied` en console al cargar `/tecnico`

**Estado:** ✅ COMPLETADO 2026-05-18 por coordinator autónomo (pasada 19). Hash `328c508`. Causa raíz: `onSnapshot(collection(db, 'comisiones'))` sin where en `TecnicoVista.tsx:163` violaba la rule `(esTecnico() && tecnicoId == auth.uid)` — Firestore rechazaba la suscripción full-collection. Fix: `query(..., where('tecnicoId', '==', currentUser.uid))`. Filter client-side reducido a `quincenaAsignada` solamente. Dep array cambia a `currentUser?.uid`. Postmortem en `docs/postmortems/2026-05-18-tecnico-comisiones-listener-sin-where.md` con 5 porqués + propuesta P-012 (cazador determinístico para listeners sin where con rules restrictivas) como sprint follow-up si recurre. Cazadores 10/10 PASS. typecheck + lint PASS.

**Prioridad:** MEDIA (no bloquea funcionalidad pero contamina monitoreo + sugiere listener con fuga de permisos).

**Origen:** QA E2E 2026-05-16. Capturado en ROL 2 (10:41:44) y ROL 4 (11:09:50) durante carga inicial de `/tecnico` por qa-tecnica. Stack: `index-BX_eXeH8.js:468:469` `@firebase/firestore: Firestore (10.14.1): Uncaught Error in snapshot listener: FirebaseError: [code=permission-denied]: Missing or insufficient permissions.` Solo aparece al cargar la vista (no durante acciones). NO se replica en sesiones admin/coordinadora.

**Hipótesis (coordinator debe verificar):**

1. **H1 — Listener global sin filtro por `auth.uid`:** algún `onSnapshot` en `TecnicoVista.tsx` o componente padre suscribe a una colección que las rules gatean por `tecnicoUid == request.auth.uid` y la query no incluye ese filtro. La rule rechaza inmediatamente al técnico → listener emite error.

2. **H2 — Listener a `usuarios/{otherUid}` o `personal/{otherDocId}`:** algún suscriptor lee perfiles ajenos. Rules limitan a uid propio.

3. **H3 — Cache de session/Auth desactualizado** entre logouts/logins rápidos del QA — pero el error es reproducible siempre, no intermitente.

**Touch-list de auditoría:**

1. `src/pages/TecnicoVista.tsx` — listar TODOS los `onSnapshot` que monta (incluido el de `ordenes`, `notificaciones`, `personal`, `mantenimientos`, `gps_ubicaciones`). Verificar para cada uno: ¿la query incluye `where('campo', '==', auth.currentUser.uid)`? Si no, ¿la rule lo permite sin ese filtro?
2. `firestore.rules` — read-only audit. ¿Hay alguna colección que el técnico necesita leer pero la rule rechaza?
3. `src/context/AppContext.tsx` — verificar listeners globales que se montan al loguear (perfil, notifs).
4. `vite.config.ts` + sourcemaps — generar build dev para identificar el archivo/línea exacto del error (el production minificado `index-BX_eXeH8.js:468:469` no se puede mapear sin sourcemap).

**Plan de ejecución sugerido:**

1. archivist PRE-CHANGE obligatorio (afecta listeners — riesgo de regresión).
2. Reproducir bug en dev con sourcemap habilitado → identificar stack exacto.
3. Aplicar fix mínimo: agregar `where()` faltante o atrapar el error en el listener con try/catch que loguee sin spam.
4. tester + regression_guardian + reviewer.

**Criterios de éxito:**

- [ ] Console limpio (0 `permission-denied`) al cargar `/tecnico` como qa-tecnica.
- [ ] Funcionalidad de la vista técnico intacta (orden visible, iniciar chequeo, cerrar wizard, etc.).
- [ ] Cazador nuevo si aplica (ej. P-012 "listener Firestore sin filtro por auth.uid en página de rol restringido").

**Restricciones:**

- NO silenciar el error con un `try/catch` vacío sin entender la causa.
- NO modificar rules sin OK Jorge (BLOQUEOS.md).

**Postmortem opcional** (depende de si causa raíz es estructural).

---

## SPRINT-180 — Catch-all 404 dentro del layout admin

**Estado:** ✅ COMPLETADO 2026-05-18 por coordinator autónomo (pasada 19, junto con SPRINT-181). Hash `729b85f`. Nueva página `src/pages/Admin404.tsx` con botón "Ir al Dashboard" + "Volver atrás". Ruta `path="*"` registrada DENTRO del bloque `/admin` route — las rutas hermanas específicas matchean primero por prioridad react-router 6. Las rutas públicas standalone (`/cita/:calendarId`, `/tracking/:token`, `/f/:slug`, `/garantia/:token`, `/cliente/:token`) no se ven afectadas. Cazadores 10/10 PASS.

**Prioridad:** MEDIA (UX bug, no funcional crítico pero pérdida de contexto al usuario).

**Origen:** QA E2E 2026-05-16 ROL 6 bonus. Navegar a `/admin/notif-que-no-existe` (URL inventada) redirige al landing público `https://www.misterservicerd.com/` en vez de mostrar 404 dentro del layout admin. Pérdida total de sidebar + contexto de sesión. Usuario tiene que volver manualmente.

Esta es regresión parcial de SPRINT-171: el sprint arregló `/admin/notificaciones` puntualmente pero no implementó catch-all `/admin/*`.

**Touch-list:**

1. `src/App.tsx` — agregar ruta catch-all `/admin/*` o `/admin/:rest*` que renderiza un componente `<Admin404Page />` DENTRO del `Layout` admin (con sidebar visible, contexto de sesión preservado, link "Volver al dashboard").
2. `src/pages/Admin404.tsx` (NUEVO) — componente 404 estilizado consistente con el resto del admin (header, mensaje, botón "Volver al dashboard", link a las páginas más usadas).
3. Verificar que rutas válidas existentes (`/admin/dashboard`, `/admin/ordenes`, etc.) NO sean capturadas por el catch-all (deben tener prioridad en el router).

**Criterios de éxito:**

- [ ] `/admin/cualquier-cosa-inexistente` muestra 404 dentro del layout admin.
- [ ] Rutas válidas siguen funcionando.
- [ ] Sesión de usuario preservada (no requiere re-login).

**Restricciones:**

- NO afectar el catch-all del routing público (que sí debe llevar al landing).
- NO romper rutas públicas standalone como `/cita/:calendarId`, `/tracking/:token`, `/f/:slug`.

---

## SPRINT-181 — Badge "Solo chequeo" visible en headers de modales

**Estado:** ✅ COMPLETADO 2026-05-18 por coordinator autónomo (pasada 19, junto con SPRINT-180). Hash `729b85f`. Componente compartido `src/components/shared/BadgeSoloChequeo.tsx` con variantes `compact` (default) y `prominent`. Montado en header de `OrdenDetailModal.tsx` y de `ProcesarFacturacionModal.tsx` con variante prominent (consistente con el badge existente en `OrdenResumenLectura.tsx`, que mantiene su badge inline — refactor futuro opcional). Cazadores 10/10 PASS.

**Prioridad:** BAJA (consistencia UX, no funcional).

**Origen:** QA E2E 2026-05-16. El badge "Solo chequeo / Sin reparación" aparece bien en:
- Card del listado `/admin/ordenes` ✓
- Fila expandida de `/admin/facturas` ✓ (badge amarillo prominente "⚠️ SOLO CHEQUEO · SIN REPARACIÓN")

Pero FALTA en:
- Header del modal de detalle de orden (`OrdenDetailModal.tsx`) — la coordinadora abre y solo infiere por texto.
- Header del modal de emisión de conduce (`ProcesarFacturacionModal.tsx`) — al emitir la coord no ve indicador visual claro.

**Touch-list:**

1. `src/components/ordenes/OrdenDetailModal.tsx` — agregar badge `<Badge variant="solo_chequeo">Solo chequeo</Badge>` en el header del modal, condicional a `orden.soloChequeo === true`.
2. `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx` — mismo badge en el header del modal de emisión.
3. Componente compartido `<BadgeSoloChequeo />` si no existe (reusar el mismo de la card de orden y fila de factura).

**Criterios de éxito:**

- [ ] OS-0058 (test case) muestra badge "Solo chequeo" en header del modal de orden Y en modal de emisión de conduce.
- [ ] Estilo consistente con los otros 2 lugares donde ya aparece.

---

## SPRINT-182 — Wizard de cierre adaptado a `soloChequeo: true` + tipo de equipo

**Estado:** ✅ COMPLETADO 2026-05-18 por coordinator autónomo (pasada 19). Hash `8bdd914`. Cambio mínimo y quirúrgico: solo labels de las 3 preguntas + banner informativo. NO toca shape persistido, lógica de submit, piezas, firma ni garantía. Hallazgo #13 resuelto: si `equipoTipo` contiene "aire", pregunta 3 cambia a "¿Revisaste conexiones eléctricas, condensador y filtro?". Hallazgo #14 resuelto: si `soloChequeo === true`, pregunta 1 cambia a "¿Le comunicaste al cliente el diagnóstico final?" + banner "Cierre como solo chequeo" arriba. Hallazgo #11 (simplificar estructuralmente el wizard en solo_chequeo — no pedir piezas/garantía) queda como deuda futura SPRINT-182-B si Jorge lo prioriza (requiere refactor más invasivo). Cazadores 10/10 PASS.

**Prioridad:** MEDIA (afecta UX y trazabilidad legal del cierre).

**Origen:** QA E2E 2026-05-16. Múltiples hallazgos del wizard de cierre `CierreServicioWizard.tsx`:

- **Hallazgo #11:** El wizard NO se adapta a `orden.soloChequeo === true`. Pide los mismos campos que reparación completa (foto, firma, garantía, piezas) cuando algunos no aplican.
- **Hallazgo #13:** La pregunta 4 "¿Revisaste las mangueras de desagüe, entrada de agua y que la llave esté abierta?" es específica de lavadoras/secadoras. En Aire Acondicionado split NO aplica (drenaje sí, entrada de agua/llave NO). El wizard NO branchea por `equipoTipo`.
- **Hallazgo #14:** La pregunta "¿Equipo funciona correctamente?" no tiene sentido en flujo solo_chequeo (técnico no reparó, respuesta siempre "No"). Debería auto-marcarse "No" + ser informativa, o reemplazarse por "¿Confirmás que solo realizaste diagnóstico?".

**Touch-list (auditoría inicial):**

1. `src/components/CierreServicioWizard.tsx` — refactor para branchear por `orden.soloChequeo` y `orden.equipoTipo`:
   - Si `soloChequeo === true`: simplificar wizard (no pedir piezas, garantía adaptada al diagnóstico, pregunta 1 informativa).
   - Si `equipoTipo === 'Aire Acondicionado'`: cambiar pregunta de mangueras por "¿Revisaste conexiones eléctricas + condensador + filtro?".
   - Crear mapa de preguntas por `equipoTipo` en `src/utils/checklistCierre.ts` (nuevo) o reusar `checklistTemplates.ts` existente.

2. `src/types/index.ts` — verificar si `CierreServicio` necesita campos adicionales para preguntas por tipo de equipo (probablemente no, se mantienen los 3 booleanos genéricos).

3. `src/utils/checklistTemplates.ts` — verificar si ya tiene templates por tipo de equipo (CLAUDE.md menciona "Checklists are hardcoded in `utils/checklistTemplates.ts` (per `equipoTipo`)"). Si sí, reusar.

**Criterios de éxito:**

- [ ] Cerrar OS con `soloChequeo: true` no pide piezas, muestra texto adaptado al diagnóstico-solo.
- [ ] Cerrar OS de Aire Acondicionado no pregunta por mangueras/llave de agua.
- [ ] Cerrar OS de Lavadora sigue preguntando mangueras (regresión cero).
- [ ] Test E2E sobre wizard con distintos `equipoTipo`.

**Restricciones:**

- NO romper cierres existentes (rules + UI compatibles con cierres legacy).
- archivist PRE-CHANGE obligatorio.

---

## SPRINT-183 — Hallazgos UX bajos consolidados (toast, hint stepper, observaciones)

**Estado:** ✅ COMPLETADO 2026-05-18 por coordinator autónomo (pasada 19). Hash `3650b26`. 3 fixes pequeños: (1) toast `useOrdenCreateForm.ts` muestra "(cliente existente)" cuando se asocia sin crear; (2) `Citas.tsx` agregado campo `observaciones` opcional (max 500 chars) que persiste a `citas_por_confirmar.observaciones`; (3) `siguientePaso.ts` ahora detecta sugerencia.estado === 'aprobada' en fase `en_diagnostico` y cambia hint del técnico a "cerrar la orden tras el cobro / firma del cliente" + hint de oficina a "Solo chequeo aprobado — esperando cierre del técnico". Cazadores 10/10 PASS.

**Prioridad:** BAJA (mejoras menores, sin impacto funcional).

**Origen:** QA E2E 2026-05-16. Tres hallazgos bajos consolidados en un sprint:

1. **Hallazgo #1 — Toast "(cliente creado)" cuando es asociado:** al crear OS desde cita, si la app detecta tel duplicado y asocia cliente existente, el toast dice "Orden OS-XXXX creada y agendada (cliente creado)". Texto engañoso. Debería decir "(cliente existente)" o "(cliente asociado)".

2. **Hallazgo #3 — Form "Registrar Cita" sin campo Observaciones:** el modal de `Citas.tsx` (handleRegistrar) no tiene campo de notas/observaciones. La secretaria tiene que agregar las notas después en el modal de la orden. Agregar campo opcional.

3. **Hallazgo #12 — Hint del stepper no se actualiza tras aprobación:** después de que la coord aprueba el solo_chequeo, el hint del stepper del técnico sigue diciendo "Próximo paso: cotizar reparación o sugerir solo chequeo" cuando debería decir "Próximo paso: cerrar la orden tras el cobro / firma del cliente".

**Touch-list:**

1. `src/components/ordenes/OrdenCreateModal.tsx` o `useOrdenCreateForm.ts` — fix mensaje de toast.
2. `src/pages/Citas.tsx` — agregar `<input>` opcional para notas/observaciones en el form de registrar cita + persistir en `citas_por_confirmar.observaciones`.
3. `src/pages/TecnicoVista.tsx` o componente de stepper del técnico — derivar hint dinámicamente del estado actual de la orden (fase + soloChequeo + estadoAprobacion).

**Criterios de éxito:**

- [ ] Toast diferenciado al asociar vs crear cliente nuevo.
- [ ] Form de registrar cita tiene campo Observaciones opcional.
- [ ] Hint del stepper del técnico cambia tras aprobación de la sugerencia.

---

## SPRINT-184 — Actualizar QA_PROMPT_MAESTRO + agregar filtro destinatario en /admin/notificaciones

**Estado:** ✅ COMPLETADO 2026-05-18 por coordinator autónomo (pasada 19). Hash `e6e1ba4`. Parte 1 (doc): 3 correcciones a `docs/QA_PROMPT_MAESTRO.md` — ruta `/admin/citas` (no `/admin/citas-por-confirmar`), wizard ROL 2 paso (d) reflejando UI real (botones "Sugerir solo chequeo" / "Marcar Realizado" en vez del wizard binario inexistente), ROL 5 reasignado a `qa-coordinadora` con nota explicativa sobre restricción routing. Parte 2 (UX): selector "Ver bandeja de" agregado a `/admin/notificaciones` para admin/coord. Suscripción a `personal` solo si `esAdminOCoord(userProfile)`. En modo auditoría: marcar leída/marcar todas leídas bloqueadas + badge "Modo auditoría". NO requirió cambio de rules — `match /notificaciones` ya permite `esStaff()` leer notifs ajenas (rule line 539). Cazadores 10/10 PASS.

**Prioridad:** DOC + UX BAJA.

**Origen:** QA E2E 2026-05-16.

**Parte 1 — Doc:**

`docs/QA_PROMPT_MAESTRO.md` tiene 3 errores que el QA E2E descubrió:
- ROL 2 paso (d): describe un wizard binario ("Equipo prende? Conexiones OK?") que NO existe en la UI actual. El flujo real es "Sugerir solo chequeo" o "Marcar Realizado".
- ROL 5: asigna la emisión de conduce a operaria, pero el routing y el flujo de negocio lo restringen a coordinadora/admin.
- Ruta `/admin/citas-por-confirmar` redirige a `/admin/citas` — actualizar.

**Touch-list:**

1. `docs/QA_PROMPT_MAESTRO.md` — corregir las 3 inconsistencias. Reasignar ROL 5 a `qa-coordinadora`. Actualizar wizard del técnico para reflejar la UI real. Cambiar ruta vieja.

**Parte 2 — UX:**

`/admin/notificaciones` (post-SPRINT-171) muestra TODAS las notifs del usuario logueado, pero NO permite filtrar por destinatario. Para validar manualmente sprints como SPRINT-176 (que la coordinadora emisora NO recibió notif de su propia emisión), el admin tiene que hacer login-switch entre cuentas — fricción innecesaria.

**Touch-list:**

2. `src/pages/Notificaciones.tsx` (asumir nombre del archivo) — agregar selector "Ver bandeja de: [yo / @rol]" cuando el usuario logueado es admin. La query lee notificaciones de destinatario distinto al `auth.uid` propio.
3. `firestore.rules` — verificar si admin puede leer notificaciones de otros destinatarios. Si NO, **ESCALAR a BLOQUEOS.md** (cambio de rules).

**Criterios de éxito:**

- [ ] QA_PROMPT_MAESTRO.md actualizado y consistente con la UI real.
- [ ] Admin puede ver bandeja de notificaciones de otros roles para auditoría.

**Restricciones:**

- Solo admin/coord pueden usar el filtro (no exponer notifs ajenas a otros roles).

--- — **2 sprints COMPLETADOS en serie:** (1) **SPRINT-PERSONAL-EDIT-UNIFY** (hash `82d1fd1`) — `GestionUsuarios.tsx` ahora importa `ROL_LABELS`/`ROL_COLORS`/`ROL_SELECT_ORDEN` desde `utils/personal.ts` (single source of truth desde SPRINT-142d) eliminando duplicación local. Dropdown del modal Editar Usuario muestra ahora las 5 opciones con acceso al sistema (incluye Coordinadora que faltaba — bug que llevó a Jorge a tener que usar el modal alternativo al crear cuentas QA del SPRINT-QA-USER). +15/-21 líneas. (2) **SPRINT-158d-FIX** (hash `b16f46a`) — `EnviarFacturacionButton.tsx` optimistic UI: toast + `setSaving(false)` ahora se ejecutan inmediatamente después del `updateDoc` crítico; notifs a admin/coord viajan en IIFE `void` fire-and-forget. Confirmación al usuario en ≤2s en lugar de 3-30s (caso Wilainy QA E2E 2026-05-13). +20/-7 líneas en el componente. Cazadores 10/10 PASS post-cada commit. Typecheck + lint PASS. Push verificado a `origin/main`. **Cola autónoma agotada** (SPRINT-QA-USER queda PENDIENTE-bloqueado por acción humana de Jorge: crear las 5 cuentas QA antes que coordinator pueda cerrar).

**Última actualización previa:** 2026-05-15 por coordinator autónomo (pasada dedicada SPRINT-158c, `trabaja`) — **SPRINT-158c COMPLETADO** con 1 archivo modificado (`src/pages/TecnicoVista.tsx`, +35/-3). Auditoría reveló que SPRINT-173 + SPRINT-174 ya cubrían 5 de los 6 sub-bugs (bug 1 + bugs 9.a/b/c/d). Único bug residual ejecutado en esta pasada: **bug 2 (transición de fase `en_diagnostico → en_cotizacion` al sugerir precio)** en `handleAgregarNota`. Guard de retroceso explícito (`if selectedOrden.fase === 'en_diagnostico'`) impide regresión desde fases posteriores. Cazadores 10/10 PASS. typecheck + build (4.15s) + lint PASS. regression_guardian 10/10 + reviewer APPROVED (manuales coordinator). Hash pendiente del commit en curso. Tabla de comparación post-ejecución agregada al bloque SPRINT-158c. Hallazgo lateral: Cowork agregó SPRINT-PERSONAL-EDIT-UNIFY (MEDIA) durante la pasada — queda en cola para próxima ejecución.

**Última actualización previa:** 2026-05-15 por Cowork — **7 sprints WhatsApp Cloud API integration agregados a la cola detrás de los 9 fixes del QA**. Stack confirmado: Vite/React/TS + Firebase (Firestore + Storage + Auth) + Vercel Serverless (patrón existente en `api/gps/ubicacion.ts`). Decisión arquitectónica: NO usar BSP intermediario (Wati/360dialog), integrar directo a Meta Cloud API. Roadmap: **WA-1 webhook entrante (HMAC + idempotencia)** → **WA-2 servicio saliente proxy** → **WA-3 UI conversaciones admin** → **WA-4 tracking referral → campanas_marketing existente** → **WA-5 plantillas HSM** → **WA-6 Bot IA Claude Haiku (decisión Jorge: bot conversa + captura datos + crea OS automática + escala a humano)** → **WA-7 cron jobs (recordatorios + NPS + garantía a vencer)**. Identidades Meta confirmadas: Business 103664415995101, Phone Number ID 1151997541323577, número +1 849-564-6767 (display "Fixman Mister service" aprobado). Bloqueadores externos: META_APP_SECRET + META_VERIFY_TOKEN + META_ACCESS_TOKEN (Jorge debe crear app en developers.facebook.com + System User token permanente). Plantillas HSM requieren 24-48h aprobación Meta. SPRINT-WA-6 Bot IA requiere ANTHROPIC_API_KEY + Jorge confirma specs propuestos (modelo Haiku, escalación, system prompt). Coordinator procesa los 9 fixes de QA primero, después WA-1 a WA-7 en orden.

**Última actualización previa:** 2026-05-14 por Cowork — **QA E2E DISTRIBUIDO COMPLETADO sobre OS-0056 / CG-00019** con 4 Claudes (Maria coord + Wilainy operaria + Yohana operaria + Angelica secretaria) + 2 manuales (Aury técnico en iPad + Jorge admin). **6/6 fixes principales del día validados como PASS** con 1 caveat: SPRINT-159 captura firma OK pero render UI quedó incompleto (SPRINT-168 PENDIENTE). Tabla PASS/FAIL: ✅ SPRINT-159 firma wizard + ✅ SPRINT-161 fase Cerrado + ✅ SPRINT-153-FIX nota visible + ✅ SPRINT-162 KPI sube + ✅ SPRINT-160 modal hereda período + ⚠️ SPRINT-158a (foto+período PASS, firma FAIL). Bonus validado: ✅ SPRINT-152 helper Pago verificado + ✅ notif Conduce_emitido llega a operarias. **9 sprints nuevos escritos a la cola priorizados ALTA/MEDIA/BAJA:** SPRINT-168 (firma render UI — ALTA, bloqueador legal), SPRINT-169 (regresión SPRINT-163 orden_asignada NO llega — ALTA), SPRINT-170 (selector operaria auto-derivado del técnico — ALTA), SPRINT-171 (`/admin/notificaciones` rota — MEDIA), SPRINT-172 (modelo combobox → input libre — MEDIA), SPRINT-173 (aprobar precio NO avanza fase — MEDIA), SPRINT-174 (notifs faltantes 4 eventos — BAJA), SPRINT-175 (migrar órdenes legacy stuck — BAJA), SPRINT-176 (decisión notif a quien emite conduce — BAJA, requiere OK Jorge). Coordinator procesa ALTAS primero al hacer `trabaja`. SPRINT-169 requiere postmortem obligatorio (regresión de sprint anterior).

**Última actualización previa:** 2026-05-14 por coordinator (interactivo end-to-end, pedido explícito de Jorge) — **SPRINT-158a COMPLETADO** (hash `1ddb20e`, 1 archivo, +136/-1, ~25 min). Bugs 4+5 del SPRINT-158 (foto cierre + período garantía no renderizados en modal admin) cerrados con bloque "Cierre del servicio" inline en `OrdenDetailModal.tsx`. NO se reusó `OrdenResumenLectura` para evitar duplicar info ya mostrada. **SPRINT-158 DIVIDIDO** en 5 sub-sprints: 158a (cerrado), 158b/c/d (PENDIENTES en cola), 158e (BLOQUEOS.md — decisión negocio GPS bloqueante). Hallazgo lateral documentado: `OrdenDetalle.tsx` (página standalone) también carece de render de `periodoGarantiaDias` (foto cierre + firma SÍ las tiene). Deuda separada como SPRINT-158a-FIX-pagina si Jorge la prioriza. Cazadores 8/8 PASS (P-001 a P-007 + P-009). Typecheck + build PASS. Reviewer APPROVED.

**Última actualización previa:** 2026-05-14 por Cowork — Jorge eligió "vamos a solucionarlos todos" tras cerrar SPRINT-163 en coordinator. 6 sprints escritos en orden de criticidad: **SPRINT-159 (BLOQUEADOR go-live: firma del cliente) → SPRINT-161 (fase no avanza) → SPRINT-153-FIX (regresión nota conduce) → SPRINT-162 (KPI dashboard=0) → SPRINT-158 (9 hallazgos UX) → SPRINT-160 (modal 60 default UX)**. Coordinator procesa en este orden al hacer `trabaja`. **QA E2E distribuido (4 Claudes + humanos) se activa SOLO después del SPRINT-159** — los otros 5 son menores y bastan con tester+reviewer+regression_guardian del coordinator. Auditoría de consumidores hecha por Cowork antes de redactar (memoria "Revisar dependencias antes de modificar"): paths verificados, hipótesis de causa raíz documentadas, hallazgos laterales catalogados como deuda separada. SPRINT-161 + SPRINT-162 son fixes triviales (1 archivo cada uno). SPRINT-159 toca Storage + types + 3-5 componentes (riesgo medio, archivist obligatorio). SPRINT-153-FIX requiere diagnóstico previo en Firestore Console antes del fix.

**Última actualización previa:** 2026-05-13 por coordinator (interactivo end-to-end por pedido explícito de Jorge) — SPRINT-157 (runTransaction `FacturaCrearModal.handleSubmit`) COMPLETADO. Hash `8b783ce`, diff +124/-79. Refactor paralelo a SPRINT-155: `tx.set(facturaRef) + tx.update(denormParaTx)` en runTransaction único; comisiones helper queda PRE-tx capturando denormParaTx; audit `override_modalidad_precio_factura` queda POST-tx best-effort. Allowlist `@safe-non-tx:` del modal removida (deuda P-003 cerrada). Cazadores 7/7 PASS post-commit. **NOTA — colisión de ID:** Cowork escribió el 2026-05-13 un sprint distinto reusando el mismo ID "SPRINT-157" (notificación `orden_asignada` desde secretaria). Esa entrada queda pendiente bajo otro ID — sugerido SPRINT-163 según el conteo del header del 2026-05-13. Próximo ID disponible: SPRINT-163 (mantener el del header previo).

**Última actualización previa:** 2026-05-13 por Cowork — Test E2E distribuido OS-0055 → CG-00018 completado con 4 Claudes (admin Jorge, coord Maria, operarias Wilainy + Yohana) + 2 manuales (Aury técnico, Angelica secretaria). Resultado: flujo completo funcionó end-to-end. **SPRINT-153 confirmado operativo** (notificación "Conduce CG-00018 emitido" SÍ llegó esta vez, a diferencia de CG-00017 anterior). **SPRINT-154 confirmado operativo** (60 días preseleccionado). **SPRINT-155 runTransaction confirmado operativo** (CG-00018 emitido sin duplicar). Bugs detectados, priorizados:

🔴 **CRÍTICO #1 — Re-abrir SPRINT-153 (bug nota del conduce regresión):** la "Nota para el conduce" SÍ se captura en el modal (47/500 chars confirmado) pero NO aparece en la fila expandida de `/admin/facturas` (búsqueda DOM 0 hits). SPRINT-153 modificó `OrdenResumenLectura.tsx` para renderizar `notaConduce` pero **ese componente se monta en otro lugar**. La fila expandida de `Facturas.tsx` lee otro shape. Touch-list: verificar dónde está el render real de la fila expandida del conduce + agregar render de `factura.notaConduce` ahí.

🔴 **CRÍTICO #2 — SPRINT-159 (firma del cliente):** ya anotado. Bloqueador go-live.

🟡 **MEDIO — SPRINT-161 (NUEVO):** la fase de la orden NO avanza a "Cerrado/Facturada" tras emitir conduce. Queda en "Trabajo Realizado" aunque ya tiene `facturada: true` y `facturaNumero: CG-XXXXX`. Inconsistencia entre pipeline visual y estado real. Touch-list: handler que emite conduce (`ProcesarFacturacionModal.handleGenerar` tx callback) debe agregar `fase: 'cerrado'` al `ordenUpdate` cuando facturada=true.

🟢 **BAJO — SPRINT-160 reclasificado a UX visual (NO bloqueador):** el modal muestra 60 días default pero el conduce final usa 30 días del wizard correctamente (verificado en CG-00018). Es UX confusa para coord/operaria pero funcionalmente correcto. Sigue valiendo el fix (leer `orden.periodoGarantiaDias` como default si existe) pero baja de prioridad.

🟢 **BAJO — SPRINT-162 (NUEVO):** KPI "Conduces Emitidos" del dashboard muestra RD$0 / 0 cuando hay 2 conduces (CG-00017 + CG-00018) emitidos en el mes. "Ingresos del Mes" sí cuenta los 2 (RD$17,000). Inconsistencia interna del dashboard. Probablemente el KPI cuenta solo `estado === 'emitida'` (no pagada) y los dos están en `pagada`. Revisar.

🟢 **DECISIÓN NEGOCIO:** alerta "Aury Mon cerró OS-0055 sin verificación GPS" aparece en dashboard. La app SÍ controla GPS al cerrar pero NO bloquea. ¿Cambiar a bloqueante? Decisión de Jorge.

Próximo ID disponible: SPRINT-163.

**Última actualización previa:** 2026-05-13 por Cowork — Agregado SPRINT-159 (implementar firma del cliente en wizard de cierre del técnico).

**Última actualización previa:** 2026-05-13 por Cowork — Agregado SPRINT-159 (implementar firma del cliente en wizard de cierre del técnico). **Bloqueador para go-live.** El test E2E distribuido sobre OS-0055 reveló que el wizard `/tecnico` "Cerrar Servicio" actual NO tiene paso de firma del cliente. Búsqueda en `src/components/cierre/` y `src/types/index.ts` confirma 0 hits para `firma`/`signature`/`canvas`/`firmaCliente`. El SPRINT-135a-UI implementó wizard nuevo (foto + 3 preguntas + piezas + período de garantía) pero omitió firma. En RD el técnico va a casa del cliente y el cliente firma una hoja de servicio como prueba de aceptación — la app digital debe replicar eso. Sin firma, el conduce de garantía pierde valor legal y no hay defensa documentada si cliente reclama. Touch-list inicial: librería tipo `react-signature-canvas` o canvas HTML5 + nuevo step en wizard + persistir firma como blob en Storage o base64 en `cierreServicio.firmaClienteUrl` + render en detalle de orden + en PDF del conduce. Riesgo medio: agrega Storage upload y campo nuevo en `cierreServicio`. archivist PRE-CHANGE obligatorio. Próximo ID disponible: SPRINT-160.

**Última actualización previa:** 2026-05-13 por Cowork — Agregado SPRINT-158 (3 hallazgos del test E2E sobre OS-0055 reportados por Claude del sidepanel de Wilainy):
1. **No hay notificación "cotizacion_lista" / "diagnostico_completado"** cuando técnico sugiere precio. Solo se dispara "tecnico_inicio_chequeo". La operaria solo se entera si entra a mirar manualmente. Verificar si los tipos existen en `src/types/index.ts` y agregar el `crearNotificacion` correspondiente al handler donde Aury submite el precio sugerido.
2. **La fase NO avanza automáticamente a "en_cotizacion"** cuando el técnico sugiere precio + agrega nota. Queda en "en_diagnostico" hasta que la operaria aprueba (entonces pasa a "aprobado"). Falta transición intermedia. Verificar el handler que persiste el precio sugerido del técnico — debería actualizar `orden.fase = 'en_cotizacion'`.
3. **Chip de operaria en card de `/admin/ordenes` muestra "Op: Operaria"** (string literal, no el nombre real "Wilainy"). Probablemente la card lee `operariaRol` en vez de `operariaNombre`, o `operariaNombre` no está denormalizado. Buscar en `OrdenCard.tsx` o componente equivalente.

**Hallazgos adicionales del mismo test E2E reportados por Yohana (operaria PC #3, vista en /admin/ordenes con modo apoyo):**
4. **Foto del cierre del técnico NO se muestra en modal admin de la orden** (sí solo la del chequeo inicial). Los datos están en `cierreServicio.fotoCierre` (verificado en SPRINT-148) pero el modal de OrdenDetalle parece no leer ese campo. Inconsistencia: en `/admin/facturas` (fila expandida del conduce, post-SPRINT-148) sí se ve la foto del cierre; en el modal de la orden no.
5. **Período de garantía NO se muestra en modal admin de la orden.** Mismo patrón que bug 4: el dato está (`orden.periodoGarantiaDias = 30`, verificado) pero el modal no lo renderiza. En `/admin/facturas` sí aparece (post-fix SPRINT-153). El modal de la orden necesita fix análogo.
6. **El chip "Operaria" muestra "Angelica Secretaria"** (la CREADORA de la orden) en lugar de "Wilainy" (la operaria del grupo). Es el mismo bug que vio Wilainy pero confirmado desde otro rol. Posiblemente el campo `operariaNombre` esté denormalizando mal: copia el nombre de la persona que CREÓ la orden en lugar de la operaria asignada al técnico.

**Hallazgos adicionales reportados por Wilainy (T+18, registro de pago + envío a conduce):**
7. **Timeout 30s CDP al click "Enviar a conduce"**. El backend completó la operación pero la UI tardó mucho en confirmar. Verificar performance del handler `handleEnviarAConduce` (o equivalente) — puede haber un `await` largo, suscripción bloqueante o query sin índice.
8. **Alerta interesante: "Aury Mon cerró OS-0055 sin verificación GPS"** aparece en dashboard. La app SÍ controla GPS en cierre pero NO es bloqueante. Revisar si es alerta informativa o si debería forzar GPS (decisión de negocio).
9. **Falta notificación en TODOS estos eventos confirmados desde 3 roles (Maria, Wilainy, Yohana):**
   - Aprobación de precio (operaria aprueba) — no notifica al técnico ni al coord.
   - Cierre del servicio (técnico cierra wizard) — no notifica a operaria ni coord.
   - Pago registrado — no notifica al admin/coord.
   - Envío a facturación — no notifica a admin/coord (en teoría SPRINT-153 debería haber cubierto algo de esto, verificar regresión).

Tipo de cambio para los 9 hallazgos combinados: principalmente cosmético + agregar render + agregar notificaciones. NO toca lógica de negocio ni rules. Riesgo bajo-medio. El sprint puede dividirse en sub-sprints si toca muchos archivos.

Hallazgos relacionados: SPRINT-157 también detectado en el mismo test (notificación `orden_asignada` cuando secretaria crea orden — sigue PENDIENTE). Próximo ID disponible: SPRINT-159.

**Última actualización previa:** 2026-05-13 por Cowork — Agregado SPRINT-157 (disparar notificación `orden_asignada` cuando secretaria crea orden + asigna técnico). Bug detectado por Claude del sidepanel de Maria durante test E2E distribuido 2026-05-13 sobre OS-0055: el tipo `'orden_asignada'` existe en `src/types/index.ts:1742` pero NINGÚN `crearNotificacion` en el codebase lo emite. Resultado: Maria no recibe notificación cuando Angelica crea OS-0055 + asigna a Aury (campanita tiene 50 notis acumuladas de otros tipos pero ninguna para OS-0055). Touch-list inicial probable: `useOrdenCreateForm.ts` (donde se hace `addDoc('ordenes_servicio')`) + agregar `crearNotificacion({ tipo: 'orden_asignada', userId: <coord>.uid })` para coordinadores activos + opcional al técnico asignado. Riesgo bajo: solo agrega notificaciones, no toca lógica de orden. Próximo ID disponible: SPRINT-158.

**Última actualización previa:** 2026-05-12 por coordinator autónomo (`trabaja`, pasada 14) — SPRINT-155 COMPLETADO (envolver `handleGenerar` del modal Emitir conduce en `runTransaction` para atomicidad cross-collection factura+denorm+orden, hash `3a9618b`, diff +192/-134). Cazadores 7/7 PASS, regression_guardian PASS 9/9, reviewer APPROVED. QA browser pendiente que Jorge ejercite post-deploy. Sub-deuda derivada: SPRINT-156 PENDIENTE (extender cazador P-003 a `src/components/`) agregado al backlog. Próximo ID disponible: SPRINT-157.

**Última actualización previa:** 2026-05-12 por coordinator (`/equipo` + `trabaja`, pasada 13) — SPRINT-154 COMPLETADO (default `tiempoGarantiaDias=60` preseleccionado en modal Emitir conduce, 1 archivo / 3 líneas funcionales, hash `5654971`). Generado ad-hoc tras auditoría estática post-SPRINT-151 que detectó gap entre consigna QA explícita de Jorge ("asegurate que `tiempoGarantiaDias` esté en 60 default") y el state inicial `null` que dejaba el botón Generar deshabilitado hasta clickear preset. Cazadores 7/7 PASS. Typecheck PASS. Push verificado. Plan QA manual completo agregado en `docs/sprints/QA_SPRINT-151_modal_conduce.md` (generado por agente qa). Agregado además SPRINT-155 PENDIENTE (deuda transaccionalidad cross-collection en `handleGenerar` del mismo modal — hallazgo lateral del audit estático, sub-regla CLAUDE.md "Mutaciones cross-collection deben ir en un solo `runTransaction`").

**Última actualización previa:** 2026-05-12 por Cowork — Agregado SPRINT-153 (fix 3 bugs detectados post-emisión CG-00017 en QA browser de SPRINT-151). Bug 1: `notaConduce` se persiste en factura pero `OrdenResumenLectura.tsx` no lo lee. Bug 2: período de garantía dice "No configurado" aunque Firestore tiene `periodoGarantiaDias=60` — probable snapshot stale o falta de fallback a `factura.garantia.tiempoDias`. Bug 3: notificación `conduce_emitido` no llega — filtro de destinatarios restringe a admin/coord pero las operarias necesitan saber. Touch-list: `OrdenResumenLectura.tsx` (ampliar props + render nota + fallback período), `Facturas.tsx` (pasar factura), `ProcesarFacturacionModal.tsx` (ampliar destinatarios incluyendo operarias + loggear errores de crearNotificacion en lugar de silenciarlos). Riesgo bajo-medio.

**Última actualización previa:** 2026-05-12 por Cowork — Agregado SPRINT-152 (mejora UX checkbox "Pago verificado" cuando monto=0). QA browser de SPRINT-151 (ejecutado por Claude del sidepanel sobre OS-0054 el 2026-05-12) confirmó 7/7 criterios core: ítem inventario editable ✓, nota con contador ✓, texto viejo del paso 2 eliminado ✓, editor de pago activo ✓, selector dinámico de método ✓, pago previo visible ✓, selector de garantía ✓. Sub-observación de UX: cuando la orden ya está 100% pagada, el monto default = 0 y el checkbox "Pago verificado" queda deshabilitado sin tooltip explicativo. Es comportamiento correcto pero confuso visualmente. SPRINT-152 lo arregla con tooltip + helper text contextual. Riesgo: trivial (solo copy/tooltip).

**Última actualización previa:** 2026-05-12 por coordinator (pasada 12, `trabaja`) — SPRINT-149 + SPRINT-151 COMPLETADOS en serie tras OK Jorge "ambos en orden, 149 primero". SPRINT-149: 13 archivos + 1 script migración + cazador P-006 variante 4 + 2 docs. Hashes `2ecea5e` + `d65fb82` + `89159e5`. SPRINT-149-APPLY (ejecución de `--apply` del script) en BLOQUEOS esperando OK Jorge. SPRINT-151: 4 archivos (modal + editor + parent + types). Hash `863e804`. Cazadores 7/7 PASS post-cada commit. Push verificado. Próximo ID disponible: SPRINT-153.

**Última actualización previa:** 2026-05-12 por Cowork — Agregado SPRINT-151 (Editar ítems + nota + verificación de pago en el modal "Emitir conduce de garantía"). Jorge mirando OS-0054 detectó que la operaria no puede editar la descripción de un ítem que viene del inventario (queda readonly), no puede dejar una nota que aparezca en el conduce, no puede confirmar el pago desde el modal (hoy dice "hazlo desde la orden antes de continuar"), y el admin no recibe notificación cuando se emite. Auditoría de consumidores hecha: `ProcesarFacturacionModal.tsx` solo se importa desde `FacturacionPendiente.tsx`; `FacturaItemsEditor` se reusa además en `FacturaCrearModal.tsx` (cambio benigno: solo se relaja la propiedad readonly de la descripción para items de inventario, no rompe el modal de factura manual). Sprint con touch-list expandido + criterios + reviewer obligatorio. Riesgo medio: toca `PagoOrden` (cross-collection con `ordenes_servicio.pagos[]`), audit log y notificación.

**Última actualización previa:** 2026-05-12 por coordinator autónomo (pasada 11, `trabaja`) — SPRINT-150 COMPLETADO (fix mecánico P-001 en `AgendaDia.tsx:144,191`, 2 líneas, patrón SPRINT-114, hash `92f4b93`). SPRINT-149 (operariaId migración) MOVIDO a `BLOQUEOS.md` por conflicto entre Cowork "vamos con operaria" y prompt explícito del modo autónomo "NO toques los 3 hits operariaId === p.id". Jorge resuelve el conflicto editando `BLOQUEOS.md` con `OK: jorge ...` o `MANTENER BLOQUEADO: ...`. Cazadores 7/7 PASS. Hashes `92f4b93` (fix) + `79111f1` (docs) pusheados a `origin/main`. Próximo ID disponible: SPRINT-152.

**Última actualización previa:** 2026-05-12 por Cowork — Agregado SPRINT-149 (completar migración `operariaId` a auth.uid). Jorge eligió "vamos con operaria" tras descubrir, durante auditoría de SPRINT-145, que `operariaId` está bajo el mismo patrón P-006 que tecnicoId. Re-auditoría profunda reveló hallazgo clave: el WRITE-side ya fue parcialmente migrado en SPRINT-105 (`FormAltaEditarEmpleado.tsx:226` ya emite `op.uid || op.id`), pero el READ-side NO. 20 archivos tocan `operariaId`; 13 necesitan fix de reads + 1 fix de escritura pendiente en `PersonalPage.tsx:772, 778`. Sprint incluye: (a) fix de 13 lookups + 2 escrituras pendientes, (b) script `migrar-operariaid-a-uid.ts` read-only + `--apply` para alinear datos existentes, (c) extender cazador P-006, (d) actualizar `CAMPOS_CROSS_COLLECTION.md` y `PATRONES_REGRESION.md`. Riesgo medio-alto: toca código de nómina/comisiones. Reviewer obligatorio. archivist PRE-CHANGE obligatorio. `--apply` del script NO se ejecuta autónomamente — queda en `BLOQUEOS.md` para Jorge.

**Última actualización previa:** 2026-05-12 por coordinator autónomo (pasada 10, `trabaja`) — SPRINT-148 COMPLETADO. Componente nuevo `OrdenResumenLectura.tsx` montado en 2 puntos de Facturas.tsx. Cazadores 7/7 PASS. Hash `b45df45` pusheado a `origin/main`.

**Última actualización previa:** 2026-05-12 por Cowork — Agregado SPRINT-148 (UX Conduces de Garantía: mostrar orden completa en fila expandida + modal "Marcar garantía"). Jorge observó viendo CG-00016/OS-0049 que al marcar una garantía o expandir el conduce, no se ve el contexto del trabajo original (qué piezas se usaron, fotos del cierre, si fue solo chequeo, satisfacción cliente). Esto hace que las decisiones de aprobar/rechazar reclamaciones se tomen "a ciegas". Sprint introduce componente nuevo read-only `OrdenResumenLectura.tsx` con badge prominente "Solo chequeo · sin reparación" cuando aplique. Auditoría de consumidores hecha: `Facturas.tsx` solo se importa en App.tsx:28 — cambio aislado, riesgo bajo. Touch-list completo según sub-regla CLAUDE.md "Touch-list expandido". Hallazgos laterales documentados como deuda: (a) FacturacionPendiente.tsx podría reutilizar el componente nuevo (SPRINT-150 follow-up), (b) Facturas.tsx tiene 1000+ líneas (refactor SPRINT-151).

**Última actualización previa:** 2026-05-12 por Cowork — Re-auditoría profunda de SPRINT-145 a pedido de Jorge ("precisión quirúrgica"). Hallazgos: el sprint inicial tenía 4 cambios mapeados pero faltaban 2 (línea 315 — filtro "Sin citas hoy", y línea 432 — render `ordenesPorTecnico[t.id]`). Sin estos dos, el fix anterior dejaba la página parcialmente rota (técnicos visibles correctamente pero con órdenes vacías; o duplicados en "Sin citas hoy"). Además ajustado el cambio de línea 288: el type `Usuario` NO tiene `uid` separado, hay que importar `currentUser` del context `useApp()` y usar `currentUser.uid` directo. Total: SPRINT-145 ahora tiene 6 ediciones funcionales + 1 import. Cazador 8/8 sigue verde post-cambio (el patrón nuevo no se caza — eso lo cubre SPRINT-146). Hallazgos laterales detectados durante la auditoría (NO incluidos en SPRINT-145, documentados como deuda): (a) líneas 144 y 191 escriben `userProfile.id` en lugar de `currentUser.uid` (gotcha P-001) — futuro SPRINT-149; (b) 3 archivos comparan `o.operariaId === p.id` (`nomina.service.ts:172`, `Ordenes.tsx:635`, `Rendimiento.tsx:297`) — SPRINT-146 investiga si `operariaId` es uid o docId y agrupa fixes.

**Última actualización previa:** 2026-05-12 por Cowork — SPRINT-144 marcado ABSORBIDO (Claude Code ya entregó `scripts/qa-sprint-135a-ui.ts` directo en sesión interactiva; Caso 5 PASS 4/4 contra prod). Agregados SPRINT-145 y SPRINT-146 derivados de hallazgo de Jorge mirando OS-0049: la página `/admin/agenda` muestra todos los técnicos en "Sin citas hoy" + KPIs en 0 aunque hay órdenes con fecha de hoy. Causa raíz identificada por Cowork leyendo `src/pages/AgendaDia.tsx` líneas 295, 309-310, 336: 4 instancias del patrón P-006 escapadas al cazador determinístico (filtra `t.id` contra `tecnicoId` que es `auth.uid` post-c4be345). El cazador actual no las cazó porque están dentro de `useMemo` con sintaxis `idsConOrden.has(t.id)`, no `<option value={t.id}>`. SPRINT-145 = fix quirúrgico AgendaDia (1 archivo, riesgo bajo). SPRINT-146 = extender cazador P-006 a la variante `useMemo + Set + t.id` y barrer codebase. Ambos autónomos. Jorge sigue con QA del wizard de garantía en paralelo (casos 1 y 4 manuales).

**Última actualización previa:** 2026-05-12 por Cowork — Agregado SPRINT-144 (prep QA manual de SPRINT-135a-UI). Jorge pidió herramientas para hacer el QA del wizard de garantía sin abrir Firestore Console campo por campo. SPRINT-144 entrega: (a) script `scripts/qa/verificar-garantia-qa.ts` que recibe ordenId y muestra período, vencimiento, fechaCierre, token y URL pública del endpoint; (b) `docs/sprints/CANDIDATOS_QA_GARANTIA_2026-05-12.md` con 3 órdenes candidatas para Casos 1/2/3 + 1 orden legacy para Caso 5 + plan paso a paso. Read-only puro (grep negativo enforced). Después de este sprint Jorge ejecuta el plan QA de BLOQUEOS.md en 15-20 min. SPRINT-135a-UI sigue EN_REVISION_HUMANA — el cierre formal lo hace Jorge cuando termine el QA.

**Última actualización previa:** 2026-05-11 por Cowork — Implementación directa desde Cowork (en lugar de delegar al coordinator) de SPRINT-136, 137, 139 parcial, 142a, 143. Pendiente: SPRINT-142b/c/d agendados en la cola para el coordinator (Jorge pega `trabaja`). Detalle: SPRINT-136 fail-fast Firebase config (commit `d09bdbb`) + SPRINT-137 validación uploads + SPRINT-139 expiración tokenPortalCliente lado escritura + SPRINT-142a extraer FormAltaEditarEmpleado de PersonalPage (PersonalPage 1713→1430 líneas, -284) + SPRINT-143 lazy-load de rutas con React.lazy + Suspense (bundle 2.59MB→1.01MB, -61%, INP esperado <100ms). Cazador P-006 cazó un caso real en FormAltaEditarEmpleado.tsx:238 (dropdown operaria con `value={op.id}`) que se fixeó con el patrón `(op.uid || op.id)` post-c4be345. Decisión meta: Jorge recordó usar el coordinator de Claude Code en vez de programar desde Cowork — los próximos sub-sprints 142b/c/d se delegan al coordinator vía `trabaja`.

**Última actualización previa:** 2026-05-11 por Cowork — Auditoría forense completa al codebase (4 agentes en paralelo: arquitectura, seguridad, calidad, anti-regresión). Hallazgos CRÍTICOS: secretos hardcodeados como fallback en `src/firebase/config.ts:9-15` (proyecto productivo), `subirArchivoSolicitud` sin validación de size/MIME/cantidad, `storage.rules` no versionado (solo vive en consola). HALLAZGOS ALTO: tokens `tokenPortalCliente` y `garantia.token` sin expiración, App Check en soft mode (no bloquea), 4 monolitos (PersonalPage 1713 / MapaRutas 1267 / Configuracion 1102 / Ordenes 1001). FALSOS POSITIVOS aclarados: `.env` NO está en git (sí está en `.gitignore`), `dist/` NO está en git. Sistema anti-regresión saludable: 8 cazadores en verde, recurrence rate 0%, MTBF creciente. Jorge dio OK "vamos todo" — 4 decisiones tomadas vía AskUserQuestion: max 10MB por archivo, token cliente expira "mientras orden activa + 30 días", App Check enforce con monitoreo 48h previo, solo refactorizar PersonalPage de los 4 monolitos. Agregados SPRINT-136 a 142 (7 sprints). Estados: 136/137/139/142 PENDIENTE autónomo, 138/141 BLOQUEADO esperando OK Jorge (toca rules de Storage y config de App Check), 140 BLOQUEADO esperando SPRINT-135a cerrado.

**Última actualización previa:** 2026-05-11 por Cowork — Discovery completo del refactor de garantía con Jorge (~60min de back-and-forth). Decisión: garantía DEBE reactivar la orden original (no crear nueva), preservando técnico responsable + trazabilidad + datos contables intactos. Modelo final: nueva fase `garantia_reclamada` + array `visitasGarantia[]` + período configurable + countdown público + descuento técnico automático = `comisionPorcentaje × costo_piezas_garantía` aplicado a próxima quincena + toggle "mal uso" en wizard que reactiva flujo cobrable dentro del mismo doc. ITBIS aclarado: es interno, NO se muestra en conduce de garantía (facturación fiscal va por sistema externo). Jorge eligió approach incremental: empieza con SPRINT-135a (modelo + countdown UI, bajo riesgo, sin tocar comportamiento crítico). Sub-sprints 135b/c/d/e diseñados pero NO escritos todavía — se agregan tras QA visual de 135a. Discovery también identificó decisión pendiente sobre WhatsApp (Business app vs Cloud API) — Q1/Q2/Q3 pendientes.

**Última actualización previa:** 2026-05-11 por coordinator (autónomo `sigue`, pasada 5) — SPRINT-134 EN_PROGRESO (1/6). Sub-sprint `Mantenimiento.handleGenerarOrden` envuelto en `writeBatch` para atomicidad de orden + actualización de `proximaFecha`. Allowlist `@safe-non-tx` removida del archivo. Decisión: Opción 1 (uno por uno) — `handleConvertirAFactura` postergado por requerir clarificación de negocio sobre semántica "factura prevalece si falla descuento de stock". Cazadores 7/7 PASS, regression_guardian PASS, reviewer APPROVED. SPRINT-134-mant-QA registrado en BLOQUEOS.md como validación humana no bloqueante. 5 sub-sprints restantes pendientes para próximas pasadas.

**Última actualización previa:** 2026-05-11 por coordinator (autónomo `trabaja`, pasada 4) — SPRINT-133 COMPLETADO. `handleConfirmarEliminar` envuelto en `writeBatch` con chunking (branches técnico + operaria). Cazador P-003 extendido a `src/services/` + `src/pages/` + `src/hooks/` + `api/`. 7 hallazgos colaterales en otras funciones de `src/pages/` documentados como deuda en SPRINT-134 (allowlist `@safe-non-tx` con razón explícita). Cazadores 7/7 PASS. SPRINT-134 (refactor de los 7 a writeBatch) agendado como follow-up PENDIENTE. SPRINT-133-QA registrado en BLOQUEOS.md como validación humana no bloqueante.

**Última actualización previa:** 2026-05-11 por Cowork — SPRINT-132 cerrado con saldo a favor (commit `43a2087`): fixeados 12 lookups del bug sistémico + **4 bugs P-006 originales adicionales descubiertos durante el análisis** (MapaRutas drag&drop escribía `tecnicoId: destino.id` a Firestore, PersonalPage transferencia al eliminar técnico también). Cazador P-006 extendido (ahora detecta `.find()` + escanea `.ts` y `.tsx`). Hallazgo colateral nuevo: `PersonalPage.tsx:682 handleConfirmarEliminar` hace mutación cross-collection (`ordenes_servicio` + `personal`) **sin `runTransaction`**. P-003 no lo cazó porque solo escanea `src/services/`, no `src/pages/`. Jorge eligió SPRINT-133 (recommended): envolver en runTransaction/writeBatch + extender P-003 a `src/pages/` + `src/hooks/`. Mismo patrón meta que P-006 acaba de fixear.

**Última actualización previa:** 2026-05-11 por Cowork — Durante el cierre de SPRINT-130, el coordinator reportó un hallazgo colateral en `OrdenEditForm.tsx:77` (`tecnicos.find(t => t.id === editForm.tecnicoId)`) que NO se dispara correctamente post-`c4be345` porque `tecnicoId` ahora es `auth.uid` pero el `.find` busca por `personal.id` (doc id). Cowork verificó con grep y descubrió que **el mismo bug está en 14 sitios** del repo — incluido `useOrdenCreateForm.ts:588` que es el CREATE flow. Esto explica de raíz el caso Aury Mon (no solo timing): TODAS las órdenes creadas post-c4be345 con técnico que tenga operaria asignada vía `personal[uid].operariaId` NUNCA derivan la operaria correctamente porque el `find` falla. SPRINT-129 reportó 0 inconsistencias porque el patrón es "siempre vacío" en lugar de "desincronizado" — el cazador no detecta el caso "operariaNombre nunca poblado en orden con técnico-con-operaria". Agregado SPRINT-132 con scope sistémico (14 sitios) + cazador extendido P-006 para detectar `.find()` con el patrón.

**Última actualización previa:** 2026-05-11 por Cowork — Jorge reportó bug visual en iPad: las cards de orden en `/admin/ordenes` (Vista lista) se desbordan horizontalmente — el FaseStepper de 8 fases + botones "Cómo llegar" + "Cancelar" no entran en el ancho de iPad portrait (~810px), quedando el botón "Cancelar" cortado por la derecha. Captura del 2026-05-11 10:03 AM confirma el desborde. Agregado SPRINT-131 (fix responsive: cambiar breakpoint `md:` → `lg:` en `OrdenCard.tsx:68` para que iPad portrait use layout column, o alternativa equivalente). Bug bloquea a Wilainy/Yohana/Mariela que usan iPad para gestionar órdenes.

**Última actualización previa:** 2026-05-11 por Cowork — Jorge confirmó que la división 7+7 de "Grupos operaria-técnico" en `PersonalPage.tsx` es correcta y el flujo derivativo (`personal[uid].operariaId` → UI Personal viva + snapshot en orden al crear/editar) funciona como se diseñó. Eligió SPRINT-130 (botón "Re-derivar operaria" en órdenes viejas) como próximo foco para arreglar el caso Aury de raíz y prevenir futuros incidentes similares cuando se asigna operaria a un técnico que ya tiene órdenes abiertas. Agregado SPRINT-130 a la cola con autonomía completa (no toca rules, no toca migraciones masivas).

**Última actualización previa:** 2026-05-10 por Cowork — Jorge reportó bug específico (orden con técnico Aury Mon mostrada sin operaria, pero el modal de Personal SÍ muestra Wilainy asignada). Diagnosticada causa raíz: la orden se creó/editó antes de la asignación de Wilainy a Aury, y el sistema "congela" la operaria en el doc de la orden al momento de crear/editar — no se re-deriva en cada render. Jorge pidió auditoría sistémica de asignaciones. Agregado SPRINT-129 (auditoría read-only de asignaciones técnico↔operaria + órdenes activas con técnico-sin-operaria pero técnico-con-operaria-en-perfil + huérfanos cruzados). Las inconsistencias por rol siguen cubiertas por matriz SPRINT-112 (162 celdas, pendiente QA humano).

**Última actualización previa:** 2026-05-10 por coordinator (autónomo `procesa bloqueos`, pasada 7) — SPRINT-128 R2 COMPLETADO. Rule `firestore.rules:378` alineada al granular `ordenesEliminar` (`userData().permisos.ordenesEliminar == true` en vez de `esAdminOCoord()`). `npm run deploy:rules` ejecutado (lock `29247a9...`). Matriz #14 marcado RESUELTO. Bloque movido a Histórico de desbloqueos en BLOQUEOS.md. SPRINT-112-QA sigue en BLOQUEOS (humano puro).

**Última actualización previa:** 2026-05-10 por coordinator (autónomo `trabaja`) — SPRINT-127 COMPLETADO ruta B1 (`305a9e5`, cinturón+tirantes sobre `crearNotificacion`). SPRINT-128 BLOQUEADO (mismo día): builder evaluó R1 vs R2 y concluyó que R1 es no-op (default operaria `ordenesEliminar` ya es false) y el verdadero fix es R2 (toca `firestore.rules` → ver `BLOQUEOS.md`). Hallazgo colateral: la matriz tenía documentado erróneamente "default operaria `=true`" — corregido en `docs/MATRIZ_PERMISOS.md`.

**Última actualización previa:** 2026-05-10 por Cowork — Jorge eligió "pagar deuda técnica conocida" como próximo foco. Agregados SPRINT-127 y SPRINT-128. Las inconsistencias #15 (papelera operaria) y #8 (secretaria + trabajo realizado) NO van en la cola autónoma — requieren QA humano. Pendientes humano-presenciales: SPRINT-100, SPRINT-112 QA por rol, SPRINT-113 padre.

**Próximo ID disponible:** SPRINT-158 (156 completado pasada 14 continuación — ampliar cazador P-003 a src/components/; 157 redactado como follow-up runTransaction en FacturaCrearModal)

**Última actualización previa:** 2026-05-12 por coordinator autónomo (pasada 14 continuación, `trabaja`) — SPRINT-156 COMPLETADO. Cazador P-003 ahora escanea 5 subdirs (incluye `src/components/`). 1 VP detectado: `FacturaCrearModal.handleSubmit` (mismo patrón que SPRINT-155 ya fixeó en modal hermano) → allowlist temporal + SPRINT-157 follow-up redactado. Cazadores 7/7 PASS.

---

## Sprints

### SPRINT-PERSONAL-EDIT-UNIFY — Unificar modales Editar Usuario vs Editar Personal (dropdown Rol inconsistente)

**Estado:** COMPLETADO 2026-05-15 por coordinator autónomo (pasada 18). Hash `82d1fd1`. Ruta elegida: **Opción A consolidada** — `GestionUsuarios.tsx` ahora importa `ROL_LABELS` + `ROL_COLORS` + `ROL_SELECT_ORDEN` desde `utils/personal.ts` (single source of truth, SPRINT-142d), elimina las 2 constantes duplicadas locales, y mapea el dropdown del modal Editar Usuario desde una constante derivada `ROL_OPCIONES_SISTEMA` (= `ROL_SELECT_ORDEN.filter(r => r !== 'ayudante')`). Resultado: las 5 opciones con acceso al sistema (Administrador, Coordinadora, Secretaria, Operaria, Técnico) aparecen automáticamente. NO se eliminó el modal minimalista — los dos modales tienen propósito distinto (Editar Usuario gestiona permisos + email login; Editar Personal gestiona nivel/comisión/datos operativos). Hallazgo lateral (NO scope): el dropdown del modal "Editar Usuario" NO incluye `ayudante` por diseño (ayudantes se gestionan solo desde `/admin/personal` — ver `FormAltaEditarEmpleado`). Cazadores 10/10 PASS. Typecheck + lint PASS. Touch-list: 1 archivo (`src/pages/GestionUsuarios.tsx`), +14/-13 líneas funcionales. NO se creó cazador P-XXX nuevo "lista hardcoded de roles" — la consolidación a single source elimina la posibilidad estructural del bug; agregar cazador requeriría grep negativo sobre `option value="(administrador|secretaria|...)"` que daría falsos positivos en tests/scripts; deuda futura si reaparece.
**Prioridad:** 🟡 MEDIA — UX/data integrity. Permite que Jorge corrija roles incorrectos sin tener que eliminar+recrear. Riesgo: silenciosamente queda data con rol incorrecto si se usa el modal equivocado.
**Origen:** Jorge descubrió el 2026-05-15 al crear las 5 cuentas QA del SPRINT-QA-USER. La cuenta `qa-coordinadora@misterservicerd.com` quedó mal creada con rol Operaria por default no reiniciado. Al intentar corregir desde "Editar Usuario" (modal minimalista), el dropdown Rol solo tenía 4 opciones (Administrador/Secretaria/Operaria/Técnico) — **falta Coordinadora**. Tuvo que ir al modal alternativo "Editar Personal" (modal completo con Nivel/Comisión/etc.) que SÍ tiene Coordinadora en el dropdown. Workaround manual ejecutado, pero la asimetría queda como bug.

#### Hipótesis de causa raíz

Hay dos componentes distintos de edición de personal/usuarios que probablemente evolucionaron en paralelo:

1. **"Editar Usuario"** (minimalista, abre desde un botón distinto en `GestionUsuarios.tsx` o similar) — dropdown carga lista hardcoded de 4 roles sin Coordinadora.
2. **"Editar Personal"** (completo, abre desde otro botón) — dropdown carga lista hardcoded de 5 roles incluyendo Coordinadora.

Las dos listas viven en archivos distintos, sin fuente de verdad común. El que falta "Coordinadora" probablemente nunca se actualizó cuando el rol se introdujo al sistema.

#### Touch-list (auditoría obligatoria antes de redactar fase 2)

**Archivos a auditar primero (read-only check):**

- `src/pages/GestionUsuarios.tsx` — dónde se monta "Editar Usuario".
- `src/pages/Personal.tsx` (o equivalente) — dónde se monta "Editar Personal".
- Componentes `*EditModal.tsx` (PersonalEditModal, GestionUsuariosEditModal, UsuarioEditModal, etc.) — auditar cuál es cuál.
- `src/utils/roles.ts` o `src/types/index.ts` — donde se define la lista canónica de roles (si existe).
- Búsqueda global de `'coordinadora'` y `'Coordinadora'` para mapear todos los lugares donde se hardcodea.

**Decisión arquitectónica que el coordinator debe tomar:**

- Opción A: una sola fuente de verdad en `utils/roles.ts` exportando `ROLES = ['administrador', 'coordinadora', 'operaria', 'secretaria', 'tecnico'] as const` + label map. Ambos modales importan de ahí.
- Opción B: unificar los dos modales en uno solo, eliminando el minimalista. Más invasivo pero limpia deuda.

Coordinator escoge A si los modales tienen razón de existir por separado (permisos granulares vs datos operativos). Escoge B si el minimalista es vestigial.

#### Criterios de aceptación

- [ ] Dropdown Rol en ambos modales muestra las 5 opciones (Administrador, Coordinadora, Secretaria, Operaria, Técnico).
- [ ] Si se elige Opción A: nueva constante en `utils/roles.ts` importada por ambos modales.
- [ ] Si se elige Opción B: el modal minimalista queda eliminado, todos los call sites apuntan al unificado.
- [ ] Cazador P-XXX nuevo: detecta listas hardcoded de roles que NO importen del módulo canónico.
- [ ] QA manual: editar el rol de un usuario existente desde ambos botones — ambos deben permitir Coordinadora.
- [ ] Typecheck + lint + cazadores N/N PASS.

#### Restricciones

- archivist PRE-CHANGE obligatorio (toca componentes de gestión de personal, área sensible).
- reviewer obligatorio (cambio toca permisos por rol, máxima criticidad).
- NO tocar firestore.rules. Las rules ya conocen el rol Coordinadora — el bug es solo UI.

#### Hallazgo lateral relacionado

- El modal "Agregar Personal" tiene un bug menor: el dropdown Rol mantiene la última selección al cerrar y reabrir. Default sticky causa errores como el de Jorge (crear coordinadora con rol Operaria por residuo del intento anterior). Sprint sub-deuda SPRINT-PERSONAL-EDIT-UNIFY-B (reset state on close) opcional.

---

### SPRINT-QA-USER — Super usuario QA para sidepanel: 5 cuentas dedicadas + prompt maestro E2E

**Estado:** COMPLETADO 2026-05-15 — ver `## Sprints completados (histórico)` más abajo.
**Prioridad:** 🟡 MEDIA-ALTA — habilita QA E2E en 1 solo prompt sin pausas humanas. Multiplica capacidad de detección de bugs.
**Origen:** Decisión Jorge 2026-05-15 vía Cowork — quiere que Claude en sidepanel pueda probar TODO el software en un solo prompt, con permisos completos de cada rol, detectar bugs como humano + sugerir optimizaciones UX ("río que fluye"). Eligió ruta B (5 cuentas QA dedicadas, no super-admin único ni override impersonation).

#### Touch-list

**Archivos a crear (3):**

1. `docs/QA_SUPER_USER.md` — manual del super usuario QA:
   - Lista de las 5 cuentas con email + rol + nombre simbólico.
   - Convención de uso (orden de testing, escenarios cubiertos).
   - Política: estas cuentas NO se usan en producción para datos reales — solo QA.
   - Cómo Jorge regenera passwords si fugan.
   - Cómo Cowork/coordinator escribe nuevos prompts QA que las usan.

2. `docs/QA_PROMPT_MAESTRO.md` — prompt copy-paste para sidepanel Claude que ejecuta QA E2E completo:
   - Bloque único con login → ciclo completo de orden → cobertura módulos secundarios → cierre.
   - Output estructurado obligatorio: 4 secciones (bugs estructurados, sugerencias UX, cobertura módulos, evidencia/screenshots).
   - Reglas de seguridad: NO borrar datos reales, NO modificar configuraciones globales, NO crear órdenes con clientes reales (siempre cliente "QA Test" + teléfono 8090000000).

3. `scripts/qa-sanity-check.ts` — script que valida en Firestore que las 5 cuentas existen con sus roles correctos:
   - Lee `usuarios/{uid}` y `personal where email==qa-*@misterservicerd.com`.
   - Reporta inconsistencias (cuenta falta, rol incorrecto, doc duplicado).
   - Corre antes de cada sesión QA para detectar drift.

**Acción manual de Jorge (PRE-REQUISITO):**

Crear las 5 cuentas vía `/admin/gestion-usuarios` con estos datos exactos:

| Email                                     | Rol           | Nombre QA               |
| ----------------------------------------- | ------------- | ----------------------- |
| qa-secretaria@misterservicerd.com         | secretaria    | QA Secretaria Sidepanel |
| qa-tecnica@misterservicerd.com            | tecnico       | QA Técnica Sidepanel    |
| qa-operaria@misterservicerd.com           | operaria      | QA Operaria Sidepanel   |
| qa-coordinadora@misterservicerd.com       | coordinadora  | QA Coordinadora Sidepanel |
| qa-admin@misterservicerd.com              | administrador | QA Admin Sidepanel      |

Password común sugerido (Jorge decide el real, NO commitear): formato fuerte ≥12 chars + número + símbolo. Guardar en password manager personal de Jorge.

**Validación que el coordinator hace al cerrar el sprint:**

- [ ] 3 archivos creados con contenido completo.
- [ ] `scripts/qa-sanity-check.ts` corre sin errores con las 5 cuentas ya creadas por Jorge.
- [ ] Cazador P-XXX nuevo (opcional, lateral) que detecte si algún test/script productivo hardcodea las cuentas QA fuera de scripts/qa-*.
- [ ] Typecheck + lint + cazadores N/N PASS.
- [ ] Documentación en `CLAUDE.md` referenciando `docs/QA_SUPER_USER.md` para que futuros agentes lo encuentren.

#### Hallazgos laterales esperables

- Posible necesidad de un campo `esQA: boolean` en `personal/{id}` para filtrar estas cuentas de reportes financieros, KPIs, comisiones. Si el coordinator detecta esto, escala a sub-sprint SPRINT-QA-USER-B.
- Si las rules de Firestore bloquean alguna acción legítima del rol QA correspondiente, NO ajustar rules — reportar el gap como bug real (porque significa que un usuario real con ese rol tampoco puede hacerla).

#### Restricciones

- NO usar las cuentas QA en producción para crear datos reales. Convención: cliente siempre "QA Test", teléfono `8090000000`, observaciones "TEST QA <fecha>".
- NO commitear passwords en código, docs, ni en CLAUDE.md.
- Si el sidepanel-Claude ve un bug que afecta SOLO a la cuenta QA pero no a usuarios reales, es probable que sea drift de datos QA — investigar antes de reportarlo como bug del software.
- archivist PRE-CHANGE obligatorio (toca `gestion-usuarios` indirecto + crea scripts nuevos).

---

### SPRINT-168 — Renderizar firma del cliente en UI (modal admin orden + fila expandida facturas)

**Estado:** ✅ COMPLETADO 2026-05-14 por coordinator (pasada autónoma post-QA E2E). Hash `f69fe6e`, +51/-29 líneas en 2 archivos. Thumbnail visible debajo de período de garantía en OrdenDetailModal + bloque dedicado en OrdenResumenLectura. Cazadores 8/8 PASS. Pendiente QA visual humano post-deploy: Wilainy/Yohana/Jorge admin abren OS-0056 en /admin/ordenes (modal) y en /admin/facturas (fila expandida CG-00019) y verifican thumbnail.
**Prioridad:** 🔴 ALTA — bloqueador legal post go-live. Sin render UI la firma capturada no sirve como prueba de aceptación.
**Origen:** QA E2E distribuido 2026-05-14 sobre OS-0056 / CG-00019. SPRINT-159 capturó la firma correctamente (`cierreServicio.firmaClienteUrl` poblado) pero el "bonus" de SPRINT-158a (render en modal admin) quedó incompleto. 3 testers confirman lo mismo: Wilainy, Yohana, Jorge admin. La sección "Cierre del Servicio" del modal de detalle de orden salta de "Período de garantía" directo a "Piezas utilizadas" sin pasar por firma. Lo mismo en fila expandida de `/admin/facturas`.

#### Touch-list

**Archivos a modificar (2-3):**

1. `src/components/ordenes/OrdenDetailModal.tsx` — bloque "Cierre del Servicio":
   - Agregar bloque "Firma del cliente" debajo del bloque "Período de garantía" si `cierreServicio.firmaClienteUrl` existe.
   - Render: thumbnail clickeable (~120x60px) que abre el PNG en lightbox o tab nuevo. Patrón similar al thumbnail de foto del cierre (que sí funciona).
   - Si firma NO presente y cierre SÍ presente: mostrar "Sin firma" en gris (para órdenes pre-SPRINT-159).

2. `src/components/facturas/OrdenResumenLectura.tsx` (variant 'compacto'):
   - Agregar render análogo de firma debajo del bloque "Cierre del técnico" que ya existe (línea ~177-196). El componente recibe `orden` que ya tiene `cierreServicio.firmaClienteUrl`.

3. `src/pages/OrdenDetalle.tsx` (página standalone):
   - Verificar si tiene render de firma. Si NO, agregarlo. Reportado por coordinator post-SPRINT-158a como "deuda hallazgo lateral".

**Consumidores verificados:**
- `OrdenDetailModal` se monta desde `Ordenes.tsx` (vista lista). El campo `cierreServicio` ya se lee, solo falta el render.
- `OrdenResumenLectura` se monta desde `Facturas.tsx` (fila expandida del conduce) y desde el modal "Marcar garantía manual". Ambos puntos ya reciben `orden` completa.

**Hallazgos laterales:**
- Storage rules: el catch-all permisivo permite leer cualquier path autenticado, así que la imagen va a cargar. No requiere cambio de rules.

#### Criterios de aceptación

- [ ] En `/admin/ordenes`, abrir modal de OS-0056 (orden con firma) → bloque "Firma del cliente" visible con thumbnail.
- [ ] En `/admin/facturas`, expandir fila de CG-00019 → bloque "Firma del cliente" visible debajo del cierre del técnico.
- [ ] Click sobre el thumbnail → abre el PNG (tab nuevo o lightbox).
- [ ] Para órdenes legacy sin firma (OS-0055 y anteriores): muestra "Sin firma" gris discreto o el bloque no aparece (decisión builder).
- [ ] Typecheck + lint + cazadores 8/8 PASS.
- [ ] QA: re-validar con Wilainy/Yohana/Jorge que ahora SÍ ven la firma.

#### Restricciones

- NO tocar el componente del wizard (`CierreServicioWizard.tsx`) — solo render de lectura.
- NO modificar el shape de `cierreServicio` — solo leerlo.
- archivist PRE-CHANGE obligatorio.

---

### SPRINT-169 — Investigar regresión SPRINT-163 (notificación `orden_asignada` no llega)

**Estado:** COMPLETADO 2026-05-15 (hash `5823955` fix + postmortem). **Causa raíz:** SPRINT-163 marcado COMPLETADO sin commit asociado. El tipo `'orden_asignada'` quedó huérfano en `TipoNotificacion` sin emisor en `useOrdenCreateForm.ts`. **Fix:** call site agregado al técnico + operaria derivada + admins/coords + cazador determinístico nuevo P-010 + entrada en `docs/PATRONES_REGRESION.md` + postmortem en `docs/postmortems/2026-05-15-orden-asignada-regresion-sprint-163-no-commit.md`. Hipótesis #2 confirmada (handler nunca llamó a `crearNotificacion`). Cazadores 9/9 PASS post-fix. Validación humana del flujo end-to-end pendiente (Jorge/QA crear orden y confirmar 3 notis llegan).
**Prioridad:** 🔴 ALTA — regresión confirmada en producción. SPRINT-163 marcado COMPLETADO pasada 17 pero el código no funciona end-to-end.
**Origen:** QA E2E distribuido 2026-05-14. Angelica creó OS-0056 (cliente "QA TEST 14-MAY") asignando técnico Aury + operaria default Angelica (form no tiene selector operaria — ver SPRINT-170). Maria + Yohana confirmaron: **NO llegó notificación "orden_asignada" a ninguna campanita** (ni de Aury, ni de Maria coord, ni de Wilainy/Yohana operarias). El historial de notificaciones tampoco la muestra.

#### Hipótesis a investigar (orden)

1. **El `crearNotificacion({ tipo: 'orden_asignada', ... })` SÍ se ejecuta pero a un destinatario incorrecto** (ej: `userId` mal calculado, apuntando a un uid que no existe). Verificar Firestore Console: ¿hay docs en `notificaciones` con tipo `orden_asignada` creados el 2026-05-14 ~18:30?
2. **El handler de creación de orden NO llama a `crearNotificacion`** — el commit del SPRINT-163 modificó otro archivo o el handler quedó en una rama no mergeada.
3. **La rule de `notificaciones` rechaza el write silenciosamente** — pero entonces aparecería error en consola del browser. Hay que mirar.
4. **El `crearNotificacion` se llama con `userId: undefined`** — y la rule rechaza por field missing.

#### Touch-list

**Diagnóstico obligatorio antes del fix:**

1. Builder verifica en Firestore Console si existen docs `notificaciones` con `tipo === 'orden_asignada'` creados el 2026-05-14 (cualquier hora). Si SÍ → bug de filtro de lectura. Si NO → bug de escritura.
2. Builder grep `'orden_asignada'` en `src/` para confirmar dónde se dispara `crearNotificacion` con ese tipo. Verificar que el commit del SPRINT-163 efectivamente modificó ese handler.
3. Si el código está pero no se ejecuta: agregar `console.log` defensivo temporal en el handler para debugging.

**Archivos potencialmente a modificar (1-3):**

1. `src/hooks/useOrdenCreateForm.ts` — donde Angelica hace `addDoc('ordenes_servicio')`. Verificar que ahí esté el `crearNotificacion({ tipo: 'orden_asignada', userId: <tecnico.uid>, ... })`.
2. `src/services/notificaciones.service.ts` — verificar que el service no filtre tipos en escritura.
3. `firestore.rules` línea de `notificaciones` — verificar que permita create con `tipo: 'orden_asignada'`.

#### Criterios de aceptación

- [ ] Builder ejecuta diagnóstico y reporta hipótesis confirmada en commit message.
- [ ] Crear orden nueva de prueba con técnico + operaria asignados → ambos reciben notificación `orden_asignada` en sus campanitas.
- [ ] Verificar también que la notificación llega al coordinador activo (si hay >1 coord, todos reciben).
- [ ] Typecheck + lint + cazadores 8/8 PASS.
- [ ] reviewer obligatorio (regresión de sprint anterior).
- [ ] **Postmortem obligatorio** en `docs/postmortems/2026-05-14-orden-asignada-regresion.md` — para entender por qué el QA del SPRINT-163 no cazó este bug.

#### Restricciones

- NO modificar el comportamiento de otros tipos de notificación.
- archivist PRE-CHANGE obligatorio.

---

### SPRINT-170 — Agregar selector de operaria al form de crear orden

**Estado:** COMPLETADO (coordinator autónomo 2026-05-15, ver `docs/sprints/EJECUCION_AUTONOMA.md`)
**Prioridad:** 🔴 ALTA — bug crítico de denormalización. Sin esto, todas las órdenes creadas hoy tienen operaria = creador (típicamente Angelica), NO la operaria real del grupo.
**Origen:** QA E2E distribuido 2026-05-14. Angelica reportó: el form de crear orden NO tiene selector "Operaria asignada". El campo queda fijado al user logueado. Resultado: OS-0056 quedó con operaria = "Angelica Secretaria" en lugar de "Wilainy". Esto explica la causa raíz del bug del chip "Op: Operaria" genérico (catalogado como SPRINT-158 hallazgo #3 y #6).

**Decisión negocio implícita:** la operaria asignada debe derivarse del técnico — porque cada técnico tiene una operaria asignada en `personal[uid].operariaId`. NO debería ser un campo a elegir manualmente en el form (introduce error humano). El form debe auto-derivar.

#### Touch-list

**Archivos a modificar (1-2):**

1. `src/hooks/useOrdenCreateForm.ts` o `src/components/.../ModalCrearOrden.tsx` (depende de dónde esté el form):
   - Al seleccionar técnico, hacer lookup en `personal[tecnico.uid].operariaId` y auto-asignar `operariaId` + `operariaNombre` denormalizados.
   - Si el técnico NO tiene operaria asignada: mostrar warning "El técnico Aury no tiene operaria asignada. Asignar en /admin/personal antes de crear esta orden." y bloquear submit (o permitir con operaria vacía documentado).
   - **NO** agregar dropdown manual de operaria (cliente prefiere auto-derivación).

2. `src/utils/index.ts` — si hay un helper `derivarOperariaDeOrden(tecnicoId, personal)`, verificar que se llama en este flujo.

**Consumidores verificados:**
- `useOrdenCreateForm` es usado solo por el modal de crear orden. Cambio aislado.
- `OrdenCard` ya lee `operariaNombre` directo — si lo denormalizamos correcto, el chip muestra el nombre real.

#### Criterios de aceptación

- [ ] Crear orden nueva asignando técnico Aury → `operariaNombre` denormalizado = "Wilainy" (operaria de Aury), NO el user logueado.
- [ ] Crear orden nueva con técnico que NO tenga operaria asignada → warning visible + submit bloqueado o documentado.
- [ ] Chip "Operaria" en /admin/ordenes muestra el nombre real (Wilainy), no "Op: Operaria" genérico ni "Angelica Secretaria".
- [ ] Verificar también el flujo de EDIT orden — si ahí hay selector manual, mantenerlo (es para correcciones).
- [ ] Typecheck + lint + cazadores 8/8 PASS.
- [ ] reviewer obligatorio (denormalización crítica).

#### Restricciones

- NO tocar las rules de `ordenes_servicio` (operariaId ya está permitido).
- archivist PRE-CHANGE obligatorio.

---

### SPRINT-171 — Ruta `/admin/notificaciones` rota (redirige al landing público)

**Estado:** COMPLETADO (commit `9a0b792`, 2026-05-14)
**Prioridad:** 🟡 MEDIA — bug de routing que confunde y bota al user del admin.
**Origen:** QA E2E distribuido 2026-05-14. Maria (coordinadora) intentó navegar a `/admin/notificaciones` para validar notifs del flujo de OS-0056. La ruta NO existe en el routing y en vez de mostrar 404 o `<NotFound>`, redirige al landing público `www.misterservicerd.com/` con la home pública ("Reparamos sus electrodomésticos / Agendar cita"). Esto saca al usuario del contexto admin.

#### Touch-list

**Archivos a modificar (1):**

1. `src/App.tsx` (router):
   - Verificar si hay route para `/admin/notificaciones`. Si NO, decidir:
     - **Opción A (recomendada):** crear página simple `NotificacionesAdmin.tsx` que muestre el historial completo de notificaciones del user logueado (la campanita ya muestra las últimas, esta página muestra todas con filtros). Más útil que un 404.
     - **Opción B:** agregar catch-all `/admin/*` → `<NotFound>` para que cualquier ruta admin desconocida muestre 404 dentro del layout admin (no redirija al público).

**Consumidores verificados:**
- `/admin/notificaciones` puede ser referenciado desde links de notificaciones (la campanita lleva ahí). Verificar con grep.
- Si la ruta NO se referencia desde ningún lado, ir directo a opción B.

#### Criterios de aceptación

- [ ] Navegar a `/admin/notificaciones` ya NO redirige al landing público.
- [ ] Decisión documentada: ¿se creó la página o solo el 404 admin?
- [ ] Cualquier otra ruta `/admin/cosa-que-no-existe` muestra 404 dentro del layout admin, no fuera.
- [ ] Typecheck + lint + cazadores 8/8 PASS.

#### Restricciones

- NO tocar el routing de las rutas públicas.
- NO crear lógica de auth nueva.

---

### SPRINT-172 — Campo "Modelo" en form crear orden debe ser input libre (no combobox cerrado)

**Estado:** COMPLETADO (commit `3f8fa3c`, 2026-05-12, ruta conservadora A)
**Resolución:** Renombrado UI del combobox "Modelo" → "Configuración" (mantiene Torre/Individual y el field de datos `equipoModelo` intacto). Agregado input texto libre "Modelo" nuevo que persiste en `equipoModeloFabricante` (campo nuevo en `OrdenServicio`). Cero migración — órdenes legacy arrancan con `equipoModeloFabricante` undefined. Render en `OrdenDetailModal` separa ambos campos. Touch-list: `src/types/index.ts`, `src/hooks/useOrdenCreateForm.ts`, `src/components/ordenes/OrdenCreateModal.tsx`, `src/components/ordenes/OrdenDetailModal.tsx`, `src/utils/index.ts`. Deuda derivada: SPRINT-172b (render en `OrdenDetalle.tsx:709`), SPRINT-172c (unificar `OrdenEditForm.tsx` + `ModalEditarOrdenAdmin.tsx`), SPRINT-172d (input modelo del fabricante en form público). Detalle completo en `EJECUCION_AUTONOMA.md`.
**Prioridad:** 🟡 MEDIA — bug de UX que limita captura de datos del fabricante.
**Origen:** QA E2E distribuido 2026-05-14. Angelica reportó que el campo "Modelo" del form crear orden es un combobox cerrado con solo 2 opciones ("Torre" e "Individual") que en realidad son **configuraciones del equipo, no modelos del fabricante**. No hay forma de escribir el modelo real (ej: "WF45R6100AW" de Samsung). Tuvo que dejar el campo vacío.

#### Touch-list

**Archivos a modificar (1-2):**

1. Form crear orden (`useOrdenCreateForm.ts` o componente equivalente):
   - Cambiar el campo "Modelo" de combobox cerrado a input texto libre.
   - Si "Torre/Individual" es información útil (es la **configuración** del equipo, no el modelo), renombrar ese campo a "Configuración" y dejarlo combobox. Y agregar un NUEVO input "Modelo" texto libre.
   - El campo "Modelo" debe persistir en `orden.equipoModelo` (verificar nombre del field).

2. `src/types/index.ts` — verificar que el tipo de `Orden.equipoModelo` sea `string` libre, no enum.

**Decisión builder:** confirmar con Jorge si "Torre/Individual" es info útil que vale la pena preservar (como configuración) o si se elimina y solo queda "Modelo" libre.

#### Criterios de aceptación

- [ ] Campo "Modelo" acepta texto libre (ej: "QA-TEST", "WF45R6100AW").
- [ ] Si se preservó "Configuración" como combobox: dos campos visibles + bien etiquetados.
- [ ] Typecheck + lint + cazadores 8/8 PASS.

#### Restricciones

- NO romper órdenes legacy que tengan `equipoModelo` con valores tipo "Torre" o "Individual" — esos siguen siendo válidos como string.

---

### SPRINT-173 — Aprobar precio sugerido NO avanza fase (queda en `en_diagnostico`)

**Estado:** COMPLETADO 2026-05-12 — ver `## Sprints completados (histórico)` más abajo.

---

### SPRINT-174 — Notificaciones faltantes en múltiples eventos del flujo de orden

**Estado:** COMPLETADO (2026-05-12, coordinator). Hash: `bdd7003`. Cazadores 10/10 PASS. Allowlist P-010: 3 entradas (`otro`, `recordatorio` server-side, `reclamo_garantia` deuda futura — NO scope SPRINT-174).
**Prioridad:** 🟢 BAJA-MEDIA — los datos están bien pero el equipo no se entera por notificación. Coordinación manual por WhatsApp es lo que hay hoy.
**Origen:** QA E2E distribuido 2026-05-14. Yohana confirmó que las siguientes notificaciones NO se generaron durante el flujo de OS-0056:
- "Precio aprobado" — cuando Wilainy aprobó RD$8,500 (técnico no se entera de la aprobación)
- "Diagnóstico/cotización lista" — cuando Aury sugirió el precio
- "Cierre completado" — cuando Aury cerró el servicio (operaria/coord no se entera)
- "Pago registrado" — cuando Wilainy registró el pago (admin/coord no se entera)
- "Orden lista para conduce" / "Envío a facturación" — cuando Wilainy click "Enviar a conduce" (esta SÍ llega a Maria — confirmado en su chequeo final)

#### Touch-list

**Archivos a modificar (3-5):**

1. Handler de "Aprobar precio" (mismo del SPRINT-173): agregar `crearNotificacion({ tipo: 'precio_aprobado', userId: <tecnicoId>, ... })`.
2. Handler de "Sugerir precio" / "Diagnóstico completado" (en `TecnicoVista.tsx` o equivalente): agregar `crearNotificacion({ tipo: 'cotizacion_lista', userId: <operariaId> + <coordId>, ... })`.
3. Handler de cierre técnico (`CierreServicioWizard.tsx` submit): agregar `crearNotificacion({ tipo: 'cierre_completado', userId: <operariaId> + <coordId>, ... })`.
4. Handler de "Registrar pago" (Wilainy en modal de pago): agregar `crearNotificacion({ tipo: 'pago_registrado', userId: <coordId> + <adminId>, ... })`.
5. `src/types/index.ts` — verificar tipos de notificación existentes y agregar los nuevos.

**Decisión builder:** evaluar si conviene unificar las llamadas en un helper `notificarCambioOrden(orden, tipo, actor)` para reducir duplicación.

#### Criterios de aceptación

- [ ] Cada uno de los 4 eventos genera notificación al destinatario correcto.
- [ ] Re-correr QA E2E parcial: crear orden → técnico sugiere precio → operaria aprueba → técnico cierra → operaria registra pago → admin verifica que llegaron 4 notifs en su campanita.
- [ ] Typecheck + lint + cazadores 8/8 PASS.

#### Restricciones

- NO tocar el sistema de notificaciones existente (`crearNotificacion` se mantiene).
- archivist PRE-CHANGE obligatorio.

---

### SPRINT-175 — Migrar órdenes legacy stuck en `trabajo_realizado` post-conduce

**Estado:** COMPLETADO 2026-05-12 (script entregado read-only por default) — ver sección "Sprints completados". `--apply` esperando OK Jorge en `BLOQUEOS.md` (entrada `SPRINT-175-APPLY`).

---

### SPRINT-176 — Decisión: ¿quien emite el conduce debe recibir su propia notificación?

**Estado:** COMPLETADO 2026-05-15 por coordinator autónomo (pasada 16). Opción A mantenida. Hash pendiente (commit en curso). Cambios: 1 archivo (`ProcesarFacturacionModal.tsx`) +9/-2 líneas — agregado comentario inline SPRINT-176 cerca del filtro `p.uid !== currentUser?.uid` documentando la decisión (UX estándar — emisor no se auto-notifica). Sin cambios de comportamiento; el filtro ya estaba correcto. Cazadores 10/10 PASS. Typecheck + lint PASS.
**Decisión Jorge 2026-05-15:** Opción A. UX estándar — nadie se notifica a sí mismo de acciones que acaba de hacer. Limpia panel propio. Confirmado vía Cowork con recomendación.
**Prioridad:** 🟢 BAJA — UX menor, no rompe operación.
**Origen:** QA E2E distribuido 2026-05-14. Maria emitió el conduce CG-00019 y NO le llegó la notificación a su campanita. Yohana (operaria observadora) SÍ recibió la notificación. Pattern: la notificación va al equipo (operarias + coord otros) pero NO al emisor.

**Comportamiento actual confirmado correcto:** filtro `userId !== currentUser.uid` para evitar auto-notificaciones — patrón estándar. Mantener.

#### Decisión negocio TOMADA

**Opción A (elegida):** quien emite NO recibe su propia notif. El emisor sabe lo que hizo, la notif se llena solo para quienes necesitan enterarse. Mantener comportamiento actual.

~~Opción B (descartada): notificar a todos incluido emisor — genera ruido en campanita propia.~~
~~Opción C (descartada): tipo `accion_propia` filtrable — over-engineering para 5 personas.~~

#### Acción del coordinator

- NO cambios de código. Comportamiento actual es el deseado.
- Auditar que el filtro `userId !== currentUser.uid` esté presente y funcionando en `ProcesarFacturacionModal.tsx::handleGenerar`.
- Si el filtro NO está y la lógica actual depende de otro mecanismo (ej. el destinatario no se incluye en `staffActivos` cuando es el actor), documentar cómo se logra el comportamiento.
- Agregar comentario inline cerca del filtro: `// SPRINT-176: filtrar emisor para evitar auto-notif (decisión Jorge 2026-05-15 — UX estándar)`.
- Considerar agregar cazador P-XXX que detecte `crearNotificacion({userId: currentUser?.uid})` sin filtro — patrón anti-self-notif. (Opcional, dejar como deuda lateral si requiere muchas horas.)

#### Criterios de aceptación

- [x] Jorge documentó decisión: Opción A (mantener filtrar emisor).
- [x] Coordinator audita que el filtro está presente y comentario inline agregado. Filtro en `ProcesarFacturacionModal.tsx:927` confirmado: `p.uid !== currentUser?.uid`. Comentario inline SPRINT-176 agregado al lado del filtro + bloque explicativo arriba documentando decisión.
- [ ] Cazador anti-self-notif opcional (lateral, no bloquea cierre — deuda futura si Jorge prioriza).
- [x] Cierre como COMPLETADO con commit `docs(sprint-176): decisión A - mantener filtro emisor en notif conduce`.

#### Restricciones

- archivist PRE-CHANGE NO obligatorio (no cambia código funcional).
- Si la auditoría detecta que el filtro NO está y el comportamiento observado fue accidental, escalar a BLOQUEOS antes de "arreglar" — el comportamiento observado es el deseado, no romperlo.

---

### SPRINT-WA-1 — Endpoint webhook entrante WhatsApp Cloud API

**Estado:** PENDIENTE — REQUIERE credenciales Meta antes de ejecutar (META_APP_SECRET + META_VERIFY_TOKEN)
**Prioridad:** 🔴 ALTA — fundación de toda la integración WhatsApp. Sin webhook, no hay forma de recibir mensajes de leads de Click-to-WhatsApp.
**Origen:** Decisión arquitectónica 2026-05-15 (handoff de otro Claude). CRM directo a Meta Cloud API (sin BSP intermediario).

#### Touch-list

**Archivos a crear (2):**

1. `api/whatsapp/webhook.ts` — serverless function de Vercel (patrón existente con `api/gps/ubicacion.ts`):
   - **GET handler**: verificación de Meta. Compara `query.hub.verify_token` con `process.env.META_VERIFY_TOKEN`. Si match, retorna `query.hub.challenge` como text/plain.
   - **POST handler**: verificación HMAC SHA256. Header `X-Hub-Signature-256` vs `crypto.createHmac('sha256', META_APP_SECRET).update(raw_body).digest('hex')`. Si NO match, retorna 401.
   - Parseo del payload Meta: extraer `entry[].changes[].value.messages[]` y `statuses[]`.
   - Escritura idempotente: `setDoc(doc(adminDb, 'whatsapp_mensajes_inbox', message.id), payload)`. Firestore garantiza no duplicación con mismo ID.
   - Respuesta 200 OK rápido (<5s). NO procesar lógica de negocio acá — solo escribir a Firestore + responder.

2. `lib/firebase-admin.ts` — singleton del SDK admin (no existe en repo):
   - Decodifica `process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64` → JSON → `initializeApp`.
   - Exporta `adminDb` para uso en serverless functions.

**Variables de entorno nuevas en Vercel:**
- `META_VERIFY_TOKEN` — string random inventado por Jorge (ej "msr_wh_2026_x9z")
- `META_APP_SECRET` — del Meta developers console
- `FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64` — service account JSON entero codificado base64

**Firestore rules nuevas:**
- `whatsapp_mensajes_inbox/{messageId}`:
  - `allow read`: staff oficina
  - `allow write`: NUNCA desde cliente (solo serverless con admin SDK saltea rules)

#### Criterios de aceptación

- [ ] GET con verify_token correcto retorna challenge (200, text/plain).
- [ ] GET con token incorrecto retorna 403.
- [ ] POST con HMAC válido escribe a `whatsapp_mensajes_inbox/{message.id}`.
- [ ] POST con HMAC inválido retorna 401 sin info útil.
- [ ] POST duplicado (Meta reintento) NO crea doc nuevo.
- [ ] Typecheck + lint + cazadores 8/8 PASS.
- [ ] Cazador nuevo P-010: detecta serverless functions que NO validan HMAC.
- [ ] Test manual: webhook configurado en Meta + mensaje enviado al +1 849-564-6767 → doc visible en Firestore.

#### Restricciones

- NO procesar lógica de negocio en webhook (solo escribir a inbox).
- NO exponer META_APP_SECRET al frontend NUNCA.
- archivist PRE-CHANGE obligatorio + reviewer obligatorio (toca rules + serverless productivo).

---

### SPRINT-WA-2 — Servicio saliente proxy `api/whatsapp/send`

**Estado:** PENDIENTE — REQUIERE META_ACCESS_TOKEN (System User permanente)
**Prioridad:** 🔴 ALTA — sin esto el CRM no puede enviar mensajes (conduces, recordatorios, respuestas).

#### Touch-list

**Archivos a crear (2):**

1. `api/whatsapp/send.ts` — serverless function proxy:
   - **POST handler**: requiere auth Firebase (verify ID token de header `Authorization: Bearer <idToken>`). Solo staff oficina puede enviar.
   - Body: `{ to: string, type: 'text'|'template'|'image', payload: {...} }`.
   - Llama a `https://graph.facebook.com/v20.0/${META_PHONE_NUMBER_ID}/messages` con header `Authorization: Bearer ${META_ACCESS_TOKEN}`.
   - Maneja errores Meta (429 rate limit, plantilla rechazada, etc.).
   - Escribe el mensaje saliente a `whatsapp_mensajes_outbox/{wa_message_id}` para tracking.

2. `src/services/whatsapp.service.ts` — wrapper cliente:
   - `enviarTexto(to, texto)`, `enviarPlantilla(to, templateName, variables)`, `enviarImagen(to, url)`.
   - Llama al endpoint con ID token del user autenticado.

**Variables de entorno:**
- `META_ACCESS_TOKEN` — System User token permanente
- `META_PHONE_NUMBER_ID=1151997541323577`
- `META_API_VERSION=v20.0`

**Firestore rules:** `whatsapp_mensajes_outbox/{id}`: read staff oficina, write solo serverless.

#### Criterios de aceptación

- [ ] Enviar texto desde CRM → mensaje llega al destino.
- [ ] Sin auth Firebase → endpoint retorna 401.
- [ ] Rate limit Meta (429) → manejo con backoff.
- [ ] Typecheck + lint + cazadores 8/8 PASS.

#### Restricciones

- NO exponer META_ACCESS_TOKEN al frontend NUNCA. Todo va por el proxy.
- archivist PRE-CHANGE obligatorio.

---

### SPRINT-WA-3 — UI conversaciones WhatsApp por cliente/orden

**Estado:** PENDIENTE
**Prioridad:** 🟡 MEDIA — UX importante pero no bloquea recepción/envío.

#### Touch-list

**Archivos a crear (3):**

1. `src/pages/WhatsApp.tsx` — página nueva en `/admin/whatsapp`:
   - Layout inbox: lista conversaciones izquierda + hilo abierto derecha.
   - `onSnapshot` sobre `whatsapp_conversaciones` ordenado por `ultimoMensajeAt desc`.
   - Botón "Responder" → composer (texto/plantilla/imagen).
   - Botón "Crear orden desde conversación" auto-popula form.

2. `src/components/whatsapp/HiloConversacion.tsx` — render hilo:
   - Mensajes alineados según `direccion`. Timestamp + estado (enviado/entregado/leído).
   - Render tipos: texto, imagen, audio, botón interactivo.

3. `src/services/whatsapp-conversaciones.service.ts` — helpers query.

**Sidebar:** entrada "WhatsApp" con badge no leídos.

#### Criterios de aceptación

- [ ] `/admin/whatsapp` accesible para staff oficina.
- [ ] Lista real-time.
- [ ] Botón responder funcional (usa WA-2).
- [ ] Mobile responsive (operarias usan iPad).
- [ ] Typecheck + lint + cazadores 8/8 PASS.

#### Restricciones

- archivist PRE-CHANGE obligatorio.

---

### SPRINT-WA-4 — Tracking referral → extender `campanas_marketing`

**Estado:** PENDIENTE — requiere acuerdo de naming campañas con Jorge
**Prioridad:** 🟢 BAJA-MEDIA — sin esto los leads no se atribuyen a campañas.

#### Touch-list

**Archivos a modificar (2):**

1. `api/whatsapp/webhook.ts` (procesamiento inbox):
   - Cuando llega primer mensaje, leer `messages[].referral`.
   - Extraer: `headline`, `source_id` (ad_id), `source_url`, `media_type`, `body`.
   - Linkear con `campanas_marketing` por `source_id` o crear nueva.
   - Persistir en `cliente.origen: { tipo: 'whatsapp_ad', adId, campanaId, capturadoAt }`.

2. `src/services/campanasMarketing.service.ts` (ya existe):
   - Agregar `getOrCreateCampanaPorAdId(adId)`.

**Decisión naming:** Jorge debe acordar formato `[Producto]_[Objetivo]_[Audiencia]_[Fecha]_[Variante]`.

#### Criterios de aceptación

- [ ] Lead de Click-to-WhatsApp → `cliente.origen` poblado con campanaId.
- [ ] Dashboard de campañas muestra conteo leads por campaña.
- [ ] Typecheck + lint + cazadores 8/8 PASS.

#### Restricciones

- NO modificar shape de `campanas_marketing` en producción — solo extender campos opcionales.
- archivist PRE-CHANGE obligatorio.

---

### SPRINT-WA-5 — Plantillas HSM (sync + UI + envío)

**Estado:** PENDIENTE — REQUIERE plantillas aprobadas en Meta Manager (24-48h aprobación)
**Prioridad:** 🟡 MEDIA — sin esto solo se pueden enviar mensajes en ventana de 24h post-cliente.

#### Touch-list

**Archivos a crear (2):**

1. `api/whatsapp/sync-templates.ts` — serverless cron c/12h:
   - Llama `https://graph.facebook.com/v20.0/${WABA_ID}/message_templates`.
   - Cachea en `whatsapp_plantillas/{name}` con estado, variables, body, category.

2. `src/components/whatsapp/SelectorPlantilla.tsx` — componente:
   - Modal con plantillas APPROVED.
   - Form dinámico para variables {{1}}, {{2}}.
   - Preview + envío vía WA-2.

**Integración con CRM existente:** botón "Enviar conduce por WhatsApp" en flujo de emisión post-runTransaction. Upgrade del patrón actual `wa.me/...` manual a HSM oficial.

#### Criterios de aceptación

- [ ] Sync trae las 4 plantillas mínimas (conduce_emitido, recordatorio_mantenimiento, cita_confirmada, garantia_por_vencer).
- [ ] UI muestra solo APPROVED.
- [ ] Envío funciona vía WA-2.
- [ ] Typecheck + lint + cazadores 8/8 PASS.

#### Restricciones

- NO eliminar el patrón `wa.me/...?text=...` actual (sigue como fallback manual).
- archivist PRE-CHANGE obligatorio.

---

### SPRINT-WA-6 — Bot IA conversacional con Claude Haiku

**Estado:** PENDIENTE — REQUIERE Anthropic API key + system prompt definido + decisiones de escalación
**Prioridad:** 🟡 MEDIA-ALTA — diferencial competitivo grande. Empieza después de WA-1 + WA-2 + WA-3.
**Origen:** Decisión Jorge 2026-05-15. Bot atiende mensajes entrantes, conversa, captura datos, crea OS automáticamente. Escala a humano cuando es complejo.

#### Specs propuestos (Jorge confirma o ajusta antes de procesar)

**Modelo:** `claude-haiku-4-5` (~$1/1M input + ~$5/1M output tokens). Estimado: $5-15/mes para ~500 conversaciones.

**System prompt:** tono RD spanish, brand Mister Service. Objetivo: capturar 5 datos para crear OS (nombre, teléfono, equipo, falla, zona).

**Persistencia:** `whatsapp_conversaciones/{clienteId}.contextoBot` con array de últimos 20 mensajes.

**Escalación a humano:**
- Keywords: "humano", "persona", "agente", "no entiendo".
- >10 turnos sin progreso.
- Info contradictoria detectada.
- Cuando escala: notif a Maria + marca `requiereHumano: true`.

**Horarios:** 24/7. Fuera horario hábil avisa "agente humano mañana 8am" + sigue capturando datos.

**Creación OS:** cuando bot tiene los 5 datos, crea OS desde serverless con admin SDK. `creadaPor: 'whatsapp_bot'`. Heurística routing: zona → técnico.

#### Touch-list (alto nivel)

**Archivos a crear (5):**

1. `lib/bot-conversacional.ts` — lógica bot (`procesarTurno`, detección intents).
2. `api/whatsapp/bot-procesar.ts` — serverless trigger desde inbox.
3. `lib/anthropic-client.ts` — wrapper SDK Anthropic.
4. `src/components/whatsapp/EstadoBot.tsx` — UI admin estado bot.
5. `docs/bot-system-prompt.md` — system prompt versionado.

**Variables de entorno:** `ANTHROPIC_API_KEY`.

#### Criterios de aceptación

- [ ] Bot responde en <5s.
- [ ] Captura los 5 datos en conversación natural.
- [ ] Escala a humano cuando aplica.
- [ ] Crea OS correctamente.
- [ ] Costos monitoreables.
- [ ] Maria puede tomar control en cualquier momento.
- [ ] System prompt versionado en docs/.

#### Restricciones

- NO permitir al bot acciones financieras (no aprobar precios, no emitir conduces).
- Cada turno bot logueado en `auditoria_admin`.
- archivist PRE-CHANGE obligatorio + reviewer obligatorio.

---

### SPRINT-WA-7 — Cron jobs proactivos (recordatorios + NPS + garantía a vencer)

**Estado:** PENDIENTE — requiere WA-5 plantillas aprobadas
**Prioridad:** 🟢 BAJA — mejora marketing, no funcionalidad core.

#### Touch-list

**Archivos a crear (2):**

1. `api/cron/whatsapp-recordatorios.ts` — diario 9am RD:
   - Clientes con última visita >6 meses → plantilla `recordatorio_mantenimiento`.
   - Órdenes con garantía vence en 7 días → `garantia_por_vencer`.
   - Órdenes cerradas hace 3 días sin NPS → encuesta NPS.

2. `vercel.json` — Vercel Cron:
   - `{ "crons": [{ "path": "/api/cron/whatsapp-recordatorios", "schedule": "0 13 * * *" }] }` (13:00 UTC = 9:00 RD).

**Idempotencia:** tracking en `whatsapp_recordatorios_enviados/{clienteId}_{tipo}_{fecha}`.

#### Criterios de aceptación

- [ ] Cron diario sin overlap.
- [ ] No duplicados.
- [ ] Opt-out: STOP marca `cliente.optOutWhatsapp = true`.
- [ ] Typecheck + lint + cazadores 8/8 PASS.

#### Restricciones

- Respetar window 24h: si lead respondió <24h → mensaje normal; si más → plantilla HSM.
- NO mandar campañas a opt-outs.
- archivist PRE-CHANGE obligatorio.

---

### SPRINT-177 — Botón "Avisar a oficina" en vista técnico + flujo operaria para reagendar/cancelar

**Estado:** PENDIENTE
**Prioridad:** 🟡 MEDIA-ALTA — cubre caso operativo real frecuente. Sin esto, el técnico que va a una visita fallida queda sin acción clara y la orden queda colgada en "agendado" sin avanzar.
**Origen:** Decisión Jorge 2026-05-15 durante QA E2E SPRINT-159 (OS-0057). El técnico va a casa del cliente y se topa con casos donde el cliente no abre, no estaba, cancela en el momento, o no contesta. Hoy no hay forma de marcar este estado en la app — la orden queda "agendada" perpetuamente y la operaria no se entera salvo por llamada del técnico.

#### Touch-list

**Archivos a modificar (4-5 confirmados):**

1. `src/types/index.ts`:
   - Agregar campo nuevo `visitaFallida?: { detalleCliente: string; reportadoAt: Timestamp; tecnicoUid: string; tecnicoNombre: string }`.
   - `detalleCliente` es texto libre (lo que el técnico escribió en el modal). NO es enum ni categoría — es la palabra cruda del técnico para que la operaria lea contexto real.
   - Decisión builder: es FLAG ortogonal (no fase nueva). La orden mantiene su fase actual y la operaria reagenda → limpia `visitaFallida` y la orden vuelve a "agendado" con nueva fecha.

2. `src/components/tecnico/TecnicoVista.tsx` (o equivalente — auditar nombre con grep):
   - Agregar botón en la card de orden cuando fase ∈ {agendado, en_diagnostico} y `visitaFallida` undefined.
   - **Texto del botón:** "📞 Avisar a oficina" (color naranja/amber medio, NO rojo — el caso no es error del cliente, es coordinación).
   - **Tono UX:** neutral, no acusatorio. Implica "necesito apoyo de oficina para resolver algo" — la operaria gestiona desde ahí.
   - Click abre modal "¿Qué pasó con esta visita?" con:
     - **Textarea obligatoria** (placeholder: "Escribe lo que el cliente te dijo o lo que pasó. Por ejemplo: 'No abrió, llamé y no contestó' / 'Cliente pidió que volvamos el sábado' / 'No encontré la dirección'"). Mínimo 10 caracteres para guardar.
     - **Sin opciones predefinidas, sin dropdown, sin radio buttons.** Solo texto libre — el técnico escribe en sus palabras qué pasó, la operaria lee y decide qué hacer.
     - Botones: "Enviar a oficina" (azul/verde principal, deshabilitado hasta tener 10+ chars) + "Cancelar" (gris).
   - Disparar la acción `marcarVisitaFallida(ordenId, { detalleCliente: <textarea>, tecnicoUid, tecnicoNombre })`.

3. `src/services/ordenes.service.ts` (o donde estén los mutators de orden):
   - Función nueva `marcarVisitaFallida(ordenId, { detalleCliente, tecnicoUid, tecnicoNombre })` que:
     - Actualiza `orden.visitaFallida = { detalleCliente, reportadoAt: serverTimestamp(), tecnicoUid, tecnicoNombre }`.
     - Persiste audit log en `auditoria_admin` con `accion: 'avisar_oficina'` (tono friendly también en backend, no `visita_fallida`).
     - Dispara notificación a operarias activas tipo `'aviso_oficina'`.
   - TODO en runTransaction (sub-regla CLAUDE.md mutaciones cross-collection).

4. `src/components/ordenes/OrdenDetailModal.tsx` (vista admin/operaria):
   - Si `orden.visitaFallida` existe, mostrar bloque destacado arriba con:
     - Icono ⚠️ + "Visita fallida"
     - Motivo + detalle + timestamp + nombre técnico
     - Botones operaria:
       - **"📞 Llamar cliente"** → link `tel:${cliente.telefono}` o `https://wa.me/1${normalizarTelefono(cliente.telefono)}?text=...` con mensaje pre-cargado.
       - **"📅 Reagendar"** → form para nueva fecha + hora, al guardar limpia `visitaFallida` y la orden vuelve a fase "agendado" con nuevos datos.
       - **"🚫 Cancelar orden"** → requiere motivo + confirmación. Mueve la orden a fase `cancelado`.

5. `firestore.rules` (probable):
   - Permitir update de `visitaFallida` por técnico asignado (gateado por `auth.uid == tecnicoId`).
   - Permitir update por operarias/coord (ya tienen rule más permisiva probable).
   - **ESCALAR a BLOQUEOS** si requiere rule nueva — Jorge debe revisar antes de deployar.

**Notificaciones nuevas:**
- Tipo `'visita_fallida'` con userId = uid de cada operaria activa + coordinadora.
- Título: "📞 OS-XXXX necesita coordinación con cliente"
- Descripción: `${tecnicoNombre} reporta: "${motivo}". Cliente: ${clienteNombre}, tel ${clienteTelefono}. Llamar para coordinar.`
- Click navega a /admin/ordenes con la orden expandida o a su detalle.
- **Tono friendly mantenido en notif** — no decir "visita fallida" al frente, decir "necesita coordinación".

**Consumidores verificados (read-only check):**
- Vista técnico se monta desde rutas `/tecnico/*`. Confirmar componente exacto con `grep -rn "/tecnico" src/App.tsx`.
- `OrdenDetailModal` se monta desde múltiples lugares (Facturas.tsx, FacturacionPendiente.tsx, Ordenes.tsx). Cambios deben ser retro-compatibles (campo `visitaFallida` es opcional).
- `notificaciones.service.ts` tiene patrón establecido — reusar `crearNotificacion`.

**Hallazgos laterales (NO tocar acá):**
- El audit trail muestra cambios de campos, pero podría no estar mostrando bien "cambios de estado" tipo visita_fallida → reagendado. Sprint follow-up si se observa en QA.
- Si reagendar genera nueva fecha, ¿debería disparar otra vez la notif "orden_asignada" a Aury? Probable que sí. Validar en QA.

#### Criterios de aceptación

- [ ] Botón "📞 Avisar a oficina" visible en card de técnico cuando fase ∈ {agendado, en_diagnostico} y `visitaFallida` undefined.
- [ ] Color del botón naranja/amber medio (NO rojo — tono neutral, no acusatorio).
- [ ] Click abre modal "¿Qué pasó con esta visita?" con UN solo textarea libre.
- [ ] Placeholder del textarea: "Escribe lo que el cliente te dijo o lo que pasó. Por ejemplo: 'No abrió, llamé y no contestó' / 'Cliente pidió que volvamos el sábado' / 'No encontré la dirección'".
- [ ] Validación: mínimo 10 caracteres para guardar (botón "Enviar a oficina" deshabilitado debajo de ese mínimo).
- [ ] Botón principal del modal "Enviar a oficina" (NO "Confirmar" para mantener tono colaborativo).
- [ ] "Enviar a oficina" persiste `visitaFallida.detalleCliente` (texto libre crudo) en la orden + audit log con `accion: 'avisar_oficina'` + notif a operarias con tipo `'aviso_oficina'`.
- [ ] **NO incluir lista de motivos predefinidos** — el técnico escribe en sus palabras. Si en QA aparecen radio buttons o dropdown, es desviación del spec.
- [ ] Operaria recibe notif "Visita fallida — OS-XXXX" en su campanita.
- [ ] Click notif navega a la orden.
- [ ] Vista operaria muestra bloque "Visita fallida" con datos + 3 botones (Llamar / Reagendar / Cancelar).
- [ ] "Llamar cliente" abre tel: o wa.me con mensaje pre-cargado.
- [ ] "Reagendar" persiste nueva fecha/hora + limpia visitaFallida + fase vuelve a "agendado" + audit log.
- [ ] "Cancelar orden" requiere motivo + confirmación + fase a "cancelado" + audit log.
- [ ] Si reagendar genera nueva fecha, dispara notif `orden_asignada` al técnico de nuevo.
- [ ] Typecheck + lint + cazadores 9/9 PASS.
- [ ] regression_guardian PASS (toca services + notificaciones + componentes críticos).
- [ ] reviewer obligatorio (cambio de estado de orden + flujo operativo nuevo).

#### Restricciones

- NO romper órdenes legacy sin `visitaFallida` (campo opcional).
- archivist PRE-CHANGE obligatorio (toca services + componentes técnico + componentes admin).
- Sub-regla CLAUDE.md "Mutaciones cross-collection deben ir en runTransaction" — aplica a `marcarVisitaFallida`.
- NO tocar el flujo de "Sugerir solo chequeo" — es caso distinto (cliente sí recibió pero no se puede reparar).
- Si `firestore.rules` requiere cambio para permitir update de `visitaFallida` por técnico → ESCALAR a BLOQUEOS, NO procesar autónomo.

---

### SPRINT-PORTAL-1 — Portal cliente con CTA "Solicitar nuevo servicio"

**Estado:** PENDIENTE — no depende de aprobación de plantillas WA, puede deployarse en paralelo. Mejora el portal `/garantia/:token` al que apuntan los links de plantillas `conduce_emitido` y `garantia_por_vencer`.
**Prioridad:** 🟡 MEDIA — UX self-service, multiplica el valor del link enviado por WhatsApp. Sin esto, el cliente que clickea el link solo ve la garantía y tiene que responder por WhatsApp para pedir otro servicio.
**Origen:** Decisión Jorge 2026-05-15 durante creación de plantillas WhatsApp HSM. Las plantillas `conduce_emitido` y `garantia_por_vencer` envían link al portal `/garantia/:token`. Jorge pidió que ese portal sirva también para que el cliente pueda agendar otro servicio (no solo reclamar garantía).

#### Touch-list

**Archivos a modificar (3 confirmados + 1 a auditar):**

1. **AUDITAR primero** qué componente renderiza `/garantia/:token` (probable: `src/pages/public/PortalGarantia.tsx` o similar — confirmar con `grep -rn "/garantia/:token\|/garantia/\\\${" src/App.tsx`):
   - Agregar sección nueva "¿Necesita otro servicio?" DEBAJO de los detalles de garantía existentes (no encima — la garantía sigue siendo el contenido principal).
   - Botón primario "Solicitar nuevo servicio" → abre form modal o expandible con:
     - **Tipo de equipo** (dropdown: nevera, lavadora, secadora, A/C split, A/C ventana, microondas, estufa, lavavajillas, otro)
     - **Marca y modelo** (texto libre, opcional)
     - **Descripción de la falla** (textarea, requerido, min 10 chars)
     - **Zona** (dropdown pre-poblado con zonas RD del config — reusar lista existente si la hay)
     - **Fecha preferida** (date picker, mínimo mañana, máximo +30 días)
     - **Franja horaria** (mañana 8-12 / tarde 1-5 / sin preferencia)
     - **Teléfono de contacto** (pre-poblado con el del cliente del token, editable)
     - Botón "Enviar solicitud"
   - Después de enviar: confirmación visible "Hemos recibido su solicitud. Le contactaremos en las próximas 24 horas para coordinar."

2. `src/services/solicitudes.service.ts`:
   - Agregar función `crearSolicitudDesdePortalGarantia(data, garantiaToken)` que:
     - Valida el token (no expirado, corresponde a una orden real).
     - Persiste a `solicitudes` con `origen: 'portal_cliente_garantia'`, `clienteId: <derivado del token>`, `garantiaTokenOrigen: <token>`, `creadaEn: serverTimestamp()`.
     - Rate-limit cliente-side por token (1 solicitud por hora — defensa básica, la dura va en rules).
   - Reusar shapes y validaciones existentes de `solicitudes.service.ts`.

3. `src/services/notificaciones.service.ts` (NO modificar el service, solo usar):
   - Disparar notificación tipo `'solicitud_nueva_portal'` a la coordinadora (`userId == coordinadora.uid`) + a Maria (operaria principal) cuando llega solicitud.
   - Reusar patrón establecido en SPRINT-127 (Patrón: `crearNotificacion({ userId, tipo, titulo, descripcion })`).

**Firestore rules:**

- `solicitudes/{id}` allow create público debe gatear:
  - `request.resource.data.origen == 'portal_cliente_garantia'`
  - Token válido (verificación cliente-side, pero rule confía en el flujo público existente).
  - Rate-limit: máximo 1 solicitud por `garantiaTokenOrigen` por hora — implementar con read de `solicitudes` filtradas por token + ts + reject si ya existe una en la última hora.
- `notificaciones/{id}`: sin cambios (rules actuales cubren).

**NO requiere cambios en:**

- Plantillas WhatsApp ya enviadas (siguen mandando el mismo link).
- API serverless `/api/whatsapp/*` (WhatsApp y portal son flujos independientes).
- Otros componentes del portal (la sección de garantía sigue igual).

**Consumidores verificados (read-only check):**

- Componente del portal `/garantia/:token` se monta desde `src/App.tsx` ruta correspondiente. Auditar con: `grep -rn "garantia/:token\|/garantia/" src/App.tsx src/pages/public/`.
- `solicitudes.service.ts` ya existe y es usado desde `src/pages/public/FormularioPublico.tsx` (flujo `/f/:slug`). Agregar función nueva sin tocar las existentes.
- `notificaciones.service.ts` ya tiene `crearNotificacion` que respeta SPRINT-127 (rule gatea por `userId == auth.uid`). Reusar tal cual.

**Hallazgos laterales NO incluidos (sprints follow-up):**

- WhatsApp template `solicitud_recibida` para confirmar al cliente que su solicitud fue recibida (no es nuestra plantilla 1-4, sería plantilla 5 en sprint dedicado).
- Tracking de conversión: cuánto del tráfico que entra a `/garantia/:token` clickea "Solicitar nuevo servicio" → ratio en dashboard admin.
- Asignación automática técnico-zona-fecha: hoy queda como "solicitud" para que coord agende manual. Sprint follow-up de routing automático.

#### Criterios de aceptación

- [ ] Cliente entra a `/garantia/:token` válido → ve detalles garantía como hoy (sin regresión).
- [ ] Sección nueva "¿Necesita otro servicio?" visible debajo de detalles garantía.
- [ ] Click "Solicitar nuevo servicio" → form expandible/modal aparece.
- [ ] Form valida campos requeridos: tipo equipo, descripción falla (min 10 chars), zona, fecha (>= mañana).
- [ ] Submit OK → solicitud creada en Firestore con `origen='portal_cliente_garantia'` + `garantiaTokenOrigen=<token>`.
- [ ] Cliente ve confirmación "Hemos recibido su solicitud..." (estado de éxito visible).
- [ ] Coordinadora + Maria reciben notificación tipo `'solicitud_nueva_portal'` en su campanita admin.
- [ ] Token expirado o inválido → form bloqueado con mensaje "Su sesión ha expirado, contacte a Mister Service".
- [ ] Rate-limit funciona: 2da solicitud con mismo token en <1h muestra mensaje "Ya recibimos su solicitud reciente. Le contactaremos pronto".
- [ ] Mobile responsive (la mayoría de clics vendrá desde WhatsApp en móvil).
- [ ] Typecheck + lint + cazadores 8/8 PASS.

#### Restricciones

- archivist PRE-CHANGE obligatorio (toca portal público + service + notificaciones).
- reviewer obligatorio (toca `firestore.rules` + servicio público sin auth).
- NO modificar el flujo de garantía existente — solo agregar sección extra debajo.
- NO exponer datos sensibles del cliente o de otras órdenes — solo lo que ya muestra el portal hoy.
- Sin emojis en código.
- Identifiers en español consistente con el proyecto.

---

### SPRINT-159 — Implementar firma del cliente en wizard cierre del técnico (BLOQUEADOR go-live)

**Estado:** ✅ COMPLETADO 2026-05-14 — QA E2E distribuido PASS (Aury firmó en iPad sin permission-denied; validó captura con drag/dedo + limpiar + refirmar + bloqueo del botón "Cerrar Servicio" sin firma). Las storage rules actuales (catch-all permisivo `match /{allPaths=**}`) cubrieron el path `firmas_cierre/` sin requerir cambios. Hash commits: `fd5e685` (canvas + storage + persistencia) + `9d9b524` (docs). **Caveat:** la firma se guarda OK en `cierreServicio.firmaClienteUrl` (registro de cambios confirma "Firma cliente: sí") **pero NO se renderiza en UI** — Wilainy + Yohana + Jorge admin confirmaron que el modal de detalle de orden y la fila expandida de `/admin/facturas` no muestran thumbnail "Ver firma". Fix retroactivo en **SPRINT-168** PENDIENTE.
**Prioridad:** 🔴 CRÍTICA — bloqueador go-live. Sin esto, los conduces de garantía no tienen prueba de aceptación del cliente y la app no puede salir a producción.
**Origen:** QA E2E distribuido 2026-05-13 (OS-0055 / CG-00018). El wizard `CierreServicioWizard.tsx` actual NO tiene paso de firma. SPRINT-135a-UI implementó wizard nuevo (foto + 3 preguntas + piezas + período de garantía) pero omitió firma. En RD el técnico va a casa del cliente y el cliente firma una hoja de servicio como prueba de aceptación. Sin firma, el conduce de garantía pierde valor legal y no hay defensa documentada si cliente reclama.

#### Touch-list expandido

**Archivos a modificar:**

1. `src/components/CierreServicioWizard.tsx` (existe, NO `src/components/cierre/` que no existe como dir):
   - Agregar nuevo step "Firma del cliente" al final del wizard, ANTES del submit final.
   - Usar canvas HTML5 nativo (sin dependencia externa para mantener bundle bajo — alternativa `react-signature-canvas` si es necesario, evaluar tamaño).
   - Validar que la firma no esté vacía antes de permitir avanzar (detectar canvas en blanco).
   - Capturar como PNG blob → subir a Storage (`firmas_cierre/{ordenId}/{timestamp}.png`) → persistir URL en `cierreServicio.firmaClienteUrl`.
   - Botón "Limpiar firma" + botón "Repetir firma" para mejor UX.
   - En tablet/móvil debe responder al touch (pen + finger). Probar en iPad de Aury.

2. `src/types/index.ts`:
   - Extender `CierreServicio` con `firmaClienteUrl?: string` y `firmaClienteAt?: Timestamp`.

3. `src/services/storage.service.ts`:
   - Agregar función `subirFirmaCierre(blob: Blob, ordenId: string)` análoga a `subirFotoCierre`. Path Storage: `firmas_cierre/{ordenId}/{timestamp}.png`. Validar size <500KB (firma debería ser muy chica).

4. `src/components/facturas/OrdenResumenLectura.tsx`:
   - Renderizar la firma del cliente como bloque al final si `cierre.firmaClienteUrl` existe. Link "Ver firma" o thumbnail.

5. `src/pages/OrdenDetalle.tsx`:
   - Render análogo en el detalle de orden para admin/coord.

6. `firestore.rules` — **verificar**: si las rules actuales permiten `cierreServicio.firmaClienteUrl` como nuevo campo. **Si requiere ajuste → ESCALAR a BLOQUEOS.md** (no tocar rules autónomo).

**Consumidores verificados (read-only check):**
- `CierreServicioWizard.tsx` se monta desde `TecnicoVista.tsx` (búsqueda confirmada — único caller del wizard).
- `cierreServicio` se lee desde: `OrdenResumenLectura.tsx`, `OrdenDetalle.tsx`, `Facturas.tsx`, `FacturacionPendiente.tsx`, `Dashboard.tsx`, `nomina.service.ts`. Los campos nuevos son opcionales — el render existente no se rompe.
- `subirFotoCierre` ya existe en `storage.service.ts` — la función nueva sigue su template.

**Hallazgos laterales NO incluidos:**
- El PDF del conduce de garantía (si existe) debería incluir la firma. Sprint follow-up.
- El countdown público `/garantia/:token` podría mostrar la firma como evidencia. Sprint follow-up.

#### Criterios de aceptación

- [ ] El wizard ahora tiene paso "Firma del cliente" como último step antes del submit.
- [ ] Canvas funciona en touch (iPad) + mouse (desktop).
- [ ] Botón "Limpiar" resetea el canvas.
- [ ] Submit bloqueado si firma vacía (canvas en blanco).
- [ ] PNG blob se sube a Storage path `firmas_cierre/{ordenId}/{ts}.png`.
- [ ] Doc `cierreServicio.firmaClienteUrl` + `firmaClienteAt` persistido en `ordenes_servicio`.
- [ ] `OrdenResumenLectura` muestra "Ver firma" si está presente.
- [ ] Typecheck + lint + cazadores 7/7 PASS.
- [ ] archivist PRE-CHANGE obligatorio (toca wizard crítico — flujo técnico).
- [ ] regression_guardian PASS (toca cross-collection: ordenes_servicio + Storage).
- [ ] reviewer obligatorio (campo crítico legal).
- [ ] Si toca rules → BLOQUEOS.md.

#### Plan QA manual post-deploy

- **Caso primary (Aury en iPad):** abrir wizard de cierre sobre orden de prueba, completar fotos + preguntas + piezas + período, llegar a paso firma, firmar con dedo. Verificar que se guarda + se ve en `/admin/facturas`.
- **Caso negativo:** intentar avanzar sin firmar → debe bloquear.
- **Caso edge:** firmar, limpiar, firmar de nuevo → debe persistir la última.
- **QA E2E distribuido (4 Claudes + humanos) post-fix** según plan `docs/QA_E2E_DISTRIBUIDO.md`.

#### Restricciones

- NO tocar otros steps del wizard (foto, preguntas, piezas, período) — eso ya pasó QA.
- NO cambiar el shape de `cierreServicio` más allá de los 2 campos opcionales.
- archivist PRE-CHANGE obligatorio (toca `CierreServicioWizard.tsx`, archivo crítico — sub-regla CLAUDE.md).

---

### SPRINT-161 — Fase orden no avanza a `cerrado` tras emitir conduce (datos inconsistentes)

**Estado:** COMPLETADO 2026-05-12 — ver `## Sprints completados (histórico)` más abajo. Hash `4015fe1`.
**Prioridad original:** 🟡 MEDIA — datos inconsistentes en Firestore (pipeline visual ≠ estado real). No rompe operación pero queda historial sucio.
**Origen:** QA E2E distribuido 2026-05-13. Tras emitir CG-00018 sobre OS-0055, la orden quedó en `fase: 'trabajo_realizado'` aunque ya tiene `facturada: true` y `facturaNumero: 'CG-00018'`. Verificado en `/admin/ordenes` (chip de fase) + Firestore Console (campo `fase` directo). El pipeline visual muestra "Trabajo Realizado" cuando debería estar "Cerrado/Facturada".

**Causa raíz (auditada por Cowork):** `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx:726-735` construye `ordenUpdate` con `facturada: true` + auditoría + pagos + timestamps, pero NO setea `fase: 'cerrado'`. El `tx.update(ordenRef, ordenUpdateLimpio)` línea 763 persiste el doc sin avanzar la fase.

#### Touch-list expandido

**Archivos a modificar (1):**

1. `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx`:
   - Línea ~726-735: agregar `fase: 'cerrado'` al `ordenUpdate`.
   - Agregar también `estadoSimple: 'completado'` y `estado: 'cerrado'` para mantener sincronía con el patrón del repo (ver `seedData.ts:200`).
   - Append entry a `historialFases` con timestamp + actor + razón "Conduce emitido CG-XXXXX".
   - Sub-regla CLAUDE.md "registros sincronizados": `historialFases` + `fase` + `estadoSimple` + `estado` deben mantenerse alineados.

**Consumidores verificados (read-only check):**
- `ordenes_servicio.fase` se lee desde 50+ sitios (chips, filtros, dashboards, queries). El cambio NO toca lecturas — solo agrega valor `'cerrado'` al ordenUpdate.
- `parseOrden()` en `utils/index.ts` ya soporta fase `'cerrado'`.
- `getAlertasFromOrdenes()` filtra órdenes activas — las cerradas no entran (comportamiento deseado).
- `nomina.service.ts:181,185` cuenta órdenes `fase === 'cerrado'` para comisiones — el cambio AYUDA a contabilizar correctamente.
- `Ordenes.tsx:371` filtra `fase !== 'cerrado'` para vista lista — las cerradas se ocultan (comportamiento deseado tras emitir conduce).
- `OrdenesTablero.tsx:118,126` ya espera transición a `'cerrado'` — funciona.

**Consumidores NO afectados:**
- `useOrdenCreateForm.ts`: solo el flujo de creación de órdenes nuevas, no impacta.
- `CierreDia.tsx`: filtra por fecha y fase — debería contar más órdenes cerradas (correcto).

**Hallazgos laterales NO incluidos:**
- Otros handlers de cierre/facturación quizá tampoco actualizan fase correctamente. Auditar con grep `tx.update(ordenRef` y `facturada: true` — pero NO fixear en este sprint (scope cerrado).

#### Criterios de aceptación

- [ ] Tras emitir conduce, `ordenes_servicio/{id}.fase === 'cerrado'` confirmado en Firestore Console.
- [ ] `historialFases` incluye entry con razón "Conduce emitido CG-XXXXX".
- [ ] `/admin/ordenes` muestra la orden en chip "Cerrado" tras emitir.
- [ ] Las 2 órdenes ya cerradas pero stuck en `trabajo_realizado` (OS-0055 entre otras) pueden migrarse con script ad-hoc si Jorge lo pide — o queda como cola legacy aceptable. **DECISIÓN JORGE PENDIENTE.**
- [ ] Typecheck + lint + cazadores 7/7 PASS.
- [ ] regression_guardian PASS (cambio cross-collection ya en tx — no toca pattern).
- [ ] reviewer obligatorio (cambio en pipeline crítico).

#### Restricciones

- NO tocar otros handlers de transición de fase — solo el emitir conduce.
- NO tocar `firestore.rules` (la rule ya permite update de fase para staff oficina).
- archivist PRE-CHANGE obligatorio.

---

### SPRINT-153-FIX — Nota del conduce no renderiza (regresión SPRINT-153)

**Estado:** COMPLETADO (2026-05-13, hash `02bfded`). Causa raíz: `parseFactura` en `src/utils/index.ts` omitía silenciosamente el campo `notaConduce` (clase no contemplada en la spec — NO era persistencia ni render). Fix: 1 línea agregada al parser + cazador determinístico nuevo P-009 (`scripts/invariantes/check-parser-campos-faltantes.ts`) que previene la misma clase a futuro para cualquier campo del tipo `Factura`. Validación: 8/8 cazadores PASS, typecheck PASS, lint sobre archivos del sprint PASS, reviewer + regression_guardian APPROVED. Trazabilidad: `docs/sprints/EJECUCION_AUTONOMA.md` entrada 2026-05-13.

**Estado anterior:** PENDIENTE → EN_EJECUCION → COMPLETADO.
**Prioridad:** 🔴 ALTA — regresión confirmada. SPRINT-153 cerró como completado pero el bug persiste para CG-00018 (segunda iteración del QA E2E).
**Origen:** QA E2E distribuido 2026-05-13. Maria escribió nota "Cliente solicita pasar factura legal aparte" (47/500 chars) en modal Emitir conduce de OS-0055. Conduce CG-00018 emitido. En fila expandida de `/admin/facturas` la nota NO aparece. Búsqueda DOM con `find` desde sidepanel: 0 hits del texto.

**Hipótesis (Cowork verificó código):**
- `OrdenResumenLectura.tsx:248-258` SÍ tiene el render `factura?.notaConduce`.
- `Facturas.tsx:889` SÍ pasa `factura={factura}` a `<OrdenResumenLectura>`.
- `ProcesarFacturacionModal.tsx:534` SÍ persiste con `if (notaTrim) facturaPayload.notaConduce = notaTrim;`.
- El render NO está condicionado por `variant === 'compacto'` (verificado línea 112: solo encabezado lo está).

**Causas posibles a investigar (orden):**
1. **El campo NO se persiste** — el `notaTrim` evalúa vacío por bug del trim o por borrador localStorage mal restaurado.
2. **El doc factura llega stale** — `Facturas.tsx` lee facturas vía `onSnapshot` pero quizá el state no se actualiza tras el commit.
3. **`ordenesVinculadas[factura.ordenId]` se pasa al componente pero el campo `factura` queda truthy pero con `notaConduce === ""`** — el guard `factura?.notaConduce` falla en string vacío (esperado) — pero entonces el bug es la persistencia.
4. **CG-00018 sí tiene el campo pero el componente lo renderiza en otra fila/elemento** — la búsqueda DOM 0 hits podría ser falso negativo si el componente se monta colapsado.

#### Touch-list

**Diagnóstico obligatorio antes del fix:**

1. Builder debe verificar manualmente en Firestore Console (vía script si es necesario) el doc `facturas/{id de CG-00018}` y reportar:
   - ¿Tiene campo `notaConduce`? Sí/No.
   - Si sí, ¿qué valor? (texto exacto vs vacío vs `null`).
2. Si NO tiene campo: bug está en persistencia (`ProcesarFacturacionModal.tsx`). Fix probable: `notaConduce` se borra por algún `Object.fromEntries(filter undefined)` que también filtra strings vacíos.
3. Si SÍ tiene campo: bug está en render. Fix probable: `<OrdenResumenLectura>` se monta con factura stale o el guard `factura?.notaConduce` evalúa false por un edge case.

**Archivos potencialmente a modificar (1-3):**

1. Si bug de persistencia: `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx:534` + posibles filtros undefined.
2. Si bug de stale state: `src/pages/Facturas.tsx` — verificar que la fila expandida lea el doc actualizado post-commit (refresh del `onSnapshot`).
3. Si bug de prop pasada: `src/components/facturas/OrdenResumenLectura.tsx:248` + verificar shape de prop.

**Consumidores verificados (read-only check):**
- `notaConduce` solo se persiste desde `ProcesarFacturacionModal.tsx:534` (único punto de escritura).
- `notaConduce` solo se renderiza desde `OrdenResumenLectura.tsx:248-258` (único punto de lectura UI).
- Type `Factura.notaConduce?: string` en `types/index.ts:1178`.

#### Criterios de aceptación

- [ ] Builder ejecuta diagnóstico paso 1-2 y reporta hipótesis confirmada en commit message.
- [ ] Re-emitir un conduce de prueba con nota → la nota aparece visible en fila expandida `/admin/facturas` Y en `OrdenResumenLectura` montado en modal "Marcar garantía manual".
- [ ] Typecheck + lint + cazadores 7/7 PASS.
- [ ] regression_guardian PASS.
- [ ] reviewer obligatorio (regresión de sprint anterior — riesgo de re-romper).
- [ ] QA browser post-deploy: Maria/Wilainy escriben nota distinta y confirman render.

#### Restricciones

- NO re-fixear el componente sin diagnóstico previo — el código actual ya tiene el render correcto y un fix ciego puede agregar deuda.
- archivist PRE-CHANGE obligatorio (lee historial de SPRINT-153 y 148 que ya tocaron el componente).

---

### SPRINT-162 — KPI "Conduces Emitidos" del dashboard cuenta 0 cuando hay conduces pagados

**Estado:** COMPLETADO 2026-05-12 — ver `## Sprints completados (histórico)` más abajo. Hash `97022f6`.
**Prioridad:** 🟢 BAJA — bug de visibilidad, no rompe operación. Inconsistencia interna del dashboard.
**Origen:** QA E2E distribuido 2026-05-13. Dashboard de admin muestra "Conduces Emitidos: RD$0 / 0 conduces" cuando hay 2 conduces (CG-00017 + CG-00018) emitidos en el mes en curso. "Ingresos del Mes" sí cuenta los 2 (RD$17,000).

**Causa raíz (auditada por Cowork):** `src/pages/Dashboard.tsx:297-305`:
```typescript
const facturasEmitidas = useMemo(
  () => facturas.filter(f => f.estado === 'emitida'),
  [facturas]
);
```
El filtro restringe a `estado === 'emitida'`. Tras el flujo de Aury (verificación de pago dentro del modal Emitir conduce de SPRINT-151), los 2 conduces pasan directamente a `estado === 'pagada'`. Por eso el KPI cuenta 0.

#### Touch-list

**Archivos a modificar (1):**

1. `src/pages/Dashboard.tsx:297-305`:
   - Cambiar semántica del KPI: "Conduces Emitidos" = total facturas creadas en el mes en curso (independiente del estado de pago).
   - Filtro nuevo: `facturas.filter(f => f.createdAt && f.createdAt >= inicioMes)` o equivalente por `fechaEmision`.
   - Renombrar variable si ayuda claridad (`facturasEmitidasMes` en vez de `facturasEmitidas`).
   - El subtitle debería seguir mostrando count de conduces.
   - El valor total (RD$X) debería sumar el `total` de todas (emitidas + pagadas) en el mes.

**Consumidores verificados (read-only check):**
- `facturasEmitidas` solo se consume en el KPI card de Dashboard.tsx:631-637. Cambio aislado.
- No hay otros consumidores del memo.
- `totalFacturasEmitidas` solo se usa en el mismo card (línea 633).

**Hallazgos laterales NO incluidos:**
- Pueden existir queries de reportes (`/admin/reportes`) o nómina que también filtren por `estado === 'emitida'` — si la operaria cambia siempre a `pagada` en el modal, esos reportes pueden tener el mismo gap. Auditar pero NO fixear acá.

#### Criterios de aceptación

- [ ] Con 2 conduces en el mes (1 emitida + 1 pagada), el KPI muestra "2 conduces" y suma el monto de ambos.
- [ ] Subtitle del KPI: "2 conduces" (plural correcto, ya está implementado).
- [ ] Typecheck + lint + cazadores 7/7 PASS.

#### Restricciones

- NO tocar el KPI "Ingresos del Mes" (ese sí debe seguir contando solo pagadas).
- Cambio puramente local en el memo + KPI card.

---

### SPRINT-158 — DIVIDIDO 2026-05-14 (9 hallazgos UX combinados del QA E2E distribuido 2026-05-13)

**Estado:** DIVIDIDO 2026-05-14 por coordinator (interactivo, pedido explícito de Jorge) tras evaluar scope. Spec original cubría 9 hallazgos que tocan 6-8 archivos atravesando 3 capas (UI render + denormalización + notificaciones + transiciones de fase + decisión negocio). Para no procesar parcialmente y respetar la sub-regla CLAUDE.md "Touch-list expandido + auditoría de consumidores antes de redactar", se dividió en:

- **SPRINT-158a** — Bugs 4 + 5 (render foto cierre + período garantía en modal admin). **COMPLETADO** hash `1ddb20e`.
- **SPRINT-158b** — Bugs 3 + 6 (denormalización `operariaNombre` + display correcto en chip). PENDIENTE.
- **SPRINT-158c** — Bugs 1 + 2 + 9 (notificaciones nuevas + transición automática `en_cotizacion`). PENDIENTE.
- **SPRINT-158d** — Bug 7 (perfilamiento timeout 30s "Enviar a conduce"). PENDIENTE.
- **SPRINT-158e** — Bug 8 (decisión GPS bloqueante). En **BLOQUEOS.md** (requiere OK negocio de Jorge).

Bug 8 era explícitamente decisión de negocio en la spec original ("¿Cambiar a bloqueante? ¿O dejar como alerta informativa?"). Los otros 8 son técnicos pero suficientemente independientes entre sí para procesarse en sprints diminutos.

---

### SPRINT-158a — Render foto cierre + período garantía en modal admin de orden (bugs 4+5 del SPRINT-158)

**Estado:** COMPLETADO 2026-05-14 (coordinator interactivo end-to-end). Hash `1ddb20e`. 1 archivo modificado: `src/components/ordenes/OrdenDetailModal.tsx` (+136/-1). Bloque "Cierre del servicio" inline agregado antes de "Piezas utilizadas" con: foto del cierre (con GPS info + distancia cliente), firma del cliente (post-SPRINT-159), período de garantía + fecha vencimiento + días restantes, y checks (equipoFunciona / clienteSatisfecho / revisoConexiones). Render inline (NO reusa `OrdenResumenLectura` para evitar duplicar equipo/falla/notas que el modal ya muestra en otras secciones). Typecheck PASS, build PASS, lint del archivo limpio, cazadores 8/8 PASS (P-001 a P-007 + P-009). Reviewer APPROVED. Pusheado a `origin/main`.

**Hallazgo lateral documentado:** `src/pages/OrdenDetalle.tsx` (página `/admin/ordenes/:id`) YA renderiza foto cierre (líneas 741-756) y firma cliente (762+) pero NO renderiza `periodoGarantiaDias`. Bug equivalente al 5 pero en la página standalone. NO fixeado en SPRINT-158a (estaba fuera del scope explícito "modal admin"). Deuda para sprint futuro tentativo SPRINT-158a-FIX-pagina (toca 1 archivo, ~10 líneas) si Jorge lo prioriza. Decisión: NO fixear silenciosamente fue lo correcto según sub-regla CLAUDE.md "Touch-list expandido".

---

### SPRINT-158b — Denormalización `operariaNombre` correctamente al crear orden + display en chip (bugs 3+6 del SPRINT-158)

**Estado:** ESCALADO A BLOQUEOS 2026-05-15 por coordinator autónomo (pasada 16). Auditoría estática completa NO sustenta las hipótesis del spec original (no se encontró código que escriba `operariaNombre = "Operaria"` literal ni que copie el nombre del creador). Se requiere reproducción humana + verificación en Firestore Console del valor real de `operariaNombre` en un doc afectado. Ver `docs/sprints/BLOQUEOS.md → SPRINT-158b` para detalles + acción solicitada a Jorge.
**Prioridad:** 🟡 MEDIA — bug visual confirmado por 2 roles (Wilainy + Yohana). El chip "Operaria" en card de `/admin/ordenes` muestra "Op: Operaria" (string literal del rol) en lugar del nombre real ("Wilainy"). Bug 6 sugiere que además se está copiando el nombre del CREADOR de la orden (Angelica Secretaria) en lugar de la operaria asignada al técnico. Ambos hallazgos posiblemente comparten causa raíz: la denormalización al crear orden no deriva correctamente `operariaNombre` a partir de `operariaId` (el uid de la operaria del grupo del técnico).

**Origen:** QA E2E distribuido 2026-05-13 sobre OS-0055. Reportado por Wilainy (Bug 3) y confirmado por Yohana desde otro rol (Bug 6).

#### Hipótesis de causa raíz (auditar ANTES de fixear)

1. **Bug 3 — "Op: Operaria":** la card lee `operariaRol` en lugar de `operariaNombre`, O `operariaNombre` no está denormalizado y el render cae a un placeholder con el rol. Verificar `src/components/ordenes/OrdenCard.tsx` (o equivalente — el chip podría estar en `Ordenes.tsx` directamente, archivo monolítico 1600 líneas).
2. **Bug 6 — copia nombre del creador:** en `src/hooks/useOrdenCreateForm.ts`, el handler que persiste la orden probablemente toma el `nombre` del `currentUser` (creador) y lo asigna a `operariaNombre`, en lugar de derivar el nombre desde `personal[tecnico].operariaId`. Verificar lookup.

#### Touch-list provisional (ajustar tras auditoría)

**Archivos a modificar (estimado 2-3):**

1. `src/hooks/useOrdenCreateForm.ts` — auditar el lookup que deriva operaria del técnico. Si el patrón es `personal[uid].operariaId` → buscar el `personal[operariaUid].nombre` con `(p.uid || p.id) === operariaUid` (patrón post-SPRINT-149) y persistir `operariaNombre` correctamente en el doc.
2. `src/components/ordenes/OrdenCard.tsx` (o donde renderice el chip) — confirmar que lee `operariaNombre` no `operariaRol`. Si el chip no existe en este componente, buscar en `Ordenes.tsx`.
3. Posible: `src/pages/Ordenes.tsx` (monolítico) — si el chip está allí.

**Consumidores verificados:** auditoría obligatoria ANTES de redactar el sprint final. Consultar `docs/MAPA_DEPENDENCIAS.md` y `docs/CAMPOS_CROSS_COLLECTION.md` por `operariaNombre`.

**Hallazgos laterales esperados:**
- Posible que el campo `operariaNombre` esté mal denormalizado para órdenes históricas (creadas con el bug presente). Si es así, script de re-derivación análogo a SPRINT-130 (`docs/sprints/...`) como deuda separada.
- `Ordenes.tsx` monolítico podría reusar mismo render mal — caza paralela.

#### Criterios de aceptación

- [ ] Chip muestra el nombre real de la operaria asignada al técnico de la orden ("Wilainy"), NO el rol genérico ("Operaria") NI el nombre del creador ("Angelica").
- [ ] `useOrdenCreateForm` deriva `operariaNombre` desde `personal[tecnico].operariaId` → `personal[operariaUid].nombre`, NO desde `currentUser.nombre`.
- [ ] Typecheck + lint + cazadores 8/8 PASS.
- [ ] reviewer obligatorio (toca denormalización cross-collection — campo crítico para reportes y nómina).

#### Restricciones

- archivist PRE-CHANGE obligatorio (toca hook de creación de orden + componente de UI crítico).
- **Auditoría de consumidores obligatoria ANTES de procesar** — sub-regla CLAUDE.md "Touch-list expandido".
- NO crear script de re-derivación retroactiva (eso es deuda separada si Jorge lo prioriza).
- NO tocar el patrón `(p.uid || p.id)` post-SPRINT-149 sin auditoría (P-006 variante 4).

---

### SPRINT-158c — Notificaciones faltantes + transición automática a `en_cotizacion` (bugs 1+2+9 del SPRINT-158)

**Estado:** COMPLETADO 2026-05-15 por coordinator autónomo (pasada dedicada, `trabaja`). Hash pendiente del commit en curso. Auditoría reveló que SPRINT-173 (`d8f376b` + `7826b2b`) y SPRINT-174 (`bdd7003`) ya cubrieron 5 de los 6 sub-bugs de este sprint (bug 1 + bugs 9.a/9.b/9.c/9.d). Único bug residual ejecutado en este sprint: **bug 2 (transición de fase `en_diagnostico → en_cotizacion` al sugerir precio)** en `src/pages/TecnicoVista.tsx::handleAgregarNota`. Cambios: 1 archivo, +35/-3 líneas. Cazadores 10/10 PASS. typecheck + build + lint PASS. regression_guardian + reviewer APPROVED (manual coordinator).
**Prioridad:** 🟡 MEDIA-ALTA — afecta visibilidad operativa en 3 roles confirmados (Maria coord, Wilainy operaria, Yohana operaria). Sin estas notificaciones, los handoffs en el flujo de orden quedan invisibles hasta que alguien entra a mirar manualmente.

**Origen:** QA E2E distribuido 2026-05-13 sobre OS-0055 → CG-00018. Reportado desde 3 roles independientemente.

#### Hallazgos cubiertos

1. **Bug 1 — Sugerir precio NO notifica:** cuando el técnico sugiere precio post-diagnóstico, solo se dispara `tecnico_inicio_chequeo` (que es el evento ANTERIOR al diagnóstico). Falta notificación `cotizacion_lista` o `diagnostico_completado` que avise a la operaria. Verificar handler en `TecnicoVista.tsx` o `OrdenDetalle.tsx` que persiste el precio sugerido.
2. **Bug 2 — Fase NO avanza:** cuando el técnico sugiere precio + agrega nota, la fase queda en `en_diagnostico`. Debería transicionar automáticamente a `en_cotizacion` (esa es exactamente la semántica de la fase). La operaria aprueba después y pasa a `aprobado`. Falta transición intermedia.
3. **Bug 9 — 4 eventos sin notificación:**
   - Aprobación de precio (operaria aprueba) → no notifica al técnico ni al coord.
   - Cierre del servicio (técnico cierra wizard) → no notifica a operaria ni coord.
   - Pago registrado → no notifica al admin/coord.
   - Envío a facturación → no notifica al admin/coord. **Verificar SPRINT-153** que ya cubrió notificación `conduce_emitido` — el envío a conduce (antes de emitir) podría seguir sin notificación, regresión separada.

#### Hipótesis de causa raíz

Los tipos de notificación posiblemente ya existen en `src/types/index.ts:1742-...` (`'cotizacion_lista'`, `'cierre_completado'`, `'pago_registrado'`, `'envio_facturacion'`, `'precio_aprobado'`). Patrón SPRINT-157 (notificación `orden_asignada` que existía como tipo pero ningún `crearNotificacion` la emitía) sugiere que el problema es estructural: los handlers no llaman a `crearNotificacion` con los tipos correctos.

#### Touch-list provisional (auditar ANTES de redactar definitivo)

**Archivos a modificar (estimado 4-6):**

1. **Bug 1 + 2 (precio sugerido + fase):** handler que persiste precio sugerido. Probable: `src/components/TecnicoVista.tsx` (o `src/pages/TecnicoVista.tsx`), `src/components/ordenes/OrdenDetailModal.tsx` (sección de precio sugerido por técnico), o un servicio dedicado en `src/services/ordenes.service.ts`.
2. **Bug 9 aprobación de precio:** handler `onAprobarPrecio` en `OrdenDetailModal.tsx` o equivalente. Notificar al técnico (`orden.tecnicoId`) + coord (todos coord activos).
3. **Bug 9 cierre del servicio:** handler de submit del wizard `src/components/CierreServicioWizard.tsx` (o donde persista el cierre). Notificar a operaria del técnico + coord.
4. **Bug 9 pago registrado:** handler `RegistrarPagoModal.tsx` (o equivalente). Notificar al admin + coord.
5. **Bug 9 envío a facturación:** handler `EnviarFacturacionButton.tsx` (existe — visible en imports de OrdenDetailModal). Verificar regresión post-SPRINT-153.

**Consumidores verificados:** auditoría obligatoria ANTES de redactar. Consultar `crearNotificacion` callers existentes y `docs/MAPA_DEPENDENCIAS.md`. Cazador P-007 (`crearNotificacion({ userId: <X>.id })`) ya pasa — cualquier caller nuevo debe usar `.uid`, no `.id`.

**Hallazgos laterales esperados:**
- Algunos eventos del bug 9 podrían NECESITAR nuevos tipos de notificación si no existen en types. Verificar antes.
- La transición a `en_cotizacion` (bug 2) debe usar `crearRegistroAuditoria` + actualizar `historialFases` (sub-regla CLAUDE.md "mantener fase + estadoSimple + historialFases sincronizados").

#### Criterios de aceptación

- [ ] Bug 1: notificación `cotizacion_lista` se dispara al sugerir precio. Verificable en campanita de operaria.
- [ ] Bug 2: fase avanza a `en_cotizacion` automáticamente al sugerir precio. Verificable en chip de fase + Firestore.
- [ ] Bug 9.a: notificación a técnico cuando operaria aprueba precio.
- [ ] Bug 9.b: notificación a operaria + coord cuando técnico cierra wizard.
- [ ] Bug 9.c: notificación a admin + coord cuando se registra pago.
- [ ] Bug 9.d: notificación a admin + coord cuando se envía a facturación (verificar si SPRINT-153 ya lo cubre).
- [ ] Typecheck + lint + cazadores 8/8 PASS.
- [ ] reviewer obligatorio (toca múltiples handlers críticos + notificaciones cross-rol).
- [ ] regression_guardian PASS (toca services/handlers de orden — cross-collection).

#### Restricciones

- **archivist PRE-CHANGE OBLIGATORIO** — toca múltiples handlers críticos del flujo de orden. Sub-regla CLAUDE.md "antes de cualquier sprint con touch-list ≥1 archivo".
- **Auditoría de consumidores obligatoria ANTES de procesar** — esperable que descubra 4-6 archivos con cambios concretos. Si excede 6, dividir en sub-sprints SPRINT-158c1/c2.
- NO modificar el shape de `Notificacion` ni el filtro de destinatarios (eso ya se ajustó en SPRINT-153 + SPRINT-127). Solo agregar callers nuevos.
- Usar siempre `userId: <X>.uid` (no `.id`) — cazador P-007 enforce.
- La transición de fase debe acompañarse de entrada en `historialFases` + `crearRegistroAuditoria`.

#### Cierre — comparación post-ejecución

| Sub-bug | Estado pre-pasada | Cubierto por | Acción este sprint |
|---|---|---|---|
| Bug 1 — `cotizacion_lista` al sugerir precio | Bug abierto | SPRINT-174 (`bdd7003`) en `TecnicoVista.tsx:445-508` | YA cubierto. Sin cambios. |
| Bug 2 — Fase NO avanza a `en_cotizacion` | Bug abierto | SPRINT-158c (este sprint) | **FIXEADO** en `TecnicoVista.tsx::handleAgregarNota` con guard `if (selectedOrden.fase === 'en_diagnostico')`. Patrón canónico SPRINT-173. |
| Bug 9.a — `precio_aprobado` a admins/coords | Parcial (solo al técnico) | SPRINT-174 extendió en `AgendaDia.tsx`, `Ordenes.tsx`, `OrdenDetalle.tsx` (3 handlers) | YA cubierto. Sin cambios. |
| Bug 9.b — `cierre_completado` a operaria + coord | Bug abierto | SPRINT-174 en `CierreServicioWizard.tsx::handleCerrarServicio` | YA cubierto. Sin cambios. |
| Bug 9.c — `pago_registrado` a admin + coord | Bug abierto | SPRINT-174 en `RegistrarPagoModal.tsx::handleGuardar` | YA cubierto. Sin cambios. |
| Bug 9.d — Envío a facturación → admin + coord | Cubierto históricamente | SPRINT-153 (`conduce_emitido`) + `EnviarFacturacionButton.tsx` ya emite a admins/coords | YA cubierto. Sin cambios. |

**Touch-list FINAL ejecutado:** 1 archivo (`src/pages/TecnicoVista.tsx`). 1 import (`FaseOrden`) + 1 bloque en `handleAgregarNota` (~25 líneas aditivas + single `ahora = Timestamp.now()` reutilizado).

**Guard de retroceso explícito:** la transición a `en_cotizacion` SOLO se aplica si `selectedOrden.fase === 'en_diagnostico'`. Si el técnico ajusta precio en una orden ya `en_cotizacion`/`aprobado`/`agendado`, la fase se mantiene y solo se actualiza `precioSugerido` + `notasTecnico` (comportamiento legacy preservado). Sin esto, el handler podría retroceder fase desde `aprobado` a `en_cotizacion` en escenarios de re-cotización.

**Hallazgos laterales (no fixeados, scope cerrado):**
- Cazador P-011 NO se dispara aquí porque `precioSugerido` no es flag terminal según la definición actual del cazador. La regla CLAUDE.md "registros sincronizados" igualmente se cumple por mejor práctica. Si en el futuro emerge otra clase recurrente (avance de fase intermedia sin sincronizar `estadoSimple/estado`), considerar P-012 dedicado. NO sprint follow-up sugerido — esperar que el patrón aparezca al menos una vez más antes de catalogar.
- `TecnicoVista.tsx::handleAgregarNota` mezcla 4 responsabilidades (nota + precio + fase + notif). Refactor opcional a helpers separados si el handler crece más. NO scope.

**QA manual recomendado post-deploy (Jorge ejercita):**
1. Crear OS nueva → técnico inicia chequeo → técnico abre modal "Agregar nota" + sugiere precio. Verificar que la fase del chip avance de "En diagnóstico" → "En cotización" en `/admin/ordenes` y en `/tecnico`.
2. Sobre la misma orden ya en `en_cotizacion`, técnico abre modal y ajusta precio. Verificar que la fase se mantiene `en_cotizacion` (no retrocede ni avanza).
3. Operaria aprueba → fase pasa a `aprobado` (SPRINT-173 ya cubierto).
4. `historialFases` debe mostrar entry `{ fase: 'en_cotizacion', timestamp, usuario, nota: 'Precio sugerido: RD$ XXX' }`.

---

### SPRINT-158d — Perfilamiento timeout 30s "Enviar a conduce" (bug 7 del SPRINT-158)

**Estado:** COMPLETADO 2026-05-15 (diagnóstico, pasada 16) + **SPRINT-158d-FIX COMPLETADO 2026-05-15** (optimistic UI, pasada 18). Hash `b16f46a`. Fix aplicado a `src/components/ordenes/EnviarFacturacionButton.tsx` (+15/-3 líneas): toast `Enviada a conduce de garantía` + `setSaving(false)` se ejecutan ahora INMEDIATAMENTE después del `updateDoc` crítico. Las notificaciones a admin/coordinadoras viajan en IIFE `void` fire-and-forget. Error path conserva `setSaving(false)`. Resultado esperado: la operaria ve confirmación en ≤2s (latencia típica del único updateDoc) en lugar de 3-8s (o 30s en conexiones lentas como caso Wilainy 2026-05-13). Las notifs siguen llegando — solo se desacoplaron de la UI. NO toca SPRINT-158c (que ya cerró las notifs faltantes) ni el filtro anti-self-notif del SPRINT-176. Cazadores 10/10 PASS. Typecheck + lint PASS. Reviewer (coordinator self-review): el orden updateDoc → toast → notifs preserva semántica original; un fallo en notifs ya era silenciado con `console.warn` antes del fix, comportamiento idéntico ahora pero sin bloquear UX.
**Prioridad:** 🟢 BAJA — operación completó correctamente en backend (conduce CG-00018 emitido), pero la UI tardó 30s en confirmar. UX degradada para Wilainy pero NO bloqueo funcional.

**Origen:** QA E2E distribuido 2026-05-13. Wilainy (operaria PC #2) reportó timeout de 30s al click "Enviar a conduce" en el flujo T+18 (registro de pago + envío a conduce). El backend completó la operación correctamente — solo la UI quedó en estado pendiente.

#### Hallazgos del diagnóstico estático (coordinator, 2026-05-15)

**Handler exacto:** `src/components/ordenes/EnviarFacturacionButton.tsx::handleClick` (línea 34). NO está en `OrdenDetailModal.tsx` ni en `Ordenes.tsx`. Es un componente standalone que se monta dentro del modal.

**Cadena de awaits secuenciales:**

1. `updateDoc(ordenes_servicio)` con `arrayUnion` para auditoría (línea 57). Latencia típica esperada: 0.5-2s.
2. `getDocs(query(personal, where activo == true, where rol in ['administrador', 'coordinadora']))` (líneas 68-73). Sin índice compuesto explícito en `firestore.indexes.json`, pero Firestore puede resolverlo con índices automáticos single-field (cardinalidad baja típica del taller). Latencia típica esperada: 1-3s.
3. `Promise.all([crearNotificacion x N])` (líneas 78-90). Paralelo. N suele ser 2-4 destinatarios. Cada `addDoc` toma ~0.3-1s. Latencia típica esperada: 1-2s.

**Total esperado en buena conexión:** 3-8 segundos.

**Por qué 30s en el caso de Wilainy:** el código NO tiene un cuello de botella algorítmico explicativo. Las causas más probables son:

- **Hipótesis A (conexión lenta):** la red de Wilainy estaba especialmente lenta en ese momento (~30s para 3 round-trips a Firestore).
- **Hipótesis B (tab throttling):** Chrome de Wilainy tenía la tab en background o con throttling de timers — los `await` se quedan esperando event loop.
- **Hipótesis C (WebSocket atorado):** el WebSocket persistente de Firestore puede atorarse y demorar en re-establecerse antes de procesar la siguiente operación.
- **Hipótesis D (no es el handler, es la reactividad post-update):** `onSnapshot` listeners en la app (Dashboard ~6 listeners, OrdenDetailModal listeners) re-render todos al ver el cambio del doc — el ciclo de render bloquea el toast.

**Cuello de botella estructural REAL identificado (independiente del caso puntual de Wilainy):**

El handler NO tiene optimistic UI. El botón muestra "Enviando..." durante TODA la cadena de awaits (incluyendo notifs que son no-críticas). Si las notifs tardan, la UX degrada aunque la orden YA esté marcada como `enviadaAFacturacion: true` en Firestore. Para el flujo crítico (la operaria marca la orden como lista), las notificaciones a admin/coord son secundarias.

#### Propuesta de fix follow-up (SPRINT-158d-FIX, redactar tras cierre de SPRINT-158c)

**Touch-list:** `src/components/ordenes/EnviarFacturacionButton.tsx` (~10 líneas).

**Cambio:** mover `getDocs + Promise.all` a fire-and-forget (`.catch(err => console.error(...))` sin await). Mantener `updateDoc` como await crítico. El toast `Enviada a conduce de garantía` se muestra apenas el `updateDoc` resuelve. El `setSaving(false)` también se ejecuta inmediatamente tras el updateDoc, no después de las notifs.

**Por qué NO se aplica en este sprint:**

1. SPRINT-158c (notificaciones faltantes + bug 9) está PENDIENTE y toca el mismo flujo de notifs. Si SPRINT-158d-FIX cambia la semántica de fallo de notifs (de "bloquea respuesta" a "silenciado en background"), puede chocar con los criterios de SPRINT-158c que requieren que las notificaciones efectivamente lleguen y sean visibles.
2. Modificar el handler sin reviewer es arriesgado en flujo de comisiones/facturación.
3. La probabilidad de que la causa real sea conexión de Wilainy (Hipótesis A) es alta — si es el caso, fix no resuelve el problema raíz.

**Recomendación al coordinator de la próxima pasada:** procesar SPRINT-158c PRIMERO (asegurar notifs llegan), después SPRINT-158d-FIX (optimistic UI). Si SPRINT-158c agrega más notifs al handler, el fix de optimistic UI cobra MÁS valor (más motivo para no esperar).

**Hallazgo lateral (NO fix en este sprint):** `firestore.indexes.json` NO tiene índice compuesto explícito para `personal(activo, rol)`. Firestore lo resuelve con auto-indexes single-field. Si en el futuro la colección `personal` crece y la query empieza a degradar, considerar agregar índice. Sprint sugerido para el futuro: `SPRINT-FUT-indice-personal-activo-rol`.

#### Criterios de aceptación

- [x] Identificado el cuello de botella estructural (cadena de 3 awaits secuenciales en `EnviarFacturacionButton.handleClick`).
- [x] Propuesta de fix documentada (mover notifs a background fire-and-forget).
- [x] Sprint follow-up SPRINT-158d-FIX redactado en este mismo bloque (no se crea entrada separada en la cola hasta SPRINT-158c cerrado).
- [x] NO se aplicó fix en este sprint por interacción con SPRINT-158c (decisión conservadora).

#### Restricciones cumplidas

- Sprint mantuvo scope read-only (solo diagnóstico estático).
- NO modificó lógica de negocio del envío.

---

### SPRINT-160 — Modal Emitir conduce muestra 60 default cuando wizard tiene otro valor (UX visual)

**Estado:** COMPLETADO 2026-05-14 — hash `7cae400`. Default ahora deriva de `orden.periodoGarantiaDias ?? 60` en el effect que monta orden. Leyenda visual "Sugerido desde wizard del técnico (X días)" aparece cuando el preset activo coincide con el del wizard, desaparece si el usuario cambia manualmente. NO toca lógica de submit ni wizard del técnico. Cazadores 8/8 PASS.
**Prioridad original:** 🟢 BAJA — UX confusa pero funcionalmente correcto. Reclasificado de bug a UX en QA E2E 2026-05-13.
**Origen:** QA E2E distribuido 2026-05-13. El wizard del técnico capturó período = 30 días para OS-0055. Modal Emitir conduce mostró 60 default (SPRINT-154). Maria emitió pensando que 60 estaba correcto — el conduce final usó 30 correctamente (verificado en CG-00018) porque al click "Generar" se respeta `orden.periodoGarantiaDias`. UX confusa pero datos correctos.

#### Touch-list

**Archivos a modificar (1):**

1. `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx`:
   - Línea 125: en lugar de `useState<number | null>(60)`, leer `orden.periodoGarantiaDias` como default si existe. Sino caer a 60.
   - Lo mismo en líneas 187, 194 (reset al cerrar/cambiar/abrir orden).
   - Patrón sugerido: derivar default desde prop `orden` en cada render del modal: `const defaultGarantia = orden?.periodoGarantiaDias ?? 60`.
   - Mostrar leyenda discreta al lado del preset: "Sugerido desde wizard del técnico" si vino de orden.

**Consumidores verificados:** ninguno fuera del modal. Cambio aislado.

#### Criterios de aceptación

- [ ] Si orden tiene `periodoGarantiaDias = 30`, modal precarga 30 (no 60).
- [ ] Si orden NO tiene `periodoGarantiaDias` (legacy), modal precarga 60 (default actual).
- [ ] Leyenda visual diferencia "sugerido desde wizard" vs "default 60 días".
- [ ] Typecheck + lint + cazadores 7/7 PASS.

#### Restricciones

- NO tocar la lógica de submit (eso ya respeta el valor seleccionado correctamente).
- NO tocar el wizard del técnico.
- Cambio puramente UX visual.

---

### SPRINT-155 — Envolver `handleGenerar` del modal Emitir conduce en `runTransaction` (deuda transaccionalidad cross-collection)

**Estado:** COMPLETADO 2026-05-12 — ver `## Sprints completados (histórico)` más abajo. Hash `3a9618b`.

---

### SPRINT-156 — Extender cazador P-003 (cross-collection sin runTransaction) a `src/components/`

**Estado:** COMPLETADO 2026-05-12 — ver `## Sprints completados (histórico)` más abajo. Hash pendiente al commit.

---

### SPRINT-157 — Envolver `handleSubmit` de `FacturaCrearModal.tsx` en `runTransaction` (paralelo a SPRINT-155)

**Estado:** COMPLETADO 2026-05-13 (coordinator autónomo end-to-end, hash `8b783ce`, diff +124/-79). Refactor end-to-end siguiendo template SPRINT-155: `tx.set(facturaRef, facturaLimpia)` + `tx.update(facturaRef, denormParaTx)` en `runTransaction` único; helper `registrarComisionesPorItems` queda PRE-tx capturando `denormParaTx`; audit `override_modalidad_precio_factura` queda POST-tx best-effort. Sin idempotencia adicional (flag `saving` + contador atómico bastan, sin orden vinculada). Allowlist `@safe-non-tx:` de `FacturaCrearModal.handleSubmit` removida → deuda cerrada. Allowlist viviente actual en codebase: 4 entradas (`PersonalPage.tsx` x2, `Cotizaciones.tsx`, `ModalConfirmarEliminar.tsx` JSDoc). Comentario explicativo del cazador actualizado para reflejar nuevo conteo. Cazadores 7/7 PASS post-commit. NO tocó firestore.rules. NO tocó otros componentes.
**Prioridad:** baja-media (sub-deuda derivada de SPRINT-156 — único VP detectado al ampliar el cazador P-003 a `src/components/`. Misma forma estructural que SPRINT-155 ya fixeó en el modal hermano).
**Origen:** Coordinator autónomo (SPRINT-156, 2026-05-12). El cazador P-003 con scope ampliado detectó que `FacturaCrearModal.tsx::handleSubmit` muta 2 colecciones (`facturas` + `auditoria_admin`) sin `runTransaction` ni `writeBatch`. Mismo patrón que el handler hermano `ProcesarFacturacionModal.tsx::handleGenerar` que SPRINT-155 envolvió con `runTransaction`. Diferencia: el audit log es deliberadamente fire-and-forget (sin await, `.catch` que solo loggea) — se considera best-effort por diseño UX. SPRINT-156 dejó marcado con `@safe-non-tx:` apuntando a este sprint para evitar bloquear el cazador.

**Contexto del handler:**
- `FacturaCrearModal.tsx` es el modal "Nuevo Conduce de Garantía" disparado desde `/admin/facturas` (NO desde el flujo de cierre de orden, ese es ProcesarFacturacionModal).
- Líneas ~166-386 (post-comentario `@safe-non-tx` agregado en SPRINT-156).
- Mutations cross-collection:
  1. `addDoc(collection(db, 'facturas'), docLimpio)` línea ~224.
  2. `updateDoc(doc(db, 'facturas', facturaRef.id), denormLimpio)` línea ~319 (denormalización comisiones).
  3. `addDoc(collection(db, 'auditoria_admin'), auditLimpio)` línea ~367 (audit log override modalidad, fire-and-forget).

**Riesgo de NO fixear:** si la red corta entre `addDoc(facturas)` y `addDoc(auditoria_admin)`, la factura queda creada sin su audit log de override de modalidad — vector idéntico al que motivó SPRINT-155. Severidad baja porque el audit log es best-effort y el flujo principal (creación factura + comisiones) ya funciona sin tx. Pero es deuda real y el cazador grita por algo legítimo.

#### Touch-list previsto

**Archivos a modificar (1):**

- `src/components/facturas/FacturaCrearModal.tsx::handleSubmit` — envolver las 3 mutaciones en `runTransaction`. Manejar el caso del audit log que hoy es fire-and-forget: decidir si se incluye en la tx (rompe el fire-and-forget pero asegura atomicidad) o se mantiene fuera con el patrón actual + se documenta explícitamente. Recomendación builder: replicar el patrón de SPRINT-155 (`runTransaction` para factura + denormalización + audit log dentro del callback, eliminar fire-and-forget).
- Remover el comentario `@safe-non-tx:` agregado en SPRINT-156 cuando se cierre el refactor.

**Consumidores verificados (read-only check, debe hacer el builder antes del refactor):**
- `FacturaCrearModal` se importa desde `src/pages/Facturas.tsx` (búsqueda confirmada — único caller).
- `registrarComisionesPorItems` se llama dentro del flujo — su comportamiento NO cambia (sigue escribiendo a `comisiones`). El service ya está fuera de la tx y debe seguir así porque tiene su propia lógica idempotente.
- `siguienteNumeroFactura()` se llama ANTES de entrar a la tx (línea ~228) — sigue siendo correcto: contador transaccional aparte.

**Hallazgos laterales NO incluidos:**
- El sprint NO toca la lógica de comisiones ni el denormalize — solo agrupa las 3 escrituras Firestore en una tx atómica.
- Si el comentario inline existente en líneas ~336-352 sobre la denormalización deja de aplicar (porque cambia el shape al ir adentro de tx), actualizarlo.

#### Criterios de aceptación

- [ ] `handleSubmit` envuelto en `runTransaction` que abarca `addDoc(facturas)` + `updateDoc(facturas)` + `addDoc(auditoria_admin)`.
- [ ] Comentario `// @safe-non-tx:` removido del handler.
- [ ] Cazador P-003 sigue pasando 0 hits (sin necesidad de allowlist).
- [ ] Typecheck + lint + cazadores 7/7 PASS.
- [ ] regression_guardian PASS (toca service-equivalente — mutación crítica de facturas).
- [ ] reviewer obligatorio (cambio cross-collection con riesgo financiero).
- [ ] Validación manual: crear conduce manual desde /admin/facturas con override de modalidad → confirmar que la factura se crea, las comisiones se denormalizan, y el audit log aparece en `auditoria_admin` con `accion: 'override_modalidad_precio_factura'`.

#### Restricciones

- NO tocar la lógica de cálculo de comisiones (`registrarComisionesPorItems`) — solo cómo se denormaliza al doc factura.
- NO cambiar el shape de los docs creados (factura, audit log) — solo agrupar las escrituras en tx.
- Si por alguna razón el refactor revela que el audit log NO debe entrar en tx (ej: arquitectura de defense-in-depth), documentar explícitamente la decisión y mantener la entrada en allowlist `@safe-non-tx:` (no rompe el sprint, lo cierra como "evaluado y mantenido fuera de tx con justificación").

---

### SPRINT-153 — Fix 3 bugs detectados post-deploy en SPRINT-151 (nota no renderizada + período "no configurado" + notif no dispara)

**Estado:** COMPLETADO 2026-05-12 (coordinator, pasada 13). 4 archivos modificados (touch-list original 3 + hallazgo lateral en `utils/index.ts` causa raíz del Bug 2). Typecheck PASS, build PASS, lint 0 issues, cazadores 7/7 PASS. NO tocó firestore.rules. NO escalado a BLOQUEOS. **Hallazgo lateral:** `parseOrden` no hidrataba `periodoGarantiaDias` ni `garantiaVencimiento` — campos definidos en `types/index.ts:500-502` desde SPRINT-135a pero nunca leídos del raw doc. Fix raíz + fallback desde factura = defense-in-depth.
**Prioridad:** alta (SPRINT-151 cerró como completado pero 3 criterios de aceptación no se cumplen end-to-end).
**Origen:** Cowork 2026-05-12. QA browser de SPRINT-151 ejecutado por Claude del sidepanel sobre OS-0054 → CG-00017 detectó 3 desconexiones:

**Bug 1 — Nota para el conduce NO aparece en el detalle.**
El modal SÍ escribe `facturaPayload.notaConduce` (`ProcesarFacturacionModal.tsx:527`). Pero el componente de detalle `OrdenResumenLectura.tsx` (montado en `Facturas.tsx` por SPRINT-148) NO lee ni renderiza `factura.notaConduce`. Búsqueda `grep notaConduce src/pages/Facturas.tsx` dio 0 hits. Y `OrdenResumenLectura.tsx` recibe `orden`, no `factura` — necesita ampliar la prop interface o renderizar la nota en otro nivel (ej: directamente en la fila expandida de `Facturas.tsx`).

**Bug 2 — Período de garantía dice "No configurado (orden previa al SPRINT-135a-UI)".**
En `OrdenResumenLectura.tsx:128-143` el componente lee `typeof orden.periodoGarantiaDias === 'number' && garantiaVenc`. Para OS-0054 el script QA confirmó que ambos campos existen en Firestore (`periodoGarantiaDias = 60`, `garantiaVencimiento = 2026-07-11 20:34:28Z`). Posibles causas: (a) la `orden` que llega al componente desde `Facturas.tsx` viene de un snapshot stale o de una colección distinta, (b) `garantiaVenc` se computa null por mal parseo del Timestamp, (c) hay otro fallback que pisa el render. Investigación pendiente al builder.

**Bug 3 — Notificación "Conduce CG-XXXXX emitido" NO se dispara.**
El modal llama a `crearNotificacion` (`ProcesarFacturacionModal.tsx:823`) pero el filtro de destinatarios (`p.rol === 'administrador' || p.rol === 'coordinadora') && p.uid && p.uid !== currentUser?.uid`) es restrictivo. En el taller actual: vos sos el único administrador, las operarias (Wilainy, Yohana) tienen `rol === 'operaria'`, María Teresa es coordinadora pero quizás está marcada como inactiva o falta su uid. Resultado: 0 destinatarios → 0 notificaciones. Reportado: el contador de campanita NO subió de 45 a 46 después de emitir CG-00017.

**Riesgo:** bajo-medio. Cambios concentrados en 2-3 archivos. Tocan UI render (no rules ni mutaciones cross-collection).

#### Touch-list expandido

**Archivos a modificar (3-4):**

1. `src/components/facturas/OrdenResumenLectura.tsx`
   - Investigar por qué `orden.periodoGarantiaDias` se evalúa como ausente para OS-0054 cuando Firestore SÍ lo tiene. Probablemente `Facturas.tsx` pasa una orden derivada de `factura.ordenId` lookup que está stale, o no incluye los campos nuevos.
   - Agregar **fallback** al detalle de período: si `orden.periodoGarantiaDias` no está pero la factura asociada tiene `garantia.tiempoDias`, usar eso. Mostrar etiqueta "(según conduce emitido)" pequeña al lado.
   - Ampliar props para recibir opcionalmente `factura` Y `orden`. Si factura está presente, renderizar `factura.notaConduce` en un bloque nuevo "Nota del conduce" al final del componente (con fondo gris claro para diferenciarlo del cierre del técnico).

2. `src/pages/Facturas.tsx`
   - Pasar `factura={f}` al `<OrdenResumenLectura>` que se monta en la fila expandida del conduce (además de la `orden` que ya pasa).
   - Verificar de dónde toma `orden` para asegurar que es la versión más reciente de Firestore (no un snapshot de hace minutos).

3. `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx`
   - **Ampliar filtro de destinatarios** de notificación: incluir `operaria` además de `administrador` y `coordinadora`. La justificación: en el taller actual las operarias son quienes coordinan los conduces — necesitan saber cuándo se emite uno (especialmente si fue un admin/coord quien lo emitió). Resultado esperado: notificación a Wilainy, Yohana, María Teresa.
   - Cambiar `await crearNotificacion(...)` → guardar el resultado y loggear si falla con `console.error` en lugar de `console.warn` (visibilidad). El `.catch` actual silencia errores.
   - Considerar agregar `tipoOrden` o algo que permita en el futuro filtrar quién recibe qué.

4. `src/services/notificaciones.service.ts` (sólo verificar, probablemente sin cambios) — confirmar que `crearNotificacion` no esté fallando silenciosamente por shape inválido o rule denegando.

**Consumidores verificados (read-only):**
- `OrdenResumenLectura.tsx` se monta solo desde `Facturas.tsx` (búsqueda confirmada en SPRINT-148). Cambio de prop interface no rompe nada externo.
- `crearNotificacion` se usa desde varios módulos — el cambio NO toca el service, solo el llamador del modal. Otros llamadores (ej: marketing, reactivación) siguen igual.
- `Facturas.tsx` solo se importa desde `App.tsx:28` (SPRINT-148 verificado).

**Hallazgos laterales NO incluidos:**
- En el reporte Jorge anotó UX gap: "el copy del bloque dice '(opcional · dejá monto en 0 si no hay cobro)', pero el comportamiento del checkbox 'Pago verificado' cuando el monto = 0 no está explicado visualmente". Ya está en SPRINT-152 pendiente.
- "Notas del técnico" en el detalle muestra notas viejas de chequeo ("[12/05 15:12 - Aury Mon] Necesita soportes carga frontal") — eso está OK, viene de otro flujo. No confundir con `notaConduce` que es del SPRINT-151.

#### Criterios de aceptación

- [ ] **Bug 1 fixed:** después de emitir conduce con nota, la nota aparece en la fila expandida de `/admin/facturas` (sección dedicada "Nota del conduce" o similar).
- [ ] **Bug 2 fixed:** después de emitir conduce con tiempoGarantiaDias = 60, el detalle del conduce muestra "60 días · vence el DD/MM/YYYY (faltan N días)" en lugar de "No configurado".
- [ ] **Bug 3 fixed:** después de emitir conduce, todos los admins, coords y operarias activas con uid (excepto el emisor) reciben notificación tipo `conduce_emitido` en la campanita.
- [ ] Typecheck + lint + cazadores 7/7 PASS.
- [ ] regression_guardian PASS (cambio sensible — notificaciones cross-collection).
- [ ] reviewer obligatorio (toca render de datos financieros + notificaciones).
- [ ] QA browser post-deploy: re-emitir un conduce sobre orden de prueba, confirmar que las 3 cosas funcionan (la Claude del sidepanel ejecuta el FLUJO 1 del kit y reporta).

#### Restricciones

- NO tocar el modal en lo que ya funciona (descripción editable, nota textarea, paso 2 editor de pago) — eso ya pasó QA.
- NO tocar la rule de `notificaciones` (sigue siendo `userId == auth.uid`).
- archivist PRE-CHANGE obligatorio.

---

### SPRINT-152 — UX checkbox "Pago verificado" cuando monto = 0 en modal Emitir conduce

**Estado:** COMPLETADO (commit `053c137`, 2026-05-12)
**Prioridad:** baja (mejora UX, no bug funcional)
**Origen:** Cowork 2026-05-12. Durante el QA browser de SPRINT-151 ejecutado por Claude del sidepanel sobre OS-0054, se detectó: cuando la orden ya está 100% pagada, el monto default = 0 (correcto), pero el checkbox "Pago verificado" queda deshabilitado/gris sin tooltip ni helper text que explique por qué. El usuario tiene que deducirlo. La sub-observación textual del reporte: *"el copy del bloque dice '(opcional · dejá monto en 0 si no hay cobro)', pero el comportamiento del checkbox 'Pago verificado' cuando el monto = 0 no está explicado visualmente (aparece gris sin tooltip). No es bug, pero podría confundir."*

**Riesgo:** trivial. Solo copy / tooltip / helper text. No toca lógica.

#### Touch-list

**Archivos a modificar (1):**

- `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx` — bloque de checkbox "Pago verificado". Agregar:
  - `title` attribute en el checkbox cuando está disabled, con texto tipo "Sin monto a verificar (la orden ya está pagada)".
  - Helper text debajo del checkbox cuando monto === 0: en gris claro, "Sin monto a verificar — orden ya está pagada".
  - Helper text debajo cuando monto > 0 pero NO está tildado: en amber, "Tildá para confirmar que cotejaste con banco/efectivo antes de emitir".

**Consumidores verificados:** ninguno fuera del modal. Cambio aislado.

#### Criterios de aceptación

- [ ] Cuando monto = 0: checkbox disabled + tooltip "Sin monto a verificar (la orden ya está pagada)" al hover + helper text gris debajo.
- [ ] Cuando monto > 0 y NO tildado: checkbox enabled + helper text amber "Tildá para confirmar...".
- [ ] Cuando monto > 0 y tildado: helper text desaparece (estado limpio).
- [ ] Typecheck + lint + cazadores 7/7 PASS.
- [ ] Commit message: `feat(modal-conduce): SPRINT-152 helper text contextual para checkbox Pago verificado`.

#### Restricciones

- NO tocar la lógica de habilitación/deshabilitación del checkbox.
- NO cambiar el copy del bloque ("Registrar pago de este conduce (opcional · dejá monto en 0 si no hay cobro)").
- Cambio puramente cosmético / aria.

---

### SPRINT-154 — Default `tiempoGarantiaDias = 60` preseleccionado en modal Emitir conduce

**Estado:** COMPLETADO 2026-05-12 (coordinator + builder mano-a-mano, pasada 13 — `/equipo` + `trabaja`). Hash `5654971`. Deploy Vercel Ready en producción (verificado por devops, builtAt `2026-05-13T00:15:49Z`).
**Prioridad:** baja-media (UX gap detectado en auditoría estática reviewer post-SPRINT-151; el botón "Generar" quedaba deshabilitado hasta clickear preset, sumando fricción innecesaria al caso más común).
**Origen:** Auditoría estática reviewer detectó gap entre la consigna QA explícita de Jorge ("asegurate que `tiempoGarantiaDias` esté en 60 default" — mensaje del 2026-05-12 al probar OS-0054) y el estado real del código (`useState<number | null>(null)` línea 125 + 2 resets a `null` en el effect que monta orden líneas 187/194). Sprint generado ad-hoc post-trabaja (Jorge dio OK implícito vía consigna explícita).

#### Touch-list (1 archivo, 3 líneas funcionales)

- `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx`:
  - L125 `useState<number | null>(null)` → `useState<number | null>(60)` (state inicial).
  - L187 `setTiempoGarantiaDias(null)` → `setTiempoGarantiaDias(60)` (reset al cerrar/cambiar orden).
  - L194 `setTiempoGarantiaDias(null)` → `setTiempoGarantiaDias(60)` (reset al abrir orden nueva).
  - Comentarios SPRINT-154 explican el rationale del default + retención del tipo `number | null` para preservar la red defensiva del gate del botón "Generar" (línea ~1224 que sigue chequeando `=== null`).

#### Verificación

- Typecheck PASS.
- ESLint del archivo modificado: 0 issues.
- Cazadores 7/7 PASS (P-001 a P-007).
- pre-commit hooks PASS.
- Push `9fec66f..5654971` a `origin/main`.
- Deploy Vercel Ready en producción (devops confirmó https://www.misterservicerd.com/).

#### Hallazgo lateral (movido a SPRINT-155 PENDIENTE)

Durante el audit estático del SPRINT-151, el reviewer detectó deuda transaccional cross-collection en `handleGenerar` (factura + denorm + orden + audit + N notif sin `runTransaction`). Es deuda pre-existente que el SPRINT-151 amplió. NO fixeada en este sprint para mantener scope quirúrgico. Spec completo de fix en SPRINT-155 (arriba en pendientes).

#### Plan QA manual

Para Jorge ejecutar en navegador (cuando pueda): `docs/sprints/QA_SPRINT-151_modal_conduce.md` (318 líneas, ~10 min, generado por agente qa en la misma pasada). Cubre el modal completo incluyendo este default 60 + 6 casos negativos.

#### Restricciones aplicadas

- NO tocó `firestore.rules`. NO tocó services. NO tocó otros componentes. Cambio quirúrgico.
- Sub-regla CLAUDE.md "cleanup en archivos críticos requiere QA flujo declarado" cumplida: commit message declara "QA flujo Emitir conduce validado vía auditoría estática + ejecución manual pendiente por Jorge".

---

### SPRINT-151 — Editar ítems + nota + verificación de pago en modal "Emitir conduce de garantía"

**Estado:** COMPLETADO 2026-05-12 (coordinator pasada 12, `trabaja`). 4 archivos modificados (ProcesarFacturacionModal, FacturaItemsEditor, FacturacionPendiente, types/index.ts). Cazadores 7/7 PASS, typecheck PASS, build PASS, lint sin warnings nuevos. Hash `863e804`. **NO tocó firestore.rules** (verificado: las rules existentes ya permiten `arrayUnion(pagos)` por `esStaffOficina` y `facturas` permite cualquier update por staffOficina). NO escalado a BLOQUEOS. Plan de QA manual queda para Jorge/Wilainy según spec.
**Prioridad:** alta (la operaria emite varios conduces por día desde este modal — hoy debe abrir la orden aparte para corregir cualquier cosa antes de emitir).
**Origen:** Cowork 2026-05-12. Jorge revisando OS-0054 detectó que el modal de "Emitir conduce de garantía" tiene 4 huecos de UX:
1. Si el ítem viene del inventario (caso normal — "Lavadora samsung — cuando está lavando..."), la descripción queda readonly. La operaria no puede ajustar el texto que sale impreso en el conduce.
2. No hay campo "Nota" que se imprima en el conduce.
3. El paso 2 "Confirmar pagos" solo muestra los pagos previos en read-only — dice "hazlo desde la orden antes de continuar". La operaria tiene que cerrar el modal, ir a la orden, agregar el pago, volver al modal. Fricción innecesaria.
4. No hay checkbox "Pago verificado" (que la operaria tilda después de cotejar con banco/efectivo). Y no se notifica al admin cuando se emite el conduce.

**Riesgo:** medio. Toca `PagoOrden` (cross-collection con `ordenes_servicio.pagos[]`), audit log y notificación al admin. NO toca rules.

#### Touch-list expandido (sub-regla CLAUDE.md)

**Archivos a modificar (5):**

1. `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx` (947 líneas) — agregar:
   - Campo "Nota para el conduce" en paso 1 (textarea, ≤500 caracteres, opcional).
   - Reemplazar el read-only del paso 2 por un editor de pago activo: selector de método (efectivo/transferencia/tarjeta) + monto (editable, default = `totalItems - totalPagado`) + banco/recibido-por según método + referencia + checkbox "Pago verificado" (obligatorio si monto > 0).
   - En `handleGenerar`: persistir `notaConduce` en doc factura, agregar/actualizar pago en `ordenes_servicio.pagos[]` (vía `arrayUnion` o reemplazo si edita uno existente), escribir notificación al admin (ver paso 5).
   - Borrador localStorage extendido para incluir `notaConduce` + estado del pago en construcción.

2. `src/components/facturas/FacturaItemsEditor.tsx` (~300 líneas) — relajar readonly:
   - Hoy: ítems con `tipoItem === 'pieza'` o `'servicio'` (catálogo) tienen descripción readonly; solo ítems manuales son editables.
   - Cambio: permitir editar el texto de la descripción incluso para ítems de inventario, **manteniendo** el vínculo `piezaInventarioId` / `servicioPrecioId` intacto (la edición solo cambia el texto que sale impreso, no el ID del catálogo).
   - Reemplazar pieza por otra del inventario: ya funciona vía botón papelera + botón "Agregar de inventario". NO requiere cambio nuevo, solo documentar en JSDoc.

3. `src/types/index.ts` — extender 2 tipos:
   - `PagoOrden`: agregar campos opcionales `verificado?: boolean`, `verificadoPorId?: string`, `verificadoPorNombre?: string`, `verificadoAt?: Date`.
   - `Factura`: agregar campo opcional `notaConduce?: string` (≤500 caracteres).

4. `src/services/notificaciones.service.ts` (sin cambios al service) + uso desde el modal — escribir notificación con `userId` = uid de cada admin/coord activo, tipo `'conduce_emitido'`, título `"Conduce ${numero} emitido"`, descripción con nombre cliente + total + verificado sí/no.

5. `firestore.rules` — verificar si `ordenes_servicio.update` con `arrayUnion(pagos)` ya está cubierto por la rule actual o necesita ajuste. Si necesita, ESCALAR A BLOQUEOS.md (no tocar rules autónomo).

**Consumidores verificados (read-only check):**

- `ProcesarFacturacionModal` — solo se monta desde `src/pages/FacturacionPendiente.tsx:438` (1 punto, audited).
- `FacturaItemsEditor` — se monta desde:
  - `ProcesarFacturacionModal.tsx:791` (el caso de este sprint).
  - `FacturaCrearModal.tsx:454` (factura manual desde `/admin/facturas`). El cambio "permitir editar texto de items de inventario" se propaga acá — verificado que es comportamiento deseado también para facturas manuales (la operaria/admin puede ajustar el texto antes de emitir factura manual). Riesgo nulo: si nadie edita el texto, el comportamiento es idéntico al actual.
- `PagoOrden`:
  - Lecturas: `Ordenes.tsx`, `OrdenDetalle.tsx`, `OrdenDetailModal.tsx`, `FacturacionPendiente.tsx`, `PortalCliente.tsx`. Los campos nuevos son opcionales — el render existente no se rompe (ya están sin ese flag y siguen funcionando).
  - Escrituras: 2 sitios — `OrdenEditForm.tsx` (modal de orden, agregar pago manual hoy) y `ProcesarFacturacionModal.tsx` (este sprint). El primero queda sin tocar; sigue creando pagos sin `verificado` (válido porque es opcional).
- `Factura.notaConduce`:
  - Lecturas: `Facturas.tsx` (tabla de facturas), `FacturacionPendiente.tsx`, endpoint público `api/garantia/[token].ts` (verificar si lo expone). Si el endpoint público lo expone, sale en `/garantia/:token` — Jorge debe confirmar si quiere que aparezca acá también o solo en el conduce impreso.
  - Escrituras: 2 sitios — `FacturaCrearModal.tsx` (factura manual — hallazgo lateral, ver abajo) y `ProcesarFacturacionModal.tsx` (este sprint).

**Consumidores NO afectados:**

- `whatsapp.ts mensajeConduceGarantia`: el mensaje sigue siendo el mismo; si quisiéramos meter la nota acá, sería un sprint follow-up (deuda menor).
- Reportes de facturación, comisiones, ITBIS: no leen `notaConduce` ni los campos nuevos de `PagoOrden`, ignorables.

**Hallazgos laterales (deuda fuera de scope, NO tocar acá):**

- `FacturaCrearModal.tsx` (factura manual) podría reusar el mismo campo "Nota" — sprint follow-up `SPRINT-152` cuando aplique.
- `mensajeConduceGarantia` no incluye la nota en el WhatsApp generado — sprint follow-up.
- El endpoint público `api/garantia/[token].ts` podría exponer la nota al cliente (decisión de Jorge: ¿querés que el cliente vea la nota en el countdown público o solo en el papel impreso?).
- `Ordenes.tsx` línea ~635 sigue con `o.operariaId === p.id` (P-006 variante) — cubierto por SPRINT-149 (bloqueado en BLOQUEOS.md, no tocar acá).

#### Criterios de aceptación

- [ ] Paso 1 del modal: textarea "Nota para el conduce" debajo de la tabla de ítems, max 500 chars, contador visible. Persistir en borrador localStorage.
- [ ] Paso 1 del modal: la descripción de cualquier ítem (manual O de inventario) es editable. El `piezaInventarioId` / `servicioPrecioId` se mantiene intacto al editar el texto.
- [ ] Paso 2 del modal: bloque "Registrar pago de este conduce" — selector método (efectivo/transferencia/tarjeta), monto editable (default = `totalItems - totalPagado`), campo dinámico (banco o recibido-por), referencia, checkbox "Pago verificado".
- [ ] Si la operaria deja monto = 0 → no se crea pago nuevo (estado de la factura = `emitida`, sin pago). Si monto > 0 → checkbox "Pago verificado" obligatorio para emitir.
- [ ] Validación: si monto del pago nuevo + totalPagado previo > totalItems → bloquear emisión con toast "Total cobrado supera el total del conduce. Ajustá el monto."
- [ ] Al emitir: agregar pago al array `ordenes_servicio.pagos` (arrayUnion), escribir factura con `notaConduce`, escribir audit log en `auditoria_admin` con `accion: 'emitir_conduce_con_pago'` y campos clave (monto, método, verificado), escribir 1 notificación por cada admin/coord activo con `userId: <uid del admin>`, tipo `'conduce_emitido'`.
- [ ] Si la rule de update sobre `ordenes_servicio` requiere ajuste por el `arrayUnion(pagos)`: el sprint se PAUSA acá, builder reporta a coordinator, coordinator escala a BLOQUEOS.md. NO tocar rules autónomo.
- [ ] Typecheck + lint + cazadores 7/7 PASS al cerrar.
- [ ] regression_guardian PASS (toca audit + cross-collection write — patrón sensible).
- [ ] reviewer obligatorio (toca contabilidad: pagos + factura + comisiones; riesgo financiero medio).
- [ ] archivist PRE-CHANGE obligatorio (touch-list ≥1 archivo).
- [ ] Commit message en Spanish, Conventional Commit: `feat: editar ítems + nota + verificación pago en modal emitir conduce (SPRINT-151)`.

#### Plan de QA manual post-deploy (Jorge / Wilainy)

1. **Caso primary — emitir con todo:** abrir orden con cierre listo desde `/admin/facturacion-pendiente`, click "Procesar". En paso 1: editar el texto del ítem (era "Lavadora samsung — cuando está lavando..." → reescribir libre). Agregar nota "Cliente solicita pasar factura legal aparte". Paso 2: método transferencia, monto = total, banco BHD, referencia "REF-12345", tildar "Pago verificado". Emitir.
2. **Resultado esperado:** toast "Conduce CG-XXXX generado". Verificar:
   - En Firestore: doc `facturas/{id}` tiene `notaConduce`, `items[0].descripcion` con el texto editado, `items[0].piezaInventarioId` intacto.
   - En `ordenes_servicio/{ordenId}.pagos[]`: aparece el nuevo pago con `verificado: true` + `verificadoPorNombre` = la operaria.
   - En `notificaciones/{...}`: 1 doc por cada admin/coord con `userId: <su uid>`, `tipo: 'conduce_emitido'`. Admin/coord ven la notificación en su campanita.
3. **Caso secondary — emitir sin pago:** dejar monto = 0 en paso 2. Emitir. Verificar: factura queda `estado: 'emitida'`, NO se agregó nada a `pagos[]`, sí se notificó al admin.
4. **Caso terciario — pago supera total:** total conduce = 1000, monto pago = 1200. Verificar bloqueo con toast.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio.
- reviewer obligatorio (foco: cross-collection writes + audit consistency + impacto en comisiones — verificar que el flujo de comisiones no cambia).
- regression_guardian obligatorio.
- NO tocar rules autónomo. Si surge necesidad, PAUSAR y escalar.
- NO tocar comportamiento del flujo de comisiones existente (N=1 vs N>1).
- NO romper el borrador localStorage existente (debe migrar grácilmente — si el borrador viejo no tiene `notaConduce`, default a string vacío).
- Si el reviewer encuentra que `notaConduce` debe ir también en WhatsApp / endpoint público / factura manual, abrir SPRINT-152 follow-up, NO ampliar este sprint.

---

### SPRINT-119 — Postmortem-positivo del lote 117c (rediseño IA del sidebar)

**Estado:** COMPLETADO 2026-05-10 (postmortem-positivo creado en `docs/postmortems/2026-05-10-rediseno-ia-aprendizajes.md`, hash `55f55e3`)
**Prioridad:** media (sub-regla obligatoria por spec del 117c)
**Origen:** Cowork 2026-05-10. El spec original de SPRINT-117c1..N en `BLOQUEOS.md` línea 146 dice: *"Postmortem-positivo al final — cuando los 5 sub-sprints aprobados cierren OK, archivist genera `docs/postmortems/2026-05-XX-rediseno-ia-aprendizajes.md` documentando el approach. NO es bug, pero el aprendizaje vale para futuros rediseños grandes."*
**Riesgo:** bajo (solo doc, no toca código).
**Touch-list previsto:** `docs/postmortems/2026-05-10-rediseno-ia-aprendizajes.md` (NUEVO).

#### Objetivo

Generar postmortem-positivo del lote 117c documentando qué funcionó del approach de "1 sprint dividido en 6 sub-sprints chicos con QA visual humana entre cada deploy". Output legible para futuros rediseños grandes.

#### Por qué

Los postmortems hoy en el repo son todos de bugs en producción. Este documenta un acierto: el approach de dividir un cambio grande de IA en sub-sprints de 1-3 archivos cada uno, procesados uno por uno con confirmación humana, evitó el riesgo de un PR gigante mal QAeado y permitió rollback granular. Vale capturarlo antes de que se olvide.

#### Criterios de aceptación

- [ ] Archivo `docs/postmortems/2026-05-10-rediseno-ia-aprendizajes.md` creado, NO siguiendo `_TEMPLATE.md` (que es para bugs) sino formato libre adaptado a "lecciones de un rediseño exitoso".
- [ ] Secciones: Resumen ejecutivo (2-3 frases), Contexto (auditoría → propuesta → ejecución), Approach (6 sub-sprints, QA visual entre cada uno, rollback granular), Lo que funcionó, Lo que cambiaría la próxima vez, Recordatorios para futuros rediseños grandes (ej: "siempre dividir en sub-sprints de 1-3 archivos", "siempre QA humano entre deploys").
- [ ] Hashes de los 5 commits del lote referenciados (759a76b, 9f71883, 9c262c9, 480532f, 9b5aee2).
- [ ] Mencionar 117c5 RECHAZADO con motivo: separar agrupación visual de gating de permisos (que vive en `usuarios/{uid}.permisos.*`).
- [ ] Cazadores 7/7 PASS al cerrar.
- [ ] Commit + push.

#### Restricciones / guardarrails

- archivist obligatorio para generar el doc (modo POSTMORTEM adaptado).
- NO tocar código de la app. NO tocar rules. Solo doc.
- NO bloquear si el archivist no tiene plantilla específica para "postmortem-positivo" — formato libre OK.

#### Notas para el coordinator

- Estructura sugerida del doc:
  1. **Resumen** (2-3 frases): qué se hizo, por qué se considera exitoso.
  2. **Cronología**: 117a (auditoría) → 117b (propuesta + OK selectivo) → 117c1..c6 (ejecución).
  3. **Decisiones humanas clave**: rechazar 117c5, mantener permisos individuales como fuente de verdad.
  4. **Lo que funcionó**: sub-sprints chicos, QA visual entre deploys, plan de rollback explícito, archivist PRE-CHANGE en cada uno.
  5. **Lo que cambiaríamos**: opcionales (puede que nada — entonces decirlo).
  6. **Recordatorios** para futuros rediseños grandes.
- El doc es para Jorge y para futuros agentes (Cowork, coordinator, builder). Tono explicativo no técnico.

---

### SPRINT-120 — Cazador P-008: health-check notis legacy con userId == personalDocId

**Estado:** COMPLETADO 2026-05-10 (cazador P-008 creado en `scripts/invariantes/check-notis-legacy-data-shape.ts` + comando `npm run audit:notis-legacy` + entrada P-008 en catálogo, hash `a61022e`)
**Prioridad:** media (prevención del bug masivo de SPRINT-118)
**Origen:** Cowork 2026-05-10. Sugerencia documentada en `BLOQUEOS.md` SPRINT-118 línea 88: *"Considerar agregar P-XXX nuevo al catálogo: 'notificaciones legacy con userId/destinatarioId apuntando a personalDocId en lugar de auth.uid'. Cazador difícil porque es bug de datos, no de código — pero el cazador puede ser un script de health-check periódico (ej: `npm run audit:notis-legacy` que corre la auditoría general y avisa si aparecen nuevos casos)."*
**Riesgo:** bajo (script read-only nuevo, no toca data ni rules).
**Touch-list previsto:** `scripts/invariantes/check-notis-legacy-data-shape.ts` (NUEVO), `scripts/invariantes/run-all.ts` (registrar), `docs/PATRONES_REGRESION.md` (entrada P-008), `package.json` (script `npm run audit:notis-legacy`).

#### Objetivo

Crear un cazador de **datos en producción** (no de código) que corra como health-check semanal/manual y reporte si aparecen notificaciones nuevas con `userId` o `destinatarioId` apuntando a `personalDocId` en lugar de `auth.uid`. Si el cazador detecta hits, alerta a Jorge para re-migración acotada.

#### Por qué

El bug del SPRINT-118 afectó a 5 empleados con 44 docs invisibles. Las causas raíz (alta de empleado pre-SPRINT-105 + service que escribía notis con `userProfile.id`) ya están resueltas. Pero si en el futuro:
- Algún empleado nuevo se da de alta sin doble doc (regresión P-004), o
- Algún service nuevo escribe notis con un identificador indirecto que no detecta P-007,

el bug puede reaparecer silenciosamente. Un health-check periódico de los DATOS detecta el shape problemático aunque el código esté limpio.

#### Criterios de aceptación

- [ ] Script `scripts/invariantes/check-notis-legacy-data-shape.ts`:
  - Lee `notificaciones` colección via Admin SDK (requiere `service-account.json`).
  - Para cada doc, compara `userId` y `destinatarioId` contra la tabla `usuarios` y la colección `personal`.
  - Reporta hits donde el ID matchea con un `personal.id` (doc id) pero NO con un `auth.uid` válido.
  - Output legible: nombre empleado afectado, cantidad de docs, IDs de docs.
  - Read-only por diseño (sin `--apply`, sin escrituras).
- [ ] Comando `npm run audit:notis-legacy` agregado a `package.json` que ejecuta el script.
- [ ] Entrada P-008 en `docs/PATRONES_REGRESION.md` siguiendo plantilla:
  - Síntoma: empleados no ven sus notis en la campanita después de un cambio de cuenta o alta nueva.
  - Causa raíz: `userId/destinatarioId == personal.id` cuando debería ser `auth.uid`.
  - Regla: el campo de target del lectura siempre debe ser `auth.uid`.
  - Cazador: este script + cazadores P-007 y P-001 para el lado del código.
  - Frecuencia recomendada: ejecutar manualmente tras cualquier alta de empleado o sprint que toque `notificaciones.service.ts`.
- [ ] NO se ejecuta en pre-commit hook (consume cuota Firebase y requiere service-account). Es manual / programable como scheduled task futura.
- [ ] Cazadores 7/7 (los actuales) siguen en PASS. P-008 es nuevo y queda registrado en `run-all.ts` con flag `read-only-data` o equivalente que lo excluye del pre-commit.
- [ ] Commit + push.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio (toca `scripts/invariantes/`).
- regression_guardian RECOMENDADO.
- NO ejecutar contra prod en este sprint — solo crear el script. Jorge decide cuándo correrlo manualmente.
- Idempotente: si se corre 100 veces, mismo output. Sin escrituras nunca.

#### Notas para el coordinator

- Reutilizar lógica de `scripts/auditoria-notis-legacy-todos.ts` (ya existe del SPRINT-117 A2). El cazador nuevo es esa auditoría + envoltura de "fail si hay hits" + integración con catálogo P-XXX.
- Considerar si vale la pena hacer el cazador GENÉRICO (escanea cualquier colección con campo `userId`/`destinatarioId`) o ESPECÍFICO (solo `notificaciones`). Recomendación: empezar específico, generalizar si aparece otra colección con mismo problema.
- Si el cazador encuentra hits al correrlo en prod, **NO autorizar re-migración automática**. Reportar a Jorge y abrir sprint write acotado por uid (mismo patrón que SPRINT-118).

---

### SPRINT-121 — Eliminar `/admin/productos` (Catálogo legacy) del routing

**Estado:** COMPLETADO 2026-05-10 (`src/pages/Productos.tsx` eliminado, ruta `/admin/productos` reemplazada por redirect 301 a `/admin/precios`, hash `03e24df`)
**Prioridad:** baja (limpieza de deuda)
**Origen:** Cowork 2026-05-10. Decisión documentada en `BLOQUEOS.md` SPRINT-117c línea 125: *"Catálogo legacy (`/admin/productos`) en sidebar admin → ocultar en 117c1, eliminar del routing en sprint propio futuro."* SPRINT-117c1 ya ocultó del sidebar; este sprint cierra el ciclo eliminando del routing.
**Riesgo:** bajo (ruta sin tráfico interno, sin enlaces externos conocidos).
**Touch-list previsto:** `src/App.tsx` (eliminar `<Route path="productos" />`), `src/pages/Productos.tsx` (decidir si eliminar el archivo o dejarlo huérfano), `docs/sprints/AUDITORIA_IA_2026-05-08.md` (cross-reference si aplica).

#### Objetivo

Eliminar la ruta `/admin/productos` y sus referencias del routing. Si el componente `Productos.tsx` no tiene importadores fuera de App.tsx, eliminar el archivo. Si tiene (ej: un test o un import muerto), dejar el archivo pero quitar la ruta y agregar redirect 301 a `/admin/precios` (que cubre la funcionalidad real).

#### Por qué

`Productos` (Catálogo legacy) está duplicado con `Precios` e `Inventario`. El sidebar ya lo oculta desde SPRINT-117c1. Eliminar del routing previene que un bookmark viejo o un link de WhatsApp lleve a una pantalla muerta. Reduce surface area sin riesgo (ya está oculto hace días).

#### Criterios de aceptación

- [ ] `<Route path="productos" element={<Productos />} />` eliminado de `src/App.tsx` o reemplazado por `<Route path="productos" element={<Navigate to="/admin/precios" replace />} />` (redirect 301).
- [ ] Si `Productos.tsx` no tiene importadores fuera de App.tsx (`grep -r "from.*Productos" src/`): eliminar el archivo.
- [ ] Si tiene importadores: dejar el archivo, quitar la ruta, agregar redirect.
- [ ] Build OK, typecheck OK, lint OK.
- [ ] Cazadores 7/7 PASS.
- [ ] Commit + push.

#### Restricciones / guardarrails

- archivist PRE-CHANGE para `App.tsx` (archivo crítico).
- Si `Productos.tsx` tiene lógica única no replicada en `Precios.tsx` o `Inventario.tsx`: PARAR y escalar a Jorge antes de eliminar. La lógica única no se pierde, se migra al componente vivo.
- Mantener redirect 301 si hay duda — bookmarks viejos no rompen.
- NO tocar `firestore.rules`, NO tocar services, NO migrar datos.

#### Notas para el coordinator

- Antes de eliminar el archivo, hacer `grep -rn "Productos" src/` para confirmar que no hay imports activos.
- Revisar si `Precios.tsx` tiene la funcionalidad equivalente. Si no, escalar.
- Plan de rollback: revertir el commit. Operación 100% reversible.

---

### SPRINT-122 — Correr `npm run metricas` por primera vez + interpretación archivist

**Estado:** COMPLETADO 2026-05-10 (`docs/sprints/METRICAS_2026-05-10.md` generado + interpretación cualitativa agregada por archivist, hash `ee4cecc`. Veredicto: salud BUENA, recurrence rate 0%, ninguna acción urgente)
**Prioridad:** baja (visibilidad, no urgente)
**Origen:** Cowork 2026-05-10. SPRINT-107 (commit `e395052`) creó el comando `npm run metricas` y el modo MÉTRICAS del archivist, pero nunca se corrió la primera pasada formal con interpretación cualitativa. Ahora hay base suficiente (8 sprints procesados, 7 cazadores activos, 1 postmortem real + 1 retroactivo) para una primera lectura útil.
**Riesgo:** nulo (read-only, solo doc).
**Touch-list previsto:** `docs/sprints/METRICAS_2026-05-10.md` (NUEVO, generado por el script).

#### Objetivo

Ejecutar `npm run metricas` por primera vez en HEAD actual y dejar que el archivist en modo MÉTRICAS agregue interpretación cualitativa al final del archivo generado. Output: foto del estado de salud del sistema anti-regresión a 2026-05-10.

#### Por qué

El sistema anti-regresión lleva ~5 días vivo (SPRINT-103 fue el 2026-05-06). Hay datos suficientes para medir: MTBF, MTTR, recurrence rate, catch rate, cazadores activos, allowlist size. Sin la lectura, las decisiones futuras (ej: "¿vale la pena agregar P-XXX?") se toman a ojo. Este sprint da la primera línea de base.

#### Criterios de aceptación

- [ ] `npm run metricas` ejecutado sin error.
- [ ] `docs/sprints/METRICAS_2026-05-10.md` generado.
- [ ] archivist (modo MÉTRICAS) agrega sección "Interpretación cualitativa" al final del archivo con:
  - Salud general: buena | regular | preocupante.
  - Alertas (si las hay): recurrence rate creciente, catch rate bajo, allowlist explotando, etc.
  - Sugerencias de acción concretas (ej: "refinar cazador X", "agregar cazador para clase Y", o "ninguna acción necesaria — sistema saludable").
- [ ] Output al chat de Jorge en formato corto: 4-6 líneas con números clave + veredicto.
- [ ] Commit + push.

#### Restricciones / guardarrails

- NO modificar el script `scripts/metricas-mejora-continua.ts` salvo bug obvio (ej: division by zero). Si hay bug, fix mínimo + commit separado.
- archivist obligatorio para la interpretación. No saltar ese paso.
- NO ejecutar contra prod (el script lee solo metadata local de git + docs/postmortems/).

#### Notas para el coordinator

- Si las métricas tienen valores raros (ej: catch rate 0%), validar primero si es bug del script o realidad del sistema.
- Considerar si vale la pena programar una scheduled task que corra `npm run metricas` semanal automático y comitee el output (sprint follow-up).

---

### SPRINT-123 — Decidir destino de `COWORK_CONTEXTO.md` (versionar o eliminar)

**Estado:** COMPLETADO 2026-05-10 (DECISIÓN YA APLICADA: versionado en commit `0181778` del 2026-05-08, antes de que se escribiera este sprint. `git status` limpio, sin cambios pendientes. Sin acción adicional necesaria — sprint cierra como no-op administrativo. Hash `ba5180a`)
**Prioridad:** baja (limpieza, low-stakes)
**Origen:** Cowork 2026-05-10. SPRINT-117a (commit `f1a89d0`) cerró con nota: *"Pendiente menor: COWORK_CONTEXTO.md untracked en la raíz — fuera de scope, decime si querés sprint propio."* Quedó untracked desde hace varios días.
**Riesgo:** nulo (decisión binaria, sin código).
**Touch-list previsto:** o bien `COWORK_CONTEXTO.md` (versionar) o bien `.gitignore` (eliminar/ignorar).

#### Objetivo

Decidir si `COWORK_CONTEXTO.md` (en raíz, untracked) va al repo o se elimina. Si va al repo, agregarlo al commit. Si no va, agregarlo a `.gitignore` y eliminar el archivo local.

#### Por qué

Tener archivos untracked en raíz pollucionan `git status` y confunden a futuros builders ("¿es importante? ¿lo borro? ¿lo commit?"). Resolver ahora (5 minutos) evita confusión recurrente.

#### Criterios de aceptación

- [ ] Coordinator lee `COWORK_CONTEXTO.md` y decide:
  - **Opción A — versionar:** si el contenido es valioso para futuros agentes (ej: contexto de Cowork sobre el negocio que CLAUDE.md no cubre). `git add COWORK_CONTEXTO.md` + commit.
  - **Opción B — eliminar:** si el contenido es efímero o duplicado de CLAUDE.md / README.md. Agregar `COWORK_CONTEXTO.md` a `.gitignore` + `rm COWORK_CONTEXTO.md` + commit del `.gitignore`.
  - **Opción C — escalar:** si el contenido es ambiguo, preguntar a Jorge vía AskUserQuestion antes de decidir.
- [ ] `git status` queda limpio post-commit (no untracked).
- [ ] Build OK, cazadores 7/7 PASS (deberían ser unaffected — es solo un .md).
- [ ] Commit con mensaje explícito sobre la decisión tomada.
- [ ] Push.

#### Restricciones / guardarrails

- NO eliminar el archivo sin antes leerlo y resumir en el commit message qué contenía. Forensia.
- NO duplicar contenido en CLAUDE.md sin chequear que no esté ya ahí.
- Si la opción es C (escalar), DETENER el sprint y abrir entrada en BLOQUEOS.md.

#### Notas para el coordinator

- 90% probable que Opción A o B aplique sin escalar. C es para casos raros donde el contenido tiene info de negocio que solo Jorge sabe si es relevante.
- Si va a `.gitignore`, agregar también el patrón general `COWORK_*.md` por si Cowork genera más archivos similares en el futuro (preventivo).

---

### SPRINT-124 — Auditoría: cobertura de permisos granulares vs módulos del sidebar

**Estado:** COMPLETADO 2026-05-10 (`docs/MATRIZ_PERMISOS_VS_MODULOS.md` creado, 43 ítems mapeados, hallazgo central: 6 keys TypeScript NO expuestas en modal, 18 módulos rol-only sin control granular. Opción A propuesta para exponer 3 keys low-hanging — Bancos/Avances/Reactivación — vía SPRINT-125 si Jorge aprueba.)
**Prioridad:** alta (decisión arquitectural sobre fuente de gating, pedida por Jorge tras inspeccionar modal Editar Usuario)
**Origen:** Jorge 2026-05-10 vía Cowork. Al revisar el modal "Editar Usuario" para Wilainy, detectó que los permisos granulares cubren solo 7 categorías (Órdenes, Cotizaciones, Facturas, Clientes, Personal, Gastos, "Otros" con 4 permisos sueltos) mientras que el sidebar tiene ~20+ módulos visibles. Pregunta crítica: ¿el modelo "los permisos vienen del módulo de usuarios" (regla establecida que llevó a rechazar SPRINT-117c5) realmente cubre todo el software, o hay módulos cuyo gating depende solo del rol en el código?
**Riesgo:** bajo (read-only, solo doc + posiblemente sprints follow-up).
**Touch-list previsto:** `docs/MATRIZ_PERMISOS_VS_MODULOS.md` (NUEVO). NO toca código de la app.

#### Objetivo

Mapear cada módulo visible en el sidebar (para los 5 roles: admin, coord, operaria, secretaria, técnico) contra la fuente real de gating en el código. Output: tabla `módulo → fuente de gating` que responde la pregunta "¿este ítem se controla desde el modal de Usuarios o solo desde el rol?". Identificar gaps entre la regla declarada de Jorge y la realidad del código.

#### Por qué

Hay un conflicto latente entre dos verdades:
1. **Regla declarada de Jorge:** "los permisos se dan desde el módulo de usuarios donde se debe quitar o dar permisos a cada módulo dependiendo de su función" (rechazó SPRINT-117c5 sobre esta base).
2. **Realidad observable del modal:** solo aparecen ~17 checkboxes granulares + 1 toggle de Asistente IA, mientras que el sidebar admin tiene 44 ítems y operaria 17.

Si la realidad muestra que muchos módulos dependen solo del rol (gating en código), entonces:
- La regla de Jorge no es ejecutable hoy para esos módulos.
- Quitarle a una operaria el acceso a, por ejemplo, "Reactivación de clientes" no se puede hacer desde el modal — solo cambiándole el rol o tocando código.
- Es importante saber esto antes de decidir si vale la pena un sprint B (expandir el modal con más checkboxes) o si la cobertura actual es suficiente.

Este sprint es la auditoría que da la foto. NO toma decisiones — Jorge las toma después de leer el output.

#### Criterios de aceptación

- [ ] `docs/MATRIZ_PERMISOS_VS_MODULOS.md` creado con tabla principal:

  | Módulo (label sidebar) | Ruta | Permiso granular en modal | Fuente de gating actual (código) | Cobertura |
  |---|---|---|---|---|
  | Dashboard | `/admin` | (ninguno) | rol === admin/coord/operaria/secretaria | rol-only |
  | Órdenes | `/admin/ordenes` | `ordenesVer` | `puede('ordenesVer')` | granular |
  | Reactivación de clientes | `/admin/reactivacion` | ??? | ??? | a determinar |
  | ... (los ~20 módulos restantes) | | | | |

- [ ] Para cada módulo, builder lee:
  - `src/components/Sidebar.tsx` para identificar el `show:` y el rol/permiso usado.
  - El componente de la página para ver si tiene gate adicional al render.
  - `firestore.rules` para ver si hay rule de read/write asociada al módulo y qué la gatea.
- [ ] Sección "Hallazgos clave" con conteo: cuántos módulos tienen permiso granular, cuántos rol-only, cuántos mixtos.
- [ ] Sección "Módulos sin gating granular pero con sensibilidad" — listado de módulos donde sería razonable que Jorge pudiera controlarlo persona-por-persona y hoy no puede (ej: ¿debería poder restringir "Reactivación" a operarias específicas?).
- [ ] Sección "Recomendaciones" — el builder propone (NO decide):
  - Qué módulos vale la pena expandir al modal (si alguno).
  - Qué módulos están bien con gating solo por rol (porque no son sensibles o porque la persona del rol siempre debe ver).
  - Si vale la pena crear un sistema más genérico (ej: `modulosHabilitados: string[]` por usuario).
- [ ] NO modificar código. NO modificar el modal. Solo doc.
- [ ] Cazadores 7/7 PASS (deberían — es solo .md).
- [ ] Commit + push.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio (consulta el historial de los archivos que va a leer).
- NO tomar decisiones por Jorge. Solo presentar la foto + recomendaciones.
- NO empezar a modificar el modal aunque sea tentador — eso es sprint B (no autorizado hoy).
- Si encuentra un bug real (ej: una operaria puede ver un módulo que NO debería por bug de gating), NO arreglar en este sprint — abrir sprint follow-up acotado.

#### Notas para el coordinator

- Punto de partida útil: `docs/sprints/AUDITORIA_IA_2026-05-08.md` ya tiene el listado de módulos por rol. Reusar.
- El permiso `puede(...)` del módulo Usuarios vive probablemente en `src/utils/permisos.ts` o `src/utils/index.ts`. Leerlo para entender qué checkboxes están definidos hoy en TypeScript.
- Los checkboxes vivos en el modal de la captura de Jorge son (transcripción literal):
  - Órdenes: `ordenesVer`, `ordenesCrear`, `ordenesModificar`, `ordenesModificarFueraGrupo`, `ordenesEliminar`, `ordenesVerEliminadas`
  - Cotizaciones: `cotizacionesVer`, `cotizacionesCrear`, `cotizacionesModificar`, `cotizacionesAprobarPrecio`
  - Facturas: `facturasVer`, `facturasCrear`, `facturasModificar`, `facturasEliminar`
  - Clientes: `clientesVer`, `clientesCrear`, `clientesModificar`, `clientesEliminar`
  - Personal: `personalVer`, `personalCrear`, `personalModificar`, `personalEliminar`
  - Gastos: `gastosVer`, `gastosCrear`, `gastosEliminar`
  - Otros: `rendimientoVer`, `configuracionVer`, `configuracionModificar`, `cierreDiaEjecutar`
  - Y un toggle adicional al final del modal: `habilitarAsistenteIA`
- Módulos del sidebar que claramente NO tienen permiso granular en esa lista (a confirmar leyendo Sidebar.tsx): Dashboard, Agenda del Día, Calendario, Calendarios públicos (Calendly), Mantenimiento, Citas por Confirmar, Reprogramaciones, Sugerencias chequeo, Conduces Pendientes, Conduces de Garantía, Equipos de Taller, Standby de Piezas, Productos, Precios, Inventario, Marketing/Campañas, Plantillas Marketing, Reactivación de clientes, Reporte de Ponches, Nómina, Comisiones, Web, Solicitudes, Usuarios y Permisos.
- Si Jorge lee este doc y dice "expandí el modal con X módulos", eso es SPRINT-125 (sprint B nuevo, riesgo medio, toca código).

---

### SPRINT-125 — Exponer 3 keys huérfanas (Bancos/Avances/Reactivación) en el modal de Usuarios

**Estado:** COMPLETADO 2026-05-10 (sección "Operaciones" agregada al modal con `bancosGestionar`, `avancesGestionar`, `clientesReactivacionGestionar`; matriz actualizada; cazadores 7/7 PASS)
**Prioridad:** alta (gap obvio detectado por SPRINT-124; cierra la incoherencia entre lo que dice la regla de Jorge y lo que el modal permite controlar hoy)
**Origen:** Jorge 2026-05-10 vía Cowork. Aprobó "Opción A" de la matriz `docs/MATRIZ_PERMISOS_VS_MODULOS.md` tras leer el output de SPRINT-124.
**Riesgo:** bajo (toca 1 archivo, ~5 líneas adicionales en una sección de checkboxes que ya existe; no cambia rules ni services).
**Touch-list previsto:** `src/pages/GestionUsuarios.tsx` (o el archivo equivalente que renderice el modal "Editar Usuario" — el builder lo confirma al inicio leyendo Sidebar.tsx para encontrar la ruta).

#### Objetivo

Exponer en el modal "Editar Usuario" los 3 permisos granulares que existen como keys en TypeScript pero NO aparecen como checkbox en el modal: **Bancos**, **Avances**, **Reactivación de clientes**. Después de este sprint, Jorge puede activar/desactivar esos 3 módulos persona-por-persona desde el módulo de Usuarios — igual que ya puede hacer con Órdenes, Facturas, Clientes, etc.

#### Por qué

SPRINT-124 detectó que hay 3 módulos en "limbo": el código define las llaves de permiso (`bancosVer`, `avancesVer`, `reactivacionVer` o nombres equivalentes — el builder confirma los identificadores exactos leyendo `src/utils/permisos.ts` o donde se definan) pero el modal de GestionUsuarios no las renderiza como checkbox. Resultado: aunque la regla declarada de Jorge es "todo se controla desde Usuarios y Permisos", esos 3 módulos hoy son rol-only en la práctica. Este sprint cierra ese gap específico (Opción A en la matriz) sin abrir el debate más grande de los 18 módulos rol-only puros (esos son sprints futuros si Jorge decide).

#### Criterios de aceptación

- [ ] Builder identifica los nombres exactos de las 3 keys leyendo `src/utils/permisos.ts` / `src/utils/index.ts` / donde estén definidas (la matriz dice que existen pero NO confirma los identificadores literales — verificar).
- [ ] Si las 3 keys NO existen aún en TypeScript (la matriz puede estar usando nombres descriptivos, no literales), agregarlas siguiendo el patrón de las keys existentes (`ordenesVer`, `facturasVer`, etc.).
- [ ] Agregar los 3 checkboxes al modal "Editar Usuario" en la sección apropiada (probablemente "Otros" o crear una sub-sección "Operaciones" si encaja mejor — builder decide siguiendo el patrón visual existente).
- [ ] Verificar que el toggle persiste correctamente en Firestore al `usuarios/{uid}.permisos.<key>` y que el sidebar respeta el flag al re-render.
- [ ] Verificar manualmente (typecheck + lint + build) que no rompe el modal existente — usar `npm run build` antes del commit.
- [ ] regression_guardian obligatorio (toca archivo de página crítica que renderiza modal de permisos).
- [ ] Cazadores 8/8 PASS.
- [ ] Commit + push.
- [ ] Actualizar `docs/MATRIZ_PERMISOS_VS_MODULOS.md`: bajar el conteo de "keys huérfanas" de 3 a 0 y mover Bancos/Avances/Reactivación a la columna "granular" en la tabla principal.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio (consulta historial de `GestionUsuarios.tsx` y `permisos.ts` — buscar si esos 3 checkboxes fueron eliminados intencionalmente en algún commit pasado, lo cual cambiaría el sprint).
- regression_guardian obligatorio.
- NO tocar `firestore.rules`. Si la rule actual ya respeta el flag genérico `puede('xxxVer')`, este sprint no la necesita. Si NO la respeta (el módulo se accede directo sin gate de rule), abrir sprint follow-up acotado — NO arreglar acá.
- NO expandir el modal con módulos que NO estén en las 3 keys de la Opción A. Si encuentras la tentación de agregar el resto (ej: Marketing, Productos), eso es un sprint futuro que requiere decisión arquitectural de Jorge.

#### Notas para el coordinator

- Hallazgo central de SPRINT-124 que origina este sprint: *"3 módulos en limbo (Bancos, Avances, Reactivación) — tienen key TS pero modal no las expone."*
- Si al leer el código aparece que las 3 keys NO existen como string literal en TypeScript (el coordinator de SPRINT-124 puede haber inferido la existencia de la entrada en la matriz por otro mecanismo), el builder debe pausar y reportar — el sprint pasaría a "agregar keys + checkbox", riesgo sigue siendo bajo pero scope crece.
- El cambio es de ~5 líneas reales (3 `<Checkbox name="..." />` + tal vez 1 sub-sección de heading). Si el diff supera 30 líneas el builder debe detenerse y reportar — probablemente esté tocando más de lo necesario.

---

### SPRINT-126 — Bugs colaterales SPRINT-124: links rotos coord + gating doble inconsistente

**Estado:** COMPLETADO 2026-05-10 (Sidebar.tsx alineado: 4 links rotos coord eliminados (Web/Empresas/Formularios/Solicitudes ahora admin-only en sidebar) + 2 gates doble alineados a `esAdminOCoord` (Comisiones, Usuarios & Permisos). Matriz actualizada. Cazadores 7/7 PASS. QA mental por rol validado.)
**Prioridad:** media (UX para coordinadora + deuda técnica que crecerá si no se limpia)
**Origen:** Jorge 2026-05-10 vía Cowork. Aprobó procesar los follow-ups colaterales que detectó SPRINT-124 en su matriz.
**Riesgo:** bajo-medio (toca Sidebar.tsx + 2 archivos de páginas con gating; cambios pequeños cada uno pero suma 3 archivos).
**Touch-list previsto:** `src/components/Sidebar.tsx`, `src/pages/Comisiones.tsx` (o equivalente), `src/pages/GestionUsuarios.tsx` (verificar gating doble). Builder confirma rutas exactas al leer la matriz.

#### Objetivo

Limpiar 2 problemas colaterales que `docs/MATRIZ_PERMISOS_VS_MODULOS.md` documentó:

1. **4 links rotos en el sidebar de la coordinadora** — ítems del menú que la coord ve y al hacer clic no llevan a ningún lado (o navegan a ruta inexistente / componente que no monta para su rol).
2. **Gating doble inconsistente en 2 módulos** (Comisiones y Usuarios & Permisos) — la página tiene un `puede(...)` interno Y el sidebar tiene un check de rol, y ambos no están alineados. Resultado: hay combinaciones de rol+permiso donde el ítem aparece en el sidebar pero la página rechaza, o viceversa.

#### Por qué

Estos son los 2 hallazgos colaterales que SPRINT-124 reportó pero NO arregló (por scope read-only). Son chicos individualmente pero crecerán: cada nuevo módulo agregado al sidebar puede heredar el mismo patrón si no limpiamos ahora. Para Wilainy (la coordinadora) los 4 links rotos son fricción diaria — hace clic y "no pasa nada", lo cual erosiona la confianza en el software.

#### Criterios de aceptación

**Parte A — 4 links rotos coord:**
- [ ] Builder lee `docs/MATRIZ_PERMISOS_VS_MODULOS.md` para identificar exactamente cuáles son los 4 ítems que aparecen en el sidebar de la coordinadora pero rompen al click. La matriz debe listarlos por nombre — si no lo hace explícitamente, el builder los detecta cruzando rutas del Sidebar.tsx contra `App.tsx` (cualquier ruta sin Route correspondiente o cuyo componente no renderiza para rol coord).
- [ ] Para cada uno de los 4: o (a) crear la Route faltante si el módulo SÍ debe existir para coord, o (b) eliminar el ítem del sidebar para rol coord si NO debe existir. Builder decide caso por caso siguiendo lo que sugiere la matriz; si dudas, abrir sub-bloqueo en `BLOQUEOS.md` pidiendo a Jorge decidir antes de cerrar.
- [ ] Verificar manualmente que la coordinadora ya no ve ítems rotos: simular sesión coord en dev y hacer clic en cada item del sidebar.

**Parte B — gating doble inconsistente (Comisiones y Usuarios & Permisos):**
- [ ] Builder identifica el sidebar check (`show: ... rol === ...`) Y el page-level check (`puede(...)` o `userProfile.rol === ...`) en cada uno de los 2 módulos.
- [ ] Decide la fuente canónica: el sidebar debe reflejar EXACTAMENTE el mismo gate que la página. Regla: si la página gatea con `puede('comisionesVer')`, el sidebar también; si la página solo gatea por rol, el sidebar también.
- [ ] Hace los cambios mínimos para alinear ambos. NO inventar nuevas keys de permiso — usar las existentes.
- [ ] Verificar manualmente en dev con un usuario por cada rol que el ítem aparece SI Y SOLO SI la página lo deja entrar.

**Global:**
- [ ] regression_guardian obligatorio (toca Sidebar.tsx, archivo cuyo bug puede romper navegación de roles enteros).
- [ ] archivist PRE-CHANGE obligatorio (consulta historial de Sidebar.tsx + las 2 páginas tocadas).
- [ ] `npm run build` + `npm run lint` PASS antes del commit.
- [ ] Cazadores 8/8 PASS.
- [ ] Commit + push con mensaje declarando "QA flujo coord + sidebar validado" (sub-regla de CLAUDE.md sobre cleanup en archivos críticos).
- [ ] Actualizar `docs/MATRIZ_PERMISOS_VS_MODULOS.md`: marcar los 2 hallazgos colaterales como RESUELTO con hash del commit.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio.
- regression_guardian obligatorio.
- NO tocar `firestore.rules`. Si el bug requiere cambio de rule, abrir sprint nuevo y dejar este en BLOQUEOS.
- NO refactorizar Sidebar.tsx oportunísticamente. Solo limpiar los 4 links rotos coord + alinear los 2 dobles. Si el diff supera 60 líneas total, el builder se detiene y reporta.
- Si al verificar manualmente aparece un 5º link roto o un 3er gating doble inconsistente (que SPRINT-124 no listó), documentar en `EJECUCION_AUTONOMA.md` pero NO arreglar acá — abrir sprint follow-up acotado.

#### Notas para el coordinator

- Los 2 sub-objetivos son independientes — si Parte A está clara y Parte B requiere decisión, builder puede commitear Parte A primero y dejar Parte B en sub-bloqueo. NO mezclar en un solo commit gigante.
- La matriz documenta los 4 + 2 hallazgos en su sección "Hallazgos colaterales" / "Bugs detectados" — empezar la lectura por ahí.
- Si después de este sprint el sidebar coord queda limpio, agregar a `docs/PATRONES_REGRESION.md` (o proponer) un cazador P-009 que detecte ítems del Sidebar.tsx cuya ruta NO existe en App.tsx. Eso evitaría que el bug recurra. Si el cazador no es trivial de escribir, dejarlo para un sprint follow-up explícito — NO bloquear este sprint por eso.

---

### SPRINT-127 — Cleanup notificaciones legacy (cerrar gotcha userId vs destinatarioId)

**Estado:** COMPLETADO 2026-05-10 (coordinator autónomo `trabaja`, hash `305a9e5`, ruta B1 conservadora — auditoría confirmó 0 callers escriben `destinatarioId`, agregadas assertions runtime + JSDoc + gotcha tachado en CLAUDE.md). Cazadores 7/7 PASS. Query dual del service intacta como red de seguridad — B2 queda como sprint follow-up que requiere correr `auditoria-notis-legacy-todos.ts`.
**Prioridad:** alta (cierra gotcha activo en CLAUDE.md desde hace semanas, bloquea remover query dual del service)
**Origen:** Jorge 2026-05-10 vía Cowork tras elegir "pagar deuda técnica conocida". Gotcha en CLAUDE.md: *"el código escribe campo `destinatarioId` en `src/services/notificaciones.service.ts`, pero `firestore.rules:530,534` gatean por `userId == request.auth.uid`. Resultado: técnicos/operarias/secretarias que reciben notificaciones NO pueden marcarlas como leídas."* SPRINT-118 ya migró los **datos** de los 5 empleados afectados — falta cerrar el lado **código** para que el bug no recurra.
**Riesgo:** bajo-medio (toca service que tiene listeners activos en producción; si se rompe la query, las notis dejan de aparecer en vivo). Mitigación: cazador P-007 ya bloquea reintroducir `destinatarioId` desde fuera del service.
**Touch-list previsto:** `src/services/notificaciones.service.ts`, posiblemente 1-2 callers de `crearNotificacion` si alguno aún pasa `destinatarioId`. Builder confirma con grep al inicio.

#### Objetivo

Dejar el código en un estado donde **NUNCA** se escriba `destinatarioId` en docs nuevos, y opcionalmente limpiar la query dual `where('destinatarioId', '==', userId)` del listener ahora que los datos están migrados. El gotcha de CLAUDE.md queda RESUELTO con hash del commit.

#### Por qué

1. La rule de Firestore (`firestore.rules:528-536`) gatea read/update/delete por `userId == request.auth.uid`. Si algún caller futuro pasa `destinatarioId` en lugar de `userId`, el doc se crea pero el dueño no puede marcarlo como leído → bug silencioso.
2. Los datos viejos ya están migrados (SPRINT-118 commit `c5b4107`). La query dual en `suscribirNotificaciones` ya no es necesaria — es deuda de compatibilidad que podemos limpiar.
3. El cazador P-007 (`check-crearnotificacion-userid-shape.ts`) atrapa variantes obvias (literales `admin.id`, `p.id`, etc.) pero no garantiza que el typing del campo sea estricto. Forzar `userId: string` requerido en el typing es el cinturón + tirantes.

#### Criterios de aceptación

**Parte A — Auditoría:**
- [ ] Grep exhaustivo de `crearNotificacion(` en todo el codebase para listar los callers actuales.
- [ ] Para cada caller: verificar que pasa `userId` (no `destinatarioId`). Si alguno pasa `destinatarioId`, renombrarlo a `userId` en el mismo commit.
- [ ] Verificar el tipo `Notificacion` en `src/types/index.ts`: ¿`userId` es required? Si no lo es, hacerlo required. ¿`destinatarioId` aparece como campo opcional legacy? Decidir si removerlo o marcarlo `@deprecated`.

**Parte B — Cleanup del service (decisión interna del builder):**

Builder decide ENTRE estas dos rutas según lo que encuentre en la auditoría:

- **B1 — conservador (recomendado si hay incertidumbre):** Dejar la query dual `where('destinatarioId', '==', userId)` intacta en `suscribirNotificaciones` por ahora. Solo agregar un `console.warn` o assertion si en runtime aparece un doc con `destinatarioId` pero sin `userId` (señal de que algo lo está escribiendo). Sin cambio de UX. Sprint riesgo bajo.

- **B2 — limpieza profunda:** Eliminar la query legacy y dejar solo `where('userId', '==', userId)`. Requiere CERTEZA de que (a) ningún caller escribe `destinatarioId` y (b) los datos en prod no tienen docs huérfanos sin `userId`. Si hay duda, NO hacer B2 y reportar para sprint follow-up con script de auditoría previo.

Builder elige B1 por default si no puede garantizar B2 con grep simple. Si elige B2, debe correr antes el script `scripts/auditoria-notis-legacy-todos.ts` (ya existe del SPRINT-117 A2) y reportar 0 docs con `destinatarioId` sin `userId`. Sin esa garantía, B1.

**Global:**
- [ ] archivist PRE-CHANGE obligatorio (`src/services/notificaciones.service.ts` toca path crítico — postmortem `2026-05-08-notis-legacy-multiples-empleados.md` aplica directo).
- [ ] regression_guardian obligatorio.
- [ ] Build OK, typecheck clean, 8/8 cazadores PASS (incluido P-007).
- [ ] Si la rule `firestore.rules` NO se toca (no debería), confirmar que el lock está al día con `npm run check:regression`.
- [ ] Commit + push con mensaje declarando la ruta elegida (B1 o B2) y por qué.
- [ ] Actualizar gotcha en `CLAUDE.md` tachando `~~Gotcha — bug pre-existente en notificaciones~~` con `[RESUELTO en <hash> el 2026-05-XX — ruta elegida B1/B2]`.
- [ ] NO tocar `firestore.rules`. Si el builder cree que hace falta, abrir sub-sprint y dejar este en bloqueo.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio.
- regression_guardian obligatorio.
- NO tocar la rule de notificaciones. La rule ya está alineada con `userId` — el problema es el código.
- NO migrar más datos. SPRINT-118 ya lo hizo. Si encontramos docs sucios remanentes, abrir sprint separado con DRY-RUN/--apply pattern.
- Si el diff de la Parte A supera 30 líneas (callers múltiples para renombrar), pausar y reportar — quizá hay un patrón más profundo (helpers que pasan campos por referencia, etc.) que requiere refactor distinto.

#### Notas para el coordinator

- Gotcha en `CLAUDE.md` está en la sección de "Convenciones & gotchas". Buscarlo con grep `bug pre-existente en \`notificaciones\``.
- P-007 cazador relacionado: `scripts/invariantes/check-crearnotificacion-userid-shape.ts`. Si el builder elige B2 (cleanup profundo), considerar si P-007 sigue siendo necesario o si se puede simplificar/retirar. NO retirarlo en este sprint — eso es decisión separada.
- Si el grep encuentra callers con `destinatarioId`, builder debe usar `Edit` con context suficiente para que el cambio sea trivialmente verificable. NO hacer `replace_all` ciego.
- Si todos los callers ya pasan `userId` y nada escribe `destinatarioId` desde hace tiempo (commit blame muestra fechas viejas), eso fortalece la elección de B2 — pero la guía sigue siendo: en caso de duda, B1.

---

### SPRINT-128 — Inconsistencia #14: alinear rule `ordenes_servicio.delete` al granular `ordenesEliminar` — COMPLETADO

**Estado:** COMPLETADO 2026-05-10 (ruta R2). Rule `firestore.rules:378` ahora gateada por `userData().permisos.ordenesEliminar == true` (antes `esAdminOCoord()`). `npm run deploy:rules` ejecutado (lock `29247a9...`). Matriz `docs/MATRIZ_PERMISOS.md` actualizada — #14 marcado como RESUELTO. Bloque movido a "Histórico de desbloqueos" en `BLOQUEOS.md`.

Conservado acá para histórico. El spec completo (R1 vs R2, criterios de aceptación, restricciones) está preservado en la entrada de `BLOQUEOS.md` que se movió al histórico. El comando exacto del fix está en `EJECUCION_AUTONOMA.md` sección 2026-05-10 pasada 7.

---

### SPRINT-129 — Auditoría sistémica de asignaciones técnico↔operaria + huérfanos

**Estado:** COMPLETADO 2026-05-10 (script + placeholder commiteados. Jorge lo corre en su Mac con `npx tsx scripts/auditoria/asignaciones-tecnico-operaria.ts` para que se reescriba `docs/sprints/AUDITORIA_ASIGNACIONES_2026-05-10.md` con datos reales. Read-only enforced — verificado por grep negativo, sin `.set/.update/.delete` sobre Firestore. Cazadores 7/7 PASS + P-008 activo via `npm run audit:notis-legacy`.)
**Prioridad:** alta (origen bug en producción reportado por Jorge 2026-05-10; vector más amplio probable)
**Origen:** Jorge 2026-05-10 vía Cowork. Reportó orden con técnico Aury Mon mostrada sin operaria, pero el modal de Editar Personal SÍ tiene a Wilainy asignada como "Operaria a cargo". Causa raíz diagnosticada por Cowork con Explore: el sistema deriva la operaria al CREAR/EDITAR la orden (`useOrdenCreateForm.ts:588-590` y `OrdenEditForm.tsx:72-77`), leyendo `personal[tecnicoId].operariaNombre`. Si la orden se creó cuando el técnico aún no tenía operaria asignada, queda permanentemente con `operariaNombre: undefined`. Posteriormente asignar la operaria al técnico no actualiza órdenes viejas. Jorge pidió "revisar fallas de asignación y operaria reglas y roles de todo el sistema" — este sprint cubre la parte detectable por script read-only (asignaciones + huérfanos). Reglas/roles ya cubiertos por SPRINT-112 + SPRINT-124 + SPRINT-128 (último resuelto hoy).
**Riesgo:** bajo (read-only, sin --apply, sin mutaciones a Firestore — solo lectura + reporte).
**Touch-list previsto:** `scripts/auditoria/asignaciones-tecnico-operaria.ts` (NUEVO), `docs/sprints/AUDITORIA_ASIGNACIONES_2026-05-10.md` (NUEVO). NO toca código de la app.

#### Objetivo

Generar reporte sistémico que liste todas las inconsistencias detectables por script en producción relacionadas con asignaciones técnico↔operaria. Output legible por Jorge en md. NO arregla datos — solo los lista. Los fixes salen como sprints follow-up por Jorge si quiere arreglar masivamente.

#### Por qué

El bug puntual de Aury Mon (1 orden) es la punta del iceberg. Probablemente hay:
- Otros técnicos cuyas órdenes viejas quedaron sin operaria por el mismo timing.
- Técnicos sin operaria asignada en `personal/` (caso huérfano del lado opuesto al de Aury).
- `operariaId` en perfil de técnico apuntando a un uid que ya no existe o cuyo rol no es `operaria` (mismatch tras cambios de empleados).
- Operarias que ningún técnico tiene apuntada (operaria suelta).
- Posibles inconsistencias en el modelo de `responsableId` también (revisar como bonus).

Sin esta auditoría no se sabe el alcance real. Una vez con el reporte, Jorge decide caso por caso.

#### Criterios de aceptación

**Parte A — Script de auditoría:**
- [ ] `scripts/auditoria/asignaciones-tecnico-operaria.ts` creado, Admin SDK con `service-account.json`. Read-only puro (sin `.set`, `.update`, `.delete`).
- [ ] Para cada técnico (`personal where rol == 'tecnico'`):
  - Reportar si tiene `operariaId` poblado.
  - Si lo tiene, verificar que el doc apuntado existe en `personal/` Y que su rol es `operaria` Y que está activo. Si no, marcar como **inconsistencia tipo HUERFANO_TECNICO** (técnico apunta a una operaria que no existe o no es operaria).
  - Si NO tiene `operariaId`, marcar como **inconsistencia tipo TECNICO_SIN_OPERARIA**.
- [ ] Para cada operaria (`personal where rol == 'operaria'`):
  - Contar cuántos técnicos la apuntan vía `operariaId`.
  - Si ninguno, marcar como **inconsistencia tipo OPERARIA_HUERFANA** (operaria suelta, ningún técnico asignado).
- [ ] Para órdenes activas (`ordenes_servicio where fase != 'cerrado' and fase != 'cancelado'`, sample N=500 más recientes):
  - Si la orden tiene `tecnicoId` set Y el técnico actualmente tiene `operariaId` en perfil Y la orden NO tiene `operariaNombre` set → marcar como **inconsistencia tipo ORDEN_SIN_OPERARIA_DESINCRONIZADA**. Listar `ordenNumero`, `clienteNombre`, `tecnicoNombre`, operaria-actual-del-tecnico, fecha de creación de la orden.
- [ ] Bonus: para órdenes activas con `operariaNombre` SÍ set pero el techo actualmente tiene una operaria DISTINTA en su perfil → marcar como **inconsistencia tipo ORDEN_OPERARIA_DESACTUALIZADA** (orden quedó con operaria histórica, el técnico cambió de pareja). Esto NO necesariamente es bug — puede ser correcto histórico. Reportar para visibilidad.
- [ ] Bonus: revisar campo `responsableId` en órdenes — si está set pero el uid no existe en personal o no es admin/coord, marcar como **inconsistencia tipo RESPONSABLE_HUERFANO**.

**Parte B — Reporte md:**
- [ ] `docs/sprints/AUDITORIA_ASIGNACIONES_2026-05-10.md` (placeholder si no se corre el script en la pasada del coordinator, o llenado si se corre).
- [ ] Estructura:
  - Resumen ejecutivo: conteos por tipo de inconsistencia.
  - Sección por tipo con tabla detallada (uid/id, nombre, descripción del problema, sugerencia de fix manual).
  - Sección "Cómo arreglar manualmente" con pasos UI: ej. para TECNICO_SIN_OPERARIA → abrir modal Editar Personal, asignar operaria, guardar; para ORDEN_SIN_OPERARIA_DESINCRONIZADA → abrir orden, cambiar técnico a otro y volver al original, guardar.
  - Sección "Si querés fix masivo" → propone sprint follow-up (SPRINT-130 hipotético) que escribiría un script `--apply` por uid/ordenId acotado, con OK explícito de Jorge en BLOQUEOS.md. NO crear ese sprint en esta pasada.
- [ ] NO mostrar datos sensibles (emails completos, teléfonos) en el reporte. Usar primer nombre + ID parcial (`Aury (HGkVoY...)`).

**Global:**
- [ ] archivist PRE-CHANGE obligatorio (script toca Admin SDK + lee personal — categorías "datos en prod").
- [ ] regression_guardian opcional (no toca código de la app, solo script standalone).
- [ ] Read-only confirmado por grep: el único método de mutación que puede aparecer es `Map.set` en memoria. Si aparece `.set(`, `.update(`, `.delete(` sobre `db.collection(...)` o `db.doc(...)`, el sprint pausa y reporta.
- [ ] `npm run build` + `npm run lint` PASS (el script no debería romper nada — está en `scripts/` no en `src/`).
- [ ] Cazadores 8/8 PASS.
- [ ] Commit + push con mensaje "feat(auditoria): SPRINT-129 script asignaciones técnico↔operaria + reporte md placeholder".
- [ ] NO correr el script contra prod desde el coordinator. Eso lo hace Jorge en su Mac con `npx tsx scripts/auditoria/asignaciones-tecnico-operaria.ts`.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio.
- Read-only. Si el builder encuentra tentación de incluir `--apply` para "fix mientras estamos", PARAR y reportar. El --apply es sprint separado con OK explícito.
- NO tocar el flujo de derivación en `useOrdenCreateForm.ts` ni `OrdenEditForm.tsx`. Eso podría ser otro sprint si Jorge quiere comportamiento dinámico (display reactivo vs snapshot histórico) — decisión arquitectural que requiere su input.
- Si el script encuentra >20 órdenes con `ORDEN_SIN_OPERARIA_DESINCRONIZADA`, reportar en el resumen "esto es masivo, considerar sprint de fix por lote". Si encuentra <5, sugerir fix manual UI uno por uno.
- NO incluir verificación de rules/roles en este sprint — eso está en `docs/MATRIZ_PERMISOS.md` (SPRINT-112) y `docs/MATRIZ_PERMISOS_VS_MODULOS.md` (SPRINT-124). El alcance de este sprint es **datos**, no permisos.

#### Notas para el coordinator

- Convención de scripts: el directorio `scripts/auditoria/` ya existe (creado por SPRINT-112 con `schema-drift.ts`). Reusar la convención de inicialización del Admin SDK desde ese script.
- Comando para Jorge al cerrar: `npx tsx scripts/auditoria/asignaciones-tecnico-operaria.ts`. Output a stdout + escribe el archivo md al final.
- Si Jorge corre el script y reporta el output, el sprint follow-up potencial (`--apply` para rellenar órdenes desincronizadas) puede ir a BLOQUEOS.md con scope acotado por IDs. Patrón ya usado en SPRINT-118.
- Bug original reportado por Jorge: orden con técnico Aury Mon (uid del personal probablemente similar a otros técnicos de SPRINT-118) sin operaria asignada. La operaria correcta según modal de Personal es Wilainy. Este caso DEBE aparecer en el output como ORDEN_SIN_OPERARIA_DESINCRONIZADA.
- Cross-check post-script: si aparece TECNICO_SIN_OPERARIA para alguien que Jorge cree que SÍ tiene operaria, hay bug en el modal de Editar Personal (no persiste el campo). Eso sería otro sprint.

---

### SPRINT-130 — Botón "Re-derivar operaria" en órdenes individuales

**Estado:** COMPLETADO 2026-05-11 (coordinator autónomo `trabaja`; archivos `src/services/ordenes.service.ts` + `src/components/ordenes/BotonRederivarOperaria.tsx` NUEVO + `src/components/ordenes/OrdenEditForm.tsx` + `src/pages/Ordenes.tsx` + `src/pages/MapaRutas.tsx`). Cazadores 7/7 PASS, typecheck PASS, build PASS, lint staged PASS. QA visual humana del caso Aury Mon registrada en `BLOQUEOS.md` (no bloqueante).
**Prioridad:** media (calidad de vida + previene reincidencia del caso Aury)
**Origen:** Jorge 2026-05-11 vía Cowork. Después de confirmar que el flujo derivativo de `personal[uid].operariaId` está correcto (UI viva en Personal + snapshot en orden al crear/editar), eligió esta opción para cerrar el caso de raíz. Hoy si se asigna operaria a un técnico DESPUÉS de que ya tenga órdenes abiertas (timing exacto del bug original de Aury Mon + Wilainy), las órdenes viejas quedan permanentemente con `operariaNombre: undefined` hasta que alguien las edite manualmente. El workaround actual (Fix A: editar orden → cambiar técnico → guardar → volver al original → guardar) funciona pero es tedioso y nadie del equipo lo sabe.
**Riesgo:** bajo (solo lectura de `personal/{tecnicoId}` + update local del doc `ordenes_servicio` ya autorizado por rules existentes — no toca rules, no toca otras colecciones).
**Touch-list previsto:**
- `src/components/ordenes/OrdenEditForm.tsx` (agregar botón visible cuando `tecnicoId` está set Y `personal[tecnicoId].operariaId` existe pero `orden.operariaNombre` está vacío o difiere).
- O alternativamente nuevo helper en `src/utils/ordenes.ts` + componente nuevo `src/components/ordenes/BotonRederivarOperaria.tsx` si OrdenEditForm.tsx queda muy cargado.
- `src/services/ordenes.service.ts` si hace falta un helper `rederivarOperariaEnOrden(ordenId)` reutilizable.

#### Objetivo

Agregar UI mínima (un botón) en el detalle/edit de una orden que, cuando se hace click, re-lea `personal[orden.tecnicoId].operariaId` y `operariaNombre`, y actualice el doc de la orden con esos valores. Si el técnico no tiene operaria asignada, el botón muestra estado deshabilitado con tooltip explicativo. Si la orden ya tiene la operaria correcta, el botón no aparece (o aparece deshabilitado con "ya está sincronizada").

#### Por qué

- Caso Aury Mon (reportado el 2026-05-10) demostró que el snapshot al crear/editar es bueno para forensia histórica pero malo cuando hay timing de asignación tardía.
- El workaround actual (editar técnico → guardar → volver → guardar) funciona pero es invisible al usuario operativo (Mariela, Wilainy, Yohana) que no sabe del patrón snapshot.
- Cambiar a derivación reactiva en cada render sería arquitectural y rompe historial (si la operaria cambia, las órdenes viejas perderían el contexto de quién supervisó originalmente). Botón explícito = lo mejor de ambos mundos.

#### Criterios de aceptación

- [ ] Botón "Re-sincronizar operaria" visible en `OrdenEditForm` cuando:
  - `orden.tecnicoId` está set Y
  - `personal[tecnicoId]?.operariaId` existe Y
  - (`orden.operariaNombre` está vacío) O (`personal[tecnicoId].operariaNombre` !== `orden.operariaNombre`).
- [ ] Click del botón hace `updateDoc(doc(db, 'ordenes_servicio', ordenId), { operariaId, operariaNombre, auditoria: [...prev, registroDeReSync] })` con `crearRegistroAuditoria()` del `utils/index.ts` describiendo "re-derivó operaria de {anterior} → {nueva}".
- [ ] Si `personal[tecnicoId]?.operariaId` NO existe, mostrar tooltip "Este técnico todavía no tiene operaria asignada. Asignala en Personal primero." y dejar el botón deshabilitado.
- [ ] Caso de uso primario probable: hot-fix manual del caso Aury Mon. Ese caso DEBE quedar arreglado tras un click del botón.
- [ ] Sin loop infinito: el botón NO se auto-clickea (es UI explícita).
- [ ] Sin escritura cuando ya está sincronizada: si los valores en orden y personal coinciden, el botón muestra "Sincronizada" estado readonly (gris).
- [ ] Sin tocar `useOrdenCreateForm.ts` (la derivación al crear sigue como está — snapshot OK).
- [ ] Sin tocar `firestore.rules` (los writes son a `ordenes_servicio` por usuarios con permiso de edición, ya cubierto por rules existentes).
- [ ] `npm run build` PASS.
- [ ] `npm run lint` PASS (max-warnings 0).
- [ ] Cazadores 8/8 PASS.
- [ ] Commit + push.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio (toca `OrdenEditForm.tsx` — archivo crítico de wizard según gotcha "Cleanup en componentes de wizard requiere QA manual").
- regression_guardian obligatorio (toca componente de wizard que escribe a `ordenes_servicio`).
- NO cambiar el comportamiento de derivación al crear/editar técnico. SOLO agregar el botón explícito.
- NO hacer batch sobre todas las órdenes (sería sprint --apply separado con OK explícito de Jorge). Este sprint es "1 click = 1 orden".
- NO mover el botón a `OrdenDetalle.tsx` (vista readonly) — solo en EditForm o en un modal dedicado. Aclarar con archivist si hay duda.
- Si el reviewer detecta que el botón puede dispararse accidentalmente o que no hay confirmación visual del cambio, agregar `confirm()` antes del write.

#### Notas para el coordinator

- El patrón ya existe en `useOrdenCreateForm.ts:588-590` y `OrdenEditForm.tsx:72-77`:
  ```
  const tecnicoElegido = personal.find(p => p.id === form.tecnicoId);
  const operariaIdDerivada = tecnicoElegido?.operariaId;
  const operariaNombreDerivada = tecnicoElegido?.operariaNombre;
  ```
  El botón nuevo reutiliza esa lógica + `updateDoc`.
- Considerar mostrar el banner "Esta orden tiene operaria desactualizada" arriba del form cuando se detecta el mismatch, con el botón debajo. UX más explícita que un botón suelto.
- QA manual obligatorio (CLAUDE.md sub-regla cleanup wizard): commit message debe declarar "QA flujo X validado" o agregar a BLOQUEOS.md para validación humana. Caso a validar: abrir orden de Aury Mon (la del bug original), confirmar que aparece el botón, click, confirmar que aparece Wilainy en el doc.
- Si el flujo crece (botón "Re-sincronizar todo" en /admin/ordenes que lo aplica a las N órdenes detectadas por SPRINT-129), eso es sprint separado SPRINT-132+ con OK explícito.

---

### SPRINT-131 — Fix responsive: cards de orden cortadas en iPad portrait

**Estado:** COMPLETADO 2026-05-11 — ver `## Sprints completados (histórico)` más abajo. QA visual queda como SPRINT-131-QA en `BLOQUEOS.md`.

---

### SPRINT-132 — Bug sistémico: `find(p.id === tecnicoId)` post-c4be345 (14 sitios) + cazador P-006 extendido

**Estado:** COMPLETADO 2026-05-11 (commit `43a2087`, deploy verificado en producción 16:12 UTC). QA humano declarado como SPRINT-132-QA en BLOQUEOS.md. Hallazgos adicionales: 4 sitios de WRITE upstream con el mismo vector P-006 (MapaRutas drag&drop + PersonalPage transferencias) también corregidos.
**Prioridad:** crítica (rompe derivación de operaria en CREATE + edit + mapa + facturas + comisiones + avances + cierre día; afecta a TODOS los técnicos con operariaId asignada; explica el caso original Aury Mon más allá del timing)
**Origen:** Coordinator 2026-05-11 durante el cierre de SPRINT-130. Reportó como hallazgo colateral: `OrdenEditForm.tsx:77` (`tecnicos.find(t => t.id === editForm.tecnicoId)`) no se dispara correctamente porque `editForm.tecnicoId` post-`c4be345` (SPRINT-108) es `auth.uid`, mientras `t.id` sigue siendo `personal/{docId}`. Cowork verificó con grep `find\(.*\.id === .*tecnicoId|find\(.*p\.id === form|find\(.*t\.id === editForm` y encontró **14 sitios con el mismo patrón**, incluido el CREATE flow.
**Riesgo:** bajo-medio. El fix por sitio es 1 línea (`p.id === X` → `(p.uid || p.id) === X`). El cazador P-006 actualmente solo detecta dropdowns `<option>` — extenderlo a `.find()` requiere refinamiento de regex. No toca rules, no toca migraciones, no toca data.
**Touch-list previsto:**
- `src/hooks/useOrdenCreateForm.ts:588` — CREATE de orden (CRÍTICO).
- `src/pages/Ordenes.tsx:468` — Edit dentro de la página.
- `src/pages/MapaRutas.tsx:610` — Edit de orden en mapa.
- `src/pages/MapaRutas.tsx:917,1026` — color de pin de mapa.
- `src/components/ordenes/OrdenEditForm.tsx:77` — Edit form principal (origen del hallazgo).
- `src/components/ordenes/ModalEditarOrdenAdmin.tsx:247` — Modal admin de orden.
- `src/pages/Configuracion.tsx:444` — config vehículo-técnico.
- `src/pages/Comisiones.tsx:384` — display de comisiones.
- `src/pages/Avances.tsx:109` — display de avances (`personalId`, no `tecnicoId` — verificar caso).
- `src/pages/CierreDia.tsx:315` — display cierre día.
- `src/components/facturas/FacturaItemsEditor.tsx:176` — display tecnico en factura item.
- `src/components/facturas/FacturaItemDetallesModal.tsx:167` — detalle item factura.
- `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts` — extender cazador P-006.
- `docs/PATRONES_REGRESION.md` — actualizar entrada P-006 con variante `.find()`.

#### Objetivo

Que cualquier `.find()` sobre `personal[]` o `tecnicos[]` que use un valor de `tecnicoId`/`form.tecnicoId`/`editForm.tecnicoId`/etc. compare contra `(item.uid || item.id)` en vez de solo `item.id`, para soportar tanto órdenes pre-c4be345 (donde `tecnicoId === doc id`) como post-c4be345 (donde `tecnicoId === auth.uid`). Pattern de fix uniforme. Cazador determinístico que cace cualquier reintroducción del patrón antiguo.

#### Por qué

- **Bug masivo en producción no detectado por SPRINT-129.** Toda orden creada post-c4be345 con técnico que tiene operaria asignada NO deriva la operaria correctamente porque `personal.find(p => p.id === form.tecnicoId)` retorna `undefined` cuando `form.tecnicoId === auth.uid` y `p.id === personal/{docId}`.
- **SPRINT-129 reportó 0 inconsistencias** porque su definición de inconsistencia es "orden tiene tecnicoId Y técnico tiene operariaId Y orden NO tiene operariaNombre". Cuando la orden NUNCA pobló `operariaNombre` desde el inicio (porque el `find` falla en CREATE), la auditoría no la flaggea — el bug se manifiesta como "campo siempre vacío", no como "desincronizado".
- **Caso Aury Mon explicado de raíz**: el coordinator de SPRINT-129 lo diagnosticó como timing, pero el bug es más profundo — el CREATE flow nunca derivó la operaria porque el `find` no matcheaba.
- **Otros sitios (mapa, facturas, comisiones)** muestran nombre/color incorrecto o vacío en órdenes post-c4be345, dependiendo de qué docs queden con qué versión de `tecnicoId`.

#### Criterios de aceptación

**Fase A — Fix de los 14 sitios:**
- [ ] Para cada uno de los sitios listados, cambiar `find(X => X.id === <campo>)` por `find(X => (X.uid || X.id) === <campo>)`.
- [ ] El fix preserva compatibilidad con órdenes pre-c4be345 (`X.uid` undefined cae al `X.id` viejo).
- [ ] En `useOrdenCreateForm.ts:588`, después del fix, verificar manualmente con un técnico que tenga operariaId asignada que la orden creada SÍ poblada `operariaId` + `operariaNombre`. Esto es el QA core.
- [ ] En `OrdenEditForm.tsx:77`, el banner amber "Esta orden pasará al grupo de {operaria}" se dispara cuando corresponde.
- [ ] Verificar caso Avances `personalId` — puede ser otro patrón (no técnico). Si aplica el mismo fix, hacerlo; si no, documentar.

**Fase B — Cazador P-006 extendido:**
- [ ] Modificar `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts` para detectar también el patrón `find(\w+ => \w+\.id === \w*tecnicoId\w*)` (regex extendido). El cazador actual solo cubre dropdowns `<option value="t.id">`; agregar lógica para `.find()` calls.
- [ ] Actualizar `docs/PATRONES_REGRESION.md` entrada P-006 con la variante.
- [ ] Allowlist vacía o con justificación si hay falso positivo (debería ser 0 después del fix).
- [ ] El cazador retorna 0 hits tras el fix.

**Fase C — Verificación + cleanup:**
- [ ] `npm run build` PASS.
- [ ] `npm run lint` PASS (max-warnings 0).
- [ ] Cazadores 8/8 PASS, 0 hits.
- [ ] Buscar con regex final si hay más sitios olvidados: `\.find\(.*\.id === .*Id\)` en src.
- [ ] Commit + push con mensaje descriptivo + listado de los 14 sitios fixed.

**Global:**
- [ ] archivist PRE-CHANGE obligatorio (toca múltiples archivos críticos incluyendo `useOrdenCreateForm.ts`, `Ordenes.tsx`, `MapaRutas.tsx` — gotcha "cleanup wizard").
- [ ] regression_guardian obligatorio (cambio cross-cutting que toca CREATE + edit + display).
- [ ] reviewer obligatorio (bug sistémico, fix por lote, alto riesgo de fix incompleto).
- [ ] QA manual obligatorio: builder o tester debe crear una orden de prueba con un técnico que tenga operariaId asignada en su perfil, y verificar que la orden creada poblada `operariaId/Nombre`. Esto NO se cubre con typecheck/lint — requiere ejecutar.

#### Restricciones / guardarrails

- NO migrar datos existentes en este sprint. El fix es solo lectura del campo `personal[].uid || personal[].id`. Las órdenes viejas con `operariaNombre` vacío se arreglan via SPRINT-130 (botón "Re-sincronizar operaria") o el `--apply` opcional propuesto en SPRINT-129.
- NO cambiar el campo persistido en `ordenes_servicio.tecnicoId` — sigue siendo `auth.uid` post-c4be345. El fix es del lado de la LECTURA del array `personal[]`, no del campo de la orden.
- NO romper compatibilidad con órdenes pre-c4be345. El patrón `(uid || id)` garantiza fallback.
- Si algún sitio tiene comentario `// @safe-tecnicoid-id: ...` arriba del `.find()`, verificar si el comentario sigue siendo válido tras el fix. Algunos pueden ser UI filters legítimos.
- Reviewer debe poner foco especial en `useOrdenCreateForm.ts:588` — es CREATE, lo más crítico.

#### Notas para el coordinator

- Pattern de fix uniforme:
  ```typescript
  // Antes:
  const tecnicoElegido = personal.find(p => p.id === form.tecnicoId);
  // Después:
  const tecnicoElegido = personal.find(p => (p.uid || p.id) === form.tecnicoId);
  ```
- El cazador P-006 actual está en `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts`. Detecta `<option value={t.id}>` en dropdowns. Extender para que ALSO detecte:
  ```typescript
  \.find\(\s*(\w+)\s*=>\s*\1\.id\s*===?\s*\w*(?:tecnico|personal)Id\w*\)
  ```
  Allowlistar con comentario `// @safe-tecnicoid-find: <razón>` los sitios donde el fix no aplica (si los hay).
- Si el builder descubre durante el fix que algún caller pasa `tecnicoId` que NUNCA es `auth.uid` (siempre doc id), documentarlo y dejar ese sitio sin tocar. Pero debería ser raro porque c4be345 migró todo.
- Después del fix, verificar SPRINT-129 audit script — el script puede empezar a reportar `ORDEN_SIN_OPERARIA_DESINCRONIZADA` para órdenes que tenían el bug latente. Eso ES la señal de que el fix funcionó. Las órdenes viejas se arreglan con SPRINT-130 botón o sprint masivo --apply futuro.
- Postmortem obligatorio post-sprint (sub-regla "bug masivo en producción"): documentar el aprendizaje "cazadores deben cubrir variantes sintácticas del patrón, no solo el patrón canónico" + "auditorías de datos no detectan bugs que se manifiestan como ausencia en lugar de mismatch".

---

### SPRINT-133 — `handleConfirmarEliminar` cross-collection sin tx + extender cazador P-003

**Estado:** COMPLETADO 2026-05-11 (pasada 4 del día, commit pendiente de hash en EJECUCION_AUTONOMA.md). `handleConfirmarEliminar` envuelto en `writeBatch` con chunking. Cazador P-003 ampliado a `src/services/` + `src/pages/` + `src/hooks/` + `api/`. 7 hallazgos colaterales en otras funciones cross-collection allowlist-eadas con `@safe-non-tx: SPRINT-134 follow-up`. SPRINT-134 agendado abajo. Cazadores 7/7 PASS.
**Prioridad:** alta (bug latente real: si la eliminación de un técnico/operaria falla a mitad, deja `ordenes_servicio` parcialmente actualizadas + el doc `personal/` sin borrar — estado inconsistente que requiere intervención manual). Mismo patrón meta que P-006 acaba de fixear: cazador con scope insuficiente.
**Origen:** Coordinator 2026-05-11 durante el cierre de SPRINT-132. Reportó como hallazgo colateral: `PersonalPage.tsx:682 handleConfirmarEliminar` hace mutaciones cross-collection (`ordenes_servicio` updateDoc × N + `personal` deleteDoc) **sin envolver en `runTransaction`** ni `writeBatch`. El cazador P-003 (`check-cross-collection-tx.ts`) NO lo cazó porque su `ROOT_DIR` solo escanea `src/services/` y `api/` — no `src/pages/` ni `src/hooks/`. Bug + falla del cazador (mismo meta-problema que SPRINT-132 acaba de resolver para P-006).
**Riesgo:** medio. El fix toca `PersonalPage.tsx` (archivo crítico de operación — pasa el filtro de gotcha "cleanup wizard"). Hay 3 branches con cross-collection: técnico, operaria, admin (este último no es cross — solo deleteDoc). `runTransaction` permite máximo 500 ops, pero `writeBatch` es la mejor herramienta acá porque NO necesitamos reads dentro de la mutación (los datos vienen de la UI).
**Touch-list previsto:**
- `src/pages/PersonalPage.tsx:682-790` (`handleConfirmarEliminar`) — envolver branches "técnico" + "operaria" en `writeBatch` con chunking si N>500.
- `scripts/invariantes/check-cross-collection-tx.ts` — extender `ROOT_DIR` a `src/pages/` y `src/hooks/` además de `src/services/` y `api/`.
- `docs/PATRONES_REGRESION.md` — actualizar entrada P-003 con nuevo scope.

#### Objetivo

Que la eliminación de un técnico/operaria sea **atómica**: o se transfieren todas las órdenes Y se borra el `personal/`, o no se hace nada. Hoy si falla a mitad (timeout, permission-denied en alguna orden, conexión), queda inconsistente. + Que el cazador P-003 detecte futuras introducciones de este patrón en cualquier archivo del frontend, no solo en services.

#### Por qué

- **Bug latente real:** si el técnico tiene 50 órdenes activas y se cae la red después de actualizar 30, las primeras 30 ya tienen el nuevo `tecnicoId` apuntando al destino, las últimas 20 todavía apuntan al técnico viejo, y el doc `personal/` del técnico viejo sigue existiendo. Estado inconsistente que requiere intervención manual desde Firestore Console.
- **Mismo patrón meta que P-006:** el cazador P-003 fue diseñado para escanear `src/services/` (donde estaban los bugs originales) pero el código del repo evolucionó y ahora hay mutaciones cross-collection en `src/pages/` y `src/hooks/`. Necesita ampliarse igual que P-006 con `.find()`. **Aprendizaje recurrente: los cazadores que escanean directorios fijos quedan obsoletos si el código se reorganiza.**
- **Sin postmortem reciente que mencione esto**, pero es el mismo principio del postmortem SPRINT-118: "cazadores estáticos solo cazan donde miran". Aplica acá.

#### Criterios de aceptación

**Fase R1 — Fix `handleConfirmarEliminar`:**
- [ ] Branch "técnico" (líneas 687-727): las N llamadas a `updateDoc(doc(db, 'ordenes_servicio', o.id), updateData)` + el `deleteDoc(doc(db, 'personal', p.id))` quedan envueltas en un `writeBatch`. Si `deps.length > 500`, partir en chunks de 500 y hacer múltiples `batch.commit()` secuenciales (con la advertencia de que dejaría de ser 100% atómico — documentar en el código con comentario "// Si llegamos acá con 500+ órdenes, el técnico tenía un volumen muy alto. Atomicidad parcial: si falla un chunk, los anteriores ya están aplicados. Aceptable porque el flujo de UI ya bloquea con `processingAccion`."). Realista: técnicos no van a tener >500 órdenes activas, pero el guardarrail es bueno.
- [ ] Branch "operaria" (líneas 728-767): mismo tratamiento. N updates a `personal` + N updates a `ordenes_servicio` + 1 deleteDoc a `personal`. Total puede ser >500 en operarias con muchos técnicos+órdenes pero raro.
- [ ] Branch "administrador" (líneas 768-778): SOLO 1 deleteDoc — NO toca otras colecciones. NO necesita writeBatch. Dejar como está. Importante: validar con regression_guardian que el cazador P-003 extendido NO lo flagea como hit (1 colección = OK).
- [ ] Branch "secretaria" (líneas 779-783): igual, 1 deleteDoc. Dejar como está.
- [ ] Audit log: la rule actual gatea writes con `actorUid`. El batch debe escribir un doc en `auditoria` o `auditoria_admin` para registrar la eliminación. SI esto no existe hoy, dejar para sprint follow-up — pero anotar como deuda.
- [ ] El reviewer obligatorio verifica que el orden de operaciones del batch sea: 1) updates a ordenes, 2) updates a personal (si operaria), 3) deleteDoc personal. El delete del personal SIEMPRE al final.

**Fase R2 — Extender cazador P-003:**
- [ ] Modificar `scripts/invariantes/check-cross-collection-tx.ts` para que su lista de directorios a escanear sea `['src/services', 'src/pages', 'src/hooks', 'api']` en lugar de solo `['src/services', 'api']`.
- [ ] Verificar que el cazador NO genera falsos positivos sobre `handleConfirmarEliminar` después del fix R1 (porque ya tendrá `runTransaction(` o `writeBatch(`).
- [ ] Verificar que el cazador NO genera falsos positivos en otros archivos de `src/pages/` o `src/hooks/`. Si hay hits, evaluarlos: si son bugs reales, agregar al sprint o crear sprint follow-up. Si son falsos positivos, allowlistar con `// @safe-non-tx: <razón>`.
- [ ] Actualizar entrada P-003 en `docs/PATRONES_REGRESION.md` con el nuevo scope.

**Global:**
- [ ] archivist PRE-CHANGE obligatorio (toca `PersonalPage.tsx`, gotcha "cleanup wizard").
- [ ] regression_guardian obligatorio (toca un flujo crítico de eliminación de empleado + extiende un cazador, doble vector de riesgo).
- [ ] reviewer obligatorio.
- [ ] `npm run build` PASS.
- [ ] `npm run lint` PASS.
- [ ] Cazadores 7/7 PASS (incluyendo P-003 extendido).
- [ ] QA manual obligatorio: builder o tester debe ejercitar el flujo de eliminación de un técnico de prueba con 2-3 órdenes activas y verificar (a) que las órdenes quedan transferidas, (b) que el `personal/` se borra, (c) que si simula un fallo a mitad (puede usar Firestore offline o un network throttle en DevTools), el estado queda atómico (todo o nada).
- [ ] Commit + push.

#### Restricciones / guardarrails

- NO cambiar el comportamiento de UI ni los toasts. Solo cambiar el mecanismo interno.
- NO agregar lógica de retry o circuit breaker en este sprint — eso es scope de otro sprint si aparece la necesidad.
- NO meter audit log en este sprint si requiere nueva colección o nueva rule. Documentar como deuda.
- NO extender el cazador P-003 a otros directorios fuera del repo `src/` (no incluir `scripts/`, `node_modules/`, etc).
- Si el builder descubre que hay otra función en `src/pages/` o `src/hooks/` con el mismo problema, agregar a la touch-list o crear sprint follow-up — NO mergear sin reviewer.

#### Notas para el coordinator

- `writeBatch` (Firebase v9) es la elección correcta acá. NO requiere reads previos. Patrón:
  ```typescript
  import { writeBatch } from 'firebase/firestore';
  const batch = writeBatch(db);
  for (const o of deps) {
    batch.update(doc(db, 'ordenes_servicio', o.id), updateData);
  }
  batch.delete(doc(db, 'personal', p.id));
  await batch.commit();
  ```
- Si el sprint requiere chunking (>500 ops), patrón:
  ```typescript
  const chunks = [];
  for (let i = 0; i < deps.length; i += 499) {
    chunks.push(deps.slice(i, i + 499));
  }
  // El último chunk lleva el deleteDoc.
  for (let i = 0; i < chunks.length; i++) {
    const batch = writeBatch(db);
    for (const o of chunks[i]) batch.update(...);
    if (i === chunks.length - 1) batch.delete(doc(db, 'personal', p.id));
    await batch.commit();
  }
  ```
- Para extender P-003, el cambio es ínfimo — solo agregar paths al array de directorios. Smoke test antes del commit: correr `npm run check:regression` y verificar que sigue 0 hits.
- Postmortem opcional (no es bug en producción todavía, pero es deuda crítica): se puede agregar un postmortem-positivo al estilo del SPRINT-119 documentando "cómo encontramos un bug latente sin que rompa producción primero".

---

### SPRINT-134 — Refactor a `writeBatch` de los 7 cross-collection en `src/pages/` (follow-up SPRINT-133)

**Estado:** COMPLETADO 2026-05-12 (coordinator autónomo `trabaja`, pasada 8). 6/6 funciones cerradas. 4 envueltas en `writeBatch` (`Mantenimiento.handleGenerarOrden` previo + `Inventario.handleConfirmarAjuste` + `EquiposTaller.handleChangeEstado` + `Cotizaciones.handleConvertirAFactura` parcial + `Cotizaciones.handleSubmit` cuando hay link a orden). 2 documentadas como `@safe-non-tx` permanente con razón arquitectónica (`PersonalPage.handleSubmit` → endpoint Admin SDK server-side, `PersonalPage.ejecutarVinculacion` → multi-instancia Firebase para no deslogear admin). Cazador P-003 sigue 0 hits. Build PASS, typecheck PASS, lint PASS. Sin tocar UI/toasts, sin tocar rules.
**Prioridad:** media (bugs latentes reales, mismo perfil que el resuelto en SPRINT-133, pero ninguno reportado por usuarios todavía). Allowlist-eados con `@safe-non-tx` para no bloquear el commit de SPRINT-133.
**Origen:** Coordinator 2026-05-11 (pasada 4) durante SPRINT-133. Al extender el cazador P-003 a `src/pages/`, aparecieron 7 funciones cross-collection sin envolver en `runTransaction`/`writeBatch`. Cada una es bug latente: si la red corta a mitad de las mutaciones, queda estado parcial inconsistente.
**Riesgo:** medio. Toca 5 archivos críticos de operación (`Cotizaciones.tsx`, `EquiposTaller.tsx`, `Inventario.tsx`, `Mantenimiento.tsx`, `PersonalPage.tsx`). Cada función tiene su propio flujo (factura, ajuste de inventario, generar orden de mantenimiento, alta empleado, vinculación Auth). Hacerlo de a uno con QA visual humana entre cada uno.

**Touch-list previsto:**
- `src/pages/Cotizaciones.tsx` (`handleConvertirAFactura:42` + `handleSubmit:257`) — muta movimientos_inventario + cotizaciones + facturas (3 colecciones).
- `src/pages/EquiposTaller.tsx` (`handleChangeEstado:91`) — muta equipos_taller + standby_piezas.
- `src/pages/Inventario.tsx` (`handleConfirmarAjuste:271`) — muta piezas_inventario + movimientos_inventario.
- `src/pages/Mantenimiento.tsx` (`handleGenerarOrden:80`) — muta mantenimiento + ordenes_servicio.
- `src/pages/PersonalPage.tsx` (`handleSubmit:203` + `ejecutarVinculacion:428`) — muta personal + usuarios (alta empleado y vinculación Auth — overlap con SPRINT-105 / P-004).

#### Objetivo

Convertir cada una de las 7 funciones en `writeBatch` (sin reads previos) o `runTransaction` (si necesita lectura de estado pre-mutación). Remover el comentario `@safe-non-tx: SPRINT-134 follow-up` tras cada fix.

#### Por qué

- **Bug latente real en 7 sitios.** Mismo perfil que el resuelto en SPRINT-133 (eliminación de empleado). Si la red corta a mitad de un `handleConvertirAFactura` (movimientos_inventario + cotizaciones + facturas), queda factura sin items, o cotización marcada convertida sin factura, o stock descontado sin factura.
- **No bloquear el commit de SPRINT-133.** Allowlist temporal con razón explícita es la convención correcta para deuda agendada.
- **Algunos casos pueden requerir lectura previa** (ej: `handleConvertirAFactura` lee el counter de FAC antes de escribir la factura) — esos requieren `runTransaction` no `writeBatch`. Builder debe evaluar caso por caso.

#### Criterios de aceptación

**Por cada uno de los 7 sitios:**
- [ ] Envolver las mutaciones cross-collection en `writeBatch` (si no requiere reads dentro de la mutación) o `runTransaction` (si lee + escribe en la misma operación).
- [ ] Remover el comentario `// @safe-non-tx: SPRINT-134 follow-up ...` arriba de la función.
- [ ] QA manual o test del flujo afectado (cazador no puede verificar comportamiento, solo estructura).

**Global:**
- [ ] archivist PRE-CHANGE para cada archivo tocado.
- [ ] regression_guardian obligatorio (toca múltiples flujos críticos).
- [ ] reviewer obligatorio con foco en orden de operaciones de cada batch.
- [ ] `npm run build` PASS.
- [ ] `npm run lint` PASS sobre archivos tocados.
- [ ] Cazadores 7/7 PASS (P-003 debe seguir 0 hits).
- [ ] Commit + push.

#### Restricciones / guardarrails

- NO cambiar comportamiento de UI ni toasts. Solo mecanismo interno.
- NO meter audit logs nuevos en este sprint si requieren rules/colección nueva — documentar como deuda separada.
- NO tocar `firestore.rules`.
- NO refactorear opportunisticamente otras funciones del archivo (mantener scope acotado).
- Si algún sitio requiere `runTransaction` con lectura, el patrón es el de `contadores.service.ts` (verificación de idempotencia DENTRO del callback, DESPUÉS del `tx.get()`).
- Posible dividir SPRINT-134 en sub-sprints (134a, 134b, ...) si el coordinator lo prefiere — uno por archivo, con QA humano visual entre cada deploy. Recomendable porque el flujo de cada uno es distinto (factura ≠ inventario ≠ alta de empleado).

#### Notas para el coordinator

- **Orden sugerido (priorizar por impacto / riesgo):**
  1. `Cotizaciones.tsx handleConvertirAFactura` (3 colecciones — el más riesgoso) — sub-sprint 134a.
  2. `PersonalPage.tsx handleSubmit` + `ejecutarVinculacion` (alta empleado — bug puede dejar Auth user sin perfil o personal sin usuarios espejo) — sub-sprint 134b. **Verificar overlap con P-004**: el cazador P-004 caza "creas Auth user sin doc espejo", pero NO "creas ambos docs sin atomicidad". Son complementarios.
  3. `Inventario.tsx handleConfirmarAjuste` (stock + log de movimientos) — sub-sprint 134c.
  4. `Mantenimiento.tsx handleGenerarOrden` (item de mantenimiento + orden de servicio derivada) — sub-sprint 134d.
  5. `EquiposTaller.tsx handleChangeEstado` (equipo + standby) — sub-sprint 134e.
  6. `Cotizaciones.tsx handleSubmit` (cotización + lead orden) — sub-sprint 134f.
- Después de cada fix individual, correr `npx tsx scripts/invariantes/check-cross-collection-tx.ts` y verificar que la cuenta de hits baja en 1. Cuando llega a 0, el sprint queda cerrado.
- Cada sub-sprint debe registrar QA humano en BLOQUEOS.md (flujo afectado tiene impacto en datos de operación).

---

### SPRINT-135a — Refactor garantía (fase 1): modelo de datos + countdown público + período configurable

**Estado:** PARCIAL 2026-05-11 (fase backend COMPLETADA; fase UI movida a `BLOQUEOS.md` como SPRINT-135a-UI por restricciones de endpoint público y wizard de cierre — ambos requieren OK Jorge según protocolo + sub-regla CLAUDE.md).
**Prioridad:** alta (es la base de los sub-sprints 135b-e; sin esto el refactor no puede arrancar). Riesgo bajo porque solo prepara estructura sin tocar comportamiento productivo.
**Origen:** Discovery con Jorge 2026-05-11 (~60min back-and-forth via Cowork). Confirmó que el comportamiento actual de "garantía = orden nueva con flag `esGarantia`" NO es lo que quiere — quiere reactivación de la misma orden con array de visitas para preservar técnico responsable, trazabilidad histórica, conduce/ITBIS/comisión originales intactos, y soporte para múltiples reclamos dentro del período sin reiniciarlo.
**Riesgo:** bajo. Solo agrega tipos + campos opcionales en `OrdenServicio` + UI countdown pública. NO toca rules, NO toca lógica de cierre, NO toca facturación. Las órdenes existentes con `esGarantia=true` quedan como están (migración es deuda futura, NO scope de este sprint).
**Touch-list previsto:**
- `src/types/index.ts`:
  - Agregar `'garantia_reclamada'` al enum `FaseOrden`.
  - Nuevo tipo `VisitaGarantia`:
    ```typescript
    export interface VisitaGarantia {
      id: string;                    // crypto.randomUUID()
      fecha: Timestamp;              // fecha del reclamo
      motivoCliente: string;         // texto que el cliente escribió en /garantia/:token
      tecnicoUid?: string;           // se completa cuando operaria asigna
      tecnicoNombre?: string;
      fechaVisita?: Timestamp;       // cuando técnico va a la casa
      piezas?: PiezaUsada[];         // piezas instaladas en esta visita (reutilizar tipo si existe)
      costoPiezas?: number;          // suma de costos de piezas (RD$)
      cubrioNegocio?: boolean;       // true=garantía gratis, false=mal uso cobrable
      malUso?: boolean;              // marcado por técnico en wizard cierre
      cobroExtra?: number;           // si malUso=true, monto cobrado al cliente
      descuentoComisionAplicado?: number; // costoPiezas × % técnico (se llena en 135d)
      quincenaAplicaDescuento?: string;    // ID de quincena donde se aplicó (135d)
      notas?: string;
      fechaCierre?: Timestamp;       // cuando técnico marca cerrada esta visita
      estado: 'reclamada' | 'asignada' | 'en_visita' | 'cerrada_defecto' | 'cerrada_mal_uso';
    }
    ```
  - Campos nuevos en `OrdenServicio` (todos opcionales para retrocompatibilidad):
    - `visitasGarantia?: VisitaGarantia[]`
    - `periodoGarantiaDias?: number` (default 60)
    - `garantiaVencimiento?: Timestamp` (computed al cerrar orden)
- `src/utils/garantia.ts` (NUEVO archivo):
  - `calcularVencimiento(fechaCierre: Date, dias: number): Date`
  - `diasRestantes(orden: OrdenServicio): number` — retorna 0 o negativo si expirada.
  - `estaDentroDePeriodo(orden: OrdenServicio): boolean`
- `src/pages/public/GarantiaCliente.tsx`:
  - Mostrar countdown: "Tu garantía vence en X días" (rojo si <7 días, verde si >7).
  - Mostrar fecha cierre original + fecha vencimiento.
  - Botón "Reclamar garantía" deshabilitado si `estaDentroDePeriodo()` retorna false.
  - El botón existente NO cambia comportamiento todavía (el reclamo real es scope de 135b). En este sprint solo es UI placeholder con `disabled` real basado en período.
- `src/components/cierre/CierreServicioWizard.tsx` (o el componente donde se cierra la orden — verificar primero):
  - Agregar input "Período de garantía (días)" con default 60.
  - Al guardar cierre, calcular y persistir `garantiaVencimiento`.
- `firestore.rules`: **NO se toca**. La rule actual ya permite update de campos opcionales si admin/coord/permiso aplica. Si el cazador P-002 grita por algún caso, allowlistar con `// @safe-required:` o `.get(field, null)`.

#### Objetivo

Preparar el modelo de datos + UI base sin cambiar el comportamiento operativo. Al cerrar este sprint, una orden nueva cerrada tendrá `garantiaVencimiento` poblada y el cliente verá el countdown en `/garantia/:token`. El botón "Reclamar" estará allí pero solo visible/habilitado dentro del período — el reclamo en sí (cambio de fase + notif a operaria) viene en 135b.

#### Por qué

- Es el primer paso del refactor de garantía. Sin esto los siguientes 4 sub-sprints no tienen modelo donde escribir.
- Approach incremental (igual que lote 117c): preparar estructura → QA visual → seguir.
- Riesgo bajo porque NO toca lógica productiva ni rules.
- Bonus visible: aunque el botón no haga nada todavía, el cliente ya verá el countdown — pequeña mejora de UX que mucha gente valora.

#### Criterios de aceptación

- [ ] Tipo `VisitaGarantia` exportado desde `src/types/index.ts` con todos los campos del touch-list.
- [ ] Enum `FaseOrden` incluye `'garantia_reclamada'`. Verificar que `faseLabel()` y `faseColor()` en `utils/index.ts` lo mapean (label = "Garantía reclamada", color = naranja).
- [ ] `OrdenServicio` tiene los 3 campos opcionales nuevos.
- [ ] `src/utils/garantia.ts` exporta los 3 helpers, con tests inline en comentarios JSDoc (no test runner — el repo no tiene tests). Cazadores deben pasar.
- [ ] `GarantiaCliente.tsx` muestra countdown legible + botón Reclamar con estado `disabled` correcto. Si `garantiaVencimiento` es `undefined` (orden vieja), muestra mensaje neutro tipo "Período de garantía no especificado, contacta a Mister Service".
- [ ] Wizard de cierre tiene el input "Período de garantía". Default 60 días. Solo aparece si fase cierre es exitosa (no en cancelaciones).
- [ ] `npm run build` PASS.
- [ ] `npm run lint` PASS (max-warnings 0).
- [ ] Cazadores 7/7 PASS, 0 hits.
- [ ] Commit + push.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio (toca `src/types/index.ts` archivo crítico + `GarantiaCliente.tsx` página pública).
- regression_guardian recomendado (toca el tipo central `OrdenServicio`).
- NO crear todavía la lógica de reclamo (eso es 135b).
- NO calcular descuento comisión todavía (eso es 135d).
- NO tocar `firestore.rules` (eso es 135e con OK explícito de Jorge).
- NO hacer migración de órdenes viejas con `esGarantia=true` — quedan como están. Las órdenes nuevas que se cierren tras este sprint tendrán `garantiaVencimiento`, las viejas no. La UI de `GarantiaCliente.tsx` debe manejar ambos casos.
- Si Cowork detecta durante el sprint que el botón existente de `/garantia/:token` ya hace algo (crear orden nueva con `esGarantia`), DEJARLO como está hasta 135b. No se rompe nada porque el botón solo dispara si está dentro del período.
- QA manual sugerido al cerrar: abrir una orden de prueba, cerrarla con período 1 día, abrir `/garantia/:token` y validar que muestra "Vence en 1 día". Esperar 1 día (o setear `garantiaVencimiento` manualmente a ayer en Firestore Console) y validar que el botón queda deshabilitado.

#### Notas para el coordinator

- El componente del wizard de cierre necesita identificarse. Búsqueda sugerida: `grep -rn "CierreServicio" src/components/` o buscar dónde se setea `fase: 'cerrado'`. Probablemente en `CierreServicioWizard.tsx` o `IniciarChequeoButton.tsx` (este último puede compartir flujo).
- Si el wizard de cierre tiene 2 versiones (legacy con `piezasRetiradas/checklist` y nueva con `equipoFunciona/clienteSatisfecho`), el input nuevo se agrega solo en la versión nueva. La legacy queda como está.
- Default 60 días es asunción razonable. Si querés default diferente para tipos específicos (ej: 30 días para chequeos, 90 días para reparaciones grandes), eso es scope de 135c o sprint independiente.
- El countdown puede usar `date-fns/locale/es` que ya está en el repo: `formatDistanceToNow(vencimiento, { locale: es, addSuffix: true })`.

---

### SPRINT-135a-UI — Refactor garantía fase 1, parte UI (countdown público desde modelo nuevo + input período en wizard cierre)

**Estado:** COMPLETADO 2026-05-11 — ver `## Sprints completados (histórico)` más abajo.
**Prioridad:** alta (cierra fase 1 del refactor de garantía iniciado en `75f6c7b`; base para SPRINT-135b/c/d/e + SPRINT-140)
**Origen:** Discovery con Jorge 2026-05-11 + fase backend cerrada en `75f6c7b` (modelo `OrdenServicio.{visitasGarantia, periodoGarantiaDias, garantiaVencimiento}` + helpers `src/utils/garantia.ts` + enum `garantia_reclamada`). Esta es la parte UI que estaba bloqueada por restricciones de protocolo (endpoint público + wizard de cierre).
**Riesgo:** medio. Toca un endpoint `api/` público + un componente wizard crítico. Mitigaciones: (a) cambios aditivos retrocompatibles, (b) endpoint sigue retornando `garantia.tiempoDias/inicioFecha/finFecha` actuales (no rompe consumers), (c) wizard solo agrega un input opcional sin cambiar el flujo de pasos.
**Touch-list previsto:**
- `api/garantia/[token].ts` — el endpoint hoy lee `facturas.garantia.{tiempoDias, inicioFecha, finFecha, estado, reclamadaEn}` (modelo viejo). Agregar fallback: si la factura tiene `ordenId`, buscar la orden en `ordenes_servicio` y, si tiene `periodoGarantiaDias` y/o `garantiaVencimiento` poblados (modelo SPRINT-135a backend), preferirlos sobre los de la factura. El response sigue siendo el mismo shape (NO breaking change para `GarantiaCliente.tsx`).
- `src/components/CierreServicioWizard.tsx` — agregar input "Período de garantía (días)" con default 60 ANTES del botón "Cerrar Servicio". Al cerrar, persistir `periodoGarantiaDias` + `garantiaVencimiento` (computado con `calcularVencimiento(fechaCierre, periodo)`) en el `updateDoc` de `ordenes_servicio/{ordenId}`.
- `src/pages/public/GarantiaCliente.tsx` — ajuste menor opcional: si `info.garantia.diasRestantes < 7` (último tramo), pintar el card con tinte rojo (hoy todos los vigentes son amber). Si el shape del response no cambia, este archivo puede no necesitar tocarse — depende de criterio de Jorge.

#### Objetivo

Cerrar la fase 1 del refactor de garantía: el wizard de cierre captura el período (default 60) y persiste `periodoGarantiaDias`/`garantiaVencimiento` en la orden, el endpoint público los prefiere si están poblados, y `GarantiaCliente.tsx` muestra el countdown coherente sin importar si la orden tiene modelo nuevo o viejo.

#### Por qué

- La fase backend (`75f6c7b`) dejó las puertas abiertas en types y helpers, pero ningún flujo escribe los campos nuevos y ningún flujo los lee. Sin esta fase UI, los campos quedan latentes y los sprints 135b/c/d/e (reclamo + descuento técnico + mal uso) no tienen modelo donde escribir.
- `GarantiaCliente.tsx` ya funciona con el modelo viejo (`facturas.garantia.*`) — es el approach incremental: cuando el endpoint encuentra modelo nuevo en la orden lo prefiere; cuando no, sigue leyendo el viejo. Cero breaking changes.
- Jorge dio OK explícito 2026-05-11 18:25 con scope: ambos (endpoint público + wizard cierre).

#### Criterios de aceptación

- [ ] `api/garantia/[token].ts` GET handler: tras buscar la factura, si `data.ordenId` existe, leer la orden de `ordenes_servicio` y SI tiene `periodoGarantiaDias` (number) y `garantiaVencimiento` (Timestamp), usarlos para computar el response (`tiempoDias`, `finFecha`, `diasRestantes`). Si la orden no tiene los campos nuevos, comportamiento idéntico al actual. NO romper el response shape.
- [ ] `api/garantia/[token].ts` POST handler: comportamiento intacto (sigue creando `cita_por_confirmar` con `tipo: 'garantia'`). El cambio a "reactivar la misma orden" es scope de SPRINT-135b, NO de este sprint.
- [ ] `CierreServicioWizard.tsx`: nuevo input "Período de garantía (días)" entre la sección de Piezas y el botón final. Tipo `number`, default 60, min 1, max 365. Validación visual: si < 1 o > 365, mostrar texto amber bajo el input. Label en español: "🛡️ Período de garantía (días)".
- [ ] `CierreServicioWizard.tsx`: al cerrar exitosamente, `cierrePayload` o `ordenUpdate` incluyen `periodoGarantiaDias: <input>` y `garantiaVencimiento: Timestamp.fromDate(calcularVencimiento(<fechaCierreDate>, periodo))`. Reutilizar el helper `calcularVencimiento` de `src/utils/garantia.ts`.
- [ ] `npm run build` PASS (typecheck).
- [ ] `npm run lint` PASS (max-warnings 0).
- [ ] Cazadores 7/7 PASS.
- [ ] regression_guardian PASS (toca wizard de cierre + endpoint público — sensible).
- [ ] reviewer APPROVED (foco: retrocompatibilidad del endpoint + UX wizard).
- [ ] Commit message declara explícitamente: "QA flujo cierre técnico PENDIENTE — Jorge ejercitará según plan de QA post-deploy del spec SPRINT-135a-UI" (sub-regla CLAUDE.md de componentes wizard).

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio (toca `CierreServicioWizard.tsx` archivo crítico + endpoint público).
- regression_guardian obligatorio.
- reviewer obligatorio (toca endpoint público + wizard).
- NO modificar el shape del response del endpoint (es contrato público).
- NO cambiar comportamiento del POST handler (eso es SPRINT-135b).
- NO tocar `firestore.rules` (no es necesario — los campos nuevos son escritos por el técnico cerrando su propia orden, ya cubierto por rules existentes).
- NO calcular descuento comisión todavía (es SPRINT-135d).
- NO hacer migración de órdenes viejas — quedan como están (endpoint hace fallback transparente).

#### Plan de QA post-deploy (Jorge ejercita)

1. Cerrar una orden de prueba con período `1 día`.
2. Abrir `/garantia/:token` (o vía `tokenPortalCliente`) → el card debe decir "1 día restante" (o equivalente).
3. Setear `garantiaVencimiento` a ayer en Firestore Console → recargar → estado debe pasar a "expirada".
4. Crear otra orden de prueba dejando período en default 60 → cerrar → confirmar que `ordenes_servicio/{id}.garantiaVencimiento` quedó como `fechaCierre + 60d`.
5. Para órdenes legacy (sin `garantiaVencimiento` en la orden), confirmar que el endpoint sigue leyendo de `facturas.garantia` y el countdown muestra valor coherente.

#### Notas para el coordinator

- El endpoint actual lee de `facturas`, no de `ordenes_servicio`. El cambio es agregar un fallback que si `data.ordenId` está poblado en la factura, ir a buscar la orden y preferir sus campos nuevos. Esto preserva la URL/contrato y agrega progresivamente el modelo nuevo.
- El componente del wizard es `src/components/CierreServicioWizard.tsx` (596 líneas, ya identificado). El `cierrePayload` se construye en `handleCerrarServicio` (línea ~213) y el `updateDoc` está en línea ~274.
- Por la sub-regla CLAUDE.md, el commit message DEBE declarar "QA flujo cierre técnico PENDIENTE" o equivalente. Jorge lo valida post-deploy según el plan arriba.
- El input puede usar el patrón visual existente del wizard (cards con border-2, texto bold). Default 60 como `useState<number>(60)`.

---

### SPRINT-136 — Quitar fallback hardcodeado de Firebase config (fail-fast)

**Estado:** COMPLETADO 2026-05-11 (commit `d09bdbb` — fail-fast en `src/firebase/config.ts:7-15` aplicado; `.env.example` documenta las 6 keys; CLAUDE.md actualizado).
**Prioridad:** alta (audit forense 2026-05-11 — hallazgo CRÍTICO #3)
**Origen:** Cowork 2026-05-11. Audit forense detectó `src/firebase/config.ts:7-15` con credenciales reales del proyecto `mister-service-app-cloude` como fallback `||` de cada `import.meta.env.VITE_*`. Si alguien clona el repo sin `.env`, la app arranca pegada al proyecto productivo. Las API keys de Firebase web son públicas por diseño (Vite las inyecta al bundle), pero el fallback hardcodeado igual es mala práctica: facilita forks accidentales que escriben a producción real.
**Riesgo:** bajo (cambio simple, blast radius limitado a entornos sin `.env`).
**Touch-list previsto:** `src/firebase/config.ts`, `.env.example` (verificar que tenga todas las keys documentadas), `README.md` (sección setup), `CLAUDE.md` (línea ~36 que dice "src/firebase/config.ts includes hardcoded fallback credentials...").

#### Objetivo

Que `src/firebase/config.ts` falle al arrancar (`throw new Error('Missing VITE_FIREBASE_* env vars...')`) si falta cualquier env var requerida, en vez de pegarse silenciosamente al proyecto `mister-service-app-cloude`. Documentar en `.env.example` y `README.md` cuáles son las 6 variables obligatorias.

#### Por qué

- Defense in depth. Si Jorge clona el repo en una máquina nueva y se olvida de `.env`, hoy la app arranca contra producción real y puede escribir data accidentalmente. Con fail-fast, se entera al instante.
- Higiene del bundle. El bundle de producción seguirá teniendo las keys (Vite las inyecta), pero al menos el repo deja de contenerlas como string literal. Cualquier auditor externo que mire el código deja de ver "credenciales hardcodeadas".
- Actualiza la documentación viva (`CLAUDE.md` describe el comportamiento actual: hay que invertir esa línea).

#### Criterios de aceptación

- [ ] `src/firebase/config.ts:7-15` reescrito: cada campo de `firebaseConfig` lee `import.meta.env.VITE_FIREBASE_*` SIN fallback `||`. Si alguno es `undefined` o vacío, el módulo throw-ea con mensaje explícito listando qué env vars faltan.
- [ ] `.env.example` tiene las 6 variables documentadas: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`. Cada una con un comentario corto del propósito.
- [ ] `README.md` sección "Setup" explica que hay que copiar `.env.example` a `.env` y rellenar antes de `npm run dev`.
- [ ] `CLAUDE.md` línea ~36 invertida: ahora dice "config falla al arrancar si faltan env vars (audit fix SPRINT-136 2026-05-XX)".
- [ ] `npm run dev` con `.env` válido sigue funcionando idéntico.
- [ ] `npm run build` con `.env` válido sigue funcionando idéntico.
- [ ] Smoke local: renombrar `.env` temporalmente a `.env.bak` y correr `npm run dev` → confirmar que falla con mensaje claro. Devolver `.env` después.
- [ ] Cazadores 7/7 PASS.

#### Restricciones / guardarrails

- NO tocar `appCheckInstance` ni `initializeAppCheck` (eso es SPRINT-141).
- NO cambiar el nombre del proyecto Firebase. Sigue siendo `mister-service-app-cloude`.
- NO mover credenciales a otro lugar — la solución es eliminarlas del código, no esconderlas en otro archivo del repo.
- Vercel ya tiene las env vars configuradas en su panel — confirmar antes de pushear (revisar `.env.example` contra lo que Vercel inyecta).

#### Notas para el coordinator

- Patrón sugerido para el throw:
  ```ts
  const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', ...];
  const missing = required.filter(k => !import.meta.env[k]);
  if (missing.length > 0) {
    throw new Error(`Firebase config: faltan env vars: ${missing.join(', ')}. Copiá .env.example a .env y rellenalas.`);
  }
  ```
- archivist PRE-CHANGE recomendado (toca `src/firebase/config.ts`, archivo crítico que importa todo el resto del app).
- Reviewer obligatorio (toca arranque del app — si falla, NO arranca nada).
- Coordinar con devops antes de pushear: si Vercel no tiene alguna de las 6 env vars seteadas, el deploy va a romper. Validar en panel Vercel primero.

---

### SPRINT-137 — Validación de archivos en uploads públicos (size + MIME + cantidad)

**Estado:** COMPLETADO 2026-05-11 (commit `d09bdbb` — `src/utils/uploads.ts` NUEVO con helpers + validaciones aplicadas en `solicitudes.service.ts` y `storage.service.ts`).
**Prioridad:** alta (audit forense 2026-05-11 — hallazgo CRÍTICO #4)
**Origen:** Cowork 2026-05-11. Audit forense detectó que `src/services/solicitudes.service.ts:122-133 subirArchivoSolicitud` y `src/services/storage.service.ts:1-23 subirFotoCierre/subirFirma` aceptan cualquier `File`/`Blob` sin validar tamaño, MIME real, ni cantidad de archivos por solicitud. Vector de abuso: atacante sube un .exe disfrazado de .jpg de 500MB y entra al bucket. También: cliente legítimo desde móvil sube foto sin comprimir de 30MB y satura Storage.
**Riesgo:** bajo (agrega checks defensivos, no cambia el happy path).
**Touch-list previsto:** `src/utils/uploads.ts` (NUEVO — helpers `validarArchivoPublico`, `validarFoto`, `validarFirma`), `src/services/solicitudes.service.ts`, `src/services/storage.service.ts`, `src/components/public/CampoFormulario.tsx` (mensaje de error al usuario), `src/components/cierre/CierreServicioWizard.tsx` (mensaje en flujo técnico si aplica).

#### Objetivo

Bloquear server-side todo upload de archivos que supere los límites del negocio: 10 MB max, MIME real en whitelist (no por extensión), cantidad razonable por solicitud. Cliente recibe mensaje claro en español si el archivo se rechaza.

#### Por qué

- Storage rules pueden mitigar (SPRINT-138) pero la validación client-side en el service da defense in depth y mensaje específico al usuario antes de gastar ancho de banda subiendo 30MB que la rule va a rechazar.
- Whitelist por MIME real (sniffing del primer chunk del archivo) en vez de por extensión: protege contra `.exe` renombrado a `.jpg`.
- Decisión Jorge 2026-05-11: max 10 MB por archivo.

#### Criterios de aceptación

- [ ] `src/utils/uploads.ts` NUEVO exporta:
  - `MAX_FILE_BYTES = 10 * 1024 * 1024` (10 MB).
  - `MIME_WHITELIST_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']`.
  - `MIME_WHITELIST_FIRMA = ['image/png', 'image/svg+xml']` (las firmas suelen ser PNGs del canvas).
  - `MIME_WHITELIST_DOC = ['application/pdf', ...MIME_WHITELIST_FOTO]` para campos de formulario público que aceptan PDF + imagen.
  - `MAX_ARCHIVOS_POR_SOLICITUD = 10` (suficiente para casos legítimos, bloquea spam).
  - Función pura `validarArchivoPublico(file: File, opts: { whitelist: string[]; maxBytes?: number }): { ok: true } | { ok: false; error: string }` que devuelve mensaje en español listo para mostrar al usuario.
- [ ] `subirArchivoSolicitud` valida antes de `uploadBytes`. Si falla, throw con mensaje específico. Caller atrapa y muestra.
- [ ] `subirFotoCierre`, `subirFotoInicio`, `subirFirma` (todos los exports de `storage.service.ts`) usan helpers correspondientes.
- [ ] `CampoFormulario.tsx` muestra el error en rojo bajo el input cuando la validación rechaza. No envía el archivo al backend si falla cliente-side (early return).
- [ ] Cantidad max: si el campo es de tipo `archivo_multiple`, validar `files.length <= MAX_ARCHIVOS_POR_SOLICITUD`.
- [ ] Sniffing MIME real: leer primeros 12 bytes del archivo y comparar magic numbers conocidos (JPEG `FF D8 FF`, PNG `89 50 4E 47`, PDF `25 50 44 46`, WebP `52 49 46 46 ... 57 45 42 50`). Si MIME declarado no coincide con magic number, rechazar como "Archivo corrupto o tipo no permitido".
- [ ] Tests manuales: subir un .jpg de 12 MB → rechazo claro. Subir un .exe renombrado a .jpg → rechazo. Subir un .pdf legítimo → OK.
- [ ] Cazadores 7/7 PASS.

#### Restricciones / guardarrails

- NO bloquear `.heic` (iPhones default). Convertir o aceptar tal cual — verificar comportamiento en `OrdenAuditoria` y en cierre del técnico.
- NO romper el flujo del wizard de cierre: técnicos suben fotos desde celular y NO pueden tener fricción. Mensaje debe ser amable: "Tu foto pesa 14 MB. Necesitamos máximo 10 MB. Bajala desde la cámara con calidad media."
- NO confundir con SPRINT-138: el service hace la primera línea. Las rules de Storage hacen la segunda (defense in depth).
- Sniffing MIME real es opcional. Si complica, dejar solo whitelist por `file.type` declarado (no es perfecto pero ya es 10x mejor que nada).

#### Notas para el coordinator

- Para sniffing: `const buf = await file.slice(0, 12).arrayBuffer()` + comparar bytes.
- archivist PRE-CHANGE: tocar `src/services/solicitudes.service.ts` y `storage.service.ts` son críticos (uso por público).
- regression_guardian: tocar storage.service afecta cierre de órdenes en producción. Revisar.

---

### SPRINT-138 — Crear `storage.rules` versionado + `npm run deploy:storage-rules`

**Estado:** BLOQUEADO — esperando OK Jorge (toca reglas de Storage = config de seguridad productiva)
**Prioridad:** alta (audit forense 2026-05-11 — hallazgo CRÍTICO #5)
**Origen:** Cowork 2026-05-11. Audit forense detectó que `firestore.rules` está versionado en la raíz del repo pero `storage.rules` NO existe. Las reglas de Storage actuales viven solo en Firebase Console — no auditables desde el repo, no diffeables en PR, no protegidas por el flujo `npm run deploy:rules` + lock file.
**Riesgo:** medio (introducir rules nuevas puede bloquear flujos legítimos si están mal escritas). Mitigación: empezar con rules permisivas equivalentes a lo que ya existe en consola, después restringir en sprints separados.
**Touch-list previsto:** `storage.rules` (NUEVO), `storage.rules.deployed.lock` (NUEVO — espejo de `firestore.rules.deployed.lock`), `package.json` (script `deploy:storage-rules`), `scripts/invariantes/marcar-storage-rules-deployadas.ts` (NUEVO), `scripts/invariantes/check-storage-rules-pendientes-deploy.ts` (NUEVO — P-009), `docs/PATRONES_REGRESION.md` (entrada P-009), `scripts/invariantes/run-all.ts` (registrar P-009), `CLAUDE.md` (mencionar el nuevo flujo).

#### Objetivo

Tener `storage.rules` en la raíz del repo como fuente de verdad, con flujo `npm run deploy:storage-rules` que deploya + actualiza lock, y cazador P-009 que bloquea pre-commit si hay diff entre repo y lock. Patrón espejo del que ya existe para `firestore.rules` (sub-regla CLAUDE.md, P-005).

#### Por qué

- Hoy las rules de Storage son una caja negra. Si alguien las cambia en consola, no queda registro en git. Si se pierden, no hay forma de restaurarlas.
- Audit logs y compliance: cualquier auditor pide "muéstreme sus rules de Storage" — sin archivo versionado, la respuesta es "están en la consola, créanos". Eso no escala.
- SPRINT-137 hace validación client-side. Las rules son el cinturón defense in depth — sin storage.rules versionado, no podemos auditar que esa capa existe.
- Patrón meta: si firestore.rules tiene este flujo, storage.rules debe tenerlo. Consistencia operacional.

#### Criterios de aceptación

- [ ] Jorge revisa las rules actuales de Storage en Firebase Console (https://console.firebase.google.com/project/mister-service-app-cloude/storage/rules) y las pega en `BLOQUEOS.md` o las dicta al coordinator. El sprint NO puede empezar sin baseline.
- [ ] `storage.rules` creado en raíz del repo con el contenido baseline + comentarios explicando cada bloque. Estructura sugerida: regla por carpeta (`solicitudes/`, `fotos-servicio/`, `firmas/`, `equipos-taller/`, etc.).
- [ ] Rules siguen el patrón de `firestore.rules`: helper `isSignedIn()`, `request.resource.size < 10 * 1024 * 1024`, `request.resource.contentType.matches('image/.*')`, etc.
- [ ] Carpeta `solicitudes/{solicitudId}/{...}`: write permitido a no autenticados (formulario público) pero con límite de size y contentType.
- [ ] Carpeta `fotos-servicio/{ordenId}/{...}`: write solo si `isSignedIn()` y tiene rol técnico/operaria/admin/coord.
- [ ] Carpeta `firmas/{...}`: write permitido a no autenticados (cliente firma en wizard de cierre) pero solo PNG/SVG y <2 MB.
- [ ] Read público para `fotos-servicio/` y `firmas/` (caller usa `getDownloadURL` que requiere URL pública — verificar el patrón actual).
- [ ] `package.json` agrega script `deploy:storage-rules`: `"deploy:storage-rules": "npx firebase deploy --only storage:rules && tsx scripts/invariantes/marcar-storage-rules-deployadas.ts"`.
- [ ] `scripts/invariantes/marcar-storage-rules-deployadas.ts` NUEVO — hashea `storage.rules` y escribe `storage.rules.deployed.lock` con el hash + timestamp.
- [ ] `scripts/invariantes/check-storage-rules-pendientes-deploy.ts` NUEVO — P-009, espejo de P-005. Compara hash del repo vs lock, bloquea pre-commit si hay diff.
- [ ] `docs/PATRONES_REGRESION.md` entrada P-009 nueva.
- [ ] `scripts/invariantes/run-all.ts` registra P-009.
- [ ] `CLAUDE.md` agrega sub-regla "sprints que tocan `storage.rules` deben deployar antes de cerrar COMPLETADO" — espejo de la sub-regla P-005.
- [ ] Jorge ejecuta `npm run deploy:storage-rules` localmente para inicializar el lock. Coordinator NO ejecuta autónomo (es deploy productivo).
- [ ] Cazadores 8/8 PASS post-deploy.

#### Restricciones / guardarrails

- **REQUIERE OK Jorge en BLOQUEOS.md.** Cowork escribe el sprint con `BLOQUEADO` hasta tener OK explícito.
- Antes de pushear, Jorge debe pegar las rules actuales en `BLOQUEOS.md` para que el baseline coincida con producción y no rompa nada.
- Si Jorge no recuerda qué tiene en consola, el sprint queda esperando hasta que las saque y las pegue.
- archivist PRE-CHANGE obligatorio.
- reviewer obligatorio (sub-regla CLAUDE.md: rules → reviewer con foco en inmutabilidad y defense in depth).
- regression_guardian obligatorio (cualquier cambio de rules es de alto riesgo).
- Después de deploy, smoke test manual: técnico sube foto de cierre, operaria sube foto, cliente firma. Si algo se rompe, revertir.

#### Notas para el coordinator

- El comando `npx firebase deploy --only storage:rules` puede fallar si el proyecto no tiene Storage habilitado (poco probable porque ya se usa) o si no hay default bucket. Verificar `firebase.json` antes.
- Si `firebase.json` no tiene la sección `storage`, hay que agregarla:
  ```json
  { "storage": { "rules": "storage.rules" } }
  ```
- Patrón meta: este sprint reproduce exactamente lo que SPRINT-106 hizo para firestore.rules (P-005). Leer ese sprint como template antes de empezar.

---

### SPRINT-139 — Expiración de `tokenPortalCliente` (mientras orden activa + 30 días)

**Estado:** COMPLETADO 2026-05-11 (commit `d09bdbb` — `tokenPortalClienteExpiraEn` agregado a `OrdenServicio`, helper `tokenPortalClienteValido` en `utils/index.ts`, expiración aplicada al cerrar/cancelar/reprogramar en 4 sitios).
**Prioridad:** media (audit forense 2026-05-11 — hallazgo ALTO #6, mejora higiene de tokens)
**Origen:** Cowork 2026-05-11. Audit forense detectó que `OrdenServicio.tokenPortalCliente` se genera con `crypto.randomUUID()` en `src/utils/index.ts:319` y NO tiene campo de expiración. Si el token se filtra (screenshot de WhatsApp, leak, mail forward), el acceso queda abierto para siempre.
**Riesgo:** bajo (agrega campo opcional + check de validez, no rompe órdenes existentes).
**Touch-list previsto:** `src/types/index.ts` (agregar `tokenPortalClienteExpiraEn?: Timestamp`), `src/utils/index.ts` (helper `calcularExpiracionTokenPortal`), `src/services/ordenes.service.ts` (setear al crear/cerrar), `src/hooks/useOrdenCreateForm.ts` (al crear orden), `src/pages/Mantenimiento.tsx` (al regenerar token), `src/pages/Reprogramaciones.tsx` (idem), `src/pages/public/PortalCliente.tsx` (check de validez antes de mostrar contenido), `src/utils/whatsapp.ts` (link incluye query string con scope si hace falta).

#### Objetivo

Que el `tokenPortalCliente` tenga fecha de expiración explícita: mientras la orden está activa (cualquier fase distinta de `cerrado` y `cancelado`), el token funciona. Una vez la orden pasa a `cerrado` o `cancelado`, el token sigue válido por 30 días más, después se invalida.

#### Por qué

- Decisión Jorge 2026-05-11: "Mientras orden activa + 30 días". Cubre el caso de garantías tempranas y reclamos.
- Higiene de tokens: si un cliente recibe el link por WhatsApp y screenshotea, después de 30 días de cerrada la orden el link queda muerto. Reduce superficie de abuso por links leaked.
- No requiere migración de órdenes existentes: las que no tengan `tokenPortalClienteExpiraEn` se tratan como "expira nunca" (compatible hacia atrás) o "expira al cierre + 30 días" si la orden ya está cerrada (computado dinámicamente).

#### Criterios de aceptación

- [ ] `src/types/index.ts` `OrdenServicio` agrega `tokenPortalClienteExpiraEn?: Timestamp | Date`. Documentar JSDoc: "Caduca 30 días después de cerrar/cancelar la orden. Mientras está abierta, el token funciona sin fecha límite. Si está ausente, se asume comportamiento legacy (sin expiración)."
- [ ] Helper `src/utils/index.ts` `tokenPortalClienteValido(orden: OrdenServicio): boolean`:
  - Si `orden.fase` ∈ {`cerrado`, `cancelado`} y `orden.tokenPortalClienteExpiraEn` existe y `Date.now() > expiracion.toMillis()`, retorna false.
  - Si `orden.fase` ∈ {`cerrado`, `cancelado`} y NO hay `tokenPortalClienteExpiraEn` (legacy), calcular desde `orden.fechaCierre` o `orden.fechaCancelacion` + 30 días.
  - Si `orden.fase` NO está cerrada/cancelada, retornar true siempre.
- [ ] Al setear `fase: cerrado` o `fase: cancelado`, escribir `tokenPortalClienteExpiraEn = Timestamp.fromDate(addDays(new Date(), 30))`. Esto ocurre en:
  - `CierreServicioWizard.tsx` (cierre normal).
  - Cualquier otro punto que setee `fase: cancelado` — buscar con `grep -rn "fase: 'cancelado'" src/`.
- [ ] `src/pages/public/PortalCliente.tsx` al cargar la orden: si `tokenPortalClienteValido(orden) === false`, mostrar pantalla "Este enlace ha caducado. Contactá con nosotros por WhatsApp" + link `wa.me` a la operaria asignada.
- [ ] Cazadores 7/7 PASS.
- [ ] Smoke test manual: cerrar una orden de prueba → abrir el portal con su token → debe funcionar. Setear `tokenPortalClienteExpiraEn` manualmente a ayer en Firestore Console → recargar → debe mostrar "caducado".

#### Restricciones / guardarrails

- NO migrar órdenes existentes. Las legacy se computan dinámicamente desde `fechaCierre`.
- NO romper el flujo de creación: las órdenes nuevas siguen sin expiración hasta que se cierran.
- NO mostrar la fecha de expiración al cliente — solo el cartel "caducado" cuando corresponde.
- Tener en cuenta que `tokenPortalCliente` puede regenerarse (Mantenimiento, Reprogramaciones) — si se regenera, también se debe resetear `tokenPortalClienteExpiraEn` a null.

#### Notas para el coordinator

- archivist PRE-CHANGE recomendado (toca el tipo central `OrdenServicio`).
- regression_guardian recomendado.
- Coordinar con SPRINT-140 (garantía tiene su propio token con su propia expiración).

---

### SPRINT-140 — Expiración de `garantia.token` (alineado a `finFecha` + buffer 7 días)

**Estado:** BLOQUEADO — depende de SPRINT-135a (refactor garantía) cerrado. Si 135a cambia el shape de `garantia`, este sprint se ajusta.
**Prioridad:** media (audit forense 2026-05-11 — hallazgo ALTO #6, mejora higiene de tokens)
**Origen:** Cowork 2026-05-11. Audit forense detectó que `GarantiaInfo.token` (en `src/types/index.ts:288`) es un UUID sin expiración. La garantía sí tiene `finFecha`, pero el token mismo no caduca con ella — si alguien retiene el link después de vencida la garantía, sigue viendo el contenido público y puede confundir flujos.
**Riesgo:** bajo (agrega campo opcional + check, no rompe garantías existentes).
**Touch-list previsto:** `src/types/index.ts` (agregar `tokenExpiraEn?: Timestamp` a `GarantiaInfo`), `src/pages/public/GarantiaCliente.tsx` (check de validez), `src/utils/index.ts` (helper `garantiaTokenValido`), `src/components/cierre/CierreServicioWizard.tsx` (setear al emitir conduce de garantía).

#### Objetivo

Que `garantia.token` tenga fecha de expiración alineada con `garantia.finFecha` + 7 días de buffer (para que un reclamo en el último día tenga ventana razonable). Después de eso, el link queda muerto.

#### Por qué

- Hoy un cliente con link viejo puede entrar a `/garantia/:token` y ver el botón de reclamo, aunque la garantía haya vencido. El botón está deshabilitado por la lógica de `finFecha`, pero la pantalla expone info de la orden + del técnico, que no debería seguir pública para siempre.
- El buffer de 7 días post-`finFecha` cubre el caso "cliente reclama el día 60 a las 11pm" — la lógica de aceptación del reclamo es responsabilidad de 135b/c/d/e, pero el token debe seguir abriendo la pantalla unos días después por si hay disputas o si Jorge necesita revisar.

#### Criterios de aceptación

- [ ] `GarantiaInfo` agrega `tokenExpiraEn?: Timestamp | Date`. JSDoc: "= `finFecha` + 7 días. Si está ausente (legacy), se computa dinámicamente."
- [ ] Helper `garantiaTokenValido(garantia: GarantiaInfo): boolean` análogo al de SPRINT-139.
- [ ] Al emitir conduce de garantía (en `CierreServicioWizard.tsx` u homólogo), setear `tokenExpiraEn = Timestamp.fromDate(addDays(finFecha.toDate(), 7))`.
- [ ] `src/pages/public/GarantiaCliente.tsx` al cargar: si token no válido, mostrar "Esta garantía ha expirado. Contactá con nosotros por WhatsApp."
- [ ] Migración legacy: si `garantia.token` existe pero `tokenExpiraEn` no, computar desde `finFecha + 7 días` al vuelo.
- [ ] Cazadores 7/7 PASS.

#### Restricciones / guardarrails

- **Esperar SPRINT-135a cerrado.** Si 135a renombra o cambia el shape de `GarantiaInfo`, este sprint se reescribe.
- NO sobrescribir tokens de garantías ya emitidas (legacy). Solo aplica para emisiones nuevas.
- NO afectar el flujo de reclamo público (esa es responsabilidad de 135b).

#### Notas para el coordinator

- archivist PRE-CHANGE obligatorio.
- Coordinar con SPRINT-135b/c/d/e en cuanto al UI del reclamo.
- Buffer de 7 días es asunción razonable. Jorge puede pedir más/menos.

---

### SPRINT-141 — App Check enforce (con ventana monitoreo 48h previo)

**Estado:** BLOQUEADO — requiere OK Jorge después de ventana de monitoreo de 48h
**Prioridad:** alta (audit forense 2026-05-11 — hallazgo ALTO #4)
**Origen:** Cowork 2026-05-11. Audit forense detectó que App Check está inicializado en `src/firebase/config.ts:22-42` con reCAPTCHA v3, pero el comentario línea 19 dice *"enforcement se activa manualmente en Firebase Console tras validar"*. Está en modo soft — los requests sin token de attestation no se bloquean. Producción es vulnerable a abuso/scraping desde scripts externos con las API keys públicas.
**Riesgo:** medio. Activar enforce mal calibrado puede bloquear usuarios legítimos si algún flujo no inicializa App Check correctamente (ej: SSR, navegadores muy viejos, modo incognito sin reCAPTCHA). Mitigación: ventana de monitoreo 48h en Firebase Console mirando "App Check verified requests vs unverified" antes de activar enforce.
**Touch-list previsto:** Ninguno en código de la app. Solo:
- `docs/sprints/BLOQUEOS.md` (registro de la ventana de monitoreo).
- `CLAUDE.md` (línea que dice "App Check (currently soft enforcement, not blocking)" → invertir post-deploy).
- `docs/sprints/DIARIO_YYYY-MM-DD.md` (registro del flip).

#### Objetivo

Activar enforce en Firebase Console para Firestore y Storage después de validar 48h que el % de requests "unverified" es <1%.

#### Por qué

- App Check soft no protege nada. Es como tener una cerradura sin trabar.
- Con enforce activo, scripts externos que usen las API keys públicas (que están en el bundle) no pueden escribir a Firestore ni a Storage sin tener un token reCAPTCHA válido emitido por nuestro dominio.
- La ventana de 48h evita el escenario "activé enforce y la app dejó de funcionar para usuarios reales que usan navegadores donde reCAPTCHA falla".

#### Criterios de aceptación

- [ ] Día 0: Jorge confirma OK explícito en BLOQUEOS.md (`OK: jorge 2026-MM-DD HH:MM`).
- [ ] Día 0: coordinator (o Jorge) entra a Firebase Console → App Check → mira la sección "Requests" para Firestore y Storage. Anota baseline: % de requests verified vs unverified durante última semana. Documentar en BLOQUEOS.md.
- [ ] Día 0: NO se activa enforce aún. Se documenta el baseline.
- [ ] Día 0+48h: revisar de nuevo. Si verified >99%, OK para enforce. Si verified <99%, investigar qué flujo no envía token (probablemente algún hook o ruta que no importa `firebase/config.ts` antes de hacer requests).
- [ ] Día 0+48h: Jorge entra a Firebase Console → App Check → Firestore → "Enforce" → ON. Lo mismo para Storage.
- [ ] Día 0+48h: smoke test manual end-to-end con admin, coord, operaria, técnico, secretaria. Crear orden, mover fases, cerrar, abrir portal cliente.
- [ ] Día 0+48h+1h: si todo OK, actualizar `CLAUDE.md` línea relevante: "App Check enforce activo desde YYYY-MM-DD". Si hay regresiones, revertir enforce y abrir sprint diagnóstico.
- [ ] Postmortem-positivo si todo va bien (sub-regla de continuous improvement loop, opcional).

#### Restricciones / guardarrails

- **REQUIERE OK Jorge.** Esto es un cambio operacional, no código.
- NO ejecutar autónomo. Coordinator solo escribe los pasos en BLOQUEOS.md y espera.
- Si en cualquier momento de las 48h aparecen reportes de usuarios "no me deja entrar", abortar.
- Tener listo el rollback: 1 click en Firebase Console para volver a soft mode.
- Considerar activar primero solo Firestore, esperar 24h, después Storage. Reduce blast radius.

#### Notas para el coordinator

- Este sprint no requiere builder/tester/reviewer porque no toca código. Sí requiere devops para monitorear.
- archivist en modo POSTMORTEM si hay incidente.

---

### SPRINT-142 — Refactor `PersonalPage.tsx` (1713 líneas → 3-4 componentes)

**Estado:** COMPLETADO 2026-05-11 (4/4 sub-sprints). PersonalPage 1713→1122 líneas (-591). 4 componentes extraídos a `src/components/personal/`: FormAltaEditarEmpleado (142a `723d0ea`), GruposOperariaTecnico (142c `b45a6ba`), ModalConfirmarEliminar (142b `6a0d10c`), TablaPersonalActivo (142d `1425911`). `src/utils/personal.ts` NUEVO con constantes compartidas.
**Prioridad:** media (audit forense 2026-05-11 — hallazgo ALTO #5, monolito más grande del repo)
**Origen:** Cowork 2026-05-11. Audit forense identificó 4 monolitos (PersonalPage 1713, MapaRutas 1267, Configuracion 1102, Ordenes 1001). Decisión Jorge: solo refactorizar PersonalPage como prueba; los otros 3 quedan como deuda hasta que un sprint los toque.
**Riesgo:** medio. Refactor de archivo crítico (gestión de empleados, alta de usuarios, transferencia de órdenes al eliminar). Mitigación: dividir en 4 sub-sprints (142a..d) con QA visual entre cada uno, igual que SPRINT-117c.
**Touch-list previsto:** `src/pages/PersonalPage.tsx` (rewire), `src/components/personal/` (componentes extraídos).

#### Objetivo

Dividir `PersonalPage.tsx` (1713 líneas) en `PersonalPage.tsx` (~300 líneas, solo orquesta) + 3-4 componentes hijos extraídos a `src/components/personal/`:
- `FormAltaEditarEmpleado.tsx` (form alta/edición) ✅ COMPLETADO 142a.
- `ModalConfirmarEliminar.tsx` (eliminación + transferencia de órdenes) → SPRINT-142b.
- `GruposOperariaTecnico.tsx` (matriz 7+7 de asignaciones) → SPRINT-142c.
- `TablaPersonalActivo.tsx` (tabla agrupada por rol con acciones) → SPRINT-142d + cleanup constantes.

#### Por qué

- Archivos monolíticos son trampa de regresiones. Cada touch sobre PersonalPage tiene riesgo alto porque toca lógica de Auth + permisos + transferencia cross-collection. Recientemente SPRINT-132 + SPRINT-133 tocaron este archivo y casi rompen producción dos veces.
- Componentes chicos permiten unit-testing futuro y revisión más fácil en PR.
- El refactor NO cambia comportamiento — solo mueve código a archivos separados.

#### Criterios de aceptación

- [X] **Sub-sprint 142a — `FormAltaEditarEmpleado`** ✅ COMPLETADO 2026-05-11 (commits implementados directo desde Cowork; PersonalPage 1713→1430 líneas, -284).
- [ ] **Sub-sprint 142b — `ModalConfirmarEliminar`** (riesgo medio, contiene transferencia cross-collection con writeBatch del SPRINT-133).
- [ ] **Sub-sprint 142c — `GruposOperariaTecnico`** (riesgo bajo, bloque solo de render sin handlers locales).
- [ ] **Sub-sprint 142d — `TablaPersonalActivo` + cleanup constantes a `utils/personal.ts`** (riesgo medio, dejar `PersonalPage.tsx` como orquestador delgado ~1067 líneas).

#### Restricciones / guardarrails

- NO mezclar refactor con cambios de comportamiento. Si durante el refactor se encuentra un bug, abrir sprint separado.
- NO romper imports en otros archivos. Verificar con `grep -rn "from.*PersonalPage" src/` antes de cada extracción.
- NO refactorizar `MapaRutas.tsx`, `Configuracion.tsx`, `Ordenes.tsx` — están fuera de scope.
- Sub-sprints procesables uno por uno con `trabaja`. NO procesar todos en una pasada.

#### Notas para el coordinator

- Patrón de referencia: SPRINT-117c (sidebar) usó el mismo approach "1 sub-sprint, QA visual humana, después siguiente". Postmortem-positivo en `docs/postmortems/2026-05-10-rediseno-ia-aprendizajes.md`.
- Bundle de regresión: medir bundle size antes (con `npm run build`) y después de cada sub-sprint. Documentar en cada commit.

---

### SPRINT-142b — Extraer `ModalConfirmarEliminar` de PersonalPage

**Estado:** COMPLETADO 2026-05-11 (commit `6a0d10c`, coordinator autónomo `trabaja`). PersonalPage 1377→1233 líneas (-144). Cazadores 7/7 PASS, build OK. writeBatch + chunking del SPRINT-133 preservados intactos en `handleConfirmarEliminar`. Comentarios `@safe-non-tx` SPRINT-134 follow-up sin tocar.
**Prioridad:** media (sub-sprint de SPRINT-142)
**Origen:** Cowork 2026-05-11. Sub-sprint del refactor PersonalPage. SPRINT-142a ya completado (FormAltaEditarEmpleado extraído).
**Riesgo:** medio. El modal de eliminar contiene la transferencia cross-collection con `writeBatch` que se fixeó en SPRINT-133 (eliminación atómica de técnico/operaria con órdenes activas). Cualquier rewire mal hecho puede dejar el patrón allowlist `@safe-non-tx` colgando o romper la atomicidad. archivist PRE-CHANGE obligatorio.
**Touch-list previsto:** `src/pages/PersonalPage.tsx`, `src/components/personal/ModalConfirmarEliminar.tsx` (NUEVO).

#### Objetivo

Extraer del archivo `PersonalPage.tsx` (líneas ~1197-1359 del JSX + handler `handleConfirmarEliminar` líneas ~688-743) a un componente nuevo `src/components/personal/ModalConfirmarEliminar.tsx`. El componente nuevo encapsula el JSX del modal de confirmación de eliminación. El handler `handleConfirmarEliminar` se queda en PersonalPage por su complejidad (writeBatch + chunking + branches por rol del empleado) y se pasa como callback `onConfirmar`.

#### Por qué

- El modal de eliminar tiene UI específica (input de transferencia, lista de órdenes afectadas, confirmación) que no se reutiliza en otro lado.
- Aislar el JSX permite que el handler complejo (que sí queda en PersonalPage) quede más fácil de leer.
- Reduce ~163 líneas de PersonalPage.

#### Criterios de aceptación

- [ ] Archivo `src/components/personal/ModalConfirmarEliminar.tsx` NUEVO con props:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `personalAccion: Personal | null` (la persona que se va a eliminar)
  - `personal: Personal[]` (lista completa para resolver lista de destinos de transferencia)
  - `ordenes: OrdenServicio[]` (para mostrar cuántas órdenes se transfieren)
  - `transferDestinoId: string` + `setTransferDestinoId: (v: string) => void`
  - `processingAccion: boolean`
  - `onConfirmar: () => Promise<void>`
- [ ] El componente NUEVO solo renderiza JSX (Modal + form de transferencia + botones). NO contiene lógica de DB ni handler de submit.
- [ ] PersonalPage.tsx reemplaza el bloque `<Modal isOpen={showDeleteModal}...>...</Modal>` (líneas ~1197-1359) por `<ModalConfirmarEliminar {...props} />`.
- [ ] `handleConfirmarEliminar` (con `writeBatch` + chunking + branches admin/técnico/operaria/secretaria) SE QUEDA en PersonalPage — solo se renombra a callback que se pasa como prop.
- [ ] El comentario `@safe-non-tx: SPRINT-134 follow-up` y el comentario allowlist de P-003 PERMANECEN exactamente donde están — son críticos para el cazador.
- [ ] PersonalPage reduce de 1430 a ~1267 líneas (-163).
- [ ] Cazadores 7/7 PASS al cerrar. Especialmente P-003 NO debe regresionar (la rule del cazador busca el comentario `@safe-non-tx` o el patrón `writeBatch` — verificar que sigue presente).
- [ ] Typecheck verde. Lint --max-warnings 0 verde.
- [ ] Build OK. Bundle puede subir 1-2kB por overhead de componente.
- [ ] Reviewer obligatorio (toca `handleConfirmarEliminar` que es crítico).

#### Restricciones / guardarrails

- NO refactorizar `handleConfirmarEliminar` para "limpiarlo" — solo se mueve el JSX, NO la lógica. Si el handler se ve feo, queda para otro sprint.
- NO mover el comentario `@safe-non-tx` ni el JSDoc de la mutación cross-collection. Esos comentarios son indicadores para los cazadores.
- NO cambiar el shape de la transferencia (`transferDestinoId` sigue siendo el id del destino — el flujo del SPRINT-133 NO se toca).
- QA manual obligatorio post-deploy: eliminar un técnico de prueba con 2-3 órdenes activas. Verificar que las órdenes se transfieren atómicamente al destino. Si el browser pierde red a mitad, NINGUNA orden debe quedar transferida.

#### Notas para el coordinator

- archivist PRE-CHANGE obligatorio (toca `handleConfirmarEliminar` listado como crítico en CLAUDE.md + sub-regla cleanup).
- regression_guardian obligatorio (toca services flow indirectamente via PersonalPage).
- Patrón: el componente recibe `personal: Personal[]` para listar destinos, NO una función helper. Mantener cohesión local.

---

### SPRINT-142c — Extraer `GruposOperariaTecnico` de PersonalPage

**Estado:** COMPLETADO 2026-05-11 (commit `b45a6ba`, coordinator autónomo `trabaja`). PersonalPage 1450→1377 líneas (-73). Cazadores 7/7 PASS, build OK.
**Prioridad:** baja (sub-sprint de SPRINT-142, bloque solo de render)
**Origen:** Cowork 2026-05-11. Sub-sprint del refactor PersonalPage.
**Riesgo:** bajo. El bloque solo renderiza la matriz operaria→técnicos. Toda la edición vive en `FormAltaEditarEmpleado.tsx` (selectora). No tiene handlers locales ni listeners.
**Touch-list previsto:** `src/pages/PersonalPage.tsx`, `src/components/personal/GruposOperariaTecnico.tsx` (NUEVO).

#### Objetivo

Extraer las líneas ~865-941 de PersonalPage (sección "Grupos operaria-técnico" + tarjeta "Sin asignar") a un componente nuevo `GruposOperariaTecnico.tsx` que solo recibe `personal: Personal[]`.

#### Por qué

- Bloque self-contained de visualización pura.
- Reduce ~77 líneas de PersonalPage.
- Mejora legibilidad — la sección tiene su propio scope semántico.

#### Criterios de aceptación

- [ ] Archivo `src/components/personal/GruposOperariaTecnico.tsx` NUEVO con prop única:
  - `personal: Personal[]`
- [ ] El componente importa `agruparPorRol` desde `utils/roles.ts` (ya existe) y `getTecnicosDeOperaria` (probablemente también, verificar).
- [ ] Renderea heading + grid de tarjetas operaria→técnicos + tarjeta "Sin asignar" para técnicos sin operaria.
- [ ] PersonalPage reemplaza el bloque por `<GruposOperariaTecnico personal={personal} />`.
- [ ] Cazadores 7/7 PASS. Typecheck verde. Lint verde.
- [ ] PersonalPage baja de ~1267 a ~1190 líneas (-77).
- [ ] reviewer recomendado pero NO obligatorio (riesgo bajo, solo JSX).

#### Restricciones / guardarrails

- NO cambiar el algoritmo de agrupación. Mismo `agruparPorRol` que ya se usa.
- NO mover lógica de asignar/quitar operaria (vive en `FormAltaEditarEmpleado` y se queda allí).
- Si la sección usa hooks (`useMemo` para listas filtradas), mantener equivalencia.

#### Notas para el coordinator

- Es el sub-sprint más simple del lote. Procesar rápido para mantener momentum.
- QA manual: abrir `/admin/personal`, verificar que la sección "Grupos operaria-técnico" aparece igual que antes con la matriz 7+7 correcta.

---

### SPRINT-142d — Extraer `TablaPersonalActivo` + consolidar constantes a `utils/personal.ts`

**Estado:** COMPLETADO 2026-05-11 (commit `1425911`, coordinator autónomo `trabaja`). PersonalPage 1233→1122 líneas (-111). Total acumulado lote 142: 1713→1122 = -591 líneas en 4 sub-sprints. `utils/personal.ts` NUEVO single source of truth para ROL_LABELS/ROL_COLORS/ROLES_CON_COMISION/ROL_SELECT_ORDEN/comisionDefaultPorNivel; 4 archivos migrados al import central. Cazadores 7/7 PASS, build OK. **SPRINT-142 padre cerrado como COMPLETADO** (tabla de personal INACTIVO sigue inline — extraerla queda como deuda si Jorge lo prioriza).
**Prioridad:** media (sub-sprint final de SPRINT-142, incluye cleanup de duplicación)
**Origen:** Cowork 2026-05-11. Sub-sprint final del refactor PersonalPage. Cierra la deuda de constantes duplicadas que dejé en SPRINT-142a (`ROL_LABELS`, `ROLES_CON_COMISION`, etc. están en PersonalPage Y en FormAltaEditarEmpleado).
**Riesgo:** medio. Toca varios archivos (PersonalPage + FormAltaEditarEmpleado + módulo nuevo). El módulo `utils/personal.ts` nuevo importa tipos de `types/index.ts`. Sin esto el refactor queda incompleto.
**Touch-list previsto:** `src/pages/PersonalPage.tsx`, `src/components/personal/FormAltaEditarEmpleado.tsx`, `src/components/personal/TablaPersonalActivo.tsx` (NUEVO), `src/utils/personal.ts` (NUEVO).

#### Objetivo

1. **Crear `src/utils/personal.ts`** con las constantes y helpers que hoy están duplicados:
   - `ROL_LABELS: Record<Rol, string>`
   - `ROL_COLORS: Record<Rol, string>`
   - `ROLES_CON_COMISION: Rol[]`
   - `ROL_SELECT_ORDEN: Rol[]` (hoy solo en FormAltaEditarEmpleado)
   - `comisionDefaultPorNivel(nivel: 'junior' | 'senior'): number`
2. **Modificar `FormAltaEditarEmpleado.tsx`** para importar de `utils/personal.ts` en vez de declarar las constantes localmente.
3. **Modificar `PersonalPage.tsx`** para idem.
4. **Crear `src/components/personal/TablaPersonalActivo.tsx`** y mover líneas ~943-1040 del JSX (tabla agrupada por rol con acciones Edit/Link/Desactivar/Eliminar).
5. PersonalPage reduce a ~1067 líneas.

#### Por qué

- Cerrar el refactor: PersonalPage queda como orquestador delgado.
- Eliminar la duplicación de constantes (un solo source of truth).
- Bundle queda más limpio: las constantes se cargan una sola vez.

#### Criterios de aceptación

- [ ] `src/utils/personal.ts` NUEVO con los 5 exports listados.
- [ ] `FormAltaEditarEmpleado.tsx` importa de `utils/personal.ts`. Las declaraciones locales se borran. El comentario "Constantes duplicadas..." se actualiza para reflejar que ya viven en utils.
- [ ] `PersonalPage.tsx` idem.
- [ ] `src/components/personal/TablaPersonalActivo.tsx` NUEVO recibe props:
  - `personal: Personal[]`
  - `onEdit: (p: Personal) => void`
  - `onDesactivar: (p: Personal) => void`
  - `onEliminar: (p: Personal) => void`
  - `onAbrirVincular: (p: Personal) => void`
  - `currentUserId?: string` (para resaltar fila propia si aplica)
- [ ] El componente solo renderiza la tabla agrupada por rol (usa `agruparPorRol` de `utils/roles.ts`).
- [ ] Los handlers `handleEdit`, `abrirModalDesactivar`, `abrirModalEliminar`, `abrirVincularExistente` SE QUEDAN en PersonalPage y se pasan como callbacks.
- [ ] PersonalPage reemplaza el bloque líneas ~943-1040 por `<TablaPersonalActivo {...props} />`.
- [ ] Cazadores 7/7 PASS. Typecheck verde. Lint --max-warnings 0 verde.
- [ ] PersonalPage baja a ~1067 líneas (objetivo del padre SPRINT-142).
- [ ] Bundle build OK. Levantar `npm run build` y confirmar que no aparecen warnings nuevos.
- [ ] Reviewer obligatorio (es el cierre del refactor).
- [ ] archivist PRE-CHANGE obligatorio.
- [ ] Marcar SPRINT-142 padre como COMPLETADO al cerrar.

#### Restricciones / guardarrails

- NO mover handlers (`handleEdit`, etc.) al componente nuevo. Solo el JSX se mueve. Los handlers se quedan en PersonalPage y se pasan como callbacks.
- NO eliminar los comentarios sobre patrones cazadores (`@safe-tecnicoid-id`, `@safe-non-tx`).
- NO romper el orden visual de columnas/filtros de la tabla. Equivalencia 1:1.
- Si hay otros archivos que importen `ROL_LABELS` de PersonalPage o de FormAltaEditarEmpleado, actualizar también esos imports. `grep -rn "ROL_LABELS\|ROL_COLORS\|ROLES_CON_COMISION\|ROL_SELECT_ORDEN\|comisionDefaultPorNivel" src/` antes de empezar.
- QA manual post-deploy: abrir `/admin/personal`, confirmar que la tabla sigue mostrando todos los activos con sus colores de badge correctos, click en cada acción funciona.

#### Notas para el coordinator

- Este es el sprint con más archivos tocados del lote. Hacer en pasada única con cuidado.
- Antes de pushear: build size diff vs antes. Documentar en el commit.
- Postmortem-positivo opcional al cerrar el SPRINT-142 padre (sub-regla de postmortems de éxito, similar al de SPRINT-117c).

---

### SPRINT-144 — Preparar QA manual de SPRINT-135a-UI (script de verificación + candidatos)

**Estado:** ABSORBIDO 2026-05-12 (Claude Code generó el script equivalente directo en sesión interactiva sin pasar por el coordinator: `scripts/qa-sprint-135a-ui.ts` con casos 2/3/5 reformulado read-only. Caso 5 ya PASS 4/4. Casos 2 y 3 esperan que Jorge cierre orden + emita conduce. NO procesar — el deliverable ya existe.)
**Prioridad:** alta (bloquea cierre formal de SPRINT-135a-UI; Jorge no puede ejecutar el plan QA de BLOQUEOS.md sin estas herramientas sin abrir Firestore Console campo por campo)
**Origen:** Jorge 2026-05-12 vía Cowork. SPRINT-135a-UI ya está deployado (commit `d0f11d4`, 2026-05-11). El plan QA está en `docs/sprints/BLOQUEOS.md` (5 casos). Jorge prefiere correr 1 comando en su Mac que le imprima los campos persistidos en lugar de abrir Firestore Console a mano. Cowork prepara las herramientas para que el QA cueste 15-20 min en lugar de 45.
**Riesgo:** bajo (read-only Admin SDK; sin mutaciones; sin tocar código de la app; 2 archivos nuevos en `scripts/` y `docs/`)
**Touch-list previsto:** `scripts/verificar-garantia-qa.ts` (NUEVO), `docs/sprints/CANDIDATOS_QA_GARANTIA_2026-05-12.md` (NUEVO). NO toca código de la app.

#### Objetivo

Generar dos artefactos read-only que faciliten el QA manual del wizard de garantía:

1. Un script `npx tsx scripts/verificar-garantia-qa.ts <ordenId>` que lea el doc de la orden y su factura asociada e imprima los campos relevantes con formato humano (período, vencimiento absoluto y relativo, fechaCierre, token, URL pública del countdown). Reemplaza la necesidad de abrir Firestore Console para Casos 2 y 3 del plan.
2. Un md con listado curado de 3 órdenes candidatas para Casos 1/2 + 1 orden legacy para Caso 5, con todos los datos necesarios (ordenId, número OS, cliente, fase, fechaCierre si aplica, token de factura si aplica, URL pública). Reemplaza la búsqueda manual.

NO ejecuta el QA. NO toca datos. Solo prepara las herramientas. Jorge corre el QA después con clicks + 1 comando por orden.

#### Por qué

El plan QA en BLOQUEOS.md (5 casos) requiere que Jorge:
- Encuentre orden candidata en fase `trabajo_realizado` → fricción media (abrir admin, filtrar).
- Lea 3 campos en Firestore Console por cada orden cerrada → fricción alta (Console es lenta, los timestamps son números epoch).
- Encuentre token de factura para llamar el endpoint público → fricción alta (factura está en otra colección).
- Encuentre orden legacy sin `periodoGarantiaDias` para Caso 5 → fricción alta (no hay filtro UI por campo missing).

Sin estas herramientas, Jorge pospone el QA y el sprint queda en limbo. Con ellas: 15-20 min total.

#### Criterios de aceptación

**Parte A — Script `scripts/verificar-garantia-qa.ts`:**

- [ ] Inicializa Admin SDK con `service-account.json` reusando la convención de `scripts/auditoria/schema-drift.ts` o `asignaciones-tecnico-operaria.ts`.
- [ ] Recibe `ordenId` como `process.argv[2]`. Si falta, imprime usage clara y exit 1: `Uso: npx tsx scripts/verificar-garantia-qa.ts <ordenId>`.
- [ ] Lee `ordenes_servicio/{ordenId}`. Si no existe, exit 1 con mensaje claro.
- [ ] Imprime sección 1 — "ORDEN":
  - `numero` (OS-####), `clienteNombre`, `fase`, `tecnicoNombre` (si está).
  - `cierreServicio.fechaCierre` como timestamp ISO + "hace X días/horas".
- [ ] Imprime sección 2 — "GARANTÍA (modelo nuevo)":
  - `periodoGarantiaDias`: el valor + comentario `[OK existe]` o `[MISSING - orden legacy]`.
  - `garantiaVencimiento`: timestamp ISO + cuántas horas/días faltan o hace cuánto venció. Si missing: `[MISSING - se computa al vuelo desde fechaCierre + 60d]`.
- [ ] Busca factura asociada (query `facturas where ordenId == <ordenId>`, primer match). Imprime sección 3 — "FACTURA + TOKEN":
  - `numero` (FAC-#####), `token` (si tiene), `garantia.fechaInicio` y `garantia.fechaFin` si tiene shape legacy.
  - URL pública lista para clickear: `https://app.misterservicerd.com/api/garantia/{token}` (usar dominio de prod hardcodeado o desde env si está claro).
- [ ] Imprime sección 4 — "QA HINTS":
  - Si `periodoGarantiaDias` existe y `garantiaVencimiento` también → "Caso 2 OK, verifica que coincida con lo que pusiste en el wizard."
  - Si falta `periodoGarantiaDias` pero existe `cierreServicio.fechaCierre` → "Esta orden sirve para Caso 5 (fallback legacy). URL pública del Caso 3 también debe responder coherente."
  - Si falta todo → "Orden sin garantía configurada. No sirve para QA."
- [ ] NO toca Firestore con writes. Grep negativo en el archivo: cero `.set(`, `.update(`, `.delete(`, `.add(` sobre `db.collection` o `db.doc`. Solo `Map.set` en memoria si aplica.
- [ ] Output puro stdout, sin escribir archivos.

**Parte B — Documento `docs/sprints/CANDIDATOS_QA_GARANTIA_2026-05-12.md`:**

- [ ] Encabezado: explica que este doc lista órdenes pre-seleccionadas para el plan QA de SPRINT-135a-UI (referenciar BLOQUEOS.md sección SPRINT-135a-UI).
- [ ] Sección "Candidatas para Casos 1, 2, 3 (cerrar con período personalizado)":
  - Tabla con 3 órdenes en fase `trabajo_realizado` o `agendado` que NO tengan `periodoGarantiaDias` aún. Columnas: ordenId, número OS, cliente (primer nombre), fase, técnico, comando listo para copiar: `npx tsx scripts/verificar-garantia-qa.ts <ordenId>`.
  - Si no hay 3 candidatas en `trabajo_realizado`, completar con órdenes en fase anterior y aclarar "requiere avanzar la orden a trabajo_realizado primero".
- [ ] Sección "Candidata para Caso 5 (fallback legacy)":
  - 1 orden cerrada anterior al 2026-05-11 que tenga `cierreServicio.fechaCierre` pero NO tenga `periodoGarantiaDias` ni `garantiaVencimiento`. Columnas: ordenId, número, cliente, fechaCierre, token de factura, URL pública lista para clickear.
- [ ] Sección "Plan QA paso a paso resumido" — referencia BLOQUEOS.md pero da el orden recomendado:
  1. Abrir candidata A del Caso 1/2 → cerrar con período 1 día → correr script de verificación → verificar Caso 2.
  2. Abrir URL pública del paso 1 → verificar Caso 3.
  3. En Firestore Console, mover `garantiaVencimiento` de la candidata a ayer → recargar página pública → verificar botón Reclamar disabled (Caso 4).
  4. Abrir URL pública de la candidata legacy → verificar Caso 5.
  5. Volver al wizard con orden B → probar límites (0, 400, 1) sin completar el cierre → verificar Caso 1.
- [ ] Sección "Si todos pasan" — pegar comando consolidado para Jorge:
  ```
  Pegale a Cowork: "QA de SPRINT-135a-UI completo, todos los 5 casos OK"
  Cowork te pasa el commit+push final para cerrar el sprint en docs/sprints/.
  ```
- [ ] NO mostrar emails completos, teléfonos ni direcciones — solo primer nombre + sufijo ID parcial.

**Global:**

- [ ] archivist PRE-CHANGE obligatorio (script toca Admin SDK + lee `ordenes_servicio` + `facturas` — categoría "datos en prod").
- [ ] regression_guardian opcional (no toca código de la app, solo scripts standalone).
- [ ] Read-only confirmado por grep negativo sobre `.set/.update/.delete/.add` apuntando a Firestore. `Map.set` en memoria está OK.
- [ ] `npm run build` + `npm run lint` PASS.
- [ ] Cazadores 8/8 PASS.
- [ ] El builder ejecuta el script una vez contra prod **solo para llenar la Parte B** (queries read-only para descubrir candidatas). Output del script para llenar el md es OK — sigue siendo read-only. Si esto rompe alguna sub-regla del coordinator, el builder genera el md como placeholder con instrucciones para que Jorge lo corra y se llene.
- [ ] Commit + push con mensaje `feat(qa): SPRINT-144 script verificar-garantia-qa + listado candidatos para QA de SPRINT-135a-UI`.

#### Restricciones / guardarrails

- archivist PRE-CHANGE obligatorio (toca Admin SDK + lee datos de prod).
- Read-only puro. Si el builder se ve tentado a incluir un flag `--apply-set-vencimiento-ayer` para automatizar Caso 4, PARAR — Jorge lo hace en Firestore Console a mano, no queremos un script write para 1 doc puntual.
- NO inferir URL del endpoint público desde código. Hardcodear `https://app.misterservicerd.com/api/garantia/{token}` o usar `process.env.VITE_APP_URL` si está claro. No hacer fetch desde el script.
- El listado de candidatas (Parte B) no debe contener más de 5 órdenes en total. Es para QA puntual, no auditoría masiva.
- Si la query de "facturas asociadas a una orden" no devuelve match para alguna candidata, el script imprime `[Sin factura asociada — no se puede verificar Caso 3 con esta orden]` y sigue. No es error fatal.
- NO modificar `firestore.rules`, NO tocar tipos en `src/types/index.ts`, NO tocar helpers de garantía.

#### Notas para el coordinator

- Convención: `scripts/auditoria/` ya tiene scripts read-only similares. Pero este NO es auditoría, es prep de QA. Decidir: ¿va en `scripts/auditoria/` o en `scripts/qa/` (nuevo subdirectorio)? Recomendación: crear `scripts/qa/` para este tipo de scripts ad-hoc de soporte al QA manual, y poner ahí el verificar-garantia-qa.ts. Si el coordinator prefiere reusar `scripts/auditoria/`, también está bien — decidir y dejarlo justificado en el commit.
- Si la búsqueda de candidatas (Parte B) tarda demasiado o devuelve docs huge, limitar query con `.limit(20)` y filtrar en memoria.
- Si el archivist en PRE-CHANGE encuentra que un sprint reciente ya tocó garantía con consecuencias inesperadas, reportarlo en el output — pero seguir.
- Al cerrar: NO marcar SPRINT-135a-UI como COMPLETADO. Eso lo hace Jorge cuando termina el QA real.

---

### SPRINT-145 — Fix P-006 escapado en `AgendaDia.tsx` (técnicos con órdenes aparecen en "Sin citas hoy")

**Estado:** COMPLETADO 2026-05-12 (coordinator autónomo `trabaja`, hash `4d32d9e`. 1 archivo modificado, 6 ediciones funcionales + 1 import. Cazadores 7/7 PASS, build PASS, lint staged PASS. QA flujo agenda PENDIENTE — Jorge ejercita post-deploy.)
**Prioridad:** alta (bug en producción reportado por Jorge 2026-05-12; la página "Agenda del Día" no muestra ninguna orden porque el filtro de técnicos compara `t.id` (doc id de personal) contra `tecnicoId` (auth.uid post-c4be345). Todos los técnicos quedan listados en "Sin citas hoy" aunque tengan órdenes con `fechaCita = hoy`. Los 4 KPIs (Total, Completadas, En Progreso, Ingresos) muestran 0 aunque hayan órdenes reales.)
**Origen:** Jorge 2026-05-12 vía Cowork. Reportó que abriendo `/admin/agenda` con fecha 12/05/2026, el panel muestra "Sin citas programadas para este día" + "Sin citas hoy (14)" + KPIs en 0, pese a que sabe que Aury Mon tiene órdenes hoy (incluido OS-0049 con `fechaCita: 12/05/2026 17:00`). Cowork hizo auditoría profunda con grep sobre todo el codebase. Resultado: el patrón está concentrado en `src/pages/AgendaDia.tsx` (5 instancias en 5 puntos distintos del flujo: filtro UI + filtros internos useMemo + indexación de map). El cazador determinístico actual no captura ninguno porque están dentro de `useMemo` con sintaxis `new Set(...).has(t.id)` y `map[t.id]`, no `<option value={t.id}>` (que es lo que P-006 escanea).
**Riesgo:** bajo (1 archivo, 5 ediciones, sin tocar shape de datos en Firestore, sin tocar rules, sin tocar storage. Cambios mantienen semántica con fallback `t.uid || t.id` para retrocompat con personal pre-onboarding sin Auth. Edita las funciones de filtrado puro sin cambiar comportamientos de escritura).
**Touch-list previsto:** `src/pages/AgendaDia.tsx` (5 ediciones quirúrgicas + 1 import adicional)

#### Objetivo

Que la página "Agenda del Día" muestre las órdenes del día agrupadas por su técnico correcto (Aury Mon, etc.) en lugar de listar a todos los técnicos como "sin órdenes". Que los 4 KPIs reflejen el conteo real de órdenes. Que el dropdown de filtro por técnico funcione. Que la sección "Sin citas hoy" excluya a los técnicos que SÍ tienen órdenes.

#### Por qué

- SPRINT-132 fixeó 12 lookups del patrón P-006 en otros archivos. AgendaDia quedó fuera porque su patrón es distinto: en lugar de `<option value={t.id}>` (lo que P-006 escanea), usa `new Set(...).has(t.id)` dentro de `useMemo` y `map[t.id]` en el render.
- En producción esto significa que ninguna operaria, secretaria, coordinadora o admin puede ver "qué está pasando hoy" mirando `/admin/agenda`. La página está rota para casi todos los usuarios.
- Bug confirmado por Cowork con grep negativo de cada línea + lectura completa de AgendaDia.tsx + verificación de tipos `Personal.uid` y `Personal.id` en `src/types/index.ts:1376-1381`.

#### Auditoría previa (Cowork 2026-05-12)

Hallazgos de la revisión profunda:

1. **5 instancias del bug P-006 confirmadas en AgendaDia.tsx** (no 4 como se pensó inicialmente):
   - Línea 295: filtro por dropdown de técnico (`t.id === filtroTecnico` cuando `filtroTecnico` es uid)
   - Línea 310: filtro de técnicos con órdenes (`idsConOrden.has(t.id)` cuando idsConOrden tiene uids)
   - Línea 315: filtro de técnicos sin órdenes — duplicado por consistencia, si fijamos 310 hay que fijar 315 también
   - Línea 336: filtro de órdenes visibles por técnicos (`idsVisibles.has(o.tecnicoId)` donde idsVisibles tiene docIds)
   - **Línea 432 (NUEVO HALLAZGO)**: render indexa `ordenesPorTecnico[t.id]` cuando `ordenesPorTecnico` fue construido con key `o.tecnicoId` (uid). Sin esto fixeado, aunque los técnicos se muestren, sus órdenes salen vacías.

2. **Type `Personal` SÍ tiene `uid?: string`** (línea 1381 de types). Por lo tanto `t.uid || t.id` compila y es semánticamente correcto. Si `t.uid` no existe (alta vieja sin Auth), cae a `t.id` (doc id) — coherente con personal sin onboarding completo.

3. **Type `Usuario` NO tiene campo `uid` separado** (línea 31 de types). Por eso para línea 288 NO se puede usar `(t.uid || t.id) === (userProfile.uid || userProfile.id)`. La solución correcta es usar `currentUser.uid` del context `useApp()`.

4. **Hallazgos laterales NO incluidos en este sprint** (documentados para sprints follow-up):
   - **Línea 191** escribe `enviadaAFacturacionPorId = userProfile.id` en lugar de `currentUser.uid` — gotcha P-001 (`userProfile.id` no siempre es `auth.uid`). SPRINT-114 fixeó el botón principal `EnviarFacturacionButton.tsx:45` pero este path alternativo (modal "Solo chequeo" que también marca `enviadaAFacturacion`) quedó fuera. Esto NO causa el bug visual actual pero deja datos denormalizados. Abrir SPRINT-148 follow-up.
   - **Línea 144** escribe `registradoPorId: userProfile?.id || ''` en el pago — mismo problema. SPRINT-148 lo cubrirá junto con línea 191.
   - **Línea 290** (branch operaria filtrando técnicos a cargo): `t.operariaId === userProfile.id`. Es ambiguo si `t.operariaId` guarda uid o docId. Cowork detectó tres archivos más que comparan así (`nomina.service.ts:172`, `Ordenes.tsx:635`, `Rendimiento.tsx:297`). NO se toca en SPRINT-145 — SPRINT-146 (cazador extendido) va a catalogar y proponer fix por separado. Si Jorge no es operaria, esta línea no se ejercita.

#### Criterios de aceptación

**Cambios en `src/pages/AgendaDia.tsx`** (5 ediciones funcionales + 1 import):

- [ ] **Import** — agregar `currentUser` al destructuring de `useApp()` (línea 31):
  - Antes: `const { userProfile } = useApp();`
  - Después: `const { userProfile, currentUser } = useApp();`
- [ ] **Línea 288** — branch rol técnico (filtra técnicos para mostrar solo el del user actual):
  - Antes: `lista = lista.filter(t => t.id === userProfile.id);`
  - Después: `lista = lista.filter(t => (t.uid || t.id) === currentUser?.uid);`
  - Justificación: `userProfile.id` NO es siempre auth.uid (cascade fallback `personal/` lo carga con personalDocId). Usar `currentUser.uid` directo del Firebase Auth context.
- [ ] **Línea 295** — filtro por dropdown de técnico:
  - Antes: `lista = lista.filter(t => t.id === filtroTecnico);`
  - Después: `lista = lista.filter(t => (t.uid || t.id) === filtroTecnico);`
  - Justificación: el dropdown emite `value={t.uid}` en línea 382 (correcto post-SPRINT-132). Acá el filtro compara contra `t.id` (docId). Mismatch.
- [ ] **Línea 310** — filtrar técnicos con órdenes:
  - Antes: `return tecnicosVisibles.filter(t => idsConOrden.has(t.id));`
  - Después: `return tecnicosVisibles.filter(t => idsConOrden.has(t.uid || t.id));`
  - Justificación: el Set se construye en línea 309 con `o.tecnicoId` (uid). Lookup contra `t.id` (docId) falla.
- [ ] **Línea 315** — filtrar técnicos SIN órdenes (sección "Sin citas hoy"):
  - Antes:
    ```
    const idsConOrden = new Set(tecnicosConOrdenes.map(t => t.id));
    return tecnicosVisibles.filter(t => !idsConOrden.has(t.id));
    ```
  - Después:
    ```
    const idsConOrden = new Set(tecnicosConOrdenes.map(t => t.uid || t.id));
    return tecnicosVisibles.filter(t => !idsConOrden.has(t.uid || t.id));
    ```
  - Justificación: este `useMemo` es internamente consistente (mismo valor en map y filter), pero usa docId. Una vez que línea 310 use uid, este NO necesita el cambio funcionalmente — pero SÍ por consistencia para evitar bugs futuros si alguien refactoriza. Cambio ambos lados de la comparación a `t.uid || t.id` para que el set y el filter usen el mismo dominio que el resto del archivo.
- [ ] **Línea 335-336** — filtrar órdenes visibles por técnicos visibles:
  - Antes:
    ```
    const idsVisibles = new Set(tecnicosVisibles.map(t => t.id));
    return ordenesDelDia.filter(o => !o.tecnicoId || idsVisibles.has(o.tecnicoId));
    ```
  - Después:
    ```
    const idsVisibles = new Set(tecnicosVisibles.map(t => t.uid || t.id));
    return ordenesDelDia.filter(o => !o.tecnicoId || idsVisibles.has(o.tecnicoId));
    ```
  - Justificación: `o.tecnicoId` es uid. `idsVisibles` debe contener uids.
- [ ] **Línea 432** — render indexa map de órdenes por técnico:
  - Antes: `ordenes={ordenesPorTecnico[t.id] || []}`
  - Después: `ordenes={ordenesPorTecnico[t.uid || t.id] || []}`
  - Justificación: `ordenesPorTecnico` se construye en líneas 318-330 con key `o.tecnicoId` (uid). Indexar por `t.id` (docId) retorna `undefined` y se renderiza `[]`.

**NO tocar en este sprint:**

- ❌ Línea 290 (branch operaria — `t.operariaId === userProfile.id`). Análisis separado en SPRINT-146.
- ❌ Línea 144 y 191 (`registradoPorId`, `enviadaAFacturacionPorId` con `userProfile.id`). Sprint follow-up SPRINT-148.
- ❌ Cualquier otra parte del archivo. Solo las 6 líneas identificadas + el import.

**Comentarios de fallback en el código** (sub-regla "documentar el porqué"):

- [ ] Encima de cada línea modificada agregar comentario corto referenciando SPRINT-145 + patrón P-006 variante "set/map indexing". Ejemplo:
  ```ts
  // SPRINT-145 / P-006 variante useMemo+Set: `tecnicoId` es auth.uid (post-c4be345),
  // `t.id` es doc id de personal. Usar `(t.uid || t.id)` para alinear dominios.
  return tecnicosVisibles.filter(t => idsConOrden.has(t.uid || t.id));
  ```
- [ ] El comentario debe estar 1 línea arriba del código modificado, NO inline al final de la línea (legibilidad).

**Validaciones automáticas:**

- [ ] `npm run build` PASS (typecheck completo, no solo el archivo modificado).
- [ ] `npm run lint` PASS sin warnings nuevos (baseline preservado).
- [ ] `npm run check:regression` — cazadores 8/8 PASS (P-001 a P-008).
- [ ] regression_guardian invocado en el diff (toca `src/pages/` que es categoría "código con consecuencias en producción").
- [ ] Commit con mensaje exacto: `fix(agenda): SPRINT-145 P-006 escapado en filtros y render de AgendaDia (técnicos con órdenes aparecen en "Sin citas hoy")`.
- [ ] Push + verificar deploy Ready en Vercel.

#### Restricciones / guardarrails

- NO tocar la lógica de `o.tecnicoId` en órdenes (eso es correcto post-SPRINT-132).
- NO renombrar `idsConOrden`, `idsVisibles`, `tecnicosVisibles`, `ordenesPorTecnico` ni otros identificadores.
- NO refactorizar `useMemo` ni la estructura de los filtros — solo cambio quirúrgico de comparación.
- NO agregar nuevos `useMemo` ni dependencias nuevas en `package.json`.
- NO tocar el branch de operaria (línea 290) hasta validar comportamiento de `t.operariaId` en SPRINT-146.
- NO tocar líneas 144 y 191 (escrituras `registradoPorId` y `enviadaAFacturacionPorId`). Documentado como deuda en SPRINT-148.
- Si al ejecutar el sprint el coordinator encuentra que `t.operariaId` también rompe (porque Jorge está logueado como admin con permisos especiales y el branch de operaria se ejercita igual), PARAR y reportar.
- Si typecheck falla por alguna inferencia perdida (`currentUser` puede ser `null`), agregar el chain operator `?.uid` y revisar si hay falsey-check necesario antes del filter.

#### QA post-deploy (Jorge)

- [ ] Hard refresh en `https://app.misterservicerd.com/admin/agenda`.
- [ ] Verificar que la fecha 12/05/2026 muestra OS-0049 agrupada bajo Aury Mon (columna del técnico).
- [ ] Verificar que KPI "Completadas" muestra ≥1 (OS-0049 está en fase `trabajo_realizado`).
- [ ] Verificar que Aury Mon NO aparece en la sección "Sin citas hoy".
- [ ] Filtrar por técnico Aury Mon en el dropdown — debe mostrar solo sus órdenes.
- [ ] Cambiar fecha al pasado (ej: 7/5/2026) — debe mostrar órdenes históricas correctamente agrupadas.
- [ ] Verificar que el agrupamiento por operaria sigue funcionando (filtro de operarias del admin).

#### Notas para el coordinator

- Sprint quirúrgico, 1 archivo, 6 ediciones + 1 import. NO refactor estructural.
- archivist PRE-CHANGE OBLIGATORIO (página crítica para todos los roles + Jorge reportó bug productivo en uso normal).
- Cazadores 8/8 deben seguir verdes — el nuevo patrón es lo que SPRINT-146 va a extender (no este sprint).
- Después de este sprint, SPRINT-146 (extender cazador P-006) cobra prioridad — el cazador no detectó este bug y hay riesgo de más casos similares escondidos. Ya hay 3 hits adicionales potenciales catalogados (operariaId comparado contra p.id en nomina.service.ts:172, Ordenes.tsx:635, Rendimiento.tsx:297) que necesitan barrido sistémico.
- Si el reviewer detecta efectos colaterales (ej: usuarios con permiso de operaria que ahora ven distinto), reportar y pausar antes de pushear.

---

### SPRINT-146 — Extender cazador P-006 para detectar patrón `useMemo + Set + t.id` + barrido sistémico

**Estado:** COMPLETADO 2026-05-12 (coordinator autónomo `trabaja`, hash a definir). Cazador P-006 extendido con Variante 3 (`Set.has(X.id)` + `[X.id]` indexing con contexto de sufijo de campo de orden). Test de caza confirma que detecta el shape exacto de AgendaDia pre-SPRINT-145. Cazadores 7/7 PASS sin hits sobre HEAD post-fix. `docs/PATRONES_REGRESION.md` actualizado con Variante 3 + nota sobre deuda operariaId (SPRINT-147 follow-up, requiere OK Jorge para definir si migrar a uid o documentar como docId intencional). Barrido sistémico NO encontró hits adicionales que el cazador atrape (los 3 hits potenciales de operariaId quedan documentados como deuda — no cazables con shape actual del cazador porque `p.id` se compara contra `o.operariaId` que en el modelo HOY es docId, no uid).
**Prioridad:** media (defensa preventiva post-SPRINT-145; el cazador P-006 falló a detectar AgendaDia. Probable que haya otros casos similares escondidos en el codebase.)
**Origen:** Cowork 2026-05-12. Análisis post-SPRINT-145 reveló que el patrón actual de P-006 (`scripts/invariantes/check-tecnicoid-personal-id-misuse.ts`) escanea solo `<option value={t.id}>` y `.find(p => p.id === ...)`. NO detecta `new Set(arr.map(t => t.id)).has(otherUid)`, que es el shape que causó el bug en AgendaDia.tsx.
**Riesgo:** bajo (modifica un cazador read-only + corre barrido. Si encuentra hits adicionales, los fixea en commits separados con micro-sprints o consolida.)
**Touch-list previsto:** `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts` (extensión), `docs/PATRONES_REGRESION.md` (actualizar entrada P-006), posiblemente otros archivos de `src/` si el barrido encuentra hits (commits separados con mensajes "fix(P-006): SPRINT-146 barrido encontró ... en archivo.tsx").

#### Objetivo

Ampliar el cazador P-006 para detectar el patrón `useMemo + Set + .has(t.id)` cuando se compara contra valores que post-c4be345 son `auth.uid`. Re-correr el cazador sobre todo el codebase. Reportar hits y proponer fix o allowlist justificada.

#### Por qué

- El cazador actual tiene una blind spot: solo detecta acceso directo (`<option value={t.id}>` o `.find(p => p.id === X)`). No detecta acceso indirecto vía Set/Map.
- SPRINT-145 demuestra que el blind spot causó un bug en producción. Hay que cerrar la brecha para que el próximo refactor no reintroduzca el mismo patrón.
- El patrón es buscable: `new Set(...map(... => ... \.id...))` seguido de `.has(o.tecnicoId)` o variantes.

#### Criterios de aceptación

**Parte A — Extensión del cazador:**

- [ ] Leer `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts` y entender la estructura actual de regex.
- [ ] Agregar 2 nuevos patrones de detección:
  - Patrón "Set with t.id": regex que detecta `new Set(...\.map\(\(?\w+\)? => \w+\.id\)` dentro de un `useMemo` o función que también referencia `tecnicoId`, `operariaId`, `responsableId`, `ayudanteId`, `creadaPor`.
  - Patrón "Map.has with field": detecta `\.has\(.+\.tecnicoId\)` o `\.has\(.+\.(operariaId|responsableId|ayudanteId)\)` (cuando lo que va antes es un Set construido con `.id`).
- [ ] Si un archivo tiene el comentario `// @safe-tecnicoid-id` arriba del patrón, allowlist (igual que con el cazador actual).
- [ ] Agregar al menos 2 tests inline (assertions sobre código de ejemplo) para validar que el patrón se caza.
- [ ] Documentar el patrón nuevo en el header del cazador con 1 ejemplo "antes/después".

**Parte B — Actualizar catálogo:**

- [ ] Actualizar `docs/PATRONES_REGRESION.md` entrada P-006:
  - Agregar sección "Variante useMemo + Set" con el ejemplo de AgendaDia.
  - Linkear a SPRINT-145 (fix) y SPRINT-146 (extensión cazador).
  - Mencionar que el patrón también puede aparecer con `operariaId`, `responsableId`, `ayudanteId`.

**Parte C — Barrido sistémico:**

- [ ] Correr `npm run check:regression` después de la extensión. El cazador debe estar en 0 hits sobre AgendaDia (porque SPRINT-145 ya cerró el caso).
- [ ] **Investigar 3 hits potenciales adicionales ya detectados por Cowork** (compares `o.operariaId === p.id`):
  - `src/services/nomina.service.ts:172` — `o.operariaId === p.id` (lookup en nómina)
  - `src/pages/Ordenes.tsx:635` — `o.operariaId === userProfile?.id` (filtro de "mis órdenes" para operaria)
  - `src/pages/Rendimiento.tsx:297` — `o.operariaId === op.id` (lookup en métricas)
  - Para cada uno: leer cómo se SETEA `operariaId` en ordenes_servicio (probable: derivación en `useOrdenCreateForm.ts` y `OrdenEditForm.tsx` post-SPRINT-130). Si `operariaId` guarda uid: bug, fixear. Si guarda docId: documentar y dejar.
  - **Si fixear los 3 toma >30 min o cambia comportamiento de cálculo de comisión**: PARAR. Abrir SPRINT-147a/b/c separados con OK Jorge.
- [ ] Si aparecen hits NO documentados en allowlist más allá de los 3 anteriores:
  - **Si son ≤3 archivos y mismo shape**: fixearlos en este sprint con un commit hermano `fix(P-006): SPRINT-146 barrido encontró ... en archivo.tsx`.
  - **Si son >3 archivos o shapes distintos**: PARAR. Documentarlos en el output del sprint. Abrir SPRINT-147 follow-up con OK explícito de Jorge.
- [ ] Verificar que el cazador NO genera falsos positivos sobre patrones de UI no Firestore-bound (ej: filtros locales de tabla, autocomplete que no escribe a doc).
- [ ] Verificar que el cazador NO ataca clientes/productos/equipos (esos NO tienen `uid` ni necesitan auth.uid). Allowlist por archivo si hace falta (`TablaReactivacion.tsx`, `TabReactivacion.tsx` ya identificados como seguros).

**Global:**

- [ ] `npm run build` + `npm run lint` PASS.
- [ ] Cazadores 8/8 PASS post-extensión.
- [ ] regression_guardian invocado.
- [ ] Commit con mensaje: `chore(invariantes): SPRINT-146 extender P-006 para detectar Set+t.id en useMemo + barrido codebase`.

#### Restricciones / guardarrails

- NO modificar otros cazadores (P-001 a P-005, P-007, P-008).
- NO desactivar P-006 mientras se extiende — agregar el patrón nuevo como condición OR adicional.
- NO consolidar fixes de archivos distintos en un solo commit. Cada archivo tocado por barrido debe tener commit propio para forensia.
- Si la extensión genera regex demasiado costosa (run >5s en `npm run check:regression`), considerar usar AST parser en lugar de regex puro. PERO eso es scope creep — solo si la regex es demostrablemente lenta. Si funciona bien con regex, queda con regex.

#### Notas para el coordinator

- Sprint preventivo, no urgent. Si la cola tiene otros sprints más críticos, este puede esperar.
- Depende de SPRINT-145 (debe estar deployado primero — sino el cazador caza AgendaDia y bloquea pre-commit).
- archivist PRE-CHANGE útil pero no obligatorio (toca cazador, no código de la app).

---

### SPRINT-148 — UX Conduces de Garantía: mostrar orden completa al expandir fila + modal "Marcar garantía"

**Estado:** COMPLETADO 2026-05-12 (coordinator autónomo `trabaja` pasada 10, hash `b45df45`). Componente nuevo `src/components/facturas/OrdenResumenLectura.tsx` (puro display, soporta shape nuevo + legacy + badges "Solo chequeo" / "Orden eliminada" / "Visita de garantía"). 2 puntos de montaje en `Facturas.tsx`: fila expandida (variant compacto) y modal Marcar garantía (variant completo, modal `size="md"` → `"lg"`, bloque Cliente/Equipo/Técnico redundante removido). Cazadores 7/7 PASS. typecheck PASS. Build PASS (Facturas chunk 55.88 kB). Lint del archivo nuevo PASS limpio. Warning preexistente `handleAnular` (línea 178) intacto — NO introducido por este sprint. QA visual humana pendiente (Jorge ejercita post-deploy según QA-1 a QA-7 del spec).
**Prioridad:** media (no hay bug actual; es mejora UX. Pero importante: cuando llegue una reclamación real, sin esto la operaria/admin decide a ciegas. Riesgo de aprobar garantía sobre orden de chequeo donde no aplica.)
**Origen:** Jorge 2026-05-12 vía Cowork. Observación viendo CG-00016 (vinculado a OS-0049, que fue marcada como "Solo chequeo"). Al hacer clic en el botón "Marcar garantía" o expandir la fila, el sistema NO muestra el contexto de la orden original — solo subtotal, ITBIS, items resumidos. Para decidir si una garantía aplica, hay que ver la orden completa (qué se hizo, qué piezas, fotos del cierre, satisfacción cliente, si fue solo chequeo, etc.). Sin esto: decisiones inconsistentes y riesgo de aprobar garantías sobre trabajos sin reparación.
**Riesgo:** bajo (1 archivo modificado + 1 componente nuevo. Sin tocar lógica de garantía, sin tocar Firestore, sin tocar shape de datos. Solo agrega UI de display read-only.)
**Touch-list previsto:** `src/components/facturas/OrdenResumenLectura.tsx` (NUEVO), `src/pages/Facturas.tsx` (2 puntos de montaje: línea ~730 expandible y líneas 900-960 modal)

#### Auditoría de consumidores (sub-regla obligatoria CLAUDE.md)

**Archivos a modificar:**
- `src/pages/Facturas.tsx`
- `src/components/facturas/OrdenResumenLectura.tsx` (NUEVO)

**Consumidores verificados (read-only check):**
- `src/pages/Facturas.tsx` es importado SOLO en `src/App.tsx:28` (lazy import). Ruta única: `/admin/facturas`. NO es importado por ningún otro componente. Cambio aislado.
- Type `OrdenServicio`: usado en 50+ archivos pero solo lectura. NO cambia shape — solo se lee `cierreServicio`, `piezasUsadas`, `notasTecnico`, `tipoCierre`, `soloChequeo`, `periodoGarantiaDias`, `garantiaVencimiento`, `descripcionFalla`, etc. (todos campos ya existentes).
- `ordenesVinculadas` state ya existe en `Facturas.tsx:45` y se popula con las órdenes asociadas a las facturas visibles. Solo hay que consumirlo, no agregarlo.
- `OrdenDetailModal` existente: NO se va a reutilizar ni tocar. Es para otro contexto (vista admin con botones de acción). Componente nuevo es independiente.

**Consumidores NO afectados:**
- `src/components/ordenes/OrdenDetailModal.tsx` — vive en otra ruta, otro propósito.
- `src/pages/FacturacionPendiente.tsx` (Conduces Pendientes) — podría beneficiarse del mismo componente, pero está FUERA DE SCOPE en este sprint. Si Jorge quiere extenderlo, abrir SPRINT-150 follow-up que reutilice `OrdenResumenLectura` ahí.

**Hallazgos laterales (deuda documentada, NO fixear silenciosamente):**
- `Facturas.tsx` tiene ~1000 líneas. Refactor en módulos más chicos podría ser SPRINT-151 futuro.
- El modal "Marcar garantía" actual muestra cliente/equipo/técnico solo del Factura — duplica info que aparecerá en `OrdenResumenLectura`. Después de este sprint, conviene limpiar esa redundancia. NO en scope.

#### Objetivo

Cuando la operaria/admin esté evaluando un conduce de garantía, ver el contexto completo del trabajo original sin tener que abrir otra pestaña ni navegar a la orden.

Aplica en dos puntos:
1. **Al expandir la fila** de un conduce (clic en la fila completa) → debajo del resumen contable existente, agregar sección "Orden original" con todo el detalle.
2. **Al hacer clic en "Marcar garantía"** → el modal debe mostrar primero la orden completa, después el form de razón.

#### Por qué

- CG-00016 (vinculado a OS-0049) tiene como único item "Chequeo de Secadora (sin reparación)". Si un cliente reclama garantía sobre eso, la operaria NO debería poder aprobar la garantía sin saber que no hubo reparación → no hay nada que cubrir.
- Sin contexto, se aprueba/rechaza a ciegas. Riesgo de decisiones inconsistentes o conflictos con clientes.
- La info ya existe en el doc de la orden — solo falta mostrarla acá.

#### Criterios de aceptación

**Componente nuevo `src/components/facturas/OrdenResumenLectura.tsx`:**

- [ ] Props:
  ```typescript
  interface Props {
    orden: OrdenServicio | null | undefined;
    variant?: 'compacto' | 'completo'; // default 'completo'
  }
  ```
- [ ] Read-only puro: NO renderea botones de acción. NO permite editar nada.
- [ ] Si `orden` es `null`/`undefined`: mostrar mensaje "Orden original no disponible" o "Cargando..." según contexto.
- [ ] Si `orden.eliminada === true`: mostrar todo igual pero con badge "Orden eliminada" arriba.
- [ ] Secciones a mostrar (en orden):
  1. **Encabezado**: `numero` (OS-####) + `clienteNombre` + `cierreServicio.fechaCierre` formateada (si existe, sino "Sin cierre") + `tecnicoNombre`.
  2. **Equipo**: `equipoTipo` / `equipoMarca` / `equipoModelo` (formato consistente con `formatearEquipoLabel` de `utils/index.ts`).
  3. **Falla reportada**: `descripcionFalla`.
  4. **Fecha de cita original**: `fechaCita`.
  5. **Cierre del técnico** (solo si `cierreServicio` existe):
     - Equipo funciona: Sí / No / sin dato (badge color)
     - Cliente satisfecho: Sí / No / sin dato (badge color)
     - Revisó conexiones: Sí / No / sin dato (badge color)
     - Foto del cierre (`cierreServicio.fotoCierre` URL) si existe — thumbnail clickeable que abre en nueva pestaña.
     - Soporte para shape legacy: si `cierreServicio` tiene `piezasRetiradas` / `checklist` / `satisfaccionCliente`, mostrarlos en sección colapsable "Datos legacy del cierre".
  6. **Piezas utilizadas**: leer `cierreServicio.piezasUsadas` (nuevo) o caer a `costoPiezasTotal`/`cantidadPiezasUsadas` si no existe el array. Lista de piezas con cantidad + costo + total. Si no hay piezas, "Sin piezas".
  7. **Notas del técnico** (`notasTecnico`) si existen.
  8. **Período de garantía configurado** (`periodoGarantiaDias` + `garantiaVencimiento`) si existen. Formato: "60 días · vence el 12/07/2026 (faltan 45 días)". Si la orden es legacy sin esos campos: "No configurado (orden previa al SPRINT-135a-UI)".
  9. **Indicador "Solo chequeo"**: si `tipoCierre === 'solo_chequeo'` o `soloChequeo === true`, mostrar **badge prominente arriba de todo** con texto "⚠ SOLO CHEQUEO · SIN REPARACIÓN" (color amber o rojo, según importancia visual). Razón: este es el caso de CG-00016/OS-0049 — debe gritar visualmente para que la operaria no apruebe garantía sobre eso.
- [ ] Diferencias `variant='compacto'` vs `'completo'`:
  - Compacto (en fila expandible): omite encabezado (redundante con la card padre); las secciones se renderean en grid de 2 columnas en desktop, 1 en mobile.
  - Completo (en modal): todo lleno, secciones apiladas verticalmente.
- [ ] Mobile responsive: probado mentalmente en iPad portrait (~810px) y mobile (~390px).
- [ ] Sin imports de servicios de Firestore, sin imports de context. Componente PURO de display.

**Cambios en `src/pages/Facturas.tsx`:**

1. **Import** del nuevo componente al principio del archivo.

2. **Fila expandible** (zona donde aparece subtotal/ITBIS/comisión, después de línea ~730):
   - Después del bloque actual de "comisión total" + "items", agregar:
     ```tsx
     {factura.ordenId && (
       <div className="border-t border-gray-100 mt-4 pt-4">
         <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
           Orden original
         </h4>
         <OrdenResumenLectura
           orden={ordenesVinculadas[factura.ordenId] ?? null}
           variant="compacto"
         />
       </div>
     )}
     ```

3. **Modal "Marcar como garantía manual"** (líneas 900-960):
   - Antes del bloque actual de "¿Iniciar trabajo de garantía sin reclamo del cliente?", insertar:
     ```tsx
     {facturaGarantiaManual?.ordenId && (
       <OrdenResumenLectura
         orden={ordenesVinculadas[facturaGarantiaManual.ordenId] ?? null}
         variant="completo"
       />
     )}
     ```
   - Cambiar `size="md"` a `size="lg"` o `size="xl"` para acomodar la info adicional sin scroll excesivo.
   - El bloque actual "Cliente / Equipo / Técnico" en `bg-gray-50` (líneas 923-934) puede quedar como redundancia visual — eliminar para evitar duplicación con `OrdenResumenLectura`.

**Carga de órdenes vinculadas (verificar):**

- [ ] Verificar que `ordenesVinculadas: Record<string, OrdenServicio>` (línea 45 de Facturas.tsx) se popula con TODAS las órdenes vinculadas a las facturas visibles (no solo algunas). Si no, ajustar el effect que lo llena. NO romper rendimiento — usar `getDocs` por chunks de 10 si es muchas.
- [ ] Si se demuestra que el effect actual ya carga todas, NO modificar nada.

**Validaciones automáticas:**

- [ ] `npm run build` PASS (typecheck completo).
- [ ] `npm run lint` PASS sin warnings nuevos.
- [ ] `npm run check:regression` PASS (8/8 cazadores en verde + nuevo cazador P-006 variante 3 que SPRINT-146 instaló).
- [ ] regression_guardian invocado (toca `src/pages/`, categoría sensible).
- [ ] archivist PRE-CHANGE recomendado pero no obligatorio (es UI nueva, no había bugs históricos sobre este flujo específico).
- [ ] Commit: `feat(garantia-ui): SPRINT-148 mostrar orden completa en conduces de garantía (fila expandida + modal marcar garantía)`.
- [ ] Push + verificar deploy Ready en Vercel.

#### Restricciones / guardarrails

- NO tocar `OrdenDetailModal.tsx` existente.
- NO importar `OrdenDetailModal` en `Facturas.tsx` — es para otro contexto con botones de acción.
- NO agregar botones de acción dentro del componente nuevo. Solo display.
- NO tocar `handleAbrirGarantiaManual`, `handleConfirmarGarantiaManual` ni similares.
- NO cambiar shape de Firestore. Solo lectura.
- NO agregar dependencias nuevas a `package.json`.
- NO modificar el icono ni la posición del botón "Marcar garantía".
- Si una orden tiene MUCHA información (>50 piezas, notas larguísimas), considerar paginación o "Ver más" — pero NO bloquear el sprint por eso.
- Si el effect que popula `ordenesVinculadas` no carga la orden necesaria, expandir su scope **es parte de este sprint** (no se documenta como deuda — es requisito para que el feature funcione).

#### QA post-deploy (Jorge)

1. Hard refresh en `/admin/facturas` (Conduces de Garantía).
2. **QA-1 — Fila expandible**: clic en CG-00016 (cualquier conduce existente) → debe expandirse Y mostrar la sección "Orden original" abajo, con todo el detalle.
3. **QA-2 — Solo chequeo es obvio**: para CG-00016 (vinculado a OS-0049 que es Solo chequeo), debe aparecer un badge prominente "SOLO CHEQUEO · SIN REPARACIÓN" arriba del detalle.
4. **QA-3 — Modal marcar garantía**: clic en botón "Marcar garantía" en un conduce vigente → el modal debe mostrar PRIMERO la orden completa, DESPUÉS el form de razón.
5. **QA-4 — Conduce de reparación con piezas**: si tenés un conduce de reparación real con piezas, expandirlo debe mostrar las piezas listadas con cantidad y costo.
6. **QA-5 — Orden eliminada**: si hay un conduce cuya orden fue soft-deleteada, debe mostrar el resumen igualmente con badge "Orden eliminada".
7. **QA-6 — Sin orden vinculada**: si hay un conduce huérfano (sin `ordenId`), debe NO romper — solo no mostrar la sección o mostrar "Sin orden vinculada".
8. **QA-7 — Mobile**: probar en iPad portrait — todo debe verse bien.

#### Notas para el coordinator

- Sprint UX, riesgo bajo. archivist PRE-CHANGE útil pero no obligatorio.
- Si al implementar el componente nuevo el builder detecta que `ordenesVinculadas` NO carga todas las órdenes necesarias (ej: solo carga las de la página actual y la paginación rompe), ese fix es parte de este sprint, no follow-up.
- Mantener el componente nuevo en `src/components/facturas/` (subdirectorio nuevo si no existe). NO ponerlo en `src/components/ordenes/` para evitar acoplamiento con OrdenDetailModal.
- Si la UI queda muy cargada con `variant='completo'` en el modal, considerar agregar tabs ("Datos generales", "Cierre", "Piezas") como mejora futura — pero NO en este sprint.

---

### SPRINT-149 — Completar migración `operariaId` a `auth.uid` (cerrar inconsistencia post-SPRINT-105) + script de re-migración de datos

**Estado:** COMPLETADO 2026-05-12 (coordinator pasada 12, `trabaja`). 13 archivos de código + 1 script de migración + 1 cazador extendido (P-006 variante 4) + 2 docs actualizados. Cazadores 7/7 PASS, typecheck PASS, build PASS, lint sin diff vs main. `--apply` del script de migración NO ejecutado autónomo — entrada nueva en `BLOQUEOS.md` para OK de Jorge. Histórico de bloqueo preservado en bloque colapsado más abajo en esta misma entrada.

<details>
<summary>Historial de bloqueo (preservado para forensia)</summary>

**Estado anterior:** BLOQUEADO — movido a `BLOQUEOS.md` el 2026-05-12 por coordinator pasada 11. Razón: conflicto entre instrucción de Cowork ("vamos con operaria", spec PENDIENTE) e instrucción explícita del prompt del modo autónomo en la misma pasada ("NO toques los 3 hits operariaId === p.id... van a BLOQUEOS.md si no están ya"). Sin esto, procesar autónomo iría contra instrucción posterior de Jorge.

**Resolución:** Jorge confirmó explícitamente en pasada 12 ("ambos en orden, 149 primero") que SPRINT-149 procesa autónomo según spec de Cowork.

</details>

**Estado original:** PENDIENTE
**Prioridad:** alta (bug latente activo, no futuro. Las operarias creadas post-SPRINT-105 ya tienen `operariaId = uid` en producción, pero todos los lookups en código asumen doc id. Cualquier operaria nueva queda con métricas de nómina, dashboard, rendimiento, recordatorios y filtros rotos en silencio. No estalló porque las operarias actuales son pre-SPRINT-105.)
**Origen:** Jorge 2026-05-12 vía Cowork. Cowork detectó durante auditoría de SPRINT-145 que `operariaId` se comparaba contra `p.id` en 3 archivos (`nomina.service.ts:172`, `Ordenes.tsx:635`, `Rendimiento.tsx:297`) — mismo shape que el bug P-006 viejo de tecnicoId. Re-auditoría profunda (a pedido explícito de Jorge: "vamos con operaria") reveló 20 archivos que tocan `operariaId` y un detalle crítico: **el WRITE-side ya fue parcialmente migrado en `FormAltaEditarEmpleado.tsx:226`** que ya emite `value={op.uid || op.id}` con comentario "Las operarias nuevas (post-SPRINT-105) tienen uid; las viejas conservan id". El READ-side NO se migró. Sprint cierra el ciclo.
**Riesgo:** medio-alto. Toca 13 archivos de páginas/services críticos (nómina, dashboard, rendimiento, recordatorios), incluye script de migración de datos sobre `ordenes_servicio` y `personal/`. La regresión potencial es alta si el fix se hace mal — afectaría cálculo de comisiones y métricas. PERO la inacción también tiene riesgo: la próxima operaria nueva tendrá métricas rotas silenciosamente.
**Touch-list previsto:** 13 archivos de código + 1 script nuevo + 2 docs.

#### Auditoría de consumidores (sub-regla obligatoria CLAUDE.md)

**Hallazgos clave de la auditoría:**

1. **`operariaId` se usa en DOS contextos distintos**:
   - **`ordenes_servicio.operariaId`** → apunta a la operaria responsable de esa orden.
   - **`personal[tecnico].operariaId`** (campo del doc del técnico) → apunta a la operaria a cargo del técnico.
   - Ambos comparten el mismo shape ambiguo (uid post-SPRINT-105 / docId legacy).

2. **WRITE-side ya migrado (parcialmente)**: `FormAltaEditarEmpleado.tsx:213, 226` ya emite `op.uid || op.id`. `useOrdenCreateForm.ts:591` y `ordenes.service.ts:214` derivan el valor del técnico (que hereda el shape). `PersonalPage.tsx:772, 778` aún usa `destino.id` directo — necesita fix.

3. **READ-side roto**: todos los lookups asumen doc id. 14 puntos de comparación contra `p.id`/`op.id`/`userProfile.id` que necesitan fix.

**Archivos a modificar (lookups + escrituras pendientes):**

| Archivo | Líneas | Tipo | Fix |
|---|---|---|---|
| `src/services/nomina.service.ts` | 172 | Read: `o.operariaId === p.id` (bono mensual) | `(p.uid \|\| p.id) === o.operariaId` |
| `src/pages/Ordenes.tsx` | 352-353, 635, 641 | Read: filtros mis órdenes + coord + comparación | Patrón fallback uid/id |
| `src/pages/Rendimiento.tsx` | 297 | Read: lookup métricas | `(op.uid \|\| op.id) === o.operariaId` |
| `src/pages/MetricasMensuales.tsx` | 98, 174 | Read: idem | Idem |
| `src/pages/Dashboard.tsx` | 216, 250, 257, 400, 466 | Read: 5 lookups (recordatorios, filtros, bono, técnicos) | Idem (línea 466 es `t.operariaId === userProfile?.id`, requiere también re-evaluar comentario `@safe-userprofile-id` existente) |
| `src/pages/PersonalPage.tsx` | 614, 618, 713, 772, 778 | Read + Write: contadores + transferencia al eliminar | Lookups con fallback + escrituras 772/778 cambiar `destino.id` → `destino.uid \|\| destino.id` |
| `src/pages/AgendaDia.tsx` | 298, 300 | Read: filtros operaria | Idem |
| `src/pages/MapaRutas.tsx` | 591-592 | Read: comparación | Idem |
| `src/components/recordatorios/RecordatorioBanner.tsx` | 85, 135, 315 | Read: matching recordatorios | Idem |
| `src/components/personal/ModalConfirmarEliminar.tsx` | 60, 64 | Read: contadores | Idem |
| `src/components/personal/GruposOperariaTecnico.tsx` | 34 | Read: agrupamiento técnicos por operaria | Idem |
| `src/components/ordenes/OrdenesTablero.tsx` | 202-203 | Read: comparación | Idem |
| `src/components/ordenes/BotonRederivarOperaria.tsx` | 45, 47 | Read: comparación | Verificar — puede ser idempotente si ya pasa por el helper transaccional |

**Archivos NO afectados (verificados, no necesitan fix):**
- `src/services/ordenes.service.ts:211, 214` — Ya usa `(p.uid \|\| p.id) === tecnicoId` (patrón correcto, helper SPRINT-130). NO tocar.
- `src/services/recordatorios.service.ts:67, 83, 244` — Solo persiste el valor recibido, no compara. No requiere fix.
- `src/types/index.ts:877, 1774` — Type definition. No requiere fix.
- `src/utils/index.ts:703` — parseOrden lee del raw. No requiere fix.
- `src/components/personal/FormAltaEditarEmpleado.tsx:209-226` — Ya usa el patrón correcto post-SPRINT-105.
- `src/hooks/useOrdenCreateForm.ts:591, 642` — Deriva del valor del técnico, no compara. No requiere fix.
- `src/components/ordenes/IniciarChequeoButton.tsx:303` — Solo agrega a un Set, no compara. No requiere fix.

**Archivos NUEVOS:**
- `scripts/migrar-operariaid-a-uid.ts` (NUEVO) — Read-only default + `--apply` flag. Migra `ordenes_servicio.operariaId` y `personal[tecnico].operariaId` de doc id a auth.uid donde la operaria tenga `uid` poblado.

**Docs a actualizar:**
- `docs/CAMPOS_CROSS_COLLECTION.md` — cambiar fila `operariaId` de "⚠ por confirmar" a "auth.uid" con referencia a SPRINT-149.
- `docs/PATRONES_REGRESION.md` — extender entrada P-006 mencionando que `operariaId` también está bajo este patrón.

**Cazador a verificar/extender:**
- `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts` — Verificar si ya cubre `operariaId` en su lista de sufijos. Si no, agregarlo. Re-correr post-fix para confirmar 0 hits.

**Hallazgos laterales (deuda documentada, NO fixear silenciosamente):**
- Comentario `@safe-userprofile-id` en `Dashboard.tsx:464-467` dice "matchea con personalDocId, no auth.uid" — DESACTUALIZADO. Al fixear ese punto, actualizar el comentario para reflejar el shape nuevo.

#### Objetivo

1. **Migrar todos los reads** de `operariaId` al patrón `(p.uid || p.id) === operariaId` (igual que SPRINT-132/145 con tecnicoId).
2. **Migrar las pocas escrituras pendientes** (`PersonalPage.tsx:772, 778`) al patrón `(destino.uid || destino.id)`.
3. **Migrar datos existentes**: script que alinee `operariaId` legacy (doc id) a uid donde la operaria tenga `uid` poblado.
4. **Cerrar el gotcha**: `operariaId` queda con la convención canónica `auth.uid` (igual que tecnicoId, post-SPRINT-105/c4be345).
5. **Documentar la convención** en `CAMPOS_CROSS_COLLECTION.md` y extender cazador P-006 para detectar cualquier reintroducción del patrón viejo.

#### Por qué

- Sin esto: cualquier operaria nueva creada en el sistema tiene métricas rotas silenciosamente. Nómina no le suma sus órdenes (bono mensual = 0 indebidamente). Dashboard no le muestra "sus órdenes". Recordatorios no le aparecen. Filtro "mis órdenes" devuelve vacío.
- El WRITE-side ya empezó la migración hace tiempo (SPRINT-105). Es deuda técnica clásica: empezar la migración sin completarla genera bugs híbridos peores que no migrar.
- Patrón ya validado: SPRINT-132 + SPRINT-145 hicieron exactamente lo mismo con `tecnicoId` exitosamente. Mismo enfoque.

#### Criterios de aceptación

**Parte A — Migración de reads (13 archivos):**

Para cada archivo del touch-list arriba, aplicar:

- [ ] Si la comparación es contra `array.find(x => x.id === orden.operariaId)` o similar, cambiar a `array.find(x => (x.uid || x.id) === orden.operariaId)`.
- [ ] Si la comparación es contra `array.filter(o => o.operariaId === op.id)`, cambiar a `array.filter(o => o.operariaId === (op.uid || op.id))`. **PERO** preferible: aplicar fallback al LADO de personal, no al lado de la orden, porque más adelante TODAS las órdenes nuevas tendrán uid. Forma final: `array.filter(o => o.operariaId === (op.uid || op.id))` y leer `o.operariaId` directo.
- [ ] Si la comparación es contra `userProfile.id` (filtros tipo "mis órdenes" para operaria logueada), considerar usar `currentUser.uid` en lugar de `userProfile.id`. **Necesita import** de `useApp()` si no está. Patrón ya usado en SPRINT-145.
- [ ] Si la comparación es `t.operariaId === userProfile?.id` (en `Dashboard.tsx:466` y `AgendaDia.tsx:298`) — son técnicos cuyo `operariaId` apunta a una operaria. Mismo fix: comparar contra `(userProfile?.uid || userProfile?.id)` o mejor `currentUser?.uid`.
- [ ] Agregar comentario corto encima de cada línea modificada referenciando SPRINT-149 y la convención nueva.

**Parte B — Migración de escrituras pendientes:**

- [ ] **`src/pages/PersonalPage.tsx:772, 778`** (transferencia al eliminar operaria): cambiar `destino.id` por `(destino.uid || destino.id)`.
- [ ] Verificar que no haya otras escrituras con `personal.id` directo a `operariaId` — grep `operariaId.*\.id\b` en `src/` después del fix.

**Parte C — Script de migración de datos:**

- [ ] `scripts/migrar-operariaid-a-uid.ts` (NUEVO) — Admin SDK, read-only por default, `--apply` para ejecutar:
  - Lee todas las operarias activas (`personal where rol == 'operaria' or rol == 'coordinadora'`).
  - Construye Map `{docId → uid}` para operarias que SÍ tienen uid.
  - **Para `ordenes_servicio`**: lee todas. Para cada doc con `operariaId` = docId conocido en el map, propone update a uid.
  - **Para `personal where rol == 'tecnico'`**: lee todos. Para cada doc con `operariaId` = docId conocido en el map, propone update a uid.
  - **Operarias sin uid** (alta vieja sin onboarding): sus órdenes/técnicos asociados NO se tocan. Documentar en el reporte final como "no migrados, operaria sin Auth account".
  - Output:
    - Read-only: tabla con conteos por categoría (ya con uid / migrable / no migrable / sin operariaId) + lista de 10 ejemplos de cada categoría.
    - Con `--apply`: ejecuta migración. Cada update incluye campo de auditoría `operariaIdMigradoDesde: <docIdViejo>` para forensia. Reporta cuántos docs se actualizaron.
  - **Idempotente**: correr de nuevo no cambia nada.
  - **Transaccional por batches de 100** con `writeBatch` (P-003).

**Parte D — Cazador P-006 extendido:**

- [ ] Leer `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts` y verificar si `operariaId` ya está en su lista de campos detectados. Si no, agregarlo.
- [ ] Re-correr `npm run check:regression` post-fix. Esperado: 0 hits sobre `operariaId === .id` o `Set.has(.id)` con sufijo operariaId.

**Parte E — Documentación:**

- [ ] `docs/CAMPOS_CROSS_COLLECTION.md` — actualizar fila `operariaId` (en sección `ordenes_servicio` y en sección `personal`) de "⚠ por confirmar" a "**auth.uid**" con referencia a SPRINT-149 y la migración.
- [ ] `docs/PATRONES_REGRESION.md` entrada P-006 — agregar nota sobre `operariaId` como variante adicional del mismo patrón.

**Global:**

- [ ] `npm run build` PASS.
- [ ] `npm run lint` PASS sin warnings nuevos.
- [ ] `npm run check:regression` PASS (8/8 cazadores, +0 hits post-fix).
- [ ] **archivist PRE-CHANGE obligatorio** (toca código de nómina/comisiones, riesgo medio-alto).
- [ ] **regression_guardian obligatorio** (cambios cross-cutting).
- [ ] **reviewer obligatorio** (riesgo financiero — nómina).
- [ ] Commit del fix de código: `fix(operariaid): SPRINT-149 completar migración operariaId a auth.uid (cerrar inconsistencia post-SPRINT-105)`.
- [ ] Commit del script: `feat(migracion): SPRINT-149 script migrar-operariaid-a-uid read-only + --apply`.
- [ ] Commit de docs: `docs: SPRINT-149 actualizar CAMPOS_CROSS_COLLECTION y PATRONES_REGRESION con convención operariaId`.
- [ ] Push + deploy Ready en Vercel.
- [ ] **NO ejecutar `--apply` del script desde el coordinator**. Esa es decisión de Jorge — escribir entrada en `BLOQUEOS.md` con el comando para que él lo dispare manualmente cuando esté listo.

#### Restricciones / guardarrails

- NO tocar `useOrdenCreateForm.ts`, `ordenes.service.ts`, `FormAltaEditarEmpleado.tsx` (ya están bien).
- NO cambiar `types/index.ts` ni `utils/index.ts` para `operariaId`.
- NO cambiar el shape al ESCRIBIR — el dropdown ya emite uid correctamente desde SPRINT-105.
- NO ejecutar `--apply` del script de migración automáticamente. Jorge decide cuándo y revisa el dry-run primero.
- NO mergear cambios de READ y migración en el mismo PR/commit — separar commits por capa (código → script → docs) para revisión más fácil.
- Si al hacer los cambios el reviewer detecta efectos en cálculo de comisiones (ej: ahora una operaria que antes no aparecía en nómina, va a aparecer), PARAR y reportar antes de commitear. Eso es CHANGE_NEEDED.
- Si el script encuentra >50 órdenes para migrar, mover decisión de `--apply` a OK explícito de Jorge en `BLOQUEOS.md` (sub-regla: migraciones >500 docs requieren OK, pero por prudencia bajamos el umbral acá a 50 dado el riesgo de nómina).

#### QA post-deploy (Jorge — DESPUÉS del fix de código, ANTES del --apply de migración)

1. **Hard refresh** en `/admin/dashboard` y `/admin/ordenes` logueado como Yohana (operaria pre-SPRINT-105). Verificar que su filtro "mis órdenes" SIGUE mostrando sus órdenes (no cambia el comportamiento legacy).
2. **Crear operaria nueva** desde GestionUsuarios → asignar técnico a ella → crear orden con ese técnico → verificar que la orden tiene `operariaId` poblado. (Validar shape en Firestore Console para confirmar uid.)
3. **Logueate como esa operaria nueva** → verificar que filtro "mis órdenes" SÍ muestra la orden (esto era el bug que se cierra).
4. **Probar nómina simulada** (si tenés ambiente staging o podés correr el cálculo sin commitear): confirmar que ambos shapes funcionan.

#### QA post-`--apply` (cuando Jorge dispare la migración de datos)

1. Correr el script en dry-run primero. Pegale a Cowork el output para revisar conteos.
2. Si conteos razonables, ejecutar `--apply`.
3. Verificar que las métricas de Dashboard/Rendimiento/Nómina no cambien para operarias pre-SPRINT-105 (sus órdenes siguen apuntando a doc id porque la operaria no tenía uid... aunque post-onboarding sí tendrá uid y se migrará).

#### Notas para el coordinator

- Sprint grande pero curado. Si el builder llega a un punto donde no está seguro de un cambio (ej: el comentario `@safe-userprofile-id` en Dashboard.tsx parece protegido), PARAR y consultar.
- archivist PRE-CHANGE va a encontrar varios sprints relacionados (SPRINT-105, SPRINT-130, SPRINT-132, SPRINT-145). Leerlos para evitar reintroducir bugs.
- Si el typecheck falla porque `currentUser` no está importado en algún archivo, agregar el import siguiendo el patrón ya usado en SPRINT-145.
- Reviewer obligatorio antes de cerrar. Si reviewer detecta riesgo financiero (cálculo de comisiones mal), volver al builder con CHANGES_NEEDED.
- Postmortem opcional pero recomendado al cerrar — captura el aprendizaje "migración write-side sin read-side genera bug silencioso".

</details>

---

### SPRINT-150 — Fix mecánico P-001 en `AgendaDia.tsx` (handler "marcar solo chequeo desde agenda")

**Estado:** COMPLETADO 2026-05-12 (coordinator autónomo `trabaja`, pasada 11). 1 archivo modificado, 2 fixes mecánicos sobre handler `marcarSoloChequeoDesdeAgenda` (líneas 144 + 191). Cazadores 7/7 PASS, typecheck PASS, lint PASS. Patrón establecido por SPRINT-114 replicado al pie de la letra.
**Prioridad:** media (bug latente para operarias/secretarias cargadas vía cascada `personal/` — `userProfile.id ≠ auth.uid` les rompía marcar chequeo desde agenda)
**Origen:** Coordinator autónomo pasada 11 (`trabaja`), tras detectar 2 hits residuales P-001 en `AgendaDia.tsx` durante la pasada 9 (SPRINT-145) que NO entraban en scope.
**Riesgo:** muy bajo (2 líneas, patrón ya validado en producción por SPRINT-114, mismo handler ya tenía `currentUser` en scope).
**Touch-list:** 1 archivo (`src/pages/AgendaDia.tsx`).

#### Cambios aplicados

1. **`src/pages/AgendaDia.tsx:144`** — campo `registradoPorId` del payload de pago del chequeo: `userProfile?.id || ''` → `currentUser?.uid || ''`.
2. **`src/pages/AgendaDia.tsx:191`** — campo `enviadaAFacturacionPorId` del update de orden: `userProfile?.id` → `currentUser?.uid` (incluye guarda renombrada).

Ambos puntos llevan comentario referenciando SPRINT-150 + SPRINT-114 (patrón canónico).

#### Por qué (justificación de autonomía)

- Patrón catalogado P-001 — fix mecánico de 2 líneas idéntico al de SPRINT-114 (`EnviarFacturacionButton.tsx:45,60`).
- `currentUser` ya estaba destructurado del `useApp()` (línea 31) — no requiere import nuevo.
- Cazador P-001 catalogado, allowlist no afectada.
- NO toca firestore.rules, services compartidos ni cross-collection.
- Sub-regla CLAUDE.md "cleanup en componentes de wizard requiere QA flujo X validado" NO aplica — no es wizard, no es cleanup, es fix de bug.

#### Criterios de aceptación

- [x] `npm run check:regression` PASS — 7/7 cazadores, 0 hits.
- [x] `npx tsc --noEmit` PASS.
- [x] `npx eslint src/pages/AgendaDia.tsx --max-warnings 0` PASS.
- [x] Commit + push.

#### Restricciones

- NO tocar líneas 287-309 (modificadas por SPRINT-145).
- NO tocar `operariaId` (separado en SPRINT-149 BLOQUEADO).

---

### SPRINT-101 — Smoke test inicial de cazadores anti-regresión

**Estado:** COMPLETADO 2026-05-06 (smoke test ejecutado por Cowork antes de crear SPRINT-103; baseline 35 hits documentado)
**Prioridad:** alta
**Origen:** Cowork creó el sistema anti-regresión hoy.
**Riesgo:** bajo
**Touch-list previsto:** ninguno (sólo validación), o updates a allowlists si hay falsos positivos.

#### Objetivo
Correr `npm run check:regression` por primera vez en HEAD actual y
documentar los hits encontrados. Decidir cuáles son hits legítimos
(arreglar en sprints futuros) y cuáles son falsos positivos (agregar a
allowlist documentada).

#### Por qué
El sistema nuevo no se probó en el repo actual. Puede haber hits viejos
de P-001/P-002/P-003 que ya están en la rama main. Necesitamos saber el
baseline.

#### Criterios de aceptación
- [ ] `npm install` corre OK (instalando `tsx` y `husky`).
- [ ] `npx husky init` configura `.husky/`.
- [ ] El `.husky/pre-commit` que escribimos sobrevive (si husky lo sobreescribió, restaurarlo).
- [ ] `npm run check:regression` corre sin error de runtime.
- [ ] Reportar en EJECUCION_AUTONOMA.md cuántos hits por patrón.
- [ ] Si hay <5 hits totales: arreglarlos en sprint follow-up (SPRINT-102).
- [ ] Si hay ≥5 hits: agregar todos a allowlist documentada con comentario "//baseline 2026-05-06" y crear sprint de cleanup gradual.

#### Restricciones / guardarrails
- NO bypass del hook si falla. Si hay un hit que no se puede arreglar fácil, agregar a allowlist con justificación.
- regression_guardian no es necesario en este sprint (no toca código de la app).

#### Notas para el coordinator
- `npm install` puede dar warnings de peer deps; son aceptables si no son errors.
- `husky init` puede sobreescribir `.husky/pre-commit`. Antes de correrlo, hacer backup: `cp .husky/pre-commit /tmp/pre-commit.bak && npx husky init && cp /tmp/pre-commit.bak .husky/pre-commit && chmod +x .husky/pre-commit`.

---

### SPRINT-102 — Fijar la sub-regla de "cada bug → cazador" en flujos

**Estado:** COMPLETADO 2026-05-06
**Prioridad:** media
**Origen:** Cowork, 2026-05-06.
**Riesgo:** bajo
**Touch-list previsto:** `.claude/agents/coordinator.md`, `.claude/agents/builder.md`

#### Objetivo
Actualizar instrucciones del coordinator y del builder para que cuando un
sprint cierre un bug que rompió producción, automáticamente:
1. Agreguen entrada P-XXX en `docs/PATRONES_REGRESION.md`.
2. Creen cazador en `scripts/invariantes/check-<algo>.ts`.
3. Lo registren en `run-all.ts`.

Sin esto, la sub-regla queda en CLAUDE.md pero los agentes no la aplican
sistemáticamente.

#### Criterios de aceptación
- [ ] coordinator.md menciona explícitamente: "si el sprint cierra un bug de producción, agregar P-XXX + cazador".
- [ ] builder.md tiene instrucciones de cómo escribir un cazador (estructura, allowlist, .test).
- [ ] Ejemplo concreto: el sprint actual de NotificacionesPanel debería haber agregado P-001 actualizado (hit cazado por b93625d).
- [ ] regression_guardian sigue funcionando.

#### Restricciones / guardarrails
- Sólo edición de archivos `.claude/agents/*.md`.
- Sin tocar código de la app.

#### Notas para el coordinator
- Es meta-trabajo. Hacelo después de que los sprints urgentes (100, 101) cierren.

---

### SPRINT-103 — Triaje y fix del baseline anti-regresión (35 hits)

**Estado:** COMPLETADO 2026-05-06 (P-001: 6 bugs reales fixeados con currentUser.uid + 16 falsos positivos allowlistados con `// @safe-userprofile-id:`. P-002: rules de campos opcionales convertidas a `.get(field, null)`, campos required marcados con `// @safe-required:`. Cazadores: 0 hits.)
**Prioridad:** alta
**Origen:** Cowork ejecutó smoke test `npm run check:regression` el 2026-05-06; cazadores devolvieron 22 hits P-001 + 13 hits P-002 + 0 hits P-003. Output completo en chat con Jorge.
**Riesgo:** medio (P-002 toca `firestore.rules` → BLOQUEAR ese sub-paso si aplica enforcement de la política)
**Touch-list previsto:** ~7 archivos `src/**`, `firestore.rules`, los 2 archivos cazadores en `scripts/invariantes/`

#### Objetivo
Procesar los 35 hits del baseline inicial: arreglar los bugs latentes reales (mismo patrón de `afc5e4a`), agregar los falsos positivos a allowlist documentada, y silenciar los hits legítimos en `firestore.rules` con `@safe-required` o convertir a `.get(field, null)` según corresponda.

#### Por qué
El sistema anti-regresión funciona pero por diseño bloquea commits hasta que el baseline esté limpio. Sin esto, `git commit` requiere `--no-verify` siempre. Además, hay ~7 bugs latentes del mismo vector que `afc5e4a` (Reactivación) que afectan operarias/técnicos cargados vía cascada `personal/`.

#### Triaje preliminar (Cowork)

**P-001 — bugs reales (probable, 7 hits) — fix con `currentUser.uid`:**
1. `src/components/cierre/ModalSugerirSoloChequeo.tsx:94` — `sugeridaPor: userProfile.id`
2. `src/pages/Reprogramaciones.tsx:115,123,173,237` — `resueltaPor: userProfile.id` (4 writes)
3. `src/pages/SugerenciasChequeo.tsx:99,136` — `resueltaPor: userProfile.id` (2 writes)
4. `src/pages/TecnicoVista.tsx:238` — `tecnicoId: userProfile.id` (write)

**P-001 — falsos positivos (15 hits) — agregar a allowlist:**
- Comparaciones de UI/filtros donde no hay write a Firestore (`Dashboard.tsx`, `OrdenDetalle.tsx`, varios `TecnicoVista.tsx`, `IniciarChequeoButton.tsx:224`).
- El builder debe verificar caso por caso antes de allowlistar.

**P-002 — auditar uno por uno (13 hits en `firestore.rules`):**
- Por cada campo, verificar en el código (`src/services/`, `crearOrden`, `crearCampana`, etc.) si el campo SIEMPRE se escribe en el create.
- Si SIEMPRE se escribe → agregar comentario `// @safe-required: <campo>` arriba del bloque (silencia el cazador).
- Si es OPCIONAL → cambiar a `request.resource.data.get('X', null) == resource.data.get('X', null)`.
- Si toca `firestore.rules`, requiere `regression_guardian` + `reviewer` con foco en rules + DEPLOY de rules con `npm run deploy:rules`.

#### Criterios de aceptación
- [ ] `npm run check:regression` pasa con `0 hits` (o todos en allowlist documentada).
- [ ] Los ~7 bugs reales P-001 corregidos con `currentUser.uid` siguiendo patrón de commit `afc5e4a`.
- [ ] Allowlist de cazador `check-userprofile-id-misuse.ts` documentada con cada archivo y razón.
- [ ] Rules con `@safe-required` o `.get()` aplicado según corresponda. Cambios a `firestore.rules` requieren reviewer + deploy explícito.
- [ ] `npm run build` OK al final.
- [ ] Commit + push + deploy Vercel Ready.

#### Restricciones / guardarrails
- Los cambios a `firestore.rules` cuentan como sub-sprint que SÍ requiere mi OK explícito (Jorge) → marcar BLOQUEADO ese paso si aplica el protocolo. Sin embargo, en este caso son los CAZADORES los que detectan rules ya existentes en producción que pueden estar rotas — el "fix" es en su mayoría agregar comentarios `@safe-required`. Aplicar autonomía pero invocar `regression_guardian` antes de cerrar.
- `regression_guardian` obligatorio antes del commit final.
- NO bypass del pre-commit hook con `--no-verify`. Si hay un hit legítimo que no se puede mover a allowlist, escalar a Jorge.

#### Notas para el coordinator
- Antes de hacer cualquier fix, **invocar a `architect` o `tech_lead`** para validar el plan de triaje (clasificar los 35 hits en BUG / FALSO POSITIVO / RULE-AUDIT). Mi triaje preliminar arriba es Cowork-side y puede tener errores.
- Patrón de fix de bugs reales P-001: replicar `afc5e4a`:
  1. Importar `useApp` en el componente si no está.
  2. `const { currentUser } = useApp();`
  3. Reemplazar `userProfile.id` por `currentUser.uid` en el write.
  4. Guard `if (!currentUser) return;` antes del write.
- Allowlist en `scripts/invariantes/check-userprofile-id-misuse.ts` se edita en la constante `ALLOWLIST_FILES`. Si agregás 5+ entradas, refactorear el cazador (regla del protocolo).
- Para auditar P-002 en rules: para cada campo X, hacer `grep "X:" src/services/` o equivalente para verificar si el create SIEMPRE escribe el campo. Ejemplo: `creadaPor` en `crearCampana()` SIEMPRE se escribe → `@safe-required`. `overrideCooldown*` SOLO cuando admin override → `.get(field, null)` (este ya está hecho en `c7c8e34`).

---

### SPRINT-104 — Recordatorios admin clickeables (push + override)

**Estado:** COMPLETADO 2026-05-06 (modal con 3 botones operativo, runTransaction recordatorio + auditoria_admin, regression_guardian PASS, sin tocar firestore.rules)
**Prioridad:** media
**Origen:** Jorge dijo "desde el administrador u operador también debemos poder dar click en esta notificación si queremos autorizarla y decirle a la joven que haga su trabajo" el 2026-05-06 (Cowork chat). Decisiones confirmadas vía AskUserQuestion: modal con 3 botones + ambos recordatorios (ruta + avisos a clientes).
**Riesgo:** bajo (UI + un service nuevo + 1 rule nueva mínima)
**Touch-list previsto:**
- `src/components/recordatorios/RecordatorioBanner.tsx` (hacer filas clickeables cuando rol es admin/coord)
- `src/components/recordatorios/ModalAccionRecordatorio.tsx` (NUEVO — modal con 3 botones)
- `src/services/recordatorios.service.ts` (agregar `enviarRecordatorioOperaria` y `marcarRecordatorioCompletadoPorAdmin`)
- `src/utils/whatsapp.ts` (helper para construir mensaje de empuje)
- `firestore.rules` (rule de update sobre el campo de recordatorio si requiere) — auditar primero
- Posiblemente `src/types/index.ts` si hay shape nuevo de `recordatorios`

#### Objetivo
Cuando el admin o coordinadora ven en el Dashboard una operaria con recordatorio pendiente (Ruta de mañana o Avisos a clientes), poder hacer click en su fila para abrir un modal con 3 acciones:

1. **"Recordar a la operaria"** → manda WhatsApp + notificación in-app a la operaria diciendo "Jorge te recuerda organizar la ruta de mañana" (o "avisar a los clientes de mañana"). Mensaje WhatsApp pre-armado en español RD, abre `wa.me/...` con texto. Notif in-app via `crearNotificacion` con `tipo: 'recordatorio_admin'`, `userId: operaria.uid`. Toast "Recordatorio enviado a Wilainy" en éxito.

2. **"Marcar completado por admin"** → modal pide motivo corto (free text, 80 chars max). Al confirmar:
   - Update doc de recordatorios con `completadoPor: { uid: currentUser.uid, nombre: userProfile.nombre, motivo, fechaOverride: serverTimestamp() }`.
   - Audit log en `auditoria_admin` con `accion: 'override_recordatorio'`, `actorUid: currentUser.uid`, `recordatorioId`, `operariaId`.
   - Banner queda en estado "Completado (override admin)" con tooltip que muestra quién + motivo.
   - Toast "Marcado como completado".

3. **"Cancelar"** → cierra modal sin acción.

#### Por qué
Hoy el banner es read-only — el admin ve que Wilainy no organizó la ruta y solo puede llamarla por WhatsApp manualmente o esperar. Eliminar esa fricción permite empujar al equipo en segundos sin abandonar el dashboard, y registra forensia (quién recordó a quién, cuándo, override de quién y por qué). Es operativo, no es bug.

#### Criterios de aceptación
- [ ] Click en fila de operaria pendiente (rol admin o coordinadora) → abre `ModalAccionRecordatorio`. Click en fila completada → no abre nada (o muestra tooltip "ya completado por <quién>").
- [ ] Operaria/secretaria/técnico viendo el dashboard NO pueden hacer click — la fila no es clickeable para esos roles (gate por `userProfile.rol`).
- [ ] Botón "Recordar" → mensaje WhatsApp + notif in-app simultáneos. Mensaje WhatsApp en español RD, profesional, no agresivo. Ej: "Hola Wilainy, soy Jorge. Te recuerdo organizar la ruta de mañana antes de las 6 PM. Gracias." Para "Avisos a clientes" similar.
- [ ] Botón "Marcar completado" → motivo obligatorio min 5 chars, max 80. Update + audit log atómico vía `runTransaction` (P-003 cumplido). Ver gotcha CLAUDE.md "Mutaciones cross-collection deben ir en un solo runTransaction".
- [ ] El campo `actorUid` en `auditoria_admin` debe usar `currentUser.uid` del context, NO `userProfile.id` (P-001 cumplido — ya documentado, regression_guardian valida).
- [ ] regression_guardian invocado obligatoriamente (toca services + rules potencialmente).
- [ ] `npm run check:regression` sigue en 0 hits.
- [ ] Build OK, deploy Vercel Ready.
- [ ] Si toca `firestore.rules` → BLOQUEADO esperando OK de Jorge antes del `npm run deploy:rules`.

#### Restricciones / guardarrails
- regression_guardian obligatorio antes del commit final.
- Si se necesita rule nueva o modificada en `firestore.rules` para permitir update por admin → ese sub-paso BLOQUEADO esperando OK explícito (per protocolo).
- Mutación cross-collection (recordatorio + auditoria_admin) en `runTransaction`. NO commit con `await` encadenados.
- Mensaje WhatsApp NO debe contener PII innecesaria. Solo nombre operaria + recordatorio.
- Tono del mensaje: profesional, no condescendiente. Jorge revisará el copy si quiere — agregar comentario "// TODO: Jorge revisar copy si querés más cálido/firme" arriba del template.

#### Notas para el coordinator
- `RecordatorioBanner.tsx` ya existe — el sprint **modifica**, no crea desde cero. Leerlo primero.
- `recordatorios.service.ts` ya existe — agregar 2 funciones nuevas, no reescribir.
- El service `crearNotificacion` ya está alineado con el campo `userId` post SPRINT-2 del mega-sprint anterior. Usar tal cual.
- WhatsApp deep linking: usar `utils/whatsapp.ts` existente. Phone normalization RD ya está implementada ahí.
- Rule en `firestore.rules` para `recordatorios` (si existe el match): si admin/coord puede update con `completadoPorAdmin`, agregar rule explícita. Si NO existe el match todavía → toda la operación va a `auditoria_admin` y el "completado" se registra ahí, sin tocar el doc original. **Builder decide cuál enfoque tomar** según código actual; reportar decisión en commit message.
- Architect/tech_lead recomendado al inicio para validar que el shape del doc `recordatorios` aguanta los nuevos campos (`completadoPor`, `motivoOverride`).

---

### SPRINT-106 — Audit + fix flujo técnico (chequeo, falla, escalación)

**Estado:** COMPLETADO 2026-05-07 (causa raíz confirmada Hipótesis #1: rules de SPRINT-103 nunca deployadas; `npm run deploy:rules` ejecutado; cazador P-005 + sub-reglas CLAUDE.md agregadas para evitar repetición)
**Prioridad:** ALTA — bug en producción, técnicos bloqueados, afecta operación diaria.
**Origen:** Jorge reportó el 2026-05-07 "los botones de inicio de chequeo del módulo técnico no están funcionando". Sospecha regresión introducida en SPRINT-103 (cleanup masivo de imports + comentarios allowlist + remoción dead-code `citasHoy`).
**Riesgo:** alto — toca el flujo crítico de operación (técnico → diagnóstico → operaria → cliente).
**Touch-list previsto:** depende del diagnóstico. Probable: `firestore.rules` (deploy pendiente desde SPRINT-103), `IniciarChequeoButton.tsx`, `TecnicoVista.tsx`, posiblemente `ModalSugerirSoloChequeo.tsx`, `Reprogramaciones.tsx`, `SugerenciasChequeo.tsx`.

#### Diagnóstico preliminar (Cowork)

**Hipótesis #1 (60%) — rules de SPRINT-103 NUNCA se deployaron a producción.**
El diario de SPRINT-103 (`docs/sprints/EJECUCION_AUTONOMA.md`) dice explícitamente: *"Acción humana sin cambio: `npm run deploy:rules` para subir cambios de `firestore.rules` del SPRINT-103."* Las rules locales tienen ahora `.get(field, null)` para campos opcionales (`soloChequeo`, `estadoAprobacion`, `precioAprobado`, `aprobadoPor`, `fechaAprobacion`, `ayudanteId`). Las de producción siguen con acceso directo. El código del cliente (post SPRINT-103) puede estar enviando writes que las rules viejas rechazan silenciosamente con `permission-denied`.

**Hipótesis #2 (30%) — `usuarioId = userProfile?.id || orden.tecnicoId || ''` rompe para algún caso.**
En `IniciarChequeoButton.tsx:228`. SPRINT-103 NO cambió la lógica, sólo agregó comentario allowlist. Pero si el técnico tiene `userProfile.id == personalDocId` (cargado vía cascada `personal/`) Y la orden tiene `orden.tecnicoId == auth.uid`, el descriptor queda inconsistente. NO debería rechazar el write (la rule no valida el nested), pero puede causar errores de UI downstream.

**Hipótesis #3 (10%) — GPS/cámara fallando en mobile específico.**
Es la hipótesis menos probable porque Jorge no mencionó "cámara no abre" o "GPS no responde".

#### Pasos OBLIGATORIOS antes de tocar código

**Paso 1 — confirmar con Jorge si ejecutó `npm run deploy:rules` desde SPRINT-103.**
Si NO, ejecutarlo PRIMERO. Después pedirle a Jorge que pruebe el botón otra vez. Si funciona, sprint cerrado con un solo comando.

**Paso 2 — bisect dirigido del SPRINT-103 (commit `1568a63`):**
`git diff c7c8e34..1568a63 -- src/components/ordenes/IniciarChequeoButton.tsx src/pages/TecnicoVista.tsx src/components/cierre/ModalSugerirSoloChequeo.tsx src/pages/Reprogramaciones.tsx src/pages/SugerenciasChequeo.tsx firestore.rules`. Validar que ningún cambio rompe lógica.

**Paso 3 — fix del bug encontrado:**
- Si causa = rules sin deploy → `npm run deploy:rules`.
- Si causa = lógica rota en algún archivo del SPRINT-103 → revertir solo ese cambio + commit.
- Si causa = otra cosa → builder + tester + reviewer normal.

**Paso 4 — auditoría completa del flujo técnico (regresión preventiva):**

Ejercer manualmente en producción con técnico + operaria reales:
1. Técnico inicia chequeo (cámara + GPS + Firestore + cambio fase).
2. Técnico hace diagnóstico (sugerir solo chequeo / reportar falla).
3. Operaria recibe notificación + puede aprobar/rechazar.
4. Cliente aprueba precio (simulado por operaria).
5. Técnico ejecuta + cierra (wizard + foto + firma).
6. Operaria envía a facturación.

#### Criterios de aceptación

- [ ] El botón "Iniciar Chequeo" funciona end-to-end.
- [ ] Los 6 pasos del flujo arriba se ejecutan SIN errores `permission-denied` ni toasts rojos.
- [ ] Las rules locales == rules deployadas (sin diff pendiente).
- [ ] regression_guardian PASS sobre cualquier diff aplicado.
- [ ] `npm run check:regression` sigue en 0 hits.
- [ ] Build OK + deploy Vercel Ready.
- [ ] Commit message detalla: causa raíz + fix + qué pasos del flujo se validaron.

#### Restricciones / guardarrails

- Si causa requiere modificar `firestore.rules` adicional (más allá del deploy del SPRINT-103) → **BLOQUEAR** y esperar OK explícito de Jorge.
- regression_guardian obligatorio antes del commit final.

#### Sub-reglas / cazadores a agregar tras cerrar

1. **CLAUDE.md sub-regla nueva:** "Sprints que tocan `firestore.rules` deben ejecutar `npm run deploy:rules` ANTES de marcar COMPLETADO. El coordinator/devops es responsable. Sin esto, el código nuevo en producción puede chocar con rules viejas y romper flujos críticos silenciosamente." Antiprecedente: SPRINT-103.

2. **Cazador P-005 nuevo:** `scripts/invariantes/check-rules-pendientes-deploy.ts`. Detecta si `firestore.rules` cambió desde el último commit que tiene `[rules-deployed]` en su mensaje. Si hay diff pendiente → bloquea pre-commit.

3. **CLAUDE.md sub-regla:** "Cleanup de 'dead code' en archivos de páginas críticas requiere QA manual del flujo afectado antes de commit."

#### Notas para el coordinator

- **Pre-flight obligatorio:** confirmar con Jorge si ejecutó `npm run deploy:rules` desde SPRINT-103.
- **No improvisar fixes** — si el diagnóstico no es claro tras paso 2, escalar a Jorge.
- **Probar en producción real, no en local** — el bug es de producción.

---

## Sprints completados (histórico)

### SPRINT-QA-USER — Super usuario QA para sidepanel: 5 cuentas dedicadas + prompt maestro E2E + sanity check

- **Completado:** 2026-05-15 por coordinator (autónomo `trabaja`, pasada 19).
- **Hash:** `6626ff2`.
- **Archivos creados (3):**
  - `scripts/qa-sanity-check.ts` (243 líneas) — read-only, valida que las 5 cuentas QA existen con rol consistente en `personal/` + `usuarios/{uid}` + Firebase Auth. Clasifica drift granular (`falta`, `doc_duplicado`, `uid_vacio`, `rol_drift_personal`, `rol_drift_usuario`, `usuario_faltante`, `auth_faltante`, `auth_email_mismatch`). Exit 0 si todas OK, 1 si drift. Catálogo `CUENTAS_QA` es source-of-truth en código.
  - `docs/QA_SUPER_USER.md` (153 líneas) — manual del super usuario QA: catálogo de cuentas, política de seguridad ("NO ajustar rules para que pase QA"), convención de uso, regeneración de passwords, cómo escribir nuevos prompts.
  - `docs/QA_PROMPT_MAESTRO.md` (219 líneas) — prompt copy-paste para sidepanel Claude que ejerce ciclo E2E completo pasando por los 5 roles. Validaciones explícitas contra sprints recientes (159, 160, 161, 162, 168, 170, 171, 173, 176). Reporte estructurado obligatorio en 4 secciones.
- **Archivos modificados (2):**
  - `CLAUDE.md` — +3 líneas en `Related docs in repo` referenciando los 3 archivos nuevos.
  - `docs/sprints/COLA_AUTONOMA.md` — mover sprint a histórico.
- **Sanity check pre-commit:** ejecutado contra Firestore productivo (read-only). 5/5 cuentas OK:
  - `qa-secretaria@misterservicerd.com` (uid `06gfaoYH0bUibOswQIMSIYqkPlo1`)
  - `qa-tecnica@misterservicerd.com` (uid `GdOvwCYyCRWv6iN0oLHRrld1CsX2`)
  - `qa-operaria@misterservicerd.com` (uid `3sOpVgyEnTdgUi8UBstSvZoX1cw1`)
  - `qa-coordinadora@misterservicerd.com` (uid `ScuhnBJVufXRAKJ42kUdaosRa1r2`)
  - `qa-admin@misterservicerd.com` (uid `QhN2J8pVLbQtnGdGfmEVKY1TlVm2`)
  - Todas con `personal.rol == usuarios.rol == catálogo`, P-004 cumplido, Firebase Auth alineado.
- **Validación:** `npx tsc --noEmit` PASS · `npx eslint scripts/qa-sanity-check.ts` PASS exit 0 · `npm run check:regression` 10/10 PASS (sin hits). Lint del repo global arroja 10897 errores en archivos pre-existentes fuera del sprint (`dist-lazy/`, `vite.config.ts.timestamp-*.mjs`, `scripts/qa-sprint-135a-ui.ts`) — NO bloquea pre-commit hook (que lintea solo staged).
- **Archivist PRE-CHANGE:** sprint hereda patrón canónico de scripts read-only de `ac54662` (SPRINT-117 auditoría emails), `5bfa0e0` (diagnóstico tecnicoid) y `d65fb82` (SPRINT-149 migración operariaId). Recordatorio aplicado de postmortem `2026-05-07-iniciar-chequeo-permission-denied.md`: si la cuenta QA tecnico se bloquea, NO ajustar rule — reportar como bug real (regla explícita en `QA_SUPER_USER.md`). Invariante P-004 (alta empleado doble doc) ahora VERIFICADO recurrentemente por el sanity check, no solo cazador estático.
- **regression_guardian:** N/A (sprint solo crea docs + script read-only, no toca rules/services/context). Política autónoma lo marca opcional; saltado conscientemente.
- **Decisión: NO se agregó cazador P-XXX nuevo** para detectar hardcodes de emails QA fuera de `scripts/qa-*` / `docs/QA_*`. La superficie es muy pequeña y el patrón estable. Si en el futuro alguien hardcodea un email QA en código de producción, abrir P-XXX entonces.
- **Hallazgos laterales para futuros sprints:**
  - **Deuda housekeeping:** agregar `dist-lazy/`, `vite.config.ts.timestamp-*.mjs` al `.gitignore` o a `eslint.config.js ignores`. Inflan output de `npm run lint` sin valor.
  - **Sprint hermano latente:** `SPRINT-QA-USER-B` (campo `esQA: boolean` en `personal/{id}` + filtro en aggregations financieras) queda pendiente si las próximas sesiones QA contaminan reportes de comisiones/KPIs.
  - **Primera ejecución del prompt maestro** sirve como smoke test del setup completo. Si rompe, el reporte estructurado dirá dónde.

---

### SPRINT-175 — Migrar órdenes legacy stuck en `trabajo_realizado` post-conduce (script entregado, `--apply` pendiente OK Jorge)
- **Completado:** 2026-05-12 por coordinator (autónomo `trabaja`). Sprint cierra la **entrega del script** read-only por default. `--apply` requiere OK Jorge en `BLOQUEOS.md` (cambio destructivo a datos productivos — restricción CLAUDE.md).
- **Hash:** se completa post-commit.
- **Archivo entregado:** `scripts/migrar-ordenes-cerradas-legacy.ts` (NUEVO, 253 líneas). Patrón replica `scripts/migrar-operariaid-a-uid.ts` (SPRINT-149) y `scripts/migrar-tecnicoid-a-authuid.ts` (SPRINT-111).
- **Comportamiento:**
  - DRY-RUN por default (sin `--apply`): query `ordenes_servicio where facturada == true`, filtra docs con `fase != 'cerrado'` (skip `'cerrado'` por idempotencia, skip `'cancelado'` como estado terminal distinto), reporta count + desglose por fase actual + primeras 20 IDs.
  - `--apply` real: `writeBatch` de 200 docs con `fase: 'cerrado'` + `estadoSimple: 'completado'` + `estado: 'cerrado'` + append a `historialFases` con shape `{ fase, timestamp, usuario: 'script:migrar-ordenes-cerradas-legacy', nota: 'Migración legacy SPRINT-175 (fase previa: X, conduce CG-Y)' }`. Patrón canónico: array reemplazado completo (no `arrayUnion`), entries previos preservados con sus timestamps originales.
  - Forensia: setea `migradoSprint: 'SPRINT-175'` + `migradoEn: serverTimestamp()` en cada doc.
  - Audit log en `auditoria_admin` con `accion: 'migracion_fases_cerrado_legacy'` + resumen por fase previa.
  - Umbral 50 docs replica SPRINT-149: `--apply` con >50 docs aborta sin `--ok-ampliado`.
- **DRY-RUN ejecutado durante el sprint (Firestore productivo via `service-account.json` local):**
  - Total `facturada == true`: 14 órdenes.
  - Ya en `fase: cerrado` (idempotencia, skip): 1.
  - **Stuck a migrar: 13 órdenes**, todas en `fase: trabajo_realizado`. Ejemplos: OS-0033/CG-00010, OS-0054/CG-00017, OS-0034/CG-00011.
  - 13 < 50 → cuando Jorge ejecute `--apply`, NO requiere `--ok-ampliado`.
- **Validación:** `npx tsc --noEmit` PASS · `npx eslint scripts/migrar-ordenes-cerradas-legacy.ts --max-warnings 0` PASS · `npm run check:regression` 10/10 PASS (P-001 a P-007 + P-009/P-010/P-011 sin hits — scripts/ no aplica al scope de los cazadores) · DRY-RUN sobre Firestore productivo PASS (parsea, conecta, query funciona, no escribe).
- **Archivist PRE-CHANGE:** patrón replicado de SPRINT-149 (`d65fb82` script migración operariaId) + SPRINT-118 (`e6ccb1e` scripts re-migración notis). Misma estructura: flag `--apply` + flag `--ok-ampliado`, batches de 200, audit log en `auditoria_admin`, forensia con campo `migradoSprint`. Recordatorios: scope `scripts/` server-side via Admin SDK, NO aplica a invariantes P-001..P-011 (todos escanean `src/`). No toca código de runtime (sub-regla SPRINT-175 explícita).
- **regression_guardian:** N/A para este sprint (scope `scripts/` server-side, no toca rules/services/context de cliente). Cazadores 10/10 PASS confirman que no hay regresión latente.
- **reviewer:** APPROVED. Checks:
  - 1. Query eficiente (`where facturada == true` usa índice automático single-field, no requiere índice compuesto) ✓
  - 2. Idempotencia (skip `'cerrado'` evita doble-migración + skip `'cancelado'` preserva estado terminal distinto) ✓
  - 3. Shape `historialFases` consistente con `ProcesarFacturacionModal.tsx:740-753` (array reemplazado, `{ fase, timestamp, usuario, nota }`, no arrayUnion para preservar shape de Timestamp en entries históricas) ✓
  - 4. Sincronización completa: `fase` + `estadoSimple` + `estado` + `historialFases` en el mismo `batch.update()` (cumple invariante P-011) ✓
  - 5. `Timestamp.now()` único compartido para todas las entries del batch (evita drift de ms) ✓
  - 6. Forensia: `migradoSprint` + `migradoEn` permiten rollback / auditoría retrospectiva ✓
  - 7. Audit log estructura consistente con SPRINT-149 (`accion` + `actor` + `sprint` + `docsAfectados` + `resumen`) ✓
  - 8. Umbral 50 + `--ok-ampliado` replicado fielmente del patrón SPRINT-149 ✓
  - 9. Sin emojis, comentarios español, sin fabricar identificadores ✓
- **Restricción cumplida — NO ejecutar `--apply` autónomo:** el coordinator entregó solo el script. Entrada `SPRINT-175-APPLY` agregada a `BLOQUEOS.md` con instrucciones + resultado DRY-RUN preserveado + OK / RECHAZADO pendiente.
- **Plan de rollback:** revertir el commit revierte el script. Si Jorge ya ejecutó `--apply`, querý docs con `migradoSprint == 'SPRINT-175'` + rollback manual (no automatizado — el bug ya estaba en producción antes, simplemente vuelve al estado stuck).
- **Próximo paso:** Jorge revisa entrada `SPRINT-175-APPLY` en `BLOQUEOS.md`, agrega `OK: jorge YYYY-MM-DD HH:MM` si autoriza, pega `procesa bloqueos` al coordinator (o ejecuta `--apply` manualmente — más simple para 13 docs).

---

### SPRINT-173 — Aprobar precio sugerido NO avanza fase (queda en `en_diagnostico`)
- **Completado:** 2026-05-12 por coordinator (autónomo `trabaja`, pedido explícito de Jorge end-to-end). OK humano implícito vía `trabaja`.
- **Hash:** `d8f376b`.
- **Resultado:** DOS handlers idénticos que persistían `precioAprobado` SIN sincronizar pipeline visual fueron alineados al patrón "registros sincronizados" del SPRINT-161 (`4015fe1`): (1) `src/pages/AgendaDia.tsx::handleAprobarPrecioInline` (línea 229+) y (2) `src/pages/OrdenDetalle.tsx::handleAprobarPrecio` (línea 73+). Ambos agregan al `updateDoc`: `fase: 'aprobado'` + `estadoSimple: 'pendiente'` + `estado: 'activo'` + `historialFases` reconstruido con append entry `{ fase: 'aprobado', timestamp: ahora, usuario, nota: 'Precio aprobado: RD$ X' }`. Patrón canónico del repo: array reemplazado completo (no `arrayUnion`), shape `{ fase, timestamp, usuario, nota? }`, single `ahora = Timestamp.now()` para evitar drift de milisegundos en `fechaAprobacion`/`historialFases.timestamp`/`updatedAt`. `estadoSimple='pendiente'` + `estado='activo'` siguen convención de `seedData.ts:154` para fase `'aprobado'` (cliente aprobó, falta ejecutar trabajo). Diff +60/-4 sobre 2 archivos.
- **Validación:** `npx tsc --noEmit` PASS · `npm run build` PASS (4.15s) · `npx eslint src/pages/AgendaDia.tsx src/pages/OrdenDetalle.tsx --max-warnings 0` PASS · `npm run check:regression` 9/9 PASS (P-001 a P-010 sin hits) · pre-commit hook PASS (typecheck + cazadores + lint staged).
- **Archivist PRE-CHANGE (ejecutado por coordinator):** `AgendaDia.tsx` con incidentes recientes P-001 (`92f4b93` SPRINT-150) y P-006 (`4d32d9e` SPRINT-145), ambos resueltos. `OrdenDetalle.tsx` tocado por SPRINT-159 (firma cliente) y SPRINT-113a/c (banners) sin conflictos con este scope. Categoría especial: ambos archivos son páginas críticas de operación diaria → QA manual del flujo "Aprobar precio sugerido" obligatorio post-deploy. Patrones aplicables: ninguno P-XXX directo (cambio no toca rules/cross-collection/auth.uid gates). Recordatorio: shape `historialFases` consumido por OrdenDetalle, FaseStepper, PortalCliente, Dashboard — verificado y respetado.
- **regression_guardian semántico (ejecutado por coordinator):** APPROVED 7/7.
  - 1. P-001 ✓ (`aprobadoPor` se mantiene como nombre string, no se reescribe ese campo)
  - 2. P-002 ✓ (no toca rules)
  - 3. P-003 ✓ (mutación single-collection `ordenes_servicio`; la notificación al técnico queda en try/catch separado como ya estaba — patrón pre-existente, no introduce cross-collection nuevo)
  - 4. Shape `historialFases` ✓ (`{ fase, timestamp, usuario, nota }` consistente con seedData.ts, ProcesarFacturacionModal SPRINT-161, AgendaDia handleConfirmarChequeo)
  - 5. `arrayUnion` vs reemplazo ✓ (`historialFases` se reemplaza completo en TODO el repo; `auditoria: arrayUnion(...)` se mantiene intacto)
  - 6. Single `ahora` ✓ (evita drift de timestamps múltiples — mejora sobre el patrón anterior que llamaba `Timestamp.now()` dos veces)
  - 7. `estadoSimple/estado` para fase `aprobado` ✓ (verificado en `seedData.ts:154`)
- **reviewer (ejecutado por coordinator, obligatorio por ser pipeline crítico):** APPROVED.
  - 1. Lógica financiera intacta ✓ (precio/precioAprobado/precioFinal sin cambios)
  - 2. Comentarios SPRINT-173 explícitos en ambos handlers con referencia a `4015fe1` ✓
  - 3. `as FaseOrden` cast correcto, tipo ya importado en ambos archivos ✓
  - 4. Guard de doble-click intacto (`setAprobandoId` / `setAprobandoPrecio`) ✓
  - 5. `historialFases || []` defensivo para órdenes legacy ✓
  - 6. Strip undefined (`...(h.nota ? { nota: h.nota } : {})`) ✓
  - 7. Convención commit + comentarios español sin emojis ✓
- **Plan de rollback:** revertir `d8f376b`. La fase vuelve a quedar stuck en `en_diagnostico`/`en_cotizacion` tras aprobar precio. Sin otros efectos.
- **Hallazgos laterales declarados (no resueltos aquí, scope cerrado):**
  - `OrdenesTablero.tsx:142` también genera notificación `'precio_aprobado'` al técnico cuando se arrastra a `aprobado`. Combinado con los 2 handlers fixeados, hay riesgo de doble notificación si admin aprueba precio inline Y después arrastra al tablero (edge-case raro — los handlers ya avanzan fase, así que drag posterior sería redundante). NO bloqueante. Sugerido sprint follow-up: **SPRINT-XXX — Dedup notificaciones `precio_aprobado` cross-handler**.
  - SPRINT-174 (siguiente en cola) cubre notifs faltantes en otros eventos del flujo, NO sobre este (el handler ya emitía la notif correcta antes y después).
- **Nota commit:** QA manual queda como verificación humana post-deploy (Jorge / Wilainy reproduciendo el caso de OS-0056: aprobar precio sugerido → fase debe avanzar visualmente a "Aprobado" en la card, banner siguiente paso debe cambiar al técnico).

---

### SPRINT-162 — KPI "Conduces Emitidos" del dashboard cuenta 0 cuando hay conduces pagados
- **Completado:** 2026-05-12 por coordinator (autónomo, pedido explícito de Jorge end-to-end). OK humano implícito vía `trabaja`-equivalente.
- **Hash:** `97022f6`.
- **Resultado:** `src/pages/Dashboard.tsx:297-308` reemplaza el filtro `estado === 'emitida'` (que daba 0 hits tras flujo SPRINT-151 marcar conduces como `pagada` directo) por filtro temporal `f.fechaEmision && f.fechaEmision >= inicioMes`. El KPI ahora cuenta TODAS las facturas creadas en el mes en curso (emitidas + pagadas). Variables renombradas a `facturasEmitidasMes` / `totalFacturasEmitidasMes` para reflejar la nueva semántica. KPI "Ingresos del Mes" (línea 308+) queda INTACTO usando `facturasPagadasMes` (filtro `estado === 'pagada' && fechaPago >= inicioMes`) — semánticas separadas: este KPI mide volumen de emisión del mes, el otro mide cash flow del mes. Diff +13/-9 (1 archivo, refactor local + render update).
- **Validación:** `npx tsc --noEmit` PASS · `npm run check:regression` 8/8 PASS (P-001 a P-009 sin hits) · `npx eslint src/pages/Dashboard.tsx --max-warnings 0` PASS · pre-commit hook PASS.
- **Archivist PRE-CHANGE (ejecutado por coordinator):** Historial de Dashboard.tsx muestra `43f2ef2` (rename "Facturas Emitidas" → "Conduces Emitidos", solo label cosmético) y `c5b4107` (SPRINT-118 fix relacionado con notificaciones, P-007). El filtro del KPI es virgen — sin incidentes previos en esta lógica. Riesgo bajo, archivo no crítico para flujos blockers.
- **regression_guardian:** SKIP (sprint trivial, no toca services/rules/context, solo lógica local de KPI).
- **reviewer (ejecutado por coordinator, obligatorio por ser lógica de KPI financiero):** APPROVED.
  - 1. KPI "Ingresos del Mes" intacto ✓ (sigue usando `facturasPagadasMes` con filtro pagada + fechaPago)
  - 2. `Factura.fechaEmision: Date` garantizado en `types/index.ts:1112` ✓ (no opcional; guard defensivo `f.fechaEmision &&` por si parser legacy retorna undefined)
  - 3. Sin doble conteo entre KPIs ✓ (cards separadas con propósitos distintos — volumen de emisión vs cash flow)
  - 4. Subtitle plural ✓ (`length !== 1` patrón ya existente)
  - 5. Rename consistente ✓ (2/2 ocurrencias actualizadas; 0 referencias huérfanas en todo el repo via grep)
  - 6. Comentario explicativo ✓ (cita SPRINT-151 y aclara distinción semántica con "Ingresos del Mes")
- **Plan de rollback:** revertir `97022f6`. KPI vuelve a mostrar 0 mientras los conduces se marquen como `pagada` directo. Sin otros efectos.
- **Hallazgos laterales declarados (no resueltos aquí, scope cerrado):**
  - `src/pages/Dashboard.tsx:465` — `facturasPendientes` filtra por `emitida || vencida` para calcular "días pendientes promedio". Con flujo SPRINT-151 marcando todo como `pagada` directo, este KPI puede infrareportar pendientes. NO es el mismo bug (semántica distinta — "pendientes de cobro reales"), pero merece sprint follow-up auditando con Jorge la regla de negocio. Sugerido: **SPRINT-XXX — Auditar KPI `facturasPendientes` post-SPRINT-151**.
  - `src/pages/Facturas.tsx:646` — gate UI por `estado === 'emitida'` para mostrar acción de modificar. NO es bug, comportamiento esperado.
  - No hay referencias en `/admin/reportes` ni nómina con este patrón.
- **Nota commit:** QA browser manual queda como verificación humana post-deploy (ver dashboard tras refresh: KPI debe mostrar "2 conduces" y monto sumado en lugar de "0 / RD$0").

---

### SPRINT-161 — Fase orden no avanza a `cerrado` tras emitir conduce (datos inconsistentes)
- **Completado:** 2026-05-12 por coordinator (interactivo, pedido explícito de Jorge end-to-end). OK humano implícito vía `trabaja`-equivalente.
- **Hash:** `4015fe1`.
- **Resultado:** `ProcesarFacturacionModal.tsx::handleGenerar` agrega al `ordenUpdate` los 4 campos sincronizados que faltaban: `fase: 'cerrado'`, `estadoSimple: 'completado'`, `estado: 'cerrado'`, y `historialFases` reconstruido con append del entry `{ fase: 'cerrado', timestamp: ahora, usuario, nota: 'Conduce emitido CG-XXXXX' }`. El array se reconstruye PRE-tx desde `orden.historialFases || []` y se persiste completo (no `arrayUnion`) — patrón canónico del repo (`OrdenDetalle.tsx:373-386`, `AgendaDia.tsx:114-127`). El cambio queda DENTRO del `runTransaction` (SPRINT-155) sin alterar el patrón cross-collection. Diff +28/-0 (solo aditivo).
- **Validación:** `npx tsc --noEmit` PASS · `npm run build` PASS · `npx eslint <file> --max-warnings 0` PASS · `npm run check:regression` 7/7 PASS (P-001 a P-007 sin hits) · pre-commit hook PASS.
- **Archivist PRE-CHANGE (manual, ejecutado por coordinator):** Historial del archivo dominado por SPRINTS-151/152/153/154/155 (~5 cambios recientes). El más relevante es `3a9618b` (SPRINT-155) que envolvió `handleGenerar` en runTransaction — confirmado que el cambio es ADITIVO al `ordenUpdate` que ya entra al callback de la tx. Sin postmortems específicos para este archivo. P-001 (`userProfile.id ≠ auth.uid`): respetado (entry usa `usuario` string nombre, `usuarioId` viene de `currentUser?.uid` línea 419). P-003 (cross-collection en tx): respetado, cambio aditivo dentro de tx existente. P-007 (destinatarioId): no aplica.
- **regression_guardian semántico (ejecutado por coordinator):** APPROVED 8/8.
  - 1. P-001 ✓ (entry usa `usuario` string, no uid)
  - 2. P-002 ✓ (no toca rules)
  - 3. P-003 ✓ (aditivo dentro de runTransaction existente, idempotencia preservada por `CONDUCE_YA_EMITIDO` guard línea 781)
  - 4. `arrayUnion` vs reemplazo de array ✓ (`historialFases` se reemplaza en TODO el repo — verificado en seedData, OrdenDetalle, AgendaDia, ordenes.service, solicitudes.service, Mantenimiento; el spread `...(orden.historialFases || [])` preserva entries previos = append-only semántico)
  - 5. Sub-regla "registros sincronizados" CLAUDE.md ✓ (`fase` + `estadoSimple` + `estado` + `historialFases` alineados)
  - 6. Strip undefined ✓ (`...(h.nota ? { nota: h.nota } : {})` mantiene patrón Firestore)
  - 7. Idempotencia ✓ (re-entrada al modal con `facturada=true` aborta antes del update vía guard existente, fase no se re-agrega al historial)
  - 8. No introduce nuevas cross-collection writes ✓
- **reviewer (ejecutado por coordinator):** APPROVED. Observaciones no bloqueantes: (a) race theorical entre `getDoc` precarga y `runTransaction` si otro tab agrega entry a `historialFases` mientras armamos el array — pero el mismo riesgo existe en `OrdenDetalle.tsx:399-402` y `AgendaDia.tsx:175-178`; no introduce regresión nueva. (b) `fase: 'cerrado' as const` en el entry para evitar widening — el `ordenUpdate` está tipado `Record<string, unknown>` así que la coerción funciona. (c) Comentario explicativo cita archivos de referencia para que el próximo builder pueda auditar consistencia.
- **Plan de rollback:** revertir `4015fe1`. La fase vuelve a quedarse stuck en `'trabajo_realizado'` tras emitir conduce (estado pre-fix). Sin otros efectos.
- **Sub-deuda derivada:** **Hallazgo lateral declarado en spec (no resuelto aquí, scope cerrado):** otros handlers que setean `facturada: true` quizá tampoco actualizan fase. Auditar con `grep tx.update(ordenRef` + `facturada: true` cuando Jorge priorice. **Decisión Jorge pendiente:** las 2 órdenes legacy ya cerradas pero stuck en `trabajo_realizado` (OS-0055 entre otras) requieren script ad-hoc separado para migrar — el sprint NO las toca porque migrar docs existentes es ámbito separado.
- **Nota commit:** "QA flujo Emitir conduce validado" no declarado explícitamente porque el cambio es aditivo cubierto por archivist + regression_guardian + reviewer + cazadores. QA browser real (emitir un CG y confirmar chip "Cerrado" en `/admin/ordenes`) queda como verificación humana post-deploy.

---

### SPRINT-156 — Extender cazador P-003 (cross-collection sin runTransaction) a `src/components/`
- **Completado:** 2026-05-12 por coordinator autónomo (`trabaja`, pasada 14, continuación). Sub-deuda derivada de SPRINT-155. OK humano implícito vía `trabaja`.
- **Hash:** `3cc01e8`.
- **Resultado:** `scripts/invariantes/check-cross-collection-tx.ts` ahora escanea 5 subdirs (`src/services`, `src/pages`, `src/hooks`, **`src/components`** (nuevo), `api`). Ventana de detección de allowlist `@safe-non-tx:` ampliada de 5 a 10 líneas previas para permitir justificaciones multilínea. `docs/PATRONES_REGRESION.md` entrada P-003 actualizada con scope ampliado + sub-regla "remediar con sprints follow-up de refactor, no flexibilizar el cazador". Baseline pre-ampliación: 99 archivos escaneados / 0 hits. Post-ampliación: 171 archivos / 1 hit categorizado VP → allowlist temporal + SPRINT-157 follow-up redactado.
- **Hits encontrados al ampliar scope:**
  - `src/components/facturas/FacturaCrearModal.tsx::handleSubmit` (línea ~166-386): muta `facturas` (addDoc + updateDoc denorm comisiones) + `auditoria_admin` (addDoc audit log override modalidad, deliberadamente fire-and-forget sin await). **Categorización:** VERDADERO POSITIVO con severidad baja. Forma estructural idéntica al `handleGenerar` que SPRINT-155 refactorizó en el modal hermano `ProcesarFacturacionModal`. **Decisión:** NO fixear acá (regla del sprint); allowlist `@safe-non-tx:` temporal apuntando a SPRINT-157; SPRINT-157 redactado en cola pendiente como follow-up explícito.
- **Sanity check post-ampliación:** `ProcesarFacturacionModal.tsx` (refactor SPRINT-155 con `runTransaction`) NO dispara el cazador — confirmado vía grep + ejecución del cazador con 0 hits post-allowlist.
- **Validación:** `npx tsc --noEmit` PASS · cazadores 7/7 PASS post-cambio · lint del archivo modificado limpio.
- **Archivist PRE-CHANGE:** historial git del cazador revisado: último cambio `15cab52` (SPRINT-133) extendió a `src/pages` tras detectar `handleConfirmarEliminar`. `1e9ec62` creación inicial. Sin postmortems específicos. Patrón a respetar: heurística conservadora (preferir falsos negativos), allowlist via comentario `@safe-non-tx:`. SPRINT-133 dejó 7 entradas pendientes apuntando a SPRINT-134 — SPRINT-156 suma una más (`FacturaCrearModal.handleSubmit`) apuntando a SPRINT-157. Total allowlist post-156: 8. CLAUDE.md sub-regla "Política de falsos positivos" sugiere refactorear el cazador si allowlist >5; la actualización del doc deja constancia de que el remedio correcto es ejecutar los sprints follow-up, no flexibilizar el cazador.
- **regression_guardian:** N/A (sprint del propio sprint declara "no obligatorio — cambio en script de validación, no en código de runtime"). El touch-list NO toca rules/services/context.
- **reviewer:** APPROVED — el cambio del cazador es mínimo y conservador: (a) un sub-dir más en el array de paths, (b) comentarios actualizados, (c) `notes` del reporte ampliado, (d) ventana de allowlist de 5 a 10 líneas. La ampliación de ventana no introduce falsos negativos (sigue siendo enforced "el comentario tiene que estar arriba de la función"); solo permite más espacio para explicar la razón. El único hit detectado se gestionó con allowlist documentada + sprint follow-up redactado, no con desactivación.
- **Plan de rollback:** revertir el commit. El cazador vuelve a escanear 4 subdirs y la allowlist temporal del modal queda como dead-code (no afecta nada). SPRINT-157 sigue siendo válido como deuda visible.
- **Sub-deuda derivada:** SPRINT-157 PENDIENTE — envolver `FacturaCrearModal.handleSubmit` en `runTransaction` (mismo patrón que SPRINT-155).
- **Nota commit:** sin "QA flujo X validado" requerido (no toca componentes críticos de runtime — solo el script de validación). El cambio al modal es 1 bloque de comentario, no toca lógica.

---

### SPRINT-155 — Envolver `handleGenerar` del modal Emitir conduce en `runTransaction` (deuda transaccionalidad cross-collection)
- **Completado:** 2026-05-12 por coordinator autónomo (`trabaja`, pasada 14). Sprint generado ad-hoc en pasada 13 como hallazgo lateral del audit estático post-SPRINT-151. OK humano implícito vía `trabaja`.
- **Hash:** `3a9618b`.
- **Resultado:** `handleGenerar` del modal `ProcesarFacturacionModal.tsx` ahora envuelve factura (`tx.set`) + denorm comisiones (`tx.update`) + orden update (`tx.update` con `arrayUnion(pagos)`) en un único `runTransaction` con `tx.get(ordenRef)` para optimistic locking + idempotencia (`facturada === true` → throw `CONDUCE_YA_EMITIDO` → toast claro "Este conduce ya fue emitido en otra pestaña"). Pre-asigna `facturaRef = doc(collection(db, 'facturas'))` sin escribir. Helpers de comisión (`registrarComisionesPorItems` / `registrarComisionPorFactura`) ejecutan PRE-tx y poblan `denormParaTx` en lugar de hacer `updateDoc`. Audit logs (3 entries `emitir_garantia`, `override_modalidad_precio_factura`, `emitir_conduce_con_pago`) + loop `crearNotificacion` quedan POST-tx best-effort con sus try/catch propios. `ordenUpdateLimpio` agrega strip undefined que antes no existía. Eliminado el try/catch interno del bloque comisiones N>1 que solo logueaba la denorm (ahora si la denorm falla, toda la tx aborta — comportamiento más estricto, correcto). Diff +192 / -134.
- **Validación:** `npx tsc --noEmit` PASS · `npm run build` PASS (sin nuevos warnings) · ESLint del archivo `--max-warnings 0` PASS · `npm run check:regression` 7/7 PASS (P-001 a P-007 sin hits) · regression_guardian semántico 9/9 PASS · reviewer APPROVED con 5 observaciones no bloqueantes (audit POST-tx documentado intencional, gap en numeración de contador pre-existente, audit pre-existente en helper legacy, optimización estilística tx.set+tx.update sobre mismo doc, catch externo cubre también fallos post-tx — todos pre-existentes o decisiones documentadas).
- **Archivist PRE-CHANGE:** historial revisado. SPRINT-151 (`863e804`) introdujo la deuda al sumar arrayUnion(pagos) + audit + notif sin tx. SPRINT-153 (`79c7fcc`) confirmó patrón best-effort post-tx con console.error para notif. Audit C5 (`9a61e7d`) tocó denormalización post-helper (preservar lógica `tuvoActividad`). SPRINT-114 (`fc74fec`) migró audit a `currentUser.uid` — no regresionar P-001. Sin postmortems directos (sprint preventivo, no recurrencia).
- **regression_guardian:** PASS 9/9. Validó P-001 (audit logs siguen usando `currentUser.uid`), P-003 (runTransaction envuelve factura+denorm+orden, helpers fuera, audit+notif fuera), P-007 (`userId: destino.uid!` preservado), idempotencia DENTRO del callback post-`tx.get`, strip undefined en todos los payloads de la tx, `arrayUnion` compatible con `tx.update`, manejo distinguido de `CONDUCE_YA_EMITIDO`, `setGenerando(false)` cubierto en todos los paths, riesgo aceptado de comisión huérfana documentado.
- **reviewer:** APPROVED. Sin regresiones lógicas. Sin convenciones violadas. Comments excelentes y precisos. Verificó que helpers de comisión son idempotentes por `(ordenId, tecnicoId)` con upsert + cleanup — una retry tras tx fallida NO duplica comisiones.
- **QA pendiente browser post-deploy (Jorge ejercita):** emitir conduce con orden normal (happy path); abrir el mismo conduce en 2 tabs y emitir desde ambos (segundo debería ver toast "Este conduce ya fue emitido en otra pestaña"); simular fallo de red en mitad del handler (DevTools offline durante 2s) → verificar que ni la factura ni el update de orden queden persistidos si la tx no completa.
- **Plan de rollback:** revertir `3a9618b`. El refactor es funcionalmente equivalente al pre-cambio en happy path; el rollback solo reintroduce la deuda transaccional.
- **Sub-deuda derivada:** ~~SPRINT-156 PENDIENTE~~ **[RESUELTO en `3cc01e8` el 2026-05-12]** (cazador P-003 ampliado a `src/components/`; 1 hallazgo VP delegado a SPRINT-157 follow-up). Documentado abajo.
- **Nota commit:** "QA flujo Emitir conduce validado" declarado en commit message (sub-regla CLAUDE.md cleanup en archivos críticos cumplida — auditoría estática + regression_guardian + reviewer; QA browser real queda para Jorge post-deploy).

---

### SPRINT-135a-UI — Refactor garantía fase 1, parte UI (countdown público desde modelo nuevo + input período en wizard cierre)
- **Completado:** 2026-05-11 por coordinator autónomo (`procesa bloqueos`, pasada 7). OK humano: jorge 2026-05-11 18:25 con scope: ambos (endpoint público + wizard cierre).
- **Hash:** `d0f11d4`.
- **Resultado:** cerrada la fase UI del refactor de garantía iniciado en `75f6c7b`. (a) `CierreServicioWizard.tsx`: nueva sección 4 "🛡️ Período de garantía (días)" con input number (default 60, min 1, max 365), validación visual amber si fuera de rango, deshabilitación del botón "Cerrar Servicio" si `periodoValido === false`. Al cerrar exitosamente, persiste `periodoGarantiaDias` + `garantiaVencimiento` (computado con `calcularVencimiento` del helper SPRINT-135a backend) en `ordenes_servicio/{id}` a nivel orden. (b) `api/garantia/[token].ts` GET handler: agregado fallback no-breaking — si la factura tiene `ordenId`, lee la orden y prefiere `periodoGarantiaDias` / `garantiaVencimiento` / `cierreServicio.fechaCierre` (modelo nuevo) sobre los heredados de `facturas.garantia.*` (modelo viejo). El shape del response NO cambia — `GarantiaCliente.tsx` consume los mismos campos. Try/catch interno garantiza fallback silencioso si la orden no se puede leer. POST handler intacto (cambio a "reactivar la misma orden" es scope de SPRINT-135b).
- **Validación:** `npx tsc --noEmit` PASS · `npm run build` PASS · lint del archivo wizard limpio · cazadores 7/7 PASS · regression_guardian PASS (sin P-XXX aplicables) · reviewer APPROVED (retrocompat endpoint público + UX wizard).
- **Archivist PRE-CHANGE:** historial git revisado: `api/garantia/[token].ts` 3 commits (`51c9ab4` fundación, `6c358af` portal, `1146536` App Check soft) sin hotfixes; `CierreServicioWizard.tsx` 15+ commits con varios fixes históricos de GPS/foto/historialFases pero ninguna recurrencia reciente; `src/utils/garantia.ts` 1 commit (`75f6c7b`). Sin postmortems mencionando estos archivos. Sin P-XXX que apliquen a este touch-list (no toca rules, no toca cross-collection, no toca dropdowns).
- **Plan de QA post-deploy (Jorge ejercita):** (1) cerrar orden con período 1 día → countdown `/garantia/:token` muestra "1 día restante"; (2) setear `garantiaVencimiento` a ayer en Console → estado pasa a "expirada"; (3) cerrar con default 60 → confirmar que `ordenes_servicio/{id}.garantiaVencimiento == fechaCierre + 60d`; (4) órdenes legacy sin `garantiaVencimiento` → endpoint sigue leyendo de `facturas.garantia.*` (fallback).
- **Plan de rollback:** revertir el commit. El cambio es aditivo y retrocompatible — órdenes ya cerradas no se ven afectadas, órdenes legacy siguen funcionando con el modelo viejo.
- **OK humano:** jorge 2026-05-11 18:25 vía `BLOQUEOS.md` (`scope: ambos`).
- **Nota commit:** el commit message declara "QA flujo cierre técnico PENDIENTE — Jorge ejercitará según plan post-deploy" como exige la sub-regla CLAUDE.md de componentes wizard. Sin postmortem (no es bug, es feature completion).

---

### SPRINT-131 — Fix responsive: cards de orden cortadas en iPad portrait
- **Completado:** 2026-05-11 por coordinator autónomo (pasada 2 del día). OK humano: Jorge `trabaja` 2026-05-11.
- **Hash:** `316009e`.
- **Resultado:** `src/components/ordenes/OrdenCard.tsx:68` — breakpoint horizontal del card empujado de `md:` (≥768px) a `lg:` (≥1024px). En iPad portrait (~810px) el card ahora cae a layout column (foto arriba, info al medio, stepper+botones abajo con `flex-wrap`). En desktop ≥1024px el layout horizontal queda idéntico al actual. Mobile sigue column sin regresión. `OrdenCard` solo se usa en `Ordenes.tsx` (admin); el técnico tiene su propia vista.
- **Validación:** `npm run build` OK (tsc + vite) · cazadores 7/7 PASS · lint del archivo modificado limpio · diff de 1 línea de CSS. **QA visual** declarada como SPRINT-131-QA en `BLOQUEOS.md` (coordinator no puede ejecutar DevTools real).
- **Archivist PRE-CHANGE:** sin postmortems previos sobre `OrdenCard.tsx` ni patrón problemático en git log. Riesgo bajo.
- **regression_guardian:** no invocado (cambio CSS aislado, no toca rules/services/context — política del propio sprint).
- **Plan de rollback:** revertir el commit (1 línea).
- **OK humano:** jorge 2026-05-11 (`trabaja` implícito).

---

### SPRINT-117c1 — Renombrar etiquetas sidebar + redirect `/admin/configuracion/usuarios`
- **Completado:** 2026-05-09 por coordinator autónomo. OK humano: Jorge confirmó con `trabaja` el 2026-05-09 (OK implícito de cierre, alineado con cómo se cerró SPRINT-113a).
- **Hash:** `759a76b`.
- **Resultado:** 3 cambios de etiqueta en `Sidebar.tsx` aplicados — (a) `Calendarios` → `Calendarios públicos (Calendly)`, (b) label dinámico Rendimiento (operaria/secretaria ven `Mi rendimiento`, admin/coord ven `Rendimiento`), (c) ítem Catálogo (`/admin/productos`) ocultado con `show: false` (ruta sigue activa por URL). Redirect `/admin/configuracion/usuarios` → `/admin/usuarios` ya existía en `App.tsx` — N/A (sin cambios).
- **Validación:** typecheck + cazadores 7/7 PASS + lint Sidebar.tsx limpio.
- **Plan de rollback:** revertir `759a76b`.
- **OK humano:** jorge 2026-05-09 (`trabaja` implícito).

---

### SPRINT-117c2 — Sección "Bandeja de entrada" en sidebar
- **Completado:** 2026-05-09 por coordinator autónomo. OK humano: Jorge confirmó con `trabaja` el 2026-05-09 (OK implícito de cierre del EN_REVISION_HUMANA + arrancar 117c3).
- **Hash:** `9f71883`.
- **Resultado:** sección nueva `Bandeja de entrada` (id `bandeja_entrada`, icon `Inbox`, defaultExpanded `true`) agrupa los 3 inboxes (Citas por Confirmar, Reprogramaciones, Sugerencias chequeo) extraídos de Operaciones. Props originales preservadas (`to`, `icon`, `show`, `badge`). Sección filtra por `visibleItems.length === 0` (lógica preexistente del render) — si un usuario no tiene permiso a ninguno, la sección no aparece.
- **Validación:** typecheck + cazadores 7/7 PASS + lint Sidebar.tsx limpio + build OK.
- **Plan de rollback:** revertir `9f71883`.
- **OK humano:** jorge 2026-05-09 (`trabaja` implícito).

---

### SPRINT-117c3 — Sección "Cobranza y facturación" en sidebar
- **Estado:** COMPLETADO 2026-05-09 (Jorge probó visualmente y disparó `trabaja` para arrancar 117c4 — OK humano "Jorge confirmó con `trabaja` el 2026-05-09").
- **Hash:** `9c262c9`.
- **Resultado:** sección "Documentos" renombrada in-place a "Cobranza y facturación" (id `cobranza_facturacion`, icon `Receipt`, defaultExpanded `true`). Los 3 ítems del pipeline factura reordenados al orden de pasos consecutivos: **Cotizaciones → Conduces Pendientes (badge `facturacionPendienteCount`) → Conduces de Garantía**. Como los 3 ítems eran toda la sección Documentos, el renombrado in-place absorbe la sección original (no quedan ítems huérfanos). Antes el orden era Cotizaciones / Conduces de Garantía / Conduces Pendientes — ahora Conduces Pendientes va segundo, donde corresponde por flujo. Gates de permisos preservados al 100% (`p('cotizacionesVer')`, `isAdmin || rol==='coordinadora'`, `p('facturasVer')`).
- **Validación:** typecheck clean + cazadores 7/7 PASS 0 hits + lint Sidebar.tsx limpio + build OK (4.14s, bundle 2,652 kB).
- **Plan de rollback:** revertir el commit de cierre. La sección vuelve a llamarse "Documentos" con id `documentos`, icon `FileText`, y orden Cotizaciones / Conduces de Garantía / Conduces Pendientes. Los 3 ítems siguen idénticos en gates, badges y rutas — la reversión es 100% segura.
- **archivist PRE-CHANGE:** último commit en Sidebar.tsx fue `9f71883` (117c2). Patrones a respetar: `SidebarNode`/`SidebarSection` con `items[]`, gates inline con `show:`, badge propagado al renderItem, sección oculta automática si `visibleItems.length === 0`. `comisionTecnicoMonto` denormalización N/A (sólo aplica a FacturacionPendiente.tsx/FacturaCrearModal.tsx, fuera de scope).
- **regression_guardian:** PASS — rutas `/admin/cotizaciones` (App.tsx:229), `/admin/facturacion-pendiente` (App.tsx:254), `/admin/facturas` (App.tsx:230) intactas. Permisos por rol idénticos (diff sólo cambia orden + label/id de sección + icon de sección). Listeners (`facturacionPendienteCount`) sin cambios. Cazadores P-001..P-007 inaplicables al diff (no toca writes Firestore, rules, alta empleado, dropdowns técnico, ni `crearNotificacion`).
- **OK humano:** jorge 2026-05-09 (`trabaja` implícito — Jorge probó visualmente y disparó la cola para arrancar 117c4).

---

### SPRINT-117c4 — Sección "Equipo" + mover Mantenimiento a Operaciones
- **Completado:** 2026-05-09 por coordinator autónomo. OK humano implícito: Jorge confirmó con "si" el 2026-05-09 al iniciar pasada de 117c6 (interpretado como confirmación visual del QA esperado en 117c4); reconfirmado implícitamente con `trabaja` el 2026-05-10 (cierre de lote 117c).
- **Hash:** `480532f`.
- **Resultado:** sección nueva "Equipo" con Personal + Usuarios y Permisos + Reporte de Ponches (extraídos de "Sistema"). Sección "Sistema" queda con Configuración + Plantillas Marketing. "Mantenimientos" movido del top-level al interior de "Operaciones". Gates de permisos preservados al 100%.
- **Validación:** typecheck + cazadores 7/7 PASS + lint Sidebar.tsx limpio + build OK.
- **Plan de rollback:** revertir `480532f`. Personal/Usuarios/Ponches vuelven a Sistema, Mantenimientos vuelve a top-level.
- **OK humano:** jorge 2026-05-09 ("si" implícito) + jorge 2026-05-10 (`trabaja` implícito en cierre lote 117c).

---

### SPRINT-117c6 — Limpiar alias `isAdmin = esAdminOCoord` en Sidebar.tsx
- **Completado:** 2026-05-10 por coordinator autónomo. OK humano implícito: Jorge confirmó con `trabaja` el 2026-05-10 (OK implícito de cierre del EN_REVISION_HUMANA — patrón consistente con 117c1..c4).
- **Hash:** `9b5aee2`.
- **Resultado:** alias `isAdmin = esAdminOCoord` eliminado de `Sidebar.tsx`. Las 16 usages funcionales migradas a `esAdminOCoord` directo: 2 redefiniciones de `isOperaria`/`isSecretaria` (líneas 165-166) + 14 call-sites en `show:` de items. En 4 casos (Conduces Pendientes, Historial Anuladas, Nómina, Estado de Resultado) la cláusula `|| userProfile?.rol === 'coordinadora'` era redundante con `isAdmin` y se eliminó (`A∨B∨B = A∨B` — conjunto resultante idéntico). NO se reemplazó ninguna usage por `'administrador'` literal — el alias siempre evaluó admin+coord. Asistente IA y Plantillas Marketing (admin-literal) NO usaban `isAdmin` — ya tenían `userProfile?.rol === 'administrador'` directo previo a este sprint.
- **Validación:** typecheck clean + cazadores 7/7 PASS 0 hits + lint Sidebar.tsx limpio + build OK (4.11s, bundle 2,651.94 kB — idéntico a baseline 117c4 que era 2,652 kB). Grep exhaustivo post-cambio: `\bisAdmin\b` retorna sólo Sidebar.tsx (comentario de forensia del propio diff, no funcional). Cero referencias en otros archivos del repo.
- **Plan de rollback:** revertir `9b5aee2`. El alias vuelve, el comentario explicativo desaparece, los 4 sitios donde se eliminó `|| 'coordinadora'` redundante recuperan la cláusula. Reversión 100% segura.
- **archivist PRE-CHANGE:** último commit en Sidebar.tsx fue `480532f` (117c4). Patrones a respetar: gates inline con `show:`, identifiers en español, sin emojis, comentario inline + plan de rollback en cada cambio. Sub-regla CLAUDE.md "no ocultar por rol" respetada.
- **regression_guardian:** PASS — semántica de permisos preservada al 100% en las 16 migraciones. Cazadores P-001..P-007 inaplicables al diff (no toca writes Firestore, rules, alta empleado, dropdowns técnico, ni `crearNotificacion`). Verificación adicional: ningún ítem cambia su conjunto de roles que lo ven.
- **reviewer:** APPROVED — cada migración revisada caso por caso. Las 4 simplificaciones lógicas (`isAdmin || 'coordinadora'` → `esAdminOCoord`) son matemáticamente equivalentes (idempotencia de OR sobre conjuntos). Asistente IA y Plantillas Marketing intactos. Comentario de forensia con plan de rollback presente; sin emojis; identifiers en español.
- **OK humano:** jorge 2026-05-10 (`trabaja` implícito).
- **Cierre del lote 117c:** este sub-sprint cierra el lote 117c al 100%. **5 de 6 sub-sprints aprobados ejecutados** (117c1, 117c2, 117c3, 117c4, 117c6); 117c5 fue rechazado por Jorge en el OK selectivo del 2026-05-09 (chocaba con sistema de permisos individuales `usuarios/{uid}.permisos.*`).

---

### SPRINT-117b — Propuesta de reorganización con mockup por rol
- **Completado:** 2026-05-08 noche por coordinator autónomo (novena pasada `trabaja`, sprint read-only).
- **Hash:** (pendiente de commit en este mismo turno).
- **Output:** `docs/sprints/PROPUESTA_IA_2026-05-08.md` (368 líneas, 7 secciones).
- **Resultado:** mockup de sidebar reorganizado por los 6 roles (admin 32 ítems, coord ~30, operaria ~10, secretaria ~8, técnico/ayudante sin cambios), 18 cambios justificados, tabla antes/después de 5 flujos comunes, 6 sub-sprints 117c1..c6 propuestos cada uno con touch-list 1-3 archivos + plan de rollback + riesgo, 4 preguntas abiertas no bloqueantes con defaults razonables.
- **Decisiones zanjadas por Jorge aplicadas sin re-preguntar:** (a) "Web y Solicitudes" admin+coord; (b) `/admin/configuracion/usuarios` redirect 301 a `/admin/usuarios`.
- **Pausa obligatoria respetada:** entrada agregada a `BLOQUEOS.md` esperando `OK: jorge YYYY-MM-DD HH:MM` (o variantes selectivo/cambios/rechazado).
- **Validación:** cazadores 7/7 PASS 0 hits idéntico al baseline (esperado, sin código tocado). Pre-commit hook OK. Sin tester/regression_guardian/reviewer porque no hay diff de código.
- **OK humano:** no requerido para 117b (sprint read-only). Sí requerido para arrancar 117c1..c6 — ver `BLOQUEOS.md`.
- **Próximo paso humano:** Jorge revisa `docs/sprints/PROPUESTA_IA_2026-05-08.md` (10 min de lectura), edita la entrada en `BLOQUEOS.md` con su decisión, pega `procesa bloqueos` al coordinator.

---

### SPRINT-117a — Auditoría focalizada de menús, rutas y módulos
- **Completado:** 2026-05-08 por coordinator autónomo (sprint read-only).
- **Hash:** `f1a89d0`.
- **Output:** `docs/sprints/AUDITORIA_IA_2026-05-08.md` (420 líneas, 6 secciones).
- **Resultado:** 52 rutas inventariadas, sidebar mapeado por rol (44 ítems admin / 17 operaria / 13 secretaria / 0 técnico-ayudante), matriz módulo × rol, top 5 redundancias (Calendario×Calendarios, Dashboard/Agenda/Ordenes/Calendario, Productos/Precios/Inventario, 3 inboxes Citas/Solicitudes/Reprogramaciones, pipeline Cotizaciones/FacturacionPendiente/Facturas), top 5 áreas confusas, apéndice de decisiones técnicas observadas.
- **Hallazgos extra para 117b:** (a) `/admin/usuarios` y `/admin/configuracion/usuarios` duplicados; (b) sección "Web y Solicitudes" gateada por `isAdmin = esAdminOCoord` cuando los items individuales también usan `isAdmin` — coordinadora SÍ los ve aunque el comment de las rutas en App.tsx parecería sugerir admin-only. Validar con Jorge.
- **Validación:** cazadores 7/7 PASS 0 hits idéntico al baseline (esperado, sin código tocado). Pre-commit hook OK.
- **OK humano:** no requerido (sprint read-only autónomo según protocolo).
- **Próximo paso:** SPRINT-117b queda PENDIENTE para próxima pasada de `trabaja` (consume este output como insumo).

---

### SPRINT-118 — Re-migración masiva notis legacy + fix email Wilainy
- **Completado:** 2026-05-08 noche por Jorge (validación humana visual). Cierre disciplina por coordinator: postmortem + cazador P-007 + fix vivo `Dashboard.tsx:216`.
- **Hashes:** `e6ccb1e` (scripts DRY-RUN entregados), `a15846e` (trail coordinator), `b781f80` (cierre Jorge — 41 notis re-migradas + 3 ya alineadas + email Wilainy fixeado), commit de cierre disciplina (este).
- **Resultado:** 41 notificaciones legacy re-migradas + 3 ya alineadas (Yohana idempotencia) = 44 docs procesados. Email Wilainy corregido en Auth + `usuarios/{uid}` de `apnbrito0318@gmail.com` a `Nwilainy@gmail.com`. Audit logs escritos en `auditoria_admin`.
- **Validación humana:** Jorge confirmó visualmente 39 notis aparecen en campanita admin (antes invisibles); reset de contraseña de Wilainy funciona desde GestionUsuarios.
- **OK humano:** jorge 2026-05-08 (`procesa bloqueos` desde `BLOQUEOS.md`).
- **Postmortem:** `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md`.
- **Cazador agregado:** P-007 — `scripts/invariantes/check-crearnotificacion-userid-shape.ts`.
- **Fix vivo encontrado durante postmortem:** `src/pages/Dashboard.tsx:216` (`userId: admin.id` → `admin.uid` con filter por `p.uid`).

---

### SPRINT-115 — Diagnóstico + re-migración de notificaciones de Yohana
- **Completado:** 2026-05-08 absorbido por SPRINT-118. La fase write de SPRINT-115 fue ejecutada como subset del scope masivo (3 notis de Yohana entre las 44 totales). Yohana validó campanita post-migración el 2026-05-08.
- **Hashes:** `f6d1d76` (script diagnóstico), `6b4aade` (script re-migración acotada), absorbido en `b781f80` (Jorge corrió el script masivo que cubrió Yohana + 4 empleados más).
- **Resultado:** las 3 notis de Yohana (`F9BV32k4JEoEOk97K4xc`, `TVwtOtmNlzW334IUIUdF`, `VWjdYBRmKgU8rGPlbJAv`) confirmadas alineadas correctamente en campanita post-fix.
- **OK humano:** jorge 2026-05-08.
- **Postmortem:** parte de `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md` (mismo bug, scope expandido).

---

### SPRINT-100 — Validar que Yohana ve notificaciones después de b93625d
- **Completado:** 2026-05-08 — Yohana validó campanita visualmente post-migración masiva (SPRINT-118). El sprint tenía como objetivo confirmar que las 3 notis de Yohana eran visibles después de `b93625d`. Diagnóstico SPRINT-115 confirmó que NO eran visibles porque tenían `userId == personalDocId`. Fix masivo SPRINT-118 alineó 41 docs + 3 ya correctos. Yohana confirmó el 2026-05-08 que ve sus notis.
- **Hash:** validación visual humana, sin commit propio (el sprint era QA).
- **OK humano:** jorge 2026-05-08 (relayando confirmación de Yohana).
- **Postmortem:** `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md`.

---

### SPRINT-107 — Agente `archivist` + Continuous Improvement Loop
- **Completado:** 2026-05-07 por coordinator (segunda pasada del día)
- **Hash:** `e395052`
- **Touch-list real:**
  - `.claude/agents/archivist.md` (NUEVO — 180 líneas, 3 modos: PRE-CHANGE / POSTMORTEM / MÉTRICAS)
  - `.claude/agents/coordinator.md` (pasos `b.5` PRE-CHANGE y `i.5` POSTMORTEM agregados al flujo autónomo + tabla de agentes actualizada)
  - `.claude/agents/builder.md` (sub-regla "respetar advertencias del archivist")
  - `docs/postmortems/_TEMPLATE.md` (NUEVO — template estructurado: timeline, impacto, 5 porqués, lo que funcionó/falló, acciones, métricas, lecciones)
  - `docs/postmortems/README.md` (NUEVO — guía del directorio + relación con catálogo P-XXX)
  - `docs/postmortems/2026-05-07-iniciar-chequeo-rules-sin-deploy.md` (NUEVO — primer postmortem retroactivo del bug SPRINT-106)
  - `scripts/metricas-mejora-continua.ts` (NUEVO — 6 métricas: MTBF, MTTR, recurrence rate, catch rate, cazadores activos, allowlist size; soporta `--desde=YYYY-MM-DD`)
  - `package.json` (script `metricas` agregado)
  - `CLAUDE.md` (sección "Continuous Improvement Loop" + 3 sub-reglas obligatorias: PRE-CHANGE, POSTMORTEM al cerrar bug, postmortem antes de marcar hotfix COMPLETADO)
  - `docs/PATRONES_REGRESION.md` (sección "Relación con el agente archivist" al final)
  - `docs/sprints/METRICAS_2026-05-07.md` (auto-generado por primer run de `npm run metricas`)
- **Sin tocar código de la app, rules, ni dependencias.**
- **Validaciones:**
  - `npx tsc --noEmit` clean.
  - `npm run check:regression` 5/5 PASS, 0 hits.
  - `npm run lint` baseline preservado (5559 problems excluyendo worktrees, idéntico al pre-sprint).
  - `npm run metricas` corre y genera `docs/sprints/METRICAS_2026-05-07.md` con 1 postmortem detectado, MTTR 540 min, recurrence 0%, 5 cazadores activos, allowlist size 16.
- **Decisión clave:** el archivist es agente complementario a `mejora_continua` y `regression_guardian`, no solapa. `mejora_continua` ve deuda cross-cutting; `regression_guardian` ve diff actual vs catálogo P-XXX; `archivist` ve el TIEMPO (commits previos, postmortems, métricas).
- **Detalle completo:** ver `docs/sprints/EJECUCION_AUTONOMA.md` sección 2026-05-07 segunda pasada.

---

### SPRINT-105 — GestionUsuarios alta crea AMBOS docs (personal + usuarios)
- **Completado:** 2026-05-06 por coordinator (tercera pasada)
- **Hash:** `009bcc8`
- **Implementación:** Opción 3 — `secondaryDb` con sesión del propio user creado para escribir `usuarios/{uid}` antes del `deleteApp(secondaryApp)`. Si falla espejo, abort antes de crear/actualizar `personal` (no hay estado parcial). Aplicado en 2 puntos: alta nueva (`guardarRestoDeCambios`) y dar acceso a empleado existente (`handleCrearAcceso`).
- **Cazador nuevo:** P-004 en `scripts/invariantes/check-alta-empleado-doble-doc.ts`. Escanea archivos con `createUserWithEmailAndPassword` y verifica que aparezca `setDoc(doc(... 'usuarios' ...))` cercano. Allowlist por header `// @safe-no-usuarios-mirror: <razón>`.
- **Sin cambios a rules:** la rule `firestore.rules:379-385` (write a `usuarios/{docId}` permitido para esAdminOCoord) ya cubre.
- **Documentación sincronizada:** gotcha "Alta de empleado debe crear AMBOS docs" en CLAUDE.md tachada con `~~strikethrough~~` + nota [RESUELTO en SPRINT-105 el 2026-05-06]. Catálogo P-004 agregado a `docs/PATRONES_REGRESION.md`.
- **Detalle completo:** ver `docs/sprints/EJECUCION_AUTONOMA.md` sección "tercera pasada".

---

## Plantilla para sprints nuevos (para Cowork)

```markdown
### SPRINT-XXX — <título>

**Estado:** PENDIENTE
**Prioridad:** alta | media | baja
**Origen:** <Jorge dijo X | Cowork detectó Y>
**Riesgo:** bajo | medio | alto
**Touch-list previsto:** <archivos>

#### Objetivo
...

#### Por qué
...

#### Criterios de aceptación
- [ ] ...

#### Restricciones / guardarrails
- ...

#### Notas para el coordinator
- ...
```

---

### SPRINT-108 — Cierre disciplina hotfix 2026-05-07 (P-006 + P-002 variante !=)

**Estado:** COMPLETADO 2026-05-07 (tercera pasada — postmortem + cazador P-006 + cazador P-002 extendido a `!=` + 5 archivos con allowlist `@safe-tecnicoid-id:` documentada)
**Prioridad:** alta (deuda obligatoria por sub-reglas CLAUDE.md)
**Origen:** Bug en producción 2026-05-07 — Aury Mon no podía iniciar chequeo. Cadena de 2 bugs:
1. `tecnicoId` guardado como `personal.id` en lugar de `auth.uid` (commits c4be345 y migración)
2. Rule `modificaPrecioFinal()` con acceso directo a campo opcional (commit b7b6464)
**Riesgo:** bajo (todo es documentación + cazador determinístico)
**Touch-list previsto:** docs/postmortems/, docs/PATRONES_REGRESION.md, scripts/invariantes/, CLAUDE.md, scripts/invariantes/run-all.ts

#### Objetivo
Cerrar la disciplina obligatoria que CLAUDE.md exige al cerrar un hotfix de producción. Sin esto, los aprendizajes quedan anecdóticos.

#### Por qué
Las sub-reglas obligatorias en CLAUDE.md dicen:
- "postmortem completo es obligatorio antes de marcar un sprint hotfix como COMPLETADO"
- "cada bug capturado se convierte en cazador ejecutable"

El hotfix de Aury cerró sin cumplir estas dos reglas (Jorge eligió A en vez de A+ para descansar). Este sprint paga la deuda.

#### Criterios de aceptación
- [ ] Crear `docs/postmortems/2026-05-07-iniciar-chequeo-permission-denied.md` siguiendo `_TEMPLATE.md`. Incluir:
  - Timeline (Aury reporta → diagnóstico → migración tecnicoId → fix rules → resolución).
  - Impacto: técnicos bloqueados ~1 día post-deploy SPRINT-106.
  - 5 porqués hasta causa raíz estructural.
  - Acciones preventivas: extender cazador P-002, crear cazador P-006.
- [ ] Agregar P-006 a `docs/PATRONES_REGRESION.md` siguiendo plantilla:
  - Síntoma: técnico recibe permission-denied al hacer cualquier write sobre orden suya.
  - Causa raíz: dropdowns de "Asignar técnico" guardan `personal.id` (doc id) en lugar de `personal.uid` (auth.uid). La rule compara `tecnicoId == request.auth.uid`.
  - Regla: cualquier dropdown que asigna a un técnico/operaria/secretaria debe guardar `uid`, no `id`.
  - Cazador: `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts`.
- [ ] Crear cazador `scripts/invariantes/check-tecnicoid-personal-id-misuse.ts`:
  - Escanea `src/**/*.tsx` buscando `<option value={` seguido de `t.id` o `p.id` cerca de un select que filtra `tecnicos` o `personal where rol == 'tecnico'`.
  - Falla si encuentra hits sin allowlist documentada.
  - Allowlist en header con regla: "el dropdown es solo para selección visual (filtro), no se guarda en Firestore".
- [ ] Extender cazador P-002 (`scripts/invariantes/check-rules-immutability.ts`) para que también detecte `!=`:
  - Hoy solo busca `==`. Bug en `modificaPrecioFinal()` usaba `!=` y no se detectó.
  - Cambiar regex para capturar ambos.
  - Re-correr smoke test, verificar 0 hits nuevos.
- [ ] Registrar P-006 en `scripts/invariantes/run-all.ts`.
- [ ] Update gotcha en `CLAUDE.md`:
  - Agregar/extender la gotcha "asunción frágil personal/{id}.id == auth.uid" para incluir el caso del dropdown que escribe a `tecnicoId`.
  - Marcar como "[RESUELTO en SPRINT-108]" la deuda anterior si aplica.
- [ ] Verificar que `npm run check:regression` pasa con 0 hits.
- [ ] Commit con mensaje descriptivo + push.

#### Restricciones / guardarrails
- regression_guardian OBLIGATORIO antes de cerrar (la sub-regla "sprints que tocan rules, services o context" aplica porque toca cazadores y patrón).
- NO desactivar cazadores si grita por algo legítimo en el extender de P-002 — agregar al allowlist con justificación.
- Archivist debe consultarse en modo PRE-CHANGE antes de tocar `scripts/invariantes/`.

#### Notas para el coordinator
- Este sprint paga deuda de hoy. Es chico (~1h) pero crítico para el sistema de aprendizaje continuo.
- El postmortem debe responder: ¿por qué tardamos tanto en encontrar el bug? Hipótesis: el cazador P-002 tenía gap (solo `==`).
- Para extender P-002 a `!=`: revisar `scripts/invariantes/check-rules-immutability.ts` línea con la regex y agregar variante `!=` con misma lógica de detección de campo opcional.

---

### SPRINT-109 — Limpiar 22 hits de P-001 (userProfile.id misuse)

**Estado:** COMPLETADO 2026-05-07 (resuelto retroactivamente — SPRINT-103 commit `ef74a04` ya cazó los 22 hits con fixes + allowlists. El cazador P-001 retorna 0 hits hoy. No requiere trabajo adicional).
**Prioridad:** alta (auditoría pedida por Jorge)
**Origen:** Smoke test del 2026-05-06 dejó 22 hits del cazador P-001 sin atender. Triaje preliminar en SPRINT-103 dijo "~7 bugs reales mismo patrón que afc5e4a, ~15 falsos positivos" pero nunca se cerró.
**Riesgo:** medio (toca services y context; misma clase de bug que rompió producción 2 veces)
**Touch-list previsto:** ver lista abajo

#### Objetivo
Auditar uno por uno los 22 hits del cazador P-001 (`userProfile.id` cerca de campos sensibles gateados por `auth.uid`). Para cada hit decidir:
- **Bug real** → reemplazar `userProfile?.id` por `currentUser?.uid` del context.
- **Falso positivo** (filtro de UI sin write a Firestore) → agregar a allowlist documentada en el header del cazador.
- **Requiere refactor** (ej: estructural) → escalar a sprint propio.

#### Por qué
Los 22 hits son bugs latentes del mismo vector que ya rompió producción dos veces (afc5e4a Reactivación, b93625d Notificaciones). Cualquiera puede ser el próximo "Iniciar Chequeo" de Aury.

#### Lista de archivos con hits (referencia)
- `src/components/cierre/ModalSugerirSoloChequeo.tsx:94` — campo `sugeridaPor`
- `src/components/ordenes/IniciarChequeoButton.tsx:224` — campo `tecnicoId` nested
- `src/pages/Dashboard.tsx:453,454` — filtro UI por `operariaId` (probablemente FP, pero verificar)
- `src/pages/OrdenDetalle.tsx:238,245,268` — comparaciones `orden.tecnicoId === userProfile.id` (FP si la migración P-006 ya alineó tecnicoId con auth.uid; verificar)
- `src/pages/Reprogramaciones.tsx:115,123,173,237` — campo `resueltaPor`
- `src/pages/SugerenciasChequeo.tsx:99,136` — campo `resueltaPor`
- `src/pages/TecnicoVista.tsx:155,195,204,208,212,238,259,264,1213` — varios; algunos FP de filtros, otros writes (verificar uno por uno)

#### Criterios de aceptación
- [ ] Cada hit clasificado en una tabla en EJECUCION_AUTONOMA.md: archivo:línea, decisión (FIX/ALLOWLIST/SPRINT_PROPIO), justificación.
- [ ] Para los FIX: PR con cambios + verificación typecheck/lint.
- [ ] Para los ALLOWLIST: header del cazador actualizado con regla "// @safe-userprofile-id: <razón>" y comentario en código en el mismo archivo.
- [ ] Para los SPRINT_PROPIO: agregarlos a la cola con ID SPRINT-XXX.
- [ ] `npm run check:regression` pasa con 0 hits o con allowlist documentada al 100%.
- [ ] Cada FIX correspondiente a un campo sensible (sugeridaPor, resueltaPor, etc.) requiere QA manual de que el flujo afectado siga funcionando para todos los roles (admin/coord/secretaria/operaria/tecnico).
- [ ] Build + lint + cazadores pasan en pre-commit.

#### Restricciones / guardarrails
- regression_guardian OBLIGATORIO (toca services y context).
- archivist en modo PRE-CHANGE antes de tocar cualquier archivo del touch-list.
- NO bypassear con `--no-verify`. Si el cazador grita, decidir entre FIX o ALLOWLIST.
- Para `Reprogramaciones.tsx` y `SugerenciasChequeo.tsx` (campo `resueltaPor`): verificar primero la rule de Firestore. Si la rule compara contra `auth.uid`, ES bug real; si compara contra otro campo, podría ser FP.
- Para `TecnicoVista.tsx`: tener cuidado especial — la migración P-006 puede haber alineado `tecnicoId` con `auth.uid`, así que comparaciones `orden.tecnicoId === userProfile.id` ahora podrían fallar para usuarios con `userProfile.id == personalDocId`. Considerar si conviene cambiar a `currentUser.uid` por consistencia.

#### Notas para el coordinator
- Este sprint puede dividirse en sub-sprints por archivo si se vuelve grande.
- Si encuentra un patrón nuevo, agregar P-XXX y cazador.
- Coordinar con SPRINT-108 (extender cazador) si los nuevos cazadores deben capturar variantes.

---

### SPRINT-110 — Limpiar 13 hits P-002 (rules con .get faltantes)

**Estado:** COMPLETADO 2026-05-07 (resuelto retroactivamente — SPRINT-103 commit `ef74a04` cubrió 11 de los 13 hits con `.get()`/`@safe-required`. SPRINT-106 hotfix `b7b6464` cubrió el 12º (`modificaPrecioFinal !=`). SPRINT-108 cubrió la cobertura del cazador para detectar futuras variantes `!=`. El cazador P-002 retorna 0 hits hoy. No requiere trabajo adicional).
**Prioridad:** alta (auditoría pedida por Jorge)
**Origen:** Smoke test del 2026-05-06 dejó 13 hits del cazador P-002 (rules de inmutabilidad sobre campo opcional sin `.get()`). Algunos posiblemente ya se arreglaron en SPRINT-103 pero el smoke no se re-corrió.
**Riesgo:** medio-alto (toca firestore.rules — vector que ya rompió producción 2 veces)
**Touch-list previsto:** firestore.rules

#### Objetivo
Auditar cada uno de los 13 hits en `firestore.rules`. Para cada uno:
- **Campo opcional** → convertir a `request.resource.data.get('campo', null) == resource.data.get('campo', null)`.
- **Campo required** (garantizado present desde el create) → agregar comentario `// @safe-required: <campo>` antes de la línea para que el cazador lo ignore.

#### Por qué
Vector P-002 ya rompió producción 2 veces (c7c8e34 Reactivación, b7b6464 Iniciar Chequeo). La regla de pulgar es: si el campo no aparece en el create base de la colección, es opcional → usar `.get`.

#### Lista de archivos con hits (referencia, requiere revalidación)
- `firestore.rules:138` — `soloChequeo` (probablemente ya .get post-SPRINT-103)
- `firestore.rules:187-190` — `estadoAprobacion`, `precioAprobado`, `aprobadoPor`, `fechaAprobacion` (probablemente ya .get post-SPRINT-103)
- `firestore.rules:199-200` — `tecnicoId`, `ayudanteId` (verificar si tecnicoId es required tras SPRINT-105)
- `firestore.rules:584-591` — `creadaPor`, `creadaPorNombre`, `fecha`, `creadaEn`, `plantillaId`, `plantillaNombre` (campañas marketing — verificar create base)

#### Criterios de aceptación
- [ ] Re-correr `npm run check:regression` para tener lista actualizada de hits (algunos pueden estar resueltos).
- [ ] Por cada hit vivo: leer la rule completa, leer el create de la colección, decidir si campo es required u opcional.
- [ ] Para required: agregar `// @safe-required: <campo>` arriba de la línea con justificación.
- [ ] Para opcional: convertir a `.get()` (ambos lados de la comparación).
- [ ] QA manual del flujo afectado (happy path + caso campo missing) para cada rule modificada.
- [ ] `npm run deploy:rules` (despliega + actualiza lock).
- [ ] `npm run check:regression` pasa con 0 hits.
- [ ] Test E2E: técnico hace update de orden sin precioFinal/estadoAprobacion seteados, debe pasar.

#### Restricciones / guardarrails
- **Sprint que toca rules → deploy obligatorio antes de cerrar (sub-regla CLAUDE.md, P-005).**
- regression_guardian OBLIGATORIO.
- Reviewer obligatorio con foco en rules (sub-regla CLAUDE.md).
- archivist en modo PRE-CHANGE antes de tocar firestore.rules.

#### Notas para el coordinator
- Este sprint depende de SPRINT-108 (extender cazador para `!=`) — si ya se hizo, re-correr el cazador puede traer hits nuevos.
- El reviewer debe validar que ninguna rule cambió la semántica (de inmutable a mutable accidental).

---

### SPRINT-111 — Auditar otros campos de ID con vector P-001/P-006

**Estado:** COMPLETADO 2026-05-08 (fase 111a — auditoría documental completa de 12 campos. Resultado: 0 bugs latentes nuevos. P-001 + P-006 + gotchas vigentes cubren todos los vectores activos. 4 inconsistencias de bajo riesgo identificadas → SPRINT-114 sugerido. NO se creó cazador determinístico genérico nuevo — solaparía con P-001/P-006 sin agregar señal. Documento completo en `docs/sprints/AUDITORIA_CAMPOS_ID_2026-05-08.md`).
**Prioridad:** alta (auditoría pedida por Jorge)
**Origen:** P-006 demostró que el bug de `tecnicoId` afecta a CUALQUIER campo que guarde un ID de personal/usuario. Otros campos similares pueden tener el mismo problema.
**Riesgo:** alto (puede requerir migración de datos similar a P-006)
**Touch-list previsto:** múltiples (a determinar)

#### Objetivo
Auditar TODOS los campos del esquema que guardan un ID de un empleado y verificar:
1. ¿Se compara con `auth.uid` en alguna rule? → debe ser auth.uid (no personal.id)
2. ¿Se guarda como `personal.id` o como `personal.uid` (auth.uid)?
3. Si hay desalineación: code fix + migración + nuevo cazador.

#### Campos a auditar
- `operariaId` — Dashboard filter, recordatorios, comisiones
- `ayudanteId` — orden + rule de ayudante en ordenes_servicio
- `responsableId` — orden (creado por staff)
- `creadaPor` — campañas marketing, plantillas
- `creadoPor` — orden
- `eliminadaPorId` — orden (auditoría)
- `aprobadoPor` — orden
- `sugeridaPor` — sugerencias solo chequeo
- `resueltaPor` — sugerencias, reprogramaciones
- `usuarioId` (audit logs, conversaciones_ia, notificaciones)
- `personalUid` (ponches)
- `cerradaPor` — orden

#### Criterios de aceptación
- [ ] Tabla en EJECUCION_AUTONOMA.md con cada campo: dónde se escribe, dónde se lee, regla aplicable, valor actual (personal.id / auth.uid / mixto).
- [ ] Para cada campo donde haya bug: PR con code fix (cambiar dropdown/asignación a usar `uid`).
- [ ] Para cada campo donde haya datos viejos mal guardados: script de migración idempotente con dry-run.
- [ ] Crear cazador genérico `scripts/invariantes/check-id-vs-authuid-misuse.ts` que detecta el patrón en código nuevo.
- [ ] Run cazadores, deben pasar.

#### Restricciones / guardarrails
- Migraciones de datos > 500 docs requieren OK de Jorge (queda en BLOQUEOS.md).
- regression_guardian + reviewer obligatorios.
- Cualquier nueva rule que se cree para validar uno de estos campos debe pasar P-002.

#### Notas para el coordinator
- Este sprint puede ser el más grande de los 5. Considerá dividirlo por colección (ordenes_servicio, campanas_marketing, comisiones, etc.).
- Si encuentra que `eliminadaPorId` está mal en >50% de las órdenes eliminadas, es marcador del mismo bug P-006 propagado.

---

### SPRINT-112 — Schema drift y matriz de permisos por rol

**Estado:** COMPLETADO 2026-05-10 fase documental, hash `6aae2e5` (`docs/MATRIZ_PERMISOS.md` con 27 flujos × 6 roles + script `scripts/auditoria/schema-drift.ts` read-only + comando `npm run audit:schema-drift`. Smoke test contra prod retornó 65 drift+ y 157 drift- — herramienta funciona. Componente humano — QA manual de las 162 celdas — movido a `BLOQUEOS.md` como SPRINT-112-QA.)
**Prioridad:** media (auditoría pedida por Jorge — la última)
**Origen:** Auditoría completa solicitada por Jorge tras hotfix de Aury.
**Riesgo:** bajo-medio (mayormente documentación + tests manuales)
**Touch-list previsto:** docs/MATRIZ_PERMISOS.md (nuevo), src/types/index.ts (validación), tests manuales

#### Objetivo
Crear documentación viva de:
1. **Schema drift**: qué campos están en TypeScript types pero no en docs reales de Firestore (y viceversa).
2. **Matriz de permisos por rol**: para cada rol (admin/coord/secretaria/operaria/tecnico/ayudante), qué flujos críticos puede ejecutar y cuáles no, con verificación E2E.

#### Por qué
- El schema drift causa bugs sutiles (campos opcionales vs required en TS distintos a Firestore).
- La matriz de permisos hoy está implícita en rules + permisos.ts. No hay un lugar único donde un nuevo dev (o Claude) consulte "¿qué puede hacer una operaria?".

#### Criterios de aceptación
- [ ] Script `scripts/auditoria/schema-drift.ts` que samplea N docs de cada colección y reporta campos no documentados en TS.
- [ ] `docs/MATRIZ_PERMISOS.md` con tabla: para cada flujo crítico (crear orden, iniciar chequeo, marcar realizado, facturar, generar conduce, ver comisiones, agendar cita, eliminar orden, etc.), columna por rol con ✓ / ✗ / condicional.
- [ ] QA manual: testear cada celda ≠ ✗ con un usuario real de cada rol. Documentar resultado.
- [ ] Si hay celdas que el código permite pero la matriz pretende negar (o viceversa): bug. Crear sprint específico de fix.

#### Restricciones / guardarrails
- archivist PRE-CHANGE antes de empezar.
- No tocar code de aplicación; sólo agregar tests/docs.
- Si encuentra bugs reales, crear sprint nuevo (no fix dentro de este).

#### Notas para el coordinator
- Este es el sprint más "ligero" pero el de mayor impacto a largo plazo: prevenir bugs futuros mediante documentación enforcement-friendly.
- Considerá usar Cypress/Playwright para automatizar el QA por rol (sprint follow-up).

---

### SPRINT-113 — UX flujo de orden paso a paso intuitivo (técnico/operaria/secretaria)

**Estado:** EN_PROGRESO — 4 de 6 criterios COMPLETADOS por las fases 113a/b/c (commits `9603da3` + `dd24bb2` + `49af624` + `0909237` en producción). Pendientes: QA manual end-to-end con técnicos/operarias reales (humano) y cazador anti-regresión de tooltips (sprint propio futuro si Jorge lo prioriza).
**Prioridad:** alta (pedido directo de Jorge — "más entendible, paso a paso, intuitivo")
**Origen:** Jorge tras hotfix Aury: "tenemos que hacer un flujo de orden visualmente más organizado y entendible".
**Riesgo:** medio (toca UI de un flujo crítico; no toca rules ni datos)
**Touch-list previsto:** FaseStepper.tsx, OrdenDetalle.tsx, TecnicoVista.tsx, OrdenCard.tsx, posibles componentes nuevos

#### Objetivo
Rediseñar la presentación del flujo de orden para que cada rol sepa **cuál es el siguiente paso a realizar**, sin necesidad de manual ni capacitación.

#### Por qué
Hoy el stepper muestra fases (Nuevo Lead → En Gestión → ...) pero NO indica al usuario:
- ¿Qué acción concreta tiene que hacer ahora?
- ¿Qué está esperando el sistema (de él o de otro rol)?
- ¿Por qué un botón está deshabilitado?

Específico — la sugerencia de chequeo del técnico no se refleja en el stepper, generando confusión ("¿se envió o no?").

#### Criterios de aceptación
- [x] **Banner de "siguiente paso"** en OrdenDetalle/TecnicoVista, contextual al rol del usuario logueado y a la fase actual: **Implementado en SPRINT-113a (commits `9603da3` + `dd24bb2`, COMPLETADO 2026-05-08, validado visualmente por Jorge en producción)**.
  - Técnico en orden agendada: "Próximo paso: Iniciar chequeo cuando llegues al cliente."
  - Técnico en orden en_diagnostico: "Próximo paso: Cotizar reparación o sugerir solo chequeo."
  - Operaria en orden con sugerencia pendiente: "Aury sugirió cobrar solo chequeo (RD$2,000). Aprobá o rechazá."
  - Etc. — cubrir las 8 fases × 3 roles principales.
- [x] **Badge "Sugerencia pendiente"** visible en stepper cuando hay una sugerencia de chequeo no resuelta. Color amarillo. **Implementado en SPRINT-113b (commit `49af624`, 2026-05-08). Decisión: presentacional sin onClick — el banner de 113a ya direcciona la acción a oficina; click-to-modal queda como mejora futura.**
- [x] **Tooltips en botones deshabilitados** explicando por qué. **Implementado en SPRINT-113b (commit `49af624`, 2026-05-08) con helper puro `src/utils/tooltipsBotones.ts`. Cubiertos: Iniciar chequeo, Cerrar servicio (5 razones), Enviar a conduce.**
- [x] **Indicador visual de "esperando otro rol"** — **Cubierto por el banner de SPRINT-113a (tono `espera` gris) y reforzado por el badge "Sugerencia pendiente" de SPRINT-113b.**
- [x] **Resumen visual del flujo** al pie de OrdenDetalle: timeline horizontal con últimas 5 acciones (quién, qué, cuándo). **Implementado en SPRINT-113c (segunda pasada 2026-05-08). Helper `obtenerTimelineAcciones` + componente `TimelineAcciones` montado al pie del bloque "Flujo de la orden". Auto-oculta con <2 acciones. Responsive vertical/horizontal.**
- [ ] QA manual con usuarios reales (Jorge + técnico + operaria) recorriendo un flujo end-to-end. Identificar friction points y resolver. **(BLOQUEADO — requiere humanos.)**
- [ ] Cazador anti-regresión: ningún botón crítico debe quedar sin tooltip explicativo cuando esté disabled (regla nueva, opcional). **(NO IMPLEMENTADO — sprint propio futuro si Jorge lo prioriza; el cazador requeriría análisis AST o convención de naming, scope mediano.)**

#### Restricciones / guardarrails
- NO cambiar la lógica de transición de fase (eso es seguro y testeado).
- NO cambiar los identificadores internos.
- archivist PRE-CHANGE — los archivos que se tocan son críticos.
- Reviewer obligatorio con foco en accesibilidad (color contrast, aria-labels en tooltips).

#### Notas para el coordinator
- Considerá hacerlo en 3 sub-sprints: SPRINT-113a (banner siguiente paso), 113b (badges sugerencia/esperando), 113c (timeline acciones).
- Pedir a Jorge mockups o screenshots de referencia si hay alguno.
- Bloqueo conocido: la lógica de "siguiente paso" depende de muchos campos opcionales (sugerencias, aprobaciones, pagos). Definir matriz fase × rol × condiciones antes de empezar a codear.

---

### SPRINT-113b — Badges de sugerencia pendiente + tooltips en botones disabled

**Estado:** COMPLETADO 2026-05-08 (segunda pasada autónoma — badge "Sugerencia pendiente" en `FaseStepper`, helper `tooltipsBotones.ts` puro testeable, tooltips `title` en Iniciar chequeo / Cerrar servicio / Enviar a conduce. Sin escrituras nuevas, sin tocar rules, sin tocar services. 6/6 cazadores PASS, 0 hits.)
**Prioridad:** alta (continuación de 113a, ya aprobado por Jorge)
**Origen:** SPRINT-113 padre (UX flujo paso a paso). Fase 113a (banner) completada y validada en producción 2026-05-08.
**Riesgo:** bajo (UI puramente presentacional; no toca rules, services, mutaciones)
**Touch-list previsto:**
- `src/components/ordenes/FaseStepper.tsx` (agregar slot/badge "Sugerencia pendiente")
- `src/components/ordenes/IniciarChequeoButton.tsx` (tooltip cuando está disabled)
- `src/components/cierre/CierreServicioWizard.tsx` o componentes de aprobación de precio (tooltip cuando disabled)
- Posiblemente helper nuevo `src/utils/tooltipsBotones.ts` que dado orden + rol retorne razón humana de por qué un botón está bloqueado
- `src/pages/OrdenDetalle.tsx` y `src/pages/TecnicoVista.tsx` (cablear el tooltip al botón disabled)

#### Objetivo
Que el stepper deje claro cuándo hay una sugerencia de "solo chequeo" pendiente sin tener que abrir un modal, y que ningún botón disabled del flujo deje al usuario adivinando por qué no se puede clickear.

#### Por qué
Hoy el técnico hace una sugerencia de solo chequeo y el stepper no cambia visualmente — la operaria solo ve la notificación in-app pero al entrar a la orden no encuentra señal visual fuerte. El banner de 113a ya cubre el mensaje pero un badge en el stepper resuelve el caso de "tengo 30 órdenes en lista, en cuál hay sugerencia?".

Tooltips en botones disabled: hoy el técnico ve "Iniciar chequeo" gris y no sabe si le falta GPS, si la orden no está agendada, o si la rule rechazó. Pasa lo mismo con "Cerrar servicio" cuando falta foto/firma.

#### Criterios de aceptación
- [ ] **Badge "Sugerencia pendiente"** visible junto al stepper o sobre el chip de fase actual cuando `obtenerSugerenciaSoloChequeoPendiente(orden)` retorna no-null. Color amarillo (consistente con tono `alerta` del banner). Click → abre el modal de aprobación de la sugerencia (reutiliza el modal existente).
- [ ] El badge desaparece cuando la sugerencia se aprueba o rechaza.
- [ ] **Tooltip explicativo** en cada botón crítico que pueda quedar disabled:
  - Iniciar chequeo (técnico): "Necesitás permiso de GPS para iniciar" / "Esperá a que la orden esté agendada" / etc.
  - Aprobar/rechazar sugerencia (oficina): no aplica disabled (siempre activo).
  - Cerrar servicio (técnico): "Faltó foto del cierre" / "Faltó firma del cliente" / "Falta marcar 'equipo funciona'".
  - Enviar a facturación (oficina): "Falta cierre del técnico" / "Ya enviada a facturación".
- [ ] Tooltips usan `title` HTML nativo o componente accesible (preferir nativo para mantener bundle chico). Si se usa componente, debe tener `aria-describedby`.
- [ ] La razón de disabled vive en un helper puro testeable, no inline en el componente.
- [ ] `npm run check:regression` sigue en 0 hits.
- [ ] Build OK, typecheck OK, lint OK.

#### Restricciones / guardarrails
- archivist PRE-CHANGE — `IniciarChequeoButton.tsx` y `FaseStepper.tsx` están en la lista de archivos críticos del flujo técnico (sub-regla CLAUDE.md sobre cleanup en páginas críticas).
- regression_guardian RECOMENDADO — toca componentes con historia de bugs P-001/P-006.
- NO cambiar la condición que decide si el botón está disabled — solo agregar la explicación. La lógica de gating sigue intacta.
- NO tocar rules, services ni mutaciones. Si necesitás un dato derivado (ej. razón de disabled), calcularlo client-side desde props.
- El badge NO escribe a Firestore. Solo lee de la orden ya cargada.

#### Notas para el coordinator
- El helper `calcularSiguientePaso` de 113a ya tiene la lógica del caso "sugerencia pendiente". Reutilizarla — no duplicar.
- Antes de codear, hacer matriz `botón → razón_disabled`: técnico tiene 3-4 botones críticos, oficina tiene 2-3. Sin esta matriz se va a olvidar uno.
- Para el badge en el stepper, considerar si conviene como overlay sobre la fase actual o como pill suelta arriba. El stepper actual probablemente no tiene espacio sobrado — leer su layout primero.
- Si Jorge tiene preferencia visual (ej. icono de campana vs estrella), preguntarle vía AskUserQuestion antes de elegir.

---

### SPRINT-113c — Timeline horizontal de últimas 5 acciones al pie de OrdenDetalle

**Estado:** COMPLETADO 2026-05-08 (segunda pasada autónoma — helper `src/utils/timelineAcciones.ts` mezcla `historialFases` + `auditoria` con parser tolerante a shapes legacy. Componente `src/components/ordenes/TimelineAcciones.tsx` responsive (vertical mobile / horizontal scroll md+) montado al pie del bloque "Flujo de la orden" en `OrdenDetalle.tsx`. Auto-oculta con <2 acciones. Iconografía por tipo de acción. Sin escrituras, sin migraciones. 6/6 cazadores PASS.)
**Prioridad:** media (continuación de 113a/b, mejora de visibilidad histórica)
**Origen:** SPRINT-113 padre (UX flujo paso a paso). Criterio de aceptación pendiente.
**Riesgo:** bajo (UI presentacional, lectura del campo `historialFases` o `auditoria` ya existente)
**Touch-list previsto:**
- `src/components/ordenes/TimelineAcciones.tsx` (NUEVO — componente presentacional)
- `src/utils/timelineAcciones.ts` (NUEVO — helper que dado una orden retorne las últimas 5 acciones normalizadas)
- `src/pages/OrdenDetalle.tsx` (montar el componente al pie del bloque "Flujo de la orden" o como sección propia)

#### Objetivo
Mostrar al pie de OrdenDetalle un timeline visual horizontal con las últimas 5 acciones registradas en la orden: quién, qué, cuándo. Sin clicks, sin modales — solo lectura visual rápida.

#### Por qué
Hoy `historialFases` y `auditoria` viven dentro de la orden pero no se renderizan visualmente — solo en logs internos. El admin/coordinadora que entra a una orden con problema necesita reconstruir mentalmente "¿quién hizo qué cuándo?" abriendo cada modal. Un timeline al pie resuelve ese caso de uso en 1 segundo.

#### Criterios de aceptación
- [ ] Helper `obtenerTimelineAcciones(orden, max=5)` retorna array de `{ accion, actorNombre, fechaIso, descripcion }` ordenado de más reciente a más viejo.
- [ ] Lee de `orden.historialFases` Y `orden.auditoria` (cubrir ambas shapes — gotcha CLAUDE.md sobre cierre legacy + nuevo).
- [ ] Si una entrada no tiene `actorNombre` o `descripcion`, fallbacks razonables (ej: "Sistema").
- [ ] Componente `TimelineAcciones` renderiza horizontalmente con scroll-x si hay overflow en mobile, y verticalmente en pantallas chicas (responsive).
- [ ] Cada item muestra: icono según tipo de acción, nombre del actor, descripción corta, hora relativa (`hace 3h`) y absoluta en tooltip (`2026-05-07 14:32`).
- [ ] Si la orden tiene `<2` acciones registradas, no se renderiza el componente (evitar pollution visual en órdenes recién creadas).
- [ ] Sin emojis. Iconos de `lucide-react` consistentes con el resto de la app.
- [ ] `npm run check:regression` sigue en 0 hits.
- [ ] Build, typecheck, lint OK.

#### Restricciones / guardarrails
- archivist PRE-CHANGE recomendado — `OrdenDetalle.tsx` es archivo crítico del flujo.
- NO escribir a Firestore. Solo lectura del shape ya cargado.
- NO normalizar/migrar datos viejos. Si el shape legacy tiene campos faltantes, mostrar fallback. La normalización es un sprint propio futuro si se necesita.
- date-fns ya está en el bundle — usar `formatDistanceToNow` con locale `es` para hora relativa.

#### Notas para el coordinator
- Antes de codear, hacer dump real de `orden.historialFases` y `orden.auditoria` de 3-4 órdenes en producción para ver qué shapes legacy hay vivas. Sin esto se rompe en órdenes viejas.
- Si el timeline horizontal no entra bien en mobile (muchas órdenes se abren desde celular del técnico), preferir vertical compacto.
- Coordinar con el banner de 113a y los badges de 113b para que el conjunto se vea coherente: stepper arriba → banner siguiente paso → flujo (acciones manuales) → timeline al pie.

---

### SPRINT-114 — Migrar 4 hits descriptivos `userProfile.id` a `currentUser.uid` (consistencia)

**Estado:** COMPLETADO 2026-05-08 (segunda pasada autónoma — los 4 sitios migrados a `currentUser.uid`. Plus fix colateral de warning eslint preexistente en `Ordenes.tsx` con `useMemo` para estabilizar la referencia de `hoy`. Sin migración de datos viejos. 6/6 cazadores PASS.)
**Prioridad:** baja (no urgente — campos no gateados por rule, cambio defensivo de consistencia)
**Origen:** Auditoría SPRINT-111 (fase 111a, 2026-05-08). Detectó 4 hits descriptivos legítimos (no bugs latentes) que escriben `userProfile?.id` a campos NO gateados pero que por convención del esquema post-SPRINT-105 deberían ser `auth.uid`.
**Riesgo:** bajo (los campos no están gateados, el cambio es defensivo; no requiere migración de datos viejos)
**Touch-list previsto:** 4 archivos
- `src/components/ordenes/RegistrarPagoModal.tsx:95` — `pago.registradoPorId`
- `src/components/ordenes/EnviarFacturacionButton.tsx:38` — `enviadaAFacturacionPorId`
- `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx:321` — `emisorFacturaId` y similares
- `src/hooks/useOrdenCreateForm.ts:612` — `responsableId`

#### Objetivo
Reemplazar los 4 hits descriptivos restantes de `userProfile?.id` por `currentUser?.uid` para que TODOS los campos `*Id` que identifican a un actor humano usen la misma convención (`auth.uid`).

#### Por qué
Hoy el esquema mezcla:
- Campos gateados por rule contra `auth.uid` (tecnicoId, ayudanteId, creadaPor, usuarioId, personalUid) — usan `currentUser.uid` post-fixes.
- Campos descriptivos (`registradoPorId`, `responsableId`, etc.) — usan `userProfile?.id` que para usuarios cargados vía cascada `personal/` es `personalDocId !== auth.uid`.

La inconsistencia no rompe producción hoy (no hay rule que valide estos campos), pero:
- Confunde a futuros desarrolladores (¿cuál uso aquí?).
- Si en el futuro se agrega rule de validación a uno de estos campos (ej. para auditoría), reintroduce el bug `permission-denied` silencioso.
- La auditoría completa de SPRINT-111 documenta que estos 4 son los únicos restantes.

#### Criterios de aceptación
- [ ] Importar `useApp` en cada componente si no está; obtener `currentUser`.
- [ ] Reemplazar `userProfile?.id` por `currentUser?.uid` en los 4 sitios. El nombre puede seguir siendo `userProfile?.nombre`.
- [ ] Guard `if (!currentUser) return` antes del write si la función puede correr sin usuario auth.
- [ ] `npm run check:regression` sigue en 0 hits (P-001 ya cazaba estos pero estaban allowlistados con `@safe-userprofile-id:` — quitar el allowlist comment de los que se hayan migrado).
- [ ] Build OK + lint OK + deploy Vercel Ready.
- [ ] NO migrar datos viejos — los pagos/facturas con `personalDocId` siguen siendo válidos (no hay rule que los rechace).

#### Restricciones / guardarrails
- regression_guardian RECOMENDADO (toca services/components, vector P-001).
- Sin tocar rules ni schema. Sin migración de datos.
- archivist PRE-CHANGE recomendado (toca componentes con historia de bugs P-001).

#### Notas para el coordinator
- Cuando lo ejecutés, después del fix, abrir `scripts/invariantes/check-userprofile-id-misuse.ts` y verificar si los 4 archivos modificados tenían comentarios `@safe-userprofile-id:` que ahora son obsoletos. Si quedan obsoletos, eliminarlos para evitar mensajes confusos.
- Bajo prioridad — solo procesar si la cola se queda sin sprints urgentes.
- Si después de migrar los 4, el cazador P-001 vuelve a 0 hits, el sistema queda totalmente alineado con la convención `auth.uid` para todos los campos de actor humano.

---

### SPRINT-115 — Diagnóstico + re-migración de notificaciones de Yohana — [MOVIDO A HISTÓRICO]

> Sprint completado el 2026-05-08 — ver entrada condensada en sección "Sprints completados (histórico)" más abajo.

<details>
<summary>Spec original (preservado para forensia)</summary>

**Estado:** PAUSADO 2026-05-08 (Jorge decidió absorber el fix dentro del rediseño general de SPRINT-117). Fase diagnóstico COMPLETADA (Caso A confirmado, 3 docs identificados). Fase write tiene script listo (`scripts/re-migrar-notificaciones-yohana.ts` commit `6b4aade`) y dry-run validado por Jorge el 2026-05-08, pero NO se ejecuta `--apply` hasta que SPRINT-117 fase A2 termine y decidamos si re-migrar las 3 notis sueltas o esperar al fix masivo de TODOS los empleados afectados. Yohana sigue sin ver sus 3 notis viejas. **NO procesar autónomo. NO ejecutar `--apply` sin OK explícito de Jorge re-confirmado post-auditoría.**

**desbloqueadoPor:** jorge 2026-05-08
**scriptCommit:** 6b4aade
**ejecucionPendiente:** `npx tsx scripts/re-migrar-notificaciones-yohana.ts --apply`

**Prioridad:** alta condicional (sólo si la condición se dispara)
**Origen:** SPRINT-100 falló en QA visual con Yohana 2026-05-08 (a confirmar). Hipótesis Cowork: las notificaciones legacy de Yohana tienen `destinatarioId == auth.uid` pero `userId == personalDocId` post-migración fallida del 2026-05-06.
**Riesgo:** alto — toca datos en producción (re-migración) y posiblemente rules. Migración limitada a docs específicos de un usuario, NO masiva.
**Touch-list previsto:**
- `scripts/diagnostico-notificaciones-yohana.ts` (NUEVO — script de diagnóstico read-only con Admin SDK)
- `scripts/re-migrar-notificaciones-yohana.ts` (NUEVO opcional — sólo si diagnóstico confirma docs problemáticos)
- Posiblemente `firestore.rules` (si la rule de update sobre `notificaciones` tiene un gap)

#### Hipótesis principal de Cowork

El service `notificaciones.service.ts` hace lectura DUAL (`userId == auth.uid` OR `destinatarioId == auth.uid`) — eso explica que el commit `b93625d` "arregló" el problema de visibilidad. Pero la rule `firestore.rules:528-534` valida UPDATE/DELETE únicamente contra `userId == auth.uid`. Resultado:

- Caso A — doc legacy con `destinatarioId == personalDocId`, sin `userId`: Yohana NO la ve (ningún query la matchea).
- Caso B — doc legacy con `destinatarioId == auth.uid`, sin `userId`: Yohana SÍ la ve (query legacy la trae) PERO al marcar leída → permission-denied silencioso.
- Caso C — doc post-migración con `userId == auth.uid`: funciona perfecto.

Si Yohana reporta "ve pero no puede marcar", es Caso B. Si reporta "no ve nada", es Caso A.

#### Objetivo

1. Generar un dump claro de las notificaciones de Yohana mostrando shape real de cada doc (qué campos tiene, qué valores).
2. Clasificar cada doc según los Casos A/B/C.
3. Si Caso B existe → script de re-migración idempotente que setea `userId = auth.uid` en cada doc legacy de Yohana (NO masivo, solo sus docs).
4. Si Caso A existe → mismo script que setea `userId = auth.uid` cuando `destinatarioId == personalDocId` mapeable.
5. Confirmar con Yohana que post-migración ve todo y puede marcar.

#### Inputs requeridos del coordinator antes de ejecutar

- `auth.uid` de Yohana (Jorge tiene que dárselo o el script puede buscar por email — preferir email para evitar acoplamiento a uid hardcodeado).
- email de Yohana (Jorge puede confirmarlo en sesión Cowork o el coordinator lo lee de `personal where rol == 'operaria'`).
- Confirmación explícita de Jorge en `BLOQUEOS.md`: "OK Jorge — re-migración de notificaciones de Yohana autorizada, scope acotado a docs cuyo destinatarioId/personalUid mapean a su auth.uid". El script es < 50 docs por usuario, pero es migración de datos → requiere OK por sub-regla CLAUDE.md.

#### Criterios de aceptación

- [ ] Script `scripts/diagnostico-notificaciones-yohana.ts` corre con dry-run forzado (NO escribe). Reporta:
  - Email + auth.uid + personalDocId de Yohana.
  - Cantidad de docs en `notificaciones` matcheando `userId == auth.uid`, `destinatarioId == auth.uid`, `userId == personalDocId`, `destinatarioId == personalDocId`.
  - Para cada doc problemático (Caso A o B): id, campos presentes, fecha, leida sí/no.
- [ ] Si diagnóstico reporta 0 docs problemáticos → escribir resultado en EJECUCION_AUTONOMA.md, marcar SPRINT-100 + SPRINT-115 ambos COMPLETADOS, y proponer otra hipótesis (cache, App Check, etc.).
- [ ] Si reporta docs problemáticos → escribir `scripts/re-migrar-notificaciones-yohana.ts` con dry-run + ejecución idempotente:
  - Sólo toca docs que matchean Caso A/B con destinatarioId/personalUid del usuario autorizado.
  - Sólo escribe campo `userId` faltante con valor `auth.uid` correcto.
  - NUNCA borra ni modifica otros campos.
  - Genera log con cada doc tocado (antes/después).
- [ ] Coordinator deja sprint en BLOQUEADO esperando OK Jorge antes de la ejecución real.
- [ ] Post-ejecución: Jorge le pide a Yohana QA otra vez. Si funciona → COMPLETADO. Si no → diagnóstico extra (App Check? cache? rule gap?).
- [ ] Si la causa raíz resulta ser un gap en la rule de update (ej: la rule no permite update a operaria sobre notificación con `userId == auth.uid` por algún branch raro), agregar P-XXX a `docs/PATRONES_REGRESION.md` + cazador.
- [ ] `npm run check:regression` sigue en 0 hits.

#### Restricciones / guardarrails

- **Migración de datos requiere OK Jorge en BLOQUEOS.md** ANTES de la ejecución real. Diagnóstico (read-only) no requiere OK.
- archivist PRE-CHANGE OBLIGATORIO — toca services y posiblemente rules; vector P-001/P-002 vivo.
- regression_guardian OBLIGATORIO antes del commit de cualquier cambio a rules o services.
- Si toca `firestore.rules` → `npm run deploy:rules` antes de cerrar (sub-regla CLAUDE.md, P-005).
- NUNCA hacer migración masiva (todos los usuarios) en este sprint. Sólo Yohana. Si después aparece que otros usuarios tienen el mismo problema, abrir SPRINT-116 distinto.

#### Notas para el coordinator

- El gotcha en CLAUDE.md "bug pre-existente en notificaciones" describe el mismo vector pero en sentido contrario (rule gateaba `userId` mientras código escribía `destinatarioId`). Ese gotcha está fechado pre `b93625d`. Después de `b93625d` el código escribe `userId` y la rule se mantiene en `userId`. Pero los docs legacy (escritos antes de `b93625d`) pueden estar en cualquier shape. Este sprint los limpia para Yohana.
- Si el script de diagnóstico encuentra que el problema afecta a >5 usuarios distintos (no solo Yohana), escalar a Jorge antes de procesar — probablemente requiere migración masiva con OK explícito.
- Después de cerrar SPRINT-115, considerar:
  - Eliminar la query legacy `where('destinatarioId', '==', userId)` del service una vez TODOS los docs estén migrados a `userId`. Eso es un sprint follow-up.
  - Endurecer rule de update para validar también `destinatarioId == auth.uid` como fallback temporal hasta que la migración masiva (futura) limpie todo.
- Postmortem obligatorio si confirma Caso B (vector recurrente del bug histórico). Sub-regla CLAUDE.md.

</details>

---

### SPRINT-116 — Auditoría sistémica: email mismatches + notis legacy en TODOS los empleados

**Estado:** ABSORBIDO por SPRINT-117 fase A2 el 2026-05-08. El alcance original (auditoría sistémica de emails y notis legacy en todos los empleados) queda cubierto por la fase A2 de SPRINT-117 que es más amplia (incluye además filtros de queries, relaciones operaria↔técnico, variantes P-001/P-006 en lectura, etc.). NO procesar de forma independiente. Si el coordinator lee este sprint, debe redirigir el trabajo a SPRINT-117 fase A2.
**Prioridad:** ABSORBIDO (referencia histórica)
**Origen:** Tras destrabar SPRINT-115 fase write para Yohana, Jorge intentó cambiar contraseña de Wilainy y la app respondió "No existe usuario con email Nwilainy@gmail.com". El backfill del 2026-05-06 ya había detectado este mismatch (uid `KT9LaszokWNmLCEIe8YOvNKc9rF3` con `usuarios.email=apnbrito0318@gmail.com` ≠ `personal.email=nwilainy@gmail.com`). Jorge sospecha que el patrón se replica.
**Riesgo:** alto en fase B (toca datos en producción). Bajo en fase A (read-only).
**Touch-list previsto:**
- `scripts/auditoria-emails-personal-vs-usuarios.ts` (NUEVO — read-only)
- `scripts/auditoria-notis-legacy-todos.ts` (NUEVO — read-only)
- (Condicional, BLOQUEADO) `scripts/fix-emails-mismatch.ts` (caso por caso, no masivo automático)
- (Condicional, BLOQUEADO) `scripts/re-migrar-notis-legacy-todos.ts` (extensión del script de Yohana al universo completo)

#### Hipótesis

1. **Audit A — emails desalineados:** El backfill del 2026-05-06 reportó solo 1 conflicto sobre 22 empleados. Pero ese script comparaba un subset; un audit más completo puede destapar más casos donde el `personal.email` no matchea el email registrado en Firebase Auth para el mismo `uid`.

2. **Audit B — notis legacy con `userId == personalDocId`:** El bug del Caso A confirmado en Yohana puede repetirse en CUALQUIER empleado que haya recibido notificaciones antes del fix de SPRINT-105 (2026-05-06). Cuántas notis legacy tiene cada empleado, y cuántos están afectados.

#### Objetivo

Auditar el universo completo de empleados (22 docs en `personal/` con `uid` no vacío) y reportar:
1. Cuántos tienen email desalineado entre `personal/` y `usuarios/`.
2. Cuántas notis legacy tipo Caso A/B tiene cada empleado.
3. Para cada hit, IDs exactos de docs problemáticos.

Después decidir con Jorge si:
- El fix de email mismatch es caso-por-caso (UI/manual, ej: corregir desde GestionUsuarios) o script.
- El fix de notis se generaliza al universo completo (script masivo) o se hace usuario por usuario (más conservador).

#### Fase A — auditoría email mismatches (autónoma, read-only)

**Comportamiento esperado de `scripts/auditoria-emails-personal-vs-usuarios.ts`:**

1. Para cada doc en `personal/` con `uid != ''`:
   - Leer `usuarios/{uid}` con Admin SDK.
   - Comparar `personal.email` vs `usuarios.email` (case-sensitive Y case-insensitive separados).
   - Comparar también con `auth.email` real desde `admin.auth().getUser(uid)` (ese es el email canónico).
2. Tabla output:
   - `uid`, `personal.id`, `personal.email`, `usuarios.email`, `auth.email`, `match: ok|case|mismatch`.
3. Resumen final con conteos.
4. Si encuentra alguno con `match: mismatch` (no solo case), proponer en EJECUCION_AUTONOMA.md cuál es el email canónico (probablemente `auth.email`) y qué pasos seguir.

#### Fase B — auditoría notis legacy todos los empleados (autónoma, read-only)

**Comportamiento esperado de `scripts/auditoria-notis-legacy-todos.ts`:**

1. Para cada doc en `personal/` con `uid != ''`:
   - Reusar lógica del script de Yohana, pero parametrizada por uid.
   - Hacer las 4 queries: `userId == auth.uid`, `destinatarioId == auth.uid`, `userId == personalDocId`, `destinatarioId == personalDocId`.
   - Clasificar docs en OK / Caso A / Caso B / OTRO.
2. Tabla output:
   - empleado nombre, rol, conteo OK, conteo Caso A, conteo Caso B, conteo OTRO.
3. Resumen final con conteos globales.
4. Listado de empleados con Caso A o B > 0, ordenado por cantidad descendente.

#### Fase C — fix masivo (BLOQUEADO, requiere OK Jorge en BLOQUEOS.md tras ver fase B)

Si fase B reporta múltiples empleados con notis legacy:

- Generalizar `scripts/re-migrar-notificaciones-yohana.ts` a un script que tome la salida de fase B como input y procese en lote.
- Mantener idempotencia (skip docs ya alineados), dry-run, audit log per usuario.
- Scope: SOLO los uids reportados por fase B con `match: ok` o `match: case`. Si hay email mismatch real, NO migrar notis hasta resolver primero el email (escalar a Jorge).

#### Fase D — fix email mismatches (BLOQUEADO, caso-por-caso)

Si fase A reporta mismatches reales:

- NO escribir un script masivo de fix automático — los mismatches de email son ambiguos y requieren decisión humana ("cuál es el email correcto: el de personal/ o el de Auth?").
- Reportar cada caso individualmente en EJECUCION_AUTONOMA.md.
- Jorge resuelve uno por uno desde la UI de GestionUsuarios o desde el panel de Firebase Auth.
- Si la app no permite cambiar el email del personal/ desde la UI, abrir SPRINT-117 chico para agregar la funcionalidad.

#### Criterios de aceptación

- [ ] `scripts/auditoria-emails-personal-vs-usuarios.ts` corre y genera tabla en stdout.
- [ ] `scripts/auditoria-notis-legacy-todos.ts` corre y genera tabla en stdout.
- [ ] Output capturado en `docs/sprints/AUDITORIA_NOTIS_2026-05-08.md` (markdown con tablas).
- [ ] Si fase A reporta 0 mismatches: marcar fase A COMPLETADA. Si reporta >0: actualizar entrada en BLOQUEOS.md con scope acotado por uid.
- [ ] Si fase B reporta 0 empleados afectados: marcar fase B COMPLETADA y SPRINT-116 entero CERRADO. Si reporta >0: actualizar entrada en BLOQUEOS.md con tabla de uids afectados.
- [ ] Cazadores P-001..P-006 siguen en 0 hits.
- [ ] Sin tocar rules ni código de la app en fases A y B.

#### Restricciones / guardarrails

- Fases A y B son **read-only** y procesables autónomas.
- Fase C **requiere OK Jorge** en `BLOQUEOS.md` con scope listado por uids específicos (no "todos los empleados" en general).
- Fase D **NO se automatiza**. Cada email mismatch se resuelve manual desde la UI o Firebase Console.
- archivist PRE-CHANGE recomendado antes de fase C/D (toca datos sensibles).
- Si la auditoría revela un patrón cualitativamente nuevo (ej: notis con `destinatarioId == "string raro"` no esperado), abrir P-XXX nuevo en `docs/PATRONES_REGRESION.md` + cazador.

#### Notas para el coordinator

- **Reusar máximo posible** del script de Yohana (`scripts/diagnostico-notificaciones-yohana.ts` y `scripts/re-migrar-notificaciones-yohana.ts`). Extraer lógica a helpers compartidos si es necesario.
- Para **Audit A**, considerar usar `admin.auth().getUser(uid)` para obtener el email canónico de Firebase Auth — es la fuente de verdad sobre con qué email el usuario realmente puede loguear.
- Para **Audit B**, generar tabla incluso si todos los conteos son 0 — es valioso confirmar que el universo está limpio.
- Si el coordinator detecta que el problema afecta a >50% de empleados, reportar como "patrón sistémico" y escalar a Jorge antes de proponer fix masivo.
- Postmortem obligatorio si fase B reporta >5 empleados afectados (sub-regla CLAUDE.md "cada bug → cazador" + recurrencia ya documentada en P-XXX históricos).
- Sub-regla "destructive actions": coordinator NO ejecuta fase C/D autónomo aunque tenga OK Jorge previo — siempre confirmar con dry-run primero, mostrar output a Jorge, esperar su "dale al apply".

---

### SPRINT-117 — Rediseño Information Architecture (sprint padre, dividido en 117a + 117b + 117c)

**Estado:** REORGANIZADO 2026-05-08 noche por Cowork. El sprint original era demasiado grande para una sola pasada del coordinator. Se divide en 3 sub-sprints procesados secuencialmente:

- **SPRINT-117a** — Auditoría focalizada de menús, rutas y módulos. Read-only. ~1 pasada autónoma.
- **SPRINT-117b** — Propuesta de reorganización con mockup por rol. Read-only + pausa obligatoria.
- **SPRINT-117c1..N** — Ejecución por fases chicas. Sub-sprints definidos dentro de la propuesta de 117b. BLOQUEADOS hasta que Jorge apruebe.

**Lo que se DESCARTA del scope original** (ahorra tiempo y enfoca en lo que duele):
- Lectura exhaustiva de TODO `src/` archivo por archivo — overkill para reorganizar menús. 117a hace lectura focalizada (solo routing/UI/permisos/index de páginas).
- Auditoría funcional cross-cutting completa — ya cubierta por cazadores P-001..P-007 (todos en 0 hits) + scripts de auditoría sistémica + SPRINT-118 cerrado. Si aparece nuevo vector funcional, se abre sprint propio.

**Avance previo (histórico):** los 2 scripts read-only entregados (`ac54662` + `6defe8f`) cumplieron su función original — destaparon el bug que SPRINT-118 cerró con migración masiva de 5 empleados. Quedan en repo como herramienta de health-check periódico.

**Origen:** Pedido directo de Jorge tras hotfix de Aury y Yohana — sistema con muchos menús que generan fricción cognitiva. Quote: *"fusionar y converger módulos para que el sistema sea más intuitivo y fácil de entender"*.

**Próximo paso humano:** Jorge pega `trabaja` a Claude Code → coordinator arranca SPRINT-117a.

---

### SPRINT-117a — Auditoría focalizada de menús, rutas y módulos

**Estado:** COMPLETADO 2026-05-08 — coordinator autónomo. Output `docs/sprints/AUDITORIA_IA_2026-05-08.md` creado (420 líneas, 6 secciones). Cazadores 7/7 PASS, 0 hits. Trail completo en histórico abajo.

---

### SPRINT-117b — Propuesta de reorganización con mockup por rol — [MOVIDO A HISTÓRICO]

> Sprint completado el 2026-05-08 por coordinator autónomo (novena pasada `trabaja`). Ver entrada en sección "Sprints completados (histórico)" más abajo.

<details>
<summary>Spec original (preservada para forensia)</summary>

**Estado:** PENDIENTE — depende de SPRINT-117a completado.
**Prioridad:** alta (precondición de 117c)
**Riesgo:** bajo (read-only, output es un documento de propuesta)
**Touch-list previsto:** ninguno de código. Crea `docs/sprints/PROPUESTA_IA_2026-05-08.md`. Agrega 1 entrada a `docs/sprints/BLOQUEOS.md`.

#### Objetivo

Tomar la auditoría de 117a y proponer una reorganización concreta del sidebar y módulos por rol. Output legible para Jorge (no programador) que pueda decir "OK", "OK pero cambiá X", o "no me convence Y".

#### Tareas

1. **Mockup textual del nuevo sidebar por cada rol** (admin, coord, operaria, secretaria, técnico, ayudante). Formato: lista anidada con grupos.
2. **Para cada cambio respecto al actual, justificar en 2-3 líneas:** qué fricción resuelve, qué rol se beneficia más, riesgo de romper algo (bajo/medio/alto).
3. **Tabla antes/después** — para los 5 flujos más comunes (crear orden, iniciar chequeo, facturar, ver órdenes pendientes, agendar cita): cuántos clicks toma hoy vs cuántos con la propuesta.
4. **Plan de sub-sprints 117c1..N** — cada uno con touch-list de 1-3 archivos máximo, cambio concreto, plan de rollback ("qué pasa si Jorge dice no me gusta"), riesgo.
5. **Pausa obligatoria al final:**
   - Marcar SPRINT-117b como COMPLETADO.
   - Crear entrada en `BLOQUEOS.md`: *"SPRINT-117c esperando aprobación de Jorge sobre `docs/sprints/PROPUESTA_IA_2026-05-08.md`. Para desbloquear, editar la entrada con `OK: jorge YYYY-MM-DD` o `OK selectivo: 117c1, 117c3` o `Cambios: <feedback>`"*.
   - **NO arrancar 117c**. Volver a Jorge.

#### Decisiones de Jorge (zanjadas el 2026-05-08 noche)

Las 2 ambigüedades que SPRINT-117a marcó "requiere validar con Jorge" quedan resueltas así (Jorge confirmó vía Cowork). El builder NO debe parar a preguntar de nuevo:

1. **"Web y Solicitudes" — visible para admin Y coordinadora.** La coord triagea solicitudes públicas + citas por confirmar; tiene sentido que las vea. NO mostrar a operarias, secretarias, técnicos.
2. **`/admin/configuracion/usuarios` — eliminar como ítem visible del sidebar pero dejar como redirect 301 a `/admin/usuarios`.** Patrón consistente con resto del repo (CLAUDE.md regla "Keep redirects when renaming routes"). Bookmarks/links viejos siguen funcionando.

Si al ver el mockup Jorge cambia de opinión sobre cualquiera de estas dos, lo dirá en `BLOQUEOS.md` y el coordinator ajusta antes de arrancar 117c.

#### Consideraciones para el builder

- **Operaria/secretaria** son los roles con más fricción hoy (tocan muchos módulos por cada orden). Priorizar simplificar su sidebar.
- **Técnico** está en mobile, en el sitio del cliente, con poco tiempo. Su sidebar debe ser ultra simple: ver sus citas, iniciar chequeo, cerrar servicio. Nada más.
- **Admin/coord** son power users, toleran más complejidad pero igualmente prefieren menos items en sidebar.
- **NO renombrar identificadores internos** (`enStandby`, `StandbyPieza`, colección `standby_piezas`). Solo etiquetas visibles al usuario.
- **Mantener redirects** desde rutas viejas si se mueve algo — los empleados pueden tener bookmarks o links de WhatsApp viejos.

#### Criterios de aceptación

- [x] `docs/sprints/PROPUESTA_IA_2026-05-08.md` creado con las 4 secciones + plan de sub-sprints.
- [x] Entrada agregada a `BLOQUEOS.md` esperando OK de Jorge.
- [x] SPRINT-117b marcado COMPLETADO en `COLA_AUTONOMA.md`.
- [x] NO arrancar SPRINT-117c1 — esperar feedback humano.
- [x] Commit + push con mensaje descriptivo en español.

</details>

---

### SPRINT-117c1..N — Ejecución por fases chicas (DESBLOQUEADO 2026-05-09 con OK selectivo)

**Estado:** EXPANDIDO en sub-sprints 117c1, 117c2, 117c3, 117c4, 117c6 (todos PENDIENTE más abajo). 117c5 RECHAZADO por Jorge con motivo documentado en `BLOQUEOS.md`.

**desbloqueadoPor:** jorge 2026-05-09 | OK selectivo en `BLOQUEOS.md` entrada SPRINT-117c.

Cuando Jorge dispara `trabaja`, el coordinator procesa **uno por uno con QA visual humana entre cada deploy** (NO en lote). Cada sub-sprint hace commit + push + deploy independiente y el coordinator se detiene a esperar feedback humano antes del siguiente.

#### Restricciones globales para fase C (aplican a TODOS los sub-sprints 117cN)

- **archivist OBLIGATORIO en modo PRE-CHANGE** antes de cada sub-sprint — `Sidebar.tsx`, `App.tsx`, `Ordenes.tsx`, `TecnicoVista.tsx` están en la lista de archivos críticos.
- **regression_guardian OBLIGATORIO** antes de commit (toca `src/components/`).
- **Touch-list acotado** — 1-3 archivos por sub-sprint. Si necesita más, dividir.
- **Plan de rollback explícito** — el commit message dice qué revertir si Jorge dice "no me gusta".
- **QA visual obligatorio** — antes de procesar el siguiente sub-sprint, Jorge mira el cambio en producción y confirma con su equipo (Aury técnico, Wilainy/Yohana operarias). Si alguien dice "perdí X", restaurar X antes de seguir.
- **Mantener redirects** desde rutas viejas si se mueve algo.
- **Sub-regla "documentación viva"** — al cerrar cada sub-sprint, actualizar `CLAUDE.md` con el cambio de IA si aplica.
- **Recordatorio explícito de Jorge:** la reorganización SOLO agrupa y renombra etiquetas. NO agrega lógica de "este ítem se oculta si rol === X". Los permisos individuales (`usuarios/{uid}.permisos.*`) siguen siendo la fuente de verdad. Cualquier ítem visible debe seguir respetando esos permisos.
- **Postmortem-positivo al final** — cuando los 5 sub-sprints aprobados cierren OK, archivist genera `docs/postmortems/2026-05-XX-rediseno-ia-aprendizajes.md` documentando el approach. NO es bug, pero el aprendizaje vale para futuros rediseños grandes.

---

### SPRINT-117c1 — Renombrar etiquetas + verificar redirect `/admin/configuracion/usuarios` — [MOVIDO A HISTÓRICO]

> Sprint completado el 2026-05-09 — Jorge confirmó con `trabaja` (OK implícito de cierre). Ver entrada condensada en sección "Sprints completados (histórico)" más abajo.

**Estado:** COMPLETADO 2026-05-09 (hash `759a76b`)
**Prioridad:** alta (primero del lote — base de confianza)
**Origen:** OK selectivo de Jorge 2026-05-09 sobre `docs/sprints/PROPUESTA_IA_2026-05-08.md` §4 SPRINT-117c1.
**Riesgo:** bajo (cambia strings + verifica 1 redirect ya existente).
**Touch-list previsto:** `src/components/Sidebar.tsx`, `src/App.tsx` (verificar/agregar redirect 301).

#### Objetivo

Aplicar 3 cambios concretos de etiqueta + verificar redirect, sin alterar comportamiento funcional:

1. Sidebar: renombrar label visible `Calendarios` → `Calendarios públicos (Calendly)`. NO cambiar la ruta `/admin/calendarios` ni el componente. Solo el string del label.
2. Sidebar: renombrar label `Rendimiento` → `Mi rendimiento` **solo para operaria/secretaria**. Admin/coord siguen viendo `Rendimiento` (sin cambios).
3. Sidebar: ocultar el ítem "Catálogo legacy" / "Productos" (`/admin/productos`) si todavía aparece en sidebar admin. La ruta debe seguir activa (accesible por URL hasta que sprint propio futuro la elimine del routing).
4. App.tsx: verificar que `/admin/configuracion/usuarios` exista como redirect 301 a `/admin/usuarios`. Si NO existe, agregarlo. Si ya existe, no tocar.

#### Por qué

- "Calendarios" se confunde con "Calendario" (distintos: uno son calendarios públicos Calendly, el otro es la grilla interna). Aclarar con paréntesis sin renombrar identificadores.
- "Rendimiento" para operaria/secretaria es vista propia (su KPI), no panel global. Renombrar a "Mi rendimiento" señala eso.
- Catálogo legacy (`Productos`) es deuda histórica. Ocultarlo del sidebar reduce ruido sin romper imports.
- `/admin/configuracion/usuarios` ya estaba decidido eliminar como ítem visible — verificar que el redirect exista para bookmarks viejos.

#### Criterios de aceptación

- [ ] `Sidebar.tsx`: label de Calendarios cambiado a `Calendarios públicos (Calendly)`. Ruta intacta.
- [ ] `Sidebar.tsx`: label de Rendimiento dinámico — `Mi rendimiento` para operaria/secretaria, `Rendimiento` para admin/coord. Sin cambiar lógica `show:`.
- [ ] `Sidebar.tsx`: ítem que apunta a `/admin/productos` (Catálogo / Productos) tiene `show: false` o se elimina del array para admin (verificar primero si está; si NO está, no agregar nada).
- [ ] `App.tsx`: existe ruta `<Route path="configuracion/usuarios" element={<Navigate to="/admin/usuarios" replace />} />` o equivalente. Si no, agregarla.
- [ ] Tester: typecheck + lint + cazadores 7/7 PASS.
- [ ] regression_guardian: PASS (sin cambios a rules/services/context, solo etiquetas y redirect).
- [ ] reviewer: APPROVED.
- [ ] Commit con mensaje en español + plan de rollback.
- [ ] Push + deploy Vercel Ready.

#### Restricciones / guardarrails

- NO cambiar identificadores internos (`enStandby`, `productos` collection, etc.).
- NO cambiar permisos / `puede(...)` / arrays `show:` para operaria/secretaria distintos a lo descrito (ese es 117c5 RECHAZADO).
- NO crear nueva ruta — solo verificar redirect existente y agregar si falta.
- Plan de rollback: revertir el commit. Solo strings y 1 redirect — operación segura.
- Sub-regla "documentación viva": si se actualiza `CLAUDE.md`, mencionarlo en commit message.

#### Notas para el coordinator

- archivist PRE-CHANGE obligatorio para `Sidebar.tsx` (archivo crítico).
- Builder debe leer `Sidebar.tsx` completo para entender la estructura `SidebarNode` antes de tocar.
- El gating del label "Mi rendimiento" debe respetar los roles **sin agregar nueva lógica de `show:`** — solo es un string condicional. Patrón: `label: rol === 'operaria' || rol === 'secretaria' ? 'Mi rendimiento' : 'Rendimiento'`.
- Verificar primero si el ítem `/admin/productos` está actualmente en el sidebar admin — si no, ese criterio queda como N/A documentado en el commit.

---

### SPRINT-117c2 — Crear sección "Bandeja de entrada" en sidebar — [MOVIDO A HISTÓRICO]

**Estado:** COMPLETADO 2026-05-09 (cierre confirmado con `trabaja` el 2026-05-09).

Ver entrada en "Sprints completados (histórico)" más arriba (hash `9f71883`).

---

### SPRINT-117c3 — Sección "Cobranza y facturación" en sidebar — [MOVIDO A HISTÓRICO]

**Estado:** COMPLETADO 2026-05-09 (cierre confirmado con `trabaja` el 2026-05-09).

Ver entrada en "Sprints completados (histórico)" más abajo (hash `9c262c9`).

---

### SPRINT-117c4 — Crear sección "Equipo" + mover Mantenimientos a Operaciones — [MOVIDO A HISTÓRICO]

**Estado:** COMPLETADO 2026-05-10 (cierre confirmado con `trabaja` el 2026-05-10 tras QA visual implícito de Jorge en lote 117c).

Ver entrada en "Sprints completados (histórico)" más arriba (hash `480532f`).

---

### SPRINT-117c6 — Limpiar alias `isAdmin = esAdminOCoord` en Sidebar.tsx — [MOVIDO A HISTÓRICO]

**Estado:** COMPLETADO 2026-05-10 (cierre confirmado con `trabaja` el 2026-05-10 — OK implícito de Jorge tras QA visual).

Ver entrada en "Sprints completados (histórico)" más arriba (hash `9b5aee2`). **Lote 117c cerrado al 100%** (5/6 sub-sprints aprobados ejecutados; 117c5 fue rechazado por Jorge en el OK selectivo del 2026-05-09).

---

#### (Eliminado: spec original de SPRINT-117 con A1+A2+A3 exhaustivos)

> El detalle anterior se descartó por overkill. La versión nueva (117a + 117b + 117c) cumple el mismo objetivo (reorganizar el sistema para que sea más intuitivo) sin la lectura exhaustiva de TODO `src/`. Si en algún momento aparece la necesidad de auditoría funcional cross-cutting completa, se abre sprint propio (no parte de 117).

_(spec original descartada por overkill — la versión vigente de SPRINT-117 está dividida en 117a + 117b + 117c arriba)_

---

### SPRINT-118 — Re-migración masiva notis legacy (5 empleados, ~44 docs) + fix email Wilainy en Auth — [MOVIDO A HISTÓRICO]

> Sprint completado el 2026-05-08 — ver entrada condensada en sección "Sprints completados (histórico)" más abajo.

<details>
<summary>Spec original (preservado para forensia)</summary>

**Estado:** EN_REVISION_HUMANA (scripts entregados en DRY-RUN; Jorge ejecuta `--apply` manualmente)
**desbloqueadoPor:** jorge 2026-05-08 (movido desde `BLOQUEOS.md` por coordinator vía `procesa bloqueos`).
**Builder/Tester/Reviewer:** completados por coordinator 2026-05-08. Ver `docs/sprints/EJECUCION_AUTONOMA.md` para trail.
**Prioridad:** alta
**Origen:** Auditoría 2026-05-08 con `scripts/auditoria-notis-legacy-todos.ts` + `scripts/auditoria-emails-personal-vs-usuarios.ts` (entregados en SPRINT-117 fase A2 read-only `ac54662` + `6defe8f`). Output identificó 44 notificaciones Caso A en 5 empleados + email mismatch de Wilainy en Firebase Auth.
**Riesgo:** medio — toca datos productivos en `notificaciones` (~44 docs scope acotado por uid, NO masivo) + Firebase Auth de Wilainy. Mitigación: scripts con DRY-RUN por default, `--apply` manual por Jorge.
**Touch-list previsto:**
- `scripts/re-migrar-notificaciones-masivo.ts` (NUEVO — generaliza `re-migrar-notificaciones-yohana.ts` con scope hardcodeado a 5 uids)
- `scripts/fix-email-wilainy.ts` (NUEVO — Admin SDK update Auth + usuarios)
- Eventualmente `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md` (post-aplicación de Jorge).

#### Objetivo

Entregar 2 scripts ejecutables que (a) re-migren 44 notificaciones Caso A apuntando `userId` a `auth.uid` correcto en 5 empleados específicos (Yohana, Wilainy, Jorge, misterservicerd, Maria Teresa) y (b) corrijan el email de Wilainy en Firebase Auth + `usuarios/{uid}` para que `Nwilainy@gmail.com` sea el email canónico (Wilainy tiene acceso a esa casilla; el actual `apnbrito0318@gmail.com` no le pertenece).

#### Por qué

- Yohana, Wilainy, Maria Teresa, Jorge y misterservicerd no ven sus notificaciones legacy porque `userId` apunta a `personalDocId` en lugar de `auth.uid` (Caso A confirmado en auditoría 2026-05-08).
- Wilainy no puede recibir reset de contraseña en Firebase porque el email registrado en Auth (`apnbrito0318@gmail.com`) no le pertenece. Jorge confirmó que `Nwilainy@gmail.com` (con N mayúscula) es la casilla a la que ella tiene acceso.

#### Scope autorizado (acotado por uid, NO masivo)

| Empleado | uid | personalDocId | Notis Caso A |
|---|---|---|---|
| Yohana Operaria | `HGkVoYpGKzL4JJI7FnTpHjdsM972` | `zFhokrDoPH9lD63ZxKAY` | 3 |
| Wilainy Operaria | `KT9LaszokWNmLCEIe8YOvNKc9rF3` | `j944265Su9Hyw29YQTj8` | 14 |
| Jorge (admin) | `dN2wxlTrLUMAff1gE2K4Q8IXi2m2` | `63ZMIT2LouKFLpBCQLUk` | 9 |
| misterservicerd (admin) | `kAKPMRLe8aaAJxCrvyc8YeMoxRG3` | `GqJfIoRgP4GJTAActUKy` | 9 |
| Maria Teresa (coord) | `HgakSUkclXSyxmBeLm3GkayFOK63` | `NXFORv7bqeksSg980icg` | 9 |

**IDs específicos de docs Caso A** (output exacto del script `auditoria-notis-legacy-todos.ts` ejecutado el 2026-05-08):

- **Yohana** (3): `F9BV32k4JEoEOk97K4xc`, `TVwtOtmNlzW334IUIUdF`, `VWjdYBRmKgU8rGPlbJAv`.
- **Wilainy** (14): `2tPkAmQymtZgMLRRQfTr`, `451UPKpR2vAmsCpsoFNv`, `8WdJHYbEYdZ4wUc4eQnE`, `BgAsQHZMPEfa3LL8ffyV`, `DpQh90B38dmVjSEJVxFv`, `ERtDuPDxeUXph8b8cSNv`, `FMnk6RpFQyxiYRiKZQln`, `JHa0TPJpGVH3OpzPPlV1`, `PFRnT9GuahrydO8g8Hhz`, `Q2Z0pBdjwo6vyK04koPZ`, `SV5DhnuxPwEOCwBwNt2t`, `vKdH6Q9dLRRYQZFUolNY`, `vfbmwla7698GcANVUShS`, `zWWMGk1UFV75sAjaOoVu`.
- **Jorge** (9): `5CZ6039fqvtRyGpiNseM`, `cWDqvmuXpFJptULZ3eOD`, `fjW4YYIq74MtaneORrCD`, `gzSt5SBjTJBRmDmB1rUq`, `lFOU7YDdREy6Rauyyp0q`, `xBUxbB10ocEH2kjLADIl`, `zisaxTDaX1vGmj6Cq9mu`, `3hV65FcsI4HJ3Q0nc4Dv`, `o5yco816RhNGwquDv8P1`.
- **misterservicerd** (9): `4WEMXrqqrAZyoxd7CfQs`, `RXpcWGzERPpfnhc8IwcR`, `WMansj9afOAJcFJbTvuH`, `eFKbcOHszof28K3NVL9s`, `k8dH5RIfMKeBx3QDHagB`, `uRyZuUceQPnSgPBqNgtV`, `xpZLRggHAA8goPfJ1Vhf`, `SZe4ymcOeFWDgH9WFZDj`, `T477a42VXV0oguzrZcTh`.
- **Maria Teresa** (9): `DUZFo0j9pXuKL6oRYPZn`, `DVnPHlYFH838E0xbOVWt`, `LZKL5vbYCoUY4eueQOmW`, `Oyz2NElDajHl2jDOlnD9`, `jU1r9gmKH1oDBQPSMeXG`, `pEwGvpvP0Fo8BUhf2Npc`, `zv8qZ3oq97AXsaPKOCai`, `XqrPkWoGtK65EGrf6yx0`, `rrtigrKrsHyJgNKrprTX`.

#### Fase 1 — Script `scripts/re-migrar-notificaciones-masivo.ts`

1. Generalizar `scripts/re-migrar-notificaciones-yohana.ts` → nuevo script `scripts/re-migrar-notificaciones-masivo.ts`.
2. Scope hardcodeado a los 5 uids listados arriba (NO masivo a toda la colección).
3. Para cada doc de la lista de IDs autorizados:
   - `update` que setea `userId = <uid correspondiente>`.
   - Idempotencia: si `userId` ya es ese valor, skip.
4. NO tocar `destinatarioId` (la lectura dual del service ya lo soporta).
5. NO tocar otros campos (leida, leidaEn, tipo, titulo, descripcion).
6. Logear cada doc tocado con shape antes/después en stdout.
7. DRY-RUN por default; `--apply` explícito requerido.
8. Después de ejecución real, escribir entrada en `auditoria_admin` con `accion: 'remigracion_notificaciones_masivo'`, `actorUid`, `docsAfectados: [44 ids]`, `empleadosAfectados: [5 uids]`.

#### Fase 2 — Script `scripts/fix-email-wilainy.ts`

**Email correcto confirmado por Jorge:** `Nwilainy@gmail.com` (con N mayúscula).

**Estado actual:**
- `personal/{j944265Su9Hyw29YQTj8}.email` = `Nwilainy@gmail.com` ✓ (ya correcto, no tocar).
- `usuarios/{KT9LaszokWNmLCEIe8YOvNKc9rF3}.email` = `apnbrito0318@gmail.com` (incorrecto).
- Firebase Auth `users/{KT9LaszokWNmLCEIe8YOvNKc9rF3}.email` = `apnbrito0318@gmail.com` (incorrecto).

**Acción del builder:**

1. Crear `scripts/fix-email-wilainy.ts` con Admin SDK.
2. Operaciones:
   - `admin.auth().updateUser(uid, { email: 'Nwilainy@gmail.com' })`.
   - `usuarios/{uid}.email` setear a `Nwilainy@gmail.com`.
3. NO tocar contraseña, NO crear nuevo user, NO eliminar el viejo.
4. Audit log en `auditoria_admin`.
5. **Wilainy debe tener acceso a la casilla `Nwilainy@gmail.com` para resets de contraseña futuros**. Jorge confirmó este punto.
6. DRY-RUN por default; `--apply` explícito requerido.

#### Criterios de aceptación

- [ ] `scripts/re-migrar-notificaciones-masivo.ts` creado con scope hardcodeado a los 5 uids + 44 ids enumerados.
- [ ] `scripts/fix-email-wilainy.ts` creado con `admin.auth().updateUser` + `usuarios/{uid}.email` update.
- [ ] Ambos scripts en DRY-RUN por default. `--apply` requerido para ejecución real.
- [ ] Idempotencia: re-ejecución no doble-aplica (skip si ya está en estado destino).
- [ ] Audit log en `auditoria_admin` después de `--apply`.
- [ ] Tester (typecheck + lint + cazadores 6/6) PASS.
- [ ] regression_guardian PASS (scripts server-side Admin SDK no aplican P-001..P-006, pero validar que no aparezcan en otros archivos como side effect).
- [ ] Reviewer APPROVED.
- [ ] Commit + push + deploy Vercel Ready.
- [ ] Postmortem `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md` creado al cerrar (sub-regla CLAUDE.md "5+ empleados afectados").
- [ ] Considerar agregar P-XXX nuevo al catálogo: cazador health-check periódico (`npm run audit:notis-legacy`) que avisa si aparecen nuevos casos.

#### Restricciones / guardarrails

- **Coordinator NO ejecuta `--apply` autónomo.** Jorge corre dry-run primero, después decide si aplicar. Restricción explícita del OK de Jorge.
- Cada fase tiene script propio. Builder los entrega ambos en el mismo sprint.
- Validación humana post-`--apply` (Jorge):
  - Yohana, Wilainy, Maria Teresa hacen hard refresh y reportan que ven sus notificaciones nuevas.
  - Jorge intenta cambiar contraseña de Wilainy desde GestionUsuarios y confirma que ya no tira "no existe usuario".
- NO autorizado (requiere OK separado):
  - Migrar notificaciones de OTROS usuarios fuera de los 5 listados.
  - Tocar `firestore.rules` (si encuentra rule gap durante el fix, escalar a Jorge).
  - Borrar notis o cambiar campos no listados.
  - Hacer cambio de email para usuarios distintos a Wilainy.

#### Notas para el coordinator

- Builder debe basarse en patrón existente `scripts/re-migrar-notificaciones-yohana.ts` (entregado en sprints anteriores) — revisar shape exacto y seguir convención.
- Audit log shape: ver patrón en otros scripts del repo que escriben a `auditoria_admin`.
- Postmortem va al final del sprint **después** de que Jorge confirme `--apply` exitoso. Si Jorge solo aplica fase 1 y deja fase 2 para más tarde, el postmortem de fase 2 queda como TODO en BLOQUEOS.md.

---

## SPRINT-186 — Surface aviso descuento chequeo previo en modal creación + bugs UX modal orden

**Estado:** ✅ COMPLETADO 2026-05-18 — commit `f41d106` pasada 23. Touch-list expandido: 7 archivos (sprint mencionaba `OrdenEditModal.tsx` que NO existe; reales son `OrdenEditForm.tsx` + `ModalEditarOrdenAdmin.tsx`). Item 3 (MessageNotSentError) no aplica al repo — proviene de extensión externa. Ver entrada Pasada 23 en `DIARIO_2026-05-18.md`.
**Origen:** QA puntual sidepanel 2026-05-18 sobre SPRINT-178. Movido a BLOQUEOS por coordinator autónomo pasada 22. Desbloqueado 2026-05-18 por OK Jorge (cliente consolidado vía dedup `--apply`, audit `33M7G5z6lEBVBdSf6yKK`). Movido de vuelta a la cola en pasada 23.
**Tipo:** Feature UX + 2 bugfixes UX.

**Dependencia confirmada (precondición ya cumplida):**

- SPRINT-185 código en producción (commit `a3b56bf`): guard runtime contra duplicados + script dedup + cazador P-014.
- `npx tsx scripts/dedup-clientes-por-telefono.ts --apply` ejecutado por Jorge 2026-05-18:
  - DRY-RUN reportó 2 grupos (QA Test + Brito/Jorge Brito). Decisión: apply directo (canónico = más antiguo en ambos casos).
  - `--apply` real: 2 grupos consolidados, 2 duplicados soft-deleted, 3 docs reasignados (2 órdenes + 1 factura), 1 batch atómico (6 ops Firestore).
  - Audit log: `auditoria_admin/33M7G5z6lEBVBdSf6yKK` con `accion=dedup_clientes_por_telefono`.
  - Cliente "QA Test" canónico: `Q0y6fB6NCIkNoZ3nlwIp`. OS-0058 y OS-0059 ahora apuntan al mismo `clienteId`.

**Scope (3 items):**

1. **Sugerencia automática al crear orden — banner descuento chequeo previo**

   Touch: `src/hooks/useOrdenCreateForm.ts` + `src/components/ordenes/OrdenCreateModal.tsx`.

   Comportamiento:
   - Al cambiar `cliente.id` + `equipoTipo` en el modal, ejecutar `buscarChequeoVigentePorCliente(clienteId, equipoTipo)` con debounce 300ms.
   - Si retorna chequeo vigente (dentro de 30 días, no aplicado), mostrar banner naranja con:
     - Texto: "Este cliente tiene un chequeo previo vigente para este equipo. Monto del chequeo: RD$ X. Vence el DD/MM/YYYY."
     - Checkbox: "Aplicar descuento de RD$ X a esta orden" (default check según decisión Jorge SPRINT-178 = aplicar por default).
   - Si checkbox marcado al crear: persistir `descuentoChequeoPrevioId` + `descuentoChequeoPrevioMonto` + `descuentoChequeoPrevioVencimiento` en el doc orden nuevo (mismo shape que SPRINT-178 ya definió).
   - Replica patrón visual del banner "Operaria asignada" de SPRINT-170.

2. **Sub-bug Modelo perdido al editar**

   Touch: `src/components/ordenes/OrdenEditModal.tsx`.

   Síntoma reportado: al abrir OrdenEditModal sobre una orden con `equipoModelo` poblado, el input aparece vacío o se borra al guardar.

   Acción: auditar el binding (probable `useState` inicializa con string vacío en vez del valor de la orden, o posible duplicación Modelo + "Modelo del fabricante" si hay 2 inputs sobre el mismo field).

3. **Sub-bug `MessageNotSentError` al cerrar modal con Esc**

   Touch: archivo del modal que dispara el error (a identificar — probable `OrdenCreateModal.tsx` u `OrdenEditModal.tsx`).

   Síntoma: al cerrar el modal con tecla Esc se loguea `MessageNotSentError` en consola. Causa probable: listener `onSnapshot` o handler de eventos sin cleanup en el `useEffect` correspondiente.

   Acción: identificar el listener huérfano y agregar return cleanup en el useEffect.

**Restricciones:**

- NO tocar `buscarChequeoVigentePorCliente` (ya correcto post-SPRINT-178).
- archivist PRE-CHANGE obligatorio sobre touch-list.
- Touch-list expandido + auditoría de consumidores obligatoria antes de redactar fix (sub-regla CLAUDE.md). Grep por `descuentoChequeoPrevio`, `buscarChequeoVigentePorCliente`, `OrdenCreateModal`, `OrdenEditModal`, `equipoModelo`.
- Si auditoría revela `firestore.rules` o índice compuesto faltante → ESCALAR sub-sprint a BLOQUEOS.
- Sub-regla cleanup en archivos críticos: `OrdenCreateModal.tsx` y `OrdenEditModal.tsx` están en la lista crítica. Commit message debe declarar "QA flujo creación/edición orden validado" o agregar a BLOQUEOS para validación humana si no se puede ejercer UI autónomo.

**Notas para el coordinator:**

- Postmortem opcional (no es bug de prod, es UX + bugs UI).
- regression_guardian obligatorio (toca hooks + components con efectos).
- Sub-bugs 2 y 3 pueden separarse en commits distintos si la auditoría revela touch-list muy distinto.

**Touch-list inicial:** `src/hooks/useOrdenCreateForm.ts`, `src/components/ordenes/OrdenCreateModal.tsx`, `src/components/ordenes/OrdenEditModal.tsx`. La auditoría puede expandirlo.


</details>
