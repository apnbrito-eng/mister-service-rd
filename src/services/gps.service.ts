import { parseUbicacionMapa } from '../utils/parseUbicacionMapa';
import { kmLineaRecta } from '../utils/geo';
import { doc, getDoc, setDoc, Timestamp, collection, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { ConfigGPS, UbicacionVehiculo } from '../types';

const CONFIG_DOC = doc(db, 'config_gps', 'sistema');
const UBICACIONES_COLLECTION = 'ubicaciones_vehiculos';

/** Carga configuración y credenciales GPS; disponible solo para administradores. */
export async function obtenerConfigGPS(): Promise<ConfigGPS | null> {
  try {
    const snap = await getDoc(CONFIG_DOC);
    if (!snap.exists()) return null;
    return snap.data() as ConfigGPS;
  } catch (err) {
    console.error('Error loading GPS config:', err);
    return null;
  }
}

/** Guarda configuración de GPS */
export async function guardarConfigGPS(config: ConfigGPS): Promise<void> {
  await setDoc(CONFIG_DOC, config);
}

/** Guarda una ubicación de vehículo en Firestore (fallback desde dispositivo del técnico) */
export async function guardarUbicacionVehiculo(ubicacion: UbicacionVehiculo): Promise<void> {
  const ref = doc(db, UBICACIONES_COLLECTION, ubicacion.vehiculoId);
  await setDoc(ref, {
    ...ubicacion,
    timestamp: Timestamp.fromDate(ubicacion.timestamp),
  });
}

/** Suscribe a actualizaciones en tiempo real de un vehículo */
export function suscribirUbicacionVehiculo(
  vehiculoId: string,
  callback: (ubicacion: UbicacionVehiculo | null) => void,
  onError?: (error: Error) => void,
): () => void {
  const ref = doc(db, UBICACIONES_COLLECTION, vehiculoId);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) { callback(null); return; }
    callback(parseUbicacionMapa(vehiculoId, snap.data()));
  }, error => { callback(null); onError?.(error); });
}

/** Flota de oficina: las reglas impiden esta consulta a técnicos y ayudantes.
 * La pantalla debe comprobar el rol antes de suscribirse. */
export function suscribirTodasUbicaciones(
  callback: (ubicaciones: UbicacionVehiculo[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(collection(db, UBICACIONES_COLLECTION), (snap) => {
    const ubicaciones = snap.docs.map(d => parseUbicacionMapa(d.id, d.data()))
      .filter((u): u is UbicacionVehiculo => u !== null);
    callback(ubicaciones);
  }, error => { callback([]); onError?.(error); });
}

/**
 * Obtiene ubicación desde la API externa configurada, usando el proxy serverless
 * en /api/gps/ubicacion para evitar CORS.
 */
export async function obtenerUbicacionAPI(vehiculoId: string): Promise<UbicacionVehiculo | null> {
  // Configuración, estado y proveedor se validan en el servidor. El cliente
  // operativo no necesita acceso al documento que contiene la credencial.

  try {
    // El proxy GPS requiere auth (anti-SSRF). Si no hay usuario, abortar.
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn('GPS API: usuario no autenticado, omitiendo fetch al proxy');
      return null;
    }
    const idToken = await currentUser.getIdToken();

    // SPRINT-FIX-M9 (2026-09-26): solo `vehiculoId` viaja al server.
    // El endpoint lee apiKey/apiUrl/proveedor server-side desde config_gps
    // vía Admin SDK — la credencial GPS ya no cruza el cliente.
    const response = await fetch('/api/gps/ubicacion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ vehiculoId }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      console.error('GPS proxy error:', errData.error);
      return null;
    }

    const data = await response.json();
    if (!data || typeof data !== 'object') return null;
    return parseUbicacionMapa(vehiculoId, {
      ...data,
      timestamp: typeof data.timestamp === 'string' || typeof data.timestamp === 'number'
        ? new Date(data.timestamp) : new Date(NaN),
    });
  } catch (error) {
    console.error('GPS API error:', error);
    return null;
  }
}

/** Estima tiempo de llegada */
export function calcularETA(
  latVehiculo: number, lngVehiculo: number,
  latCliente: number, lngCliente: number,
  velocidad: number
): { distanciaKm: number; minutosEstimados: number } {
  const distanciaKm = kmLineaRecta({ lat: latVehiculo, lng: lngVehiculo }, { lat: latCliente, lng: lngCliente });
  const velocidadEfectiva = velocidad > 10 ? velocidad : 30;
  const minutosEstimados = Math.round((distanciaKm / velocidadEfectiva) * 60);
  return { distanciaKm, minutosEstimados };
}

/** Genera UUID v4 para tracking token */
export function generarTrackingToken(): string {
  // Usa crypto.randomUUID si está disponible, fallback manual
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
