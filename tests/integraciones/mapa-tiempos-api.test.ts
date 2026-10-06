import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ acceso: vi.fn(), fetch: vi.fn(), get: vi.fn(), txget: vi.fn(), txset: vi.fn(), transaction: vi.fn() }));
vi.mock('../../api/_lib/accesoEquipo.js', () => ({ accesoEquipo: m.acceso, ErrorAcceso: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
import handler from '../../api/mapa/tiempos';
import { ErrorAcceso } from '../../api/_lib/accesoEquipo';
const puntos = [{ lat: 18.5, lng: -69.9 }, { lat: 18.6, lng: -69.8 }];
const request = (body: unknown = { puntos }) => ({ method: 'POST', body });
const response = () => { const r = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }; r.status.mockReturnValue(r); r.json.mockReturnValue(r); return r; };
async function call(body: unknown = { puntos }) { const r = response(); await handler(request(body) as never, r as never); return r; }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('fetch', m.fetch);
  vi.stubEnv('GOOGLE_ROUTES_ENABLED', 'true'); vi.stubEnv('GOOGLE_ROUTES_KEY', 'ficticia'); vi.stubEnv('GOOGLE_ROUTES_LIMITE_MENSUAL', '10');
  m.get.mockResolvedValue({ data: () => ({ rol: 'administrador' }) });
  m.txget.mockResolvedValue({ data: () => ({ solicitudes: 0 }) });
  m.transaction.mockImplementation(cb => cb({ get: m.txget, set: m.txset }));
  m.acceso.mockResolvedValue({ uid: 'usuario-prueba', rol: 'administrador', db: { collection: () => ({ doc: () => ({ get: m.get }) }), runTransaction: m.transaction } });
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ routes: [{ legs: [{ distanceMeters: 1250, duration: '125.5s' }], polyline: { encodedPolyline: 'ruta-ficticia' } }] }) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Routes API controlada', () => {
  it('no consulta Google sin activación explícita', async () => {
    vi.stubEnv('GOOGLE_ROUTES_ENABLED', 'false'); const r = await call();
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ fuente: 'estimado', motivo: 'sin_configurar' }));
    expect(m.fetch).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });
  it('rechaza body no objeto y coordenadas inválidas', async () => {
    for (const body of [null, 'texto', [], { puntos: [] }, { puntos: [puntos[0], { lat: NaN, lng: 0 }] }, { puntos, trafico: 'si' }]) {
      const r = await call(body); expect(r.status).toHaveBeenCalledWith(400);
    }
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it('respeta token y permiso personalizados', async () => {
    m.acceso.mockRejectedValueOnce(new ErrorAcceso(401, 'Sin sesión'));
    expect((await call()).status).toHaveBeenCalledWith(401);
    m.get.mockResolvedValue({ data: () => ({ permisosPersonalizados: true, permisosSistema: { ordenesVer: false } }) });
    expect((await call()).status).toHaveBeenCalledWith(403); expect(m.fetch).not.toHaveBeenCalled();
  });
  it('no supera un contador que ya llegó al límite', async () => {
    m.txget.mockResolvedValue({ data: () => ({ solicitudes: 10 }) });
    expect((await call()).json).toHaveBeenCalledWith(expect.objectContaining({ motivo: 'tope_mensual' }));
    expect(m.txset).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled();
  });
  it('reserva antes de consultar y conserva la cuenta si ocurre timeout', async () => {
    m.fetch.mockImplementation(() => { expect(m.txset).toHaveBeenCalled(); throw new Error('timeout'); });
    expect((await call()).json).toHaveBeenCalledWith(expect.objectContaining({ fuente: 'estimado' }));
    expect(m.txset).toHaveBeenCalledTimes(1);
  });
  it('entrega geometría y duración sin redondear a cero; no persiste rutas', async () => {
    const r = await call();
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ fuente: 'google', polilinea: 'ruta-ficticia', tramos: [{ km: 1.25, min: 125.5 / 60 }] }));
    expect(m.txset).toHaveBeenCalledTimes(1);
    expect(m.fetch.mock.calls[0][1].headers['X-Goog-FieldMask']).toContain('encodedPolyline');
  });
  it('solicitudes concurrentes comparten la reserva transaccional del límite', async () => {
    vi.stubEnv('GOOGLE_ROUTES_LIMITE_MENSUAL', '1');
    let uso = 0;
    let cola = Promise.resolve();
    // Replica la serialización del documento de cuota que garantiza Firestore.
    m.transaction.mockImplementation(cb => {
      const tarea = cola.then(() => cb({
        get: async () => ({ data: () => ({ solicitudes: uso }) }),
        set: (_ref: unknown, data: { solicitudes: number }) => { uso = data.solicitudes; },
      }));
      cola = tarea.then(() => undefined);
      return tarea;
    });
    const resultados = await Promise.all([call(), call(), call()]);
    expect(uso).toBe(1); expect(m.fetch).toHaveBeenCalledTimes(1);
    expect(resultados.filter(r => r.json.mock.calls[0][0].fuente === 'google')).toHaveLength(1);
  });
  it('acepta JSON crudo enviado por curl a un servidor HTTP local', async () => {
    vi.stubEnv('GOOGLE_ROUTES_ENABLED', 'false');
    const server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      const adapter = {
        setHeader: (key: string, value: string) => res.setHeader(key, value),
        status: (status: number) => { res.statusCode = status; return adapter; },
        json: (value: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return adapter; },
      };
      await handler({ ...req, method: req.method, body, headers: req.headers } as never, adapter as never);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address() as { port: number };
      const { stdout } = await promisify(execFile)('curl', ['--silent', '--show-error', '--fail',
        '-H', 'Content-Type: application/json', '--data', JSON.stringify({ puntos }),
        `http://127.0.0.1:${address.port}/api/mapa/tiempos`]);
      expect(JSON.parse(stdout)).toMatchObject({ fuente: 'estimado', motivo: 'sin_configurar' });
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it('respuesta inválida del proveedor conserva estimación', async () => {
    m.fetch.mockResolvedValue({ ok: true, json: async () => ({ routes: [{ legs: [{ distanceMeters: 1, duration: 'oops' }] }] }) });
    expect((await call()).json).toHaveBeenCalledWith(expect.objectContaining({ fuente: 'estimado' }));
  });
});
