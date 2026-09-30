import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { doc, getDoc } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';
const contexto = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('../../src/firebase/config', () => ({ get db() { return contexto.db; }, auth: { currentUser: { uid:'uid-admin' } } }));
import { prepararDuplicadosComision, resolverDuplicadosComision } from '../../src/services/conciliarDuplicadosComision.service';
const leer=async (ruta:string)=>(await getDoc(doc(como(UID.admin),ruta))).data()!;
beforeAll(async()=>{await iniciarEntorno();});afterAll(async()=>{await entorno().cleanup();});
beforeEach(async()=>{
 await resetearConPerfiles();contexto.db=como(UID.admin);
 await sembrar('personal/p',{uid:'u'});
 await sembrar('comisiones/a',{ordenId:'o',tecnicoId:'u',comisionMonto:100,estadoLiquidacion:'liquidada',liquidacionId:'n'});
 await sembrar('comisiones/b',{ordenId:'o',tecnicoId:'p',comisionMonto:100,estadoLiquidacion:'pendiente'});
 await sembrar('liquidaciones_nomina/n',{estado:'abierta',empleados:[{personalId:'p',estadoCierre:'cerrado',comisionesIds:['a']}]});
});
it('conciliación concurrente conserva liquidada y nómina exactas',async()=>{
 const original=await leer('comisiones/a'),nomina=await leer('liquidaciones_nomina/n');
 const grupo=await prepararDuplicadosComision('o','p');
 const resultados=await Promise.allSettled([resolverDuplicadosComision(grupo,'a','Evidencia original validada A'),resolverDuplicadosComision(grupo,'a','Evidencia original validada B')]);
 expect(resultados.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(await leer('comisiones/a')).toEqual(original);expect(await leer('liquidaciones_nomina/n')).toEqual(nomina);
 expect(await leer('comisiones/b')).toMatchObject({estaAnulada:true,duplicadaDe:'a'});
});
it('nómina abierta sin cierre de empleado aborta sin parcial',async()=>{
 await sembrar('liquidaciones_nomina/n',{estado:'abierta',empleados:[{personalId:'p',estadoCierre:'listo',comisionesIds:['a']}]});
 const antes=await leer('comisiones/b');
 await expect(resolverDuplicadosComision(await prepararDuplicadosComision('o','p'),'a','Evidencia insuficiente revisada')).rejects.toThrow('evidencia');
 expect(await leer('comisiones/b')).toEqual(antes);
});
it('no admite conservar pendiente ni dos registros liquidados',async()=>{
 const grupo=await prepararDuplicadosComision('o','p');
 await expect(resolverDuplicadosComision(grupo,'b','Evidencia revisada explícitamente')).rejects.toThrow('liquidada');
 await sembrar('comisiones/b',{ordenId:'o',tecnicoId:'p',comisionMonto:100,estadoLiquidacion:'liquidada',liquidacionId:'n'});
 await expect(resolverDuplicadosComision(await prepararDuplicadosComision('o','p'),'a','Evidencia revisada explícitamente')).rejects.toThrow('varias');
 expect((await leer('comisiones/a')).estaAnulada).toBeUndefined();expect((await leer('comisiones/b')).estaAnulada).toBeUndefined();
});
