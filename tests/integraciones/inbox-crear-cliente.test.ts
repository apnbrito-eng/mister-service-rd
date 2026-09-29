import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({buscar:vi.fn(),crear:vi.fn()}));
vi.mock('../../src/services/clientes.service',()=>({buscarClientePorTelefono:m.buscar,buscarOCrearCliente:m.crear,normalizarTelefono:(v:string)=>/^1?\d{10}$/.test(v)?v.slice(-10):''}));
import CrearClienteDesdeChat from '../../src/components/inbox/CrearClienteDesdeChat';
let r:any;const guardado=vi.fn();
beforeEach(()=>{vi.clearAllMocks();m.buscar.mockResolvedValue(null);m.crear.mockResolvedValue('cliente');});
afterEach(()=>{if(r)act(()=>r.unmount());r=null;});
async function montar(waId='18095550100'){await act(async()=>{r=create(React.createElement(CrearClienteDesdeChat,{waId,onGuardar:guardado,onCancelar:()=>{}}));});await act(async()=>r.root.findByProps({name:'nombreNuevoCliente'}).props.onChange({target:{value:'Cliente QA'}}));}
it('crea solo cliente y devuelve registro canónico sin crear orden',async()=>{
 await montar();m.buscar.mockResolvedValueOnce(null).mockResolvedValueOnce({id:'cliente',data:{nombre:'Cliente QA',telefono:'8095550100'}});
 await act(async()=>r.root.findByType('form').props.onSubmit({preventDefault(){}}));expect(m.crear).toHaveBeenCalledWith('18095550100',{nombre:'Cliente QA',email:'',direccion:''});expect(guardado).toHaveBeenCalledWith(expect.objectContaining({id:'cliente'}));
});
it('cliente existente se reutiliza sin sobrescribir; doble toque solo ejecuta una vez',async()=>{
 await montar();let resolver:(v:any)=>void=()=>{};m.buscar.mockReturnValueOnce(new Promise(r=>{resolver=r;}));const submit=r.root.findByType('form').props.onSubmit;
 let tarea:Promise<void>;await act(async()=>{tarea=submit({preventDefault(){}});void submit({preventDefault(){}});});expect(m.buscar).toHaveBeenCalledTimes(1);
 await act(async()=>{resolver({id:'canónico',data:{nombre:'Existente'}});await tarea!;});expect(m.crear).not.toHaveBeenCalled();expect(guardado).toHaveBeenCalledWith(expect.objectContaining({id:'canónico'}));
});
it('fallo conserva borrador y permite reintentar; internacional no se recorta ni guarda',async()=>{
 await montar();m.crear.mockRejectedValueOnce(new Error('Sin conexión'));await act(async()=>r.root.findByType('form').props.onSubmit({preventDefault(){}}));expect(r.root.findByProps({name:'nombreNuevoCliente'}).props.value).toBe('Cliente QA');expect(JSON.stringify(r.toJSON())).toContain('Sin conexión');
 act(()=>r.unmount());r=null;await montar('34612345678');await act(async()=>r.root.findByType('form').props.onSubmit({preventDefault(){}}));expect(m.crear).toHaveBeenCalledTimes(1);expect(JSON.stringify(r.toJSON())).toContain('internacional');
});
