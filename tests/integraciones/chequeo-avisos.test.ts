import { describe, expect, it } from 'vitest';
import { generarAvisosChequeo } from '../../api/_lib/avisosChequeo';
function fixture() {
  const datos = new Map<string, any>([
    ['ordenes_servicio/o', { numero: 'OS-1', soloChequeo: true, seguimientoChequeo: { responsableUid: 'u', proximaFecha: '2026-09-29', resultado: 'pendiente' } }],
    ['personal/p', { uid: 'u', rol: 'coordinadora', activo: true }],
    ['usuarios/u', { rol: 'coordinadora', activo: true }],
  ]);
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) });
  const db: any = { doc: ref, collection: (col: string) => ({ where: () => ({ col, get: async () => ({ docs: [{ ref: ref('ordenes_servicio/o'), id: 'o' }] }) }) }), runTransaction: async (fn: any) => fn({ get: async (r: any) => r.col === 'personal' ? (() => { const docs = [...datos.entries()].filter(([k,v]) => k.startsWith('personal/') && v.uid === 'u').map(([,v]) => ({ data: () => v })); return {docs,size:docs.length}; })() : ({ exists: datos.has(r.path), data: () => datos.get(r.path) }), create: (r: any, d: any) => datos.set(r.path, d) }) };
  return { datos, db };
}
const hoy = new Date('2026-09-29T18:00:00Z');
describe('Avisos internos de solo chequeo', () => {
  it('vence hoy una vez; reprogramar genera otra ocurrencia sin modificar orden', async () => {
    const { datos, db } = fixture();
    expect(await generarAvisosChequeo(db, hoy)).toEqual({ creados: 1 });
    expect(await generarAvisosChequeo(db, hoy)).toEqual({ creados: 0 });
    datos.get('ordenes_servicio/o').seguimientoChequeo.proximaFecha = '2026-09-30';
    expect(await generarAvisosChequeo(db, hoy)).toEqual({ creados: 0 });
    expect(await generarAvisosChequeo(db, new Date('2026-09-30T18:00:00Z'))).toEqual({ creados: 1 });
    expect(datos.get('ordenes_servicio/o').soloChequeo).toBe(true);
  });
  it.each(['no_interesado', 'inactivo', 'eliminada', 'sin_fecha', 'personal_inactivo', 'cancelado', 'duplicado'])('no notifica %s', async caso => {
    const { datos, db } = fixture();
    if (caso === 'no_interesado') datos.get('ordenes_servicio/o').seguimientoChequeo.resultado = caso;
    if (caso === 'inactivo') datos.get('usuarios/u').activo = false;
    if (caso === 'eliminada') datos.get('ordenes_servicio/o').eliminada = true;
    if (caso === 'personal_inactivo') datos.get('personal/p').activo = false;
    if (caso === 'cancelado') datos.get('ordenes_servicio/o').fase = 'cancelado';
    if (caso === 'duplicado') datos.set('personal/otro', { uid:'u',rol:'operaria',activo:true });
    if (caso === 'sin_fecha') delete datos.get('ordenes_servicio/o').seguimientoChequeo.proximaFecha;
    expect(await generarAvisosChequeo(db, hoy)).toEqual({ creados: 0 });
  });
});
