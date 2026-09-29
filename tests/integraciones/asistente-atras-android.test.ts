import { afterEach, expect, it, vi } from 'vitest';
const movil = vi.hoisted(() => ({ atras: undefined as undefined | ((e:{canGoBack:boolean})=>void), minimizar: vi.fn() }));
vi.mock('@capacitor/core', () => ({Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android'},CapacitorHttp:{request:vi.fn()}}));
vi.mock('@capacitor/app', () => ({App:{addListener:vi.fn(async (_:string, callback:any)=>{movil.atras=callback;}),minimizeApp:movil.minimizar}}));
vi.mock('@capacitor-firebase/app-check', () => ({FirebaseAppCheck:{getToken:vi.fn()}}));
import { iniciarRuntimeMovil } from '../../src/mobile/runtime';
import { registrarCierreCapa, cerrarCapaSuperior } from '../../src/mobile/capas';
afterEach(()=>{while(cerrarCapaSuperior()) { /* limpiar */ } vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});
it('el listener real prioriza capa y luego permite history/minimizar', async()=>{
 const back=vi.fn(), cerrar=vi.fn();
 vi.stubEnv('VITE_MOBILE_API_ORIGIN','https://example.com');
 vi.stubGlobal('window',{fetch:vi.fn()});vi.stubGlobal('document',{documentElement:{classList:{add:vi.fn()}}});vi.stubGlobal('history',{back});
 await iniciarRuntimeMovil();
 const limpiar=registrarCierreCapa(cerrar);
 movil.atras!({canGoBack:true});expect(cerrar).toHaveBeenCalledOnce();expect(back).not.toHaveBeenCalled();expect(movil.minimizar).not.toHaveBeenCalled();limpiar();
 movil.atras!({canGoBack:true});expect(back).toHaveBeenCalledOnce();
 movil.atras!({canGoBack:false});expect(movil.minimizar).toHaveBeenCalledOnce();
});
it('capas se cierran en orden inverso y cleanup no borra otra capa',()=>{
 const eventos:string[]=[];
 const a=registrarCierreCapa(()=>eventos.push('a'));
 const b=registrarCierreCapa(()=>eventos.push('b'));
 expect(cerrarCapaSuperior()).toBe(true);b();expect(eventos).toEqual(['b']);
 expect(cerrarCapaSuperior()).toBe(true);a();expect(eventos).toEqual(['b','a']);expect(cerrarCapaSuperior()).toBe(false);
});
