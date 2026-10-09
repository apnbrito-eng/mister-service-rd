import test from 'node:test';
import assert from 'node:assert/strict';
import { validarFranja, siguienteDiaLaboralRD, versionHorario, payloadRespuesta, leerRespuestaCita } from '../../api/_lib/loteHorarios.js';
test('franja independiente y sin cruce de medianoche', () => {
 assert.deepEqual(validarFranja({inicio:'09:00',fin:'11:00'}), {inicio:'09:00',fin:'11:00'});
 for (const f of [{inicio:'11:00',fin:'09:00'}, {inicio:'24:00',fin:'25:00'}, {inicio:'09:00',fin:'09:00'}]) assert.throws(() => validarFranja(f));
});
test('día siguiente RD omite domingo y no depende del huso del dispositivo', () => {
 assert.equal(siguienteDiaLaboralRD(new Date('2026-10-11T02:00:00Z')), '2026-10-12');
 assert.equal(siguienteDiaLaboralRD(new Date('2026-10-09T15:00:00Z')), '2026-10-10');
});
test('snapshot cambia con horario y respuesta identifica versión exacta', () => {
 const v = versionHorario('orden1','2026-10-10',{inicio:'09:00',fin:'11:00'},'18494580318');
 assert.notEqual(v, versionHorario('orden1','2026-10-10',{inicio:'10:00',fin:'12:00'},'18494580318'));
 assert.deepEqual(leerRespuestaCita(payloadRespuesta('orden1',v,'reagendar')), {ordenId:'orden1',version:v,accion:'reagendar'});
 assert.equal(leerRespuestaCita('cancelar'),null);
});
import { registrarRespuestaHorario } from '../../api/_lib/respuestaCitaHorario.js';
import type { Firestore } from 'firebase-admin/firestore';
test('respuesta rechaza destinatario distinto, snapshot antiguo y mensaje duplicado', async()=>{
 const franja={inicio:'09:00',fin:'11:00'};const version=versionHorario('orden1','2026-10-10',franja,'18494580318');
 const orden={fechaCita:{toDate:()=>new Date('2026-10-10T13:00:00Z')},franjaLlegada:franja,clienteTelefono:'8494580318',horarioAvisoVersion:version,fase:'agendado'};
 async function ejecutar(waId:string, cambio=false, duplicado=false){
  const db={doc:(path:string)=>({path}),runTransaction:async(fn:(tx:unknown)=>unknown)=>fn({get:async(ref:{path:string})=>({exists:ref.path.includes('respuestas')?duplicado:true,data:()=>ref.path.includes('ordenes')?{...orden,...(cambio?{franjaLlegada:{inicio:'10:00',fin:'12:00'}}:{})}: {waId:'18494580318',estado:'enviado'}}),update:()=>assert.fail('No debe modificar'),create:()=>assert.fail('No debe crear')})} as unknown as Firestore;
  return registrarRespuestaHorario(db,payloadRespuesta('orden1',version,'aceptar'),waId,'wamid.test');
 }
 assert.equal((await ejecutar('18095550111')).motivo,'horario_obsoleto_o_no_enviado');
 assert.equal((await ejecutar('18494580318',true)).motivo,'horario_obsoleto_o_no_enviado');
 assert.equal((await ejecutar('18494580318',false,true)).motivo,'duplicado');
});
import { conEnvioHorarioInterno, esEnvioHorarioInterno } from '../../api/_lib/envioHorarioInterno.js';
import type { VercelRequest } from '@vercel/node';
test('gate interno no puede forjarse por headers, body o copia y se limpia tras fallo',async()=>{
 const req={headers:{'x-interno':'true'},body:{interno:true}} as unknown as VercelRequest;
 assert.equal(esEnvioHorarioInterno(req),false);
 await assert.rejects(conEnvioHorarioInterno(req,async()=>{
  assert.equal(esEnvioHorarioInterno(req),true);
  assert.equal(esEnvioHorarioInterno({...req} as VercelRequest),false);
  throw new Error('fallo');
 }));
 assert.equal(esEnvioHorarioInterno(req),false);
});
test('reagendar crea solicitud atribuida y aviso interno sin cambiar fase',async()=>{
 const franja={inicio:'09:00',fin:'11:00'},waId='18494580318';const version=versionHorario('orden1','2026-10-10',franja,waId);
 const escrituras:{path:string;data:Record<string,unknown>}[]=[];
 const db={doc:(path:string)=>({path}),runTransaction:async(fn:(tx:unknown)=>unknown)=>fn({get:async(ref:{path:string})=>({exists:!ref.path.includes('respuestas'),data:()=>ref.path.includes('ordenes')?{clienteNombre:'Prueba',operariaId:'operaria1',fechaCita:{toDate:()=>new Date('2026-10-10T13:00:00Z')},franjaLlegada:franja,clienteTelefono:waId,horarioAvisoVersion:version,fase:'agendado'}:ref.path.includes('usuarios')?{activo:true,rol:'operaria'}:{waId,estado:'enviado'}}),update:(ref:{path:string},data:Record<string,unknown>)=>escrituras.push({path:ref.path,data}),create:(ref:{path:string},data:Record<string,unknown>)=>escrituras.push({path:ref.path,data})})} as unknown as Firestore;
 const r=await registrarRespuestaHorario(db,payloadRespuesta('orden1',version,'reagendar'),waId,'wamid.test');
 assert.equal(r.procesado,true);assert.equal(r.requiereOperaria,true);
 assert.equal(escrituras.find(e=>e.path==='ordenes_servicio/orden1')?.data.fase,undefined);
 assert.equal((escrituras.find(e=>e.path==='ordenes_servicio/orden1')?.data.solicitudHorario as {estado:string}).estado,'pendiente');
 assert.equal(escrituras.find(e=>e.path.startsWith('notificaciones/'))?.data.userId,'operaria1');
});
import { puedeOperarRutaCita,equipoRutaOrden } from '../../api/_lib/accesoRutaCita.js';
test('secretaria y operaria comparten equipo canónico; permisos y grupos desconocidos fallan cerrado',()=>{
 const equipos=new Map([['operariaA','A'],['secretariaA','A'],['operariaB','B']]);
 const o={operariaId:'operariaA',fase:'agendado'};
 assert.equal(equipoRutaOrden(o,equipos),'A');
 assert.equal(puedeOperarRutaCita({rol:'secretaria'},'secretariaA','A',o,equipos),true);
 assert.equal(puedeOperarRutaCita({rol:'secretaria'},'secretariaB','B',o,equipos),false);
 assert.equal(puedeOperarRutaCita({rol:'secretaria'},'sinEquipo',null,{fase:'agendado'},equipos),false);
 assert.equal(puedeOperarRutaCita({rol:'secretaria',permisosPersonalizados:true,permisosSistema:{ordenesVer:true,ordenesModificar:false}},'secretariaA','A',o,equipos),false);
 assert.equal(puedeOperarRutaCita({rol:'secretaria',permisosPersonalizados:true,permisosSistema:{ordenesVer:true,ordenesModificar:true,ordenesModificarFueraGrupo:true}},'secretariaB','B',o,equipos),true);
 assert.equal(puedeOperarRutaCita({rol:'secretaria'},'secretariaA','A',{...o,equipoId:'B'},equipos),false);
});
