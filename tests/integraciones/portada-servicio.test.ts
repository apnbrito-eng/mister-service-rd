import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, Link } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { ConfigWeb } from '../../src/services/configWeb.service';
import { enlaceAgendar, leerSeleccionServicio, obtenerWhatsAppPublico } from '../../src/utils/whatsappPublico';
import Portada from '../../src/components/public/PortadaElectrodomesticos';
vi.mock('../../src/hooks/useMovimientoReducido', () => ({ useMovimientoReducido: () => true }));
const config = {
 hero: { badge: '', subtitulo: '' },
 whatsapp: { numeros: [{ numero: '8090000000', activo: true }], rotacion: true, mensajePredeterminado: 'Hola' },
 estadisticas: { experiencia: {}, servicios: {} },
 servicios: { lavadora: { tipoEquipo: 'Lavadora', habilitado: true }, nevera: { tipoEquipo: 'Nevera', habilitado: true }, estufa: { tipoEquipo: 'Estufa', habilitado: false } },
} as unknown as ConfigWeb;
let tree: ReactTestRenderer;
afterEach(() => act(() => tree?.unmount()));
it('la selección viaja a agendar y WhatsApp central sin exponer servicios deshabilitados', () => {
 act(() => { tree = create(React.createElement(MemoryRouter, {}, React.createElement(Portada, { config }))); });
 const botones = tree.root.findAllByType('button');
 expect(botones.some(b => b.children.includes('Estufa'))).toBe(false);
 act(() => botones.find(b => b.children.includes('Mantenimiento'))!.props.onClick());
 act(() => botones.find(b => b.children.includes('Nevera'))!.props.onClick());
 const url = tree.root.findByType(Link).props.to;
 expect(leerSeleccionServicio(new URL(url, 'https://example.test').searchParams, ['Nevera'])).toEqual({ equipo: 'Nevera', servicio: 'Mantenimiento' });
 const wa = tree.root.findAllByType('a').find(a => a.props.href?.startsWith('https://wa.me'))!;
 expect(wa.props.href).toContain('wa.me/18495646767');
 expect(decodeURIComponent(wa.props.href)).toContain('mantenimiento de nevera');
});
it('descarta selección manipulada y conserva unicode en enlaces', () => {
 expect(leerSeleccionServicio(new URLSearchParams('equipo=inventado&servicio=inyectado'), ['Lavadora'])).toEqual({ equipo: '', servicio: '' });
 expect(leerSeleccionServicio(new URL(enlaceAgendar('Aire Acondicionado', 'Reparación'), 'https://example.test').searchParams, ['Aire Acondicionado'])).toEqual({ equipo: 'Aire Acondicionado', servicio: 'Reparación' });
});
it('canal público ignora rotación interna y codifica el mensaje', () => {
 expect(obtenerWhatsAppPublico(config, 'Reparación & mantenimiento')).toBe('https://wa.me/18495646767?text=Reparaci%C3%B3n%20%26%20mantenimiento');
});

it('actualizar CMS retira equipo seleccionado sin dejar imagen invisible ni ofrecerlo', () => {
 act(() => { tree = create(React.createElement(MemoryRouter, {}, React.createElement(Portada, { config }))); });
 act(() => tree.root.findAllByType('button').find(b => b.children.includes('Nevera'))!.props.onClick());
 const nuevo = { ...config, servicios: { ...config.servicios, nevera: { ...config.servicios!.nevera, habilitado: false } } };
 act(() => tree.update(React.createElement(MemoryRouter, {}, React.createElement(Portada, { config: nuevo }))));
 expect(tree.root.findAllByType('button').some(b => b.children.includes('Nevera'))).toBe(false);
 expect(tree.root.findByType(Link).props.to).toContain('equipo=Lavadora');
 const visibles = tree.root.findAll(n => n.props.role === 'img' && n.props['aria-label'] === 'Lavadora' && n.parent?.props['aria-hidden'] === false);
 expect(visibles[0].parent?.props['aria-hidden']).toBe(false);
 act(() => tree.update(React.createElement(MemoryRouter, {}, React.createElement(Portada, { config: { ...config, servicios: {} } }))));
 expect(tree.root.findAllByType('img')).toHaveLength(0);
});
