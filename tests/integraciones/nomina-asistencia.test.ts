/* eslint-disable @typescript-eslint/no-explicit-any -- Dobles de Firebase/API deliberadamente parciales; solo fixtures de pruebas. */
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({data:{} as Record<string,any[]>,raw:{} as any,writes:[] as any[]}));
vi.mock('../../src/firebase/config',()=>({db:{}}));
vi.mock('../../src/services/avances.service',()=>({obtenerAvancesPendientesDeQuincena:async()=>[]}));
vi.mock('../../src/services/prestamos.service',()=>({obtenerPrestamosActivosTodos:async()=>[],aplicarCuota:vi.fn()}));
vi.mock('firebase/firestore',async original=>({...await original<typeof import('firebase/firestore')>(),
 collection:(_:unknown,name:string)=>({name}),doc:(_:unknown,name:string,id:string)=>({name,id}),query:(r:any)=>r,
 getDocs:async(r:any)=>({empty:!(m.data[r.name]||[]).length,docs:(m.data[r.name]||[]).map((x:any)=>({id:x.id,data:()=>x}))}),
 addDoc:async(_:unknown,data:any)=>{m.writes.push(data);return {id:'nueva'};},
 runTransaction:async(_:unknown,fn:any)=>fn({get:async()=>({exists:()=>Object.keys(m.raw).length>0,data:()=>m.raw}),set:(_:unknown,data:any)=>m.writes.push(data),update:(_:unknown,data:any)=>m.writes.push(data)}),
}));
import {generarLiquidacion,agregarDescuentoAdHoc,removerDescuentoAdHoc} from '../../src/services/nomina.service';
beforeEach(()=>{m.data={};m.raw={};m.writes=[];});
it('incluye sueldo individual del ayudante sin comisión y suma comisión del técnico',async()=>{
 m.data.personal=[{id:'ay',uid:'uid-ay',nombre:'Ayudante QA',rol:'ayudante',activo:true,sueldoBase:18000},{id:'tec',uid:'uid-tec',nombre:'Técnico QA',rol:'tecnico',activo:true,sueldoBase:16000}];
 m.data.comisiones=[{id:'c1',ordenId:'o1',precioFinal:10000,tecnicoId:'uid-tec',fechaCobro:{toDate:()=>new Date('2026-09-20T12:00:00-04:00')},comisionMonto:1500},{id:'c2',ordenId:'o2',precioFinal:10000,tecnicoId:'uid-ay',fechaCobro:{toDate:()=>new Date('2026-09-20T12:00:00-04:00')},comisionMonto:700}];
 m.data.ordenes_servicio=['o1','o2'].map(id=>({id,fase:'cerrado',precioFinal:10000,pagos:[{id:'p',monto:10000,verificado:true,verificadoAt:'2026-09-20T12:00:00-04:00'}]}));
 await generarLiquidacion('2026-09-Q2',{id:'admin',nombre:'QA'} as any);
 expect(m.writes[0].empleados.find((e:any)=>e.personalId==='ay')).toMatchObject({sueldoBase:9000,totalComisiones:0,totalDevengado:9000});
 expect(m.writes[0].empleados.find((e:any)=>e.personalId==='tec')).toMatchObject({sueldoBase:8000,totalComisiones:1500,totalDevengado:9500});
});

it('editar descuentos manuales conserva los RD$618 aprobados por asistencia',async()=>{
 m.raw={estado:'abierta',empleados:[{personalId:'ay',totalDevengado:8000,totalAvances:500,totalCuotasPrestamos:300,totalAsistencia:618,descuentosAsistencia:[{id:'falta',dia:'2026-09-20',monto:618}]}]};
 await agregarDescuentoAdHoc('liq','ay',{monto:100,motivo:'Ajuste QA'},{id:'admin',nombre:'QA'} as any);
 expect(m.writes[0].empleados[0]).toMatchObject({totalDescuentos:1518,totalNeto:6482,totalAsistencia:618});
 m.raw={...m.raw,...m.writes[0]};
 await removerDescuentoAdHoc('liq','ay',m.raw.empleados[0].descuentosAdHoc[0].id);
 expect(m.writes[1].empleados[0]).toMatchObject({totalDescuentos:1418,totalNeto:6582,totalAsistencia:618});
});

it('comisión sin empleado identificado queda visible sin inventar fecha', async () => {
 m.data.comisiones = [{ id: 'sin-fecha', comisionMonto: 1500, estadoLiquidacion: 'pendiente' }];
 await generarLiquidacion('2026-09-Q2', { id: 'admin', nombre: 'QA' } as any);
 expect(m.writes[0].comisionesSinEmpleado).toEqual(['sin-fecha']);
});
it('anulada sin fecha no bloquea ni suma a nómina', async () => {
 m.data.comisiones = [{ id: 'anulada', comisionMonto: 1500, estaAnulada: true }];
 await generarLiquidacion('2026-09-Q2', { id: 'admin', nombre: 'QA' } as any);
 expect(m.writes[0].totalNomina).toBe(0);
});

it('preparación febrero 26 paga 28 y reserva comisiones posteriores para la siguiente nómina', async () => {
 m.data.personal=[{id:'tec',uid:'uid-tec',nombre:'Técnico QA',rol:'tecnico',activo:true,sueldoBase:16000}];
 m.data.comisiones=['2026-02-26T22:00:00-04:00','2026-02-27T10:00:00-04:00'].map((fecha,i)=>({id:`c${i}`,ordenId:`o${i}`,precioFinal:10000,tecnicoId:'uid-tec',fechaCobro:{toDate:()=>new Date(fecha)},comisionMonto:1500}));
 m.data.ordenes_servicio=m.data.comisiones.map((c:any)=>({id:c.ordenId,fase:'cerrado',precioFinal:10000,pagos:[{id:'p',monto:10000,verificado:true,verificadoAt:c.fechaCobro.toDate().toISOString()}]}));
 await generarLiquidacion('2026-02-Q2',{id:'admin',nombre:'QA'} as any,{corteComisiones:new Date('2026-02-26T23:59:00-04:00'),fechaPagoProgramada:'2026-02-28'});
 expect(m.writes[0].fechaPagoProgramada).toBe('2026-02-28');
 expect(m.writes[0].corteComisiones).toBe('2026-02-27T03:59:00.000Z');
 expect(m.writes[0].empleados[0]).toMatchObject({sueldoBase:8000,totalComisiones:1500,comisionesIds:['c0']});
 m.data.comisiones=m.data.comisiones.filter((c:any)=>c.id==='c1');m.writes=[];
 await generarLiquidacion('2026-03-Q1',{id:'admin',nombre:'QA'} as any);
 expect(m.writes[0].empleados[0]).toMatchObject({totalComisiones:1500,comisionesIds:['c1']});
});
