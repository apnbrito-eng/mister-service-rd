import { afterEach, expect, it, vi } from 'vitest';
const acceso=vi.hoisted(()=>vi.fn());
vi.mock('../../api/_lib/accesoEquipo.js',()=>({accesoEquipo:acceso,ErrorAcceso:class extends Error{constructor(public status:number,mensaje:string){super(mensaje);}}}));
vi.mock('../../api/_lib/firebaseAdmin.js',()=>({getAdminStorage:vi.fn()}));
import { ErrorAcceso } from '../../api/_lib/accesoEquipo';
import handler from '../../api/whatsapp/media-proxy';
afterEach(()=>{vi.restoreAllMocks();acceso.mockReset();});
async function llamar(){const res:any={status:vi.fn().mockReturnThis(),json:vi.fn()};await handler({method:'POST',body:{}} as any,res);return res;}
it('registra fallo inesperado de acceso sin exponer mensaje ni credenciales',async()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});acceso.mockRejectedValue(new Error('Bearer secreto URL https://privada.example'));
 const res=await llamar();expect(res.status).toHaveBeenCalledWith(500);expect(res.json).toHaveBeenCalledWith({error:'Acceso no autorizado.'});
 expect(log).toHaveBeenCalledWith('[wa/media-proxy] fallo inesperado',{etapa:'acceso-equipo',clase:'error'});expect(JSON.stringify(log.mock.calls)).not.toContain('secreto');
});
it('preserva rechazo esperado sin registrarlo como avería',async()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});acceso.mockRejectedValue(new ErrorAcceso(401,'Token rechazado'));
 const res=await llamar();expect(res.status).toHaveBeenCalledWith(401);expect(log).not.toHaveBeenCalled();
});
