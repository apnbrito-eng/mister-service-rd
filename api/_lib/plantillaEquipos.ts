/** Composición confirmada por gerencia el 01/10/2026. Sin claves ni correos. */
export const plantillaEquipos = [
  { nombre: 'Jorge', existentes: ['Jorge'], usuario: 'jorge', equipo: '', rol: 'administrador', especialidad: '', direccion: true },
  { nombre: 'Maria Teresa', existentes: ['Maria Teresa'], usuario: 'maria', equipo: '', rol: 'coordinadora', especialidad: '', direccion: true },
  { nombre: 'Wila', existentes: ['Wilainy Operaria'], usuario: 'wila.a', equipo: 'A', rol: 'operaria', especialidad: '' },
  { nombre: 'Leany', existentes: ['Leany'], usuario: 'leany.a', equipo: 'A', rol: 'secretaria', especialidad: '' },
  { nombre: 'Yoniel', existentes: ['Yoniel Lavadora Secadora Estufa Nevera Aire'], usuario: 'yoniel.a', equipo: 'A', rol: 'tecnico', especialidad: 'Neveras, lavadoras, secadoras, estufas y aires acondicionados' },
  { nombre: 'Reyes Guzmán (Aury)', existentes: ['Aury Mon'], usuario: 'aury.a', equipo: 'A', rol: 'tecnico', especialidad: 'Lavadoras y secadoras' },
  { nombre: 'Diorky', existentes: ['Diorky Lavadora Secadora'], usuario: 'diorky.a', equipo: 'A', rol: 'tecnico', especialidad: 'Lavadoras y secadoras' },
  { nombre: 'Albert Brito', existentes: ['Albert Mantenimientos Aire/Lavadora/secadora/Estufa'], usuario: 'albert.a', equipo: 'A', rol: 'tecnico', especialidad: 'Aires acondicionados; mantenimiento de lavadoras, secadoras y estufas' },
  { nombre: 'Wilfredo (Gata salvaje)', existentes: ['Wilfredo Estufas'], usuario: 'wilfredo.a', equipo: 'A', rol: 'tecnico', especialidad: 'Estufas' },
  { nombre: 'Yohana', existentes: ['Yohana Operaria'], usuario: 'yohana.b', equipo: 'B', rol: 'operaria', especialidad: '' },
  { nombre: 'Disnely', existentes: ['Disnely'], usuario: 'disnely.b', equipo: 'B', rol: 'secretaria', especialidad: '' },
  { nombre: 'Wilmer', existentes: ['Wilmer Contratista Nevera'], usuario: 'wilmer.b', equipo: 'B', rol: 'tecnico', especialidad: 'Neveras (contratista)' },
  { nombre: 'Franklin (Fredin)', existentes: ['Franklin', 'Franklin Fredin', 'Franklin (Fredin)'], usuario: 'franklin.b', equipo: 'B', rol: 'tecnico', especialidad: 'Estufas' },
  { nombre: 'Yunior (Suave)', existentes: ['Yunior Lavadora Secadora'], usuario: 'yunior.b', equipo: 'B', rol: 'tecnico', especialidad: 'Lavadoras y secadoras' },
  { nombre: 'José Alberto (Yow)', existentes: ['José Yow Lavadora/Secadora'], usuario: 'jose.yow.b', equipo: 'B', rol: 'tecnico', especialidad: 'Lavadoras y secadoras' },
  { nombre: 'Miguel', existentes: ['Miguel oriental Lavadora/Secadora/Nevera/Estufa'], usuario: 'miguel.b', equipo: 'B', rol: 'tecnico', especialidad: 'Neveras, lavadoras y secadoras' },
];
export function coincidirPersona<T extends { nombre: string; usuario: string }>(fila: typeof plantillaEquipos[number], personas: T[]): T | undefined {
  const matches = personas.filter(p => p.usuario === fila.usuario || p.nombre === fila.nombre || fila.existentes.includes(p.nombre));
  if (matches.length > 1) throw new Error(`Hay varias cuentas para ${fila.nombre}. Revisa las coincidencias antes de aplicar.`);
  return matches[0];
}
