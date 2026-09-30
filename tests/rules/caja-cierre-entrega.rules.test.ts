import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';
const contexto = vi.hoisted(() => ({ db: undefined as unknown, uid: 'uid-admin' }));
vi.mock('../../src/firebase/config', () => ({ get db() { return contexto.db; }, auth: { get currentUser() { return { uid: contexto.uid }; } } }));
import { cerrarDiaAtomico, entregarEfectivoOrdenes } from '../../src/services/cierreDia.service';
import { proyectarCobrosCaja } from '../../src/utils/movimientosCobros';
const actor = { uid: UID.admin, nombre: 'QA admin' };
const pago = (id: string, monto: number) => ({ id, monto, fecha:'2026-09-29', metodo:'efectivo', verificado:true });
const leer = async (ruta: string) => (await getDoc(doc(como(UID.admin), ruta))).data()!;
beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => { await resetearConPerfiles(); contexto.db=como(UID.admin);contexto.uid=UID.admin; });
it('dos cierres concurrentes preservan un documento y el snapshot ganador', async () => {
 const [a,b]=await Promise.all([cerrarDiaAtomico('2026-09-29',{totalIngresos:100}),cerrarDiaAtomico('2026-09-29',{totalIngresos:150})]);
 expect(a).toEqual(b);
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
 expect(primera.efectivoEntregas.p1).toMatchObject({monto:100,entregadoPor:UID.admin,entregadoPorNombre:'QA admin'});
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
