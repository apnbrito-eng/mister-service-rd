import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rol: 'administrador', personalVer: true }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ userProfile: { rol: m.rol } }) }));
vi.mock('../../src/utils/permisos', () => ({ puede: () => m.personalVer }));
import NavegacionPersonal from '../../src/components/personal/NavegacionPersonal';
const personas = [{ id: 'p-1', uid: 'auth-otro', nombre: 'Ana', rol: 'tecnico', activo: true }, { id: 'p-2', nombre: 'Ana', rol: 'tecnico', activo: true }];
async function abrir(id: string, lista = personas) {
  let vista!: ReactTestRenderer;
  await act(async () => { vista = create(React.createElement(MemoryRouter, { initialEntries: [`/admin/personal?personalId=${id}`] }, React.createElement(NavegacionPersonal, { personal: lista as never }))); });
  return vista;
}
it('navega con Personal.id conservando homónimos y sin sustituir por auth uid', async () => {
  m.rol = 'administrador'; m.personalVer = true;
  const v = await abrir('p-1');
  const enlaces = v.root.findAllByType('a');
  expect(enlaces.find(a => a.props.href.startsWith('/admin/usuarios'))?.props.href).toBe('/admin/usuarios?personalId=p-1');
  expect(enlaces.find(a => a.props.href.startsWith('/admin/ponches'))?.props.href).toBe('/admin/ponches?personalId=p-1');
  expect(v.root.findByType('select').props.value).toBe('p-1');
  await act(async () => v.unmount());
});
it('rol técnico no recibe accesos/ponches/nómina administrativos', async () => {
  m.rol = 'tecnico'; m.personalVer = true;
  const v = await abrir('p-2');
  expect(v.root.findAllByType('a').map(a => a.props.href)).toEqual(['/admin/personal?personalId=p-2']);
  await act(async () => v.unmount());
});
it('id desconocido informa y no elige un homónimo ni amplía el filtro', async () => {
  m.rol = 'administrador'; m.personalVer = true;
  const v = await abrir('p-desconocido');
  expect(v.root.findByType('select').props.value).toBe('p-desconocido');
  expect(v.root.findByProps({ role: 'alert' }).props.children).toContain('No se encontró');
  await act(async () => v.unmount());
});

it('no etiqueta como inactivo un registro legacy sin estado explícito', async () => {
  const lista = [{ ...personas[0], activo: undefined }, { ...personas[1], activo: false }];
  const v = await abrir('p-1', lista as never);
  const opciones = v.root.findAllByType('option');
  expect(opciones.find(o => o.props.value === 'p-1')?.children.join('')).not.toContain('Inactivo');
  expect(opciones.find(o => o.props.value === 'p-2')?.children.join('')).toContain('Inactivo');
  await act(async () => v.unmount());
});
