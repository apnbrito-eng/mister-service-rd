/* eslint-disable @typescript-eslint/no-explicit-any -- Dobles de Firebase/API deliberadamente parciales; solo fixtures de pruebas. */
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ docs: {} as Record<string, any> }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('../../src/services/avances.service', () => ({ obtenerAvancesPendientesDeQuincena: async () => [] }));
vi.mock('../../src/services/prestamos.service', () => ({ obtenerPrestamosActivosTodos: async () => [] }));
vi.mock('firebase/firestore', async original => ({ ...await original<typeof import('firebase/firestore')>(),
 doc: (_: unknown, c: string, id: string) => `${c}/${id.startsWith('nomina-') ? 'l' : id}`, collection: (_: unknown, c: string) => c, query: (c: string) => c,
 getDocs: async (c: string) => { const docs = Object.entries(m.docs).filter(([k]) => k.startsWith(c + '/')).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })); return { empty: !docs.length, docs }; },
 addDoc: async (c: string, data: any) => { m.docs[c + '/l'] = data; return { id: 'l' }; },
 runTransaction: async (_: unknown, fn: any) => {
  const writes: [string, any][] = [];
  await fn({ get: async (r: string) => ({ exists: () => !!m.docs[r], data: () => structuredClone(m.docs[r]) }), set: (r: string, data: any) => writes.push([r, data]), update: (r: string, data: any) => writes.push([r, data]) });
  writes.forEach(([r, data]) => { m.docs[r] = { ...m.docs[r], ...data }; });
 },
}));
import { generarLiquidacion, cerrarLiquidacion, recalcularEmpleadoLiquidacion, marcarEmpleadoPagado, actualizarConciliacionLiquidacion, prepararCuotasPendientes, confirmarCuotasPendientes } from '../../src/services/nomina.service';
import { cargarDataMes } from '../../src/services/estadoResultado.service';
const actor = { id: 'admin', nombre: 'QA' } as any;
const nomina = () => m.docs['liquidaciones_nomina/l'];
beforeEach(() => { m.docs = {
 'personal/p1': { uid: 'u1', rol: 'tecnico', nombre: 'Sano', activo: true, sueldoBase: 1000 },
 'personal/p2': { uid: 'u2', rol: 'tecnico', nombre: 'Conciliar', activo: true, sueldoBase: 1000 },
 'comisiones/c1': { ordenId: 'c1', precioFinal: 10000, tecnicoId: 'u1', comisionMonto: 100, fechaCobro: '2026-09-20T12:00:00-04:00', estadoLiquidacion: 'pendiente', descuentoPorGarantia: { monto: -20 } },
 'comisiones/c2': { ordenId: 'c2', precioFinal: 10000, tecnicoId: 'p2', comisionMonto: 200, estadoLiquidacion: 'pendiente' },
 };
 for (const id of ['c1', 'c2', 'tardia', 'nueva', 'sinfecha', 'os2']) m.docs[`ordenes_servicio/${id}`] = { fase: 'cerrado', precioFinal: 10000, pagos: [{ id: `p-${id}`, monto: 10000, verificado: true, verificadoAt: '2026-08-01T12:00:00-04:00' }] };
});
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
 await recalcularEmpleadoLiquidacion('l','p2',actor);
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
 m.docs['comisiones/c2'].fechaCobro = '2026-10-20T12:00:00-04:00';
 await recalcularEmpleadoLiquidacion('l','p2',actor);
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
 m.docs['comisiones/c2'].fechaCobro = '2026-10-20T12:00:00-04:00';
 await cerrarLiquidacion('l',actor);
 expect(nomina().empleados[1].estadoCierre).toBe('bloqueado');
 expect(nomina().empleados[1].comisionesFueraPeriodo).toContain('c2');
 expect(nomina().empleados[1].comisionesPendientesFecha || []).not.toContain('c2');
 expect(m.docs['comisiones/c2'].estadoLiquidacion).toBe('pendiente');
});

it('fuera período mantiene abierta hasta conciliación verificable', async () => {
 await generarLiquidacion('2026-09-Q2',actor);
 m.docs['comisiones/c2'].fechaCobro = '2026-10-20T12:00:00-04:00';
 await recalcularEmpleadoLiquidacion('l','p2',actor);
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
 await expect(recalcularEmpleadoLiquidacion('l','p2',actor)).rejects.toThrow('sin pagar');
 expect(nomina().empleados[1]).toEqual(original);
});

it('huérfana sin técnico no se atribuye a empleado legacy sin UID', async () => {
 m.docs['liquidaciones_nomina/l']={estado:'abierta',comisionesSinEmpleado:['c2'],empleados:[{personalId:'p2',estadoCierre:'listo'}]};
 delete m.docs['comisiones/c2'].tecnicoId;
 await actualizarConciliacionLiquidacion('l',actor);
 expect(nomina().comisionesSinEmpleado).toEqual(expect.arrayContaining(['c2']));
 expect(nomina().empleados[0].estadoCierre).toBe('listo');
});

it('H1: actualización explícita recupera comisión creada después del borrador', async () => {
 delete m.docs['comisiones/c2'];
 await generarLiquidacion('2026-09-Q2',actor);
 m.docs['comisiones/tardia']={ordenId:'tardia',precioFinal:10000,tecnicoId:'u1',comisionMonto:30,fechaCobro:'2026-09-22T12:00:00-04:00',estadoLiquidacion:'pendiente'};
 await generarLiquidacion('2026-09-Q2',actor);
 await recalcularEmpleadoLiquidacion('l','p1',actor);
 expect(nomina().empleados[0].comisionesIds).toContain('tardia');
 expect(m.docs['comisiones/tardia'].estadoLiquidacion).toBe('pendiente');
});
it('H2: nueva nómina incorpora atraso conservando devengo real', async () => {
 delete m.docs['comisiones/c2'];
 m.docs['comisiones/c1'].fechaCobro='2026-08-20T12:00:00-04:00';
 await generarLiquidacion('2026-09-Q2',actor);
 expect(nomina().empleados[0].comisionesIds).toContain('c1');
 expect(nomina().empleados[0].comisionesAtrasadas[0]).toMatchObject({ id:'c1', quincenaDevengo:'2026-08-Q2', quincenaLiquidacion:'2026-09-Q2' });
 expect(nomina().empleados[0].totalComisiones).toBe(80);
});

it('segundo borrador retira comisión pagada en otra nómina solo con evidencia y conserva sueldo', async () => {
 delete m.docs['comisiones/c2'];
 await generarLiquidacion('2026-09-Q2',actor);
 m.docs['liquidaciones_nomina/otra'] = structuredClone(nomina());
 m.docs['liquidaciones_nomina/otra'].quincena = '2026-10-Q1';
 m.docs['liquidaciones_nomina/otra'].corteComisiones = '2026-10-15T03:59:59.999Z';
 await recalcularEmpleadoLiquidacion('otra','p1',actor);
 await cerrarLiquidacion('l',actor);
 await expect(cerrarLiquidacion('otra',actor)).rejects.toThrow();
 await recalcularEmpleadoLiquidacion('otra','p1',actor);
 const empleado = m.docs['liquidaciones_nomina/otra'].empleados[0];
 expect(empleado).toMatchObject({ sueldoBase:500,totalComisiones:0,comisionesIds:[],comisionesYaLiquidadas:[{id:'c1',liquidacionId:'l'}] });
 await cerrarLiquidacion('otra',actor);
 expect(m.docs['comisiones/c1'].liquidacionId).toBe('l');
});
it('evidencia ajena no permite retirar silenciosamente comisión ya liquidada', async () => {
 delete m.docs['comisiones/c2'];
 await generarLiquidacion('2026-09-Q2',actor);
 m.docs['comisiones/c1'].estadoLiquidacion='liquidada'; m.docs['comisiones/c1'].liquidacionId='otra';
 m.docs['liquidaciones_nomina/otra']={estado:'cerrada',empleados:[{personalId:'ajeno',comisionesIds:['c1']}]};
 await expect(recalcularEmpleadoLiquidacion('l','p1',actor)).rejects.toThrow('evidencia');
 expect(nomina().empleados[0].totalComisiones).toBe(80);
});
it('cierre rechaza comisión cuyo propietario cambió después del borrador', async () => {
 delete m.docs['comisiones/c2'];
 await generarLiquidacion('2026-09-Q2',actor);
 m.docs['comisiones/c1'].tecnicoId='ajeno';
 await expect(cerrarLiquidacion('l',actor)).rejects.toThrow();
 expect(nomina().estado).toBe('abierta');
});
it('pendiente con liquidación previa incoherente requiere revisión y no se sobrescribe', async () => {
 delete m.docs['comisiones/c2'];
 await generarLiquidacion('2026-09-Q2',actor);
 m.docs['comisiones/c1'].liquidacionId='otra';
 await expect(cerrarLiquidacion('l',actor)).rejects.toThrow('incoherente');
 await expect(recalcularEmpleadoLiquidacion('l','p1',actor)).rejects.toThrow('incoherente');
 expect(m.docs['comisiones/c1'].liquidacionId).toBe('otra');
});
it('revisa cuotas explícitamente al incorporar comisión después de devengo cero', async () => {
 delete m.docs['comisiones/c1']; delete m.docs['comisiones/c2']; m.docs['personal/p1'].sueldoBase=0;
 await generarLiquidacion('2026-09-Q2',actor);
 m.docs['prestamos_empleados/pr']={personalId:'p1',estado:'activo',montoCuota:100,montoTotal:300,saldoPendiente:300,cuotasPagadas:0,cuotasTotales:3,cuotasHistorial:[]};
 m.docs['comisiones/tardia']={ordenId:'tardia',precioFinal:10000,tecnicoId:'p1',comisionMonto:3000,fechaCobro:'2026-09-20T12:00:00-04:00'};
 await recalcularEmpleadoLiquidacion('l','p1',actor);
 expect(nomina().empleados[0]).toMatchObject({totalDevengado:3000,estadoCierre:'bloqueado',cuotasPendientesRevision:true});
 await cerrarLiquidacion('l',actor);
 expect(m.docs['prestamos_empleados/pr'].cuotasPagadas).toBe(0);
 const vista = await prepararCuotasPendientes('p1');
 expect(vista[0]).toMatchObject({monto:100,numeroCuota:1});
 await confirmarCuotasPendientes('l','p1',vista);
 expect(nomina().empleados[0]).toMatchObject({totalNeto:2900,estadoCierre:'listo',totalCuotasPrestamos:100});
 await cerrarLiquidacion('l',actor); await cerrarLiquidacion('l',actor);
 expect(m.docs['prestamos_empleados/pr'].cuotasPagadas).toBe(1);
});
it('descubre huérfana nueva y permite cerrar empleado sano', async () => {
 await generarLiquidacion('2026-09-Q2',actor);
 m.docs['comisiones/nueva']={ordenId:'nueva',precioFinal:10000,tecnicoId:'inactivo',comisionMonto:30,fechaCobro:'2026-09-20T12:00:00-04:00'};
 await actualizarConciliacionLiquidacion('l',actor);
 expect(nomina().comisionesSinEmpleado).toContain('nueva');
 await cerrarLiquidacion('l',actor);
 expect(nomina().empleados[0].estadoCierre).toBe('cerrado');
 expect(nomina().estado).toBe('abierta');
});
it('confirmar cuotas rechaza vista previa incompleta o modificada', async () => {
 await generarLiquidacion('2026-09-Q2',actor);
 nomina().empleados[0].cuotasPendientesRevision=true;
 m.docs['prestamos_empleados/pr']={personalId:'p1',estado:'activo',montoCuota:100,montoTotal:300,saldoPendiente:300,cuotasPagadas:0,cuotasTotales:3};
 const vista=await prepararCuotasPendientes('p1');
 await expect(confirmarCuotasPendientes('l','p1',[])).rejects.toThrow('cambiaron');
 m.docs['prestamos_empleados/pr'].montoCuota=120;
 await expect(confirmarCuotasPendientes('l','p1',vista)).rejects.toThrow('cambiaron');
 expect(nomina().empleados[0].cuotasPendientesRevision).toBe(true);
});
it('anular comisión que elevó devengo libera revisión de cuotas sin ocultar otra fecha pendiente', async () => {
 delete m.docs['comisiones/c1']; delete m.docs['comisiones/c2']; m.docs['personal/p1'].sueldoBase=0;
 await generarLiquidacion('2026-09-Q2',actor);
 m.docs['comisiones/tardia']={ordenId:'tardia',precioFinal:10000,tecnicoId:'p1',comisionMonto:3000,fechaCobro:'2026-09-20T12:00:00-04:00'};
 await recalcularEmpleadoLiquidacion('l','p1',actor);
 expect(nomina().empleados[0].cuotasPendientesRevision).toBe(true);
 m.docs['comisiones/tardia'].estaAnulada=true;
 m.docs['comisiones/sinfecha']={ordenId:'sinfecha',precioFinal:10000,tecnicoId:'p1',comisionMonto:30};
 await recalcularEmpleadoLiquidacion('l','p1',actor);
 expect(nomina().empleados[0]).toMatchObject({totalDevengado:0,cuotasPendientesRevision:false,estadoCierre:'bloqueado',comisionesPendientesFecha:['sinfecha']});
 m.docs['comisiones/sinfecha'].estaAnulada=true;
 await recalcularEmpleadoLiquidacion('l','p1',actor);
 expect(nomina().empleados[0]).toMatchObject({totalDevengado:0,cuotasPendientesRevision:false,estadoCierre:'listo'});
 await cerrarLiquidacion('l',actor);
 expect(nomina().empleados[0].estadoCierre).toBe('cerrado');
});
it('cambiar motivo requiere nueva vista previa y conserva motivo confirmado real', async () => {
 await generarLiquidacion('2026-09-Q2',actor);
 nomina().empleados[0].cuotasPendientesRevision=true;
 m.docs['prestamos_empleados/pr']={personalId:'p1',estado:'activo',montoCuota:100,montoTotal:300,saldoPendiente:300,cuotasPagadas:0,cuotasTotales:3,motivo:'Original'};
 const vista=await prepararCuotasPendientes('p1');
 m.docs['prestamos_empleados/pr'].motivo='Corregido';
 await expect(confirmarCuotasPendientes('l','p1',vista)).rejects.toThrow('cambiaron');
 await confirmarCuotasPendientes('l','p1',await prepararCuotasPendientes('p1'));
 expect(nomina().empleados[0].cuotasPrestamos[0].motivo).toBe('Corregido');
});

it('duplicados legacy bloquean sólo afectado, no suman y permiten cerrar sano', async () => {
 m.docs['comisiones/c2'] = { ordenId: 'os2', precioFinal: 10000, tecnicoId: 'u2', comisionMonto: 200, fechaCobro: '2026-09-20', estadoLiquidacion: 'pendiente' };
 m.docs['comisiones/duplicada'] = { ...m.docs['comisiones/c2'], tecnicoId: 'p2' };
 await generarLiquidacion('2026-09-Q2', actor);
 expect(nomina().empleados[1]).toMatchObject({ estadoCierre: 'bloqueado', totalComisiones: 0, comisionesDuplicadas: ['c2', 'duplicada'] });
 await cerrarLiquidacion('l', actor);
 expect(nomina().empleados[0].estadoCierre).toBe('cerrado');
 expect(nomina().estado).toBe('abierta');
 expect(m.docs['comisiones/c2'].estadoLiquidacion).toBe('pendiente');
 expect(m.docs['comisiones/duplicada'].estadoLiquidacion).toBe('pendiente');
 // Simula resolución administrativa auditada en el módulo correspondiente.
 m.docs['comisiones/duplicada'].estaAnulada = true;
 await recalcularEmpleadoLiquidacion('l', 'p2', actor);
 expect(nomina().empleados[1]).toMatchObject({ estadoCierre: 'listo', totalComisiones: 200, comisionesDuplicadas: [] });
});
it('duplicado descubierto después del borrador bloquea cierre del afectado', async () => {
 m.docs['comisiones/c2'] = { ordenId: 'os2', precioFinal: 10000, tecnicoId: 'u2', comisionMonto: 200, fechaCobro: '2026-09-20', estadoLiquidacion: 'pendiente' };
 await generarLiquidacion('2026-09-Q2', actor);
 m.docs['comisiones/duplicada'] = { ...m.docs['comisiones/c2'] };
 await cerrarLiquidacion('l', actor);
 expect(nomina().empleados[1]).toMatchObject({ estadoCierre: 'bloqueado', comisionesDuplicadas: ['c2', 'duplicada'] });
 expect(nomina().empleados[0].estadoCierre).toBe('cerrado');
 expect(m.docs['comisiones/c2'].estadoLiquidacion).toBe('pendiente');
});

it('anticipo no entra en nómina y recalcular retira comisión si deja de estar cobrada', async () => {
 delete m.docs['comisiones/c2'];
 m.docs['ordenes_servicio/c1'].pagos[0].monto = 5000;
 await generarLiquidacion('2026-09-Q2', actor);
 expect(nomina().empleados[0].totalComisiones).toBe(0);
 m.docs['ordenes_servicio/c1'].pagos.push({ id: 'saldo', monto: 5000, verificado: true, verificadoAt: '2026-09-23T12:00:00-04:00' });
 await recalcularEmpleadoLiquidacion('l', 'p1', actor);
 expect(nomina().empleados[0].totalComisiones).toBe(80);
 m.docs['ordenes_servicio/c1'].pagos[1].verificado = false;
 await recalcularEmpleadoLiquidacion('l', 'p1', actor);
 expect(nomina().empleados[0].comisionesIds).toEqual([]);
 expect(nomina().empleados[0].totalComisiones).toBe(0);
});
it('saldo verificado en octubre no entra a nómina septiembre aunque comisión legacy sea de septiembre', async () => {
 delete m.docs['comisiones/c2'];
 m.docs['ordenes_servicio/c1'].pagos = [
  { id: 'anticipo', monto: 5000, verificado: true, verificadoAt: '2026-09-20T12:00:00-04:00' },
  { id: 'saldo', monto: 5000, verificado: true, verificadoAt: '2026-10-03T12:00:00-04:00' },
 ];
 await generarLiquidacion('2026-09-Q2', actor);
 expect(nomina().empleados[0].totalComisiones).toBe(0);
 delete m.docs['liquidaciones_nomina/l'];
 await generarLiquidacion('2026-10-Q1', actor);
 expect(nomina().empleados[0].totalComisiones).toBe(80);
 expect(m.docs['comisiones/c1'].fechaCobro).toBe('2026-09-20T12:00:00-04:00');
});
it('legacy sin fecha de verificación no se hace pagable por inferencia', async () => {
 delete m.docs['comisiones/c2'];
 delete m.docs['ordenes_servicio/c1'].pagos[0].verificadoAt;
 await generarLiquidacion('2026-09-Q2', actor);
 expect(nomina().empleados[0]).toMatchObject({ totalComisiones: 0, estadoCierre: 'bloqueado', comisionesPendientesFecha: ['c1'] });
});

it('recalcular respeta el corte adelantado y no incorpora cobros posteriores', async () => {
 m.docs['comisiones/c2'].fechaCobro='2026-09-27T12:00:00-04:00';
 await generarLiquidacion('2026-09-Q2',actor,{corteComisiones:new Date('2026-09-26T23:59:00-04:00'),fechaPagoProgramada:'2026-09-28'});
 await recalcularEmpleadoLiquidacion('l','p2',actor);
 expect(nomina().empleados[1].comisionesIds).toEqual([]);
 expect(nomina().empleados[1].totalComisiones).toBe(0);
 expect(m.docs['comisiones/c2'].estadoLiquidacion).toBe('pendiente');
});
it('cierre no paga una comisión incluida manualmente después del corte', async () => {
 m.docs['comisiones/c2'].fechaCobro='2026-09-27T12:00:00-04:00';
 await generarLiquidacion('2026-09-Q2',actor,{corteComisiones:new Date('2026-09-26T23:59:00-04:00'),fechaPagoProgramada:'2026-09-28'});
 Object.assign(nomina().empleados[1],{comisionesIds:['c2'],totalComisiones:200,totalDevengado:700,estadoCierre:'listo'});
 await cerrarLiquidacion('l',actor);
 expect(nomina().empleados[1].estadoCierre).toBe('bloqueado');
 expect(nomina().empleados[1].comisionesFueraPeriodo).toContain('c2');
 expect(nomina().empleados[1].comisionesPendientesFecha || []).not.toContain('c2');
 expect(m.docs['comisiones/c2'].estadoLiquidacion).toBe('pendiente');
});
