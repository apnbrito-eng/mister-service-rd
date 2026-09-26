import React from 'react';
import { create, act } from 'react-test-renderer';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ send: vi.fn(), update: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: m.update, Timestamp: { now: () => new Date() } }));
vi.mock('../../src/services/whatsapp.service', () => ({ enviarTexto: m.send }));
vi.mock('../../src/services/clientes.service', () => ({ normalizarTelefono: (x: string) => x }));
vi.mock('react-hot-toast', () => ({ default: { success: m.success, error: m.error } }));
import Button from '../../src/components/ordenes/EnviarPortalButton';
let tree: any;
beforeEach(() => { vi.clearAllMocks(); m.update.mockResolvedValue(undefined); });
afterEach(() => { act(() => tree?.unmount()); });
async function mount() { await act(async () => { tree = create(React.createElement(Button, { orden: { id: 'o1', tokenPortalCliente: 'token', clienteTelefono: '8095550100', clienteNombre: 'Prueba' } as any, userProfile: { id: 'u1', nombre: 'Secretaría' } as any })); }); }
async function click() { await act(async () => { await tree.root.findByType('button').props.onClick(); }); }
it('usa número oficial y orden; solo registra aceptación después de la API', async () => {
  m.send.mockResolvedValue({ ok: true, estado: 'sent', outboxId: 'out1' });
  await mount(); await click();
  expect(m.send.mock.calls[0][0]).toBe('18095550100');
  expect(m.send.mock.calls[0][2].ordenId).toBe('o1');
  expect(m.update.mock.calls[0][1].portalClienteEnviado.outboxId).toBe('out1');
  expect(tree.root.findByType('button').props.disabled).toBe(true);
});
it('cola no se presenta como enviado', async () => {
  m.send.mockResolvedValue({ ok: true, estado: 'queued', outboxId: 'out1' });
  await mount(); await click(); expect(m.update).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('Portal en cola');
});
it('ventana cerrada no registra envío y orienta a una plantilla', async () => {
  m.send.mockResolvedValue({ error: 'window-cerrada' });
  await mount(); await click(); expect(m.update).not.toHaveBeenCalled();
  expect(m.error).toHaveBeenCalledWith(expect.stringContaining('plantilla aprobada'));
});
it('fallo de red conserva el identificador en el reintento', async () => {
  m.send.mockRejectedValueOnce(Error('red')).mockResolvedValueOnce({ ok: true, estado: 'sent', outboxId: 'out1' });
  await mount(); await click(); await click();
  expect(m.send.mock.calls[0][2].tempId).toBe(m.send.mock.calls[1][2].tempId);
});
it('fallo de actualización no invita a enviar otra vez un mensaje ya aceptado', async () => {
  m.send.mockResolvedValue({ ok: true, estado: 'sent', outboxId: 'out1' });
  m.update.mockRejectedValue(Error('write'));
  await mount(); await click();
  expect(tree.root.findByType('button').props.disabled).toBe(true);
  expect(m.error).toHaveBeenCalledWith(expect.stringContaining('WhatsApp aceptó'));
});
