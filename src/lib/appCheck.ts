import { getToken } from 'firebase/app-check';
import { appCheck } from '../firebase/config';

/**
 * Devuelve el token App Check actual o null si no se pudo obtener.
 * El JWT NO se loguea — solo lo consume el caller para el header
 * `X-Firebase-AppCheck`. En fase A del audit C3, si esto retorna null el
 * caller debe mandar el request igual sin header (no romper flujo).
 */
export async function obtenerAppCheckToken(): Promise<string | null> {
  if (!appCheck) return null;
  try {
    const result = await getToken(appCheck, false);
    return result.token;
  } catch {
    console.warn('[appCheck] no se pudo obtener token');
    return null;
  }
}
