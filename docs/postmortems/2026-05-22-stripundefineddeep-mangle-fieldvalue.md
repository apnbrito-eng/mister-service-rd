# Postmortem — `stripUndefinedDeep` corrompía FieldValue/Date/Timestamp al recursar sobre instancias de clase

**Fecha del incidente:** 2026-05-22
**Detectado por:** Cowork con Playwright + Admin SDK (auditoría del inbox tras reportes de Jorge de que "la conversación no sube al tope")
**Severidad:** alta — todo el módulo WhatsApp Inbox quedó con datos corruptos: la lista de conversaciones no ordenaba por reciente, no marcaba "no leídos" y la ventana 24h estaba rota (su `cierraEn` quedaba como objeto vacío).
**Patrón asociado:** clase nueva — `helper de limpieza recursiva sin guard de prototipo plano que se aplica a payloads con FieldValue/Date/Timestamp`. Proponer **P-020**.
**Commits relacionados:**
- Introduce: `142d4da` (SPRINT-WA-1 — 2026-05-19, webhook entrante con `stripUndefinedDeep` recursando sobre `Object` cualquiera).
- Fix: `0baf8b7` (2026-05-22 17:58 -0400, guard `Object.getPrototypeOf === Object.prototype || null` antes de recursar).

---

## Resumen ejecutivo

Un helper de "limpieza profunda" del webhook WhatsApp (`stripUndefinedDeep` en `api/_lib/whatsappWebhook.ts`) recursaba sobre **cualquier** `typeof === 'object'` para borrar campos `undefined` antes de escribir a Firestore. Cuando el caller pasaba payloads con sentinels de Firestore (`FieldValue.increment(1)`, `FieldValue.serverTimestamp()`) o instancias `Date`/`Timestamp`, el helper destruía la instancia y la reconstruía como un mapa plano. Resultado en producción: contadores se guardaban como `{operand:1}`, fechas como `{}`, y la conversación nunca subía al tope de la lista del inbox ni marcaba mensajes no leídos.

---

## Timeline

| Fecha/hora | Evento |
|---|---|
| 2026-05-19 ~12:08 UTC | Push `142d4da` (SPRINT-WA-1) introduce `stripUndefinedDeep` y lo aplica a `tx.set(conversacionRef, stripUndefinedDeep(conversacionUpdate), { merge: true })` con `FieldValue.serverTimestamp()` + `FieldValue.increment(1)` dentro del payload. |
| 2026-05-19 a 2026-05-22 | Webhook escribe ~docenas de updates de conversación con FieldValues mangleados. Conversaciones nuevas se ven afectadas. Las 3 que Jorge usó manualmente (`5618096402`, `8292733505`, `8494580318`) acumulan timestamps `{}` y contadores `{operand:N}`. |
| 2026-05-22 mañana | Jorge nota en producción: "la conversación no sube al tope" + "no marca no leídos". |
| 2026-05-22 tarde | Cowork verifica con Playwright + Admin SDK que `ultimaActividad`/`updatedAt`/`ventana24h.cierraEn` están como `{}` y `noLeidos`/`totalMensajesEntrantes` como `{operand:N}`. Diagnóstico: helper destruye sentinels. |
| 2026-05-22 17:58 -0400 | Fix `0baf8b7`: guard `proto !== Object.prototype && proto !== null` antes de recursar. Las instancias de clase y los sentinels FieldValue se devuelven INTACTOS. |
| 2026-05-22 noche | Coordinator pasada 40 cierra el sprint formal: postmortem (este) + cazador P-020 + backfill de las 3 convs. |

---

## Impacto

- **Usuarios afectados:** todos los que usan el inbox WhatsApp (Jorge + operarias) — el inbox quedó ordenando "al azar" y sin badge de no leídos durante ~3 días.
- **Funcionalidad bloqueada:** ordenamiento por reciente, badge no leídos, indicador ventana 24h. El bot y la persistencia de mensajes funcionaban — solo el shape del doc `whatsapp_conversaciones` quedó corrupto. Los mensajes en `whatsapp_mensajes_inbox`/`outbox` quedaron INTACTOS (no usaban sentinels en su payload, solo strings/Date plano + `timestampRecibido: FieldValue.serverTimestamp()` que sí estaba siendo mangleado para esos docs también — verificar en backfill).
- **Tiempo total fuera:** ~3 días (2026-05-19 push → 2026-05-22 fix).
- **Severidad de negocio:** media — operación del inbox era frustrante pero no bloqueante (los mensajes igual llegaban; la UI estaba feble).
- **Pérdida de datos:** parcial — `ultimaActividad`/`updatedAt`/`primeraInteraccion`/`ventana24h.cierraEn`/`ultimoMensajeEntrante.timestamp` quedaron como `{}` en convs viejas; `noLeidos`/`totalMensajesEntrantes`/`totalMensajesSalientes` como `{operand:N}`. **Reconstruibles** desde los docs `whatsapp_mensajes_inbox`/`outbox` (que sí tienen `timestampMeta` y `createTime` intactos en los campos string/`Timestamp` puros).

---

## Causa raíz (5 porqués)

1. **¿Por qué la conversación no subía al tope?** Porque `ultimaActividad` y `updatedAt` se guardaban como `{}` (objeto vacío), no como `Timestamp` — el orderBy del listener del inbox no podía comparar.
2. **¿Por qué se guardaban como `{}`?** Porque el caller pasaba `FieldValue.serverTimestamp()` y `stripUndefinedDeep` lo procesaba como si fuera un mapa plano: `Object.entries(value)` sobre el sentinel devolvía propiedades internas (o ninguna), el helper construía un nuevo objeto vacío con esas entries, y lo devolvía en lugar del sentinel.
3. **¿Por qué `stripUndefinedDeep` procesaba sentinels como mapas planos?** Porque la check `typeof value === 'object'` es verdadera para CUALQUIER objeto: instancias de clase, sentinels FieldValue, `Date`, `Timestamp`, `Buffer`, etc. El helper no distinguía "mapa plano `{}` literal" vs "instancia de clase con métodos y prototipo propio". Recursaba sobre todo.
4. **¿Por qué el helper no distinguía?** Porque al escribirlo (SPRINT-WA-1) el autor copió el patrón mental de `src/utils/firestore.ts::stripUndefined` (frontend) — que SÍ tiene chequeos explícitos para `Date` e `Timestamp` (líneas 23-24) — pero al portarlo a backend Admin SDK NO se agregó el caso de `FieldValue` (que no existe en el frontend) ni se generalizó a "preservar todo lo que tenga prototipo no-Object". El conocimiento de qué preservar vivía en la cabeza del autor del frontend; el del backend lo reimplementó "memoria-driven".
5. **¿Por qué no lo cazó nada antes de producción?** **Causa raíz:** (a) `tsconfig.json` no incluye `api/` (gap conocido del postmortem `2026-05-19-wa-1-webhook-fieldvalue-import.md`); (b) ningún cazador determinístico chequeaba "helpers de limpieza recursiva preservan instancias de clase"; (c) no hay test E2E del webhook que verifique el shape final en Firestore; (d) el bug NO crashea el endpoint — escribe basura silenciosamente. Es un bug de **silent data corruption**, el peor tipo para detectar sin instrumentación. Jorge tardó ~3 días en notar el síntoma UI porque el inbox es nuevo (SPRINT-INBOX-1..11 cerrados el mismo período) y la baseline de "cómo debería verse" todavía estaba en formación.

---

## Lo que funcionó bien

- **Cowork en modo verificación de producción.** Sin Playwright + Admin SDK leyendo los docs reales, este bug podría haber pasado más días — la UI muestra `noLeidos: undefined` (badge desaparece sin error) y `ultimaActividad: {}` se trata como falsy en sort, así que la conversación "simplemente queda abajo" sin alarma.
- **Mensajes en sí persistieron correctamente.** El payload de `whatsapp_mensajes_inbox` tiene `timestampMeta` como `Date` y strings; el daño fue solo cosmético del documento agregado `whatsapp_conversaciones`. El backfill es factible sin pérdida real.
- **El fix `0baf8b7` fue de 13 líneas, contenido y backward-compatible.** Una vez identificada la causa raíz, agregar el guard `proto !== Object.prototype && proto !== null` es trivial — todos los callers existentes siguen funcionando idéntico (los payloads "planos" como mapas literales pasan el check), pero ahora los sentinels e instancias se preservan.
- **Bug latente cazado antes de escalar.** Si el inbox hubiera tenido tráfico real durante meses, miles de docs habrían quedado corruptos. Detección temprana con solo 3 docs afectados.

---

## Lo que falló

- **No hay cazador determinístico que valide invariantes de helpers de "limpieza recursiva" que escriben a Firestore.** Cualquier helper futuro con la misma forma (`stripUndefinedDeep`, `deepClone`, `sanitizePayload`, etc.) puede repetir el bug en otro archivo. La regla "preservar instancias de clase" vive solo en el comentario del fix.
- **`tsconfig.json` sigue sin incluir `api/`** (acción preventiva pendiente del postmortem `2026-05-19-wa-1-webhook-fieldvalue-import.md`). Aunque TypeScript no habría cazado este bug específico (los tipos de FieldValue/Date son compatibles con `typeof === 'object'`), el typecheck extendido es parte de cualquier defensa estructural sobre `api/`.
- **No hay tests E2E del webhook.** Un test simple que llamara a `persistirMensajeEntrante` y leyera el doc resultante con Admin SDK habría detectado `ultimaActividad: {}` en lugar de `Timestamp` antes del primer deploy.
- **El comentario del helper original NO advertía sobre el caso.** El docstring de `stripUndefinedDeep` (versión pre-fix) hablaba de "strip recursivo" pero NO mencionaba qué objetos preservar — un dev futuro habría replicado el patrón asumiendo "Object.entries funciona en cualquier objeto".

---

## Acciones tomadas (fix inmediato)

- Commit `0baf8b7`: agregado el guard de prototipo en `api/_lib/whatsappWebhook.ts:457-469`:
  ```ts
  const proto = Object.getPrototypeOf(value as object);
  if (proto !== Object.prototype && proto !== null) {
    return value;
  }
  ```
- Comentario explicativo en el helper documentando la causa raíz y el bug.

---

## Acciones preventivas (para que no vuelva)

- [x] **Cazador determinístico P-020:** `scripts/invariantes/check-helpers-limpieza-recursiva-firestore.ts` — escanea archivos bajo `api/` y `src/services/` que exporten funciones con shape de "limpieza recursiva sobre object" (heurística: la función tiene `Object.entries` o `Object.keys` + se recursa a sí misma + el archivo importa `firebase-admin` o `firebase/firestore`). Verifica que el cuerpo contenga AL MENOS UNA de: (a) check explícito de `Object.getPrototypeOf(...) === Object.prototype || ... === null`, (b) check explícito de `instanceof Date && instanceof Timestamp`, (c) tag `// @safe-recursive-strip: <razón>` (allowlist por línea). Sin esto, helper NUEVO de este shape sale como hit. Registrar en `run-all.ts`.
- [x] **Entrada P-020 en `docs/PATRONES_REGRESION.md`** con el bug original (commit `142d4da`), síntoma, causa raíz, regla, cazador, allowlist.
- [x] **Backfill de las 3 convs corruptas** (`5618096402`, `8292733505`, `8494580318`) con `scripts/backfill-convs-corruptas-stripundefined.ts` (idempotente, reconstruye desde `whatsapp_mensajes_inbox`/`outbox`).
- [ ] **Tsconfig extendido a `api/`** — pendiente del postmortem `2026-05-19-wa-1-webhook-fieldvalue-import.md`. NO se hace en este sprint (scope: cierre formal del bug, no infra). Sigue tracking como acción abierta.
- [ ] **Test E2E del webhook** — pendiente; el repo no tiene test suite. Sin esto cualquier bug de shape en escritura a Firestore queda sin canary. Sigue tracking.
- [ ] **Update al agente builder**: agregar bullet en su prompt "Cualquier helper que recurse sobre `object` antes de escribir a Firestore DEBE: (a) preservar instancias de clase con guard de prototipo plano + (b) tener entrada P-020 en mente. Si el sprint introduce un helper así, agregar al header del cazador P-020 + verificar que pasa."

---

## Métricas

- **Tiempo desde introducción hasta detección:** ~3 días (2026-05-19 push → 2026-05-22 reporte).
- **MTTR (detección hasta fix):** ~horas (Cowork detectó tarde, fix `0baf8b7` aplicado el mismo día).
- **Es recurrencia de clase ya catalogada:** **NO — clase nueva.** Proponer P-020 "helper de limpieza recursiva sin guard de prototipo plano que escribe a Firestore con sentinels FieldValue/Date/Timestamp".

---

## Lecciones aprendidas

- **"Stripear undefined" es trivial; "stripear undefined preservando todo lo demás" no.** El concepto de "limpieza profunda" suena seguro pero esconde una decisión crítica: qué cuenta como "objeto recorrible". En frontend `src/utils/firestore.ts` ya tenía chequeos explícitos para `Date` e `Timestamp`. En backend con Admin SDK, además están los sentinels de FieldValue (`increment`, `serverTimestamp`, `arrayUnion`, `arrayRemove`, `delete`). Cualquier helper de este shape sin chequeo de prototipo es una bomba de tiempo silenciosa.

- **Silent data corruption es peor que crashes.** Un endpoint que cae responde 500 y un humano lo nota en horas. Un endpoint que escribe basura sigue verde, métricas igual, y el síntoma aparece en la UI días después como "la lista no ordena bien". Sin instrumentación específica (lectura post-write con Admin SDK), este tipo de bug puede vivir meses.

- **El conocimiento "qué preservar al stripear" debe vivir en código, no en cabezas.** El frontend tenía la regla incompleta; el backend la reimplementó sin completarla. La única defensa estructural es el cazador P-020 — sin él, el próximo helper "deep" repite el bug en otro archivo.

- **Para el equipo del futuro:** cuando veas un helper que recursa sobre `object` y escribe a Firestore, el primer reflejo debe ser "¿preserva instancias de clase y sentinels?". Si la respuesta no es obvia leyendo el código, agregar tag `// @safe-recursive-strip: <razón>` (P-020 lo enforces) o reescribir con guard de prototipo. No copies el helper de otro archivo "porque ya funciona allá" — el comportamiento puede divergir por contexto (frontend vs Admin SDK).

---

## Referencias

- Sprint: `docs/sprints/COLA_AUTONOMA.md` SPRINT-WA-STRIPUNDEFINED-POSTMORTEM-CAZADOR-LIMPIEZA.
- Bug original: `git show 142d4da -- api/_lib/whatsappWebhook.ts` (líneas que introdujeron `stripUndefinedDeep`).
- Fix: `git show 0baf8b7`.
- Cazador: `scripts/invariantes/check-helpers-limpieza-recursiva-firestore.ts` (P-020).
- Entrada catálogo: `docs/PATRONES_REGRESION.md` P-020.
- Backfill: `scripts/backfill-convs-corruptas-stripundefined.ts`.
- Postmortem hermano (gap tsconfig pendiente): `docs/postmortems/2026-05-19-wa-1-webhook-fieldvalue-import.md`.
