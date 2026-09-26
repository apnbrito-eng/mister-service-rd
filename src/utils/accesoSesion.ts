/** Misma decisión de entrada para web y app; nunca conservar un rol desconocido. */
export function perfilHabilitado(perfil: { rol?: string; activo?: boolean; eliminado?: boolean } | null | undefined) {
  return !!perfil && perfil.activo !== false && perfil.eliminado !== true && ['administrador', 'coordinadora', 'secretaria', 'operaria', 'tecnico', 'ayudante'].includes(perfil.rol || '');
}
export function inicioPorRol(rol?: string) {
  if (rol === 'tecnico') return '/tecnico';
  if (rol === 'ayudante') return '/ponche';
  return ['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(rol || '') ? '/admin/dashboard' : '/login';
}
