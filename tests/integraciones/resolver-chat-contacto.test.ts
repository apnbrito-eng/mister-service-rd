import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({getDoc:vi.fn(),getDocs:vi.fn()}));
vi.mock('firebase/firestore',()=>({collection:(_db:unknown,n:string)=>n,doc:(_db:unknown,c:string,id:string)=>({c,id}),where:(campo:string,_op:string,v:string)=>({campo,v}),query:(c:unknown,w:unknown)=>({c,w}),getDoc:mocks.getDoc,getDocs:mocks.getDocs}));
vi.mock('../../src/firebase/config',()=>({db:{}}));
vi.mock('../../src/services/clientes.service',()=>({normalizarTelefono:(t:string)=>{const d=t.replace(/\D/g,'');return d.length===10?d:d.length===11&&d.startsWith('1')?d.slice(1):'';}}));
import { resolverChatContacto } from '../../src/utils/resolverChatCliente';
function snap(id:string,data?:Record<string,unknown>){return{id,exists:()=>!!data,data:()=>data};}
beforeEach(()=>{vi.clearAllMocks();mocks.getDocs.mockResolvedValue({docs:[]});mocks.getDoc.mockImplementation(async (ref:{id:string})=>snap(ref.id));});
it('contacto nuevo abre número RD sin escribir ni inventar cliente',async()=>{
 expect(await resolverChatContacto({telefono:'8494580318',nombre:'QA'})).toEqual({waId:'18494580318',telefono:'8494580318',nombre:'QA'});
 expect(mocks.getDocs).toHaveBeenCalledExactlyOnceWith({c:'clientes',w:{campo:'telefonoNormalizado',v:'8494580318'}});
});
it('rechaza internacional incompatible antes de consultar',async()=>{await expect(resolverChatContacto({telefono:'+348494580318'})).rejects.toThrow('compatible');expect(mocks.getDocs).not.toHaveBeenCalled();});
it('rechaza duplicados de ficha sin escoger arbitrariamente',async()=>{mocks.getDocs.mockResolvedValueOnce({docs:[snap('a',{telefono:'8494580318'}),snap('b',{telefono:'8494580318'})]});await expect(resolverChatContacto({telefono:'8494580318'})).rejects.toThrow('varias fichas');});
it('identidad explícita con teléfono ajeno queda bloqueada',async()=>{mocks.getDoc.mockResolvedValueOnce(snap('a',{telefono:'8095550000'}));await expect(resolverChatContacto({clienteId:'a',telefono:'8494580318'})).rejects.toThrow('no coincide');});
it('conserva conversación legacy de diez dígitos y vínculo canónico válido',async()=>{
 mocks.getDocs.mockResolvedValueOnce({docs:[]});
 mocks.getDoc.mockImplementation(async(ref:{c:string,id:string})=>ref.c==='clientes'?snap('c',{telefono:'8494580318',nombre:'QA'}):ref.id==='8494580318'?snap(ref.id,{clienteId:'c'}):snap(ref.id));
 expect(await resolverChatContacto({telefono:'8494580318'})).toEqual({waId:'8494580318',clienteId:'c',telefono:'8494580318',nombre:'QA'});
});
it('vínculo huérfano no se convierte en contacto nuevo',async()=>{
 mocks.getDoc.mockImplementation(async(ref:{c:string,id:string})=>ref.c==='whatsapp_conversaciones'&&ref.id==='18494580318'?snap(ref.id,{clienteId:'no-existe'}):snap(ref.id));
 await expect(resolverChatContacto({telefono:'8494580318'})).rejects.toThrow('incompatible');
});

it('cliente explícito no evade vínculo legacy de diez dígitos a otra ficha', async()=>{
 mocks.getDoc.mockImplementation(async(ref:{c:string,id:string})=>ref.c==='clientes'?snap('c',{telefono:'8494580318'}):ref.id==='8494580318'?snap(ref.id,{clienteId:'ajeno'}):snap(ref.id));
 await expect(resolverChatContacto({clienteId:'c',telefono:'8494580318'})).rejects.toThrow('otro cliente');
});
it('documentos de conversación duplicados 10/11 bloquean contacto sin inventar un merge',async()=>{
 mocks.getDoc.mockImplementation(async(ref:{id:string})=>snap(ref.id,{}));
 await expect(resolverChatContacto({telefono:'8494580318'})).rejects.toThrow('dos conversaciones');
});
