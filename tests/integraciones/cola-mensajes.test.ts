import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: { currentUser: { uid: 'ana' } as {uid: string} | null }, enviar: vi.fn() }));
vi.mock('../../src/firebase/config', () => ({ auth: mocks.auth }));
vi.mock('../../src/services/whatsapp.service', () => ({ enviarTexto: mocks.enviar }));
import { encolarMensaje, leerPendientes, procesarPendientes } from '../../src/services/colaMensajes';
let online = true;
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] || null, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, val: string) => data.set(key, val), removeItem: (key: string) => data.delete(key) });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { get onLine() { return online; } });
  online = true; mocks.auth.currentUser = { uid: 'ana' }; mocks.enviar.mockReset();
});
describe('Cola persistente de mensajes', () => {
  it('muestra y conserva sin red; reintenta con el mismo identificador', async () => {
    online = false; encolarMensaje('ana', '18494580318', 'Hola');
    const id = leerPendientes('ana')[0].id;
    await procesarPendientes('ana'); expect(mocks.enviar).not.toHaveBeenCalled();
    online = true; mocks.enviar.mockRejectedValueOnce(new Error('respuesta perdida')).mockResolvedValue({ ok: true });
    await procesarPendientes('ana'); expect(leerPendientes('ana')).toHaveLength(1);
    await procesarPendientes('ana'); expect(leerPendientes('ana')).toHaveLength(0);
    expect(mocks.enviar.mock.calls.map(c => c[2].tempId)).toEqual([id, id]);
  });
  it('una respuesta tardía no borra mensajes añadidos durante el envío', async () => {
    encolarMensaje('ana', '18494580318', 'Primero');
    mocks.enviar.mockImplementationOnce(async () => { encolarMensaje('ana', '18494580318', 'Segundo'); return { ok: true }; });
    await procesarPendientes('ana'); expect(leerPendientes('ana').map(m => m.texto)).toEqual(['Segundo']);
  });
  it('no envía pendientes de otra sesión', async () => {
    encolarMensaje('ana', '18494580318', 'Hola'); mocks.auth.currentUser = { uid: 'bea' };
    await procesarPendientes('ana'); expect(mocks.enviar).not.toHaveBeenCalled();
    expect(leerPendientes('bea')).toEqual([]); expect(() => encolarMensaje('ana', '18494580318', 'x')).toThrow();
  });
  it('deja visibles los rechazos y no los reenvía sin intervención', async () => {
    encolarMensaje('ana', '18494580318', 'Hola'); mocks.enviar.mockResolvedValue({ error: 'Ventana cerrada' });
    await procesarPendientes('ana'); await procesarPendientes('ana');
    expect(mocks.enviar).toHaveBeenCalledTimes(1); expect(leerPendientes('ana')[0].error).toBe('Ventana cerrada');
  });
});
