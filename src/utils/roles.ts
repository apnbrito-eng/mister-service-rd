import type { Rol } from '../types';

/**
 * Orden jerárquico de los roles del sistema para agrupar listas en la UI.
 * Cualquier pantalla que agrupe personal/usuarios por rol debe respetar este orden.
 */
export const JERARQUIA_ROLES = [
  'administrador',
  'coordinadora',
  'operaria',
  'secretaria',
  'tecnico',
  'ayudante',
] as const;

export const LABEL_ROL_PLURAL: Record<Rol, string> = {
  administrador: 'Administradores',
  coordinadora: 'Coordinadoras',
  operaria: 'Operarias',
  secretaria: 'Secretarias',
  tecnico: 'Técnicos',
  ayudante: 'Ayudantes',
};

export const ICONO_ROL: Record<Rol, string> = {
  administrador: '🛡️',
  coordinadora: '🧑‍💼',
  operaria: '🧑‍🔧',
  secretaria: '📋',
  tecnico: '🛠️',
  ayudante: '🤝',
};

export interface GrupoRol<T> {
  rol: Rol | 'otros';
  label: string;
  icono: string;
  items: T[];
}

/**
 * Agrupa una lista de items con campo `rol` por rol en el orden jerárquico
 * definido en `JERARQUIA_ROLES`. Los grupos vacíos se omiten. Items con
 * rol inválido/null/undefined se envían a una sección "Otros" al final
 * para que no se pierdan de la vista.
 *
 * Preserva el orden interno original de cada grupo (estable) — el llamante
 * puede ordenar la lista antes de agrupar para controlar el orden dentro
 * de cada sección.
 */
export function agruparPorRol<T extends { rol?: string | null }>(
  items: T[]
): GrupoRol<T>[] {
  const grupos: GrupoRol<T>[] = JERARQUIA_ROLES.map(rol => ({
    rol,
    label: LABEL_ROL_PLURAL[rol],
    icono: ICONO_ROL[rol],
    items: items.filter(i => i.rol === rol),
  })).filter(g => g.items.length > 0);

  // Capturar items con rol inválido/null/undefined en sección "Otros" al final
  const otros = items.filter(
    i => !i.rol || !(JERARQUIA_ROLES as readonly string[]).includes(i.rol)
  );
  if (otros.length > 0) {
    grupos.push({
      rol: 'otros',
      label: 'Otros',
      icono: '❓',
      items: otros,
    });
  }
  return grupos;
}
