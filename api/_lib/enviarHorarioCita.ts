import { conEnvioHorarioInterno } from './envioHorarioInterno.js';
import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import enviarWhatsApp from '../whatsapp/send.js';
import { payloadRespuesta, validarFranja, versionHorario, siguienteDiaLaboralRD } from './loteHorarios.js';

export async function comprobarPlantillaHorarios() {
 const token=process.env.META_ACCESS_TOKEN, waba=process.env.META_WABA_ID;
 if (!token || !waba) throw new Error('Configura Meta para comprobar la plantilla.');
 const url=new URL(`https://graph.facebook.com/${process.env.META_API_VERSION || 'v21.0'}/${waba}/message_templates`);
 url.searchParams.set('name','confirmar_visita_manana_v1');url.searchParams.set('fields','name,status,language,components');
 const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
 const datos=await r.json() as {data?:{status:string;language:string;components:{type:string;buttons?:{type:string;text:string}[];text?:string}[]}[]};
 const plantilla=datos.data?.find(p=>p.status==='APPROVED' && p.language==='es');
 const botones=plantilla?.components.find(c=>c.type==='BUTTONS')?.buttons;
 const texto=plantilla?.components.find(c=>c.type==='BODY')?.text ?? '';
 if (!r.ok || !plantilla || plantilla.components.some(c=>c.type==='HEADER') || !botones || botones.length!==3 || botones.some(b=>b.type!=='QUICK_REPLY') || botones.map(b=>b.text).join('|')!=='Aceptar cita|Reagendar|Cancelar cita' || ![1,2,3,4].every(n=>texto.includes(`{{${n}}}`)) || texto.includes('{{5}}')) throw new Error('La plantilla de horarios aún no está aprobada con el formato requerido.');
 return plantilla;
}
/** Un request humano procesa un item; el cliente recorre el lote confirmado. La reserva previene llamadas paralelas. */
export async function enviarHorarioCita(db:Firestore,req:VercelRequest, uid:string, ordenId:string, version:string, idioma:string, autorizar:(orden:Record<string,unknown>)=>boolean) {
 const ref=db.doc(`ordenes_servicio/${ordenId}`), avisoRef=db.doc(`citas_horarios_envios/${ordenId}_${version}`);
 const reservado=await db.runTransaction(async tx=>{
  const [orden,aviso]=await Promise.all([tx.get(ref),tx.get(avisoRef)]);
  if (aviso.exists && aviso.data()?.estado!=='fallido') return {duplicado:true,estado:aviso.data()?.estado} as const;
  const intento=(aviso.data()?.intento ?? 0)+1;
  const o=orden.data(); if (!o || !autorizar(o)) throw new Error('No puede enviar horarios para esta cita.');
  if (!o || o.eliminado===true || o.borrado===true || ['cerrado','cancelado','trabajo_realizado'].includes(o.fase)) throw new Error('Cita no disponible.');
  const fecha=o.fechaCita?.toDate ? new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(o.fechaCita.toDate()) : null;const franja=validarFranja(o.franjaLlegada);
  const t=String(o.clienteTelefono??'').replace(/\D/g,'');const waId=t.length===10?`1${t}`:t;
  if(!/^1\d{10}$/.test(waId) || fecha!==siguienteDiaLaboralRD() || versionHorario(ordenId,fecha,franja,waId)!==version) throw new Error('El horario cambió: prepara el lote nuevamente.');
  tx.set(avisoRef,{ordenId,version,waId,fecha,franja,estado:'reservado',intento,actorUid:uid,creadoEn:FieldValue.serverTimestamp()});
  return {duplicado:false,waId,fecha,franja,intento,nombre:String(o.clienteNombre??'')} as const;
 });
 if (reservado.duplicado) return reservado;
 let codigo=500;let datos:Record<string,unknown>={};
 const respuesta={setHeader(){return this;},status(c:number){codigo=c;return this;},json(d:Record<string,unknown>){datos=d;return this;},end(){return this;}} as unknown as VercelResponse;
 try {
  const solicitudInterna={...req,method:'POST',body:{wa_id:reservado.waId,tipo:'plantilla',ordenId,tempId:createHash('sha256').update(`${ordenId}:${version}:${reservado.intento}`).digest('hex').slice(0,32),plantilla:{nombre:'confirmar_visita_manana_v1',idioma,variables:[reservado.nombre,reservado.fecha,reservado.franja.inicio,reservado.franja.fin],quickReplyPayloads:['aceptar','reagendar','cancelar'].map(a=>payloadRespuesta(ordenId,version,a as 'aceptar'|'reagendar'|'cancelar'))}}} as VercelRequest;
  await conEnvioHorarioInterno(solicitudInterna,()=>enviarWhatsApp(solicitudInterna,respuesta));
  const enviado=codigo<300 && (datos.estado==='sent' || datos.estadoEnvio==='sent') && typeof datos.wamid==='string';
  await db.runTransaction(async tx=>{
   const orden=await tx.get(ref);
   tx.update(avisoRef,{estado:enviado?'enviado':codigo>=500?'incierto':'fallido',wamid:datos.wamid??null,actualizadoEn:FieldValue.serverTimestamp(),codigo});
   // No confirmar un horario posterior durante el envío.
   if(enviado && orden.data()?.fechaCita?.toDate && new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(orden.data()!.fechaCita.toDate())===reservado.fecha && JSON.stringify(orden.data()?.franjaLlegada)===JSON.stringify(reservado.franja)) tx.update(ref,{horarioAvisoVersion:version});
  });
  return {enviado,estado:enviado?'enviado':codigo>=500?'incierto':'fallido',codigo};
 } catch { await avisoRef.update({estado:'incierto',actualizadoEn:FieldValue.serverTimestamp()});return {enviado:false,estado:'incierto'}; }
}
