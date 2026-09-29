import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>vi.fn());
vi.mock('../../src/services/equipoApi',()=>({equipoApi:api}));
import {useConteosBandeja} from '../../src/hooks/useConteosBandeja';
let r:any;
function Vista({uid}:{uid?:string}){return React.createElement('output',null,JSON.stringify(useConteosBandeja(uid)));}
afterEach(()=>{if(r)act(()=>r.unmount());r=null;vi.useRealTimers();vi.unstubAllGlobals();api.mockReset();});
it('actualiza cada quince segundos, no convierte errores en cero y cancela al salir',async()=>{
 vi.useFakeTimers();vi.stubGlobal('document',{hidden:false,addEventListener:vi.fn(),removeEventListener:vi.fn()});vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 api.mockResolvedValue({conteos:{no_leidos:3,cartera:2,mias:1,hoy:4,pendientes:1}});
 await act(async()=>{r=create(React.createElement(Vista,{uid:'yo'}));});
 expect(JSON.stringify(r.toJSON())).toContain('no_leidos');expect(api).toHaveBeenCalledTimes(1);
 api.mockRejectedValue(new Error('Sin red'));
 await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});
 expect(r.root.findByType('output').children.join('')).toBe('{"uid":"yo","error":true}');
 await act(async()=>{r.update(React.createElement(Vista,{}));});
 expect(r.root.findByType('output').children.join('')).toBe('{"error":false}');
 await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});expect(api).toHaveBeenCalledTimes(2);
});
