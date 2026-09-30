import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ docs: {} as Record<string, any>, n: 0, antes: null as null | (() => void) }));
vi.mock('../../src/firebase/config', () => ({db:{},auth:{currentUser:{uid:'admin'}}}));
vi.mock('firebase/firestore', () => ({
 collection: (_:unknown,c:string)=>c,
 doc: (a:unknown,b?:string,c?:string)=> { const path=c ? `${b}/${c}` : `${a}/n${++m.n}`; return {path,id:path.split('/')[1]}; },
 Timestamp:{now:()=> 'hora'}, deleteField:()=> '__delete', arrayUnion:(x:unknown)=>[x],
 runTransaction:async (_:unknown, fn:any)=> {
  m.antes?.(); m.antes=null;
  const writes:any[]=[];
  const result=await fn({get:async(r:any)=>({exists:()=>!!m.docs[r.path],data:()=>m.docs[r.path]}),set:(r:any,d:any)=>writes.push([r.path,d]),update:(r:any,d:any)=>writes.push([r.path,d]),delete:(r:any)=>writes.push([r.path,null])});
  for(const [r,d] of writes){if(d===null){delete m.docs[r];continue;} m.docs[r]={...m.docs[r],...d}; for(const k of Object.keys(m.docs[r])) if(m.docs[r][k]==='__delete') delete m.docs[r][k];}
  return result;
 }
}));
import {guardarCotizacionVinculada,desvincularCotizacion} from '../../src/services/vinculoCotizacion.service';
beforeEach(()=>{m.docs={'ordenes_servicio/o':{cotizacionId:'a'},'cotizaciones/a':{ordenId:'o',estado:'aceptada'}};m.n=0;m.antes=null;});
it('nuevo borrador no sustituye cotización aceptada',async()=>{
 await expect(guardarCotizacionVinculada({ordenId:'o',estado:'borrador'})).rejects.toThrow('otra cotización');
 expect(m.docs['ordenes_servicio/o'].cotizacionId).toBe('a');expect(Object.keys(m.docs)).toHaveLength(2);
});
it('rechazo y desvinculación explícita liberan orden con auditoría',async()=>{
 await guardarCotizacionVinculada({estado:'rechazada'},'a');
 await desvincularCotizacion('a','Cliente decide solo chequeo');
 expect(m.docs['ordenes_servicio/o'].cotizacionId).toBeUndefined();expect(m.docs['cotizaciones/a'].ordenId).toBeUndefined();
 expect(m.docs['ordenes_servicio/o'].auditoriaCotizaciones[0]).toMatchObject({usuarioId:'admin',motivo:'Cliente decide solo chequeo'});
});
it('orden emitida al ejecutar transacción bloquea modificación y desvinculación',async()=>{
 m.antes=()=>{m.docs['ordenes_servicio/o'].facturada=true;};
 await expect(guardarCotizacionVinculada({estado:'rechazada'},'a')).rejects.toThrow('emitida');
 await expect(desvincularCotizacion('a','test')).rejects.toThrow('emitida');
 expect(m.docs['cotizaciones/a'].estado).toBe('aceptada');
});
it('eliminar limpia los dos extremos y convertida nunca se elimina',async()=>{
 await desvincularCotizacion('a','Eliminar',true);expect(m.docs['cotizaciones/a']).toBeUndefined();expect(m.docs['ordenes_servicio/o'].cotizacionId).toBeUndefined();
 m.docs['cotizaciones/b']={convertida:true};await expect(desvincularCotizacion('b','Eliminar',true)).rejects.toThrow('emitido');expect(m.docs['cotizaciones/b']).toBeDefined();
});
it('formulario obsoleto no restaura vínculo retirado por otro usuario',async()=>{
 const ordenIdAlAbrir='o';
 await desvincularCotizacion('a','Otro usuario libera orden');
 await expect(guardarCotizacionVinculada({ordenId:'o',notas:'Edición antigua'},'a',ordenIdAlAbrir)).rejects.toThrow('Recarga');
 await expect(guardarCotizacionVinculada({notas:'Edición sin ordenId'},'a',ordenIdAlAbrir)).rejects.toThrow('Recarga');
 expect(m.docs['cotizaciones/a'].ordenId).toBeUndefined();expect(m.docs['ordenes_servicio/o'].cotizacionId).toBeUndefined();
 expect(m.docs['cotizaciones/a'].notas).toBeUndefined();
});
