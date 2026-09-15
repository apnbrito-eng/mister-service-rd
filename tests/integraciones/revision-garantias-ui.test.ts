import React from 'react';
import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({aplicar:vi.fn(),validada:true}));
vi.mock('../../src/firebase/config',()=>({db:{}}));
vi.mock('../../src/utils/comisiones',()=>({aplicarDescuentoGarantiaPorPiezas:m.aplicar}));
vi.mock('../../src/utils',()=>({formatMoneda:(n:number)=>`RD$${n}`}));
vi.mock('firebase/firestore',()=>({collection:(_db:unknown,name:string)=>({name}),query:(col:any)=>col,where:vi.fn(),limit:vi.fn(),
 getDocs:async(ref:any)=>ref.name==='comisiones'?{docs:[]}:{size:1,docs:[{id:'g1',data:()=>({numero:'OS-QA',esGarantia:true,referenciaOrdenId:'o1',tecnicoOriginalUid:'t1',cierreServicio:{fechaCierre:new Date(),piezasValidadasPorAdmin:m.validada,piezasUsadas:[{cantidad:2,costoUnitario:500}]}})}]},
}));
import RevisionGarantias from '../../src/components/RevisionGarantias';
const boton=(r:any,text:string)=>r.root.findAllByType('button').find((b:any)=>b.children.join('')===text);
let r:any;
beforeEach(()=>{m.aplicar.mockReset();m.validada=true;});
async function montar(){ await act(async()=>{r=create(React.createElement(MemoryRouter,null,React.createElement(RevisionGarantias,{uid:'admin',nombre:'QA'})));}); }
describe('Revisión administrativa visible',()=>{
 it('cargar, revisar y cancelar no aplica descuentos',async()=>{
  await montar();expect(m.aplicar).not.toHaveBeenCalled();
  await act(async()=>boton(r,'Revisar garantías').props.onClick());
  await act(async()=>boton(r,'Revisar importe').props.onClick());
  expect(JSON.stringify(r.toJSON())).toContain('RD$100');
  await act(async()=>boton(r,'Cancelar').props.onClick());
  expect(m.aplicar).not.toHaveBeenCalled(); r.unmount();
 });
 it('solo confirmar aplica el importe revisado',async()=>{
  m.aplicar.mockResolvedValue({aplicado:true});await montar();
  await act(async()=>boton(r,'Revisar garantías').props.onClick());
  await act(async()=>boton(r,'Revisar importe').props.onClick());
  await act(async()=>boton(r,'Confirmar ajuste').props.onClick());
  expect(m.aplicar).toHaveBeenCalledTimes(1);
  expect(m.aplicar).toHaveBeenCalledWith(expect.objectContaining({ordenGarantiaId:'g1',costoPiezasReReparacion:1000,solicitanteUid:'admin'}));r.unmount();
 });
 it('deshabilita ajustes mientras las piezas no estén validadas',async()=>{
  m.validada=false;await montar();await act(async()=>boton(r,'Revisar garantías').props.onClick());
  expect(boton(r,'Revisar importe').props.disabled).toBe(true);expect(m.aplicar).not.toHaveBeenCalled();r.unmount();
 });
});
