import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Cliente, PlantillaMarketing } from '../../src/types';
const estado = vi.hoisted(() => ({ rol: 'administrador', resolver: vi.fn(), seleccionar: vi.fn(), marcar: vi.fn(), cerrar: vi.fn(), open: vi.fn() }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ userProfile: { rol: estado.rol } }) }));
vi.mock('../../src/context/AtencionContext', () => ({ useAtencion: () => ({ seleccionar: estado.seleccionar }) }));
vi.mock('../../src/utils/resolverChatCliente', () => ({ resolverChatCliente: estado.resolver, numeroWhatsAppCliente: (telefono: string) => /^1?\d{10}$/.test(telefono) ? `1${telefono.slice(-10)}` : null }));
vi.mock('../../src/services/campanasMarketing.service', () => ({ marcarClienteEnviado: estado.marcar }));
vi.mock('../../src/components/Modal', () => ({ default: ({ children }: { children: React.ReactNode }) => React.createElement('section', null, children) }));
import ModalLinksWhatsApp from '../../src/components/clientes/ModalLinksWhatsApp';
let tree: ReactTestRenderer;
const cliente = { id: 'cliente-qa', nombre: 'Cliente QA', telefono: '8494580318' } as Cliente;
const plantilla = { id: 'p', nombre: 'Mantenimiento', mensaje: 'Hola {nombre}' } as PlantillaMarketing;
function Ubicacion() { const l = useLocation(); return React.createElement('output', null, l.pathname + l.search); }
function montar(clientes = [cliente]) {
  act(() => { tree = create(React.createElement(MemoryRouter, { initialEntries: ['/admin/clientes'] }, React.createElement(React.Fragment, null, React.createElement(ModalLinksWhatsApp, { isOpen: true, onClose: estado.cerrar, campanaId: 'campana-qa', plantilla, clientes }), React.createElement(Ubicacion)))); });
}
beforeEach(() => { vi.clearAllMocks(); estado.rol = 'administrador'; estado.resolver.mockResolvedValue('18494580318'); vi.stubGlobal('window', { open: estado.open }); });
afterEach(() => { act(() => tree?.unmount()); vi.unstubAllGlobals(); });
it('abre conversación completa con identidad cliente, sin enlaces externos ni marcar envío', async () => {
  montar();
  await act(async () => tree.root.findByProps({ 'aria-label': 'Abrir conversación de Cliente QA' }).props.onClick());
  expect(tree.root.findByType('output').children).toEqual(['/admin/inbox/18494580318?clienteId=cliente-qa']);
  expect(estado.resolver).toHaveBeenCalledExactlyOnceWith(cliente);
  expect(estado.seleccionar).toHaveBeenCalledWith({ clienteId: 'cliente-qa', nombre: 'Cliente QA', telefono: '8494580318', waId: '18494580318' });
  expect(estado.cerrar).toHaveBeenCalledOnce();
  expect(estado.open).not.toHaveBeenCalled(); expect(estado.marcar).not.toHaveBeenCalled();
  expect(tree.root.findAllByType('a')).toHaveLength(0);
});
it('teléfono incompatible y roles sin permiso no pueden abrir ni enviar', async () => {
  montar([{ ...cliente, telefono: '34612345678' }]);
  expect(tree.root.findByProps({ 'aria-label': 'Abrir conversación de Cliente QA' }).props.disabled).toBe(true);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Abrir conversación de Cliente QA' }).props.onClick());
  expect(estado.resolver).not.toHaveBeenCalled();
  act(() => tree.unmount()); estado.rol = 'secretaria'; montar();
  expect(tree.root.findByProps({ 'aria-label': 'Abrir conversación de Cliente QA' }).props.disabled).toBe(true);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Abrir conversación de Cliente QA' }).props.onClick());
  expect(estado.resolver).not.toHaveBeenCalled(); expect(estado.marcar).not.toHaveBeenCalled();
});
it('fallo conserva audiencia y permite reintentar sin afirmar contacto enviado', async () => {
  montar(); estado.resolver.mockRejectedValueOnce(new Error('Asociación incompatible'));
  await act(async () => tree.root.findByProps({ 'aria-label': 'Abrir conversación de Cliente QA' }).props.onClick());
  expect(tree.root.findByProps({ role: 'alert' }).children).toEqual(['Asociación incompatible']);
  expect(tree.root.findByType('output').children).toEqual(['/admin/clientes']);
  expect(estado.cerrar).not.toHaveBeenCalled();
  await act(async () => tree.root.findByProps({ 'aria-label': 'Abrir conversación de Cliente QA' }).props.onClick());
  expect(tree.root.findByType('output').children).toEqual(['/admin/inbox/18494580318?clienteId=cliente-qa']);
  expect(estado.marcar).not.toHaveBeenCalled();
});
