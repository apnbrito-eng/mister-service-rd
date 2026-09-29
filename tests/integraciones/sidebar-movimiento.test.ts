import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
const datos = vi.hoisted(() => ({ perfil: { rol:'administrador', nombre:'Prueba' }, usuario: {uid:'qa-sidebar'}, valores: new Map<string,string>() }));
vi.mock('../../src/context/AppContext',()=>({useApp:()=>({userProfile:{...datos.perfil},currentUser:datos.usuario})}));
vi.mock('../../src/firebase/config',()=>({db:{},auth:{}}));
vi.mock('firebase/auth',()=>({signOut:vi.fn()}));
vi.mock('firebase/firestore',()=>({collection:vi.fn(),query:vi.fn(),where:vi.fn(),onSnapshot:()=>()=>{}}));
vi.mock('../../src/services/whatsappInbox.service',()=>({suscribirContadorSinLeer:()=>()=>{}}));
vi.mock('../../src/mobile/AvisosMoviles',()=>({default:()=>null}));
vi.mock('../../src/mobile/notificaciones',()=>({desactivarNotificacionesMoviles:vi.fn()}));
vi.mock('../../src/components/Logo',()=>({default:()=>null}));
vi.mock('motion/react',async()=>{const React=await import('react');const crear=(tag:string)=>React.forwardRef<HTMLElement, Record<string, unknown>>((props,ref)=>{const {animate:_animate,whileTap:_whileTap,transition:_transition,initial:_initial,...rest}=props;return React.createElement(tag,{...rest,ref});});return {motion:{button:crear('button'),span:crear('span'),div:crear('div')},useReducedMotion:()=>true};});
import Sidebar from '../../src/components/Sidebar';
let tree:ReactTestRenderer;
afterEach(()=>{if(tree)act(()=>tree.unmount());datos.valores.clear();datos.perfil.rol='administrador';vi.unstubAllGlobals();});
function abrir(collapsed=false){vi.stubGlobal('localStorage',{getItem:(k:string)=>datos.valores.get(k)||null,setItem:(k:string,v:string)=>datos.valores.set(k,v)});act(()=>{tree=create(React.createElement(MemoryRouter,{initialEntries:['/admin/clientes']},React.createElement(Sidebar,{collapsed,onToggle:()=>{}})));});}
it('presenta destinos y permite plegar área actual aunque el proveedor recree el perfil en cada render',()=>{
 abrir();const links=tree.root.findAllByType('a');expect(links.some(n=>n.props.href==='/admin/ordenes')).toBe(true);expect(links.some(n=>n.props.href==='/admin/clientes')).toBe(true);
 const atencion=tree.root.findAllByType('button').find(n=>n.props['aria-controls']?.includes('atencion'))!;
 expect(atencion.props['aria-expanded']).toBe(true);act(()=>atencion.props.onClick());expect(atencion.props['aria-expanded']).toBe(false);
 expect(datos.valores.get('ms:sidebar:expansion:v1:qa-sidebar')).toContain('false');
});
it('conserva gates para operaria y no introduce hubs como destino del lateral',()=>{
 datos.perfil.rol='operaria';abrir();const destinos=tree.root.findAllByType('a').map(n=>n.props.href);
 expect(destinos).toContain('/admin/inbox');expect(destinos).not.toContain('/admin/solicitudes');expect(destinos.some(p=>p.startsWith('/admin/area/'))).toBe(false);
});
it('colapsado conserva enlaces accesibles y control de 44px dentro del borde',()=>{
 abrir(true);const orden=tree.root.findAllByType('a').find(n=>n.props.href==='/admin/ordenes')!;expect(orden.props['aria-label']).toBeTruthy();
 const toggle=tree.root.findAllByType('button').find(n=>n.props['aria-label']==='Expandir menú')!;expect(toggle.props.className).toContain('w-11');expect(toggle.props.className).toContain('right-2');
});

it('cerrar retira interacción y una reapertura interrumpe la salida sin ocultar el panel',()=>{
 abrir();
 const boton=tree.root.findAllByType('button').find(n=>n.props['aria-controls']?.includes('atencion'))!;
 const id=boton.props['aria-controls'];
 act(()=>boton.props.onClick());
 let panel=tree.root.findAllByType('div').find(n=>n.props.id===id)!;
 expect(panel.props['aria-hidden']).toBe(true);
 expect(panel.props.style.pointerEvents).toBe('none');
 const completarSalida=panel.props.onAnimationComplete;
 act(()=>boton.props.onClick());
 act(()=>completarSalida());
 panel=tree.root.findAllByType('div').find(n=>n.props.id===id)!;
 expect(panel.props['aria-hidden']).toBe(false);
 expect(panel.props.hidden).toBe(false);
 expect(panel.props.style.pointerEvents).toBe('auto');
});

it('devuelve foco a cabecera antes de aplicar inert al panel cerrado',()=>{
 const foco=vi.fn(), inert=vi.fn(), activo={};
 vi.stubGlobal('document',{activeElement:activo,getElementById:()=>({focus:foco})});
 vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()});
 act(()=>{tree=create(React.createElement(MemoryRouter,{initialEntries:['/admin/clientes']},React.createElement(Sidebar,{collapsed:false,onToggle:()=>{}})),{createNodeMock:(element)=>element.type==='div'&&element.props.id?{contains:(n:unknown)=>n===activo,toggleAttribute:inert}:null});});
 foco.mockClear();inert.mockClear();
 const boton=tree.root.findAllByType('button').find(n=>n.props['aria-controls']?.includes('atencion'))!;
 act(()=>boton.props.onClick());
 expect(foco).toHaveBeenCalledOnce();
 expect(inert).toHaveBeenCalledWith('inert',true);
 expect(foco.mock.invocationCallOrder[0]).toBeLessThan(inert.mock.invocationCallOrder[0]);
});
