import {beforeAll,afterAll,beforeEach,expect,it,vi} from 'vitest';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
const state=vi.hoisted(()=>({db:null as any,rol:'administrador'}));
vi.mock('../../api/_lib/accesoEquipo.js',()=>({accesoEquipo:async()=>({db:state.db,uid:'admin',rol:state.rol}),ErrorAcceso:class extends Error{constructor(public status:number,m:string){super(m);}}}));
import handler from '../../api/asistencia';
let app:any;
beforeAll(()=>{if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Solo emulador');app=initializeApp({projectId:'demo-mister-service-rules'},'asistencia-pruebas');state.db=getFirestore(app);});
afterAll(async()=>{await state.db.terminate();await deleteApp(app);});
beforeEach(async()=>{state.rol='administrador';for(const c of ['personal','ponches','asistencia_revisiones','asistencia_evidencias','liquidaciones_nomina','auditoria_admin']){await state.db.recursiveDelete(state.db.collection(c));}await state.db.doc('personal/p1').set({uid:'empleado',activo:true,nombre:'Prueba',rol:'ayudante'});});
async function llamada(body:any,method='POST',query:any={}){let status=200,payload:any;const res={setHeader:()=>{},status:(v:number)=>{status=v;return res;},json:(v:any)=>{payload=v;return res;}};await handler({method,body,query,headers:{}} as any,res as any);return {status,payload};}
const revision={accion:'aprobar',personalId:'p1',dia:'2026-01-02',version:0,motivo:'Ausencia confirmada por coordinación',monto:618,faltaConfirmada:true};
it('bloquea técnico y falta no confirmada; una excusa exige motivo',async()=>{
 state.rol='tecnico';expect((await llamada(revision)).status).toBe(403);state.rol='coordinadora';
 expect((await llamada({...revision,faltaConfirmada:false})).status).toBe(400);
 expect((await llamada({...revision,accion:'excusar',motivo:''})).status).toBe(400);
 expect((await llamada({...revision,accion:'excusar'})).status).toBe(200);
 expect((await state.db.doc('asistencia_revisiones/p1_2026-01-02').get()).data().monto).toBe(0);
});
it('no aprueba feriado y no cambia revisión con versión obsoleta',async()=>{
 expect((await llamada({...revision,dia:'2026-01-01'})).status).toBe(400);
 expect((await llamada(revision)).status).toBe(200);
 expect((await llamada({...revision,monto:100})).status).toBe(409);
 expect((await llamada({...revision,version:1,monto:200})).status).toBe(200);
});
it('aplica una vez, preserva préstamos/avances y bloquea nóminas cerradas',async()=>{
 await llamada(revision);
 await state.db.doc('liquidaciones_nomina/l1').set({estado:'abierta',periodoInicio:Timestamp.fromDate(new Date('2026-01-01T00:00:00-04:00')),periodoFin:Timestamp.fromDate(new Date('2026-01-14T23:59:59-04:00')),empleados:[{personalId:'p1',pagado:false,totalDevengado:8000,totalAvances:500,totalDescuentosAdHoc:100,totalCuotasPrestamos:300}]});
 expect((await llamada({accion:'aplicar',liquidacionId:'l1'})).status).toBe(200);
 expect((await llamada({accion:'aplicar',liquidacionId:'l1'})).status).toBe(200);
 const e=(await state.db.doc('liquidaciones_nomina/l1').get()).data().empleados[0];expect(e.totalAsistencia).toBe(618);expect(e.totalNeto).toBe(6482);expect(e.descuentosAsistencia).toHaveLength(1);
 await state.db.doc('liquidaciones_nomina/l1').update({estado:'cerrada'});
 expect((await llamada({accion:'aplicar',liquidacionId:'l1'})).status).toBe(409);
});

it('omite empleados cerrados, bloqueados o pagados legacy y aplica al listo sin bloqueo global', async () => {
 const empleados = [
  { personalId: 'cerrado', estadoCierre: 'cerrado', pagado: false },
  { personalId: 'bloqueado', estadoCierre: 'bloqueado', pagado: false },
  { personalId: 'pagadoLegacy', pagado: true },
  { personalId: 'listo', estadoCierre: 'listo', pagado: false },
 ].map(e => ({ ...e, totalDevengado: 100, totalAvances: 20, totalCuotasPrestamos: 30, totalDescuentosAdHoc: 10, totalNeto: 40 }));
 await state.db.doc('liquidaciones_nomina/mixta').set({ estado: 'abierta', periodoInicio: Timestamp.fromDate(new Date('2026-01-01T00:00:00-04:00')), periodoFin: Timestamp.fromDate(new Date('2026-01-14T23:59:59-04:00')), empleados });
 for (const e of empleados) await state.db.doc(`asistencia_revisiones/${e.personalId}_2026-01-02`).set({ personalId: e.personalId, dia: '2026-01-02', estado: 'aprobada', monto: 80 });
 const respuesta = await llamada({ accion: 'aplicar', liquidacionId: 'mixta' });
 expect(respuesta.status).toBe(200);
 expect(respuesta.payload).toMatchObject({ aplicadas: 1, omitidas: 3 });
 const guardados = (await state.db.doc('liquidaciones_nomina/mixta').get()).data().empleados;
 expect(guardados.slice(0, 3)).toEqual(empleados.slice(0, 3));
 expect(guardados[3]).toMatchObject({ totalAsistencia: 80, totalDescuentos: 140, totalNeto: -40 });
 expect(guardados[3].descuentosAsistencia).toHaveLength(1);
 for (const e of empleados.slice(0, 3)) expect((await state.db.doc(`asistencia_revisiones/${e.personalId}_2026-01-02`).get()).data().liquidacionId).toBeUndefined();
 expect((await state.db.doc('asistencia_revisiones/listo_2026-01-02').get()).data().liquidacionId).toBe('mixta');
 const repetida = await llamada({ accion: 'aplicar', liquidacionId: 'mixta' });
 expect(repetida.payload).toMatchObject({ aplicadas: 0, omitidas: 3 });
 expect((await state.db.doc('liquidaciones_nomina/mixta').get()).data().empleados[3].descuentosAsistencia).toHaveLength(1);
});
