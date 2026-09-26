import React from 'react';
import { create, act } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/lib/appCheck', () => ({ obtenerAppCheckToken: async () => null }));
import EvaluacionServicio from '../../src/components/public/EvaluacionServicio';
let tree: any;
const fetchMock = vi.fn(), done = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { act(() => tree?.unmount()); vi.unstubAllGlobals(); });
async function mount() { await act(async () => { tree = create(React.createElement(EvaluacionServicio, { token: 'prueba', onEnviado: done })); }); }
async function completar() { for (const name of ['puntualidad', 'trato', 'claridad', 'calidad']) await act(async () => { tree.root.findAllByType('input').find((n: any) => n.props.name === name && n.props.value === 4).props.onChange(); }); }
it('requiere las cuatro categorías y permite comentario vacío', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200 }); await mount();
  expect(tree.root.findByType('button').props.disabled).toBe(true);
  await completar(); expect(tree.root.findByType('button').props.disabled).toBe(false);
  await act(async () => { await tree.root.findByType('button').props.onClick(); });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ evaluacion: { puntualidad: 4, trato: 4, claridad: 4, calidad: 4 }, comentario: '' });
  expect(done).toHaveBeenCalledTimes(1);
});
it('fallo de red conserva las respuestas y permite reintentar', async () => {
  fetchMock.mockRejectedValue(Error('red')); await mount(); await completar();
  await act(async () => { await tree.root.findByType('button').props.onClick(); });
  expect(done).not.toHaveBeenCalled();
  expect(tree.root.findAllByType('input').filter((n: any) => n.props.checked)).toHaveLength(4);
  expect(tree.root.findByType('button').props.disabled).toBe(false);
  expect(tree.root.findByProps({ role: 'alert' })).toBeTruthy();
});
