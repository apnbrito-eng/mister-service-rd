/* eslint-disable @typescript-eslint/no-explicit-any -- Dobles de Firebase/API deliberadamente parciales; solo fixtures de pruebas. */
import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({guardar:vi.fn(async()=>{}),resolver:vi.fn()}));
vi.mock('../../src/services/equipoApi',()=>({equipoApi:m.resolver}));
vi.mock('../../src/services/clientes.service',()=>({actualizarCliente:m.guardar}));
vi.mock('../../src/components/Modal',()=>({default:({children,isOpen}:any)=>isOpen?children:null}));
vi.mock('../../src/components/ordenes/MiniMapaCliente',()=>({default:()=>null}));
import Editor from '../../src/components/clientes/EditarUbicacionCliente';
let tree:ReactTestRenderer;
afterEach(()=>{act(()=>tree?.unmount());vi.clearAllMocks();});
const cliente={id:'qa',nombre:'QA',telefono:'8095551234',direccion:'Dirección conservada',lat:18,lng:-70,createdAt:new Date()}as any;
it('guarda únicamente coordenadas y preserva zona sin alterar dirección',async()=>{
 const guardado=vi.fn();act(()=>{tree=create(React.createElement(Editor,{cliente,isOpen:true,onClose:vi.fn(),onGuardar:guardado}));});
 const inputs=tree.root.findAllByType('input');act(()=>inputs[0].props.onChange({target:{value:'19, -70'}}));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
 expect(m.guardar).toHaveBeenCalledWith('qa',{lat:19,lng:-70,zona:''});expect(guardado.mock.calls[0][0].direccion).toBe('Dirección conservada');
});
it('rechaza coordenadas fuera de rango y conserva borrador al fallar guardado',async()=>{
 act(()=>{tree=create(React.createElement(Editor,{cliente,isOpen:true,onClose:vi.fn(),onGuardar:vi.fn()}));});
 const input=tree.root.findAllByType('input')[0];act(()=>input.props.onChange({target:{value:'91, -70'}}));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));expect(m.guardar).not.toHaveBeenCalled();
 act(()=>input.props.onChange({target:{value:'19, -70'}}));m.guardar.mockRejectedValueOnce(new Error('offline'));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));expect(tree.root.findAllByType('input')[0].props.value).toBe('19, -70');expect(tree.root.findByProps({role:'alert'}).children.join('')).toContain('reintentar');
});

it('resuelve enlace corto y guarda las coordenadas obtenidas',async()=>{
 m.resolver.mockResolvedValue({enlace:'https://www.google.com/maps/?q=19.4,-70.2'});
 act(()=>{tree=create(React.createElement(Editor,{cliente,isOpen:true,onClose:vi.fn(),onGuardar:vi.fn()}));});
 act(()=>tree.root.findByType('input').props.onChange({target:{value:'https://maps.app.goo.gl/ejemplo'}}));
 await act(async()=>tree.root.findAllByType('button').find(b=>b.children.includes('Obtener ubicación del enlace'))!.props.onClick());
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
 expect(m.guardar).toHaveBeenCalledWith('qa',{lat:19.4,lng:-70.2,zona:''});
});
it('descarta resolución atrasada si se pega otra ubicación',async()=>{
 let terminar!:(value:{enlace:string})=>void;
 m.resolver.mockReturnValue(new Promise(resolve=>{terminar=resolve;}));
 act(()=>{tree=create(React.createElement(Editor,{cliente,isOpen:true,onClose:vi.fn(),onGuardar:vi.fn()}));});
 act(()=>tree.root.findByType('input').props.onChange({target:{value:'https://maps.app.goo.gl/ejemplo'}}));
 act(()=>{void tree.root.findAllByType('button').find(b=>b.children.includes('Obtener ubicación del enlace'))!.props.onClick();});
 act(()=>tree.root.findByType('input').props.onChange({target:{value:'18.5,-69.5'}}));
 await act(async()=>terminar({enlace:'https://www.google.com/maps/?q=19.4,-70.2'}));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
 expect(m.guardar).toHaveBeenCalledWith('qa',{lat:18.5,lng:-69.5,zona:''});
});
