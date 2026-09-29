import {expect,it} from 'vitest';
import {Timestamp} from 'firebase-admin/firestore';
import {obtenerConteosBandeja} from '../../api/_lib/conteosBandeja';
function base(datos:Record<string,any>){
 const doc=(path:string)=>({id:path.split('/').pop()!,data:()=>datos[path],exists:!!datos[path]});
 const coleccion=(path:string,condiciones:any[]=[]):any=>({
  doc:(id:string)=>({path:`${path}/${id}`,collection:(nombre:string)=>coleccion(`${path}/${id}/${nombre}`)}),
  where:(...condicion:any[])=>coleccion(path,[...condiciones,condicion]),
  get:async()=>({docs:Object.keys(datos).filter(k=>k.startsWith(path+'/') && k.split('/').length===path.split('/').length+1).filter(k=>condiciones.every(([campo,operador,valor])=>{
   const a=datos[k][campo]?.toMillis?.()??datos[k][campo],b=valor?.toMillis?.()??valor;
   return operador==='>'?a>b:operador==='>='?a>=b:operador==='<'?a<b:a===b;
  })).map(doc)}),
 });
 return {collection:coleccion,getAll:async(...refs:any[])=>refs.map(r=>doc(r.path))} as any;
}
const ahora=new Date('2026-09-26T16:00:00-04:00');
it('cuenta chats únicos fuera del límite de página y cruza cartera, atención y pendientes',async()=>{
 const datos:Record<string,any>={};
 for(let i=0;i<31;i++)datos[`whatsapp_conversaciones/${i}`]={noLeidos:10,clienteId:'c',asignadaA:i===0?'otro':'yo',ultimaActividad:Timestamp.fromDate(ahora)};
 datos['crm_clientes/c']={responsableId:'yo'};datos['crm_atencion/0']={pendiente:true};
 expect(await obtenerConteosBandeja(base(datos),'yo',ahora)).toEqual({no_leidos:31,cartera:31,mias:30,pendientes:1,hoy:0,mis_ordenes:0});
});
it('excluye ocultos y lecturas; un nuevo mensaje devuelve el aviso de pendiente',async()=>{
 const datos:Record<string,any>={
 'whatsapp_conversaciones/a':{noLeidos:1,ultimaActividad:Timestamp.fromMillis(100),ocultoGlobalHastaMs:200},
 'whatsapp_conversaciones/b':{noLeidos:1,ultimaActividad:Timestamp.fromMillis(100)},
 'whatsapp_conversaciones/c':{noLeidos:0},
 'usuarios/yo/preferencias_chat/b':{ocultoHastaMs:200},'crm_atencion/b':{pendiente:true}};
 expect((await obtenerConteosBandeja(base(datos),'yo',ahora)).no_leidos).toBe(0);
 datos['whatsapp_conversaciones/b'].ultimaActividad=Timestamp.fromMillis(300);
 expect((await obtenerConteosBandeja(base(datos),'yo',ahora)).pendientes).toBe(1);
 datos['whatsapp_conversaciones/b'].noLeidos=0;
 expect((await obtenerConteosBandeja(base(datos),'yo',ahora)).pendientes).toBe(0);
});
it('cuenta órdenes del día dominicano aunque sean del mismo cliente o no tengan chat',async()=>{
 const datos:Record<string,any>={};
 const citas=['2026-09-26T00:00:00-04:00','2026-09-26T23:59:59-04:00','2026-09-27T00:00:00-04:00','2026-09-25T23:59:59-04:00'];
 citas.forEach((fecha,i)=>datos[`ordenes_servicio/${i}`]={clienteId:'mismo',fechaCita:Timestamp.fromDate(new Date(fecha)),fase:'agendado'});
 datos['ordenes_servicio/cancelada']={fechaCita:Timestamp.fromDate(ahora),fase:'cancelado'};
 datos['ordenes_servicio/eliminada']={fechaCita:Timestamp.fromDate(ahora),fase:'agendado',eliminada:true};
 expect((await obtenerConteosBandeja(base(datos),'yo',ahora)).hoy).toBe(2);
});

it('distingue todas las órdenes de las propias con prioridad al responsable CRM',async()=>{
 const datos:Record<string,any>={};
 const orden={fechaCita:Timestamp.fromDate(ahora),fase:'agendado'};
 datos['ordenes_servicio/1']={...orden,responsableId:'yo'};
 datos['ordenes_servicio/2']={...orden,operariaId:'yo'};
 datos['ordenes_servicio/3']={...orden,responsableId:'yo'};
 datos['crm_ordenes/3']={responsableId:'otra'};
 datos['ordenes_servicio/4']={...orden,responsableId:'otra',operariaId:'yo'};
 datos['ordenes_servicio/5']={...orden,responsableId:'otra'};
 datos['crm_ordenes/5']={responsableId:'yo'};
 const c=await obtenerConteosBandeja(base(datos),'yo',ahora);
 expect(c.hoy).toBe(5);expect(c.mis_ordenes).toBe(3);
});
