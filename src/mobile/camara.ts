import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
export const esAppNativa = () => Capacitor.isNativePlatform();
/** Siempre cámara; no galería y no se copia la evidencia al carrete personal. */
export async function capturarFotoNativa(): Promise<File> {
  if (!esAppNativa()) throw new Error('Esta captura requiere la app instalada.');
  const photo = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Uri, quality: 80, width: 1600, correctOrientation: true, allowEditing: false, saveToGallery: false });
  if (!photo.webPath) throw new Error('No se recibió la fotografía.');
  const result = await fetch(photo.webPath);
  if (!result.ok) throw new Error('No se pudo leer la fotografía.');
  const blob = await result.blob();
  return new File([blob], `evidencia-${Date.now()}.${photo.format}`, { type: blob.type || `image/${photo.format}`, lastModified: Date.now() });
}
