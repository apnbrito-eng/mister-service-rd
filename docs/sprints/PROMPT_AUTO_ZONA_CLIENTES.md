# Sprint: auto-detectar zona del cliente desde coordenadas GPS

Usa el subagente coordinator.

## Bug a resolver

Hoy el módulo de clientes (`/admin/clientes`) muestra "Zona: No definida" para clientes que tienen coordenadas GPS válidas pero no tienen `cliente.zona` asignada manualmente. Esto afecta especialmente a los **9,094 clientes recién importados desde el calendar** (commit `48cda19`) que tienen lat/lng pero zona vacía.

La función `inferirZona(lat, lng)` en `src/utils/zonas.ts` ya existe y funciona — solo falta usarla en 3 lugares:

1. **UI fallback** — al renderizar la ficha, si `cliente.zona` no existe pero hay lat/lng, mostrar la zona inferida con indicador visual.
2. **Auto-asignar al crear/editar** — el service `crearCliente()` y `actualizarCliente()` deben llamar a `inferirZona()` y persistir el resultado si el admin no especificó una manual.
3. **Backfill de los 9k existentes** — script one-shot que recorre `clientes` y asigna zona donde falta.

## Cambios

### 1. UI — `src/pages/Clientes.tsx` línea 458-475

Cambiar el bloque de "Zona" para mostrar la zona inferida cuando no hay zona manual:

```tsx
const zonaEfectiva = selectedCliente.zona 
  || inferirZona(selectedCliente.lat, selectedCliente.lng);
const zonaEsAuto = !selectedCliente.zona && zonaEfectiva;

<div className="col-span-full flex items-center gap-2 text-sm">
  <span className="text-gray-600">Zona:</span>
  <span className={`font-medium ${zonaColor(zonaEfectiva)}`}>
    {zonaEfectiva || 'No definida'}
    {zonaEsAuto && (
      <span className="ml-1 text-[10px] text-gray-400 italic">(auto)</span>
    )}
  </span>
  {/* selector existente sigue igual */}
</div>
```

Importar `inferirZona` de `utils/zonas.ts`.

### 2. Lo mismo en `MapaRutas.tsx:947` y donde se muestre zona del cliente.

Aplicar el mismo patrón: usar `cliente.zona || inferirZona(cliente.lat, cliente.lng)`.

### 3. Service `src/services/clientes.service.ts`

En `crearCliente()` y `actualizarCliente()`, antes del write a Firestore:

```typescript
import { inferirZona } from '../utils/zonas';

// Auto-asignar zona si tenemos lat/lng pero no zona manual
if (!data.zona && typeof data.lat === 'number' && typeof data.lng === 'number') {
  const zonaInferida = inferirZona(data.lat, data.lng);
  if (zonaInferida) data.zona = zonaInferida;
}
```

Eso garantiza que **clientes nuevos creados desde admin** o desde el formulario público `/agendar` ya vienen con zona pre-asignada.

### 4. Script de backfill `scripts/backfill-zonas-clientes.ts`

```typescript
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// Auth: mismo patrón de los otros scripts (3 modos)

function inferirZona(lat?: number, lng?: number): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (isNaN(lat) || isNaN(lng)) return null;
  // Mismas reglas que utils/zonas.ts (copiar inline para no depender del bundle)
  if (lat >= 18.43 && lat <= 18.52 && lng >= -69.98 && lng <= -69.85) return 'Distrito Nacional';
  if (lat > 18.52 && lat <= 18.65 && lng >= -70.0 && lng <= -69.85) return 'Santo Domingo Norte';
  if (lat >= 18.43 && lat <= 18.6 && lng > -69.85 && lng <= -69.55) return 'Santo Domingo Este';
  if (lat >= 18.43 && lat <= 18.65 && lng > -70.2 && lng < -69.98) return 'Santo Domingo Oeste';
  if (lat >= 19.35 && lat <= 19.55 && lng >= -70.8 && lng <= -70.6) return 'Santiago';
  if (lat >= 19.15 && lat <= 19.35 && lng >= -70.6 && lng <= -70.4) return 'La Vega';
  if (lat >= 19.7 && lat <= 19.85 && lng >= -70.8 && lng <= -70.5) return 'Puerto Plata';
  if (lat >= 18.4 && lat <= 18.75 && lng >= -68.6 && lng <= -68.3) return 'Punta Cana';
  return 'Otro';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[INFO] Modo: ${dryRun ? 'DRY-RUN' : 'APLICAR'}`);
  
  // Auth (3 modos como los otros scripts)
  // ...
  
  const db = getFirestore();
  const snap = await db.collection('clientes').get();
  console.log(`[INFO] Total clientes en BD: ${snap.size}`);
  
  let asignados = 0, yaTenian = 0, sinCoords = 0, sinZona = 0;
  let batch = db.batch();
  let opsEnBatch = 0;
  
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.zona) { yaTenian++; continue; }
    if (typeof data.lat !== 'number' || typeof data.lng !== 'number') {
      sinCoords++; continue;
    }
    const zona = inferirZona(data.lat, data.lng);
    if (!zona) { sinZona++; continue; }
    
    if (!dryRun) {
      batch.update(doc.ref, { zona, updatedAt: FieldValue.serverTimestamp() });
      opsEnBatch++;
      if (opsEnBatch >= 400) {
        await batch.commit();
        console.log(`[OK] Batch comiteado: ${asignados + 1}/${snap.size}`);
        batch = db.batch();
        opsEnBatch = 0;
      }
    }
    asignados++;
  }
  
  if (!dryRun && opsEnBatch > 0) await batch.commit();
  
  console.log(`\n─── Resumen ───`);
  console.log(`Clientes con zona pre-existente: ${yaTenian}`);
  console.log(`Clientes sin coords (no se puede inferir): ${sinCoords}`);
  console.log(`Clientes sin zona detectable: ${sinZona}`);
  console.log(`Zonas ${dryRun ? 'que se asignarían' : 'asignadas'}: ${asignados}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Idempotente — re-correrlo no toca los que ya tienen zona.

## Verificación

**Tester:**

1. Abrir cliente con coords pero sin `cliente.zona` (ej: Gloria Taglia Ferro `8498626008`) → debería ver "Distrito Nacional (auto)" en gris cursiva.
2. Abrir cliente con `zona` manual seteada → ver el valor sin "(auto)".
3. Crear cliente nuevo desde admin con coords → al guardar, verificar que `zona` se persistió.
4. Correr `npx tsx scripts/backfill-zonas-clientes.ts --dry-run`. Esperar: ~9000 asignados, ~0 ya tenían, ~3000 sin coords (los que no se importaron con GPS).
5. Correr real: `npx tsx scripts/backfill-zonas-clientes.ts`.
6. Re-abrir Gloria Taglia Ferro → ahora debe mostrar "Distrito Nacional" sin "(auto)" (zona persistida).

**Reviewer:**

- `inferirZona` es idempotente — no cambia comportamiento de zonas ya asignadas.
- El indicador "(auto)" tiene contraste visual bajo para no distraer.
- Script respeta el batch limit de 500 ops.
- No hay regresión: clientes con zona manual no se sobrescriben.

## Commit message sugerido

```
fix(clientes): auto-detectar zona desde coords GPS

Tres cambios coordinados:

1. UI fallback en /admin/clientes y /admin/mapa-rutas: si cliente.zona
   no existe pero lat/lng sí, mostrar zona inferida con badge "(auto)"
   en gris cursiva. La función inferirZona() ya existía en
   utils/zonas.ts pero no se usaba en render.

2. Service crearCliente() y actualizarCliente(): auto-asignan
   cliente.zona si admin no la especifica manualmente y hay coords.
   Aplica a cliente creados desde admin + formulario publico /agendar.

3. Script one-shot scripts/backfill-zonas-clientes.ts: recorre la
   coleccion clientes y asigna zona donde falta. Idempotente. Se
   ejecuto post-deploy para los 9k clientes importados del calendar
   que quedaron sin zona.

Reviewer del sprint Boton Como Llegar (399ab63) detecto el problema:
zona "No definida" en cliente con coords validas. Bug afectaba al
99%+ de los 9094 clientes recien importados.
```

## Estimación

Sprint chico, ~45 min total con builder + tester + reviewer + script run.
