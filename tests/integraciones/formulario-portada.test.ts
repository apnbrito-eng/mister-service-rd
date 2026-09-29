import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  loading: false,
  enviar: vi.fn(async () => ({ ok: false, error: 'Respuesta de ensayo' })),
  error: vi.fn(),
}));
vi.mock('../../src/firebase/config', () => ({ storage: {} }));
vi.mock('../../src/services/formularioAgendar.service', () => ({
  enviarSolicitudCita: mocks.enviar,
  suscribirConfigFormularioAgendar: (callback: (config: object) => void) => { callback({ habilitado: true }); return () => {}; },
}));
vi.mock('../../src/services/clientes.service', () => ({ normalizarTelefono: (value: string) => value.replace(/\D/g, '') }));
vi.mock('../../src/hooks/useConfigWeb', () => ({ useConfigWeb: () => ({ loading: mocks.loading, config: {
  tiposEquipoPublicos: ['Lavadora', 'Nevera'], whatsapp: { mensajePredeterminado: 'Hola' },
} }) }));
vi.mock('../../src/components/shared/CampoDireccionConPlaces', () => ({ default: () => null }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { error: mocks.error, success: vi.fn() }) }));
import Formulario from '../../src/components/public/FormularioAgendarPublico';
let tree: ReactTestRenderer;
const render = (query = 'equipo=Nevera&servicio=Mantenimiento') => React.createElement(MemoryRouter, { initialEntries: [`/agendar?${query}`] }, React.createElement(Formulario));
const equipo = () => tree.root.findByProps({ name: 'cita-equipo-tipo-no-autofill' });
const falla = () => tree.root.findAllByType('textarea').find(node => node.props.placeholder?.includes('Describe brevemente'))!;
const cambiar = (node: ReturnType<typeof equipo>, value: string) => act(() => node.props.onChange({ target: { value } }));
beforeEach(() => { mocks.loading = false; mocks.enviar.mockClear(); mocks.error.mockClear(); });
afterEach(() => { act(() => tree?.unmount()); });
it('preselecciona equipo y mantiene intención separada de la descripción obligatoria', async () => {
  act(() => { tree = create(render()); });
  expect(equipo().props.value).toBe('Nevera');
  expect(falla().props.value).toBe('');
  expect(JSON.stringify(tree.toJSON())).toContain('Mantenimiento');
  cambiar(tree.root.findByProps({ autoComplete: 'name' }), 'Cliente de prueba');
  cambiar(tree.root.findByProps({ autoComplete: 'tel' }), '8095551234');
  await act(async () => { await tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  expect(mocks.enviar).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith('Describe el problema con al menos 10 caracteres');
  cambiar(falla(), 'Solicito limpiar el equipo');
  await act(async () => { await tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  expect(mocks.enviar).toHaveBeenCalledWith(expect.objectContaining({ equipoTipo: 'Nevera', falla: '[Mantenimiento] Solicito limpiar el equipo' }));
});
it('la carga de configuración no sobrescribe datos que el usuario ya escribió', () => {
  mocks.loading = true;
  act(() => { tree = create(render()); });
  cambiar(falla(), 'Texto escrito durante la carga');
  mocks.loading = false;
  act(() => { tree.update(render()); });
  expect(equipo().props.value).toBe('Nevera');
  expect(falla().props.value).toBe('Texto escrito durante la carga');
  cambiar(equipo(), 'Lavadora');
  act(() => { tree.update(render()); });
  expect(equipo().props.value).toBe('Lavadora');
});
it('no preselecciona valores manipulados fuera del catálogo', () => {
  act(() => { tree = create(render('equipo=EquipoAjeno&servicio=TextoAjeno')); });
  expect(equipo().props.value).toBe('');
  expect(falla().props.value).toBe('');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Servicio:');
});
