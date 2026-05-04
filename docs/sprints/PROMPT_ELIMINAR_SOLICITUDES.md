# Sprint: agregar botón eliminar en /admin/solicitudes

Usa el subagente coordinator.

## Bug

`/admin/solicitudes` no tiene forma de eliminar solicitudes individuales. Si llega spam por el formulario público o un admin necesita limpiar entradas de prueba (ej: la solicitud "TEST DEPLOY RULES - BORRAR" del primer día), no hay manera de hacerlo desde la UI. Solo se pueden marcar revisadas/aprobadas/rechazadas pero quedan acumulándose.

Sprint chico que agrega:

1. Función `eliminarSolicitud(id)` en `solicitudes.service.ts`.
2. Botón "Eliminar" con confirmación en cada fila + en el detalle.
3. Permiso solo `administrador` y `coordinadora`. Otros roles no ven el botón.
4. Hard delete (no es data crítica como una orden). Una vez confirmada la acción, el doc se borra de Firestore.

## Pre-investigación

1. **`src/services/solicitudes.service.ts`** — agregar función al final.
2. **`src/pages/Solicitudes.tsx`** — la lista. Identificar dónde están los otros botones (convertir, aprobar, rechazar) y agregar uno más.
3. **`src/utils/permisos.ts`** o equivalente — usar `puede(userProfile, 'administrador' | 'coordinadora')` o el helper que esté.
4. **`firestore.rules`** — verificar que `solicitudes_servicio` tiene `allow delete: if esStaff()` (sí, ya lo tiene del C1).

## Cambios

### 1. `src/services/solicitudes.service.ts`

Agregar al final:

```typescript
import { deleteDoc } from 'firebase/firestore';

export async function eliminarSolicitud(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
```

### 2. `src/pages/Solicitudes.tsx`

Agregar botón eliminar en cada fila (icono Trash de lucide-react), solo visible para admin/coord:

```tsx
import { Trash2 } from 'lucide-react';
import { eliminarSolicitud } from '../services/solicitudes.service';

const puedeEliminar = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';

async function handleEliminar(solicitud: SolicitudServicio) {
  const confirmado = window.confirm(
    `¿Eliminar la solicitud de "${solicitud.datos?.nombre || solicitud.formularioNombre}"?\n\nEsta acción no se puede deshacer.`
  );
  if (!confirmado) return;
  
  try {
    await eliminarSolicitud(solicitud.id);
    toast.success('Solicitud eliminada');
  } catch (e) {
    toast.error('Error al eliminar');
    console.error(e);
  }
}

// En cada card/fila, junto a los botones existentes:
{puedeEliminar && (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); handleEliminar(s); }}
    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors"
    title="Eliminar solicitud"
  >
    <Trash2 size={14} />
    Eliminar
  </button>
)}
```

Aplicar el mismo patrón en el modal de detalle de la solicitud.

### 3. Confirmación más fuerte para evitar accidentes

Usar el patrón existente del repo si hay un `ConfirmModal` reusable. Si no, `window.confirm` es suficiente para acción admin no crítica.

### 4. Auditoría (opcional, si tiempo permite)

Antes de eliminar, escribir entry en `auditoria_admin`:

```typescript
import { crearRegistroAuditoria } from '../utils';
await crearRegistroAuditoria({
  tipoEntidad: 'solicitudes_servicio',
  entidadId: solicitud.id,
  accion: 'eliminada',
  usuarioId: userProfile.uid,
  usuarioNombre: userProfile.nombre,
  detalle: `Solicitud "${solicitud.datos?.nombre}" eliminada`,
});
```

Si el helper `crearRegistroAuditoria` existe y se usa en otros deletes del repo, sumarlo. Si no, dejar el delete simple.

## Verificación

**Tester:**

1. Login admin → `/admin/solicitudes` → ver botón "Eliminar" rojo en cada solicitud.
2. Click → modal de confirmación. Cancelar → no pasa nada.
3. Click → confirmar → solicitud desaparece de la lista. Toast verde.
4. Login coord → mismo comportamiento (puede eliminar).
5. Login secretaria/operaria/técnico → NO ver el botón.
6. Eliminar la solicitud TEST `REXKH43I` con teléfono `8090000001` (la dejada el primer día).
7. Verificar Firestore: el doc realmente se borró (no soft delete).

**Reviewer:**

- `eliminarSolicitud()` simple, sin condicionales raras.
- Permisos validados client-side + rules permiten delete por staff (ya configurado en C1).
- `e.stopPropagation()` en el onClick del botón para no abrir el detalle al click.
- Toast feedback claro (éxito + error).
- Si hay auditoría, no rompe el flujo si falla.

## Commit message sugerido

```
feat(solicitudes): agregar boton eliminar para admin/coord

Bug: la pagina /admin/solicitudes no tenia forma de eliminar
solicitudes individuales. Quedaban acumulandose entradas de prueba
o spam del formulario publico.

Cambios:
- Funcion eliminarSolicitud(id) en solicitudes.service.ts (hard delete).
- Boton Trash rojo en cada fila + en modal detalle, solo visible para
  administrador y coordinadora.
- Confirmacion via window.confirm antes de borrar.
- Toast verde/rojo segun resultado.

Permisos client-side: rol == administrador o coordinadora.
Rule de Firestore solicitudes_servicio.delete ya permitia esStaff()
desde C1, sin cambios.
```

## Estimación

~30 min con builder + tester + reviewer.

## Después del sprint

Cuando pushees, abrís `/admin/solicitudes` y ves el botón rojo. Click en la solicitud TEST `REXKH43I` (8090000001) → confirmar → desaparece. Por fin se cierra el pendiente del primer día.

Mismo sprint también deja preparado para futuros casos de spam público.
