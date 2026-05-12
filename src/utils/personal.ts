import type { Rol } from '../types';

/**
 * Constantes y helpers compartidos del módulo Personal (SPRINT-142d, 2026-05-11).
 *
 * Antes vivían duplicadas en:
 * - `src/pages/PersonalPage.tsx`
 * - `src/components/personal/FormAltaEditarEmpleado.tsx` (SPRINT-142a)
 * - `src/components/personal/GruposOperariaTecnico.tsx` (SPRINT-142c)
 * - `src/components/personal/ModalConfirmarEliminar.tsx` (SPRINT-142b)
 *
 * Consolidadas a un único source of truth en este archivo.
 */

/** Labels en español para mostrar el rol en UI (singular). */
export const ROL_LABELS: Record<Rol, string> = {
  administrador: 'Administrador',
  coordinadora: 'Coordinadora',
  secretaria: 'Secretaria',
  operaria: 'Operaria',
  tecnico: 'Técnico',
  ayudante: 'Ayudante',
};

/** Clases Tailwind para badges de rol en listas/tablas. */
export const ROL_COLORS: Record<Rol, string> = {
  administrador: 'bg-purple-100 text-purple-700',
  coordinadora: 'bg-violet-100 text-violet-700',
  secretaria: 'bg-blue-100 text-blue-700',
  operaria: 'bg-teal-100 text-teal-700',
  tecnico: 'bg-orange-100 text-orange-700',
  ayudante: 'bg-slate-100 text-slate-700',
};

/** Roles que reciben comisión: usan campos `nivel` + `comisionPorcentaje`. */
export const ROLES_CON_COMISION: Rol[] = ['tecnico', 'operaria', 'secretaria', 'coordinadora'];

/** Orden visual del select de rol en formularios de alta/edición. */
export const ROL_SELECT_ORDEN: Rol[] = ['administrador', 'coordinadora', 'operaria', 'secretaria', 'tecnico', 'ayudante'];

/** Porcentaje de comisión por defecto al elegir nivel (senior 10%, junior 8%). */
export function comisionDefaultPorNivel(nivel: 'junior' | 'senior'): number {
  return nivel === 'senior' ? 10 : 8;
}
