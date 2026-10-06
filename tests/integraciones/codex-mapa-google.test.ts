import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ cargar: vi.fn(), listener: null as null | ((estado: string) => void), creado: vi.fn(), quitarEventos: vi.fn(), trafico: vi.fn() }));
vi.mock('../../src/utils/cargarGoogleMaps', () => ({
  cargarGoogleMaps: m.cargar, estadoGoogleMaps: () => 'sin_conexion', MAP_ID: 'mapa-falso',
  MENSAJE_ESTADO: { sin_conexion: 'No se pudo cargar', cargando: 'Cargando' },
  oirEstadoGoogleMaps: (cb: (estado: string) => void) => { m.listener = cb; return () => { m.listener = null; }; },
}));
import MapaGoogle from '../../src/components/mapa/MapaGoogle';
let tree: ReturnType<typeof create>;
beforeEach(() => {
  vi.clearAllMocks();
  class MapFalso {
    constructor() { m.creado(); }
    addListener() { return { remove: vi.fn() }; }
    setMapTypeId() {}
  }
  class TrafficFalso { setMap = m.trafico; }
  vi.stubGlobal('google', { maps: {
    importLibrary: async (lib: string) => lib === 'maps' ? { Map: MapFalso, TrafficLayer: TrafficFalso } : { AdvancedMarkerElement: class {} },
    event: { clearInstanceListeners: m.quitarEventos },
  } });
  m.cargar.mockResolvedValueOnce(false).mockImplementation(async () => { m.listener?.('listo'); return true; });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); vi.unstubAllGlobals(); });
it('crea el mapa al reintentar una carga fallida y conserva la alternativa en lista', async () => {
  await act(async () => { tree = create(React.createElement(MapaGoogle, {
    marcadores: [], lineas: [], tipo: 'mapa', trafico: false, onClickMarcador: vi.fn(),
    sinMapa: React.createElement('p', null, 'Clientes visibles'),
  }), { createNodeMock: () => ({}) }); });
  expect(m.creado).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('Clientes visibles');
  const reintentar = tree.root.findByType('button');
  await act(async () => reintentar.props.onClick());
  expect(m.creado).toHaveBeenCalledTimes(1);
  expect(tree.root.findByProps({ role: 'region' }).props.hidden).toBe(false);
});

it('una carga antigua no crea un mapa después de iniciar otro intento', async () => {
  let resolver: (valor: boolean) => void = () => {};
  m.cargar.mockReset().mockImplementationOnce(() => new Promise(resolve => { resolver = resolve; })).mockResolvedValue(true);
  await act(async () => { tree = create(React.createElement(MapaGoogle, {
    marcadores: [], lineas: [], tipo: 'mapa', trafico: false, onClickMarcador: vi.fn(),
  }), { createNodeMock: () => ({}) }); });
  await act(async () => tree.root.findByType('button').props.onClick());
  expect(m.creado).toHaveBeenCalledTimes(1);
  await act(async () => resolver(true));
  expect(m.creado).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
  expect(m.quitarEventos).toHaveBeenCalledTimes(1);
});
