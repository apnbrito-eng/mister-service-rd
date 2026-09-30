import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { doc, getDoc } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';
const contexto=vi.hoisted(()=>({db:undefined as unknown,uid:'uid-admin'}));
vi.mock('../../src/firebase/config',()=>({get db(){return contexto.db;},auth:{get currentUser(){return {uid:contexto.uid};}}}));
import {guardarCotizacionVinculada,desvincularCotizacion} from '../../src/services/vinculoCotizacion.service';
const leer=async(r:string)=>(await getDoc(doc(como(UID.admin),r))).data();
beforeAll(async()=>{await iniciarEntorno();});afterAll(async()=>{await entorno().cleanup();});
beforeEach(async()=>{await resetearConPerfiles();contexto.db=como(UID.admin);contexto.uid=UID.admin;});
it('borrador B no sobreescribe aceptada A',async()=>{
 await sembrar('ordenes_servicio/o',{cotizacionId:'a'});await sembrar('cotizaciones/a',{ordenId:'o',estado:'aceptada'});
 await expect(guardarCotizacionVinculada({ordenId:'o',estado:'borrador'})).rejects.toThrow('otra cotización');expect((await leer('ordenes_servicio/o'))?.cotizacionId).toBe('a');
});
it('dos creaciones concurrentes solo vinculan una cotización',async()=>{
 await sembrar('ordenes_servicio/o',{});
 const r=await Promise.allSettled([guardarCotizacionVinculada({ordenId:'o',estado:'borrador'}),guardarCotizacionVinculada({ordenId:'o',estado:'borrador'})]);
 expect(r.filter(x=>x.status==='fulfilled')).toHaveLength(1);
 const id=(await leer('ordenes_servicio/o'))?.cotizacionId;expect((await leer(`cotizaciones/${id}`))?.ordenId).toBe('o');
});
it('rechazo seguido de desvinculación conserva motivo y permite solo chequeo',async()=>{
 await sembrar('ordenes_servicio/o',{cotizacionId:'a'});await sembrar('cotizaciones/a',{ordenId:'o',estado:'aceptada'});
 await guardarCotizacionVinculada({estado:'rechazada'},'a');await desvincularCotizacion('a','Cliente decide solo chequeo');
 expect((await leer('ordenes_servicio/o'))?.cotizacionId).toBeUndefined();expect((await leer('cotizaciones/a'))?.ordenId).toBeUndefined();
 expect((await leer('ordenes_servicio/o'))?.auditoriaCotizaciones[0].usuarioId).toBe(UID.admin);
});
it('orden emitida y cotización convertida nunca se desvinculan ni eliminan',async()=>{
 await sembrar('ordenes_servicio/o',{cotizacionId:'a',facturada:true});await sembrar('cotizaciones/a',{ordenId:'o',convertida:true});
 await expect(desvincularCotizacion('a','Eliminar',true)).rejects.toThrow('emitido');expect(await leer('cotizaciones/a')).toBeDefined();
});
