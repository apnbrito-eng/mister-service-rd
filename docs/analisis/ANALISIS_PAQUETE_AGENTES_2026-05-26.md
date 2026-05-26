# 🔍 Análisis del "Paquete de 5 agentes nuevos + sistema de mapa mental"

> **Para Jorge — 2026-05-26.** Disciplina explícita: ANTES de escribir una línea de código, analizamos el paquete que subiste (PDF `PAQUETE AGENTES.pdf`, 21 páginas), lo comparamos con lo que YA existe en el repo, y decidimos juntos qué instalar y qué adaptar. Esto es lo que rompe el bucle.

---

## 1. Qué propone el paquete (resumen honesto)

**Cinco agentes nuevos** en `.claude/agents/`:

1. **`cartografo`** — mantiene un mapa mental vivo del software. Una sola fuente de verdad (`docs/mapa/MAPA_MENTAL.yaml`) que vos editás a mano, y regenera tres salidas automáticamente: imagen SVG, página HTML interactiva, y un "prompt de sistema" que los otros agentes leen para entender el contexto.
2. **`product_analyst`** — analiza el uso real en producción (logs de Vercel, errores, qué pantallas se usan, datos huérfanos). Reporta semanal en `docs/insights/`.
3. **`data_integrity`** — protege la base de datos: vigila backups, prueba restores mensuales, da checklist antes de migraciones, busca documentos huérfanos y crecimiento anormal.
4. **`integrations_watcher`** — vigila APIs externas (Meta, DGII, Banreservas, Google, GPS de vans, Anthropic, Vercel, Firebase). Reporta semáforo diario y alerta tokens próximos a expirar.
5. **`customer_advocate`** — voz del cliente final que paga la reparación (no del usuario interno).

**Sistema del mapa mental** en `docs/mapa/` + `scripts/`:

- `docs/mapa/MAPA_MENTAL.yaml` — fuente única de verdad, editable por vos.
- `scripts/generar_mapa.js` — regenera Mermaid + HTML + prompt.
- `scripts/generar_svg.js` — regenera la imagen SVG.

El YAML del PDF declara 4 áreas (agendamiento, dinero, clientes, inventario) y 11 módulos con sus dependencias, colecciones de Firestore, rutas API e integraciones externas.

---

## 2. Qué ya tenemos en el repo (lo que entrega valor parecido)

| Lo que el paquete propone | Lo que YA existe en el repo | Solapamiento |
|---|---|---|
| `cartografo` → mapa mental + 3 salidas | 4 docs estáticos del mapa: `docs/MAPA_DEPENDENCIAS.md`, `docs/CAMPOS_CROSS_COLLECTION.md`, `docs/sprints/MAPA_RIESGOS_MODULOS.md`, `docs/sprints/AUDITORIA_FLUJO_DEPENDENCIAS_2026-05-25.md` | ALTO — el cartografo cubre la MISMA información (módulos, dependencias, riesgo), pero la suya es regenerada desde una sola fuente y vos la podés editar; las nuestras se mantienen a mano por distintos agentes. |
| `product_analyst` → uso real, logs, datos huérfanos | Nada parecido | NINGUNO — aporta 100% valor nuevo |
| `data_integrity` → backups, migraciones, integridad estructural | Cazadores P-001…P-024 + `auditor_contable` + `regression_guardian` + `archivist` | BAJO — los cazadores cubren patrones de código, no salud de datos. Backups y migraciones disciplinadas NO existen hoy. |
| `integrations_watcher` → vigilar APIs externas | Nada parecido (`devops` solo monitorea Vercel/GitHub) | BAJO — aporta valor nuevo |
| `customer_advocate` → voz del cliente final | `user_advocate` ya existe (cubre técnicos, secretarias, coordinadoras Y "clientes finales" en su descripción) | **ALTO — REDUNDANTE.** El propio paquete reconoce: *"o lo fusionas con user_advocate"*. |

**Agentes ya existentes en el repo (17):** architect · archivist · auditor_contable · builder · coordinator · devops · docs · guardian_logica · mejora_continua · memoria · qa · regression_guardian · reviewer · security · tech_lead · tester · user_advocate.

---

## 3. Riesgos del paquete tal como viene (si lo instalo sin pensarlo)

1. **Duplicación que recrea el bucle.** Si `cartografo` regenera su propio mapa SIN reemplazar/consolidar los 4 docs que ya tenemos, vas a terminar con 5 fuentes del mismo mapa, todas desincronizándose. Eso ES el bucle que querés cortar.

2. **El YAML del PDF está en INGLÉS y no calza con el código real.** Declara `collections_firestore: [orders, payments, invoices, customers, parts]` — pero el código real (verificado por grep) usa `ordenes_servicio`, `clientes`, `personal`, `facturas`, `cotizaciones`, `productos`, `pagos`. Las validaciones que el propio cartografo dice correr ("toda colección de Firestore declarada existe en `firestore.rules`") fallarían en cada generación. **Hay que españolizar el YAML al modelo real antes de usarlo.**

3. **Áreas faltantes.** El YAML solo cubre 4 áreas. Te faltan: personal/RRHH, WhatsApp/CRM/Inbox, formularios públicos, reporting/dashboard. Si lo instalo como viene, el "mapa completo" sería un mapa parcial.

4. **`customer_advocate` duplica.** Crearlo aparte del `user_advocate` significa dos agentes peleando por la misma voz. El propio paquete sugiere fusionar.

5. **`product_analyst` necesita tracking instalado para funcionar.** Hoy no hay Sentry / LogRocket / analítica de uso. Si lo instalás antes de tener datos, va a reportar "no tengo nada para medir" — lo cual está bien, pero su primera tarea debería ser "qué tracking falta para que pueda hacer mi trabajo".

6. **`integrations_watcher` tiene una tabla genérica.** Lista Meta, DGII, Banreservas, Google, GPS de vans, etc. — pero algunas integraciones HOY no están conectadas al software (DGII y bancos probablemente no). Su primera tarea debería ser "qué integraciones existen REALMENTE hoy" antes de inventar tabla.

7. **El cartografo tiene tool `Write`.** Solo debe escribir en `docs/mapa/`. Hay que blindarlo en la descripción para que no toque nada más por equivocación.

8. **El PDF sugiere "instalar todo de golpe pasándole el archivo entero a Claude Code".** Eso contradice "planear primero". Vamos a hacerlo por fases y consolidando.

---

## 4. Recomendación clara

### Lo que SÍ instalar (adaptado)

| Agente / archivo | Cambios requeridos antes de instalar |
|---|---|
| **`cartografo`** | (a) Españolizar la descripción + reglas. (b) Blindar `Write` a `docs/mapa/` y nada más. (c) Sub-regla en `CLAUDE.md`: el `coordinator` lo invoca al cerrar sprints que cambian estructura (igual que invoca `memoria`). (d) Consolidación: cuando esté vivo, los 4 docs estáticos del mapa quedan como "lectores" del YAML, no fuentes paralelas. |
| **Sistema del mapa** (`docs/mapa/MAPA_MENTAL.yaml` + 2 scripts) | (a) YAML en español alineado al modelo real (`ordenes_servicio`, `clientes`, etc.). (b) Agregar áreas faltantes: personal/RRHH, WhatsApp/CRM/Inbox, formularios públicos, reporting. (c) Versionado del YAML por fecha (el propio paquete lo sugiere). |
| **`data_integrity`** | Sin cambios mayores. Aporta backups + checklist de migración que NO tenemos. Importante para próximas fases del refactor de pagos. |
| **`integrations_watcher`** | Primera tarea: mapear qué integraciones existen REALMENTE hoy (no inventar tabla genérica). |
| **`product_analyst`** | Primera tarea: listar qué tracking falta para que pueda medir uso real. |

### Lo que NO instalar (fusionar)

- **`customer_advocate`** → **extender `user_advocate` existente** para que cubra también al cliente final. Un solo agente, dos voces (interna + externa). Evita la duplicación.

---

## 5. Plan por fases (anti-bucle, mismo principio que el de FLUJO-DEPENDENCIAS)

Cada fase es un sprint en `COLA_AUTONOMA.md`, con QA tuyo antes de pasar a la siguiente.

**FASE 1 — Cimiento del mapa (lo que pediste explícitamente):**
- Crear `cartografo.md` (adaptado y blindado).
- Crear `docs/mapa/MAPA_MENTAL.yaml` españolizado y completo.
- Crear `scripts/generar_mapa.js` + `scripts/generar_svg.js`.
- Generar las primeras salidas (imagen + HTML + prompt).
- Consolidar: marcar los 4 docs estáticos como "lectores del YAML, no fuentes paralelas".
- Sub-regla en `CLAUDE.md`: cuándo lo invoca el coordinator.
- QA tuyo: abrís el HTML, lo navegás, modificás algo en el YAML, regenerás, ves el cambio.

**FASE 2 — Defensa de datos:**
- Crear `data_integrity.md`.
- Su primera tarea: reporte de salud actual de la BD (backups corriendo o no, conteo huérfanos, crecimiento). NO toca nada.
- QA tuyo: leer el reporte.

**FASE 3 — Visibilidad de integraciones:**
- Crear `integrations_watcher.md`.
- Su primera tarea: inventario REAL de integraciones hoy.
- QA tuyo: revisar el inventario.

**FASE 4 — Cliente final + uso real:**
- Extender `user_advocate.md` para cubrir cliente final (NO crear `customer_advocate.md`).
- Crear `product_analyst.md`. Primera tarea: qué tracking falta.
- QA tuyo: decidir si vamos por tracking.

---

## 6. Resumen ejecutivo

- **El método (mapa editable + agente que lo controla) es bueno** y resuelve exactamente lo que pediste. Lo confirmo.
- **El paquete tal cual viene tiene 8 problemas** (sección 3). Los más graves: duplicación con lo que ya tenemos y YAML que no calza con el código real.
- **Mi recomendación:** instalar 4 de los 5 agentes (fusionar `customer_advocate` con `user_advocate`) + sistema de mapa adaptado, **en 4 fases con QA tuyo entre cada una**. Empezar por la FASE 1 que es exactamente lo que pediste.
- **Antes de tocar código,** necesito tu OK al plan. Cualquier ajuste lo hacemos ahora, no después.
