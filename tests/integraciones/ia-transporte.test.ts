import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/lib/appCheck', () => ({ obtenerAppCheckToken: vi.fn() }));
import { obtenerAppCheckToken } from '../../src/lib/appCheck';
import { enviarPreguntaIA, ErrorTransporteIA } from '../../src/services/iaChatTransport';
const usuario = { getIdToken: async () => 'identidad-prueba' };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetAllMocks(); });
describe('Transporte del asistente', () => {
  it('envía identidad y App Check juntos al servidor', async () => {
    vi.mocked(obtenerAppCheckToken).mockResolvedValue('app-prueba');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await enviarPreguntaIA(usuario, { mensajes: [] }, new AbortController().signal);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer identidad-prueba', 'X-Firebase-AppCheck': 'app-prueba' });
  });
  it('explica la validación fallida y no envía una petición que será rechazada', async () => {
    vi.mocked(obtenerAppCheckToken).mockResolvedValue(null);
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(enviarPreguntaIA(usuario, {}, new AbortController().signal)).rejects.toBeInstanceOf(ErrorTransporteIA);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('detiene una petición cancelada mientras se obtenían credenciales', async () => {
    vi.mocked(obtenerAppCheckToken).mockResolvedValue('app-prueba');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController(); controller.abort();
    await expect(enviarPreguntaIA(usuario, {}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('limita también la espera cuando la validación del navegador no responde', async () => {
    vi.useFakeTimers(); vi.mocked(obtenerAppCheckToken).mockReturnValue(new Promise(() => {}));
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const resultado = expect(enviarPreguntaIA(usuario, {}, new AbortController().signal)).rejects.toThrow('tardando demasiado');
    await vi.advanceTimersByTimeAsync(60000); await resultado;
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('limita la espera del servidor y no reintenta acciones automáticamente', async () => {
    vi.useFakeTimers(); vi.mocked(obtenerAppCheckToken).mockResolvedValue('app-prueba');
    const fetchMock = vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Abortado', 'AbortError')))));
    vi.stubGlobal('fetch', fetchMock);
    const resultado = expect(enviarPreguntaIA(usuario, {}, new AbortController().signal)).rejects.toThrow('tardando demasiado');
    await vi.advanceTimersByTimeAsync(60000); await resultado;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('limita la lectura del cuerpo aunque ya llegaron las cabeceras', async () => {
    vi.useFakeTimers(); vi.mocked(obtenerAppCheckToken).mockResolvedValue('app-prueba');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => {}) }));
    const resultado = expect(enviarPreguntaIA(usuario, {}, new AbortController().signal)).rejects.toThrow('tardando demasiado');
    await vi.advanceTimersByTimeAsync(60000); await resultado;
  });
  it('entrega el cuerpo completo y su estado HTTP', async () => {
    vi.mocked(obtenerAppCheckToken).mockResolvedValue('app-prueba');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ respuesta: 'Hola' }))));
    await expect(enviarPreguntaIA(usuario, {}, new AbortController().signal)).resolves.toMatchObject({ ok: true, status: 200, data: { respuesta: 'Hola' } });
  });

});
