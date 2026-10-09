import type { VercelRequest,VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { accesoEquipo,ErrorAcceso } from '../_lib/accesoEquipo.js';
import { getAdminStorage } from '../_lib/firebaseAdmin.js';
import { puedeDocumentosPersonal,validarImagenPersonal,validarTipoDocumento } from '../_lib/documentosPersonal.js';

export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','POST'].includes(req.method||''))return res.status(405).json({error:'Método no permitido.'});
 try{
  const {db,uid}=await accesoEquipo(req);
  const perfil=(await db.doc(`usuarios/${uid}`).get()).data();
  if(!perfil || !puedeDocumentosPersonal(perfil))throw new ErrorAcceso(403,'No tienes permiso para documentos privados de personal.');
  let body:Record<string,unknown>={};
  if(req.method==='POST'){try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!body || typeof body!=='object')throw new Error();}catch{throw new ErrorAcceso(400,'Datos inválidos.');}}
  const id=req.method==='GET'?req.query.id:body.id;
  if(typeof id!=='string' || !/^[\w-]{1,128}$/.test(id))throw new ErrorAcceso(400,'Empleado inválido.');
  const tipo=validarTipoDocumento(req.method==='GET'?req.query.tipo:body.tipo);
  if(!(await db.doc(`personal/${id}`).get()).exists)throw new ErrorAcceso(404,'Empleado no encontrado.');
  const privadoRef=db.doc(`personal_privado/${id}`);
  const bucket=getAdminStorage().bucket();
  if(req.method==='GET'){
   const dato=(await privadoRef.get()).data()?.documentos?.[tipo];
   if(!dato || typeof dato.storagePath!=='string' || !new RegExp(`^crm-private/personal/${id}/[a-f0-9-]{36}$`).test(dato.storagePath))throw new ErrorAcceso(404,'Documento no disponible.');
   const file=bucket.file(dato.storagePath);const [metadata]=await file.getMetadata();
   if(!['image/jpeg','image/png','image/webp'].includes(String(metadata.contentType)) || Number(metadata.size)>2*1024*1024)throw new ErrorAcceso(409,'Documento inválido.');
   const [bytes]=await file.download();
   await db.collection('auditoria_admin').add({accion:'lectura_documento_personal_privado',actorUid:uid,personalId:id,tipo,fecha:FieldValue.serverTimestamp()});
   return res.status(200).json({mime:String(metadata.contentType),base64:bytes.toString('base64')});
  }
  const bytes=validarImagenPersonal(body.base64,body.mime);
  const storagePath=`crm-private/personal/${id}/${randomUUID()}`;const file=bucket.file(storagePath);
  await file.save(bytes,{resumable:false,metadata:{contentType:String(body.mime),cacheControl:'private, no-store'}});
  try{
   await db.runTransaction(async tx=>{
    const [anterior,empleado]=await Promise.all([tx.get(privadoRef),tx.get(db.doc(`personal/${id}`))]);
    if(!empleado.exists)throw new ErrorAcceso(404,'Empleado no encontrado.');
    tx.set(privadoRef,{documentos:{...(anterior.data()?.documentos||{}),[tipo]:{storagePath,mime:body.mime,size:bytes.length,actualizadoPor:uid,actualizadoEn:FieldValue.serverTimestamp()}}},{merge:true});
    tx.create(db.collection('auditoria_admin').doc(),{accion:'documento_personal_privado',actorUid:uid,personalId:id,tipo,fecha:FieldValue.serverTimestamp()});
   });
  }catch(e){await file.delete().catch(()=>undefined);throw e;}
  return res.json({ok:true,tipo});
 }catch(e){return res.status(e instanceof ErrorAcceso?e.status:e instanceof Error && /Imagen|imagen|Tipo de documento|Usa únicamente/.test(e.message)?400:500).json({error:e instanceof ErrorAcceso || e instanceof Error && /Imagen|imagen|Tipo de documento|Usa únicamente/.test(e.message)?e.message:'No se pudo gestionar el documento privado.'});}
}
