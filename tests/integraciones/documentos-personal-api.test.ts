import { beforeEach, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const m = vi.hoisted(() => ({ perfil: {} as Record<string, unknown>, documento: {} as Record<string, unknown>, save: vi.fn(), eliminar: vi.fn(), descargar: vi.fn(), metadata: vi.fn(), storage: vi.fn(), set: vi.fn(), audit: vi.fn(), lectura: vi.fn(), falloTx: false }));
vi.mock('../../api/_lib/accesoEquipo.js', () => ({
 ErrorAcceso: class extends Error { constructor(public status: number, mensaje: string) { super(mensaje); } },
 accesoEquipo: async () => ({ uid: 'uid-admin-sintetico', db: {
  doc: (path: string) => ({ path, get: async () => ({ exists: true, data: () => path.startsWith('usuarios/') ? m.perfil : path.startsWith('personal_privado/') ? m.documento : {} }) }),
  collection: () => ({ doc: () => ({ path: 'auditoria_admin/sintetica' }), add: m.lectura }),
  runTransaction: async (fn: (tx: object) => Promise<void>) => {
   await fn({ get: async (ref: { path: string; get: () => Promise<unknown> }) => ref.get(), set: m.set, create: m.audit });
   if (m.falloTx) throw new Error('fallo sintético de commit');
  },
 } }),
}));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({ getAdminStorage: m.storage }));
import handler from '../../api/personal/documentos';
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(8)]);
function respuesta() {
 const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
 res.status.mockReturnValue(res); res.json.mockReturnValue(res);
 return res;
}
const request = (method: string, extra: object = {}) => ({ method, query: {}, headers: {}, ...extra }) as unknown as VercelRequest;
beforeEach(() => {
 vi.clearAllMocks(); m.perfil = { rol: 'administrador', activo: true }; m.documento = {}; m.falloTx = false;
 m.storage.mockReturnValue({ bucket: () => ({ file: (path: string) => ({ path, save: m.save, delete: m.eliminar, download: m.descargar, getMetadata: m.metadata }) }) });
 m.save.mockResolvedValue(undefined); m.eliminar.mockResolvedValue(undefined); m.descargar.mockResolvedValue([png]);
 m.metadata.mockResolvedValue([{ contentType: 'image/png', size: png.length }]);
});
it('rechaza rol operaria antes de tocar almacenamiento privado', async () => {
 m.perfil = { rol: 'operaria', activo: true }; const res = respuesta();
 await handler(request('POST', { body: { id: 'empleado', tipo: 'cedula', base64: png.toString('base64'), mime: 'image/png' } }), res as unknown as VercelResponse);
 expect(res.status).toHaveBeenCalledWith(403); expect(m.storage).not.toHaveBeenCalled();
});
it('guarda solo ruta privada y auditoría dentro de la transacción; no devuelve URL pública', async () => {
 const res = respuesta();
 await handler(request('POST', { body: { id: 'empleado', tipo: 'cedula', base64: png.toString('base64'), mime: 'image/png' } }), res as unknown as VercelResponse);
 expect(m.save).toHaveBeenCalledWith(png, { resumable: false, metadata: { contentType: 'image/png', cacheControl: 'private, no-store' } });
 const privado = m.set.mock.calls[0][1].documentos.cedula;
 expect(privado.storagePath).toMatch(/^crm-private\/personal\/empleado\/[a-f0-9-]{36}$/);
 expect(privado.actualizadoPor).toBe('uid-admin-sintetico'); expect(m.audit).toHaveBeenCalledTimes(1);
 expect(res.json).toHaveBeenCalledWith({ ok: true, tipo: 'cedula' }); expect(m.eliminar).not.toHaveBeenCalled();
});
it('elimina el nuevo objeto si falla el commit de metadatos', async () => {
 m.falloTx = true; const res = respuesta();
 await handler(request('POST', { body: { id: 'empleado', tipo: 'foto', base64: png.toString('base64'), mime: 'image/png' } }), res as unknown as VercelResponse);
 expect(m.eliminar).toHaveBeenCalledTimes(1); expect(res.status).toHaveBeenCalledWith(500);
 expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
});
it('lee bytes por JSON autenticado, audita y no expone ruta ni URL', async () => {
 m.documento = { documentos: { licencia: { storagePath: 'crm-private/personal/empleado/00000000-0000-0000-0000-000000000000' } } };
 const res = respuesta();
 await handler(request('GET', { query: { id: 'empleado', tipo: 'licencia' } }), res as unknown as VercelResponse);
 expect(res.status).toHaveBeenCalledWith(200); expect(res.json).toHaveBeenCalledWith({ mime: 'image/png', base64: png.toString('base64') });
 expect(m.lectura).toHaveBeenCalledWith(expect.objectContaining({ actorUid: 'uid-admin-sintetico', accion: 'lectura_documento_personal_privado' }));
 expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
});
