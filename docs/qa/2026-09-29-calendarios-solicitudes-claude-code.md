# QA — Calendarios (Citas) + Solicitudes dinámicas (Claude Code terminal)

**Fecha:** 2026-09-29 (iteración 3 — atomicidad orden+vínculo cita + resolver univocity técnico)
**Builder:** Claude Code terminal (paralelo con Codex + Cowork).
**Autorización:** Jorge autorizó reparto explícito por ownership de archivos.
**Rama activa:** `integraciones-marketing-conocimiento-20260915` (compartida — no cambios de branch, no commits ni push desde este builder). Otros agentes tienen cambios pendientes en el working tree; ESTE reporte cubre únicamente los archivos que este builder posee.

## Actualización iter 3 (esta pasada)

Root observó dos defectos que iter 2 no cubría:

1. **`useOrdenCreateForm.handleSubmit` no era atómico entre `addDoc(ordenes_servicio)` (línea vieja 996) y `updateDoc(citas_por_confirmar, { ordenIdCreada })` (línea vieja 1009).** Si el segundo write fallaba (permission-denied, red, tx abort), un reintento del coord creaba una orden duplicada porque la cita seguía sin marca. Un toast de aviso no lo resolvía — la única forma segura es que ambos writes vivan o mueran juntos.
2. **Resolver legacy `personal.find(uid)||find(id)`** aceptaba coincidencias ambiguas: dos id-spaces distintos (Firestore doc-id vs auth uid) que en teoría no colisionan pero sin invariante que lo garantice. Riesgo bajo de adivinar persona; se removió el OR.

### Cambios reales

| Archivo | Cambio iter 3 |
|---|---|
| `src/utils/vinculoOrdenCita.ts` (nuevo) | Extrae `escribirOrdenConVinculoCita(db, { ordenData, citaId, usuarioId })` que hace `runTransaction` con `tx.get(citaRef) → tx.set(ordenRef, ordenData) → tx.update(citaRef, { ordenIdCreada, procesando, procesandoPor, procesandoEn })` en un solo commit. Errores estructurados `ERR_CITA_DESAPARECIO` y `ERR_CITA_YA_VINCULADA_PREFIX + <id>` para que el hook decida toast/unlock. `validarOrdenReusable(db, ordenId)` retorna `{ existe, numero }` para chequear vínculos previos antes de reusar. Firestore auto-id — no derivado del payload → no mezcla clientes. `tx.get` solo sobre doc refs (nunca `tx.get(query)` que el SDK web no soporta). |
| `src/hooks/useOrdenCreateForm.ts` | Reemplaza el `addDoc` + `updateDoc` por `escribirOrdenConVinculoCita` (solo cuando `citaPreset`); flujo manual sigue con `addDoc`. Reintento idempotente ahora valida via `validarOrdenReusable` antes de reusar — si el vínculo apunta a doc inexistente, aborta con toast y unlock (antes reportaba "éxito" con `numeroReusable=''` silencioso). Callbacks (garantía + notificaciones + `marcarOrdenReactivada`) NO se ejecutan si el commit atómico falla → no se puede reportar falso éxito. Resolver técnico (dos sitios: effect de preset línea ~251, effect race personal línea ~356) pasa de `find(uid)||find(id)` a `find(p => !!p.uid && p.uid === asignadoId)` unívoco, seguido del filtro `activo && rol==='tecnico' && uid`. Si no hay match, cae al `asignadoNombre` como hint visual (`tecnicoId` queda vacío, oficina elige). |
| `tests/integraciones/vinculo-orden-cita-atomico.test.ts` (nuevo) | 10 casos con mock por `__path` que replica la semántica "pending → flush solo en commit exitoso" de Firestore: atomicidad, `tx.set` fail sin persistir, `tx.update` fail sin persistir, race concurrente (`CITA_YA_VINCULADA_PREFIX`), cita desaparecida, citaId inválido, auto-id independiente del payload, `validarOrdenReusable` con doc existente/inexistente/sin `numero`. |
| `docs/qa/2026-09-29-calendarios-solicitudes-claude-code.md` | Este documento actualizado. |

### Tests iter 3

```
$ npx vitest run tests/integraciones/vinculo-orden-cita-atomico.test.ts --config vitest.integraciones.config.ts
Test Files  1 passed (1)
Tests       10 passed (10)   # 6ms
```

```
$ npm run test:integraciones          # suite completa post-iter3
Test Files  134 passed (134)          # +8 vs iter 2 (fue 126)
Tests       725 passed (725)          # +42 vs iter 2 (fue 683)
```

```
$ npx tsc --noEmit                    # sin errores en mis archivos
$ npx tsc -p tsconfig.api.json --noEmit  # sin errores
```

### Regresión completa (herramienta exacta)

**Comando:** `npm run check:regression` → `tsx scripts/invariantes/run-all.ts`.

**Total de patrones ejecutados por la herramienta:** **39 cazadores automatizados** (P-001..P-007 + P-009..P-027 + P-033..P-039, con P-008 excluido a propósito por corridas en datos live via Admin SDK — se corre bajo demanda con `npm run audit:notis-legacy` según header de `run-all.ts:19-25`). Catálogo total en `docs/PATRONES_REGRESION.md`: **40 patrones** (39 automatizados + P-008 manual).

**Resultado iter 3:** 36 pass, 3 fail — TODOS pre-existentes fuera de mi scope:

- `P-005 firestore.rules pending deploy` — otros builders modificaron `firestore.rules`; requiere `npm run deploy:rules` bajo autorización de Jorge.
- `P-013 storage.rules pending deploy` — mismo espejo con `storage.rules`.
- `P-023 ProcesarFacturacionModal.tsx missing verificado===false filter` — regresión en archivo de otro builder, out of scope de este bloque.

No introduje regresiones nuevas.

## Contexto

`api/_lib/citaPublica.ts` persiste desde hace tiempo `asignadoId`, `asignadoNombre`, `equipoId`, `responsableAtencionId` y `repartoPendiente` cuando la cita viene de un calendario público con reparto WhatsApp. `src/pages/Citas.tsx` los estaba descartando en el parser: el modal "Confirmar y Agendar" perdía el técnico captador del cliente y toda la trazabilidad del canal. `useOrdenCreateForm.ts` los leía por cast (`asignadoId`), pero al crear la orden nunca los persistía en `metadatosCita`; el campo `creadoPor` guarda un nombre humano sin uid verificable.

`src/pages/Solicitudes.tsx::handleConvertir` mapeaba `datos.nombre` / `datos.telefono` / `datos.direccion` / `datos.tipo_equipo || datos.equipo` / `datos.falla || datos.descripcion` a la orden con claves fijas. En la práctica el `campo.id` de un formulario dinámico es auto-generado por el editor, así que la mayoría de solicitudes personalizadas creaban órdenes con datos vacíos y sin `clienteId`, sin coordenadas y sin origen.

## Archivos modificados o creados

| Archivo | Cambio |
|---|---|
| `src/types/index.ts` | Añade opcionales `CitaPorConfirmar.asignadoId/asignadoNombre/equipoId/responsableAtencionId/repartoPendiente`, `OrdenServicio.creadoPorId`, y extiende `OrdenServicio.metadatosCita` con `origen/calendarioId/calendarioNombre/asignadoCaptadorId/asignadoCaptadorNombre/equipoId/responsableAtencionId/solicitudId/formularioId/formularioNombre/empresaId/empresaNombre`. Todo opcional, retrocompat con órdenes/citas viejas. |
| `src/pages/Citas.tsx` | Reemplaza el parser inline por `parseCitaPorConfirmar` (extracto testeable) y elimina el mapeo campo por campo que perdía los datos del calendario. |
| `src/hooks/useOrdenCreateForm.ts` | Quita los `as typeof citaPreset & {...}` para `asignadoId`. Sustituye el `metadatosCita` inline por `construirMetadatosCita(cita)` (persiste calendario/captador/equipo/responsable + origen). Añade `creadoPorId: auth.uid` cuando existe. |
| `src/pages/Solicitudes.tsx` | Rewrite del flujo "Convertir en Orden": carga el schema real del formulario, auto-mapea con `inferirMappingSolicitud`, muestra modal con inputs editables + confianza por campo, busca cliente por teléfono normalizado, permite decidir "usar existente / crear nuevo", preserva GPS, marca `origen: 'solicitud_formulario'` con trazabilidad. **Iteración 2**: consume `listarClientesActivosPorTelefono` (nuevo export) para detectar ambigüedad; si hay >1 candidato activo con el mismo telNorm exige selección explícita (radio por candidato + opción "crear nuevo") — nunca adivina; ya NO precomputa `clienteId` — pasa `ClienteConversion` tipado a `convertirAOrden`. |
| `src/services/solicitudes.service.ts::convertirAOrden` | Chequea `estado==='convertida'` y `estado==='rechazada'` antes de reservar contador. Idempotencia dentro del `runTransaction`. Strip de undefined defensivo. **Iteración 2**: acepta `ClienteConversion` opcional y resuelve el cliente DENTRO de la misma tx — `tipo:'existente'` verifica que el doc siga vivo antes de crear la orden (falla atómicamente si desapareció), `tipo:'crear'` hace `tx.get(clientes/{telNorm})` + `tx.set` si no existe o `tx.update` con merge PRESERVANDO campos ya poblados (nombre/email/direccion) si otro operador ya lo creó (race). Unifica mensaje de error a "no puede convertirse" tanto en el chequeo pre-tx como dentro de la tx. Strip PROFUNDO de `undefined` con guard de prototipo (P-020) para preservar `Timestamp`/`FieldValue`. |
| `src/services/solicitudes.service.ts::listarClientesActivosPorTelefono` (nuevo export) | Lista TODOS los candidatos activos por `telefonoNormalizado`. La UI de conversión lo usa para detectar ambigüedad (>1 doc con mismo telNorm — legacy pre-dedup) y forzar selección explícita. `buscarClientePorTelefono` (compartido con otros callers) sigue devolviendo el primero. |
| `src/services/solicitudes.service.ts::ClienteConversion` (nuevo tipo exportado) | Discriminated union `existente` / `crear` que documenta el contrato de resolución de cliente para la conversión. |
| `src/utils/parseCitaPorConfirmar.ts` (nuevo) | Parser puro de `citas_por_confirmar` (extraído para testear). |
| `src/utils/metadatosCita.ts` (nuevo) | `construirMetadatosCita(cita)` puro — hace explícita la regla "el captador NO es el técnico final". |
| `src/utils/solicitudMapping.ts` (nuevo) | `inferirMappingSolicitud(campos, datos)` con confianza `alta/media/baja/ninguna`, `extraerCoordenadasSolicitud(sol, campos)` con validación de rango, `normalizarEtiqueta` sin acentos. |
| `tests/unit/parseCitaPorConfirmar.test.ts` (nuevo) | 6 casos — schema completo del calendario, docs legacy, tipos hostiles, garantía. |
| `tests/unit/metadatosCita.test.ts` (nuevo) | 9 casos — origen, captador ≠ técnico final, sin invención. |
| `tests/unit/solicitudMapping.test.ts` (nuevo) | 11 casos — heurísticas por tipo/etiqueta/fallback, coordenadas inválidas. |

## Pruebas ejecutadas (iteración 2)

```
$ npx vitest run tests/integraciones/solicitud-conversion.test.ts --config vitest.integraciones.config.ts
Test Files  1 passed (1)
Tests       14 passed (14)   # +10 nuevos vs iteración 1 (que tenía 4)
```

```
$ node --import tsx --test tests/unit/metadatosCita.test.ts tests/unit/parseCitaPorConfirmar.test.ts tests/unit/solicitudMapping.test.ts
tests 26   pass 26   fail 0
```

```
$ npm run test:integraciones            # suite completa
Test Files  126 passed (126)
Tests       683 passed (683)
```

```
$ npx tsc --noEmit                      # sin errores
$ npx tsc -p tsconfig.api.json --noEmit # sin errores
$ npx eslint src/pages/Solicitudes.tsx src/services/solicitudes.service.ts
# sin issues
```

```
$ npm run check:regression
# 2 hits preexistentes fuera de mi scope:
#   P-005 firestore.rules pending deploy (otros builders)
#   P-013 storage.rules pending deploy (otros builders)
# Iteración 2 activó fugazmente P-020 (helper recursivo sin guard de prototipo)
# al agregar `stripUndefinedProfundo`; se corrigió inmediatamente añadiendo
# `Object.getPrototypeOf(valor) !== Object.prototype && !== null → return valor`
# (mismo patrón que `stripUndefinedDeep` en `api/_lib/whatsappWebhook.ts:450`).
# Post-fix: P-020 pasa sin hits. Todos los demás cazadores (P-001..P-025) pasan sin hits.
```

## Casos nuevos cubiertos por `tests/integraciones/solicitud-conversion.test.ts`

Los 4 tests originales siguen pasando (idempotencia pre-tx, race dentro de tx, mensaje unificado, escritura orden+solicitud atómica). Los 10 tests nuevos cubren:

- `cliente existente: vincula sin sobrescribirlo` — la orden termina con `clienteId=8095551234` y el doc `clientes/8095551234` conserva `nombre: 'Juan Original'` aunque el payload de la solicitud traiga otro nombre.
- `cliente existente: falla y no crea orden si el cliente desapareció entre búsqueda y conversión` — throw `cliente vinculado ya no existe`, la solicitud sigue en `pendiente`, sin escrituras a `ordenes_servicio/*`.
- `cliente existente: rechaza clienteId vacío antes de reservar contador` — throw `clienteId requerido`, sin writes.
- `crear cliente: nuevo doc atómico cuando no hay match` — 3 writes en el orden `clientes/{telNorm}` (set) → `ordenes_servicio/{new-orden}` (set) → `solicitudes_servicio/s1` (update).
- `crear cliente: race con otro operador — merge preservando campos poblados` — cuando `clientes/{telNorm}` ya existe con `nombre/email/direccion`, la tx hace `update` solo con los campos que estaban vacíos (`referenciaDireccion`, `lat`, `lng`, `updatedAt`) — NO sobrescribe `nombre`/`email`/`direccion`.
- `crear cliente: rechaza teléfono normalizado inválido` — throw sin reservar contador.
- `crear cliente: rechaza nombre vacío` — throw sin reservar contador.
- `crear cliente: convertir dos veces con el mismo telNorm no duplica cliente ni orden` — el segundo intento retorna el mismo `ordenId` sin escrituras nuevas (idempotencia). Solo hay `1` write a `clientes/*` y `1` write `set` a `ordenes_servicio/*`.
- `undefined anidados en metadatosCita` — verifica que `stripUndefinedProfundo` elimina `undefined` en profundidad ≥2 (ej. `metadatosCita.asignadoCaptadorId=undefined` y `metadatosCita.camposPersonalizados.ausente=undefined`), preservando los valores adyacentes.
- `estado=convertida sin ordenId (inconsistente)` — el chequeo pre-tx bloquea con el mismo mensaje `no puede convertirse`.

## Escenarios cubiertos por los tests

- **Cita del calendario conserva técnico + origen atravesando parser y creación:** `parseCitaPorConfirmar` lee `asignadoId/asignadoNombre/equipoId/responsableAtencionId` desde el shape del endpoint público. `construirMetadatosCita` marca `origen: calendario_publico` y persiste el captador en `asignadoCaptadorId/Nombre` — separado del `tecnicoId` final del modal.
- **Cambio humano de técnico no pierde origen:** El helper `construirMetadatosCita` no lee `tecnicoId`, así que un cambio en el modal Crear Orden no borra el captador — queda como referencia inmutable de atribución.
- **Solicitud con campos personalizados conserva datos y vincula cliente existente:** `inferirMappingSolicitud` prueba con ids auto-generados por el editor (`field-6f2a1`, `field-9b4c`, etc.) y por tipo (`telefono`, `email`, `direccion`) — antes fallaba porque el código hardcodeaba `datos.nombre`. La modal integrada llama a `buscarClientePorTelefono` con el teléfono normalizado y ofrece "usar existente / crear nuevo" explícito.
- **Conversión dos veces no duplica orden/cliente:** `convertirAOrden` verifica `data.ordenId` DENTRO del `runTransaction` (chequeo optimistic-lock). Un segundo click retorna el mismo id sin abrir otro doc de orden. Si el admin decide "usar existente", el `clienteId` reusa el doc canónico — no se crea uno nuevo.
- **GPS válido se preserva:** `extraerCoordenadasSolicitud` prioriza `solicitud.ubicacion` top-level y cae al campo `tipo=ubicacion` con id dinámico. Valida rango `|lat|≤90, |lng|≤180` y rechaza `NaN`.
- **Inválidos muestran error:** `handleConfirmarConversion` valida nombre + teléfono (10 dígitos RD) + `equipoTipo` + `descripcionFalla` antes de llamar al servicio. Sin campos requeridos → `toast.error` explícito, no se crea orden.

## Limitaciones — reportadas explícitamente

1. **No corrí tests con Firebase emulator ni producción.** Los tests son unitarios sobre helpers puros + integraciones con `firebase/firestore` mockeado en profundidad (mock por `__path` que simula reads/writes por doc, con semántica "pending → flush solo en commit exitoso" para replicar `runTransaction`). El puerto 8080 está libre en la máquina; correr con emulator (`npx firebase emulators:exec --only firestore --project demo-mister-service-rules "npx vitest run tests/integraciones/vinculo-orden-cita-atomico.test.ts"`) es posible pero requiere coordinar con los otros builders para no chocar con corridas concurrentes. NO ejecuté contra producción bajo ninguna circunstancia.
2. **~~No auto-creo cliente al convertir solicitud.~~ RESUELTO iteración 2.** Ahora `convertirAOrden` recibe `ClienteConversion` y crea/mergea el doc `clientes/{telNorm}` DENTRO de la misma `runTransaction`. La orden nunca queda apuntando a un doc de cliente inexistente. Preserva campos ya poblados si otro operador ganó la carrera. No requiere sprint follow-up.
3. **No agregué cazador nuevo.** Por instrucción — Codex registrará. Propuesta: `scripts/invariantes/check-parser-cita-por-confirmar.ts` que replique la lógica de P-009 aplicándola a `CitaPorConfirmar ↔ parseCitaPorConfirmar` (fuente en `src/utils/parseCitaPorConfirmar.ts:parseCitaPorConfirmar`). Alternativa cheap: extender `SKIP_*` allowlist del P-009 existente y agregar `CitaPorConfirmar` como tipo cubierto. Los tests unitarios que agregué ya cazan la regresión por presencia de campo. Propuesta adicional (iter 2): un cazador que detecte writes de `ordenes_servicio` con `clienteId: <telNorm>` sin doc `clientes/{telNorm}` correspondiente — mitigación grep sobre callers de `convertirAOrden` que NO pasen el tercer argumento.
4. **`observaciones` sigue sin estar en el tipo `CitaPorConfirmar`.** Es un bug preexistente — el form del modal "Registrar Cita" persiste `observaciones` pero el tipo/parser no lo declaran. Fuera del scope de este bloque (no tiene que ver con calendario/asignadoId). Documentado como deuda: sprint follow-up trivial.
5. **`convertirAOrden` sigue quemando el contador de orden cuando la transacción falla.** Documentado en el service desde antes. Sin cambio — mitigación real requiere mover `siguienteNumeroOrden` DENTRO del `runTransaction` (choca con la API del contador que ya es transaccional en su propia colección — hacerlo doble puede meter deadlocks). Prefiero no tocarlo sin QA E2E que hoy no puedo correr. Las validaciones fail-fast del `ClienteConversion` (nombre vacío, telefono inválido, clienteId inexistente vía pre-check) ocurren ANTES de reservar el contador — así que la mayoría de errores no lo queman.
6. **No verifiqué UI en navegador.** Requiere `npm run dev` y sesión admin — fuera de scope autoenforzado ("no publiques", "no cambies rama"). Rendering visual del modal de conversión y del selector de cliente (especialmente el nuevo caso "ambigüedad telefónica con radios por candidato") debe validarse manualmente por Jorge / QA humano.
7. **Working tree NO limpio.** Otros builders (Codex, Cowork) mantienen cambios paralelos en archivos compartidos (ver `git status` — 60+ archivos modificados fuera de mi scope). Este reporte cubre únicamente los archivos que este builder posee: `src/pages/Solicitudes.tsx`, `src/services/solicitudes.service.ts`, `src/hooks/useOrdenCreateForm.ts`, `tests/integraciones/solicitud-conversion.test.ts`, `tests/integraciones/vinculo-orden-cita-atomico.test.ts` (iter 3), `docs/qa/2026-09-29-calendarios-solicitudes-claude-code.md`, `src/utils/{metadatosCita,parseCitaPorConfirmar,solicitudMapping,vinculoOrdenCita}.ts` (iter 1 + iter 3) y `tests/unit/{metadatosCita,parseCitaPorConfirmar,solicitudMapping}.test.ts` (iter 1). No hice commit, push, deploy ni tocación de datos reales / envs / secrets / rules / types globales.

## Pendientes que dependen de otros builders

- Codex registrará el detector `check-parser-cita-por-confirmar.ts` (propuesta arriba).
- ~~El auto-creado del cliente al confirmar orden desde solicitud~~ RESUELTO iter 2 (arriba).
- Deploy de `firestore.rules` + `storage.rules` (P-005, P-013) — Jorge / otros builders. Los rules ya modificados NO son de este builder.

## Riesgos

- **Baja** — Todos los cambios en tipos son opcionales; el parser trata los campos nuevos como opcionales; los tests unitarios cubren docs legacy sin los campos.
- **Media** — El modal de "Convertir en Orden" reemplaza el flujo previo. Un admin acostumbrado al viejo click único ahora ve una vista de mapping. El copy en el modal explica el porqué; si aún así confunde, sprint de refinamiento UI menor. La orden creada mantiene el mismo shape base + `metadatosCita` extra (aditivo).
- **Baja** — `useOrdenCreateForm` sigue emitiendo notificaciones `orden_asignada` igual que antes; solo agregamos `creadoPorId` al doc orden (aditivo).
- **Baja (nueva iter 2)** — La transacción de conversión ahora incluye reads/writes sobre `clientes/{id}`. Firestore admite hasta 500 docs por tx; acá tocamos 3 (`solicitudes_servicio/{id}` + `clientes/{id}` + `ordenes_servicio/{id}`), muy dentro del límite. Todas las reads ocurren antes que las writes (requisito de tx). Testeado con mocks.
- **Baja (nueva iter 2)** — La UI de ambigüedad (radios por candidato) es un flujo raro en producción (invariante: 1 cliente por telNorm). Aparecerá solo si hay legacy pre-dedup. Fallback seguro: si el admin no elige, se bloquea con toast.

## Firma

No se hicieron commits, push, ni deploys. El código queda en el working tree para revisión conjunta con los cambios paralelos de otros builders. Working tree **NO limpio** (60+ archivos de otros builders fuera de mi ámbito).
