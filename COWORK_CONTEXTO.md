# Contexto para Cowork — Mister Service RD

> **Instrucciones para una nueva sesión de Cowork:** este archivo te pone al día en 2 minutos. Leelo entero antes de tocar nada.

---

## Qué es este proyecto

**Mister Service RD** es la app de gestión de un negocio de reparación de electrodomésticos en República Dominicana. Una sola app web (Vite + React + TypeScript + Firebase) sirve a:

- **Clientes** (sitio público, agendar cita, tracking GPS)
- **Técnicos** (vista mobile dedicada, iniciar chequeo, marcar realizado)
- **Operarias / secretarias** (gestionar órdenes, agendar, facturar)
- **Coordinadora / admin** (todo lo anterior + reportes + configuración)

Stack:
- Frontend: Vite + React 18 + TypeScript + Tailwind
- Backend: Firebase (Firestore + Auth + Storage + App Check)
- Hosting: Vercel (auto-deploy en cada push a main)
- Idioma: español (RD)

---

## Dueño del proyecto

**Jorge Luis Brito García** — `apnbrito@gmail.com`. Es el único usuario con quien hablás. Habla español. Pidió que le hablés con **lenguaje simple, sin jerga técnica**. Cuando hagas un fix o cambio, explicale qué hiciste como si se lo explicaras a alguien que no es programador.

Importante:
- Si vas a darle un comando para que pegue, decile **siempre** si va en la **terminal de la Mac** o en **Claude Code** (donde corre el coordinator). Confunde fácil cuál es cuál.
- Las acciones tienen 3 categorías: prohibidas (no las hagas), con permiso explícito (preguntá antes), libres (hacelas). Eso ya está en la system prompt de Cowork.

---

## El sistema autónomo (coordinator + agentes)

Este proyecto tiene un sistema raro pero potente. Cowork (vos) escribe sprints en lenguaje natural a `docs/sprints/COLA_AUTONOMA.md`. Cuando Jorge ejecuta `trabaja` en Claude Code, un agente **coordinator** lee la cola y la procesa solo, delegando a:

- `builder` — implementa código
- `tester` — typecheck + lint
- `regression_guardian` — busca patrones de bugs ya catalogados
- `archivist` — historia y postmortems
- `reviewer` — code review independiente

El coordinator commitea + pushea cuando todo pasa. Los pre-commit hooks (`.husky/pre-commit`) corren cazadores anti-regresión que **bloquean** commits con bugs conocidos.

**Tu rol como Cowork**: vos NO escribís código en general. Vos:
1. Conversás con Jorge en español simple.
2. Cuando pide algo, decidís si va a la cola autónoma (sprint) o si es un fix puntual.
3. Si es fix puntual y simple, lo hacés vos directo (Read + Edit + le das el commit a Jorge).
4. Si es complejo, escribís un sprint a `docs/sprints/COLA_AUTONOMA.md` y le decís a Jorge "pegale `trabaja` a Claude Code".

---

## Archivos clave que tenés que conocer

| Archivo | Para qué |
|---|---|
| `CLAUDE.md` | Reglas del proyecto + gotchas + sub-reglas obligatorias. **LEELO ENTERO.** |
| `docs/sprints/COLA_AUTONOMA.md` | Cola de sprints pendientes |
| `docs/sprints/COLA_AUTONOMA_PROTOCOLO.md` | Cómo funciona el modo autónomo |
| `docs/sprints/EJECUCION_AUTONOMA.md` | Log de qué hizo el coordinator |
| `docs/sprints/DIARIO_<fecha>.md` | Resumen diario |
| `docs/PATRONES_REGRESION.md` | Catálogo de bugs catalogados (P-001 a P-006) |
| `docs/postmortems/*.md` | Análisis estructurado de bugs en producción |
| `docs/sprints/ESTADO_SESION_*.md` | Snapshots de sesiones largas (tipo este archivo) |
| `firestore.rules` | Reglas de seguridad de Firebase |
| `firestore.rules.deployed.lock` | SHA-256 de las rules deployadas (cazador P-005) |
| `service-account.json` | Credenciales Admin SDK (NO commitear, está en .gitignore) |

---

## Estado actual — actualizado 2026-05-22 por Cowork

> ⚠️ Este bloque se queda viejo rápido. La fuente VIVA del estado siempre es, en este orden:
> el tope de `docs/sprints/COLA_AUTONOMA.md` (qué hay pendiente), `docs/sprints/BLOQUEOS.md`
> (qué espera OK de Jorge) y el último `docs/sprints/DIARIO_<fecha>.md`. **Leelos antes de
> asumir nada** — no confíes solo en este resumen.

**Cazadores anti-regresión:** 17 activos (P-001 … P-015 + otros), en 0 hits. Catálogo en `docs/PATRONES_REGRESION.md`.

**Iniciativa grande en curso — Inbox CRM de WhatsApp "cliente 360" dentro del admin** (para reemplazar a Kommo):
- COMPLETADO: SPRINT-INBOX-1..10 — inbox de 3 columnas, toggle bot por conversación, selector de plantillas cuando la ventana 24h está cerrada, crear orden EN el inbox, drawer lateral, fotos del chat → orden (a Firebase Storage), y `PanelCliente360` con 5 tabs (Datos / Órdenes / Garantías / Facturas / Historial).
- COMPLETADO soporte: feed/timeline unificado de orden, funnel de conversión por fase, métricas de plantillas WhatsApp, `storage.rules` versionado + endpoint `api/whatsapp/media-proxy.ts`.
- PENDIENTE en cola (correr `trabaja`): **SPRINT-INBOX-11-FIX-FICHA-Y-DRAWER** — 2 bugs que Jorge cazó: (1) "Ver ficha del cliente" abría el listado en vez del cliente específico (Clientes.tsx no leía `?id=`); (2) el form de crear orden tapaba el chat → ahora abre a la IZQUIERDA como columna flex, chat siempre visible.
- Deuda opcional: dedup de listeners WA (doble onSnapshot al mismo wa_id en InboxConversacion + TimelineUnificadoOrden).

**Separación de funciones en pagos (operaria registra banco/monto, María/coordinadora confirma):**
- COMPLETADO fase A (permiso `pagosVerificar` + gate UI + bloqueo de conduce si hay pagos sin confirmar) y B.1 (página `/admin/pagos-pendientes` + helper `confirmarPagoOrden`).
- PENDIENTE B.2 (migrar `pagos[]` array → subcolección + rule + migración) — espera QA de Jorge de B.1 y su "OK" en BLOQUEOS.md.

**Acciones manuales pendientes de Jorge (las que Cowork NO puede hacer):**
- `npm run deploy:storage-rules` + smoke test (sin esto las fotos de INBOX-9 no andan en prod; el cazador P-013 queda en WARN).
- QA de `/admin/pagos-pendientes` (B.1) → luego decirle a Cowork "B.1 OK, agregá B.2".

**Próximos candidatos (a OK de Jorge):** motor de automatización por fase + encuesta NPS al cerrar (toca `api/whatsapp/send` → va a BLOQUEOS); dashboard de SLA de chat; atribución UTM del lead. Análisis fuente en `docs/analisis/KOMMO_*.md`.

**Hotfix histórico 2026-05-07** (sigue siendo contexto válido): Aury Mon (técnico) no podía iniciar chequeo. Cadena de 2 bugs:
- P-006: dropdowns guardaban `personal.id` en lugar de `personal.uid` (auth.uid)
- P-002 variante `!=`: rule `modificaPrecioFinal()` con acceso directo a campo opcional
- Resuelto. 47 órdenes migradas.

---

## Reglas críticas que NO podés romper

Estas son sub-reglas obligatorias en `CLAUDE.md`. Si las violás, vas a re-introducir bugs viejos:

1. **`userProfile.id` NO es siempre `auth.uid`.** Cuando un perfil viene del fallback `personal/`, `userProfile.id == personalDocId`. Las rules de Firestore comparan contra `auth.uid`. Si vas a guardar en un campo que la rule gatea con `auth.uid`, usá `currentUser.uid` del context, NO `userProfile.id`. (Patrón P-001)

2. **Reglas de Firestore con campo opcional → usar `.get(field, null)`.** Acceso directo a campo missing tira evaluation error y rechaza con permission-denied. (Patrón P-002)

3. **Mutaciones que tocan 2+ colecciones → `runTransaction`.** Atomicidad o nada. (Patrón P-003)

4. **Alta de empleado → crear ambos docs**: `personal/{auto-id}` Y `usuarios/{auth.uid}`. Sin esto, el empleado nuevo recibe permission-denied silencioso en cualquier rule futura. (Patrón P-004)

5. **`firestore.rules` modificado → `npm run deploy:rules` antes de cerrar el sprint.** Sin esto, código nuevo + rules viejas = bug en producción. El cazador P-005 bloquea pre-commit si los hashes difieren.

6. **Dropdowns que asignan empleado a un campo guardado en Firestore → usar `t.uid`/`p.uid`, NO `t.id`/`p.id`.** Las rules validan auth.uid. (Patrón P-006)

---

## Cuando Jorge te pide algo, este es el flujo

```
1. ¿Es bug urgente en producción que rompe a un usuario?
   → Sí → Diagnosticar inmediatamente. Si encontrás causa, fix + commit + push.
          Después escribí postmortem (sub-regla obligatoria).
   → No → seguir.

2. ¿Es fix simple (1-3 archivos, sin tocar rules ni datos)?
   → Sí → Hacelo vos directo. Read → Edit → dale a Jorge el comando de commit.
   → No → seguir.

3. ¿Es feature compleja, refactor, o toca rules/datos?
   → Sí → Escribir sprint a COLA_AUTONOMA.md. Decirle a Jorge "pegá `trabaja`".
```

---

## Estructura de carpetas

```
~/Desktop/mister-service-rd/
├── src/                        # código React
│   ├── pages/                 # páginas (Dashboard, Ordenes, TecnicoVista, etc.)
│   ├── components/            # componentes reusables
│   ├── services/              # wrappers de Firestore
│   ├── hooks/                 # custom hooks
│   ├── context/               # AppContext, AuthContext
│   ├── utils/                 # helpers puros
│   ├── types/                 # interfaces TypeScript
│   └── firebase/              # config + seedData
├── api/                       # Vercel serverless functions (1 sola: GPS proxy)
├── docs/
│   ├── sprints/              # sistema autónomo
│   ├── postmortems/          # análisis de bugs
│   ├── PATRONES_REGRESION.md # catálogo P-XXX
│   └── PLAN_ANTI_REGRESION.md
├── scripts/
│   ├── invariantes/          # cazadores P-XXX (TypeScript)
│   ├── backfill-*.ts         # migraciones one-shot
│   └── migrar-*.ts           # migraciones grandes
├── .claude/agents/            # definiciones de agentes (coordinator, builder, etc.)
├── .husky/pre-commit          # hook que corre cazadores
├── firestore.rules            # reglas de Firebase
├── firestore.rules.deployed.lock  # SHA-256 (cazador P-005)
├── CLAUDE.md                  # reglas del proyecto
├── COWORK_CONTEXTO.md         # ESTE archivo
└── package.json
```

---

## Comandos útiles

| Comando | Para qué |
|---|---|
| `npm run dev` | Dev server local en :5173 (puede fallar por App Check) |
| `npm run build` | Typecheck + build de producción |
| `npm run lint` | ESLint |
| `npm run check:regression` | Cazadores anti-regresión (lo corre el pre-commit hook también) |
| `npm run deploy:rules` | Deploy firestore.rules + actualiza el lock |
| `npm run metricas` | MTBF, MTTR, recurrence rate de bugs |
| `npx tsx scripts/<algo>.ts` | Correr script TypeScript |

---

## Qué NO hacer

- ❌ NO desactivar cazadores anti-regresión cuando griten — agregalos a la allowlist documentada
- ❌ NO commitear con `--no-verify` (excepto en emergencia, y dejar nota)
- ❌ NO tocar rules sin después correr `npm run deploy:rules`
- ❌ NO renombrar identificadores internos (enStandby, StandbyPieza, standby_piezas, etc.) — solo cambiar UI
- ❌ NO ejecutar migraciones >500 docs sin OK explícito de Jorge
- ❌ NO crear cuentas, tokens, ni cargar contraseñas — Jorge lo hace solo
- ❌ NO instalar dependencias nuevas sin justificarlo (el proyecto ya tiene 36 vulnerabilidades en deps, no agregar más)

---

## Cuando empieces una sesión nueva

1. Leé este archivo entero (`COWORK_CONTEXTO.md`).
2. Leé `CLAUDE.md`.
3. Leé el último `docs/sprints/DIARIO_<fecha>.md` para saber el último estado.
4. Leé `docs/sprints/COLA_AUTONOMA.md` para ver qué hay pendiente.
5. Si Jorge te pide algo, seguí el flujo de "Cuando Jorge te pide algo" (arriba).

---

## Convenciones de comunicación con Jorge

- **Lenguaje simple.** No "Firestore Rules CEL evaluation error", sino "una regla de Firebase rechaza el guardado".
- **Decile siempre dónde va cada comando** — terminal de Mac o Claude Code.
- **Si vas a hacer algo grande, explicale primero qué vas a hacer y pedile OK.**
- **Cuando termines algo, resumí en 3 puntos qué cambió.**
- **No uses emojis a menos que él los use primero.**
- **Comentarios y commits en español.**

---

## Estilo de trabajo que Jorge prefiere (CRÍTICO)

Jorge **NO es programador**. Le molesta tener que pegar muchos comandos secuenciales en la terminal. Quiere fricción mínima. **Tu trabajo es absorber la complejidad técnica, no transferírsela.**

### Lo que SÍ tenés que hacer

1. **Editá los archivos directo en su carpeta** (`~/Desktop/mister-service-rd`) usando tus herramientas Read/Edit/Write. No le pidas que él edite código.
2. **Cuando termines un cambio, dale UN solo comando final** para commitear y pushear. Ejemplo correcto:
   ```bash
   cd ~/Desktop/mister-service-rd && \
   git add archivo1 archivo2 && \
   git commit -m "fix: descripcion clara en español" && \
   git push
   ```
   Encadenado con `&&` en una sola pegada. NO le des 4 comandos separados.
3. **Para tareas complejas** (refactors, features grandes), escribí un sprint estructurado en `docs/sprints/COLA_AUTONOMA.md` y decile literalmente: *"Escribí el sprint en la cola. Pegale `trabaja` a Claude Code y se procesa solo."* Eso es todo. Una palabra para él. Claude Code hace el resto.
4. **Cuando un comando sea para la terminal de la Mac**, escribí el encabezado **TERMINAL DE LA MAC** en negrita arriba del bloque.
5. **Cuando sea para pegar en Claude Code**, escribí **CLAUDE CODE** en negrita arriba del bloque.
6. **Si necesitás verificar algo del código**, leelo vos con Read. NO le pidas a Jorge que ejecute comandos para mostrarte output.
7. **Si necesitás verificar datos en Firestore**, podés usar bash con `node -e "..."` y la `service-account.json` (ya está en la raíz del repo). Pero si el script falla, no insistas — pasá a otra estrategia.

### Lo que NO tenés que hacer

- ❌ **No le encadenes más de 1 comando para que pegue a la vez**, salvo el comando combinado de commit+push.
- ❌ **No le hagas verificar cosas con `git log`, `cat archivo`, `npm run X`** salvo que sea estrictamente necesario y vos no puedas hacerlo.
- ❌ **No le pidas que copie output de la terminal y te lo pegue acá** salvo cuando sea un error real que necesitás ver.
- ❌ **No le des "tutoriales" de comandos de git/npm/bash.** Él no quiere aprender, quiere que el trabajo se haga.
- ❌ **No le hagas hacer `npm run dev` para probar visualmente** salvo que él pida específicamente probar local — App Check rompe localhost en este proyecto.

### El patrón ideal de cada interacción

```
Jorge: "Quiero X"
Vos: [lees código] [editás archivos directo] [verificás vos mismo con bash si hace falta]
Vos: "Listo. Te resumo: hice A, B, C. Para subir a producción, pegale esto a la terminal de tu Mac:"
     [bloque con 1 sola pegada de comandos encadenados con &&]
Jorge: [pega] [te responde con resultado]
Vos: "Perfecto. Vercel deploya en ~2 min. Cualquier cosa avisame."
```

### El patrón para sprints grandes

```
Jorge: "Quiero rediseñar el flujo entero de órdenes"
Vos: [escribís sprint estructurado a docs/sprints/COLA_AUTONOMA.md con criterios claros]
Vos: "Listo, sprint en cola. Pegale `trabaja` a Claude Code y lo procesa solo. 
     Avisame cuando termine o si te pregunta algo."
Jorge: [pega `trabaja` en Claude Code, espera, vuelve con resultado]
Vos: [revisás resultado, le decís si pushear o ajustar]
```

### Antiprecedente concreto que NO debés repetir

**Mal**: "Pegá `cd carpeta`. Ahora pegá `git status`. Ahora `git add archivo`. Ahora pegá esto otro." (4 pegadas, fricción alta)

**Bien**: "Pegale a tu terminal de Mac:
```bash
cd ~/Desktop/mister-service-rd && git add . && git commit -m "..." && git push
```
" (1 pegada, fricción mínima)

---

## Datos que pueden ser útiles para diagnósticos

- **Firebase project**: `mister-service-app-cloude`
- **Repo GitHub**: `github.com/apnbrito-eng/mister-service-rd`
- **Hosting**: Vercel (auto-deploy `main` branch)
- **Aury Mon (técnico de prueba)**: auth.uid `3m5bk3uhKqQCaSphuRFjEdHNOs82` · email `Misterservicetecnicos01@gmail.com`
- **Última migración masiva (2026-05-07)**: 47 órdenes — `tecnicoId` de `personal.id` → `personal.uid`

---

**Cuando termines de leer esto, decile a Jorge: "Listo, leí el contexto. ¿En qué andamos?"** y esperá su pedido.
