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

Environment variables live in `.env` (see `.env.example`). `src/firebase/config.ts` includes hardcoded fallback credentials for the `mister-service-app-cloude` project, so the app boots without `.env` — be aware this means missing env vars don't fail loudly.

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
- **Gotcha — bug pre-existente en `notificaciones` (sprint propio en backlog).** El código escribe campo `destinatarioId` en `src/services/notificaciones.service.ts`, pero `firestore.rules:511,515` gatean read/update/delete por `userId == request.auth.uid`. Resultado: técnicos/operarias/secretarias que reciben notificaciones NO pueden marcarlas como leídas (la rule evalúa contra `userId` que no existe). Detectado por reviewer durante audit del hotfix `afc5e4a` (vector colateral, fuera de scope). Sprint propio: o renombrar el campo a `userId`, o ajustar rule a `destinatarioId == request.auth.uid`. Priorizado **después** de C2 fase B App Check (post ventana 24-48h del `app_check_audit`).
- **Gotcha — asunción frágil "para técnicos, `personal/{id}.id == auth.uid`".** Varios writes técnico-gateados en `ordenes_servicio` (rules de tecnico tipo `auth.uid == tecnicoId`) asumen que al alta de un técnico se crea el doc `personal/{auth.uid}` (NO `personal/{idAutogenerado}`). NO está enforced por código — depende de disciplina al alta manual desde `GestionUsuarios`. Si se rompe (ej: alta de técnico sin alinear ids), TODOS los writes técnico-gateados fallan con `permission-denied`. Antes de cazar bugs raros en flujos de técnico, verificar que su `personal/{id}` doc id matchea su `auth.uid`. Riesgo activo, no resuelto.
- **Alta de empleado debe crear AMBOS docs (`personal/{auto-id}` + `usuarios/{auth.uid}`).** El sistema de auth lee de `usuarios/{auth.uid}` para decidir rol y permisos en rules. Cuando solo se crea `personal/{...}` (con `uid: auth.uid` adentro), la cascada de fallback de `AppContext` carga el perfil pero `userProfile.id == personalDocId !== auth.uid`. Eso causó el bug de Reactivación (`afc5e4a`) — ver gotcha "userProfile.id NO siempre es auth.uid". El backfill `scripts/backfill-usuarios-desde-personal.ts` migra empleados existentes; para altas nuevas el formulario `GestionUsuarios` debe crear el doc en `usuarios/{uid}` además del `personal/{auto-id}`. Sin esto, los `permission-denied` reaparecen para cualquier rule futura que valide contra `userId == auth.uid`.

## Related docs in repo

- `README.md` — setup and module list.
- `CONTEXTO_PROYECTO.md` — deeper architecture reference (some sections predate recent refactors; treat as historical context, verify against current code).
- `CONTEXTO_PAGINA_WEB.md` — public-website requirements and Firestore-permission matrix for public pages.
- `PROMPTS-CLAUDE-CODE.md` — saved prompts the owner reuses.

## Multi-agent workflow (`.claude/agents/`)

Este repo tiene un equipo de 5 agentes especializados que trabajan en conjunto:

| Agente | Especialidad |
|---|---|
| `coordinator` | Único interfaz con Jorge. Descompone pedidos y delega. |
| `builder` | Implementa código siguiendo estas convenciones. |
| `tester` | Typecheck + lint + regresiones conocidas antes del commit. |
| `reviewer` | Code review independiente con ojos frescos. |
| `devops` | Monitorea Vercel + GitHub, dispara Deploy Hook si el webhook se atora. |

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
