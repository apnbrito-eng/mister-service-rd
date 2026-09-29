import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('../../src/services/equipoApi',()=>({equipoApi:m.api}));
vi.mock('../../src/context/AppContext',()=>({useApp:()=>({userProfile:{rol:'administrador'}})}));
vi.mock('../../src/components/crm/GestionOrden',()=>({default:()=>null}));
import ClientesResponsables from '../../src/pages/ClientesResponsables';
let r:any;
const fila=(id:string,clienteId:string)=>({id,clienteId,clienteNombre:'Mismo nombre',numero:id,equipo:'Lavadora',responsableId:'r',responsableNombre:'Responsable',tecnicoId:'',tecnicoNombre:'',operariaId:'',operariaNombre:'',participantes:{},fase:'agendado',etapa:'',pagos:[]});
afterEach(()=>{if(r)act(()=>r.unmount());r=null;vi.clearAllMocks();});
it('agrupa por identidad del cliente sin juntar órdenes sin cliente por nombre',async()=>{m.api.mockResolvedValue({items:[fila('1','a'),fila('2','a'),fila('3','b'),fila('4',''),fila('5','')],cursor:null});await act(async()=>{r=create(React.createElement(ClientesResponsables));});expect(r.root.findAllByType('article')).toHaveLength(4);});
it('filtra efectivo antes de presentar conteos y muestra el estado vacío',async()=>{m.api.mockResolvedValue({items:[fila('1','a')],cursor:null});await act(async()=>{r=create(React.createElement(ClientesResponsables));});act(()=>r.root.findByProps({'aria-label':'Vista'}).props.onChange({target:{value:'efectivo'}}));expect(r.root.findAllByType('article')).toHaveLength(0);expect(JSON.stringify(r.toJSON())).toContain('No hay órdenes que coincidan');});
it('muestra un fallo de carga sin presentarlo como consulta vacía',async()=>{m.api.mockRejectedValue(new Error('Sin conexión'));await act(async()=>{r=create(React.createElement(ClientesResponsables));});expect(r.root.findByProps({role:'alert'}).children.join('')).toContain('Sin conexión');expect(JSON.stringify(r.toJSON())).not.toContain('No hay órdenes que coincidan');});
it('combina técnico y operaria por sus asignaciones sin confundir cartera ni participantes',async()=>{
 m.api.mockResolvedValue({items:[
 {...fila('1','a'),tecnicoId:'t1',tecnicoNombre:'T1',operariaId:'op1',operariaNombre:'Op1'},
 {...fila('2','b'),tecnicoId:'t1',tecnicoNombre:'T1',operariaId:'op2',operariaNombre:'Op2'},
 {...fila('3','c'),tecnicoId:'t2',tecnicoNombre:'T2',operariaId:'op1',operariaNombre:'Op1',cartera:{responsableId:'t1',responsableNombre:'T1'},participantes:{t1:'T1'}},
 ],cursor:null});
 await act(async()=>{r=create(React.createElement(ClientesResponsables));});
 const elegir=(label:string,value:string)=>act(()=>r.root.findByProps({'aria-label':label}).props.onChange({target:{value}}));
 elegir('Técnico','t1');expect(r.root.findAllByType('article')).toHaveLength(2);
 elegir('Operaria','op1');expect(r.root.findAllByType('article')).toHaveLength(1);
 expect(JSON.stringify(r.toJSON())).toContain('Abrir orden ');
 elegir('Responsable de la orden','r');expect(r.root.findAllByType('article')).toHaveLength(1);
 act(()=>r.root.findByProps({type:'checkbox'}).props.onChange({target:{checked:true}}));
 expect(r.root.findByProps({'aria-label':'Responsable de la orden'}).props.value).toBe('');
 expect(r.root.findAllByType('article')).toHaveLength(0);
});
it('busca por número de orden completo o parcial junto al filtro técnico',async()=>{
 m.api.mockResolvedValue({items:[
 {...fila('1','a'),numero:'OS-00421',tecnicoId:'t1',tecnicoNombre:'T1'},
 {...fila('2','b'),numero:'OS-00422',tecnicoId:'t2',tecnicoNombre:'T2'},
 ],cursor:null});
 await act(async()=>{r=create(React.createElement(ClientesResponsables));});
 const buscar=(value:string)=>act(()=>r.root.findByProps({'aria-label':'Buscar cliente, empleado u orden'}).props.onChange({target:{value}}));
 buscar('os-00421');expect(r.root.findAllByType('article')).toHaveLength(1);
 expect(JSON.stringify(r.toJSON())).toContain('OS-00421');expect(JSON.stringify(r.toJSON())).not.toContain('OS-00422');
 buscar('0042');expect(r.root.findAllByType('article')).toHaveLength(2);
 act(()=>r.root.findByProps({'aria-label':'Técnico'}).props.onChange({target:{value:'t2'}}));
 expect(r.root.findAllByType('article')).toHaveLength(1);expect(JSON.stringify(r.toJSON())).toContain('OS-00422');
});
it('busca también por ID interno completo o parcial sin distinguir mayúsculas',async()=>{
 m.api.mockResolvedValue({items:[{...fila('AbC-Interno-123','a'),numero:'OS-001'},{...fila('Otro-456','b'),numero:'OS-002'}],cursor:null});
 await act(async()=>{r=create(React.createElement(ClientesResponsables));});
 for(const value of ['abc-interno-123','interno']){
  act(()=>r.root.findByProps({'aria-label':'Buscar cliente, empleado u orden'}).props.onChange({target:{value}}));
  expect(r.root.findAllByType('article')).toHaveLength(1);
  expect(JSON.stringify(r.toJSON())).toContain('OS-001');
  expect(JSON.stringify(r.toJSON())).not.toContain('OS-002');
 }
});
