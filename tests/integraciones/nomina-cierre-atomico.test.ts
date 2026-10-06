/* eslint-disable @typescript-eslint/no-explicit-any -- Dobles de Firebase/API deliberadamente parciales; solo fixtures de pruebas. */
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ docs: {} as Record<string, any>, fallo: '', cola: Promise.resolve() }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('../../src/services/avances.service', () => ({ obtenerAvancesPendientesDeQuincena: async () => [] }));
vi.mock('../../src/services/prestamos.service', () => ({ obtenerPrestamosActivosTodos: async () => [] }));
vi.mock('firebase/firestore', async original => ({ ...await original<typeof import('firebase/firestore')>(),
 collection: (_: unknown, col: string) => col,
 getDocs: async (col: string) => ({ docs: Object.entries(m.docs).filter(([k]) => k.startsWith(col + '/')).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })) }),
 doc: (_: unknown, col: string, id: string) => `${col}/${id}`,
 runTransaction: (_: unknown, fn: any) => {
   const operacion = m.cola.then(async () => {
     const writes: [string, any][] = [];
     await fn({ get: async (id: string) => ({ exists: () => !!m.docs[id], data: () => structuredClone(m.docs[id]) }), update: (id: string, data: any) => writes.push([id, data]) });
     if (writes.some(([id]) => id === m.fallo)) throw new Error('Fallo de escritura simulado');
     for (const [id, data] of writes) m.docs[id] = { ...m.docs[id], ...data };
   });
   m.cola = operacion.catch(() => {});
   return operacion;
 },
}));
import { cerrarLiquidacion } from '../../src/services/nomina.service';
const actor = { id: 'admin', nombre: 'Administración' } as any;
beforeEach(() => {
 m.fallo = ''; m.cola = Promise.resolve();
 m.docs = {
  'liquidaciones_nomina/l': { estado: 'abierta', quincena: '2026-09-Q2', empleados: [{ personalId: 'p', totalDevengado: 1000, comisionesIds: ['c'], totalComisiones: 100, avancesIds: ['a'], totalAvances: 50, cuotasPrestamos: [{ prestamoId: 'pr', numeroCuota: 1, monto: 100 }], totalCuotasPrestamos: 100 }] },
  'comisiones/c': { ordenId: 'o1', precioFinal: 1000, tecnicoId: 'p', estadoLiquidacion: 'pendiente', fechaCobro: '2026-09-20T12:00:00-04:00', comisionMonto: 100 },
  'ordenes_servicio/o1': { fase: 'cerrado', precioFinal: 1000, pagos: [{ id: 'p1', monto: 1000, verificado: true, verificadoAt: '2026-08-01T12:00:00-04:00' }] },
  'avances/a': { personalId: 'p', monto: 50, descontado: false },
  'prestamos_empleados/pr': { personalId: 'p', estado: 'activo', montoTotal: 300, saldoPendiente: 300, cuotasTotales: 3, cuotasPagadas: 0, cuotasHistorial: [] },
 };
});
for (const fallo of ['comisiones/c', 'prestamos_empleados/pr', 'liquidaciones_nomina/l']) {
 it(`si falla ${fallo} no persiste nada y reintento descuenta una vez`, async () => {
   const inicial = structuredClone(m.docs); m.fallo = fallo;
   await expect(cerrarLiquidacion('l', actor)).rejects.toThrow('Fallo');
   expect(m.docs).toEqual(inicial);
   m.fallo = ''; await cerrarLiquidacion('l', actor); await cerrarLiquidacion('l', actor);
   expect(m.docs['prestamos_empleados/pr'].saldoPendiente).toBe(200);
   expect(m.docs['prestamos_empleados/pr'].cuotasHistorial).toHaveLength(1);
   expect(m.docs['liquidaciones_nomina/l'].estado).toBe('cerrada');
 });
}
it('dos administradores concurrentes no aplican dos cuotas', async () => {
 await Promise.all([cerrarLiquidacion('l', actor), cerrarLiquidacion('l', { ...actor, id: 'otro' })]);
 expect(m.docs['prestamos_empleados/pr'].cuotasPagadas).toBe(1);
});
it('un préstamo cancelado no se reactiva al cerrar', async () => {
 m.docs['prestamos_empleados/pr'].estado = 'cancelado';
 await expect(cerrarLiquidacion('l', actor)).rejects.toThrow('cambió');
 expect(m.docs['comisiones/c'].estadoLiquidacion).toBe('pendiente');
});
it('un ajuste de comisión posterior al borrador requiere revisión', async () => {
 m.docs['comisiones/c'].descuentoPorGarantia = { monto: -10 };
 await expect(cerrarLiquidacion('l', actor)).rejects.toThrow('totalComisiones');
 expect(m.docs['liquidaciones_nomina/l'].estado).toBe('abierta');
});
it('un cierre parcial heredado exacto permite recuperar y uno distinto no', async () => {
 const pr = m.docs['prestamos_empleados/pr'];
 pr.cuotasPagadas = 1; pr.saldoPendiente = 220;
 pr.cuotasHistorial = [{ liquidacionId: 'l', quincena: '2026-09-Q2', numero: 1, monto: 80 }];
 await expect(cerrarLiquidacion('l', actor)).rejects.toThrow('otros datos');
 pr.cuotasHistorial[0].monto = 100; pr.saldoPendiente = 200; pr.cuotasPagadas = 1;
 await cerrarLiquidacion('l', actor);
 expect(pr.cuotasHistorial).toHaveLength(1);
});
it('comisión liquidada sin origen no se reasigna silenciosamente', async () => {
 m.docs['comisiones/c'].estadoLiquidacion = 'liquidada';
 await expect(cerrarLiquidacion('l', actor)).rejects.toThrow('conciliación');
});

it('comisión histórica sin estado conserva compatibilidad de generación', async () => {
 delete m.docs['comisiones/c'].estadoLiquidacion;
 await cerrarLiquidacion('l', actor);
 expect(m.docs['comisiones/c'].estadoLiquidacion).toBe('liquidada');
});

it('préstamo histórico sin historial solo es válido si conserva todo el saldo', async () => {
 delete m.docs['prestamos_empleados/pr'].cuotasHistorial;
 m.docs['prestamos_empleados/pr'].saldoPendiente = 200;
 await expect(cerrarLiquidacion('l', actor)).rejects.toThrow('Historial');
 m.docs['prestamos_empleados/pr'].saldoPendiente = 300;
 await cerrarLiquidacion('l', actor);
 expect(m.docs['prestamos_empleados/pr'].cuotasHistorial).toHaveLength(1);
});

it('reintento exacto no oculta un saldo incompatible con su historial', async () => {
 const pr = m.docs['prestamos_empleados/pr'];
 pr.cuotasPagadas = 1;
 pr.cuotasHistorial = [{ liquidacionId: 'l', quincena: '2026-09-Q2', numero: 1, monto: 100 }];
 await expect(cerrarLiquidacion('l', actor)).rejects.toThrow('Saldo');
 expect(m.docs['liquidaciones_nomina/l'].estado).toBe('abierta');
});

for (const origen of ['avances', 'prestamos', 'adHoc', 'asistencia']) {
 it(`rechaza descuentos ${origen} superiores al devengado sin escrituras`, async () => {
  const e = m.docs['liquidaciones_nomina/l'].empleados[0];
  e.totalDevengado = 200;
  if (origen === 'avances') { m.docs['avances/a'].monto = 150; e.totalAvances = 150; }
  if (origen === 'prestamos') { e.cuotasPrestamos[0].monto = 200; e.totalCuotasPrestamos = 200; }
  if (origen === 'adHoc') { e.descuentosAdHoc = [{ monto: 100 }]; e.totalDescuentosAdHoc = 100; }
  if (origen === 'asistencia') { e.descuentosAsistencia = [{ monto: 100 }]; e.totalAsistencia = 100; }
  e.totalNeto = 0;
  const antes = structuredClone(m.docs);
  await expect(cerrarLiquidacion('l', actor)).rejects.toThrow('exceden el devengado');
  expect(m.docs).toEqual(antes);
 });
}
it('permite descuentos exactamente iguales al devengado', async () => {
 const e = m.docs['liquidaciones_nomina/l'].empleados[0];
 e.totalDevengado = 200; e.descuentosAsistencia = [{ monto: 50 }]; e.totalAsistencia = 50; e.totalDescuentos = 200; e.totalNeto = 0;
 await cerrarLiquidacion('l', actor);
 expect(m.docs['liquidaciones_nomina/l'].estado).toBe('cerrada');
});
it('impide ocultar descuentos de asistencia con agregado menor que detalle', async () => {
 const e = m.docs['liquidaciones_nomina/l'].empleados[0];
 e.descuentosAsistencia = [{ monto: 1200 }]; e.totalAsistencia = 0;
 await expect(cerrarLiquidacion('l', actor)).rejects.toThrow('no coincide');
 expect(m.docs['avances/a'].descontado).toBe(false);
});

it.each(['anticipo', 'sin_verificar', 'reabierta'])('cierre relee orden y bloquea comisión legacy pendiente con %s', async caso => {
 const o = m.docs['ordenes_servicio/o1'];
 if (caso === 'anticipo') o.pagos[0].monto = 500;
 if (caso === 'sin_verificar') o.pagos[0].verificado = false;
 if (caso === 'reabierta') o.fase = 'agendado';
 const antes = structuredClone(m.docs);
 await expect(cerrarLiquidacion('l', actor)).rejects.toThrow('cobro completo confirmado');
 expect(m.docs).toEqual(antes);
});
it('nómina ya cerrada conserva histórico aunque la orden cambie después', async () => {
 await cerrarLiquidacion('l', actor);
 m.docs['ordenes_servicio/o1'].pagos = [];
 const antes = structuredClone(m.docs);
 await cerrarLiquidacion('l', actor);
 expect(m.docs).toEqual(antes);
});
it('cierre parcial legacy respeta comisión ya liquidada en la misma nómina sin fechas nuevas', async () => {
 Object.assign(m.docs['comisiones/c'], { estadoLiquidacion: 'liquidada', liquidacionId: 'l' });
 delete m.docs['ordenes_servicio/o1'].pagos[0].verificadoAt;
 await cerrarLiquidacion('l', actor);
 expect(m.docs['liquidaciones_nomina/l'].estado).toBe('cerrada');
 expect(m.docs['comisiones/c'].liquidacionId).toBe('l');
});
