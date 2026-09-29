import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
const estado = vi.hoisted(() => ({ rol: 'administrador', seleccionar: vi.fn(), seleccion: { clienteId: 'cliente-qa', waId: '18090000000', nombre: 'Cliente QA' } }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ userProfile: { rol: estado.rol } }) }));
vi.mock('../../src/context/AtencionContext', () => ({ useAtencion: () => ({ seleccion: estado.seleccion, seleccionar: estado.seleccionar }) }));
import NavegacionMovil from '../../src/components/NavegacionMovil';
import EspacioTrabajo from '../../src/components/EspacioTrabajo';
let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); estado.rol = 'administrador'; vi.clearAllMocks(); });
function Ubicacion() { const l = useLocation(); return React.createElement('output', null, l.pathname + l.search); }
function abrir(ruta: string, compacto = true) { act(() => { tree = create(React.createElement(MemoryRouter, { initialEntries: [ruta] }, React.createElement(React.Fragment, null, React.createElement(NavegacionMovil, { onMenu: () => {}, menuAbierto: false }), React.createElement(EspacioTrabajo, { compacto }), React.createElement(Ubicacion)))); }); }
it('Atención y Servicios abren destinos directos y mantienen selección de área desde detalle', () => {
  abrir('/admin/inbox/18090000000');
  const links = tree.root.findAllByType('a');
  expect(links.find(n => n.props.href === '/admin/inbox')?.props['aria-current']).toBe('page');
  expect(links.some(n => n.props.href === '/admin/ordenes')).toBe(true);
  expect(links.some(n => n.props.href.startsWith('/admin/area/'))).toBe(false);
  expect(tree.root.findAllByType('option').some(n => n.props.value.startsWith('/admin/area/'))).toBe(false);
});
it('conserva el cliente al cambiar de conversación a ficha y permite volver al chat', () => {
  abrir('/admin/inbox/18090000000');
  act(() => tree.root.findByType('select').props.onChange({ target: { value: '/admin/clientes' } }));
  expect(tree.root.findByType('output').children).toEqual(['/admin/clientes?id=cliente-qa']);
  act(() => tree.root.findByType('select').props.onChange({ target: { value: '/admin/inbox' } }));
  expect(tree.root.findByType('output').children).toEqual(['/admin/inbox/18090000000']);
});
it('Ver todos borra contexto y vuelve a lista de conversación sin pantalla intermedia', () => {
  abrir('/admin/inbox/18090000000', false);
  act(() => tree.root.findAllByType('button').find(n => n.children.includes('Ver todos'))!.props.onClick());
  expect(estado.seleccionar).toHaveBeenCalledExactlyOnceWith(null);
  expect(tree.root.findByType('output').children).toEqual(['/admin/inbox']);
});
it('secretaria conserva acceso permitido y no ve solicitudes ni empresas en el selector', () => {
  estado.rol = 'secretaria'; abrir('/admin/clientes');
  const destinos = tree.root.findAllByType('option').map(n => n.props.value);
  expect(destinos).toContain('/admin/inbox');
  expect(destinos).not.toContain('/admin/solicitudes');
  expect(destinos).not.toContain('/admin/empresas-aliadas');
  expect(tree.root.findAllByType('a').some(n => n.props.href === '/admin/ordenes')).toBe(true);
});
