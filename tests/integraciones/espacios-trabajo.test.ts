import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
const state=vi.hoisted(()=>({perfil:{rol:'operaria'} as Record<string,unknown>}));
vi.mock('../../src/context/AppContext',()=>({useApp:()=>({userProfile:state.perfil})}));
import EspacioTrabajo from '../../src/components/EspacioTrabajo';
function render(ruta:string){return create(React.createElement(MemoryRouter,{initialEntries:[ruta]},React.createElement(EspacioTrabajo)));}
describe('Espacios de trabajo por permisos',()=>{
 it('no muestra accesos de nómina a operarias',()=>{state.perfil={rol:'operaria'};const tree=render('/admin/personal');expect(JSON.stringify(tree.toJSON())).not.toContain('/admin/nomina');tree.unmount();});
 it('administración encuentra asistencia en Equipo y nómina en Contabilidad',()=>{state.perfil={rol:'administrador'};const tree=render('/admin/personal');expect(JSON.stringify(tree.toJSON())).not.toContain('/admin/nomina');expect(JSON.stringify(tree.toJSON())).toContain('/admin/ponches');tree.unmount();const caja=render('/admin/nomina');expect(JSON.stringify(caja.toJSON())).toContain('/admin/comisiones');expect(JSON.stringify(caja.toJSON())).toContain('Contabilidad');caja.unmount();});
 it('no inserta navegación de listas dentro de un expediente',()=>{state.perfil={rol:'administrador'};const tree=render('/admin/ordenes/abc');expect(tree.toJSON()).toBeNull();tree.unmount();});
});

import { act } from 'react-test-renderer';
import { AtencionProvider, useAtencion } from '../../src/context/AtencionContext';
function SeleccionarCliente(){const {seleccionar}=useAtencion();return React.createElement('button',{onClick:()=>seleccionar({clienteId:'cliente-qa',waId:'18095550100',telefono:'8095550100',nombre:'Cliente QA'})},'Seleccionar QA');}
it('conserva la ficha y conversación seleccionadas y permite volver a todas',()=>{
 state.perfil={rol:'administrador'};
 let tree:ReturnType<typeof create>;
 act(()=>{tree=create(React.createElement(MemoryRouter,{initialEntries:['/admin/solicitudes']},React.createElement(AtencionProvider,null,React.createElement(SeleccionarCliente),React.createElement(EspacioTrabajo))));});
 act(()=>tree.root.findAllByType('button').find(b=>b.children.includes('Seleccionar QA'))!.props.onClick());
 expect(JSON.stringify(tree!.toJSON())).toContain('/admin/clientes?id=cliente-qa');
 expect(JSON.stringify(tree!.toJSON())).toContain('/admin/inbox/18095550100');
 act(()=>tree.root.findAllByType('button').find(b=>b.children.includes('Ver todos'))!.props.onClick());
 expect(JSON.stringify(tree!.toJSON())).not.toContain('cliente-qa');
 expect(JSON.stringify(tree!.toJSON())).not.toContain('/admin/inbox/18095550100');
 act(()=>tree.unmount());
});
