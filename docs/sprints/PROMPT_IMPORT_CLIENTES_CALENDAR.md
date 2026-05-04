# Sprint: importar 9,096 clientes desde Calendar + schema RNC + botón WhatsApp

Usa el subagente coordinator.

## Contexto

Jorge tiene 3 años de historia operando vía Google Calendar (~17,000 servicios a ~9,096 clientes únicos). Generamos CSV ya parseado y limpio en `~/Downloads/clientes_para_importar.csv` con 12 columnas:

```
nombre, telefono, coordenadas, direccion_escrita,
rnc, razon_social,
total_servicios, fecha_ultimo_servicio, monto_total_historico,
equipos_atendidos, marcas_habituales, bancos_pago
```

Este sprint hace 3 cosas en orden:

1. **Schema extension** — agregar `rnc?` y `razonSocial?` opcionales al tipo `Cliente` y formularios.
2. **Script de importación** — sube los 9,096 clientes a Firestore con flag `origen: 'calendar_legacy'`, idempotente.
3. **Botón WhatsApp directo** — en `/admin/clientes`, cada fila tiene un botón que abre `wa.me/<telefono>?text=...`.

## Decisiones tomadas con Jorge

- Las "notas operativas" (horarios, "ir a la otra dirección", etc.) **NO se importan**. Limpiamos el CSV antes.
- Se importa solo la base de clientes, NO el historial de 17k servicios.
- Pre-poblar `config_web/sitio.marcasPopulares` con marcas detectadas para autocomplete en formularios.
- RNC y Razón social son **opcionales** en TODOS los formularios (admin: crear/editar cliente, público: agendar). 67 clientes corporativos los tienen.

## Pre-investigación

1. **`src/types/index.ts`** — schema actual de `Cliente`. Agregar 2 campos opcionales.
2. **`src/services/clientes.service.ts`** — service de creación/actualización. Verificar que strip undefined funciona con campos vacíos.
3. **`src/pages/Clientes.tsx`** — vista del módulo de clientes. Ver layout actual de la lista para insertar botón WhatsApp.
4. **`src/utils/whatsapp.ts`** — helper que ya existe para construir URLs `wa.me/...`. Reusar.
5. **`src/utils/index.ts`** — `phoneNormalize()` para canonicalizar teléfonos.
6. **`firestore.rules`** — verificar que `clientes` siga aceptando el write desde admin/coord.

## Cambios

### 1. Schema extension `src/types/index.ts`

Agregar a `Cliente`:

```typescript
interface Cliente {
  // ... campos existentes ...
  
  /** Registro Nacional del Contribuyente (DGII). Solo clientes corporativos. */
  rnc?: string;
  
  /** Razón social (nombre legal del negocio). Solo si rnc está presente. */
  razonSocial?: string;

  /** Origen del registro. 'calendar_legacy' para importados, 'manual' para creados desde admin, 'agendar_publico' para los del formulario público. */
  origen?: 'calendar_legacy' | 'manual' | 'agendar_publico' | 'cita_publica';

  /** Métricas legacy (solo para importados). NO se actualizan automáticamente. */
  legacyMetricas?: {
    totalServicios: number;
    fechaUltimoServicio: string;       // YYYY-MM-DD
    montoTotalHistorico: number;
    equiposAtendidos: string;          // CSV
    marcasHabituales: string;          // CSV
    bancosPago: string;                // CSV
  };
}
```

`parseCliente()` en `utils/index.ts` debe rehidratar defensivamente los nuevos campos.

### 2. Formularios

**Crear cliente** (`src/components/clientes/CrearClienteModal.tsx` o equivalente):
- Agregar 2 campos opcionales abajo del bloque principal: "RNC (opcional)" + "Razón social (opcional)".
- Si admin escribe RNC, validar formato: 9-11 dígitos. Si no cumple, error inline.
- Si RNC está vacío, ocultar/limpiar Razón social.

**Editar cliente** (mismo modal o vista):
- Mostrar los 2 campos siempre. Pre-llenar si existen.

**Vista detalle cliente** (`src/pages/Clientes.tsx` modal):
- Mostrar RNC y Razón social arriba del bloque de teléfono si existen.
- Si tiene `legacyMetricas`, mostrar card "Historial pre-sistema (importado)" con: total servicios, último servicio, monto histórico.

**Formulario público `/agendar`**:
- Agregar campo opcional "RNC (si necesitas factura fiscal)" al fondo del formulario, deshabilitado por default. Botón "Soy empresa con RNC" lo muestra. Si lo llena, también mostrar "Razón social".

### 3. Script de importación `scripts/importar-clientes-calendar.ts`

```typescript
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'csv-parse/sync';

// Auth: igual que consolidar-counter-facturas.ts (3 modos: GOOGLE_APPLICATION_CREDENTIALS, service-account.json local, env vars)

async function main() {
  const csvPath = '/Users/jorgeluisbritogarcia/Downloads/clientes_para_importar.csv';
  if (!existsSync(csvPath)) throw new Error(`No existe ${csvPath}`);
  
  const content = readFileSync(csvPath, 'utf8');
  const rows = parse(content, { columns: true, skip_empty_lines: true });
  
  console.log(`Procesando ${rows.length} clientes...`);
  
  const db = getFirestore();
  const batch = db.batch();
  let creados = 0, actualizados = 0, skipped = 0;
  
  // Pre-cargar todos los clientes existentes por teléfono normalizado
  const existentesSnap = await db.collection('clientes').get();
  const existentes = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const doc of existentesSnap.docs) {
    const tel = doc.data().telefono;
    if (tel) existentes.set(normalizeTel(tel), doc.ref);
  }
  
  for (const row of rows) {
    const tel = normalizeTel(row.telefono);
    if (!tel || tel.length !== 10) { skipped++; continue; }
    
    const data = stripUndefined({
      nombre: row.nombre.trim(),
      telefono: tel,
      direccion: row.direccion_escrita || undefined,
      ubicacion: parseCoords(row.coordenadas),
      rnc: row.rnc || undefined,
      razonSocial: row.razon_social || undefined,
      origen: 'calendar_legacy',
      legacyMetricas: {
        totalServicios: parseInt(row.total_servicios) || 0,
        fechaUltimoServicio: row.fecha_ultimo_servicio || '',
        montoTotalHistorico: parseFloat(row.monto_total_historico) || 0,
        equiposAtendidos: row.equipos_atendidos || '',
        marcasHabituales: row.marcas_habituales || '',
        bancosPago: row.bancos_pago || '',
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    if (existentes.has(tel)) {
      // Cliente ya existe: enriquecer si faltan datos, NO sobrescribir nombre/dirección recientes
      const ref = existentes.get(tel)!;
      const enrich = stripUndefined({
        rnc: data.rnc,
        razonSocial: data.razonSocial,
        legacyMetricas: data.legacyMetricas,
        // Solo agregar dirección si el cliente actual no la tiene
      });
      batch.update(ref, enrich);
      actualizados++;
    } else {
      const ref = db.collection('clientes').doc();
      batch.set(ref, data);
      creados++;
    }
    
    // Firebase batch limit: 500 ops. Commit y reset cada 400.
    if ((creados + actualizados) % 400 === 0) {
      await batch.commit();
      console.log(`Progreso: ${creados + actualizados}/${rows.length}`);
    }
  }
  
  await batch.commit();
  
  console.log(`\n✓ Import terminado:`);
  console.log(`  Creados:      ${creados}`);
  console.log(`  Actualizados: ${actualizados}`);
  console.log(`  Skipped:      ${skipped}`);
  
  // Pre-poblar marcas populares
  const marcasFreq = new Map<string, number>();
  for (const row of rows) {
    if (row.marcas_habituales) {
      for (const m of row.marcas_habituales.split(',').map(s => s.trim()).filter(Boolean)) {
        marcasFreq.set(m, (marcasFreq.get(m) || 0) + 1);
      }
    }
  }
  const topMarcas = [...marcasFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([m]) => m.charAt(0).toUpperCase() + m.slice(1));
  
  await db.collection('config_web').doc('sitio').set(
    { marcasPopulares: topMarcas, marcasPopularesActualizadasEn: FieldValue.serverTimestamp() },
    { merge: true }
  );
  console.log(`  Marcas populares pre-pobladas: ${topMarcas.join(', ')}`);
}

function normalizeTel(s: string): string {
  if (!s) return '';
  let d = s.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? d : '';
}

function parseCoords(s: string): { lat: number; lng: number } | undefined {
  if (!s) return undefined;
  const m = s.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);
  if (!m) return undefined;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      if (v && typeof v === 'object' && !Array.isArray(v) && !('toDate' in v)) {
        out[k] = stripUndefined(v);
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Idempotente: re-correrlo NO duplica clientes.

### 4. Botón WhatsApp en `src/pages/Clientes.tsx`

En la lista de clientes (tabla o cards), agregar columna/botón "WhatsApp":

```tsx
import { whatsappLink } from '../utils/whatsapp';
import { MessageCircle } from 'lucide-react';

// En cada fila/card de cliente:
<a
  href={whatsappLink(cliente.telefono, `Hola ${cliente.nombre.split(' ')[0]}, te escribimos de Mister Service RD.`)}
  target="_blank"
  rel="noopener noreferrer"
  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors"
  onClick={(e) => e.stopPropagation()}
  title={`Enviar WhatsApp a ${cliente.nombre}`}
>
  <MessageCircle size={14} />
  WhatsApp
</a>
```

Si `whatsappLink()` no acepta segundo parámetro de mensaje pre-llenado, ajustar el helper.

También agregar el botón en:
- Modal de detalle de cliente (junto a "Llamar")
- Vista de orden (junto al teléfono del cliente)
- Vista técnico mobile (botón grande junto al cliente cuando llega a la cita)

### 5. Pre-poblar marcas en formularios

Donde el formulario pida "Marca" del equipo (admin: crear orden + público: agendar), usar `config_web.sitio.marcasPopulares` como sugerencias del dropdown/autocomplete.

## Verificación

**Tester:**

1. Crear cliente nuevo desde admin con RNC y Razón social → verificar que se guarda y se ve en detalle.
2. Editar cliente existente para agregar RNC → guardar OK.
3. Crear cliente sin RNC → guardar OK (campos opcionales).
4. Correr el script de importación local con service-account.json:
   ```
   cd ~/Desktop/mister-service-rd
   npx tsx scripts/importar-clientes-calendar.ts
   ```
5. Verificar logs: "Creados: 9000+, Actualizados: 50+, Skipped: <50".
6. En `/admin/clientes` verificar que aparecen los nuevos clientes (filtrar por origen='calendar_legacy').
7. Re-correr el script → "Actualizados: 9000+, Creados: 0" (idempotencia OK).
8. Click botón WhatsApp en cliente → abre WhatsApp con mensaje pre-llenado.
9. Verificar que `config_web/sitio.marcasPopulares` tiene array con 12 marcas top.

**Reviewer:**

- Schema `Cliente.rnc?` y `razonSocial?` realmente opcionales — todas las queries y vistas existentes siguen funcionando con clientes que no los tienen.
- `legacyMetricas` no rompe `parseCliente()` cuando es undefined (clientes nuevos creados manualmente).
- Strip undefined antes de Firestore writes.
- `whatsappLink()` codifica correctamente el teléfono RD (con prefijo `1`) y el mensaje (URL encoded).
- Botón WhatsApp tiene `e.stopPropagation()` para no triggerear click del row de la lista.
- Script idempotente: clientes ya existentes en el sistema (creados antes) no se duplican; se enriquecen.
- El batch del script respeta el límite de 500 ops por commit de Firestore.
- Marcas pre-pobladas tienen capitalización correcta (Whirlpool, no whirlpool).

## Commit message sugerido

```
feat(clientes): import 9k clientes desde calendar + RNC + botón WhatsApp

Sprint en 3 partes:

1. Schema extension:
   - Cliente.rnc?: string (RNC fiscal DGII, opcional)
   - Cliente.razonSocial?: string (nombre legal, opcional)
   - Cliente.origen?: 'calendar_legacy'|'manual'|'agendar_publico'|'cita_publica'
   - Cliente.legacyMetricas?: { totalServicios, fechaUltimoServicio, etc.}
   parseCliente rehidrata defensivamente.

2. Script de importación scripts/importar-clientes-calendar.ts:
   - Lee CSV de Downloads/clientes_para_importar.csv (9096 filas).
   - Auth Admin SDK (3 modos como consolidar-counter-facturas).
   - Idempotente por telefono normalizado.
   - Crea o enriquece (no sobrescribe nombre/dirección de clientes
     ya existentes con datos recientes).
   - Pre-puebla config_web.sitio.marcasPopulares con top 12 marcas
     detectadas (Whirlpool, Samsung, LG, Frigidaire, Mabe, Midea, etc.)
     para autocomplete en formularios.

3. Botón WhatsApp en /admin/clientes:
   - Cada fila tiene botón verde con icono MessageCircle.
   - Click abre wa.me/<telefono>?text=Hola, te escribimos de Mister Service RD.
   - Reusa whatsappLink() de utils/whatsapp.ts.
   - También agregado en modal detalle cliente, vista orden, vista
     técnico mobile.

Sin breaking changes. Clientes existentes (manualmente creados) no se
ven afectados. Formularios siguen funcionando con campos vacíos.
```

## Ante cualquier ambigüedad

- Si `whatsappLink()` ya acepta segundo parámetro de mensaje, perfecto. Si no, extender la función. Si la firma cambia, actualizar todos los call sites.
- Si la columna "Acciones" en `/admin/clientes` queda muy ancha con WhatsApp + Editar + otros, considerar dropdown menu en lugar de botones inline.
- El script puede correr de noche para no afectar el negocio. No requiere downtime.
- Si Firestore tira error de quota durante el import (cuota de writes de plan free), correrlo en chunks de 1000 con sleep entre cada uno.
- Si se descubren teléfonos malformados en el CSV (algunos con prefijos extraños), el script los skippea y los lista al final para revisión manual.
