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
 it('administración conserva asistencia y nómina en el mismo espacio',()=>{state.perfil={rol:'administrador'};const tree=render('/admin/personal');expect(JSON.stringify(tree.toJSON())).toContain('/admin/nomina');expect(JSON.stringify(tree.toJSON())).toContain('/admin/ponches');tree.unmount();});
 it('no inserta navegación de listas dentro de un expediente',()=>{state.perfil={rol:'administrador'};const tree=render('/admin/ordenes/abc');expect(tree.toJSON()).toBeNull();tree.unmount();});
});
