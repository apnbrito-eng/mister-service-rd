import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { Cliente } from '../../src/types';
const m = vi.hoisted(() => ({ rol: 'administrador', denegado: false, error: '', reintentar: vi.fn(), api: vi.fn(), clientes: [] as Cliente[], hook: vi.fn() }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ userProfile: { rol: m.rol, permisosPersonalizados: m.denegado, permisosSistema: { clientesVer: false } } }) }));
vi.mock('../../src/hooks/useClientesEnVivo', () => ({ useClientesEnVivo: () => { m.hook(); return { clientes: m.clientes, loading: false, error: m.error, reintentar: m.reintentar }; } }));
vi.mock('../../src/services/equipoApi', () => ({ equipoApi: m.api }));
vi.mock('../../src/services/carteraClientes.service', () => ({ gestionarCartera: vi.fn(), leerHistorialCartera: vi.fn() }));
vi.mock('../../src/components/crm/GestionOrden', () => ({ default: () => React.createElement('p', null, 'Detalle orden') }));
import ClientesResponsables from '../../src/pages/ClientesResponsables';
import { parseCliente } from '../../src/utils';
let tree: ReactTestRenderer;
function Ruta() { return React.createElement('output', null, useLocation().pathname + useLocation().search); }
function montar() { act(() => { tree = create(React.createElement(MemoryRouter, null, React.createElement(ClientesResponsables), React.createElement(Ruta))); }); }
beforeEach(() => {
  vi.clearAllMocks(); m.rol = 'administrador'; m.denegado = false; m.error = '';
  m.clientes = [parseCliente('cliente-a', { nombre: 'Cliente sin órdenes A', telefono: '8091234567', carteraEquipo: 'A' }), parseCliente('cliente-b', { nombre: 'Cliente sin órdenes B', telefono: '8091234568', carteraEquipo: 'B' })];
  m.api.mockResolvedValue({ items: [{ id: 'orden-1', clienteId: 'cliente-a', clienteNombre: 'Cliente sin órdenes A', numero: 'OS-QA', equipo: 'Lavadora', responsableId: 'persona', responsableNombre: 'Responsable QA', tecnicoId: '', tecnicoNombre: '', operariaId: '', operariaNombre: '', participantes: {}, fase: '', etapa: '', pagos: [] }], cursor: null });
});
afterEach(() => act(() => tree?.unmount()));
it('muestra cartera canónica sin depender de órdenes y abre la ficha, sin llamadas financieras', () => {
  montar();
  const contenido = JSON.stringify(tree.toJSON());
  expect(tree.root.findAllByType('h2').map(n => n.children.join(''))).toEqual(['Equipo A · 1', 'Equipo B · 1']);
  expect(contenido).toContain('Cliente sin órdenes A'); expect(contenido).toContain('Cliente sin órdenes B');
  expect(m.api).not.toHaveBeenCalled();
  act(() => tree.root.findAllByType('button').find(b => b.findAllByType('span').some(s => s.children.includes('Cliente sin órdenes A')))!.props.onClick());
  expect(tree.root.findByType('output').children.join('')).toBe('/admin/clientes?id=cliente-a');
});
it('conserva la consulta antigua de responsables de órdenes al seleccionarla', async () => {
  montar();
  await act(async () => tree.root.findByProps({ 'aria-label': 'Vista' }).props.onChange({ target: { value: 'ordenes' } }));
  expect(m.api).toHaveBeenCalledWith('/api/crm/cartera');
  expect(JSON.stringify(tree.toJSON())).toContain('Responsable QA');
  expect(JSON.stringify(tree.toJSON())).toContain('OS-QA');
});
it('mantiene acceso limitado y no suscribe clientes para otros roles', () => {
  m.rol = 'tecnico'; montar();
  expect(m.api).not.toHaveBeenCalled(); expect(m.hook).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('administración y coordinación');
});

it('revocar clientesVer impide la suscripción pero mantiene consulta de órdenes autorizada', async () => {
  m.denegado = true; montar();
  expect(m.hook).not.toHaveBeenCalled(); expect(m.api).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('No tienes permiso');
  await act(async () => tree.root.findByProps({ 'aria-label': 'Vista' }).props.onChange({ target: { value: 'ordenes' } }));
  expect(m.api).toHaveBeenCalledWith('/api/crm/cartera');
});
it('error de cartera oculta resultados potencialmente obsoletos y permite reintentar', () => {
  m.error = 'No se pudo actualizar'; montar();
  expect(JSON.stringify(tree.toJSON())).not.toContain('Cliente sin órdenes A');
  act(() => tree.root.findAllByType('button').find(b => b.children.includes('Reintentar'))!.props.onClick());
  expect(m.reintentar).toHaveBeenCalledOnce();
});
