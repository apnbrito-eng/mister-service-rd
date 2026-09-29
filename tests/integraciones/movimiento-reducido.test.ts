import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { useMovimientoReducido } from '../../src/hooks/useMovimientoReducido';
afterEach(()=>vi.unstubAllGlobals());
it('sigue cambios de preferencia durante la sesión y retira el listener',()=>{
 let cambio=()=>{};
 const consulta={matches:false,addEventListener:vi.fn((_tipo:string,fn:()=>void)=>{cambio=fn;}),removeEventListener:vi.fn()};
 vi.stubGlobal('window',{matchMedia:()=>consulta});
 function Vista(){return React.createElement('output',null,String(useMovimientoReducido()));}
 let tree:ReturnType<typeof create>;
 act(()=>{tree=create(React.createElement(Vista));});expect(tree!.root.findByType('output').children).toEqual(['false']);
 act(()=>{consulta.matches=true;cambio();});expect(tree!.root.findByType('output').children).toEqual(['true']);
 act(()=>{consulta.matches=false;cambio();});expect(tree!.root.findByType('output').children).toEqual(['false']);
 act(()=>tree!.unmount());expect(consulta.removeEventListener).toHaveBeenCalledWith('change',cambio);
});
