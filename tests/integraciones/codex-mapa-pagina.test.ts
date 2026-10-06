import React from 'react';
import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/firebase/config', () => ({ db: {}, auth: {} }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ userProfile: { rol: 'administrador', activo: true } }) }));
vi.mock('../../src/services/gps.service', () => ({ suscribirTodasUbicaciones: () => () => {} }));
vi.mock('../../src/services/reasignacion.service', () => ({ previewReasignacion: vi.fn(), confirmarReasignacion: vi.fn(), ErrorReasignacion: class extends Error {} }));
vi.mock('../../src/services/clientes.service', () => ({ normalizarTelefono: (t: string) => t }));
vi.mock('../../src/services/tiemposRuta.service', () => ({ consultarRuta: vi.fn(), tramoDeRuta: vi.fn() }));
vi.mock('../../src/components/mapa/MapaGoogle', () => ({ default: () => null }));
vi.mock('../../src/utils', () => ({ parseOrden: (id: string, d: object) => ({ id, ...d }), parseCliente: (id: string, d: object) => ({ id, ...d }), formatTelefono: (t: string) => t }));
import Mapa from '../../src/pages/Mapa';
import MapaGoogle from '../../src/components/mapa/MapaGoogle';
import BarraFiltros from '../../src/components/mapa/BarraFiltros';
import FichaRuta from '../../src/components/mapa/FichaRuta';
import FichaTecnico from '../../src/components/mapa/FichaTecnico';
import PanelInicio from '../../src/components/mapa/PanelInicio';
import PanelRepartir from '../../src/components/mapa/PanelRepartir';
import { fixtureCompleto, calendariosFixture } from '../manual/mapa-fixture';
import { fechaEnRD, componentesRD } from '../../src/utils/mapaFechas';
let tree: ReturnType<typeof create>;
beforeEach(() => { vi.stubGlobal('window', { setInterval, clearInterval, setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn() }); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); vi.unstubAllGlobals(); });
async function montar() {
  await act(async () => { tree = create(React.createElement(MemoryRouter, null, React.createElement(Mapa, { modoDemo: true, fixture: fixtureCompleto, calendariosDemo: calendariosFixture }))); });
}
it('concentra todas las citas del rango y respeta equipo, GPS y ruta por día', async () => {
  await montar();
  const hoy = componentesRD(new Date());
  const manana = fechaEnRD(hoy.anio, hoy.mes, hoy.dia + 1);
  await act(async () => tree.root.findByType(BarraFiltros).props.setEstado({ hasta: manana }));
  await act(async () => tree.root.findByType(MapaGoogle).props.onCambioVista({ limites: { norte: 20, sur: 17, este: -68, oeste: -72 }, zoom: 10 }));
  let mapa = tree.root.findByType(MapaGoogle).props;
  expect(mapa.encuadre.puntos).toHaveLength(6);
  expect(mapa.lineas).toHaveLength(0);
  const grupo = mapa.marcadores.find((m: { capa: string }) => m.capa === 'grupo_citas');
  expect(grupo).toBeDefined();
  await act(async () => mapa.onClickMarcador(grupo));
  expect(JSON.stringify(tree.toJSON())).toContain('Citas de esta zona');
  await act(async () => tree.root.findByType(BarraFiltros).props.setEstado({ equipo: 'B', capaGps: false }));
  mapa = tree.root.findByType(MapaGoogle).props;
  expect(mapa.encuadre.puntos).toHaveLength(2);
  expect(mapa.marcadores.some((m: { capa: string }) => m.capa === 'van')).toBe(false);
});
it('reparte solamente el día activo y el modo demo no ejecuta escrituras', async () => {
  await montar();
  const h = componentesRD(new Date());
  await act(async () => tree.root.findByType(BarraFiltros).props.setEstado({ hasta: fechaEnRD(h.anio,h.mes,h.dia+1) }));
  await act(async () => tree.root.findAllByType(PanelInicio)[0].props.onSeleccionarTecnico('uid-qa-reyes'));
  await act(async () => tree.root.findAllByType(FichaTecnico)[0].props.onRepartirDia());
  const panel = tree.root.findAllByType(PanelRepartir)[0].props;
  expect(panel.movimientos).toHaveLength(2);
  let resultado: unknown;
  await act(async () => { resultado = await panel.onEjecutar(new Set(panel.movimientos.map((m: { cita: { id: string } }) => m.cita.id))); });
  expect(JSON.stringify(resultado)).toContain('Demostración');
  const api = await import('../../src/services/reasignacion.service');
  expect(api.previewReasignacion).not.toHaveBeenCalled();
});
it('abrir una ruta futura conserva solo las paradas de ese día', async () => {
  await montar();
  const h = componentesRD(new Date());
  const manana = fechaEnRD(h.anio,h.mes,h.dia+1);
  await act(async () => tree.root.findByType(BarraFiltros).props.setEstado({ hasta: manana }));
  const mapa = tree.root.findByType(MapaGoogle).props;
  const m = componentesRD(manana);
  const clave = `uid-qa-reyes|${m.anio}-${String(m.mes+1).padStart(2,'0')}-${String(m.dia).padStart(2,'0')}`;
  await act(async () => mapa.sinMapa.props.onAbrirRuta(clave));
  const ruta = tree.root.findAllByType(FichaRuta)[0].props;
  expect(ruta.dia.total).toBe(1);
  expect(ruta.dia.paradas[0].cita.inicio.getTime()).toBeGreaterThanOrEqual(manana.getTime());
});

it('cambiar rango cierra una ruta anterior y deja recorrer meses sin recortar el intervalo', async () => {
  await montar();
  const h = componentesRD(new Date());
  const hasta = fechaEnRD(h.anio,h.mes+2,3);
  await act(async () => tree.root.findByType(BarraFiltros).props.setEstado({ hasta, modo: 'mes' }));
  const Mes = (await import('../../src/components/mapa/VistaMes')).default;
  const componente = tree.root.findByType(Mes);
  expect(componente.props.onNavegarMes).toBeUndefined();
  const siguiente = tree.root.findByProps({ 'aria-label': 'Mes siguiente dentro del rango' });
  await act(async () => siguiente.props.onClick());
  expect(tree.root.findByType(BarraFiltros).props.estado.hasta.getTime()).toBe(hasta.getTime());
  expect(tree.root.findAll(n => typeof n.props['data-mes'] === 'string')).toHaveLength(3);
});

it('el WhatsApp de la ficha cliente usa el guard demo y no abre chats reales', async () => {
  const abrir = vi.fn();
  vi.stubGlobal('window', { setInterval, clearInterval, setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn(), open: abrir });
  await montar();
  await act(async () => tree.root.findByType(BarraFiltros).props.setEstado({ capaClientes: true }));
  await act(async () => tree.root.findByType(MapaGoogle).props.onCambioVista({ limites: { norte: 20, sur: 17, este: -68, oeste: -72 }, zoom: 18 }));
  const mapa = tree.root.findByType(MapaGoogle).props;
  const cliente = mapa.marcadores.find((m: { capa: string }) => m.capa === 'cliente');
  expect(cliente).toBeDefined();
  await act(async () => mapa.onClickMarcador(cliente));
  const Ficha = (await import('../../src/components/mapa/FichaCliente')).default;
  await act(async () => tree.root.findAllByType(Ficha)[0].props.onAbrirWhatsApp());
  expect(abrir).not.toHaveBeenCalled();
  expect(tree.root.findAllByType('a').some(a => (a.props.href || '').includes('wa.me'))).toBe(false);
});

it('la ficha abierta desde la lista de mañana conserva ese día al repartir', async () => {
  await montar();
  const h = componentesRD(new Date());
  const manana = fechaEnRD(h.anio,h.mes,h.dia+1);
  const m = componentesRD(manana);
  const claveDia = `${m.anio}-${String(m.mes+1).padStart(2,'0')}-${String(m.dia).padStart(2,'0')}`;
  await act(async () => tree.root.findByType(BarraFiltros).props.setEstado({ hasta: manana }));
  await act(async () => tree.root.findByType(MapaGoogle).props.sinMapa.props.onAbrirTecnico('uid-qa-reyes',claveDia));
  const ficha = tree.root.findAllByType(FichaTecnico)[0].props;
  expect(ficha.dia.total).toBe(1);
  await act(async () => ficha.onRepartirDia());
  expect(tree.root.findAllByType(PanelRepartir)[0].props.movimientos).toHaveLength(1);
});
