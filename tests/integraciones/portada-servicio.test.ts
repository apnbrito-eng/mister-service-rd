import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, Link } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ConfigWeb } from '../../src/services/configWeb.service';
import { enlaceAgendar, leerSeleccionServicio, obtenerWhatsAppPublico } from '../../src/utils/whatsappPublico';
import Portada from '../../src/components/public/PortadaElectrodomesticos';
const movimiento = vi.hoisted(() => ({ reducido: true }));
vi.mock('../../src/hooks/useMovimientoReducido', () => ({ useMovimientoReducido: () => movimiento.reducido }));
beforeEach(() => { movimiento.reducido = true; });
const config = {
 hero: { badge: '', subtitulo: '' },
 whatsapp: { numeros: [{ numero: '8090000000', activo: true }], rotacion: true, mensajePredeterminado: 'Hola' },
 estadisticas: { experiencia: {}, servicios: {} },
 servicios: { lavadora: { tipoEquipo: 'Lavadora', habilitado: true }, nevera: { tipoEquipo: 'Nevera', habilitado: true }, estufa: { tipoEquipo: 'Estufa', habilitado: false } },
} as unknown as ConfigWeb;
let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); vi.useRealTimers(); });
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
 expect(tree.root.findByProps({ role: 'img' }).props['aria-label']).toBe('Lavadora: armado');
 act(() => tree.update(React.createElement(MemoryRouter, {}, React.createElement(Portada, { config: { ...config, servicios: {} } }))));
 expect(tree.root.findAllByType('img')).toHaveLength(0);
});

it('muestra armado y desarmado del mismo equipo cada cinco segundos antes del siguiente', () => {
 vi.useFakeTimers(); movimiento.reducido = false;
 act(() => { tree = create(React.createElement(MemoryRouter, {}, React.createElement(Portada, { config }))); });
 const visible = () => tree.root.findByProps({ role: 'img' }).props['aria-label'];
 expect(visible()).toBe('Lavadora: armado');
 act(() => vi.advanceTimersByTime(4999)); expect(visible()).toBe('Lavadora: armado');
 act(() => vi.advanceTimersByTime(1)); expect(visible()).toBe('Lavadora: desarmado');
 act(() => vi.advanceTimersByTime(5000)); expect(visible()).toBe('Nevera: armado');
 act(() => vi.advanceTimersByTime(5000)); expect(visible()).toBe('Nevera: desarmado');
 act(() => vi.advanceTimersByTime(5000)); expect(visible()).toBe('Lavadora: armado');
});
it('la elección manual pausa las diapositivas y mantiene instalación en agenda', () => {
 vi.useFakeTimers(); movimiento.reducido = false;
 act(() => { tree = create(React.createElement(MemoryRouter, {}, React.createElement(Portada, { config }))); });
 act(() => tree.root.findAllByType('button').find(b => b.children.includes('Nevera'))!.props.onClick());
 act(() => tree.root.findAllByType('button').find(b => b.children.includes('Instalación'))!.props.onClick());
 act(() => vi.advanceTimersByTime(15000));
 expect(tree.root.findByProps({ role: 'img' }).props['aria-label']).toBe('Nevera: armado');
 expect(leerSeleccionServicio(new URL(tree.root.findByType(Link).props.to, 'https://example.test').searchParams, ['Nevera'])).toEqual({ equipo: 'Nevera', servicio: 'Instalación' });
 act(() => tree.root.findByProps({ 'aria-label': 'Diapositiva siguiente' }).props.onClick());
 expect(tree.root.findByProps({ role: 'img' }).props['aria-label']).toBe('Nevera: desarmado');
});
it('movimiento reducido conserva foto estática y navegación manual', () => {
 vi.useFakeTimers();
 act(() => { tree = create(React.createElement(MemoryRouter, {}, React.createElement(Portada, { config }))); });
 act(() => vi.advanceTimersByTime(30000));
 expect(tree.root.findByProps({ role: 'img' }).props['aria-label']).toBe('Lavadora: armado');
 act(() => tree.root.findByProps({ 'aria-label': 'Diapositiva siguiente' }).props.onClick());
 expect(tree.root.findByProps({ role: 'img' }).props['aria-label']).toBe('Lavadora: desarmado');
});
it('la secadora es independiente y utiliza su imagen propia', () => {
 const conSecadora = { ...config, servicios: { ...config.servicios, secadora: { tipoEquipo: 'Secadora', habilitado: true } } } as ConfigWeb;
 act(() => { tree = create(React.createElement(MemoryRouter, {}, React.createElement(Portada, { config: conSecadora }))); });
 act(() => tree.root.findAllByType('button').find(b => b.children.includes('Secadora'))!.props.onClick());
 expect(tree.root.findByProps({ role: 'img' }).props['aria-label']).toBe('Secadora: armado');
 expect(tree.root.findByType('img').props.src).toContain('secadora-armada-desarmada.jpg');
});
it('el toque no simula hover permanente y pausa/reanudación funcionan', () => {
 vi.useFakeTimers(); movimiento.reducido = false;
 act(() => { tree = create(React.createElement(MemoryRouter, {}, React.createElement(Portada, { config }))); });
 act(() => tree.root.findByProps({ 'aria-label': 'Servicios por electrodoméstico' }).props.onPointerEnter({ pointerType: 'touch' }));
 act(() => vi.advanceTimersByTime(5000));
 expect(tree.root.findByProps({ role: 'img' }).props['aria-label']).toBe('Lavadora: desarmado');
 act(() => tree.root.findByProps({ 'aria-label': 'Pausar diapositivas' }).props.onClick());
 act(() => vi.advanceTimersByTime(5000));
 expect(tree.root.findByProps({ role: 'img' }).props['aria-label']).toBe('Lavadora: desarmado');
 act(() => tree.root.findByProps({ 'aria-label': 'Reanudar diapositivas' }).props.onClick());
 act(() => vi.advanceTimersByTime(5000));
 expect(tree.root.findByProps({ role: 'img' }).props['aria-label']).toBe('Nevera: armado');
});
