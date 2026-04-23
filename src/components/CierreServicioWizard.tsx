import { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, PiezaUsada, CondicionPieza, OrigenPieza } from '../types';
import { subirFotoCierre, distanciaMetros, obtenerUbicacionGPS, type GpsErrorInfo } from '../services/storage.service';
import { subirFotoPieza, crearPiezaUsada, calcularTotales } from '../services/piezas.service';
import { crearRegistroAuditoria } from '../utils';
import Modal from './Modal';
import {
  Camera, Check, X, Loader2, CheckCircle, AlertCircle, Plus, Pencil, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

function logCierre(msg: string, extra?: unknown): void {
  const t = new Date().toISOString().substring(11, 23);
  if (extra !== undefined) console.log(`[cierre ${t}] ${msg}`, extra);
  else console.log(`[cierre ${t}] ${msg}`);
}

function mensajeGpsError(err: GpsErrorInfo | null): string {
  if (!err) return 'No pudimos obtener tu ubicación GPS.';
  switch (err.code) {
    case 1: return 'Permiso de ubicación bloqueado. Toca el candado en la barra de direcciones y permite la ubicación.';
    case 2: return 'GPS no disponible. Revisa que la ubicación esté activada en el sistema.';
    case 3: return 'GPS tardó demasiado. Sal al exterior y vuelve a intentar.';
    default: return err.message || 'No pudimos obtener tu ubicación GPS.';
  }
}

function iconoCondicion(c: CondicionPieza): string {
  return c === 'nueva' ? '✨' : '♻️';
}

function iconoOrigen(o: OrigenPieza): string {
  return o === 'inventario_taller' ? '🏭' : o === 'inventario_vehiculo' ? '🚗' : '🛒';
}

function etiquetaOrigen(o: OrigenPieza): string {
  return o === 'inventario_taller' ? 'Taller' : o === 'inventario_vehiculo' ? 'Vehículo' : 'Externa';
}

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

  // --- Piezas utilizadas (Fase A1) ---
  const [usoPiezas, setUsoPiezas] = useState<'si' | 'no' | null>(null);
  const [piezasUsadas, setPiezasUsadas] = useState<PiezaUsada[]>([]);
  const [modalPiezaAbierto, setModalPiezaAbierto] = useState(false);
  const [piezaEditandoIdx, setPiezaEditandoIdx] = useState<number | null>(null);

  // Capturar GPS automáticamente al abrir (en background).
  // Usa el helper con fallback a baja precisión — evita quedarse colgado en interiores.
  useEffect(() => {
    if (!isOpen) return;
    let cancelado = false;
    logCierre('wizard abierto — GPS preflight');
    obtenerUbicacionGPS(err => {
      logCierre('GPS preflight error', err);
    }).then(coords => {
      if (!cancelado && coords) {
        logCierre('GPS preflight OK', coords);
        setGpsCoords(coords);
      } else if (!cancelado) {
        logCierre('GPS preflight sin resultado — se pedirá de nuevo al cerrar');
      }
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
    setUsoPiezas(null);
    setPiezasUsadas([]);
    setModalPiezaAbierto(false);
    setPiezaEditandoIdx(null);
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

  const piezasOk = usoPiezas === 'no' || (usoPiezas === 'si' && piezasUsadas.length > 0);

  const todoListo =
    !!fotoBlob &&
    equipoFunciona !== null &&
    clienteSatisfecho !== null &&
    revisoConexiones !== null &&
    piezasOk;

  const handleCerrarServicio = async () => {
    console.log('Intentando cerrar:', {
      ordenId: orden.id,
      tecnicoId,
      fotoBlob: !!fotoBlob,
      equipoFunciona,
      clienteSatisfecho,
      revisoConexiones,
      usoPiezas,
      cantidadPiezas: piezasUsadas.length,
    });

    if (!todoListo) {
      toast.error('Completa la foto, las 3 preguntas y la sección de piezas');
      return;
    }
    if (!fotoBlob) return;
    setSaving(true);

    // Helper: intentar obtener GPS con timeout manual (no el del helper).
    // Si falla, permite al técnico continuar sin coords con confirmación.
    const obtenerGPSConEscape = async (): Promise<{ coords: { lat: number; lng: number } | null; continuar: boolean }> => {
      // Si ya tenemos coords del useEffect, listo
      if (gpsCoords) {
        logCierre('usando GPS del preflight', gpsCoords);
        return { coords: gpsCoords, continuar: true };
      }

      // Sin race externo — el helper ya controla sus timeouts internos (alta 8s + baja 6s)
      // y dispara onError con el código real para que podamos diagnosticar.
      toast.loading('Verificando GPS...', { id: 'cierre-gps' });
      logCierre('GPS request start en submit');

      let ultimoError: GpsErrorInfo | null = null;
      const coords = await obtenerUbicacionGPS(err => {
        ultimoError = err;
        logCierre(`GPS error (highAccuracy=${err.highAccuracy})`, err);
      });
      toast.dismiss('cierre-gps');

      if (coords) {
        logCierre('GPS resolved', coords);
        return { coords, continuar: true };
      }

      const motivo = mensajeGpsError(ultimoError);
      logCierre('GPS sin resultado — confirm', { ultimoError, motivo });
      // Permiso denegado: abortar sin preguntar
      if (ultimoError && (ultimoError as GpsErrorInfo).code === 1) {
        toast.error(motivo, { duration: 8000 });
        return { coords: null, continuar: false };
      }
      const continuarSinGPS = confirm(
        motivo +
        '\n\n¿Deseas cerrar el servicio SIN verificación de ubicación?\n\n' +
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

      // Piezas utilizadas (A1)
      const hayPiezas = usoPiezas === 'si' && piezasUsadas.length > 0;
      if (hayPiezas) {
        cierrePayload.piezasUsadas = piezasUsadas;
        cierrePayload.piezasValidadasPorAdmin = false;
      }

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
        `Cerró el servicio. Equipo funciona: ${equipoFunciona === 'si' ? 'Sí' : 'No'}, Cliente satisfecho: ${clienteSatisfecho === 'si' ? 'Sí' : 'No'}, Revisó conexiones: ${revisoConexiones === 'si' ? 'Sí' : 'No'}${hayPiezas ? `, Piezas: ${piezasUsadas.length}` : ''}`,
      );

      console.log('Payload cierre:', { fase: 'trabajo_realizado', cierrePayload });
      console.log('Guardando cierre en Firestore...', { ordenId: orden.id });

      const ordenUpdate: Record<string, unknown> = {
        fase: 'trabajo_realizado',
        estadoSimple: 'completado',
        cierreServicio: cierrePayload,
        historialFases: nuevoHistorial,
        auditoria: arrayUnion(registroAuditoria),
        updatedAt: Timestamp.now(),
      };

      if (hayPiezas) {
        const totales = calcularTotales(piezasUsadas);
        ordenUpdate.costoPiezasTotal = totales.costoTotal;
        ordenUpdate.cantidadPiezasUsadas = totales.cantidadTotal;
      }

      await updateDoc(doc(db, 'ordenes_servicio', orden.id), ordenUpdate);
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

  // --- Piezas: handlers del sub-modal ---
  const abrirModalAgregarPieza = () => {
    setPiezaEditandoIdx(null);
    setModalPiezaAbierto(true);
  };

  const abrirModalEditarPieza = (idx: number) => {
    setPiezaEditandoIdx(idx);
    setModalPiezaAbierto(true);
  };

  const eliminarPieza = (idx: number) => {
    setPiezasUsadas(prev => prev.filter((_, i) => i !== idx));
  };

  const guardarPieza = (pieza: PiezaUsada) => {
    if (piezaEditandoIdx !== null) {
      setPiezasUsadas(prev => prev.map((p, i) => i === piezaEditandoIdx ? pieza : p));
    } else {
      setPiezasUsadas(prev => [...prev, pieza]);
    }
    setModalPiezaAbierto(false);
    setPiezaEditandoIdx(null);
  };

  const totales = calcularTotales(piezasUsadas);

  return (
    <>
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

          {/* SECCIÓN 3: PIEZAS UTILIZADAS (Fase A1) */}
          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm font-semibold text-gray-900 mb-2">🔧 Piezas utilizadas</p>
            <p className="text-xs text-gray-500 mb-3">¿Usaste alguna pieza en este servicio?</p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <button
                type="button"
                onClick={() => { setUsoPiezas('no'); setPiezasUsadas([]); }}
                className={`py-3 rounded-xl font-bold text-sm transition-all ${
                  usoPiezas === 'no'
                    ? 'bg-gray-600 text-white shadow-md'
                    : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-gray-400'
                }`}
              >
                No usé piezas
              </button>
              <button
                type="button"
                onClick={() => setUsoPiezas('si')}
                className={`py-3 rounded-xl font-bold text-sm transition-all ${
                  usoPiezas === 'si'
                    ? 'bg-[#0f3460] text-white shadow-md'
                    : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-[#0f3460]'
                }`}
              >
                Sí usé piezas
              </button>
            </div>

            {usoPiezas === 'si' && (
              <div className="space-y-2">
                {piezasUsadas.map((p, idx) => (
                  <div key={p.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-gray-900 truncate">
                          📦 {p.nombre}{p.marca ? ` · ${p.marca}` : ''}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {p.cantidad} × RD${p.costoUnitario.toFixed(2)} = RD${p.costoTotal.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {iconoCondicion(p.condicion)} {p.condicion === 'nueva' ? 'Nueva' : 'Usada'}
                          {' · '}
                          {iconoOrigen(p.origen)} {etiquetaOrigen(p.origen)}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => abrirModalEditarPieza(idx)}
                          className="p-2 text-gray-500 hover:text-[#0f3460] hover:bg-white rounded-lg"
                          aria-label="Editar pieza"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminarPieza(idx)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-white rounded-lg"
                          aria-label="Eliminar pieza"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={abrirModalAgregarPieza}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-xl font-semibold text-sm transition-colors"
                >
                  <Plus size={18} /> Agregar pieza
                </button>

                {piezasUsadas.length > 0 && (
                  <div className="text-right text-xs text-gray-700 pt-1">
                    Total piezas: <span className="font-semibold">{totales.cantidadTotal}</span>
                    {' · '}
                    Costo total: <span className="font-semibold">RD${totales.costoTotal.toFixed(2)}</span>
                  </div>
                )}

                {piezasUsadas.length === 0 && (
                  <p className="text-[11px] text-amber-700 text-center">
                    Agrega al menos una pieza o elige "No usé piezas" para continuar.
                  </p>
                )}
              </div>
            )}
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

      {/* Sub-modal: agregar/editar pieza */}
      {modalPiezaAbierto && (
        <PiezaFormModal
          isOpen={modalPiezaAbierto}
          ordenId={orden.id}
          tecnicoId={tecnicoId}
          tecnicoNombre={tecnicoNombre}
          piezaEditando={piezaEditandoIdx !== null ? piezasUsadas[piezaEditandoIdx] : null}
          onCancel={() => { setModalPiezaAbierto(false); setPiezaEditandoIdx(null); }}
          onSave={guardarPieza}
        />
      )}
    </>
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

// ---------------------------------------------------------------------------
// Sub-modal: formulario de pieza (agregar / editar)
// ---------------------------------------------------------------------------

interface PiezaFormModalProps {
  isOpen: boolean;
  ordenId: string;
  tecnicoId: string;
  tecnicoNombre: string;
  piezaEditando: PiezaUsada | null;
  onCancel: () => void;
  onSave: (pieza: PiezaUsada) => void;
}

function PiezaFormModal({
  isOpen, ordenId, tecnicoId, tecnicoNombre, piezaEditando, onCancel, onSave,
}: PiezaFormModalProps) {
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState(piezaEditando?.nombre || '');
  const [marca, setMarca] = useState(piezaEditando?.marca || '');
  const [modelo, setModelo] = useState(piezaEditando?.modelo || '');
  const [condicion, setCondicion] = useState<CondicionPieza | null>(piezaEditando?.condicion || null);
  const [origen, setOrigen] = useState<OrigenPieza | null>(piezaEditando?.origen || null);
  const [cantidad, setCantidad] = useState<number>(piezaEditando?.cantidad || 1);
  const [costoUnitario, setCostoUnitario] = useState<number>(piezaEditando?.costoUnitario ?? 0);
  const [proveedor, setProveedor] = useState(piezaEditando?.proveedor || '');
  const [notas, setNotas] = useState(piezaEditando?.notas || '');
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string>(piezaEditando?.fotoUrl || '');
  const [fotoUrlExistente, setFotoUrlExistente] = useState<string | undefined>(piezaEditando?.fotoUrl);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const costoTotal = Math.round((cantidad || 0) * (costoUnitario || 0) * 100) / 100;

  const puedeGuardar =
    !!nombre.trim() &&
    !!condicion &&
    !!origen &&
    cantidad > 0 &&
    costoUnitario >= 0 &&
    !subiendoFoto;

  const handleFotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
    // Si cambia la foto, ya no usamos la URL previa
    setFotoUrlExistente(undefined);
  };

  const handleQuitarFoto = () => {
    setFotoFile(null);
    setFotoPreview('');
    setFotoUrlExistente(undefined);
  };

  const handleGuardar = async () => {
    if (!puedeGuardar || !condicion || !origen) return;

    setSubiendoFoto(true);
    try {
      // Reusa el id de la pieza si estamos editando (para sobrescribir foto si cambió)
      const piezaId = piezaEditando?.id || crypto.randomUUID();
      let fotoUrl: string | undefined = fotoUrlExistente;

      if (fotoFile) {
        fotoUrl = await subirFotoPieza(ordenId, piezaId, fotoFile);
      }

      const pieza = crearPiezaUsada(
        {
          id: piezaId,
          nombre,
          marca,
          modelo,
          condicion,
          origen,
          cantidad,
          costoUnitario,
          proveedor: origen === 'comprada_externamente' ? proveedor : undefined,
          fotoUrl,
          notas,
        },
        { uid: tecnicoId, nombre: tecnicoNombre },
      );

      onSave(pieza);
    } catch (err: unknown) {
      console.error('[pieza] error al guardar:', err);
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      if (errMsg.includes('Timeout')) {
        toast.error('La foto tardó mucho en subir. Verifica tu conexión e intenta de nuevo.');
      } else {
        toast.error('No se pudo guardar la pieza. Reintenta.');
      }
    } finally {
      setSubiendoFoto(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!subiendoFoto) onCancel(); }}
      title={piezaEditando ? 'Editar pieza' : 'Agregar pieza'}
      size="md"
    >
      <div className="space-y-4">
        {/* Nombre */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-1">
            Nombre de la pieza <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Bomba de agua"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0f3460]"
          />
        </div>

        {/* Marca y modelo */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Marca</label>
            <input
              type="text"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#0f3460]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Modelo</label>
            <input
              type="text"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#0f3460]"
            />
          </div>
        </div>

        {/* Condición */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Condición <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setCondicion('nueva')}
              className={`py-3 rounded-xl font-bold text-sm transition-all ${
                condicion === 'nueva'
                  ? 'bg-[#0f3460] text-white shadow-md'
                  : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-[#0f3460]'
              }`}
            >
              ✨ Nueva
            </button>
            <button
              type="button"
              onClick={() => setCondicion('usada')}
              className={`py-3 rounded-xl font-bold text-sm transition-all ${
                condicion === 'usada'
                  ? 'bg-[#0f3460] text-white shadow-md'
                  : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-[#0f3460]'
              }`}
            >
              ♻️ Usada
            </button>
          </div>
        </div>

        {/* Origen */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Origen <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setOrigen('inventario_taller')}
              className={`py-3 px-2 rounded-xl font-semibold text-xs transition-all ${
                origen === 'inventario_taller'
                  ? 'bg-[#0f3460] text-white shadow-md'
                  : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-[#0f3460]'
              }`}
            >
              🏭 Taller
            </button>
            <button
              type="button"
              onClick={() => setOrigen('inventario_vehiculo')}
              className={`py-3 px-2 rounded-xl font-semibold text-xs transition-all ${
                origen === 'inventario_vehiculo'
                  ? 'bg-[#0f3460] text-white shadow-md'
                  : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-[#0f3460]'
              }`}
            >
              🚗 Vehículo
            </button>
            <button
              type="button"
              onClick={() => setOrigen('comprada_externamente')}
              className={`py-3 px-2 rounded-xl font-semibold text-xs transition-all ${
                origen === 'comprada_externamente'
                  ? 'bg-[#0f3460] text-white shadow-md'
                  : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-[#0f3460]'
              }`}
            >
              🛒 Externa
            </button>
          </div>
        </div>

        {/* Cantidad + Costo unitario */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">
              Cantidad <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0f3460]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">
              Costo unitario (RD$) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={costoUnitario}
              onChange={(e) => setCostoUnitario(Math.max(0, Number(e.target.value) || 0))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0f3460]"
            />
          </div>
        </div>

        {/* Costo total computado */}
        <div className="bg-gray-50 rounded-lg p-3 text-right">
          <span className="text-xs text-gray-600">Costo total: </span>
          <span className="text-lg font-bold text-gray-900">RD${costoTotal.toFixed(2)}</span>
        </div>

        {/* Proveedor (solo si origen externo) */}
        {origen === 'comprada_externamente' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Proveedor</label>
            <input
              type="text"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              placeholder="Ej: Ferretería del barrio"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#0f3460]"
            />
          </div>
        )}

        {/* Foto */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Foto (opcional)</label>
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFotoCapture}
            className="hidden"
          />
          {fotoPreview ? (
            <div className="space-y-2">
              <img src={fotoPreview} alt="Pieza" className="w-full rounded-xl border-2 border-green-200 max-h-48 object-contain bg-gray-50" />
              <button
                type="button"
                onClick={handleQuitarFoto}
                className="w-full flex items-center justify-center gap-1 py-2 text-xs text-gray-500 hover:text-gray-700"
              >
                <X size={12} /> Quitar foto
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fotoInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium text-sm transition-colors"
            >
              <Camera size={18} /> Tomar foto
            </button>
          )}
        </div>

        {/* Notas */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Opcional"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#0f3460] resize-none"
          />
        </div>

        {/* Botones */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={subiendoFoto}
            className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={!puedeGuardar}
            className="py-3 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {subiendoFoto ? (
              <><Loader2 size={16} className="animate-spin" /> Subiendo foto...</>
            ) : (
              piezaEditando ? 'Guardar cambios' : 'Agregar pieza'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
