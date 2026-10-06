/** Identity aliases come from trusted Personal records, never request data. */
export interface PersonaActividad { id: string; data: Record<string, unknown> }
const activo = (p: Record<string, unknown>) => p.activo !== false && p.eliminado !== true;
export function identidadActividad(uid: string, perfil: Record<string, unknown>, personas: PersonaActividad[]) {
  const propias = personas.filter(p => activo(p.data) && (p.id === uid || p.data.uid === uid));
  const ids = new Set([uid, ...propias.map(p => p.id)]);
  const operarias = new Set<string>();
  const equipos = new Set<string>();
  for (const p of [perfil, ...propias.map(p => p.data)]) {
    if (typeof p.operariaId === 'string' && p.operariaId) {
      operarias.add(p.operariaId);
      const responsable = personas.find(r => r.id === p.operariaId && activo(r.data));
      if (typeof responsable?.data.uid === 'string') operarias.add(responsable.data.uid);
    }
    if (typeof p.equipoId === 'string' && p.equipoId) equipos.add(p.equipoId);
  }
  return { ids, operarias, equipos };
}
export function oficinaActividad(uid: string, perfil: Record<string, unknown>, personas: PersonaActividad[], orden: Record<string, unknown>): boolean {
  if (!activo(perfil)) return false;
  if (perfil.rol === 'administrador' || perfil.rol === 'coordinadora') return true;
  if (perfil.rol !== 'operaria' && perfil.rol !== 'secretaria') return false;
  const identidad = identidadActividad(uid, perfil, personas);
  return typeof orden.operariaId === 'string' && (identidad.ids.has(orden.operariaId) || identidad.operarias.has(orden.operariaId))
    || typeof orden.equipoId === 'string' && identidad.equipos.has(orden.equipoId);
}
