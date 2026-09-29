import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { limiteMedia } from '../../api/_lib/mediaPermitido';
const m = vi.hoisted(() => ({ save: vi.fn(), read: vi.fn(), cancel: vi.fn(), releaseLock: vi.fn() }));
vi.mock('../../api/_lib/accesoEquipo.js', () => ({ ErrorAcceso: class extends Error {}, accesoEquipo: async () => ({ rol: 'administrador', db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ wa_id: '8095550000', tipo: 'image', contenido: { mediaId: '123', mediaMimeType: 'image/jpeg' } }) }) }) }) } }) }));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({ getAdminStorage: () => ({ bucket: () => ({ file: () => ({ exists: async () => [false], save: m.save, getSignedUrl: async () => ['https://example.invalid/qa'] }) }) }) }));
import handler from '../../api/whatsapp/media-proxy';
beforeEach(() => {
  vi.stubEnv('META_ACCESS_TOKEN', 'ficticio'); m.save.mockReset(); m.read.mockReset(); m.cancel.mockReset(); m.releaseLock.mockReset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://media.fbcdn.net/qa', mime_type: 'image/jpeg' }) }).mockResolvedValueOnce({ ok: true, body: { getReader: () => m } }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function llamar() { const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; await handler({ method: 'POST', body: { wamid: 'qa', wa_id: '8095550000' } } as VercelRequest, res as unknown as VercelResponse); return res; }
it('fin del stream guarda todos los bloques y libera lector', async () => {
  m.read.mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2]) }).mockResolvedValueOnce({ done: true });
  expect((await llamar()).status).toHaveBeenCalledWith(200);
  expect(m.save.mock.calls[0][0]).toEqual(Buffer.from([1, 2])); expect(m.releaseLock).toHaveBeenCalledTimes(1);
});
it('al superar límite cancela y libera lector sin guardar archivo', async () => {
  m.read.mockResolvedValueOnce({ done: false, value: new Uint8Array(limiteMedia('image') + 1) });
  expect((await llamar()).status).toHaveBeenCalledWith(413);
  expect(m.cancel).toHaveBeenCalledTimes(1); expect(m.releaseLock).toHaveBeenCalledTimes(1); expect(m.save).not.toHaveBeenCalled();
});
