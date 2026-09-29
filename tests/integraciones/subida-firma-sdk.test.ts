import {expect,it,vi} from 'vitest';
import {Storage} from '@google-cloud/storage';
it('SDK firma longitud exacta y precondición create-only sin duplicar content-type',async()=>{
 const storage=new Storage({projectId:'demo-firma-local'});
 const credentials=vi.spyOn(storage.authClient,'getCredentials').mockResolvedValue({client_email:'qa@example.invalid'});
 const sign=vi.spyOn(storage.authClient,'sign').mockResolvedValue(Buffer.from('firma-ficticia').toString('base64'));
 try{
  const [url]=await storage.bucket('bucket-qa').file('ruta-qa').getSignedUrl({version:'v4',action:'write',expires:Date.now()+60000,contentType:'image/png',extensionHeaders:{'content-type':'image/png','content-length':'123','x-goog-if-generation-match':'0','x-goog-meta-permiso-publico':'qa'}});
  const headers=new URL(url).searchParams.get('X-Goog-SignedHeaders')!.split(';');expect(headers).toContain('content-length');expect(headers).toContain('x-goog-if-generation-match');expect(headers.filter(h=>h==='content-type')).toHaveLength(1);expect(sign).toHaveBeenCalledTimes(1);
 }finally{credentials.mockRestore();sign.mockRestore();}
});
