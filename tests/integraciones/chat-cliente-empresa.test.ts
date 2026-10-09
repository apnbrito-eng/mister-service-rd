import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const estado = vi.hoisted(() => ({ rol: 'secretaria', resolver: vi.fn(), seleccionar: vi.fn(), open: vi.fn(), error: vi.fn(), aviso: vi.fn() }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ userProfile: { rol: estado.rol } }) }));
vi.mock('../../src/context/AtencionContext', () => ({ useAtencion: () => ({ seleccionar: estado.seleccionar }) }));
vi.mock('../../src/utils/resolverChatCliente', () => ({ resolverChatContacto: estado.resolver, numeroWhatsAppCliente: (tel: string) => /^1?\d{10}$/.test(tel) ? `1${tel.slice(-10)}` : null }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(estado.aviso, { error: estado.error }) }));
import BotonChatCliente from '../../src/components/shared/BotonChatCliente';
import { useBorradorConversacion } from '../../src/hooks/useBorradorConversacion';
let tree: ReactTestRenderer;
function Ruta() { const l = useLocation(); return React.createElement('output', null, JSON.stringify({ ruta: l.pathname + l.search, estado: l.state })); }
function montar(antesAbrir?: () => Promise<void>) { act(() => { tree = create(React.createElement(MemoryRouter, { initialEntries: ['/admin/solicitudes'] }, React.createElement(React.Fragment, null, React.createElement(BotonChatCliente, { telefono:'8494580318', nombre:'QA', mensaje:'Revisa tu cita', antesAbrir }), React.createElement(Ruta)))); }); }
beforeEach(() => { vi.clearAllMocks(); estado.rol='secretaria'; estado.resolver.mockResolvedValue({ waId:'18494580318', clienteId:'qa', telefono:'8494580318', nombre:'QA' }); vi.stubGlobal('window', {open:estado.open}); });
afterEach(() => { act(() => tree?.unmount()); vi.unstubAllGlobals(); });
it('abre historial empresarial y lleva borrador en state, no URL ni aplicación externa', async () => {
 montar(); await act(async () => tree.root.findByType('button').props.onClick({stopPropagation(){}}));
 const l=JSON.parse(tree.root.findByType('output').children.join(''));
 expect(l.ruta).toBe('/admin/inbox/18494580318?clienteId=qa');
 expect(l.estado).toEqual({borradorChat:{waId:'18494580318',texto:'Revisa tu cita'}});
 expect(estado.open).not.toHaveBeenCalled(); expect(estado.seleccionar).toHaveBeenCalledOnce();
});
it('técnico no obtiene acceso al inbox al pulsar contacto', async () => {
 estado.rol='tecnico'; montar(); const b=tree.root.findByType('button'); expect(b.props.disabled).toBe(true);
 await act(async () => b.props.onClick({stopPropagation(){}})); expect(estado.resolver).not.toHaveBeenCalled();
});
it('auditoría fallida impide navegar; no apertura externa', async () => {
 montar(async () => {throw new Error('No se pudo registrar la acción');});
 await act(async () => tree.root.findByType('button').props.onClick({stopPropagation(){}}));
 expect(JSON.parse(tree.root.findByType('output').children.join('')).ruta).toBe('/admin/solicitudes');
 expect(estado.error).toHaveBeenCalledWith('No se pudo registrar la acción'); expect(estado.open).not.toHaveBeenCalled();
});
it('doble clic no duplica resolución ni la auditoría', async () => {
 let liberar!: (value: unknown) => void;
 estado.resolver.mockReturnValueOnce(new Promise(resolve => {liberar=resolve;}));
 const auditar=vi.fn().mockResolvedValue(undefined); montar(auditar);
 await act(async () => {const b=tree.root.findByType('button'); void b.props.onClick({stopPropagation(){}}); void b.props.onClick({stopPropagation(){}});});
 expect(estado.resolver).toHaveBeenCalledOnce();
 await act(async () => liberar({waId:'18494580318',telefono:'8494580318'})); expect(auditar).toHaveBeenCalledOnce();
});
function Borrador({waId, estadoRuta, clave}:{waId:string;estadoRuta:unknown;clave:string}) {
 const {texto,setTexto}=useBorradorConversacion(waId,estadoRuta,clave);
 return React.createElement('textarea',{value:texto,onChange:(e:{target:{value:string}})=>setTexto(e.target.value)});
}
it('el borrador de un cliente jamás aparece en otro chat, ni se carga un state de otro destinatario', () => {
 act(() => {tree=create(React.createElement(Borrador,{waId:'1',estadoRuta:{borradorChat:{waId:'1',texto:'Para uno'}},clave:'a'}));});
 expect(tree.root.findByType('textarea').props.value).toBe('Para uno');
 act(() => {tree.update(React.createElement(Borrador,{waId:'2',estadoRuta:{borradorChat:{waId:'1',texto:'No copiar'}},clave:'b'}));});
 expect(tree.root.findByType('textarea').props.value).toBe('');
});
it('un mensaje propuesto no sobrescribe un borrador existente del mismo cliente', () => {
 act(() => {tree=create(React.createElement(Borrador,{waId:'1',estadoRuta:null,clave:'a'}));});
 act(() => tree.root.findByType('textarea').props.onChange({target:{value:'Ya redactando'}}));
 act(() => {tree.update(React.createElement(Borrador,{waId:'1',estadoRuta:{borradorChat:{waId:'1',texto:'Otro mensaje'}},clave:'b'}));});
 expect(tree.root.findByType('textarea').props.value).toBe('Ya redactando'); expect(estado.aviso).toHaveBeenCalledOnce();
});
