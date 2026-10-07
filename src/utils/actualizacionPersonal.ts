import { deleteField } from 'firebase/firestore';

/** Vaciar un campo opcional debe eliminar el valor existente, no omitir la escritura. */
export function limpiarActualizacion(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === undefined ? deleteField() : v]));
}
