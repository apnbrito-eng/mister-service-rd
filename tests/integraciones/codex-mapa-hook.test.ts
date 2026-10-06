import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ getDocs: vi.fn(), snapshots: vi.fn() }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('../../src/services/gps.service', () => ({ suscribirTodasUbicaciones: () => () => {} }));
vi.mock('../../src/utils', () => ({ parseOrden: (id: string, d: object) => ({ id, ...d }), parseCliente: (id: string, d: object) => ({ id, ...d }) }));
vi.mock('firebase/firestore', () => ({
  collection: (_: unknown, path: string) => ({ path }),
  query: (c: object, ...filters: unknown[]) => ({ ...c, filters }),
  where: (...args: unknown[]) => args, documentId: () => '__name__',
  Timestamp: { fromMillis: (ms: number) => ms },
  onSnapshot: m.snapshots, getDocs: m.getDocs,
}));
import { useMapaDatos, type MapaDatos, type PermisosMapa, type MapaFixture } from '../../src/hooks/useMapaDatos';
const rango = { inicio: new Date('2026-10-02T00:00:00-04:00'), fin: new Date('2026-10-03T00:00:00-04:00') };
const permisos: PermisosMapa = { ordenesVer: true, personalVer: false, clientesVer: false, gpsVer: false };
let datos: MapaDatos;
let tree: ReturnType<typeof create>;
function Probe(p: { rango?: typeof rango; permisos?: PermisosMapa; fixture?: MapaFixture }) {
  datos = useMapaDatos(p.rango ?? rango, p.permisos ?? permisos, p.fixture);
  return null;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.getDocs.mockResolvedValue({ docs: [] });
  m.snapshots.mockImplementation((_q, cb) => { cb({ docs: [] }); return () => {}; });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });
it('la misma fixture sigue el rango elegido dentro del módulo', async () => {
  const fixture = { personal: [], gps: [], clientes: [], ordenes: [
    { id: 'hoy', fechaCita: new Date('2026-10-02T10:00:00-04:00') },
    { id: 'manana', fechaCita: new Date('2026-10-03T10:00:00-04:00') },
  ] } as MapaFixture;
  await act(async () => { tree = create(React.createElement(Probe, { fixture })); });
  expect(datos.ordenes.map(o => o.id)).toEqual(['hoy']);
  await act(async () => tree.update(React.createElement(Probe, { fixture, rango: { inicio: rango.fin, fin: new Date('2026-10-04T00:00:00-04:00') } })));
  expect(datos.ordenes.map(o => o.id)).toEqual(['manana']);
  expect(m.snapshots).not.toHaveBeenCalled();
});
it('recarga pendientes al pulsar refrescar tras una consulta terminada', async () => {
  await act(async () => { tree = create(React.createElement(Probe)); });
  await act(async () => datos.cargarAbiertosAnterioresPara(['uid-qa']));
  expect(m.getDocs).toHaveBeenCalledTimes(1);
  await act(async () => datos.refrescarAbiertosAnterioresPara('uid-qa'));
  expect(m.getDocs).toHaveBeenCalledTimes(2);
  expect(datos.abiertosAnterioresPorTecnico['uid-qa'].cargando).toBe(false);
});
it('una respuesta tardía de pendientes no reaparece tras revocar permiso', async () => {
  let resolver: (r: unknown) => void = () => {};
  m.getDocs.mockImplementationOnce(() => new Promise(resolve => { resolver = resolve; }));
  await act(async () => { tree = create(React.createElement(Probe)); });
  await act(async () => datos.cargarAbiertosAnterioresPara(['uid-qa']));
  expect(m.getDocs).toHaveBeenCalledTimes(1);
  await act(async () => tree.update(React.createElement(Probe, { permisos: { ...permisos, ordenesVer: false } })));
  await act(async () => resolver({ docs: [{ id: 'privada', data: () => ({ tecnicoId: 'uid-qa', fase: 'agendado' }) }] }));
  expect(datos.abiertosAnterioresPorTecnico).toEqual({});
});

it('refrescar un técnico no invalida la respuesta pendiente de otro', async () => {
  const resolver: Array<(r: unknown) => void> = [];
  m.getDocs.mockImplementation(() => new Promise(resolve => { resolver.push(resolve); }));
  await act(async () => { tree = create(React.createElement(Probe)); });
  await act(async () => datos.cargarAbiertosAnterioresPara(['tecnico-a']));
  await act(async () => datos.cargarAbiertosAnterioresPara(['tecnico-b']));
  expect(m.getDocs).toHaveBeenCalledTimes(2);
  await act(async () => datos.refrescarAbiertosAnterioresPara('tecnico-a'));
  expect(m.getDocs).toHaveBeenCalledTimes(3);
  const snap = (id: string) => ({ docs: [{ id, data: () => ({ fase: 'agendado', tecnicoId: id.startsWith('a-') ? 'tecnico-a' : 'tecnico-b' }) }] });
  await act(async () => resolver[2](snap('a-nuevo')));
  await act(async () => resolver[0](snap('a-viejo')));
  await act(async () => resolver[1](snap('b-vigente')));
  expect(datos.abiertosAnterioresPorTecnico['tecnico-a'].ordenes.map(o => o.id)).toEqual(['a-nuevo']);
  expect(datos.abiertosAnterioresPorTecnico['tecnico-b'].ordenes.map(o => o.id)).toEqual(['b-vigente']);
});
it('los pendientes anteriores excluyen citas futuras fuera del intervalo', async () => {
  m.getDocs.mockResolvedValueOnce({ docs: [
    { id: 'anterior', data: () => ({ tecnicoId: 'uid-qa', fase: 'agendado', fechaCita: new Date('2026-10-01T12:00:00-04:00') }) },
    { id: 'futura', data: () => ({ tecnicoId: 'uid-qa', fase: 'agendado', fechaCita: new Date('2026-10-10T12:00:00-04:00') }) },
  ] });
  await act(async () => { tree = create(React.createElement(Probe)); });
  await act(async () => datos.cargarAbiertosAnterioresPara(['uid-qa']));
  expect(datos.abiertosAnterioresPorTecnico['uid-qa'].ordenes.map(o=>o.id)).toEqual(['anterior']);
});
