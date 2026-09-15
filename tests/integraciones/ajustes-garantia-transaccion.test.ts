import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({ comision:{} as Record<string,any>, orden:{} as Record<string,any>, writes:[] as any[], cantidad:1 }));
vi.mock('../../src/firebase/config',()=>({db:{}}));
vi.mock('firebase/firestore',async importOriginal=>({
 ...await importOriginal<any>(),
 collection:(_db:unknown,name:string)=>({name}),
 doc:(...args:any[])=>({name:args.length===1?args[0].name:args[1],id:args[2] || 'audit'}),
 query:(...args:any[])=>args, where:(...args:any[])=>args,
 getDocs:async()=>({empty:m.cantidad===0,docs:Array.from({length:m.cantidad},(_,i)=>({id:'c'+i}))}),
 runTransaction:async(_db:unknown,fn:Function)=>{
  const pending:any[]=[];
  const result=await fn({get:async(ref:any)=>({data:()=>ref.name==='comisiones'?m.comision:m.orden}),
    update:(ref:any,data:any)=>pending.push({ref,data}),set:(ref:any,data:any)=>pending.push({ref,data})});
  m.writes.push(...pending); return result;
 },
}));
import { aplicarDescuentoGarantiaPorPiezas as aplicar } from '../../src/utils/comisiones';
const args={ordenGarantiaId:'g1',ordenOriginalId:'o1',tecnicoOriginalUid:'t1',costoPiezasReReparacion:1000,solicitanteUid:'admin'};
beforeEach(()=>{
 m.comision={ordenId:'o1',tecnicoId:'t1',estadoLiquidacion:'pendiente',comisionMonto:1500};
 m.orden={esGarantia:true,referenciaOrdenId:'o1',tecnicoOriginalUid:'t1',cierreServicio:{fechaCierre:new Date(),piezasValidadasPorAdmin:true,piezasUsadas:[{cantidad:2,costoUnitario:500}]}};
 m.writes=[];m.cantidad=1;
});
describe('Aplicación administrativa de garantía',()=>{
 it('guarda descuento y auditoría juntos',async()=>{
  expect(await aplicar(args)).toMatchObject({aplicado:true,monto:-100});
  expect(m.writes).toHaveLength(2); expect(m.writes[0].data.descuentoPorGarantia.monto).toBe(-100);
  expect(m.writes[1].ref.name).toBe('auditoria_admin');
 });
 it('un reintento no duplica el descuento ni la auditoría',async()=>{
  await aplicar(args);m.comision={...m.comision,...m.writes[0].data};m.writes=[];
  expect(await aplicar(args)).toMatchObject({aplicado:true});expect(m.writes).toHaveLength(0);
 });
 it('no elige arbitrariamente entre varias comisiones',async()=>{
  m.cantidad=2; expect(await aplicar(args)).toMatchObject({aplicado:false});expect(m.writes).toHaveLength(0);
 });
 it('rechaza costo cambiado tras la vista previa',async()=>{
  m.orden.cierreServicio.piezasUsadas[0].costoUnitario=600;
  expect(await aplicar(args)).toMatchObject({aplicado:false,razon:expect.stringContaining('cambió')});expect(m.writes).toHaveLength(0);
 });
 it('exige validación de piezas',async()=>{
  m.orden.cierreServicio.piezasValidadasPorAdmin=false;
  expect(await aplicar(args)).toMatchObject({aplicado:false});expect(m.writes).toHaveLength(0);
 });
 it('no aplica si cambió el técnico original',async()=>{
  m.orden.tecnicoOriginalUid='otro'; expect(await aplicar(args)).toMatchObject({aplicado:false});expect(m.writes).toHaveLength(0);
 });
 it('no cambia una comisión que se liquidó después de cargar',async()=>{
  m.comision.estadoLiquidacion='liquidada';expect(await aplicar(args)).toMatchObject({aplicado:false});expect(m.writes).toHaveLength(0);
 });
});
