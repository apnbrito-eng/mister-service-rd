import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ datos: {} as Record<string, Record<string, unknown>[]>, fallo: '' }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', async original => ({ ...await original<typeof import('firebase/firestore')>(), collection: (_: unknown, nombre: string) => nombre,
  getDocs: async (nombre: string) => { if (m.fallo === nombre) throw new Error('Sin acceso'); return { docs: (m.datos[nombre] || []).map((raw, i) => ({ id: `${nombre}-${i}`, data: () => raw })) }; },
}));
import { cargarDataMes, cargarDataRango, periodoAnteriorEquivalente } from '../../src/services/estadoResultado.service';
import { fechaFinanciera } from '../../src/utils/fechaFinanciera';
const empleado = { personalId: 'p', sueldoBase: 500, totalComisiones: 80, bono: 20, totalAsistencia: 10, totalAvances: 100, totalCuotasPrestamos: 200 };
beforeEach(() => { m.datos = {}; m.fallo = ''; });
it('snapshot cerrado determina costo, no salario actual ni comisión devengada sumada de nuevo', async () => {
  m.datos.comisiones = [{ fechaCobro: '2026-09-05', comisionMonto: 100, descuentoPorGarantia: { monto: -20 } }];
  m.datos.liquidaciones_nomina = [{ periodoFin: '2026-09-14', estado: 'cerrada', empleados: [empleado] }, { periodoFin: '2026-09-29', estado: 'cerrada', empleados: [empleado] }];
  const d = await cargarDataMes(2026, 9, [{ activo: true, sueldoBase: 90000 } as never]);
  expect(d.totalComisiones).toBe(80); expect(d.comisionesNominaCerrada).toBe(160);
  expect(d.totalNomina).toBe(1180); expect(d.sueldoActualReferencia).toBe(90000);
  expect(d.nominaIncompleta).toBe(false); expect(d.utilidadOperativa).toBe(-1180);
});
it('gastos ISO día RD y pagos confirmados se separan de conduces emitidos', async () => {
  m.datos.gastos = [{ fecha: '2026-09-01', monto: 45, categoria: 'otros' }, { fecha: '2026-08-31', monto: 80 }, { monto: 100 }];
  m.datos.facturas = [{ fechaEmision: '2026-09-05', total: 1000, subtotal: 900, costoPiezas: 100, itbisMonto: 100 }];
  m.datos.ordenes_servicio = [{ pagos: [{ id: 'p', fecha: '2026-09-05', monto: 200, metodo: 'efectivo', verificado: true }] }];
  const d = await cargarDataMes(2026, 9, []);
  expect(d.totalGastos).toBe(45); expect(d.ventasNetas).toBe(900); expect(d.cobrosConfirmados).toBe(200);
  expect(d.incidencias.some(i => i.includes('fecha desconocida'))).toBe(true);
});
it('no nómina o lectura fallida muestra incompleto; abiertos no generan costos fiables', async () => {
  m.datos.liquidaciones_nomina = [{ periodoFin: '2026-09-14', estado: 'abierta', empleados: [empleado] }];
  let d = await cargarDataMes(2026, 9, []);
  expect(d.nominaIncompleta).toBe(true); expect(d.totalNomina).toBe(0);
  m.fallo = 'liquidaciones_nomina'; d = await cargarDataMes(2026, 9, []);
  expect(d.bonosIncompletos).toBe(true); expect(d.nominaIncompleta).toBe(true);
});
it('duplicados cerrados del mismo empleado/período se excluyen y no duplican costo', async () => {
  m.datos.liquidaciones_nomina = [1, 2].map(() => ({ periodoFin: '2026-09-14', estado: 'cerrada', empleados: [empleado] }));
  const d = await cargarDataMes(2026, 9, []);
  expect(d.totalNomina).toBe(0); expect(d.nominaIncompleta).toBe(true);
});
it('rango parcial incluye snapshot entero por fin de período y compara días equivalentes RD', async () => {
  const inicio = fechaFinanciera('2026-09-10')!, fin = new Date(fechaFinanciera('2026-09-14')!.getTime() + 86400000 - 1);
  m.datos.liquidaciones_nomina = [{ periodoFin: '2026-09-14', estado: 'cerrada', empleados: [empleado] }];
  expect((await cargarDataRango(inicio, fin, [])).totalNomina).toBe(590);
  const previo = periodoAnteriorEquivalente(inicio, fin);
  expect(previo.inicio.toISOString()).toBe('2026-09-05T04:00:00.000Z');
  expect(previo.fin.toISOString()).toBe('2026-09-10T03:59:59.999Z');
  await expect(cargarDataRango(fin, inicio, [])).rejects.toThrow('rango');
});
it('rechaza documentos incoherentes o incompletos, pero conserva pérdidas válidas', async () => {
  const base = { fechaEmision: '2026-09-05', total: 100, subtotal: 100, costoPiezas: 180, itbisMonto: 0 };
  m.datos.facturas = [base, { ...base, costoPiezas: -1 }, { ...base, subtotal: 101 },
    { ...base, costoPiezas: undefined }, { ...base, itbisMonto: undefined },
    { ...base, itbisMonto: 10 }, { ...base, total: -1 }];
  const d = await cargarDataMes(2026, 9, []);
  expect(d.totalFacturas).toBe(1); expect(d.utilidadBruta).toBe(-80);
  expect(d.incidencias.filter(i => i.startsWith('Conduce'))).toHaveLength(6);
});
