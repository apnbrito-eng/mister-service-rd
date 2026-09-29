import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  getDoc: vi.fn(), fetch: vi.fn(), getIdToken: vi.fn(),
  auth: { currentUser: null as null | { getIdToken: () => Promise<string> } },
}));
vi.mock('../../src/firebase/config', () => ({ db: {}, auth: m.auth }));
vi.mock('firebase/firestore', async original => ({
  ...await original<typeof import('firebase/firestore')>(),
  doc: () => ({}), getDoc: m.getDoc,
}));
import { obtenerUbicacionAPI } from '../../src/services/gps.service';
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.currentUser = { getIdToken: m.getIdToken };
  m.getIdToken.mockResolvedValue('token-ficticio');
  m.getDoc.mockRejectedValue(new Error('Configuración privada'));
  vi.stubGlobal('fetch', m.fetch);
});
afterEach(() => vi.unstubAllGlobals());
describe('consulta GPS sin acceso a credenciales privadas', () => {
  it('obtiene ubicación vía servidor aunque el cliente no pueda leer la configuración', async () => {
    m.fetch.mockResolvedValue({ ok: true, json: async () => ({ lat: 18, lng: -69, velocidad: 20 }) });
    expect(await obtenerUbicacionAPI('vehiculo-prueba')).toMatchObject({ lat: 18, lng: -69, velocidad: 20 });
    expect(m.getDoc).not.toHaveBeenCalled();
    expect(m.fetch).toHaveBeenCalledWith('/api/gps/ubicacion', expect.objectContaining({
      body: JSON.stringify({ vehiculoId: 'vehiculo-prueba' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-ficticio' },
    }));
  });
  it('sin sesión no consulta el proveedor ni la configuración', async () => {
    m.auth.currentUser = null;
    expect(await obtenerUbicacionAPI('vehiculo-prueba')).toBeNull();
    expect(m.fetch).not.toHaveBeenCalled();
    expect(m.getDoc).not.toHaveBeenCalled();
  });
  it('GPS deshabilitado o de dispositivo conserva la respuesta vacía', async () => {
    m.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'GPS no disponible' }) });
    expect(await obtenerUbicacionAPI('vehiculo-prueba')).toBeNull();
  });
});
