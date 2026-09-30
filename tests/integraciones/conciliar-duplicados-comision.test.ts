import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ docs: {} as Record<string, Record<string, unknown>>, fallo: false, cola: Promise.resolve() }));
vi.mock('../../src/firebase/config', () => ({ db: {}, auth: { currentUser: { uid: 'admin' } } }));
vi.mock('firebase/firestore', async original => ({ ...await original<typeof import('firebase/firestore')>(),
 collection: (_: unknown, col: string) => col, query: (c: string) => c,
 doc: (base: unknown, col?: string, id?: string) => id ? `${col}/${id}` : `${base}/audit`,
 getDocs: async (col: string) => ({ docs: Object.entries(m.docs).filter(([k]) => k.startsWith(col + '/')).map(([k, v]) => ({ id: k.split('/')[1], data: () => structuredClone(v) })) }),
 runTransaction: (_: unknown, fn: (tx: unknown) => Promise<void>) => {
  const operacion = m.cola.then(async () => {
   const writes: [string, Record<string, unknown>][] = [];
   await fn({ get: async (id: string) => ({ exists: () => !!m.docs[id], data: () => structuredClone(m.docs[id]) }), update: (id: string, data: Record<string, unknown>) => writes.push([id, data]), set: (id: string, data: Record<string, unknown>) => writes.push([id, data]) });
   if (m.fallo) throw new Error('Auditoría falló');
   writes.forEach(([id,data]) => { m.docs[id] = { ...m.docs[id], ...data }; });
  }); m.cola = operacion.catch(() => {}); return operacion;
 },
}));
import { prepararDuplicadosComision, resolverDuplicadosComision } from '../../src/services/conciliarDuplicadosComision.service';
beforeEach(() => { m.fallo = false; m.cola = Promise.resolve(); m.docs = {
 'usuarios/admin': { rol:'administrador',activo:true }, 'personal/p': {uid:'u'},
 'comisiones/a': { ordenId:'o',tecnicoId:'u',comisionMonto:100,costoPiezas:20,estadoLiquidacion:'pendiente' },
 'comisiones/b': { ordenId:'o',tecnicoId:'p',comisionMonto:200,costoPiezas:30,estadoLiquidacion:'pendiente' },
}; });
it('elección explícita conserva válido y anula resto con vínculo y auditoría íntegra', async () => {
 const g = await prepararDuplicadosComision('o','p'), original = structuredClone(m.docs['comisiones/a']);
 await resolverDuplicadosComision(g,'a','Orden y evidencia revisadas, importe correcto 100');
 expect(m.docs['comisiones/a']).toEqual(original);
 expect(m.docs['comisiones/b']).toMatchObject({estaAnulada:true,estadoLiquidacion:'anulada',duplicadaDe:'a',comisionMonto:200,conciliadaPor:'admin'});
 expect(m.docs['auditoria_admin/audit']).toMatchObject({ actorUid:'admin',conservarId:'a',anuladas:['b'],anteriores:g.registros });
});
it('fallo auditado aborta toda la conciliación', async () => {
 const g = await prepararDuplicadosComision('o','p'); const antes=structuredClone(m.docs);m.fallo=true;
 await expect(resolverDuplicadosComision(g,'a','Evidencia revisada')).rejects.toThrow('Auditoría');expect(m.docs).toEqual(antes);
});
it('dos administradores eligiendo ganadores diferentes sólo permiten un commit', async () => {
 const g=await prepararDuplicadosComision('o','p');
 const r=await Promise.allSettled([resolverDuplicadosComision(g,'a','Evidencia revisada A'),resolverDuplicadosComision(g,'b','Evidencia revisada B')]);
 expect(r.filter(x=>x.status==='fulfilled')).toHaveLength(1);
 expect([m.docs['comisiones/a'],m.docs['comisiones/b']].filter(c=>c.estaAnulada)).toHaveLength(1);
});
it.each([{estadoLiquidacion:'liquidada'},{liquidacionId:'l'},{liquidadaPor:'otro'}])('no modifica historia liquidada %j', async extra => {
 Object.assign(m.docs['comisiones/b'],extra);const g=await prepararDuplicadosComision('o','p');
 await expect(resolverDuplicadosComision(g,'a','Evidencia revisada')).rejects.toThrow('liquidada');expect(m.docs['auditoria_admin/audit']).toBeUndefined();
});
it('importe cambiado o nueva duplicada obligan nueva revisión', async () => {
 const g=await prepararDuplicadosComision('o','p');m.docs['comisiones/b'].comisionMonto=300;
 await expect(resolverDuplicadosComision(g,'a','Evidencia revisada')).rejects.toThrow('cambió');
 m.docs['comisiones/c']={...m.docs['comisiones/b']};await expect(resolverDuplicadosComision(g,'a','Evidencia revisada')).rejects.toThrow('grupo cambió');
});
it('coordinadora no puede resolver y no se elige automáticamente', async () => {
 const g=await prepararDuplicadosComision('o','p');m.docs['usuarios/admin'].rol='coordinadora';
 await expect(resolverDuplicadosComision(g,'a','Evidencia revisada')).rejects.toThrow('administración');
 await expect(resolverDuplicadosComision(g,'','Evidencia revisada')).rejects.toThrow('Selecciona');
});
