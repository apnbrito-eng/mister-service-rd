import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rol: 'tecnico', getDocs: vi.fn(), cargar: vi.fn() }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ userProfile: { rol: m.rol } }) }));
vi.mock('firebase/firestore', async original => ({ ...await original<typeof import('firebase/firestore')>(), collection: () => 'personal', getDocs: m.getDocs }));
vi.mock('../../src/services/estadoResultado.service', () => ({ cargarDataMes: m.cargar, cargarDataRango: m.cargar, periodoAnteriorEquivalente: (inicio: Date, fin: Date) => ({ inicio: new Date(inicio.getTime() - (fin.getTime() - inicio.getTime() + 1)), fin: new Date(inicio.getTime() - 1) }) }));
import EstadoResultado from '../../src/pages/EstadoResultado';
beforeEach(() => { m.rol = 'tecnico'; m.getDocs.mockReset().mockResolvedValue({ docs: [] }); m.cargar.mockReset(); });
it('no consulta ninguna fuente financiera antes del gate admin/coordinadora', async () => {
  let vista!: ReactTestRenderer;
  await act(async () => { vista = create(React.createElement(EstadoResultado)); });
  expect(m.getDocs).not.toHaveBeenCalled(); expect(m.cargar).not.toHaveBeenCalled();
  await act(async () => vista.unmount());
});
it('error de fuente llega a UI y no deja exportar un informe viejo', async () => {
  m.rol = 'administrador'; m.cargar.mockRejectedValue(new Error('Fallo controlado'));
  let vista!: ReactTestRenderer;
  await act(async () => { vista = create(React.createElement(EstadoResultado)); });
  expect(JSON.stringify(vista.toJSON())).toContain('Fallo controlado');
  expect(vista.root.findAllByType('button').find(b => b.props.children.some?.((c: unknown) => c === ' CSV'))?.props.disabled ?? vista.root.findByType('button').props.disabled).toBe(true);
  await act(async () => vista.unmount());
});
it('rango inválido no consulta y muestra aviso recuperable', async () => {
  m.rol = 'administrador'; m.cargar.mockRejectedValue(new Error('Sin datos'));
  let vista!: ReactTestRenderer;
  await act(async () => { vista = create(React.createElement(EstadoResultado)); });
  await act(async () => { vista.root.findByProps({ 'aria-label': 'Tipo de período' }).props.onChange({ target: { value: 'rango' } }); });
  m.cargar.mockClear(); m.getDocs.mockClear();
  await act(async () => { vista.root.findByProps({ 'aria-label': 'Desde' }).props.onChange({ target: { value: '' } }); });
  expect(m.cargar).not.toHaveBeenCalled(); expect(m.getDocs).not.toHaveBeenCalled();
  expect(JSON.stringify(vista.toJSON())).toContain('Selecciona un rango de fechas válido');
  await act(async () => vista.unmount());
});
const completo = { totalFacturas: 1, ventasBrutas: 100, ventasNetas: 100, itbisCobrado: 0, costoPiezas: 0, utilidadBruta: 100,
  gastos: { repuestos: 0, transporte: 0, herramientas: 0, servicios: 0, otros: 0 }, totalGastos: 0, sueldoBase: 0,
  totalComisiones: 0, comisionesNominaCerrada: 0, totalBonos: 0, totalAsistencia: 0, totalNomina: 0, utilidadOperativa: 100,
  bonosIncompletos: false, nominaIncompleta: false, sueldoActualReferencia: 0, cobrosConfirmados: 100, cobrosPendientes: 0,
  incidencias: [], comisionesSinFecha: [], nominasIncluidas: [], inicio: '2026-08-20', fin: '2026-09-10' };
it.each(['incidencias', 'comisionesSinFecha'])('omite comparativa del resultado con %s aunque nómina esté completa', async campo => {
  m.rol = 'administrador';
  m.cargar.mockResolvedValue({ ...completo, [campo]: campo === 'incidencias' ? ['Documento inválido'] : [{ id: 'c', ordenNumero: 'OS-1', tecnicoNombre: 'T' }] });
  let vista!: ReactTestRenderer;
  await act(async () => { vista = create(React.createElement(EstadoResultado)); });
  expect(JSON.stringify(vista.toJSON())).toContain('Incompleto — ver desglose');
  expect(JSON.stringify(vista.toJSON())).toContain('resultado operativo omitido');
  const fila = vista.root.findAllByType('tr').find(r => JSON.stringify(r.findAllByType('td')[0]?.props.children).includes('RESULTADO PARCIAL'))!;
  expect(fila.findAllByType('td')[2].children).toHaveLength(0);
  await act(async () => vista.unmount());
});
it('CSV exporta fechas reales del informe y criterio de selección', async () => {
  m.rol = 'administrador'; m.cargar.mockResolvedValue(completo);
  const enlace = { href: '', download: '', click: vi.fn() }; let contenido = '';
  vi.stubGlobal('document', { createElement: () => enlace });
  vi.stubGlobal('Blob', class { constructor(partes: string[]) { contenido = partes.join(''); } });
  const crearURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  const revocarURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  let vista!: ReactTestRenderer;
  try {
    await act(async () => { vista = create(React.createElement(EstadoResultado)); });
    await act(async () => vista.root.findByType('button').props.onClick());
    expect(enlace.download).toBe('estado_resultado_2026-08-20_2026-09-10.csv');
    expect(contenido).toContain('"Desde (RD)","2026-08-20"');
    expect(contenido).toContain('"Hasta (RD)","2026-09-10"');
    expect(contenido).toContain('nóminas cerradas cuyo período termina en el rango, sin prorrateo');
  } finally { if (vista) await act(async () => vista.unmount()); crearURL.mockRestore(); revocarURL.mockRestore(); vi.unstubAllGlobals(); }
});
it('modo rango oculta mes/año y al volver conserva la selección mensual', async () => {
  m.rol = 'administrador'; m.cargar.mockResolvedValue(completo);
  let vista!: ReactTestRenderer;
  await act(async () => { vista = create(React.createElement(EstadoResultado)); });
  await act(async () => vista.root.findByProps({ 'aria-label': 'Mes' }).props.onChange({ target: { value: '2' } }));
  const anio = vista.root.findByProps({ 'aria-label': 'Año' }).props.value;
  await act(async () => vista.root.findByProps({ 'aria-label': 'Tipo de período' }).props.onChange({ target: { value: 'rango' } }));
  expect(vista.root.findAllByProps({ 'aria-label': 'Mes' })).toHaveLength(0);
  expect(vista.root.findAllByProps({ 'aria-label': 'Año' })).toHaveLength(0);
  expect(vista.root.findAllByProps({ 'aria-label': 'Desde' })).toHaveLength(1);
  await act(async () => vista.root.findByProps({ 'aria-label': 'Tipo de período' }).props.onChange({ target: { value: 'mes' } }));
  expect(vista.root.findByProps({ 'aria-label': 'Mes' }).props.value).toBe(2);
  expect(vista.root.findByProps({ 'aria-label': 'Año' }).props.value).toBe(anio);
  await act(async () => vista.unmount());
});
