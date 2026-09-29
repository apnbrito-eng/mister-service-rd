import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ docs: {} as Record<string, any> }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('../../src/services/avances.service', () => ({ obtenerAvancesPendientesDeQuincena: async () => [] }));
vi.mock('../../src/services/prestamos.service', () => ({ obtenerPrestamosActivosTodos: async () => [] }));
vi.mock('firebase/firestore', async original => ({ ...await original<typeof import('firebase/firestore')>(),
 doc: (_: unknown, c: string, id: string) => `${c}/${id}`, collection: (_: unknown, c: string) => c, query: (c: string) => c,
 getDocs: async (c: string) => { const docs = Object.entries(m.docs).filter(([k]) => k.startsWith(c + '/')).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })); return { empty: !docs.length, docs }; },
 addDoc: async (c: string, data: any) => { m.docs[c + '/l'] = data; return { id: 'l' }; },
 runTransaction: async (_: unknown, fn: any) => {
  const writes: [string, any][] = [];
  await fn({ get: async (r: string) => ({ exists: () => !!m.docs[r], data: () => structuredClone(m.docs[r]) }), update: (r: string, data: any) => writes.push([r, data]) });
  writes.forEach(([r, data]) => { m.docs[r] = { ...m.docs[r], ...data }; });
 },
}));
import { generarLiquidacion, cerrarLiquidacion, recalcularEmpleadoLiquidacion, marcarEmpleadoPagado, actualizarConciliacionLiquidacion } from '../../src/services/nomina.service';
import { cargarDataMes } from '../../src/services/estadoResultado.service';
const actor = { id: 'admin', nombre: 'QA' } as any;
const nomina = () => m.docs['liquidaciones_nomina/l'];
beforeEach(() => { m.docs = {
 'personal/p1': { uid: 'u1', rol: 'tecnico', nombre: 'Sano', activo: true, sueldoBase: 1000 },
 'personal/p2': { uid: 'u2', rol: 'tecnico', nombre: 'Conciliar', activo: true, sueldoBase: 1000 },
 'comisiones/c1': { tecnicoId: 'u1', comisionMonto: 100, fechaCobro: '2026-09-20T12:00:00-04:00', estadoLiquidacion: 'pendiente', descuentoPorGarantia: { monto: -20 } },
 'comisiones/c2': { tecnicoId: 'p2', comisionMonto: 200, estadoLiquidacion: 'pendiente' },
 }; });
it('cierra y paga sano, concilia otro y completa sin modificar primer pago', async () => {
 await generarLiquidacion('2026-09-Q2', actor);
 expect(nomina().empleados.map((e: any) => e.estadoCierre)).toEqual(['listo', 'bloqueado']);
 await expect(marcarEmpleadoPagado('l','p2','efectivo',actor)).rejects.toThrow('Cerrar');
 await cerrarLiquidacion('l',actor);
 expect(nomina().estado).toBe('abierta');
 expect(nomina().empleados[0].estadoCierre).toBe('cerrado');
 await marcarEmpleadoPagado('l','p1','efectivo',actor);
 const pago = structuredClone(nomina().empleados[0]);
 m.docs['comisiones/c2'].fechaCobro = '2026-09-21T12:00:00-04:00';
 await recalcularEmpleadoLiquidacion('l','p2');
 expect(nomina().empleados[1]).toMatchObject({ sueldoBase: 500, totalComisiones: 200, totalDevengado: 700, estadoCierre: 'listo' });
 await cerrarLiquidacion('l',actor);
 expect(nomina().estado).toBe('cerrada');
 expect(nomina().empleados[0]).toEqual(pago);
 expect(m.docs['comisiones/c1'].liquidacionId).toBe('l');
});
it('ajuste garantía coincide entre P&L y nómina', async () => {
 delete m.docs['comisiones/c2'];
 await generarLiquidacion('2026-09-Q2',actor);
 const resultado = await cargarDataMes(2026,9,[]);
 expect(resultado.totalComisiones).toBe(80);
 expect(resultado.totalComisiones).toBe(nomina().empleados.reduce((s: number,e: any) => s + e.totalComisiones,0));
});
it('fuera de período conserva referencia, no imputa y preserva ajustes de borrador', async () => {
 await generarLiquidacion('2026-09-Q2',actor);
 Object.assign(nomina().empleados[1], { bono: 40, totalAsistencia: 5, descuentosAsistencia: [{ id:'a',monto:5 }], totalDescuentosAdHoc:10, descuentosAdHoc:[{id:'d',monto:10}] });
 m.docs['comisiones/c2'].fechaCobro = '2026-08-20T12:00:00-04:00';
 await recalcularEmpleadoLiquidacion('l','p2');
 expect(nomina().empleados[1]).toMatchObject({ estadoCierre:'listo', sueldoBase:500, bono:40,totalAsistencia:5,totalDescuentosAdHoc:10,totalNeto:525,comisionesFueraPeriodo:['c2'],comisionesIds:[] });
 expect(m.docs['comisiones/c2'].estadoLiquidacion).toBe('pendiente');
});
it('legacy abierta con fecha desconocida bloquea solo afectado', async () => {
 await generarLiquidacion('2026-09-Q2',actor);
 for (const e of nomina().empleados) delete e.estadoCierre;
 nomina().empleados[1].comisionesIds = ['c2'];
 await cerrarLiquidacion('l',actor);
 expect(nomina().estado).toBe('abierta');
 expect(nomina().empleados.map((e:any)=>e.estadoCierre)).toEqual(['cerrado','bloqueado']);
 expect(m.docs['comisiones/c2'].estadoLiquidacion).toBe('pendiente');
});
it('colisión UID/docId no asigna comisión a dos empleados', async () => {
 m.docs['personal/p1'].uid = 'p2';
 await generarLiquidacion('2026-09-Q2',actor);
 expect(nomina().comisionesSinEmpleado).toContain('c2');
 expect(nomina().empleados.every((e:any)=>!e.comisionesPendientesFecha.includes('c2'))).toBe(true);
});

it('fecha conciliada fuera de período antes del primer cierre no se paga allí', async () => {
 await generarLiquidacion('2026-09-Q2',actor);
 delete nomina().empleados[1].estadoCierre;
 nomina().empleados[1].comisionesIds = ['c2'];
 m.docs['comisiones/c2'].fechaCobro = '2026-08-20T12:00:00-04:00';
 await cerrarLiquidacion('l',actor);
 expect(nomina().empleados[1].estadoCierre).toBe('bloqueado');
 expect(m.docs['comisiones/c2'].estadoLiquidacion).toBe('pendiente');
});

it('fuera período mantiene abierta hasta conciliación verificable', async () => {
 await generarLiquidacion('2026-09-Q2',actor);
 m.docs['comisiones/c2'].fechaCobro = '2026-08-20T12:00:00-04:00';
 await recalcularEmpleadoLiquidacion('l','p2');
 await cerrarLiquidacion('l',actor);
 expect(nomina().estado).toBe('abierta');
 await actualizarConciliacionLiquidacion('l',actor);
 expect(nomina().estado).toBe('abierta');
 m.docs['comisiones/c2'].estadoLiquidacion='liquidada'; m.docs['comisiones/c2'].liquidacionId='nomina-agosto';
 await actualizarConciliacionLiquidacion('l',actor);
 expect(nomina().estado).toBe('cerrada');
});
it('huérfana resuelta a empleado abierto entra a conciliación sin reasignar pago cerrado', async () => {
 m.docs['comisiones/c2'].tecnicoId='desconocido';
 await generarLiquidacion('2026-09-Q2',actor);
 expect(nomina().comisionesSinEmpleado).toContain('c2');
 m.docs['comisiones/c2'].tecnicoId='u2';
 await actualizarConciliacionLiquidacion('l',actor);
 expect(nomina().empleados[1].estadoCierre).toBe('bloqueado');
 expect(nomina().comisionesSinEmpleado).toEqual([]);
});
it('empleado pagado legacy bloqueado no se recalcula ni se borra su pago', async () => {
 await generarLiquidacion('2026-09-Q2',actor);
 nomina().empleados[1].pagado=true;
 const original=structuredClone(nomina().empleados[1]);
 await expect(recalcularEmpleadoLiquidacion('l','p2')).rejects.toThrow('sin pagar');
 expect(nomina().empleados[1]).toEqual(original);
});

it('huérfana sin técnico no se atribuye a empleado legacy sin UID', async () => {
 m.docs['liquidaciones_nomina/l']={estado:'abierta',comisionesSinEmpleado:['c2'],empleados:[{personalId:'p2',estadoCierre:'listo'}]};
 delete m.docs['comisiones/c2'].tecnicoId;
 await actualizarConciliacionLiquidacion('l',actor);
 expect(nomina().comisionesSinEmpleado).toEqual(['c2']);
 expect(nomina().empleados[0].estadoCierre).toBe('listo');
});
