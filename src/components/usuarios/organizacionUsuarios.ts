export function grupoPersona(p: { equipo: string; rol: string }) {
  if (p.equipo) return p.equipo;
  return ['administrador', 'coordinadora'].includes(p.rol) ? 'Dirección' : 'Sin equipo';
}
