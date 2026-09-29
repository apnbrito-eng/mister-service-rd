import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({data:{} as Record<string,any[]>,raw:{} as any,writes:[] as any[]}));
vi.mock('../../src/firebase/config',()=>({db:{}}));
vi.mock('../../src/services/avances.service',()=>({obtenerAvancesPendientesDeQuincena:async()=>[]}));
vi.mock('../../src/services/prestamos.service',()=>({obtenerPrestamosActivosTodos:async()=>[],aplicarCuota:vi.fn()}));
vi.mock('firebase/firestore',async original=>({...await original<typeof import('firebase/firestore')>(),
 collection:(_:unknown,name:string)=>({name}),doc:(_:unknown,name:string,id:string)=>({name,id}),query:(r:any)=>r,
 getDocs:async(r:any)=>({empty:!(m.data[r.name]||[]).length,docs:(m.data[r.name]||[]).map((x:any)=>({id:x.id,data:()=>x}))}),
 addDoc:async(_:unknown,data:any)=>{m.writes.push(data);return {id:'nueva'};},
 runTransaction:async(_:unknown,fn:any)=>fn({get:async()=>({exists:()=>true,data:()=>m.raw}),update:(_:unknown,data:any)=>m.writes.push(data)}),
}));
import {generarLiquidacion,agregarDescuentoAdHoc,removerDescuentoAdHoc} from '../../src/services/nomina.service';
beforeEach(()=>{m.data={};m.raw={};m.writes=[];});
it('incluye sueldo individual del ayudante sin comisión y suma comisión del técnico',async()=>{
 m.data.personal=[{id:'ay',uid:'uid-ay',nombre:'Ayudante QA',rol:'ayudante',activo:true,sueldoBase:18000},{id:'tec',uid:'uid-tec',nombre:'Técnico QA',rol:'tecnico',activo:true,sueldoBase:16000}];
 m.data.comisiones=[{id:'c1',tecnicoId:'uid-tec',fechaCobro:{toDate:()=>new Date('2026-09-20T12:00:00-04:00')},comisionMonto:1500},{id:'c2',tecnicoId:'uid-ay',fechaCobro:{toDate:()=>new Date('2026-09-20T12:00:00-04:00')},comisionMonto:700}];
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
