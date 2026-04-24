import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { arrayUnion, doc, Timestamp, updateDoc } from 'firebase/firestore';
import { db, storage } from '../firebase/config';
import type { OrdenServicio, PiezaUsada, CondicionPieza, OrigenPieza } from '../types';
import { crearRegistroAuditoria } from '../utils';

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

/**
 * Borra una foto de pieza de Firebase Storage dada su URL de descarga.
 * Fire-and-forget: no lanza error si la foto no existe o la URL está mal
 * formada. Solo hace log de diagnóstico.
 *
 * URL esperada: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{pathEncoded}?alt=media&token=...
 * Se extrae y decodifica el path (p.ej. "fotos-piezas/{ordenId}/{piezaId}.jpg").
 */
export async function borrarFotoPieza(fotoUrl: string): Promise<void> {
  if (!fotoUrl) return;
  try {
    const url = new URL(fotoUrl);
    const pathEncoded = url.pathname.split('/o/')[1]?.split('?')[0];
    if (!pathEncoded) return;
    const path = decodeURIComponent(pathEncoded);
    await deleteObject(storageRef(storage, path));
  } catch (err) {
    console.warn('[piezas] No pude borrar foto de Storage:', err);
  }
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
 * `registradaEn` se persiste como Firestore Timestamp; la interfaz
 * PiezaUsada lo tipa como `Timestamp | Date` (parseOrden lo hidrata a Date al leer).
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
    registradaEn: Timestamp.now(),
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

/**
 * Aprueba todas las piezas registradas por el técnico en una orden, marcando
 * cada pieza como aprobada y sellando `cierreServicio.piezasValidadasPorAdmin`.
 *
 * Normaliza fechas internas de las piezas a Timestamp para consistencia en
 * Firestore y strip-ea undefined antes de escribir. Agrega registro de
 * auditoría con la acción `aprobar_piezas`.
 *
 * Reutilizado desde Conduces Pendientes y (antes) la página de Piezas
 * Pendientes de Validación ya eliminada.
 */
export async function aprobarPiezasDeOrden(
  orden: OrdenServicio,
  admin: { uid: string; nombre: string },
): Promise<void> {
  const cs = orden.cierreServicio;
  if (!cs || !Array.isArray(cs.piezasUsadas) || cs.piezasUsadas.length === 0) {
    throw new Error('La orden no tiene piezas para aprobar.');
  }

  const now = Timestamp.now();

  // Normalizar fechas internas y marcar cada pieza como aprobada.
  const piezasAprobadas = cs.piezasUsadas.map(p => {
    const base: Record<string, unknown> = {
      ...p,
      registradaEn: p.registradaEn instanceof Date ? Timestamp.fromDate(p.registradaEn) : p.registradaEn,
      aprobadaPorAdmin: true,
      aprobadaEn: now,
      aprobadaPor: admin.uid,
    };
    if (p.editadaEn !== undefined) {
      base.editadaEn = p.editadaEn instanceof Date ? Timestamp.fromDate(p.editadaEn) : p.editadaEn;
    }
    // Strip undefined
    return Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined));
  });

  const cantidad = cs.piezasUsadas.length;
  const registro = crearRegistroAuditoria(
    admin.nombre,
    'aprobar_piezas',
    `Aprobó ${cantidad} pieza${cantidad === 1 ? '' : 's'} registrada${cantidad === 1 ? '' : 's'} por ${cs.tecnicoNombre || 'el técnico'}.`,
  );

  await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
    'cierreServicio.piezasUsadas': piezasAprobadas,
    'cierreServicio.piezasValidadasPorAdmin': true,
    'cierreServicio.piezasValidadasEn': now,
    'cierreServicio.piezasValidadasPor': admin.uid,
    auditoria: arrayUnion(registro),
    updatedAt: now,
  });
}
