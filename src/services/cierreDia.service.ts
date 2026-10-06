import { equipoApi } from './equipoApi';
import { collection, doc, getDocs, query, runTransaction, Timestamp, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { type MovimientoCobro } from '../utils/movimientosCobros';
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
  await equipoApi('/api/ordenes/efectivo', { accion: 'entregar_lote', movimientos: movimientos.map(m => ({ ordenId: m.ordenId, pagoId: m.pagoId, monto: m.monto })) });
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
