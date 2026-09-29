import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
const datos = vi.hoisted(() => ({ perfil: null as null | { rol: string }, usuario: null as null | { uid: string } }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ userProfile: datos.perfil, currentUser: datos.usuario }) }));
vi.mock('../../src/hooks/useAsistenteIAChat', () => ({ useAsistenteIAChat: () => ({ mensajes: [{role:'user',content:'Mensaje conservado'}], enviar: vi.fn(), pensando: false, error: null, tokensSesion: { input: 0, output: 0, costoUSD: 0 } }) }));
vi.mock('../../src/hooks/useMovimientoReducido', () => ({ useMovimientoReducido: () => true }));
vi.mock('../../src/components/BotonAsistenteMovil', () => ({ default: ({onAbrir}: {onAbrir:()=>void}) => React.createElement('button', {onClick:onAbrir, 'aria-label':'Abrir IA'}) }));
vi.mock('../../src/components/TextoAsistente', () => ({ TextoAsistente: () => null }));
vi.mock('motion/react', async () => { const React = await import('react'); return { motion: { div: React.forwardRef((props: any, ref: any) => { const { initial, animate, transition, ...rest } = props; return React.createElement('div', { ...rest, ref }); }) } }; });
import Asistente from '../../src/components/AsistenteIAFlotante';
import { cerrarCapaSuperior } from '../../src/mobile/capas';
let tree: ReturnType<typeof create>;
afterEach(() => { act(() => tree?.unmount()); datos.perfil = null; datos.usuario = null; vi.unstubAllGlobals(); });
function montar() {
  const eventos = new Map<string, (e:any)=>void>();
  vi.stubGlobal('document', {addEventListener:(k:string,v:any)=>eventos.set(k,v),removeEventListener:(k:string)=>eventos.delete(k)});
  vi.stubGlobal('requestAnimationFrame', (fn:()=>void)=>fn());
  act(() => { tree = create(React.createElement(Asistente), { createNodeMock: () => ({querySelector:()=>null,style:{},scrollHeight:0}) }); });
  datos.perfil = {rol:'administrador'}; datos.usuario = {uid:'qa'};
  act(() => tree.update(React.createElement(Asistente)));
  return eventos;
}
const boton = (nombre:string) => tree.root.findByProps({'aria-label':nombre});
const panel = () => tree.root.findAllByType('div').find(n=>n.props.role==='dialog')!;
it('perfil tardío: inerte cerrado y atributo retirado al abrir', () => {
  montar(); expect(panel().props.inert).toBe('');
  act(()=>boton('Abrir IA').props.onClick()); expect(panel().props.inert).toBeUndefined();
});
it.each(['Volver a la aplicación','Minimizar Asistente IA','Cerrar Asistente IA'])('%s conserva borrador e historial y devuelve lanzador', nombre => {
  montar(); act(()=>boton('Abrir IA').props.onClick());
  act(()=>tree.root.findByType('textarea').props.onChange({target:{value:'Mi borrador'}}));
  act(()=>boton(nombre).props.onClick()); expect(panel().props.inert).toBe('');
  act(()=>boton('Abrir IA').props.onClick()); expect(tree.root.findByType('textarea').props.value).toBe('Mi borrador');
  expect(JSON.stringify(tree.toJSON())).toContain('Mensaje conservado');
});
it('Escape y Atrás cierran IA; sin panel Atrás no se consume', () => {
  const eventos = montar(); expect(cerrarCapaSuperior()).toBe(false);
  act(()=>boton('Abrir IA').props.onClick());
  act(()=>eventos.get('keydown')!({key:'Escape',preventDefault:vi.fn()})); expect(panel().props.inert).toBe('');
  act(()=>boton('Abrir IA').props.onClick());
  act(()=>expect(cerrarCapaSuperior()).toBe(true)); expect(panel().props.inert).toBe(''); expect(cerrarCapaSuperior()).toBe(false);
});
it('revocar acceso desmonta controles y desregistra Atrás', () => {
  montar(); act(()=>boton('Abrir IA').props.onClick()); datos.perfil={rol:'tecnico'};
  act(()=>tree.update(React.createElement(Asistente))); expect(tree.toJSON()).toBeNull(); expect(cerrarCapaSuperior()).toBe(false);
});
