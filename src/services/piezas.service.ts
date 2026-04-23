import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Timestamp } from 'firebase/firestore';
import { storage } from '../firebase/config';
import type { PiezaUsada, CondicionPieza, OrigenPieza } from '../types';

const UPLOAD_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Sube la foto de una pieza a Firebase Storage.
 * Ruta: fotos-piezas/{ordenId}/{piezaId}.jpg
 */
export async function subirFotoPieza(
  ordenId: string,
  piezaId: string,
  file: File | Blob,
): Promise<string> {
  const path = `fotos-piezas/${ordenId}/${piezaId}.jpg`;
  const ref = storageRef(storage, path);
  await withTimeout(uploadBytes(ref, file), UPLOAD_TIMEOUT_MS, 'upload foto pieza');
  return withTimeout(getDownloadURL(ref), UPLOAD_TIMEOUT_MS, 'get download URL pieza');
}

export interface InputPieza {
  id?: string;                     // si viene, se usa (útil para pre-subir foto)
  nombre: string;
  marca?: string;
  modelo?: string;
  condicion: CondicionPieza;
  origen: OrigenPieza;
  cantidad: number;
  costoUnitario: number;
  proveedor?: string;
  fotoUrl?: string;
  notas?: string;
}

/**
 * Construye una PiezaUsada aplicando defaults y strip de undefined.
 * costoTotal siempre es computed (cantidad × costoUnitario).
 * `registradaEn` se escribe a Firestore como Timestamp; el tipo de interfaz
 * lo expone como Date post-parse. Aquí devolvemos Timestamp (asignable a
 * `Date` por la convención del proyecto — parseOrden lo convertirá).
 */
export function crearPiezaUsada(
  input: InputPieza,
  tecnico: { uid: string; nombre: string },
): PiezaUsada {
  const cantidad = Math.max(1, Math.floor(input.cantidad || 1));
  const costoUnitario = Math.max(0, Number.isFinite(input.costoUnitario) ? input.costoUnitario : 0);
  const costoTotal = Math.round(cantidad * costoUnitario * 100) / 100;

  const pieza: PiezaUsada = {
    id: input.id || crypto.randomUUID(),
    nombre: input.nombre.trim(),
    condicion: input.condicion,
    origen: input.origen,
    cantidad,
    costoUnitario,
    costoTotal,
    registradaPor: tecnico.uid,
    registradaPorNombre: tecnico.nombre,
    // Firestore acepta Timestamp; TypeScript lo casta a Date por la interfaz.
    registradaEn: Timestamp.now() as unknown as Date,
    aprobadaPorAdmin: false,
  };

  // Strip undefined — solo asignar si hay contenido real (convención CLAUDE.md)
  if (input.marca && input.marca.trim()) pieza.marca = input.marca.trim();
  if (input.modelo && input.modelo.trim()) pieza.modelo = input.modelo.trim();
  if (input.proveedor && input.proveedor.trim()) pieza.proveedor = input.proveedor.trim();
  if (input.fotoUrl) pieza.fotoUrl = input.fotoUrl;
  if (input.notas && input.notas.trim()) pieza.notas = input.notas.trim();

  return pieza;
}

/** Suma totales sobre un array de piezas (para footer y campos de orden). */
export function calcularTotales(piezas: PiezaUsada[]): { costoTotal: number; cantidadTotal: number } {
  return piezas.reduce(
    (acc, p) => ({
      costoTotal: acc.costoTotal + (Number(p.costoTotal) || 0),
      cantidadTotal: acc.cantidadTotal + (Number(p.cantidad) || 0),
    }),
    { costoTotal: 0, cantidadTotal: 0 },
  );
}
