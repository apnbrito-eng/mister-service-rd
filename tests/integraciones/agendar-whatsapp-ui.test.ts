import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ enviar: vi.fn(), error: vi.fn(), abrir: vi.fn() }));
vi.mock('../../src/services/formularioAgendar.service', () => ({
 enviarSolicitudCita: m.enviar,
 suscribirConfigFormularioAgendar: (cb: (value: object) => void) => { cb({ habilitado: true }); return () => {}; },
}));
vi.mock('../../src/hooks/useConfigWeb', () => ({ useConfigWeb: () => ({ loading: false, config: { whatsapp: { mensajePredeterminado: 'Hola' }, tiposEquipoPublicos: ['Nevera'] } }) }));
vi.mock('../../src/services/clientes.service', () => ({ normalizarTelefono: (v: string) => v.replace(/\D/g, '') }));
vi.mock('../../src/services/subidasPublicas.service', () => ({ subirArchivoPublicoSeguro: vi.fn() }));
vi.mock('../../src/components/shared/CampoDireccionConPlaces', () => ({ default: () => null }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { error: m.error }) }));
import Formulario from '../../src/components/public/FormularioAgendarPublico';
let vista: ReactTestRenderer;
beforeEach(async () => {
 vi.clearAllMocks();
 vi.stubGlobal('window', { location: { assign: m.abrir }, scrollTo: vi.fn(), setTimeout, clearTimeout });
 await act(async () => { vista = create(React.createElement(MemoryRouter, { initialEntries: ['/agendar?equipo=Nevera&servicio=Mantenimiento'] }, React.createElement(Formulario))); });
 await act(async () => {
  vista.root.findByProps({ autoComplete: 'name' }).props.onChange({ target: { value: 'Cliente de prueba' } });
  vista.root.findByProps({ autoComplete: 'tel' }).props.onChange({ target: { value: '8095550100' } });
  vista.root.findByType('textarea').props.onChange({ target: { value: 'Limpieza & revisión del equipo' } });
 });
});
afterEach(() => { act(() => vista.unmount()); vi.unstubAllGlobals(); });
const enviar = () => vista.root.findByType('form').props.onSubmit({ preventDefault() {} });
it('espera el guardado interno antes de abrir el WhatsApp central y conserva enlace de respaldo', async () => {
 let resolver!: (v: object) => void;
 m.enviar.mockImplementation(() => new Promise(resolve => { resolver = resolve; }));
 let pendiente!: Promise<void>;
 await act(async () => { pendiente = enviar(); });
 expect(m.abrir).not.toHaveBeenCalled();
 expect(vista.root.findByProps({ type: 'submit' }).props.disabled).toBe(true);
 await act(async () => { resolver({ ok: true, citaId: 'qa-cita' }); await pendiente; });
 expect(m.enviar).toHaveBeenCalledWith(expect.objectContaining({ clienteNombre: 'Cliente de prueba', falla: '[Mantenimiento] Limpieza & revisión del equipo' }));
 expect(m.abrir).toHaveBeenCalledTimes(1);
 const url = new URL(m.abrir.mock.calls[0][0]);
 expect(url.origin + url.pathname).toBe('https://wa.me/18495646767');
 expect(url.searchParams.get('text')).toContain('*Solicitud:* qa-cita');
 expect(url.searchParams.get('text')).toContain('Limpieza & revisión del equipo');
 expect(vista.root.findByProps({ href: url.href })).toBeDefined();
});
it.each([{ ok: false, error: 'Revisa los datos' }, { ok: false, error: 'duplicado_24h' }])('no abre WhatsApp cuando el servidor rechaza: $error', async respuesta => {
 m.enviar.mockResolvedValue(respuesta);
 await act(async () => { await enviar(); });
 expect(m.abrir).not.toHaveBeenCalled();
 expect(vista.root.findByType('form')).toBeDefined();
});
it('no pierde los datos cuando falla la red', async () => {
 m.enviar.mockRejectedValue(new Error('simulación de fallo'));
 const log = vi.spyOn(console, 'error').mockImplementation(() => {});
 try {
  await act(async () => { await enviar(); });
  expect(m.abrir).not.toHaveBeenCalled();
  expect(vista.root.findByProps({ autoComplete: 'name' }).props.value).toBe('Cliente de prueba');
 } finally { log.mockRestore(); }
});
it('un bloqueo de navegación conserva la confirmación y no anuncia error de guardado', async () => {
 m.enviar.mockResolvedValue({ ok: true, citaId: 'qa-cita', whatsappAsignado: '18090000000' });
 m.abrir.mockImplementationOnce(() => { throw new Error('bloqueado'); });
 await act(async () => { await enviar(); });
 expect(m.error).not.toHaveBeenCalled();
 expect(vista.root.findAllByType('form')).toHaveLength(0);
 expect(vista.root.findAllByType('a').some(a => a.props.href.startsWith('https://wa.me/18495646767'))).toBe(true);
});
