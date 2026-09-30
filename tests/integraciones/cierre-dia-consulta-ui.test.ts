import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({consultas:[] as ((v:unknown)=>void)[]}));
vi.mock('../../src/firebase/config',()=>({db:{}}));
vi.mock('../../src/context/AppContext',()=>({useApp:()=>({userProfile:{rol:'administrador',nombre:'QA'},currentUser:{uid:'qa'}})}));
vi.mock('../../src/components/crm/RendicionEfectivo',()=>({default:()=>null}));
vi.mock('../../src/components/Modal',()=>({default:()=>null}));
vi.mock('../../src/services/cierreDia.service',()=>({resumirTransferencias:()=>({}),cerrarDiaAtomico:vi.fn(),entregarEfectivoOrdenes:vi.fn()}));
vi.mock('firebase/firestore',async original=>({...await original<typeof import('firebase/firestore')>(),collection:(_:unknown,c:string)=>c,query:(c:string)=>c,
 onSnapshot:(_:unknown,cb:(v:unknown)=>void)=>{cb({docs:[]});return ()=>{};},
 getDocs:(c:string)=>c==='personal'?Promise.resolve({docs:[]}):new Promise(resolve=>m.consultas.push(resolve)),
}));
import CierreDia from '../../src/pages/CierreDia';
const snap=(nombre:string)=>({size:1,empty:false,docs:[{id:nombre,data:()=>({cerradoPor:nombre,totalIngresos:100,fechaCierre:{toDate:()=>new Date('2026-09-29')}})}]});
it('descarta respuesta de fecha anterior y muestra cierre de fecha seleccionada',async()=>{
 let vista!:ReactTestRenderer;
 await act(async()=>{vista=create(React.createElement(CierreDia));});
 expect(m.consultas).toHaveLength(1);
 await act(async()=>{vista.root.findByProps({type:'date'}).props.onChange({target:{value:'2026-09-20'}});});
 expect(m.consultas).toHaveLength(2);
 await act(async()=>{m.consultas[1](snap('CIERRE_ACTUAL'));});
 expect(JSON.stringify(vista.toJSON())).toContain('CIERRE_ACTUAL');
 await act(async()=>{m.consultas[0](snap('CIERRE_OBSOLETO'));});
 expect(JSON.stringify(vista.toJSON())).not.toContain('CIERRE_OBSOLETO');
 expect(JSON.stringify(vista.toJSON())).toContain('CIERRE_ACTUAL');
 await act(async()=>vista.unmount());
});
