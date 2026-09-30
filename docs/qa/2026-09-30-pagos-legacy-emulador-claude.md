# Cobertura emulador Firebase — pagos legacy (reparación + confirmación)

Fecha: 2026-09-30
Ejecutor: Claude Code
Alcance de este documento: describir la cobertura nueva del par
`conciliarIdentidadFechaPago` + `confirmarPagoOrden`, ejecutada contra
el emulador Firestore real del proyecto **demo-mister-service-rules**
(nunca contra Firebase producción).

## Superficie ya cubierta antes de este trabajo (no se duplica)

Antes de escribir tests nuevos verifiqué qué escenarios ya estaban probados
para no repetirlos:

- `tests/rules/auditoria-writers.rules.test.ts` — real emulador, mismo
  patrón que este archivo:
  - Línea 34-39: admin confirma pago; escribe la orden y el audit atómicos,
    con `verificadoPorId = auth.uid` (no el `id` del perfil pasado).
  - Línea 54-62: dos copias del mismo `pago.id` bloquean tanto
    `conciliarIdentidadFechaPago` (`throws 'ID repetido'`) como
    `confirmarPagoOrden` (`{ok:false, razon:'requiere_conciliacion'}`),
    sin auditoría escrita.
- `tests/integraciones/auditoria-identidad-writers.test.ts` — mocks (no
  emulador). Cubre variantes de "sin sesión", "sin ID / sin fecha" a nivel
  service, y matriz de IDs duplicados. Útil como cobertura fina de la
  lógica pero NO ejerce las rules ni la runTransaction real del emulador.

Consecuencia: este archivo NO reescribe el caso feliz de `admin confirma
pago` ni el caso de ID duplicado (ya cubiertos por rules test). Se enfoca
en huecos reales que quedaban sin ejercitar contra el emulador.

## Archivo agregado

`tests/rules/pagos-legacy-conciliacion.rules.test.ts` — 13 tests, 4.15 s.

Divididos en tres bloques `describe`:

1. **admin (rules + permiso `pagosVerificar`)** — 5 tests:
   - sin `id`: se genera uno nuevo, `verificado` queda en `false`, el
     `monto` / `metodo` / `fecha` existente no se toca, y se escribe UN
     audit con `accion: 'pago.conciliacion_identidad_fecha'`.
   - sin `fecha`: se aplica la fecha ISO indicada, `verificado` queda en
     `false`, el audit conserva el `anterior` completo.
   - huella cambió entre lectura y reparación (`monto` distinto en Firestore
     al pasado como `esperado`): rechaza sin escribir orden ni audit.
   - segunda reparación consecutiva sobre el mismo índice tras una primera
     ya exitosa: rechaza; `pagos` no crece, audit sigue en 1.
   - pago que ya está bien (id + fecha válidos): la reparación rechaza con
     `'ya son válidas'` y no audita.

2. **matriz de permisos** — 5 tests:
   - `operaria` con override `permisosPersonalizados=true` +
     `permisosSistema.pagosVerificar=true`: rule (`esStaffOficina`) y
     servicio (`puede()`) pasan; repara y audita con `actorUid = uid-operaria`.
   - `operaria` con defaults del rol (sin `pagosVerificar`): rule pasaría
     pero el servicio corta con `throw 'No tienes permiso de conciliación.'`.
     Sin audit ni cambios.
   - `tecnico`: idem — servicio rechaza; los assertFails observan orden
     intacta y 0 audits.
   - usuario autenticado sin doc en `usuarios/`: la rule de
     `ordenes_servicio` (`esStaff`) niega el `tx.get(orden)` antes de que el
     servicio pueda decidir. El efecto observable es idéntico: 0 audits,
     `pagos` intactos. El test acepta ambas capas porque cualquiera de las
     dos cerraría el hueco.
   - sin sesión: rechaza antes de tocar Firestore.

3. **repetición concurrente segura** — 3 tests:
   - dos `confirmarPagoOrden` seguidas sobre el mismo pago: la segunda
     retorna `{ok:false, razon:'ya_confirmado'}` sin re-escribir; 1 solo
     audit.
   - dos `confirmarPagoOrden` en paralelo (`Promise.all`): una gana la
     carrera, la otra queda idempotente. Garantías fuertes verificadas: el
     `pagos[0].verificado` termina en `true` y hay exactamente 1 audit.
   - reparar → luego confirmar el mismo pago: el flag `verificado` NO se
     mueve durante la reparación; solo `confirmarPagoOrden` lo pone en
     `true`. Hay dos audits distintos (`pago.conciliacion_identidad_fecha`
     + `pago.confirmado`).

## Comandos ejecutados

- Suite solo del archivo nuevo, con emulador auto-arrancado:

  ```
  npx firebase emulators:exec --only firestore --project demo-mister-service-rules \
    "npx vitest run --config vitest.rules.config.ts \
       tests/rules/pagos-legacy-conciliacion.rules.test.ts"
  ```

  Resultado: 13 pass / 0 fail, duración 4.15 s.

- Suite completa `test:rules` (todo `tests/rules/**`):

  ```
  npm run test:rules
  ```

  Resultado: 26 archivos passed, 1 skipped (`publico-storage.rules.test.ts`
  se salta por diseño, ajeno a este cambio); 184 tests passed, 3 skipped.
  Duración 70.76 s.

## Puertos y procesos

- El emulador de Firestore quedó en el puerto declarado en `firebase.json`
  (127.0.0.1:8080). Antes de correr verifiqué que estaba libre con
  `lsof -iTCP:8080 -sTCP:LISTEN` (sin salida).
- No se mató ningún proceso ajeno. `firebase emulators:exec` arranca y
  detiene su propio emulador en cada corrida.

## Límites honestos

- No se ejercita el path de subcolección `ordenes_servicio/{id}/pagos/{pagoId}`
  porque el service legacy sigue leyendo del array `data.pagos` (fase B-2,
  opción B aprobada). Cuando fase B-3 mueva el source-of-truth, este
  archivo hay que actualizarlo.
- No se prueba la carrera entre `conciliarIdentidadFechaPago` en paralelo
  (dos reparaciones simultáneas) — la runTransaction del emulador
  serializa, y el servicio ya bloquea la segunda al detectar cambio de
  huella. Ese caso está cubierto indirectamente por el test "segunda
  reparación consecutiva".
- No se toca `firestore.rules` ni `storage.rules`. No se deployó nada.
- No se tocó código de producción de `src/` ni de `api/`.
- No se creó commit ni se hizo push.
