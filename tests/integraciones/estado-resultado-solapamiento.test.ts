import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ datos: {} as Record<string, Record<string, unknown>[]> }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', async original => ({
  ...await original<typeof import('firebase/firestore')>(),
  collection: (_: unknown, nombre: string) => nombre,
  getDocs: async (nombre: string) => ({ docs: (m.datos[nombre] || []).map((raw, i) => ({ id: `${nombre}-${i}`, data: () => raw })) }),
}));
import { cargarDataMes } from '../../src/services/estadoResultado.service';
const conduceConPiezas = { fechaEmision: '2026-09-05', total: 1000, subtotal: 900, costoPiezas: 300, itbisMonto: 100 };
const conduceSinPiezas = { fechaEmision: '2026-09-05', total: 1000, subtotal: 900, costoPiezas: 0, itbisMonto: 100 };
const OVERLAP = /solapamiento.*conduces.*repuestos.*conciliaci/i;
beforeEach(() => { m.datos = {}; });
it('coexistir costoPiezas y gastos.repuestos positivos en el rango marca solapamiento provisional', async () => {
  m.datos.facturas = [conduceConPiezas];
  m.datos.gastos = [{ fecha: '2026-09-08', monto: 250, categoria: 'repuestos' }];
  const d = await cargarDataMes(2026, 9, []);
  expect(d.costoPiezas).toBe(300);
  expect(d.gastos.repuestos).toBe(250);
  expect(d.incidencias.some(i => OVERLAP.test(i))).toBe(true);
  expect(d.utilidadOperativa).toBe(d.utilidadBruta - d.totalGastos - d.totalNomina); // no toca dinero histórico
});
it('solo conduces con piezas (sin gasto repuestos) no dispara incidencia de solapamiento', async () => {
  m.datos.facturas = [conduceConPiezas];
  m.datos.gastos = [{ fecha: '2026-09-08', monto: 150, categoria: 'transporte' }];
  const d = await cargarDataMes(2026, 9, []);
  expect(d.costoPiezas).toBe(300);
  expect(d.gastos.repuestos).toBe(0);
  expect(d.incidencias.some(i => OVERLAP.test(i))).toBe(false);
});
it('solo gasto repuestos (sin costoPiezas) no dispara incidencia de solapamiento', async () => {
  m.datos.facturas = [conduceSinPiezas];
  m.datos.gastos = [{ fecha: '2026-09-08', monto: 700, categoria: 'repuestos' }];
  const d = await cargarDataMes(2026, 9, []);
  expect(d.costoPiezas).toBe(0);
  expect(d.gastos.repuestos).toBe(700);
  expect(d.incidencias.some(i => OVERLAP.test(i))).toBe(false);
});
it('costoPiezas y gastos.repuestos en períodos distintos no cuentan como solapamiento', async () => {
  m.datos.facturas = [conduceConPiezas];
  m.datos.gastos = [{ fecha: '2026-08-10', monto: 500, categoria: 'repuestos' }];
  const d = await cargarDataMes(2026, 9, []);
  expect(d.costoPiezas).toBe(300);
  expect(d.gastos.repuestos).toBe(0);
  expect(d.incidencias.some(i => OVERLAP.test(i))).toBe(false);
});
it('gasto repuestos inválido no cuenta y no dispara solapamiento aunque coexista con costoPiezas', async () => {
  m.datos.facturas = [conduceConPiezas];
  m.datos.gastos = [
    { fecha: '2026-09-08', monto: -10, categoria: 'repuestos' },
    { fecha: '2026-09-09', monto: 'abc', categoria: 'repuestos' },
    { monto: 100, categoria: 'repuestos' },
  ];
  const d = await cargarDataMes(2026, 9, []);
  expect(d.costoPiezas).toBe(300);
  expect(d.gastos.repuestos).toBe(0);
  expect(d.incidencias.some(i => OVERLAP.test(i))).toBe(false);
  expect(d.incidencias.some(i => /importe inv|fecha desconocida/i.test(i))).toBe(true);
});
