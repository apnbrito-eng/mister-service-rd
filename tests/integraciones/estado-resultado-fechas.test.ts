import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ datos: {} as Record<string, any[]>, limites: [] as Date[] }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', async original => ({ ...await original<typeof import('firebase/firestore')>(),
 collection: (_: unknown, nombre: string) => nombre,
 query: (ref: unknown) => ref,
 where: (_: string, operador: string, valor: any) => { if (operador === '<=') m.limites.push(valor.toDate()); return {}; },
 getDocs: async (nombre: string) => ({ docs: (m.datos[nombre] || []).map((d, i) => ({ id: String(i), data: () => d })) }),
}));
import { cargarDataMes } from '../../src/services/estadoResultado.service';
beforeEach(() => { m.datos = {}; m.limites = []; });
it('separa fecha desconocida, conserva último milisegundo y excluye anuladas', async () => {
 m.datos.comisiones = [
  { fechaCobro: new Date(2026, 8, 30, 23, 59, 59, 999), comisionMonto: 100 },
  { fechaCobro: new Date(2026, 9, 1), comisionMonto: 200 },
  { fechaCobro: null, comisionMonto: 300 },
  { fechaCobro: 'inválida', comisionMonto: 400 },
  { fechaCobro: new Date(2026, 8, 15).toISOString(), comisionMonto: 50 },
  { estaAnulada: true, comisionMonto: 600 },
 ];
 const datos = await cargarDataMes(2026, 9, []);
 expect(datos.totalComisiones).toBe(150);
 expect(datos.comisionesSinFecha).toHaveLength(2);
 expect(m.limites.every(d => d.getMilliseconds() === 999)).toBe(true);
});
it('subtotal cero es un importe válido y no se reemplaza por total', async () => {
 m.datos.facturas = [{ subtotal: 0, total: 100, costoPiezas: 20, estado: 'pagada' }];
 const datos = await cargarDataMes(2026, 9, []);
 expect(datos.ventasNetas).toBe(0);
 expect(datos.utilidadBruta).toBe(-20);
});
