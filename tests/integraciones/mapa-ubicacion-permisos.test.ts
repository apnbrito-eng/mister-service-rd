import {beforeEach,expect,it,vi} from 'vitest';
import type {VercelRequest,VercelResponse} from '@vercel/node';
const m=vi.hoisted(()=>({perfil:{permisosPersonalizados:true,permisosSistema:{clientesCrear:false,clientesModificar:false}},rol:'operaria',resolver:vi.fn()}));
vi.mock('../../api/_lib/accesoEquipo.js',()=>({ErrorAcceso:class extends Error{},accesoEquipo:async()=>({uid:'qa',rol:m.rol,db:{collection:()=>({doc:()=>({get:async()=>({data:()=>m.perfil})})})}})}));
vi.mock('../../api/_lib/resolverEnlaceMapa.js',()=>({resolverEnlaceMapa:m.resolver}));
import handler from '../../api/mapa/ubicacion';
async function consultar(){let status=200;const res={setHeader(){},status(s:number){status=s;return this;},json(){return this;}};await handler({method:'POST',body:{enlace:'https://maps.app.goo.gl/qa'}} as VercelRequest,res as unknown as VercelResponse);return status;}
beforeEach(()=>{m.perfil={permisosPersonalizados:true,permisosSistema:{clientesCrear:false,clientesModificar:false}};m.rol='operaria';m.resolver.mockReset();m.resolver.mockResolvedValue('https://www.google.com/maps/?q=18,-70');});
it('permite resolver al registrar cuando tiene clientesCrear',async()=>{m.perfil.permisosSistema.clientesCrear=true;expect(await consultar()).toBe(200);});
it('conserva acceso de clientesModificar',async()=>{m.perfil.permisosSistema.clientesModificar=true;expect(await consultar()).toBe(200);});
it('rechaza perfil sin ninguno de los dos permisos',async()=>{expect(await consultar()).toBe(403);expect(m.resolver).not.toHaveBeenCalled();});
it('no amplía el acceso al técnico aunque un permiso figure activado',async()=>{m.rol='tecnico';m.perfil.permisosSistema.clientesCrear=true;expect(await consultar()).toBe(403);expect(m.resolver).not.toHaveBeenCalled();});
