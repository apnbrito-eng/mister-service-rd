import {
  Usuario,
  Rol,
  PermisosSistema,
  PERMISOS_DEFAULT_ADMINISTRADOR,
  PERMISOS_DEFAULT_COORDINADORA,
  PERMISOS_DEFAULT_OPERARIA,
  PERMISOS_DEFAULT_SECRETARIA,
  PERMISOS_DEFAULT_TECNICO_SISTEMA,
  PERMISOS_DEFAULT_AYUDANTE,
  PERMISOS_TODO_FALSE,
} from '../types';

const DEFAULTS_POR_ROL: Record<Rol, PermisosSistema> = {
  administrador: PERMISOS_DEFAULT_ADMINISTRADOR,
  coordinadora: PERMISOS_DEFAULT_COORDINADORA,
  operaria: PERMISOS_DEFAULT_OPERARIA,
  secretaria: PERMISOS_DEFAULT_SECRETARIA,
  tecnico: PERMISOS_DEFAULT_TECNICO_SISTEMA,
  ayudante: PERMISOS_DEFAULT_AYUDANTE,
};

/**
 * Resuelve los permisos efectivos del usuario.
 * - Sin profile: todo false (evita exponer acciones a usuarios sin sesión).
 * - Si tiene `permisosPersonalizados === true` y `permisosSistema`, usa eso.
 * - Si es técnico con `permisos` legacy pero sin `permisosSistema`, mapea
 *   los flags legacy al nuevo shape (retrocompat).
 * - Si nada, usa los defaults del rol.
 */
export function obtenerPermisos(userProfile: Usuario | null | undefined): PermisosSistema {
  if (!userProfile) return PERMISOS_TODO_FALSE;
  if (userProfile.permisosPersonalizados && userProfile.permisosSistema) {
    return userProfile.permisosSistema;
  }
  // Retrocompat: técnico con permisos legacy pero sin nuevo permisosSistema
  if (userProfile.rol === 'tecnico' && userProfile.permisos && !userProfile.permisosSistema) {
    const base = { ...PERMISOS_DEFAULT_TECNICO_SISTEMA };
    base.tecnicoVistaAgenda = userProfile.permisos.vistaAgenda;
    base.tecnicoSoloPropiasCitas = userProfile.permisos.soloPropiasCitas;
    base.tecnicoVerTelefonoCliente = userProfile.permisos.verTelefonoCliente;
    base.tecnicoVerEmailCliente = userProfile.permisos.verEmailCliente;
    base.tecnicoVerDireccionCliente = userProfile.permisos.verDireccionCliente;
    base.tecnicoVerUbicacionGPS = userProfile.permisos.verUbicacionGPS;
    base.tecnicoPuedeMarcarCompletado = userProfile.permisos.puedeMarcarCompletado;
    base.tecnicoPuedeAgregarNotas = userProfile.permisos.puedeAgregarNotas;
    base.tecnicoPuedeVerHistorial = userProfile.permisos.puedeVerHistorial;
    base.tecnicoPuedeContactarCliente = userProfile.permisos.puedeContactarCliente;
    base.tecnicoPuedeVerCotizaciones = userProfile.permisos.puedeVerCotizaciones;
    base.tecnicoRecibeNotificacionNuevaCita = userProfile.permisos.recibeNotificacionNuevaCita;
    return base;
  }
  return DEFAULTS_POR_ROL[userProfile.rol] || PERMISOS_TODO_FALSE;
}

export type AccionPermiso = keyof PermisosSistema;

export function puede(userProfile: Usuario | null | undefined, accion: AccionPermiso): boolean {
  return obtenerPermisos(userProfile)[accion] === true;
}

/** Devuelve los defaults de un rol (útil para inicializar el editor de overrides) */
export function permisosDefaultDeRol(rol: Rol): PermisosSistema {
  return { ...(DEFAULTS_POR_ROL[rol] || PERMISOS_TODO_FALSE) };
}

/**
 * Default del toggle de Asistente IA por rol.
 * ON por defecto para administrador y coordinadora; OFF para el resto.
 * Los roles tecnico y ayudante quedan bloqueados en la UI (disponible en fase futura).
 */
export function iaHabilitadaDefaultPorRol(rol: Rol): boolean {
  return rol === 'administrador' || rol === 'coordinadora';
}
