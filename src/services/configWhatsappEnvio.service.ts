import { doc, getDoc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const COL = 'config';
const DOC_ENVIO = 'whatsapp_envio';
const DOC_NUMEROS = 'whatsapp_numeros';

/**
 * SPRINT-WA-INBOX-UX-QUICKWINS (2026-05-23) — quickwin 1: el selector de
 * número de envío en /admin/configuracion muestra el número de teléfono
 * REAL (humano) además del `phoneNumberId` (código interno de Meta).
 * El `numeroReal` se persiste en el catálogo `config/whatsapp_numeros`
 * y se sincroniza con la UI; los defaults vienen seedeados con los 2
 * números reales que Jorge confirmó:
 *   - 1226992440486630 → +1 829-471-6265 (Principal)
 *   - 1151997541323577 → +1 849-564-6767 (Respaldo)
 */

/**
 * Configuración de envío de WhatsApp — selector admin-only para forzar
 * el número de envío cuando se necesita respaldo manual.
 *
 * `phoneNumberIdForzado === null` significa **modo automático** (intacto):
 * el endpoint `api/whatsapp/send.ts` sigue la cascada original
 * (param override > `conversaciones.{wa_id}.ultimoPhoneNumberId` sticky > env).
 *
 * Cuando `phoneNumberIdForzado` está seteado, el endpoint lo usa para TODOS
 * los envíos salientes ignorando el sticky por conversación. Validado contra
 * `META_PHONE_NUMBER_IDS_ALLOWLIST` (defense-in-depth) — si no está en la
 * allowlist, el envío se rechaza con 403.
 *
 * SPRINT-WA-NUMERO-RESPALDO-MANUAL Fase 1 (2026-05-22).
 */
export interface ConfigWhatsappEnvio {
  /** Si está seteado, se usa para TODOS los envíos. `null` = modo automático. */
  phoneNumberIdForzado: string | null;
  /** Etiqueta humana opcional (ej: "Respaldo") — solo UI. */
  etiqueta?: string;
  actualizadoEn?: Date;
  actualizadoPor?: string;
}

export interface NumeroWhatsapp {
  phoneNumberId: string;
  etiqueta: string;
  /** Número de teléfono REAL (humano) ej: "+1 829-471-6265". Opcional para
   *  retrocompatibilidad — los docs viejos pueden no tenerlo. */
  numeroReal?: string;
}

export interface ConfigWhatsappNumeros {
  numeros: NumeroWhatsapp[];
  actualizadoEn?: Date;
  actualizadoPor?: string;
}

export const CONFIG_WHATSAPP_ENVIO_DEFAULT: ConfigWhatsappEnvio = {
  phoneNumberIdForzado: null,
};

export const CONFIG_WHATSAPP_NUMEROS_DEFAULT: ConfigWhatsappNumeros = {
  numeros: [
    {
      phoneNumberId: '1226992440486630',
      etiqueta: 'Principal',
      numeroReal: '+1 829-471-6265',
    },
    {
      phoneNumberId: '1151997541323577',
      etiqueta: 'Respaldo',
      numeroReal: '+1 849-564-6767',
    },
  ],
};

function parseConfigEnvio(data: Record<string, unknown> | undefined): ConfigWhatsappEnvio {
  if (!data) return { ...CONFIG_WHATSAPP_ENVIO_DEFAULT };
  const forzado = data.phoneNumberIdForzado;
  return {
    phoneNumberIdForzado:
      typeof forzado === 'string' && forzado.trim().length > 0 ? forzado.trim() : null,
    etiqueta: typeof data.etiqueta === 'string' ? data.etiqueta : undefined,
    actualizadoEn:
      data.actualizadoEn && typeof (data.actualizadoEn as { toDate?: unknown }).toDate === 'function'
        ? (data.actualizadoEn as { toDate: () => Date }).toDate()
        : undefined,
    actualizadoPor: typeof data.actualizadoPor === 'string' ? data.actualizadoPor : undefined,
  };
}

function parseConfigNumeros(data: Record<string, unknown> | undefined): ConfigWhatsappNumeros {
  if (!data) return { ...CONFIG_WHATSAPP_NUMEROS_DEFAULT };
  const raw = data.numeros;
  const numeros: NumeroWhatsapp[] = Array.isArray(raw)
    ? raw
        .map((n) => {
          if (!n || typeof n !== 'object') return null;
          const obj = n as Record<string, unknown>;
          const phoneNumberId = typeof obj.phoneNumberId === 'string' ? obj.phoneNumberId.trim() : '';
          const etiqueta = typeof obj.etiqueta === 'string' ? obj.etiqueta.trim() : '';
          const numeroReal = typeof obj.numeroReal === 'string' ? obj.numeroReal.trim() : '';
          if (!phoneNumberId) return null;
          const item: NumeroWhatsapp = {
            phoneNumberId,
            etiqueta: etiqueta || phoneNumberId,
          };
          if (numeroReal) item.numeroReal = numeroReal;
          return item;
        })
        .filter((n): n is NumeroWhatsapp => n !== null)
    : [];
  return {
    numeros: numeros.length > 0 ? numeros : CONFIG_WHATSAPP_NUMEROS_DEFAULT.numeros,
    actualizadoEn:
      data.actualizadoEn && typeof (data.actualizadoEn as { toDate?: unknown }).toDate === 'function'
        ? (data.actualizadoEn as { toDate: () => Date }).toDate()
        : undefined,
    actualizadoPor: typeof data.actualizadoPor === 'string' ? data.actualizadoPor : undefined,
  };
}

/** Lee la config de envío. Si no existe el doc, devuelve defaults (modo automático). */
export async function obtenerConfigWhatsappEnvio(): Promise<ConfigWhatsappEnvio> {
  try {
    const snap = await getDoc(doc(db, COL, DOC_ENVIO));
    if (!snap.exists()) return { ...CONFIG_WHATSAPP_ENVIO_DEFAULT };
    return parseConfigEnvio(snap.data());
  } catch (err) {
    console.warn('Error leyendo config/whatsapp_envio:', err);
    return { ...CONFIG_WHATSAPP_ENVIO_DEFAULT };
  }
}

/** Suscripción en tiempo real al doc de envío. */
export function suscribirConfigWhatsappEnvio(
  callback: (config: ConfigWhatsappEnvio) => void,
): () => void {
  return onSnapshot(doc(db, COL, DOC_ENVIO), (snap) => {
    if (!snap.exists()) {
      callback({ ...CONFIG_WHATSAPP_ENVIO_DEFAULT });
      return;
    }
    callback(parseConfigEnvio(snap.data()));
  });
}

/** Actualiza la config de envío (write rule: solo admin). */
export async function actualizarConfigWhatsappEnvio(
  cambios: { phoneNumberIdForzado: string | null; etiqueta?: string },
  usuario?: string,
): Promise<void> {
  const payload: Record<string, unknown> = {
    phoneNumberIdForzado: cambios.phoneNumberIdForzado,
    actualizadoEn: Timestamp.now(),
  };
  if (cambios.etiqueta !== undefined) payload.etiqueta = cambios.etiqueta;
  if (usuario) payload.actualizadoPor = usuario;
  await setDoc(doc(db, COL, DOC_ENVIO), payload, { merge: true });
}

/** Lee el catálogo de números. Si no existe, devuelve los 2 seed. */
export async function obtenerConfigWhatsappNumeros(): Promise<ConfigWhatsappNumeros> {
  try {
    const snap = await getDoc(doc(db, COL, DOC_NUMEROS));
    if (!snap.exists()) return { ...CONFIG_WHATSAPP_NUMEROS_DEFAULT };
    return parseConfigNumeros(snap.data());
  } catch (err) {
    console.warn('Error leyendo config/whatsapp_numeros:', err);
    return { ...CONFIG_WHATSAPP_NUMEROS_DEFAULT };
  }
}

/** Suscripción en tiempo real al catálogo. */
export function suscribirConfigWhatsappNumeros(
  callback: (config: ConfigWhatsappNumeros) => void,
): () => void {
  return onSnapshot(doc(db, COL, DOC_NUMEROS), (snap) => {
    if (!snap.exists()) {
      callback({ ...CONFIG_WHATSAPP_NUMEROS_DEFAULT });
      return;
    }
    callback(parseConfigNumeros(snap.data()));
  });
}

/** Actualiza el catálogo de números (write rule: solo admin). */
export async function actualizarConfigWhatsappNumeros(
  numeros: NumeroWhatsapp[],
  usuario?: string,
): Promise<void> {
  // CLAUDE.md "strip undefined fields before addDoc/setDoc": NO incluir
  // `numeroReal: undefined` en el payload (Firestore rechaza undefined).
  const limpio = numeros
    .map((n) => {
      const phoneNumberId = n.phoneNumberId?.trim() ?? '';
      const etiqueta = n.etiqueta?.trim() || phoneNumberId;
      const numeroReal = n.numeroReal?.trim() ?? '';
      const item: NumeroWhatsapp = { phoneNumberId, etiqueta };
      if (numeroReal) item.numeroReal = numeroReal;
      return item;
    })
    .filter((n) => n.phoneNumberId.length > 0);
  const payload: Record<string, unknown> = {
    numeros: limpio,
    actualizadoEn: Timestamp.now(),
  };
  if (usuario) payload.actualizadoPor = usuario;
  await setDoc(doc(db, COL, DOC_NUMEROS), payload, { merge: true });
}
