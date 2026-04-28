# Sprint: Mejoras al formulario público /agendar (v2)

Usa el subagente coordinator.

## Objetivo

Tres cambios coordinados al formulario `/agendar`:

1. **Bloques de hora fijos** (editables desde `/admin/web`) en vez de input libre de hora.
2. **Round-robin de WhatsApp** sobre los números ya configurados en `config_web/sitio` — al asignar al cliente, se guarda el número asignado en la cita por confirmar.
3. **Pantalla de éxito con botón "Abrir WhatsApp"** que prellena un mensaje estructurado con toda la info del cliente, dirigido al número asignado por el round-robin.

## Pre-investigación

Antes de tocar código, el builder debe LEER y reportar:

1. **Dónde viven los 3 números de WhatsApp en `config_web/sitio`.**
   - Abrir `src/types/configWeb.ts` (o el archivo donde esté `ConfigWeb`).
   - Identificar el shape exacto: ¿es array `whatsapps: string[]`, son 3 campos `whatsapp1/2/3`, está dentro de `contacto.{numero,nombre}[]`, etc.?
   - Verificar también la sección de `ConfiguracionWeb.tsx` que los edita para confirmar que ya hay UI de los 3.
   - **NO inventar shape — usar el existente.**

2. **El servicio de contadores existente.**
   - Leer `src/services/contadores.service.ts`.
   - Confirmar que se puede agregar un nuevo contador `formularioAgendarRR` siguiendo el mismo patrón transaccional.
   - Si el patrón actual es solo para OS/QT/FAC y no es genérico, reportar y proponer un mini-helper local.

3. **Cómo el formulario interno (admin "Crear Orden" / "Crear Cita") maneja los bloques de hora.**
   - Buscar en `src/components/ordenes/` o `src/pages/Citas.tsx` los bloques que mencionó el cliente: 9 AM, 11 AM, 1 PM, 3 PM, 5 PM.
   - Si ya hay un array de bloques compartido, reusarlo. Si está hardcoded, propondremos extraerlo a util compartido.

Con eso ajustar el plan abajo si difiere.

## Cambio 1: Bloques de hora editables

### Schema

Extender `ConfigFormularioAgendar` (en `src/types/configFormularioAgendar.ts`):

```typescript
export interface ConfigFormularioAgendar {
  // ... campos existentes ...
  bloquesHora: string[]; // ej: ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM', '5:00 PM']
}
```

Default en `configFormularioAgendarDefault()`:

```typescript
bloquesHora: ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM', '5:00 PM'],
```

### Editor (admin)

En `ConfigFormularioAgendarSection.tsx`, agregar nueva subsección **"Bloques de hora disponibles"** (entre "Opciones de '¿cómo nos conociste?'" y "Campos personalizados"):

- Lista de bloques actuales con botón ❌ por bloque para eliminar.
- Input + botón "Agregar bloque" para añadir uno nuevo (texto libre, ej: "7:00 PM").
- Botones ↑↓ para reordenar (mismo patrón que campos personalizados).
- Validación: mínimo 1 bloque (no permitir lista vacía — si la dejan vacía, mostrar warning rojo "Debe haber al menos 1 bloque de hora").

### Formulario público

En `FormularioAgendarPublico.tsx`, reemplazar el `<input type="time">` actual por un grupo de botones-radio:

```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
  {config.bloquesHora.map((bloque) => (
    <button
      type="button"
      key={bloque}
      onClick={() => setHoraSolicitada(bloque)}
      className={`px-4 py-3 rounded-lg border-2 transition ${
        horaSolicitada === bloque
          ? 'border-primary bg-primary/10 text-primary font-semibold'
          : 'border-gray-300 hover:border-primary/50'
      }`}
    >
      {bloque}
    </button>
  ))}
</div>
```

El campo `horaSolicitada` se guarda como string en `citas_por_confirmar` (el bloque elegido). Sin parseo a 24h — se guarda tal cual.

Si el campo está marcado como requerido y el usuario no eligió bloque → error de validación "Selecciona un bloque de hora".

## Cambio 2: Round-robin de WhatsApp

### Estado del round-robin

Usar Firestore como fuente de verdad para evitar race conditions entre clientes simultáneos.

Crear nuevo doc `config_web/contadores` (o agregar al existente si ya existe) con campo:

```typescript
{
  formularioAgendarRR: number; // contador incremental, empieza en 0
}
```

### Service helper en `formularioAgendar.service.ts`

```typescript
import { runTransaction, doc } from 'firebase/firestore';
import { db } from '../firebase/config';

export async function obtenerWhatsAppRoundRobin(numerosDisponibles: string[]): Promise<string> {
  if (!numerosDisponibles.length) {
    throw new Error('No hay números de WhatsApp configurados');
  }

  const counterRef = doc(db, 'config_web', 'contadores');

  const indice = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const actual = (snap.data()?.formularioAgendarRR ?? 0) as number;
    const proximo = actual + 1;
    tx.set(counterRef, { formularioAgendarRR: proximo }, { merge: true });
    return actual % numerosDisponibles.length;
  });

  return numerosDisponibles[indice];
}
```

**Nota:** los números de WhatsApp deben venir de `config_web/sitio` según el shape que el builder identifique en pre-investigación. Si están como `whatsapps: WhatsAppContact[]` (objetos con `numero` y `nombre`), el helper debe trabajar con esa shape.

### Integración con submit

En `enviarSolicitudAgendar` (o donde se hace el submit en `FormularioAgendarPublico.tsx`):

1. Antes del `addDoc(citas_por_confirmar)`, llamar a `obtenerWhatsAppRoundRobin()` con los números de la config.
2. Guardar el número asignado en la cita: `whatsappAsignado: '8095551234'` (o el shape completo si hay nombre).
3. Después del addDoc exitoso, devolver tanto el ID de la cita como el `whatsappAsignado` y el `mensajePrellenado` (ver Cambio 3).

Extender `CitaPorConfirmar` con:

```typescript
whatsappAsignado?: string; // Número al que se redirigió al cliente para confirmar
whatsappAsignadoNombre?: string; // Nombre/etiqueta del número (María, Coordinadora, etc.)
```

Esto permite que en `/admin/citas` el admin vea a quién se le asignó la confirmación.

## Cambio 3: Pantalla de éxito con WhatsApp

### Estado del componente

En `FormularioAgendarPublico.tsx`, agregar estado:

```typescript
const [resultado, setResultado] = useState<{
  exitoso: boolean;
  whatsappUrl: string;
  whatsappNombre: string;
} | null>(null);
```

Si `resultado?.exitoso === true`, renderizar pantalla de éxito en vez del formulario.

### Mensaje prellenado

Construir el mensaje con toda la info del form. Ejemplo:

```typescript
function construirMensajeWhatsApp(datos: DatosFormularioAgendar): string {
  const lineas = [
    `Hola, soy *${datos.nombre}* y acabo de enviar una solicitud de cita por la web.`,
    ``,
    `📞 *Teléfono:* ${datos.telefono}`,
    datos.email ? `📧 *Email:* ${datos.email}` : null,
    ``,
    `📍 *Dirección:* ${datos.direccion}`,
    datos.sector ? `*Sector:* ${datos.sector}` : null,
    ``,
    `🛠️ *Equipo:* ${datos.equipoTipo}${datos.equipoMarca ? ` ${datos.equipoMarca}` : ''}${datos.equipoModelo ? ` (${datos.equipoModelo})` : ''}`,
    `*Falla reportada:* ${datos.fallaReportada}`,
    ``,
    `📅 *Fecha preferida:* ${datos.fechaPreferida || 'No especificada'}`,
    `⏰ *Hora preferida:* ${datos.horaSolicitada || 'No especificada'}`,
    datos.comoNosConocio ? `\n*¿Cómo nos conoció?* ${datos.comoNosConocio}` : null,
  ];

  // Agregar campos personalizados
  if (datos.camposPersonalizados && Object.keys(datos.camposPersonalizados).length > 0) {
    lineas.push('', '*Información adicional:*');
    for (const [key, value] of Object.entries(datos.camposPersonalizados)) {
      lineas.push(`• ${key}: ${value}`);
    }
  }

  lineas.push('', '_Por favor, confírmame la cita cuando puedas. Gracias._');

  return lineas.filter((l) => l !== null).join('\n');
}
```

### URL de WhatsApp

Usar el helper `utils/whatsapp.ts` existente (que ya normaliza el número con prefijo `1` para RD):

```typescript
import { construirUrlWhatsApp } from '../../utils/whatsapp';

const whatsappUrl = construirUrlWhatsApp(numeroAsignado, mensaje);
// resultado: https://wa.me/18095551234?text=...
```

Si el helper actual no acepta mensaje custom, extenderlo (sin romper llamadas existentes).

### Pantalla de éxito UI

```tsx
{resultado?.exitoso && (
  <div className="text-center max-w-md mx-auto py-12 px-4">
    <div className="text-6xl mb-4">✅</div>
    <h2 className="text-2xl font-bold mb-3">{config.mensajeExito || '¡Solicitud recibida!'}</h2>
    <p className="text-gray-600 mb-8">
      Hemos registrado tu solicitud. Para agilizar la confirmación de tu cita,
      por favor envía un mensaje de WhatsApp a {resultado.whatsappNombre || 'nuestro coordinador'}.
    </p>
    <a
      href={resultado.whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-3 bg-green-500 hover:bg-green-600 text-white text-lg font-semibold px-8 py-4 rounded-xl shadow-lg transition"
    >
      <svg className="w-6 h-6" /* ícono whatsapp */ />
      Abrir WhatsApp para confirmar
    </a>
    <p className="text-xs text-gray-400 mt-6">
      Si no tienes WhatsApp, te llamaremos al teléfono que registraste.
    </p>
  </div>
)}
```

El botón debe ser **muy visible** — verde, grande, con shadow, ícono claro. Es el call-to-action principal de la pantalla.

## Verificación

- Typecheck + lint sin warnings.
- Tester:
  - El form muestra los 5 bloques default cuando `config_web/sitio.formularioAgendar` no existe.
  - Al editar bloques desde admin (agregar "7:00 PM", quitar "1:00 PM", reordenar), el cambio se refleja en `/agendar` sin redeploy.
  - Submit con bloque seleccionado guarda `horaSolicitada: '11:00 AM'` (string) en Firestore.
  - 3 submits consecutivos asignan los 3 números diferentes en orden (round-robin).
  - El 4° submit vuelve al primer número (modulo).
  - La pantalla de éxito muestra el botón verde con el mensaje prellenado correcto al hacer click (verificar la URL en consola antes de abrir).
- Reviewer:
  - `parseCitaPorConfirmar` rehidrata `whatsappAsignado` y `whatsappAsignadoNombre`.
  - Strip de undefined antes de `addDoc` (convención del proyecto).
  - El contador en `config_web/contadores` se inicializa correctamente si el doc no existe (set merge).
  - El round-robin es transaccional (no race condition entre 2 submits simultáneos).

## Commit

```
feat(web): bloques de hora + round-robin WhatsApp + pantalla éxito en /agendar

- Reemplaza el input libre de hora por bloques predefinidos editables desde
  /admin/web. Default: 9 AM, 11 AM, 1 PM, 3 PM, 5 PM. Admin puede agregar,
  eliminar y reordenar bloques sin redeploy.
- Round-robin sobre los números de WhatsApp configurados en config_web/sitio.
  Cada submit incrementa un contador transaccional y asigna al cliente el
  siguiente número en rotación. El número asignado se guarda en la cita
  (whatsappAsignado) para que admin sepa a quién se redirigió.
- Pantalla de éxito post-submit con botón verde grande "Abrir WhatsApp para
  confirmar". El mensaje está prellenado con toda la info del form (nombre,
  teléfono, dirección, equipo, falla, fecha/hora preferida, campos custom)
  para que el agente que recibe el WhatsApp pueda ir directo a confirmar
  en /admin/citas sin pedirle datos al cliente.

Resuelve workflow real: el cliente no tenía manera fácil de iniciar
conversación con quién va a confirmarle la cita. Ahora hay 1 toque post-
submit que abre WhatsApp con todo listo.
```

## Ante cualquier ambigüedad

Pregunta con AskUserQuestion antes de tocar código. Especialmente:

- Si el shape de WhatsApps en `config_web/sitio` no permite extraer un array de números fácilmente (ej: si están como 3 campos planos `whatsapp1/2/3` con strings vacíos para los no usados), el helper debe filtrar los vacíos antes del modulo.
- Si ya existe un bloque de hora compartido en código (en formulario interno admin), reusar — no duplicar.
- Si el contador `formularioAgendarRR` choca con otro contador existente, usar nombre alternativo (ej: `whatsappRR`).
