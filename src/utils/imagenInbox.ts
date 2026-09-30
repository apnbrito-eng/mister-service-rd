import { validarFoto } from './uploads';
export async function validarImagenInbox(archivo: File): Promise<void> {
  const validacion = validarFoto(archivo);
  if (!validacion.ok) throw new Error(validacion.error);
  if (!['image/jpeg', 'image/png'].includes(archivo.type) || archivo.size > 5 * 1024 * 1024 || archivo.size === 0) throw new Error('Selecciona una imagen JPEG o PNG de hasta 5 MB.');
  const bytes = new Uint8Array(await archivo.slice(0, 8).arrayBuffer());
  const firma = archivo.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : [137,80,78,71,13,10,26,10].every((b, i) => bytes[i] === b);
  if (!firma) throw new Error('El archivo no corresponde al formato de imagen indicado.');
}

