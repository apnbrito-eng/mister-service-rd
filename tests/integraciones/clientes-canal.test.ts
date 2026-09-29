import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),directo:vi.fn(async()=>({exists:()=>false}))}));
vi.mock('firebase/firestore',()=>({getDoc:m.directo,doc:vi.fn(),getDocs:m.get,collection:vi.fn(),query:vi.fn(),where:vi.fn()}));
vi.mock('../../src/firebase/config',()=>({db:{}}));
vi.mock('../../src/services/clientes.service',()=>({normalizarTelefono:(v:string)=>/^\d{10}$/.test(v)?v:''}));
import {resolverChatCliente,numeroWhatsAppCliente} from '../../src/utils/resolverChatCliente';
it('abre contexto sin crear conversación y conserva el ID existente exacto',async()=>{
 const c={id:'cliente',telefono:'8095551234'}as any;m.get.mockResolvedValue({docs:[]});expect(await resolverChatCliente(c)).toBe('18095551234');
 m.get.mockResolvedValue({docs:[{id:'8095551234'}]});expect(await resolverChatCliente(c)).toBe('8095551234');
 m.get.mockResolvedValue({docs:[{id:'18095559999'}]});await expect(resolverChatCliente(c)).rejects.toThrow('otro teléfono');
});
it('no produce enlaces vacíos ni trunca internacionales',()=>{expect(numeroWhatsAppCliente('+34915551234')).toBeNull();expect(numeroWhatsAppCliente('8095551234')).toBe('18095551234');});

it('rechaza conversación por número vinculada a otro cliente',async()=>{m.get.mockResolvedValue({docs:[]});m.directo.mockResolvedValueOnce({exists:()=>true,data:()=>({clienteId:'otro'})}as any);await expect(resolverChatCliente({id:'a',telefono:'8095551234'}as any)).rejects.toThrow('otro cliente');});
