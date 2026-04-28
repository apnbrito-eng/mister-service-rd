# Sprint: Mejoras al formulario /agendar (v3)

Usa el subagente coordinator.

## Objetivo

Tres cambios coordinados al formulario `/agendar` y al flujo de confirmación de citas:

1. **Captura de ubicación con Google Places** en el form público — igual al form interno "Crear Orden de Servicio". Incluye autocompletado, botón "Mi ubicación" y parser de URL de Google Maps.
2. **Bloquear domingos** en el campo "Fecha preferida" del form público.
3. **Crear/actualizar cliente automáticamente** cuando la coordinadora/admin confirma una cita por confirmar. Si el teléfono no existe → crea cliente. Si existe → agrega la dirección de la cita al array `direcciones` (si difiere).

## Pre-investigación

Antes de tocar código, el builder debe LEER y reportar:

1. **Componente de captura de dirección del form interno.**
   - Buscar en `src/components/clientes/AgregarDireccionModal.tsx`, `src/components/ordenes/`, o donde esté el campo Dirección con Places del modal "Crear Orden de Servicio" (admin) — el del screenshot que pasó el usuario muestra: input de búsqueda Google Places + botón "Mi ubicación" + soporte de pegar URL Maps.
   - Identificar si es un componente reutilizable o si está inline en el modal.
   - Si es reutilizable → usarlo en `/agendar`. Si está inline → extraerlo a `src/components/shared/CampoDireccionConPlaces.tsx` y reusarlo en ambos lugares (admin + público).
   - **Confirmar que la API key de Google Maps está disponible en frontend** (debería estar en `.env` como `VITE_GOOGLE_MAPS_API_KEY`).

2. **Flujo actual de "Confirmar cita".**
   - Buscar el handler en `src/pages/Citas.tsx` (probablemente función `handleConfirmarCita` o similar).
   - Reportar qué hace actualmente: ¿solo cambia el status? ¿abre modal? ¿crea orden? ¿enlaza cliente?
   - Identificar si la cita por confirmar tiene un campo `clienteId` actualmente. Si no, se agrega.

3. **Service de clientes.**
   - Leer `src/services/clientes.service.ts`.
   - Confirmar si existe `buscarClientePorTelefono(telefonoNormalizado)`. Si no, agregarlo.
   - Confirmar shape exacto de `Cliente.direcciones` — array de qué exactamente.
   - Verificar helper de teléfono normalizado (`normalizarTelefonoRD` en `utils/index.ts`).

4. **Permisos Firestore actuales para `clientes`.**
   - El builder NO puede modificar `firestore.rules` (no está en el repo según `firebase.json`).
   - Solo confirmar que las reglas actuales permiten al admin/coord/secretaria escribir a `clientes` con auth (debería ser sí — ya lo hacen desde el modal de crear orden).

Con esa información, ajustar el plan abajo si difiere.

## Cambio 1: Captura de ubicación en /agendar

### Reusar componente existente

Si la pre-investigación encuentra un componente reutilizable de captura de dirección con Places, usarlo directamente. Si no, **extraer a un componente compartido** `src/components/shared/CampoDireccionConPlaces.tsx` que reciba props:

```typescript
interface Props {
  valor: string; // dirección texto
  onChange: (datos: {
    direccion: string;
    coords?: { lat: number; lng: number };
    googleMapsUrl?: string;
  }) => void;
  placeholder?: string;
  mostrarBotonMiUbicacion?: boolean; // default true
  className?: string;
}
```

Internamente:
- Input con autocompletado Google Places (`places.AutocompleteService`).
- Botón "📍 Mi ubicación" → `navigator.geolocation.getCurrentPosition` + reverse geocode.
- Detección automática: si el usuario pega una URL de Google Maps, parsear `lat,lng` con regex (igual que el parser actual del admin).

### Integración en `FormularioAgendarPublico.tsx`

Reemplazar el input de dirección actual:

```tsx
<CampoDireccionConPlaces
  valor={direccion}
  onChange={(datos) => {
    setDireccion(datos.direccion);
    setDireccionCoords(datos.coords);
    setDireccionUrl(datos.googleMapsUrl);
  }}
  placeholder="Busca en Google: Agora Mall, Plaza Central..."
/>
```

### Schema

Extender `CitaPorConfirmar` con (si no existen):

```typescript
clienteDireccionCoords?: { lat: number; lng: number };
clienteDireccionUrl?: string;
```

Estos se guardan al submit del form público y se usan cuando se confirma la cita para crear el cliente con coords completas.

## Cambio 2: Bloquear domingos

En `FormularioAgendarPublico.tsx`, en el handler del input de fecha preferida:

```typescript
function handleFechaChange(e: React.ChangeEvent<HTMLInputElement>) {
  const valor = e.target.value;
  if (!valor) {
    setFechaPreferida('');
    return;
  }

  const fecha = new Date(valor + 'T12:00:00'); // mediodía para evitar timezone shift
  if (fecha.getDay() === 0) {
    toast.error('No atendemos los domingos. Por favor elige otro día.');
    setFechaPreferida('');
    return;
  }

  setFechaPreferida(valor);
}
```

Adicionalmente, agregar `min={hoy}` al input para que no permita fechas pasadas (calidad de vida básica):

```tsx
<input
  type="date"
  value={fechaPreferida}
  onChange={handleFechaChange}
  min={new Date().toISOString().split('T')[0]}
  className="..."
/>
```

## Cambio 3: Crear/actualizar cliente al confirmar cita

### Helper en `clientes.service.ts`

Agregar (si no existe):

```typescript
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { normalizarTelefonoRD } from '../utils';

export async function buscarClientePorTelefono(telefono: string): Promise<{ id: string; data: any } | null> {
  const normalizado = normalizarTelefonoRD(telefono);
  if (!normalizado) return null;

  const q = query(collection(db, 'clientes'), where('telefonoNormalizado', '==', normalizado));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const docSnap = snap.docs[0];
  return { id: docSnap.id, data: docSnap.data() };
}

export async function crearOActualizarClienteDesdeConfirmacion(
  cita: CitaPorConfirmar,
  usuarioActual: { uid: string; nombre: string }
): Promise<{ clienteId: string; creado: boolean }> {
  const existente = await buscarClientePorTelefono(cita.clienteTelefono);

  if (existente) {
    // Cliente existe → agregar dirección si difiere
    const dirNueva = {
      texto: cita.clienteDireccion || '',
      coords: cita.clienteDireccionCoords,
      googleMapsUrl: cita.clienteDireccionUrl,
      sector: cita.clienteSector,
      referencia: cita.clienteReferenciaDireccion,
      etiqueta: 'Captada desde formulario público',
      creadaEn: new Date(),
    };

    const direccionesActuales = (existente.data.direcciones || []) as Array<any>;

    // Detectar duplicado por texto exacto (case-insensitive)
    const yaExiste = direccionesActuales.some(
      (d) => (d.texto || '').toLowerCase().trim() === (dirNueva.texto || '').toLowerCase().trim()
    );

    if (!yaExiste && dirNueva.texto) {
      const direccionesActualizadas = [...direccionesActuales, dirNueva];
      const updates: any = {
        direcciones: direccionesActualizadas,
        actualizadoEn: serverTimestamp(),
        actualizadoPor: usuarioActual.nombre,
      };
      // Strip undefined
      Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);

      await updateDoc(doc(db, 'clientes', existente.id), updates);
    }

    return { clienteId: existente.id, creado: false };
  }

  // Cliente NO existe → crear
  const nuevoCliente: any = {
    nombre: cita.clienteNombre,
    telefono: cita.clienteTelefono,
    telefonoNormalizado: normalizarTelefonoRD(cita.clienteTelefono),
    email: cita.clienteEmail,
    direcciones: [
      {
        texto: cita.clienteDireccion || '',
        coords: cita.clienteDireccionCoords,
        googleMapsUrl: cita.clienteDireccionUrl,
        sector: cita.clienteSector,
        referencia: cita.clienteReferenciaDireccion,
        etiqueta: 'Principal',
        principal: true,
        creadaEn: new Date(),
      },
    ],
    origen: 'formulario_publico',
    creadoEn: serverTimestamp(),
    creadoPor: usuarioActual.nombre,
  };

  // Strip undefined recursivo
  function stripUndefined(obj: any): any {
    if (Array.isArray(obj)) return obj.map(stripUndefined);
    if (obj && typeof obj === 'object') {
      const limpio: any = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) limpio[k] = stripUndefined(v);
      }
      return limpio;
    }
    return obj;
  }

  const docRef = await addDoc(collection(db, 'clientes'), stripUndefined(nuevoCliente));
  return { clienteId: docRef.id, creado: true };
}
```

**Nota:** el shape exacto de `Cliente.direcciones` lo confirma la pre-investigación. El builder debe ajustar al shape real, no inventar.

### Integración en `Citas.tsx`

En el handler de "Confirmar cita" (probablemente `handleConfirmarCita`):

```typescript
async function handleConfirmarCita(cita: CitaPorConfirmar) {
  try {
    setProcesando(true);

    // 1. Crear o actualizar cliente
    const { clienteId, creado } = await crearOActualizarClienteDesdeConfirmacion(cita, {
      uid: currentUser.uid,
      nombre: currentUser.displayName || currentUser.email || 'admin',
    });

    // 2. Marcar cita como confirmada y enlazar cliente
    await updateDoc(doc(db, 'citas_por_confirmar', cita.id), {
      estado: 'confirmada',
      clienteId,
      confirmadaEn: serverTimestamp(),
      confirmadaPor: currentUser.displayName,
    });

    // 3. (resto del flujo actual: abrir modal de crear orden con datos pre-cargados, etc.)
    toast.success(creado ? 'Cliente creado y cita confirmada' : 'Cita confirmada (cliente ya existía)');

    // ... resto del flujo
  } catch (error) {
    console.error(error);
    toast.error('Error al confirmar cita');
  } finally {
    setProcesando(false);
  }
}
```

**Importante:** NO romper el flujo existente. Si actualmente "Confirmar cita" abre un modal de crear orden, ese modal debe ahora abrirse con `clienteId` pre-cargado para que la coordinadora no tenga que volver a buscar al cliente.

## Verificación

- Typecheck + lint sin warnings.
- Tester:
  - Form público en incógnito: el campo Dirección sugiere lugares de Google Places mientras escribes.
  - Botón "📍 Mi ubicación" pide permiso y rellena coords + dirección.
  - Pegar URL de Google Maps detecta lat/lng y pinta marcador.
  - Seleccionar fecha en domingo → toast rojo + campo se limpia.
  - Seleccionar fecha pasada → bloqueado por `min`.
  - Submit con todos los datos → la cita aparece en `/admin/citas` con `clienteDireccionCoords` y `clienteDireccionUrl`.
  - **Confirmar la cita** desde admin (cliente nuevo): se crea cliente en colección `clientes` con todos los datos. La cita queda enlazada con `clienteId`.
  - Confirmar otra cita con el **mismo teléfono** pero dirección distinta: NO crea cliente nuevo, agrega la dirección al array existente.
- Reviewer:
  - `parseCitaPorConfirmar` rehidrata `clienteDireccionCoords` y `clienteDireccionUrl`.
  - `parseCliente` (si existe) rehidrata `direcciones` con coords correctamente.
  - Strip de undefined antes de Firestore writes (convención).
  - El componente compartido `CampoDireccionConPlaces` no rompe el form interno admin si fue extraído.
  - El handler de "Confirmar cita" no tiene race condition (si dos coords confirman simultáneamente, solo una crea el cliente — la segunda detecta que ya existe).

## Commit

```
feat(web/citas): ubicación con Places en /agendar + cliente automático al confirmar

- /agendar ahora captura ubicación completa: autocompletado Google Places,
  botón Mi ubicación con reverse geocode, parser de URL de Google Maps.
  El componente de captura se extrajo a CampoDireccionConPlaces para reusar
  entre form interno (admin/Crear Orden) y form público.
- Domingos bloqueados en fecha preferida con toast inline. Fechas pasadas
  bloqueadas via min del input.
- Al confirmar una cita por confirmar desde /admin/citas, el sistema:
    * busca cliente por telefonoNormalizado;
    * si existe → agrega la dirección de la cita al array direcciones (si
      no duplica una existente);
    * si no existe → crea cliente nuevo con origen='formulario_publico',
      todos los datos del form (nombre, tel, email, dirección con coords,
      sector, referencia).
  La cita queda enlazada con clienteId para el flujo siguiente de crear
  orden.

Resuelve workflow real: la coordinadora ya no tiene que crear el cliente
manualmente cuando confirma una cita pública — está hecho automáticamente
con la dirección georreferenciada.
```

## Ante cualquier ambigüedad

Pregunta con AskUserQuestion antes de tocar código. Especialmente:

- Si el componente de captura de dirección del admin NO es fácil de extraer (depende de muchos hooks o estado del modal), reportar y proponer reescribir desde cero un componente shared más simple.
- Si el flag `origen: 'formulario_publico'` choca con un campo existente, sugerir alternativa.
- Si el shape de `Cliente.direcciones` tiene campos obligatorios que no podemos inferir del form público (ej: `tipo: 'casa' | 'trabajo'`), defaultear a `tipo: 'principal'`.
