# Bloqueos — sprints que requieren OK de Jorge

> El coordinator mueve sprints acá cuando detecta que afectan rules,
> migraciones masivas, integraciones de pago, o borrados.
>
> **Para desbloquear:** editá el sprint y agregá `OK: jorge YYYY-MM-DD HH:MM`
> al final, después pegá `procesa bloqueos` al coordinator.
>
> **Para rechazar:** editá el sprint y agregá `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>`.

---

## SPRINT-158e — GPS bloqueante o informativo al cerrar orden (bug 8 del SPRINT-158, decisión de negocio)

**Tipo:** Decisión de negocio — Jorge decide la política. NO se puede procesar autónomo.
**Estado:** ESPERANDO_OK_JORGE
**Origen:** QA E2E distribuido 2026-05-13 sobre OS-0055 → CG-00018. Aury Mon (técnico) cerró la orden sin verificación GPS en su ubicación. Sistema detectó el cierre sin GPS verificado pero NO lo bloqueó: solo generó alerta informativa en dashboard ("Aury Mon cerró OS-0055 sin verificación GPS").

#### Estado actual del comportamiento

- La app SÍ controla GPS en el cierre del wizard (`CierreServicioWizard.tsx`).
- El check de distancia al cliente se persiste en `cierreServicio.fotoCierre.distanciaCliente` + `gpsVerificado`.
- Si el GPS no se verifica (técnico fuera de zona, sin permisos, distancia >500m), la alerta aparece en dashboard pero **el cierre se permite**.
- Comportamiento intencional o omisión histórica — no documentado en CLAUDE.md.

#### Opciones para Jorge

**Opción A — Mantener como alerta informativa (status quo):**
- Pro: Flexibilidad operativa. Técnico que está en zona con mal GPS no queda bloqueado.
- Pro: Alerta visible permite auditoría posterior.
- Contra: Riesgo de cierres fraudulentos (técnico cierra desde su casa, no del cliente).

**Opción B — Bloqueante absoluto (siempre exige GPS verificado):**
- Pro: Defense-in-depth contra cierres fraudulentos.
- Contra: Puede bloquear cierres legítimos en zonas con mala señal. UX degradada en RD donde muchas casas tienen poca cobertura indoor.
- Contra: Requiere desarrollar UI/flujo de "override con razón" para casos excepcionales.

**Opción C — Parametrizable por rol o por tipo de servicio:**
- Pro: Técnicos juniors → bloqueante. Técnicos seniors (Aury, etc.) → con override.
- Pro: Servicios de mantenimiento (rutinario) → flexible. Servicios de reparación con conduce → bloqueante (más valor monetario).
- Contra: Complejidad de implementación. Requiere matriz de permisos nueva.

**Opción D — Bloqueante solo si distancia >X metros (umbral parametrizable):**
- Pro: Tolerancia a GPS impreciso pero detecta cierres remotos.
- Pro: Implementación más simple que C.
- Contra: Aún permite cierre desde la casa del vecino si está a <X metros.

#### Decisión solicitada a Jorge

1. ¿Cuál opción (A/B/C/D u otra)?
2. Si B/C/D: ¿cuál es el umbral aceptable de distancia? (sugerido: 200m si urbano, 500m si rural — actual es 500m según código).
3. Si C: ¿qué roles son los privilegiados (con override) vs gateados (sin override)?
4. ¿Aplica retroactivamente a órdenes legacy con GPS no verificado? (sugerido: NO — solo nuevas).

#### Implementación post-OK Jorge

Una vez decidida la política, redactar SPRINT-158e-IMPL en `COLA_AUTONOMA.md` con:

- Touch-list (probable: `CierreServicioWizard.tsx`, `firestore.rules` si gating server-side, `Dashboard.tsx` para ajustar el banner de alerta).
- Si toca `firestore.rules` → ese sub-sprint también requiere OK separado (sub-regla CLAUDE.md).
- archivist PRE-CHANGE obligatorio.

#### OK / RECHAZADO de Jorge

_(pendiente — esperando decisión)_

---

## SPRINT-149-APPLY — Ejecución de `--apply` del script de migración operariaId (post-fix de código)

**Tipo:** Migración de datos — Jorge dispara manualmente (sub-regla CLAUDE.md "migraciones >50 docs sobre flujo de nómina").
**Estado:** COMPLETADO 2026-05-12 17:42 — 63 docs migrados (49 órdenes + 14 técnicos), 0 huérfanos. Audit log en `auditoria_admin` con `accion: migracion_operariaid_a_uid`. Cambio al script: flag `--ok-ampliado` agregado para destrabar el gate de 50 docs cuando BLOQUEOS.md tiene el OK firmado.
**Origen:** SPRINT-149 completado por coordinator pasada 12 (2026-05-12). El fix de código está pusheado y deployado. Falta alinear datos legacy: cualquier `ordenes_servicio.operariaId` o `personal[tecnico].operariaId` que sea docId de una operaria con uid poblado debe migrarse a uid.

**Cómo ejecutar (Jorge en su Mac, después del deploy del fix de código):**

1. **DRY-RUN primero (obligatorio):**
   ```bash
   cd /Users/jorgeluisbritogarcia/Desktop/mister-service-rd
   npx tsx scripts/migrar-operariaid-a-uid.ts
   ```
   Output esperado: tabla con conteos `Total/Sin operariaId/Ya correcto/Migrable/Huérfano/Sin uid destino` para `ordenes_servicio` y para `personal` (técnicos). Listado de primeros 10 cambios propuestos.

2. **Revisión:**
   - Si `totalMigrables == 0` → nada que migrar, archivar este sprint.
   - Si `totalMigrables > 0 && <= 50` → seguir al paso 3.
   - Si `totalMigrables > 50` → el script abortará al ver `--apply`. Jorge debe agregar OK adicional en este mismo sprint: `OK ampliado: jorge YYYY-MM-DD HH:MM — autorizo migrar N docs (>50)`.
   - Si aparecen huérfanos → revisar manualmente (probablemente operarias eliminadas). El script NO los toca.

3. **`--apply` real:**
   ```bash
   npx tsx scripts/migrar-operariaid-a-uid.ts --apply
   ```
   El script:
   - Migra en batches de 200 docs con `writeBatch` atómico.
   - Setea `operariaId: <uid>` + `operariaIdMigradoDesde: <docIdViejo>` (forensia).
   - Escribe audit log en `auditoria_admin` con accion `migracion_operariaid_a_uid`.
   - Reporta progreso `[BATCH N] N docs actualizados (total X/Y)`.

4. **QA post-`--apply`:**
   - Hard refresh en `/admin/dashboard` y `/admin/ordenes` como Yohana (operaria pre-SPRINT-105). Verificar que "mis órdenes" sigue mostrando lo correcto.
   - Si tenés ambiente de prueba: crear operaria nueva → asignar técnico → crear orden → verificar shape en Firestore Console.

**Lo que ya está pusheado (no requiere acción humana):**

- 13 archivos de código con lookups migrados a `(p.uid || p.id) === operariaId` (compatibles pre/post migración).
- Cazador P-006 extendido (variante 4) con 0 hits.
- Docs actualizados.

**Restricciones:**

- NO ejecutar `--apply` antes del DRY-RUN.
- NO ejecutar `--apply` si conteos no parecen razonables (>200 docs migrables sin explicación).
- NO desactivar el umbral de 50 sin OK explícito acá.

**Si Jorge prefiere rechazar:** agregar `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>`. El código actual con fallback `(p.uid || p.id)` funciona correctamente para órdenes pre y post migración — los datos legacy siguen apuntando a docId pero los reads los matchean. La migración es óptima pero no urgente.

**Resultado DRY-RUN 2026-05-12 17:40 (Jorge):**
- `ordenes_servicio`: 55 total → 49 migrables, 6 sin operariaId, 0 huérfanos, 0 sin uid destino.
- `personal` (técnicos): 14 total → 14 migrables, 0 huérfanos, 0 sin uid destino.
- **Total: 63 docs migrables, 0 huérfanos.** Migración limpia.

**OK ampliado: jorge 2026-05-12 17:40 — autorizo migrar 63 docs (>50). Resultado del dry-run muestra 0 huérfanos y 100% de uids destino válidos. Apply autorizado.**

---

## SPRINT-149 — DESBLOQUEADO 2026-05-12 (OK: jorge "ambos en orden, 149 primero")

**Movido a `COLA_AUTONOMA.md` como PENDIENTE el 2026-05-12 por coordinator (pasada 12). desbloqueadoPor: jorge 2026-05-12 vía "ambos en orden, 149 primero".**

Conservado acá para histórico. NO procesar desde acá — la entrada activa está en `COLA_AUTONOMA.md`.

<details>
<summary>Spec original + decisión humana (preservada para forensia)</summary>

**Tipo:** Sprint con instrucción explícita del usuario delegante de NO procesar autónomo.
**Estado:** ESPERANDO OK JORGE
**Origen:** Cowork escribió la spec completa en `COLA_AUTONOMA.md` el 2026-05-12 ("Origen: Jorge 2026-05-12 vía Cowork. ... a pedido explícito de Jorge: 'vamos con operaria'"). El coordinator pasada 11 recibió instrucción explícita en el prompt del modo autónomo: "NO toques los 3 hits `operariaId === p.id` (nomina/Ordenes/Rendimiento) — esos sí requieren decisión arquitectónica humana y van a BLOQUEOS.md si no están ya."

**Por qué requiere OK humano (a pesar de que Cowork lo escribió):**

Hay un conflicto de autoridad que solo Jorge puede resolver:

- Cowork (vía interfaz natural con Jorge) escribió la spec dándola por aprobada con la frase "vamos con operaria".
- El prompt del coordinator en la pasada 11 dice expresamente "NO toques los 3 hits operariaId === p.id" y los redirige a BLOQUEOS.md.
- Ambos llegan vía Jorge. El coordinator NO puede resolverlo sin que Jorge confirme cuál instrucción es la actual.

**El riesgo de procesarlo autónomo sin clarificación es alto:**

1. Toca código de nómina/comisiones (riesgo financiero medio-alto, la propia spec lo declara).
2. Requiere reviewer obligatorio + archivist PRE-CHANGE obligatorio.
3. 13 archivos + script de migración de datos + cazador P-006 extendido.
4. Si Jorge cambió de opinión entre el dictado a Cowork y el prompt al coordinator, procesar autónomo es ir contra una instrucción explícita posterior.

**Lo que Jorge debe hacer para desbloquear:**

1. Decidir si la migración `operariaId → auth.uid` se procesa autónoma O queda en BLOQUEADO para revisión humana paso a paso.
2. Agregar al final de esta sección UNA de las dos opciones:
   - `OK: jorge YYYY-MM-DD HH:MM | confirmo "vamos con operaria" — procesar autónomo según spec de Cowork`
   - `MANTENER BLOQUEADO: jorge YYYY-MM-DD HH:MM | razón <X>`
3. Si OK, pegar `procesa bloqueos` al coordinator de Claude Code.

OK: jorge 2026-05-12 — confirmo SPRINT-149, procesalo según spec de Cowork ("vamos con operaria")

**OK adicional pasada 12:** jorge 2026-05-12 vía "ambos en orden, 149 primero" — confirma re-procesamiento de SPRINT-149 según spec de Cowork.

**Spec completa preservada:** la entrada original con scope, touch-list, auditoría de consumidores, script de migración y criterios sigue intacta en `COLA_AUTONOMA.md` (sección SPRINT-149). NO procesar desde acá — al desbloquear, el coordinator la mueve de vuelta a PENDIENTE en la cola.

**Restricciones reiteradas:**
- archivist PRE-CHANGE obligatorio.
- reviewer obligatorio (riesgo financiero — nómina).
- regression_guardian obligatorio.
- `--apply` del script de migración NO se ejecuta autónomo. Jorge lo dispara manual cuando esté listo después del fix de código.

</details>

---

## SPRINT-138 — Crear `storage.rules` versionado + flujo `deploy:storage-rules`

**Tipo:** Sprint bloqueado por OK humano (toca rules de seguridad productiva — equivalente al gate de `firestore.rules`).
**Estado:** ESPERANDO OK JORGE
**Origen:** Audit forense Cowork 2026-05-11. `firestore.rules` está versionado en el repo, pero `storage.rules` no existe — las rules de Storage viven solo en Firebase Console. Sin archivo en el repo no hay diff en PR ni protección contra `git revert`, y el flujo `npm run deploy:rules` no las cubre.

**Por qué requiere OK:**

1. Toca un archivo de rules nuevo que va a deployarse a producción → riesgo de bloquear flujos legítimos si está mal escrito (técnico que sube foto, cliente que firma).
2. Necesita que Jorge **dicte el baseline actual de las rules de consola** antes de empezar. Sin baseline, el sprint puede sobreescribir rules existentes con un default genérico.
3. Patrón espejo de `firestore.rules` que requiere reviewer obligatorio con foco en rules.

**Lo que Jorge debe hacer para desbloquear:**

1. Entrar a https://console.firebase.google.com/project/mister-service-app-cloude/storage/rules
2. Copiar el contenido completo del editor y pegarlo abajo en la sección "Baseline actual de rules" de esta entrada.
3. Agregar `OK: jorge YYYY-MM-DD HH:MM` al final de esta sección.
4. Pegar `procesa bloqueos` al coordinator de Claude Code.

**Baseline actual de rules** (Jorge completa esta sección antes de OK):

```
<pegá acá las rules tal como están en consola hoy>
```

**Restricciones reiteradas (también en el sprint):**

- archivist PRE-CHANGE obligatorio.
- reviewer obligatorio (foco rules + defense in depth).
- regression_guardian obligatorio.
- `npm run deploy:storage-rules` ejecutado por Jorge — coordinator NO ejecuta autónomo.
- Smoke test manual post-deploy: técnico sube foto, operaria sube foto, cliente firma. Si algo se rompe, revertir.

**Si Jorge prefiere rechazar:** agregá `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>` y se archiva. Las rules de Storage siguen viviendo solo en consola hasta nuevo aviso.

### Dependencia explícita — SPRINT-159 (firma del cliente) agregó nuevo path

**Agregado:** 2026-05-13 por coordinator post-SPRINT-159.

SPRINT-159 implementó captura de firma del cliente en el wizard de cierre. El upload escribe a un path nuevo de Storage:

```
firmas_cierre/{ordenId}/firma-{timestamp}.png
```

**Acción manual requerida ANTES del QA E2E en iPad de Aury** (Jorge ajusta directamente en la consola Firebase):

1. Entrar a https://console.firebase.google.com/project/mister-service-app-cloude/storage/rules
2. Verificar/agregar regla que permita writes desde técnico autenticado al path `firmas_cierre/{ordenId}/{cualquier-nombre}`. Si las rules actuales permiten escrituras desde cualquier usuario autenticado a cualquier path (común en setups iniciales), no requiere cambio — el code ya valida MIME + size lado cliente vía `validarFirma()`.
3. Si las rules tienen whitelist explícita de paths, agregar:

```javascript
match /firmas_cierre/{ordenId}/{archivo} {
  allow read: if request.auth != null;       // staff lee para ver el cierre
  allow write: if request.auth != null
              && request.resource.size < 2 * 1024 * 1024
              && request.resource.contentType.matches('image/.*');
}
```

4. Si Aury intenta firmar en iPad y obtiene `permission-denied` o `unauthorized` al subir la firma → es exactamente este gap. Toast del wizard muestra "Error de permisos al subir la foto. Contacta al administrador." (mensaje genérico, no específico para firma — deuda menor).

**Cuando SPRINT-138 se desbloquee:** este path queda permanentemente cubierto en el archivo versionado `storage.rules`. Hasta entonces vive solo en consola.

---

## SPRINT-135a-UI — Refactor garantía fase 1, parte UI (countdown público + wizard cierre) — DESBLOQUEADO

**OK:** jorge 2026-05-11 18:25 | scope: ambos (endpoint público + wizard cierre).
**Movido a COLA_AUTONOMA.md como PENDIENTE el 2026-05-11 por coordinator (procesa bloqueos). desbloqueadoPor: jorge 2026-05-11 18:25.**

Conservado acá para histórico. NO procesar desde acá — la entrada activa está en `COLA_AUTONOMA.md`.

<details>
<summary>Spec original preservado para forensia</summary>

**Tipo:** Bloqueado por restricciones de protocolo + QA visual humano.
**Estado:** ESPERANDO OK JORGE
**Origen:** Coordinator autónomo 2026-05-11. La fase backend de SPRINT-135a (tipos `VisitaGarantia` + enum `garantia_reclamada` + `OrdenServicio.{visitasGarantia, periodoGarantiaDias, garantiaVencimiento}` + `src/utils/garantia.ts` helpers puros + maps `faseLabel`/`faseColor`/`faseBgColor`/`faseToEstadoSimple`) quedó cerrada autónoma. La parte UI (criterios 5 y 6 del spec original) requiere OK por dos motivos independientes:

**Motivo 1 — Endpoint público (regla protocolo "endpoints `api/` públicos"):**

El criterio "GarantiaCliente.tsx muestra countdown legible + botón Reclamar con estado disabled correcto" requiere modificar también el endpoint `api/garantia/[token].ts` para que retorne los campos nuevos (`periodoGarantiaDias`, `garantiaVencimiento`, días restantes computados server-side). El endpoint es público (consumido desde `/garantia/:token` sin auth), y la sub-regla CLAUDE.md/protocolo dice "Cambios a endpoints `api/` públicos" requieren OK Jorge.

**Motivo 2 — Wizard de cierre (sub-regla CLAUDE.md "cleanup en componentes wizard"):**

El criterio "Wizard de cierre tiene el input 'Período de garantía'" toca el componente del wizard de cierre (probablemente `CierreServicioWizard.tsx` o homólogo en `src/components/cierre/`). La sub-regla CLAUDE.md dice explícitamente que "cleanup de 'dead code' en archivos de páginas críticas requiere QA manual del flujo afectado antes de commit. Para cualquier cleanup sobre... `CierreServicio*` o componentes de wizard, el commit message debe declarar 'QA flujo X validado' o agregar a BLOQUEOS.md para validación humana." Si bien NO es cleanup sino feature nueva, el riesgo es idéntico: tocar el wizard de cierre sin QA visual puede romper el flujo crítico técnico→cierre.

**Lo que Jorge debe hacer para desbloquear:**

1. Decidir si autoriza el cambio al endpoint público `api/garantia/[token].ts`. Si SÍ → confirmar el shape del response que se agrega: `garantia.periodoGarantiaDias`, `garantia.garantiaVencimiento`, `garantia.diasRestantes` (estos ya existen como mock retornado por el endpoint — verificar coherencia).
2. Autorizar la modificación del wizard de cierre, sabiendo que el coordinator NO puede ejercitar el flujo end-to-end con técnico real.
3. Comprometerse a hacer un smoke test post-deploy:
   - Cerrar una orden de prueba con período 1 día.
   - Abrir `/garantia/:token` → countdown muestra "Vence en 1 día".
   - Setear manualmente `garantiaVencimiento` a ayer en Firestore Console → recargar → botón disabled.
4. Agregar `OK: jorge YYYY-MM-DD HH:MM | scope: ambos | tests acepta: <descripción>` al final de esta sección.
5. Pegar `procesa bloqueos` al coordinator de Claude Code.

**Si Jorge prefiere rechazar:** agregar `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>`. La fase backend ya está mergeada y es retrocompatible (campos opcionales); el sprint queda como "parcial". La UI nueva puede esperar a SPRINT-135b en bloque.

**Touch-list adicional (cuando se desbloquee):**
- `api/garantia/[token].ts` — exponer campos nuevos en el response.
- `src/pages/public/GarantiaCliente.tsx` — UI countdown + botón disabled.
- `src/components/cierre/CierreServicioWizard.tsx` (o el componente real del wizard nuevo, identificar primero) — input "Período de garantía (días)" con default 60.
- Posiblemente `src/hooks/useCierreServicio.ts` u homólogo si la lógica vive en hook.

**Plan de QA post-deploy** (a ejecutar por Jorge):
1. Crear orden de prueba con cliente test.
2. Cerrar con `equipoFunciona=true` + `clienteSatisfecho=true` + período `1 día`.
3. Abrir `/garantia/:token` en otro browser/incognito → countdown debe decir "Vence en 1 día" (rojo si <7).
4. Setear `garantiaVencimiento` a ayer en Firestore Console → recargar → botón Reclamar debe quedar disabled.
5. Para órdenes legacy (sin `garantiaVencimiento`), confirmar que el countdown se computa al vuelo desde `cierreServicio.fechaCierre + 60d` y muestra valor coherente o mensaje neutro.

**OK: jorge 2026-05-11 18:25 | scope: ambos**

</details>

---

## SPRINT-141 — Activar App Check enforce (con ventana monitoreo 48h previo)

**Tipo:** Sprint bloqueado por OK humano (cambio operacional en Firebase Console, no es código).
**Estado:** ESPERANDO OK JORGE
**Origen:** Audit forense Cowork 2026-05-11. App Check está inicializado en `src/firebase/config.ts:22-42` con reCAPTCHA v3 pero en modo soft (no bloquea requests sin token). Audit recomienda activar enforce, pero con ventana de monitoreo previa de 48h para evitar bloquear usuarios legítimos.

**Por qué requiere OK:**

1. Activar enforce puede romper la app para usuarios reales si algún flujo no inicializa App Check correctamente. Es operación de alto riesgo.
2. El cambio se hace en consola, no en código — el coordinator no puede ejecutarlo.
3. Necesita ventana de monitoreo humano de 48h en Firebase Console mirando "App Check verified vs unverified requests".

**Lo que Jorge debe hacer para desbloquear (flujo en 3 pasos):**

**Paso 1 — Día 0 (Jorge inicia ventana de monitoreo):**

1. Entrar a https://console.firebase.google.com/project/mister-service-app-cloude/appcheck
2. Ver sección "Requests" para Firestore y Storage en últimos 7 días.
3. Anotar baseline: `% verified = ___` y `% unverified = ___` para cada producto.
4. Agregar acá: `Día 0 baseline: jorge YYYY-MM-DD HH:MM | Firestore verified ___% | Storage verified ___%`
5. NO activar enforce todavía. Solo iniciar la ventana.

**Paso 2 — Día 0+48h (Jorge revisa de nuevo):**

1. Volver a Firebase Console → App Check → Requests.
2. Si `verified > 99%` para ambos productos → continuar al Paso 3.
3. Si `verified < 99%` → investigar qué flujo no envía token (probablemente algún hook o ruta que no importa `firebase/config.ts` antes de hacer requests). Abrir sprint diagnóstico antes de enforce.

**Paso 3 — Día 0+48h (Jorge activa enforce, ya con OK del Paso 2):**

1. Firebase Console → App Check → Firestore → "Enforce" → ON.
2. Lo mismo para Storage.
3. Smoke test end-to-end con admin, coord, operaria, técnico, secretaria. Si todo OK:
4. Agregar `OK enforce activado: jorge YYYY-MM-DD HH:MM — Firestore + Storage` y archivar.
5. Si algo se rompe → desactivar enforce inmediatamente (1 click en consola) y abrir sprint diagnóstico.

**Restricciones reiteradas:**

- Coordinator solo registra los pasos acá y espera.
- Considerar activar primero Firestore, esperar 24h, después Storage. Reduce blast radius.
- Postmortem-positivo si todo OK (sub-regla continuous improvement loop, opcional).

**Si Jorge prefiere rechazar:** agregá `RECHAZADO: jorge YYYY-MM-DD HH:MM <motivo>`. App Check sigue en soft mode hasta nuevo aviso (vulnerable a abuso desde scripts externos con las API keys públicas del bundle).

---

## SPRINT-134-mant-QA — Validación funcional: generar orden desde mantenimiento programado (writeBatch atómico)

**Tipo:** QA humana **no bloqueante** (registro de pendiente, no impide cierre del sub-sprint).
**Estado:** PENDIENTE VALIDACIÓN HUMANA
**Origen:** SPRINT-134 sub-sprint Mantenimiento (pasada 5 del 2026-05-11). `handleGenerarOrden` envuelto en `writeBatch` para que la creación de la orden y la actualización de `proximaFecha` en el mantenimiento sean atómicas. Cazadores 7/7 PASS + typecheck + lint OK + regression_guardian PASS + reviewer APPROVED. PERO el sprint pide validación manual del flujo — el coordinator no puede ejercitar UI real ni network throttling.

**Casos a validar manualmente (Jorge en su Mac, en entorno de prueba):**

1. **Caso primary — generar orden desde mantenimiento vencido (happy path):**
   - Ir a `/admin/mantenimiento` y elegir un mantenimiento programado vencido (o crear uno con fecha en el pasado).
   - Click "Generar orden" (botón con icono RefreshCw o equivalente).
   - **Resultado esperado:** toast verde `Orden OS-XXXX creada`. Verificar en `/admin/ordenes` que la orden nueva aparece con `fase: 'agendado'`, cliente y equipo del mantenimiento, descripción "Mantenimiento programado (frecuencia)". Verificar en `/admin/mantenimiento` que la `proximaFecha` del item se movió N meses (mensual=1, trimestral=3, semestral=6, anual=12).

2. **Caso secondary — atomicidad (simular fallo a mitad):**
   - Abrir DevTools → Network tab → setear "Offline".
   - Click "Generar orden" sobre un mantenimiento programado.
   - **Resultado esperado:** el toast de error debe aparecer ("Error al generar orden") y verificar en Firestore Console:
     - **Ninguna** orden nueva en `ordenes_servicio` con el `numero` consumido del counter (el counter sí avanzó por ser tx aparte — esto es comportamiento esperado, idéntico al SPRINT-133).
     - El item de `mantenimiento` mantiene su `proximaFecha` original (NO se movió).
   - El test antiguo (pre-SPRINT-134) habría dejado la orden creada Y luego habría fallado al update de `proximaFecha`, resultando en una orden de mantenimiento "no contabilizada" en su item original.

3. **Caso terciario — orden secuencial de operaciones:**
   - Ejecutar el caso primary 2 veces consecutivas en el mismo mantenimiento.
   - **Resultado esperado:** ambas órdenes se crean con números secuenciales (OS-XXXX y OS-XXXX+1), y `proximaFecha` salta dos veces. No hay race condition aparente.

**Si todos pasan:** Jorge edita esta sección con `OK: jorge YYYY-MM-DD HH:MM — QA validado` y la archivamos.

**Si algún caso falla:** capturar consola del browser + Firestore Console (estado de docs afectados) y reportar a Cowork. Posible regresión del fix.

**Nota técnica:** Firestore `writeBatch` es atómico para el set de la orden + update del mantenimiento (2 ops, dentro del límite de 500). El `siguienteNumeroOrden()` consume un counter en su propia tx ANTES del batch — si el batch falla, el número queda como hueco numérico (consistente con SPRINT-133 / SPRINT-2ba57e4).

---

## SPRINT-133-QA — Validación funcional: eliminación atómica de técnico/operaria con órdenes activas

**Tipo:** QA humana **no bloqueante** (registro de pendiente, no impide cierre del sprint).
**Estado:** PENDIENTE VALIDACIÓN HUMANA
**Origen:** SPRINT-133 (pasada 4 del 2026-05-11) envolvió `handleConfirmarEliminar` en `writeBatch` con chunking. Cazadores 7/7 PASS + typecheck + lint OK + reviewer APPROVED + regression_guardian PASS. PERO el sprint pide validación manual del flujo de eliminación con simulación de fallo a mitad — el coordinator no puede ejercitar UI real ni network throttling.

**Casos a validar manualmente (Jorge en su Mac, en entorno de prueba o producción con cuidado):**

1. **Caso primary — eliminar técnico con 2-3 órdenes activas:**
   - Crear un técnico de prueba (ej: "Test Técnico SPRINT-133") en `/admin/personal`.
   - Asignarle 2-3 órdenes activas (crearlas desde `/admin/ordenes` o reasignar existentes).
   - Ir a `/admin/personal` → click "Eliminar" en el técnico de prueba.
   - El modal de transferencia debe aparecer pidiendo técnico destino.
   - Elegir otro técnico real (ej: Aury) y confirmar.
   - **Resultado esperado:** toast verde "Técnico eliminado. N orden(es) transferida(s) a Aury". Verificar en `/admin/ordenes` que las 2-3 órdenes ahora muestran a Aury como técnico. Verificar en Firestore Console que `personal/<id de prueba>` ya NO existe.

2. **Caso secondary — eliminar operaria con técnicos asignados:**
   - Crear operaria de prueba en `/admin/personal`.
   - Asignar 1-2 técnicos a esa operaria (desde el perfil de cada técnico, campo "Operaria").
   - Crear 1-2 órdenes a esos técnicos.
   - Ir a `/admin/personal` → click "Eliminar" en la operaria de prueba.
   - Modal de transferencia → elegir otra operaria real (ej: Wilainy) → confirmar.
   - **Resultado esperado:** toast verde "Operaria eliminada. N técnico(s) y M orden(es) transferidos a Wilainy". Verificar:
     - Los técnicos ahora muestran a Wilainy en su perfil.
     - Las órdenes muestran a Wilainy.
     - El doc de la operaria de prueba ya NO existe en `personal/`.

3. **Caso terciario — atomicidad (simular fallo a mitad):**
   - Crear técnico de prueba con 2-3 órdenes activas.
   - Abrir DevTools → Network tab → setear "Offline" o throttling agresivo.
   - Click "Eliminar" → confirmar.
   - **Resultado esperado:** el toast de error debe aparecer ("Error al eliminar") y verificar en Firestore Console:
     - Si el batch alcanzó a ejecutar: o **TODAS** las órdenes están transferidas Y el personal está borrado, o **NINGUNA** está transferida Y el personal sigue existiendo. NUNCA estado parcial.
   - El test antiguo (pre-SPRINT-133) habría dejado las primeras N órdenes transferidas y el resto + el delete personal sin ejecutar.

4. **Caso colateral — eliminar admin/secretaria sin dependencias:**
   - Verificar que la eliminación de un admin (no el último) o secretaria sin órdenes asignadas sigue funcionando con un solo `deleteDoc` (no se rompió).

**Si todos pasan:** Jorge edita esta sección con `OK: jorge YYYY-MM-DD HH:MM — QA validado` y la archivamos.

**Si algún caso falla:** capturar consola del browser + Firestore Console (estado de docs afectados) y reportar a Cowork. Posible regresión del fix.

**Nota técnica:** Firestore `writeBatch` es atómico en el límite de 500 operaciones por batch. Si llegamos a >500, hay chunking secuencial con atomicidad parcial documentada en código y aceptada por el spec del sprint.

---

## SPRINT-132-QA — Validación funcional: CREATE de orden con técnico que tiene operariaId

**Tipo:** QA humana **no bloqueante** (registro de pendiente, no impide cierre del sprint).
**Estado:** PENDIENTE VALIDACIÓN HUMANA
**Origen:** SPRINT-132 (commit `43a2087`, 2026-05-11) corrigió 12 sitios de READ + 4 de WRITE upstream con vector P-006 (`find(p.id === tecnicoId)` post-c4be345 retornaba undefined). Cazadores 7/7 PASS, build OK, lint OK, deploy verificado. PERO el sprint pide validación manual del flujo CREATE — el coordinator no puede ejecutar UI real.

**Caso concreto a validar (idealmente Jorge en su Mac o en producción):**

1. **Caso primary — derivación de operaria al crear orden:**
   - Verificar que el técnico **Aury Mon** tenga **Wilainy** asignada como `operariaId` en su perfil (en `/admin/personal`, editar Aury Mon y confirmar el campo "Operaria" en el bloque de Grupos).
   - Si Aury NO tiene operaria asignada → primero asignar Wilainy desde la UI de Personal.
   - Ir a `/admin/ordenes` → "Nueva orden".
   - Seleccionar un cliente existente.
   - En el selector de técnico, elegir **Aury Mon**.
   - Llenar resto de campos mínimos (equipo, dirección, fecha).
   - Guardar la orden.
   - **Resultado esperado:** la orden creada debe mostrar **Operaria: Wilainy** desde el inicio (NO `—`, NO vacío). Verificar en la vista de la orden recién creada y en la tabla de órdenes.
   - **Si falla:** capturar pantalla + console del browser + reportar a Cowork. Esto sería regresión del fix.

2. **Caso secondary — edit de orden post-fix:**
   - Abrir la orden de Aury Mon recién creada.
   - Cambiar el técnico a otro que tenga distinta operariaId.
   - **Resultado esperado:** banner amber "Esta orden pasará al grupo de {nueva operaria}" debe aparecer.
   - Guardar. Verificar que la orden ahora muestra la nueva operaria.

3. **Caso terciario — reasignación drag&drop en mapa:**
   - Ir a `/admin/mapa` (Mapa de rutas).
   - Drag&drop de un pin de orden a otro técnico (en la lista de técnicos del sidebar derecho).
   - Confirmar la reasignación en el modal.
   - **Resultado esperado:** la orden queda con `tecnicoId == auth.uid` del nuevo técnico (verificable porque el nuevo técnico puede ejecutar acciones en la orden, ej: "Iniciar chequeo"). Antes del fix, escribía `tecnicoId == personal.id` y rompía rules.

4. **Caso colateral — display de comisiones / cierre día / facturas:**
   - Abrir `/admin/comisiones` agrupado por técnico: verificar que cada técnico muestra su color asignado (no el default `#0f3460`) para órdenes nuevas.
   - Abrir `/admin/cierre-dia`: idem.
   - Abrir una factura con items asignados a técnico: el avatar/nombre debe aparecer correcto.

**Si todos pasan:** Jorge edita esta sección con `OK: jorge YYYY-MM-DD HH:MM — QA validado` y la archivamos.

**Si algún caso falla:** reportar a Cowork con captura + console error. Cowork abrirá SPRINT-132-FIX o investigará caso específico.

---

## SPRINT-131-QA — Validación visual: cards de orden en iPad portrait

**Tipo:** QA humana **no bloqueante** (registro de pendiente, no impide cierre del sprint).
**Estado:** PENDIENTE VALIDACIÓN HUMANA
**Origen:** SPRINT-131 cerró el código (cambio `md:flex-row` → `lg:flex-row` en `OrdenCard.tsx:68`) + cazadores 7/7 PASS + build OK + lint del archivo limpio. El coordinator no puede ejecutar QA visual con DevTools real; queda registrado acá.

**Casos a validar manualmente (Wilainy / Yohana / Mariela en iPad real, o Jorge con DevTools responsive):**

1. **iPad portrait (~810×1080)** en `/admin/ordenes` (Vista Lista):
   - Abrir cualquier card de orden con fase activa (idealmente OS-0049 de Aury Mon en Diagnóstico).
   - El layout debe ser COLUMN: foto arriba, info del cliente al medio, stepper+botones abajo.
   - El botón "Cancelar" debe estar 100% visible (no recortado a "✗ Car…").
   - "Cómo llegar" y el botón papelera (Eliminar) también deben quedar visibles.
   - El stepper de 8 fases debe verse completo (puede wrapear a varias filas dentro de su contenedor).

2. **Desktop (≥1024px, ej. 1280px o 1440px)**:
   - El layout debe ser HORIZONTAL idéntico al actual: foto izquierda, info al medio, stepper+botones a la derecha en una sola fila.
   - Verificar que NO haya regresión visual (densidad similar a la de hoy).

3. **Tablet landscape (~1024×768)**:
   - Como 1024 cae justo en el breakpoint `lg:`, validar que se vea bien (debería activarse el layout horizontal). Si queda apretado, está OK siempre que el botón Cancelar sea clickeable.

4. **Mobile (<768px)**:
   - Sigue layout COLUMN, sin regresión.

**Si algún caso falla:** reportar a Cowork con captura. Cowork agregará SPRINT-131-FIX (probablemente `overflow-x-auto` + `min-w-0` como fallback documentado en el sprint).

**Si todos pasan:** Jorge (o quien valide) edita esta sección con `OK: jorge YYYY-MM-DD HH:MM — QA visual OK` y la podemos archivar.

---

## SPRINT-130-QA — Validación visual del botón "Re-sincronizar operaria"

**Tipo:** QA humana **no bloqueante** (registro de pendiente, no impide cierre del sprint).
**Estado:** PENDIENTE VALIDACIÓN HUMANA
**Origen:** SPRINT-130 cerró el código + cazadores 7/7 PASS + typecheck + build, pero la sub-regla CLAUDE.md "cleanup en componentes de wizard requiere QA manual" se interpreta extensivamente para feature nueva en `OrdenEditForm.tsx` (lista crítica del archivist). El coordinator NO puede ejecutar QA visual; registra acá lo que el humano debe verificar.

**Casos a validar manualmente (cuando Jorge o cualquier humano abra la app post-deploy):**

1. **Caso primario — Aury Mon / Wilainy** (el bug original que motivó el sprint):
   - Abrir `/admin/ordenes` → buscar una orden de Aury Mon que aparezca sin operaria.
   - Hacer click en "Editar" en el modal de detalle.
   - En la sección Programación, debajo del dropdown de Técnico, debe aparecer un banner amber con texto tipo "Esta orden no tiene operaria asignada. El técnico hoy reporta a Wilainy." y un botón púrpura "Re-sincronizar operaria".
   - Click en el botón → confirm dialog → aceptar.
   - Toast verde "Operaria sincronizada: Wilainy". El doc en Firestore debe quedar con `operariaNombre: "Wilainy"` y un registro de auditoría `campo: 'operariaId'` con detalle "Asignó operaria...".

2. **Estado "sincronizada":** abrir cualquier orden cuya operaria YA coincide con la del técnico. El botón debe aparecer disabled emerald con texto "Sincronizada" + tooltip.

3. **Estado "sin operaria":** abrir una orden de un técnico sin operaria asignada en Personal. El botón debe aparecer disabled gris con texto "Sin operaria" + mensaje amber "Asigná operaria al técnico en Personal primero.".

4. **Estado oculto:** abrir una orden sin técnico asignado. NO debe aparecer el botón.

5. **No regresión:** confirmar que el dropdown de Técnico, los avisos "Grupo: X" / "Esta orden pasará al grupo de X" siguen funcionando como antes (cambio NO afectó el flujo derivativo del create/edit normal).

**Si algún caso falla:** reportar a Cowork con captura. Cowork agregará SPRINT-130-FIX a la cola con detalle.

**Si todos pasan:** Jorge edita esta sección con `OK: jorge YYYY-MM-DD HH:MM — QA visual OK` y la podemos archivar.

---

## SPRINT-115 fase write — SUPERADO por SPRINT-118 (re-migración masiva acotada a 5 empleados)

Conservado en histórico. El alcance original (3 notis de Yohana) queda absorbido por el OK más amplio abajo.

---

## SPRINT-118 — Re-migración masiva notis legacy + fix email Wilainy en Auth — DESBLOQUEADO

**OK:** jorge 2026-05-08 (vía conversación Cowork tras auditoría con `scripts/auditoria-notis-legacy-todos.ts` + `scripts/auditoria-emails-personal-vs-usuarios.ts`).

**Movido a COLA_AUTONOMA.md como PENDIENTE el 2026-05-08 por coordinator (procesa bloqueos). desbloqueadoPor: jorge 2026-05-08.**

Conservado acá para histórico. NO procesar desde acá — la entrada activa está en `COLA_AUTONOMA.md`.

### Fase 1 — Re-migración de notis legacy (5 empleados, ~44 docs)

**Scope autorizado** (acotado por uid, NO masivo a toda la colección):

| Empleado | uid | personalDocId | Notis Caso A |
|---|---|---|---|
| Yohana Operaria | `HGkVoYpGKzL4JJI7FnTpHjdsM972` | `zFhokrDoPH9lD63ZxKAY` | 3 (de diagnóstico previo) |
| Wilainy Operaria | `KT9LaszokWNmLCEIe8YOvNKc9rF3` | `j944265Su9Hyw29YQTj8` | 14 |
| Jorge (admin) | `dN2wxlTrLUMAff1gE2K4Q8IXi2m2` | `63ZMIT2LouKFLpBCQLUk` | 9 |
| misterservicerd (admin) | `kAKPMRLe8aaAJxCrvyc8YeMoxRG3` | `GqJfIoRgP4GJTAActUKy` | 9 |
| Maria Teresa (coord) | `HgakSUkclXSyxmBeLm3GkayFOK63` | `NXFORv7bqeksSg980icg` | 9 |

**IDs específicos de docs Caso A** (output exacto del script `auditoria-notis-legacy-todos.ts` ejecutado el 2026-05-08):

- **Yohana** (3): `F9BV32k4JEoEOk97K4xc`, `TVwtOtmNlzW334IUIUdF`, `VWjdYBRmKgU8rGPlbJAv` (de diagnóstico anterior — el script general los cuenta como ok porque encuentra match con personalDocId, pero Yohana NO los ve en su campanita).
- **Wilainy** (14): `2tPkAmQymtZgMLRRQfTr`, `451UPKpR2vAmsCpsoFNv`, `8WdJHYbEYdZ4wUc4eQnE`, `BgAsQHZMPEfa3LL8ffyV`, `DpQh90B38dmVjSEJVxFv`, `ERtDuPDxeUXph8b8cSNv`, `FMnk6RpFQyxiYRiKZQln`, `JHa0TPJpGVH3OpzPPlV1`, `PFRnT9GuahrydO8g8Hhz`, `Q2Z0pBdjwo6vyK04koPZ`, `SV5DhnuxPwEOCwBwNt2t`, `vKdH6Q9dLRRYQZFUolNY`, `vfbmwla7698GcANVUShS`, `zWWMGk1UFV75sAjaOoVu`.
- **Jorge** (9): `5CZ6039fqvtRyGpiNseM`, `cWDqvmuXpFJptULZ3eOD`, `fjW4YYIq74MtaneORrCD`, `gzSt5SBjTJBRmDmB1rUq`, `lFOU7YDdREy6Rauyyp0q`, `xBUxbB10ocEH2kjLADIl`, `zisaxTDaX1vGmj6Cq9mu`, `3hV65FcsI4HJ3Q0nc4Dv`, `o5yco816RhNGwquDv8P1`.
- **misterservicerd** (9): `4WEMXrqqrAZyoxd7CfQs`, `RXpcWGzERPpfnhc8IwcR`, `WMansj9afOAJcFJbTvuH`, `eFKbcOHszof28K3NVL9s`, `k8dH5RIfMKeBx3QDHagB`, `uRyZuUceQPnSgPBqNgtV`, `xpZLRggHAA8goPfJ1Vhf`, `SZe4ymcOeFWDgH9WFZDj`, `T477a42VXV0oguzrZcTh`.
- **Maria Teresa** (9): `DUZFo0j9pXuKL6oRYPZn`, `DVnPHlYFH838E0xbOVWt`, `LZKL5vbYCoUY4eueQOmW`, `Oyz2NElDajHl2jDOlnD9`, `jU1r9gmKH1oDBQPSMeXG`, `pEwGvpvP0Fo8BUhf2Npc`, `zv8qZ3oq97AXsaPKOCai`, `XqrPkWoGtK65EGrf6yx0`, `rrtigrKrsHyJgNKrprTX`.

**Acción autorizada al builder:**

1. Generalizar `scripts/re-migrar-notificaciones-yohana.ts` → nuevo script `scripts/re-migrar-notificaciones-masivo.ts`.
2. Scope hardcodeado a los 5 uids listados arriba (NO masivo a toda la colección).
3. Para cada doc de la lista de IDs autorizados:
   - `update` que setea `userId = <uid correspondiente>`.
   - Idempotencia: si `userId` ya es ese valor, skip.
4. NO tocar `destinatarioId` (la lectura dual del service ya lo soporta).
5. NO tocar otros campos (leida, leidaEn, tipo, titulo, descripcion).
6. Logear cada doc tocado con shape antes/después en stdout.
7. DRY-RUN por default; `--apply` explícito requerido.
8. Después de ejecución real, escribir entrada en `auditoria_admin` con `accion: 'remigracion_notificaciones_masivo'`, `actorUid`, `docsAfectados: [44 ids]`, `empleadosAfectados: [5 uids]`.

### Fase 2 — Fix email Wilainy en Firebase Auth

**Email correcto confirmado por Jorge:** `Nwilainy@gmail.com` (con N mayúscula).

**Estado actual:**
- `personal/{j944265Su9Hyw29YQTj8}.email` = `Nwilainy@gmail.com` ✓ (ya correcto, no tocar).
- `usuarios/{KT9LaszokWNmLCEIe8YOvNKc9rF3}.email` = `apnbrito0318@gmail.com` (incorrecto).
- Firebase Auth `users/{KT9LaszokWNmLCEIe8YOvNKc9rF3}.email` = `apnbrito0318@gmail.com` (incorrecto).

**Acción autorizada al builder:**

1. Crear `scripts/fix-email-wilainy.ts` con Admin SDK.
2. Operaciones:
   - `admin.auth().updateUser(uid, { email: 'Nwilainy@gmail.com' })`.
   - `usuarios/{uid}.email` setear a `Nwilainy@gmail.com`.
3. NO tocar contraseña, NO crear nuevo user, NO eliminar el viejo.
4. Audit log en `auditoria_admin`.
5. **Wilainy debe tener acceso a la casilla `Nwilainy@gmail.com` para resets de contraseña futuros**. Jorge confirmó este punto.
6. DRY-RUN por default; `--apply` explícito requerido.

### Restricciones globales

- Cada fase tiene script propio. Builder los entrega ambos en el mismo sprint.
- Coordinator NO ejecuta `--apply` autónomo. Jorge corre dry-run primero, después decide si aplicar.
- Después de ejecución real, validación humana:
  - Yohana, Wilainy, Maria Teresa hacen hard refresh y reportan que ven sus notificaciones nuevas.
  - Jorge intenta cambiar contraseña de Wilainy desde GestionUsuarios y confirma que ya no tira "no existe usuario".
- Postmortem obligatorio (sub-regla CLAUDE.md "cada bug → cazador" + "5+ empleados afectados"). Builder genera `docs/postmortems/2026-05-08-notis-legacy-multiples-empleados.md`.
- Considerar agregar P-XXX nuevo al catálogo: "notificaciones legacy con userId/destinatarioId apuntando a personalDocId en lugar de auth.uid". Cazador difícil porque es bug de datos, no de código — pero el cazador puede ser un script de health-check periódico (ej: `npm run audit:notis-legacy` que corre la auditoría general y avisa si aparecen nuevos casos).

### NO autorizado (requiere OK separado)

- Migrar notificaciones de OTROS usuarios fuera de los 5 listados.
- Tocar `firestore.rules` (si encuentra rule gap durante el fix, escalar a Jorge).
- Borrar notis o cambiar campos no listados.
- Hacer cambio de email para usuarios distintos a Wilainy.

---

## SPRINT-128 — DESBLOQUEADO 2026-05-10 (OK: jorge vía Cowork — ruta R2)

**Movido a "Histórico de desbloqueos" abajo el 2026-05-10 por coordinator (procesa bloqueos, pasada 7). Aplicado en el commit del sprint. Conservado acá como stub para forensia.**

OK humano: `jorge 2026-05-10 vía Cowork` ("puedes corregir las reglas tu por favor"). Ruta elegida: R2 (alinear rule a granular).

Acción aplicada: `firestore.rules:369` cambió de `allow delete: if esAdminOCoord();` a `allow delete: if isAuth() && userData().permisos.ordenesEliminar == true;` (usando el helper `userData()` ya definido en línea 62 del archivo). `npm run deploy:rules` ejecutado el mismo día (lock `29247a9...`). Matriz #14 RESUELTO. Spec original íntegro preservado en el histórico de la entrada SPRINT-128 en `COLA_AUTONOMA.md` y en la sección "Histórico de desbloqueos" abajo.

---

## SPRINT-117c — DESBLOQUEADO 2026-05-09 (OK selectivo: 5 de 6 sub-sprints)

**Movido a `COLA_AUTONOMA.md` como PENDIENTE el 2026-05-09 por coordinator (procesa bloqueos). desbloqueadoPor: jorge 2026-05-09.**

Conservado acá para histórico. NO procesar desde acá — las entradas activas (117c1, 117c2, 117c3, 117c4, 117c6) están en `COLA_AUTONOMA.md`. SPRINT-117c5 marcado RECHAZADO con motivo abajo.

<details>
<summary>Spec original + decisión humana (preservada para forensia)</summary>

**Bloqueado originalmente:** coordinator 2026-05-08 (cierre de SPRINT-117b). Espera revisión de la propuesta documentada en `docs/sprints/PROPUESTA_IA_2026-05-08.md`.

**Resumen 60 segundos:**
- 6 sub-sprints 117c1..c6, cada uno con touch-list de 1-3 archivos máximo, plan de rollback y riesgo bajo.
- Reduce sidebar admin de 44 a ~32 ítems, operaria de 17 a ~10, secretaria de 13 a ~8.
- Sin tocar identificadores internos. Sin tocar `TecnicoVista`. Sin tocar `firestore.rules`.
- 4 preguntas abiertas en §6 de la propuesta — opcionales (hay defaults razonables).

**OK selectivo: jorge 2026-05-09 | sub-sprints aprobados: 117c1, 117c2, 117c3, 117c4, 117c6**
**RECHAZADO: jorge 2026-05-09 | sub-sprint: 117c5**

**Motivo del descarte de 117c5:** ese sub-sprint ocultaba ítems del sidebar basándose en el rol (operaria/secretaria). Eso pisa el sistema de permisos individuales que Jorge ya maneja desde el módulo de Usuarios — donde se da o quita acceso a cada módulo persona por persona según su función. Reorganizar el sidebar es OK porque solo cambia agrupación visual de los ítems a los que el empleado YA tiene acceso. Pero ocultar por rol introduce una segunda capa de gating que choca con la fuente de verdad existente (`usuarios/{uid}.permisos.*`).

**Defaults aceptados de las preguntas abiertas (§6 de la propuesta):**
1. Métricas del Mes como pestaña dentro de Rendimiento → sprint propio futuro (NO en 117c).
2. Etiqueta "Bandeja de entrada" → OK.
3. Mapa de Rutas para operaria → no aplica (gating sigue siendo el de Usuarios, no el del rol).
4. Catálogo legacy (`/admin/productos`) en sidebar admin → ocultar en 117c1, eliminar del routing en sprint propio futuro.

**Recordatorio explícito al builder:** TODO ítem del sidebar debe seguir respetando los permisos individuales que vienen de `usuarios/{uid}.permisos.*`. La reorganización SOLO agrupa y renombra etiquetas. NO agrega lógica de "este ítem se oculta si rol === X". Si un empleado tiene permiso para un módulo, lo ve. Si no, no lo ve. Esto ya funciona así hoy y no se cambia.

**Restricciones reiteradas:** archivist obligatorio PRE-CHANGE en cada sub-sprint, regression_guardian antes de commit, QA visual con Aury/Wilainy/Yohana después de cada deploy.

</details>

---

## SPRINT-112-QA — QA manual de la matriz de permisos (sub-sprint humano)

**Origen:** SPRINT-112 fase documental procesada autónoma 2026-05-10. La matriz `docs/MATRIZ_PERMISOS.md` declara 27 flujos × 6 roles = **162 celdas**. Cada celda ≠ ✗ requiere validación con un usuario real del rol correspondiente.

**Por qué BLOQUEADO:** requiere humano. El coordinator no puede autenticar como cada rol en producción ni operar la UI físicamente.

**Esfuerzo:** ~2 horas con accesos por rol y un setup de pruebas controlado.

**Riesgo de no hacerlo:** los gaps detectados en la sección B (eliminar orden #14 inconsistente UI vs rule, ver eliminadas #15 no testeada, secretaria + trabajo realizado #8 sin verificar) quedan latentes. Probabilidad de bug en producción si una operaria intenta eliminar: alta (sin diagnóstico la operaria intenta y "no pasa nada").

**Cómo desbloquear:**

1. Jorge agenda 2h con Yohana (operaria) + Aury (técnico) + Wilainy (operaria) + secretaria activa.
2. Para cada celda ≠ ✗ de la tabla principal: intentar la acción, anotar resultado en una columna nueva del doc `QA_RESULT` con valores: `OK` / `permission-denied` / `no-aparece-UI` / `error-otro`.
3. Si aparecen inconsistencias UI ↔ rule (UI deja, rule rechaza): abrir sprint propio por celda fallida.
4. Marcar este sub-sprint COMPLETADO en `EJECUCION_AUTONOMA.md` con timestamp + nombre del operador humano.

**Comando de desbloqueo:** N/A. Es trabajo humano puro. Cuando esté hecho, Jorge le dice a Cowork "QA matriz hecho" y Cowork mueve a histórico.

---

## Histórico de desbloqueos

- **SPRINT-115 fase write (re-migración Yohana):** desbloqueado por jorge 2026-05-08, movido a `COLA_AUTONOMA.md` por coordinator 2026-05-08 (cuarta pasada). Re-pausado por jorge mismo día (ver entrada activa arriba). Conservado para histórico.
- **SPRINT-118 (re-migración masiva 5 empleados + fix email Wilainy):** desbloqueado por jorge 2026-05-08, movido a `COLA_AUTONOMA.md` por coordinator 2026-05-08 (`procesa bloqueos`). Restricción del sprint conservada: el coordinator entrega scripts en DRY-RUN; Jorge ejecuta dry-run y `--apply` manualmente.
- **SPRINT-117c (reorganización IA del sidebar):** desbloqueado por jorge 2026-05-09 con OK selectivo (5 de 6 sub-sprints). 117c1, 117c2, 117c3, 117c4, 117c6 movidos a `COLA_AUTONOMA.md` como PENDIENTE. 117c5 marcado RECHAZADO con motivo (chocaba con sistema de permisos individuales). Coordinator procesa uno por uno con QA visual humana entre cada deploy — restricción explícita del spec original.
- **SPRINT-135a-UI (countdown público + input período en wizard cierre):** desbloqueado por jorge 2026-05-11 18:25 con `scope: ambos` (autoriza tanto endpoint público `api/garantia/[token].ts` como wizard de cierre `CierreServicioWizard.tsx`). Movido a `COLA_AUTONOMA.md` como PENDIENTE el 2026-05-11 por coordinator (`procesa bloqueos`, pasada 7). Spec íntegro preservado en bloque colapsado arriba para forensia.
- **SPRINT-149 (completar migración `operariaId` a `auth.uid`):** desbloqueado por jorge 2026-05-12 vía "ambos en orden, 149 primero". Movido a `COLA_AUTONOMA.md` como PENDIENTE el 2026-05-12 por coordinator (pasada 12). Restricciones del sprint conservadas: archivist PRE-CHANGE obligatorio, reviewer obligatorio (riesgo financiero — nómina), regression_guardian obligatorio. `--apply` del script de migración NO se ejecuta autónomo — queda en `BLOQUEOS.md` como entrada nueva una vez el coordinator termine el fix de código. Spec íntegro preservado en bloque colapsado arriba para forensia.
- **SPRINT-128 (alinear rule `ordenes_servicio.delete` al granular `ordenesEliminar`):** desbloqueado por jorge 2026-05-10 vía Cowork ("puedes corregir las reglas tu por favor"). Procesado por coordinator el mismo día (`procesa bloqueos`, pasada 7) — ruta R2 ejecutada en un solo commit con archivist PRE-CHANGE auto, regression_guardian PASS, reviewer APPROVED con foco rules, deploy de rules ejecutado (lock `29247a9ac037fdc9a7398db716a15c31521a905e7438e8b857d95b12440561c6`, deployedAt `2026-05-10T23:03:57.139Z`), matriz `docs/MATRIZ_PERMISOS.md` #14 marcado RESUELTO. Cambio de 1 línea funcional + 9 líneas de comentario explicativo en `firestore.rules:369`. Sin commit follow-up (todo en un commit). Sin sprints colaterales abiertos. Spec original (R1 vs R2, criterios de aceptación detallados, riesgos R2) preservado a continuación para forensia:

<details>
<summary>Spec original SPRINT-128 (preservado para forensia)</summary>

**Bloqueado originalmente por:** coordinator 2026-05-10 (autónomo `trabaja`, pasada 6). Builder evaluó R1 vs R2 y concluyó que R1 era no-op (default `false` ya, heredado de `TODO_FALSE`, ver `src/types/index.ts:1267` `PERMISOS_DEFAULT_OPERARIA` sin override) y el verdadero fix era R2.

**Hallazgo colateral durante auditoría:** la matriz `docs/MATRIZ_PERMISOS.md` línea 61 + 92 decía erróneamente "default operaria `ordenesEliminar=true`". Corregido en commit del bloqueo (pasada 6). Información correcta: default es `false`; la inconsistencia solo se manifiesta si admin activa el granular persona-por-persona en el modal.

**Por qué R2 (no R1):**
- R1 (cambiar default a `false`) era no-op — ya era `false`.
- R2 (ampliar la rule a `puede('ordenesEliminar')`) alinea con la regla declarada de Jorge: "los permisos se controlan desde Usuarios y Permisos". Sin R2 el checkbox `ordenesEliminar` del modal era engañoso para roles operaria/secretaria: si Jorge lo activaba, la operaria veía el botón pero la rule rechazaba.

**Acción autorizada (aplicada):**
1. Editar `firestore.rules` línea 369: reemplazar `allow delete: if esAdminOCoord();` por `allow delete: if isAuth() && userData().permisos.ordenesEliminar == true;` (la versión final usa el helper `userData()` ya definido en línea 62, más conciso que reescribir el `get(/databases/...)` literal).
2. Ejecutar `npm run deploy:rules` ANTES de commitear (sub-regla P-005 lock).
3. Validación humana NO requerida inmediatamente — el delete sigue siendo soft (recuperable vía `eliminada=true`), reviewer ya validó la rule, y por defecto operarias tienen `false`. Validación natural: cuando Jorge active el permiso para alguien por primera vez, comprobar que esa persona puede borrar.
4. Reviewer obligatorio con foco en rules (sub-regla "reviewer obligatorio cuando sprint toca firestore.rules").
5. Update `firestore.rules.deployed.lock` automáticamente vía `deploy:rules`.
6. Actualizar `docs/MATRIZ_PERMISOS.md` sección "Inconsistencias detectadas" marcando #14 como RESUELTO con ruta R2.
7. Cazadores 7/7 PASS al cerrar (8/8 si se cuenta P-008 de datos, pero P-008 es on-demand fuera de pre-commit).

**Riesgo de R2 (preservado para postmortem futuro si aplica):**
- La rule pasa de validación por rol (estática, conocida) a validación por permiso granular (lookup de `usuarios/{uid}`). Es +1 `get()` por delete request, costo aceptable (además ya estaba implícito en `esAdminOCoord` que también consulta `userData()`).
- Si un admin se equivoca y le da `ordenesEliminar=true` a una operaria que no debería, esa operaria podrá borrar órdenes. Mitigación: el delete es soft-delete via `eliminada=true` según la nota del rule en línea 367-368 — recuperable.
- Postmortem leído antes del deploy: `docs/postmortems/2026-05-07-iniciar-chequeo-rules-sin-deploy.md` (sub-regla P-005). Lección aplicada: `npm run deploy:rules` ejecutado ANTES del commit, lock actualizado.

**Restricción explícita honrada:** NO se hicieron cambios adicionales al `firestore.rules` en el mismo commit. Solo la línea 369 + comentarios explicativos arriba. Las inconsistencias #15 (papelera operaria) y #8 (secretaria + trabajo realizado) siguen abiertas en `BLOQUEOS.md` SPRINT-112-QA como QA humano puro.

</details>
