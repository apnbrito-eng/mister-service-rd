import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore as AdminFirestore } from 'firebase-admin/firestore';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';
const contexto = vi.hoisted(() => ({ db: undefined as unknown, uid: 'uid-admin', admin: undefined as AdminFirestore | undefined }));
vi.mock('../../src/firebase/config', () => ({ get db() { return contexto.db; }, auth: { get currentUser() { return { uid: contexto.uid }; } } }));
vi.mock('../../api/_lib/accesoEquipo.js', () => {
 class ErrorAcceso extends Error { constructor(public status: number, message: string) { super(message); } }
 return { ErrorAcceso, accesoEquipo: async () => ({ db: contexto.admin, uid: contexto.uid }) };
});
vi.mock('../../src/services/equipoApi', () => ({ equipoApi: async (_ruta: string, body: object) => {
 const { default: handler } = await import('../../api/ordenes/efectivo');
 let status = 200; let result: Record<string, unknown> = {};
 const response = { setHeader() {}, status(s: number) { status=s; return response; }, json(r: Record<string, unknown>) { result=r; return response; } };
 await handler({ method:'POST', body } as VercelRequest, response as unknown as VercelResponse);
 if (status >= 400) throw new Error(String(result.error));
 return result;
} }));
let adminApp: App;
import { cerrarDiaAtomico, entregarEfectivoOrdenes } from '../../src/services/cierreDia.service';
import { proyectarCobrosCaja } from '../../src/utils/movimientosCobros';
const actor = { uid: UID.admin, nombre: 'QA admin' };
const pago = (id: string, monto: number) => ({ id, monto, fecha:'2026-09-29', metodo:'efectivo', verificado:true });
const leer = async (ruta: string) => (await getDoc(doc(como(UID.admin), ruta))).data()!;
beforeAll(async () => { await iniciarEntorno(); process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'; adminApp=initializeApp({projectId:'demo-mister-service-rules'}, 'efectivo-rules'); contexto.admin=getFirestore(adminApp); });
afterAll(async () => { await contexto.admin?.terminate(); if (adminApp) { await deleteApp(adminApp); await entorno().cleanup(); } });
beforeEach(async () => { await resetearConPerfiles(); contexto.db=como(UID.admin);contexto.uid=UID.admin; });
it('dos cierres concurrentes preservan un documento y el snapshot ganador', async () => {
 const [a,b]=await Promise.all([cerrarDiaAtomico('2026-09-29',{totalIngresos:100}),cerrarDiaAtomico('2026-09-29',{totalIngresos:150})]);
 expect(a.totalIngresos).toEqual(b.totalIngresos);
 expect([a.creado,b.creado].sort()).toEqual([false,true]);
 expect((await getDocs(collection(como(UID.admin),'cierres_dia'))).size).toBe(1);
 expect((await leer('cierres_dia/2026-09-29')).totalIngresos).toBe(a.totalIngresos);
});
it('entrega concurrente es idempotente y admite recibo posterior sin alterar cierre', async () => {
 const datos={pagos:[pago('p1',100)]};
 await sembrar('ordenes_servicio/o',datos);
 await cerrarDiaAtomico('2026-09-29',{totalIngresos:100});
 const movimientos=proyectarCobrosCaja([{id:'o',datos}]).movimientos;
 await Promise.all([entregarEfectivoOrdenes(movimientos,actor),entregarEfectivoOrdenes(movimientos,actor)]);
 const primera=await leer('ordenes_servicio/o');
 expect(Object.keys(primera.efectivoEntregas)).toEqual(['p1']);
 expect(primera.efectivoEntregas.p1).toMatchObject({monto:100,entregadoPor:UID.admin,entregadoPorNombre:'QA administrador'});
 const actual={...primera,pagos:[pago('p1',100),pago('p2',50)]};
 await sembrar('ordenes_servicio/o',actual);
 await entregarEfectivoOrdenes(proyectarCobrosCaja([{id:'o',datos:actual}]).movimientos,actor);
 const final=await leer('ordenes_servicio/o');
 expect(final.efectivoEntregas.p1).toEqual(primera.efectivoEntregas.p1);
 expect(final.efectivoEntregas.p2.monto).toBe(50);
 expect((await leer('cierres_dia/2026-09-29')).totalIngresos).toBe(100);
});
it('usuario sin perfil de oficina no puede cerrar', async () => {
 contexto.db=como(UID.tecnico);contexto.uid=UID.tecnico;
 await expect(cerrarDiaAtomico('2026-09-29',{totalIngresos:100})).rejects.toThrow();
 expect((await getDocs(collection(como(UID.admin),'cierres_dia'))).empty).toBe(true);
});

it('permiso personalizado denegado bloquea entrega aun siendo oficina', async () => {
 await sembrar('usuarios/'+UID.admin,{rol:'administrador',permisosPersonalizados:true,permisosSistema:{cierreDiaEjecutar:false}});
 const datos={pagos:[pago('p1',100)]};await sembrar('ordenes_servicio/o',datos);
 await expect(entregarEfectivoOrdenes(proyectarCobrosCaja([{id:'o',datos}]).movimientos,actor)).rejects.toThrow('permiso');
 expect((await leer('ordenes_servicio/o')).efectivoEntregas).toBeUndefined();
});
