export interface CandidataReparto { uid: string; nombre: string; rol: string; activo?: boolean; eliminado?: boolean; }
export interface PoncheReparto { personalUid: string; tipo: string; timestampMs: number; }
export function elegirResponsable(personas: CandidataReparto[], ponches: PoncheReparto[], ultimaUid?: string): CandidataReparto | null {
  const ultimos = new Map<string, PoncheReparto>();
  for (const p of ponches) { const previo = ultimos.get(p.personalUid); if (!previo || p.timestampMs > previo.timestampMs || (p.timestampMs === previo.timestampMs && p.tipo === 'salida')) ultimos.set(p.personalUid, p); }
  const candidatas = personas.filter(p => ['secretaria', 'operaria'].includes(p.rol) && p.activo !== false && !p.eliminado && ultimos.get(p.uid)?.tipo === 'entrada').sort((a, b) => a.uid.localeCompare(b.uid));
  if (!candidatas.length) return null;
  return candidatas.find(p => p.uid.localeCompare(ultimaUid || '') > 0) || candidatas[0];
}
