import {beforeAll,afterAll,beforeEach,expect,it,vi} from 'vitest';
import {initializeApp,deleteApp,type App} from 'firebase-admin/app';
import {getFirestore,type Firestore} from 'firebase-admin/firestore';
const m=vi.hoisted(()=>({db:null as unknown,verificar:vi.fn(async()=>({})),policy:vi.fn(async (_options:unknown)=>['https://storage.invalid/qa']),metadata:vi.fn(async()=>[{}])}));
vi.mock('../../api/_lib/firebaseAdmin.js',()=>({getAdminApp:()=>({}),getAdminFirestore:()=>m.db,getAdminStorage:()=>({bucket:()=>({name:'bucket-qa',file:()=>({getSignedUrl:m.policy,getMetadata:m.metadata,setMetadata:async()=>[]})})})}));
vi.mock('firebase-admin/app-check',()=>({getAppCheck:()=>({verifyToken:m.verificar})}));
import handler from '../../api/publico/subida';
import {reservarSubidaPublica,validarArchivoPublico} from '../../api/_lib/subidaPublica';
let app:App,db:Firestore;
const entrada=(requestId='subida-qa-000000000001')=>({requestId,destino:'solicitud',mime:'application/pdf',tamano:9*1024*1024,formularioId:'qa',campoId:'archivo'});
beforeAll(()=>{if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Solo emulador');app=initializeApp({projectId:'demo-subida-publica'},'subida-publica');db=getFirestore(app);m.db=db;});
afterAll(async()=>{await db.terminate();await deleteApp(app);});
beforeEach(async()=>{for(const c of await db.listCollections())await db.recursiveDelete(c);await db.doc('formularios/qa').set({activo:true,camposEstandar:[],camposPersonalizados:[{id:'archivo',tipo:'archivo'},{id:'foto',tipo:'foto'}]});m.policy.mockClear();});
it('permiso idempotente y quota en bytes, path servidor, PDF9MB preservado',async()=>{
 const r=await Promise.all([reservarSubidaPublica(db,{...entrada(),path:'ruta-inyectada'}),reservarSubidaPublica(db,entrada())]);expect(r[0].path).toBe(r[1].path);expect(r[0].path).toMatch(/^solicitudes-publico\/[\w-]+\/archivo\/[\w-]+$/);
 expect((await db.collection('subidas_publicas_cuotas').get()).docs[0].data().total).toBe(1);
 await db.doc('subidas_publicas_config/limites').set({maxBytesHora:9*1024*1024});await expect(reservarSubidaPublica(db,entrada('subida-qa-000000000002'))).rejects.toThrow('límite');
});
it('rechaza SVG, PDF en foto, exceso tamaño y campo inexistente',async()=>{
 for(const cambio of [{mime:'image/svg+xml'},{tamano:10*1024*1024},{campoId:'foto'},{campoId:'inventado'},{destino:'agendar'}])await expect(reservarSubidaPublica(db,{...entrada(),...cambio})).rejects.toThrow();
});
it('firma y finalización verifican tamaño/MIME/token; URLs deben estar ligadas al campo',async()=>{
 let status=200,payload:any;const res={setHeader(){},status(n:number){status=n;return res;},json(v:unknown){payload=v;return res;}};
 const llamar=async(body:unknown)=>{status=200;await handler({method:'POST',headers:{'x-firebase-appcheck':'qa'},body}as any,res as any);return payload;};
 const p=await llamar(entrada());expect(status).toBe(200);const r=(await db.doc(`subidas_publicas_permisos/${p.id}`).get()).data()!;
 expect(m.policy.mock.calls[0][0]).toMatchObject({version:'v4',action:'write',extensionHeaders:{'content-length':String(9*1024*1024),'content-type':'application/pdf','x-goog-if-generation-match':'0'}});
 m.metadata.mockResolvedValueOnce([{size:'2',contentType:r.mime,metadata:{'permiso-publico':r.token},metageneration:'1'}]);await llamar({accion:'completar',id:p.id});expect(status).toBe(400);
 m.metadata.mockResolvedValueOnce([{size:String(r.tamano),contentType:r.mime,metadata:{'permiso-publico':r.token},metageneration:'1',generation:'1'}]);const fin=await llamar({accion:'completar',id:p.id});expect(status).toBe(200);
 await expect(validarArchivoPublico(db,fin.url,{formularioId:'qa',campoId:'archivo'})).resolves.toBeUndefined();
 await expect(validarArchivoPublico(db,fin.url,{formularioId:'qa',campoId:'foto'})).rejects.toThrow();await expect(validarArchivoPublico(db,fin.url.replace('bucket-qa','otro'),{formularioId:'qa',campoId:'archivo'})).rejects.toThrow();
});
it('HTTP real solo devuelve política tras AppCheck; body string/objeto sin subir bytes',async()=>{
 const {createServer}=await import('node:http');let objeto=false;
 const server=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;const rr={setHeader(k:string,v:string){res.setHeader(k,v);},status(n:number){res.statusCode=n;return rr;},json(v:unknown){res.end(JSON.stringify(v));return rr;}};await handler({method:req.method,headers:req.headers,body:objeto?JSON.parse(body):body}as any,rr as any);});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{const url=`http://127.0.0.1:${(server.address()as{port:number}).port}`;expect((await fetch(url,{method:'POST',body:JSON.stringify(entrada())})).status).toBe(401);for(const modo of [true,false]){objeto=modo;expect((await fetch(url,{method:'POST',headers:{'X-Firebase-AppCheck':'qa'},body:JSON.stringify(entrada())})).status).toBe(200);}}finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
