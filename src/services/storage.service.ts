import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';
import { calcularDistanciaKm } from '../utils/rutas';

/** Sube foto de cierre a Firebase Storage y retorna URL pública */
export async function subirFotoCierre(
  ordenId: string,
  file: File | Blob
): Promise<string> {
  const timestamp = Date.now();
  const fileName = `cierre-${timestamp}.jpg`;
  const path = `fotos-servicio/${ordenId}/${fileName}`;
  const ref = storageRef(storage, path);

  // Timeout de 30 segundos para la subida
  const uploadPromise = uploadBytes(ref, file);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout: la subida de la foto tardó más de 30 segundos')), 30000)
  );

  await Promise.race([uploadPromise, timeoutPromise]);
  return await getDownloadURL(ref);
}

/** Sube foto de inicio de chequeo a Firebase Storage y retorna URL pública */
export async function subirFotoInicioChequeo(
  ordenId: string,
  file: File | Blob
): Promise<string> {
  const timestamp = Date.now();
  const fileName = `inicio-chequeo-${timestamp}.jpg`;
  const path = `fotos-servicio/${ordenId}/${fileName}`;
  const ref = storageRef(storage, path);

  const uploadPromise = uploadBytes(ref, file);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout: la subida de la foto tardó más de 30 segundos')), 30000)
  );

  await Promise.race([uploadPromise, timeoutPromise]);
  return await getDownloadURL(ref);
}

/** Error estructurado del GPS para que el caller pueda mostrar mensajes específicos. */
export interface GpsErrorInfo {
  /** 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT, 0=otro */
  code: number;
  message: string;
  /** Intento que falló: true = alta precisión; false = baja precisión */
  highAccuracy: boolean;
}

/**
 * Obtiene posición GPS del dispositivo con estrategia de 2 pasos:
 *  1) Intenta alta precisión (GPS físico) con timeout 15s.
 *  2) Si falla, reintenta con baja precisión (WiFi/celular) con timeout 10s.
 *  3) Si ambos fallan, devuelve null.
 *
 * Motivo del fallback: en Android en interiores, el GPS físico puede tardar 30+ segundos.
 * La baja precisión usa red WiFi/celular y responde en 1-3s con ~100m de exactitud.
 *
 * @param onError callback opcional que recibe el error de cada intento (útil para
 *                mostrar mensaje específico al usuario según el código).
 */
export function obtenerUbicacionGPS(
  onError?: (err: GpsErrorInfo) => void,
): Promise<{ lat: number; lng: number } | null> {
  if (!navigator.geolocation) {
    onError?.({ code: 0, message: 'navigator.geolocation no disponible', highAccuracy: true });
    return Promise.resolve(null);
  }

  const intentar = (enableHighAccuracy: boolean, timeout: number) =>
    new Promise<{ lat: number; lng: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          onError?.({
            code: err.code,
            message: err.message || '',
            highAccuracy: enableHighAccuracy,
          });
          resolve(null);
        },
        { enableHighAccuracy, timeout, maximumAge: 0 },
      );
    });

  return intentar(true, 15000).then((alta) => {
    if (alta) return alta;
    // Fallback rápido cuando el GPS físico no responde
    return intentar(false, 10000);
  });
}

/** Calcula distancia en metros entre dos coordenadas */
export function distanciaMetros(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  return Math.round(calcularDistanciaKm(lat1, lng1, lat2, lng2) * 1000);
}
