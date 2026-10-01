import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, Link } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
const estado = vi.hoisted(() => ({ config: { servicios: {
  visible: { slug: 'mi-servicio', tipoEquipo: 'Lavadora', titulo: 'Servicio publicado', descripcionCorta: 'Detalle', habilitado: true, orden: 2 },
  oculto: { slug: 'oculto', tipoEquipo: 'Nevera', titulo: 'No mostrar', descripcionCorta: '', habilitado: false, orden: 1 },
}, whatsapp: { mensajePredeterminado: 'Hola' } }, loading: false }));
vi.mock('../../src/hooks/useConfigWeb', () => ({ useConfigWeb: () => estado }));
import ServiciosPage from '../../src/pages/public/ServiciosPage';
import ImagenServicioPublico from '../../src/components/public/ImagenServicioPublico';
import MedioHeroPublico from '../../src/components/public/MedioHeroPublico';
let tree: ReactTestRenderer;
afterEach(() => act(() => tree?.unmount()));
it('el catálogo usa el slug configurado y excluye servicios deshabilitados', () => {
  act(() => { tree = create(React.createElement(MemoryRouter, {}, React.createElement(ServiciosPage))); });
  const enlaces = tree.root.findAllByType(Link).map(n => n.props.to);
  expect(enlaces).toContain('/servicios/mi-servicio');
  expect(enlaces).not.toContain('/servicios/oculto');
});
it('una imagen rota muestra el equipo local y permite una URL nueva', () => {
  act(() => { tree = create(React.createElement(ImagenServicioPublico, { tipo: 'Lavadora', src: '/rota.jpg' })); });
  act(() => tree.root.findByType('img').props.onError());
  expect(tree.root.findByProps({ role: 'img' }).props['aria-label']).toBe('Lavadora');
  act(() => tree.update(React.createElement(ImagenServicioPublico, { tipo: 'Lavadora', src: '/nueva.jpg' })));
  expect(tree.root.findByType('img').props.src).toBe('/nueva.jpg');
});
it('el carrusel conserva imágenes CMS y permite avanzar sin reproducción obligatoria', () => {
  const hero = { modo: 'carrusel', imagenesCarrusel: ['/uno.jpg', '/dos.jpg'] } as React.ComponentProps<typeof MedioHeroPublico>['hero'];
  act(() => { tree = create(React.createElement(MedioHeroPublico, { hero })); });
  expect(tree.root.findByType('img').props.src).toBe('/uno.jpg');
  act(() => tree.root.findByProps({ 'aria-label': 'Imagen siguiente' }).props.onClick());
  expect(tree.root.findByType('img').props.src).toBe('/dos.jpg');
  act(() => tree.root.findByType('img').props.onError());
  expect(tree.root.findByType('img').props.src).toBe('/uno.jpg');
});
