import React from 'react';
import { act, create } from 'react-test-renderer';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rol: 'administrador' }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ userProfile: { rol: state.rol } }) }));
vi.mock('../../src/utils/permisos', () => ({ puede: () => true }));
import EspacioTrabajo from '../../src/components/EspacioTrabajo';
function View() { const { pathname } = useLocation(); return React.createElement('div', null, React.createElement(EspacioTrabajo, { compacto: true }), React.createElement('output', null, pathname)); }
it('cambia de Clientes a Conversaciones desde el selector móvil', async () => {
 state.rol = 'administrador'; let tree: any;
 await act(async () => { tree = create(React.createElement(MemoryRouter, { initialEntries: ['/admin/clientes'] }, React.createElement(View))); });
 await act(async () => { tree.root.findByType('select').props.onChange({target:{value:'/admin/inbox'}}); });
 expect(tree.root.findByType('output').children).toEqual(['/admin/inbox']);
 expect(tree.root.findByType('select').props.value).toBe('/admin/inbox');
 act(() => tree.unmount());
});
it('no muestra Solicitudes reservadas al administrador a una operaria', async () => {
 state.rol = 'operaria'; let tree: any;
 await act(async () => { tree = create(React.createElement(MemoryRouter, { initialEntries: ['/admin/clientes'] }, React.createElement(View))); });
 const values = tree.root.findAllByType('option').map((n:any) => n.props.value);
 expect(values).toContain('/admin/inbox'); expect(values).not.toContain('/admin/solicitudes');
 act(() => tree.unmount());
});
