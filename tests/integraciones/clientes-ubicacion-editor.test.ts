import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({guardar:vi.fn(async()=>{})}));
vi.mock('../../src/services/clientes.service',()=>({actualizarCliente:m.guardar}));
vi.mock('../../src/components/Modal',()=>({default:({children,isOpen}:any)=>isOpen?children:null}));
vi.mock('../../src/components/ordenes/MiniMapaCliente',()=>({default:()=>null}));
import Editor from '../../src/components/clientes/EditarUbicacionCliente';
let tree:ReactTestRenderer;
afterEach(()=>{act(()=>tree?.unmount());vi.clearAllMocks();});
const cliente={id:'qa',nombre:'QA',telefono:'8095551234',direccion:'Dirección conservada',lat:18,lng:-70,createdAt:new Date()}as any;
it('guarda únicamente coordenadas y preserva zona sin alterar dirección',async()=>{
 const guardado=vi.fn();act(()=>{tree=create(React.createElement(Editor,{cliente,isOpen:true,onClose:vi.fn(),onGuardar:guardado}));});
 const inputs=tree.root.findAllByType('input');act(()=>inputs[1].props.onChange({target:{value:'19'}}));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
 expect(m.guardar).toHaveBeenCalledWith('qa',{lat:19,lng:-70,zona:''});expect(guardado.mock.calls[0][0].direccion).toBe('Dirección conservada');
});
it('rechaza coordenadas fuera de rango y conserva borrador al fallar guardado',async()=>{
 act(()=>{tree=create(React.createElement(Editor,{cliente,isOpen:true,onClose:vi.fn(),onGuardar:vi.fn()}));});
 const input=tree.root.findAllByType('input')[1];act(()=>input.props.onChange({target:{value:'91'}}));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));expect(m.guardar).not.toHaveBeenCalled();
 act(()=>input.props.onChange({target:{value:'19'}}));m.guardar.mockRejectedValueOnce(new Error('offline'));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));expect(tree.root.findAllByType('input')[1].props.value).toBe('19');expect(tree.root.findByProps({role:'alert'}).children.join('')).toContain('reintentar');
});
