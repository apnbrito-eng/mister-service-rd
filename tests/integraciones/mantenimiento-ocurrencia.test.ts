import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ documentos: new Map<string, any>(), escrituras: [] as any[], cola: Promise.resolve() as Promise<any> }));
vi.mock('../../src/firebase/config', () => ({ db: {}, auth: { currentUser: { uid: 'oficina' } } }));
vi.mock('firebase/firestore', async original => ({ ...await original<any>(),
  doc: (_: unknown, col: string, id: string) => `${col}/${id}`,
  collection: (_: unknown, col: string) => col,
  runTransaction: (_: unknown, fn: any) => {
    const ejecutar = async () => {
      const pending: any[] = [];
      const result = await fn({ get: async (ref: string) => ({ exists: () => m.documentos.has(ref), data: () => m.documentos.get(ref) }), set: (ref: string, data: any) => pending.push([ref, data]), update: (ref: string, data: any) => pending.push([ref, { ...m.documentos.get(ref), ...data }]) });
      for (const [ref, data] of pending) m.documentos.set(ref, data);
      m.escrituras.push(...pending); return result;
    };
    const promesa = m.cola.then(ejecutar); m.cola = promesa.catch(() => {}); return promesa;
  },
}));
import { generarOcurrenciaMantenimiento as generar, idOrdenMantenimiento } from '../../src/services/generarMantenimiento.service';
import { guardarSeguimientoChequeo as guardar } from '../../src/services/seguimientoChequeo.service';
const fecha = new Date('2026-09-29T12:00:00-04:00'), siguiente = new Date('2026-10-29T12:00:00-04:00');
const payload = { numero: 'OS-1234', clienteId: 'c', tecnicoId: 't', equipoTipo: 'Nevera' };
beforeEach(() => { m.documentos.clear(); m.escrituras = []; m.cola = Promise.resolve(); m.documentos.set('mantenimiento/m', { ...payload, activo: true, frecuencia: 'mensual', proximaFecha: { toDate: () => fecha } }); });
describe('Ocurrencia manual de mantenimiento', () => {
  it('dos solicitudes concurrentes crean una sola orden y avanzan una vez', async () => {
    const resultados = await Promise.all([generar('m', fecha, siguiente, payload, 'mensual'), generar('m', fecha, siguiente, payload, 'mensual')]);
    expect(resultados.map(r => r.creada)).toEqual([true, false]); expect(m.escrituras).toHaveLength(2);
  });
  it('rechaza programación cambiada sin escribir', async () => { m.documentos.get('mantenimiento/m').frecuencia = 'anual'; await expect(generar('m', fecha, siguiente, payload, 'mensual')).rejects.toThrow('cambió'); expect(m.escrituras).toHaveLength(0); });
  it('no inventa fecha para ocurrencia inválida', () => { expect(() => idOrdenMantenimiento('m', new Date(NaN))).toThrow(); });
});
describe('Seguimiento comercial', () => {
  it('conserva importes, fase y cierre técnico', async () => {
    m.documentos.set('usuarios/oficina', { rol: 'coordinadora', activo: true });
    m.documentos.set('ordenes_servicio/o', { soloChequeo: true, fase: 'cerrado', precioFinal: 1500 });
    await guardar('o', { responsableUid: 'oficina', proximaFecha: '2026-10-02', resultado: 'interesado', nota: 'Cliente desea recibir propuesta' });
    expect(m.documentos.get('ordenes_servicio/o')).toMatchObject({ soloChequeo: true, fase: 'cerrado', precioFinal: 1500 });
    expect(m.escrituras).toHaveLength(2);
  });
  it('rechaza responsable inactivo y no altera orden', async () => {
    m.documentos.set('usuarios/oficina', { rol: 'coordinadora', activo: false });
    m.documentos.set('ordenes_servicio/o', { soloChequeo: true });
    await expect(guardar('o', { responsableUid: 'oficina', proximaFecha: '2026-10-02', resultado: 'pendiente', nota: 'Contactar cliente' })).rejects.toThrow('activa'); expect(m.escrituras).toHaveLength(0);
  });
});
