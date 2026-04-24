import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  addDoc, collection, getDocs,
  query, where, orderBy, limit, Timestamp,
  QueryConstraint,
} from 'firebase/firestore';
import { db, storage } from '../firebase/config';
import type { Ponche, TipoPonche, DispositivoPonche, Rol } from '../types';

const UPLOAD_TIMEOUT_MS = 30_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Sube la selfie del ponche a Firebase Storage bajo
 * `fotos-ponche/{uid}/{timestamp}.jpg`. Retorna la URL pública.
 *
 * Timeout: 30s (idéntico patrón que `subirFotoCierre`).
 */
export async function subirFotoPonche(uid: string, file: File | Blob): Promise<string> {
  const ts = Date.now();
  const path = `fotos-ponche/${uid}/${ts}.jpg`;
  const ref = storageRef(storage, path);
  await withTimeout(uploadBytes(ref, file), UPLOAD_TIMEOUT_MS, 'subir foto ponche');
  return withTimeout(getDownloadURL(ref), UPLOAD_TIMEOUT_MS, 'obtener URL ponche');
}

/** Detecta si el navegador actual es móvil según user-agent. */
export function detectarDispositivo(): DispositivoPonche {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? 'movil' : 'desktop';
}

/**
 * Fecha actual en formato YYYY-MM-DD en hora de República Dominicana (UTC-4).
 * Usamos UTC-4 fijo — RD no observa horario de verano, así que es seguro
 * sin recurrir a Intl.DateTimeFormat con timeZone.
 */
export function fechaRDHoy(): string {
  const ahora = new Date();
  // Convertir a UTC y luego aplicar offset RD
  const utcMs = ahora.getTime() + ahora.getTimezoneOffset() * 60_000;
  const rdMs = utcMs + -4 * 60 * 60_000;
  const rd = new Date(rdMs);
  const y = rd.getFullYear();
  const m = String(rd.getMonth() + 1).padStart(2, '0');
  const d = String(rd.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mapDocToPonche(id: string, data: Record<string, unknown>): Ponche {
  return { id, ...data } as Ponche;
}

/** Devuelve el ponche de ENTRADA del día actual para el uid dado (o null). */
export async function obtenerPoncheEntradaHoy(personalUid: string): Promise<Ponche | null> {
  const hoy = fechaRDHoy();
  const snap = await getDocs(query(
    collection(db, 'ponches'),
    where('personalUid', '==', personalUid),
    where('fechaRD', '==', hoy),
    where('tipo', '==', 'entrada'),
    limit(1),
  ));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return mapDocToPonche(d.id, d.data());
}

/** Devuelve el ponche de SALIDA del día actual para el uid dado (o null). */
export async function obtenerPoncheSalidaHoy(personalUid: string): Promise<Ponche | null> {
  const hoy = fechaRDHoy();
  const snap = await getDocs(query(
    collection(db, 'ponches'),
    where('personalUid', '==', personalUid),
    where('fechaRD', '==', hoy),
    where('tipo', '==', 'salida'),
    limit(1),
  ));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return mapDocToPonche(d.id, d.data());
}

export interface CrearPoncheInput {
  personalId: string;
  personalUid: string;
  personalNombre: string;
  personalRol: Rol;
  tipo: TipoPonche;
  fotoUrl: string;
  ubicacion?: { lat: number; lng: number };
  dispositivo: DispositivoPonche;
  notas?: string;
}

/**
 * Crea un documento en la colección `ponches`. Strip de undefined antes
 * del write (Firestore los rechaza).
 */
export async function crearPonche(input: CrearPoncheInput): Promise<string> {
  const payload: Record<string, unknown> = {
    personalId: input.personalId,
    personalUid: input.personalUid,
    personalNombre: input.personalNombre,
    personalRol: input.personalRol,
    tipo: input.tipo,
    timestamp: Timestamp.now(),
    fechaRD: fechaRDHoy(),
    fotoUrl: input.fotoUrl,
    dispositivo: input.dispositivo,
  };
  if (input.ubicacion) payload.ubicacion = input.ubicacion;
  if (input.notas) payload.notas = input.notas;
  const ref = await addDoc(collection(db, 'ponches'), payload);
  return ref.id;
}

/** Lista todos los ponches de un día (fechaRD = 'YYYY-MM-DD'), orden timestamp asc. */
export async function obtenerPonchesDelDia(fechaRD: string): Promise<Ponche[]> {
  const snap = await getDocs(query(
    collection(db, 'ponches'),
    where('fechaRD', '==', fechaRD),
    orderBy('timestamp', 'asc'),
  ));
  return snap.docs.map((d) => mapDocToPonche(d.id, d.data()));
}

/**
 * Lista los ponches de un personal específico, opcionalmente filtrado por
 * rango de fechas (fechaRD desde/hasta, ambos inclusive).
 */
export async function obtenerPonchesPorPersonal(
  personalUid: string,
  desde?: string,
  hasta?: string,
): Promise<Ponche[]> {
  const clauses: QueryConstraint[] = [where('personalUid', '==', personalUid)];
  if (desde) clauses.push(where('fechaRD', '>=', desde));
  if (hasta) clauses.push(where('fechaRD', '<=', hasta));
  clauses.push(orderBy('fechaRD', 'desc'));
  const snap = await getDocs(query(collection(db, 'ponches'), ...clauses));
  return snap.docs.map((d) => mapDocToPonche(d.id, d.data()));
}
