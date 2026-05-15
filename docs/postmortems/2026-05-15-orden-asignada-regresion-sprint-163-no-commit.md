# Postmortem — Notificación `orden_asignada` jamás se emitió (SPRINT-163 marcado completado sin commit)

**Fecha del incidente:** 2026-05-14 (detectado en QA), bug latente desde fecha desconocida del declared `TipoNotificacion`.
**Detectado por:** QA E2E distribuido (Maria coord + Yohana operaria + Angelica secretaria + Wilainy operaria) sobre OS-0056 ("QA TEST 14-MAY").
**Severidad:** alta — flujo crítico de coordinación del equipo (técnico, operaria, coord no se enteran de que hay una orden nueva).
**Patrón asociado:** clase nueva → propuesto P-010 (tipo de notificación declarado sin call site emisor).
**Commits relacionados:**
- Introduce: ausencia de commit (SPRINT-163 marcado COMPLETADO en cola, sin diff en git log).
- Fix: `5823955` (SPRINT-169 — 2026-05-15).
- Postmortem: `<este commit>` (2026-05-15).

---

## Resumen ejecutivo

El sprint SPRINT-163 fue marcado como COMPLETADO en `docs/sprints/COLA_AUTONOMA.md` el 2026-05-13 pero nunca produjo commit de código. El tipo `'orden_asignada'` vivió declarado en `TipoNotificacion` sin que ningún call site lo emitiera. Resultado: ningún empleado recibió la notificación cuando Angelica creó la orden de prueba un día después.

---

## Timeline

| Hora | Evento |
|---|---|
| Fecha desconocida (≤2026-05-13) | El valor `'orden_asignada'` fue agregado a la unión `TipoNotificacion` en `src/types/index.ts:1750` por una sesión previa (probablemente redacción inicial de SPRINT-157 o SPRINT-158). |
| 2026-05-13 | SPRINT-163 marcado COMPLETADO en `docs/sprints/COLA_AUTONOMA.md` (pasada 17), pero **sin commit asociado** en git log. |
| 2026-05-14 18:30 (aprox) | QA E2E distribuido. Angelica crea OS-0056 asignando técnico Aury. Maria/Yohana/Wilainy confirman: ninguna campanita recibió notificación `orden_asignada`. Historial de notificaciones tampoco la muestra. |
| 2026-05-14 ~19:00 | Cowork agrega SPRINT-169 a la cola con hipótesis de causa raíz (4 hipótesis ordenadas) y QA expandido. |
| 2026-05-15 (inicio) | Coordinator dispara SPRINT-169 end-to-end. |
| 2026-05-15 (~15 min) | Diagnóstico confirmado: `grep -rn "tipo: 'orden_asignada'"` en `src/` retorna 0 hits — confirmación de hipótesis #2 (el handler nunca llamó a `crearNotificacion`). |
| 2026-05-15 (~30 min) | Fix aplicado en `useOrdenCreateForm.ts` + cazador P-010 + entrada P-010 en `docs/PATRONES_REGRESION.md`. Commit `5823955`. |
| 2026-05-15 (pendiente humano) | Validación en producción: requiere Jorge/QA crear orden de prueba y confirmar que las 3 notis (técnico + operaria + admins/coords) llegan. |

---

## Impacto

- **Usuarios afectados:** todos los técnicos, operarias, admins y coordinadoras del equipo. Cada orden nueva creada desde Crear Orden manual o Confirmar Cita pública no emitió noti.
- **Funcionalidad bloqueada:** notificación in-app cuando se asigna una orden. El equipo coordinaba por WhatsApp manual; el bug no rompió la operación pero sí degrada la promesa del CRM (cero coordinación manual).
- **Tiempo total fuera:** desde la fecha en que se agregó `'orden_asignada'` a `TipoNotificacion` (probable ~2026-05-12/13, durante redacción de SPRINT-157/158) hasta el fix 2026-05-15. Aprox **48-72h en producción** sin emisión de la noti.
- **Severidad de negocio:** media — la coordinación seguía sucediendo por canal paralelo (WhatsApp). Pero genera ruido y desconfianza del equipo hacia el CRM ("la campanita está rota").
- **Pérdida de datos:** ninguna. Las órdenes se crearon correctamente — solo faltó la noti adjunta. No es recuperable retroactivamente (las notis se emiten al momento del addDoc; las órdenes ya creadas sin noti quedan sin noti histórica).

---

## Causa raíz (5 porqués)

1. **¿Por qué la notificación `orden_asignada` no llegó a las campanitas?** — Porque nadie llamó a `crearNotificacion({ tipo: 'orden_asignada', ... })` desde el código.
2. **¿Por qué nadie llamó?** — Porque el handler `useOrdenCreateForm.ts` (post-`addDoc` de la orden) nunca tuvo ese call site. SPRINT-163 (que en teoría lo agregaría) nunca produjo commit.
3. **¿Por qué SPRINT-163 nunca produjo commit pero quedó marcado COMPLETADO?** — Porque el flujo de "marcar sprint como COMPLETADO" es administrativo (edición de `docs/sprints/COLA_AUTONOMA.md`) y no verifica que exista un commit asociado en git log con la referencia al sprint. Si una pasada se interrumpió o un agente se distrajo, la cola pudo quedar con el estado "COMPLETADO" sin el código real.
4. **¿Por qué el sistema no detectó la incongruencia entre "cola dice completado" y "código no implementa el tipo declarado"?** — Porque TypeScript no obliga a que TODOS los valores de un union type sean usados. La unión `TipoNotificacion` es write-only (se declara, no se enforce). Sin un cazador determinístico que cruce "tipos declarados" con "tipos emitidos", el drift es invisible al tooling. Y porque no había un cazador equivalente que cruzara "sprints marcados COMPLETADO en la cola" con "commits con referencia al sprint en git log".
5. **¿Por qué no había un cazador?** — Porque hasta ahora todos los patrones de regresión (P-001 a P-009) cazan **bugs de código existente**, no **ausencia de código que debería existir**. El sistema anti-regresión está sesgado a "detectar lo que está mal escrito"; tiene un hueco en "detectar lo que falta escribir". **Causa raíz:** el catálogo de patrones P-XXX tenía un blind spot estructural — no contemplaba la clase de bug "feature half-shipped" (tipo declarado, rule lista, service correcto, pero call site ausente).

---

## Lo que funcionó bien

- **QA E2E distribuido cazó el bug en 1 día.** El test del 2026-05-14 sobre OS-0056 expuso el bug en producción rápido — antes de que se acumulara sobre múltiples órdenes reales del día siguiente. El protocolo de "4 Claudes + 2 humanos validan flujo end-to-end" funcionó como red de seguridad cuando los cazadores determinísticos estaban ciegos a este vector.
- **Cowork escribió un SPRINT-169 con 4 hipótesis ordenadas + diagnóstico obligatorio.** Esto aceleró el diagnóstico — el coordinator no tuvo que reinventar la metodología, solo seguir el playbook que Cowork ya armó.
- **El grep de `tipo: 'orden_asignada'` en `src/` confirmó la hipótesis en <30 segundos.** Diagnóstico determinístico, sin necesidad de inspección a Firestore Console.
- **El patrón hermano `notificarSugerenciaSoloChequeo` en `ordenes.service.ts:331` proveyó template casi 1:1 para la lógica de admin/coord.** Reduce el riesgo de inventar shape incorrecto.
- **`crearNotificacion()` ya emite warn runtime si llega sin `userId` (SPRINT-127).** Si la causa raíz hubiera sido "se llamó con userId undefined", el warn habría aparecido — eso descartó hipótesis #4 sin costo.
- **CLAUDE.md sub-regla "hotfix sin postmortem no cierra".** Forzó este postmortem en lugar de simplemente commitear y seguir.

---

## Lo que falló

- **Marcado COMPLETADO sin commit asociado pasó desapercibido por ~24h hasta el QA.** No hay tooling que valide "cada sprint COMPLETADO en la cola tiene >=1 commit en git log con su id en el mensaje".
- **El catálogo P-XXX no contemplaba la clase "tipo declarado sin emisor".** Hueco estructural en el sistema anti-regresión.
- **No hay invariante que cruce `TipoNotificacion` ↔ call sites.** Lo análogo a P-009 (campo de tipo ↔ parser) faltaba para notificaciones.
- **Ninguna prueba E2E automatizada cubre "crear orden → noti llega".** Las pruebas existentes son manuales (QA distribuido), que es efectivo pero caro y lento.
- **El sprint SPRINT-163 en la cola no incluyó touch-list ni criterios de aceptación verificables.** Si los hubiera tenido (ej: "después del fix, grep tipo: 'orden_asignada' debe retornar ≥1 hit en src/"), habría sido más difícil marcarlo como completado sin commit. Esto se solucionó parcialmente con la sub-regla "Touch-list expandido + auditoría de consumidores" (CLAUDE.md, SPRINT-145), pero SPRINT-163 fue redactado antes de esa sub-regla.

---

## Acciones tomadas (fix inmediato)

- **Commit `5823955`** en `src/hooks/useOrdenCreateForm.ts`: emite `crearNotificacion({ tipo: 'orden_asignada' })` al técnico, operaria derivada y admins+coordinadoras activos, después del `addDoc` exitoso de la orden. Best-effort try/catch independiente por destinatario.
- **Cazador determinístico `scripts/invariantes/check-tipo-notificacion-huerfano.ts`** (P-010): valida que cada valor de `TipoNotificacion` tenga al menos un call site emisor en `src/` o `api/`. Allowlist documentada para 3 tipos (otro, recordatorio server-side, reclamo_garantia → deuda SPRINT-174).
- **Registro en `scripts/invariantes/run-all.ts`** del cazador P-010 para que corra en cada pre-commit.
- **Entrada P-010 en `docs/PATRONES_REGRESION.md`** con causa raíz completa, regla, allowlist y limitación conocida.

---

## Acciones preventivas (para que no vuelva)

- [x] **Cazador determinístico P-010:** `scripts/invariantes/check-tipo-notificacion-huerfano.ts` — implementado en commit `5823955`. Bloquea futuros sprints que agreguen valor a `TipoNotificacion` sin call site, salvo allowlist documentada.
- [ ] **Sub-regla en CLAUDE.md propuesta:** "Marcar un sprint como COMPLETADO en `COLA_AUTONOMA.md` requiere ≥1 commit en git log con la referencia al sprint en el mensaje. El protocolo de modo autónomo del coordinator ya lo hace implícitamente (paso g: `git commit + push`), pero las pasadas previas a la formalización del protocolo no lo enforce. Para sprints redactados o aprobados ANTES de que existiera el protocolo, validar manualmente con `git log --grep='SPRINT-XXX'` antes de marcar." — **propuesto para incluir en próxima edición de CLAUDE.md**.
- [ ] **Cazador potencial futuro P-011 (deferido):** validar "cada SPRINT-XXX en sección 'Sprints completados (histórico)' de `COLA_AUTONOMA.md` tiene ≥1 commit con esa referencia en git log". Difícil de mantener barato (lectura completa de git log + parsing de la cola). Postergar hasta que pase un segundo incidente del mismo vector (recurrencia justifica el costo). Por ahora la sub-regla en CLAUDE.md cubre el caso.
- [ ] **Update a agente `archivist` PRE-CHANGE:** cuando un sprint declara que "completa" un sprint previo (ej: "regresión de SPRINT-XXX"), el archivist debe ejecutar `git log --grep='SPRINT-XXX'` y reportar al coordinator si el commit del previo existe o no. Si no existe, el archivist marca alerta "sprint previo nunca commiteó — revisar antes de diagnosticar como regresión, probable causa: feature jamás se implementó".
- [x] **Allowlist documentada con sprint owner** para los 3 tipos huérfanos legítimos remanentes. Esto convierte "deuda invisible" en "deuda con dueño" — un futuro sprint que pague la deuda lo verá referenciado.

---

## Métricas

- **Tiempo desde introducción hasta detección:** ~48-72 horas (la introducción precisa del literal `'orden_asignada'` en `TipoNotificacion` no se puede datar exactamente, pero la marca COMPLETADO en cola es del 2026-05-13 y QA cazó el 2026-05-14).
- **MTTR (detección hasta fix):** ~24 horas (QA cazó el 2026-05-14, fix commiteado el 2026-05-15 en commit `5823955`).
- **Es recurrencia de clase ya catalogada:** **NO — clase nueva.** No hay P-XXX previo que cubra "tipo declarado sin emisor". El bug más cercano fue P-009 (campo del tipo ↔ parser) que es estructuralmente análogo (tipo declara algo que la implementación olvida), pero P-009 cubre solo `Factura ↔ parseFactura`. Generalizar P-009 a notificaciones requería este P-010.
- **Cazadores activos pre-incidente:** 8 (P-001 a P-009, sin P-008 en run-all por diseño server-side, sin P-010).
- **Cazadores activos post-incidente:** 9 (P-001 a P-007 + P-009 + P-010 en run-all; P-008 sigue como health-check manual).

---

## Lecciones aprendidas

**El sistema anti-regresión asume que el código existe.** Todos los cazadores P-001 a P-009 razonan sobre código presente y detectan **patrones incorrectos** en él. Ninguno preguntaba "¿este símbolo/tipo/declaración tiene un consumidor real?". El bug demostró que la **ausencia de código** puede ser tan dañina como el código incorrecto.

**Una declaración de tipo sin uso es un feature half-shipped.** En TypeScript es legal y barato declarar un union value sin usarlo — pero en un sistema de notificaciones, cada valor del union es una **promesa al usuario** (las campanitas mostrarán algo cuando esto pase). La promesa sin implementación es peor que no hacer la promesa.

**El protocolo "marcar sprint COMPLETADO en cola" debe verificar el commit.** Esto es trivial de hacer en el modo autónomo nuevo (paso g del flujo), pero para pasadas históricas previas al protocolo, hay que validar manualmente. **Sub-regla nueva propuesta para CLAUDE.md.**

**Email de 3 frases al equipo del futuro:** Cuando un sprint dice "agregar nuevo `tipo` a `TipoNotificacion`", grep el tipo en `src/` ANTES de marcar COMPLETADO. Si el grep retorna 0 hits, el sprint no terminó — solo se agregó la bandera, no la implementación. P-010 ahora bloquea este escenario en pre-commit, pero la disciplina humana sigue siendo el primer filtro.

---

## Referencias

- Sprint: `docs/sprints/COLA_AUTONOMA.md` SPRINT-169
- Sprint origen del bug: `docs/sprints/COLA_AUTONOMA.md` SPRINT-163 (sin commit asociado en git log)
- Log de ejecución: `docs/sprints/EJECUCION_AUTONOMA.md` (sección 2026-05-15 pasada SPRINT-169)
- Patrón: `docs/PATRONES_REGRESION.md` P-010
- Cazador: `scripts/invariantes/check-tipo-notificacion-huerfano.ts`
- Commit del fix: `5823955` (fix(notificaciones): SPRINT-169 regresión orden_asignada (post-SPRINT-163))
- Postmortem: este archivo
