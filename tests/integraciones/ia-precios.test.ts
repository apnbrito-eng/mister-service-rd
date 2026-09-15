import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../api/_lib/firebaseAdmin', () => ({ getAdminFirestore: () => ({ collection: () => ({ get: mocks.get }) }) }));
import { ejecutarTool, toolsParaRol } from '../../api/_lib/iaTools';
const docs = (items: object[]) => ({ docs: items.map((item, i) => ({ id: String(i), data: () => item })) });
beforeEach(() => mocks.get.mockReset());
describe('consulta de precios por el equipo de atención', () => {
  it.each(['operaria', 'secretaria'] as const)('permite a %s encontrar un precio fuera de las primeras 60 filas', async rol => {
    mocks.get.mockResolvedValue(docs([...Array.from({ length: 70 }, () => ({ nombre: 'Otro servicio', marca: 'Otra', activo: true })), { nombre: 'Cambio bomba', marca: 'LG', equipoTipo: 'Lavadora', precioDetalle: 3500, precioMayoreo: 2800, activo: true }]));
    expect(toolsParaRol(rol).some(t => t.name === 'query_precios_servicios')).toBe(true);
    const r = await ejecutarTool('query_precios_servicios', { marca: 'LG', servicio: 'bomba' }, { rol, uid: 'prueba' });
    expect(r).toMatchObject({ ok: true, result: { servicios: [{ servicio: 'Cambio bomba', precioDetalle: 3500, precioMayoreo: 2800 }], cantidad: 1 } });
  });
  it('no convierte precio faltante en cero ni mayorista en detalle', async () => {
    mocks.get.mockResolvedValue(docs([{ nombre: 'Servicio', precioMayoreo: 2000 }]));
    expect(await ejecutarTool('query_precios_servicios', {}, { rol: 'secretaria', uid: 'prueba' })).toMatchObject({ ok: true, result: { servicios: [{ precioDetalle: null, precioMayoreo: 2000 }] } });
  });
  it('omite servicios inactivos y declara coincidencias recortadas', async () => {
    mocks.get.mockResolvedValue(docs([{ nombre: 'A', precio: 100 }, { nombre: 'B', precio: 200 }, { nombre: 'Inactivo', activo: false, precio: 50 }]));
    expect(await ejecutarTool('query_precios_servicios', { limite: 1 }, { rol: 'operaria', uid: 'prueba' })).toMatchObject({ ok: true, result: { cantidad: 1, coincidencias: 2, resultadosParciales: true } });
  });
  it.each(['operaria', 'secretaria'] as const)('muestra venta de piezas a %s sin costo de compra', async rol => {
    mocks.get.mockResolvedValue(docs([{ nombre: 'Bomba', precioCompra: 700, precioVenta: 1500, precioDetalle: 1800, precioMayoreo: 1200 }]));
    const r = await ejecutarTool('query_productos', {}, { rol, uid: 'prueba' });
    expect(r).toMatchObject({ ok: true, result: { productos: [{ precioDetalle: 1800, precioMayoreo: 1200 }] } });
    expect(JSON.stringify(r)).not.toContain('costoUnitario');
  });
});
