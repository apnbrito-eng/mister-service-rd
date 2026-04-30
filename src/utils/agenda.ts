/**
 * Constantes compartidas de slots de agenda y rangos válidos para
 * reprogramación de citas. Usadas tanto en el modal del cliente
 * (`src/components/public/ModalPosponer.tsx`) como en el panel admin
 * (`src/pages/Reprogramaciones.tsx`).
 *
 * Si cambian los horarios de atención o el rango máximo, modificá acá
 * y todos los puntos de uso quedan sincronizados.
 */

/**
 * Slots horarios disponibles para que cliente o admin propongan una
 * fecha+hora. `hour` es la hora local del día (0–23) usada al armar
 * el `Date` final.
 */
export const SLOTS_HORARIOS: ReadonlyArray<{ label: string; hour: number }> = [
  { label: '9:00 AM', hour: 9 },
  { label: '11:00 AM', hour: 11 },
  { label: '1:00 PM', hour: 13 },
  { label: '3:00 PM', hour: 15 },
  { label: '5:00 PM', hour: 17 },
];

/** Días en el futuro que dejamos abrir el calendario (reprogramación). */
export const MAX_DIAS_FUTURO = 60;
