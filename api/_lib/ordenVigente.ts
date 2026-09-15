/** Los números pueden repetirse en pruebas eliminadas; nunca elegir por posición. */
export function seleccionarOrdenVigente<T extends { data(): { eliminada?: unknown } }>(documentos: T[]): T | null {
  const vigentes = documentos.filter(d => d.data().eliminada !== true);
  if (vigentes.length > 1) throw new Error('Hay varias órdenes vigentes con ese número. Administración debe revisar la duplicidad antes de continuar.');
  return vigentes[0] ?? null;
}
