export const db = {}; export const storage = {}; export const auth = { currentUser: { uid: 'qa-local' } };
export const useApp = () => ({ userProfile: { uid: 'qa-local', id: 'qa-local', rol: 'administrador', nombre: 'Administración · ensayo' }, currentUser: auth.currentUser });
export class Timestamp { constructor(public seconds: number) {} static now() { return Timestamp.fromDate(new Date()); } static fromDate(d: Date) { return new Timestamp(d.getTime()/1000); } toDate() { return new Date(this.seconds*1000); } }
export const collection = (_: unknown, path: string) => ({ path });
export const doc = (_: unknown, path: string, id: string) => ({ path, id });
export const query = (ref: unknown, ...filters: unknown[]) => ({ ...(ref as object), filters });
export const where = (...args: unknown[]) => args; export const orderBy = (...args: unknown[]) => args;
const clientes = [{ id:'qa-a', nombre:'Cliente de prueba A', telefono:'8095550100', direccion:'Dirección ficticia A', zona:'Distrito Nacional', sector:'Sector de prueba', ciudad:'Santo Domingo', lat:18.48, lng:-69.94, createdAt:Timestamp.now() }, { id:'qa-b', nombre:'Cliente de prueba B con nombre largo para verificar distribución', telefono:'8295550101', direccion:'Dirección ficticia B', zona:'Distrito Nacional', createdAt:Timestamp.now() }];
const listeners = new Set<(s: unknown) => void>();
const snapshot = () => ({ docs: clientes.map(c => ({ id:c.id, data:() => ({...c}) })) });
export function onSnapshot(_: unknown, cb: (s: unknown) => void) { listeners.add(cb); cb(snapshot()); return () => { listeners.delete(cb); }; }
export async function getDoc() { return {exists:()=>false,data:()=>({})}; }
export async function getDocs() { return {docs:[]}; }
export async function updateDoc() { throw Error('Escritura fuera del contrato de ensayo bloqueada'); }
export function normalizarTelefono(t:string) { const n=t.replace(/\D/g,''); return n.length===11 && n.startsWith('1')?n.slice(1):n.length===10?n:''; }
export async function actualizarCliente(id:string, data:object) { if (location.search.includes('error=guardar')) throw Error('Fallo simulado'); const c=clientes.find(v=>v.id===id); if(!c) throw Error('Cliente no encontrado'); Object.assign(c,data); listeners.forEach(cb=>cb(snapshot())); }
export async function buscarClientePorTelefono(t:string) { const c=clientes.find(v=>v.telefono===normalizarTelefono(t)); return c?{id:c.id,data:c}:null; }
export async function buscarOCrearCliente() { throw Error('Alta no incluida en este ensayo de lista'); }
