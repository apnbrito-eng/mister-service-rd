import type {VercelRequest,VercelResponse} from '@vercel/node';
import {getAppCheck} from 'firebase-admin/app-check';
import {getAdminApp,getAdminFirestore,getAdminStorage} from '../_lib/firebaseAdmin.js';
import {ErrorCitaPublica} from '../_lib/citaPublica.js';
import {reservarSubidaPublica} from '../_lib/subidaPublica.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({ok:false});
 try{
  const token=req.headers['x-firebase-appcheck'];if(typeof token!=='string'||token.length>8192)return res.status(401).json({ok:false,error:'Recarga la página para verificar la subida.'});
  try{await getAppCheck(getAdminApp()).verifyToken(token);}catch{return res.status(401).json({ok:false,error:'Recarga la página para verificar la subida.'});}
  let p;try{p=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{throw new ErrorCitaPublica(400,'datos','Archivo inválido.');}
  if(!p||typeof p!=='object'||Buffer.byteLength(JSON.stringify(p))>4096)throw new ErrorCitaPublica(400,'datos','Archivo inválido.');
  const db=getAdminFirestore(),bucket=getAdminStorage().bucket();
  if(p.accion==='completar'){
   if(typeof p.id!=='string'||!/^[a-f0-9]{64}$/.test(p.id))throw new ErrorCitaPublica(400,'datos','Archivo inválido.');
   const ref=db.doc(`subidas_publicas_permisos/${p.id}`),r=(await ref.get()).data();
   if(!r)throw new ErrorCitaPublica(409,'permiso','La autorización del archivo venció. Selecciónalo de nuevo.');
   const url=`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(r.path)}?alt=media&token=${encodeURIComponent(r.token)}&permiso=${p.id}`;
   if(r.completo)return res.status(200).json({ok:true,url});
   let metadata;
   try { [metadata]=await bucket.file(r.path).getMetadata(); }
   catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code===404)return res.status(409).json({ok:false,codigo:'ARCHIVO_PENDIENTE',error:'La subida aún no está completa. Inténtalo de nuevo.'});throw error;}
   if(Number(metadata.size)!==r.tamano||metadata.contentType!==r.mime||metadata.metadata?.['permiso-publico']!==r.token)throw new ErrorCitaPublica(400,'archivo','El archivo recibido no coincide con el autorizado.');
   // Firebase utiliza esta clave JSON con mayúsculas exactas; el marcador de la firma XML es independiente.
   await bucket.file(r.path).setMetadata({metadata:{firebaseStorageDownloadTokens:r.token,'permiso-publico':r.token}},{ifMetagenerationMatch:Number(metadata.metageneration)});
   await ref.update({completo:true,bucket:bucket.name,generation:String(metadata.generation)});

   return res.status(200).json({ok:true,url});
  }
  const permiso=await reservarSubidaPublica(db,p);
  // Content-Length participa en la firma: el navegador lo calcula desde Blob; no se acepta un cuerpo de otro tamaño.
  const headers={'content-type':permiso.mime,'x-goog-if-generation-match':'0','x-goog-meta-permiso-publico':permiso.token};
  const [url]=await bucket.file(permiso.path).getSignedUrl({version:'v4',action:'write',expires:permiso.venceMs,contentType:permiso.mime,extensionHeaders:{...headers,'content-length':String(permiso.tamano)}});
  return res.status(200).json({ok:true,id:permiso.id,url,headers});
 }catch(error){if(error instanceof ErrorCitaPublica)return res.status(error.status).json({ok:false,error:error.message});console.error('[publico/subida] fallo inesperado',{codigo:'SUBIDA_PUBLICA_ERROR'});return res.status(503).json({ok:false,error:'No pudimos subir el archivo. Conserva tus datos e inténtalo de nuevo.'});}
}
