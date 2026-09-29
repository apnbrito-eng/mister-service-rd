import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-dom', () => ({ createPortal: (children: unknown) => children }));
vi.mock('../../src/components/inbox/ArchivoMensaje', () => ({ default: () => null }));
vi.mock('../../src/services/equipoApi', () => ({ equipoApi: vi.fn() }));
import MensajeBubble from '../../src/components/inbox/MensajeBubble';
import { posicionMenuMensaje } from '../../src/components/inbox/MenuMensaje';

let tree: ReactTestRenderer | undefined;
afterEach(() => { if (tree) act(() => tree!.unmount()); tree = undefined; vi.unstubAllGlobals(); });
function preparar() {
  const doc = { body: {}, activeElement: null as unknown };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { innerWidth: 375, innerHeight: 812, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const trigger = { focus: vi.fn(() => { doc.activeElement = trigger; }), getBoundingClientRect: () => ({ left: 330, top: 12, bottom: 56 }) };
  const items = Array.from({ length: 4 }, () => ({ focus: vi.fn() }));
  items.forEach(item => item.focus.mockImplementation(() => { doc.activeElement = item; }));
  const menu = { style: {}, querySelector: () => items[0], querySelectorAll: () => items,
    contains: (node: unknown) => items.includes(node as typeof items[0]),
    getBoundingClientRect: () => ({ width: 256, height: 220 }) };
  const accion = vi.fn();
  act(() => { tree = create(React.createElement(MensajeBubble, {
    mensaje: { _direccion: 'entrante', tipo: 'text', contenido: { texto: 'Mensaje de prueba' }, wamid: 'test-menu', timestampMeta: new Date() } as React.ComponentProps<typeof MensajeBubble>['mensaje'],
    onGestionCrm: accion,
  }), { createNodeMock: element => element.props.role === 'menu' ? menu : element.props['aria-label'] === 'Acciones del mensaje' ? trigger : null }); });
  const abrir = () => act(() => tree!.root.findByProps({ 'aria-label': 'Acciones del mensaje' }).props.onClick());
  return { abrir, trigger, items, menu, doc, accion };
}

describe('menú de mensajes', () => {
  it('abre desde la burbuja y el toque exterior cierra sin ejecutar una acción', () => {
    const { abrir, accion, trigger } = preparar(); abrir();
    expect(tree!.root.findByProps({ role: 'menu' })).toBeTruthy();
    const stopPropagation = vi.fn();
    act(() => tree!.root.findByProps({ 'data-menu-mensaje-fondo': 'true' }).props.onClick({ stopPropagation }));
    expect(tree!.root.findAllByProps({ role: 'menu' })).toHaveLength(0);
    expect(accion).not.toHaveBeenCalled(); expect(stopPropagation).toHaveBeenCalled(); expect(trigger.focus).toHaveBeenCalled();
  });
  it('Escape cierra y devuelve el foco al disparador', () => {
    const { abrir, menu, trigger } = preparar(); abrir();
    act(() => tree!.root.findByProps({ role: 'menu' }).props.onKeyDown({ key: 'Escape', currentTarget: menu, preventDefault: vi.fn(), stopPropagation: vi.fn() }));
    expect(tree!.root.findAllByProps({ role: 'menu' })).toHaveLength(0); expect(trigger.focus).toHaveBeenCalled();
  });
  it('enfoca la primera opción y permite flechas, Inicio y Fin', () => {
    const { abrir, menu, doc, items } = preparar(); abrir(); expect(doc.activeElement).toBe(items[0]);
    for (const [key, indice] of [['ArrowDown', 1], ['End', 3], ['ArrowDown', 0], ['ArrowUp', 3], ['Home', 0]] as const) {
      act(() => tree!.root.findByProps({ role: 'menu' }).props.onKeyDown({ key, currentTarget: menu, preventDefault: vi.fn() }));
      expect(doc.activeElement).toBe(items[indice]);
    }
  });
  it('conserva el mensaje y las tres acciones CRM sin duplicarlas', () => {
    const { abrir, accion } = preparar();
    ['nota', 'expediente', 'pago'].forEach((nombre, indice) => {
      abrir(); act(() => tree!.root.findAllByProps({ role: 'menuitem' })[indice].props.onClick());
      expect(accion).toHaveBeenLastCalledWith(expect.objectContaining({ wamid: 'test-menu' }), nombre);
      expect(tree!.root.findAllByProps({ role: 'menu' })).toHaveLength(0);
    });
    expect(accion).toHaveBeenCalledTimes(3);
  });
  it('Tab sale del menú sin bloquear la navegación y Cerrar no ejecuta CRM', () => {
    const { abrir, menu, accion } = preparar(); abrir();
    const preventDefault = vi.fn();
    act(() => tree!.root.findByProps({ role: 'menu' }).props.onKeyDown({ key: 'Tab', currentTarget: menu, preventDefault }));
    expect(preventDefault).not.toHaveBeenCalled();
    expect(tree!.root.findAllByProps({ role: 'menu' })).toHaveLength(0);
    abrir(); act(() => tree!.root.findAllByProps({ role: 'menuitem' })[3].props.onClick());
    expect(accion).not.toHaveBeenCalled();
  });
  it('permanece dentro del viewport cerca de los bordes y con teclado', () => {
    const menu = { width: 256, height: 220 };
    expect(posicionMenuMensaje({ left: 350, top: 12, bottom: 56 }, menu, { left: 0, top: 0, width: 375, height: 812 })).toEqual({ left: 111, top: 64 });
    expect(posicionMenuMensaje({ left: 1300, top: 850, bottom: 894 }, menu, { left: 0, top: 0, width: 1440, height: 900 })).toEqual({ left: 1176, top: 622 });
    expect(posicionMenuMensaje({ left: 350, top: 320, bottom: 364 }, menu, { left: 0, top: 80, width: 375, height: 300 })).toEqual({ left: 111, top: 92 });
  });
});
