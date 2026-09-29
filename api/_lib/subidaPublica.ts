import { createHash, randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { ErrorCitaPublica } from './citaPublica.js';
export const MIME_PUBLICOS = ['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf'];
export interface EntradaSubida { requestId: string; destino: 'solicitud'|'agendar'|'calendario'; mime: string; tamano: number; formularioId?: string; campoId?: string }
export interface PermisoSubida { id: string; path: string; token: string; mime: string; tamano: number; venceMs: number; formularioId: string|null; campoId: string|null; destino: string; completo?: boolean }
const falla = (): never => {throw new ErrorCitaPublica(400,'archivo','El archivo no es válido. Usa una imagen compatible o PDF dentro del tamaño permitido.');};
export function validarEntradaSubida(v: unknown): EntradaSubida {
 if(!v || typeof v!=='object' || Array.isArray(v))return falla();const p=v as Record<string,unknown>;
 if(typeof p.requestId!=='string'||! /^[\w-]{20,80}$/.test(p.requestId)||!['solicitud','agendar','calendario'].includes(String(p.destino))||typeof p.mime!=='string'||!MIME_PUBLICOS.includes(p.mime)||!Number.isSafeInteger(p.tamano)||Number(p.tamano)<1)return falla();
 const max=p.destino==='solicitud'?10*1024*1024:5*1024*1024;
 if(Number(p.tamano)>=max||(p.destino!=='solicitud'&&p.mime==='application/pdf'))return falla();
 if(p.destino==='solicitud'&&(typeof p.formularioId!=='string'||! /^[\w-]{1,100}$/.test(p.formularioId)||typeof p.campoId!=='string'||! /^[\w-]{1,100}$/.test(p.campoId)))return falla();
 return {requestId:p.requestId,destino:p.destino as EntradaSubida['destino'],mime:p.mime,tamano:Number(p.tamano),...(p.destino==='solicitud'?{formularioId:p.formularioId as string,campoId:p.campoId as string}:{})};
}
export async function reservarSubidaPublica(db: Firestore, entrada: unknown, ahora=Date.now()): Promise<PermisoSubida> {
 const p=validarEntradaSubida(entrada), id=createHash('sha256').update(p.requestId).digest('hex'), huella=JSON.stringify(p), permiso=db.doc(`subidas_publicas_permisos/${id}`);
 const hora=Math.floor(ahora/3600000), cuota=db.doc(`subidas_publicas_cuotas/${hora}`);
 return db.runTransaction(async tx=>{
  const [previa,uso,config,form]=await Promise.all([tx.get(permiso),tx.get(cuota),tx.get(db.doc('subidas_publicas_config/limites')),p.formularioId?tx.get(db.doc(`formularios/${p.formularioId}`)):Promise.resolve(null)]);
  if(previa.exists){if(previa.data()?.huella!==huella||previa.data()!.venceMs<=ahora)throw new ErrorCitaPublica(409,'permiso','La autorización del archivo venció. Selecciónalo de nuevo.');return previa.data() as PermisoSubida;}
  if(p.destino==='solicitud'){const f=form?.data(),campo=[...(f?.camposEstandar??[]),...(f?.camposPersonalizados??[])].find(c=>c.id===p.campoId);if(!f||f.activo!==true||!campo||!['foto','archivo','firma'].includes(campo.tipo)||(p.mime==='application/pdf'&&campo.tipo!=='archivo'))return falla();}
  // Topes técnicos provisionales de servidor: 1000 archivos/100 MiB por hora; ninguna discriminación por IP.
  const limite=config.data()?.maxArchivosHora??1000, bytes=config.data()?.maxBytesHora??100*1024*1024,total=uso.data()?.total??0,peso=uso.data()?.bytes??0;
  if(![limite,bytes,total,peso].every(n=>Number.isSafeInteger(n)&&n>=0)||limite<1||bytes<1)throw new ErrorCitaPublica(503,'configuracion','Las subidas no están disponibles.');
  if(total>=limite||peso+p.tamano>bytes)throw new ErrorCitaPublica(429,'cuota','Se alcanzó el límite de archivos. Conserva tus datos e inténtalo más tarde.');
  const carpeta=p.destino==='solicitud'?'solicitudes-publico':p.destino==='agendar'?'fotos-equipos-publico':'citas_publicas';
  const path=p.destino==='solicitud'?`${carpeta}/${randomUUID()}/${p.campoId}/${randomUUID()}`:`${carpeta}/${randomUUID()}/${randomUUID()}`;
  const r:PermisoSubida={id,path,token:randomUUID(),mime:p.mime,tamano:p.tamano,venceMs:ahora+5*60000,formularioId:p.formularioId??null,campoId:p.campoId??null,destino:p.destino};
  tx.create(permiso,{...r,huella});tx.set(cuota,{total:total+1,bytes:peso+p.tamano,hora});return r;
 });
}
/** Confirma pertenencia y finalización; no acepta enlaces externos ni de otro campo/formulario. */
export async function validarArchivoPublico(db: Firestore,url: string, contexto?:{formularioId:string;campoId:string}) {
 let u:URL;try{u=new URL(url);}catch{return falla();}
 if(u.protocol!=='https:'||u.hostname!=='firebasestorage.googleapis.com')return falla();
 const id=u.searchParams.get('permiso');if(!id||!/^[a-f0-9]{64}$/.test(id))return falla();
 const r=(await db.doc(`subidas_publicas_permisos/${id}`).get()).data();
 if(!r||!r.completo||decodeURIComponent(u.pathname).split('/o/')[0]!==`/v0/b/${r.bucket}`||u.searchParams.get('token')!==r.token||decodeURIComponent(u.pathname).split('/o/')[1]!==r.path)return falla();
 if(contexto&&(r.formularioId!==contexto.formularioId||r.campoId!==contexto.campoId))return falla();
 if(!contexto&&r.destino==='solicitud')return falla();
}
