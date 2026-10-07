import React from 'react';
import { act, create } from 'react-test-renderer';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it } from 'vitest';
import MapaRutas from '../../src/pages/MapaRutas';
import { recorridoPorCercania } from '../../src/utils/recorridoMapa';
import type { DiaTecnico } from '../../src/utils/mapaOperaciones';

it('abre enlaces antiguos en el mapa único conservando parámetros y fragmento', async () => {
  function Destino() { const l = useLocation(); return React.createElement('p', null, l.pathname + l.search + l.hash); }
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(React.createElement(MemoryRouter, { initialEntries: ['/admin/mapa-rutas-anterior?orden=o1#ruta'] }, React.createElement(Routes, null,
    React.createElement(Route, { path: '/admin/mapa-rutas-anterior', element: React.createElement(MapaRutas) }),
    React.createElement(Route, { path: '/admin/mapa', element: React.createElement(Destino) })))); });
  expect(JSON.stringify(tree!.toJSON())).toContain('/admin/mapa?orden=o1#ruta');
  await act(async () => tree!.unmount());
});

it('sugiere cercanía sin alterar las horas o el orden de las citas originales', () => {
  const p = (id: string, lng: number, extra = {}) => ({ estado: 'pendiente', cita: { id, lat: 18.5, lng, clienteNombre: id, inicio: new Date('2026-10-07T14:00:00Z'), progreso: {}, ...extra } });
  const paradas = [p('primera', -69.9), p('lejos', -69.7), p('cerca', -69.89), p('hecha', -69.91, { progreso: { completa: true } }), p('piezas', -69.92, { progreso: { standby: true } }), p('sin-ubicacion', NaN)] as unknown as DiaTecnico['paradas'];
  const original = JSON.stringify(paradas);
  const r = recorridoPorCercania(paradas);
  expect(r.puntos.map(p => p.id)).toEqual(['primera', 'cerca', 'lejos']);
  expect(r.km).toBeGreaterThan(0);
  expect(JSON.stringify(paradas)).toBe(original);
});
