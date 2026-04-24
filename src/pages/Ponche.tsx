import { useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Clock, Camera, MapPin, CheckCircle2, LogIn, LogOut,
  X, RefreshCw, Image as ImageIcon, AlertCircle, ArrowLeft,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import LoadingSpinner from '../components/LoadingSpinner';
import Logo from '../components/Logo';
import WebcamCapture from '../components/ponche/WebcamCapture';
import {
  subirFotoPonche,
  detectarDispositivo,
  obtenerPoncheEntradaHoy,
  obtenerPoncheSalidaHoy,
  crearPonche,
} from '../services/ponches.service';
import { obtenerUbicacionGPS } from '../services/storage.service';
import type { Ponche, TipoPonche, Rol } from '../types';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase/config';

function timestampToDate(t: Ponche['timestamp'] | undefined): Date | null {
  if (!t) return null;
  // Firestore Timestamp tiene .toDate(); Date es Date directo
  if (t instanceof Date) return t;
  const maybeTs = t as { toDate?: () => Date };
  if (typeof maybeTs.toDate === 'function') return maybeTs.toDate();
  return null;
}

function formatHora12(date: Date | null): string {
  if (!date) return '';
  try {
    return format(date, 'h:mm a', { locale: es });
  } catch {
    return '';
  }
}

function formatDuracion(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}

export default function Ponche() {
  const { currentUser, userProfile, loading } = useApp();
  const navigate = useNavigate();

  const [cargandoEstado, setCargandoEstado] = useState(true);
  const [poncheEntrada, setPoncheEntrada] = useState<Ponche | null>(null);
  const [poncheSalida, setPoncheSalida] = useState<Ponche | null>(null);

  // Estado del flujo de captura
  const [modo, setModo] = useState<'idle' | 'preview' | 'enviando'>('idle');
  const [tipoPendiente, setTipoPendiente] = useState<TipoPonche | null>(null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [gpsActual, setGpsActual] = useState<{ lat: number; lng: number } | null>(null);
  const [obteniendoGPS, setObteniendoGPS] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lightbox de foto
  const [fotoLightbox, setFotoLightbox] = useState<string | null>(null);

  // Modal de webcam (solo desktop)
  const [mostrarWebcam, setMostrarWebcam] = useState(false);

  // Resolver personalId real desde la colección `personal` (por uid o email)
  const [personalId, setPersonalId] = useState<string | null>(null);
  const [resolviendoPersonal, setResolviendoPersonal] = useState(true);

  const inputFotoRef = useRef<HTMLInputElement>(null);

  // Reloj en tiempo real (actualiza cada 30s para el contador de trabajo)
  const [ahora, setAhora] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Limpiar URL del preview al desmontar o reemplazar
  useEffect(() => {
    return () => {
      if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    };
  }, [fotoPreview]);

  // Resolver el personalId del usuario actual
  useEffect(() => {
    if (!currentUser) {
      setResolviendoPersonal(false);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        // 1) Buscar por uid
        const porUid = await getDocs(query(
          collection(db, 'personal'),
          where('uid', '==', currentUser.uid),
          limit(1),
        ));
        if (!cancelado && !porUid.empty) {
          setPersonalId(porUid.docs[0].id);
          setResolviendoPersonal(false);
          return;
        }
        // 2) Fallback por email
        if (currentUser.email) {
          const porEmail = await getDocs(query(
            collection(db, 'personal'),
            where('email', '==', currentUser.email.toLowerCase()),
            limit(1),
          ));
          if (!cancelado && !porEmail.empty) {
            setPersonalId(porEmail.docs[0].id);
            setResolviendoPersonal(false);
            return;
          }
        }
        // 3) Si no se encuentra, usar el uid como fallback (profile sintetizado)
        if (!cancelado) {
          setPersonalId(currentUser.uid);
          setResolviendoPersonal(false);
        }
      } catch (err) {
        console.error('[Ponche] Error resolviendo personalId:', err);
        if (!cancelado) {
          setPersonalId(currentUser.uid);
          setResolviendoPersonal(false);
        }
      }
    })();
    return () => { cancelado = true; };
  }, [currentUser]);

  // Cargar estado de ponches del día
  const recargarEstado = async () => {
    if (!currentUser) return;
    setCargandoEstado(true);
    try {
      const [entrada, salida] = await Promise.all([
        obtenerPoncheEntradaHoy(currentUser.uid),
        obtenerPoncheSalidaHoy(currentUser.uid),
      ]);
      setPoncheEntrada(entrada);
      setPoncheSalida(salida);
    } catch (err) {
      console.error('[Ponche] Error cargando estado:', err);
    } finally {
      setCargandoEstado(false);
    }
  };

  useEffect(() => {
    if (currentUser) recargarEstado();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  // Cuando el usuario toca "Ponchar Entrada/Salida":
  // - En móvil: input file nativo con capture="user" (cámara frontal).
  // - En desktop: abrir modal WebcamCapture con getUserMedia (capture="user"
  //   lo ignora el navegador en PC/Mac y termina abriendo el selector de archivos).
  const iniciarPonche = (tipo: TipoPonche) => {
    setTipoPendiente(tipo);
    setError(null);
    const dispositivo = detectarDispositivo();
    if (dispositivo === 'desktop') {
      setMostrarWebcam(true);
    } else {
      // Disparar input file (cámara frontal en móvil)
      inputFotoRef.current?.click();
    }
  };

  // Procesar una foto (ya sea de input file o de webcam): set preview + GPS en paralelo.
  const procesarFotoCapturada = async (file: File) => {
    // Crear preview
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    const previewUrl = URL.createObjectURL(file);
    setFotoFile(file);
    setFotoPreview(previewUrl);
    setModo('preview');

    // Intentar GPS en paralelo (no bloquea)
    setObteniendoGPS(true);
    setGpsActual(null);
    try {
      const ubi = await obtenerUbicacionGPS();
      setGpsActual(ubi);
    } catch (err) {
      console.warn('[Ponche] GPS falló:', err);
    } finally {
      setObteniendoGPS(false);
    }
  };

  // Al seleccionar foto (flujo móvil con input file)
  const onFotoSeleccionada = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input para permitir volver a seleccionar la misma foto si cancela
    if (inputFotoRef.current) inputFotoRef.current.value = '';
    if (!file) return;

    // Validación de tamaño (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La foto es demasiado grande (máximo 5MB).');
      return;
    }

    await procesarFotoCapturada(file);
  };

  // Callback de WebcamCapture (flujo desktop): recibe el Blob ya confirmado por el user.
  const onFotoWebcam = async (blob: Blob) => {
    setMostrarWebcam(false);
    const file = new File([blob], `selfie-ponche-${Date.now()}.jpg`, { type: 'image/jpeg' });
    // Validación de tamaño (5MB) — improbable pero por consistencia con el flujo móvil.
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La foto es demasiado grande (máximo 5MB).');
      return;
    }
    await procesarFotoCapturada(file);
  };

  const cancelarWebcam = () => {
    setMostrarWebcam(false);
    setTipoPendiente(null);
  };

  const reiniciarCaptura = () => {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoFile(null);
    setFotoPreview(null);
    setGpsActual(null);
    setModo('idle');
    setError(null);
  };

  const cancelarPonche = () => {
    reiniciarCaptura();
    setTipoPendiente(null);
  };

  const confirmarPonche = async () => {
    if (!currentUser || !userProfile || !fotoFile || !tipoPendiente || !personalId) {
      toast.error('Faltan datos para registrar el ponche.');
      return;
    }
    setModo('enviando');
    setError(null);
    try {
      const fotoUrl = await subirFotoPonche(currentUser.uid, fotoFile);
      await crearPonche({
        personalId,
        personalUid: currentUser.uid,
        personalNombre: userProfile.nombre,
        personalRol: userProfile.rol as Rol,
        tipo: tipoPendiente,
        fotoUrl,
        ubicacion: gpsActual ?? undefined,
        dispositivo: detectarDispositivo(),
      });
      toast.success(tipoPendiente === 'entrada' ? 'Entrada registrada' : 'Salida registrada');
      // Reset + refrescar estado
      if (fotoPreview) URL.revokeObjectURL(fotoPreview);
      setFotoFile(null);
      setFotoPreview(null);
      setGpsActual(null);
      setTipoPendiente(null);
      setModo('idle');
      await recargarEstado();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[Ponche] Error al crear ponche:', err);
      setError(msg);
      toast.error('No se pudo registrar el ponche. ' + msg);
      setModo('preview');
    }
  };

  // Estado derivado
  const fechaEntrada = useMemo(() => timestampToDate(poncheEntrada?.timestamp), [poncheEntrada]);
  const fechaSalida = useMemo(() => timestampToDate(poncheSalida?.timestamp), [poncheSalida]);
  const horasTrabajadas = useMemo(() => {
    if (!fechaEntrada) return '';
    const fin = fechaSalida || ahora;
    return formatDuracion(fin.getTime() - fechaEntrada.getTime());
  }, [fechaEntrada, fechaSalida, ahora]);

  if (loading || !currentUser || resolviendoPersonal) {
    return <LoadingSpinner fullPage text="Cargando…" />;
  }

  const fechaHoyTexto = format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es });
  const horaActualTexto = format(ahora, 'h:mm a', { locale: es });

  // --- Render ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-brand-100">
      {/* Header simple (no sidebar) */}
      <header className="bg-brand-800 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <Logo size="sm" compact />
          <div>
            <div className="font-semibold text-sm">Ponche de Asistencia</div>
            <div className="text-[11px] text-blue-200 capitalize">{userProfile?.nombre}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {userProfile && userProfile.rol !== 'ayudante' && userProfile.rol !== 'tecnico' && (
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              <ArrowLeft size={14} />
              Panel
            </button>
          )}
          {userProfile?.rol === 'tecnico' && (
            <button
              onClick={() => navigate('/tecnico')}
              className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              <ArrowLeft size={14} />
              Mi vista
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            <LogOut size={14} />
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Fecha y hora */}
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-brand-700 font-semibold">
            {fechaHoyTexto}
          </div>
          <div className="text-3xl font-bold text-brand-900 mt-1 flex items-center justify-center gap-2">
            <Clock size={26} className="text-brand-600" />
            {horaActualTexto}
          </div>
        </div>

        {/* Card principal: estado del día */}
        {cargandoEstado ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 flex items-center justify-center">
            <RefreshCw className="animate-spin text-brand-600" size={24} />
          </div>
        ) : (
          <CardEstadoDia
            entrada={poncheEntrada}
            salida={poncheSalida}
            fechaEntrada={fechaEntrada}
            fechaSalida={fechaSalida}
            horasTrabajadas={horasTrabajadas}
            onPoncharEntrada={() => iniciarPonche('entrada')}
            onPoncharSalida={() => iniciarPonche('salida')}
            onVerFoto={(url) => setFotoLightbox(url)}
            disabled={modo !== 'idle'}
          />
        )}

        {/* Input file oculto (cámara frontal en móvil) */}
        <input
          ref={inputFotoRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={onFotoSeleccionada}
        />

        {/* Modal de webcam (solo desktop) */}
        {mostrarWebcam && (
          <WebcamCapture
            onFoto={onFotoWebcam}
            onCancelar={cancelarWebcam}
          />
        )}

        {/* Preview modal (overlay) */}
        {modo !== 'idle' && fotoPreview && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between bg-brand-800 text-white">
                <h3 className="font-semibold text-sm">
                  Confirmar {tipoPendiente === 'entrada' ? 'entrada' : 'salida'}
                </h3>
                {modo === 'preview' && (
                  <button
                    onClick={cancelarPonche}
                    className="p-1 hover:bg-white/10 rounded"
                    aria-label="Cancelar"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
              <div className="p-4 space-y-3">
                <img
                  src={fotoPreview}
                  alt="Preview selfie"
                  className="w-full rounded-lg object-cover max-h-[60vh]"
                />
                <div className="flex items-center gap-2 text-sm">
                  {obteniendoGPS ? (
                    <>
                      <RefreshCw size={14} className="animate-spin text-gray-500" />
                      <span className="text-gray-600">Obteniendo ubicación…</span>
                    </>
                  ) : gpsActual ? (
                    <>
                      <MapPin size={14} className="text-green-600" />
                      <span className="text-green-700">Ubicación capturada</span>
                    </>
                  ) : (
                    <>
                      <MapPin size={14} className="text-gray-400" />
                      <span className="text-gray-500">Sin ubicación (no bloquea)</span>
                    </>
                  )}
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700 flex items-start gap-2">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    {error}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={reiniciarCaptura}
                    disabled={modo === 'enviando'}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    Tomar otra
                  </button>
                  <button
                    onClick={confirmarPonche}
                    disabled={modo === 'enviando'}
                    className="flex-1 px-4 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {modo === 'enviando' ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Enviando…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} />
                        Confirmar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Historial del día */}
        <HistorialDia
          entrada={poncheEntrada}
          salida={poncheSalida}
          fechaEntrada={fechaEntrada}
          fechaSalida={fechaSalida}
          onVerFoto={(url) => setFotoLightbox(url)}
        />
      </main>

      {/* Lightbox foto */}
      {fotoLightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setFotoLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2"
            onClick={() => setFotoLightbox(null)}
          >
            <X size={20} />
          </button>
          <img
            src={fotoLightbox}
            alt="Foto ponche"
            className="max-w-full max-h-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Subcomponentes
// ═══════════════════════════════════════════════════════════════

interface CardEstadoDiaProps {
  entrada: Ponche | null;
  salida: Ponche | null;
  fechaEntrada: Date | null;
  fechaSalida: Date | null;
  horasTrabajadas: string;
  onPoncharEntrada: () => void;
  onPoncharSalida: () => void;
  onVerFoto: (url: string) => void;
  disabled: boolean;
}

function CardEstadoDia({
  entrada, salida, fechaEntrada, fechaSalida, horasTrabajadas,
  onPoncharEntrada, onPoncharSalida, onVerFoto, disabled,
}: CardEstadoDiaProps) {
  // Estado A: sin entrada
  if (!entrada) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
        <div className="text-4xl mb-2">🌅</div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Aún no has ponchado tu entrada hoy</h2>
        <p className="text-sm text-gray-500 mb-5">Toca el botón para marcar tu llegada</p>
        <button
          onClick={onPoncharEntrada}
          disabled={disabled}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-4 rounded-xl text-base shadow-md transition-colors flex items-center justify-center gap-2"
        >
          <Camera size={20} />
          Ponchar Entrada
        </button>
      </div>
    );
  }

  // Estado B: con entrada, sin salida (trabajando)
  if (entrada && !salida) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
        <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 rounded-full px-3 py-1 text-xs font-semibold mb-3">
          <CheckCircle2 size={14} />
          Entrada registrada
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          {formatHora12(fechaEntrada)}
        </h2>
        <p className="text-sm text-gray-600 mb-1">
          Trabajando desde hace <span className="font-semibold text-brand-700">{horasTrabajadas}</span>
        </p>
        {entrada.fotoUrl && (
          <button
            onClick={() => onVerFoto(entrada.fotoUrl)}
            className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1 mb-5"
          >
            <ImageIcon size={12} />
            Ver foto de entrada
          </button>
        )}
        <button
          onClick={onPoncharSalida}
          disabled={disabled}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-4 rounded-xl text-base shadow-md transition-colors flex items-center justify-center gap-2 mt-2"
        >
          <Camera size={20} />
          Ponchar Salida
        </button>
      </div>
    );
  }

  // Estado C: ambos registrados
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
      <div className="text-4xl mb-2">✅</div>
      <h2 className="text-lg font-bold text-gray-900 mb-3">Jornada completa</h2>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-green-50 rounded-lg p-3">
          <div className="flex items-center justify-center gap-1 text-green-700 text-xs font-semibold mb-1">
            <LogIn size={12} /> Entrada
          </div>
          <div className="font-bold text-gray-900">{formatHora12(fechaEntrada)}</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-3">
          <div className="flex items-center justify-center gap-1 text-orange-700 text-xs font-semibold mb-1">
            <LogOut size={12} /> Salida
          </div>
          <div className="font-bold text-gray-900">{formatHora12(fechaSalida)}</div>
        </div>
      </div>
      <div className="mt-4 text-sm text-gray-600">
        Horas trabajadas: <span className="font-semibold text-brand-700">{horasTrabajadas}</span>
      </div>
    </div>
  );
}

interface HistorialDiaProps {
  entrada: Ponche | null;
  salida: Ponche | null;
  fechaEntrada: Date | null;
  fechaSalida: Date | null;
  onVerFoto: (url: string) => void;
}

function HistorialDia({ entrada, salida, fechaEntrada, fechaSalida, onVerFoto }: HistorialDiaProps) {
  if (!entrada && !salida) return null;
  return (
    <div className="bg-white rounded-2xl shadow-lg p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
        Registros de hoy
      </h3>
      <ul className="space-y-2">
        {entrada && (
          <li className="flex items-center gap-3 text-sm">
            <div className="bg-green-100 text-green-700 rounded-full w-8 h-8 flex items-center justify-center shrink-0">
              <LogIn size={14} />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900">{formatHora12(fechaEntrada)}</div>
              <div className="text-xs text-gray-500">Entrada</div>
            </div>
            {entrada.fotoUrl && (
              <button
                onClick={() => onVerFoto(entrada.fotoUrl)}
                className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
              >
                <ImageIcon size={12} />
                Ver foto
              </button>
            )}
          </li>
        )}
        {salida && (
          <li className="flex items-center gap-3 text-sm">
            <div className="bg-orange-100 text-orange-700 rounded-full w-8 h-8 flex items-center justify-center shrink-0">
              <LogOut size={14} />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900">{formatHora12(fechaSalida)}</div>
              <div className="text-xs text-gray-500">Salida</div>
            </div>
            {salida.fotoUrl && (
              <button
                onClick={() => onVerFoto(salida.fotoUrl)}
                className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
              >
                <ImageIcon size={12} />
                Ver foto
              </button>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
