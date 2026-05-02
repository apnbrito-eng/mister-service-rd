import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  Timestamp,
  getDocs,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { PrestamoEmpleado, CuotaPrestamo, Rol } from '../types';
import { stripUndefined } from '../utils/firestore';

const COL = 'prestamos_empleados';

/**
 * Rehidrata un doc Firestore a `PrestamoEmpleado`. Mantiene defaults
 * defensivos como `parseOrden`/`parseFactura`: si un campo no existe
 * (préstamo viejo o creado por seed parcial), no falla.
 */
export function parsePrestamo(id: string, raw: Record<string, unknown>): PrestamoEmpleado {
  const histRaw = (raw.cuotasHistorial as Record<string, unknown>[]) || [];
  const cuotasHistorial: CuotaPrestamo[] = histRaw.map(h => ({
    numero: Number(h.numero) || 0,
    monto: Number(h.monto) || 0,
    liquidacionId: (h.liquidacionId as string) || '',
    quincena: (h.quincena as string) || '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fechaAplicacion: (h.fechaAplicacion as any)?.toDate?.() || new Date(),
    saldoRestante: Number(h.saldoRestante) || 0,
  }));
  return {
    id,
    personalId: (raw.personalId as string) || '',
    personalNombre: (raw.personalNombre as string) || '',
    personalRol: (raw.personalRol as Rol) || 'tecnico',
    montoTotal: Number(raw.montoTotal) || 0,
    montoCuota: Number(raw.montoCuota) || 0,
    cuotasTotales: Number(raw.cuotasTotales) || 0,
    cuotasPagadas: Number(raw.cuotasPagadas) || 0,
    saldoPendiente: Number(raw.saldoPendiente) || 0,
    motivo: (raw.motivo as string) || '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fechaInicio: (raw.fechaInicio as any)?.toDate?.() || new Date(),
    estado: (raw.estado as 'activo' | 'pagado' | 'cancelado') || 'activo',
    cuotasHistorial,
    motivoCancelacion: (raw.motivoCancelacion as string) || undefined,
    canceladoPorId: (raw.canceladoPorId as string) || undefined,
    canceladoPorNombre: (raw.canceladoPorNombre as string) || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canceladoEn: (raw.canceladoEn as any)?.toDate?.() || undefined,
    creadoPorId: (raw.creadoPorId as string) || '',
    creadoPorNombre: (raw.creadoPorNombre as string) || '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createdAt: (raw.createdAt as any)?.toDate?.() || new Date(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updatedAt: (raw.updatedAt as any)?.toDate?.() || undefined,
  };
}

export interface CrearPrestamoInput {
  personalId: string;
  personalNombre: string;
  personalRol: Rol;
  montoTotal: number;
  cuotasTotales: number;
  /** Si no se pasa, se calcula como montoTotal / cuotasTotales redondeado. */
  montoCuota?: number;
  motivo: string;
  fechaInicio: Date;
  creadoPorId: string;
  creadoPorNombre: string;
}

/**
 * Crea un préstamo activo. La cuota se calcula automáticamente si no
 * viene en el payload. El saldo pendiente arranca igual al monto total.
 */
export async function crearPrestamo(data: CrearPrestamoInput): Promise<string> {
  const cuotasTotales = Math.max(1, Math.floor(data.cuotasTotales));
  const montoTotal = Number(data.montoTotal) || 0;
  const montoCuota = data.montoCuota !== undefined && data.montoCuota > 0
    ? Number(data.montoCuota)
    : Math.round((montoTotal / cuotasTotales) * 100) / 100;

  const payload: Record<string, unknown> = stripUndefined({
    personalId: data.personalId,
    personalNombre: data.personalNombre.trim(),
    personalRol: data.personalRol,
    montoTotal,
    montoCuota,
    cuotasTotales,
    cuotasPagadas: 0,
    saldoPendiente: montoTotal,
    motivo: data.motivo.trim(),
    fechaInicio: Timestamp.fromDate(data.fechaInicio),
    estado: 'activo',
    cuotasHistorial: [] as CuotaPrestamo[],
    creadoPorId: data.creadoPorId,
    creadoPorNombre: data.creadoPorNombre,
    createdAt: Timestamp.now(),
  });
  const ref = await addDoc(collection(db, COL), payload);
  return ref.id;
}

/** Suscripción en tiempo real a TODOS los préstamos. Útil para la página de gestión. */
export function suscribirPrestamos(callback: (items: PrestamoEmpleado[]) => void): () => void {
  return onSnapshot(collection(db, COL), snap => {
    callback(snap.docs.map(d => parsePrestamo(d.id, d.data() as Record<string, unknown>)));
  });
}

/**
 * Préstamos activos de un empleado. Filtramos `estado === 'activo'`
 * client-side para evitar índice compuesto (patrón establecido en el
 * repo, ver commit e776a8f).
 */
export async function obtenerPrestamosActivosDePersonal(personalId: string): Promise<PrestamoEmpleado[]> {
  const q = query(collection(db, COL), where('personalId', '==', personalId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => parsePrestamo(d.id, d.data() as Record<string, unknown>))
    .filter(p => p.estado === 'activo');
}

/**
 * Todos los préstamos activos del sistema. Lo usa `generarLiquidacion`
 * para preview de cuotas. Una sola query con filtro por `estado`.
 */
export async function obtenerPrestamosActivosTodos(): Promise<PrestamoEmpleado[]> {
  const q = query(collection(db, COL), where('estado', '==', 'activo'));
  const snap = await getDocs(q);
  return snap.docs.map(d => parsePrestamo(d.id, d.data() as Record<string, unknown>));
}

/**
 * Aplica una cuota al préstamo de forma idempotente:
 *  - Si ya existe una entrada en `cuotasHistorial` con el mismo
 *    `liquidacionId`, NO hace nada (no-op).
 *  - Sino, agrega la entrada, incrementa `cuotasPagadas` y recalcula
 *    `saldoPendiente`. Si llega a `cuotasTotales`, marca `estado: 'pagado'`.
 *
 * Idempotencia clave para soportar re-cierres (manual o por error de red)
 * sin doble-descontar al empleado.
 */
export async function aplicarCuota(
  prestamoId: string,
  liquidacionId: string,
  quincena: string,
  monto: number,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, COL, prestamoId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error(`Préstamo ${prestamoId} no encontrado`);
    const raw = snap.data() as Record<string, unknown>;
    const histRaw = (raw.cuotasHistorial as Record<string, unknown>[]) || [];
    // Idempotencia: si la liquidación ya tiene cuota registrada, no-op.
    if (histRaw.some(h => h.liquidacionId === liquidacionId)) return;

    const cuotasPagadas = Number(raw.cuotasPagadas) || 0;
    const cuotasTotales = Number(raw.cuotasTotales) || 0;
    const montoTotal = Number(raw.montoTotal) || 0;

    const aplicado = histRaw.reduce((s, h) => s + (Number(h.monto) || 0), 0) + monto;
    const saldoRestante = Math.max(0, montoTotal - aplicado);
    const nuevasCuotasPagadas = cuotasPagadas + 1;
    const nuevoEstado = nuevasCuotasPagadas >= cuotasTotales || saldoRestante === 0 ? 'pagado' : 'activo';

    const nuevaCuota: CuotaPrestamo = {
      numero: nuevasCuotasPagadas,
      monto,
      liquidacionId,
      quincena,
      fechaAplicacion: Timestamp.now(),
      saldoRestante,
    };

    tx.update(ref, {
      cuotasHistorial: [...histRaw, nuevaCuota],
      cuotasPagadas: nuevasCuotasPagadas,
      saldoPendiente: saldoRestante,
      estado: nuevoEstado,
      updatedAt: Timestamp.now(),
    });
  });
}

/**
 * Cancela un préstamo activo. NO toca `cuotasHistorial` (las cuotas ya
 * aplicadas en liquidaciones cerradas son auditables y permanecen).
 * Solo previene cuotas futuras.
 */
export async function cancelarPrestamo(
  prestamoId: string,
  motivo: string,
  canceladoPorId: string,
  canceladoPorNombre: string,
): Promise<void> {
  await updateDoc(doc(db, COL, prestamoId), {
    estado: 'cancelado',
    motivoCancelacion: motivo.trim(),
    canceladoPorId,
    canceladoPorNombre,
    canceladoEn: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}
