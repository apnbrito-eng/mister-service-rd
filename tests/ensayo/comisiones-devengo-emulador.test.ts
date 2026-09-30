import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocs, collection, getDoc } from 'firebase/firestore';
import type { OrdenServicio, Usuario, ItemCotizacion } from '../../src/types';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Sólo emulador local8080.');
let env: RulesTestEnvironment;
let oficina1: Awaited<ReturnType<typeof cargar>>, oficina2: Awaited<ReturnType<typeof cargar>>;
async function cargar(uid: string) {
  const db = env.authenticatedContext(uid).firestore();
  vi.resetModules();
  vi.doMock('../../src/firebase/config', () => ({ db, auth: { currentUser: { uid } } }));
  const modulo = await import('../../src/utils/comisiones');
  return { db, ...modulo };
}
const orden = { id: 'o', numero: 'OS-QA', fase: 'cerrado', tecnicoId: 'u1', precioFinal: 10000, clienteNombre: 'Cliente ficticio', cotizacionId: 'q' } as OrdenServicio;
const actor = { nombre: 'Oficina ficticia' } as Usuario;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-comisiones-devengo', firestore: { host: '127.0.0.1', port: 8080,
    rules: `rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{col}/{id} { allow read: if request.auth != null; allow write: if request.auth != null && !(request.auth.uid == 'deny' && col == 'comisiones'); } } }` } });
});
beforeEach(async () => {
  await env.clearFirestore(); oficina1 = await cargar('office1'); oficina2 = await cargar('office2');
  await setDoc(doc(oficina1.db, 'personal', 'p1'), { uid: 'u1', nombre: 'Técnico ficticio', comisionPorcentaje: 40, nivel: 'junior' });
  await setDoc(doc(oficina1.db, 'ordenes_servicio', 'o'), { ...orden });
});
afterAll(async () => { await env.cleanup(); });
it('dos usuarios simultáneos producen un devengo40% por UID diferente del docID', async () => {
  const r = await Promise.all([oficina1.registrarComisionPorOrden(orden, actor), oficina2.registrarComisionPorOrden(orden, actor)]);
  expect(r.filter(x => x.creada)).toHaveLength(1);
  const s = await getDocs(collection(oficina1.db, 'comisiones'));
  expect(s.size).toBe(1); expect(s.docs[0].id).toBe('orden_o');
  expect(s.docs[0].data()).toMatchObject({ tecnicoId: 'u1', comisionMonto: 4000, comisionPorcentaje: 40 });
});
it.each(['borrador', 'rechazada', 'aceptada'])('costos de cotización %s respetan aprobación', async estado => {
  await setDoc(doc(oficina1.db, 'cotizaciones', 'q'), { estado, items: [{ tipoItem: 'pieza', precio: 3000, cantidad: 1 }] });
  const r = await oficina1.registrarComisionPorOrden(orden, actor);
  expect(r.comisionMonto).toBe(estado === 'aceptada' ? 2800 : 4000);
});
it('ambigüedad UID/doc bloquea sin escribir', async () => {
  await setDoc(doc(oficina1.db, 'personal', 'u1'), { uid: 'otro', nombre: 'Otro', comisionPorcentaje: 10 });
  const r = await oficina1.registrarComisionPorOrden(orden, actor);
  expect(r.razon).toBe('error interno'); expect((await getDocs(collection(oficina1.db, 'comisiones'))).size).toBe(0);
});
it('persona ausente bloquea y persona identificada sin porcentaje conserva default junior', async () => {
  await setDoc(doc(oficina1.db, 'personal', 'p1'), { uid: 'otro', nombre: 'Otro' });
  expect((await oficina1.registrarComisionPorOrden(orden, actor)).creada).toBe(false);
  await setDoc(doc(oficina1.db, 'personal', 'p1'), { uid: 'u1', nombre: 'Técnico', nivel: 'junior' });
  expect((await oficina1.registrarComisionPorOrden(orden, actor)).comisionMonto).toBe(800);
});
it('comisión legacy liquidada con garantía se conserva al cierre y al emitir', async () => {
  const raw = { ordenId: 'o', tecnicoId: 'u1', comisionMonto: 4000, comisionPorcentaje: 40, estadoLiquidacion: 'liquidada', descuentoPorGarantia: { monto: -4000 }, fechaCobro: '2026-09-01' };
  await setDoc(doc(oficina1.db, 'comisiones', 'legacy'), raw);
  expect((await oficina1.registrarComisionPorOrden(orden, actor)).creada).toBe(false);
  await oficina1.registrarComisionPorFactura({ orden, facturaId: 'f', facturaNumero: 'CG-QA', totalFactura: 20000, userProfile: actor });
  expect((await getDoc(doc(oficina1.db, 'comisiones', 'legacy'))).data()).toEqual(raw);
  expect((await getDocs(collection(oficina1.db, 'comisiones'))).size).toBe(1);
});
it('no devenga ante orden almacenada no terminada, aunque caller envíe cierre viejo', async () => {
  await setDoc(doc(oficina1.db, 'ordenes_servicio', 'o'), { ...orden, fase: 'agendado' });
  expect((await oficina1.registrarComisionPorOrden(orden, actor)).creada).toBe(false);
});
const items = [{ descripcion: 'Trabajo ficticio', tipoItem: 'servicio', cantidad: 1, precio: 1000, tecnicoId: 'u1' }] as ItemCotizacion[];
const manual = { orden: { id: 'factura-manual-f', clienteNombre: 'QA' } as OrdenServicio, facturaId: 'f', facturaNumero: 'CG-QA', totalFactura: 1000, items, userProfile: actor, itbisPorcentaje: 0, conduceNuevo: { numero: 'CG-QA', total: 1000, items, estado: 'emitida' } };
it('manual y comisión son atómicos y dos usuarios convergen por factura+persona', async () => {
  await Promise.all([oficina1.registrarComisionesPorItems(manual), oficina2.registrarComisionesPorItems(manual)]);
  expect((await getDocs(collection(oficina1.db, 'comisiones'))).size).toBe(1);
  expect((await getDoc(doc(oficina1.db, 'facturas', 'f'))).data()?.comisionTecnicoMonto).toBe(400);
});
it('fallo al crear comisión manual revierte también conduce, sin huérfanas', async () => {
  const denegado = await cargar('deny');
  await expect(denegado.registrarComisionesPorItems(manual)).rejects.toThrow();
  expect((await getDoc(doc(oficina1.db, 'facturas', 'f'))).exists()).toBe(false);
  expect((await getDocs(collection(oficina1.db, 'comisiones'))).size).toBe(0);
});
it('manual conserva reparto entre dos técnicos y agrupa aliases de misma persona', async () => {
  await setDoc(doc(oficina1.db, 'personal', 'p2'), { uid: 'u2', nombre: 'Segundo', comisionPorcentaje: 20 });
  const lineas = [{ ...items[0], precio: 500 }, { ...items[0], precio: 500, tecnicoId: 'p1' }, { ...items[0], precio: 1000, tecnicoId: 'u2' }];
  const r = await oficina1.registrarComisionesPorItems({ ...manual, totalFactura: 2000, items: lineas, conduceNuevo: { ...manual.conduceNuevo, total: 2000, items: lineas } });
  expect(r.comisiones).toHaveLength(2); expect(r.totalAgregado).toBe(600);
});
it('refleja ajuste firmado y excluye anuladas sin mutar registros', async () => {
  await setDoc(doc(oficina1.db, 'comisiones', 'c1'), { ordenId: 'o', tecnicoId: 'u1', comisionMonto: 1000, comisionPorcentaje: 40, descuentoPorGarantia: { monto: -250 } });
  await setDoc(doc(oficina1.db, 'comisiones', 'c2'), { ordenId: 'o', tecnicoId: 'u2', comisionMonto: 1000, estadoLiquidacion: 'anulada' });
  const r = await oficina1.registrarComisionPorFactura({ orden, facturaId: 'f', facturaNumero: 'CG-QA', totalFactura: 10000, userProfile: actor });
  expect(r.comisionMonto).toBe(750);
  expect((await getDoc(doc(oficina1.db, 'comisiones', 'c1'))).data()?.comisionMonto).toBe(1000);
});
it('emisión de orden sin devengo pide revisión, no crea comisión nueva', async () => {
  const r = await oficina1.registrarComisionPorFactura({ orden, facturaId: 'f', facturaNumero: 'CG-QA', totalFactura: 10000, userProfile: actor });
  expect(r.comisionesFallidas).toBe(1); expect((await getDocs(collection(oficina1.db, 'comisiones'))).size).toBe(0);
});
