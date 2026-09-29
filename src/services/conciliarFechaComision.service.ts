import { collection, doc, runTransaction, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { fechaFinanciera } from '../utils/fechaFinanciera';
import { calcularQuincenaActual } from '../utils/comisiones';

/** Corrección explícita; nunca decide automáticamente una fecha histórica. */
export async function conciliarFechaComision(comisionId: string, diaRD: string, motivo: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Inicia sesión para conciliar la fecha.');
  if (!comisionId.trim()) throw new Error('Comisión no identificada.');
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(diaRD) ? fechaFinanciera(diaRD) : null;
  if (!fecha) throw new Error('Selecciona una fecha válida.');
  const motivoLimpio = motivo.trim();
  if (motivoLimpio.length < 5 || motivoLimpio.length > 1000) throw new Error('Indica un motivo entre 5 y 1000 caracteres.');
  const [anio, mes, dia] = diaRD.split('-').map(Number);
  // El helper de quincenas lee calendario local: construir el día elegido,
  // no convertir medianoche RD en una fecha de otro huso del dispositivo.
  const quincena = calcularQuincenaActual(new Date(anio, mes - 1, dia, 12));
  const ref = doc(db, 'comisiones', comisionId);
  const auditoria = doc(collection(db, 'auditoria_admin'));
  await runTransaction(db, async tx => {
    const perfil = await tx.get(doc(db, 'usuarios', uid));
    if (!perfil.exists() || perfil.data().rol !== 'administrador' || perfil.data().activo !== true || auth.currentUser?.uid !== uid) throw new Error('Sólo administración activa puede conciliar fechas.');
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('La comisión ya no existe.');
    const original = snap.data();
    if (original.estaAnulada === true || (original.estadoLiquidacion || 'pendiente') !== 'pendiente' || original.liquidacionId || original.liquidadaEn || original.liquidadaPor) throw new Error('Sólo se puede conciliar una comisión pendiente y sin liquidación.');
    if (fechaFinanciera(original.fechaCobro)) throw new Error('La comisión ya tiene una fecha válida. Actualiza la pantalla.');
    const datos: Record<string, unknown> = { fechaCobro: Timestamp.fromDate(fecha), quincenaAsignada: quincena };
    tx.update(ref, datos);
    const evento: Record<string, unknown> = {
      actorUid: uid, accion: 'conciliar_fecha_comision', comisionId,
      motivo: motivoLimpio, fechaAnteriorTexto: String(original.fechaCobro ?? 'ausente'),
      quincenaAnterior: typeof original.quincenaAsignada === 'string' ? original.quincenaAsignada : null,
      fechaNueva: Timestamp.fromDate(fecha), quincenaNueva: quincena, createdAt: Timestamp.now(),
    };
    tx.set(auditoria, evento);
  });
}
