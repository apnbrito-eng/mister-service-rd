# Estado de sesión — 2026-05-12 (Cowork con Jorge)

> Snapshot de qué se hizo, qué se decidió, qué quedó pendiente. Cualquier sesión futura (Cowork o Claude Code) puede leer este archivo para recuperar contexto en 2 min.

---

## TL;DR

1. **Bug en producción detectado**: `/admin/agenda` muestra todos los técnicos en "Sin citas hoy" + KPIs en 0 aunque hay órdenes con fecha de hoy. Causa raíz: 5 instancias del patrón P-006 escapadas a SPRINT-132 (cazador no detectó variantes `useMemo + Set`).
2. **Re-auditoría profunda a pedido de Jorge** ("precisión quirúrgica, no más errores") detectó 2 cambios faltantes en la propuesta inicial de SPRINT-145 (líneas 315 y 432 de AgendaDia.tsx).
3. **Sistematización anti-regresión**: creados `docs/MAPA_DEPENDENCIAS.md` + `docs/CAMPOS_CROSS_COLLECTION.md` + nueva sub-regla en `CLAUDE.md` ("Touch-list expandido + auditoría de consumidores").
4. **Cola al cierre**: SPRINT-145 + 146 procesándose ahora por Claude Code. SPRINT-147 (los docs) ya pusheado manualmente por Jorge.
5. **QA SPRINT-135a-UI**: Caso 5 reformulado PASS 4/4 contra prod (vía `scripts/qa-sprint-135a-ui.ts`). Casos 1 y 4 pendientes manuales de Jorge. Casos 2 y 3 esperan que Jorge cierre orden + emita conduce.

---

## Lo que se hizo

### Procesamiento de cola previa
- **SPRINT-134** cerrado y deployado (commit `dc72250`). 6/6 funciones cross-collection saldadas: 4 envueltas en `writeBatch` atómico (Inventario / EquiposTaller / Cotizaciones x2); 2 documentadas como `@safe-non-tx` permanente (PersonalPage handleSubmit + ejecutarVinculacion).

### QA del SPRINT-135a-UI (wizard de garantía)
- Plan original en `BLOQUEOS.md`: 5 casos.
- Claude Code descubrió que el flujo real es más complicado: el wizard del técnico solo escribe a la orden; el token de garantía se genera DESPUÉS, cuando admin/coord emite el conduce desde Facturación Pendiente.
- **Caso 5 reformulado**: no hay candidatos legacy en este taller (0/9 facturas tienen `garantia.token`). Se reformuló a "endpoint robusto sin crashear con datos faltantes". **PASS 4/4**.
- Script entregado: `scripts/qa-sprint-135a-ui.ts` — read-only, recibe ordenId, verifica los 3 casos.
- Casos 2 y 3 esperan que Jorge: (a) cierre orden de prueba con `periodoGarantiaDias = 1` en el wizard, (b) emita conduce desde Facturación Pendiente con `tiempoGarantiaDias = 60`. Bonus: si el endpoint público muestra 1 día (no 60), confirma que el modelo nuevo gana sobre el viejo.
- **Caso 1** (manual de Jorge): probar límites del input del wizard (0 y 400 deben rechazar, 1 debe aceptar).
- **Caso 4** (manual de Jorge): cambiar `garantiaVencimiento` a ayer en Firestore Console y verificar que el botón "Reclamar" queda disabled.

### Análisis del flujo de órdenes (OS-0049)
Jorge mostró captura de OS-0049 con incongruencias. Cowork investigó leyendo el código.

**5 incongruencias detectadas en OS-0049:**
1. Tres precios distintos sin historia coherente: sugerido 5,500 → aprobado 7,500 → aprobó solo chequeo 2,000 → cobró 6,500. Ningún campo coincide con la historia.
2. "Solo chequeo" + wizard de cierre nuevo coexistiendo contradictoriamente. La orden fue marcada solo chequeo el 10/5; el técnico la cerró el 12/5 con wizard de reparación completa (equipo funciona Sí, etc.). El código permite ambas cosas a la vez.
3. `metodoPagoCierre` vacío en pantalla pero la auditoría dice "transferencia". Campo huérfano.
4. Período de garantía NO aparece en la auditoría aunque el wizard nuevo lo persiste (queda solo en el doc).
5. Fase "Trabajo Realizado" en la card aunque la orden ya fue pagada + enviada + facturada.

**Hallazgo de diseño más profundo:** la fase de la orden NUNCA pasa a `'cerrado'` automáticamente cuando se paga + envía + factura. Solo pasa si alguien arrastra manualmente en kanban o ejecuta "Solo chequeo" (que es un atajo que pisa todo). Hay dos sistemas paralelos: el flujo normal nunca cierra, "Solo chequeo" cierra a la fuerza.

**5 propuestas de mejora del flujo (NO escritas como sprint todavía):**
1. Que la fase pase a "Cerrado" sola cuando esté pagada + enviada + facturada.
2. Mostrar sub-estado debajo de la fase en la card ("Pendiente de pago", "Pendiente de conduce").
3. Que "Solo chequeo" y "Reparación completa" sean caminos exclusivos desde el principio.
4. Validar coherencia de precios al registrar pago (si precio aprobado ≠ precio cobrado, pedir motivo).
5. Auditoría completa de cambios de precio y campos de cierre (cada cambio con valor anterior + nuevo).

### Bug AgendaDia + sistematización

**Jorge reportó:** `/admin/agenda` muestra "Sin citas hoy (14)" con todos los técnicos, KPIs en 0, aunque OS-0049 está en `fechaCita = 12/05/2026 17:00` con `tecnicoId` de Aury Mon.

**Causa raíz:** 5 instancias del patrón P-006 escapadas al cazador determinístico, que escanea solo `<option value={t.id}>` y `.find(p => p.id === ...)` — NO escanea variantes `new Set(...map(t => t.id)).has(...)` ni `map[t.id]` indexing.

**Re-auditoría profunda (a pedido de Jorge "precisión quirúrgica"):**
- Primer pase de Cowork detectó 4 cambios.
- Jorge pidió re-revisar.
- Segundo pase encontró **2 cambios críticos faltantes**: línea 315 (filtro "Sin citas hoy") y línea 432 (render `ordenesPorTecnico[t.id]`). Sin esos, el fix habría dejado la página parcialmente rota.

**Resultado en cola:**
- **SPRINT-145** (procesando): fix quirúrgico AgendaDia con 6 ediciones + 1 import + comentarios de fallback. Touch-list completo, validaciones, restricciones, QA explícito.
- **SPRINT-146** (procesando): extender cazador P-006 a variantes `useMemo + Set` y `map[t.id]`. Además investiga 3 hits potenciales adicionales de `operariaId` (`nomina.service.ts:172`, `Ordenes.tsx:635`, `Rendimiento.tsx:297`).

### Sistematización anti-regresión

Jorge dijo "no quiero más errores en el software" y pidió recomendaciones. Cowork propuso 6 medidas; Jorge aceptó las 3 más fáciles.

**Acciones tomadas:**

1. **Memoria persistente guardada** — `feedback_revisar_dependencias_antes_de_cambiar.md`. Se carga automáticamente en futuras sesiones de Cowork sobre este proyecto.

2. **`docs/MAPA_DEPENDENCIAS.md` creado** (~250 líneas). Tabla de cada modelo core con sus escritores + comandos grep para regenerar listas vivas + checklist mínimo antes de escribir sprint.

3. **`docs/CAMPOS_CROSS_COLLECTION.md` creado** (~150 líneas). Tabla maestra de campos que conectan colecciones (tecnicoId, ayudanteId, operariaId, responsableId, userId, etc.) con su regla estricta (uid vs docId) y sprint de referencia.

4. **`CLAUDE.md` editado** — nueva sub-regla obligatoria "Touch-list expandido + auditoría de consumidores antes de redactar el sprint". Cualquier sprint futuro debe declarar: archivos a modificar + consumidores verificados con grep + consumidores NO afectados + hallazgos laterales. Si la auditoría revela >5 consumidores, dividir el sprint. Si revela archivos no contemplados, actualizar el sprint antes de procesar.

**Commit SPRINT-147** ya pusheado manualmente por Jorge (no pasó por el coordinator porque es solo docs sin código de app).

---

## Hallazgos laterales documentados como deuda (NO fixear silenciosamente)

1. **SPRINT-148 (propuesto, sin escribir todavía)**: líneas 144 y 191 de `AgendaDia.tsx` escriben `userProfile.id` en lugar de `currentUser.uid` (gotcha P-001). Path alternativo del modal "Solo chequeo" que SPRINT-114 no migró.

2. **`operariaId` en 3 archivos**: comparado contra `p.id` o `userProfile?.id` — si guarda uid, son bugs. SPRINT-146 investiga.

3. **Diseño del flujo de orden**: 5 propuestas no escritas como sprints todavía. La #1 (fase auto-cerrar) es la de más impacto/menor esfuerzo.

4. **"Agenda del Día" rediseño**: hoy muestra solo citas programadas para el día. Jorge pidió que muestre "el pulso del taller" — qué pasa cada técnico hoy. Sprint grande, scope a diseñar.

5. **Precios incoherentes**: OS-0049 tiene tres precios distintos sin reglas. Validación cross-precio falta.

6. **SPRINT-135b/c/d/e** (sub-sprints de garantía): diseñados en discovery pero NO escritos. Esperan QA de SPRINT-135a-UI.

---

## Estado de la cola al cierre

### Procesándose ahora por Claude Code (autónomo)
- **SPRINT-145** — fix P-006 AgendaDia (6 ediciones + 1 import). Touch-list expandido, riesgo bajo.
- **SPRINT-146** — extender cazador P-006 a variantes + barrido + investigar 3 hits operariaId.

### Pusheado ya por Jorge (commit manual)
- **SPRINT-147** — MAPA_DEPENDENCIAS + CAMPOS_CROSS_COLLECTION + sub-regla CLAUDE.md.

### Bloqueos esperando OK Jorge (en `docs/sprints/BLOQUEOS.md`)
- **SPRINT-138** — `storage.rules` baseline (riesgo bajo, defensa en profundidad).
- **SPRINT-141** — App Check enforce (ventana 48h previa, sensible — recomendado activar pronto para empezar el reloj).
- **SPRINT-140** — token garantía (bloqueado: depende de SPRINT-135b/c/d/e no escritos).

### QA pendiente humano de Jorge
- **Caso 1 SPRINT-135a-UI**: probar límites input wizard de garantía (~2 min).
- **Caso 4 SPRINT-135a-UI**: setear `garantiaVencimiento` a ayer en Firestore Console (~3 min).
- **Caso 2 y 3 SPRINT-135a-UI**: cuando termine Claude Code → cerrar orden + emitir conduce + correr script.
- **QA SPRINT-145**: cuando termine de procesar → hard refresh `/admin/agenda` y confirmar Aury Mon aparece con sus órdenes.
- **QA visual pendiente** (no bloqueante): SPRINT-130, 131, 132, 133, 134-mant.

### Sprints futuros propuestos (NO escritos)
- SPRINT-148 — migrar `userProfile.id` a `currentUser.uid` en AgendaDia líneas 144 y 191.
- SPRINT-149+ — fase auto-cerrar cuando orden está pagada + facturada (propuesta #1 del análisis del flujo).
- SPRINT-150+ — sub-estado visible en card ("Pendiente de pago", etc.) (propuesta #2).
- SPRINT-151+ — rediseño Agenda del Día como "Pulso del taller" (timeline de actividad).
- SPRINT-152+ — exclusividad camino solo-chequeo vs reparación-completa (propuesta #3).
- SPRINT-153+ — validación coherencia de precios al registrar pago (propuesta #4).
- SPRINT-154+ — auditoría completa de cambios de precio y campos de cierre (propuesta #5).
- SPRINT-135b/c/d/e — sub-fases de garantía pendientes (esperan QA de 135a).

---

## Decisiones meta tomadas hoy

1. **"Precisión quirúrgica" exigida**: cualquier sprint que toque código debe auditar consumidores con grep antes de procesarse. Si la auditoría revela más cambios, actualizar el sprint, no procesar parcial.
2. **Documentación viva > documentación estática**: el MAPA de dependencias entrega comandos grep para regenerar listas, no listas exhaustivas a mano.
3. **Hallazgos laterales = deuda explícita**: cualquier bug descubierto fuera del scope del sprint actual debe documentarse como deuda con nombre tentativo de sprint futuro. NO fixear silenciosamente.
4. **Modo de trabajo Cowork ↔ Claude Code**: Cowork escribe sprints estructurados a `COLA_AUTONOMA.md`, Jorge pega `trabaja` en Claude Code, el coordinator procesa autónomamente. Mientras procesa, Jorge y Cowork diseñan los siguientes pasos.

---

## Cómo continuar en una sesión futura

### Con Cowork (este chat) en sesión nueva
- Cowork carga automáticamente `CLAUDE.md`, `COWORK_CONTEXTO.md` y memorias persistentes.
- Pegarle: *"Leé docs/sprints/ESTADO_SESION_2026-05-12.md y docs/sprints/DIARIO más reciente. Resumime estado y decime qué procede."*
- Cowork responde con el estado actualizado.

### Con Claude Code (el coordinator)
- `cd ~/Desktop/mister-service-rd && claude --dangerously-skip-permissions`
- Si hay sprints PENDIENTES en `COLA_AUTONOMA.md`: pegar `trabaja`.
- Si hay desbloqueos en `BLOQUEOS.md`: pegar `procesa bloqueos`.
- Si querés que se ubique antes de actuar: el comando largo "Leé estos archivos en orden..." que usaste hoy.

---

## Memoria persistente actualizada hoy

Archivos en `~/Library/Application Support/Claude/.../memory/`:
- `feedback_preguntas_elegibles.md` (preexistente)
- `feedback_revisar_dependencias_antes_de_cambiar.md` **(nuevo)** — Jorge exige análisis exhaustivo de consumidores antes de cualquier modificación.

Estas se cargan automáticamente en CADA conversación futura de Cowork sobre este proyecto.
