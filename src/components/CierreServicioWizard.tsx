import { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio } from '../types';
import { subirFotoCierre, distanciaMetros, obtenerUbicacionGPS } from '../services/storage.service';
import { crearRegistroAuditoria } from '../utils';
import Modal from './Modal';
import {
  Camera, Check, X, Loader2, CheckCircle, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orden: OrdenServicio;
  tecnicoId: string;
  tecnicoNombre: string;
  clienteLat?: number;
  clienteLng?: number;
  onClosed: () => void;
}

type RespuestaSiNo = 'si' | 'no' | null;

export default function CierreServicioWizard({
  isOpen, onClose, orden, tecnicoId, tecnicoNombre, clienteLat, clienteLng, onClosed,
}: Props) {
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const [fotoBlob, setFotoBlob] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string>('');
  const [equipoFunciona, setEquipoFunciona] = useState<RespuestaSiNo>(null);
  const [clienteSatisfecho, setClienteSatisfecho] = useState<RespuestaSiNo>(null);
  const [revisoConexiones, setRevisoConexiones] = useState<RespuestaSiNo>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // Capturar GPS automáticamente al abrir (en background).
  // Usa el helper con fallback a baja precisión — evita quedarse colgado en interiores.
  useEffect(() => {
    if (!isOpen) return;
    let cancelado = false;
    obtenerUbicacionGPS().then(coords => {
      if (!cancelado && coords) setGpsCoords(coords);
    });
    return () => { cancelado = true; };
  }, [isOpen]);

  const reset = () => {
    setFotoBlob(null);
    setFotoPreview('');
    setEquipoFunciona(null);
    setClienteSatisfecho(null);
    setRevisoConexiones(null);
    setGpsCoords(null);
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
    setTimeout(reset, 200);
  };

  const handleFotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoBlob(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  const todoListo =
    !!fotoBlob &&
    equipoFunciona !== null &&
    clienteSatisfecho !== null &&
    revisoConexiones !== null;

  const handleCerrarServicio = async () => {
    console.log('Intentando cerrar:', {
      ordenId: orden.id,
      tecnicoId,
      fotoBlob: !!fotoBlob,
      equipoFunciona,
      clienteSatisfecho,
      revisoConexiones,
    });

    if (!todoListo) {
      toast.error('Completa la foto y las 3 preguntas');
      return;
    }
    if (!fotoBlob) return;
    setSaving(true);

    // Helper: intentar obtener GPS con timeout manual (no el del helper).
    // Si falla, permite al técnico continuar sin coords con confirmación.
    const obtenerGPSConEscape = async (): Promise<{ coords: { lat: number; lng: number } | null; continuar: boolean }> => {
      // Si ya tenemos coords del useEffect, listo
      if (gpsCoords) return { coords: gpsCoords, continuar: true };

      // Race entre el helper y un timeout de 12s
      const MAX_MS = 12000;
      toast.loading(`Obteniendo ubicación (hasta ${MAX_MS / 1000}s)...`, { id: 'cierre-gps' });

      const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), MAX_MS));
      const coords = await Promise.race([obtenerUbicacionGPS(), timeoutPromise]);
      toast.dismiss('cierre-gps');

      if (coords) return { coords, continuar: true };

      // No enganchó — preguntar al técnico si quiere cerrar sin GPS
      const continuarSinGPS = confirm(
        'No pudimos obtener tu ubicación GPS (señal débil, permiso denegado o interior).\n\n' +
        '¿Deseas cerrar el servicio SIN verificación de ubicación?\n\n' +
        'La orden quedará marcada como "GPS no verificado".',
      );
      return { coords: null, continuar: continuarSinGPS };
    };

    try {
      const { coords, continuar } = await obtenerGPSConEscape();
      if (!continuar) {
        setSaving(false);
        return;
      }

      // Subir foto a Firebase Storage
      console.log('Subiendo foto...', { ordenId: orden.id, fileSize: fotoBlob.size, fileType: fotoBlob.type });
      const fotoUrl = await subirFotoCierre(orden.id, fotoBlob);
      console.log('Foto subida OK:', fotoUrl);

      // Calcular distancia solo si tenemos coords (puede ser null si el user eligió continuar sin GPS)
      const distancia = coords && clienteLat && clienteLng
        ? distanciaMetros(coords.lat, coords.lng, clienteLat, clienteLng)
        : null;

      // gpsVerificado: true si hay coords y (no hay cliente con qué comparar, o distancia aceptable).
      // false si el técnico cerró sin GPS o está alejado.
      const UMBRAL = 500;
      const gpsVerificado = coords
        ? (distancia === null ? true : distancia <= UMBRAL)
        : false;

      const fotoCierre: Record<string, unknown> = {
        url: fotoUrl,
        lat: coords?.lat ?? 0,
        lng: coords?.lng ?? 0,
        timestamp: Timestamp.now(),
        gpsVerificado,
      };
      if (distancia !== null) fotoCierre.distanciaCliente = distancia;
      if (!coords) fotoCierre.sinGPS = true;

      const cierrePayload: Record<string, unknown> = {
        fechaCierre: Timestamp.now(),
        tecnicoId,
        tecnicoNombre,
        equipoFunciona: equipoFunciona === 'si',
        clienteSatisfecho: clienteSatisfecho === 'si',
        revisoConexiones: revisoConexiones === 'si',
        fotoCierre,
      };

      const nuevoHistorial = [
        ...orden.historialFases.map(h => ({
          fase: h.fase,
          timestamp: Timestamp.fromDate(h.timestamp instanceof Date ? h.timestamp : new Date()),
          usuario: h.usuario || '',
          ...(h.nota ? { nota: h.nota } : {}),
        })),
        {
          fase: 'trabajo_realizado',
          timestamp: Timestamp.now(),
          usuario: tecnicoNombre,
          nota: 'Trabajo completado',
        },
      ];

      const registroAuditoria = crearRegistroAuditoria(
        tecnicoNombre,
        'cierre',
        `Cerró el servicio. Equipo funciona: ${equipoFunciona === 'si' ? 'Sí' : 'No'}, Cliente satisfecho: ${clienteSatisfecho === 'si' ? 'Sí' : 'No'}, Revisó conexiones: ${revisoConexiones === 'si' ? 'Sí' : 'No'}`
      );

      console.log('Payload cierre:', { fase: 'trabajo_realizado', cierrePayload });
      console.log('Guardando cierre en Firestore...', { ordenId: orden.id });

      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        fase: 'trabajo_realizado',
        estadoSimple: 'completado',
        cierreServicio: cierrePayload,
        historialFases: nuevoHistorial,
        auditoria: arrayUnion(registroAuditoria),
        updatedAt: Timestamp.now(),
      });
      console.log('Cierre guardado OK');

      toast.success('✅ Servicio cerrado exitosamente');
      onClosed();
      handleClose();
    } catch (err: unknown) {
      console.error('Error cierre servicio:', err);
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      if (errMsg.includes('Timeout')) {
        toast.error('La foto tardó mucho en subir. Verifica tu conexión a internet e intenta de nuevo.');
      } else if (errMsg.includes('storage') || errMsg.includes('403') || errMsg.includes('unauthorized') || errMsg.includes('does not have permission')) {
        toast.error('Error de permisos al subir la foto. Contacta al administrador.');
      } else if (errMsg.includes('firestore') || errMsg.includes('PERMISSION_DENIED')) {
        toast.error('Error al guardar el cierre. Verifica tus permisos.');
      } else {
        toast.error('Error al cerrar: ' + errMsg.substring(0, 100));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Cerrar Servicio · ${orden.numero}`} size="md">
      <div className="space-y-5">
        {/* Info compacta */}
        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
          <p className="text-sm font-semibold text-gray-900">{orden.clienteNombre}</p>
          <p className="text-xs text-gray-600">{orden.equipoTipo}{orden.equipoMarca ? ` · ${orden.equipoMarca}` : ''}</p>
        </div>

        {/* SECCIÓN 1: FOTO */}
        <div>
          <p className="text-sm font-semibold text-gray-900 mb-2">📸 Foto del trabajo</p>

          {!fotoBlob ? (
            <div>
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFotoCapture}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fotoInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-4 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-xl font-semibold text-base transition-colors"
              >
                <Camera size={22} /> Tomar Foto
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <img src={fotoPreview} alt="Foto del trabajo" className="w-full rounded-xl border-2 border-green-200" />
              <button
                type="button"
                onClick={() => { setFotoBlob(null); setFotoPreview(''); }}
                className="w-full flex items-center justify-center gap-1 py-2 text-xs text-gray-500 hover:text-gray-700"
              >
                <X size={12} /> Tomar otra foto
              </button>
            </div>
          )}
        </div>

        {/* SECCIÓN 2: 3 PREGUNTAS */}
        <div className="space-y-4">
          <PreguntaSiNo
            label="¿El equipo quedó funcionando correctamente?"
            value={equipoFunciona}
            onChange={setEquipoFunciona}
          />
          <PreguntaSiNo
            label="¿El cliente está satisfecho con el servicio?"
            value={clienteSatisfecho}
            onChange={setClienteSatisfecho}
          />
          <PreguntaSiNo
            label="¿Revisaste las mangueras de desagüe, entrada de agua y que la llave esté abierta?"
            value={revisoConexiones}
            onChange={setRevisoConexiones}
          />
        </div>

        {/* GPS status (informativo, no bloqueante) */}
        {!gpsCoords && (
          <div className="flex items-center gap-2 text-[10px] text-gray-400 justify-center">
            <AlertCircle size={10} /> Capturando ubicación GPS en segundo plano...
          </div>
        )}

        {/* Botón final */}
        <button
          type="button"
          onClick={handleCerrarServicio}
          disabled={saving || !todoListo}
          className="w-full flex items-center justify-center gap-2 py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? (
            <><Loader2 size={20} className="animate-spin" /> Cerrando...</>
          ) : (
            <><CheckCircle size={20} /> Cerrar Servicio</>
          )}
        </button>
      </div>
    </Modal>
  );
}

interface PreguntaProps {
  label: string;
  value: RespuestaSiNo;
  onChange: (v: RespuestaSiNo) => void;
}

function PreguntaSiNo({ label, value, onChange }: PreguntaProps) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-900 mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange('si')}
          className={`py-4 rounded-xl font-bold text-base transition-all ${
            value === 'si'
              ? 'bg-green-500 text-white shadow-md scale-[1.02]'
              : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-green-400'
          }`}
        >
          {value === 'si' && <Check size={18} className="inline mr-1" />}
          SÍ
        </button>
        <button
          type="button"
          onClick={() => onChange('no')}
          className={`py-4 rounded-xl font-bold text-base transition-all ${
            value === 'no'
              ? 'bg-red-500 text-white shadow-md scale-[1.02]'
              : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-red-400'
          }`}
        >
          {value === 'no' && <X size={18} className="inline mr-1" />}
          NO
        </button>
      </div>
    </div>
  );
}
