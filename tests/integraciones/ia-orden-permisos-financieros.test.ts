import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../api/_lib/firebaseAdmin', () => ({ getAdminFirestore: () => ({ collection: () => ({ where() { return this; }, limit() { return this; }, get: m.get }) }) }));
import { ejecutarTool, type Rol } from '../../api/_lib/iaTools';
const orden = { numero: 'OS-QA', fase: 'agendado', clienteNombre: 'Cliente QA', fechaCita: new Date(), precioAprobado: 12000, costoPiezas: 3000, comisionMonto: 1000, pagos: [{ monto: 12000 }], conduce: { costo: 3000 }, notas: 'finanzas privadas', datosAnidados: { cuenta: 'interna' } };
beforeEach(() => { m.get.mockResolvedValue({ docs: [{ id: 'orden-qa', data: () => orden }], size: 1 }); });
it.each(['administrador','coordinadora'] as Rol[])('sin facturasVer conserva consulta operativa %s y elimina todo payload financiero', async rol => {
  const perfil = { rol, permisosPersonalizados: true, permisosSistema: { ordenesVer: true, facturasVer: false } };
  const r = await ejecutarTool('get_orden', { numero: 'OS-QA' }, { rol, uid: 'qa', perfil });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error);
  const data = (r.result as Record<string, unknown>);
  expect(data.numero).toBe('OS-QA');
  for (const campo of ['precioAprobado','costoPiezas','comisionMonto','pagos','conduce','notas','datosAnidados']) expect(data).not.toHaveProperty(campo);
});
it.each(['administrador','coordinadora'] as Rol[])('defaults %s mantienen detalle financiero autorizado', async rol => {
  const r = await ejecutarTool('get_orden', { numero: 'OS-QA' }, { rol, uid: 'qa', perfil: { rol } });
  expect(r).toMatchObject({ ok: true, result: { precioAprobado: 12000, pagos: [{ monto: 12000 }] } });
});
it('secretaria conserva proyección operativa aun con override financiero true', async () => {
  const r = await ejecutarTool('get_orden', { numero: 'OS-QA' }, { rol: 'secretaria', uid: 'qa', perfil: { rol: 'secretaria', permisosPersonalizados: true, permisosSistema: { ordenesVer: true, facturasVer: true } } });
  expect(r.ok).toBe(true);
  if (r.ok) expect((r.result as object)).not.toHaveProperty('precioAprobado');
});
it('resumen y agenda no filtran monto/notas tras revocar facturasVer', async () => {
  const contexto = { rol: 'administrador' as const, uid: 'qa', perfil: { rol: 'administrador', permisosPersonalizados: true, permisosSistema: { ordenesVer: true, facturasVer: false } } };
  const resumen = await ejecutarTool('query_ordenes', {}, contexto);
  expect(resumen.ok).toBe(true);
  if (resumen.ok) {
    const o = (resumen.result as { ordenes: Record<string, unknown>[] }).ordenes[0];
    expect(o).not.toHaveProperty('montoAprobado'); expect(o.evidenciaSeguimiento).not.toHaveProperty('notaRegistrada');
  }
  const agenda = await ejecutarTool('agenda_dia', { fecha: '2026-10-09' }, contexto);
  expect(agenda.ok).toBe(true);
  expect(JSON.stringify(agenda)).not.toContain('12000'); expect(JSON.stringify(agenda)).not.toContain('finanzas privadas');
});
