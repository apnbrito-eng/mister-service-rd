import { doc, getDoc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const COL = 'config';
const DOC_RESPUESTAS = 'whatsapp_respuestas_rapidas';

/**
 * SPRINT-WA-TRAZABILIDAD-Y-RESPUESTAS-RAPIDAS (2026-05-23) — función 3:
 * respuestas rápidas programables tipo WhatsApp Business. Doc Firestore
 * `config/whatsapp_respuestas_rapidas` admin-editable, accesible para todo
 * el staff (read). UI: editor en /admin/configuracion + dropdown "/" en
 * el composer del inbox (InboxConversacion).
 *
 * Rule (firestore.rules): match específico `config/whatsapp_respuestas_rapidas`
 * con `read: esStaff()` + `write: esAdmin()` (espejo del patrón de
 * whatsapp_envio + whatsapp_numeros, líneas 583-595 — múltiples matches
 * intersectan a admin-write efectivo).
 */

export interface WhatsappRespuestaRapida {
  /** ID estable (uuid o timestamp) usado como key React + para tracking. */
  id: string;
  /** Atajo corto sin el `/` (ej: "hola", "horario"). Único informalmente — el editor previene duplicados client-side. */
  atajo: string;
  /** Texto que se inserta en el composer al elegir la respuesta. */
  texto: string;
}

export interface ConfigWhatsappRespuestasRapidas {
  items: WhatsappRespuestaRapida[];
  actualizadoEn?: Date;
  actualizadoPor?: string;
}

export const CONFIG_WHATSAPP_RESPUESTAS_DEFAULT: ConfigWhatsappRespuestasRapidas = {
  items: [],
};

function parseConfigRespuestas(
  data: Record<string, unknown> | undefined,
): ConfigWhatsappRespuestasRapidas {
  if (!data) return { ...CONFIG_WHATSAPP_RESPUESTAS_DEFAULT };
  const raw = data.items;
  const items: WhatsappRespuestaRapida[] = Array.isArray(raw)
    ? raw
        .map((n) => {
          if (!n || typeof n !== 'object') return null;
          const obj = n as Record<string, unknown>;
          const id = typeof obj.id === 'string' ? obj.id.trim() : '';
          const atajo = typeof obj.atajo === 'string' ? obj.atajo.trim() : '';
          const texto = typeof obj.texto === 'string' ? obj.texto : '';
          if (!id || !atajo || !texto.trim()) return null;
          return { id, atajo, texto };
        })
        .filter((n): n is WhatsappRespuestaRapida => n !== null)
    : [];
  return {
    items,
    actualizadoEn:
      data.actualizadoEn && typeof (data.actualizadoEn as { toDate?: unknown }).toDate === 'function'
        ? (data.actualizadoEn as { toDate: () => Date }).toDate()
        : undefined,
    actualizadoPor: typeof data.actualizadoPor === 'string' ? data.actualizadoPor : undefined,
  };
}

/** Lee la config. Si no existe el doc, devuelve defaults (lista vacía). */
export async function obtenerRespuestasRapidas(): Promise<ConfigWhatsappRespuestasRapidas> {
  try {
    const snap = await getDoc(doc(db, COL, DOC_RESPUESTAS));
    if (!snap.exists()) return { ...CONFIG_WHATSAPP_RESPUESTAS_DEFAULT };
    return parseConfigRespuestas(snap.data());
  } catch (err) {
    console.warn('Error leyendo config/whatsapp_respuestas_rapidas:', err);
    return { ...CONFIG_WHATSAPP_RESPUESTAS_DEFAULT };
  }
}

/** Suscripción en tiempo real. */
export function suscribirRespuestasRapidas(
  callback: (config: ConfigWhatsappRespuestasRapidas) => void,
): () => void {
  return onSnapshot(doc(db, COL, DOC_RESPUESTAS), (snap) => {
    if (!snap.exists()) {
      callback({ ...CONFIG_WHATSAPP_RESPUESTAS_DEFAULT });
      return;
    }
    callback(parseConfigRespuestas(snap.data()));
  });
}

/** Actualiza la lista (write rule: solo admin). CLAUDE.md strip undefined. */
export async function actualizarRespuestasRapidas(
  items: WhatsappRespuestaRapida[],
  usuario?: string,
): Promise<void> {
  const limpio = items
    .map((it) => ({
      id: it.id?.trim() ?? '',
      atajo: it.atajo?.trim() ?? '',
      texto: it.texto ?? '',
    }))
    .filter((it) => it.id.length > 0 && it.atajo.length > 0 && it.texto.trim().length > 0);
  const payload: Record<string, unknown> = {
    items: limpio,
    actualizadoEn: Timestamp.now(),
  };
  if (usuario) payload.actualizadoPor = usuario;
  await setDoc(doc(db, COL, DOC_RESPUESTAS), payload, { merge: true });
}
