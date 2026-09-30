import type { Usuario } from '../types';
import { puede } from './permisos';

export interface EnlaceSeguimiento { to: string; titulo: string; descripcion: string }

const OFICINA = ['administrador', 'coordinadora', 'secretaria', 'operaria'];
const DIRECCION = ['administrador', 'coordinadora'];

/**
 * Enlaces entre módulos de seguimiento. Cada condición copia el guard de su
 * ruta en App.tsx (RolRoute/PermisoRoute): no se muestra un enlace que la
 * ruta rechazaría. Si App.tsx cambia un guard, actualizar aquí y en el test.
 */
const ENLACES: (EnlaceSeguimiento & { permitido: (u: Usuario | null | undefined) => boolean })[] = [
  { to: '/admin/marketing', titulo: 'Marketing y seguimiento', descripcion: 'Origen de consultas, campañas y resultados con evidencia.', permitido: u => DIRECCION.includes(u?.rol || '') },
  { to: '/admin/inbox', titulo: 'Consultas (Inbox)', descripcion: 'Conversaciones de WhatsApp de la línea central.', permitido: u => OFICINA.includes(u?.rol || '') },
  { to: '/admin/clientes', titulo: 'Clientes y reactivación', descripcion: 'Historial del cliente y campañas de reactivación.', permitido: u => !!u && u.rol !== 'tecnico' },
  { to: '/admin/mantenimiento', titulo: 'Mantenimientos', descripcion: 'Próximos, de hoy y vencidos.', permitido: u => !!u && u.rol !== 'tecnico' },
  { to: '/admin/sugerencias-chequeo', titulo: 'Solo chequeo', descripcion: 'Clientes que diagnosticaron y pospusieron la reparación.', permitido: u => DIRECCION.includes(u?.rol || '') },
  { to: '/admin/feedback', titulo: 'Satisfacción', descripcion: 'Encuestas y detractores para dar seguimiento.', permitido: u => DIRECCION.includes(u?.rol || '') },
  { to: '/admin/conocimiento', titulo: 'Conocimiento', descripcion: 'Respuestas y procedimientos aprobados.', permitido: u => OFICINA.includes(u?.rol || '') },
  { to: '/admin/precios', titulo: 'Precios', descripcion: 'Catálogo de precios de servicios.', permitido: u => puede(u, 'configuracionVer') },
  { to: '/admin/configuracion-marketing', titulo: 'Plantillas de campaña', descripcion: 'Textos de reactivación y días de descanso entre contactos.', permitido: u => u?.rol === 'administrador' },
];

export function enlacesSeguimientoPara(u: Usuario | null | undefined): EnlaceSeguimiento[] {
  return ENLACES.filter(e => e.permitido(u)).map(({ to, titulo, descripcion }) => ({ to, titulo, descripcion }));
}
