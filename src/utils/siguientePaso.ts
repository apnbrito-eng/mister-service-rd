import type { OrdenServicio, Rol } from '../types';
import { obtenerSugerenciaSoloChequeoPendiente } from './index';

/**
 * Tono visual del banner — afecta el color y el icono del banner.
 *
 *  - `accion`: el usuario actual tiene el siguiente paso (azul, primario).
 *  - `espera`: el sistema o terceros bloquean al usuario (gris, secundario).
 *  - `alerta`: requiere decisión inmediata (amarillo).
 *  - `info`: estado terminal o informativo (verde/neutro).
 */
export type TonoSiguientePaso = 'accion' | 'espera' | 'alerta' | 'info';

export interface MensajeSiguientePaso {
  /** Encabezado del banner — una frase corta. */
  titulo: string;
  /**
   * Detalle opcional debajo del título — explica por qué o cómo
   * cumplir el siguiente paso.
   */
  detalle?: string;
  tono: TonoSiguientePaso;
}

/**
 * Roles que ven el banner contextual. Roles administrativos y de
 * coordinación se mapean al banner de "operaria/oficina" porque
 * comparten la responsabilidad operativa de aprobar/rechazar
 * sugerencias y empujar al equipo.
 */
type RolSoportado = 'tecnico' | 'operaria' | 'secretaria' | 'administrador' | 'coordinadora' | 'ayudante';

/**
 * Calcula el siguiente paso contextual al rol del usuario logueado y a la
 * fase de la orden. Devuelve `null` cuando no hay nada útil que mostrar
 * (ej: rol sin contexto operativo, orden cerrada/cancelada/eliminada).
 *
 * Notas de implementación:
 *  - NO escribe a Firestore. Es 100% lectura del shape `OrdenServicio` +
 *    `rol` del perfil. Por eso vive en `utils/`.
 *  - Si el rol del usuario actual NO coincide con la responsabilidad
 *    natural del paso, devuelve un mensaje de "espera" (ej: técnico ve
 *    "Esperando aprobación de oficina" cuando él ya hizo lo suyo).
 *  - El banner es informativo. NO desbloquea botones. La lógica de
 *    permisos sigue centralizada en `permisos.ts` y los gates de UI
 *    existentes en `OrdenDetalle.tsx`/`TecnicoVista.tsx`.
 */
export function calcularSiguientePaso(
  orden: OrdenServicio,
  rol: Rol | undefined,
): MensajeSiguientePaso | null {
  if (!rol) return null;
  if (orden.eliminada) return null;
  if (orden.fase === 'cancelado') return null;

  const rolSoportado = rol as RolSoportado;
  const sugerenciaPendiente = obtenerSugerenciaSoloChequeoPendiente(orden);

  // Caso transversal: hay sugerencia de "solo chequeo" pendiente. Bloquea
  // al técnico (esperando oficina) y exige acción a oficina.
  if (sugerenciaPendiente) {
    if (rolSoportado === 'tecnico' || rolSoportado === 'ayudante') {
      return {
        titulo: 'Esperando aprobación de oficina',
        detalle: 'Sugeriste cobrar solo chequeo. La oficina aún no responde.',
        tono: 'espera',
      };
    }
    return {
      titulo: 'Sugerencia de solo chequeo pendiente',
      detalle: `${orden.tecnicoNombre || 'El técnico'} sugirió cobrar solo chequeo. Aprobá o rechazá la sugerencia.`,
      tono: 'alerta',
    };
  }

  // Caso transversal: orden Pendiente de piezas (stand-by).
  if (orden.enStandby) {
    if (rolSoportado === 'tecnico' || rolSoportado === 'ayudante') {
      return {
        titulo: 'Orden pendiente de piezas',
        detalle: 'Esperando que llegue la pieza para retomar el trabajo.',
        tono: 'espera',
      };
    }
    return {
      titulo: 'Pendiente de piezas',
      detalle: 'Cuando llegue la pieza, reactivá la orden y reagendá la cita.',
      tono: 'espera',
    };
  }

  // Por fase + rol.
  switch (orden.fase) {
    case 'nuevo_lead':
      if (rolSoportado === 'operaria' || rolSoportado === 'secretaria' ||
          rolSoportado === 'administrador' || rolSoportado === 'coordinadora') {
        return {
          titulo: 'Próximo paso: contactar al cliente',
          detalle: 'Llamá o escribí al cliente para confirmar el problema y agendar visita.',
          tono: 'accion',
        };
      }
      return {
        titulo: 'Esperando contacto inicial',
        detalle: 'La oficina debe contactar al cliente antes de agendar.',
        tono: 'espera',
      };

    case 'en_gestion':
      if (rolSoportado === 'operaria' || rolSoportado === 'secretaria' ||
          rolSoportado === 'administrador' || rolSoportado === 'coordinadora') {
        return {
          titulo: 'Próximo paso: agendar la cita',
          detalle: 'Definí fecha, hora y técnico asignado para esta orden.',
          tono: 'accion',
        };
      }
      return {
        titulo: 'Esperando agendamiento',
        detalle: 'La oficina está coordinando fecha y técnico.',
        tono: 'espera',
      };

    case 'agendado':
      if (rolSoportado === 'tecnico' || rolSoportado === 'ayudante') {
        return {
          titulo: 'Próximo paso: iniciar chequeo cuando llegues al cliente',
          detalle: 'Tomá foto del equipo y captura GPS para arrancar el diagnóstico.',
          tono: 'accion',
        };
      }
      return {
        titulo: 'Esperando llegada del técnico',
        detalle: orden.fechaCita
          ? 'El técnico iniciará el chequeo al llegar al cliente.'
          : 'El técnico iniciará el chequeo al llegar al cliente.',
        tono: 'espera',
      };

    case 'en_diagnostico':
      if (rolSoportado === 'tecnico' || rolSoportado === 'ayudante') {
        return {
          titulo: 'Próximo paso: cotizar reparación o sugerir solo chequeo',
          detalle: 'Si no se puede reparar hoy, sugerí cobrar solo chequeo a la oficina.',
          tono: 'accion',
        };
      }
      return {
        titulo: 'Diagnóstico en curso',
        detalle: 'El técnico está revisando el equipo. Esperá su cotización o sugerencia.',
        tono: 'espera',
      };

    case 'en_cotizacion': {
      const tienePrecio = orden.precioSugerido !== undefined && orden.precioSugerido !== null;
      const aprobado = orden.estadoAprobacion === 'aprobado';
      if (rolSoportado === 'tecnico' || rolSoportado === 'ayudante') {
        if (!tienePrecio) {
          return {
            titulo: 'Próximo paso: enviar precio sugerido a oficina',
            detalle: 'Cargá el precio para que oficina lo apruebe con el cliente.',
            tono: 'accion',
          };
        }
        if (aprobado) {
          return {
            titulo: 'Precio aprobado — podés ejecutar la reparación',
            detalle: 'Cuando termines, cerrá la orden con foto y firma del cliente.',
            tono: 'accion',
          };
        }
        return {
          titulo: 'Esperando aprobación de oficina',
          detalle: 'Oficina debe confirmar el precio con el cliente.',
          tono: 'espera',
        };
      }
      // Oficina / admin / coord
      if (!tienePrecio) {
        return {
          titulo: 'Esperando precio del técnico',
          detalle: 'El técnico aún no envió el precio sugerido.',
          tono: 'espera',
        };
      }
      if (aprobado) {
        return {
          titulo: 'Precio aprobado — esperando reparación del técnico',
          detalle: 'El técnico ya puede ejecutar el trabajo.',
          tono: 'info',
        };
      }
      return {
        titulo: 'Próximo paso: aprobar o rechazar precio sugerido',
        detalle: 'Confirmá el precio con el cliente y aprobalo para destrabar al técnico.',
        tono: 'alerta',
      };
    }

    case 'aprobado':
      if (rolSoportado === 'tecnico' || rolSoportado === 'ayudante') {
        return {
          titulo: 'Próximo paso: ejecutar la reparación',
          detalle: 'Cuando termines, cerrá la orden con foto del cierre y firma del cliente.',
          tono: 'accion',
        };
      }
      return {
        titulo: 'Esperando ejecución del técnico',
        detalle: 'El precio ya fue aprobado. El técnico está reparando.',
        tono: 'info',
      };

    case 'trabajo_realizado':
      if (rolSoportado === 'operaria' || rolSoportado === 'secretaria' ||
          rolSoportado === 'administrador' || rolSoportado === 'coordinadora') {
        return {
          titulo: 'Próximo paso: enviar a facturación',
          detalle: 'Validá el cierre del técnico y enviá la orden a facturación.',
          tono: 'accion',
        };
      }
      return {
        titulo: 'Esperando facturación',
        detalle: 'Oficina debe procesar la facturación del trabajo.',
        tono: 'espera',
      };

    case 'cerrado':
      return {
        titulo: 'Orden cerrada',
        detalle: 'No hay siguiente paso operativo.',
        tono: 'info',
      };

    default:
      return null;
  }
}

/**
 * Devuelve los className de Tailwind para el contenedor del banner según
 * el tono. Centralizado acá para que el componente sea visualmente
 * consistente con el resto de banners de OrdenDetalle (amber, yellow,
 * green).
 */
export function classNamesPorTono(tono: TonoSiguientePaso): {
  contenedor: string;
  titulo: string;
  detalle: string;
  icono: string;
} {
  switch (tono) {
    case 'accion':
      return {
        contenedor: 'bg-blue-50 border-2 border-blue-300',
        titulo: 'text-blue-900',
        detalle: 'text-blue-800',
        icono: 'text-blue-700',
      };
    case 'alerta':
      return {
        contenedor: 'bg-amber-50 border-2 border-amber-300',
        titulo: 'text-amber-900',
        detalle: 'text-amber-800',
        icono: 'text-amber-700',
      };
    case 'espera':
      return {
        contenedor: 'bg-gray-50 border-2 border-gray-300',
        titulo: 'text-gray-800',
        detalle: 'text-gray-600',
        icono: 'text-gray-500',
      };
    case 'info':
    default:
      return {
        contenedor: 'bg-emerald-50 border-2 border-emerald-200',
        titulo: 'text-emerald-900',
        detalle: 'text-emerald-800',
        icono: 'text-emerald-700',
      };
  }
}
