import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { leerRespuestaCita, versionHorario } from './loteHorarios.js';
/** Invocar solo tras validación HMAC/deduplicación webhook. Registra solicitudes; no cancela órdenes ni promete una nueva cita. */
export async function registrarRespuestaHorario(db: Firestore, payload: string, waId: string, wamid: string) {
 const respuesta = leerRespuestaCita(payload);
 if (!respuesta || !/^\d{10,15}$/.test(waId) || !wamid) return { procesado:false, motivo:'respuesta_invalida' };
 const eventoId = Buffer.from(wamid).toString('base64url');
 return db.runTransaction(async tx => {
  const citaRef=db.doc(`ordenes_servicio/${respuesta.ordenId}`);
  const avisoRef=db.doc(`citas_horarios_envios/${respuesta.ordenId}_${respuesta.version}`);
  const eventoRef=db.doc(`citas_horarios_respuestas/${eventoId}`);
  const [cita,aviso,evento]=await Promise.all([tx.get(citaRef),tx.get(avisoRef),tx.get(eventoRef)]);
  if (evento.exists) return {procesado:false,motivo:'duplicado'};
  const envio=aviso.data(); let versionActual=null;try {const o=cita.data();const fecha=o?.fechaCita?.toDate ? new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(o.fechaCita.toDate()) : '';const t=String(o?.clienteTelefono??'').replace(/\D/g,'');versionActual=versionHorario(respuesta.ordenId,fecha,o?.franjaLlegada,t.length===10?`1${t}`:t);}catch { /* Franjas incompletas no confirman. */ }
  // El registro debe ser creado en servidor por la futura cola; jamás confiar en payload sin mensaje vinculado.
  if (!cita.exists || cita.data()?.eliminado===true || versionActual!==respuesta.version || !aviso.exists || envio?.waId!==waId || envio?.estado!=='enviado' || cita.data()?.horarioAvisoVersion!==respuesta.version || ['cerrado','cancelado'].includes(cita.data()?.fase)) return {procesado:false,motivo:'horario_obsoleto_o_no_enviado'};
  if (cita.data()?.respuestaHorario?.version===respuesta.version) {
    tx.create(eventoRef,{...respuesta,waId,wamid,estado:'cambio_solicitado',fecha:FieldValue.serverTimestamp(),actorTipo:'cliente',motivo:'ya_existe_respuesta_para_version'});
    return {procesado:false,motivo:'requiere_revision_humana',ordenId:respuesta.ordenId};
  }
  const responsables = respuesta.accion==='aceptar' ? [] : [...new Set([cita.data()?.operariaId,cita.data()?.responsableId].filter((v):v is string=>typeof v==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(v)))];
  const perfiles = await Promise.all(responsables.map(userId=>tx.get(db.doc(`usuarios/${userId}`))));
  const estado = respuesta.accion === 'aceptar' ? 'confirmada' : respuesta.accion === 'reagendar' ? 'reagendamiento_solicitado' : 'cancelacion_solicitada';
  tx.update(citaRef,{ respuestaHorario:{version:respuesta.version,estado,fecha:FieldValue.serverTimestamp()}, ...(respuesta.accion!=='aceptar'?{solicitudHorario:{version:respuesta.version,tipo:respuesta.accion,estado:'pendiente',responsables,waId,wamid,creadaEn:FieldValue.serverTimestamp()}}:{}) });
  for (let i=0;i<responsables.length;i++){const perfil=perfiles[i].data();if(!perfil || perfil.activo===false || perfil.eliminado===true || !['administrador','coordinadora','secretaria','operaria'].includes(perfil.rol))continue;tx.create(db.doc(`notificaciones/horario_${createHash('sha256').update(`${wamid}:${responsables[i]}`).digest('hex')}`),{userId:responsables[i],tipo:'recordatorio',ordenId:respuesta.ordenId,conversacionId:waId,titulo:respuesta.accion==='reagendar'?'Cliente solicita reagendar':'Cliente solicita cancelar cita',mensaje:`${String(cita.data()?.clienteNombre || 'Cliente')} · revise la conversación y acuerde el siguiente paso.`,leida:false,createdAt:FieldValue.serverTimestamp()});}
  tx.create(eventoRef,{...respuesta,waId,wamid,estado,fecha:FieldValue.serverTimestamp(),actorTipo:'cliente'});
  return {procesado:true,estado,ordenId:respuesta.ordenId,requiereOperaria:respuesta.accion!=='aceptar'};
 });
}
