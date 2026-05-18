# Postmortem — Banner descuento no renderiza por query con orderBy sobre campo nunca persistido

**Fecha del incidente:** 2026-05-18
**Detectado por:** QA visual sidepanel (Cowork → SPRINT-187)
**Severidad:** alta (feature de producto SPRINT-178 + SPRINT-186 inoperante en producción)
**Patrón asociado:** clase nueva — proponer P-015 (query Firestore con orderBy sobre campo opcional/nunca persistido)
**Commits relacionados:**
- Introduce: `bd2b2a8` (SPRINT-178, 2026-05-18) — helper con orderBy('fechaCierre')
- Detección: QA sidepanel SPRINT-186 post-deploy `f41d106` (2026-05-18 mediodía)
- Fix: `4890dfa` (SPRINT-187, 2026-05-18 noche)

---

## Resumen ejecutivo

`buscarChequeoVigentePorCliente` ordenaba la query Firestore por `fechaCierre` raíz, pero ningún path del código persistía ese campo a nivel raíz — el wizard lo guardaba dentro de `cierreServicio`, y `AgendaDia.tsx::handleCerrarChequeo` no lo escribía en absoluto. Firestore excluye en el orderBy los docs sin el campo del orden, así que la query siempre retornaba vacío y el banner del descuento nunca aparecía al crear una orden, aunque hubiera chequeo válido en Firestore.

---

## Timeline

| Hora | Evento |
|---|---|
| 2026-05-18 ~mañana | SPRINT-178 deployado (`bd2b2a8`) con el helper `buscarChequeoVigentePorCliente` |
| 2026-05-18 mediodía | SPRINT-186 deployado (`f41d106`) wired el helper al modal de creación de orden |
| 2026-05-18 ~noche | QA visual sidepanel: crear orden con QA Test + Aire Acondicionado NO muestra banner descuento aunque OS-0058 existe |
| 2026-05-18 noche | Cowork escribe SPRINT-187 con 6 hipótesis. Coordinator lee el código y confirma causa raíz por análisis estático (no requirió Firestore Console) |
| 2026-05-18 noche | Fix deployado en commit `4890dfa` |

---

## Impacto

- **Usuarios afectados:** todos los coordinadores/secretarias que crean órdenes con clientes que tuvieron chequeo previo
- **Funcionalidad bloqueada:** banner descuento al crear orden (UX SPRINT-186) Y posible aplicación del descuento (depende de si el flujo de aprobación de precio lee del banner o del helper directamente — los 3 callers `Ordenes.tsx:191`, `OrdenDetalle.tsx:99`, `AgendaDia.tsx:253` también dependen del mismo helper, por lo que el descuento de SPRINT-178 nunca se aplicó automáticamente en ninguna cotización post-deploy)
- **Tiempo total fuera:** ~12 horas (deploy SPRINT-178 mañana → fix SPRINT-187 noche del mismo día)
- **Severidad de negocio:** alta — el feature anunciado en SPRINT-178 (descuento de RD$ del chequeo previo a la cotización) no funcionaba para ningún cliente. Sin embargo, sin reportes de "perdimos plata" porque el override manual de SPRINT-178 sí funciona (admin/coord puede aplicar descuento manual con motivo)
- **Pérdida de datos:** no — los chequeos previos están persistidos correctamente en Firestore; solo el helper de lectura fallaba

---

## Causa raíz (5 porqués)

1. **¿Por qué el banner descuento no renderizaba?** — Porque `useOrdenCreateForm.ts::useEffect` recibía `null` de `buscarChequeoVigentePorCliente`.
2. **¿Por qué el helper retornaba null aunque OS-0058 existía?** — Porque `snap.empty === true` después de la query Firestore.
3. **¿Por qué la query Firestore no retornaba OS-0058?** — Porque `orderBy('fechaCierre', 'desc')` excluye docs que no tienen el campo del orden, y OS-0058 no tiene `fechaCierre` a nivel raíz.
4. **¿Por qué OS-0058 no tiene `fechaCierre` raíz?** — Porque `AgendaDia.tsx::handleCerrarChequeo` (el path por el que se cerró) no escribía ese campo (sólo `updatedAt`), y el wizard de cierre lo guardaba dentro de `cierreServicio` anidado.
5. **¿Por qué nadie verificó que el orderBy de la query matcheaba con el campo realmente persistido?** — **Causa raíz:** en SPRINT-178 el QA del helper se hizo solo en código (typecheck, lint, regression_guardian, reviewer) — ninguna capa testea contra el shape real de los docs Firestore. El reviewer leyó "orderBy fechaCierre desc" y lo aceptó porque el comentario decía "fechaCierre del wizard"; nadie hizo el cruce semántico de "¿dónde se persiste ese campo exactamente?". No hay test de integración ni QA visual en el pipeline.

---

## Lo que funcionó bien

- **QA visual sidepanel post-deploy** cazó el bug en el mismo día. Sin esa pasada, el bug habría quedado latente días o semanas — el flujo "crear orden con chequeo previo + aire acondicionado del mismo cliente" no es de uso diario hasta que un cliente regresa post-chequeo.
- **El bloque defensivo del helper** (lectura preferente de `cierreServicio.fechaCierre`, fallback `fechaCierre` raíz) estaba bien escrito — sólo nunca se ejecutaba porque la query previa lo excluía. Cuando el coordinator removió el orderBy, el código defensivo "ya estaba ahí" y funcionó.
- **Bug A y Bug B independientes**: SPRINT-187 los identificó separados desde la cola, lo que permitió commitear cada uno en su propio commit + análisis aislado.

---

## Lo que falló

- **Reviewer no cruzó "query Firestore" contra "writes del campo"**. El campo `fechaCierre` aparece en el comentario del helper y en `CierreServicioWizard.tsx` (anidado, no raíz) — un grep hubiera revelado la incongruencia, pero el reviewer no lo hizo.
- **No hay cazador para queries Firestore con orderBy sobre campos no garantizados**. Es exactamente el patrón "asunción implícita sobre shape de datos" que ya cazamos en otros contextos (P-001 userProfile.id, P-002 .get() en rules) pero nunca lo extendimos a queries Firestore.
- **El typecheck no cruza schemas runtime**: TS no sabe que `fechaCierre` en `OrdenServicio` es opcional/no garantizado. El sistema de tipos del proyecto deja muchos campos como `unknown` o opcionales y eso permite el desliz.
- **No hay test de integración (ni siquiera manual scripted)** que simule "crear orden con chequeo previo del mismo cliente". Si lo hubiera, SPRINT-178 nunca habría pasado QA.

---

## Acciones tomadas (fix inmediato)

- `git push` commit `4890dfa` con 3 cambios:
  - Helper `buscarChequeoVigentePorCliente`: query sin orderBy + sort/filter client-side. Resuelve la fecha en cascada: `cierreServicio.fechaCierre` → `fechaCierre` raíz → `updatedAt` (fallback legacy).
  - `CierreServicioWizard.tsx`: forward fix denormalizando `fechaCierre` a nivel raíz al cerrar (además del anidado en `cierreServicio`).
  - `AgendaDia.tsx::handleCerrarChequeo`: forward fix idem (antes no escribía la fecha en absoluto).
- Import `orderBy` removido (ya no se usa en `ordenes.service.ts`).
- Índice compuesto en `firestore.indexes.json` queda dormido (no se elimina para no romper deploys en flight; cleanup en sprint propio).

---

## Acciones preventivas (para que no vuelva)

- [ ] **Cazador determinístico** P-015 propuesto: detectar queries Firestore con `orderBy(<campo>)` y verificar que `<campo>` se escribe a nivel raíz en TODOS los paths (writes a la misma colección con ese campo). Implementación tentativa: AST parse de `query(...orderBy('X', ...))` + grep de `updateDoc|setDoc|addDoc` sobre la misma colección sin el campo X. Allowlist para campos garantizados por contadores transaccionales (`numero`, `createdAt` ya gestionados centralmente). Cazador delegado al builder en sprint follow-up SPRINT-188-CAZADOR-P015.
- [ ] **Sub-regla en CLAUDE.md:** "Queries con `orderBy` deben validar que el campo se persiste a nivel raíz en TODOS los paths de write de esa colección. Firestore excluye en el orderBy docs sin el campo — si el campo es opcional/anidado, la query retorna vacío silenciosamente." — la agrego abajo de la gotcha existente sobre rules y queries.
- [ ] **Update a agente reviewer:** agregar checklist explícito "cuando un sprint agrega `query + orderBy + where`, ¿el campo del orderBy se persiste en TODOS los paths que escriben a esa colección? Hacer grep y reportar." Pendiente para próximo refinamiento del prompt del reviewer.
- [ ] **Test manual scripted SPRINT-178**: agregar a `docs/QA_PROMPT_MAESTRO.md` un caso explícito "crear orden con cliente que tuvo chequeo previo del mismo equipo en últimos 30 días → debe aparecer banner descuento". Lo cubre el QA visual sidepanel pero el prompt maestro debe declararlo para que no se omita.

---

## Métricas

- **Tiempo desde introducción hasta detección:** ~12 horas (mañana → noche del mismo día)
- **MTTR (detección hasta fix):** ~1 hora (incluye análisis estático sin Firestore Console + 2 commits + push)
- **Es recurrencia de clase ya catalogada:** **no** — clase nueva. Proponer P-015 "query Firestore con orderBy sobre campo no garantizado en todos los writes". Es primo de P-009 (parser olvida campos del tipo) en estructura — ambos son "asunción de shape de datos no verificada" — pero el lugar del defecto es distinto (query vs parser).

---

## Lecciones aprendidas

El patrón general es: **las queries Firestore con `orderBy` tienen una asunción implícita sobre el shape de los docs que NO está reflejada en el tipo TS ni en el código de los writes.** Como Firestore silenciosamente excluye los docs sin el campo, el bug se manifiesta como "snap.empty === true" — el síntoma se parece a "no hay datos", cuando en realidad hay datos pero la query los está filtrando.

Tres frases para el equipo del futuro:

1. Cuando agregás `orderBy('X')` a una query Firestore, hacé grep de TODOS los `updateDoc|setDoc|addDoc` a esa colección y verificá que el campo `X` esté escrito en TODOS — si hay un path sin él, esa rama de docs queda invisible para tu query y el helper retorna vacío sin error explícito.
2. El bloque "defensivo" `cierreServ?.fechaCierre ?? data.fechaCierre` que el helper tenía leyendo el campo anidado parecía cuidadoso — pero era inútil porque la query previa con orderBy ya había excluido todos los docs sin el campo raíz. La defensa estaba en el lugar equivocado.
3. Si tu feature depende de una query Firestore, el QA debe incluir "leer un doc real de Firestore con shape mínimo + verificar que la query lo retorna". El typecheck/lint/reviewer no sustituye eso.

---

## Referencias

- Sprint: `docs/sprints/COLA_AUTONOMA.md` SPRINT-187
- Log de ejecución: `docs/sprints/EJECUCION_AUTONOMA.md` (pasada 24, 2026-05-18 noche)
- Patrón: `docs/PATRONES_REGRESION.md` — P-015 pendiente de agregar en SPRINT-188-CAZADOR-P015
- Cazador: `scripts/invariantes/check-firestore-orderby-campo-no-garantizado.ts` — pendiente de crear
