/**
 * equiposOperacion.ts — reparto real dado por Jorge el 01/10/2026.
 * Uso: datos semilla / referencia para poblar `personal.equipoOperacion` y especialidades.
 * NO crear usuarios nuevos con esto: emparejar con los registros existentes de `personal`
 * por nombre y confirmar con Jorge cualquier coincidencia dudosa (p. ej. "Reyes Guzmán / Aury").
 *
 * NO introduce reglas de negocio por copia. Metas, topes, políticas de ponche / asignación de van,
 * compensación, etc. son decisiones que viven en otra capa (configuración o decisión de Jorge).
 * Fix hallazgo QA 2026-10-01 §13: antes la nota de Wilmer afirmaba cosas sobre ponche/van que no
 * se desprenden de la instrucción financiera. Se dejan afuera a la espera de confirmación.
 */
export type Especialidad = 'nevera' | 'lavadora' | 'secadora' | 'estufa' | 'aire';
export type EquipoOperacion = 'A' | 'B';

/** Wila es el nombre usado por Jorge para Wilainy en el reparto del 01/10.
 * Alias explícitos; no se deducen equipos por prefijos parecidos. */
export function equipoDeOperaria(nombre: string | undefined): EquipoOperacion | null {
  const primero = (nombre ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().split(/\s+/)[0];
  return primero === 'wila' || primero === 'wilainy' ? 'A' : primero === 'yohana' ? 'B' : null;
}

export interface MiembroTecnico {
  nombre: string;
  /** apodos con que lo llaman en la oficina; no mostrar en la interfaz */
  apodos?: string[];
  equipo: EquipoOperacion;
  /** equipos que repara */
  repara: Especialidad[];
  /** equipos en los que solo hace mantenimiento */
  soloMantenimiento?: Especialidad[];
  contratista?: boolean;
  nota?: string;
}

export const EQUIPOS: Record<EquipoOperacion, { operaria: string; asistente: string }> = {
  A: { operaria: 'Wila', asistente: 'Leany' },
  B: { operaria: 'Yohana', asistente: 'Disnely' },
};

export const TECNICOS: MiembroTecnico[] = [
  // Equipo A — Wila y Leany
  { nombre: 'Yoniel', equipo: 'A', repara: ['nevera', 'lavadora', 'secadora', 'estufa', 'aire'] },
  { nombre: 'Reyes Guzmán', apodos: ['Aury'], equipo: 'A', repara: ['lavadora', 'secadora'] },
  { nombre: 'Diorky', equipo: 'A', repara: ['lavadora', 'secadora'] },
  { nombre: 'Albert Brito', equipo: 'A', repara: ['aire'], soloMantenimiento: ['lavadora', 'secadora', 'estufa'] },
  { nombre: 'Wilfredo', apodos: ['Gata salvaje'], equipo: 'A', repara: ['estufa'] },

  // Equipo B — Yohana y Disnely
  {
    nombre: 'Wilmer', equipo: 'B', repara: ['nevera'], contratista: true,
    nota: 'Contratista. Ganancia 50/50 después de rebajar el costo de la pieza (instrucción financiera de Jorge, 2026-10-01). Políticas de ponche y asignación de van NO están decididas acá; dependen de Jorge y de la configuración operativa.',
  },
  { nombre: 'Franklin', apodos: ['Fredin'], equipo: 'B', repara: ['estufa'] },
  { nombre: 'Yunior', apodos: ['Suave'], equipo: 'B', repara: ['lavadora', 'secadora'] },
  { nombre: 'José Alberto', apodos: ['Yow'], equipo: 'B', repara: ['lavadora', 'secadora'] },
  { nombre: 'Miguel', equipo: 'B', repara: ['nevera', 'lavadora', 'secadora'] },
];

/** ¿Puede este técnico tomar la orden? Útil para sugerir técnico al agendar (no bloquear: la oficina decide). */
export function puedeAtender(t: MiembroTecnico, equipo: Especialidad, tipo: 'reparacion' | 'mantenimiento'): boolean {
  if (t.repara.includes(equipo)) return true;
  return tipo === 'mantenimiento' && !!t.soloMantenimiento?.includes(equipo);
}
