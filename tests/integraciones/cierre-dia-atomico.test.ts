import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ docs: {} as Record<string, Record<string, unknown>>, fallo: false, cola: Promise.resolve() }));
vi.mock('../../src/firebase/config', () => ({ db: {}, auth: { currentUser: { uid: 'qa-uid' } } }));
vi.mock('firebase/firestore', async original => ({ ...await original<typeof import('firebase/firestore')>(),
 doc: (_: unknown,c: string,id: string) => `${c}/${id}`, collection: (_: unknown,c: string) => c, query: (c: string) => c,
 getDocs: async (c: string) => { const docs = Object.entries(m.docs).filter(([k]) => k.startsWith(c+'/')).map(([k,v]) => ({id:k.split('/')[1],ref:k,data:()=>v})); return { docs, size: docs.length }; },
 runTransaction: async (_: unknown, fn: (t: unknown) => Promise<unknown>) => {
 const run = m.cola.then(async () => { const writes: [string,Record<string,unknown>][]=[];
 const result=await fn({ get: async (r:string)=>({id:r.split('/')[1],exists:()=>r==='usuarios/qa-uid'||!!m.docs[r],data:()=>r==='usuarios/qa-uid'?{rol:'administrador'}:m.docs[r]}),set:(r:string,d:Record<string,unknown>)=>writes.push([r,d]),update:(r:string,d:Record<string,unknown>)=>writes.push([r,d]) });
 if(m.fallo) throw new Error('fallo simulado');
 writes.forEach(([r,d])=>{m.docs[r]={...m.docs[r],...d};}); return result; });
 m.cola=run.then(()=>undefined,()=>undefined); return run;
 },
}));
vi.mock('../../api/_lib/accesoEquipo.js', () => {
 class ErrorAcceso extends Error { constructor(public status: number, message: string) { super(message); } }
 const ref = (path: string) => ({ path, id: path.split('/').pop()! });
 const db = { doc: ref, collection: (path: string) => ({ doc: () => ref(`${path}/audit-${Object.keys(m.docs).length}`) }), runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
  const writes: [string, Record<string, unknown>][]=[];
  const result=await fn({get:async (r:{path:string;id:string})=>({ref:r,id:r.id,exists:r.path==='usuarios/qa-uid'||!!m.docs[r.path],data:()=>r.path==='usuarios/qa-uid'?{rol:'administrador',nombre:'QA'}:m.docs[r.path]}),update:(r:{path:string},d:Record<string,unknown>)=>writes.push([r.path,d]),create:(r:{path:string},d:Record<string,unknown>)=>writes.push([r.path,d])});
  if(m.fallo)throw new Error('fallo simulado');
  writes.forEach(([r,d])=>{m.docs[r]={...m.docs[r],...d};});return result;
 }};
 return { ErrorAcceso, accesoEquipo:async()=>({db,uid:'qa-uid'}) };
});
vi.mock('../../src/services/equipoApi',()=>({equipoApi:async(_url:string,body:object)=>{
 const {default:handler}=await import('../../api/ordenes/efectivo');let status=200;let result:Record<string,unknown>={};
 const response={setHeader(){},status(s:number){status=s;return response;},json(r:Record<string,unknown>){result=r;return response;}};
 await handler({method:'POST',body} as import('@vercel/node').VercelRequest,response as unknown as import('@vercel/node').VercelResponse);
 if(status>=400)throw new Error(String(result.error));return result;
}}));
import { proyectarCobrosCaja } from '../../src/utils/movimientosCobros';
import { cerrarDiaAtomico, entregarEfectivoOrdenes } from '../../src/services/cierreDia.service';
beforeEach(()=>{ m.docs={};m.fallo=false;m.cola=Promise.resolve(); });
it('dos cierres conservan un único documento y primer total',async()=>{
 const resultados=await Promise.all([cerrarDiaAtomico('2026-09-29',{totalIngresos:30}),cerrarDiaAtomico('2026-09-29',{totalIngresos:90})]);
 expect(Object.keys(m.docs)).toEqual(['cierres_dia/2026-09-29']); expect(resultados[0]).toMatchObject({creado:true,totalIngresos:30}); expect(resultados[1]).toMatchObject({creado:false,totalIngresos:30});
});
it('adopta cierre histórico sin copiar importes',async()=>{m.docs['cierres_dia/legacy']={totalIngresos:50};expect(await cerrarDiaAtomico('2026-09-29',{})).toMatchObject({id:'legacy',creado:false,totalIngresos:50});expect(Object.keys(m.docs)).toHaveLength(1);});
it('varios legacy requieren conciliación',async()=>{m.docs={'cierres_dia/a':{},'cierres_dia/b':{}};await expect(cerrarDiaAtomico('2026-09-29',{})).rejects.toThrow('varios');});
const raw = () => ({ pagos: [{id:'p1', monto:50,fecha:'2026-09-29',metodo:'efectivo',verificado:true}] });
const movimientos = () => proyectarCobrosCaja(Object.entries(m.docs).map(([k,datos])=>({id:k.split('/')[1],datos}))).movimientos;
it('fallo de entrega no cambia ninguna orden',async()=>{m.docs={'ordenes_servicio/a':raw(),'ordenes_servicio/b':raw()};const antes=structuredClone(m.docs);m.fallo=true;await expect(entregarEfectivoOrdenes(movimientos(),{uid:'qa-uid',nombre:'QA'})).rejects.toThrow('fallo');expect(m.docs).toEqual(antes);});
it('pago posterior no hereda entrega',async()=>{m.docs={'ordenes_servicio/a':raw()};await entregarEfectivoOrdenes(movimientos(),{uid:'qa-uid',nombre:'QA'});const pagos=m.docs['ordenes_servicio/a'].pagos as Record<string,unknown>[];pagos.push({...pagos[0],id:'p2'});expect(m.docs['ordenes_servicio/a'].efectivoEntregas).not.toHaveProperty('p2');await entregarEfectivoOrdenes(movimientos(),{uid:'qa-uid',nombre:'QA'});expect(m.docs['ordenes_servicio/a'].efectivoEntregas).toHaveProperty('p2');});
it('snapshot modificado y legacy bloquean',async()=>{m.docs={'ordenes_servicio/a':raw()};const antes=movimientos();(m.docs['ordenes_servicio/a'].pagos as Record<string,unknown>[])[0].monto=60;await expect(entregarEfectivoOrdenes(antes,{uid:'qa-uid',nombre:'QA'})).rejects.toThrow('cambió');m.docs['ordenes_servicio/a'].efectivoEntregado=true;await expect(entregarEfectivoOrdenes(movimientos(),{uid:'qa-uid',nombre:'QA'})).rejects.toThrow('histórica');});

it('exige UID autenticado en entrega',async()=>{await expect(entregarEfectivoOrdenes([],{uid:'otro',nombre:'QA'})).rejects.toThrow('sesión');});
it('conserva dos cuentas del mismo banco',async()=>{
 const { resumirTransferencias } = await import('../../src/services/cierreDia.service');
 m.docs={'ordenes_servicio/a':{pagos:[{id:'a',monto:100,fecha:'2026-09-29',metodo:'transferencia',verificado:true,bancoId:'cuenta1',bancoNombre:'Popular'},{id:'b',monto:200,fecha:'2026-09-29',metodo:'transferencia',verificado:true,bancoId:'cuenta2',bancoNombre:'Popular'}]}};
 const resumen=resumirTransferencias(movimientos());
 await cerrarDiaAtomico('2026-09-29',{transferenciasPorBanco:resumen});
 expect(resumen.cuenta1.monto).toBe(100);expect(resumen.cuenta2.monto).toBe(200);
 expect(m.docs['cierres_dia/2026-09-29'].transferenciasPorBanco).toEqual(resumen);
});
