import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ callbacks: [] as any[], cancelar: vi.fn(), where: vi.fn((...args) => args) }));
vi.mock('firebase/firestore', () => ({ collection: () => ({}), query: (...a: any[]) => a, where: m.where, onSnapshot: (_q: any, next: any, error: any) => { m.callbacks.push({ next, error }); return m.cancelar; } }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('../../src/services/clientes.service', () => ({ normalizarTelefono: (v: string) => v.replace(/\D/g, '').slice(-10) }));
import { useNombresClientesInbox } from '../../src/hooks/useNombresClientesInbox';
let r: any;
function Harness({ telefonos, uid }: { telefonos: string[]; uid?: string }) {
 const nombres = useNombresClientesInbox(telefonos, uid);
 return React.createElement('output', null, JSON.stringify(nombres));
}
afterEach(() => { if (r) act(() => r.unmount()); r = null; m.callbacks = []; vi.clearAllMocks(); });
describe('nombres de clientes en la bandeja', () => {
 it('agrupa teléfonos, excluye clientes eliminados y actualiza el nombre en vivo', async () => {
   await act(async () => { r = create(React.createElement(Harness, { telefonos: ['8095550100', '+18095550100'], uid: 'u' })); });
   expect(m.callbacks).toHaveLength(1);
   await act(async () => m.callbacks[0].next({ docs: [ { data: () => ({ telefonoNormalizado: '8095550100', nombre: 'Antiguo', eliminado: true }) }, { data: () => ({ telefonoNormalizado: '8095550100', nombre: 'Nombre actual' }) } ] }));
   expect(r.root.findByType('output').children.join('')).toContain('Nombre actual');
   expect(r.root.findByType('output').children.join('')).not.toContain('Antiguo');
   await act(async () => m.callbacks[0].next({ docs: [{ data: () => ({ telefonoNormalizado: '8095550100', nombre: 'Nombre editado' }) }] }));
   expect(r.root.findByType('output').children.join('')).toContain('Nombre editado');
 });
 it('no conserva nombres de otra sesión tras cerrar sesión y descarta callbacks tardíos', async () => {
   await act(async () => { r = create(React.createElement(Harness, { telefonos: ['8095550100'], uid: 'u' })); });
   const callback = m.callbacks[0];
   await act(async () => r.update(React.createElement(Harness, { telefonos: ['8095550100'] })));
   await act(async () => callback.next({ docs: [{ data: () => ({ telefonoNormalizado: '8095550100', nombre: 'Anterior' }) }] }));
   expect(r.root.findByType('output').children.join('')).toBe('{}'); expect(m.cancelar).toHaveBeenCalled();
 });
 it('divide listas grandes en consultas de hasta treinta y tolera una consulta fallida', async () => {
   const telefonos = Array.from({ length: 35 }, (_, i) => String(8095550100 + i));
   await act(async () => { r = create(React.createElement(Harness, { telefonos, uid: 'u' })); });
   expect(m.callbacks).toHaveLength(2);
   expect(m.where.mock.calls.map(c => c[2].length)).toEqual([30, 5]);
   await act(async () => m.callbacks[0].error(new Error('offline')));
   expect(r.root.findByType('output').children.join('')).not.toContain('undefined');
 });
});
