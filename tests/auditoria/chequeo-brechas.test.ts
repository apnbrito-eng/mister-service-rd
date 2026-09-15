// Sonda temporal de auditoría: afirma el comportamiento esperado para reproducir brechas.
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({docs:[] as any[]}));
vi.mock('../../src/firebase/config',()=>({db:{},storage:{}}));
vi.mock('firebase/firestore',async original=>({...await original<any>(),collection:()=>({}),where:(field:string,_op:string,value:unknown)=>({field,value}),limit:(n:number)=>({limit:n}),query:(_c:unknown,...constraints:any[])=>constraints,getDocs:async(cs:any[])=>{
 let docs=m.docs.filter(d=>cs.filter(c=>c.field).every(c=>d.data()[c.field]===c.value));
 docs=docs.slice(0,cs.find(c=>c.limit)?.limit??docs.length);return{docs,empty:!docs.length};
}}));
import {buscarChequeoVigentePorCliente} from '../../src/services/ordenes.service';
import {chequeoVigente,calcularDescuentoChequeo} from '../../src/utils/descuentoChequeo';
const base={clienteId:'cliente-qa',equipoTipo:'Lavadora',tipoCierre:'solo_chequeo',precioChequeo:2000,fechaCierre:new Date('2026-09-01T12:00:00Z'),montoPagado:2000,estadoPago:'pagado',fase:'cerrado'};
const add=(id:string,data:object)=>m.docs.push({id,data:()=>({...base,...data})});
beforeEach(()=>{m.docs=[];vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));});
afterEach(()=>vi.useRealTimers());
it('descuenta 2000 de una reparación de 7000',()=>expect(calcularDescuentoChequeo(7000,2000)).toEqual({precioConDescuento:5000,descuentoAplicado:2000}));
it('una fecha futura no debe generar vigencia',()=>expect(chequeoVigente(new Date('2026-09-20T12:00:00Z'))).toBe(false));
it('un chequeo no pagado no debe otorgar el crédito pagado',async()=>{add('sin-pago',{montoPagado:0,estadoPago:'pendiente'});expect(await buscarChequeoVigentePorCliente('cliente-qa','Lavadora')).toBeNull();});
it('la reparación reactivada debe poder encontrar su chequeo histórico vigente',async()=>{add('reactivada',{tipoCierre:'reparacion_completa',reactivadaPostChequeo:true,soloChequeo:false,precioChequeo:null,cierreServicio:null,cierreChequeoHistorico:{monto:2000,fechaCierre:base.fechaCierre}});expect(await buscarChequeoVigentePorCliente('cliente-qa','Lavadora')).not.toBeNull();});
it('debe encontrar el chequeo más reciente aunque esté después del límite arbitrario',async()=>{for(let i=0;i<21;i++)add('qa-'+i,{fechaCierre:new Date(base.fechaCierre.getTime()+i*60000)});expect((await buscarChequeoVigentePorCliente('cliente-qa','Lavadora'))?.ordenId).toBe('qa-20');});
