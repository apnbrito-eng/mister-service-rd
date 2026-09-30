import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { doc, getDoc, collection, getDocs, Timestamp } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';
const contexto = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('../../src/firebase/config', () => ({ get db() { return contexto.db; }, auth: { currentUser: { uid: 'admin-uid' } } }));
import { generarOcurrenciaMantenimiento } from '../../src/services/generarMantenimiento.service';
const fecha = new Date('2026-09-29T16:00:00Z'), siguiente = new Date('2026-10-29T16:00:00Z');
const payload = { numero: 'OS-0999', clienteId: 'c', clienteNombre: 'Ensayo', tecnicoId: UID.tecnico, equipoTipo: 'Nevera', fase: 'agendado', estado: 'activo', estadoSimple: 'agendado', createdAt: Timestamp.fromDate(fecha), updatedAt: Timestamp.fromDate(fecha) };
beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => { await resetearConPerfiles(); contexto.db = como(UID.admin); await sembrar('mantenimiento/m', { ...payload, frecuencia: 'mensual', activo: true, proximaFecha: Timestamp.fromDate(fecha) }); });
it('dos solicitudes simultáneas convergen con reglas reales y un solo avance', async () => {
 const resultados = await Promise.all([generarOcurrenciaMantenimiento('m', fecha, siguiente, payload, 'mensual'), generarOcurrenciaMantenimiento('m', fecha, siguiente, payload, 'mensual')]);
 expect(resultados.filter(r => r.creada)).toHaveLength(1);
 expect((await getDocs(collection(como(UID.admin), 'ordenes_servicio'))).size).toBe(1);
 expect((await getDoc(doc(como(UID.admin), 'mantenimiento/m'))).data()?.proximaFecha.toDate()).toEqual(siguiente);
});
it('reprogramación concurrente invalida snapshot anterior', async () => {
 await sembrar('mantenimiento/m', { ...payload, frecuencia: 'mensual', activo: true, proximaFecha: Timestamp.fromDate(siguiente) });
 await expect(generarOcurrenciaMantenimiento('m', fecha, siguiente, payload, 'mensual')).rejects.toThrow('cambió');
 expect((await getDocs(collection(como(UID.admin), 'ordenes_servicio'))).size).toBe(0);
});
