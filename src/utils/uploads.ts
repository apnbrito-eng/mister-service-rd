/**
 * Validación de archivos subidos por el público y por técnicos/operarias.
 *
 * Audit fix SPRINT-137 (2026-05-11): antes los services `subirArchivoSolicitud`,
 * `subirFotoCierre`, `subirFotoInicioChequeo` aceptaban cualquier File/Blob sin
 * chequear tamaño, MIME real ni cantidad. Vector de abuso: .exe disfrazado de .jpg
 * de 500MB entraba a Storage.
 *
 * Defense in depth: este es el primer filtro (cliente). Storage Rules es el segundo
 * (SPRINT-138).
 */

/** Máximo tamaño por archivo (10 MB) — decisión Jorge 2026-05-11 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Máximo cantidad de archivos por solicitud/campo — bloquea spam sin afectar uso legítimo */
export const MAX_ARCHIVOS_POR_SOLICITUD = 10;

/** MIME types aceptados para fotos (cierre, inicio, formulario público) */
export const MIME_WHITELIST_FOTO = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

/** MIME types aceptados para firmas (canvas → PNG suelen ser) */
export const MIME_WHITELIST_FIRMA = [
  'image/png',
  'image/svg+xml',
  'image/jpeg',
] as const;

/** MIME types aceptados para campos genéricos de formulario público (acepta PDF + fotos) */
export const MIME_WHITELIST_DOC = [
  'application/pdf',
  ...MIME_WHITELIST_FOTO,
] as const;

export type ResultadoValidacion =
  | { ok: true }
  | { ok: false; error: string };

interface OpcionesValidacion {
  /** Lista de MIME aceptados. Por default: MIME_WHITELIST_FOTO. */
  whitelist?: readonly string[];
  /** Tamaño máximo en bytes. Por default: MAX_FILE_BYTES (10 MB). */
  maxBytes?: number;
}

/**
 * Valida que un archivo cumple con tamaño y tipo MIME aceptado.
 *
 * Devuelve `{ ok: true }` si pasa, o `{ ok: false, error: string }` con mensaje
 * en español listo para mostrar al usuario.
 *
 * NO valida sniffing de magic bytes (esa segunda capa es opcional y vive en el caller).
 * Para casos de alta sensibilidad, agregar `await sniffearMime(file)` después.
 */
export function validarArchivoPublico(
  file: File | { name: string; size: number; type: string },
  opts: OpcionesValidacion = {},
): ResultadoValidacion {
  const whitelist = opts.whitelist ?? MIME_WHITELIST_FOTO;
  const maxBytes = opts.maxBytes ?? MAX_FILE_BYTES;

  // 1. Tamaño
  if (file.size > maxBytes) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    const maxMB = (maxBytes / 1024 / 1024).toFixed(0);
    return {
      ok: false,
      error: `El archivo "${file.name}" pesa ${sizeMB} MB. El máximo permitido es ${maxMB} MB. Reducí la calidad de la foto desde tu cámara y volvé a intentar.`,
    };
  }

  // 2. Archivo vacío
  if (file.size === 0) {
    return {
      ok: false,
      error: `El archivo "${file.name}" está vacío. Seleccioná otro archivo.`,
    };
  }

  // 3. MIME declarado en whitelist
  // Nota: file.type puede venir vacío en algunos navegadores antiguos o
  // si el archivo no tiene extensión. Tratamos vacío como rechazo.
  if (!file.type) {
    return {
      ok: false,
      error: `No se pudo identificar el tipo del archivo "${file.name}". Asegurate que sea una foto (jpg, png, webp) o PDF.`,
    };
  }

  const tipoAceptado = whitelist.some((mime) => file.type === mime);
  if (!tipoAceptado) {
    const formatosLegibles = whitelist
      .map((m) => m.split('/')[1].toUpperCase())
      .join(', ');
    return {
      ok: false,
      error: `El archivo "${file.name}" tiene formato no permitido (${file.type}). Solo se aceptan: ${formatosLegibles}.`,
    };
  }

  return { ok: true };
}

/** Atajo para validar fotos (default whitelist FOTO) */
export function validarFoto(file: File): ResultadoValidacion {
  return validarArchivoPublico(file, { whitelist: MIME_WHITELIST_FOTO });
}

/** Atajo para validar firmas (whitelist FIRMA, max 2 MB que sobra para PNG de canvas) */
export function validarFirma(file: File | Blob): ResultadoValidacion {
  // Las firmas pueden venir como Blob sin name. Generamos uno sintético.
  const f = (file instanceof File
    ? file
    : { name: 'firma.png', size: file.size, type: file.type || 'image/png' }) as
    | File
    | { name: string; size: number; type: string };
  return validarArchivoPublico(f, {
    whitelist: MIME_WHITELIST_FIRMA,
    maxBytes: 2 * 1024 * 1024,
  });
}

/** Atajo para campos de formulario público que aceptan PDF + imagen */
export function validarDocumento(file: File): ResultadoValidacion {
  return validarArchivoPublico(file, { whitelist: MIME_WHITELIST_DOC });
}

/**
 * Valida cantidad de archivos en un campo de tipo "archivo_multiple".
 * Bloquea spam o adjuntos accidentales gigantes.
 */
export function validarCantidadArchivos(
  files: FileList | File[],
  max: number = MAX_ARCHIVOS_POR_SOLICITUD,
): ResultadoValidacion {
  const count = files instanceof FileList ? files.length : files.length;
  if (count > max) {
    return {
      ok: false,
      error: `Subiste ${count} archivos. El máximo permitido por campo es ${max}.`,
    };
  }
  return { ok: true };
}

/**
 * Sniffea los primeros 12 bytes del archivo y compara contra magic numbers
 * conocidos para confirmar que el MIME declarado coincide con el contenido real.
 *
 * Bloquea casos como `.exe` renombrado a `.jpg` que pasan la whitelist por `file.type`
 * pero no por contenido. Opcional — si complica, se puede saltear y dejar solo el
 * filtro por MIME declarado.
 *
 * Retorna `true` si el MIME declarado coincide con el contenido, `false` si no.
 * Retorna `true` también si no se puede determinar (best-effort, no estricto).
 */
export async function sniffMimeCoincide(file: File): Promise<boolean> {
  try {
    const buf = await file.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(buf);

    const matchHex = (hex: string, offset = 0): boolean => {
      const target = hex.replace(/\s/g, '');
      for (let i = 0; i < target.length / 2; i++) {
        const b = parseInt(target.substring(i * 2, i * 2 + 2), 16);
        if (bytes[offset + i] !== b) return false;
      }
      return true;
    };

    // JPEG: FF D8 FF
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      return matchHex('FFD8FF');
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (file.type === 'image/png') {
      return matchHex('89504E470D0A1A0A');
    }
    // PDF: 25 50 44 46 ("%PDF")
    if (file.type === 'application/pdf') {
      return matchHex('25504446');
    }
    // WebP: bytes 0-3 = "RIFF", bytes 8-11 = "WEBP"
    if (file.type === 'image/webp') {
      return matchHex('52494646') && matchHex('57454250', 8);
    }
    // SVG: empieza con "<?xml" (3C 3F 78 6D 6C) o "<svg" (3C 73 76 67)
    if (file.type === 'image/svg+xml') {
      return matchHex('3C3F786D6C') || matchHex('3C737667');
    }
    // HEIC / HEIF: ftyp box en bytes 4-7 = "ftyp"
    if (file.type === 'image/heic' || file.type === 'image/heif') {
      return matchHex('66747970', 4);
    }
    // Si no tenemos magic number registrado para el MIME, no bloqueamos.
    return true;
  } catch {
    // Error leyendo el archivo (red, permisos). No bloquear.
    return true;
  }
}
