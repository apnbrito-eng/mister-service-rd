import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { TIPOS_EQUIPO } from '../utils';

export interface ConfigTiposEquipo {
  lista: string[];
  updatedAt?: Date;
  updatedPor?: string;
}

const COLLECTION = 'config';
const DOC_ID = 'tiposEquipo';

function mapLista(data: Record<string, unknown> | undefined): string[] {
  const d = data ?? {};
  if (Array.isArray(d.lista)) {
    return d.lista.filter((x): x is string => typeof x === 'string' && !!x);
  }
  return [...TIPOS_EQUIPO];
}

/** Lee la lista de tipos de equipo. Si no existe doc, devuelve la lista hardcoded como fallback. */
export async function obtenerTiposEquipo(): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, DOC_ID));
    if (!snap.exists()) return [...TIPOS_EQUIPO];
    return mapLista(snap.data() as Record<string, unknown>);
  } catch (err) {
    console.warn('Error leyendo tipos de equipo:', err);
    return [...TIPOS_EQUIPO];
  }
}

/** Suscripción en tiempo real a la lista de tipos de equipo. */
export function suscribirTiposEquipo(
  callback: (lista: string[]) => void,
): Unsubscribe {
  return onSnapshot(doc(db, COLLECTION, DOC_ID), snap => {
    if (!snap.exists()) {
      callback([...TIPOS_EQUIPO]);
      return;
    }
    callback(mapLista(snap.data() as Record<string, unknown>));
  });
}

/** Actualiza la lista de tipos de equipo (merge). */
export async function actualizarTiposEquipo(
  lista: string[],
  usuarioNombre?: string,
): Promise<void> {
  const listaLimpia = lista.filter(
    x => typeof x === 'string' && x.trim().length > 0,
  );
  const payload: Record<string, unknown> = {
    lista: listaLimpia,
    updatedAt: Timestamp.now(),
  };
  if (usuarioNombre) payload.updatedPor = usuarioNombre;
  await setDoc(doc(db, COLLECTION, DOC_ID), payload, { merge: true });
}
