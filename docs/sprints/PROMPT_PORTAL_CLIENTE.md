# Sprint: Portal del cliente — link único desde la confirmación de cita

Usa el subagente coordinator.

## Objetivo

Hoy el cliente solo recibe un link de tracking GPS cuando el técnico inicia ruta. Eso es tarde. Queremos que **desde el momento que admin/coord confirma la cita** (transición `Citas por confirmar` → `Agendado`), el cliente reciba un link único persistente al **portal del cliente** donde puede consultar todo el ciclo de vida de su orden, pedir posponer la cita, y al final recibir feedback + descargar conduce de garantía.

Esto reduce llamadas de "¿a qué hora va el técnico?" + le da control al cliente sobre su agenda + sube percepción de profesionalismo.

## Pre-investigación

Antes de tocar código, leé:

1. **Schema actual de `OrdenServicio`** en `src/types/index.ts`. Identificar campos de tracking, fase, fecha de cita.
2. **Flujo de confirmación de cita** — buscar dónde se cambia `fase` de `nuevo_lead`/`en_gestion` a `agendado`. Probablemente en `Ordenes.tsx`, `CitasPorConfirmar.tsx`, `Citas.tsx`, o el modal de "Confirmar y agendar".
3. **`utils/whatsapp.ts`** — entender el patrón actual de generación de links `wa.me/...?text=...` con mensaje pre-llenado. WhatsApp sigue manual (sin Business API).
4. **API serverless** existentes en `api/`:
   - `api/feedback/[token].ts` — endpoint público sin auth para feedback NPS
   - `api/garantia/[token].ts` — endpoint público sin auth para info de garantía + reclamo
   - `api/gps/ubicacion.ts` — proxy autenticado para GPS
   Estos tres son patrones a seguir para los nuevos endpoints del portal cliente.
5. **`firestore.rules`** — confirmar que la rule de `ordenes_servicio` ya tiene read condicional por `trackingGPS.activo`. Vamos a extender esto para incluir read por `tokenPortalCliente`.
6. **Componentes existentes a reusar**:
   - `src/pages/TrackingCliente.tsx` — la página actual de tracking (mapa GPS)
   - `src/components/public/FeedbackNPS.tsx` — feedback NPS
   - `src/pages/public/GarantiaCliente.tsx` — info de garantía
   El portal cliente debería **integrar visualmente todos estos** en una sola UI cohesiva, no duplicarlos.

## Decisión de tokens

**Hoy:** las órdenes pueden tener `trackingGPS.token` (cuando el GPS se activa) y separadamente el token de feedback / garantía se calcula del ID de la orden o de un campo dedicado.

**Decisión nueva:** unificar todo bajo `tokenPortalCliente: string` (32 chars hex) que se genera **al confirmar la cita** y sirve para todo el ciclo: tracking, posponer, feedback, garantía, conduce. Mantener compatibilidad hacia atrás (los links viejos de `/tracking/:token` y `/feedback/:token` y `/garantia/:token` siguen funcionando — buscan tanto `trackingGPS.token` como `tokenPortalCliente`).

Beneficio: un solo link al cliente para toda la vida de la orden, no 3 distintos.

## Schema

Extender `OrdenServicio`:

```typescript
interface OrdenServicio {
  // ... campos existentes ...

  /** Token único del portal del cliente. Generado al confirmar la cita. */
  tokenPortalCliente?: string;

  /** Marca cuándo se envió el WhatsApp del portal al cliente. */
  portalClienteEnviado?: {
    enviadoEn: Timestamp;
    enviadoPor: string;        // uid del staff que confirmó
    enviadoPorNombre: string;
    metodo: 'whatsapp' | 'email' | 'manual';
  };

  /** Propuestas de reprogramación del cliente. Array para historial. */
  propuestasReprogramacion?: PropuestaReprogramacion[];
}

interface PropuestaReprogramacion {
  id: string;                            // uuid local
  propuestaPor: 'cliente' | 'admin';
  fechaPropuesta: Timestamp;             // cuándo se hizo la propuesta
  fechaActualOrden: Timestamp;           // fecha de cita al momento de proponer
  fechaNuevaPropuesta: Timestamp;        // nueva fecha que pide el cliente
  motivo: string;                        // libre, opcional
  estado: 'pendiente' | 'aceptada' | 'rechazada' | 'contrapropuesta';
  resueltaPor?: string;                  // uid admin que resolvió
  resueltaPorNombre?: string;
  resueltaEn?: Timestamp;
  notaResolucion?: string;               // opcional, ej: "técnico no disponible ese día"
  contrapropuestaFecha?: Timestamp;      // si admin contra-propone
}
```

Helpers en `utils/index.ts`:

- `generarTokenPortalCliente(): string` — 32 chars hex usando `crypto.randomUUID().replace(/-/g, '')`.
- `obtenerPropuestaReprogramacionPendiente(orden): PropuestaReprogramacion | null` — la más reciente con `estado === 'pendiente'`.
- `parseOrden()` debe rehidratar los nuevos campos defensivamente.

## Cambios

### 1. Generación automática del token al confirmar cita

Buscar **todas las rutas** por las que una orden pasa a `fase: 'agendado'`:

- Modal "Confirmar y agendar" desde `Citas por confirmar` (probablemente en `src/pages/Citas.tsx` o componente equivalente)
- Crear orden directamente en `Agendado` desde `Ordenes.tsx` con técnico/fecha
- Edición de orden donde admin cambia fase manualmente

En cada uno, **antes** de hacer `setDoc`/`updateDoc`, asegurar:

```typescript
if (!orden.tokenPortalCliente) {
  orden.tokenPortalCliente = generarTokenPortalCliente();
}
```

Si la orden ya tiene token (porque pasó por `Agendado` antes), reutilizarlo (idempotente).

### 2. Botón "Enviar portal al cliente" en el modal de orden

En el modal de orden (probablemente `OrdenModal` o equivalente en `src/components/ordenes/`), agregar un botón cerca del bloque del cliente:

```
[ 📲 Enviar portal al cliente por WhatsApp ]
```

**Comportamiento:**
- Solo visible si `orden.tokenPortalCliente` existe (es decir, ya está agendada).
- Al hacer click, generar el mensaje WhatsApp:

```
¡Hola {nombreCliente}! Confirmamos tu cita con Mister Service RD:

📅 {fechaCita formateada en español, ej: "Lunes 30 de abril a las 4:00 PM"}
🔧 Técnico: {tecnicoNombre}
📋 {equipoTipo} {marca} {modelo}

🔗 Sigue tu cita en tiempo real:
https://www.misterservicerd.com/cliente/{tokenPortalCliente}

En el link puedes:
✓ Ver el estado de tu orden en vivo
✓ Pedir posponer la cita si te surge algo
✓ Contactar al equipo

Cualquier duda escríbenos por aquí.
- Mister Service RD
```

- El click hace 2 cosas en orden:
  1. **Setear** `portalClienteEnviado` en la orden (timestamp + uid + nombre del staff que clickeó + método 'whatsapp')
  2. Abrir `wa.me/<numero>?text=<mensaje url-encoded>` en nueva pestaña

- Si ya fue enviado antes, mostrar el botón en estado distinto: "📲 Reenviar portal al cliente (último envío: hace 2 días)" para que admin sepa que el cliente ya tiene el link.

### 3. Página pública `/cliente/:token`

Nueva ruta en `src/App.tsx`:

```tsx
<Route path="/cliente/:token" element={<PortalCliente />} />
```

Componente nuevo: `src/pages/public/PortalCliente.tsx` — sin layout admin, sin auth.

**UI estructurada en cards verticales (mobile-first, ~380px):**

1. **Header**:
   - Logo Mister Service RD
   - Número de orden (ej: "Orden OS-0042")
   - Estado actual con badge color (mapping de `fase` → color usando `faseColor()` ya existente).

2. **Card del servicio**:
   - Equipo: `{equipoTipo} - {marca} {modelo}`
   - Problema reportado: `{descripcionFalla}` (truncar a 200 chars con expand)

3. **Card de cita confirmada**:
   - Fecha y hora: `Lunes 30 de abril, 4:00 PM` (formato es-DO)
   - Técnico asignado: foto (si existe) + nombre
   - Si fase ≥ `en_diagnostico`: botón "Ver técnico en vivo en mapa" → expande `<TrackingMapaEmbed>` con tracking GPS si `trackingGPS.activo`.

4. **Stepper horizontal de fases**:
   - Reusa el mismo stepper que muestra admin (`StepperFases` o similar).
   - Adaptado a mobile: scroll horizontal si necesita.

5. **Card de acciones del cliente**:
   - Botón principal: "📅 Pedir posponer mi cita" → abre modal (ver sección 4).
   - Botón secundario: "💬 WhatsApp con coordinación" → `wa.me/<NUMERO_COORDINADOR>?text=Hola, sobre mi orden OS-XXXX...`.
   - Si ya hay propuesta pendiente, mostrar: "⏳ Tu propuesta de reprogramación está siendo revisada. Te avisaremos pronto."

6. **Card de historial** (colapsable, default cerrado):
   - Cronología de eventos: cita creada → confirmada → técnico en ruta → en diagnóstico → cerrada → etc.
   - Lee de `historialFases` y `auditoria` (filtrar eventos relevantes para cliente, omitir notas internas).

7. **Si fase === `cerrado`**:
   - Card grande: "✅ Servicio completado. Tu garantía está activa hasta {fechaFinGarantia}".
   - Botón: "📄 Descargar mi conduce de garantía" → llama a `/api/garantia/<token>` (ya existe).
   - Embed inline del componente `FeedbackNPS` (si aún no envió feedback) o tarjeta "Gracias por tu opinión".

**Carga de datos:**
- Usa endpoint serverless nuevo: `GET /api/portal-cliente/<token>` (ver sección 5).
- NO leer Firestore directamente desde el cliente — el endpoint controla qué campos exponer.

### 4. Modal "Posponer cita"

Componente nuevo: `src/components/public/ModalPosponer.tsx`.

**UI:**
- Título: "Pedir posponer mi cita"
- Calendar picker: el cliente elige nueva fecha (no permitir domingos, no permitir más de 60 días en el futuro, no permitir antes de hoy + 1 día).
- Time slots: bloques de 9:00, 11:00, 1:00 PM, 3:00 PM, 5:00 PM (mismo set que `/agendar`).
- Textarea: "Motivo (opcional)" — placeholder "Ej: Tengo una emergencia ese día y no podré recibirlos."
- Botón: "Enviar propuesta"
- Botón secundario: "Cancelar"

**Submit:**
- POST a `/api/portal-cliente/<token>/posponer` con `{ fechaNuevaPropuesta: ISO8601, motivo: string }`.
- Mostrar loading + handle de errores (red, validación).
- Al éxito: cerrar modal + refrescar la card de acciones (mostrar "propuesta pendiente").

### 5. Endpoints serverless en `/api/portal-cliente/`

**Nuevos archivos en `api/portal-cliente/`:**

#### `api/portal-cliente/[token].ts` — GET

Devuelve datos seguros de la orden para el portal. Usa Firebase Admin SDK (bypassa rules).

```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const { token } = req.query;
  if (typeof token !== 'string' || token.length < 16) {
    return res.status(400).json({ error: 'token_invalido' });
  }

  const snap = await admin.firestore()
    .collection('ordenes_servicio')
    .where('tokenPortalCliente', '==', token)
    .limit(1)
    .get();

  if (snap.empty) {
    // Compat: aceptar también trackingGPS.token
    const compat = await admin.firestore()
      .collection('ordenes_servicio')
      .where('trackingGPS.token', '==', token)
      .limit(1)
      .get();
    if (compat.empty) return res.status(404).json({ error: 'no_encontrada' });
    // ...
  }

  const orden = snap.docs[0].data();

  // Whitelist de campos que se exponen al cliente. NO incluir info interna.
  return res.status(200).json({
    numero: orden.numero,
    estado: orden.fase,
    cliente: {
      nombre: orden.clienteNombre,
      telefono: orden.clienteTelefono,
    },
    servicio: {
      equipoTipo: orden.equipoTipo,
      marca: orden.marca,
      modelo: orden.modelo,
      descripcionFalla: orden.descripcionFalla,
    },
    cita: {
      fecha: orden.fechaCita,
      hora: orden.horaCita,
      tecnicoNombre: orden.tecnicoNombre,
      tecnicoFotoUrl: orden.tecnicoFotoUrl ?? null,
    },
    tracking: orden.trackingGPS ?? null,
    propuestaReprogramacionPendiente: obtenerPropuestaPendiente(orden) ?? null,
    historial: filtrarHistorialPublico(orden.historialFases),
    cierre: orden.fase === 'cerrado' ? {
      fechaCierre: orden.cierre?.fechaCierre,
      garantiaFin: calcularFinGarantia(orden),
      conduceGenerado: !!orden.cierre?.conduceUrl,
    } : null,
  });
}
```

#### `api/portal-cliente/[token]/posponer.ts` — POST

Crea propuesta de reprogramación.

```typescript
// Validaciones:
// - token válido y orden existe
// - fechaNuevaPropuesta es ISO8601 válida, en el futuro (> hoy+1 día), no domingo
// - motivo es string ≤ 500 chars
// - rate limit: máximo 3 propuestas pendientes por orden (anti-spam)
// - si fase === 'cerrado' o 'cancelado', rechazar (no se puede reprogramar)

const propuesta: PropuestaReprogramacion = {
  id: crypto.randomUUID(),
  propuestaPor: 'cliente',
  fechaPropuesta: admin.firestore.Timestamp.now(),
  fechaActualOrden: orden.fechaCita,
  fechaNuevaPropuesta: admin.firestore.Timestamp.fromDate(new Date(req.body.fechaNuevaPropuesta)),
  motivo: req.body.motivo?.slice(0, 500) ?? '',
  estado: 'pendiente',
};

await admin.firestore().collection('ordenes_servicio').doc(ordenId).update({
  propuestasReprogramacion: admin.firestore.FieldValue.arrayUnion(propuesta),
});

// Crear notificación interna para admin/coord
await admin.firestore().collection('notificaciones').add({
  tipo: 'reprogramacion_solicitada',
  ordenId,
  ordenNumero: orden.numero,
  clienteNombre: orden.clienteNombre,
  fechaPropuesta: propuesta.fechaNuevaPropuesta,
  motivo: propuesta.motivo,
  destinatarioRoles: ['administrador', 'coordinadora'],
  leida: false,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

return res.status(200).json({ ok: true, propuestaId: propuesta.id });
```

#### Reusar `/api/feedback/[token].ts` y `/api/garantia/[token].ts`

Esos ya buscan por `trackingGPS.token`. **Extender la lógica para buscar también por `tokenPortalCliente`** — un solo token sirve para todo.

### 6. Panel admin: "Reprogramaciones pendientes"

Nueva página: `src/pages/Reprogramaciones.tsx` (admin/coord).

Sidebar: agregar entrada "🔄 Reprogramaciones" con badge de count si hay pendientes.

**UI:**
- Lista de órdenes con `propuestasReprogramacion` que tengan al menos una con `estado === 'pendiente'`.
- Cada card muestra:
  - Cliente + número de orden
  - Fecha actual de la cita → fecha propuesta (ambas con día de la semana)
  - Motivo del cliente
  - Tiempo desde que llegó la propuesta (ej: "hace 2 horas")
  - Botones: ✅ Aceptar | ❌ Rechazar | 📅 Contraproponer

**Aceptar:**
- Actualiza `fechaCita` + `horaCita` con la nueva propuesta
- Marca propuesta como `estado: 'aceptada'`, `resueltaPor`, `resueltaEn`
- Genera evento de auditoría en `historialFases`
- Manda WhatsApp al cliente con el botón "Confirmar reagenda" (link `wa.me/...` con mensaje pre-llenado: "Confirmado, te esperamos el {nuevaFecha}").

**Rechazar:**
- Marca `estado: 'rechazada'` + `notaResolucion` (opcional, popup)
- Manda WhatsApp al cliente: "No podemos reagendar para esa fecha. ¿Te sirve {sugerencia alternativa}? Avísanos."

**Contraproponer:**
- Modal con calendar picker para elegir fecha alternativa.
- Genera nueva propuesta con `propuestaPor: 'admin'`, marca la del cliente como `'contrapropuesta'`.
- Manda WhatsApp al cliente con la nueva fecha + link al portal para confirmar.

### 7. Migración de órdenes existentes

Script one-shot en `src/firebase/migrations/`:

```typescript
// scripts/generar-tokens-portal-cliente.ts
// Para todas las órdenes con fase >= 'agendado' que no tengan tokenPortalCliente,
// generar uno y guardarlo. NO enviar WhatsApp automático — admin decide cuándo.
```

Correr una vez con `tsx`. Reportar count de actualizadas.

### 8. Rules nuevas en `firestore.rules`

Extender la rule de `ordenes_servicio` para read público por `tokenPortalCliente` (similar a `trackingGPS.token`):

```
match /ordenes_servicio/{docId} {
  allow read: if (
    resource.data.trackingGPS != null &&
    resource.data.trackingGPS.activo == true
  ) || (
    // NUEVO: read público si tiene tokenPortalCliente — el endpoint
    // serverless filtra qué campos exponer, no el cliente directo.
    // Sin embargo, mejor que el cliente pegue al /api/portal-cliente/<token>
    // así que en realidad NO necesitamos read público acá. El endpoint
    // serverless usa Admin SDK que bypassa rules.
    false
  ) || esStaff();

  // ... resto de la rule no cambia ...
}
```

**Decisión final:** NO permitir read directo por `tokenPortalCliente` desde cliente. Toda la lectura va por `/api/portal-cliente/*`. Eso da control granular sobre qué se expone.

### 9. Compatibilidad hacia atrás

- Links viejos `/tracking/<token>`, `/feedback/<token>`, `/garantia/<token>` siguen funcionando — los endpoints buscan tanto `trackingGPS.token` como `tokenPortalCliente`.
- Eventualmente migrar el componente `TrackingCliente.tsx` para que redirija a `/cliente/<token>` (después de una semana de monitoreo).

## Verificación

- Typecheck + lint sin warnings.
- **Tester:**
  - Crear cita pública en `/agendar` → confirmar desde admin → verificar que `tokenPortalCliente` se genera y aparece en la orden.
  - Click "Enviar portal al cliente" → abre WhatsApp con mensaje correcto + link al portal.
  - Abrir el link en incógnito → ver portal con datos correctos + estado actual.
  - Click "Pedir posponer" → llenar fecha + motivo → submit. Verificar que aparece "propuesta pendiente" en el portal y que admin la ve en panel "Reprogramaciones pendientes".
  - Admin acepta propuesta → verificar que `fechaCita` se actualiza + cliente recibe WhatsApp de confirmación.
  - Marcar orden como `cerrado` → verificar que portal muestra botón conduce de garantía + feedback NPS.
- **Reviewer:**
  - Token nunca se loguea ni aparece en URLs sensibles.
  - Endpoint `/api/portal-cliente/<token>` filtra correctamente — NO expone `tecnicoId`, `costoInterno`, `notasInternas`, `auditoria`, etc.
  - Rate limit en endpoint posponer (3 propuestas pendientes max).
  - Rule de `ordenes_servicio` no se debilitó.
  - Strip undefined en todos los writes.
  - Migración script es idempotente (re-correr no rompe nada).

## Commit

```
feat(cliente): portal del cliente con link único desde la confirmación de cita

Hoy el cliente solo recibe link de tracking GPS cuando el técnico inicia
ruta. Demasiado tarde. Ahora desde que admin confirma la cita, el cliente
recibe un link al portal donde puede ver:

- Detalles de la orden (equipo, problema, técnico asignado)
- Estado en vivo (stepper de fases)
- Mapa con técnico en ruta cuando esté activo
- Historial cronológico

Y puede:

- Pedir posponer la cita (genera propuesta para admin/coord)
- Contactar coordinación por WhatsApp
- Al cerrar: ver garantía, descargar conduce, dejar feedback NPS

Schema:
- ordenes_servicio.tokenPortalCliente: token único 32 chars hex
- ordenes_servicio.portalClienteEnviado: tracking de cuándo/quién envió
- ordenes_servicio.propuestasReprogramacion[]: historial completo

Endpoints serverless nuevos en /api/portal-cliente/:
- GET <token> — devuelve datos filtrados (Admin SDK + whitelist)
- POST <token>/posponer — crea propuesta + notificación admin

Endpoints reusados (/api/feedback, /api/garantia) extendidos para
aceptar tokenPortalCliente además de trackingGPS.token. Un solo token
sirve para todo el ciclo.

Panel admin /admin/reprogramaciones para gestionar propuestas pendientes.
Aceptar actualiza fecha + WhatsApp confirmación al cliente.

Migración: script one-shot genera tokens para órdenes existentes
en fase >= agendado.

Sin breaking changes. Links viejos /tracking/, /feedback/, /garantia/
siguen funcionando.
```

## Ante cualquier ambigüedad

- Si hay otro flujo de confirmación que pasa fase a 'agendado' (ej: importación batch), también debe generar el token. Auditar todos los `setDoc/updateDoc` que tocan `fase`.
- Si el cliente envía propuesta y la fase ya es 'cancelado' o 'cerrado', rechazar con 409 + mensaje claro.
- Si el técnico inicia ruta entre que el cliente abrió el portal y refrescó, el portal debe reflejar el cambio (poll cada 30s o usar onSnapshot vía endpoint dedicado — preferir poll para no exponer Firestore al cliente).
- Si el cliente intenta abrir el link de una orden 'cancelada', mostrar mensaje "Esta cita fue cancelada. Contáctanos por WhatsApp si necesitas ayuda." con botón directo.
- Si la orden no tiene fechaCita (cita por confirmar todavía sin agenda), no permitir generar token aún. Esperar al agendamiento.
- Si el WhatsApp del cliente está vacío o malformado, mostrar el link en pantalla con botón "Copiar link" para que admin lo envíe manual por otro canal.
