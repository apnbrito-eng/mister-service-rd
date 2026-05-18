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
  // @safe-orderby: SPRINT-188 — col 'ponches' (literal en query abajo, fuera del rango de 400 chars). `fechaRD` siempre seteada en registrarPonche.
  clauses.push(orderBy('fechaRD', 'desc'));
  const snap = await getDocs(query(collection(db, 'ponches'), ...clauses));
  return snap.docs.map((d) => mapDocToPonche(d.id, d.data()));
}

/**
 * Obtiene ponches en un rango inclusive. Evita composite index usando
 * solo 1 orderBy (fechaRD) y haciendo el sort secundario por timestamp
 * en memoria (consistente con commit e776a8f).
 */
export async function obtenerPonchesPorRango(
  desde: string,
  hasta: string,
): Promise<Ponche[]> {
  const snap = await getDocs(query(
    collection(db, 'ponches'),
    where('fechaRD', '>=', desde),
    where('fechaRD', '<=', hasta),
    orderBy('fechaRD', 'asc'),
  ));
  const lista = snap.docs.map((d) => mapDocToPonche(d.id, d.data()));
  // Sort secundario por timestamp en cliente (evita composite index)
  return lista.sort((a, b) => {
    if (a.fechaRD !== b.fechaRD) return a.fechaRD.localeCompare(b.fechaRD);
    const ta = (a.timestamp as { toMillis?: () => number })?.toMillis?.()
      ?? +new Date(a.timestamp as unknown as string | number | Date);
    const tb = (b.timestamp as { toMillis?: () => number })?.toMillis?.()
      ?? +new Date(b.timestamp as unknown as string | number | Date);
    return ta - tb;
  });
}

// ═══════════════════════════════════════════════════════════════
// Helpers de rango preset (hora RD, UTC-4 fijo)
// ═══════════════════════════════════════════════════════════════

/** Retorna fecha RD como YYYY-MM-DD para un Date dado. */
export function fechaRDDe(date: Date): string {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60_000;
  const rdMs = utcMs + -4 * 60 * 60_000;
  const rd = new Date(rdMs);
  const y = rd.getFullYear();
  const m = String(rd.getMonth() + 1).padStart(2, '0');
  const d = String(rd.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function rangoPresetHoy(): { desde: string; hasta: string } {
  const hoy = fechaRDHoy();
  return { desde: hoy, hasta: hoy };
}

export function rangoPresetAyer(): { desde: string; hasta: string } {
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const f = fechaRDDe(ayer);
  return { desde: f, hasta: f };
}

export function rangoPresetUltimos30Dias(): { desde: string; hasta: string } {
  const hoy = new Date();
  const hace30 = new Date();
  hace30.setDate(hoy.getDate() - 29);
  return { desde: fechaRDDe(hace30), hasta: fechaRDDe(hoy) };
}

export function rangoPresetEsteMes(): { desde: string; hasta: string } {
  const hoy = new Date();
  const primer = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  return { desde: fechaRDDe(primer), hasta: fechaRDDe(hoy) };
}

/** Lunes de esta semana → hoy. Lunes = getDay() === 1. */
export function rangoPresetEstaSemana(): { desde: string; hasta: string } {
  const hoy = new Date();
  const dow = hoy.getDay(); // 0=dom, 1=lun, ..., 6=sab
  const offsetLunes = dow === 0 ? -6 : 1 - dow; // retroceder a lunes
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + offsetLunes);
  return { desde: fechaRDDe(lunes), hasta: fechaRDDe(hoy) };
}

/**
 * Quincena actual RD:
 *  - Q1 = día 30 mes_anterior → día 14 mes_actual (paga el 15)
 *  - Q2 = día 15 → día 29 mes_actual (paga el 30)
 * Cuando el día actual es 30 o 31, se considera inicio de Q1 del mes siguiente.
 * Consistente con utils/comisiones.ts.
 */
export function rangoPresetEstaQuincena(): { desde: string; hasta: string } {
  const hoy = new Date();
  const dia = hoy.getDate();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();

  if (dia >= 15 && dia <= 29) {
    // Q2: día 15 → día 29 del mes actual
    const inicio = new Date(anio, mes, 15);
    const fin = new Date(anio, mes, 29);
    return { desde: fechaRDDe(inicio), hasta: fechaRDDe(fin) };
  }

  if (dia >= 1 && dia <= 14) {
    // Q1 del mes actual: día 30 del mes ANTERIOR → día 14 del mes actual
    const inicio = new Date(anio, mes - 1, 30);
    const fin = new Date(anio, mes, 14);
    return { desde: fechaRDDe(inicio), hasta: fechaRDDe(fin) };
  }

  // día === 30 o 31: inicio de Q1 del mes siguiente
  const inicio = new Date(anio, mes, 30);
  const fin = new Date(anio, mes + 1, 14);
  return { desde: fechaRDDe(inicio), hasta: fechaRDDe(fin) };
}
