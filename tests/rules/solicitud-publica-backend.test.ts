import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
const m = vi.hoisted(() => ({db: null as unknown, verificar: vi.fn(async () => ({}))}));
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({getAdminApp: () => ({}), getAdminFirestore: () => m.db}));
vi.mock('firebase-admin/app-check', () => ({getAppCheck: () => ({verifyToken: m.verificar})}));
import handler from '../../api/publico/solicitud';
import { registrarSolicitudPublica } from '../../api/_lib/solicitudPublica';
let app: App, db: Firestore;
const entrada = (id = 'peticion-qa-00000000001') => ({formularioId: 'qa', requestId: id, datos: {nombre: 'Cliente QA', telefono: '8090000000', gps: {lat: 18, lng: -69}, opciones: ['B'], acepta: false}, archivos: []});
beforeAll(() => {if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Solo emulador'); app = initializeApp({projectId: 'demo-solicitud-publica'}, 'solicitud-publica'); db = getFirestore(app); m.db = db;});
afterAll(async () => {await db.terminate(); await deleteApp(app);});
beforeEach(async () => {
 for (const c of await db.listCollections()) await db.recursiveDelete(c);
 await db.doc('formularios/qa').set({activo: true, nombre: 'Formulario QA', empresaId: 'empresa', empresaNombre: 'Empresa QA', camposEstandar: [{id:'nombre', tipo:'texto', requerido:true}, {id:'telefono',tipo:'telefono',requerido:true}], camposPersonalizados:[{id:'gps',tipo:'ubicacion'}, {id:'opciones',tipo:'seleccion_multiple',opciones:['A','B']}, {id:'acepta',tipo:'checkbox'}]});
 m.verificar.mockReset().mockResolvedValue({});
});
it('concurrencia idempotente preserva datos dinámicos y metadatos del servidor', async () => {
 const r = await Promise.all(Array.from({length:5}, () => registrarSolicitudPublica(db, {...entrada(), empresaNombre:'fraude', estado:'aprobada'})));
 expect(r.every(v => v.ok)).toBe(true); const docs = await db.collection('solicitudes_servicio').get(); expect(docs.size).toBe(1);
 expect(docs.docs[0].data()).toMatchObject({estado:'pendiente', empresaNombre:'Empresa QA', ubicacion:{lat:18,lng:-69}, datos:{acepta:false,opciones:['B']}});
 await expect(registrarSolicitudPublica(db, {...entrada(),datos:{...entrada().datos,nombre:'otro'}})).rejects.toThrow('cambiaron');
});
it('rechaza campos inexistentes, tipos, GPS y opciones inválidas; formulario inactivo', async () => {
 for (const datos of [{...entrada().datos,otro:'inyectado'}, {...entrada().datos,gps:{lat:100,lng:0}}, {...entrada().datos,opciones:['intruso']}, {...entrada().datos,acepta:'si'}, {...entrada().datos,nombre:''}]) await expect(registrarSolicitudPublica(db,{...entrada(),datos})).rejects.toThrow();
 await db.doc('formularios/qa').update({activo:false}); await expect(registrarSolicitudPublica(db,entrada())).rejects.toThrow('disponible');
 expect((await db.collection('solicitudes_servicio').get()).size).toBe(0);
});
it('cupo servidor atómico sin depender de IP', async () => {
 await db.doc('solicitudes_publicas_config/limites').set({maxSolicitudesHora:1});
 const r = await Promise.all([registrarSolicitudPublica(db,entrada()),registrarSolicitudPublica(db,entrada('peticion-qa-00000000002'))]); expect(r.filter(v=>v.ok)).toHaveLength(1);
 expect((await db.collection('solicitudes_publicas_alertas').get()).size).toBe(1);
});
it('HTTP local verifica AppCheck y cuerpos string y objeto, sin servicios reales', async () => {
 const {createServer} = await import('node:http'); let objeto = false;
 const servidor = createServer(async (req,res) => {let body='';for await(const chunk of req)body+=chunk; const respuesta={setHeader(k:string,v:string){res.setHeader(k,v);},status(n:number){res.statusCode=n;return respuesta;},json(v:unknown){res.end(JSON.stringify(v));return respuesta;}};await handler({method:req.method,headers:req.headers,body:objeto?JSON.parse(body):body} as any,respuesta as any);});
 await new Promise<void>(r=>servidor.listen(0,'127.0.0.1',r));
 try {const url=`http://127.0.0.1:${(servidor.address() as {port:number}).port}`;expect((await fetch(url,{method:'POST',body:JSON.stringify(entrada())})).status).toBe(401);
 for (const modo of [false,true]){objeto=modo; const r=await fetch(url,{method:'POST',headers:{'X-Firebase-AppCheck':'qa'},body:JSON.stringify(entrada())});expect(r.status).toBe(200);expect(await r.json()).toMatchObject({ok:true});}
 expect((await db.collection('solicitudes_servicio').get()).size).toBe(1);
 } finally {await new Promise<void>((resolve,reject)=>servidor.close(e=>e?reject(e):resolve()));}
});
