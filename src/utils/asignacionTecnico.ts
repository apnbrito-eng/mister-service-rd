/** Una coincidencia de nombres nunca demuestra que una orden esté asignada. */
export function esOrdenAsignada(orden: { tecnicoId?: string }, uid?: string, personalId?: string): boolean {
  return !!orden.tecnicoId && (orden.tecnicoId === uid || orden.tecnicoId === personalId);
}
