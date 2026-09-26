import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rol: 'administrador', save: vi.fn(), baja: false }));
vi.mock('../../api/_lib/accesoEquipo.js', () => ({ ErrorAcceso: class extends Error { constructor(public status: number, message: string) { super(message); } }, accesoEquipo: async () => ({ uid: 'autor', rol: m.rol, db: { collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ bajaSolicitada: m.baja }) }) }) }) } }) }));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({ getAdminStorage: () => ({ bucket: () => ({ file: () => ({ save: m.save, getSignedUrl: async () => ['https://storage.example/audio'] }) }) }) }));
import handler from '../../api/whatsapp/audio';
beforeEach(() => { m.rol = 'administrador'; m.baja = false; m.save.mockReset(); });
async function run(body: object) { const res: any = { setHeader() {}, status: vi.fn().mockReturnThis(), json: vi.fn() }; await handler({ method: 'POST', body } as any, res); return res; }
const mp4 = Buffer.concat([Buffer.from([0,0,0,32]), Buffer.from('ftyp'), Buffer.alloc(32)]).toString('base64');
describe('Audio del chat', () => {
  it('rechaza contenido disfrazado y formatos incompatibles sin guardarlo', async () => {
    const res = await run({ waId: '2025550100', mimeType: 'audio/mp4', audio: Buffer.alloc(40).toString('base64') });
    expect(res.status).toHaveBeenCalledWith(400); expect(m.save).not.toHaveBeenCalled();
  });
  it('respeta el rol y la baja del cliente', async () => {
    const body = { waId: '2025550100', mimeType: 'audio/mp4', audio: mp4 };
    m.rol = 'tecnico'; expect((await run(body)).status).toHaveBeenCalledWith(403);
    m.rol = 'administrador'; m.baja = true; expect((await run(body)).status).toHaveBeenCalledWith(403); expect(m.save).not.toHaveBeenCalled();
  });
  it('guarda autor y devuelve una URL; no envía mensajes', async () => {
    expect((await run({ waId: '2025550100', mimeType: 'audio/mp4', audio: mp4 })).status).toHaveBeenCalledWith(200);
    expect(m.save.mock.calls[0][1].metadata.metadata.autorUid).toBe('autor');
  });
});
