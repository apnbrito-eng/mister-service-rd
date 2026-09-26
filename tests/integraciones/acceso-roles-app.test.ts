import { describe, it, expect } from 'vitest';
import { perfilHabilitado, inicioPorRol } from '../../src/utils/accesoSesion';
import { puede } from '../../src/utils/permisos';
describe('Acceso común de web y app por rol', () => {
  it.each(['administrador', 'coordinadora', 'secretaria', 'operaria'])('%s entra al espacio de oficina', rol => {
    expect(perfilHabilitado({ rol, activo: true })).toBe(true);
    expect(inicioPorRol(rol)).toBe('/admin/dashboard');
  });
  it('técnico entra a sus trabajos y ayudante solo a ponche', () => {
    expect(inicioPorRol('tecnico')).toBe('/tecnico'); expect(inicioPorRol('ayudante')).toBe('/ponche');
  });
  it('bloquea perfiles ausentes, desconocidos, desactivados o eliminados', () => {
    for (const p of [null, {}, { rol: 'superadmin' }, { rol: 'administrador', activo: false }, { rol: 'tecnico', eliminado: true }]) expect(perfilHabilitado(p)).toBe(false);
    expect(inicioPorRol('superadmin')).toBe('/login');
  });
  it('no eleva permisos de oficina ni ignora las restricciones individuales', () => {
    expect(puede({ rol: 'tecnico' } as any, 'bancosGestionar')).toBe(false);
    expect(puede({ rol: 'administrador', permisosPersonalizados: true, permisosSistema: { bancosGestionar: false } } as any, 'bancosGestionar')).toBe(false);
    expect(puede({ rol: 'tecnico', permisos: { puedeContactarCliente: true } } as any, 'tecnicoPuedeContactarCliente')).toBe(true);
    expect(puede({ rol: 'tecnico', permisosPersonalizados: true, permisosSistema: { tecnicoPuedeContactarCliente: false }, permisos: { puedeContactarCliente: true } } as any, 'tecnicoPuedeContactarCliente')).toBe(false);
  });
});
