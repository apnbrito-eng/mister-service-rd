# Sprint: consolidar counters de facturas — eliminar duplicación interna

## Contexto actualizado (2026-04-30)

Jorge aclaró que el conduce de garantía es **registro contable INTERNO**, NO DGII. Los reportes 606/607 (sprint #68) van por otro lado. Entonces NO hay riesgo fiscal, solo riesgo de **trazabilidad interna** y deuda técnica.

## Riesgo (descripción correcta del bug)

Existen **dos páginas activas** generando "Conduces de Garantía" con sistemas distintos:

| Página | Ruta | Counter | Prefijo emitido | Estado |
|---|---|---|---|---|
| **`Facturas.tsx`** | `/admin/facturas` | `counters/facturas.count` | `FAC-####` | Activa (sidebar muestra "Conduces de Garantía") |
| **`FacturacionPendiente.tsx`** | `/admin/facturacion-pendiente` | `config/contadores.ultimaFactura` | `CG-####` | Activa (flujo principal post-cierre orden) |

Ambas activas. Ambas con permisos (`facturasVer/Crear/Modificar/Eliminar`). Ambas siguiendo `runTransaction` correctamente, **pero contra counters distintos**.

**Impacto:**

1. **Inconsistencia visual**: Sidebar dice "Conduces de Garantía" pero `Facturas.tsx` emite `FAC-####` y `FacturacionPendiente.tsx` emite `CG-####`. Documentos del mismo tipo, prefijos distintos. Confunde a admin.
2. **Colisión numérica**: ambos sistemas pueden emitir simultáneamente `FAC-0042` y `CG-0042` (mismo número, prefijos distintos). En reportes internos cruzados, parece duplicado.
3. **Mantenimiento**: dos counters significa que hay que sincronizar manualmente si se quiere unificar después.
4. **Reportes internos rotos**: si Jorge exporta a Excel/contador externo, los `FAC-` y `CG-` quedan como series independientes, confundiendo el control contable.

**No es bloqueante hoy** (los flujos no se cruzan operativamente — `Facturas.tsx` parece usarse para casos especiales mientras `FacturacionPendiente.tsx` es el flujo automático post-cierre). Pero es deuda técnica que crece.

## Investigación previa (ya hecha desde Cowork 2026-04-30)

Confirmado:

- ✅ `Facturas.tsx` ESTÁ en uso (Sidebar.tsx:192, App.tsx:192, permisos activos en types/index.ts).
- ✅ `getNextNumero()` (Facturas.tsx:173-187) usa `counters/facturas.count` — counter legacy.
- ✅ `FacturacionPendiente.tsx` consume `siguienteNumeroFactura()` del servicio oficial (`contadores.service.ts:38-50`).
- ✅ Existe `Cotizaciones.tsx:33` con `puedeFacturar = puede(userProfile, 'facturasCrear')` — algunos usuarios pueden facturar desde cotización (otro flujo más).
- ⚠️ El servicio oficial emite `CG-####` (línea 49). El legacy en `utils/index.ts:397` emite `FAC-####`. Cambiar el legacy implica cambiar el prefijo emitido.

## Fix recomendado: refactor `Facturas.tsx` para usar counter oficial

**No eliminar la página** (está en uso). En vez:

### Cambios en `src/pages/Facturas.tsx`

1. **Importar `siguienteNumeroFactura()`** de `contadores.service.ts`.
2. **Eliminar `getNextNumero()`** (líneas 173-187) y la función helper en `utils/index.ts:397`.
3. **Reemplazar la llamada local por `await siguienteNumeroFactura()`**.
4. **El número devuelto ahora viene como `CG-####`** (no `FAC-####`). Eso es lo correcto — la sidebar dice "Conduces de Garantía" así que el prefijo debe ser `CG-`.

### Cambios en `firestore.rules`

Si `counters/facturas` queda sin lectores ni escritores después del refactor, eliminar la rule `match /counters/{docId}` (líneas 358-361). Cleanup de superficie de ataque.

Verificar antes de borrar:

```bash
grep -rn "'counters'" src/ api/
grep -rn "\"counters\"" src/ api/
```

Si retorna solo `Facturas.tsx` (que ya estará refactorizado), borrar la rule.

### Migración del counter (script one-shot)

Antes de switchear el flujo, alinear `config/contadores.ultimaFactura` al máximo de ambos para que los nuevos números no choquen con ningún CG- ni FAC- ya emitido.

```typescript
// scripts/consolidar-counter-facturas.ts
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../src/firebase/config';

async function main() {
  const legacyRef = doc(db, 'counters', 'facturas');
  const oficialRef = doc(db, 'config', 'contadores');

  const legacy = await getDoc(legacyRef);
  const oficial = await getDoc(oficialRef);

  const maxLegacy = legacy.exists() ? (legacy.data().count ?? 0) : 0;
  const maxOficial = oficial.exists() ? (oficial.data().ultimaFactura ?? 0) : 0;
  const consolidado = Math.max(maxLegacy, maxOficial);

  if (consolidado > maxOficial) {
    await updateDoc(oficialRef, { ultimaFactura: consolidado });
    console.log(`Consolidado: ${maxOficial} → ${consolidado} (legacy era ${maxLegacy})`);
  } else {
    console.log(`No requiere ajuste. Oficial=${maxOficial}, Legacy=${maxLegacy}`);
  }
}

main().catch(console.error);
```

Idempotente. Correr **antes** del refactor. Output esperado:

```
Consolidado: 47 → 73 (legacy era 73)
```

O `No requiere ajuste` si `oficial >= legacy`.

### Documentos históricos con `FAC-####` en colección `facturas`

**No tocar.** Son legítimos. Solo el flujo de **generación nueva** se consolida. Reportes y vistas siguen mostrando los `FAC-####` viejos junto con los `CG-####` nuevos. Eso es esperado.

Si querés normalizar visualmente (todos como CG-), eso es un sprint separado de migración de data — costoso y arriesgado, no recomendado.

## Verificación

**Tester:**

1. Correr el script de consolidación. Verificar que el counter oficial es ≥ al legacy.
2. Abrir `/admin/facturas` → crear nuevo conduce → verificar que el número generado es `CG-####` (no `FAC-####`).
3. Abrir `/admin/facturacion-pendiente` → emitir conduce desde una orden → verificar que el número es secuencial al anterior (no se repite).
4. Crear 5 conduces consecutivos alternando entre las 2 páginas → verificar números secuenciales.
5. Test de concurrencia: 2 tabs abiertas, una en cada página, click "emitir" al mismo segundo → verificar que generan 2 números distintos secuenciales (la transacción del servicio oficial garantiza esto).
6. Verificar que documentos viejos con `FAC-####` siguen visibles y no se modifican.

**Reviewer:**

- `Facturas.tsx` no tiene código muerto post-refactor (no quedan referencias a `counters/facturas`, `getNextNumero`, `generateNumeroFactura`).
- `firestore.rules` no expone `match /counters` si la colección queda sin uso.
- `utils/index.ts:397` borrado o documentado como deprecated.
- El refactor preserva la UX existente — el usuario admin no nota cambio en la página, solo el prefijo del número emitido.
- Strip undefined antes de Firestore writes (defensivo).

## Alcance

- Refactor `Facturas.tsx` + helper `utils/index.ts`: ~30 min.
- Script consolidación: ~15 min (corre 1 vez).
- Cleanup `firestore.rules`: ~5 min.
- Tester + Reviewer: 30 min cada uno.

Total estimado: **~2 horas**.

## Commit message sugerido

```
fix(audit): consolidar counters de facturas en sistema oficial CG-

Antes habia dos paginas activas generando "Conduces de Garantia" con
counters distintos:

- Facturas.tsx: counters/facturas.count, prefijo FAC-####
- FacturacionPendiente.tsx: config/contadores.ultimaFactura, prefijo CG-####

Ambas activas, ambas con permisos. Si dos admins emitian
simultaneamente desde rutas distintas, los numeros podian colisionar
internamente (FAC-0042 y CG-0042 distintos). El sidebar mostraba
"Conduces de Garantia" para ambas, lo que era inconsistente con el
prefijo FAC- emitido por una de ellas.

Cambios:
- Facturas.tsx ahora usa siguienteNumeroFactura() del servicio oficial,
  emitiendo CG-#### consistente con el resto del sistema.
- Eliminada la funcion local getNextNumero() y el helper
  generateNumeroFactura() en utils/index.ts.
- Eliminada la rule match /counters en firestore.rules (la coleccion
  queda sin uso, cleanup de superficie de ataque).
- Script one-shot scripts/consolidar-counter-facturas.ts ejecutado
  antes del refactor: alinea config/contadores.ultimaFactura al max
  entre legacy y oficial para evitar emision de numeros menores.

Documentos historicos con prefijo FAC- en la coleccion facturas se
preservan (no se modifican, son legitimos pre-refactor).

Sin cambios visibles para admin/coord salvo que los nuevos numeros
emitidos desde /admin/facturas ahora son CG- en vez de FAC-.

NO hay impacto DGII (los conduces son registro contable interno, no
fiscal). Los reportes 606/607 leen desde otra fuente.
```

## Ante cualquier ambigüedad

- Si admin/coord prefiere mantener prefijo FAC- en `/admin/facturas` (porque es un flujo distinto a `/admin/facturacion-pendiente`), agregar parámetro al servicio oficial:
  ```typescript
  siguienteNumeroFactura(prefijo: 'CG' | 'FAC' = 'CG'): Promise<string>
  ```
  Pero **mantener un solo counter** (`config/contadores.ultimaFactura`). Eso resuelve la colisión sin perder distinción visual entre flujos. Validar con Jorge si lo prefiere así.
- Si `counters/facturas` tiene data antigua que nadie consulta, dejar la colección como está (no hace falta borrar el doc — solo dejar de escribirla). La rule sí se puede borrar.
- Si después de unificar se quiere distinguir el origen del conduce (página `/facturas` vs flujo automático post-cierre), usar un campo separado en el doc `facturas` (`origen: 'manual' | 'auto-cierre'`) en vez de prefijos distintos.
