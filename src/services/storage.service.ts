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
  await uploadBytes(ref, file);
  return await getDownloadURL(ref);
}

/** Obtiene posición GPS del dispositivo */
export function obtenerUbicacionGPS(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

/** Calcula distancia en metros entre dos coordenadas */
export function distanciaMetros(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  return Math.round(calcularDistanciaKm(lat1, lng1, lat2, lng2) * 1000);
}
