import { collection, doc, getDocs, query, runTransaction, Timestamp, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { proyectarCobrosCaja, type MovimientoCobro } from '../utils/movimientosCobros';
import { puede } from '../utils/permisos';
import type { Usuario } from '../types';
import { fechaFinanciera } from '../utils/fechaFinanciera';

export interface ActorEntrega { uid: string; nombre: string }

/** Mantiene cuentas distintas aunque compartan el nombre del banco. */
export function resumirTransferencias(movimientos: MovimientoCobro[]) {
  const grupos = new Map<string, { bancoId: string; banco: string; cantidad: number; monto: number }>();
  movimientos.filter(m => m.confirmado && m.metodo !== 'efectivo').forEach(m => {
    const bancoId = m.bancoId || 'sin-banco';
    const grupo = grupos.get(bancoId) || { bancoId, banco: m.bancoNombre || 'Sin banco registrado', cantidad: 0, monto: 0 };
    grupo.cantidad++;
    grupo.monto = Math.round((grupo.monto + m.monto) * 100) / 100;
    grupos.set(bancoId, grupo);
  });
  return Object.fromEntries(grupos);
}

/** Un fallo aborta todas las entregas; nunca comunicar éxito parcial. */
export async function entregarEfectivoOrdenes(movimientos: MovimientoCobro[], actor: ActorEntrega) {
  if (!actor.uid?.trim() || auth.currentUser?.uid !== actor.uid) throw new Error('Inicia sesión nuevamente para registrar la entrega');
  const ids = [...new Set(movimientos.map(m => m.ordenId))];
  if (!ids.length || ids.length > 400) throw new Error('Selecciona entre 1 y 400 órdenes');
  await runTransaction(db, async tx => {
    const perfil = await tx.get(doc(db, 'usuarios', actor.uid));
    if (!perfil.exists() || !puede({ ...perfil.data(), id: actor.uid } as Usuario, 'cierreDiaEjecutar')) throw new Error('No tienes permiso para registrar entregas de efectivo');
    const refs = ids.map(id => doc(db, 'ordenes_servicio', id));
    const snaps = await Promise.all(refs.map(ref => tx.get(ref)));
    const ahora = Timestamp.now();
    const payloads = snaps.map(snap => {
      if (!snap.exists() || snap.data().eliminada === true) throw new Error('Una orden ya no está disponible; actualiza y vuelve a revisar');
      const raw = snap.data();
      const entregas = (raw.efectivoEntregas || {}) as Record<string, unknown>;
      if (raw.efectivoEntregado === true && !Object.keys(entregas).length) throw new Error('Entrega histórica sin detalle de pagos: requiere conciliación');
      const actuales = proyectarCobrosCaja([{ id: snap.id, datos: raw }]).movimientos;
      const nuevos = { ...entregas };
      movimientos.filter(m => m.ordenId === snap.id).forEach(m => {
        const actual = actuales.find(p => p.pagoId === m.pagoId);
        if (!actual || actual.monto !== m.monto || actual.fecha.getTime() !== m.fecha.getTime() || !actual.confirmado || actual.metodo !== 'efectivo') throw new Error('El pago cambió; actualiza y revisa antes de entregar');
        if (nuevos[m.pagoId] && (nuevos[m.pagoId] as { monto?: number }).monto !== m.monto) throw new Error('El importe entregado difiere del pago; requiere conciliación');
        if (!nuevos[m.pagoId]) nuevos[m.pagoId] = { monto: m.monto, entregadoEn: ahora, entregadoPor: actor.uid, entregadoPorNombre: actor.nombre };
      });
      return { efectivoEntregas: nuevos, updatedAt: ahora };
    });
    refs.forEach((ref, i) => tx.update(ref, payloads[i]));
  });
}

/** ID por día: dos cierres concurrentes convergen sin sobrescribir el primero. */
export async function cerrarDiaAtomico(dia: string, datos: Record<string, unknown>) {
  const inicio = fechaFinanciera(dia);
  if (!inicio || dia.length !== 10) throw new Error('Fecha de cierre inválida');
  const fin = new Date(inicio.getTime() + 86400000);
  const legacy = await getDocs(query(collection(db, 'cierres_dia'), where('fecha', '>=', Timestamp.fromDate(inicio)), where('fecha', '<', Timestamp.fromDate(fin))));
  if (legacy.size > 1) throw new Error('Hay varios cierres históricos de este día; requiere conciliación');
  const ref = doc(db, 'cierres_dia', dia);
  return runTransaction(db, async tx => {
    const existente = await tx.get(ref);
    if (existente.exists()) return { ...existente.data(), id: existente.id, creado: false };
    if (legacy.size > 1) throw new Error('Hay varios cierres históricos de este día; requiere conciliación');
    const previo = legacy.docs[0] ? await tx.get(legacy.docs[0].ref) : null;
    if (previo?.exists()) {
      // Adoptar el cierre histórico sin duplicar importes ni sobrescribirlo.
      return { ...previo.data(), id: previo.id, creado: false };
    }
    const payload = Object.fromEntries(Object.entries({ ...datos, fecha: Timestamp.fromDate(inicio) }).filter(([, v]) => v !== undefined));
    tx.set(ref, payload);
    return { ...payload, id: ref.id, creado: true };
  });
}
