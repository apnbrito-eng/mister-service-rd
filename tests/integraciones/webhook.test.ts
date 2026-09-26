import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const mocks = vi.hoisted(() => ({ firestore: vi.fn() }));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({ getAdminFirestore: mocks.firestore }));
import handler from '../../api/whatsapp/webhook';
function request(payload: object, valid = true) {
  const raw = Buffer.from(JSON.stringify(payload));
  return Object.assign(Readable.from([raw]), { method: 'POST', headers: { 'x-hub-signature-256': valid ? 'sha256=' + createHmac('sha256', 'test-secret').update(raw).digest('hex') : 'sha256=invalid' }, query: {} }) as VercelRequest;
}
function response() {
  const res = { code: 0, body: undefined as unknown, setHeader: vi.fn(), status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; }, send(body: unknown) { this.body = body; return this; } };
  return res;
}
const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: '111' }, messages: [{ id: 'wamid.test', from: '18295550123', timestamp: '1770000000', type: 'text', text: { body: 'Hola' } }] } }] }] };
describe('Recepción fiable de WhatsApp', () => {
  beforeEach(() => { vi.stubEnv('META_APP_SECRET', 'test-secret'); mocks.firestore.mockReset(); });
  it('rechaza firma falsa antes de acceder a datos', async () => {
    const res = response(); await handler(request(payload, false), res as unknown as VercelResponse);
    expect(res.code).toBe(401); expect(mocks.firestore).not.toHaveBeenCalled();
  });
  it('pide reintento si el almacenamiento no está disponible', async () => {
    mocks.firestore.mockImplementation(() => { throw new Error('offline'); });
    const res = response(); await handler(request(payload), res as unknown as VercelResponse);
    expect(res.code).toBe(503);
  });
  it('no confirma éxito cuando falla una transacción de mensaje', async () => {
    mocks.firestore.mockReturnValue({ collection: () => ({ doc: () => ({}) }), runTransaction: async () => { throw new Error('offline'); } });
    const res = response(); await handler(request(payload), res as unknown as VercelResponse);
    expect(res.code).toBe(503); expect(res.body).toEqual({ ok: false });
  });
  it('deduplica un reintento sin incrementar la conversación', async () => {
    const set = vi.fn();
    mocks.firestore.mockReturnValue({ collection: () => ({ doc: () => ({}) }), runTransaction: async (cb: (tx: object) => Promise<void>) => cb({ get: async () => ({ exists: true }), set }) });
    const res = response(); await handler(request(payload), res as unknown as VercelResponse);
    expect(res.code).toBe(200); expect(set).not.toHaveBeenCalled();
  });
});
