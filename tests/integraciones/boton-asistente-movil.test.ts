import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
const movimiento = vi.hoisted(() => ({ reducido: true, llamadas: [] as Array<{valor: any; destino: number; opciones: any}> }));
vi.mock('../../src/hooks/useMovimientoReducido',()=>({useMovimientoReducido:()=>movimiento.reducido}));
vi.mock('motion/react', async () => {
 const React = await import('react');
 const crear = (tag: string) => React.forwardRef((props: any, ref: any) => { const {animate, transition, whileTap, ...resto} = props; return React.createElement(tag, {...resto, ref}); });
 return {motion: {button: crear('button'), span: crear('span')}, useReducedMotion: () => movimiento.reducido,
 useMotionValue: (inicial: number) => { const ref = React.useRef({valor: inicial, set(v: number){this.valor=v;}, get(){return this.valor;}, stop: vi.fn()}); return ref.current; },
 animate: (valor: any, destino: number, opciones: any) => { movimiento.llamadas.push({valor,destino,opciones}); return {stop: vi.fn()}; }};
});
import Boton from '../../src/components/BotonAsistenteMovil';
let tree: ReactTestRenderer | undefined;
afterEach(()=>{if(tree)act(()=>tree!.unmount());tree=undefined;vi.unstubAllGlobals();movimiento.reducido=true;movimiento.llamadas=[];});
function setup(stored?:string, denied=false){
 const values=new Map<string,string>(); if(stored)values.set('ms:assistant-launcher-position:v1',stored);
 const listeners=new Map<string,()=>void>();
 const win={innerWidth:375,innerHeight:812,addEventListener:(key:string,fn:()=>void)=>listeners.set(key,fn),removeEventListener:vi.fn()};
 vi.stubGlobal('window',win);vi.stubGlobal('getComputedStyle',()=>({getPropertyValue:()=> '0px'}));
 vi.stubGlobal('localStorage',{getItem:(k:string)=>{if(denied)throw Error('denied');return values.get(k)||null;},setItem:(k:string,v:string)=>{if(denied)throw Error('denied');values.set(k,v);},removeItem:(k:string)=>values.delete(k)});
 const open=vi.fn();
 const node={offsetWidth:48,offsetHeight:48,setPointerCapture:vi.fn(),hasPointerCapture:()=>true,releasePointerCapture:vi.fn(),getBoundingClientRect:()=>({left:tree?.root.findByType('button').props.style.x?.get()??300,top:tree?.root.findByType('button').props.style.y?.get()??700})};
 const mount=()=>act(()=>{tree=create(React.createElement(Boton,{onAbrir:open,hayNoLeido:false}),{createNodeMock:e=>e.type==='button'?node:null});});mount();
 const event=(x:number,y:number)=>({pointerId:1,button:0,isPrimary:true,clientX:x,clientY:y,currentTarget:node});
 const action=(name:string,data:unknown)=>act(()=>tree!.root.findByType('button').props[name](data));
 const style=()=>{const s=tree!.root.findByType('button').props.style;return {...s,left:s.x?.get(),top:s.y?.get()};};
 return {open,values,win,listeners,mount,event,action,style};
}
describe('botón móvil del asistente',()=>{
 it('un toque con movimiento mínimo abre una sola vez',()=>{const s=setup();s.action('onPointerDown',s.event(320,720));s.action('onPointerMove',s.event(322,722));s.action('onPointerUp',s.event(322,722));s.action('onClick',{detail:1});expect(s.open).toHaveBeenCalledTimes(1);expect(s.values.size).toBe(0);});
 it('arrastrar mueve y guarda sin abrir; el siguiente toque sí abre',()=>{const s=setup();s.action('onPointerDown',s.event(320,720));s.action('onPointerMove',s.event(120,220));s.action('onPointerUp',s.event(120,220));s.action('onClick',{detail:1});expect(s.open).not.toHaveBeenCalled();expect(s.style().left).toBe(100);expect(s.style().top).toBe(200);expect(s.values.size).toBe(1);s.action('onPointerDown',s.event(120,220));s.action('onPointerUp',s.event(120,220));s.action('onClick',{detail:1});expect(s.open).toHaveBeenCalledTimes(1);});
 it('limita el arrastre al borde de la pantalla',()=>{const s=setup();s.action('onPointerDown',s.event(320,720));s.action('onPointerMove',s.event(-1000,-1000));s.action('onPointerUp',s.event(-1000,-1000));expect(s.style().left).toBe(12);expect(s.style().top).toBe(12);});
 it('recupera la posición y la ajusta al girar o reducir la ventana',()=>{const s=setup('{"x":1,"y":1}');expect(s.style().left).toBe(315);s.win.innerWidth=220;s.win.innerHeight=320;act(()=>s.listeners.get('resize')!());expect(s.style().left).toBe(160);expect(s.style().top).toBe(260);});
 it('se puede mover con flechas, restablecer con Inicio y abrir con teclado',()=>{const s=setup();s.action('onKeyDown',{key:'ArrowLeft',currentTarget:{getBoundingClientRect:()=>({left:300,top:700})},preventDefault:vi.fn()});expect(s.style().left).toBe(276);s.action('onKeyDown',{key:'Home',preventDefault:vi.fn()});expect(s.style().left).toBeUndefined();expect(s.values.size).toBe(0);s.action('onClick',{detail:0});expect(s.open).toHaveBeenCalledTimes(1);});
 it('ignora preferencias inválidas y funciona sin almacenamiento',()=>{const s=setup('{"x":-20,"y":"bad"}',true);expect(s.style().left).toBeUndefined();s.action('onPointerDown',s.event(320,720));s.action('onPointerMove',s.event(120,220));expect(()=>s.action('onPointerUp',s.event(120,220))).not.toThrow();expect(s.style().left).toBe(100);});
 it('cancelar el gesto no abre el chat y no bloquea el siguiente toque',()=>{const s=setup();s.action('onPointerDown',s.event(320,720));s.action('onPointerMove',s.event(120,220));s.action('onPointerCancel',s.event(120,220));s.action('onClick',{detail:1});expect(s.open).not.toHaveBeenCalled();s.action('onPointerDown',s.event(120,220));s.action('onPointerUp',s.event(120,220));s.action('onClick',{detail:1});expect(s.open).toHaveBeenCalledTimes(1);});
});

it('entrega velocidad del dedo por eje y permite agarrar el resorte desde la posición visual',()=>{
 movimiento.reducido=false; const s=setup();
 s.action('onPointerDown',{...s.event(320,720),timeStamp:100});
 s.action('onPointerMove',{...s.event(270,670),timeStamp:150});
 s.action('onPointerUp',{...s.event(270,670),timeStamp:160});
 expect(movimiento.llamadas).toHaveLength(2);
 expect(movimiento.llamadas[0].opciones.velocity).toBeCloseTo(-50/0.06);
 expect(movimiento.llamadas[1].opciones.velocity).toBeCloseTo(-50/0.06);
 expect(movimiento.llamadas[0].destino).toBeLessThan(250);
 // Representa un frame intermedio del resorte, no su destino lógico.
 movimiento.llamadas[0].valor.set(200); movimiento.llamadas[1].valor.set(600);
 s.action('onPointerDown',{...s.event(210,610),timeStamp:200});
 s.action('onPointerMove',{...s.event(230,630),timeStamp:220});
 expect(s.style().left).toBe(220); expect(s.style().top).toBe(620);
 expect(movimiento.llamadas[0].valor.stop).toHaveBeenCalled();
});
it('con movimiento reducido el arrastre es directo y no lanza inercia',()=>{
 const s=setup();s.action('onPointerDown',{...s.event(320,720),timeStamp:100});
 s.action('onPointerMove',{...s.event(120,220),timeStamp:150});s.action('onPointerUp',{...s.event(120,220),timeStamp:160});
 expect(movimiento.llamadas).toHaveLength(0);expect(s.style().left).toBe(100);
});
it('una pausa antes de soltar no hereda velocidad antigua',()=>{
 movimiento.reducido=false;const s=setup();s.action('onPointerDown',{...s.event(320,720),timeStamp:100});
 s.action('onPointerMove',{...s.event(120,220),timeStamp:150});s.action('onPointerUp',{...s.event(120,220),timeStamp:400});
 expect(movimiento.llamadas[0].opciones.velocity).toBe(0);expect(movimiento.llamadas[0].destino).toBe(100);
});
it('activar movimiento reducido detiene un lanzamiento ya iniciado en su posición actual',()=>{
 movimiento.reducido=false;const s=setup();s.action('onPointerDown',{...s.event(320,720),timeStamp:100});
 s.action('onPointerMove',{...s.event(270,670),timeStamp:150});s.action('onPointerUp',{...s.event(270,670),timeStamp:160});
 const eje=movimiento.llamadas[0].valor;eje.set(225);eje.stop.mockClear();movimiento.reducido=true;
 act(()=>tree!.update(React.createElement(Boton,{onAbrir:s.open,hayNoLeido:true})));
 expect(s.style().x).toBe(eje);expect(s.style().left).toBe(225);expect(eje.stop).toHaveBeenCalled();
});
