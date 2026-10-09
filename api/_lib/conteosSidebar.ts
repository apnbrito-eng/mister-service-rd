import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ErrorAcceso } from './accesoEquipo.js';
export type ConteoSidebar = { estado: 'disponible'; total: number } | { estado: 'error' };
export function permisosConteosSidebar(perfil: Record<string, unknown> | undefined) {
  if (!perfil || !['administrador', 'coordinadora'].includes(String(perfil.rol)) || perfil.activo === false || perfil.eliminado === true) throw new ErrorAcceso(403, 'Consulta de administración y coordinación.');
  const custom = perfil.permisosPersonalizados === true;
  const permisos = perfil.permisosSistema as Record<string, unknown> | undefined;
  return { clientes: !custom || permisos?.clientesVer === true, ordenes: !custom || permisos?.ordenesVer === true, empresas: perfil.rol === 'administrador' };
}
export function limitesDiaRD(ahora: Date) {
  const fechaRD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
  const inicio = new Date(`${fechaRD}T00:00:00-04:00`);
  return { fechaRD, inicio, fin: new Date(inicio.getTime() + 86400000) };
}
async function seguro(consulta: () => Promise<number>): Promise<ConteoSidebar> {
  try { const total = await consulta(); if (!Number.isSafeInteger(total) || total < 0) return { estado: 'error' }; return { estado: 'disponible', total }; }
  catch { return { estado: 'error' }; }
}
/** Aggregate totals, plus projected sparse exclusions; never download the full collections. */
async function contarActivos(db: Firestore, nombre: string, flags: string[], fusion = false) {
  const col = db.collection(nombre);
  const [total, bajas] = await Promise.all([
    col.count().get(),
    Promise.all([...flags.map(flag => col.where(flag, '==', true).select().get()),
      ...(fusion ? [col.where('mergedaCon', '>', '').select('mergedaCon').get()] : [])]),
  ]);
  const ids = new Set<string>();
  for (const snap of bajas) for (const d of snap.docs) {
    // Firestore orders different value types above strings too. Reject malformed
    // fusion metadata rather than silently report an inaccurate canonical total.
    if (fusion && snap === bajas[bajas.length - 1] && typeof d.data().mergedaCon !== 'string') throw new Error('Invalid fusion metadata');
    ids.add(d.id);
  }
  return total.data().count - ids.size;
}
export async function obtenerConteosSidebar(db: Firestore, perfil: Record<string, unknown>, ahora = new Date()) {
  const permiso = permisosConteosSidebar(perfil);
  const { fechaRD, inicio, fin } = limitesDiaRD(ahora);
  const conteos: Record<string, ConteoSidebar> = {};
  const tareas: Promise<void>[] = [];
  if (permiso.clientes) tareas.push(seguro(() => contarActivos(db, 'clientes', ['eliminado'], true)).then(c => { conteos.clientes = c; }));
  if (permiso.empresas) tareas.push(seguro(async () => {
    const col = db.collection('empresas_aliadas');
    const [total, bajas] = await Promise.all([col.count().get(), col.where('activa', '==', false).count().get()]);
    return total.data().count - bajas.data().count;
  }).then(c => { conteos.empresasAliadas = c; }));
  if (permiso.ordenes) {
    tareas.push(seguro(() => contarActivos(db, 'ordenes_servicio', ['eliminada', 'eliminado'])).then(c => { conteos.ordenes = c; }));
    tareas.push((async () => {
      try {
        // Bounded day projection avoids compound indexes and keeps legacy flags.
        const snap = await db.collection('ordenes_servicio').where('fechaCita', '>=', Timestamp.fromDate(inicio)).where('fechaCita', '<', Timestamp.fromDate(fin)).select('eliminada', 'eliminado', 'fase', 'estado').get();
        const vigentes = snap.docs.filter(d => d.data().eliminada !== true && d.data().eliminado !== true);
        conteos.agendaDia = { estado: 'disponible', total: vigentes.length };
        conteos.operacionesDia = { estado: 'disponible', total: vigentes.filter(d => !['cerrado', 'cancelado'].includes(String(d.data().fase)) && !['cerrado', 'cancelado'].includes(String(d.data().estado))).length };
      } catch { conteos.agendaDia = { estado: 'error' }; conteos.operacionesDia = { estado: 'error' }; }
    })());
  }
  await Promise.all(tareas);
  return { fechaRD, consultadoEn: ahora.toISOString(), conteos };
}
