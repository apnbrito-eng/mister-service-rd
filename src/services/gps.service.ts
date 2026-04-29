import { doc, getDoc, setDoc, Timestamp, collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { ConfigGPS, UbicacionVehiculo } from '../types';

const CONFIG_DOC = doc(db, 'config_gps', 'sistema');
const UBICACIONES_COLLECTION = 'ubicaciones_vehiculos';

/** Carga la configuración de GPS desde Firestore */
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
  callback: (ubicacion: UbicacionVehiculo | null) => void
): () => void {
  const ref = doc(db, UBICACIONES_COLLECTION, vehiculoId);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) { callback(null); return; }
    const raw = snap.data();
    callback({
      vehiculoId: raw.vehiculoId || vehiculoId,
      tecnicoId: raw.tecnicoId || '',
      tecnicoNombre: raw.tecnicoNombre,
      lat: raw.lat || 0,
      lng: raw.lng || 0,
      velocidad: raw.velocidad || 0,
      rumbo: raw.rumbo || 0,
      timestamp: raw.timestamp?.toDate?.() || new Date(),
      enMovimiento: raw.enMovimiento || false,
      direccionAproximada: raw.direccionAproximada,
    });
  });
}

/** Suscribe a TODAS las ubicaciones de vehículos (para el panel GPS en vivo) */
export function suscribirTodasUbicaciones(
  callback: (ubicaciones: UbicacionVehiculo[]) => void
): () => void {
  return onSnapshot(collection(db, UBICACIONES_COLLECTION), (snap) => {
    const ubicaciones = snap.docs.map(d => {
      const raw = d.data();
      return {
        vehiculoId: raw.vehiculoId || d.id,
        tecnicoId: raw.tecnicoId || '',
        tecnicoNombre: raw.tecnicoNombre,
        lat: raw.lat || 0,
        lng: raw.lng || 0,
        velocidad: raw.velocidad || 0,
        rumbo: raw.rumbo || 0,
        timestamp: raw.timestamp?.toDate?.() || new Date(),
        enMovimiento: raw.enMovimiento || false,
        direccionAproximada: raw.direccionAproximada,
      } as UbicacionVehiculo;
    });
    callback(ubicaciones);
  });
}

/**
 * Obtiene ubicación desde la API externa configurada, usando el proxy serverless
 * en /api/gps/ubicacion para evitar CORS.
 */
export async function obtenerUbicacionAPI(vehiculoId: string): Promise<UbicacionVehiculo | null> {
  const config = await obtenerConfigGPS();
  if (!config?.activo || !config.apiKey || !config.apiUrl) return null;
  if (config.proveedor === 'Dispositivo del técnico') return null; // No usa API externa

  try {
    // El proxy GPS requiere auth (anti-SSRF). Si no hay usuario, abortar.
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn('GPS API: usuario no autenticado, omitiendo fetch al proxy');
      return null;
    }
    const idToken = await currentUser.getIdToken();

    const response = await fetch('/api/gps/ubicacion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        vehiculoId,
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
        proveedor: config.proveedor,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      console.error('GPS proxy error:', errData.error);
      return null;
    }

    const data = await response.json();
    return {
      vehiculoId: data.vehiculoId || vehiculoId,
      tecnicoId: '',
      lat: data.lat || 0,
      lng: data.lng || 0,
      velocidad: data.velocidad || 0,
      rumbo: data.rumbo || 0,
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      enMovimiento: data.enMovimiento || false,
    };
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
  const R = 6371;
  const dLat = (latCliente - latVehiculo) * Math.PI / 180;
  const dLon = (lngCliente - lngVehiculo) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(latVehiculo * Math.PI / 180) * Math.cos(latCliente * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const distanciaKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

/** Busca orden por tracking token (para la página pública) */
export async function buscarOrdenPorToken(token: string): Promise<{ id: string; data: Record<string, unknown> } | null> {
  const { getDocs, query, collection, where } = await import('firebase/firestore');
  const q = query(collection(db, 'ordenes_servicio'), where('trackingGPS.token', '==', token));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, data: d.data() };
}
