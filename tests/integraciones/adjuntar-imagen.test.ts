import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ subir: vi.fn(), url: vi.fn(), enviar: vi.fn() }));
vi.mock('../../src/firebase/config', () => ({ storage: {} }));
vi.mock('firebase/storage', () => ({ ref: (_: unknown, ruta: string) => ruta, uploadBytes: m.subir, getDownloadURL: m.url }));
vi.mock('../../src/services/whatsapp.service', () => ({ enviarMedia: m.enviar }));
import AdjuntarImagen from '../../src/components/inbox/AdjuntarImagen';
import { validarImagenInbox } from '../../src/utils/imagenInbox';
const png = () => new File([new Uint8Array([137,80,78,71,13,10,26,10,1])], 'pieza.png', { type: 'image/png' });
let v: ReactTestRenderer;
beforeEach(() => { vi.clearAllMocks(); m.subir.mockResolvedValue({}); m.url.mockResolvedValue('https://storage/propia'); m.enviar.mockResolvedValue({ ok: true }); vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {}); });
async function abrir() { await act(async () => { v = create(React.createElement(AdjuntarImagen, {waId: '18095551234', habilitado: true, motivo: 'Plantilla requerida'})); }); }
async function seleccionar() { await act(async () => { v.root.findByType('input').props.onChange({ target: { files: [png()], value: '' } }); }); }
function boton(texto: string) { return v.root.findAllByType('button').find(b => b.children.join('') === texto)!; }
it('selección sólo previsualiza; envío explícito usa Storage propio y tempId estable al reintentar', async () => {
  await abrir(); await seleccionar(); expect(m.subir).not.toHaveBeenCalled(); expect(m.enviar).not.toHaveBeenCalled();
  m.enviar.mockResolvedValueOnce({ ok: false, error: 'timeout' });
  await act(async () => { await boton('Enviar imagen').props.onClick(); });
  expect(v.root.findByProps({ role: 'alert' }).children.join('')).toContain('timeout');
  const primer = m.enviar.mock.calls[0];
  await act(async () => { await boton('Reintentar envío').props.onClick(); });
  expect(m.enviar.mock.calls[1]).toEqual(primer); expect(m.subir).toHaveBeenCalledTimes(1);
  expect(m.subir.mock.calls[0][0]).toMatch(/^whatsapp-media\/18095551234\/imagen-[a-f0-9]{32}\.png$/);
  expect(v.root.findAllByType('img')).toHaveLength(0); expect(URL.revokeObjectURL).toHaveBeenCalled();
  await act(async () => v.unmount());
});
it('guard síncrono impide doble clic durante subida', async () => {
  await abrir(); await seleccionar(); let terminar!: () => void;
  m.subir.mockImplementationOnce(() => new Promise<void>(r => { terminar = r; }));
  await act(async () => { const click = boton('Enviar imagen').props.onClick; click(); click(); });
  expect(m.subir).toHaveBeenCalledTimes(1);
  await act(async () => terminar()); expect(m.enviar).toHaveBeenCalledTimes(1);
  await act(async () => v.unmount());
});
it('cambiar destinatario durante subida descarta borrador y nunca envía al nuevo ni al anterior', async () => {
  await abrir(); await seleccionar(); let terminar!: () => void;
  m.subir.mockImplementationOnce(() => new Promise<void>(r => { terminar = r; }));
  await act(async () => { boton('Enviar imagen').props.onClick(); });
  await act(async () => v.update(React.createElement(AdjuntarImagen, {waId: '18095559999', habilitado: true, motivo: ''})));
  await act(async () => terminar()); expect(m.enviar).not.toHaveBeenCalled(); expect(v.root.findAllByType('img')).toHaveLength(0);
  expect(URL.revokeObjectURL).toHaveBeenCalled(); await act(async () => v.unmount());
});
it('si caduca ventana o se revoca permiso durante subida no envía', async () => {
  await abrir(); await seleccionar(); let terminar!: () => void;
  m.subir.mockImplementationOnce(() => new Promise<void>(r => { terminar = r; }));
  await act(async () => { boton('Enviar imagen').props.onClick(); });
  await act(async () => v.update(React.createElement(AdjuntarImagen, {waId: '18095551234', habilitado: false, motivo: 'Plantilla requerida'})));
  await act(async () => terminar()); expect(m.enviar).not.toHaveBeenCalled(); expect(boton('Reintentar envío').props.disabled).toBe(true);
  await act(async () => v.unmount());
});
it('rechaza MIME, tamaño y firma falsificada', async () => {
  await expect(validarImagenInbox(new File(['x'], 'f.png', { type: 'image/png' }))).rejects.toThrow('formato');
  await expect(validarImagenInbox(new File(['x'], 'f.svg', { type: 'image/svg+xml' }))).rejects.toThrow();
  await expect(validarImagenInbox(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'f.png', { type: 'image/png' }))).rejects.toThrow('5 MB');
});
