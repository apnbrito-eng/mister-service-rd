import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ state: {} as Record<string, unknown>, writes: [] as unknown[], latest: null as Record<string, unknown>|null }));
vi.mock('../../src/firebase/config', () => ({ db: {}, storage: {} }));
vi.mock('../../src/services/contadores.service', () => ({ siguienteNumeroOrden: async () => 'OS-0999' }));
vi.mock('firebase/firestore', () => ({
 collection: (_db: unknown, name: string) => ({ name }),
 doc: (...args: unknown[]) => ({ id: args.length === 1 ? 'new-order' : args[2] }),
 getDoc: async () => ({ exists: () => true, data: () => mock.state }),
 runTransaction: async (_db: unknown, fn: Function) => fn({
  get: async () => ({ exists: () => true, data: () => mock.latest || mock.state }),
  set: (_r: unknown, data: unknown) => mock.writes.push(data),
  update: (_r: unknown, data: unknown) => mock.writes.push(data),
 }),
 Timestamp: { now: () => 'now' }, serverTimestamp: () => 'server',
 addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), getDocs: vi.fn(), query: vi.fn(), where: vi.fn(), onSnapshot: vi.fn(),
}));
import { convertirAOrden } from '../../src/services/solicitudes.service';
describe('Conversión de solicitud', () => {
 beforeEach(() => { mock.state={estado:'pendiente'}; mock.latest=null; mock.writes=[]; });
 it('escribe orden y enlace dentro de la misma transacción', async () => {
  expect(await convertirAOrden('s1',{numero:'no sobrescribir',clienteNombre:'Prueba'})).toBe('new-order');
  expect(mock.writes).toHaveLength(2);
  expect(mock.writes[0]).toMatchObject({numero:'OS-0999',fase:'nuevo_lead'});
  expect(mock.writes[1]).toMatchObject({estado:'convertida',ordenId:'new-order'});
 });
 it('devuelve la orden existente al reintentar', async () => {
  mock.state={estado:'convertida',ordenId:'existing'};
  expect(await convertirAOrden('s1',{})).toBe('existing'); expect(mock.writes).toHaveLength(0);
 });
 it('detecta otra conversión ocurrida después de la lectura inicial', async () => {
  mock.latest={estado:'convertida',ordenId:'concurrent'};
  expect(await convertirAOrden('s1',{})).toBe('concurrent'); expect(mock.writes).toHaveLength(0);
 });
 it('no crea una orden desde una solicitud rechazada', async () => {
  mock.state={estado:'rechazada'};
  await expect(convertirAOrden('s1',{})).rejects.toThrow('no puede convertirse'); expect(mock.writes).toHaveLength(0);
 });
});
