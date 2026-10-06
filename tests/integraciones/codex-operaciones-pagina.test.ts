import React from 'react';
import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { OrdenServicio, Personal } from '../../src/types';

const control = vi.hoisted(() => ({
  perfil: { ordenesVer: true, personalVer: true, clientesVer: true },
  datos: {} as Record<string, unknown>,
}));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ userProfile: control.perfil }) }));
vi.mock('../../src/utils/permisos', () => ({ puede: (p: Record<string, boolean>, permiso: string) => p[permiso] === true }));
vi.mock('../../src/hooks/useMapaDatos', () => ({ useMapaDatos: () => control.datos }));
import Operaciones from '../../src/pages/Operaciones';
import LineaTecnico from '../../src/components/operaciones/LineaTecnico';
import FichaTecnicoSheet from '../../src/components/operaciones/FichaTecnicoSheet';
import ListaAtencion from '../../src/components/operaciones/ListaAtencion';
import ResumenDia from '../../src/components/operaciones/ResumenDia';

let tree: ReturnType<typeof create> | undefined;
const cargarAnteriores = vi.fn();
const tecnico = { id: 'doc-yoniel', uid: 'uid-yoniel', nombre: 'Yoniel', rol: 'tecnico', activo: true, operariaNombre: 'Wila' } as Personal;
function orden(id = 'privada-1'): OrdenServicio {
  return { id, clienteNombre: `Cliente ${id}`, tecnicoId: tecnico.uid, tecnicoNombre: tecnico.nombre,
    fase: 'agendado', estado: 'activo', operariaNombre: 'Wila', historialFases: [],
    fechaCita: new Date('2026-10-02T09:00:00-04:00'), duracionMin: 60 } as OrdenServicio;
}
function contenido(n: unknown): string {
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(contenido).join(' ');
  if (n && typeof n === 'object' && 'children' in n) return contenido(n.children);
  return '';
}
function texto(): string { return contenido(tree?.toJSON()); }
function vista() { return React.createElement(MemoryRouter, null, React.createElement(Operaciones)); }
async function montar() { await act(async () => { tree = create(vista()); }); }
async function actualizar() { await act(async () => tree!.update(vista())); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-02T12:00:00-04:00'));
  vi.stubGlobal('window', { setInterval, clearInterval, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('document', { activeElement: null });
  control.perfil = { ordenesVer: true, personalVer: true, clientesVer: true };
  control.datos = {
    ordenes: [orden()], personal: [tecnico], standby: [], clientes: [], gps: [],
    cargandoOrdenes: false, cargandoPersonal: false, cargandoStandby: false,
    errorOrdenes: null, errorPersonal: null, errorStandby: null,
    abiertosAnterioresPorTecnico: { 'uid-yoniel': { ordenes: [], cargando: false, error: null } },
    cargarAbiertosAnterioresPara: cargarAnteriores,
    activarStandby: vi.fn(), refrescarAbiertosAnteriores: vi.fn(),
    cargarClientes: vi.fn(), descartarClientes: vi.fn(),
  };
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('revocar ordenesVer elimina datos y una ficha abierta aunque el hook aún conserve su último resultado', async () => {
  await montar();
  expect(texto()).toContain('Cliente privada-1');
  await act(async () => tree!.root.findByType(LineaTecnico).props.onAbrirFicha());
  expect(tree!.root.findAllByType(FichaTecnicoSheet)).toHaveLength(1);
  control.perfil = { ...control.perfil, ordenesVer: false };
  await actualizar();
  expect(texto()).toMatch(/permiso/i);
  expect(texto()).not.toContain('Cliente privada-1');
  expect(texto()).not.toContain('Yoniel');
  expect(tree!.root.findAllByType(FichaTecnicoSheet)).toHaveLength(0);
});

it('sin personalVer muestra falta de acceso y no afirma que hay cero técnicos', async () => {
  control.perfil = { ...control.perfil, personalVer: false };
  control.datos.personal = [];
  await montar();
  expect(texto()).toMatch(/sin (?:permiso|acceso)|no (?:tienes|tenés) permiso|personal no disponible/i);
  expect(texto()).not.toMatch(/0 técnicos activos|No hay técnicos|0 libres/);
});

it.each(['cargando', 'error'] as const)('órdenes en %s no se presentan como cero casos resueltos', async estado => {
  control.datos.ordenes = [];
  control.datos.cargandoOrdenes = estado === 'cargando';
  control.datos.errorOrdenes = estado === 'error' ? 'Lectura temporalmente interrumpida' : null;
  await montar();
  expect(texto()).toMatch(estado === 'cargando' ? /cargando/i : /interrumpida|error|no pudimos/i);
  expect(texto()).not.toMatch(/Sin casos que requieran atención|Todo a tiempo|Sin órdenes agendadas|0\s*\/\s*0\s*cerradas/);
});

it('Ver más muestra las órdenes restantes de la categoría y permite abrirlas', async () => {
  control.datos.ordenes = Array.from({ length: 6 }, (_, i) => orden(`caso-${i + 1}`));
  await montar();
  const enlaces = () => tree!.root.findByType(ListaAtencion).findAllByType('a').filter(a => /^\/admin\/ordenes\/caso-/.test(a.props.href || ''));
  expect(enlaces()).toHaveLength(4);
  const mas = tree!.root.findByType(ListaAtencion).findAllByType('button').find(b => /ver.*más/i.test(contenido(b.props.children)));
  expect(mas).toBeDefined();
  await act(async () => mas!.props.onClick());
  expect(enlaces()).toHaveLength(6);
  expect(enlaces().map(a => a.props.href)).toContain('/admin/ordenes/caso-6');
});

it('cambiar el día vuelve a pedir pendientes anteriores aunque personal conserve la misma referencia', async () => {
  await montar();
  expect(cargarAnteriores).toHaveBeenCalled();
  const llamadasIniciales = cargarAnteriores.mock.calls.length;
  await act(async () => tree!.root.findByProps({ 'aria-label': 'Elegir día' }).props.onChange({ target: { value: '2026-10-03' } }));
  expect(cargarAnteriores.mock.calls.length).toBeGreaterThan(llamadasIniciales);
});

it('la ficha reúne pendientes por UID y docId sin duplicar la misma orden', async () => {
  const repetida = orden('compartida');
  control.datos.abiertosAnterioresPorTecnico = {
    'uid-yoniel': { ordenes: [orden('anterior-uid'), repetida], cargando: false, error: null },
    'doc-yoniel': { ordenes: [orden('anterior-doc'), repetida], cargando: false, error: null },
  };
  await montar();
  await act(async () => tree!.root.findByType(LineaTecnico).props.onAbrirFicha());
  const pendientes: OrdenServicio[] = tree!.root.findByType(FichaTecnicoSheet).props.pendientesAnteriores;
  expect(pendientes.map(o => o.id).sort()).toEqual(['anterior-doc', 'anterior-uid', 'compartida']);
});

it('la cita sin asignar permanece visible en avisos y en el total del día', async () => {
  const sinTecnico = { ...orden('sin-asignar'), tecnicoId: undefined, tecnicoNombre: undefined };
  control.datos.ordenes = [orden(), sinTecnico];
  await montar();
  const lista = tree!.root.findByType(ListaAtencion);
  expect(lista.findAllByType('a').map(a => a.props.href)).toContain('/admin/ordenes/sin-asignar');
  expect(tree!.root.findByType(ResumenDia).props.resumen.totalDelDia).toBe(2);
});

it.each(['cargando', 'error'] as const)('pendientes anteriores en %s no permiten afirmar que no hay casos', async estado => {
  control.datos.ordenes = [];
  control.datos.abiertosAnterioresPorTecnico = {
    'uid-yoniel': { ordenes: [], cargando: estado === 'cargando', error: estado === 'error' ? 'No se pudieron leer los pendientes anteriores' : null },
  };
  await montar();
  expect(texto()).toMatch(/datos parciales|cargando pendientes|pendientes.*(?:carga|disponible|error)|no se pudieron leer los pendientes/i);
  expect(texto()).not.toMatch(/Sin casos que requieran atención/);
});

it('el precio pendiente muestra diagnóstico y deja de pedir respuesta cuando oficina aprueba', async () => {
  const pendiente = { ...orden('precio'), fase: 'en_cotizacion', precioSugerido: 4500,
    estadoAprobacion: 'pendiente', notasTecnico: 'Cambiar bomba de desagüe' } as OrdenServicio;
  control.datos.ordenes = [pendiente];
  await montar();
  expect(texto()).toContain('Cambiar bomba de desagüe');
  const antes = tree!.root.findByType(ListaAtencion).props.avisos;
  expect(antes.some((a: { ordenId: string; razon: string }) => a.ordenId === 'precio' && /revisar/i.test(a.razon))).toBe(true);
  control.datos.ordenes = [{ ...pendiente, fase: 'aprobado', estadoAprobacion: 'aprobado' }];
  await actualizar();
  const despues = tree!.root.findByType(ListaAtencion).props.avisos;
  expect(despues.some((a: { ordenId: string; razon: string }) => a.ordenId === 'precio' && /revisar/i.test(a.razon))).toBe(false);
});

it('el chequeo anterior respeta el equipo y desaparece al rechazarse', async () => {
  const pendiente = { ...orden('chequeo-anterior'), fechaCita: new Date('2026-10-01T09:00:00-04:00'),
    sugerenciasSoloChequeo: [{ id: 's1', estado: 'pendiente', sugeridaPor: tecnico.uid,
      sugeridaPorNombre: 'Yoniel', fechaSugerencia: new Date('2026-10-01T10:00:00-04:00'),
      motivo: 'Equipo requiere cambio de tarjeta', montoChequeo: 2000 }] } as OrdenServicio;
  control.datos.ordenes = [];
  control.datos.abiertosAnterioresPorTecnico = { 'uid-yoniel': { ordenes: [pendiente], cargando: false, error: null } };
  await montar();
  expect(texto()).toContain('Equipo requiere cambio de tarjeta');
  const botonB = tree!.root.findAllByType('button').find(b => contenido(b.props.children).includes('Equipo B'))!;
  await act(async () => botonB.props.onClick());
  expect(texto()).not.toContain('Equipo requiere cambio de tarjeta');
  const botonA = tree!.root.findAllByType('button').find(b => contenido(b.props.children).includes('Equipo A'))!;
  await act(async () => botonA.props.onClick());
  expect(texto()).toContain('Equipo requiere cambio de tarjeta');
  control.datos.abiertosAnterioresPorTecnico = { 'uid-yoniel': { ordenes: [{ ...pendiente,
    sugerenciasSoloChequeo: pendiente.sugerenciasSoloChequeo!.map(s => ({ ...s, estado: 'rechazada' })) }], cargando: false, error: null } };
  await actualizar();
  expect(texto()).not.toContain('Equipo requiere cambio de tarjeta');
});
