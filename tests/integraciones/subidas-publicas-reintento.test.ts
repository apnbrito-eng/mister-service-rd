import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../../src/lib/appCheck',()=>({obtenerAppCheckToken:async()=>'qa-token'}));
import {subirArchivoPublicoSeguro} from '../../src/services/subidasPublicas.service';
afterEach(()=>vi.unstubAllGlobals());
const respuesta=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
it('respuesta PUT perdida recupera completar con mismo permiso sin segundo PUT',async()=>{
 const peticiones: {url:string;body?:string}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{peticiones.push({url,body:typeof options.body==='string'?options.body:undefined});
 if(url==='https://upload.invalid'){throw new Error('Conexión interrumpida después de subir');}
 const body=JSON.parse(String(options.body));if(body.accion==='completar')return respuesta({ok:true,url:'https://download.invalid'});
 return respuesta({ok:true,id:'qa',url:'https://upload.invalid',headers:{'content-type':'image/png','x-goog-if-generation-match':'0'}});
 }));
 const archivo=new Blob(['qa'],{type:'image/png'});
 await expect(subirArchivoPublicoSeguro(archivo,'agendar')).rejects.toThrow('interrumpida');
 expect(await subirArchivoPublicoSeguro(archivo,'agendar')).toBe('https://download.invalid');
 expect(peticiones.filter(p=>p.url==='https://upload.invalid')).toHaveLength(1);
 expect(peticiones.filter(p=>p.body&&!JSON.parse(p.body).accion)).toHaveLength(1);
});
it('doble toque comparte promesa; headers nunca incluyen Content-Length manual',async()=>{
 const f=vi.fn(async(url:string,options:RequestInit)=>{if(url==='https://upload.invalid'){expect(options.headers).not.toHaveProperty('content-length');return new Response('',{status:200});}const p=JSON.parse(String(options.body));return respuesta(p.accion?{ok:true,url:'https://download.invalid'}:{ok:true,id:'qa',url:'https://upload.invalid',headers:{'content-type':'image/png'}});});vi.stubGlobal('fetch',f);
 const archivo=new Blob(['qa'],{type:'image/png'});await Promise.all([subirArchivoPublicoSeguro(archivo,'agendar'),subirArchivoPublicoSeguro(archivo,'agendar')]);expect(f).toHaveBeenCalledTimes(3);
});
