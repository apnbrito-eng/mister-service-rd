import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ data: new Map<string, any>(), rol: 'administrador' }));
vi.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: () => '__name__' }, FieldValue: { delete: () => '__DELETE__', serverTimestamp: () => 'NOW' } }));
vi.mock('../../api/_lib/accesoEquipo.js', () => {
  class ErrorAcceso extends Error { constructor(public status: number, message: string) { super(message); } }
  const ref = (path: string): any => ({ path, id: path.split('/').pop() });
  const snap = (path: string): any => ({ ...ref(path), ref: ref(path), exists: fake.data.has(path), data: () => fake.data.get(path) });
  const query = (path: string, field: string, value: any, cursor = '', count = 150): any => ({
    orderBy: () => query(path,field,value,cursor,count), limit: (n: number) => query(path,field,value,cursor,n), startAfter: (c: string) => query(path,field,value,c,count),
    query: () => { const docs = [...fake.data.keys()].filter(k => k.startsWith(path+'/') && fake.data.get(k)[field] === value && k.split('/').pop()! > cursor).sort().slice(0,count).map(snap); return { docs, size: docs.length }; },
  });
  const db = { collection: (path: string) => ({ doc: (id: string) => ref(path+'/'+id), where: (field: string, _op: string, value: any) => query(path,field,value) }), runTransaction: async (fn: any) => {
    let written = false; const pending: (() => void)[] = [];
    const write = (r: any,d: any,merge: boolean) => { written=true; pending.push(() => { const next=merge?{...fake.data.get(r.path),...d}:{...d}; for(const k of Object.keys(next)) if(next[k]==='__DELETE__') delete next[k]; fake.data.set(r.path,next); }); };
    const result = await fn({ get: async (r: any) => { if(written) throw Error('Read after write'); return r.query?r.query():snap(r.path); }, update: (r:any,d:any)=>write(r,d,true),set:(r:any,d:any)=>write(r,d,false),create:(r:any,d:any)=>write(r,d,false) }); pending.forEach(f=>f()); return result;
  }};
  return { ErrorAcceso, accesoEquipo: async () => ({ db, uid: 'admin', rol: fake.rol }) };
});
import handler from '../../api/crm/administrar-chat';
const phone='2025550100'; const fecha=(n:number)=>({toMillis:()=>n});
async function run(accion='eliminar', requestId='operacion-prueba-12345', confirmacion=phone) {
 let status=200,body:any;const res={setHeader(){},status(n:number){status=n;return this;},json(b:any){body=b;return this;}};
 await handler({method:'POST',body:{waId:phone,accion,requestId,confirmacion}} as any,res as any);return {status,body};
}
beforeEach(()=>{ fake.rol='administrador';fake.data.clear();fake.data.set('whatsapp_conversaciones/'+phone,{ultimaActividad:fecha(10),ultimoMensajeEntrante:{preview:'privado',timestamp:fecha(10)}});fake.data.set('whatsapp_mensajes_inbox/a',{wa_id:phone,timestampMeta:fecha(10),timestampRecibido:fecha(10),contenido:{texto:'privado'}});fake.data.set('ordenes_servicio/orden',{importe:8000});fake.data.set('crm_clientes/cliente/expediente/nota',{texto:'Conservar'}); });
describe('Administración de conversaciones',()=>{
 it('rechaza roles no administradores y confirmaciones equivocadas',async()=>{fake.rol='operaria';expect((await run()).status).toBe(403);fake.rol='administrador';expect((await run('eliminar',undefined,'otro')).status).toBe(400);expect(fake.data.get('whatsapp_mensajes_inbox/a').contenido.texto).toBe('privado');});
 it('oculta globalmente sin borrar mensajes',async()=>{expect((await run('ocultar')).body.completada).toBe(true);expect(fake.data.get('whatsapp_conversaciones/'+phone).ocultoGlobalHastaMs).toBeGreaterThan(0);expect(fake.data.get('whatsapp_mensajes_inbox/a').contenido.texto).toBe('privado');});
 it('elimina contenido, conserva deduplicación, órdenes y expediente, y permite reintentos',async()=>{expect((await run()).body.completada).toBe(false);expect((await run()).body.completada).toBe(true);expect((await run()).body.completada).toBe(true);expect(fake.data.get('whatsapp_mensajes_inbox/a').contenido).toBeUndefined();expect(fake.data.get('whatsapp_mensajes_inbox/a').eliminadoDelChat).toBe(true);expect(fake.data.get('ordenes_servicio/orden')).toEqual({importe:8000});expect(fake.data.get('crm_clientes/cliente/expediente/nota').texto).toBe('Conservar');});
 it('conserva mensajes que llegan después de iniciar la operación y chats ajenos',async()=>{await run();fake.data.set('whatsapp_mensajes_outbox/nuevo',{wa_id:phone,createdAt:fecha(Date.now()+10000),texto:'nuevo',estado:'sent'});fake.data.set('whatsapp_mensajes_outbox/otro',{wa_id:'2025550101',createdAt:fecha(10),texto:'otro',estado:'sent'});await run();expect(fake.data.get('whatsapp_mensajes_outbox/nuevo').texto).toBe('nuevo');expect(fake.data.get('whatsapp_mensajes_outbox/otro').texto).toBe('otro');});
 it('procesa más de un lote sin saltarse mensajes',async()=>{for(let i=0;i<160;i++)fake.data.set('whatsapp_mensajes_inbox/msg'+i,{wa_id:phone,timestampMeta:fecha(10),contenido:{texto:'borrar'}});for(let i=0;i<4;i++)await run();expect([...fake.data.entries()].filter(([k,v])=>k.startsWith('whatsapp_mensajes_inbox/')&&!v.eliminadoDelChat)).toHaveLength(0);});
 it('no borra mensajes en proceso de envío',async()=>{fake.data.set('whatsapp_mensajes_outbox/envio',{wa_id:phone,createdAt:fecha(10),estado:'queued',texto:'pendiente'});await run();expect((await run()).status).toBe(409);expect(fake.data.get('whatsapp_mensajes_outbox/envio').texto).toBe('pendiente');});
});
