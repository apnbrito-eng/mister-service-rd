import {expect,it,vi} from 'vitest';
import {resolverEnlaceMapa} from '../../api/_lib/resolverEnlaceMapa';
it('resuelve el enlace corto sin descargar la página final',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:'https://www.google.com/maps/?q=18.49,-70'}}));
 expect(await resolverEnlaceMapa('https://maps.app.goo.gl/ejemplo',fetcher)).toContain('q=18.49,-70');
 expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
});
it.each(['http://maps.app.goo.gl/a','https://maps.app.goo.gl.evil.com/a','https://127.0.0.1/a','https://user:password@maps.app.goo.gl/a','https://goo.gl/otra','https://maps.app.goo.gl:8443/a'])('rechaza destino inicial %s',async url=>{
 const f=vi.fn();await expect(resolverEnlaceMapa(url,f)).rejects.toThrow();expect(f).not.toHaveBeenCalled();
});
it('valida cada redirección antes de consultar el siguiente destino',async()=>{
 const f=vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}}));
 await expect(resolverEnlaceMapa('https://maps.app.goo.gl/a',f)).rejects.toThrow();expect(f).toHaveBeenCalledTimes(1);
});
it('detiene ciclos y errores del proveedor',async()=>{
 const f=vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:'https://maps.app.goo.gl/a'}}));
 await expect(resolverEnlaceMapa('https://maps.app.goo.gl/a',f)).rejects.toThrow('ciclo');
 await expect(resolverEnlaceMapa('https://maps.app.goo.gl/a',vi.fn().mockResolvedValue(new Response(null,{status:404})))).rejects.toThrow();
});
