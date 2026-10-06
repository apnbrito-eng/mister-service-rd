import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const fake = vi.hoisted(() => ({ data: new Map<string, Record<string, unknown>>(), uid: 'tec', seq: 0, deny: false, version: 0 }));
vi.mock('../../api/_lib/accesoEquipo.js', () => {
  class ErrorAcceso extends Error { constructor(public status: number, message: string) { super(message); } }
  type Ref = { path: string; id: string };
  const doc = (path: string): Ref => ({ path, id: path.split('/').pop()! });
  const snap = (ref: Ref) => ({ ref, id: ref.id, exists: fake.data.has(ref.path), data: () => fake.data.get(ref.path) });
  const db = { doc, collection: (p: string) => ({ doc: () => doc(`${p}/auto${++fake.seq}`) }), runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    // Modelo optimista: un commit concurrente invalida las lecturas y repite el callback.
    for (let intento = 0; intento < 5; intento++) {
      const version = fake.version;
      const pending: (() => void)[] = [];
      const creados: Ref[] = [];
      let writing = false;
      const result = await fn({ get: async (r: Ref) => { if (writing) throw new Error('Read after write'); return snap(r); }, update: (r: Ref, d: Record<string, unknown>) => { writing = true; pending.push(() => fake.data.set(r.path, { ...fake.data.get(r.path), ...d })); }, create: (r: Ref, d: Record<string, unknown>) => { writing = true; creados.push(r); pending.push(() => fake.data.set(r.path, d)); } });
      if (version !== fake.version) continue;
      if (creados.some(r => fake.data.has(r.path))) throw new Error('Document already exists');
      pending.forEach(f => f());
      if (pending.length) fake.version++;
      return result;
    }
    throw new Error('Transaction retries exhausted');
  } };
  return { ErrorAcceso, accesoEquipo: async () => { if (fake.deny) throw new ErrorAcceso(401, 'Sin sesión'); return { db, uid: fake.uid }; } };
});
import handler from '../../api/ordenes/efectivo';
async function call(body: object) {
  let status = 200; let result: Record<string, unknown> = {};
  const res = { setHeader: () => {}, status: (s: number) => { status = s; return res; }, json: (d: Record<string, unknown>) => { result = d; return res; } };
  await handler({ method: 'POST', body } as VercelRequest, res as unknown as VercelResponse);
  return { status, result };
}
const payment = { id: 'p1', metodo: 'efectivo', monto: 4500, recibidoPorId: 'tec', requiereAceptacionEfectivo: true, verificado: false, fecha: new Date('2026-10-03') };
beforeEach(() => {
  fake.data.clear(); fake.uid = 'tec'; fake.seq = 0; fake.deny = false; fake.version = 0;
  fake.data.set('usuarios/tec', { rol: 'tecnico', nombre: 'Técnico', activo: true });
  fake.data.set('usuarios/op', { rol: 'operaria', nombre: 'Operaria', activo: true });
  fake.data.set('usuarios/admin', { rol: 'administrador', nombre: 'Gerente', activo: true });
  fake.data.set('ordenes_servicio/o1', { tecnicoId: 'tec', operariaId: 'op', precioFinal: 5000, pagos: [{ ...payment }] });
});
describe('efectivo API', () => {
  it('rechaza token inválido y otro técnico sin escrituras', async () => {
    fake.deny = true; expect((await call({ accion: 'aceptar', ordenId: 'o1', pagoId: 'p1', monto: 4500 })).status).toBe(401);
    fake.deny = false; fake.uid = 'op'; expect((await call({ accion: 'aceptar', ordenId: 'o1', pagoId: 'p1', monto: 4500 })).status).toBe(409);
    expect(fake.data.get('ordenes_servicio/o1')).not.toHaveProperty('efectivoAceptaciones');
  });
  it('acepta, recibe y repetir no duplica auditoría ni suma dinero', async () => {
    const aceptar = { accion: 'aceptar', ordenId: 'o1', pagoId: 'p1', monto: 4500 };
    expect((await call(aceptar)).status).toBe(200); const size = fake.data.size;
    await call(aceptar); expect(fake.data.size).toBe(size);
    fake.uid = 'op'; expect((await call({ ...aceptar, accion: 'recibir' })).status).toBe(200);
    const orden = fake.data.get('ordenes_servicio/o1')!;
    expect(orden.efectivoEntregas).toHaveProperty('p1.monto', 4500);
    expect(orden.pagos).toEqual([payment]);
  });
  it('no recibe antes de aceptación ni acepta monto desactualizado', async () => {
    fake.uid = 'op'; expect((await call({ accion: 'recibir', ordenId: 'o1', pagoId: 'p1', monto: 4500 })).status).toBe(409);
    fake.uid = 'tec'; expect((await call({ accion: 'aceptar', ordenId: 'o1', pagoId: 'p1', monto: 4000 })).status).toBe(409);
  });
  it('verifica después de aceptación preservando custodia pendiente', async () => {
    await call({ accion: 'aceptar', ordenId: 'o1', pagoId: 'p1', monto: 4500 });
    fake.uid = 'admin'; expect((await call({ accion: 'verificar', ordenId: 'o1', pagoId: 'p1' })).result.ok).toBe(true);
    expect(fake.data.get('ordenes_servicio/o1')).not.toHaveProperty('efectivoEntregas');
  });
  it('registrar abono adicional no elimina aceptaciones; rechaza chequeo sin confirmar', async () => {
    await call({ accion: 'aceptar', ordenId: 'o1', pagoId: 'p1', monto: 4500 });
    fake.uid = 'op'; const body = { accion: 'registrar', ordenId: 'o1', pagoId: 'p2', monto: 100, metodo: 'efectivo' };
    expect((await call(body)).status).toBe(200);
    expect(fake.data.get('ordenes_servicio/o1')?.pagos).toHaveLength(2);
    await call(body); expect(fake.data.get('ordenes_servicio/o1')?.pagos).toHaveLength(2);
    fake.data.set('ordenes_servicio/o1', { ...fake.data.get('ordenes_servicio/o1'), chequeoConfirmacionEstado: 'pendiente' });
    expect((await call({ ...body, pagoId: 'p3' })).status).toBe(409);
  });
  it('lote falla completo si una orden no fue aceptada', async () => {
    fake.data.set('ordenes_servicio/o2', { tecnicoId: 'tec', operariaId: 'op', pagos: [{ ...payment, verificado: true }] });
    await call({ accion: 'aceptar', ordenId: 'o1', pagoId: 'p1', monto: 4500 });
    fake.uid = 'admin'; await call({ accion: 'verificar', ordenId: 'o1', pagoId: 'p1' });
    expect((await call({ accion: 'entregar_lote', movimientos: ['o1', 'o2'].map(ordenId => ({ ordenId, pagoId: 'p1', monto: 4500 })) })).status).toBe(409);
    expect(fake.data.get('ordenes_servicio/o1')).not.toHaveProperty('efectivoEntregas');
  });
  it('secretaria del equipo configurado recibe y CRM conserva un único importe entregado', async () => {
    fake.data.set('usuarios/sec', { rol: 'secretaria', nombre: 'Asistente', activo: true });
    fake.data.set('bot_servicio_config/sistema', { equipos: [{ id: 'A', operariaUid: 'op', secretariaUid: 'sec' }] });
    fake.data.set('ordenes_servicio/o1', { tecnicoId: 'tec', operariaId: 'op', pagos: [{ ...payment, crm: true }] });
    await call({ accion: 'aceptar', ordenId: 'o1', pagoId: 'p1', monto: 4500 });
    fake.uid = 'sec';
    expect((await call({ accion: 'recibir', ordenId: 'o1', pagoId: 'p1', monto: 4500 })).status).toBe(200);
    expect(fake.data.get('ordenes_servicio/o1')?.pagos).toEqual([{ ...payment, crm: true, entregadoOficina: 4500 }]);
    await call({ accion: 'recibir', ordenId: 'o1', pagoId: 'p1', monto: 4500 });
    expect(fake.data.get('ordenes_servicio/o1')?.pagos).toEqual([{ ...payment, crm: true, entregadoOficina: 4500 }]);
  });
  it('secretaria ajena al equipo no puede recibir', async () => {
    fake.data.set('usuarios/sec', { rol: 'secretaria', nombre: 'Asistente', activo: true });
    fake.data.set('bot_servicio_config/sistema', { equipos: [{ id: 'B', operariaUid: 'otra', secretariaUid: 'sec' }] });
    await call({ accion: 'aceptar', ordenId: 'o1', pagoId: 'p1', monto: 4500 });
    fake.uid = 'sec';
    expect((await call({ accion: 'recibir', ordenId: 'o1', pagoId: 'p1', monto: 4500 })).status).toBe(409);
  });

  it('dos cobros concurrentes no pueden consumir el mismo saldo', async () => {
    fake.uid = 'op';
    const resultados = await Promise.all(['p2', 'p3'].map(pagoId => call({ accion: 'registrar', ordenId: 'o1', pagoId, monto: 400, metodo: 'efectivo' })));
    expect(resultados.map(r => r.status).sort()).toEqual([200, 409]);
    expect(fake.data.get('ordenes_servicio/o1')?.montoPagado).toBe(4900);
    expect(fake.data.get('ordenes_servicio/o1')?.pagos).toHaveLength(2);
    expect([...fake.data.keys()].filter(k => k.startsWith('notificaciones/'))).toHaveLength(1);
  });
  it('reintentar el mismo pago con saldo agotado no duplica ni reinicia el aviso leído', async () => {
    fake.uid = 'op';
    const body = { accion: 'registrar', ordenId: 'o1', pagoId: 'p2', monto: 500, metodo: 'efectivo' };
    expect((await call(body)).status).toBe(200);
    const avisoPath = 'notificaciones/efectivo-o1-p2';
    const avisoLeido = { ...fake.data.get(avisoPath), leida: true };
    fake.data.set(avisoPath, avisoLeido);
    const cantidad = fake.data.size;
    const repetido = await call(body);
    expect(repetido.status).toBe(200);
    expect(repetido.result.duplicado).toBe(true);
    expect(fake.data.size).toBe(cantidad);
    expect(fake.data.get(avisoPath)).toEqual(avisoLeido);
    expect(fake.data.get('ordenes_servicio/o1')?.montoPagado).toBe(5000);
  });
  it('un aviso preexistente no impide registrar el pago ni se sobrescribe', async () => {
    fake.uid = 'op';
    const aviso = { userId: 'tec', leida: true, createdAt: 'fecha-original' };
    fake.data.set('notificaciones/efectivo-o1-p2', aviso);
    expect((await call({ accion: 'registrar', ordenId: 'o1', pagoId: 'p2', monto: 500, metodo: 'efectivo' })).status).toBe(200);
    expect(fake.data.get('notificaciones/efectivo-o1-p2')).toEqual(aviso);
    expect(fake.data.get('ordenes_servicio/o1')?.montoPagado).toBe(5000);
  });
  it('calcula el saldo de los pagos guardados y del importe de solo chequeo', async () => {
    fake.uid = 'op';
    fake.data.set('ordenes_servicio/o1', { tecnicoId: 'tec', operariaId: 'op', soloChequeo: true, precioChequeo: 2000, precioFinal: 5000, montoPagado: 0, pagos: [{ ...payment, monto: 1900 }] });
    expect((await call({ accion: 'registrar', ordenId: 'o1', pagoId: 'p2', monto: 101, metodo: 'efectivo' })).status).toBe(409);
    expect((await call({ accion: 'registrar', ordenId: 'o1', pagoId: 'p2', monto: 100, metodo: 'efectivo' })).status).toBe(200);
    expect(fake.data.get('ordenes_servicio/o1')?.estadoPago).toBe('completo');
  });

});

it('comisión retenida solo se libera tras verificar el saldo final, sin duplicarse', async () => {
  fake.data.set('ordenes_servicio/o1', { tecnicoId: 'tec', operariaId: 'op', fase: 'cerrado', precioFinal: 10000, pagos: [{ ...payment, id: 'anticipo', monto: 5000, verificado: true }] });
  fake.data.set('comisiones/orden_o1', { ordenId: 'o1', precioFinal: 10000, estadoLiquidacion: 'retenida_por_cobro', comisionMonto: 900 });
  fake.uid = 'op';
  expect((await call({ accion: 'registrar', ordenId: 'o1', pagoId: 'saldo', monto: 5000, metodo: 'efectivo' })).status).toBe(200);
  expect(fake.data.get('comisiones/orden_o1')?.estadoLiquidacion).toBe('retenida_por_cobro');
  fake.uid = 'admin';
  const verificar = { accion: 'verificar', ordenId: 'o1', pagoId: 'saldo' };
  expect((await call(verificar)).result.ok).toBe(true);
  const liberada = fake.data.get('comisiones/orden_o1');
  expect(liberada).toMatchObject({ estadoLiquidacion: 'pendiente', comisionMonto: 900 });
  expect(liberada?.quincenaAsignada).toMatch(/^\d{4}-\d{2}-Q[12]$/);
  await call(verificar);
  expect(fake.data.get('comisiones/orden_o1')).toEqual(liberada);
  expect([...fake.data.keys()].filter(k => k.startsWith('comisiones/'))).toEqual(['comisiones/orden_o1']);
});
it('verificar el 100% antes de terminar no libera comisión', async () => {
  fake.data.set('ordenes_servicio/o1', { tecnicoId: 'tec', operariaId: 'op', fase: 'en_proceso', precioFinal: 4500, pagos: [payment] });
  fake.data.set('comisiones/orden_o1', { ordenId: 'o1', precioFinal: 4500, estadoLiquidacion: 'retenida_por_cobro', comisionMonto: 400 });
  fake.uid = 'admin';
  expect((await call({ accion: 'verificar', ordenId: 'o1', pagoId: 'p1' })).result.ok).toBe(true);
  expect(fake.data.get('comisiones/orden_o1')?.estadoLiquidacion).toBe('retenida_por_cobro');
});
