import {
  collection, doc, getDoc, getDocs, onSnapshot, query, setDoc,
  updateDoc, where, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { format } from 'date-fns';
import {
  RecordatorioDiario, TipoRecordatorio, ItemAviso,
} from '../types';

/** Devuelve el próximo día laboral (saltando domingo). */
export function obtenerDiaSiguienteLaboral(fecha: Date): Date {
  const next = new Date(fecha);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  if (next.getDay() === 0) next.setDate(next.getDate() + 1);
  return next;
}

/** Domingo = no laboral. */
export function esDiaLaboral(fecha: Date): boolean {
  return fecha.getDay() !== 0;
}

/** Estado de la ventana de tiempo para un tipo de recordatorio. */
export function ventanaActiva(
  tipo: TipoRecordatorio,
  ahora: Date,
): 'antes' | 'activa' | 'urgente' {
  const hora = ahora.getHours();
  const min = ahora.getMinutes();
  if (tipo === 'ruta_manana') {
    if (hora < 9) return 'antes';
    // Activa: 9:00 inclusive hasta 10:00 inclusive (10:00:00)
    if (hora === 9 || (hora === 10 && min === 0)) return 'activa';
    return 'urgente';
  }
  // horarios_clientes: 11:00 - 12:00
  if (hora < 11) return 'antes';
  if (hora === 11 || (hora === 12 && min === 0)) return 'activa';
  return 'urgente';
}

function limpiar<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function parseRecordatorio(id: string, data: Record<string, unknown>): RecordatorioDiario {
  return {
    id,
    fecha: data.fecha as string,
    operariaId: data.operariaId as string,
    operariaNombre: data.operariaNombre as string,
    tipo: data.tipo as TipoRecordatorio,
    completado: (data.completado as boolean) || false,
    completadoEn: (data.completadoEn as { toDate?: () => Date } | undefined)?.toDate?.(),
    items: (data.items as ItemAviso[] | undefined)?.map(it => ({
      ...it,
      avisadoEn: (it.avisadoEn as unknown as { toDate?: () => Date } | undefined)?.toDate?.() || it.avisadoEn,
    })),
    notificadoAAdmin: (data.notificadoAAdmin as boolean) || false,
    createdAt: (data.createdAt as { toDate?: () => Date } | undefined)?.toDate?.() || new Date(),
  };
}

export async function obtenerOCrearRecordatorio(
  operariaId: string,
  operariaNombre: string,
  tipo: TipoRecordatorio,
  itemsIniciales: ItemAviso[] = [],
): Promise<RecordatorioDiario> {
  const hoyStr = format(new Date(), 'yyyy-MM-dd');
  const docId = `${hoyStr}_${operariaId}_${tipo}`;
  const ref = doc(db, 'recordatorios_diarios', docId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return parseRecordatorio(snap.id, snap.data());
  }
  const nuevo = {
    fecha: hoyStr,
    operariaId,
    operariaNombre,
    tipo,
    completado: false,
    items: tipo === 'horarios_clientes' ? itemsIniciales : undefined,
    createdAt: Timestamp.now(),
  };
  await setDoc(ref, limpiar(nuevo));
  return parseRecordatorio(docId, nuevo);
}

export async function marcarCompletado(recordatorioId: string): Promise<void> {
  await updateDoc(doc(db, 'recordatorios_diarios', recordatorioId), {
    completado: true,
    completadoEn: Timestamp.now(),
  });
}

export async function marcarItemAvisado(
  recordatorioId: string,
  ordenId: string,
  avisado: boolean,
): Promise<void> {
  const ref = doc(db, 'recordatorios_diarios', recordatorioId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as RecordatorioDiario;
  const items = (data.items || []).map(it =>
    it.ordenId === ordenId
      ? { ...it, avisado, ...(avisado ? { avisadoEn: Timestamp.now() } : {}) }
      : it,
  );
  await updateDoc(ref, { items });
}

export async function actualizarItems(
  recordatorioId: string,
  items: ItemAviso[],
): Promise<void> {
  await updateDoc(doc(db, 'recordatorios_diarios', recordatorioId), { items });
}

export async function marcarNotificadoAAdmin(recordatorioId: string): Promise<void> {
  await updateDoc(doc(db, 'recordatorios_diarios', recordatorioId), {
    notificadoAAdmin: true,
  });
}

/** Suscribirse a todos los recordatorios de una fecha específica. */
export function suscribirRecordatoriosDelDia(
  fecha: string,
  cb: (recs: RecordatorioDiario[]) => void,
): () => void {
  const q = query(collection(db, 'recordatorios_diarios'), where('fecha', '==', fecha));
  return onSnapshot(q, (snap) => {
    const recs = snap.docs.map(d => parseRecordatorio(d.id, d.data()));
    cb(recs);
  });
}

export async function obtenerRecordatoriosDelDia(fecha: string): Promise<RecordatorioDiario[]> {
  const q = query(collection(db, 'recordatorios_diarios'), where('fecha', '==', fecha));
  const snap = await getDocs(q);
  return snap.docs.map(d => parseRecordatorio(d.id, d.data()));
}
