import React from 'react';
import { equipoApi as gestionApi, useApp } from './crm-fixture';
export { useApp };
export const db = {};
export const storage = {};
export const doc = (...args: unknown[]) => args;
export const arrayUnion = (...args: unknown[]) => args;
export async function updateDoc() { throw Error('Escrituras Firebase bloqueadas en este ensayo'); }
export const auth = { currentUser: { uid: 'admin' } };
export const collection = (...args: unknown[]) => args;
export const query = (...args: unknown[]) => args;
export const where = (...args: unknown[]) => args;
export const Timestamp = { now: () => new Date(), fromDate: (d: Date) => d };
const cliente = { id: 'cliente-demo', nombre: 'Laura · ejemplo ficticio', telefono: '8095550100', direccion: 'Calle de ejemplo, edificio 12', sector: 'Sector de prueba', ciudad: 'Santo Domingo', email: 'ejemplo@example.com', lat: 18.48, lng: -69.94 };
export const normalizarTelefono = (t: string) => t.replace(/\D/g, '').slice(-10);
export async function buscarClientePorTelefono() { if (location.search.includes('error=ficha')) throw Error('Prueba de error'); return { id: cliente.id, data: { ...cliente } }; }
export async function actualizarCliente(_id: string, data: object) { if (location.search.includes('error=guardar')) throw Error('Prueba de error'); Object.assign(cliente, data); }
export async function obtenerTodasOrdenesPorTelefono() { return [{ id: 'demo', numero: 'PRUEBA-001', equipoTipo: 'Lavadora', equipoMarca: 'Mabe', fase: 'en_diagnostico', tecnicoNombre: 'Técnico de ejemplo', operariaNombre: 'Operaria de ejemplo', clienteTelefono: cliente.telefono, createdAt: new Date(), historialFases: [], auditoria: [] }]; }
export async function getDocs() {
 if (location.search.includes('error=garantias')) throw Error('Prueba de error');
 return { docs: [{ id: 'factura-demo', data: () => ({ numero: 'PRUEBA-GARANTIA', ordenId: 'demo', total: 8000, equipoTipo: 'Lavadora', fechaEmision: { toDate: () => new Date() }, garantia: { estado: 'vigente', tiempoDias: 90, finFecha: new Date(Date.now() + 86400000 * 90) } }) }] };
}
export async function equipoApi<T>(ruta: string, body?: unknown): Promise<T> {
 if (ruta.includes('/atencion')) {
   if (body) throw Error('Cambios de atención deshabilitados en esta prueba');
   return { carteraNombre: 'Titular de cartera · ejemplo', atencion: { responsableId: 'otra', responsableNombre: 'Atención de ejemplo', pendiente: true, version: 1 }, equipo: [], ordenes: [], redactando: [] } as T;
 }
 if (ruta.includes('/expediente')) {
   if (body) throw Error('Guardado deshabilitado en esta prueba');
   return { items: [{ id: 'nota-demo', texto: 'Llamar antes de llegar. Nota ficticia para comprobar la ficha.', categoria: 'otro', autorNombre: 'Oficina de ejemplo', fechaMs: Date.now() }], cursor: null } as T;
 }
 return gestionApi<T>(ruta, body);
}
export async function enviarTexto() { throw Error('No se envían mensajes en la vista de prueba'); }
export const suscribirMensajes = (_id: string, cb: (a: unknown[]) => void) => { cb([]); return () => {}; };
export default function AccionFacturacionPrueba() { return <p className="text-xs text-gray-500">Facturación disponible en la aplicación conectada.</p>; }
