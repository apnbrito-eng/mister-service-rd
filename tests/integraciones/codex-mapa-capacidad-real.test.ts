import { expect, it } from 'vitest';
import { construirMapa, calcularAvisos, type TecnicoAgenda } from '../../src/utils/capacidadAgenda';
import { fechaEnRD } from '../../src/utils/mapaFechas';
it('la capacidad usa los horarios existentes, no metas cinco/tres/siete inventadas', () => {
  const tecnico: TecnicoAgenda = { id: 'uid', nombre: 'QA', repara: [], horasPorDia: { Viernes: ['9:00 AM', '11:00 AM'] } };
  const viernes = fechaEnRD(2026,9,2);
  const sabado = fechaEnRD(2026,9,3);
  const citas = [9,11,14].map((h,i) => ({ id: String(i), tecnicoId: 'uid', clienteNombre: 'QA', inicio: fechaEnRD(2026,9,2,h) }));
  const celdas = construirMapa([tecnico],citas,[viernes,sabado]);
  expect(celdas[0].meta).toBe(2);
  expect(celdas[1].meta).toBe(0);
  expect(celdas[1].nivel).toBe('no_trabaja');
  const avisos = calcularAvisos([tecnico],celdas,viernes);
  expect(avisos.some(a=>a.tipo==='sobrecargado')).toBe(true);
  expect(avisos.every(a=>a.equipo===undefined)).toBe(true);
});

it('los filtros comerciales excluyen clientes eliminados aunque la fuente los incluya', async () => {
  const { aplicaFiltros, FILTROS_DEFAULT } = await import('../../src/utils/clientesFiltros');
  const cliente = { id: 'qa', nombre: 'QA', telefono: '', eliminado: true } as import('../../src/types').Cliente;
  expect(aplicaFiltros(cliente, FILTROS_DEFAULT)).toBe(false);
  expect(aplicaFiltros({ ...cliente, eliminado: false }, FILTROS_DEFAULT)).toBe(true);
});

it('una pieza que ya llegó no mantiene una orden reactivada en standby', async () => {
  const { standbyPorOrden } = await import('../../src/components/mapa/datosDerivados');
  const piezas = [{ id: 'resuelta', ordenId: 'orden', estado: 'llego' }, { id: 'pendiente', ordenId: 'otra', estado: 'buscando' }] as import('../../src/types').StandbyPieza[];
  expect([...standbyPorOrden(piezas).keys()]).toEqual(['otra']);
});
it('GPS válido nuevo sustituye al registro legacy sin fecha del mismo técnico', async () => {
  const { gpsPorTecnico } = await import('../../src/components/mapa/datosDerivados');
  const datos = [{ tecnicoId: 'legacy', lat:18, lng:-69, timestamp:new Date(NaN) }, { tecnicoId:'uid', lat:19, lng:-69, timestamp:new Date('2026-10-02T12:00:00Z') }] as import('../../src/types').UbicacionVehiculo[];
  const resultado = gpsPorTecnico(datos, ()=>'uid');
  expect(resultado.get('uid')?.lat).toBe(19);
});
