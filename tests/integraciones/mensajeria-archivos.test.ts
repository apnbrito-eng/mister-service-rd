import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/services/equipoApi', () => ({ equipoApi: vi.fn().mockResolvedValue({ urlImagen: 'https://example.com/archivo' }) }));
vi.mock('../../src/components/inbox/DocumentoPdf', () => ({ default: ({ nombre }: { nombre: string }) => createElement('button', { 'aria-label': 'Abrir PDF: ' + nombre }, nombre) }));
import TextoMensaje from '../../src/components/inbox/TextoMensaje';
import ArchivoMensaje from '../../src/components/inbox/ArchivoMensaje';
import { mediaPermitido, limiteMedia } from '../../api/_lib/mediaPermitido';
describe('Archivos y enlaces del chat', () => {
  it('hace navegable Maps sin convertir HTML ni javascript en enlaces', () => {
    const ui = create(createElement(TextoMensaje, { texto: 'Visita https://maps.google.com/?q=18,-69 javascript:alert(1) <b>hola</b>' }));
    const links = ui.root.findAllByType('a');
    expect(links).toHaveLength(1); expect(links[0].props.href).toBe('https://maps.google.com/?q=18,-69');
    expect(ui.root.findAllByType('b')).toHaveLength(0); ui.unmount();
  });
  it.each(['video', 'image', 'sticker'])('precarga %s sin reproducir automáticamente', async tipo => {
    let ui: ReturnType<typeof create>;
    await act(async () => { ui = create(createElement(ArchivoMensaje, { mensaje: { wamid: 'prueba', wa_id: '2025550100', tipo, contenido: {} } as any })); });
    if (tipo === 'video') {
      expect(ui!.root.findByType('video').props.controls).toBe(true);
      expect(ui!.root.findByType('video').props.autoPlay).not.toBe(true);
    } else expect(ui!.root.findAllByType('img')).toHaveLength(1);
    ui!.unmount();
  });
  it('descarga documentos solo al solicitarlos', async () => {
    let ui: ReturnType<typeof create>;
    await act(async () => { ui = create(createElement(ArchivoMensaje, { mensaje: { wamid: 'prueba', wa_id: '2025550100', tipo: 'document', contenido: {} } as any })); });
    expect(ui!.root.findAllByType('a')).toHaveLength(0);
    await act(async () => { await ui!.root.findByType('button').props.onClick(); });
    expect(ui!.root.findAllByType('a').length).toBeGreaterThan(0);
    ui!.unmount();
  });
  it.each([{ mediaMimeType: 'application/pdf', mediaFilename: 'Factura' }, { mediaFilename: 'Factura.PDF' }])('abre PDF desde su tarjeta interna sin enlace externo: %j', async contenido => {
    let ui: ReturnType<typeof create>;
    await act(async () => { ui = create(createElement(ArchivoMensaje, { mensaje: { wamid: 'pdf-prueba', wa_id: '2025550100', tipo: 'document', contenido } as any })); });
    expect(ui!.root.findAllByType('a')).toHaveLength(0);
    expect(ui!.root.findByType('button').props['aria-label']).toContain('Abrir PDF: Factura');
    ui!.unmount();
  });
  it('admite documentos y rechaza contenido ejecutable', () => {
    expect(mediaPermitido('application/pdf')).toBe(true);
    expect(mediaPermitido('audio/ogg; codecs=opus')).toBe(true);
    expect(mediaPermitido('video/mp4')).toBe(true);
    expect(mediaPermitido('text/html')).toBe(false);
    expect(mediaPermitido('image/svg+xml')).toBe(false);
    expect(limiteMedia('video')).toBe(16 * 1024 * 1024);
    expect(limiteMedia('document')).toBe(100 * 1024 * 1024);
  });
});
