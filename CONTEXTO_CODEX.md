# Contexto completo para Codex — Mister Service RD

> **Qué es este archivo.** Un briefing autocontenido para que Codex (o cualquier agente nuevo) entienda el negocio, el software, el equipo de agentes y el modo de trabajo del repo `mister-service-rd` sin tener que reconstruirlo leyendo 40 documentos.
>
> **Fuente:** repo en `~/Desktop/mister-service-rd`, estado al 20 de septiembre de 2026.
> **Dueño / único interlocutor humano:** Jorge Luis Brito García — fundador, no técnico, habla español y suele dictar por voz.

---

## 0. Cómo usar este documento

1. Ponelo en la raíz del repo como `CONTEXTO_CODEX.md`.
2. En `AGENTS.md` agregá al inicio: `> Leer primero CONTEXTO_CODEX.md.`
3. Orden de lectura recomendado para cualquier agente al arrancar:
   `CONTEXTO_CODEX.md` → `docs/sprints/MEMORIA_MAESTRA.md` → `docs/mapa/PROMPT_SISTEMA.md` → `AGENTS.md` (convenciones finas) → la sección del módulo en `docs/sprints/MAPA_RIESGOS_MODULOS.md`.

---

## 1. El negocio

**Mister Service RD** es un negocio dominicano de reparación, mantenimiento y venta de electrodomésticos, con sede en Santo Domingo.

- **Servicios:** lavadoras, secadoras, aires acondicionados (venta + instalación), estufas, neveras, extractores.
- **Marcas:** Whirlpool, Mabe, Frigidaire, General Electric.
- **Roles reales del negocio:** administrador (Jorge), secretarias, coordinadora, operarias, técnicos de campo.
- **Flujo operativo real:**
  1. El cliente escribe por **WhatsApp** (es la base de toda la comunicación con el cliente).
  2. La secretaria atiende y coordina la cita.
  3. El técnico visita.
  4. **Reparación:** el técnico cotiza la falla *durante* la visita. **Mantenimiento:** se cotiza *antes* de la visita.
- **Base instalada:** 10,000+ clientes reales que han escrito por WhatsApp.
- **Moneda:** `RD$`. **Idioma:** español en toda la UI, los identificadores del código y los mensajes de commit.

**Contexto crítico:** el software **todavía no está en uso productivo pleno**. No inventar testimonios, casos de éxito ni datos de relleno (ver regla dura en §7).

---

## 2. Stack y plataforma

| Capa | Tecnología |
|---|---|
| Frontend | Vite + React 18 + TypeScript + Tailwind CSS (SPA única) |
| Routing | react-router-dom 6 |
| Datos / auth / archivos | Firebase — Firestore, Auth, Storage (proyecto `mister-service-app-cloude`) |
| Backend | Sin REST propio salvo funciones serverless en `api/` (runtime `@vercel/node`) |
| Hosting | Vercel — proyecto `mister-service-rd`, org `misterservicerd-8290s-projects` |
| Repo | `github.com/apnbrito-eng/mister-service-rd`, rama `main` |
| Producción | `https://www.misterservicerd.com` |
| Mapas | Google Maps API + Leaflet (+ heat, markercluster) |
| IA | `@anthropic-ai/sdk` (asistente IA interno, endpoints `api/ai/*`) |
| Otros | date-fns (locale `es`), lucide-react, react-hot-toast, js-yaml |
| Calidad | ESLint 8, TypeScript 5.2, Vitest 2, `@firebase/rules-unit-testing`, Husky |

**Deploy Hook de emergencia** (si el webhook GitHub→Vercel se atora, POST sin body):
`https://api.vercel.com/v1/integrations/deploy/prj_VdEXPPBC19wLvHN495VzrYTQmLgi/dqfSS3mCJK`

---

## 3. Comandos

```bash
npm run dev                 # Vite dev server → http://localhost:5173
npm run build               # tsc (src) + tsc -p tsconfig.api.json + vite build
npm run typecheck:api       # api/ + scripts/ en strict
npm run lint                # eslint sobre todo el repo (pre-commit usa --max-warnings 0)
npm run preview             # preview del build de producción

npm run test:rules          # emulador Firestore + vitest sobre tests/rules/ (requiere Java 11+)
npm run check:regression    # corre TODOS los cazadores de scripts/invariantes/
npm run check:regression:ci # idem, modo CI
npm run audit:schema-drift  # scripts/auditoria/schema-drift.ts
npm run metricas            # MTBF/MTTR/recurrencia → docs/sprints/METRICAS_<fecha>.md
npm run mapa                # regenera docs/mapa/* (SVG + Mermaid + HTML + PROMPT_SISTEMA.md)

npm run deploy:rules            # firebase deploy firestore:rules + actualiza el .lock
npm run deploy:storage-rules    # firebase deploy storage + actualiza el .lock
npm run deploy:indexes          # firebase deploy firestore:indexes
```

> **No inventes `npm test`.** El único script de pruebas automatizadas es `test:rules` (45 casos). No hay tests unitarios ni E2E automatizados. El QA funcional es manual (agente `qa`) o asistido por navegador (Playwright MCP).

**Variables de entorno:** viven en `.env` (plantilla en `.env.example`). Las 6 `VITE_FIREBASE_*` son obligatorias — `src/firebase/config.ts` hace fail-fast explícito si falta alguna (se quitó el fallback hardcodeado por seguridad). En Vercel están en Project Settings → Environment Variables; verificar las 6 antes de cada deploy.

---

## 4. Arquitectura

### 4.1 Tres audiencias en una sola SPA

1. **Sitio público de marketing** — `/`, `/servicios`, `/agendar` bajo `PublicLayout`.
2. **Flujos públicos standalone** (sin auth, sin chrome) — `/cita/:calendarId`, `/tracking/:token`, `/f/:slug`, portal de cliente y garantía por token.
3. **Admin interno** — `/admin/*`, protegido por `ProtectedRoute` + `TecnicoRoute`. El rol `tecnico` es redirigido a `/tecnico` (vista móvil).

Las rutas legacy de primer nivel (`/dashboard`, `/ordenes`, …) redirigen a `/admin/...`. **Mantener esos redirects al renombrar rutas** — hay enlaces de WhatsApp viejos apuntando ahí.

### 4.2 Auth y carga de perfil (`src/context/AppContext.tsx`)

Cascada de dos pasos al iniciar sesión, ambas en tiempo real (`onSnapshot`):

1. `usuarios/{uid}` — perfil primario.
2. Fallback: `personal` donde `email == user.email`.

Si ninguna colección tiene perfil, `AppContext` setea `authError` y `ProtectedRoute` muestra "Perfil no encontrado" con botón de cerrar sesión. **No hay modo demo** — se eliminó en el audit fix C3 porque sintetizaba un perfil `administrador` en memoria y permitía escalación silenciosa de privilegios a cualquier email autenticado.

> ⚠️ **`userProfile.id` NO siempre es `auth.uid`.** Si el perfil vino por el fallback de `personal`, `id` es el doc id de `personal`. Toda escritura gateada por rules con `request.resource.data.X == request.auth.uid` debe usar `currentUser.uid` del context, nunca `userProfile.id`.

### 4.3 Capa de datos

Todo persiste en Firestore + Storage. Los servicios en `src/services/` envuelven el acceso:

- `contadores.service.ts` — contadores **transaccionales** de numeración (`OS-####`, `QT-#####`, `FAC-#####`, `CG-#####`). Única fuente válida; nunca generar números en el cliente.
- `clientes.service.ts` — CRUD de clientes + normalización de teléfono.
- `gps.service.ts` — lee `config_gps/sistema`; soporta Wialon / Samsara / Traccar / Fleet Complete / API personalizada; streamea `ubicaciones_vehiculos`. **Las llamadas directas al proveedor chocan con CORS** — usar el proxy `api/gps/ubicacion`.
- `storage.service.ts` — subida de fotos de cierre.
- `formularios.service.ts`, `solicitudes.service.ts`, `empresasAliadas.service.ts`, `configWeb.service.ts` — sistema de formularios dinámicos y web pública.

### 4.4 Colecciones Firestore

**Core:** `ordenes_servicio`, `clientes`, `personal`, `usuarios`, `citas_por_confirmar`, `cotizaciones`, `facturas`, `equipos_taller`, `productos`, `standby_piezas`, `gastos`, `mantenimientos`, `calendarios`, `ubicaciones_vehiculos`, `config` (contadores + flags), `config_gps`.

**Dinero / RRHH:** `comisiones`, `nomina`, `prestamos`, `avances`, `bancos`.

**Formularios y web:** `formularios`, `solicitudes`, `empresas_aliadas`, `config_web`.

**Operación / auditoría:** `auditoria`, `auditoria_admin`, `notificaciones`, `campanas_marketing`.

> **Antes de `addDoc`/`setDoc`, eliminar los campos `undefined`.** Firestore los rechaza.

### 4.5 Ciclo de vida de la orden (concepto central)

`OrdenServicio.fase`:

```
nuevo_lead → en_gestion → en_diagnostico → en_cotizacion → aprobado
           → agendado → trabajo_realizado → cerrado        (o cancelado)
```

Conviven campos paralelos más gruesos (`estadoSimple`, `estado`) más `historialFases` y `auditoria` opcional — **mantenerlos sincronizados** al mutar una orden. `utils/index.ts` exporta `parseOrden()`, `faseLabel()`, `faseColor()`, `getAlertasFromOrdenes()`, `crearRegistroAuditoria()`. Preferirlos a lógica ad-hoc.

El **cierre** tiene dos formas en `CierreServicio`: la nueva (`equipoFunciona`, `clienteSatisfecho`, `revisoConexiones`, `fotoCierre`) y una legacy (`piezasRetiradas`, `checklist`, `satisfaccionCliente`). Leer ambas al renderizar histórico; **escribir solo la nueva**.

`historialFases` y `auditoria` son **append-only** — siempre `arrayUnion`, nunca reemplazo.

### 4.6 Formularios dinámicos

El admin construye formularios en `FormularioEditor` → colección `formularios`. El público envía en `/f/:slug` → colección `solicitudes`. Soporta campos de firma, foto y geolocalización (`src/components/public/CampoFormulario.tsx`). Se quitaron los índices compuestos de las queries — preferir filtrado/orden en cliente para no reintroducirlos.

### 4.7 Endpoints serverless (`api/`)

| Ruta | Qué hace |
|---|---|
| `api/admin/crear-usuario.ts`, `cambiar-correo.ts`, `reset-password.ts` | Gestión de cuentas vía Firebase Admin |
| `api/ai/chat.ts`, `borrador.ts`, `conocimiento.ts` | Asistente IA interno (Anthropic SDK) |
| `api/whatsapp/send.ts`, `webhook.ts`, `media-proxy.ts` | Integración WhatsApp (envío, webhook entrante con HMAC, proxy de media) |
| `api/gps/ubicacion.ts` | Proxy GPS (evita CORS) |
| `api/portal-cliente/[token].ts`, `[token]/posponer.ts` | Portal de cliente por token |
| `api/garantia/[token].ts`, `api/feedback/[token].ts` | Garantía y feedback por token |
| `api/marketing/resumen.ts` | Resumen de marketing |
| `api/_lib/` | `firebaseAdmin`, `iaTools` (84 KB — herramientas del asistente), `whatsappWebhook`, `manejarErrorMeta`, etc. |

> **`@vercel/node` ignora `export const config = { api: {...} }`** (eso es del Pages Router de Next). Para parsear body, usar el patrón defensivo de `api/admin/crear-usuario.ts:140` y `api/whatsapp/send.ts:548-571`: aceptar `string | object | null` con fallback a `JSON.parse`. **Todo endpoint nuevo se prueba con `curl` real antes de cerrar el sprint.** El webhook entrante sí necesita el body raw (`req.on('data')`) por la firma HMAC.

### 4.8 Módulos de la app (páginas en `src/pages/`)

**Operación:** Dashboard · Órdenes · OrdenDetalle · Citas · CitaPublica · Calendario · Calendarios · AgendaDia · MapaRutas · Reprogramaciones · SugerenciasChequeo · Standby · Mantenimiento · EquiposTaller · CierreDia · HistorialAnuladas · TecnicoVista · TrackingCliente

**Comercial / clientes:** Clientes · Cotizaciones · PreciosServicios · EmpresasAliadas · Solicitudes · Formularios · FormularioEditor · Feedback

**Dinero:** Facturas · FacturacionPendiente · PagosPendientes · Comisiones · Gastos · Bancos · Nomina · Avances · Prestamos · EstadoResultado · MetricasMensuales · ReporteAvanzado · Rendimiento

**Personas:** PersonalPage · GestionUsuarios · Ponche · AdminPonches

**Comunicación / IA:** Inbox · InboxConversacion · AsistenteIA · AsistenteIAHistorial · ConocimientoEquipo · Notificaciones · MarketingIntegrado · ConfiguracionMarketing

**Configuración / web pública:** Configuracion · ConfiguracionWeb · `public/HomePage` · `public/ServiciosPage` · `public/ServicioDetalle` · `public/AgendarPage` · `public/FormularioPublico` · `public/PortalCliente` · `public/GarantiaCliente`

Son **44 rutas bajo `/admin`** según el último barrido de UI.

---

## 5. El equipo de agentes

Los agentes viven en **`.codex/agents/*.toml`** (formato Codex: `name`, `description`, `developer_instructions`) y en **`.claude/agents/*.md`** (formato Claude Code, con frontmatter). Los dos sets son espejo; el `.codex/` es el que Codex lee. Config MCP de Codex en `.codex/config.toml` (hoy solo registra el server `playwright`).

### 5.1 Núcleo del flujo

| Agente | Rol | Escribe código |
|---|---|---|
| `coordinator` | **Único interfaz con Jorge.** Aclara, descompone en sprints pequeños y testeables, delega, nunca escribe código. Tiene modo autónomo (§6). | No |
| `builder` | Implementa siguiendo las convenciones del repo. **Nunca commitea directo** — devuelve resumen de diff al coordinator. | Sí |
| `tester` | Gate previo al commit: `tsc --noEmit`, lint, greps de regresiones conocidas, cobertura de `parseOrden`/`parseFactura`. Devuelve **GO / NOGO**. | No |
| `regression_guardian` | Cazador **semántico** de regresiones: lee `git diff main...HEAD` contra el catálogo `docs/PATRONES_REGRESION.md`. Complementa a los cazadores determinísticos. | No |
| `reviewer` | Code review independiente con ojos frescos. Puntúa ejes (riesgo de regresión, seguridad Firestore, convenciones, duplicación, diseño) en OK / CONCERN / BLOCK. | No |
| `devops` | Monitorea Vercel + GitHub tras cada push, espera ~90 s, reporta errores concretos, dispara el Deploy Hook si el webhook se atora. | No |

### 5.2 Diseño y decisión

| Agente | Rol |
|---|---|
| `tech_lead` | Segundo en la cadena de mando. Estima tamaño (chico / medio / grande / sensible) y riesgo de regresión (bajo / medio / alto), prioriza, elige qué agentes se necesitan, facilita retrospectivas. |
| `architect` | Plan técnico **antes** de implementar features grandes. Se invoca cuando toca >2 archivos, cambia `src/types/index.ts`, afecta rules o índices, agrega rutas/permisos/roles, toca dinero o `api/*`. No escribe producción. |
| `user_advocate` | Product Designer / UX. Defiende a los usuarios reales: Jorge (no técnico, voice-to-text, quiere 2 clicks no 5), técnicos en campo, secretarias, coordinadoras, operarias y el cliente final. |

### 5.3 Auditoría y calidad

| Agente | Rol |
|---|---|
| `security` | Security Engineer. Modo pre-design (con `architect`) y post-implementación. Obligatorio cuando se tocan Firestore Rules, auth, `api/*`, App Check, datos sensibles o permisos. |
| `auditor_contable` | Auditor **read-only** de módulos de dinero (pagos, facturación, comisiones, nómina, préstamos, gastos, bancos, cotizaciones, contadores). Reporta, no arregla; propone sprint propio o escala a `BLOQUEOS.md`. |
| `qa` | QA Lead. Produce checklists de validación **manual** para Jorge. Va después de `tester` GO y antes de `reviewer`. Nunca se omite en sprints medianos, grandes o sensibles. |
| `mejora_continua` | Continuous Improvement Engineer. Única visión holística código + negocio. Detecta patrones problemáticos cross-archivo y deuda técnica priorizada; exige que toda propuesta sea coherente con la arquitectura existente. |
| `guardian_logica` | Guardián de la lógica de negocio (presente en `.claude/agents/`). |

### 5.4 Memoria del sistema

| Agente | Qué mantiene | Ve… |
|---|---|---|
| `memoria` | `docs/sprints/MEMORIA_MAESTRA.md` + `docs/sprints/MAPA_RIESGOS_MODULOS.md` | **el AHORA** — qué falta, qué se hizo, decisiones de Jorge |
| `archivist` | `docs/postmortems/` + métricas del loop de mejora | **el TIEMPO** — incidentes, causas raíz, tendencias |
| `cartografo` | `docs/mapa/MAPA_MENTAL.yaml` y sus 4 salidas | **la ESTRUCTURA** — módulos, dependencias, colecciones, integraciones |
| `docs` | `AGENTS.md`, `README.md`, `docs/sprints/*`, comentarios clave | la documentación sincronizada |

Los tres primeros **no se solapan**: la memoria apunta a la cola y los diarios, no los copia.

### 5.5 Cómo se activa

Desde Codex: **`/equipo`** activa al coordinator, que delega al resto.

**Flujo típico:**
1. Jorge describe una necesidad en español conversacional.
2. El coordinator aclara si hay ambigüedad.
3. `builder` → `tester` → `regression_guardian` → `reviewer` (loop si `CHANGES_NEEDED`).
4. El coordinator entrega a Jorge el bloque `git add + commit + push` listo.
5. Jorge lo ejecuta en su Mac; al confirmar, el coordinator llama a `devops`.
6. `devops` confirma deploy Ready y avisa si hace falta hard refresh.

**Paralelización permitida:** `reviewer` + `regression_guardian` + `security` en una sola tanda post-builder (los 3 son read-only); varios `auditor_*` sobre módulos disjuntos. Regla dura: **paralelismo solo en lectura/verificación o sobre módulos disjuntos**, nunca dos agentes escribiendo el mismo archivo, máximo ~3-4 concurrentes. Commits y edits siempre secuenciales.

**Agregar o modificar agentes:** editar `.codex/agents/*.toml` (y su espejo `.claude/agents/*.md`). `name` es el identificador de invocación; `description` es lo que usa el modelo para decidir cuándo delegar.

---

## 6. Modo de trabajo

### 6.1 Modo autónomo (cola de sprints)

> Jorge dice una vez "lo que necesito" y el sistema avanza solo. Protocolo completo en `docs/sprints/COLA_AUTONOMA_PROTOCOLO.md`.

1. Jorge habla en lenguaje natural con la app de escritorio (Cowork).
2. Cowork escribe sprints estructurados en `docs/sprints/COLA_AUTONOMA.md`.
3. Jorge abre Codex y escribe **`trabaja`**.
4. El coordinator lee la cola y procesa cada sprint —`builder → tester → regression_guardian → reviewer → commit + push`— **sin pedir permiso**.
5. Al cerrar, escribe `docs/sprints/DIARIO_<fecha>.md` con un resumen de 60 segundos.

**Triggers:** `trabaja` / `procesa cola` · `procesa bloqueos` (mueve sprints con `OK: jorge ...` de vuelta a la cola) · `pausa autónomo`.

**Requiere OK explícito de Jorge** (queda en `docs/sprints/BLOQUEOS.md`):
- Cambios a `firestore.rules`
- Migraciones de datos sobre >500 docs
- Borrados masivos
- Nuevas integraciones de pago, OAuth o terceros
- Cambios a endpoints `api/` públicos

**Política de fricción mínima:** Jorge no es el correo entre Cowork y el coordinator. Cowork escribe directo a la cola; si detecta un patrón problemático, agrega un sprint sin preguntar.

### 6.2 Sistema anti-regresión (3 capas)

> Cada bug que rompió producción se convierte en un cazador ejecutable. Diseño en `docs/PLAN_ANTI_REGRESION.md`, catálogo en `docs/PATRONES_REGRESION.md` (77 KB).

1. **`scripts/invariantes/check-*.ts`** — 24+ cazadores determinísticos, corren en <5 s vía `npm run check:regression`.
2. **`regression_guardian`** — capa semántica que lee el diff.
3. **`.husky/pre-commit`** — typecheck + `check:regression` + lint de staged. Bloquea el commit. Bypass de emergencia: `git commit --no-verify`.

**Cazadores activos hoy** (`scripts/invariantes/`):

| Archivo | Qué previene |
|---|---|
| `check-userprofile-id-misuse.ts` | Usar `userProfile.id` donde la rule espera `auth.uid` |
| `check-tecnicoid-personal-id-misuse.ts` | Dropdowns que guardan `personal.id` en vez de `uid` |
| `check-rules-immutability.ts` | Inmutabilidad de campos opcionales sin `.get(field, null)` |
| `check-rules-pendientes-deploy.ts` | `firestore.rules` modificadas y sin deployar |
| `check-storage-rules-pendientes-deploy.ts` | Espejo para `storage.rules` |
| `check-alta-empleado-doble-doc.ts` | Alta de empleado sin doc espejo en `usuarios/` |
| `check-cross-collection-tx.ts` | Mutaciones cross-collection fuera de `runTransaction` |
| `check-parser-campos-faltantes.ts` | Campos nuevos de tipos que `parseOrden`/`parseFactura` no leen |
| `check-firestore-orderby-campo-no-persistido.ts` | `orderBy` sobre un campo que no se escribe en todos los paths |
| `check-numeros-documento-client-side.ts` | Numeración generada fuera de `contadores.service.ts` |
| `check-comision-sin-denormalizacion.ts` | Comisión registrada sin denormalizar en el doc factura |
| `check-comision-garantia-anula-completa.ts` | Comisión de garantía mal anulada |
| `check-billing-errors-no-silenciados.ts` | Errores de facturación tragados por un catch |
| `check-gate-conduce-pago-verificado.ts` | Conduce sin gate de pago verificado |
| `check-crearnotificacion-userid-shape.ts` / `check-notis-legacy-data-shape.ts` / `check-tipo-notificacion-huerfano.ts` | Forma y tipos de notificaciones |
| `check-listener-sin-where-rol-restringido.ts` | Listeners sin filtro de rol |
| `check-cliente-create-sin-dedup.ts` | Alta de cliente sin deduplicación por teléfono |
| `check-fase-sin-sincronizar-en-update-orden.ts` | `fase` actualizada sin sincronizar los campos paralelos |
| `check-helpers-limpieza-recursiva-firestore.ts` | Limpieza de `undefined` incompleta |
| `check-mantenimiento-clienteid-vacio.ts` | Mantenimiento sin `clienteId` |
| `check-whatsapp-idempotency.ts` / `check-whatsapp-window-24h.ts` / `check-whatsapp-webhook-hmac.ts` | Idempotencia, ventana de 24 h y firma HMAC de WhatsApp |

**Sub-reglas obligatorias:**
- Cada bug de producción cerrado produce **dos** cosas: gotcha en `AGENTS.md` **y** entrada `P-XXX` en `docs/PATRONES_REGRESION.md` + cazador en `scripts/invariantes/`.
- `regression_guardian` es obligatorio en sprints que tocan rules, services o context.
- Un sprint que toca `firestore.rules` o `storage.rules` **no cierra COMPLETADO sin deployar** (`deploy:rules` / `deploy:storage-rules` actualizan el `.lock` que los cazadores P-005/P-013 verifican).
- Si tocás `firestore.rules`, corré `npm run test:rules` **antes** de deployar.
- Cleanup de "dead code" en páginas críticas (`Ordenes.tsx`, `TecnicoVista.tsx`, `Dashboard.tsx`, `OrdenDetalle.tsx`, `IniciarChequeoButton.tsx`, wizards de cierre) exige QA manual declarado en el commit.
- **Falsos positivos:** agregar a la allowlist documentada en el header del cazador, **nunca desactivarlo**. Si la allowlist pasa de 5 entradas, refactorizar el cazador.

### 6.3 Tests de reglas de Firestore

`npm run test:rules` levanta el emulador y corre 45 casos en `tests/rules/`:

| Archivo | Casos | Cubre |
|---|---|---|
| `ordenes.rules.test.ts` | 15 | Lectura, creación y R4 completa sobre el spine del sistema |
| `publico.rules.test.ts` | 10 | Superficie sin sesión: citas, solicitudes, GPS, clientes |
| `dinero.rules.test.ts` | 10 | Comisiones por técnico, facturas, nómina |
| `auditoria.rules.test.ts` | 10 | Log append-only, notificaciones, escalada de privilegios |

**El rol no viene del token:** `firestore.rules` lo resuelve con `get()` a `usuarios/{uid}.rol`. Por eso cada test siembra los perfiles antes de actuar, y hay un caso explícito de "autenticado sin doc en `usuarios/`".

Cuatro tests marcados **`HUECO CONOCIDO`** afirman el comportamiento *actual*, no el deseado (rules permisivas aún abiertas): `citas_por_confirmar` sin validar forma, lectura pública de `ubicaciones_vehiculos`, create abierto en `auditoria_admin`, spoof de `userId` en `notificaciones`. **Si endurecés una de esas rules, invertí la aserción — no borres el test.**

### 6.4 Loop de mejora continua

1. **`docs/postmortems/`** — un archivo por incidente, formato `YYYY-MM-DD-<slug>.md`, template en `_TEMPLATE.md`. Cinco porqués hasta causa raíz estructural + acciones preventivas.
2. **`archivist`** — tres modos: PRE-CHANGE (historial git + postmortems antes de tocar el touch-list), POSTMORTEM (genera el archivo), MÉTRICAS (interpreta el output de `npm run metricas`).
3. **`scripts/metricas-mejora-continua.ts`** — MTBF, MTTR, tasa de recurrencia, catch rate, cazadores activos, tamaño de allowlist.

**Obligatorio:** `archivist` PRE-CHANGE antes de todo sprint con touch-list ≥1 archivo · `archivist` POSTMORTEM después de todo bug en producción · **un sprint hotfix no cierra COMPLETADO sin su postmortem**.

### 6.5 Touch-list expandido (antes de redactar el sprint)

Todo sprint que toque `.tsx` / `.ts` / `.rules` declara explícitamente:

1. **Archivos a modificar.**
2. **Consumidores verificados** — todos los archivos que importan el símbolo, leen el campo o llaman la función. Usar `grep -rn`, reportar archivo + líneas. Consultar `docs/MAPA_DEPENDENCIAS.md` y `docs/CAMPOS_CROSS_COLLECTION.md`.
3. **Consumidores NO afectados** — los que aparecen en el grep pero van por otra ruta. Justificar.
4. **Hallazgos laterales** — bugs latentes fuera de scope. Documentar como deuda; **no fixear silenciosamente**.

Si hay >5 consumidores con cambios concretos, dividir el sprint en fases. Si aparecen archivos no contemplados, **reescribir el sprint** — nunca procesar a medias.

También obligatorio: consultar **`docs/sprints/MAPA_RIESGOS_MODULOS.md`** antes de tocar cualquier módulo (indexa por módulo qué cazadores aplican, qué gotchas viven, qué decisiones de Jorge no se rompen y un checklist "antes de tocar"). El coordinator le pasa al builder la sección del módulo afectado.

Las tres preguntas se complementan: `archivist` PRE-CHANGE pregunta **"¿qué pasó antes?"**, el touch-list pregunta **"¿quién depende ahora?"**, el mapa de riesgos pregunta **"¿qué se sabe del módulo hoy?"**.

### 6.6 Memoria viva

`docs/sprints/MEMORIA_MAESTRA.md` es la foto siempre-actual del estado: pendiente / en curso / hecho reciente / decisiones de Jorge que no se olvidan / índice a las fuentes vivas. Es un **índice de ~1 página**, no una copia. El coordinator invoca a `memoria` en modo ACTUALIZAR al cerrar cada pasada (mover lo completado a "Hecho reciente" con hash + fecha, agregar lo nuevo a "Pendiente", refrescar la fecha).

Gatillo de Jorge para retomar contexto: **"ponte al día"** → leer `MEMORIA_MAESTRA.md` primero.

### 6.7 Mapa mental vivo

`docs/mapa/MAPA_MENTAL.yaml` es la **fuente única de verdad** de la estructura (áreas, módulos, dependencias, colecciones, integraciones, criticidad), editable a mano por Jorge en español. `npm run mapa` regenera:

- `docs/mapa/mapa.svg` — imagen visual (mandable por WhatsApp)
- `docs/mapa/mapa.mmd` — diagrama Mermaid
- `docs/mapa/explorador.html` — visor interactivo, filtra por área
- `docs/mapa/PROMPT_SISTEMA.md` — contexto en lenguaje natural que leen los agentes al arrancar, con matriz inversa "si tocás X, revisá Y"

Cada regeneración guarda copia en `docs/mapa/historico/`. Si falla una validación (módulo inexistente, dependencia circular, integración no declarada), **no regenera** y reporta. El `cartografo` **solo escribe dentro de `docs/mapa/`**.

El coordinator lo invoca al cerrar sprints estructurales: módulo agregado/quitado, dependencia cambiada, colección Firestore agregada/quitada, integración externa nueva, criticidad cambiada.

---

## 7. Convenciones y trampas del repo

### Reglas duras de proceso

- **No inventar contenido sin OK explícito de Jorge.** Si builder o coordinator creen que una página, sección, copy, testimonio o ilustración "mejoraría el diseño", **no se ejecuta**: se escala a `BLOQUEOS.md` con propuesta + 2-3 opciones. Aplica sobre todo a HomePage, Dashboard, TecnicoVista y ServiciosPage. No aplica a refactors visuales de contenido ya existente.
- **Documentación viva:** al eliminar un patrón, hacer grep en `AGENTS.md`, `CONTEXTO_PROYECTO.md`, `README.md` y `.codex/agents/*` e invertir cada referencia. Instrucciones desactualizadas hacen que un builder futuro reintroduzca vulnerabilidades.
- **Cerrar deuda implica sincronizar retros y roadmaps** que la listaban: marcar `[RESUELTO en <hash> el YYYY-MM-DD]` y **tachar** (`~~...~~`) en lugar de borrar — preserva forensia.
- **Reviewer obligatorio** cuando un sprint toca `firestore.rules`. El tester valida typecheck/lint pero no audita inmutabilidad ni defense-in-depth.
- **Commits en español, Conventional Commits** (`feat:`, `fix:`). **Sin emojis** en código ni commits salvo que Jorge lo pida.
- **Identificadores en español.** Código nuevo sigue el naming existente (`clienteNombre`, `fechaCita`, `fase`, `tecnicoId`). No traducir campos existentes.

### Trampas técnicas

- **Normalización de teléfono (RD):** quitar no-dígitos, quitar el `1` inicial si hay 11 dígitos, tomar los últimos 10. Los links de WhatsApp vuelven a anteponer el `1`. Usar los helpers de `utils/index.ts` / `utils/whatsapp.ts`.
- **Checklists hardcodeados** en `utils/checklistTemplates.ts` por `equipoTipo`. La UI no los edita.
- **Helpers que escriben Firestore y retornan datos no denormalizan solos.** `registrarComisionPorFactura` / `registrarComisionesPorItems` persisten en `comisiones`/`auditoria` pero **no** actualizan el doc factura — el caller debe hacer el `updateDoc` explícito, si no la tabla de Facturas muestra `—`.
- **Los helpers de comisiones reportan sus fallos; el caller debe avisar al usuario.** `registrarComisionesPorItems` devuelve `fallidas[]`, `registrarComisionPorFactura` devuelve `comisionesFallidas`. `registrarComisionPorOrden` nunca lanza: hay que mirar `razon === 'error interno'`.
- **No exportar funciones no-componente desde un `.tsx` de componente** (`react-refresh/only-export-components`). Extraer a `utils/index.ts` o `utils/<scope>.ts`.
- **Effects que persisten a localStorage necesitan guard "ya restauré"** (ref `yaRestauradoRef` o condicionar a `borradorEncontrado === null`); si no, pisan el borrador antes de que el usuario pueda restaurarlo. No persistir dentro del updater de `setState` — en StrictMode corre dos veces.
- **`Ordenes.tsx` (~1,600 líneas) es monolítico a propósito.** No refactorizar oportunistamente.
- **El Dashboard abre 8 `onSnapshot` concurrentes sobre colecciones completas**, ninguno filtra por período (deuda abierta, hallazgo P-2 de la auditoría del 2026-09-09). El Sidebar comparte **un solo** listener de `ordenes_servicio` para sus tres badges: si agregás otro contador derivado de órdenes, calculalo **dentro** de ese listener.
- **`api/` y `scripts/` sí pasan typecheck** vía `tsconfig.api.json`; siguen ignorados por ESLint a propósito.
- **Todo dato de Firestore interpolado en un template destinado a `document.write()`/`innerHTML` va por `escapeHtml()`** (`utils/index.ts`). Aplica en `Cotizaciones.tsx::handlePrint` y `Facturas.tsx::handlePrint` — `window.open('')` hereda el origen del opener, así que un XSS almacenado en `notas`/`descripcion` llegaba al token de sesión del admin.
- **Mutaciones cross-collection en un solo `runTransaction`, audit logs incluidos.** La verificación de idempotencia (`if (data.flag) return`) va **dentro** del callback, **después** del `tx.get()`.
- **Inmutabilidad de campos opcionales en rules requiere `.get(field, null)`.** El acceso directo falla con `permission-denied` cuando ambos lados están ausentes.
- **Antes de agregar un `orderBy` a una query**, verificar con grep que el campo se persiste a nivel raíz en **todos** los paths de escritura de la colección. Firestore excluye silenciosamente los docs sin el campo: la query retorna vacío sin error.
- **Notificaciones: el campo correcto es `userId`.** `destinatarioId` está deprecado (typing legacy solo por compat).
- **`tecnicoId` guarda `auth.uid`, no el doc id de `personal`.** Los dropdowns que asignan empleado deben usar `t.uid`/`p.uid` y filtrar `personal.filter(x => x.uid)`. Si el dropdown es solo filtro UI, marcarlo con `// @safe-tecnicoid-id: filtro UI, no escribe Firestore`.
- **`/tracking/:token` está roto en producción** y su rule pública se eliminó (exponía la orden completa sin autenticar). Migrar la página al endpoint `api/portal-cliente/[token].ts`, que devuelve campos filtrados.
- **Nunca editar las rules desde la Firebase Console.** La fuente de verdad es `firestore.rules` en la raíz.
- **Firebase Storage debe inicializarse desde la Console antes de cualquier upload del SDK** — sin eso `uploadBytes()` se cuelga en silencio. `gsutil cors set` requiere que el bucket exista (si no, 404).

### Banner de nueva versión

`vite.config.ts` inyecta el hash de commit como `__APP_VERSION__`; `public/version.json` se genera en cada build con el mismo hash; `src/hooks/useVersionCheck.ts` hace poll cada 5 min y al focus; `src/components/BannerNuevaVersion.tsx` muestra un banner fijo `z-9999` con "Recargar ahora". Montado en `App.tsx` fuera de los layouts. Elimina la necesidad de pedir hard refresh manual.

---

## 8. Documentos vivos del repo

| Archivo | Para qué |
|---|---|
| `docs/sprints/MEMORIA_MAESTRA.md` | **Leer primero.** Estado vivo: pendiente / en curso / hecho / decisiones de Jorge |
| `docs/mapa/MAPA_MENTAL.yaml` + `docs/mapa/PROMPT_SISTEMA.md` | Estructura del software, fuente única |
| `docs/sprints/COLA_AUTONOMA.md` / `COLA_AUTONOMA_PROTOCOLO.md` / `BLOQUEOS.md` | Cola de sprints y su protocolo |
| `docs/sprints/MAPA_RIESGOS_MODULOS.md` | Riesgos, cazadores y gotchas por módulo |
| `docs/PATRONES_REGRESION.md` | Catálogo `P-XXX` de bugs históricos |
| `docs/PLAN_ANTI_REGRESION.md` | Diseño del sistema de 3 capas |
| `docs/MAPA_DEPENDENCIAS.md` | Quién consume qué en cada módulo core |
| `docs/CAMPOS_CROSS_COLLECTION.md` | Campos que conectan colecciones y su regla estricta de id |
| `docs/MATRIZ_PERMISOS.md` / `MATRIZ_PERMISOS_VS_MODULOS.md` | Permisos por rol y por módulo |
| `docs/MODULO_WHATSAPP.md` | Módulo WhatsApp completo (52 KB) |
| `docs/postmortems/` | Un archivo por incidente de producción |
| `docs/QA_SUPER_USER.md` / `QA_PROMPT_MAESTRO.md` / `scripts/qa-sanity-check.ts` | Las 5 cuentas QA, el prompt E2E y su validador read-only |
| `CONTEXTO_PROYECTO.md`, `CONTEXTO_PAGINA_WEB.md`, `COWORK_CONTEXTO.md`, `README.md` | Referencias de arquitectura (algunas preceden refactors: verificar contra el código) |

---

## 9. Estado actual y pendientes conocidos

**Último trabajo (12 sep 2026):** primera suite de tests ejecutable del repo (45 casos de rules) + arreglos de UI (botón del Asistente IA ahora arrastrable con Pointer Events y posición persistida por uid; respuestas rápidas del Inbox ahora descubribles con botón de rayo).

**Verificación de ese sprint:** `tsc` src ✅ · `tsc` api ✅ · `eslint .` 0 errores ✅ · 24/24 cazadores ✅ · 45/45 tests de rules ✅

**Pendientes abiertos:**

1. Correr `npm run test:rules` **en la Mac** (se corrió en contenedor; en la Mac usa `npx firebase`).
2. **Commitear** los ~8 archivos nuevos/modificados de tests + UI.
3. Verificar los arreglos de UI en producción con Playwright después del deploy.
4. `git rm -r --cached "imagenes proyecto "` — quedó de un commit viejo; la regla ya está en `.gitignore`.
5. Decidir qué hacer con los **4 huecos caracterizados** de rules (ya tienen test, falta el arreglo).
6. **GPS en vivo sin señal desde ~abril** (muestra "Sin señal (202138 min)"): decidir si se arregla la integración o se apaga la pestaña, y arreglar el formato (6 cifras en minutos no lo lee nadie).
7. **Verificar la restricción por referrer de la API key de Google Maps** en Google Cloud Console (riesgo de facturación).
8. `/admin/clientes` bloquea toda la app con un `LoadingSpinner fullPage` mientras descarga la colección completa.
9. Dashboard: los 8 listeners sin filtro de período (el costo crece con el histórico).
10. `google.maps.places.Autocomplete` está deprecado → migrar a `PlaceAutocompleteElement` (no urgente; 6 `useRef<any>` involucrados).
11. Sidebar en pantallas de ~860px: los últimos ítems quedan fuera de vista sin indicación de scroll (menor).

---

## 10. Inconsistencias a corregir en el repo (importante para Codex)

El `AGENTS.md` actual se generó haciendo *search & replace* de "Claude" → "Codex" sobre `CLAUDE.md`, y eso dejó referencias que **no existen**. Si Codex las sigue literalmente, va a buscar archivos fantasma:

| Dice `AGENTS.md` | Realidad |
|---|---|
| `.Codex/agents/*.md` | `.codex/agents/*.toml` (minúscula, formato TOML). El espejo en Markdown es `.claude/agents/*.md` |
| `PROMPTS-Codex.md` | El archivo real es `PROMPTS-CLAUDE-CODE.md` |
| "Codex.ai/code" | No existe |
| "Codex in Chrome" / "sidepanel Codex" | Se refiere a Claude in Chrome |
| "equipo de 5 agentes" | Son **16** en `.codex/agents/` y **18** en `.claude/agents/` |
| "WhatsApp es manual, no hay Business API" | **Desactualizado**: existen `api/whatsapp/send.ts`, `webhook.ts` (HMAC), `media-proxy.ts`, el módulo Inbox, cazadores de idempotencia y de ventana de 24 h, y `docs/MODULO_WHATSAPP.md` |

Además, `.claude/agents/` tiene dos agentes que **no** están en `.codex/agents/`: **`memoria`** y **`guardian_logica`**. Si se va a trabajar en Codex, conviene portarlos a TOML — `memoria` es el que mantiene `MEMORIA_MAESTRA.md` y `MAPA_RIESGOS_MODULOS.md`, que el propio protocolo declara obligatorios.

---

## 11. Cómo hablarle a Jorge

- Español, directo, corto. Nada de explicaciones largas.
- Es **no técnico**: describir en términos de negocio, no de arquitectura.
- Usa voice-to-text — esperar typos ("cloude", "fascturar") y frases corridas sin puntuación.
- Prefiere **ejecución decidida**: hacer, y pausar solo en decisiones genuinamente críticas.
- Confirma con acuses cortos: "Continuar", "listo".
- Quiere ver KPIs rápido, alertas claras y números que cuadren. Le frustra una feature que pide 5 clicks pudiendo pedir 2.
