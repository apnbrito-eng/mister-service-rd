# Estado temporal: Sprint Conduces estilo SIBS — PAUSADO

**Pausa:** 2026-05-04 ~21:15 RD
**Razón:** los agentes nuevos del equipo expandido (`tech_lead`, `architect`, `security`, `qa`, `docs`, `user_advocate`, y el recién agregado `mejora_continua`) están en `.claude/agents/*.md` pero NO se registraron en el runtime del sistema Agent. Solo aparecían los 5 originales (`builder`, `coordinator`, `devops`, `reviewer`, `tester`). Jorge sale y vuelve con sesión limpia para que los 12 agentes carguen correctamente.

**Sprint a retomar:** `docs/sprints/PROMPT_CONDUCES_ESTILO_FACTURACION_SIBS.md`.

## Decisiones tomadas hasta ahora

**Ninguna nueva** en esta sesión. Las 5 decisiones del spec original ya estaban cerradas antes de arrancar:

1. Alcance: `/admin/facturas` rediseño completo + `FacturacionPendiente` solo selectos UX.
2. Comisión: reparto proporcional por monto del item (vendedor por línea, N comisiones si hay N técnicos).
3. Precios: Precio 1 = Mayoreo (default), Precio 2 = Detalle.
4. `Producto.tipoItem`: `'producto' | 'servicio'`, default `'producto'`.
5. USD diferido — solo DOP en V1.

Recomendado en spec: split en 2 commits (~3-4h cada uno).

### Decisiones agregadas 2026-05-04 (sesión continuación)

6. **Refactor de `Facturas.tsx`**: lo decide `tech_lead` en su estimación inicial. Si recomienda split en sub-componentes, Jorge confirma en la retro post-deploy.
7. **Migración 9k+ productos sin `tipoItem`**: defensivo en `parseProducto` (default `'producto'` si falta el campo). NO se corre script de backfill. Deuda silenciosa aceptada por Jorge.
8. **Refactor `Facturas.tsx`**: SPLIT obligatorio confirmado por Jorge (recomendación tech_lead). Sub-componentes en `src/components/facturas/`.
9. **Resolución colisión `tipoItem`**: el nuevo campo se llama `Producto.naturaleza` con valores `'producto' | 'servicio'` (default `'producto'`). `ItemCotizacion.tipoItem` queda intacto.
10. **División en commits**: 3 commits (no 2). C1 = schema + parseProducto. C2 = UI Facturas + split. C3 = comisión proporcional + FacturacionPendiente.
11. **Estimación total**: 9-12h (ajustada al alza por tech_lead).
12. **Cálculo comisión proporcional — orden estricto** (Jorge, aclaración 2026-05-04):
    1. Por cada item: `montoBase = precio * cantidad` (precio SIN ITBIS).
    2. `proporcionItem = montoBase / subtotalSinItbis` (suma de todos los `montoBase`).
    3. `gananciaNeta = subtotalSinItbis - costoPiezasTotal`.
    4. `comisionItem = (gananciaNeta * proporcionItem) * (porcentajeTecnico / 100)`.
    5. ITBIS se SUMA al final del total del conduce, NO entra en el cálculo de comisión.
    **Anti-patrón prohibido:** calcular `proporcionItem` sobre `totalConItbis`. Architect propuso esto como "matemáticamente equivalente" — Jorge lo descartó. Inflaba comisiones ~18% en escenarios con varios precios.
    **Reviewer commit 3 DEBE verificar explícitamente** que el código usa `montoBase` (sin ITBIS) en el numerador y denominador de `proporcionItem`.

## Decisiones cerradas adicionales (Jorge, 2026-05-04 post-mejora_continua)

13. **Catálogo del modal Detalles: opción (b)** — `precios_servicios` + `piezas_inventario` (los catálogos vivos que cotizaciones YA usa via `CatalogoSelectorModal`). **NO se toca el schema `Producto`.** La isla `productos` queda como está.
14. **Reformular Commit 1:** en vez de extender `Producto`, extender `ServicioPrecio` y/o `PiezaInventario` con `precioMayoreo`/`precioDetalle` SI HACE FALTA (architect debe evaluar si los catálogos actuales ya tienen suficiente o necesitan los nuevos campos).
15. **`Producto.naturaleza` ya NO aplica** — la separación semántica existe naturalmente: `precios_servicios` = mano de obra/diagnóstico/instalación (sin stock), `piezas_inventario` = piezas físicas con stock. NO agregar `naturaleza` a ningún schema. El campo `ItemCotizacion.tipoItem` actual (`'servicio'|'pieza'|'manual'`) queda como discriminador único.
16. **`parseProducto` ya NO es necesario** para este sprint (Producto no se toca). Si los nuevos campos van en `precios_servicios` o `piezas_inventario`, evaluar parsers existentes en `precios.service.ts` y crear los faltantes.
17. **Comisión en `Facturas.tsx` flujo manual: SÍ** — admin que crea conduce manual con vendedor por línea DEBE generar comisiones proporcionales. Sin esto, vendedor por línea pierde sentido en flujo manual.
18. **Denormalización N>1 técnicos:** OK con propuesta architect (N=1 denormaliza igual; N>1 deja `comisionTecnicoMonto = total`, `comisionTecnicoNombre = "N técnicos"`, `comisionTecnicoId = undefined`).
19. **`costoCompra`:** DIFERIR fuera de V1.
20. **Correcciones técnicas obligatorias para architect (de mejora_continua):**
    - #2: extender `parseFactura.items.map()` con los 5 campos nuevos del item (sin esto, round-trip lossy).
    - #3: estrategia de limpieza de comisiones huérfanas al re-emitir conduce con técnicos distintos.
    - #5: reusar `useOrdenCreateForm` (o crear hook compartido `useClientesEnVivo`) — NO abrir un 6° `onSnapshot` redundante.
    - #9: extraer `calcularComisionesProporcionales(items, orden, itbisPct): Array<{tecnicoId, monto, ...}>` como función pura testeable.
    - Adicionales: render fallback `Facturas.tsx:752` para N>1, eliminar cast `as unknown as ItemCotizacion[]` en `FacturacionPendiente.tsx:606`, preservar `quincenaAsignada` si `estadoLiquidacion === 'liquidada'`, objetivo numérico de líneas para `Facturas.tsx` post-split (<750).

## Decisiones cerradas adicionales (Jorge, 2026-05-04 post-architect-replan)

21. **Mayoreo/Detalle: opción (b) — catálogo como fuente única de verdad.** Razones de Jorge:
    - Fuente única evita inconsistencias entre admins.
    - Velocidad operacional al delegar emisión de conduces a secretarias/operarias sin tener que preguntar precios.
    - Reportabilidad: "ventas mayoreo vs detalle del mes" es agregable contra precio oficial.
    - ROI razonable: +2-3h, +1 commit, vs ahorro continuo al rollout 5+ personas.
22. **Schema extension obligatoria:**
    - `ServicioPrecio.precioMayoreo?` + `ServicioPrecio.precioDetalle?`
    - `PiezaInventario.precioMayoreo?` + `PiezaInventario.precioDetalle?`
23. **Migración defensiva trivial:** si el doc solo tiene `precio` actual, tratar como `precioMayoreo = precio` y `precioDetalle = precio`. Cero downtime, cero rotura. Sin script de backfill.
24. **UI nueva:** en `PreciosServicios.tsx` y `Inventario.tsx` para editar `precioMayoreo` + `precioDetalle`. Mantener `precio` visible (deprecated alias) por compat.
25. **Parsers a crear/extender:** `parseServicioPrecio` y `parsePiezaInventario` con cascada defensiva.
26. **División: ahora 4 commits** (no 3):
    - C1: tipos `ItemCotizacion` + `parseFactura` extendido + helpers `comisiones.ts` (función pura + wrapper). Sin UI.
    - C2: extender `ServicioPrecio` + `PiezaInventario` con Mayoreo/Detalle + parsers + UI catálogo (`PreciosServicios.tsx`, `Inventario.tsx`).
    - C3: split `Facturas.tsx` + sub-componentes `src/components/facturas/` + comisión flujo manual.
    - C4: `FacturacionPendiente.tsx` con vendedor por línea + denormalización N>1 + cleanup cast.
27. **Estimación nueva: 10-11h total.**
28. **Riesgo 4 resuelto (FacturacionPendiente herencia `tecnicoId`):** heredar `orden.tecnicoId` por default a todos los items + permitir sobrescribir por línea. Mantiene flujo automático actual + agrega flexibilidad nueva.

## Ajustes mejora_continua segunda validación (obligatorios para builder)

29. **H1 — Asimetría campo legacy:** la cascada de migración usa **diferente nombre** según entidad:
    - `ServicioPrecio`: `precioMayoreo ?? precio ?? 0` y `precioDetalle ?? precioMayoreo ?? precio ?? 0`.
    - `PiezaInventario`: `precioMayoreo ?? precioVenta ?? 0` y `precioDetalle ?? precioMayoreo ?? precioVenta ?? 0`.
    - JSDoc de los parsers debe explicitar la asimetría para evitar confusión.
30. **H3 — Toggle modalidad por línea:** confirmado en C3. Vive en `FacturaItemsEditor` (radio button por fila o dropdown). Default lo decide architect/user_advocate. Persiste en `ItemCotizacion.precioModalidad`. `CatalogoSelectorModal` debe mostrar AMBOS precios (mayoreo y detalle) cuando estén disponibles.
31. **H4 — Tools IA:** en C2, actualizar `api/_lib/iaTools.ts` para que `query_precios_servicios` (~línea 1028) y `query_piezas_inventario` (~línea 1350) devuelvan `precioMayoreo` y `precioDetalle` (con fallback al campo legacy). Sin esto, la IA conversacional queda inconsistente con catálogo.
32. **H5 — Sweep C2:** incluir `src/firebase/seedPrecios.ts` y `src/pages/Dashboard.tsx:172-185` en la migración para evitar zombi inconsistente.
33. **H7 — Call sites del parser inline (C2 obligatorio):** los 5 sitios a unificar con los parsers nuevos:
    1. `src/services/precios.service.ts:22-35`
    2. `src/components/CatalogoSelectorModal.tsx:52-65` (servicios) y `:69-85` (piezas)
    3. `src/pages/PreciosServicios.tsx:43-57`
    4. `src/pages/Inventario.tsx:71-88`
    5. `src/pages/Dashboard.tsx:172-185`
34. **H10 — Política `precio`/`precioVenta` legacy:** en la UI editora (`PreciosServicios.tsx`, `Inventario.tsx`), mostrar el campo legacy SOLO si el doc no tiene `precioMayoreo` aún (estado de migración pendiente). Una vez admin guarda con los nuevos campos, ocultar el legacy. Previene desincronización futura.

## Ajustes opcionales / capturas en docs (no bloquean)

- **H2 — Copy/tooltips mayoreo vs detalle:** `user_advocate` define el texto. Ej. servicios: "Mayoreo = empresas/B2B, Detalle = particulares".
- **H6 — Scope guard C2:** plan explícito de NO tocar `CatalogoSelectorModal.tsx` ni `Cotizaciones.tsx` en C2 (siguen leyendo legacy vía cascada). Tocarlos en C3 si aparece tiempo.
- **H8 — JSDoc anti-misuse en `useClientesEnVivo`:** "no usar cuando ya tenés `useOrdenCreateForm`".
- **H9 — Auditoría limpieza huérfanas:** cuando se preserva una comisión liquidada obsoleta, marcar `obsoletaPorReemisionConduce: true` para queries futuras + entrada explícita en `auditoria` de la orden.

## Decisiones cerradas Security + UX (Jorge, 2026-05-04)

35. **Rules `piezas_inventario` (Security A=b):** restringir `update` a `esAdminOCoord()` (precios son sensibles). Operaria mantiene `create` para recepción. Cambio en `firestore.rules:455-458`. Defense in depth.
36. **Semántica Mayoreo/Detalle (B=a):** Mayoreo = B2B/talleres aliados/distribuidores. Detalle = cliente final/mostrador. Tooltip exacto: *"Mayoreo: cobramos a otro taller o cliente B2B. Detalle: cliente que llega al mostrador o pide servicio a domicilio."*
37. **Default modalidad (C=c):** derivado de `cliente.tipo`. `b2b` → Mayoreo. `particular` → Detalle. Admin puede sobrescribir manualmente.
38. **`cliente.tipo` agregado al sprint (D=a):** `Cliente.tipo: 'particular' | 'b2b'`, default `particular` para los 9k existentes (migración defensiva en `parseCliente`). Admin marca `b2b` solo cuando aplica. Habilita decisión 37 + reportes futuros ("facturado particulares vs B2B"). UI nueva en `Clientes.tsx` para editar el tipo.
39. **Modal Detalles híbrido (E=c):** items **Manual** entrada inline rápida (mano de obra, diagnóstico, descripción libre — uso más común). Items **Inventario** abren modal automático al seleccionar del catálogo (necesita Mayoreo/Detalle + técnico responsable). Best of both worlds.
40. **Renombre "Vendedor" → "Técnico responsable" (F=a):** label, copy y opciones. "Ninguno" → "Sin técnico (mostrador)".
41. **Drawer (no modal anidado) para "Nuevo Cliente" (G=a):** drawer lateral mantiene visible el conduce de fondo. Estándar moderno + viable en 1366×768.
42. **Quick-wins 7-12 (H=a):** todos aplican. Distribuidos en commits 2-4.

## NUEVO — Commit 0 agregado al sprint

Antes del C1, **C0** dedicado a `cliente.tipo` (es prerequisito para C3 y C4):
- `Cliente.tipo?: 'particular' | 'b2b'` en `src/types/index.ts`.
- Extender `parseCliente` con default defensivo `'particular'`.
- UI en `Clientes.tsx`: dropdown/radio editable con dos opciones. Default `particular` al crear.
- Sin script de backfill (cascada defensiva en parser).
- ~1-1.5h.

## Plan FINAL — 5 commits

| # | Scope | Horas |
|---|---|---|
| **C0** | `cliente.tipo` schema + UI `Clientes.tsx` + parseCliente defensivo | 1-1.5h |
| **C1** | Tipos `ItemCotizacion` (`tecnicoId`, `tecnicoNombre`, `precioModalidad`) + `parseFactura.items.map` extendido + helpers `comisiones.ts` (función pura `calcularComisionesProporcionales` + wrapper `registrarComisionesPorItems`). **Sin UI.** | 1.5-2h |
| **C2** | Extender `ServicioPrecio` + `PiezaInventario` con `precioMayoreo`/`precioDetalle` + parsers defensivos asimétricos (decisión 29) + UI catálogo (`PreciosServicios.tsx` + `Inventario.tsx`) con tooltips (decisión 36) + sweep H7 (5 call sites del parser inline) + actualizar tools IA (decisión 31) + sweep H5 (`seedPrecios.ts`, `Dashboard.tsx`) + ajuste rules `piezas_inventario` (decisión 35) + **quick-win 8** (badge "Precio único" en `CatalogoSelectorModal`) | 3-3.5h |
| **C3** | Split `Facturas.tsx` <750 líneas + sub-componentes en `src/components/facturas/` (`FacturaModalCrear`, `FacturaItemsEditor` con entrada inline + botón "..." opcional, `FacturaItemDetallesModal` solo para Inventario, `ClienteAutocompleteFactura` con drawer "Nuevo Cliente" lateral, `FacturaResumenTotales`) + rename "Vendedor"→"Técnico responsable" + comisión flujo manual + render fallback Facturas.tsx:752 + **quick-wins 7, 9** (borrador localStorage, items Manual marcados "no genera comisión") | 4.5-5h |
| **C4** | `FacturacionPendiente.tsx` con vendedor por línea (default `orden.tecnicoId`) + dropdown técnicos filtrado a técnicos de la orden (**quick-win 12**) + denormalización N>1 + cleanup cast `as unknown as` + **quick-wins 10, 11** (tooltip desglose N>1, validación pre-finalizar) | 2.5-3h |

**Total: 12.5-15h.** Sprint largo pero con 5 commits atomizados, cada uno mergeable individualmente.

## Tasks completadas

- **Lectura del spec completo** (`PROMPT_CONDUCES_ESTILO_FACTURACION_SIBS.md`, 223 líneas) confirmada.
- **9 tasks creadas** (#33-#41) cubriendo el flujo completo: tech_lead → architect → security → builder/tester/reviewer/qa commit 1 → builder/tester/reviewer/qa commit 2 → tech_lead retro → docs.
- **Detección del bloqueador**: agentes expandidos no disponibles en runtime.

## Tasks pendientes (cuando retomes)

Por ejecutar en orden:

1. **Tech lead estimación + plan de fases** (#33, marcada `in_progress` pero no ejecutada). Validar ~6-8h, identificar 3-5 riesgos, plan de paralelización architect/security, métricas QA por commit, áreas críticas.
2. **Architect: validar schema Producto extendido** (#34). `tipoItem` + `precioMayoreo` + `precioDetalle`. Migración backwards-compat con productos existentes.
3. **Security: rules productos/comisiones** (#35). Validar que cambios no exponen datos sensibles ni rompen aislamiento entre técnicos.
4. **Commit 1: Builder schema + UI Facturas** (#36). `Producto.tipoItem` + `precioDetalle` + modal Detalles + items inline + dropdowns Numeración/Condiciones/Método Pago.
5. **Commit 1: Tester + Reviewer + QA + Push + Devops** (#37).
6. **Commit 2: Builder comisión proporcional + FacturacionPendiente** (#38). `crearComision` con array de items, vendedor por línea, FacturacionPendiente con selectos UX.
7. **Commit 2: Tester + Reviewer + QA + Push + Devops** (#39).
8. **Tech lead retrospectiva** (#40). Qué salió bien / qué se complicó / acciones para próximos sprints.
9. **Docs: captura aprendizajes en `docs/mapa-mental.md`** (#41). NO saltar — explícito en el spec.

## Áreas críticas a vigilar (anticipadas pero no analizadas todavía)

Estas son las preguntas que tech_lead debería resolver al arrancar — capturadas desde el spec para no perderlas:

- **Migración 9k+ productos** sin `tipoItem`: ¿`parseProducto` defensivo o backfill script?
- **Modal Detalles dentro de Facturas.tsx**: archivo ya grande, ¿cabe sin refactor mayor?
- **`crearComision()` invasividad**: hoy asume 1 técnico por orden, cambiar a array es cambio en `comisiones.service.ts` + posiblemente reportes históricos.
- **FacturacionPendiente "selectos UX"**: el spec no es 100% explícito — vendedor por línea + modal Detalles. ¿Toca el flujo de cierre de orden?
- **Item Manual** (cantidad/precio libres sin catálogo): ¿`FacturaItem` con `productoId: null`? Definir shape.
- **Buscador cliente con autocomplete** en modal Facturas: 9k+ clientes — ¿cargar todo o paginar?
- **Comisión proporcional rompe reportes históricos**: backwards compat para comisiones ya creadas con shape viejo.

## Cómo retomar

Al volver con sesión limpia y los 12 agentes:

```
/equipo retomá el sprint conduces estilo SIBS desde docs/sprints/_estado-temporal-conduces.md
```

El coordinator nuevo:
1. Lee este archivo para contexto.
2. Lee `PROMPT_CONDUCES_ESTILO_FACTURACION_SIBS.md` para el sprint completo.
3. Recrea las 9 tasks (o las que falten).
4. Arranca con tech_lead estimación.

Una vez el sprint termine y haya post-mortem completo, **borrar este archivo** (`docs/sprints/_estado-temporal-conduces.md`) — es estado efímero.

## Retrospectiva C3 (2026-05-04)

### Commits desplegados

- **C3a** — `170b5a3` — split puro de `Facturas.tsx` → 5 archivos, 989→825 LOC.
- **C3b** — `6b9c4c2` — features completas (drawer cliente, comisión por línea, modalidad por línea, audit log, denormalización N>1, quick-wins 7 y 9). 9 archivos, +1712 / -207.

### Lo que salió bien

1. Split **C3a (puro) + C3b (features) en commits separados**: reviewer aprobó C3a al primer intento por diff 100% mecánico. Replicable como patrón.
2. Architect rechazó `FacturaCreacionContext` a tiempo — evitó over-engineering para 6 valores.
3. Security exigió audit log + `clienteTipoEnEmision` ANTES del builder — sin re-rounds por compliance.
4. Validación de plan con Jorge antes de delegar (G1-G4, D1-D4) — cero rework por scope.
5. Mejora_continua detectó inconsistencia hook `useApp` vs `useAppContext` antes del builder.

### Lo que se complicó

1. Builder olvidó denormalización post-`registrarComisionesPorItems` → render N>1 mostraba `—`. Causa raíz: separación helper/caller no documentada.
2. Builder montó `useClientesEnVivo` en modal con justificación factualmente incorrecta ("desperdicia reads") — no verificó ciclo de vida real del componente.
3. Dead code `hasMountedRef` — síntoma copy-paste sin verificación. `--max-warnings 0` no está en `package.json`.
4. Semántica `solicitanteUid` inconsistente (`userProfile.id` vs `auth.currentUser.uid`) — aceptado como deuda.
5. `METODO_PAGO_LABELS` duplicado, re-parseo redundante en drawer — builder no leyó código adyacente.

### Aprendizajes accionables

1. **Helpers que escriben Firestore + retornan datos NO denormalizan al caller.** Toda invocación de `registrarComisionesPorItems` (o similares) requiere denormalización local explícita post-call. **Persistido en `CLAUDE.md` sección "Conventions & gotchas".**
2. **Antes de optimizar reads, verificar ciclo de vida real del componente** (montaje persistente vs efímero).
3. **Toda decisión arquitectónica con Context pasa por architect primero.**
4. **Splits puros + features siempre en commits separados** cuando el split toca >3 archivos.
5. **Audit log + campo `XEnEmision` (snapshot)** es el patrón para overrides sensibles de admin/coord.

### Deuda técnica priorizada

**Cleanup consolidado (~45 min):**

1. `METODO_PAGO_LABELS` duplicado → mover a `utils/factura.ts`.
2. Re-parseo redundante en `ClienteNuevoDrawer.tsx:86,104`.
3. Click-outside en dropdown `agregarMenuRef`.
4. `ClienteNuevoDrawer.onChange` teléfono: limpiar `duplicado` en change, no en blur.

**Sprint específico:**

5. Semántica `solicitanteUid` unificación.
6. `console.warn` por orden sintética `factura-manual-{X}` (guard con flag).

**Backlog largo plazo:**

7. `--max-warnings 0` en `package.json` (alinear con CLAUDE.md).
8. Bundle 2.52 MB → code-splitting.

### Estimación calibrada

5.5-6.5h estimado vs ~5h real. Sobreestimación leve. **Splits puros son ~30% más rápidos que features a igual LOC.**

## Retrospectiva C4 (2026-05-04)

### Commits desplegados

- **C4a** — `ded0124` — split puro de `FacturacionPendiente.tsx` + helper `formatMonedaPrecisa`.
- **C4b** — `e358f76` — features completas: vendedor por línea, N>1 técnicos, helper `eliminarComisionesDeFactura` sensible, audit log, `clienteTipoEnEmision`, `solicitanteUid` unificado, borrador localStorage 24h, quick-win 11.

### Lo que salió bien

1. **Security PRE-DESIGN cazó bug crítico del spec** (`estado` vs `estadoLiquidacion`). Sin esto, se borraban comisiones liquidadas al re-emitir conduce.
2. Las **7 condiciones de security se cumplieron 1-a-1**, reviewer las verificó explícitamente.
3. **Estimación architect acertada** (4-5h vs 4.5h real).
4. **Split C4a aislado de features C4b** redujo el riesgo del review (diff puro vs diff de features).
5. **Builder justificó decisiones leyendo código real** (caso `EliminarOrdenButton` sin cascade) en vez de asumir.

### Lo que se complicó

1. Builder no anticipó violación `react-refresh/only-export-components` con named export desde componente. Sumó 1 iteración (fix corto: extraer `formatMonedaPrecisa`).
2. **Edge case borrador localStorage** (overwrite sin restaurar) escapó al primer review.
3. Inconsistencia silenciosa en `handleDelete` con catch que continúa con `deleteDoc` aunque el paso previo falle.
4. **`solicitanteUid` cambió mid-sprint** (de `currentUserUid` a `userProfile?.id`) — contrato de identidad no estaba en plan del architect.
5. **14 ítems de deuda acumulada** (8 de C3 + 6 de C4) — señal de que el cleanup consolidado se vuelve prioridad.

### Aprendizajes accionables

1. **Extraer formatters/helpers a `utils/index.ts` desde el primer uso compartido.** No esperar al segundo. Persistido en `CLAUDE.md` (regla `react-refresh/only-export-components`).
2. **Helpers que tocan dinero/comisiones pasan por security PRE-DESIGN obligatorio.** No al final, no en revisión: antes de que el architect cierre el plan.
3. **Effects de save a localStorage requieren guard explícito "ya restauré"** (`yaRestauradoRef` o condicionar a `borradorEncontrado === null`). Persistido en `CLAUDE.md`.
4. **Catch internos en cascadas de deletes deben decidir explícitamente abortar o continuar** — no dejar al azar del catch genérico. Si el error es no-transient, abortar y mostrar toast warning.
5. **Contratos de identidad (qué `uid` representa al usuario) deben estar en plan del architect**, no decidirse mid-sprint. Documentar en spec qué campo del audit log usa qué fuente.

### Deuda técnica priorizada CONSOLIDADA (C3 + C4)

**Cleanup consolidado (~3-4h, recomendado siguiente sprint):**

- N1 C4: `Facturas.tsx:handleDelete` abort si error no-transient + toast warning.
- N2 C4: borrador localStorage condicionar save a `borradorEncontrado === null`.
- N3 C4: audit log `comisionesAfectadas` incluir `quincenaAsignada` + `comisionPorcentaje`.
- N6 C4: centralizar `puedeOverrideModalidad` y `puedeConfigurarGarantia` en `permisos.ts`.
- C3: `METODO_PAGO_LABELS` dedup → `utils/factura.ts`.
- C3: re-parseo redundante en `ClienteNuevoDrawer.tsx:86,104`.
- C3: click-outside en dropdown `agregarMenuRef`.
- C3: `ClienteNuevoDrawer.onChange` teléfono — limpiar `duplicado` en change, no en blur.
- C3: `console.warn` ruidoso por orden sintética `factura-manual-{X}` (guard con flag).

**Sprint propio (no mezclar con cleanup):**

- N5 C4: 4 `onSnapshot` en `FacturacionPendiente` → catálogos como `getDocs` (one-shot).
- C3 fase B App Check hard enforcement (validar métricas 24-48h primero).

**Backlog largo plazo:**

- `--max-warnings 0` alinear `package.json` con `CLAUDE.md`.
- Bundle 2.52 MB → code-splitting.
- Semántica `solicitanteUid` audit logs históricos (mixed `userProfile.id` y `currentUserUid`).

### Estimación calibrada

4-5h estimado vs 4.5h real. **Patrón confirmado: split + features = sumar, no max.** Cada iteración `CHANGES_NEEDED` agrega 20-30 min. Splits puros sobre componente existente = 1-1.5h fijo.

### Recomendación próximos sprints

1. **Cleanup consolidado** (PRIORIDAD #1) — 14 ítems acumulados de C3+C4. ~3-4h.
2. **Filtro avanzado finanzas** después.
3. **Postergar C3 fase B App Check** hasta métricas estables 24-48h.

## Retrospectiva Cleanup Consolidado (2026-05-04)

### Commit desplegado

- **Cleanup** — `cf25310` — `chore(cleanup): consolidado deuda Conduces SIBS C3+C4 (9 items)`.
- 10 archivos modificados, +162 / -55 LOC.
- 1 archivo nuevo (`src/utils/factura.ts`, 28 LOC).
- 0 loops `CHANGES_NEEDED`.
- Tiempo real: ~60 min (estimado ~60 min).

### Lo que salió bien

1. **1 sola iteración sin `CHANGES_NEEDED`** — spec calibrada al delegar.
2. **Bundling de 9 tareas heterogéneas en un solo commit `chore(cleanup)`** — historial limpio + rollback atómico.
3. **Builder ejerció criterio en N7 (scope 2→4 archivos) sin pedir permiso** — autonomía correcta.
4. **Decisión NO tocar 3 callsites locales en N6** respetó regla de no refactor opportunista.

### Lo que se complicó

1. **`react-hot-toast` sin `toast.warning`** → workaround `icon: '!'`. Revela necesidad de wrapper unificado.
2. **Identificación tardía de N6.5 (20+ callsites pendientes).** Grep preliminar habría ajustado scope.

### Aprendizajes accionables

1. Para cleanups futuros: correr `Grep` exhaustivo del patrón a centralizar ANTES de estimar tamaño.
2. Helper de toasts unificado (`utils/toast.ts` con `toastWarning`/`toastInfo`) candidato para próximo cleanup.
3. Límite blando 1000 LOC de CLAUDE.md debería ser check automático en tester (`Facturas.tsx` ya 980).

### Estado deuda post-cleanup

**Antes:** 14 ítems. **Resueltos:** 9. **Pendientes:** 5.

| ID | Descripción | Prioridad |
|---|---|---|
| N1.5 | `resource-exhausted` no en TRANSIENT_CODES — decisión Jorge | MEDIA (producto) |
| N6.5 | 20+ callsites locales `administrador \|\| coordinadora` inline | MEDIA (técnica) |
| C3 fase B | App Check hard enforcement post métricas 24-48h | ALTA (seguridad) |
| Facturas.tsx 980 LOC | Extraer modal garantía manual cuando se toque | BAJA (oportunista) |
| ESTADO_COLORS/LABELS | Mover a `utils/factura.ts` cuando OrdenDetalle los use | BAJA (oportunista) |

### Recomendación próximos sprints

1. Validar métricas App Check 24-48h → C3 fase B (único riesgo de seguridad activo).
2. Revisar `PROMPT_CONDUCES_ESTILO_FACTURACION_SIBS.md` para sprints SIBS pendientes.
3. Filtro avanzado finanzas (sprint medio, valor alto).
4. Repo-wide cleanup N6.5 (paralelizable con helper de toasts).
5. N1.5 pendiente decisión de producto.

### Métricas

- Tiempo estimado: ~60 min.
- Loops `CHANGES_NEEDED`: 0.
- Archivos nuevos: 1 (`utils/factura.ts`).
- Deuda neta: -9 ítems (14 → 5).

