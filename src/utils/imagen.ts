/**
 * Helpers para compresión de imágenes client-side (sin libs externas).
 *
 * Usado por el formulario público `/agendar` cuando el cliente sube una foto
 * del equipo: se reescala a max 1600px y se reencoda como JPEG bajando la
 * calidad iterativamente hasta cumplir el cap de tamaño (default 1MB).
 *
 * Si la compresión falla (canvas sin soporte, browser exótico), el caller
 * decide si subir el original con warning o abortar.
 */

export interface CompresionOpts {
  /** Tamaño máximo objetivo en bytes. Default 1_000_000 (1MB). */
  maxBytes?: number;
  /** Lado mayor máximo en píxeles. Default 1600. */
  maxDim?: number;
  /** Calidad JPEG inicial (0-1). Default 0.85. */
  qualityInicial?: number;
  /** Calidad JPEG mínima antes de rendirse. Default 0.4. */
  qualityMinima?: number;
}

/**
 * Comprime una imagen usando `<canvas>` y `toBlob`. Itera bajando la calidad
 * hasta cumplir `maxBytes` o llegar a `qualityMinima`. Si en el último intento
 * el blob excede `maxBytes`, igual se retorna (es preferible subir algo más
 * pesado que abortar).
 *
 * @throws Error si el browser no soporta canvas / toBlob, o si la imagen no
 *               carga (ej: archivo corrupto). El caller debe tener fallback.
 */
export async function comprimirImagen(
  file: File,
  opts: CompresionOpts = {},
): Promise<Blob> {
  const {
    maxBytes = 1_000_000,
    maxDim = 1600,
    qualityInicial = 0.85,
    qualityMinima = 0.4,
  } = opts;

  // 1) Cargar la imagen en un HTMLImageElement
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => {
      URL.revokeObjectURL(url);
      resolve(i);
    };
    i.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e instanceof Event ? new Error('No se pudo cargar la imagen') : e);
    };
    i.src = url;
  });

  // 2) Calcular dimensiones target manteniendo aspect ratio
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  // 3) Dibujar en canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context no disponible');
  ctx.drawImage(img, 0, 0, width, height);

  // 4) Iterar quality hasta cumplir maxBytes
  let quality = qualityInicial;
  let lastBlob: Blob | null = null;
  while (quality >= qualityMinima) {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (!blob) {
      // toBlob no soportado o error inesperado
      throw new Error('canvas.toBlob retornó null');
    }
    lastBlob = blob;
    if (blob.size <= maxBytes) return blob;
    quality -= 0.15;
  }

  // 5) Último intento (puede exceder maxBytes pero es preferible a abortar)
  if (!lastBlob) throw new Error('No se pudo comprimir la imagen');
  return lastBlob;
}
