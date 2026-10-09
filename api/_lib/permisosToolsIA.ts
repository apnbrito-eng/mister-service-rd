import { PERMISOS_DEFAULT_ADMINISTRADOR, PERMISOS_DEFAULT_COORDINADORA, PERMISOS_DEFAULT_OPERARIA, PERMISOS_DEFAULT_SECRETARIA, type PermisosSistema } from '../../src/types/index.js';
export type PerfilToolsIA = {
  rol?: string; nombre?: string; iaHabilitada?: boolean; activo?: boolean; eliminado?: boolean;
  permisosPersonalizados?: boolean; permisosSistema?: Record<string, unknown>;
};
const PERMISOS_TOOL: Record<string, readonly (keyof PermisosSistema)[]> = {
  query_gastos: ['gastosVer'], query_avances_empleados: ['avancesGestionar'],
  query_personal: ['personalVer'], query_facturacion: ['facturasVer'],
  query_piezas_inventario: ['configuracionVer'],
  get_orden_detallada: ['ordenesVer', 'facturasVer'],
  query_ordenes: ['ordenesVer'], count_ordenes: ['ordenesVer'], get_orden: ['ordenesVer'], agenda_dia: ['ordenesVer'],
  query_clientes: ['clientesVer'], query_cotizaciones: ['cotizacionesVer'],
  query_standby_piezas: ['ordenesVer'], query_mantenimiento: ['ordenesVer'],
};
const DEFAULTS: Record<string, PermisosSistema> = { administrador: PERMISOS_DEFAULT_ADMINISTRADOR, coordinadora: PERMISOS_DEFAULT_COORDINADORA, operaria: PERMISOS_DEFAULT_OPERARIA, secretaria: PERMISOS_DEFAULT_SECRETARIA };
export function perfilCanonicoIAValido(perfil: PerfilToolsIA | null | undefined): boolean {
  return !!perfil && ['administrador', 'coordinadora', 'operaria', 'secretaria'].includes(perfil.rol || '') && perfil.activo !== false && perfil.eliminado !== true;
}
export function permiteToolIA(nombre: string, rol: string, perfil?: PerfilToolsIA): boolean {
  if (perfil && (!perfilCanonicoIAValido(perfil) || perfil.rol !== rol)) return false;
  const permiso = PERMISOS_TOOL[nombre];
  if (!permiso) return true;
  // Restricted tools require a trusted canonical profile even on direct calls.
  if (!perfil) return false;
  const permisos = perfil.permisosPersonalizados === true ? perfil.permisosSistema : DEFAULTS[rol];
  return permiso.every(p => permisos?.[p] === true);
}
