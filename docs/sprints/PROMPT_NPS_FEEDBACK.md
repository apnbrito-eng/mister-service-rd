# Sprint: Sistema NPS de feedback al cerrar orden de servicio

Usa el subagente coordinator.

## Objetivo

Cuando una orden se cierra (`fase === 'cerrado'`), el cliente que entra a su link `/tracking/:token` ve una pantalla de feedback con pregunta NPS (0-10) y se dispara uno de tres caminos según el puntaje:

- **0-6 (Detractor)**: textarea "¿Qué pudimos hacer mejor?" + botón "Hablar con un coordinador" (WhatsApp prellenado).
- **7-8 (Pasivo)**: "Gracias por tu feedback. Si tienes algún detalle, escríbenos por WhatsApp."
- **9-10 (Promotor)**: botón verde "⭐ ¿Nos dejas una reseña en Google?" con link directo a Google Maps reviews.

Al recibir un detractor, notificación in-app al admin/coord. Reportes nuevos en `/admin/feedback`.

## Pre-investigación

1. **Página `/tracking/:token` actual** (`src/pages/public/Tracking.tsx` o similar):
   - Cómo se renderiza el estado de la orden hoy.
   - Dónde se inserta la nueva sección de feedback (al final del status o en card aparte).
   - Confirmar que el `token` permite identificar la orden con permisos públicos.

2. **Schema actual de Orden**:
   - Verificar si ya hay un campo `feedback` o `rating`. Si no, agregarlo.
   - Confirmar dónde vive `parseOrden` para extender la rehidratación.

3. **Sistema de notificaciones in-app existente**:
   - Verificar la función `crearNotificacion` (probablemente en `src/services/notificaciones.service.ts`).
   - Identificar tipos de notificación existentes para reusar pattern.

4. **Editor admin**:
   - Verificar que `/admin/web` (página `ConfiguracionWeb.tsx`) puede recibir una nueva sección "Feedback NPS".
   - Identificar si existe campo `googleReviewsUrl` en `config_web/sitio` (probablemente no — agregarlo).

## Cambios

### 1. Schema

Extender `OrdenServicio`:

```typescript
feedback?: {
  nps: number; // 0-10
  ratingTipo: 'detractor' | 'pasivo' | 'promotor';
  comentario?: string;
  fechaFeedback: Timestamp | Date;
  // Tracking de conversión:
  googleReviewClicked?: boolean; // true si el promotor clickeó el botón de Google
  whatsappContactClicked?: boolean; // true si el detractor abrió WhatsApp
};
```

`parseOrden` rehidrata `feedback` con timestamp correcto.

Extender `ConfigWeb`:

```typescript
feedbackNPS?: {
  habilitado: boolean; // default true
  googleReviewsUrl?: string; // ej: https://g.page/r/CXXX...
  mensajeAgradecimiento?: string; // default "Gracias por tu feedback"
  mensajeWhatsAppDetractor?: string; // default "Hola, tuve un servicio recientemente y quiero compartirles mi experiencia"
};
```

### 2. Componente `FeedbackNPS` (público, en /tracking)

Nuevo archivo: `src/components/public/FeedbackNPS.tsx`.

**Props:**

```typescript
interface Props {
  orden: OrdenServicio;
  configFeedback: ConfigWeb['feedbackNPS'];
  onSubmit: (feedback: OrdenServicio['feedback']) => Promise<void>;
}
```

**Estados internos:**

```typescript
const [pasoActual, setPasoActual] = useState<'pregunta' | 'comentario' | 'gracias'>('pregunta');
const [npsScore, setNpsScore] = useState<number | null>(null);
const [comentario, setComentario] = useState('');
const [enviando, setEnviando] = useState(false);
```

**UI paso 1 — Pregunta NPS:**

```
"¿Qué tan probable es que recomiendes Mister Service RD a un familiar o amigo?"

[0] [1] [2] [3] [4] [5] [6] [7] [8] [9] [10]

Etiquetas pequeñas debajo:
0 = "Nada probable"
10 = "Muy probable"
```

Botones grandes (mín 44px tap target). Grid responsive: `grid-cols-6 sm:grid-cols-11`. Color del botón seleccionado verde si 9-10, amarillo si 7-8, rojo si 0-6.

**UI paso 2 — Según rating:**

- **Detractor (0-6):**
  ```
  Lamentamos que la experiencia no haya sido la esperada.
  ¿Qué pudimos hacer mejor?
  
  [Textarea, opcional, max 500 chars]
  
  [Enviar feedback] [Hablar con un coordinador (WhatsApp)]
  ```
  
  El botón "Hablar con coordinador" abre WhatsApp con número del primer activo configurado + mensaje prellenado del config (`mensajeWhatsAppDetractor`) + número de orden y nombre del cliente.

- **Pasivo (7-8):**
  ```
  Gracias por tu calificación de [puntaje]/10.
  Si tienes algún detalle que quieras compartir, escríbenos por WhatsApp.
  
  [Comentario opcional, textarea]
  
  [Enviar] [Hablar por WhatsApp]
  ```

- **Promotor (9-10):**
  ```
  ¡Nos alegra mucho! 🎉
  ¿Nos dejarías una reseña en Google? Solo te toma 30 segundos.
  
  [⭐ Dejar reseña en Google] (botón verde grande)
  
  Botón secundario al pie: [Más tarde]
  ```
  
  Si el cliente toca "Dejar reseña en Google":
  - Se setea `googleReviewClicked: true` en el doc.
  - Se abre `configFeedback.googleReviewsUrl` en nueva pestaña.
  - Pantalla cambia a "gracias".
  
  Si toca "Más tarde": se guarda el feedback (NPS+ratingTipo) sin marcar el click. La orden queda con feedback pero sin click a Google.

**UI paso 3 — Gracias:**

```
✅ ¡Gracias por tu feedback!

[Si configFeedback.mensajeAgradecimiento existe, mostrarlo]

[Botón secundario "Volver al inicio"]
```

### 3. Persistencia

En el handler `onSubmit`, escribir a Firestore:

```typescript
const ahora = serverTimestamp();
const feedback = {
  nps: npsScore,
  ratingTipo: npsScore <= 6 ? 'detractor' : npsScore <= 8 ? 'pasivo' : 'promotor',
  comentario: comentario.trim() || undefined,
  fechaFeedback: ahora,
};

// Strip undefined antes
const feedbackLimpio = Object.fromEntries(
  Object.entries(feedback).filter(([_, v]) => v !== undefined)
);

await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
  feedback: feedbackLimpio,
});

// Si es detractor → crear notificación admin
if (feedback.ratingTipo === 'detractor') {
  await crearNotificacion({
    tipo: 'feedback_detractor',
    titulo: '⚠️ Cliente con experiencia negativa',
    mensaje: `${orden.clienteNombre} dio NPS ${npsScore}/10 a la orden ${orden.numero}`,
    paraRoles: ['administrador', 'coordinadora'],
    relacionadoId: orden.id,
    relacionadoTipo: 'orden',
  });
}
```

### 4. Integración en `/tracking/:token`

En la página de tracking, después de la sección de status:

```tsx
{orden.fase === 'cerrado' && !orden.feedback && (
  <FeedbackNPS
    orden={orden}
    configFeedback={configWeb.feedbackNPS}
    onSubmit={handleEnviarFeedback}
  />
)}

{orden.fase === 'cerrado' && orden.feedback && (
  <FeedbackYaEnviado
    feedback={orden.feedback}
    onAbrirWhatsApp={...}
  />
)}
```

`FeedbackYaEnviado`: mensaje compacto "Ya enviaste tu feedback. Gracias." + botón secundario WhatsApp. Inmutable — no permitir editar.

### 5. Reglas Firestore

**IMPORTANTE**: el cliente público debe poder hacer `update` a `ordenes_servicio/{id}` SOLO en el campo `feedback` (no en otros campos). Esto requiere ajustar las reglas. Pasos:

1. El builder identifica si las reglas están versionadas (probablemente solo Firestore lo está).
2. Si no están en el repo, dar a Jorge el snippet para pegar en Firebase Console.

Snippet propuesto:

```
match /ordenes_servicio/{ordenId} {
  // ... reglas existentes ...
  
  // Permite update SOLO del campo feedback desde tracking público
  allow update: if request.auth == null
                && resource.data.fase == 'cerrado'
                && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['feedback'])
                && request.resource.data.feedback.nps is int
                && request.resource.data.feedback.nps >= 0
                && request.resource.data.feedback.nps <= 10
                && (!resource.data.keys().hasAny(['feedback']) || resource.data.feedback == null);
                // último: solo permite si no había feedback antes (inmutabilidad)
}
```

Si el shape actual de reglas es muy diferente, el builder debe reportar y proponer alternativa segura. Lo crítico: NO permitir update libre de la orden — solo del campo feedback, solo si fase es cerrado, solo una vez.

### 6. Editor admin `/admin/web`

Nueva sección **"Feedback NPS de órdenes"** en `ConfiguracionWeb.tsx`:

- Toggle "Habilitar feedback en /tracking" (default: true).
- Input "URL de reseñas de Google" (formato `https://g.page/r/...` o `https://www.google.com/maps/place/...`).
  - Tooltip explicativo: "Cuando un cliente da NPS 9-10, verá un botón para dejarte reseña aquí."
- Textarea "Mensaje WhatsApp para detractores" (default: el genérico).
- Textarea "Mensaje de agradecimiento" (opcional).

### 7. Reportes admin `/admin/feedback`

Nueva página accesible desde sidebar (sección "Reportes" si existe, o standalone).

**Roles con acceso:** administrador, coordinadora.

**Contenido:**

a) **Cards superiores (KPIs):**
   - NPS promedio del mes (con flecha vs mes anterior).
   - % Promotores / Pasivos / Detractores (donut chart).
   - Cantidad total de feedbacks recibidos / órdenes cerradas (tasa de respuesta).
   - Promotores que NO clickearon Google (oportunidad perdida).

b) **Ranking de técnicos por NPS:**
   - Tabla: técnico, total feedbacks, NPS promedio, # promotores, # detractores, tasa conversión Google.
   - Solo técnicos con ≥ 3 feedbacks (datos no representativos sino).
   - Sortable por columnas.

c) **Detractores recientes (últimos 30 días):**
   - Lista: cliente, fecha, técnico, OS-####, NPS, comentario.
   - Botón "Recontactar (WhatsApp)" por fila.
   - Filtro: "Sin recontactar" (campo extra `recontactado: boolean` opcional para tracking).

d) **Promotores no convertidos (no clickearon Google):**
   - Lista similar a detractores.
   - Botón "Reenviar link Google (WhatsApp)" por fila — abre WhatsApp con mensaje preformateado: "Hola [cliente], gracias por tu calificación de [N]/10. Si tienes 30 segundos, ¿nos dejarías una reseña aquí? [link]"

e) **Filtros globales:**
   - Rango de fechas.
   - Por técnico.
   - Por tipo (todos / detractores / promotores).

### 8. Visualización en `/admin/ordenes`

En `OrdenCard` y `OrdenDetailModal`:

- Si `orden.feedback` existe, mostrar badge:
  - 🟢 NPS 9-10
  - 🟡 NPS 7-8
  - 🔴 NPS 0-6
- Click expande mini-tooltip o sección con el comentario del cliente.

## Verificación

- Typecheck + lint.
- Tester:
  - Cerrar una orden → cliente entra a `/tracking/:token` → ve form NPS.
  - Cliente da 5 (detractor) → comentario opcional → submit → admin/coord recibe notificación in-app "⚠️ Cliente con experiencia negativa".
  - Cliente da 8 (pasivo) → submit → mensaje gracias.
  - Cliente da 10 (promotor) → botón Google → click → abre URL configurada en nueva pestaña + se marca `googleReviewClicked: true`.
  - Cliente entra de nuevo al tracking → ve "Feedback ya enviado, gracias".
  - `/admin/feedback`: KPIs, ranking, detractores y promotores no convertidos visibles.
  - Botón "Recontactar" abre WhatsApp con mensaje correcto.
- Reviewer:
  - Reglas Firestore correctamente restrictivas (no permitir update libre).
  - parseOrden rehidrata feedback con tipos correctos.
  - Strip undefined.
  - No race condition: si dos pestañas envían feedback simultáneo (improbable pero posible), una de ellas debería fallar limpiamente con toast "Ya enviaste feedback, gracias".

## Commit

```
feat(orden): sistema NPS de feedback al cerrar orden

Cuando una orden se cierra, el cliente entra a /tracking/:token y ve
una pantalla de feedback con pregunta NPS 0-10. Tres caminos según
puntaje:

- Detractor (0-6): textarea opcional + botón WhatsApp para hablar con
  coordinador. Notificación in-app automática a admin/coord para
  recontactar.
- Pasivo (7-8): mensaje breve de agradecimiento + opción WhatsApp.
- Promotor (9-10): botón verde 'Dejar reseña en Google' con URL
  configurable. Tracking de conversión (googleReviewClicked).

Schema: nuevo campo Orden.feedback con nps, ratingTipo, comentario,
fechaFeedback, googleReviewClicked, whatsappContactClicked. parseOrden
rehidrata. Inmutable una vez enviado.

Configuración admin /admin/web sección 'Feedback NPS': toggle
habilitado, URL de Google Reviews, mensaje WhatsApp para detractores,
mensaje de agradecimiento.

Nueva página /admin/feedback (admin/coord) con dashboard:
- KPIs: NPS promedio mes, distribución promotor/pasivo/detractor,
  tasa de respuesta, promotores no convertidos.
- Ranking de técnicos por NPS (≥3 feedbacks). Datos para evaluación
  objetiva de personal.
- Lista detractores recientes con botón 'Recontactar (WhatsApp)'.
- Lista promotores no convertidos con botón 'Reenviar link Google'.

Badge de NPS visible en OrdenCard y OrdenDetailModal (verde/amarillo/
rojo según puntaje).

Resuelve workflow real: hoy no había forma sistemática de evaluar
satisfacción ni recuperar reseñas Google ni rescatar clientes
molestos. Con esto se cierran las 3 brechas.

ACCIÓN MANUAL pendiente: pegar reglas Firestore en Firebase Console
para permitir update del campo feedback desde tracking público sin
auth (con validaciones estrictas). Sin esto, el submit del feedback
falla con permission-denied y el form degrada con toast claro.
```

## Acción manual para Jorge

Después del deploy, pegar este snippet en Firebase Console → Firestore → Rules → bloque `match /ordenes_servicio/{ordenId}`:

```
allow update: if request.auth == null
              && resource.data.fase == 'cerrado'
              && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['feedback'])
              && request.resource.data.feedback.nps is int
              && request.resource.data.feedback.nps >= 0
              && request.resource.data.feedback.nps <= 10
              && (!('feedback' in resource.data) || resource.data.feedback == null);
```

(El builder confirmará el snippet exacto en el output según el shape actual de reglas.)

## Ante cualquier ambigüedad

- Si las reglas Firestore actuales requieren auth para `update` en `ordenes_servicio` SIEMPRE, evaluar alternativa: endpoint API server-side `/api/feedback/[token]` con Admin SDK que valida y escribe (mismo patrón que /api/garantia/[token]). Más seguro.
- Si Google Reviews URL no se puede generar fácil (Jorge no tiene ficha de Google Maps), dejar el flujo del promotor mostrando un mensaje genérico de gracias hasta que se configure.
- Si el componente Tracking actual está muy acoplado a otro flujo, separar en sub-componentes para no romper nada.
