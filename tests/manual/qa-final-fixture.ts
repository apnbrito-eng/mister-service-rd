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
export const increment = (n: number) => n;
export const deleteField = () => null;
export const initializeApp = bloqueada, deleteApp = bloqueada, getAuth = () => auth;
export const sendPasswordResetEmail = bloqueada, signInWithEmailAndPassword = bloqueada;
export const subirFotoPieza = bloqueada;
const actual = new Date(); const anio = actual.getFullYear(), mes = actual.getMonth();
const dia = (n: number) => Timestamp.fromDate(new Date(anio, mes, n, 12));
const incompleto = new URLSearchParams(location.search).has('incompleto');
const perdida = new URLSearchParams(location.search).has('perdida');
if (!incompleto) datos.ordenes_servicio[2].pagos = [];
datos.personal.push({ id: 'qa-legacy', nombre: 'Técnico sin cuenta (ficticio)', rol: 'tecnico', activo: true, sueldoBase: 10000 }, { id: 'qa-inactivo', uid: 'qa-inactivo-uid', nombre: 'Empleado inactivo ficticio', rol: 'tecnico', activo: false });
datos.personal.forEach(p => Object.assign(p, { telefono: '8095550199', email: 'qa@example.invalid', especialidad: 'Ensayo', zona: 'Local', disponibilidad: true, color: '#163b63', createdAt: fecha(), sueldoBase: p.sueldoBase || 12000, comisionPorcentaje: 0 }));
datos.personal.find(p => p.id === 'p-tec').operariaId = 'qa-operaria';
datos.ordenes_servicio[0].enStandby = true;
datos.ordenes_servicio[0].standbyDesde = fecha(-12);
datos.standby_piezas = ['buscando', 'llego'].map((estado, i) => ({ id: `qa-pieza-${i}`, ordenId: 'qa-os-1', ordenNumero: 'OS-ENSAYO-1', clienteNombre: cliente.nombre, equipoTipo: 'Nevera', equipoMarca: 'Marca ficticia', equipoModelo: 'MOD-QA', piezaFaltante: i ? 'Termostato de ensayo' : 'Compresor de ensayo', tecnicoNombre: 'Técnico ficticio', estado, activa: true, fechaInicio: fecha(-12), createdAt: fecha(-12), notas: 'Información ficticia. No enviar.' }));
datos.movimientos_piezas = [];
datos.suplidores = [
 { id: 's1', nombre: 'Suplidor de ensayo activo', telefono: '8095550101', telefonoNormalizado: '18095550101', especialidad: 'Refrigeración', activo: true },
 { id: 's2', nombre: 'Suplidor de ensayo inactivo', telefono: '8095550102', telefonoNormalizado: '18095550102', especialidad: 'Lavadoras', activo: false },
];
datos.facturas = [{ id: 'qa-cg', numero: 'CG-QA-1', fechaEmision: dia(5), subtotal: 10000, total: 10000, itbisMonto: 0, costoPiezas: perdida ? 12000 : 2500, estado: 'emitida' }];
datos.gastos = [{ id: 'qa-g', fecha: dia(5), monto: 800, categoria: 'transporte' }];
datos.comisiones = [];
datos.liquidaciones_nomina = [14, Math.min(29, new Date(anio, mes + 1, 0).getDate())].map((n, i) => ({ id: `qa-n${i}`, periodoFin: dia(n), quincena: `${anio}-${String(mes + 1).padStart(2,'0')}-Q${i+1}`, estado: 'cerrada', empleados: [{ personalId: 'p-tec', sueldoBase: 1000, totalComisiones: 200, bono: 0, totalAsistencia: 0 }] }));
if (incompleto) { datos.facturas.push({ id: 'qa-cg-invalido', total: 800 }); datos.comisiones.push({ id: 'qa-c-fecha', comisionMonto: 100, ordenNumero: 'OS-QA-SIN-FECHA' }); }
