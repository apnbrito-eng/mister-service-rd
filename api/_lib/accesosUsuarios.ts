/** Política compartida por gestión y acceso. Nunca recibe ni persiste contraseñas. */
export const ROLES_PERSONAL = ['operaria', 'secretaria', 'tecnico', 'ayudante'] as const;
export function normalizarUsuario(valor: unknown): string {
  if (typeof valor !== 'string') throw new Error('Usuario inválido.');
  const usuario = valor.trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,39}$/.test(usuario)) throw new Error('Usa de 3 a 40 letras sin tildes, números, puntos o guiones.');
  return usuario;
}
export function sugerirUsuario(nombre: string, equipo: string): string {
  const base = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/).slice(0, 2).join('.');
  return `${base}${equipo === 'A' || equipo === 'B' ? `.${equipo.toLowerCase()}` : ''}`.slice(0, 40);
}
export function puedeGestionar(rol: string, supervisora: boolean) {
  return rol === 'administrador' || rol === 'coordinadora' && supervisora;
}
export function puedeModificar(rolActor: string, uidActor: string, uidObjetivo: string, rolObjetivo: string, supervisoraObjetivo: boolean) {
  if (uidActor === uidObjetivo) return false;
  return rolActor === 'administrador' || ROLES_PERSONAL.includes(rolObjetivo as typeof ROLES_PERSONAL[number]) && !supervisoraObjetivo;
}
