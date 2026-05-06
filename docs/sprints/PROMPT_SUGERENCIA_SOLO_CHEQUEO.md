# Sprint: Sugerencia de "solo chequeo" — técnico propone, oficina aprueba

Usa el subagente coordinator.

## Objetivo

Hoy el técnico puede marcar `soloChequeo: true` unilateralmente al cerrar la orden, lo que evita el gate de aprobación de oficina (la rule R4 tiene esa excepción). Esto es necesario porque a veces el cliente paga el diagnóstico (~RD$2,000) y no quiere reparar — la orden se cierra ahí sin pasar por aprobación de precio.

**Problema:** el técnico decide unilateralmente. La oficina no valida si realmente fue solo chequeo o el técnico está cerrando órdenes incorrectamente para evitar el flujo de aprobación.

**Solución:** convertir "solo chequeo" en una **sugerencia que requiere aprobación de oficina**:

1. Técnico marca "el cliente solo quiere chequeo" → genera **sugerencia** visible para admin/coord + notificación.
2. Oficina aprueba con un click → ahí sí se setea `soloChequeo: true` y el técnico puede cerrar.
3. Si la oficina rechaza, vuelve al flujo normal (técnico debe esperar aprobación de precio para cerrar).

## Pre-investigación

1. **`src/types/index.ts`**: schema actual de `OrdenServicio`. Identificar campos relacionados a `soloChequeo` y `estadoAprobacion`.
2. **`firestore.rules`**: rule R4 actual con la excepción `soloChequeo`. Ubicada en líneas ~190-220. La excepción se va a refinar.
3. **`src/pages/TecnicoVista.tsx`** + **`src/components/cierre/CierreServicioWizard.tsx`** + **`src/pages/OrdenDetalle.tsx`**: lugares donde técnico puede marcar soloChequeo hoy. Identificar el flujo actual.
4. **`src/services/notificaciones.service.ts`**: helper para crear notificaciones. Reusar.
5. **Sprint anterior (Reprogramaciones):** mismo patrón de "técnico/cliente sugiere, admin aprueba". Reusar el approach UI/UX si ya existe en el repo.

## Schema

Extender `OrdenServicio`:

```typescript
interface OrdenServicio {
  // ... campos existentes ...

  /** Flag de "solo chequeo" — solo lo setea oficina al aprobar la sugerencia. */
  soloChequeo?: boolean;

  /** Sugerencia del técnico de cerrar como solo chequeo. */
  sugerenciaSoloChequeo?: {
    estado: 'pendiente' | 'aprobada' | 'rechazada';
    sugeridaPor: string;             // uid del técnico
    sugeridaPorNombre: string;
    fechaSugerencia: Timestamp;
    motivo: string;                  // libre, ej: "Cliente no quiere reparar, paga solo el diagnóstico"
    montoChequeo: number;            // RD$ que cobra el técnico por el chequeo (default 2000)

    // Resolución por oficina
    resueltaPor?: string;            // uid admin/coord
    resueltaPorNombre?: string;
    resueltaEn?: Timestamp;
    notaResolucion?: string;         // opcional, ej: "Aprobado, cliente confirmó por WhatsApp"
  };
}
```

## Cambios

### 1. Vista técnico — modal "Sugerir solo chequeo"

En `src/components/cierre/CierreServicioWizard.tsx` (y sus hermanos en TecnicoVista.tsx, OrdenDetalle.tsx):

**Antes** (hipótesis): técnico tiene botón "Marcar como solo chequeo" que setea `soloChequeo: true` directamente.

**Después**:
- Botón se renombra a "📋 Sugerir solo chequeo" (deshabilitado si ya hay sugerencia pendiente).
- Click abre `ModalSugerirSoloChequeo.tsx` (nuevo componente):
  - Campo: monto del chequeo (default RD$2,000, editable)
  - Textarea: motivo (obligatorio, mín 10 chars). Placeholder: "Ej: Cliente no quiere reparar, ya pagó el diagnóstico"
  - Botones: "Enviar sugerencia a oficina" / "Cancelar"
- Submit: setea `sugerenciaSoloChequeo` en la orden + crea notificaciones para admin/coord (fan-out).

### 2. Vista técnico — UI según estado de sugerencia

Después de enviar la sugerencia:

- **`estado: 'pendiente'`**: Banner amarillo arriba del wizard:
  ```
  ⏳ Sugerencia de solo chequeo enviada a oficina (hace 5 min). Esperando aprobación.
  ```
  Botón "Marcar Realizado" sigue deshabilitado.

- **`estado: 'aprobada'`**: Banner verde:
  ```
  ✅ Solo chequeo aprobado. Podés cerrar la orden ahora.
  ```
  Botón "Marcar Realizado" se activa (setea fase=trabajo_realizado, precioFinal=montoChequeo, soloChequeo=true). NOTA: oficina ya seteó `soloChequeo: true` y `precioFinal` al aprobar; el botón solo cambia la fase y dispara el wizard de cierre.

- **`estado: 'rechazada'`**: Banner rojo:
  ```
  ❌ Solo chequeo rechazado: "{notaResolucion}". Volvé al flujo normal de aprobación de precio.
  ```
  Técnico debe usar el flujo regular (proponer precio, esperar aprobación, cerrar normal).

### 3. Panel admin — "Sugerencias de solo chequeo"

Nueva sección en el panel admin existente (agregar al panel de Reprogramaciones si ya existe — son la misma idea, técnico sugiere oficina aprueba — o crear `/admin/sugerencias` consolidado).

**UI:**
- Lista de órdenes con `sugerenciaSoloChequeo.estado === 'pendiente'`.
- Cada card:
  - Cliente + número de orden + técnico que sugiere
  - Equipo + problema reportado
  - Motivo del técnico
  - Monto del chequeo propuesto (RD$2,000 por default)
  - Tiempo desde que llegó la sugerencia
  - Botones: ✅ **Aprobar** | ❌ **Rechazar**
  - Botón secundario: 💬 "WhatsApp con técnico" — abre chat directo con el técnico (link `wa.me/`)

**Aprobar:**
- Setea `sugerenciaSoloChequeo.estado = 'aprobada'` + `resueltaPor` + `resueltaEn`.
- Setea `soloChequeo: true` y `precioFinal: montoChequeo` (oficina lo confirma).
- Setea `estadoAprobacion: 'aprobado'` automáticamente (esto desbloquea cierre).
- Notif al técnico: "Solo chequeo aprobado. Podés cerrar la orden."
- Genera evento de auditoría.

**Rechazar:**
- Setea `sugerenciaSoloChequeo.estado = 'rechazada'` + `resueltaPor` + `notaResolucion`.
- NO toca soloChequeo ni estadoAprobacion (orden vuelve al flujo normal).
- Notif al técnico con la nota.
- Modal pide motivo del rechazo (textarea obligatorio).

### 4. Rules en `firestore.rules`

**CRÍTICO:** la rule actual permite que el técnico escriba `soloChequeo: true` directamente como excepción a R4. Hay que cambiar esto:

- **Técnico** puede escribir `sugerenciaSoloChequeo.{sugeridaPor, sugeridaPorNombre, fechaSugerencia, motivo, montoChequeo, estado='pendiente'}` (la sugerencia inicial). NO puede escribir `soloChequeo: true` directamente, NI `sugerenciaSoloChequeo.estado: 'aprobada'`, NI `precioFinal`.
- **Oficina** puede escribir todos los campos sin restricción (igual que hoy).

Actualizar la rule:

```javascript
// La excepción de soloChequeo en R4 ya no aplica si técnico está escribiendo
// soloChequeo: true. Solo aplica si soloChequeo ya estaba en true (lo seteó oficina).

allow update: if esStaffOficina() ||
  (esTecnico() &&
   resource.data.tecnicoId == request.auth.uid &&
   noTocaCamposAprobacion() &&
   noTocaAsignacion() &&
   !modificaSoloChequeo() &&  // NUEVO: técnico no puede escribir soloChequeo
   noTocaResolucionSugerencia() &&  // NUEVO: técnico no puede aprobar/rechazar su propia sugerencia
   !modificaPrecioSinSerChequeo() &&
   !intentaTrabajoRealizadoSinAprobacion()
  ) ||
  (esAyudante() && /* mismas reglas */);

function modificaSoloChequeo() {
  return request.resource.data.soloChequeo != resource.data.soloChequeo;
}

function noTocaResolucionSugerencia() {
  // Técnico puede crear la sugerencia inicial (estado=pendiente) pero no
  // puede cambiar el estado a aprobada/rechazada — eso solo lo hace oficina.
  return !('sugerenciaSoloChequeo' in request.resource.data) ||
    request.resource.data.sugerenciaSoloChequeo.estado == 'pendiente' ||
    request.resource.data.sugerenciaSoloChequeo.estado == resource.data.sugerenciaSoloChequeo.estado;
}
```

(El builder ajusta la sintaxis exacta según convención del archivo.)

### 5. Migración

Las órdenes existentes con `soloChequeo: true` ya en producción siguen válidas (no tocarlas). Esto es una migración cero — solo afecta el flujo a futuro.

### 6. Notificaciones

Reusar `notificaciones.service.ts`. Tipos nuevos:
- `tipo: 'sugerencia_solo_chequeo'` — al sugerir → fan-out a admin/coord
- `tipo: 'sugerencia_solo_chequeo_resuelta'` — al aprobar/rechazar → al técnico

## Verificación

- **Tester:**
  - Login técnico + orden cualquiera → click "Sugerir solo chequeo" → modal pide motivo + monto → submit.
  - Verificar que en panel admin/coord aparece la sugerencia pendiente.
  - Aprobar desde admin → verificar que el técnico recibe notif y el banner cambia a verde "Solo chequeo aprobado".
  - Verificar que `soloChequeo: true`, `precioFinal: 2000`, `estadoAprobacion: 'aprobado'` quedaron seteados.
  - Técnico cierra la orden → verificar fase=trabajo_realizado y comisiones disparadas.
  - Caso negativo: rechazar sugerencia → técnico recibe notif con motivo → banner rojo → botón sigue deshabilitado → técnico debe usar flujo normal de aprobación de precio.
  - Caso seguridad: técnico intenta directamente `updateDoc({ soloChequeo: true })` con DevTools → debe fallar con permission-denied.
  - Caso seguridad: técnico intenta `updateDoc({ sugerenciaSoloChequeo.estado: 'aprobada' })` → debe fallar.
  - Caso seguridad: técnico intenta `updateDoc({ precioFinal: 2000 })` sin sugerencia aprobada → debe fallar.

- **Reviewer:**
  - Rule R4 mantiene gate (técnico no puede cambiar fase/precio sin aprobación de oficina, salvo soloChequeo ya seteado por oficina).
  - Rule no permite técnico cambiar estado de sugerencia.
  - Sprint anterior de Reprogramaciones se mantiene funcional (ambos sistemas coexisten).
  - Strip undefined antes de Firestore writes.
  - Notificaciones se crean correctamente y se borran al resolver.
  - Migración de órdenes existentes con soloChequeo=true sigue funcionando.

## Commit

```
feat(ordenes): sugerencia de solo chequeo con aprobacion de oficina

Antes el tecnico podia marcar `soloChequeo: true` unilateralmente al
cerrar la orden, evitando el gate de aprobacion de oficina (R4). Eso
abria una ventana para cierres incorrectos sin validacion.

Ahora "solo chequeo" requiere flujo de 2 pasos:

1. Tecnico sugiere desde la vista de la orden con motivo + monto del
   chequeo (default RD$2,000). Se crea sugerenciaSoloChequeo con
   estado=pendiente y se notifica a admin/coord.

2. Oficina aprueba o rechaza desde panel admin. Aprobar setea
   soloChequeo=true, precioFinal=montoChequeo, estadoAprobacion=aprobado.
   Rechazar registra el motivo y vuelve al flujo normal.

Cambios en firestore.rules:
- Tecnico solo puede crear sugerencia inicial (estado=pendiente).
- Tecnico NO puede setear soloChequeo, precioFinal, ni cambiar estado
  de la sugerencia. Eso es solo de oficina.

Vista tecnico:
- Boton "Sugerir solo chequeo" en modal con motivo obligatorio.
- Banner segun estado: pendiente (amarillo) / aprobada (verde) /
  rechazada (rojo).
- Boton "Marcar Realizado" se activa solo cuando estado=aprobada.

Panel admin:
- Nueva seccion "Sugerencias de solo chequeo" o consolidada con
  Reprogramaciones (ambas son sugerencias tecnico->oficina).
- Aprobar/Rechazar con botones rapidos.

Notificaciones: tipo sugerencia_solo_chequeo + sugerencia_solo_chequeo_resuelta.

Sin breaking changes. Ordenes existentes con soloChequeo=true siguen
validas (cerradas en el flujo viejo). Migracion cero.
```

## Ante cualquier ambigüedad

- Si el técnico ya tiene una sugerencia rechazada y quiere proponer otra (ej: con motivo más detallado), permitirlo — pero NO sobrescribir la rechazada, sino crear nueva. Considerar `sugerenciasSoloChequeo[]` array en vez de single object si hay riesgo de múltiples intentos. Decidir según expectativa de uso.
- Si oficina aprueba y el técnico no marca cierre en X horas, agregar recordatorio? Diferir como ticket separado si tiempo permite.
- Si la orden ya está cerrada con `soloChequeo: true` (datos viejos pre-sprint), no permitir crear sugerencia (es no-op). UI debería esconder el botón.
- Si técnico envía sugerencia y oficina la deja sin atender por 24h, considerar SLA + escalación. Diferir como ticket.
