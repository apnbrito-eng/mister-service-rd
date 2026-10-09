import {expect,it,vi} from 'vitest';
import {validarConteosSidebar} from '../../src/hooks/useConteosSidebar';
it('valida cero conocido, fallo independiente y fecha RD fresca',()=>{
 const ahora=new Date('2026-10-09T05:00:00Z');
 expect(validarConteosSidebar({fechaRD:'2026-10-09',consultadoEn:ahora.toISOString(),conteos:{clientes:{estado:'disponible',total:0},ordenes:{estado:'error'}}},ahora)).toEqual({counts:{clientes:0},estados:{clientes:'disponible',ordenes:'error'}});
 expect(()=>validarConteosSidebar({fechaRD:'2026-10-08',consultadoEn:ahora.toISOString(),conteos:{}},ahora)).toThrow();
 expect(()=>validarConteosSidebar({fechaRD:'2026-10-09',consultadoEn:'2026-10-09T04:00:00Z',conteos:{}},ahora)).toThrow();
 expect(()=>validarConteosSidebar({fechaRD:'2026-10-09',consultadoEn:ahora.toISOString(),conteos:{clientes:{estado:'disponible',total:-1}}},ahora)).toThrow();
});
import React from 'react';
import {act,create} from 'react-test-renderer';
import {useConteosSidebar} from '../../src/hooks/useConteosSidebar';
const transport=vi.hoisted(()=>({usuario:{uid:'a',getIdToken:vi.fn(async()=> 'id')},check:{},callbacks:[] as Array<(v:unknown)=>void>}));
vi.mock('../../src/firebase/config',()=>({auth:{get currentUser(){return transport.usuario;}},appCheck:transport.check}));
vi.mock('firebase/app-check',()=>({getToken:vi.fn(async()=>({token:'appcheck'}))}));
it('no solapa requests y descarta respuesta de UID previo y permisos revocados',async()=>{
 vi.useFakeTimers();const listeners=new Map<string,()=>void>();
 vi.stubGlobal('document',{visibilityState:'visible',addEventListener:(k:string,f:()=>void)=>listeners.set(k,f),removeEventListener:(k:string)=>listeners.delete(k)});
 const fetcher=vi.fn(()=>new Promise(resolve=>transport.callbacks.push(resolve)));vi.stubGlobal('fetch',fetcher);
 let resultado:ReturnType<typeof useConteosSidebar>;
 function Vista({uid,permitir=true}:{uid:string;permitir?:boolean}){resultado=useConteosSidebar(uid,{rol:'administrador',permisosPersonalizados:true,permisosSistema:{clientesVer:permitir,ordenesVer:permitir}} as never);return null;}
 let tree:ReturnType<typeof create>;await act(async()=>{tree=create(React.createElement(Vista,{uid:'a'}));});
 expect(fetcher).toHaveBeenCalledOnce();expect(fetcher.mock.calls[0][1].headers['X-Firebase-AppCheck']).toBe('appcheck');
 await act(async()=>{vi.advanceTimersByTime(60000);});expect(fetcher).toHaveBeenCalledOnce();
 transport.usuario.uid='b';await act(async()=>tree.update(React.createElement(Vista,{uid:'b'})));expect(resultado!.estados.clientes).toBe('cargando');
 const respuesta={ok:true,json:async()=>({fechaRD:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),consultadoEn:new Date().toISOString(),conteos:{clientes:{estado:'disponible',total:99}}})};
 await act(async()=>{transport.callbacks[0](respuesta);});expect(resultado!.counts.clientes).toBeUndefined();
 await act(async()=>tree.update(React.createElement(Vista,{uid:'b',permitir:false})));expect(resultado!.counts.clientes).toBeUndefined();
 await act(async()=>{transport.callbacks[1](respuesta);});expect(resultado!.counts.clientes).toBeUndefined();
 act(()=>tree.unmount());vi.useRealTimers();vi.unstubAllGlobals();transport.usuario.uid='a';transport.callbacks=[];
});
