/**
 * Catálogo de plantillas HSM APPROVED en Meta (SPRINT-INBOX-7-SELECTOR-PLANTILLAS,
 * 2026-05-21). Sirve al selector del Inbox cuando la ventana 24h está cerrada
 * y el operador necesita reabrir conversación con una plantilla HSM.
 *
 * IMPORTANTE: el `nombre` y el ORDEN de `variables` DEBEN matchear EXACTAMENTE
 * la plantilla aprobada en Meta Business Manager. Las variables se mapean a
 * `{{1}}`, `{{2}}`, ... en el orden de este array — un mismatch genera error
 * 502 desde Meta y el mensaje no sale.
 *
 * Fuentes consultadas para definir el orden:
 *  - `docs/sprints/DIARIO_2026-05-19.md:503` — curl E2E real con
 *    `cita_confirmada` usado ["Jorge","jue 22/05 9:30am","OS-9999","Aury",
 *    "sin notas"].
 *  - `docs/sprints/ANALISIS_PLAN_WHATSAPP_VS_PLAN_EJECUTIVO.md:273-276` —
 *    tabla resumen de variables por plantilla.
 *  - `docs/sprints/BLOQUEOS.md:138` — IDs de las 4 plantillas APPROVED.
 *
 * NOTA WA-5: cuando se implemente el cache `whatsapp_plantillas` (sync con
 * Meta APPROVED), este config será reemplazable por la lectura del cache.
 * Mantener compatibilidad de la forma `PlantillaCatalogo`.
 */
import type { OrdenServicio, Cliente } from '../types';

export type IdiomaPlantilla = 'es' | 'es_DO';

export type AutopopularDe =
  | 'cliente.nombrePrimero'
  | 'cliente.nombre'
  | 'orden.numero'
  | 'orden.fechaCitaCorta'
  | 'orden.tecnicoNombre'
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
}

/**
 * 4 plantillas APPROVED en Meta (WABA `1884486412326904`).
 *
 * Mapeo de variables verificado contra curl E2E real (DIARIO_2026-05-19.md):
 *   cita_confirmada → ["nombre", "fechaHora", "OS#", "tecnico", "notas"]
 */
export const PLANTILLAS_WHATSAPP: PlantillaCatalogo[] = [
  {
    nombre: 'cita_confirmada',
    titulo: 'Cita confirmada',
    descripcion: 'Confirma la cita con el cliente (post-agendamiento).',
    idioma: 'es',
    variables: [
      {
        label: 'Nombre del cliente',
        hint: 'Solo el primer nombre suele ir mejor.',
        autopopular: 'cliente.nombrePrimero',
      },
      {
        label: 'Fecha y hora',
        hint: 'Ej: jue 22/05 9:30am',
        autopopular: 'orden.fechaCitaCorta',
      },
      {
        label: 'Numero de orden',
        hint: 'Ej: OS-0123',
        autopopular: 'orden.numero',
      },
      {
        label: 'Tecnico asignado',
        hint: 'Nombre del tecnico que va a la cita.',
        autopopular: 'orden.tecnicoNombre',
      },
      {
        label: 'Notas (opcional)',
        hint: 'Cualquier detalle extra. Si no hay, escribi "sin notas".',
        autopopular: 'orden.notas',
        opcional: true,
      },
    ],
  },
  {
    nombre: 'conduce_emitido',
    titulo: 'Conduce emitido',
    descripcion: 'Aviso al cliente de que se emitio el conduce de garantia.',
    idioma: 'es',
    variables: [
      {
        label: 'Nombre del cliente',
        autopopular: 'cliente.nombrePrimero',
      },
      {
        label: 'Numero de conduce',
        hint: 'Ej: CG-00018',
        autopopular: 'manual',
      },
      {
        label: 'Monto total',
        hint: 'Ej: RD$3,500.00',
        autopopular: 'manual',
      },
    ],
  },
  {
    nombre: 'recordatorio_mantenimiento',
    titulo: 'Recordatorio mantenimiento',
    descripcion: 'Recordatorio preventivo de mantenimiento (cliente recurrente).',
    idioma: 'es',
    variables: [
      {
        label: 'Nombre del cliente',
        autopopular: 'cliente.nombrePrimero',
      },
      {
        label: 'Fecha del ultimo servicio',
        hint: 'Ej: 15/02/2026',
        autopopular: 'manual',
      },
    ],
  },
  {
    nombre: 'garantia_por_vencer',
    titulo: 'Garantia por vencer',
    descripcion: 'Aviso de garantia proxima a vencer (oportunidad CRM).',
    idioma: 'es',
    variables: [
      {
        label: 'Nombre del cliente',
        autopopular: 'cliente.nombrePrimero',
      },
      {
        label: 'Numero de orden',
        hint: 'Ej: OS-0123',
        autopopular: 'orden.numero',
      },
      {
        label: 'Fecha de vencimiento',
        hint: 'Ej: 30/06/2026',
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
    case 'orden.numero':
      return orden?.numero?.trim() ?? '';
    case 'orden.fechaCitaCorta':
      return formatearFechaCitaCorta(orden?.fechaCita);
    case 'orden.tecnicoNombre':
      return orden?.tecnicoNombre?.trim() ?? '';
    case 'orden.notas':
      return (orden?.notas ?? orden?.descripcionFalla ?? '').trim();
    case 'manual':
    default:
      return '';
  }
}
