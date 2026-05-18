# Postmortem — Firma del cliente invisible 14 días en producción (parser P-009 recurrencia)

**Fecha del incidente:** 2026-05-02 a 2026-05-16 (14 días en producción)
**Detectado por:** QA E2E sidepanel sobre OS-0058 / CG-00020 (Cowork — ROL 6 qa-admin validación)
**Severidad:** alta (acreditación legal de firma del cliente perdida en producción; conduce de garantía emitido sin evidencia visible de firma)
**Patrón asociado:** P-009 (recurrencia — el cazador existía pero NO cubría `CierreServicio ↔ parseOrden`)
**Commits relacionados:**
- Introduce: `fd5e685` (SPRINT-159 — 2026-05-02) — persistió la firma sin actualizar el parser
- Render UI agregado: `f69fe6e` (SPRINT-168 — 2026-05-14) — agregó los 3 puntos de render que esperaban el campo
- Fix: `<pendiente — este sprint>` (SPRINT-177-HOTFIX — 2026-05-18)

---

## Resumen ejecutivo

Durante 14 días, todas las firmas del cliente capturadas en el wizard de cierre del técnico
quedaron en Firestore + Storage pero la UI mostraba "Sin firma" en los 3 puntos de render
(modal admin de orden, página standalone de orden, fila expandida de factura). La firma SÍ
se persistía correctamente, pero la función `parseOrden` que rehidrata el doc Firestore
omitía los campos `firmaClienteUrl` y `firmaClienteAt` al reconstruir `cierreServicio` →
los componentes recibían `undefined` y caían al placeholder "Sin firma".

---

## Timeline

| Hora | Evento |
|---|---|
| 2026-05-02 | SPRINT-159 (`fd5e685`) — wizard captura firma + persiste `firmaClienteUrl` + `firmaClienteAt` en `cierreServicio`. No se tocó `parseOrden`. |
| 2026-05-02 a 2026-05-14 | Múltiples órdenes cerradas con firma. Firma guardada en Storage + Firestore correctamente. UI muestra "Sin firma" pero el bug pasa desapercibido (nadie testea el cierre admin/coord del lado de la oficina). |
| 2026-05-14 | SPRINT-168 (`f69fe6e`) — agrega render de firma en modal admin (thumbnail + link). Funciona en código pero recibe `undefined` del parser. |
| 2026-05-16 | QA E2E distribuido sobre OS-0058 → CG-00020. ROL 4 (qa-tecnica) captura firma con log `Firma subida OK: https://...firma-1778944325233.png`. ROL 6 (qa-admin validación) abre la orden en `/admin/ordenes` y `/admin/facturas` — ambos muestran "Sin firma del cliente (orden previa al SPRINT-159)". |
| 2026-05-16 ~14:30 | Cowork verifica código: `parseOrden` en `src/utils/index.ts:739-795` reconstruye `cierreServicio` enumerando 17 campos. Los 2 campos de firma NO están en la lista. Bug confirmado. |
| 2026-05-16 ~15:00 | SPRINT-177-HOTFIX redactado a la cola. Coordinator autónomo procesa. |
| 2026-05-16 ~15:30 | Fix aplicado (2 líneas en parseOrden), cazador P-009 extendido a CierreServicio (verificación inversa con `git stash` confirma que SÍ caza ambos campos pre-fix). |

---

## Impacto

- **Usuarios afectados:** todos los técnicos que cerraron órdenes con firma del cliente
  desde el 2026-05-02. Estimar con script post-deploy contando órdenes con
  `cierreServicio.firmaClienteUrl != null` y `fechaCierre` en rango [2026-05-02, 2026-05-16].
- **Funcionalidad bloqueada:** la firma del cliente NO era visible en ningún punto del
  admin/coord/operaria. El conduce de garantía emitido durante esos 14 días no tiene
  defensa documentada visual desde la UI (aunque el dato existe en Firestore + Storage).
- **Tiempo total fuera:** 14 días (2026-05-02 → 2026-05-16).
- **Severidad de negocio:** alta — la firma es prueba legal de aceptación del trabajo por
  parte del cliente. Si hubo reclamo durante esos 14 días, la oficina tuvo que ir a
  Firestore Console manualmente para encontrar la URL.
- **Pérdida de datos:** NO — todos los datos están en Firestore + Storage intactos. El fix
  es 100% de lectura; las órdenes existentes recuperan la firma automáticamente post-deploy
  con hard refresh.

---

## Causa raíz (5 porqués)

1. **¿Por qué la UI mostraba "Sin firma" si el técnico la capturó?** — Porque el componente
   recibía `cierreServicio.firmaClienteUrl === undefined` del parser y caía al placeholder.

2. **¿Por qué el parser retornaba undefined si el doc Firestore tiene el campo?** — Porque
   la IIFE `cierreServicio` dentro de `parseOrden` (src/utils/index.ts:739-795) lista
   explícitamente los 17 campos a reconstruir y omitió los 2 nuevos campos de firma.

3. **¿Por qué SPRINT-159 olvidó actualizar el parser cuando agregó la persistencia?** —
   Porque `parseOrden` es una función larga (200+ líneas) con muchas IIFEs anidadas para
   sub-objetos, y la conexión "agrego campo al wizard → tengo que reflejarlo en el parser"
   NO está enforced por el sistema de tipos (TypeScript permite que el return type sea un
   subset del shape declarado, y la cast `as CierreServicio` lo silencia).

4. **¿Por qué el cazador P-009 no detectó este caso?** — Porque P-009 (creado en
   SPRINT-153-FIX el 2026-05-13) fue diseñado para cubrir solo `Factura ↔ parseFactura`,
   con la limitación documentada en el header del archivo: "Extender a OrdenServicio,
   ServicioPrecio, PiezaInventario queda como follow-up". La causa raíz de P-009 ya
   incluía `parseOrden` en su análisis pero el alcance del cazador se acotó al primer caso.

5. **¿Por qué el cazador se acotó al primer caso si el patrón era general?** — **Causa raíz:**
   sesgo de "fix mínimo del bug actual" sin invertir en cobertura preventiva del patrón
   completo. El builder de SPRINT-153-FIX cazó el bug exacto en `parseFactura` y dejó
   `parseOrden` como follow-up explícito, pero ningún sprint posterior priorizó cerrar esa
   deuda. Esto refleja un patrón estructural: los cazadores tienden a quedar atrapados en
   el bug original que los originó, y la extensión a casos análogos requiere disciplina
   activa, no aparece sola.

---

## Lo que funcionó bien

- El postmortem de SPRINT-153-FIX dejó la limitación documentada en el header del cazador
  con texto exacto "Extender a OrdenServicio queda como follow-up si el bug vuelve a
  ocurrir". El bug volvió → señal clara para extender, no debatir si vale la pena.
- El QA E2E distribuido cazó el bug en una sola sesión multi-rol. Sin ese setup, el bug
  hubiera quedado latente más tiempo (los técnicos ven la firma capturada en pantalla y
  asumen que está OK; solo el admin lo nota al revisar órdenes cerradas).
- El fix fue trivial (2 líneas en parseOrden), porque (a) el bug estaba 100% localizado al
  parser, (b) los componentes UI eran correctos, (c) el wizard de escritura era correcto.
  El cazador extendido confirmó la simetría tipo ↔ parser.

---

## Lo que falló

- **El cazador P-009 quedó sub-dimensionado desde su creación.** El header decía
  "limitación conocida: solo cubre Factura" pero ningún sprint posterior cerró la deuda.
  El patrón se observó: cuando un cazador caza el bug del día y el siguiente sprint ya
  pide otra cosa, la deuda se acumula.
- **No hubo test de integración leyendo la orden parseada después del cierre.** SPRINT-159
  testeó el flujo de escritura (técnico cierra → Storage upload OK → Firestore write OK) pero
  no leyó la orden de vuelta via `parseOrden` para verificar que la firma sobrevivió el
  parsing. Un test trivial `parseOrden(rawOrdenConFirma).cierreServicio.firmaClienteUrl
  !== undefined` lo hubiera cazado.
- **SPRINT-168 (render UI) agregó los 3 consumidores sin verificar que el parser los
  alimentaba.** La feature se entregó "completa" en código, pero el data flow estaba
  cortado en el medio.

---

## Acciones tomadas (fix inmediato)

- Agregadas 2 líneas a `parseOrden` en `src/utils/index.ts` después de `revisoConexiones`:
  ```ts
  firmaClienteUrl: (cs.firmaClienteUrl as string) || undefined,
  firmaClienteAt: parseFirestoreDate(cs.firmaClienteAt) || undefined,
  ```
- Extendido el cazador `scripts/invariantes/check-parser-campos-faltantes.ts` a una segunda
  cobertura `CierreServicio ↔ parseOrden.cierreServicio` con función nueva
  `extractIifeReturnKeys()` que parsea el sub-objeto dentro de `parseOrden` siguiendo el
  mismo algoritmo que el principal.
- Verificación inversa con `git stash` confirmó que el cazador grita correctamente sobre
  ambos campos pre-fix con explicación detallada.

---

## Acciones preventivas (para que no vuelva)

- [x] **Cazador determinístico:** `scripts/invariantes/check-parser-campos-faltantes.ts`
  (P-009) extendido a `CierreServicio ↔ parseOrden.cierreServicio`. Sale del scope
  Factura-only y ahora compara también el sub-objeto. Robusto a refactors del parser
  (busca la IIFE `cierreServicio: <expr> ? (() => { ... })()` y extrae el último
  `return {...}`).
- [ ] **Follow-up — extender P-009 a otros sub-objetos parseados de OrdenServicio:**
  `inicioChequeo`, `trackingGPS`, `cierreChequeoHistorico` también son IIFEs análogas
  que podrían tener el mismo bug. Documentado como deuda en el header del cazador y
  en la nota final.
- [ ] **Sub-regla CLAUDE.md (futura, no este sprint):** cualquier sprint que agregue un
  campo a un tipo parseado debe verificar manualmente que el parser correspondiente lo
  reconstruye. Si el campo es opcional, agregar línea al parser con `parseFirestoreDate`
  para timestamps o cast directo para strings/booleans. El cazador P-009 ahora enforce
  esto para Factura + CierreServicio.

---

## Métricas

- **Tiempo desde introducción hasta detección:** 14 días (2026-05-02 → 2026-05-16).
- **MTTR (detección hasta fix):** ~1.5 horas (detección 14:00 → fix deployado ~15:30).
- **Es recurrencia de clase ya catalogada:** sí — P-009.
  - **Fallo del cazador P-009:** el cazador existía desde SPRINT-153-FIX (2026-05-13) pero
    su scope era solo `Factura ↔ parseFactura`. La limitación estaba documentada en el
    header pero no se cerró antes de que el bug recurriera en otro tipo (`CierreServicio`).
  - **Refinamiento aplicado:** ampliar el cazador a `CierreServicio ↔ parseOrden.cierreServicio`
    con función nueva `extractIifeReturnKeys`. Cobertura ahora 2/N de los parsers; deuda
    documentada para los restantes.

---

## Lecciones aprendidas

- **Cuando un cazador documenta "extender a X queda como follow-up", la deuda debe cerrarse
  ANTES del próximo bug del mismo patrón.** El header de P-009 lo decía explícitamente
  desde 2026-05-13. Pasaron 3 días, otro sprint (SPRINT-159) introdujo un bug que caía
  exactamente en el alcance "no cubierto", y nadie lo detectó hasta que la firma del cliente
  estuvo invisible 14 días en producción. El follow-up explícito en un header no es
  documentación — es deuda. Tratarla como sprint priorizado.

- **La cast `as CierreServicio` en el retorno del parser hace al sistema de tipos un cómplice
  silencioso.** TypeScript no enforce simetría tipo ↔ parser cuando hay cast explícito.
  Para tipos parseados es mejor evitar el cast y dejar que TS infiera, pero el patrón actual
  del codebase lo hace difícil sin refactor. El cazador determinístico es el equivalente
  funcional al type check ausente.

- **Email al equipo del futuro (3 frases):** cuando agregás un campo a un tipo persistido en
  Firestore, hacé tres cosas — agregalo al tipo, agregalo al wizard que lo escribe, y agregalo
  al parser que lo lee. Si saltás una, el cazador P-009 te grita en el pre-commit. Si el
  campo está en un sub-objeto parseado (ej: `cierreServicio`, `inicioChequeo`), recordá que
  cada IIFE es un parser propio.

---

## Referencias

- Sprint: `docs/sprints/COLA_AUTONOMA.md` SPRINT-177-HOTFIX
- Log de ejecución: `docs/sprints/EJECUCION_AUTONOMA.md` (entrada 2026-05-16)
- Patrón: `docs/PATRONES_REGRESION.md` P-009
- Cazador: `scripts/invariantes/check-parser-campos-faltantes.ts`
- Postmortem hermano (mismo patrón, primer instancia): `docs/postmortems/...` (SPRINT-153-FIX
  no generó postmortem propio; el aprendizaje quedó en el header del cazador. Esta deuda
  retroactiva es por sí misma una de las observaciones).
