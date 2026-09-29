import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { doc, getDoc } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';
const contexto = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('../../src/firebase/config', () => ({ get db() { return contexto.db; } }));
import { cerrarLiquidacion } from '../../src/services/nomina.service';
const actor = { id: UID.admin, nombre: 'QA' } as any;
beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => {
 await resetearConPerfiles(); contexto.db = como(UID.admin);
 await sembrar('liquidaciones_nomina/l', { estado: 'abierta', quincena: '2026-09-Q2', empleados: [{ personalId: 'p', totalDevengado: 1000, comisionesIds: ['c'], totalComisiones: 100, avancesIds: ['a'], totalAvances: 50, cuotasPrestamos: [{ prestamoId: 'pr', numeroCuota: 1, monto: 100 }], totalCuotasPrestamos: 100 }] });
 await sembrar('comisiones/c', { estadoLiquidacion: 'pendiente', fechaCobro: '2026-09-20T12:00:00-04:00', comisionMonto: 100 });
 await sembrar('avances/a', { personalId: 'p', monto: 50, descontado: false });
 await sembrar('prestamos_empleados/pr', { personalId: 'p', estado: 'activo', montoTotal: 300, saldoPendiente: 300, cuotasTotales: 3, cuotasPagadas: 0, cuotasHistorial: [] });
});
const leer = async (ruta: string) => (await getDoc(doc(como(UID.admin), ruta))).data()!;
it('dos sesiones oficina cierran una sola vez bajo rules reales', async () => {
 const primero = cerrarLiquidacion('l', actor);
 contexto.db = como(UID.coordinadora);
 await Promise.all([primero, cerrarLiquidacion('l', { ...actor, id: UID.coordinadora })]);
 const prestamo = await leer('prestamos_empleados/pr');
 expect(prestamo.cuotasPagadas).toBe(1);
 expect(prestamo.saldoPendiente).toBe(200);
 expect((await leer('liquidaciones_nomina/l')).estado).toBe('cerrada');
});
it('documento inconsistente aborta cierre completo y permite reintentar', async () => {
 await sembrar('prestamos_empleados/pr', { personalId: 'p', estado: 'cancelado', montoTotal: 300, saldoPendiente: 300, cuotasTotales: 3, cuotasPagadas: 0, cuotasHistorial: [] });
 await expect(cerrarLiquidacion('l', actor)).rejects.toThrow('cambió');
 expect((await leer('comisiones/c')).estadoLiquidacion).toBe('pendiente');
 expect((await leer('avances/a')).descontado).toBe(false);
 expect((await leer('liquidaciones_nomina/l')).estado).toBe('abierta');
});
it('personal sin permiso no puede cerrar ni descontar', async () => {
 contexto.db = como(UID.tecnico);
 await expect(cerrarLiquidacion('l', actor)).rejects.toThrow();
 expect((await leer('prestamos_empleados/pr')).saldoPendiente).toBe(300);
});

it('cierre parcial conserva bloqueado y permite completar luego sin repetir cuota', async () => {
 const liq = await leer('liquidaciones_nomina/l');
 liq.empleados.push({ personalId:'p2', estadoCierre:'bloqueado', comisionesPendientesFecha:['c2'], totalDevengado:100, sueldoBase:100, comisionesIds:[],totalComisiones:0,pagado:false });
 await sembrar('liquidaciones_nomina/l',liq);
 await sembrar('comisiones/c2',{tecnicoId:'p2',estadoLiquidacion:'pendiente',comisionMonto:20});
 await cerrarLiquidacion('l',actor);
 expect((await leer('liquidaciones_nomina/l')).estado).toBe('abierta');
 expect((await leer('prestamos_empleados/pr')).cuotasPagadas).toBe(1);
 await sembrar('comisiones/c2',{tecnicoId:'p2',estadoLiquidacion:'pendiente',comisionMonto:20,fechaCobro:'2026-09-20T12:00:00-04:00'});
 const { recalcularEmpleadoLiquidacion } = await import('../../src/services/nomina.service');
 await recalcularEmpleadoLiquidacion('l','p2');
 await cerrarLiquidacion('l',actor);
 expect((await leer('liquidaciones_nomina/l')).estado).toBe('cerrada');
 expect((await leer('prestamos_empleados/pr')).cuotasPagadas).toBe(1);
});
