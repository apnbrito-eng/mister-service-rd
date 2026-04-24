import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export interface ConfigEmpresa {
  nombre: string;
  rnc: string;
  direccion: string;
  telefono: string;
  email: string;
  updatedAt?: Date;
  updatedPor?: string;
}

const COLLECTION = 'config';
const DOC_ID = 'empresa';

export const CONFIG_EMPRESA_DEFAULT: ConfigEmpresa = {
  nombre: 'Mister Service RD',
  rnc: '000-000000-0',
  direccion: '',
  telefono: '',
  email: '',
};

function mapData(data: Record<string, unknown> | undefined): ConfigEmpresa {
  const d = data ?? {};
  return {
    nombre:
      typeof d.nombre === 'string' && d.nombre
        ? d.nombre
        : CONFIG_EMPRESA_DEFAULT.nombre,
    rnc:
      typeof d.rnc === 'string' && d.rnc
        ? d.rnc
        : CONFIG_EMPRESA_DEFAULT.rnc,
    direccion:
      typeof d.direccion === 'string'
        ? d.direccion
        : CONFIG_EMPRESA_DEFAULT.direccion,
    telefono:
      typeof d.telefono === 'string'
        ? d.telefono
        : CONFIG_EMPRESA_DEFAULT.telefono,
    email:
      typeof d.email === 'string' ? d.email : CONFIG_EMPRESA_DEFAULT.email,
    updatedAt:
      (d.updatedAt as { toDate?: () => Date } | undefined)?.toDate?.() ||
      undefined,
    updatedPor: typeof d.updatedPor === 'string' ? d.updatedPor : undefined,
  };
}

/** Lee config de empresa. Si no existe aún, devuelve defaults. */
export async function obtenerConfigEmpresa(): Promise<ConfigEmpresa> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, DOC_ID));
    if (!snap.exists()) return { ...CONFIG_EMPRESA_DEFAULT };
    return mapData(snap.data() as Record<string, unknown>);
  } catch (err) {
    console.warn('Error leyendo config empresa:', err);
    return { ...CONFIG_EMPRESA_DEFAULT };
  }
}

/** Suscripción en tiempo real a la config de empresa. */
export function suscribirConfigEmpresa(
  callback: (config: ConfigEmpresa) => void,
): Unsubscribe {
  return onSnapshot(doc(db, COLLECTION, DOC_ID), snap => {
    if (!snap.exists()) {
      callback({ ...CONFIG_EMPRESA_DEFAULT });
      return;
    }
    callback(mapData(snap.data() as Record<string, unknown>));
  });
}

/** Actualiza la config de empresa (merge). Strip de undefined. */
export async function actualizarConfigEmpresa(
  cambios: Partial<Omit<ConfigEmpresa, 'updatedAt'>>,
  usuarioNombre?: string,
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
  };
  if (cambios.nombre !== undefined) payload.nombre = cambios.nombre;
  if (cambios.rnc !== undefined) payload.rnc = cambios.rnc;
  if (cambios.direccion !== undefined) payload.direccion = cambios.direccion;
  if (cambios.telefono !== undefined) payload.telefono = cambios.telefono;
  if (cambios.email !== undefined) payload.email = cambios.email;
  if (usuarioNombre) payload.updatedPor = usuarioNombre;
  await setDoc(doc(db, COLLECTION, DOC_ID), payload, { merge: true });
}
