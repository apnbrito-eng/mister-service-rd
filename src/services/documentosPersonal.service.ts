import { getAuth } from 'firebase/auth';
export type TipoDocumentoPersonal = 'foto'|'cedula'|'licencia';
async function headers(){const usuario=getAuth().currentUser;if(!usuario)throw new Error('Inicia sesión.');return {Authorization:`Bearer ${await usuario.getIdToken()}`};}
async function validarRespuesta(r:Response){if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error || 'No se pudo gestionar el documento.');}}
export async function subirDocumentoPersonal(id:string,tipo:TipoDocumentoPersonal,file:File){
 if(file.size>2*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Selecciona JPG, PNG o WebP de hasta 2 MB.');
 const base64=await new Promise<string>((resolve,reject)=>{const lector=new FileReader();lector.onload=()=>resolve(String(lector.result).split(',')[1]);lector.onerror=()=>reject(new Error('No se pudo leer el archivo.'));lector.readAsDataURL(file);});
 const r=await fetch('/api/personal/documentos',{method:'POST',headers:{...await headers(),'Content-Type':'application/json'},body:JSON.stringify({id,tipo,mime:file.type,base64})});await validarRespuesta(r);
}
export async function leerDocumentoPersonal(id:string,tipo:TipoDocumentoPersonal):Promise<Blob>{const r=await fetch(`/api/personal/documentos?id=${encodeURIComponent(id)}&tipo=${tipo}`,{headers:await headers(),cache:'no-store'});await validarRespuesta(r);const datos:unknown=await r.json();return decodificarDocumentoPersonal(datos);}

export function decodificarDocumentoPersonal(valor:unknown):Blob {
 const d=valor as {mime?:unknown;base64?:unknown}|null;
 if(!d || typeof d.mime!=='string' || !['image/jpeg','image/png','image/webp'].includes(d.mime) || typeof d.base64!=='string' || d.base64.length>Math.ceil(2*1024*1024/3)*4 || d.base64.length%4!==0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(d.base64))throw new Error('Documento privado inválido.');
 const binario=atob(d.base64);if(binario.length>2*1024*1024)throw new Error('Documento privado demasiado grande.');
 const bytes=new Uint8Array(binario.length);for(let i=0;i<binario.length;i++)bytes[i]=binario.charCodeAt(i);
 return new Blob([bytes],{type:d.mime});
}
