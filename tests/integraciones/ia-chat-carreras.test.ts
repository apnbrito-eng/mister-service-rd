import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ currentUser: { uid: 'prueba' } }) }));
vi.mock('../../src/services/iaChatTransport', () => ({ enviarPreguntaIA: vi.fn(), ErrorTransporteIA: class extends Error {} }));
import { enviarPreguntaIA } from '../../src/services/iaChatTransport';
import { useAsistenteIAChat, type UseAsistenteIAChatReturn } from '../../src/hooks/useAsistenteIAChat';
let chat: UseAsistenteIAChatReturn;
let vista: ReturnType<typeof create>;
function Harness() { chat = useAsistenteIAChat(); return null; }
function pendiente() {
  let resolver!: (v: Awaited<ReturnType<typeof enviarPreguntaIA>>) => void;
  const promesa = new Promise<Awaited<ReturnType<typeof enviarPreguntaIA>>>(r => { resolver = r; });
  return { promesa, resolver };
}
const respuesta = (texto: string) => ({ ok: true, status: 200, data: { respuesta: texto, conversacionId: texto } });
afterEach(() => { act(() => vista.unmount()); vi.resetAllMocks(); });
describe('sesiones del chat', () => {
  it('descarta una respuesta anterior aunque el transporte no respete la cancelación', async () => {
    const vieja = pendiente(); vi.mocked(enviarPreguntaIA).mockReturnValueOnce(vieja.promesa);
    act(() => { vista = create(createElement(MemoryRouter, null, createElement(Harness))); });
    let envio!: Promise<void>;
    act(() => { envio = chat.enviar('primera'); });
    act(() => chat.limpiar());
    await act(async () => { vieja.resolver(respuesta('vieja')); await envio; });
    expect(chat.mensajes).toEqual([]);
    expect(chat.conversacionId).toBeNull();
    expect(chat.pensando).toBe(false);
  });
  it('una solicitud reemplazada no detiene la espera ni contamina la respuesta actual', async () => {
    const vieja = pendiente(), nueva = pendiente();
    vi.mocked(enviarPreguntaIA).mockReturnValueOnce(vieja.promesa).mockReturnValueOnce(nueva.promesa);
    act(() => { vista = create(createElement(MemoryRouter, null, createElement(Harness))); });
    let envioViejo!: Promise<void>, envioNuevo!: Promise<void>;
    act(() => { envioViejo = chat.enviar('primera'); });
    act(() => { chat.limpiar(); envioNuevo = chat.enviar('segunda'); });
    await act(async () => { vieja.resolver(respuesta('vieja')); await envioViejo; });
    expect(chat.pensando).toBe(true);
    await act(async () => { nueva.resolver(respuesta('nueva')); await envioNuevo; });
    expect(chat.mensajes.map(m => m.content)).toEqual(['segunda', 'nueva']);
    expect(chat.conversacionId).toBe('nueva');
  });
});
