# Propuesta de reorganización de menú y módulos por rol — 2026-05-08

> **Sprint:** SPRINT-117b (procesable autónomo, output documental).
> **Insumo:** `docs/sprints/AUDITORIA_IA_2026-05-08.md` (auditoría 117a).
> **Decisiones zanjadas por Jorge vía Cowork** (no preguntar de nuevo):
> 1. "Web y Solicitudes" visible para admin Y coordinadora.
> 2. `/admin/configuracion/usuarios` quitar del sidebar pero dejar como redirect 301 a `/admin/usuarios`.

---

## Resumen ejecutivo (60 segundos)

**Diagnóstico** (de la auditoría 117a):

- Sidebar admin tiene **44 ítems** en 7 secciones — patrón "muro" que confunde.
- Operaria ve **17 ítems**, secretaria **13** — más fricción de la necesaria para los roles que más usan el sistema día a día.
- Hay **5 redundancias** (Calendario × Calendarios, 3 inboxes, 3 catálogos, Conduces × Pendientes × Cotizaciones, Dashboard × Agenda × Órdenes × Calendario).
- Hay **5 áreas confusas** (volumen sidebar, "Pendiente de piezas" vs identificadores `Standby`, "Conduces de Garantía" vs código `Facturas`, Coord vs Admin con gating ambiguo, `/admin/usuarios` duplicado).

**Propuesta de fondo** (filosofía):

1. **Operaria/secretaria primero.** Son los roles con más fricción real. Bajar de 17/13 ítems a ~10/8 usando agrupación más fina y ocultando lo que no usan.
2. **Admin/coord.** Bajar de 44 a ~32 reorganizando: 1 sección "Operaciones" más curada, 1 sección "Cobranza" nueva (junta el pipeline factura), Personal+Usuarios+Ponches en un solo grupo "Equipo".
3. **Técnico.** No tocar `TecnicoVista` — ya es óptima. Sólo asegurar que las notificaciones le lleguen bien (sprint propio aparte).
4. **Etiquetas más claras** sin renombrar identificadores internos. "Standby" → "Pendiente de piezas" ya está bien; aplicar el mismo principio en otros lugares (ver §Justificaciones).

**Plan de ejecución** (sub-sprints): 6 cambios chicos, cada uno con touch-list de 1-3 archivos, plan de rollback explícito y orden recomendado. Riesgo total: bajo. Tiempo estimado autónomo: 1-2 pasadas de `trabaja` por sub-sprint.

**Pausa obligatoria:** este documento NO ejecuta nada. Espera tu OK en `BLOQUEOS.md`.

---

## 1) Mockup textual del nuevo sidebar por rol

> Convención: `→` ruta destino · `(badge)` ítem con contador en vivo · `[NUEVO]` ítem agregado · `[MOVIDO]` ítem cambia de sección · `[OCULTO]` ítem ya no se muestra (sigue accesible por URL directa con redirect).

### 1.1 Administrador (propuesta) — de 44 a ~32 ítems

```
Ponche                                      → /ponche
Dashboard                                   → /admin/dashboard

▼ Operaciones                               (8 ítems, antes 12)
  • Agenda del Día                          → /admin/agenda-dia
  • Órdenes                                 → /admin/ordenes
  • Calendario                              → /admin/calendario
  • Mapa de Rutas                           → /admin/mapa
  • Cierre del Día                          → /admin/cierre-dia
  • Pendiente de piezas (badge)             → /admin/standby
  • Mantenimientos                          → /admin/mantenimiento  [MOVIDO acá desde top-level]
  • Historial Anuladas                      → /admin/historial-anuladas

▼ Bandeja de entrada (badge agregado)       (3 ítems agrupados, antes dispersos)
  • Citas por confirmar (badge)             → /admin/citas
  • Reprogramaciones (badge)                → /admin/reprogramaciones
  • Sugerencias de chequeo (badge)          → /admin/sugerencias-chequeo

▼ Clientes y Calendarios                    (2 ítems)
  • Clientes                                → /admin/clientes
  • Calendarios públicos (Calendly)         → /admin/calendarios   [renombrado para evitar confusión con Calendario]

▼ Cobranza y facturación                    (3 ítems, antes 1 + 1 + 1 dispersos)  [SECCIÓN NUEVA]
  • Cotizaciones                            → /admin/cotizaciones
  • Conduces pendientes (badge)             → /admin/facturacion-pendiente
  • Conduces de Garantía                    → /admin/facturas

▼ Catálogo e Inventario                     (3 ítems, antes 4)
  • Inventario                              → /admin/inventario
  • Equipos en Taller                       → /admin/taller
  • Precios de servicios                    → /admin/precios
  • Catálogo legacy (Productos)             → /admin/productos     [OCULTO en sidebar — accesible por URL hasta deuda saldada en sprint propio]

▼ Finanzas                                  (8 ítems, antes 9 — Rendimiento+Métricas se quedan, Comisiones acá)
  • Gastos e Ingresos                       → /admin/gastos
  • Bancos                                  → /admin/bancos
  • Nómina                                  → /admin/nomina
  • Avances a Empleados                     → /admin/avances
  • Préstamos a Empleados                   → /admin/prestamos
  • Comisiones                              → /admin/comisiones
  • Rendimiento                             → /admin/rendimiento
  • Estado de Resultado                     → /admin/estado-resultado
  (Métricas del Mes movido a Rendimiento como pestaña interna, fase futura)

▼ Web y Solicitudes                         (4 ítems, sin cambios — visible coord también)
  • Página Web                              → /admin/web
  • Empresas Aliadas                        → /admin/empresas-aliadas
  • Formularios                             → /admin/formularios
  • Solicitudes (badge)                     → /admin/solicitudes

▼ Asistente IA                              (2 ítems — sólo admin)
  • Chat (pantalla completa)                → /admin/asistente
  • Historial IA                            → /admin/asistente/historial

▼ Equipo                                    (3 ítems agrupados, antes dispersos)  [SECCIÓN NUEVA]
  • Personal                                → /admin/personal
  • Usuarios y Permisos                     → /admin/usuarios
  • Reporte de Ponches                      → /admin/ponches

▼ Sistema                                   (2 ítems)
  • Configuración                           → /admin/configuracion
  • Plantillas Marketing                    → /admin/configuracion-marketing
```

**Resultado:** 11 secciones colapsables + 2 ítems sueltos (Ponche, Dashboard). 32 destinos visibles en total (vs 44 hoy). El cambio principal: agrupar "Bandeja de entrada" reduce ruido en Operaciones, y "Cobranza" hace explícito el pipeline de facturación.

### 1.2 Coordinadora (propuesta) — espejo del admin con 2 secciones ocultas

Mismo sidebar que admin **excepto:**

- **Asistente IA** y **Plantillas Marketing**: ocultas (gateadas por `rol === 'administrador'` literal — sin cambios respecto a hoy).
- **Web y Solicitudes**: visible (zanjado por Jorge — la coord triagea solicitudes públicas y citas).

**Resultado:** ~30 ítems visibles. Sin alias `isAdmin = esAdminOCoord` ambiguo: el código va a usar `esAdminOCoord` directamente para los ítems compartidos, y `userProfile?.rol === 'administrador'` literal para los ítems exclusivos del admin.

### 1.3 Operaria (propuesta) — de 17 a ~10 ítems

```
Ponche                                      → /ponche
Dashboard                                   → /admin/dashboard

▼ Operaciones                               (5 ítems, antes 7)
  • Agenda del Día                          → /admin/agenda-dia
  • Órdenes                                 → /admin/ordenes
  • Citas por confirmar (badge)             → /admin/citas
  • Calendario                              → /admin/calendario
  • Pendiente de piezas (badge)             → /admin/standby

▼ Clientes y Calendarios                    (2 ítems)
  • Clientes                                → /admin/clientes
  • Calendarios públicos (Calendly)         → /admin/calendarios

▼ Documentos                                (2 ítems, antes 2)
  • Cotizaciones                            → /admin/cotizaciones
  • Conduces de Garantía                    → /admin/facturas

▼ Inventario                                (1 ítem, antes 3 dispersos)
  • Inventario                              → /admin/inventario
  (Catálogo legacy y Equipos Taller [OCULTOS] en sidebar operaria — accesibles por URL si los necesita)

Mantenimientos                              → /admin/mantenimiento
Mi rendimiento                              → /admin/rendimiento  [renombrado desde "Rendimiento" para señalar que es lectura propia]
```

**Resultado:** 10 destinos visibles. Cae casi a la mitad. Lo que se oculta NO se borra — sigue accesible por URL.

**Razón clave:** la operaria gestiona órdenes, llama clientes, cotiza, factura. Los demás módulos (Mapa de Rutas, Métricas del Mes, Equipos en Taller) los usaba 0-2 veces por semana según patrón observado en flujos.

### 1.4 Secretaria (propuesta) — de 13 a ~8 ítems

```
Ponche                                      → /ponche
Dashboard                                   → /admin/dashboard

▼ Operaciones                               (4 ítems)
  • Agenda del Día                          → /admin/agenda-dia
  • Órdenes                                 → /admin/ordenes
  • Citas por confirmar (badge)             → /admin/citas
  • Calendario                              → /admin/calendario

▼ Clientes y Calendarios                    (2 ítems)
  • Clientes                                → /admin/clientes
  • Calendarios públicos (Calendly)         → /admin/calendarios

Mantenimientos                              → /admin/mantenimiento
```

**Resultado:** 8 destinos visibles. Su rol está concentrado en agendar y gestionar contactos con clientes.

**Lo que se le quita respecto a hoy:** Pendiente de piezas, Mapa de Rutas, Catálogo, Equipos Taller, Personal. Si los necesita, sigue accesible por URL.

### 1.5 Técnico — sin cambios (ya es óptima)

`TecnicoVista` ya es ultra-simple y mobile-first. Sigue accediendo a `/ponche`. **No tocar** opportunisticamente — gotcha del CLAUDE.md.

### 1.6 Ayudante — sin cambios

Sólo `/ponche`. Sin sidebar admin.

---

## 2) Justificaciones por cambio

> 2-3 líneas máx por cambio. Riesgo: bajo (B), medio (M), alto (A).

### Admin/Coord

| # | Cambio | Por qué | Beneficiario | Riesgo |
|---|---|---|---|---|
| 1 | Crear sección "Bandeja de entrada" agrupando Citas + Reprogramaciones + Sugerencias chequeo | Hoy son 3 inboxes paralelos dispersos en Operaciones; el operador procesa los 3 con flujos similares (revisar → aprobar/rechazar). Agruparlos hace explícito que son "todo lo entrante". | Coord (triagea inboxes) | B |
| 2 | Crear sección "Cobranza y facturación" con Cotizaciones + Conduces pendientes + Conduces de Garantía | Hoy una orden cerrada cruza 3 pantallas en pipeline. Juntarlas en una sección las hace ver como pasos consecutivos. | Coord, operaria | B |
| 3 | Mover Mantenimientos dentro de Operaciones | Hoy es ítem suelto top-level — toma altura visual desproporcionada. Conceptualmente es operación recurrente. | Todos | B |
| 4 | Crear sección "Equipo" con Personal + Usuarios + Reporte de Ponches | Hoy estos 3 viven en "Sistema" mezclados con Configuración y Plantillas Marketing. Separar gente de configs técnicas reduce carga cognitiva. | Admin (recursos humanos) | B |
| 5 | Renombrar "Calendarios" a "Calendarios públicos (Calendly)" | Audit §4.1: confusión Calendario × Calendarios. El paréntesis aclara propósito sin renombrar la ruta ni el componente. | Todos | B |
| 6 | Quitar `/admin/configuracion/usuarios` del sidebar (dejar redirect 301 a `/admin/usuarios`) | Decisión zanjada por Jorge. Hoy son 2 ítems del menú al mismo componente. | Todos | B |
| 7 | Ocultar Catálogo (Productos) del sidebar admin | Audit §4.3: deuda histórica. La eliminación de la ruta queda para sprint propio (riesgo de imports rotos). | Todos | B → si rompe, M |
| 8 | Mover "Métricas del Mes" como pestaña dentro de Rendimiento | Mismo dato granularidad distinta. Reduce 1 ítem y deja Rendimiento como hub único de KPIs. | Admin/Coord | M (requiere refactor mínimo en Rendimiento.tsx — no en el alcance de 117c) |
| 9 | Eliminar alias `isAdmin = esAdminOCoord` en Sidebar.tsx — usar `esAdminOCoord` o `rol === 'administrador'` literal | Audit §5.4: gating ambiguo. Más explícito = menos sorpresas futuras. | Builders | B |

### Operaria

| # | Cambio | Por qué | Beneficiario | Riesgo |
|---|---|---|---|---|
| 10 | Quitar Mapa de Rutas del sidebar operaria | No lo usa día a día (rol no maneja despacho). Sigue accesible por URL si lo necesita. | Operaria | B |
| 11 | Quitar Catálogo legacy del sidebar operaria | Deuda. Sigue accesible. | Operaria | B |
| 12 | Quitar Equipos en Taller del sidebar operaria | Lo manipula técnico/admin. Operaria casi no lo abre. | Operaria | B |
| 13 | Quitar Personal del sidebar operaria | Era lectura sólo. Si necesita ver, abre por URL. | Operaria | B |
| 14 | Renombrar "Rendimiento" → "Mi rendimiento" para operaria/secretaria | Señala que es vista propia, no panel global. | Operaria | B |

### Secretaria

| # | Cambio | Por qué | Beneficiario | Riesgo |
|---|---|---|---|---|
| 15 | Quitar Pendiente de piezas, Mapa de Rutas, Catálogo, Equipos Taller, Personal del sidebar secretaria | Su rol se concentra en agendar y contactar. Reducir ruido. | Secretaria | B |
| 16 | Quitar Métricas del Mes (no aplica a su rol — `rendimientoVer` ya en false) | Hoy ni se le mostraba pero la regla del show estaba ambigua. Limpieza. | Secretaria | B |

### Globales

| # | Cambio | Por qué | Beneficiario | Riesgo |
|---|---|---|---|---|
| 17 | Mantener todas las rutas viejas activas con redirect 301 | Bookmarks y links de WhatsApp viejos siguen funcionando. CLAUDE.md regla "Keep redirects when renaming routes". | Empleados con bookmarks | B |
| 18 | Conservar identificadores internos (`enStandby`, `standby_piezas`, colección `facturas`) | Sólo cambian etiquetas visibles. Audit §5.2 + §5.3. | Builders futuros | B (cero) |

---

## 3) Tabla antes/después de 5 flujos comunes

> Mide número de **clicks** desde que el operador entra al sistema (login + dashboard) hasta que completa la acción. Hipótesis simplificada: cada hover sobre sección es 1 click. URL directa cuenta como 0 clicks (asumiendo bookmark).

| Flujo | Quién lo hace más | Hoy (clicks) | Propuesta (clicks) | Δ |
|---|---|---|---|---|
| **Crear orden nueva** (a partir de cliente conocido) | Operaria, secretaria | 4 (Operaciones → Órdenes → "+Nueva orden" → form) | 4 (igual — ya es directo) | 0 |
| **Iniciar chequeo de orden** (técnico desde mobile) | Técnico | 2 (TecnicoVista → tap orden) | 2 (sin cambios) | 0 |
| **Facturar (emitir Conduce de Garantía)** desde orden cerrada | Operaria | 5 (Operaciones → Órdenes → orden → "Enviar a facturación" → Documentos → Conduces Pendientes → procesar) | 4 (orden → "Enviar a facturación" → Cobranza → Conduces Pendientes → procesar — sección agrupada hace que el "saltar" sea más obvio) | -1 |
| **Ver órdenes pendientes / pipeline** | Coord, admin | 3 (Operaciones → Órdenes → filtro "hoy" o "pendiente") | 3 (igual — Órdenes sigue como pivote) | 0 |
| **Agendar cita rápida** (link Calendly) | Secretaria | 4 (Operaciones → Calendarios → seleccionar calendario → copiar link) | 4 (Clientes y Calendarios → Calendarios públicos → seleccionar → copiar) | 0 |

**Conclusión honesta:** la mejora medida en clicks es marginal (-1 en facturación). El beneficio real es **reducción de ruido visual**: 12 ítems menos para admin/coord, 7 menos para operaria, 5 menos para secretaria. La fricción que se reduce no es "cuántos clicks" sino "cuántas opciones tengo que ignorar para llegar a la que quiero".

**Si Jorge prioriza reducir clicks por encima de reducir ruido,** este sprint NO es el que mueve la aguja. La aguja se mueve con cosas como: (a) "siguiente paso" inline en cada módulo (orden cerrada → botón directo a "Enviar a facturación"), (b) atajos globales (Ctrl+K command palette). Eso queda fuera del alcance de 117c.

---

## 4) Plan de sub-sprints 117c1..N

> Cada sub-sprint con touch-list **1-3 archivos máx**. Si necesita más, se divide. Cada uno con plan de rollback explícito.

### SPRINT-117c1 — Renombrar etiquetas y eliminar ítem duplicado

**Touch-list:** `src/components/Sidebar.tsx`, `src/App.tsx` (1 línea para redirect).
**Cambios concretos:**
- `Calendarios` → `Calendarios públicos (Calendly)` (label visible).
- `Rendimiento` → `Mi rendimiento` para operaria/secretaria (admin/coord siguen viéndolo como `Rendimiento`).
- Quitar `/admin/configuracion/usuarios` del sidebar (no estaba). Confirmar redirect 301: `/admin/configuracion/usuarios → /admin/usuarios` en `App.tsx`.

**Rollback:** revertir commit. Sólo cambian strings y 1 redirect.
**Riesgo:** bajo. Cero impacto funcional.
**Orden sugerido:** primero. Es la base de confianza.

### SPRINT-117c2 — Crear sección "Bandeja de entrada"

**Touch-list:** `src/components/Sidebar.tsx`.
**Cambios concretos:**
- Mover Citas por Confirmar, Reprogramaciones, Sugerencias chequeo desde "Operaciones" a nueva sección "Bandeja de entrada" (visible para admin/coord/operaria/secretaria con sus respectivos gates).
- Sección colapsable, `defaultExpanded: true`.

**Rollback:** revertir el commit. Los ítems vuelven a Operaciones donde estaban.
**Riesgo:** bajo. Sólo agrupación visual.
**Orden sugerido:** segundo.

### SPRINT-117c3 — Crear sección "Cobranza y facturación"

**Touch-list:** `src/components/Sidebar.tsx`.
**Cambios concretos:**
- Sacar Cotizaciones de "Documentos" (la sección "Documentos" pasa a tener sólo Conduces).
- Crear sección "Cobranza y facturación" con: Cotizaciones, Conduces pendientes (badge), Conduces de Garantía.
- Eliminar sección "Documentos" o renombrarla a "Otros documentos" si queda algún ítem.

**Rollback:** revertir commit. Vuelven a Documentos.
**Riesgo:** bajo. Reordenamiento puro.
**Orden sugerido:** tercero.

### SPRINT-117c4 — Crear sección "Equipo" + mover Mantenimientos

**Touch-list:** `src/components/Sidebar.tsx`.
**Cambios concretos:**
- Sacar Personal, Usuarios y Permisos, Reporte de Ponches de "Sistema".
- Crear sección nueva "Equipo" con esos 3 ítems.
- Sección "Sistema" pasa a tener sólo Configuración y Plantillas Marketing.
- Mover Mantenimientos del top-level dentro de Operaciones.

**Rollback:** revertir commit.
**Riesgo:** bajo.
**Orden sugerido:** cuarto.

### SPRINT-117c5 — Simplificar sidebar operaria/secretaria

**Touch-list:** `src/components/Sidebar.tsx` (potencialmente `src/utils/permisos.ts` si requiere ajustar gates).
**Cambios concretos:**
- Operaria: ocultar Mapa de Rutas, Catálogo legacy, Equipos en Taller, Personal del sidebar (siguen accesibles por URL).
- Secretaria: ocultar Pendiente de piezas, Mapa de Rutas, Catálogo legacy, Equipos Taller, Personal del sidebar.
- Conservar gating de rutas (URL directas siguen funcionando con sus permisos actuales).

**Rollback:** revertir commit. Vuelven a verlo.
**Riesgo:** **medio**. Requiere validación con Aury (no aplica — es técnico), Wilainy y Yohana después del deploy: que confirmen que **no extrañan ningún ítem** de los ocultados. Si extrañan alguno, restauramos selectivamente.
**Orden sugerido:** quinto. Hacerlo cuando los 4 anteriores ya estabilizaron.

### SPRINT-117c6 — Limpiar alias `isAdmin = esAdminOCoord` en Sidebar.tsx

**Touch-list:** `src/components/Sidebar.tsx`.
**Cambios concretos:**
- Eliminar línea `const isAdmin = esAdminOCoord;` (línea 164 actual).
- Reemplazar TODAS las usages de `isAdmin` en este archivo con la intención correcta:
  - Si era para "admin Y coord" → `esAdminOCoord`.
  - Si era para "sólo admin literal" → `userProfile?.rol === 'administrador'`.
  - Auditar caso por caso.

**Rollback:** revertir commit.
**Riesgo:** **medio**. Requiere lectura cuidadosa porque el alias se usa en ~15 lugares. Si se cambia mal, un ítem aparece donde no debería o se oculta donde debería verse. **Reviewer obligatorio.**
**Orden sugerido:** sexto. Es limpieza técnica, no cambio funcional visible. Hacerlo último porque depende de tener la estructura final ya estable.

### Sub-sprints fuera del alcance de 117c (separar como sprints propios)

- **Mover "Métricas del Mes" como pestaña dentro de Rendimiento.** Requiere refactor de `Rendimiento.tsx` para agregar tabs. Es trabajo de UI no trivial → sprint propio cuando Jorge priorice.
- **Eliminar `/admin/productos` (Catálogo legacy) del routing.** Riesgo M-A: hay imports de `Productos` que pueden estar leyéndose desde Cotizaciones legacy. Sprint propio con auditoría previa.
- **"Siguiente paso" inline + atajos globales (Ctrl+K).** Mejora real de fricción. Sprint propio grande.

---

## 5) Restricciones globales para fase 117c (recordatorio)

(Copiado del spec original de SPRINT-117c en `COLA_AUTONOMA.md` para tener todo en este doc.)

- **archivist OBLIGATORIO en modo PRE-CHANGE** antes de cada sub-sprint — `Sidebar.tsx`, `App.tsx`, `Ordenes.tsx`, `TecnicoVista.tsx` están en archivos críticos.
- **regression_guardian OBLIGATORIO** antes de commit (toca `src/components/`).
- **Touch-list acotado** — 1-3 archivos por sub-sprint. Si necesita más, dividir.
- **Plan de rollback explícito** en cada commit message.
- **QA visual obligatorio** — antes de cerrar cada sub-sprint, Jorge verifica el cambio en producción y confirma con Aury (técnico), Wilainy/Yohana (operarias). Si alguien dice "pero perdí X", restaurar X.
- **Mantener redirects** desde rutas viejas — todas las rutas existentes siguen activas, sólo se ajustan etiquetas y agrupación visual.
- **Sub-regla "documentación viva"** — al cerrar cada sub-sprint, actualizar `CLAUDE.md` y `CONTEXTO_PROYECTO.md` con el cambio de IA.
- **Postmortem-positivo al final** — cuando los 6 sub-sprints cierren OK, archivist genera `docs/postmortems/2026-05-XX-rediseno-ia-aprendizajes.md`. NO es bug, pero el aprendizaje vale para futuros rediseños.

---

## 6) Preguntas abiertas (no bloqueantes — Jorge puede contestarlas en `BLOQUEOS.md` al desbloquear)

1. **Métricas del Mes como pestaña dentro de Rendimiento — ¿lo querés en 117c o como sprint propio aparte?** Mi recomendación: sprint propio porque requiere refactor real de UI. Default sin tu input: sprint propio.
2. **Etiqueta "Bandeja de entrada" — ¿te suena bien o preferís otra?** Alternativas: "Por revisar", "Pendiente de revisión", "Inbox". Default: "Bandeja de entrada".
3. **Para operaria, ¿de verdad querés ocultar Mapa de Rutas?** Si la operaria llama a clientes y necesita ver dónde está el técnico, igual le sirve. Default sin tu input: ocultar (consistente con la propuesta).
4. **Catálogo legacy (`/admin/productos`) en el sidebar admin — ¿ocultarlo ya en 117c o esperar a sprint que también lo elimine del routing?** Default: ocultar en sidebar ya, eliminar del routing en sprint propio.

---

## 7) Cómo desbloquear

Editá la entrada SPRINT-117c en `docs/sprints/BLOQUEOS.md` con UNA de estas líneas al final:

- `OK: jorge YYYY-MM-DD HH:MM` → procesar todos los sub-sprints 117c1..c6 en orden, con confirmación humana entre cada uno.
- `OK selectivo: jorge YYYY-MM-DD HH:MM | sub-sprints: 117c1, 117c3, 117c4` → procesar sólo los listados.
- `Cambios: jorge YYYY-MM-DD HH:MM | <feedback en lenguaje natural>` → revisar la propuesta antes de procesar (genero v2).
- `RECHAZADO: jorge YYYY-MM-DD HH:MM | <motivo>` → descartar reorganización entera.

Después pegás `procesa bloqueos` al coordinator y arranca.

---

**Fin de la propuesta.**

> Esta propuesta NO ejecuta ningún cambio. Es un documento para que Jorge decida.
