# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Mister Service RD** is a service management app for a Dominican Republic appliance-repair business. A single Vite/React SPA serves three audiences:

1. **Public marketing site** (`/`, `/servicios`, `/agendar`) — rendered under `PublicLayout`.
2. **Public standalone flows** (`/cita/:calendarId`, `/tracking/:token`, `/f/:slug`) — no auth, no chrome.
3. **Internal admin** (`/admin/*`) — auth-gated, wrapped by `Layout` + `Sidebar`. Technicians are redirected to `/tecnico` (a mobile-focused view).

Firebase project: `mister-service-app-cloude`. Deploy target: Vercel (with one serverless function in `api/`).

Language/UI is Spanish (`date-fns/locale/es`, `RD$` currency). All user-facing strings and most identifiers use Spanish.

## Commands

```bash
npm run dev             # Vite dev server at http://localhost:5173
npm run build           # tsc (typecheck) + vite build  — use to verify before commits
npm run lint            # eslint with --max-warnings 0
npm run preview         # preview production build
npm run deploy:rules    # firebase deploy --only firestore:rules
npm run deploy:indexes  # firebase deploy --only firestore:indexes
```

There is **no test suite**. Do not invent `npm test`.

**Firestore rules versionadas**: el archivo `firestore.rules` en la raíz del repo es la fuente de verdad. Para deployar cambios:

```bash
npx firebase login   # primera vez en la máquina, abre OAuth en browser
npm run deploy:rules # despliega firestore.rules al proyecto mister-service-app-cloude
```

El `.firebaserc` ya tiene el projectId configurado. Si querés usar otro proyecto: `npx firebase use <projectId>`. **Nunca edites las rules desde Firebase Console** — siempre commitealas acá primero, hacé PR, y despliega vía npm script. La rule de R4 (gate aprobación oficina) está pendiente de agregar — ver C2 del audit.

Environment variables live in `.env` (see `.env.example`). Las 6 `VITE_FIREBASE_*` son obligatorias — `src/firebase/config.ts` hace fail-fast con mensaje explícito si falta cualquiera (audit fix SPRINT-136 el 2026-05-11). Antes había fallback hardcodeado al proyecto `mister-service-app-cloude`; se quitó por seguridad. En Vercel las variables viven en Project Settings → Environment Variables; verificá que estén las 6 antes de cada deploy.

## Architecture

### Routing shape (`src/App.tsx`)
- Public marketing routes share `PublicLayout`.
- Public utility routes (`/cita/:calendarId`, `/tracking/:token`, `/f/:slug`) are standalone — no shared layout.
- `/admin/*` is gated by `ProtectedRoute` + `TecnicoRoute` (kicks role `tecnico` to `/tecnico`).
- Legacy top-level paths (`/dashboard`, `/ordenes`, etc.) are redirected to `/admin/...`. Keep redirects when renaming routes — external WhatsApp links may point at old URLs.

### Auth / profile loading (`src/context/AppContext.tsx`)
Two-step cascade on sign-in:
1. `usuarios/{uid}` — primary profile, subscribed via `onSnapshot` (real-time).
2. Fallback: `personal` where `email == user.email` — also real-time.

Si ninguna colección tiene perfil para el usuario autenticado, `AppContext` setea `authError` y `ProtectedRoute` muestra una pantalla "Perfil no encontrado" con botón "Cerrar sesión" — NO hay acceso admin. **Demo mode eliminado en audit fix C3**: antes se sintetizaba un perfil `administrador` en memoria si no existía registro real, lo que permitía escalación silenciosa de privilegios para cualquier email autenticado en Firebase Auth. Todo user autenticado en Firebase Auth requiere perfil real en `usuarios/{uid}` o `personal`.

Permissions changes on a `personal`/`usuarios` doc propagate live now (the ref-based listener was added after the older "logout to refresh permissions" limitation documented in `CONTEXTO_PROYECTO.md`).

### Data layer
All persistence is Firebase Firestore + Storage — no REST backend except the single GPS proxy at `api/gps/ubicacion.ts`. Services under `src/services/` wrap the collection access:
- `contadores.service.ts` — **atomic transactional** counters for document numbers (`OS-####`, `QT-#####`, `FAC-#####`). Always use these, never generate numbers client-side.
- `clientes.service.ts` — client CRUD + phone normalization (see below).
- `gps.service.ts` — reads `config_gps/sistema`, supports Wialon/Samsara/Traccar/Fleet Complete/API Personalizada, streams `ubicaciones_vehiculos` via `onSnapshot`. **Direct API calls hit CORS in the browser** — use the `/api/gps/ubicacion` proxy.
- `storage.service.ts` — Firebase Storage uploads for closure photos.
- `formularios.service.ts`, `solicitudes.service.ts`, `empresasAliadas.service.ts`, `configWeb.service.ts` — newer dynamic-form system (see below).

### Firestore collections
Core: `ordenes_servicio`, `clientes`, `personal`, `usuarios`, `citas_por_confirmar`, `cotizaciones`, `facturas`, `equipos_taller`, `productos`, `standby_piezas`, `gastos`, `mantenimientos`, `calendarios`, `ubicaciones_vehiculos`, `config` (counters + flags), `config_gps`.

Dynamic-forms / web: `formularios`, `solicitudes`, `empresas_aliadas`, `config_web`.

When writing to Firestore, **strip `undefined` fields before `addDoc`/`setDoc`** — Firestore rejects them. Recent commit `ad270a6` fixes this class of bug; follow that pattern.

### Order lifecycle (central concept)
`OrdenServicio.fase` transitions: `nuevo_lead → en_gestion → en_diagnostico → en_cotizacion → aprobado → agendado → trabajo_realizado → cerrado` (or `cancelado`). There are parallel coarser fields (`estadoSimple`, `estado`) plus `historialFases` and optional `auditoria` — keep them in sync when mutating an order. `utils/index.ts` exports `parseOrden()`, `faseLabel()`, `faseColor()`, `getAlertasFromOrdenes()`, and `crearRegistroAuditoria()`. Prefer these over ad-hoc logic.

Closure has two shapes on `CierreServicio`: the new wizard (`equipoFunciona`, `clienteSatisfecho`, `revisoConexiones`, `fotoCierre`) and a legacy shape (`piezasRetiradas`, `checklist`, `satisfaccionCliente`). Read both when rendering historical data; write only the new shape.

### Dynamic forms (`/f/:slug` + `formularios/:id` editor)
Admins build forms in `FormularioEditor` → `formularios` collection. Public users submit at `/f/:slug` → `solicitudes` collection. Supports signature, photo, and geolocation fields (see `src/components/public/CampoFormulario.tsx`). Recent commit `e776a8f` removed composite index requirements from queries — prefer client-side sorting/filtering to avoid re-introducing them.

### Public website subsystem
`src/pages/public/` + `src/components/public/` contain the marketing site and public form renderer. These share the Firebase project with admin — same credentials, same collections. Writes from the public site go to `citas_por_confirmar` with `origen: 'formulario_publico'` and to `solicitudes` for dynamic forms. Don't add reads from admin-only collections (`personal`, `facturas`, etc.) from public pages.

## Conventions & gotchas

- **`@vercel/node` ignora `export const config = { api: {...} }`.** Esa sintaxis es del Next.js Pages Router; este repo es Vite + `@vercel/node` (runtime real de la carpeta `api/`). Para parseo de body en endpoints nuevos, usar el patrón defensivo de `api/admin/crear-usuario.ts:140` y `api/whatsapp/send.ts:548-571`: aceptar `string | object | null` con `JSON.parse` fallback. Cualquier endpoint nuevo en `api/` debe probarse con `curl` real (con `--data` JSON y header `Content-Type: application/json`) ANTES de cerrar el sprint — no asumir que la config aplica. Antiprecedente SPRINT-WA-2 commit `58a642a`: el endpoint rechazó todo POST con `body-invalido` HTTP 400 hasta el hotfix SPRINT-WA-2-FIX-BODYPARSER. Para el webhook entrante (`api/whatsapp/webhook.ts`) el body raw SÍ es necesario por HMAC — `req.on('data')` ya lo lee directo del stream sin depender de `bodyParser`.
- **Phone normalization (RD):** strip non-digits, drop leading `1` if 11 digits, take last 10. WhatsApp links prepend `1` again. Use helpers in `utils/index.ts` / `utils/whatsapp.ts`; don't reinvent.
- **WhatsApp is manual.** `utils/whatsapp.ts` builds `wa.me/...?text=...` URLs. There is no Business API integration — don't add "automatic" send calls.
- **Checklists are hardcoded** in `utils/checklistTemplates.ts` (per `equipoTipo`). The UI does not edit them.
- **Counters must use transactions.** `contadores.service.ts` is the only correct source of OS/QT/FAC numbers.
- **Helpers que escriben Firestore + retornan datos no denormalizan automáticamente.** `registrarComisionPorFactura`, `registrarComisionesPorItems` y similares persisten en `comisiones`/`auditoria` pero NO actualizan el doc factura. El caller debe denormalizar explícitamente con `updateDoc(doc(db, 'facturas', id), { comisionTecnicoMonto: ..., comisionTecnicoNombre: ..., ... })` post-llamada. Sin esto, los renders que leen del doc factura (ej: tabla de Facturas) muestran `—` aunque la comisión sí esté registrada en su colección. Patrón ya en `FacturacionPendiente.tsx` post-`registrarComisionPorFactura` y en `FacturaCrearModal.tsx` post-`registrarComisionesPorItems`.
- **No exportes funciones non-component (helpers/formatters) desde un archivo `.tsx` de componente.** ESLint regla `react-refresh/only-export-components` lo bloquea. Si un helper es compartido entre padre e hijo, extraerlo a `utils/index.ts` o a un archivo dedicado `utils/<scope>.ts`. Patrón establecido en commit `ded0124` con `formatMonedaPrecisa`.
- **Effects que persisten a localStorage requieren guard "ya cargué/restauré" explícito.** Sin guard, el effect puede sobrescribir un borrador antes de que el usuario tenga chance de restaurarlo. Use un ref `yaRestauradoRef` o condicionar el save a `borradorEncontrado === null`. Aplica a cualquier feature de borrador/draft con localStorage.
- **`Ordenes.tsx` is ~1,600 lines** and intentionally monolithic. Smaller-scoped components live in `src/components/ordenes/`. Don't refactor opportunistically — only when the task demands it.
- **Dashboard opens ~6 concurrent `onSnapshot` listeners.** Be mindful when adding more; scope queries where possible.
- **Spanish identifiers.** New code should follow existing naming (`clienteNombre`, `fechaCita`, `fase`, `tecnicoId`). Don't translate existing fields.
- **No emojis** in code or commits unless the user asks.
- **Commit messages are Spanish, Conventional-Commit style** (`feat:`, `fix:`) — match recent history.
- **Documentación viva: cuando elimines un patrón existente, sincroniza los docs.** Hacer grep en `CLAUDE.md`, `PROMPTS-CLAUDE-CODE.md`, `CONTEXTO_PROYECTO.md`, `README.md` y `.claude/agents/*.md` por referencias al patrón eliminado e invertirlas. Sin esto, instrucciones desactualizadas pueden llevar a un futuro builder a reintroducir vulnerabilidades. Aprendizaje del audit fix C3 — `PROMPTS-CLAUDE-CODE.md:92` decía "NO toques fallback admin demo" después de que C3 lo eliminó por seguridad.
- **Cerrar deuda implica sincronizar retros + roadmaps que la listaban.** Cuando un sprint paga deuda priorizada, el coordinator/builder debe hacer grep de la deuda en `docs/sprints/RETRO_*.md` y `docs/sprints/ESTADO_SESION_*.md`, e invertir cada referencia con la marca `[RESUELTO en \`hash\` el YYYY-MM-DD]`. Tachar (`~~...~~`) en lugar de eliminar — preserva forensia. Sin esto, futuros agentes "arreglan" lo arreglado: el sprint counter `Mantenimiento.tsx:80` (commit `2ba57e4`) resolvió el bug, pero retros previas lo seguían listando como deuda activa hasta el sprint sync de `5722932` (2026-05-05) — ese día un coordinator volvió a recibir el prompt y casi delega de nuevo al builder.
- **Mutaciones cross-collection deben ir en un solo `runTransaction`, audit logs incluidos.** Si una mutación toca 2+ colecciones (ej: orden + campaña + audit), envolverlas en `runTransaction` para atomicidad. La verificación de idempotencia (`if (data.flag) return`) debe ir DENTRO del callback DESPUÉS del `tx.get()`, no antes — el optimistic locking de Firestore garantiza que invocaciones paralelas no doble-cuentan. Patrón establecido en `marcarClienteEnviado` (`a38eb89`) y `marcarOrdenReactivada` (`800e0b4`).
- **Reviewer obligatorio cuando un sprint toca `firestore.rules`.** Tester valida typecheck/lint pero NO audita inmutabilidad de campos sensibles ni patrones de defense-in-depth. Coordinator debe convocar reviewer con foco explícito en rules cuando se modifica el archivo. Aprendizaje del audit C3 + Sprint Mapa C2 iter 1 (rules permitían manipulación de 12 campos sensibles que reviewer cazó).
- **`userProfile.id` NO siempre es `auth.uid`.** La cascada de `AppContext` carga el perfil desde `usuarios/{uid}` (donde `id == uid`) o, fallback, desde `personal where email==` (donde `id == doc id de personal`). Cualquier escritura a Firestore que la rule gatee con `request.resource.data.X == request.auth.uid` (ej: `campanas_marketing.creadaPor`, `auditoria_admin.actorUid`, etc.) DEBE usar `currentUser.uid` del context (`useApp()`), NO `userProfile.id`. Síntoma típico: `permission-denied` silencioso solo para algunos usuarios (los cargados vía `personal`), sin request rojo en Network tab porque Firestore usa WebSocket persistente. Hotfix Reactivación commit `afc5e4a` (2026-05-05) — el sprint original `a38eb89` se testeó con usuario en `usuarios/{uid}` y nunca cazó el caso `personal`.
- **Inmutabilidad de campos opcionales en rules requiere `.get(field, null)`.** El acceso directo `request.resource.data.X == resource.data.X` solo funciona si el campo está garantizado present desde el primer create. Para campos condicionales (ej: `overrideCooldown*` en `campanas_marketing`, que solo se setean cuando `overrideCooldown=true`), el acceso directo falla con `permission-denied` cuando ambos lados son missing — Firestore Rules no resuelve eso como `null == null`. Usar `request.resource.data.get('X', null) == resource.data.get('X', null)` que retorna null para campos missing y permite igualdad estructural. Caso C (insertar field a doc sin él) sigue rechazando porque `null == "valor"` es false → inmutabilidad preservada. Hotfix `c7c8e34` (2026-05-05). Patrón ya consistente con `totalReactivados` en la misma rule.
- **QA manual de sprints con rules de inmutabilidad debe ejercer "happy path con campo opcional ausente".** Para sprints que tocan rules con `request.resource.data.X == resource.data.X` sobre campos condicionales, el plan de prueba debe incluir al menos un caso donde el campo opcional NO está presente en el doc (ej: campaña creada SIN override + intento de update normal). Sin esto, el bug solo aparece para usuarios reales que disparan el caso ausente. Antiprecedente: sprint `a38eb89` (Reactivación) testeó únicamente flujos `overrideCooldown=true` (donde los campos sí existen) y nunca probó `marcarClienteEnviado` sobre una campaña sin override → bug latente expuesto solo en producción 1 día después.
- **Notificaciones — campo correcto es `userId` (RESUELTO en SPRINT-127, hash `3733237`, 2026-05-10).** `destinatarioId` está deprecado. Cazador P-007 bloquea reintroducción. Typing legacy `destinatarioId?` se mantiene en `src/types/index.ts` solo por compat. Query dual del service queda como red de seguridad; cleanup profundo B2 pendiente como sprint follow-up.
- **`tecnicoId` guarda `auth.uid`, NO doc id de personal (RESUELTO en SPRINT-108, hash `c4be345`, 2026-05-07).** Aplica a todos los writes técnico-gateados en `ordenes_servicio`. Cazador P-006 detecta dropdowns que reintroducen el patrón viejo. Deuda restante: campos análogos (`operariaId`, `ayudanteId`, `responsableId`, `creadaPor`) en SPRINT-111 pendiente.
- **Dropdowns que asignan empleado a un campo guardado en Firestore deben usar `t.uid`/`p.uid`, NO `t.id`/`p.id`.** Las rules validan `auth.uid`, no el doc id de `personal/`. Filtrar `personal.filter(x => x.uid)` para excluir empleados sin Auth (alta vieja sin onboarding completo). Si el dropdown es solo filtro UI (no escribe a Firestore), agregar comentario `// @safe-tecnicoid-id: filtro UI, no escribe Firestore` arriba del `<option>`. Patrón establecido en commit `c4be345` (2026-05-07, Iniciar Chequeo Aury). Cazador P-006 enforce el invariante.
- **Alta de empleado crea AMBOS docs (RESUELTO en SPRINT-105, 2026-05-06).** `GestionUsuarios.tsx` escribe `personal/{auto-id}` + `usuarios/{uid}` atómicos vía `secondaryDb` (aborta si el espejo falla). Cazador P-004 (`check-alta-empleado-doble-doc.ts`) garantiza el invariante.
- **Queries Firestore con `orderBy('X')` requieren que `X` se persista a nivel raíz en TODOS los paths de write de esa colección.** Firestore excluye silenciosamente en el orderBy los docs sin el campo del orden — la query retorna vacío sin lanzar error. Si `X` es opcional, vive anidado (ej: `cierreServicio.fechaCierre`), o solo se escribe en algunos paths, el helper retorna `null` y la feature falla sin diagnóstico obvio. Antiprecedente SPRINT-178 commit `bd2b2a8` (2026-05-18): el helper `buscarChequeoVigentePorCliente` usaba `orderBy('fechaCierre', 'desc')` pero `fechaCierre` vivía dentro de `cierreServicio` en órdenes del wizard y NO se escribía en absoluto desde `AgendaDia.tsx::handleCerrarChequeo`. Resultado: banner descuento SPRINT-186 nunca aparecía en producción. Hotfix `4890dfa` (SPRINT-187): removió el `orderBy`, agregó sort/filter client-side con cascada de fallbacks (`cierreServicio.fechaCierre` → `fechaCierre` raíz → `updatedAt`), y forward-fix denormalizando `fechaCierre` raíz en ambos paths de cierre. Para evitar recurrencia, antes de agregar un `orderBy` a una query Firestore, ejecutar `grep -rn "updateDoc.*<col>\|setDoc.*<col>\|addDoc.*<col>"` y verificar que el campo del orderBy aparece en TODOS los payloads. Cazador P-015 (`scripts/invariantes/check-firestore-orderby-campo-no-persistido.ts`) activo desde SPRINT-188 (2026-05-18) — usa allowlist `GUARANTEED_PAIRS` con verificación humana al agregar par nuevo + tag `// @safe-orderby: <sprint + razón>` para casos donde la colección está detrás de variable `const COL`.

## Modo autónomo (Cowork ↔ Coordinator)

> Jorge dice una vez "lo que necesito" y el sistema avanza solo. Diseño completo en `docs/sprints/COLA_AUTONOMA_PROTOCOLO.md`.

**Cómo funciona:**

1. Jorge habla con Cowork (Claude desktop app) en lenguaje natural.
2. Cowork escribe sprints estructurados en `docs/sprints/COLA_AUTONOMA.md`.
3. Jorge abre Claude Code y pega `trabaja`.
4. El coordinator lee la cola, procesa cada sprint con builder → tester → regression_guardian → reviewer → commit + push, sin pedirle permiso a Jorge.
5. Al final, escribe `docs/sprints/DIARIO_<fecha>.md` con resumen 60s.

**Lo que SÍ requiere OK explícito de Jorge** (queda en `docs/sprints/BLOQUEOS.md`):

- Cambios a `firestore.rules`.
- Migraciones de datos sobre >500 docs.
- Borrados masivos.
- Nuevas integraciones de pago, OAuth, terceros.
- Cambios a endpoints `api/` públicos.

**Triggers que entiende el coordinator:**

- `trabaja` o `procesa cola` → procesar sprints PENDIENTES en orden.
- `procesa bloqueos` → mover sprints con `OK: jorge ...` de vuelta a la cola.
- `pausa autónomo` → terminar sprint actual y parar.

**Política de fricción mínima.** Jorge no es el correo entre Cowork y el coordinator. Cowork escribe directo a la cola. El coordinator procesa cuando Jorge dispara `trabaja`. Si Cowork detecta un patrón problemático en el repo, agrega un sprint a la cola sin preguntar.

## Sistema anti-regresión

> **Cada bug que rompió producción se convierte en un cazador ejecutable.** Diseño completo en `docs/PLAN_ANTI_REGRESION.md`.

Tres capas de defensa:

1. **`scripts/invariantes/check-*.ts`** — cazadores determinísticos basados en bugs reales (P-001 userProfile.id misuse, P-002 rules con campo opcional sin .get(), P-003 cross-collection sin runTransaction, P-004 alta empleado sin doc espejo en usuarios/, P-005 firestore.rules sin deployar). Catálogo en `docs/PATRONES_REGRESION.md`. Corren en <5s.
2. **`.claude/agents/regression_guardian.md`** — agente que el coordinator invoca antes de cerrar sprint. Lee el diff y caza instancias semánticas que el grep no atrapa.
3. **`.husky/pre-commit`** — hook que corre typecheck + `npm run check:regression` + lint de archivos staged. Bloquea commit si algo falla. Bypass de emergencia: `git commit --no-verify`.

**Sub-regla obligatoria — cada bug capturado se convierte en cazador ejecutable.** Cuando un sprint cierra un bug que rompió producción, el coordinator/builder debe hacer LAS DOS COSAS: (a) actualizar gotcha en CLAUDE.md como antes, Y ADEMÁS (b) agregar entrada P-XXX en `docs/PATRONES_REGRESION.md` y un cazador en `scripts/invariantes/`. Sin el cazador, la próxima feature reintroduce el bug en otro lugar — patrón observado en `userProfile.id ≠ auth.uid` que rompió producción dos veces (`afc5e4a` Reactivación + `b93625d` Notificaciones) antes de capturarse como check determinístico.

**Sub-regla — coordinator debe invocar `regression_guardian` en sprints que toquen rules, services o context.** Es la capa semántica que complementa los cazadores determinísticos. Orden sugerido del flujo: `builder → tester → regression_guardian → reviewer`. Si el guardián retorna CHANGES_NEEDED, el coordinator vuelve al builder antes de cerrar.

**Sub-regla obligatoria — sprints que tocan `firestore.rules` deben deployar antes de cerrar COMPLETADO.** Ejecutar `npm run deploy:rules` (corre `firebase deploy --only firestore:rules` + actualiza `firestore.rules.deployed.lock`). Cazador P-005 bloquea pre-commit si hay diff entre repo y lock. Antiprecedente SPRINT-103/106 detallado en `docs/postmortems/2026-05-07-iniciar-chequeo-rules-sin-deploy.md`.

**Sub-regla obligatoria — sprints que tocan `storage.rules` deben deployar antes de cerrar COMPLETADO.** Espejo de la regla P-005. Comando: `npm run deploy:storage-rules`. Cazador P-013 bloquea pre-commit si hay diff entre repo y lock. Si Jorge prefiere ejecutar el deploy manual (caso baseline SPRINT-138), el coordinator deja el sprint en "código commiteado, deploy pendiente" hasta que el lock se actualice.

**Sub-regla — cleanup de "dead code" en páginas críticas requiere QA manual del flujo afectado antes de commit.** Aplica a `Ordenes.tsx`, `TecnicoVista.tsx`, `Dashboard.tsx`, `OrdenDetalle.tsx`, `IniciarChequeoButton.tsx`, `CierreServicio*` y componentes de wizard. El commit debe declarar "QA flujo X validado" o escalar a `BLOQUEOS.md`. Aprendizaje SPRINT-103.

**Política de falsos positivos.** Si un cazador grita por algo legítimo: agregar a la allowlist documentada en el header del cazador (NO desactivarlo). Si la allowlist crece a >5 entradas, refactorear el cazador.

## Continuous Improvement Loop (archivist + postmortems)

> **Cada bug se convierte en aprendizaje estructurado, consultado antes de cada cambio.** Diseño en `.claude/agents/archivist.md` y `docs/postmortems/`.

Tres capas adicionales que cierran el ciclo de aprendizaje:

1. **`docs/postmortems/`** — análisis estructurado de cada bug en producción. Template en `_TEMPLATE.md`. Un archivo por incidente, formato `YYYY-MM-DD-<slug>.md`. Cada postmortem responde 5 porqués hasta causa raíz estructural y propone acciones preventivas concretas.
2. **`.claude/agents/archivist.md`** — agente con tres modos: PRE-CHANGE (consulta historial git + postmortems antes de tocar archivos del touch-list), POSTMORTEM (genera el archivo `docs/postmortems/...` siguiendo el template), MÉTRICAS (corre `npm run metricas` y agrega interpretación cualitativa al output).
3. **`scripts/metricas-mejora-continua.ts`** — calcula MTBF, MTTR, recurrence rate, catch rate, count de cazadores activos y allowlist size. Output en `docs/sprints/METRICAS_<fecha>.md`. Comando: `npm run metricas` o `npm run metricas -- --desde=YYYY-MM-DD`.

**Sub-regla obligatoria — antes de cualquier sprint con touch-list ≥1 archivo, el coordinator invoca `archivist` en modo PRE-CHANGE.** Output va a `EJECUCION_AUTONOMA.md` para trazabilidad. Antiprecedente SPRINT-103 documentado en postmortem.

**Sub-regla obligatoria — después de cualquier bug en producción reportado por Jorge / usuario / monitoreo, el coordinator invoca `archivist` en modo POSTMORTEM.** Genera `docs/postmortems/YYYY-MM-DD-<slug>.md` con el template completo (timeline, impacto, 5 porqués, acciones preventivas, métricas, lecciones). Sin postmortem, los aprendizajes son anecdóticos y se pierden. El archivist también clasifica el bug: clase nueva → propone P-XXX nuevo + cazador (delegar al builder); recurrencia de clase ya catalogada → reporta "fallo del cazador X" + sugerencia de refinamiento.

**Sub-regla obligatoria — postmortem completo antes de marcar un sprint hotfix como COMPLETADO.** Un sprint que arregla un bug en producción NO se cierra hasta tener su archivo en `docs/postmortems/`. Sin esta regla, los aprendizajes quedan solo en gotchas y los cazadores tardan en aparecer (antiprecedente: `afc5e4a`, `b93625d`, `c7c8e34` cerraron sin postmortem y retrasaron P-001 a P-003).

**Sub-regla obligatoria — Touch-list expandido + auditoría de consumidores antes de redactar el sprint.** Cualquier sprint que toque código (`.tsx` / `.ts` / `.rules`) debe declarar explícitamente, antes de pasarlo al builder:

1. **Archivos a modificar** — los que se editan.
2. **Consumidores verificados (read-only check)** — listar TODOS los archivos que importan el símbolo, leen el campo o llaman la función afectada. Usar `grep -rn` y reportar archivo + líneas relevantes. Consultar `docs/MAPA_DEPENDENCIAS.md` y `docs/CAMPOS_CROSS_COLLECTION.md` cuando aplique.
3. **Consumidores NO afectados** — archivos que aparecen en el grep pero usan otra ruta del código que no se toca. Justificar brevemente por qué.
4. **Hallazgos laterales** — bugs latentes descubiertos durante la auditoría pero fuera del scope del sprint actual. Documentarlos como deuda para un sprint futuro (con nombre tentativo). **NO fixear silenciosamente** dentro del sprint en curso.

Si la auditoría revela >5 consumidores con cambios concretos, considerar dividir el sprint en fases. Si revela archivos no contemplados en el touch-list original, **ACTUALIZAR el sprint** antes de procesarlo — nunca procesar parcialmente y "dejar la otra mitad para después" sin volver a redactar el sprint con scope ampliado.

Antiprecedente SPRINT-145 (2026-05-12): touch-list incompleto en `AgendaDia.tsx` casi rompió el flujo del técnico — Jorge exigió re-auditoría que descubrió 2 cambios faltantes. Complementaria al archivist PRE-CHANGE (pasado) y al MAPA_RIESGOS_MODULOS (presente del módulo); touch-list expandido pregunta "¿quién depende ahora?".

**Sub-regla obligatoria — consultar `docs/sprints/MAPA_RIESGOS_MODULOS.md` antes de tocar cualquier módulo.** Agregada en SPRINT-AGENTES-2-MEMORIA-DIRIGE (2026-05-24). El mapa indexa por módulo (Órdenes, Pagos, Facturación, Comisiones, Nómina, Clientes, Técnicos, WhatsApp, Contadores, etc.) cuáles cazadores P-XXX aplican, qué gotchas vivos hay, qué decisiones de Jorge no se rompen, y un checklist "Antes de tocar". El coordinator le pasa al builder la sección del módulo afectado como contexto adicional ANTES de delegar. Si el touch-list cruza múltiples módulos, le pasa la sección de cada uno. Complementaria al `archivist PRE-CHANGE` (pregunta "¿qué pasó antes?") y al touch-list expandido (pregunta "¿quién depende ahora?"); el mapa pregunta "¿qué se sabe del módulo HOY?". El agente `memoria` mantiene el mapa al día (modo MANTENER-MAPA — ver `.claude/agents/memoria.md`). Si un sprint descubre una zona de riesgo nueva, el coordinator invoca a `memoria` al cerrar para sumarla.

**Sub-regla — paralelización segura del coordinator (SPRINT-AGENTES-3, 2026-05-24).** El coordinator puede invocar `reviewer` + `regression_guardian` + `security` (cuando aplica) EN UNA SOLA TANDA paralela post-builder — son los 3 READ-ONLY. También puede invocar varios `auditor_*` sobre módulos disjuntos en paralelo. Regla dura: paralelismo SOLO en lectura/verificación o sobre módulos disjuntos; nunca dos agentes escribiendo el mismo archivo simultáneamente; máx. ~3-4 concurrentes. Commits y edits siguen secuenciales. Detalle en `.claude/agents/coordinator.md` sección "Paralelización" y `docs/sprints/COLA_AUTONOMA_PROTOCOLO.md`.

## Memoria viva (agente `memoria` + `MEMORIA_MAESTRA.md`)

> **Objetivo:** que el estado del trabajo nunca se pierda entre conversaciones. Jorge cambia de conversación / día / herramienta (Cowork ↔ Claude Code) y debe poder retomar TODO sin re-explicar nada.

`docs/sprints/MEMORIA_MAESTRA.md` es la **foto siempre-actual** del estado: pendiente, en curso, hecho reciente, decisiones de Jorge que no se olvidan, y un índice a las fuentes vivas (cola, BLOQUEOS, diarios). Es un ÍNDICE corto de ~1 página, NO una copia de todo. El agente `memoria` (`.claude/agents/memoria.md`) es su guardián.

**Sub-regla obligatoria — actualizar `MEMORIA_MAESTRA.md` al cerrar cada pasada autónoma.** El coordinator invoca al agente `memoria` en modo ACTUALIZAR al final de cada pasada (después de cerrar/escalar sprints, antes del commit de docs): mover lo completado a "Hecho reciente" (con hash + fecha), agregar lo nuevo a "Pendiente", refrescar la fecha de "Última actualización". Es el espejo operativo del DIARIO_<fecha> (detalle del día) — la memoria es el estado acumulado y corto. Sin esto, las conversaciones nuevas arrancan a ciegas aunque el diario exista, porque nadie lee 15 diarios.

**Para Cowork (fuera de Claude Code):** misma disciplina a mano. Leer `MEMORIA_MAESTRA.md` PRIMERO al abrir (gatillo de Jorge: "ponte al día"), y actualizarla al cerrar la conversación o tras un cambio importante. Detalle en `COWORK_CONTEXTO.md`.

**Convivencia:** `memoria` ve el AHORA (qué falta, qué se hizo); `archivist` ve el TIEMPO (incidentes, postmortems, métricas). No se solapan ni se duplican: la memoria APUNTA a la cola/diarios, no los copia.

## Mapa mental vivo (agente `cartografo` + `docs/mapa/MAPA_MENTAL.yaml`)

> **Objetivo:** que Jorge (no-técnico) y los demás agentes tengan **un mapa mental único y editable** del software (módulos, áreas, dependencias, colecciones, integraciones, criticidad), regenerable a SVG visual + HTML interactivo + prompt de contexto para los agentes. Es lo que rompe el bucle "tapo una falla y sale otra" — antes de tocar algo, todos consultan el mismo mapa.

`docs/mapa/MAPA_MENTAL.yaml` es la **fuente única de verdad**, editable a mano por Jorge en español. El agente `cartografo` (`.claude/agents/cartografo.md`) la mantiene viva y regenera 4 salidas con `npm run mapa`:

- `docs/mapa/mapa.svg` — imagen visual (mandable por WhatsApp).
- `docs/mapa/mapa.mmd` — diagrama Mermaid (renderizable en mermaid.live o vía mermaid-cli).
- `docs/mapa/explorador.html` — visor interactivo (abrir con doble clic, filtra por área).
- `docs/mapa/PROMPT_SISTEMA.md` — contexto en lenguaje natural que los demás agentes leen al arrancar. Incluye matriz inversa "si tocás X, revisá Y".

Cada regeneración guarda copia versionada en `docs/mapa/historico/MAPA_MENTAL.YYYY-MM-DD-HHMM.yaml` (no destructivo). Si las validaciones fallan (módulo apunta a otro inexistente, dependencia circular, integración no declarada, etc.), NO regenera y reporta — las salidas anteriores quedan intactas.

**Sub-regla obligatoria — invocar `cartografo` al cerrar sprints estructurales.** El coordinator invoca al `cartografo` (modo ACTUALIZAR) al cerrar cualquier sprint que: (a) agregó/quitó un módulo, (b) cambió una dependencia (módulo A ahora depende de B), (c) agregó/quitó una colección Firestore, (d) agregó/cambió una integración externa, (e) cambió la criticidad de un módulo. El `cartografo` SOLO escribe dentro de `docs/mapa/` — nunca toca código de producción ni rules. Si detecta una colección declarada en el YAML que no existe en el grep de `src/`/`api/`, lo reporta al `coordinator` (y a `data_integrity` cuando exista) en vez de regenerar con datos inconsistentes.

**Consolidación con docs previos del mapa:** los 4 docs estáticos del mapa quedaron como **lectores del YAML, no fuentes paralelas** — sus marcadores apuntan al YAML como fuente: `docs/MAPA_DEPENDENCIAS.md` (notas humanas de patrones de consumo cross-archivo), `docs/CAMPOS_CROSS_COLLECTION.md` (reglas estrictas de id por campo apuntador), `docs/sprints/MAPA_RIESGOS_MODULOS.md` (capa de riesgo sobre cada módulo, mantenido por `memoria`), `docs/sprints/AUDITORIA_FLUJO_DEPENDENCIAS_2026-05-25.md` (snapshot forense histórico, no se actualiza).

**Convivencia con los otros mantenedores:** `cartografo` ve la ESTRUCTURA (qué módulos, cómo se conectan); `memoria` ve el AHORA (qué falta, qué se hizo); `archivist` ve el TIEMPO (incidentes, postmortems, métricas). Los tres complementan, no se solapan.

## Related docs in repo

- `docs/sprints/MEMORIA_MAESTRA.md` — **memoria viva**: foto siempre-actual del estado (pendiente / en curso / hecho reciente / decisiones de Jorge / índice). Leer PRIMERO al abrir cualquier sesión; actualizar al cerrar. Mantenida por el agente `memoria`.
- `docs/mapa/MAPA_MENTAL.yaml` — **mapa mental vivo** (fuente única de la estructura del software: áreas, módulos, dependencias, colecciones, integraciones, criticidad). Editable a mano por Jorge. Regenera 4 salidas con `npm run mapa`: `mapa.svg` (imagen), `mapa.mmd` (Mermaid), `explorador.html` (visor interactivo), `PROMPT_SISTEMA.md` (contexto para agentes). Mantenido por el agente `cartografo`.
- `README.md` — setup and module list.
- `CONTEXTO_PROYECTO.md` — deeper architecture reference (some sections predate recent refactors; treat as historical context, verify against current code).
- `CONTEXTO_PAGINA_WEB.md` — public-website requirements and Firestore-permission matrix for public pages.
- `PROMPTS-CLAUDE-CODE.md` — saved prompts the owner reuses.
- `docs/MAPA_DEPENDENCIAS.md` — quién consume qué en cada módulo core. Consultar antes de tocar código compartido.
- `docs/CAMPOS_CROSS_COLLECTION.md` — tabla de campos que conectan colecciones (tecnicoId, operariaId, etc.) con su regla estricta. Consultar antes de leer/escribir un campo apuntador.
- `docs/QA_SUPER_USER.md` — catálogo de las 5 cuentas QA dedicadas para sidepanel Claude (SPRINT-QA-USER). Política de uso, regeneración de passwords, convenciones de datos de prueba.
- `docs/QA_PROMPT_MAESTRO.md` — prompt copy-paste para `Claude in Chrome` que ejerce E2E completo en 1 sola sesión usando las 5 cuentas QA.
- `scripts/qa-sanity-check.ts` — read-only, valida existencia + rol + invariante P-004 de las 5 cuentas QA. Correr antes de cada sesión QA. `npx tsx scripts/qa-sanity-check.ts`.

## Multi-agent workflow (`.claude/agents/`)

Este repo tiene un equipo de 5 agentes especializados que trabajan en conjunto:

| Agente | Especialidad |
|---|---|
| `coordinator` | Único interfaz con Jorge. Descompone pedidos y delega. |
| `builder` | Implementa código siguiendo estas convenciones. |
| `tester` | Typecheck + lint + regresiones conocidas antes del commit. |
| `reviewer` | Code review independiente con ojos frescos. |
| `devops` | Monitorea Vercel + GitHub, dispara Deploy Hook si el webhook se atora. |
| `memoria` | Mantiene `docs/sprints/MEMORIA_MAESTRA.md` al día — el estado vivo de todo. El coordinator lo invoca al cerrar cada pasada. |
| `cartografo` | Mantiene `docs/mapa/MAPA_MENTAL.yaml` y regenera el mapa visual + HTML + prompt de contexto. El coordinator lo invoca al cerrar sprints estructurales (módulo nuevo, dependencia nueva, colección nueva, integración nueva). Solo escribe dentro de `docs/mapa/`. |

(El repo tiene además agentes de apoyo: `architect`, `tech_lead`, `qa`, `security`, `docs`, `archivist`, `regression_guardian`, `mejora_continua`, `user_advocate`, `auditor_contable`, `guardian_logica`.)

**Uso:** desde Claude Code, escribe `/equipo` para activar al coordinator. El coordinator delega al resto automáticamente.

**Flujo típico:**
1. Jorge describe una feature en español conversacional.
2. Coordinator aclara con `AskUserQuestion` si hay ambigüedad.
3. Coordinator llama a `builder` → `tester` → `reviewer` → (loop si CHANGES_NEEDED).
4. Coordinator entrega a Jorge el bloque `git add + commit + push` listo.
5. Jorge ejecuta en su Mac. Al confirmar, coordinator llama a `devops` para monitorear.
6. `devops` confirma deploy Ready y avisa de hard refresh si aplica.

**Cómo agregar o modificar agentes:** editar los archivos en `.claude/agents/*.md`. El frontmatter define el `name` (usado en `Agent("name", ...)`) y el `description` (usado por Claude para decidir cuándo delegar).

**Deploy Hook (para `devops`):** `https://api.vercel.com/v1/integrations/deploy/prj_VdEXPPBC19wLvHN495VzrYTQmLgi/dqfSS3mCJK` — POST sin body. Backup por si el webhook GitHub→Vercel se atora. Rotado el 28 abr 2026 tras incidente de webhook stale (resuelto con Disconnect/Reconnect del repo).

## Banner de nueva versión

El sistema detecta automáticamente cuando hay un deploy nuevo en
producción y muestra un banner arriba con botón "Recargar ahora".

- Implementado en commit 92f3ccf (23 abr 2026)
- vite.config.ts inyecta git commit hash como __APP_VERSION__ al bundle
- public/version.json se genera en cada build con el mismo hash
- src/hooks/useVersionCheck.ts hace poll cada 5 min + al focus del
  window a /version.json
- src/components/BannerNuevaVersion.tsx renderiza banner fijo z-9999
  cuando la versión del servidor difiere del bundle en ejecución
- Mountado en App.tsx fuera de los layouts — aparece en admin,
  público y vista técnico

Esto elimina la necesidad de pedir al equipo que haga hard refresh
manual después de cada deploy importante.
