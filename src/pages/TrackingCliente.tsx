import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { OrdenServicio, UbicacionVehiculo } from '../types';
import { suscribirUbicacionVehiculo, calcularETA } from '../services/gps.service';
import { parseFirestoreDate } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import Logo from '../components/Logo';
import FeedbackNPS, { FeedbackYaEnviado } from '../components/public/FeedbackNPS';
import { useConfigWeb } from '../hooks/useConfigWeb';
import { AlertCircle, Clock, User, Wrench, Wifi, WifiOff, CheckCircle, RefreshCw, MapPin, Navigation, Pause } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icons
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Vehicle SVG icon
function crearIconoVehiculo(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `
      <div style="background:#0f3460;width:40px;height:40px;border-radius:50%;border:4px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/>
          <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
        </svg>
      </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
}

function crearIconoCliente(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `
      <svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0 C7.163 0 0 7.163 0 16 C0 28 16 42 16 42 S32 28 32 16 C32 7.163 24.837 0 16 0Z" fill="#ef4444" stroke="white" stroke-width="2"/>
        <circle cx="16" cy="16" r="5" fill="white"/>
      </svg>`,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
  });
}

function AutoCenterMap({ latVehiculo, lngVehiculo, latCliente, lngCliente }: { latVehiculo: number; lngVehiculo: number; latCliente: number; lngCliente: number }) {
  const map = useMap();
  useEffect(() => {
    if (latVehiculo && latCliente) {
      const bounds = L.latLngBounds([[latVehiculo, lngVehiculo], [latCliente, lngCliente]]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, latVehiculo, lngVehiculo, latCliente, lngCliente]);
  return null;
}

interface OrdenMinima {
  id: string;
  numero?: string;
  clienteNombre: string;
  clienteLat?: number;
  clienteLng?: number;
  clienteDireccion?: string;
  equipoTipo: string;
  equipoMarca?: string;
  fechaCita?: Date;
  tecnicoNombre?: string;
  fase: string;
  feedback?: NonNullable<OrdenServicio['feedback']>;
  trackingGPS?: {
    habilitado: boolean;
    token: string;
    vehiculoId: string;
    expiresAt: Date;
  };
}

export default function TrackingCliente() {
  const { token } = useParams<{ token: string }>();
  const { config: configWeb } = useConfigWeb();
  const [loading, setLoading] = useState(true);
  const [orden, setOrden] = useState<OrdenMinima | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ubicacion, setUbicacion] = useState<UbicacionVehiculo | null>(null);
  const [sinSeñal, setSinSeñal] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  // Buscar la orden por token
  useEffect(() => {
    if (!token) return;
    const q = query(collection(db, 'ordenes_servicio'), where('trackingGPS.token', '==', token));
    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setError('Enlace no válido');
        setLoading(false);
        return;
      }
      const doc = snap.docs[0];
      const raw = doc.data();
      const tg = raw.trackingGPS as Record<string, unknown> | undefined;
      const fase = (raw.fase as string) || '';
      const ordenCerrada = fase === 'cerrado' || fase === 'trabajo_realizado';

      // Si la orden ya está cerrada, permitimos renderizar la página igual
      // aunque el tracking GPS esté deshabilitado o expirado — para que el
      // cliente pueda ver el feedback NPS.
      if (!ordenCerrada) {
        if (!tg?.habilitado) {
          setError('El seguimiento no está disponible en este momento');
          setLoading(false);
          return;
        }
        const expiresAt = parseFirestoreDate(tg.expiresAt);
        if (expiresAt && expiresAt < new Date()) {
          setError('Este enlace de seguimiento ha expirado');
          setLoading(false);
          return;
        }
      }

      const expiresAt = tg ? parseFirestoreDate(tg.expiresAt) : null;

      // Rehidratar feedback (defensivo, sin parseOrden completo para evitar
      // pegar todo el shape de OrdenServicio en la query pública).
      let feedback: NonNullable<OrdenServicio['feedback']> | undefined;
      if (raw.feedback && typeof raw.feedback === 'object') {
        const f = raw.feedback as Record<string, unknown>;
        const npsRaw = f.nps;
        const fecha = parseFirestoreDate(f.fechaFeedback);
        if (typeof npsRaw === 'number' && npsRaw >= 0 && npsRaw <= 10 && fecha) {
          const ratingTipo: 'detractor' | 'pasivo' | 'promotor' =
            f.ratingTipo === 'detractor' || f.ratingTipo === 'pasivo' || f.ratingTipo === 'promotor'
              ? f.ratingTipo
              : npsRaw <= 6 ? 'detractor' : npsRaw <= 8 ? 'pasivo' : 'promotor';
          feedback = {
            nps: npsRaw,
            ratingTipo,
            fechaFeedback: fecha,
          };
          if (typeof f.comentario === 'string' && f.comentario.length > 0) feedback.comentario = f.comentario;
          if (f.googleReviewClicked === true) feedback.googleReviewClicked = true;
          if (f.whatsappContactClicked === true) feedback.whatsappContactClicked = true;
        }
      }

      setOrden({
        id: doc.id,
        numero: (raw.numero as string) || undefined,
        clienteNombre: (raw.clienteNombre as string) || '',
        clienteLat: raw.clienteLat as number | undefined,
        clienteLng: raw.clienteLng as number | undefined,
        clienteDireccion: raw.clienteDireccion as string | undefined,
        equipoTipo: (raw.equipoTipo as string) || '',
        equipoMarca: raw.equipoMarca as string | undefined,
        fechaCita: parseFirestoreDate(raw.fechaCita) || undefined,
        tecnicoNombre: raw.tecnicoNombre as string | undefined,
        fase,
        feedback,
        trackingGPS: tg && tg.habilitado
          ? {
              habilitado: true,
              token: (tg.token as string) || '',
              vehiculoId: (tg.vehiculoId as string) || '',
              expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
            }
          : undefined,
      });
      setError(null);
      setLoading(false);
    });
    return () => unsub();
  }, [token]);

  // Fetch cliente coords from clientes collection if missing
  useEffect(() => {
    if (!orden || orden.clienteLat) return;
    // Try to fetch client location
    // const _clienteId = orden.clienteNombre; // fallback — placeholder removed for lint
    // Could also query by clienteNombre — skip for simplicity
  }, [orden]);

  // Subscribe to vehicle location
  useEffect(() => {
    if (!orden?.trackingGPS?.vehiculoId) return;
    if (unsubRef.current) unsubRef.current();
    const unsub = suscribirUbicacionVehiculo(orden.trackingGPS.vehiculoId, (ubi) => {
      if (ubi) {
        setUbicacion(ubi);
        const stale = (Date.now() - ubi.timestamp.getTime()) / 1000 > 120;
        setSinSeñal(stale);
      } else {
        setSinSeñal(true);
      }
    });
    unsubRef.current = unsub;
    return () => unsub();
  }, [orden?.trackingGPS?.vehiculoId]);

  // Auto-refresh signal status every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (ubicacion) {
        const stale = (Date.now() - ubicacion.timestamp.getTime()) / 1000 > 120;
        setSinSeñal(stale);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [ubicacion]);

  if (loading) return <LoadingSpinner fullPage text="Cargando tracking..." />;

  if (error || !orden) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <AlertCircle size={48} className="mx-auto text-red-400 mb-3" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Acceso no disponible</h2>
          <p className="text-gray-600 text-sm">{error || 'Enlace no válido'}</p>
        </div>
      </div>
    );
  }

  // Servicio completado: mostrar mensaje de cierre + bloque de feedback NPS
  if (['trabajo_realizado', 'cerrado'].includes(orden.fase)) {
    const feedbackHabilitado =
      orden.fase === 'cerrado' && (configWeb?.feedbackNPS?.habilitado !== false);
    // Numero del coordinador para detractores: primer numero activo del config
    const numeroCoord = configWeb?.whatsapp?.numeros?.find((n) => n.activo)?.numero;
    return (
      // @safe-gradient: pantalla NPS público del cliente — branding "servicio completado"
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-green-700 flex items-start justify-center p-4 py-8">
        <div className="w-full max-w-md space-y-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Servicio completado!</h2>
            <p className="text-gray-600">El técnico ya completó el servicio en su domicilio.</p>
          </div>

          {feedbackHabilitado && (
            orden.feedback
              ? <FeedbackYaEnviado feedback={orden.feedback} />
              : token
                ? <FeedbackNPS
                    token={token}
                    clienteNombre={orden.clienteNombre}
                    ordenNumero={orden.numero}
                    numeroWhatsAppCoordinador={numeroCoord}
                    configFeedback={configWeb?.feedbackNPS}
                  />
                : null
          )}

          <p className="text-center text-xs text-white/80">
            Mister Service RD · Gracias por su confianza
          </p>
        </div>
      </div>
    );
  }

  const latVehiculo = ubicacion?.lat || 0;
  const lngVehiculo = ubicacion?.lng || 0;
  const latCliente = orden.clienteLat || 0;
  const lngCliente = orden.clienteLng || 0;

  const eta = ubicacion && latCliente
    ? calcularETA(latVehiculo, lngVehiculo, latCliente, lngCliente, ubicacion.velocidad)
    : null;

  const sinUbicacion = !ubicacion || (latVehiculo === 0 && lngVehiculo === 0);

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col">
      {/* Header */}
      <div className="bg-white px-4 py-3 shadow-sm border-b border-gray-100">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Logo size="sm" />
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 max-w-2xl mx-auto w-full p-4 space-y-4">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-lg font-bold text-[#0f3460]">Su técnico está en camino</h1>
          <div className="w-16 h-0.5 bg-[#1a5fa8] mx-auto mt-1"></div>
        </div>

        {/* Info card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
          {orden.tecnicoNombre && (
            <div className="flex items-center gap-2 text-sm">
              <User size={14} className="text-gray-400" />
              <span className="font-medium text-gray-900">{orden.tecnicoNombre}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <Wrench size={14} className="text-gray-400" />
            <span className="text-gray-700">{orden.equipoTipo}{orden.equipoMarca ? ` · ${orden.equipoMarca}` : ''}</span>
          </div>
          {orden.fechaCita && (
            <div className="flex items-center gap-2 text-sm">
              <Clock size={14} className="text-gray-400" />
              <span className="text-gray-700">Cita: {format(orden.fechaCita, "h:mm a", { locale: es })}</span>
            </div>
          )}
        </div>

        {/* Map */}
        {sinUbicacion ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <AlertCircle size={48} className="mx-auto text-yellow-400 mb-3" />
            <p className="text-sm text-gray-700 font-medium mb-1">No pudimos obtener la ubicación del técnico en este momento.</p>
            <p className="text-xs text-gray-500 mb-4">El técnico está en camino a su cita. Intente nuevamente en unos minutos.</p>
            <button onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1 px-4 py-2 bg-[#0f3460] text-white rounded-lg text-xs font-medium">
              <RefreshCw size={12} /> Actualizar
            </button>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100" style={{ height: '55vh', minHeight: 320 }}>
            <MapContainer
              center={[latVehiculo || latCliente || 18.48, lngVehiculo || lngCliente || -69.93]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {latVehiculo !== 0 && latCliente !== 0 && (
                <AutoCenterMap latVehiculo={latVehiculo} lngVehiculo={lngVehiculo} latCliente={latCliente} lngCliente={lngCliente} />
              )}
              {latVehiculo !== 0 && (
                <Marker position={[latVehiculo, lngVehiculo]} icon={crearIconoVehiculo()}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold inline-flex items-center gap-1"><Navigation size={12} /> Técnico en movimiento</p>
                      {ubicacion && <p>Velocidad: {ubicacion.velocidad} km/h</p>}
                    </div>
                  </Popup>
                </Marker>
              )}
              {latCliente !== 0 && (
                <Marker position={[latCliente, lngCliente]} icon={crearIconoCliente()}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold inline-flex items-center gap-1"><MapPin size={12} /> Su domicilio</p>
                      {orden.clienteDireccion && <p className="text-xs">{orden.clienteDireccion}</p>}
                    </div>
                  </Popup>
                </Marker>
              )}
              {latVehiculo !== 0 && latCliente !== 0 && (
                <Polyline
                  positions={[[latVehiculo, lngVehiculo], [latCliente, lngCliente]]}
                  pathOptions={{ color: '#1a5fa8', weight: 4, opacity: 0.7, dashArray: '10 5' }}
                />
              )}
            </MapContainer>
          </div>
        )}

        {/* ETA card */}
        {ubicacion && !sinUbicacion && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xs text-gray-500 mb-1 inline-flex items-center gap-1"><MapPin size={11} /> Distancia</div>
                <div className="text-lg font-bold text-[#0f3460]">
                  {eta ? `${eta.distanciaKm.toFixed(1)} km` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1 inline-flex items-center gap-1"><Clock size={11} /> Tiempo est.</div>
                <div className="text-lg font-bold text-[#0f3460]">
                  {eta ? `~${eta.minutosEstimados} min` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1 inline-flex items-center gap-1"><Navigation size={11} /> Velocidad</div>
                <div className="text-lg font-bold text-[#0f3460]">
                  {Math.round(ubicacion.velocidad)} km/h
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
              {sinSeñal ? (
                <span className="flex items-center gap-1 text-orange-600">
                  <WifiOff size={12} /> Sin señal reciente
                </span>
              ) : (
                <span className="flex items-center gap-1 text-green-600">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  <Wifi size={12} /> Conectado — Actualizando...
                </span>
              )}
              <span className="text-gray-400">
                {ubicacion.timestamp && `Última: ${formatDistanceToNow(ubicacion.timestamp, { locale: es, addSuffix: true })}`}
              </span>
            </div>

            <div className="mt-2 text-center text-xs">
              {ubicacion.velocidad > 0 ? (
                <span className="text-green-600 inline-flex items-center gap-1"><Navigation size={11} /> En movimiento</span>
              ) : (
                <span className="text-yellow-600 inline-flex items-center gap-1"><Pause size={11} /> Detenido momentáneamente</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="text-center text-xs text-gray-400 py-3 inline-flex items-center justify-center gap-1 w-full">
        <Wrench size={11} /> Mister Service RD
      </div>
    </div>
  );
}
