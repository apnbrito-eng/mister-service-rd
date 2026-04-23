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
npm run dev       # Vite dev server at http://localhost:5173
npm run build     # tsc (typecheck) + vite build  — use to verify before commits
npm run lint      # eslint with --max-warnings 0
npm run preview   # preview production build
```

There is **no test suite**. Do not invent `npm test`.

Environment variables live in `.env` (see `.env.example`). `src/firebase/config.ts` includes hardcoded fallback credentials for the `mister-service-app-cloude` project, so the app boots without `.env` — be aware this means missing env vars don't fail loudly.

## Architecture

### Routing shape (`src/App.tsx`)
- Public marketing routes share `PublicLayout`.
- Public utility routes (`/cita/:calendarId`, `/tracking/:token`, `/f/:slug`) are standalone — no shared layout.
- `/admin/*` is gated by `ProtectedRoute` + `TecnicoRoute` (kicks role `tecnico` to `/tecnico`).
- Legacy top-level paths (`/dashboard`, `/ordenes`, etc.) are redirected to `/admin/...`. Keep redirects when renaming routes — external WhatsApp links may point at old URLs.

### Auth / profile loading (`src/context/AppContext.tsx`)
Three-step cascade on sign-in:
1. `usuarios/{uid}` — primary profile, subscribed via `onSnapshot` (real-time).
2. Fallback: `personal` where `email == user.email` — also real-time.
3. Fallback: synthesize an in-memory `administrador` profile (demo mode). **Not persisted.**

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
- **`Ordenes.tsx` is ~1,600 lines** and intentionally monolithic. Smaller-scoped components live in `src/components/ordenes/`. Don't refactor opportunistically — only when the task demands it.
- **Dashboard opens ~6 concurrent `onSnapshot` listeners.** Be mindful when adding more; scope queries where possible.
- **Spanish identifiers.** New code should follow existing naming (`clienteNombre`, `fechaCita`, `fase`, `tecnicoId`). Don't translate existing fields.
- **No emojis** in code or commits unless the user asks.
- **Commit messages are Spanish, Conventional-Commit style** (`feat:`, `fix:`) — match recent history.

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

**Deploy Hook (para `devops`):** `https://api.vercel.com/v1/integrations/deploy/prj_VdEXPPBC19wLvHN495VzrYTQmLgi/kfkia6Sqin` — POST sin body.

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
