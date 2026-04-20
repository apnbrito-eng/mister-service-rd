import { doc, getDoc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const COL = 'config';
const DOC_ID = 'fiscal';

export interface ConfigFiscal {
  /** Porcentaje de ITBIS (ej: 18 para 18%) */
  itbisPorcentaje: number;
  /** RNC de la empresa para facturas */
  rncEmpresa?: string;
  /** Razón social para facturas */
  razonSocial?: string;
  /** Dirección fiscal */
  direccionFiscal?: string;
  updatedAt?: Date;
  updatedPor?: string;
}

export const CONFIG_FISCAL_DEFAULT: ConfigFiscal = {
  itbisPorcentaje: 18,
  razonSocial: 'Fixman SRL',
  rncEmpresa: '133-118191',
};

/** Lee config fiscal. Si no existe aún, devuelve defaults. */
export async function obtenerConfigFiscal(): Promise<ConfigFiscal> {
  try {
    const snap = await getDoc(doc(db, COL, DOC_ID));
    if (!snap.exists()) return { ...CONFIG_FISCAL_DEFAULT };
    const data = snap.data();
    return {
      itbisPorcentaje: typeof data.itbisPorcentaje === 'number' ? data.itbisPorcentaje : 18,
      rncEmpresa: (data.rncEmpresa as string) || CONFIG_FISCAL_DEFAULT.rncEmpresa,
      razonSocial: (data.razonSocial as string) || CONFIG_FISCAL_DEFAULT.razonSocial,
      direccionFiscal: (data.direccionFiscal as string) || undefined,
      updatedAt: data.updatedAt?.toDate?.() || undefined,
      updatedPor: (data.updatedPor as string) || undefined,
    };
  } catch (err) {
    console.warn('Error leyendo config fiscal:', err);
    return { ...CONFIG_FISCAL_DEFAULT };
  }
}

/** Suscripción en tiempo real a la config fiscal. */
export function suscribirConfigFiscal(
  callback: (config: ConfigFiscal) => void,
): () => void {
  return onSnapshot(doc(db, COL, DOC_ID), snap => {
    if (!snap.exists()) {
      callback({ ...CONFIG_FISCAL_DEFAULT });
      return;
    }
    const data = snap.data();
    callback({
      itbisPorcentaje: typeof data.itbisPorcentaje === 'number' ? data.itbisPorcentaje : 18,
      rncEmpresa: (data.rncEmpresa as string) || CONFIG_FISCAL_DEFAULT.rncEmpresa,
      razonSocial: (data.razonSocial as string) || CONFIG_FISCAL_DEFAULT.razonSocial,
      direccionFiscal: (data.direccionFiscal as string) || undefined,
      updatedAt: data.updatedAt?.toDate?.() || undefined,
      updatedPor: (data.updatedPor as string) || undefined,
    });
  });
}

/** Actualiza la config fiscal (merge). */
export async function actualizarConfigFiscal(
  cambios: Partial<Omit<ConfigFiscal, 'updatedAt'>>,
  usuario?: string,
): Promise<void> {
  const payload: Record<string, unknown> = {
    ...cambios,
    updatedAt: Timestamp.now(),
  };
  if (usuario) payload.updatedPor = usuario;
  await setDoc(doc(db, COL, DOC_ID), payload, { merge: true });
}
