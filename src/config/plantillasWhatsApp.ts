/**
 * Catálogo de plantillas HSM APPROVED en Meta (SPRINT-INBOX-7-SELECTOR-PLANTILLAS
 * 2026-05-21, REFACTORIZADO en SPRINT-WA-FIX-PLANTILLAS-PARAMS 2026-05-25
 * tras rediseño de Meta del ~15 may 2026: variables nuevas + encabezado IMAGE
 * por plantilla). Sirve al selector del Inbox para enviar HSM (única vía para
 * reabrir ventana 24h vencida, o iniciar conversación).
 *
 * IMPORTANTE: el `nombre`, el ORDEN de `variables`, su CANTIDAD y el
 * `imagenEncabezadoUrl` DEBEN matchear EXACTAMENTE la plantilla aprobada en
 * Meta Business Manager. Un mismatch genera:
 *   - #132000 si cantidad de variables no coincide.
 *   - #132012 si Meta espera header IMAGE y no lo recibe (o viceversa).
 *   - Contenido en slots equivocados si el orden es distinto.
 *
 * Fuente de verdad del rediseño: `docs/sprints/PLANTILLAS_META_SPEC_2026-05-25.md`
 * (capturas de Jorge del Administrador WhatsApp + verificación independiente
 * de Claude in Chrome). Ver sección "⚠️ CORRECCIÓN IMPORTANTE" para por qué
 * el fix es 100% frontend (send.ts ya soporta `headerImageUrl`).
 *
 * NOTA WA-5 (futuro): cuando se implemente el cache `whatsapp_plantillas`
 * (sync con Meta APPROVED), este config será reemplazable por la lectura del
 * cache. Mantener compatibilidad de la forma `PlantillaCatalogo`.
 */
import type { OrdenServicio, Cliente } from '../types';

export type IdiomaPlantilla = 'es' | 'es_DO';

export type AutopopularDe =
  | 'cliente.nombrePrimero'
  | 'cliente.nombre'
  | 'cliente.direccion'
  | 'orden.numero'
  | 'orden.fechaCitaCorta'
  | 'orden.fechaCitaDia'
  | 'orden.fechaCitaHora'
  | 'orden.tecnicoNombre'
  | 'orden.equipoTipo'
  | 'orden.notas'
  | 'manual';

export interface VariablePlantilla {
  /** Etiqueta legible (label) que ve el operador en el mini-wizard. */
  label: string;
  /** Pista corta debajo del input. */
  hint?: string;
  /** De dónde puede auto-popularse cuando hay orden activa del cliente. */
  autopopular?: AutopopularDe;
  /** Si true, el operador debe poder dejarlo vacío (ej: notas opcionales). */
  opcional?: boolean;
}

export interface PlantillaCatalogo {
  /** Nombre exacto de la plantilla en Meta — no traducir. */
  nombre: string;
  /** Label legible para el operador en el selector. */
  titulo: string;
  /** Una frase corta explicando para qué sirve. */
  descripcion: string;
  /** Idioma APPROVED en Meta. */
  idioma: IdiomaPlantilla;
  /** Variables en orden — mapean a {{1}}, {{2}}, ... */
  variables: VariablePlantilla[];
  /**
   * URL https de la imagen del encabezado IMAGE de la plantilla. Si Meta tiene
   * configurado header IMAGE para esta plantilla, declarar acá la URL del
   * banner branded. Debe empezar con `https://` (send.ts ignora silenciosamente
   * si no cumple y cae al logo fallback). Si la plantilla NO tiene header
   * IMAGE en Meta, dejar undefined.
   */
  imagenEncabezadoUrl?: string;
}

/**
 * 4 plantillas APPROVED en Meta. Variables + encabezado IMAGE alineados con
 * `docs/sprints/PLANTILLAS_META_SPEC_2026-05-25.md` (rediseño ~15 may 2026).
 *
 * Las imágenes branded viven en `public/plantillas/` y se sirven en
 * `https://www.misterservicerd.com/plantillas/<archivo>.png`.
 *
 * `auto_respuesta_fuera_horario` queda FUERA de este catálogo: es auto-reply
 * del webhook, no se envía desde el selector del inbox.
 */
export const PLANTILLAS_WHATSAPP: PlantillaCatalogo[] = [
  {
    nombre: 'cita_confirmada',
    titulo: 'Cita confirmada',
    descripcion: 'Confirma la cita con el cliente (post-agendamiento).',
    idioma: 'es',
    imagenEncabezadoUrl:
      'https://www.misterservicerd.com/plantillas/cita_confirmada.png',
    variables: [
      {
        label: 'Nombre del cliente',
        hint: 'Solo el primer nombre suele ir mejor.',
        autopopular: 'cliente.nombrePrimero',
      },
      {
        label: 'Dia',
        hint: 'Ej: jue 22/05',
        autopopular: 'orden.fechaCitaDia',
      },
      {
        label: 'Hora',
        hint: 'Ej: 9:30am',
        autopopular: 'orden.fechaCitaHora',
      },
      {
        label: 'Tecnico asignado',
        hint: 'Nombre del tecnico que va a la cita.',
        autopopular: 'orden.tecnicoNombre',
      },
      {
        label: 'Direccion',
        hint: 'Direccion donde se hace la visita.',
        autopopular: 'cliente.direccion',
      },
    ],
  },
  {
    nombre: 'conduce_emitido',
    titulo: 'Conduce emitido',
    descripcion: 'Aviso al cliente de que se emitio el conduce de garantia.',
    idioma: 'es',
    imagenEncabezadoUrl:
      'https://www.misterservicerd.com/plantillas/conduce_emitido.png',
    variables: [
      {
        label: 'Nombre del cliente',
        autopopular: 'cliente.nombrePrimero',
      },
      {
        label: 'Numero de conduce',
        hint: 'Ej: CG-00019',
        autopopular: 'manual',
      },
      {
        label: 'Dias de garantia',
        hint: 'Default 60.',
        autopopular: 'manual',
      },
      {
        label: 'Enlace al portal de garantia',
        hint: 'Ej: https://misterservicerd.com/cliente/<token>',
        autopopular: 'manual',
      },
    ],
  },
  {
    nombre: 'recordatorio_mantenimiento',
    titulo: 'Recordatorio mantenimiento',
    descripcion: 'Recordatorio preventivo de mantenimiento (cliente recurrente).',
    idioma: 'es',
    imagenEncabezadoUrl:
      'https://www.misterservicerd.com/plantillas/recordatorio_mantenimiento.png',
    variables: [
      {
        label: 'Nombre del cliente',
        autopopular: 'cliente.nombrePrimero',
      },
      {
        label: 'Numero de meses',
        hint: 'Ej: 6',
        autopopular: 'manual',
      },
      {
        label: 'Equipo',
        hint: 'Ej: Lavadora.',
        autopopular: 'orden.equipoTipo',
      },
    ],
  },
  {
    nombre: 'garantia_por_vencer',
    titulo: 'Garantia por vencer',
    descripcion: 'Aviso de garantia proxima a vencer (oportunidad CRM).',
    idioma: 'es',
    imagenEncabezadoUrl:
      'https://www.misterservicerd.com/plantillas/garantia_por_vencer.png',
    variables: [
      {
        label: 'Nombre del cliente',
        autopopular: 'cliente.nombrePrimero',
      },
      {
        label: 'Fecha de vencimiento',
        hint: 'Ej: 30/06/2026',
        autopopular: 'manual',
      },
      {
        label: 'Equipo',
        hint: 'Ej: Nevera.',
        autopopular: 'orden.equipoTipo',
      },
      {
        label: 'Numero de orden',
        hint: 'Ej: OS-0123',
        autopopular: 'orden.numero',
      },
      {
        label: 'Enlace al portal de garantia',
        hint: 'Ej: https://misterservicerd.com/cliente/<token>',
        autopopular: 'manual',
      },
    ],
  },
];

/**
 * Formatea la fechaCita de una orden como string corto en español.
 * Ej: "jue 22/05 9:30am". Si no hay fechaCita, retorna ''.
 */
export function formatearFechaCitaCorta(fecha: Date | undefined): string {
  if (!fecha || !(fecha instanceof Date) || isNaN(fecha.getTime())) return '';
  const dias = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
  const dia = dias[fecha.getDay()] ?? '';
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  let horas = fecha.getHours();
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  const ampm = horas >= 12 ? 'pm' : 'am';
  horas = horas % 12;
  if (horas === 0) horas = 12;
  return `${dia} ${dd}/${mm} ${horas}:${minutos}${ampm}`;
}

/**
 * Solo la parte "día" de la fechaCita: "jue 22/05". '' si no hay fecha.
 * Wrapper sobre `formatearFechaCitaCorta` que parte por el primer espacio
 * antes del horario.
 */
export function formatearFechaCitaDia(fecha: Date | undefined): string {
  if (!fecha || !(fecha instanceof Date) || isNaN(fecha.getTime())) return '';
  const dias = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
  const dia = dias[fecha.getDay()] ?? '';
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dia} ${dd}/${mm}`;
}

/**
 * Solo la parte "hora" de la fechaCita: "9:30am". '' si no hay fecha.
 */
export function formatearFechaCitaHora(fecha: Date | undefined): string {
  if (!fecha || !(fecha instanceof Date) || isNaN(fecha.getTime())) return '';
  let horas = fecha.getHours();
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  const ampm = horas >= 12 ? 'pm' : 'am';
  horas = horas % 12;
  if (horas === 0) horas = 12;
  return `${horas}:${minutos}${ampm}`;
}

/**
 * Resuelve el valor inicial de una variable a partir del cliente + orden
 * activa (si hay). Si no encuentra fuente, retorna ''. El operador puede
 * editar libremente despues.
 */
export function autopopularValor(
  variable: VariablePlantilla,
  contexto: {
    cliente: Cliente | null;
    orden: OrdenServicio | null;
  },
): string {
  if (!variable.autopopular) return '';
  const { cliente, orden } = contexto;
  switch (variable.autopopular) {
    case 'cliente.nombre':
      return cliente?.nombre?.trim() ?? '';
    case 'cliente.nombrePrimero': {
      const n = cliente?.nombre?.trim() ?? '';
      if (!n) return '';
      return n.split(/\s+/)[0] ?? '';
    }
    case 'cliente.direccion':
      return cliente?.direccion?.trim() ?? '';
    case 'orden.numero':
      return orden?.numero?.trim() ?? '';
    case 'orden.fechaCitaCorta':
      return formatearFechaCitaCorta(orden?.fechaCita);
    case 'orden.fechaCitaDia':
      return formatearFechaCitaDia(orden?.fechaCita);
    case 'orden.fechaCitaHora':
      return formatearFechaCitaHora(orden?.fechaCita);
    case 'orden.tecnicoNombre':
      return orden?.tecnicoNombre?.trim() ?? '';
    case 'orden.equipoTipo':
      return orden?.equipoTipo?.trim() ?? '';
    case 'orden.notas':
      return (orden?.notas ?? orden?.descripcionFalla ?? '').trim();
    case 'manual':
    default:
      return '';
  }
}
