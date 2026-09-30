import { collection, doc, getDocs, query, where, runTransaction, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
export interface ComisionParaConciliar { id: string; datos: Record<string, unknown> }
export interface GrupoDuplicado { ordenId: string; personalId: string; personalUid: string; registros: ComisionParaConciliar[] }
const huella = (d: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(d).sort(([a], [b]) => a.localeCompare(b))));
export async function prepararDuplicadosComision(ordenId: string, personalId: string): Promise<GrupoDuplicado> {
  if (!ordenId || ordenId.startsWith('factura-manual-')) throw new Error('Sólo órdenes de servicio con devengo duplicado.');
  const personas = await getDocs(collection(db, 'personal'));
  const persona = personas.docs.find(p => p.id === personalId);
  if (!persona) throw new Error('Persona no encontrada.');
  const uid = String(persona.data().uid || '');
  const comisiones = await getDocs(query(collection(db, 'comisiones'), where('ordenId', '==', ordenId)));
  const registros = comisiones.docs.flatMap(c => {
    const datos = c.data();
    if (datos.estaAnulada || datos.estadoLiquidacion === 'anulada') return [];
    const candidatos = personas.docs.filter(p => p.id === datos.tecnicoId || (p.data().uid && p.data().uid === datos.tecnicoId));
    return candidatos.length === 1 && candidatos[0].id === personalId ? [{ id: c.id, datos }] : [];
  });
  if (registros.length < 2) throw new Error('El grupo ya no tiene duplicados; actualiza la nómina.');
  return { ordenId, personalId, personalUid: uid, registros };
}
/** Selección humana explícita: conserva registro válido y anula los demás sin borrar historia. */
export async function resolverDuplicadosComision(grupo: GrupoDuplicado, conservarId: string, motivo: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Inicia sesión.');
  if (motivo.trim().length < 10 || motivo.length > 1000) throw new Error('Explica la evidencia y por qué eliges este registro (10–1000 caracteres).');
  if (!grupo.registros.some(c => c.id === conservarId)) throw new Error('Selecciona el registro que corresponde al devengo real.');
  const actualizado = await prepararDuplicadosComision(grupo.ordenId, grupo.personalId);
  if (actualizado.registros.map(c => c.id).sort().join('|') !== grupo.registros.map(c => c.id).sort().join('|')) throw new Error('El grupo cambió; vuelve a revisar.');
  const personas = await getDocs(collection(db, 'personal'));
  if (personas.docs.length + grupo.registros.length > 400) throw new Error('El grupo requiere revisión administrativa por volumen de referencias.');
  const auditoria = doc(collection(db, 'auditoria_admin'));
  await runTransaction(db, async tx => {
    const perfil = await tx.get(doc(db, 'usuarios', uid));
    const identidades = await Promise.all(personas.docs.map(p => tx.get(doc(db, 'personal', p.id))));
    const registros = await Promise.all(grupo.registros.map(c => tx.get(doc(db, 'comisiones', c.id))));
    if (!perfil.exists() || perfil.data().rol !== 'administrador' || perfil.data().activo !== true || auth.currentUser?.uid !== uid) throw new Error('Sólo administración activa puede conciliar duplicados.');
    registros.forEach((r, i) => {
      if (!r.exists() || huella(r.data()) !== huella(grupo.registros[i].datos)) throw new Error('La comisión cambió; vuelve a revisar importes, costos y garantía.');
      const c = r.data();
      if (c.estaAnulada || (c.estadoLiquidacion || 'pendiente') !== 'pendiente' || c.liquidacionId || c.liquidadaEn || c.liquidadaPor) throw new Error('Hay una comisión liquidada o modificada: requiere revisión administrativa de su historial.');
      const candidatos = identidades.flatMap((p, n) => p.exists() && (personas.docs[n].id === c.tecnicoId || (p.data().uid && p.data().uid === c.tecnicoId)) ? [personas.docs[n].id] : []);
      if (c.ordenId !== grupo.ordenId || candidatos.length !== 1 || candidatos[0] !== grupo.personalId) throw new Error('Orden o identidad diferente/ambigua; no se puede conciliar este grupo.');
    });
    const ahora = Timestamp.now();
    grupo.registros.filter(c => c.id !== conservarId).forEach(c => tx.update(doc(db, 'comisiones', c.id), { estaAnulada: true, estadoLiquidacion: 'anulada', duplicadaDe: conservarId, conciliadaPor: uid, conciliadaEn: ahora, motivoConciliacion: motivo.trim(), updatedAt: ahora }));
    tx.set(auditoria, { accion: 'conciliar_duplicados_comision', actorUid: uid, ordenId: grupo.ordenId, personalId: grupo.personalId, conservarId, anuladas: grupo.registros.filter(c => c.id !== conservarId).map(c => c.id), anteriores: grupo.registros, motivo: motivo.trim(), createdAt: ahora });
  });
}
