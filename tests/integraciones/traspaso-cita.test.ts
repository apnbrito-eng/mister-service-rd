import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ data: new Map<string, any>(), seq: 0, uid: 'ana' }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => '__DELETE__', serverTimestamp: () => 'NOW' } }));
vi.mock('../../api/_lib/accesoEquipo.js', () => {
  class ErrorAcceso extends Error { constructor(public status: number, message: string) { super(message); } }
  const ref = (path: string): any => ({ path, id: path.split('/').pop(), collection: (n: string) => collection(path + '/' + n) });
  const snap = (path: string): any => ({ ...ref(path), ref: ref(path), exists: fake.data.has(path), data: () => structuredClone(fake.data.get(path)) });
  const collection = (path: string): any => ({ doc: (id = `auto-${++fake.seq}`) => ref(path + '/' + id), where: (field: string, op: string, value: any) => ({ query: () => ({ docs: [...fake.data.keys()].filter(k => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1 && (op === 'in' ? value.includes(fake.data.get(k)[field]) : fake.data.get(k)[field] === value)).map(snap) }) }) });
  const db = { collection, runTransaction: async (fn: any) => {
    let written = false; const pending: (() => void)[] = [];
    const write = (r: any, d: any, merge: boolean) => { written = true; pending.push(() => { const next = merge ? { ...fake.data.get(r.path), ...d } : d; for (const k of Object.keys(next)) if (next[k] === '__DELETE__') delete next[k]; fake.data.set(r.path, next); }); };
    const result = await fn({ get: async (r: any) => { if (written) throw new Error('Read after write'); return r.query ? r.query() : snap(r.path); }, update: (r: any, d: any) => write(r,d,true), set: (r: any,d: any,o: any) => write(r,d,!!o?.merge), create: (r: any,d: any) => { if(fake.data.has(r.path)) throw new Error('Duplicate'); write(r,d,false); } });
    pending.forEach(f => f()); return result;
  } };
  return { ErrorAcceso, accesoEquipo: async () => ({ db, uid: fake.uid, rol: 'operaria' }) };
});
import handler from '../../api/crm/atencion';
const phone = '18494580318';
async function transfer(ordenId?: string, version = 1) {
  let status = 200; const res = { setHeader() {}, status(n: number) { status = n; return this; }, json() { return this; } };
  await handler({ method: 'POST', body: { waId: phone, accion: 'transferir', version, destinoId: 'bea', motivo: 'Confirmar visita', ordenId, requestId: 'transferencia-test-001' } } as any, res as any); return status;
}
beforeEach(() => {
  fake.data.clear(); fake.uid = 'ana';
  fake.data.set('usuarios/ana', { rol: 'operaria', nombre: 'Ana' }); fake.data.set('usuarios/bea', { rol: 'operaria', nombre: 'Bea' });
  fake.data.set('whatsapp_conversaciones/' + phone, { asignadaA: 'ana' });
  fake.data.set('crm_atencion/' + phone, { version: 1, responsableId: 'ana', pendiente: true });
  for (const id of ['a','b','cerrada']) fake.data.set('ordenes_servicio/' + id, { clienteTelefono: phone, operariaId: 'ana', tecnicoId: 'tec1', fase: id === 'cerrada' ? 'cerrado' : 'pendiente' });
  fake.data.set('crm_ordenes/a', { version: 3 });
});
describe('Traspaso de una cita, sin afectar las otras', () => {
  it('mueve únicamente la seleccionada y revoca el técnico anterior', async () => {
    expect(await transfer('a')).toBe(200);
    expect(fake.data.get('ordenes_servicio/a')).toMatchObject({ operariaId: 'bea' }); expect(fake.data.get('ordenes_servicio/a').tecnicoId).toBeUndefined();
    expect(fake.data.get('ordenes_servicio/b').tecnicoId).toBe('tec1'); expect(fake.data.get('ordenes_servicio/b').operariaId).toBe('ana');
    expect(fake.data.get('ordenes_servicio/cerrada').operariaId).toBe('ana');
    expect(fake.data.get('crm_ordenes/a').version).toBe(4); expect(fake.data.get('crm_atencion/' + phone).responsableId).toBe('bea');
    expect(await transfer('a')).toBe(200); expect(fake.data.get('crm_ordenes/a').version).toBe(4);
  });
  it.each([undefined, 'cerrada', 'otra'])('rechaza selección inválida %s sin cambios parciales', async id => {
    expect(await transfer(id)).toBe(400); expect(fake.data.get('crm_atencion/' + phone).responsableId).toBe('ana');
  });
  it('rechaza estado obsoleto y actores ajenos', async () => {
    expect(await transfer('a', 0)).toBe(409); fake.uid = 'otra'; expect(await transfer('a')).toBe(400);
    expect(fake.data.get('ordenes_servicio/a').operariaId).toBe('ana');
  });
});
