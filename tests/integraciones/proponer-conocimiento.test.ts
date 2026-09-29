import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import ProponerConocimiento from '../../src/components/inbox/ProponerConocimiento';
const api = vi.hoisted(() => vi.fn(async () => ({ id: 'qa' })));
vi.mock('../../src/services/equipoApi', () => ({ equipoApi: api }));
it('redacta vacío y envía únicamente aporte pendiente manual sin datos del chat', async () => {
  let vista: ReturnType<typeof create>;
  act(() => { vista = create(React.createElement(ProponerConocimiento)); });
  act(() => vista!.root.findByType('button').props.onClick());
  expect(vista!.root.findByType('input').props.value).toBe('');
  expect(vista!.root.findByType('textarea').props.value).toBe('');
  act(() => { vista!.root.findByType('input').props.onChange({ target: { value: 'Limpieza general' } }); vista!.root.findByType('textarea').props.onChange({ target: { value: 'Procedimiento general para revisión del equipo.' } }); });
  await act(async () => vista!.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  expect(api).toHaveBeenCalledWith('/api/ai/conocimiento', { accion: 'crear', titulo: 'Limpieza general', contenido: 'Procedimiento general para revisión del equipo.', requestId: expect.any(String) });
  expect(vista!.root.findByProps({ role: 'status' }).children.join('')).toContain('No se publica automáticamente');
  act(() => vista!.unmount());
});

it('fallo conserva borrador, bloquea doble envío y permite reintentar', async () => {
  api.mockClear();
  let rechazar!: (error: Error) => void;
  api.mockImplementationOnce(() => new Promise((_resolve, reject) => { rechazar = reject; }));
  let vista: ReturnType<typeof create>;
  act(() => { vista = create(React.createElement(ProponerConocimiento)); });
  act(() => vista!.root.findByType('button').props.onClick());
  act(() => { vista!.root.findByType('input').props.onChange({ target: { value: 'Procedimiento' } }); vista!.root.findByType('textarea').props.onChange({ target: { value: 'Borrador de procedimiento que debe conservarse.' } }); });
  act(() => { const enviar = vista!.root.findByType('form').props.onSubmit; enviar({ preventDefault() {} }); enviar({ preventDefault() {} }); });
  expect(api).toHaveBeenCalledTimes(1);
  expect(vista!.root.findByType('input').props.disabled).toBe(true);
  await act(async () => { rechazar(new Error('Fallo de ensayo')); });
  expect(vista!.root.findByType('input').props.value).toBe('Procedimiento');
  expect(vista!.root.findByType('textarea').props.value).toContain('conservarse');
  await act(async () => vista!.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  expect(api).toHaveBeenCalledTimes(2);
  expect(api.mock.calls[0][1].requestId).toBe(api.mock.calls[1][1].requestId);
  act(() => vista!.unmount());
});
