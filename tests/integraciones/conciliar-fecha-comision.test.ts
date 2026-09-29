import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ docs: {} as Record<string, Record<string, unknown>>, uid: 'admin', fallo: false, cola: Promise.resolve() }));
vi.mock('../../src/firebase/config', () => ({ db: {}, auth: { get currentUser() { return m.uid ? { uid: m.uid } : null; } } }));
vi.mock('firebase/firestore', async original => ({ ...await original<typeof import('firebase/firestore')>(),
 collection: (_: unknown, col: string) => col,
 doc: (base: unknown, col?: string, id?: string) => id ? `${col}/${id}` : `${base}/audit`,
 runTransaction: (_: unknown, fn: (tx: unknown) => Promise<void>) => {
   const operacion = m.cola.then(async () => {
     const writes: [string, Record<string, unknown>][] = [];
     await fn({ get: async (id: string) => ({ exists: () => !!m.docs[id], data: () => m.docs[id] }), update: (id: string, data: Record<string, unknown>) => writes.push([id, data]), set: (id: string, data: Record<string, unknown>) => writes.push([id, data]) });
     if (m.fallo) throw new Error('Auditoría falló');
     writes.forEach(([id, data]) => { m.docs[id] = { ...m.docs[id], ...data }; });
   });
   m.cola = operacion.catch(() => {}); return operacion;
 },
}));
import { conciliarFechaComision } from '../../src/services/conciliarFechaComision.service';
beforeEach(() => {
 m.uid = 'admin'; m.fallo = false; m.cola = Promise.resolve();
 m.docs = { 'usuarios/admin': { rol: 'administrador', activo: true }, 'comisiones/c': { estadoLiquidacion: 'pendiente', comisionMonto: 125 } };
});
it('corrige fecha RD y quincena con auditoría y UID real sin cambiar monto', async () => {
 await conciliarFechaComision('c', '2026-09-30', 'Comprobante revisado');
 expect(m.docs['comisiones/c'].quincenaAsignada).toBe('2026-10-Q1');
 expect(m.docs['comisiones/c'].comisionMonto).toBe(125);
 expect(m.docs['auditoria_admin/audit'].actorUid).toBe('admin');
 expect(m.docs['auditoria_admin/audit'].motivo).toBe('Comprobante revisado');
});
it('fallo auditoría no persiste fecha', async () => {
 m.fallo = true; await expect(conciliarFechaComision('c', '2026-09-29', 'Revisado')).rejects.toThrow();
 expect(m.docs['comisiones/c'].fechaCobro).toBeUndefined();
});
it.each([{ estadoLiquidacion: 'liquidada' }, { estaAnulada: true }, { liquidacionId: 'otra' }, { liquidadaEn: '2026-09-29' }, { liquidadaPor: 'Admin' }, { fechaCobro: '2026-09-01' }])('rechaza comisión no elegible %j', async extra => {
 Object.assign(m.docs['comisiones/c'], extra);
 await expect(conciliarFechaComision('c', '2026-09-29', 'Revisado')).rejects.toThrow();
 expect(m.docs['auditoria_admin/audit']).toBeUndefined();
});
it.each(['2026-02-30', '', '2026-09-29T00:00:00Z'])('rechaza fecha %s', async fecha => { await expect(conciliarFechaComision('c', fecha, 'Revisado')).rejects.toThrow(); });
it('exige motivo', async () => { await expect(conciliarFechaComision('c', '2026-09-29', ' ')).rejects.toThrow(); });
it.each([{ rol: 'coordinadora', activo: true }, { rol: 'administrador', activo: false }])('deniega perfil %j', async perfil => {
 m.docs['usuarios/admin'] = perfil; await expect(conciliarFechaComision('c', '2026-09-29', 'Revisado')).rejects.toThrow();
});
it('exige sesión y perfil', async () => {
 m.uid = ''; await expect(conciliarFechaComision('c', '2026-09-29', 'Revisado')).rejects.toThrow();
 m.uid = 'sinperfil'; await expect(conciliarFechaComision('c', '2026-09-29', 'Revisado')).rejects.toThrow();
});
it('dos correcciones concurrentes: sólo primera aplica, no pisa fecha válida', async () => {
 const resultados = await Promise.allSettled([conciliarFechaComision('c', '2026-09-29', 'Primera revisión'), conciliarFechaComision('c', '2026-09-30', 'Segunda revisión')]);
 expect(resultados.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
 expect(m.docs['comisiones/c'].quincenaAsignada).toBe('2026-09-Q2');
});
it('comisión legacy sin estado puede recuperar fecha', async () => {
 delete m.docs['comisiones/c'].estadoLiquidacion;
 await conciliarFechaComision('c', '2026-09-15', 'Respaldo revisado');
 expect(m.docs['comisiones/c'].quincenaAsignada).toBe('2026-09-Q2');
});
