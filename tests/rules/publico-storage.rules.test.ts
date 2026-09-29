import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,describe,it} from 'vitest';
import {initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {ref,uploadBytes} from 'firebase/storage';
let env:RulesTestEnvironment;
describe.skipIf(!process.env.FIREBASE_STORAGE_EMULATOR_HOST)('Storage público solo permisos servidor, staff conservado',()=>{
 beforeAll(async()=>{env=await initializeTestEnvironment({projectId:'demo-subida-storage',storage:{host:'127.0.0.1',port:9199,rules:readFileSync('storage.rules','utf8')}});});afterAll(async()=>{await env.cleanup();});
 for(const path of ['fotos-equipos-publico/qa/a.jpg','solicitudes-publico/qa/foto/a.jpg','citas_publicas/qa/a.jpg'])it(`rechaza visitante y preserva staff: ${path}`,async()=>{
  await assertFails(uploadBytes(ref(env.unauthenticatedContext().storage(),path),new Uint8Array([1]),{contentType:'image/jpeg'}));
  await assertSucceeds(uploadBytes(ref(env.authenticatedContext('qa').storage(),path),new Uint8Array([1]),{contentType:'image/jpeg'}));
 });
});
