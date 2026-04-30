# Sprint: consolidar counters de facturas — PRIORIDAD ALTA

## Riesgo (por qué es alta prioridad)

Existen **dos sistemas paralelos** generando números de conduce/factura
contra **dos colecciones distintas**:

| Sistema | Archivo | Colección counter | Campo | Prefijo emitido |
|---|---|---|---|---|
| **Oficial** | `src/services/contadores.service.ts:38-50` | `config/contadores` | `ultimaFactura` | `CG-####` (conduce de garantía) |
| **Legacy** | `src/pages/Facturas.tsx:173-187` | `counters/facturas` | `count` | `FAC-####` (factura) |

Ambos usan `runTransaction` correctamente, pero **operan en counters
divergentes**. Si `Facturas.tsx` y `FacturacionPendiente.tsx` emiten
documentos al mismo tiempo, los rangos numéricos pueden colisionar:
ambas pueden producir `CG-0042` y `FAC-0042` como números distintos
referidos a operaciones distintas.

## Impacto fiscal / DGII

Esto **rompe trazabilidad fiscal**:

- Si dos sistemas pueden emitir el mismo número con prefijos distintos,
  cualquier auditoría externa (DGII, contador externo) ve duplicados
  aparentes.
- Si el sistema migra todo a un único prefijo en el futuro (ej: `CG-`
  unificado), las series quedan colisionando entre sí.
- Si se exporta a contabilidad externa (xls, ERP), los números
  duplicados causan referencias rotas.

**No es bloqueante hoy** porque los prefijos son distintos (`CG-` vs
`FAC-`) y los flujos no se cruzan operativamente, pero es deuda que
crece — cada nueva factura legacy emitida desde `Facturas.tsx` aleja
la posibilidad de unificar.

## Investigación previa

Antes de tocar código:

1. **Leer `src/pages/Facturas.tsx`** completo. ¿Sigue en uso? ¿O fue
   reemplazado por `FacturacionPendiente.tsx`? (commit `43f2ef2`
   renombró "Facturas Emitidas" a "Conduces Emitidos" — sugiere que
   el flujo oficial es CG, no FAC).
2. **¿Quién consume `Facturas.tsx`?** Buscar links/rutas que apunten
   ahí. Si la página está deprecada y nadie la usa en prod, la fix
   más simple es **borrar `Facturas.tsx` y la ruta**.
3. **`counters/facturas`** ¿tiene data legacy? ¿Cuál es el último número
   emitido? Compararlo contra `config/contadores.ultimaFactura`. Si
   están desincronizados, hay que alinearlos.
4. **¿Hay facturas históricas con prefijo `FAC-` en la colección
   `facturas`?** Si sí, son docs legítimos que no se deben tocar.
   Solo el flujo de generación tiene que consolidarse.

## Fix recomendado

**Opción A — Eliminar `Facturas.tsx` (si está deprecada):**
- Borrar la página y la ruta en `App.tsx`.
- Borrar la rule de `counters` en `firestore.rules` si no la usa nadie
  más (líneas 358-361 son para esto). Verificar no haya otros consumers.
- Migrar el counter `counters/facturas.count` a `config/contadores.ultimaFactura`
  tomando el max de ambos.

**Opción B — Si `Facturas.tsx` está en uso:**
- Reemplazar `getNextNumero()` (líneas 173-187) por una llamada a
  `siguienteNumeroFactura()` del servicio oficial.
- Eliminar la lectura/escritura a `counters/facturas`.
- Si los prefijos son intencionalmente distintos (`FAC-` vs `CG-`),
  agregar una función separada en el servicio (ej:
  `siguienteNumeroFacturaLegacy()`) que use el mismo doc oficial pero
  emita prefijo distinto. Pero **la fuente del número debe ser una sola**.

**Opción C — Mantener ambos pero documentar:**
- Agregar comment grande en ambos archivos explicando que son sistemas
  paralelos por razón histórica.
- Garantizar que nunca emitan docs simultáneamente (ej: feature flag).

Recomendación fuerte: **A o B**. C es deuda que se pudre.

## Verificación

Tester:
- Si Opción A: confirmar que `/facturas` o ruta equivalente devuelve 404
  o redirige a `/admin/facturacion-pendiente`.
- Si Opción B: emitir factura desde Facturas.tsx, emitir conduce desde
  FacturacionPendiente.tsx, confirmar que los números son secuenciales
  (no se repiten) y que ambos vienen del counter oficial.
- En ambos casos: correr `siguienteNumeroFactura()` 5 veces consecutivas
  desde la consola y verificar que devuelve `N, N+1, N+2, N+3, N+4`.

Reviewer:
- Si Opción A: verificar que no quedan referencias huérfanas a
  `Facturas.tsx`, `getNextNumero`, o `counters/facturas`.
- Si Opción B: la nueva función del servicio pasa por `runTransaction`
  y mantiene el patrón existente.
- En ambos: la rule `match /counters/{docId}` puede borrarse si la
  colección queda sin uso (cleanup de superficie de ataque).

## Migración del counter (si aplica)

Si `counters/facturas.count > config/contadores.ultimaFactura`, hay
que sincronizar antes de cortar el sistema legacy para no emitir
números menores que los ya emitidos:

```typescript
// Script one-shot scripts/consolidar-counter-facturas.ts
const legacy = await getDoc(doc(db, 'counters', 'facturas'));
const oficial = await getDoc(doc(db, 'config', 'contadores'));

const maxLegacy = legacy.exists() ? legacy.data().count : 0;
const maxOficial = oficial.exists() ? oficial.data().ultimaFactura : 0;
const consolidado = Math.max(maxLegacy, maxOficial);

await updateDoc(doc(db, 'config', 'contadores'), {
  ultimaFactura: consolidado,
});

console.log(`Counter consolidado en ${consolidado} (legacy=${maxLegacy}, oficial=${maxOficial})`);
```

Idempotente. Correr una vez antes del fix.

## Alcance

- Investigación previa: 30 min.
- Fix Opción A: ~30 min (eliminar página + ruta + rule + migración).
- Fix Opción B: ~1 hora (refactor a servicio + migración).
- Tester + Reviewer: 30 min cada uno.

Total estimado: 2-3 horas.

## Commit message sugerido (Opción A)

```
fix(audit): consolidar counters de facturas y eliminar Facturas.tsx legacy

Eliminamos el flujo legacy de Facturas.tsx que generaba numeros FAC-
contra counters/facturas.count, paralelo al sistema oficial CG- de
FacturacionPendiente.tsx contra config/contadores.ultimaFactura.

Riesgo cerrado: dos sistemas emitiendo numeros independientes podian
colisionar fiscalmente (DGII, auditorias externas, ERPs).

Cambios:
- Borrada src/pages/Facturas.tsx y su ruta en App.tsx.
- Borrada rule match /counters en firestore.rules (la coleccion queda
  vacia, sin lectores ni escritores).
- Script one-shot scripts/consolidar-counter-facturas.ts ejecutado:
  alinea config/contadores.ultimaFactura al max(legacy, oficial).

Documentos historicos con prefijo FAC- en la coleccion facturas se
preservan tal cual (no se modifican, son legitimos).
```
