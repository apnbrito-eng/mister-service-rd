/** Una comisión agregada por orden real/persona; manuales pueden repartir por ítems y quedan fuera. */
export function comisionesDuplicadasNomina(registros: { id: string; datos: Record<string, unknown> }[], personas: { id: string; uid?: string }[]): Map<string, string[]> {
  const grupos = new Map<string, { personalId: string; ids: string[]; pendiente: boolean }>();
  for (const { id, datos: c } of registros) {
    if (c.estaAnulada || c.estadoLiquidacion === 'anulada' || typeof c.ordenId !== 'string' || !c.ordenId || c.ordenId.startsWith('factura-manual-')) continue;
    if (typeof c.tecnicoId !== 'string' || !c.tecnicoId) continue;
    const duenos = personas.filter(p => p.id === c.tecnicoId || (!!p.uid && p.uid === c.tecnicoId));
    if (duenos.length !== 1) continue;
    const key = JSON.stringify([c.ordenId, duenos[0].id]);
    const grupo = grupos.get(key) || { personalId: duenos[0].id, ids: [], pendiente: false };
    grupo.pendiente ||= !c.estadoLiquidacion || c.estadoLiquidacion === 'pendiente';
    grupo.ids.push(id); grupos.set(key, grupo);
  }
  const resultado = new Map<string, string[]>();
  for (const g of grupos.values()) if (g.ids.length > 1 && g.pendiente) resultado.set(g.personalId, [...(resultado.get(g.personalId) || []), ...g.ids]);
  return resultado;
}
