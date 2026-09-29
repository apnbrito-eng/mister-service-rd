import {obtenerAppCheckToken} from '../lib/appCheck';
type Destino = 'solicitud'|'agendar'|'calendario';
interface Permiso {id:string;url:string;headers:Record<string,string>}
interface Estado {requestId:string;permiso?:Permiso;url?:string;pendiente?:Promise<string>}
const subidas = new WeakMap<Blob,Map<string,Estado>>();
class ErrorSubida extends Error {constructor(mensaje:string,readonly codigo?:string){super(mensaje);}}
/** El archivo va directo a Storage. Reintentos conservan permiso y recuperan la finalización antes de repetir PUT. */
export async function subirArchivoPublicoSeguro(archivo:Blob,destino:Destino,contexto?:{formularioId:string;campoId:string}):Promise<string>{
 const clave=JSON.stringify({destino,...contexto}), mapa=subidas.get(archivo)??new Map<string,Estado>();subidas.set(archivo,mapa);
 const estado=mapa.get(clave)??{requestId:crypto.randomUUID()};mapa.set(clave,estado);
 if(estado.url)return estado.url;if(estado.pendiente)return estado.pendiente;
 const ejecutar=async()=>{
  const token=await obtenerAppCheckToken();if(!token)throw new Error('Recarga la página para verificar la subida.');
  async function llamar(body:unknown){const r=await fetch('/api/publico/subida',{method:'POST',headers:{'Content-Type':'application/json','X-Firebase-AppCheck':token!},body:JSON.stringify(body)});const data=await r.json();if(!r.ok||!data.ok)throw new ErrorSubida(data.error||'No pudimos subir el archivo.',data.codigo);return data;}
  const completar=async()=>{const data=await llamar({accion:'completar',id:estado.permiso!.id});estado.url=data.url;return data.url as string;};
  if(estado.permiso){try{return await completar();}catch(e){if(!(e instanceof ErrorSubida)||e.codigo!=='ARCHIVO_PENDIENTE')throw e;}}
  else estado.permiso=await llamar({requestId:estado.requestId,destino,mime:archivo.type,tamano:archivo.size,...contexto});
  const permiso=estado.permiso!;
  const respuesta=await fetch(permiso.url,{method:'PUT',headers:permiso.headers,body:archivo});
  if(!respuesta.ok&&respuesta.status!==412)throw new Error('No pudimos subir el archivo. Conserva tus datos e inténtalo de nuevo.');
  return completar();
 };
 estado.pendiente=ejecutar();try{return await estado.pendiente;}finally{estado.pendiente=undefined;}
}
