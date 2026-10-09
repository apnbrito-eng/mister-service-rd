import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/actividadOrden.service', () => ({ registrarActividadOrden: vi.fn() }));
vi.mock('../../src/context/AppContext',()=>({useApp:()=>({userProfile:{rol:'operaria'}})}));
vi.mock('../../src/context/AtencionContext',()=>({useAtencion:()=>({seleccionar:vi.fn()})}));
vi.mock('react-router-dom',()=>({useNavigate:()=>navegarInbox}));
vi.mock('../../src/utils/resolverChatCliente',()=>({resolverChatContacto:vi.fn(async()=>({waId:'18095551234',nombre:'Cliente',clienteId:'cliente1'}))}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
import ContactoOrden from '../../src/components/ordenes/ContactoOrden';
import { registrarActividadOrden } from '../../src/services/actividadOrden.service';
import toast from 'react-hot-toast';

let tree: ReactTestRenderer;
const registrar = vi.mocked(registrarActividadOrden);
const navegar = vi.fn(),navegarInbox=vi.fn(),abrir=vi.fn();
beforeEach(() => {
 vi.clearAllMocks();
 vi.stubGlobal('window',{open:abrir,location:{assign:navegar}});
 act(()=>{tree=create(React.createElement(ContactoOrden,{ordenId:'orden-1',nombre:'Cliente',telefono:'809-555-1234'}));});
});
afterEach(()=>{act(()=>tree.unmount());vi.unstubAllGlobals();});
const pulsar=(indice:number)=>tree.root.findAllByType('button')[indice].props.onClick() as Promise<void>;
function pendiente(){let resolver!:(v:unknown)=>void;registrar.mockReturnValue(new Promise(resolve=>{resolver=resolve;}));return()=>resolver({ok:true});}

describe('contacto desde la orden mediante inbox empresarial',()=>{
 it('registra antes de navegar al historial completo sin abrir WhatsApp externo',async()=>{
  const resolver=pendiente();let tarea!:Promise<void>;
  await act(async()=>{tarea=pulsar(0);await Promise.resolve();});
  expect(registrar).toHaveBeenCalledWith('orden-1','whatsapp');expect(navegarInbox).not.toHaveBeenCalled();expect(abrir).not.toHaveBeenCalled();
  expect(tree.root.findAllByType('button').every(b=>b.props.disabled)).toBe(true);
  await act(async()=>{resolver();await tarea;});
  expect(navegarInbox).toHaveBeenCalledWith('/admin/inbox/18095551234?clienteId=cliente1',{state:null});
 });
 it('no navega cuando falla el registro y permite reintentar',async()=>{
  registrar.mockRejectedValueOnce(new Error('sin red'));
  await act(async()=>{await pulsar(0);});
  expect(navegarInbox).not.toHaveBeenCalled();expect(abrir).not.toHaveBeenCalled();expect(toast.error).toHaveBeenCalled();
  registrar.mockResolvedValueOnce({ok:true});await act(async()=>{await pulsar(0);});expect(navegarInbox).toHaveBeenCalledOnce();
 });
 it('espera el registro antes de abrir teléfono y deja alternativa de toque directo',async()=>{
  const resolver=pendiente();let tarea!:Promise<void>;
  act(()=>{tarea=pulsar(1);});expect(navegar).not.toHaveBeenCalled();expect(registrar).toHaveBeenCalledWith('orden-1','llamar');
  await act(async()=>{resolver();await tarea;});expect(navegar).toHaveBeenCalledWith('tel:8095551234');expect(tree.root.findByType('a').props.href).toBe('tel:8095551234');
 });
 it('impide llamadas y clics WhatsApp simultáneos mientras guarda',async()=>{
  const resolver=pendiente();let tarea!:Promise<void>;
  await act(async()=>{tarea=pulsar(0);void pulsar(1);void pulsar(0);await Promise.resolve();});expect(registrar).toHaveBeenCalledOnce();
  await act(async()=>{resolver();await tarea;});expect(navegar).not.toHaveBeenCalled();expect(navegarInbox).toHaveBeenCalledOnce();
 });
});
