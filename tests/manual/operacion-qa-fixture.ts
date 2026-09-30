export const db = {}, storage = {}, auth = { currentUser: { uid: 'qa-oficina' } };
export const useApp = () => ({ userProfile: { id: 'qa-oficina', rol: 'administrador', activo: true, nombre: 'Oficina ficticia' }, currentUser: auth.currentUser });
export const useTiposEquipo = () => ['Nevera', 'Lavadora', 'Aire acondicionado'];
export class Timestamp {
 constructor(public seconds: number) {}
 static now() { return Timestamp.fromDate(new Date()); }
 static fromDate(d: Date) { return new Timestamp(d.getTime() / 1000); }
 toDate() { return new Date(this.seconds * 1000); }
}
const fecha = (dias = 0) => { const d = new Date(); d.setDate(d.getDate() + dias); d.setHours(12, 0, 0, 0); return Timestamp.fromDate(d); };
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const cliente = { id: 'qa-cliente', nombre: 'Cliente ficticio con nombre largo para revisar móvil', telefono: '8095550199', direccion: 'Dirección de ensayo local', activo: true };
const baseOrden = { clienteId: cliente.id, clienteNombre: cliente.nombre, clienteTelefono: cliente.telefono, tecnicoId: 'qa-tecnico', tecnicoNombre: 'Técnico ficticio', equipoTipo: 'Nevera', equipoMarca: 'Marca de ensayo', responsableId: 'qa-oficina', createdAt: fecha(), updatedAt: fecha(), fechaCita: fecha(), historialFases: [], fase: 'cerrado', estado: 'completado', estadoSimple: 'completado', cierreServicio: { fechaCierre: fecha() }, precioFinal: 2500 };
const datos: Record<string, any[]> = {
 clientes: [cliente],
 personal: [{ id: 'p-of', uid: 'qa-oficina', nombre: 'Oficina ficticia', rol: 'administrador', activo: true }, { id: 'p-op', uid: 'qa-operaria', nombre: 'Operaria ficticia', rol: 'operaria', activo: true }, { id: 'p-tec', uid: 'qa-tecnico', nombre: 'Técnico ficticio', rol: 'tecnico', activo: true }],
 mantenimiento: [-3, 0, 7].map((dias, i) => ({ id: `qa-m-${i}`, clienteId: cliente.id, clienteNombre: cliente.nombre, clienteTelefono: cliente.telefono, equipoTipo: ['Nevera', 'Lavadora', 'Aire acondicionado'][i], frecuencia: 'trimestral', proximaFecha: fecha(dias), activo: true, tecnicoId: 'qa-tecnico' })).concat([{ id: 'qa-invalido', clienteId: cliente.id, activo: true } as any]),
 ordenes_servicio: [
  { ...baseOrden, id: 'qa-os-1', numero: 'OS-ENSAYO-1', soloChequeo: true, seguimientoChequeo: { responsableUid: 'qa-operaria', proximaFecha: hoy, resultado: 'pendiente', nota: 'Preparar propuesta, sin enviar durante ensayo.' }, pagos: [{ id: 'qa-p1', monto: 1500, metodo: 'efectivo', fecha: fecha(), verificado: true }] },
  { ...baseOrden, id: 'qa-os-2', numero: 'OS-ENSAYO-2', pagos: [{ id: 'qa-p2', monto: 2500, metodo: 'transferencia', bancoId: 'qa-b', bancoNombre: 'Banco ficticio', fecha: fecha(), verificado: true }, { id: 'qa-p3', monto: 700, metodo: 'transferencia', bancoId: 'qa-b', fecha: fecha(), verificado: false }] },
  { ...baseOrden, id: 'qa-os-3', numero: 'OS-ENSAYO-3', fase: 'en_diagnostico', sugerenciasSoloChequeo: [{ id: 'qa-sug', estado: 'pendiente', sugeridaPor: 'qa-tecnico', sugeridaPorNombre: 'Técnico ficticio', fechaSugerencia: fecha(), motivo: 'Cliente desea esperar para tomar una decisión.', montoChequeo: 1500 }], pagos: [{ id: 'qa-invalido', monto: 500, metodo: 'efectivo', verificado: true }] },
 ],
 facturas: [{ id: 'qa-cg', numero: 'CG-ENSAYO-1', clienteNombre: cliente.nombre, ordenId: 'qa-os-1', fechaEmision: fecha(), createdAt: fecha(), total: 1500, estado: 'pagada' }],
 cierres_dia: [], whatsapp_conversaciones: [], usuarios: [{ id: 'qa-oficina', rol: 'administrador', activo: true }],
};
export const collection = (_: unknown, path: string) => ({ path });
export const doc = (a: any, path?: string, id?: string) => typeof path === 'string' ? ({ path, id }) : ({ path: a.path, id: 'qa-nuevo' });
export const query = (ref: any, ...filters: any[]) => ({ ...ref, filters });
export const where = (...args: any[]) => args;
export const orderBy = (...args: any[]) => args;
export const limit = (...args: any[]) => args;
const snapshot = (ref: any) => { const docs = (datos[ref.path] || []).filter(d => !ref.filters || ref.filters.every(([field, op, value]: any[]) => op !== '==' || d[field] === value)).map(d => ({ id: d.id, ref: { path: ref.path, id: d.id }, data: () => ({ ...d }), exists: () => true })); return { docs, size: docs.length, empty: !docs.length }; };
export function onSnapshot(ref: any, cb: (s: any) => void) { cb(snapshot(ref)); return () => {}; }
export async function getDocs(ref: any) { return snapshot(ref); }
export async function getDoc(ref: any) { const item = (datos[ref.path] || []).find(d => d.id === ref.id); return { id: ref.id, exists: () => !!item, data: () => item }; }
const bloqueada = () => { throw new Error('ENSAYO LOCAL: escritura bloqueada, ningún dato real fue modificado.'); };
export const addDoc = bloqueada, setDoc = bloqueada, updateDoc = bloqueada, deleteDoc = bloqueada, runTransaction = bloqueada, writeBatch = bloqueada;
export const arrayUnion = (...args: any[]) => args;
export const serverTimestamp = Timestamp.now;
export const normalizarTelefono = (tel: string) => tel.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
export async function buscarClientePorTelefono(tel: string) { return normalizarTelefono(tel) === cliente.telefono ? { id: cliente.id, data: cliente } : null; }
export const buscarOCrearCliente = bloqueada, siguienteNumeroOrden = bloqueada, crearNotificacion = bloqueada, resolverSugerenciaSoloChequeoConNotif = bloqueada;
