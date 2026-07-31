# 📋 HANDOFF — Paquete de agentes + mapa mental vivo (Mister Service RD)

> **Para el próximo agente / sesión.** Este documento captura TODO el flujo del proyecto "instalar el paquete de 5 agentes + sistema de mapa mental" para que puedas retomar sin re-explicar nada. Léelo de arriba a abajo.
>
> **Última actualización:** 2026-05-28 por Cowork.
> **Estado actual:** FASE 1 ejecutada, bug de Mermaid arreglado, esperando commit + QA de Jorge.

---

## 1. Contexto — de qué viene esto

Jorge Luis Brito García (no-técnico, dueño de Mister Service RD — taller de reparación de electrodomésticos en RD) recibió un PDF titulado **"PAQUETE AGENTES.pdf"** (21 páginas, en `local-agent-mode-sessions/.../uploads/`) que propone:

- **5 agentes nuevos** para `.claude/agents/`: cartografo, product_analyst, data_integrity, integrations_watcher, customer_advocate.
- **Sistema de mapa mental** (`docs/mapa/MAPA_MENTAL.yaml` + 2 scripts JS) — una sola fuente de verdad editable a mano por Jorge, que regenera SVG visual + HTML interactivo + Mermaid + prompt de contexto para otros agentes.

Jorge explícitamente dijo:
> "debemos planear primero lo que vamos a hacer antes de escribir codigo, quiero analisar este metodo de trabajo. revisa y validamos quiero un mapa mental que yo pueda modificar y el agente que lo controle para llevar la logica y el flujo revisa esos agentes"

Quiere ROMPER el bucle de "tapo una falla y sale otra" mirando el software como sistema completo en vez de cazar bugs sueltos.

---

## 2. Análisis hecho (documento entregado)

Cowork analizó el paquete vs lo que ya existe en el repo y produjo:
**`docs/analisis/ANALISIS_PAQUETE_AGENTES_2026-05-26.md`** (lectura obligatoria — tabla de solapamientos, 8 riesgos identificados, recomendación por fases).

**Hallazgos clave del análisis:**

1. **Duplicación con docs existentes:** el cartografo se solapa con 4 docs estáticos que ya teníamos (`MAPA_DEPENDENCIAS.md`, `CAMPOS_CROSS_COLLECTION.md`, `MAPA_RIESGOS_MODULOS.md`, `AUDITORIA_FLUJO_DEPENDENCIAS_2026-05-25.md`). Solución: el YAML es la fuente única; los 4 docs quedan como **lectores**, no fuentes paralelas (marcadores ya puestos).
2. **YAML del PDF en inglés** (`orders`, `customers`, `parts`) — el código real está en español (`ordenes_servicio`, `clientes`, `productos`). Lo españolizamos.
3. **Áreas faltantes en el YAML del PDF** (solo tenía 4: agendamiento, dinero, clientes, inventario). Le agregamos 6 más: ordenes, personal_rrhh, whatsapp_crm, formularios_publicos, reporting, sistema. Total: **10 áreas, 29 módulos**.
4. **`customer_advocate` redundante** con `user_advocate.md` existente — el propio PDF dice "o lo fusionas". Decisión: fusionar en FASE 4, NO crear archivo nuevo.
5. **`product_analyst` necesita tracking instalado** (Sentry/LogRocket) que hoy no existe. Su primera tarea debe ser mapear qué tracking falta.
6. **`integrations_watcher` tiene tabla genérica** que incluye integraciones que hoy NO existen (DGII, Banreservas). Su primera tarea debe ser inventariar las reales.
7. **`cartografo` con tool Write** — riesgo de tocar archivos fuera de su alcance. Blindado en su `.md`: solo escribe en `docs/mapa/`.
8. **PDF sugiere "instalar todo de golpe"** — contradice "planear primero". Decisión: por fases con QA entre cada una.

---

## 3. Decisión tomada (Jorge confirmó vía AskUserQuestion)

> **Opción A elegida: "FASE 1 adaptada primero (recomendado)"** — solo cartografo + mapa en español + consolidar los 4 docs estáticos. Las otras 3 fases las decide después con QA entre cada una.

---

## 4. FASE 1 — qué se hizo y qué falta

### 4.1 Archivos CREADOS (en working dir, sin commitear aún)

```
.claude/agents/cartografo.md                          NUEVO  — agente adaptado al español, Write blindado a docs/mapa/
docs/mapa/MAPA_MENTAL.yaml                            NUEVO  — fuente única (10 áreas, 29 módulos, 8 integraciones externas)
docs/mapa/explorador.html                             NUEVO  — visor interactivo (regenerado)
docs/mapa/mapa.svg                                    NUEVO  — imagen plana (regenerada)
docs/mapa/mapa.mmd                                    NUEVO  — diagrama Mermaid (regenerado)
docs/mapa/PROMPT_SISTEMA.md                           NUEVO  — contexto para los demás agentes (regenerado)
docs/mapa/historico/MAPA_MENTAL.<timestamp>.yaml      NUEVO  — copia versionada (no destructivo)
scripts/generar_mapa.js                               NUEVO  — ESM (repo usa "type": "module")
scripts/generar_svg.js                                NUEVO  — ESM
docs/analisis/ANALISIS_PAQUETE_AGENTES_2026-05-26.md  NUEVO  — análisis crítico del paquete
docs/REPORTE_AGENTES.md                               NUEVO  — reporte de los 17+5 agentes
docs/HANDOFF_PAQUETE_AGENTES_2026-05-28.md            NUEVO  — este documento
```

### 4.2 Archivos MODIFICADOS

```
package.json                                          + dependencia js-yaml@^4.1.1
                                                      + script "mapa": "node scripts/generar_mapa.js && node scripts/generar_svg.js"
package-lock.json                                     auto-actualizado por npm install
CLAUDE.md                                             + sección "Mapa mental vivo (agente cartografo + MAPA_MENTAL.yaml)"
                                                      + sub-regla obligatoria: coordinator invoca cartografo al cerrar sprints estructurales
                                                      + entrada en "Related docs"
                                                      + cartografo en tabla de agentes
docs/MAPA_DEPENDENCIAS.md                             + marcador apuntando al YAML como fuente única (pasa a ser lector)
docs/CAMPOS_CROSS_COLLECTION.md                       + marcador de convivencia con YAML
docs/sprints/MAPA_RIESGOS_MODULOS.md                  + marcador de convivencia con YAML (mantenido por agente memoria)
docs/sprints/AUDITORIA_FLUJO_DEPENDENCIAS_2026-05-25.md  + marcador "snapshot histórico, no se actualiza"
```

### 4.3 Bug encontrado y arreglado (2026-05-28)

**Síntoma:** al abrir `explorador.html`, la sección "Diagrama" mostraba "Syntax error in text — mermaid version 11.15.0". Las cajitas debajo (filtros + tarjetas de módulos) funcionaban perfecto.

**Causa raíz:** en `scripts/generar_mapa.js`, los IDs de las subgraphs eran iguales a los nombres de las áreas (`subgraph clientes["CLIENTES"]`), y como hay un módulo también llamado `clientes` DENTRO del subgraph `clientes`, Mermaid 11.x colisiona los namespaces y tira el error.

**Fix aplicado:** prefijo los IDs de subgraphs con `area_` (`subgraph area_clientes["CLIENTES"]`). El label visible se mantiene en mayúsculas (`CLIENTES`). Sin colisión posible.

**Verificación:** `npm run mapa` regenera limpio (sandbox y Mac), el archivo `mapa.mmd` ahora tiene `subgraph area_ordenes`, `subgraph area_clientes`, etc. Jorge debe **refrescar el navegador** (Cmd+Shift+R) para ver el diagrama Mermaid renderizado.

### 4.4 Comando de commit pendiente (Jorge ejecuta en su Mac)

```bash
cd ~/Desktop/mister-service-rd && npm install && npm run mapa && git add .claude/agents/cartografo.md docs/mapa/ scripts/generar_mapa.js scripts/generar_svg.js docs/analisis/ANALISIS_PAQUETE_AGENTES_2026-05-26.md docs/REPORTE_AGENTES.md docs/HANDOFF_PAQUETE_AGENTES_2026-05-28.md docs/MAPA_DEPENDENCIAS.md docs/CAMPOS_CROSS_COLLECTION.md docs/sprints/MAPA_RIESGOS_MODULOS.md docs/sprints/AUDITORIA_FLUJO_DEPENDENCIAS_2026-05-25.md CLAUDE.md package.json package-lock.json && git commit -m "feat(mapa): cartografo + sistema de mapa mental vivo (FASE 1 paquete agentes)" && git push
```

El husky pre-commit hook va a correr: cazadores 24/24 + typecheck + lint sobre staged. **Riesgo bajo** — no toca código TS de producción ni rules. Si el lint reclama por los `.js` en `scripts/`, agregar tag o disable directive según el caso.

### 4.5 QA pendiente de Jorge (anti-bucle)

Después del commit:

1. **Visual:** abrir `docs/mapa/explorador.html` en navegador → ver diagrama Mermaid con cajitas agrupadas por color por área + filtros por área + las 29 tarjetas debajo.
2. **Imagen plana:** abrir `docs/mapa/mapa.svg` → la imagen "mandable por WhatsApp".
3. **Edición por Jorge (la prueba del control):** editar `docs/mapa/MAPA_MENTAL.yaml` (ej: cambiar el campo `notas:` de cualquier módulo), guardar, correr `npm run mapa`, verificar que el cambio aparece en `explorador.html` y en `PROMPT_SISTEMA.md`. Esto demuestra que **Jorge controla el mapa, no el agente**.

---

## 5. Fases siguientes (NO ejecutadas aún, esperan QA FASE 1 + OK de Jorge)

### FASE 2 — `data_integrity` (defensa de datos)
- Crear `.claude/agents/data_integrity.md` (PDF lo trae completo en sección 3.3).
- Primera tarea del agente: reporte de salud actual de la BD (`docs/data/SALUD_<fecha>.md`) — backups corriendo o no, conteo de huérfanos, crecimiento por colección. NO toca código.
- QA Jorge: leer el reporte.
- Sin cambios mayores al spec del PDF.

### FASE 3 — `integrations_watcher` (visibilidad de APIs externas)
- Crear `.claude/agents/integrations_watcher.md`.
- Primera tarea: inventario REAL de integraciones (no la tabla genérica del PDF). Las reales hoy son: `meta_whatsapp`, `firebase_auth`, `firebase_firestore`, `firebase_storage`, `firebase_app_check`, `vercel`, `anthropic_api`, `gps_vans` (ya listadas en `MAPA_MENTAL.yaml` sección `integraciones_externas`).
- QA Jorge: revisar el inventario, validar criticidad.

### FASE 4 — cliente final + uso real
- **Extender `user_advocate.md`** existente para cubrir cliente final (NO crear `customer_advocate.md` — el propio PDF lo permite). Agregar sección "Voz del cliente final" con las 4 categorías del PDF (antes/durante/después del servicio + casos incómodos).
- **Crear `product_analyst.md`**. Primera tarea: listar qué tracking falta (Sentry/LogRocket/analítica) para que pueda medir uso real. Sin tracking instalado no produce datos.
- QA Jorge: decidir si vamos por instalar tracking (es una decisión de negocio + ~1 sprint adicional).

---

## 6. Decisiones pendientes de Jorge (no avanzar sin ellas)

1. **¿QA FASE 1 aprobada?** Bloquea las fases siguientes.
2. **¿Querés vista tipo "mind map / árbol jerárquico" adicional?** Jorge preguntó si se puede agregar un diagrama tipo árbol radial (centro = "Mister Service RD", ramas por área, hojas por módulo). Mermaid tiene tipo `mindmap` nativo. Opciones:
   - (a) Archivo separado `docs/mapa/mindmap.html`.
   - (b) Pestaña/sección extra dentro del `explorador.html` actual.
   - (c) No agregarlo.
   Cowork le ofreció (a) o (b), Jorge no respondió todavía — esperar decisión.
3. **¿Pasamos a FASE 2 directo o ajustamos el cartografo / YAML primero?** Si Jorge encuentra algún módulo que falta o algún dato mal en el YAML, lo edita él y regenera; no requiere agente.

---

## 7. Estado del trabajo paralelo (NO confundir con este flujo)

Hay un **bloque "FLUJO-DEPENDENCIAS"** que NO es lo mismo que este paquete de agentes. Es un trabajo previo del coordinator autónomo. Estado actual (pasada 51 cerrada el 2026-05-25):

| Sprint | Hash | Estado |
|---|---|---|
| AGENDA-1-MANTENIMIENTO-ATA-CLIENTE | `132d9b5` | ⏸ awaiting QA Jorge |
| AGENDA-2-CALENDARIO-MUESTRA-CITAS | `e4f92bf` | ✅ |
| AGENDA-3-HONRAR-TECNICO-ASIGNADO | `f9697b9` | ✅ |
| AGENDA-4-UNIFICAR-FORMS-PUBLICOS | `fba51a4` | ✅ |
| AGENDA-5-PROXIMO-MANTENIMIENTO | `8f6a72b` | ✅ |
| NUCLEO-CREAR-ORDEN-CENTRAL | — | ⊘ BLOQUEOS (Jorge debe elegir A/B/C) |
| DINERO-1-QT-ATOMICO | `bec87b3` | ✅ |
| DINERO-2-MONTOPAGADO-RECALC | `b4fc23c` | ⏸ awaiting QA Jorge |
| REPORTING-1-KPI-HELPERS | `a4e64db` | ⏸ awaiting QA Jorge |

**QA pendientes del coordinator (no del paquete agentes):** AGENDA-1, DINERO-2, REPORTING-1, GARANTIA Fase A (59c5fb0), FIX-LEADS (01df699), WA-FIX-PLANTILLAS (0ab73c5).

Estos QA y el de FASE 1 del paquete son **independientes** y se pueden hacer en cualquier orden.

---

## 8. Para el agente que retoma — instrucciones de arranque

1. **Lee este documento entero.**
2. **Lee `docs/analisis/ANALISIS_PAQUETE_AGENTES_2026-05-26.md`** (el análisis crítico que motivó las decisiones).
3. **Lee `docs/mapa/PROMPT_SISTEMA.md`** (el contexto del sistema regenerado desde el YAML — el mapa actual del software).
4. **Lee `.claude/agents/cartografo.md`** (el agente que mantiene el mapa vivo).
5. **Estado del repo:** corré `git status --short` para confirmar qué está sin commitear. Si los archivos de FASE 1 ya están commiteados (el commit message debería ser `feat(mapa): cartografo + sistema de mapa mental vivo (FASE 1 paquete agentes)`), pasá al punto 6. Si no, esperá que Jorge ejecute el comando del bloque 4.4.
6. **Pregúntale a Jorge:**
   - ¿Aprobaste el QA de FASE 1?
   - ¿Vamos con FASE 2 (data_integrity) o querés agregar algo al cartografo / YAML primero?
   - ¿Querés la vista mindmap adicional?
7. **NO instales FASES 2/3/4 sin OK explícito de Jorge** (es la disciplina anti-bucle).
8. **NO edites código de producción** (`src/`, `api/`, `firestore.rules`, `storage.rules`) en este flujo — el paquete de agentes es solo agentes + mapa + docs.
9. **Si Jorge te pide algo no relacionado al paquete** (ej: bugs de producción, sprints nuevos), redirigilo al coordinator autónomo (`trabaja` en Claude Code) — esa es la cadena de mando.

---

## 9. Cómo contactar / qué tono usar con Jorge

- Es **no-técnico**. Hablale en simple, dominicano/latino, brevísimo. Ejemplos en `COWORK_CONTEXTO.md`.
- No le tires términos técnicos sin traducir. Si tenés que decir "Firestore rules", agregale "(los permisos de la base de datos)".
- Es agudo, no te creas que no entiende — entiende lógica de negocio mejor que nadie. Sí necesita que el lenguaje técnico se traduzca.
- Le frustra el bucle de "arreglar uno y romper otro". Cada decisión debe respetar el principio de planear primero, fases con QA, no saltar.
- **Sus reglas duras** que no se rompen:
  - NO PAGOS B-3 sin su QA.
  - NO Meta/WABA, OAuth, integraciones nuevas, ni migraciones >500 docs sin su OK.
  - NO `firestore.rules` ni `storage.rules` sin su OK explícito.
  - NO cerrar sprints de dinero/órdenes como COMPLETADO sin su QA — dejarlos "awaiting QA Jorge".

---

## 10. Referencias rápidas

| Quiero saber… | Mirar en… |
|---|---|
| ¿Qué módulos tiene el software? | `docs/mapa/PROMPT_SISTEMA.md` o `docs/mapa/MAPA_MENTAL.yaml` |
| ¿Estado actual del trabajo? | `docs/sprints/MEMORIA_MAESTRA.md` |
| ¿Qué hay en la cola autónoma? | `docs/sprints/COLA_AUTONOMA.md` |
| ¿Qué está bloqueado esperando Jorge? | `docs/sprints/BLOQUEOS.md` |
| ¿Reglas de oro del proyecto? | `CLAUDE.md` |
| ¿Cómo se llaman los 17+1 agentes y qué hacen? | `docs/REPORTE_AGENTES.md` |
| ¿Análisis del paquete del PDF? | `docs/analisis/ANALISIS_PAQUETE_AGENTES_2026-05-26.md` |
| ¿El PDF original? | `local-agent-mode-sessions/.../uploads/e93a00a2-...PAQUETE AGENTES.pdf` |

---

**Fin del handoff.** Cuando termines tu turno, actualizá este documento al final con: qué hiciste, qué quedó pendiente, qué decisiones tomaste con Jorge.
