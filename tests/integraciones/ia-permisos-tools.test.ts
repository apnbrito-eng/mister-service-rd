import { expect, it, vi } from 'vitest';
vi.mock('../../api/_lib/firebaseAdmin', () => ({ getAdminFirestore: vi.fn(() => { throw new Error('Unexpected database read'); }) }));
import { ejecutarTool, toolsParaRol } from '../../api/_lib/iaTools';
import { permiteToolIA, perfilCanonicoIAValido } from '../../api/_lib/permisosToolsIA';
it.each([['query_gastos','gastosVer'],['query_avances_empleados','avancesGestionar'],['query_personal','personalVer'],['query_facturacion','facturasVer'],['query_piezas_inventario','configuracionVer']])('revocar %s bloquea catálogo y ejecución directa', async (nombre, permiso) => {
  const perfil = { rol: 'administrador', permisosPersonalizados: true, permisosSistema: { [permiso]: false } };
  expect(toolsParaRol('administrador', perfil).some(t => t.name === nombre)).toBe(false);
  expect(await ejecutarTool(nombre, {}, { rol: 'administrador', uid: 'qa', perfil })).toMatchObject({ ok: false });
  expect(permiteToolIA(nombre, 'administrador', { ...perfil, permisosSistema: { [permiso]: true } })).toBe(true);
});
it('no amplía roles financieros para operaria aunque IA y permisos estén activos', async () => {
  const perfil = { rol: 'operaria', iaHabilitada: true, permisosPersonalizados: true, permisosSistema: { gastosVer: true, avancesGestionar: true } };
  for (const tool of ['query_gastos','query_avances_empleados','query_liquidaciones_nomina','query_comisiones']) {
    expect(toolsParaRol('operaria', perfil).some(t => t.name === tool)).toBe(false);
    expect(await ejecutarTool(tool, {}, { rol: 'operaria', uid: 'qa', perfil })).toMatchObject({ ok: false });
  }
});
it('bloquea perfil inactivo/eliminado, identidad incompatible y llamada sensible sin perfil', async () => {
  expect(perfilCanonicoIAValido(null)).toBe(false);
  for (const perfil of [{ rol: 'administrador', activo: false }, { rol: 'administrador', eliminado: true }, { rol: 'coordinadora' }]) {
    expect(toolsParaRol('administrador', perfil)).toHaveLength(0);
    expect(await ejecutarTool('query_personal', {}, { rol: 'administrador', uid: 'qa', perfil })).toMatchObject({ ok: false });
  }
  expect(await ejecutarTool('query_personal', {}, { rol: 'administrador', uid: 'qa' })).toMatchObject({ ok: false });
});
it('mantiene nómina/comisiones por rol sin inventar permiso financiero adicional', () => {
  const perfil = { rol: 'administrador', permisosPersonalizados: true, permisosSistema: { personalVer: false } };
  expect(toolsParaRol('administrador', perfil).map(t => t.name)).toEqual(expect.arrayContaining(['query_liquidaciones_nomina','query_comisiones']));
});

it.each([{ ordenesVer: false, facturasVer: true }, { ordenesVer: true, facturasVer: false }])('bloquea detalle mixto si se revoca cualquiera de sus lecturas', async permisosSistema => {
  const perfil = { rol: 'administrador', permisosPersonalizados: true, permisosSistema };
  expect(toolsParaRol('administrador', perfil).some(t => t.name === 'get_orden_detallada')).toBe(false);
  expect(await ejecutarTool('get_orden_detallada', { numero: 'OS-QA' }, { rol: 'administrador', uid: 'qa', perfil })).toMatchObject({ ok: false });
});
it('detalle mixto permanece disponible sólo con ambas lecturas y rol previo', () => {
  const perfil = { rol: 'administrador', permisosPersonalizados: true, permisosSistema: { ordenesVer: true, facturasVer: true } };
  expect(permiteToolIA('get_orden_detallada', 'administrador', perfil)).toBe(true);
  expect(toolsParaRol('administrador', perfil).some(t => t.name === 'get_orden_detallada')).toBe(true);
  expect(toolsParaRol('coordinadora', { ...perfil, rol: 'coordinadora' }).some(t => t.name === 'get_orden_detallada')).toBe(false);
});

it.each([['query_ordenes','ordenesVer'],['count_ordenes','ordenesVer'],['get_orden','ordenesVer'],['agenda_dia','ordenesVer'],['query_clientes','clientesVer'],['query_cotizaciones','cotizacionesVer'],['query_standby_piezas','ordenesVer'],['query_mantenimiento','ordenesVer']])('revocar permiso operativo bloquea %s en ambas barreras', async (nombre, permiso) => {
  const perfil = { rol: 'administrador', permisosPersonalizados: true, permisosSistema: { [permiso]: false } };
  expect(toolsParaRol('administrador', perfil).some(t => t.name === nombre)).toBe(false);
  expect(await ejecutarTool(nombre, {}, { rol: 'administrador', uid: 'qa', perfil })).toMatchObject({ ok: false });
});
it('resuelve defaults reales y no usa permisos almacenados cuando override está desactivado', () => {
  for (const rol of ['operaria', 'secretaria']) {
    const perfil = { rol, permisosPersonalizados: false, permisosSistema: { gastosVer: true, personalVer: false } };
    expect(permiteToolIA('query_gastos', rol, perfil)).toBe(false);
    // Existing operational defaults deliberately permit staff Personal reads.
    expect(permiteToolIA('query_personal', rol, perfil)).toBe(true);
    expect(permiteToolIA('query_ordenes', rol, perfil)).toBe(true);
  }
  expect(permiteToolIA('query_gastos', 'administrador', { rol: 'administrador' })).toBe(true);
  expect(permiteToolIA('query_personal', 'coordinadora', { rol: 'coordinadora' })).toBe(true);
});
