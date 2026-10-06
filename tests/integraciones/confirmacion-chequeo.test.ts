import { beforeEach, expect, it, vi } from 'vitest';
import type { OrdenServicio, Usuario } from '../../src/types';
const mock = vi.hoisted(() => ({data:{} as Record<string, unknown>, patch:vi.fn()}));
vi.mock('../../src/firebase/config', () => ({db:{}}));
vi.mock('firebase/firestore', () => ({doc:vi.fn(), Timestamp:{now:()=>new Date()}, arrayUnion:(...a:unknown[])=>a, runTransaction:async (_:unknown,f:(tx:unknown)=>Promise<void>)=>f({get:async()=>({exists:()=>true,id:'o',data:()=>mock.data}),update:(_:unknown,p:Record<string,unknown>)=>{mock.patch(p);mock.data={...mock.data,...p};}})}));
vi.mock('../../src/utils',()=>({parseOrden:(id:string,raw:Record<string,unknown>)=>({id,...raw}),crearRegistroAuditoria:(...a:unknown[])=>a}));
import { confirmarSoloChequeoCliente } from '../../src/services/confirmacionChequeo.service';
const orden=()=>({id:'o',...mock.data} as OrdenServicio);
const usuario=(rol:Usuario['rol']='operaria')=>({nombre:'Wila',rol} as Usuario);
beforeEach(()=>{mock.data={soloChequeo:true,precioChequeo:2000,chequeoConfirmacionEstado:'pendiente',operariaId:'wila',fase:'cerrado',fechaCierre:'original',descuentoChequeoPrevioId:'original'};mock.patch.mockClear();});
it('operaria confirma importe sin cambiar cierre, monto ni descuento',async()=>{
 await confirmarSoloChequeoCliente(orden(),usuario(),'wila');
 expect(mock.data).toMatchObject({chequeoConfirmacionEstado:'confirmado',chequeoConfirmadoPor:'wila',precioChequeo:2000,fase:'cerrado',fechaCierre:'original',descuentoChequeoPrevioId:'original'});
 expect(mock.patch.mock.calls[0][0]).not.toHaveProperty('precioFinal');
});
it('no acepta importe antiguo ni confirmación duplicada',async()=>{
 const stale=orden();mock.data.precioChequeo=1500;
 await expect(confirmarSoloChequeoCliente(stale,usuario(),'wila')).rejects.toThrow('importe');
 await confirmarSoloChequeoCliente(orden(),usuario(),'wila');
 await expect(confirmarSoloChequeoCliente(orden(),usuario(),'wila')).rejects.toThrow('pendiente');
});
it('rechaza técnico y oficina no asignada',async()=>{
 await expect(confirmarSoloChequeoCliente(orden(),usuario('tecnico'),'wila')).rejects.toThrow('permiso');
 await expect(confirmarSoloChequeoCliente(orden(),usuario(),'otra')).rejects.toThrow('permiso');
 expect(mock.patch).not.toHaveBeenCalled();
});
