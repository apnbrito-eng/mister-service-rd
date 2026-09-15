import { describe, it, expect, vi, beforeEach } from 'vitest';
const state=vi.hoisted(()=>({rol:'operaria', writes: [] as unknown[], duplicate:false}));
vi.mock('../../api/_lib/accesoEquipo',()=>({ErrorAcceso:class extends Error{constructor(public status:number,m:string){super(m)}},accesoEquipo:async()=>({uid:'qa',rol:state.rol,db:{collection:(name:string)=>({doc:(id='generated')=>({path:name+'/'+id}),where:()=>({limit:()=>({get:async()=>({docs:[]})})}),orderBy:()=>({limit:()=>({get:async()=>({docs:[]})})})}),runTransaction:async(fn:Function)=>fn({get:async(r:{path:string})=>({exists:r.path.startsWith('ia_documentos')&&state.duplicate,data:()=>({total:0})}),set:(_r:unknown,d:unknown)=>state.writes.push(d),create:(_r:unknown,d:unknown)=>state.writes.push(d)})}})}));
import handler from '../../api/ai/conocimiento';
async function call(method:string, body?:unknown){let code=200;let result:any;const res={setHeader:vi.fn(),status:(s:number)=>{code=s;return res;},json:(r:unknown)=>{result=r;return res;}};await handler({method,body} as any,res as any);return{code,result};}
describe('Permisos y duplicados del conocimiento',()=>{
 beforeEach(()=>{state.rol='operaria';state.writes=[];state.duplicate=false;});
 const body={accion:'importar',nombre:'qa.xlsx',fragmentos:[{titulo:'Prueba de archivo',contenido:'Procedimiento de prueba revisable'}]};
 it('impide importar a operarias aunque envíen la solicitud directamente',async()=>{expect((await call('POST',body)).code).toBe(403);expect(state.writes).toHaveLength(0);});
 it('no expone temas frecuentes a una operaria',async()=>{expect((await call('GET')).result.frecuentes).toEqual([]);});
 it('crea fragmentos pendientes para administrador',async()=>{state.rol='administrador';expect((await call('POST',body)).code).toBe(201);expect(state.writes.some((x:any)=>x.estado==='pendiente')).toBe(true);expect(state.writes.some((x:any)=>x.estado==='aprobado')).toBe(false);});
 it('no duplica un documento existente',async()=>{state.rol='administrador';state.duplicate=true;expect((await call('POST',body)).result.duplicado).toBe(true);expect(state.writes).toHaveLength(0);});
});
