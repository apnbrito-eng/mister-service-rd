import { useState, useEffect, useRef } from 'react';
import { collection, doc, getDocs, query, updateDoc, where, Timestamp, arrayUnion, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, Personal, PiezaUsada } from '../types';
import { crearNotificacion } from '../services/notificaciones.service';
import { subirFirmaCierre, subirFotoCierre, distanciaMetros, obtenerUbicacionGPS, type GpsErrorInfo } from '../services/storage.service';
import { calcularTotales, borrarFotoPieza } from '../services/piezas.service';
import { crearRegistroAuditoria } from '../utils';
import { aplicarDescuentoGarantiaPorPiezas } from '../utils/comisiones';
import { calcularVencimiento, PERIODO_GARANTIA_DEFAULT_DIAS } from '../utils/garantia';
import { iconoCondicion, iconoOrigen, etiquetaOrigen } from '../utils/piezas';
import { razonCerrarServicioDisabled } from '../utils/tooltipsBotones';
import Modal from './Modal';
import PiezaFormModal from './cierre/PiezaFormModal';
import {
  Camera, Check, X, Loader2, CheckCircle, AlertCircle, Plus, Pencil, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { addMonths } from 'date-fns';

/**
 * SPRINT-AGENDA-5 (2026-05-25): tras cerrar una orden de servicio
 * (no solo-chequeo), ofrece programar el próximo mantenimiento
 * preventivo del mismo cliente/equipo. Muestra un toast con acciones
 * "Sí, programar" (default +3 meses, trimestral) y "Ahora no".
 * Best-effort — NO bloquea el cierre si falla la creación. Reusa la
 * convención del alta de mantenimiento de SPRINT-AGENDA-1 (clienteId
 * real + denormalizados + tecnicoId = uid).
 */
function ofrecerProximoMantenimiento(args: {
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  telefonoNormalizado: string;
  clienteEmail: string;
  clienteDireccion: string;
  clienteLat?: number;
  clienteLng?: number;
  equipoTipo: string;
  tecnicoId: string;
}): void {
  const programar = async () => {
    try {
      const ahora = Timestamp.now();
      const proxima = addMonths(new Date(), 3); // default trimestral
      const payload: Record<string, unknown> = {
        clienteId: args.clienteId,
        clienteNombre: args.clienteNombre,
        clienteTelefono: args.clienteTelefono,
        equipoTipo: args.equipoTipo,
        frecuencia: 'trimestral',
        proximaFecha: Timestamp.fromDate(proxima),
        tecnicoId: args.tecnicoId || '',
        activo: true,
        createdAt: ahora,
        updatedAt: ahora,
      };
      if (args.telefonoNormalizado) payload.telefonoNormalizado = args.telefonoNormalizado;
      if (args.clienteEmail) payload.clienteEmail = args.clienteEmail;
      if (args.clienteDireccion) payload.clienteDireccion = args.clienteDireccion;
      if (typeof args.clienteLat === 'number') payload.clienteLat = args.clienteLat;
      if (typeof args.clienteLng === 'number') payload.clienteLng = args.clienteLng;
      const payloadLimpio = Object.fromEntries(
        Object.entries(payload).filter(([, v]) => v !== undefined),
      );
      await addDoc(collection(db, 'mantenimiento'), payloadLimpio);
      toast.success(`Próximo mantenimiento programado para ${proxima.toLocaleDateString('es-DO')}`);
    } catch (err) {
      console.error('[SPRINT-AGENDA-5] No se pudo programar mantenimiento:', err);
      toast.error('No se pudo programar el mantenimiento');
    }
  };
  // Toast custom con acciones — el usuario decide. Tiempo amplio para
  // que alcance a leer y decidir (10s).
  toast(
    (t) => (
      <div className="flex flex-col gap-2 text-sm">
        <p className="font-medium text-gray-900">
          ¿Programar próximo mantenimiento de {args.clienteNombre}?
        </p>
        <p className="text-xs text-gray-600">
          Sugerido: trimestral · +3 meses · {args.equipoTipo}
        </p>
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={() => { void programar(); toast.dismiss(t.id); }}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium"
          >
            Sí, programar
          </button>
          <button
            type="button"
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs"
          >
            Ahora no
          </button>
        </div>
      </div>
    ),
    { duration: 10000 },
  );
}

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

  // --- Firma del cliente (SPRINT-159, BLOQUEADOR go-live) ---
  // Canvas HTML5 nativo. Pointer Events soportan touch (iPad de Aury) + mouse +
  // pen en una sola API. `dibujandoRef` (no state) evita re-render por cada
  // movimiento del trazo. `tieneTrazos` es el flag de "canvas no vacío" — más
  // barato que `getImageData()` y suficiente para gatear el submit.
  const canvasFirmaRef = useRef<HTMLCanvasElement>(null);
  const dibujandoRef = useRef(false);
  const [tieneTrazos, setTieneTrazos] = useState(false);

  // --- Piezas utilizadas (Fase A1) ---
  const [usoPiezas, setUsoPiezas] = useState<'si' | 'no' | null>(null);
  const [piezasUsadas, setPiezasUsadas] = useState<PiezaUsada[]>([]);
  const [modalPiezaAbierto, setModalPiezaAbierto] = useState(false);
  const [piezaEditandoIdx, setPiezaEditandoIdx] = useState<number | null>(null);

  // --- Período de garantía (SPRINT-135a-UI) ---
  // Default 60 días. Se persiste al cerrar como `periodoGarantiaDias` +
  // `garantiaVencimiento` (computado con helper de utils/garantia.ts).
  const [periodoGarantiaDias, setPeriodoGarantiaDias] = useState<number>(PERIODO_GARANTIA_DEFAULT_DIAS);
  const periodoValido = periodoGarantiaDias >= 1 && periodoGarantiaDias <= 365;

  // SPRINT-182 (2026-05-18): labels adaptadas a `orden.soloChequeo` +
  // `equipoTipo`. El wizard no branchea estructuralmente (mismas 3 preguntas
  // + foto + firma + piezas) — solo cambian las labels para que el técnico
  // entienda el contexto. Hallazgos QA E2E:
  //  - #13: la pregunta 3 era de mangueras/llave (lavadora). En Aire NO
  //    aplica drenaje + llave; se reemplaza por conexiones eléctricas +
  //    condensador + filtro.
  //  - #14: la pregunta 1 ("¿equipo funciona?") no tiene sentido en
  //    solo_chequeo (técnico no reparó → respuesta siempre "no"). Texto
  //    adaptado a "¿diagnóstico claro y comunicado?".
  const esSoloChequeo = orden.soloChequeo === true;
  const esAireAcondicionado = (orden.equipoTipo || '').toLowerCase().includes('aire');
  const labelEquipoFunciona = esSoloChequeo
    ? '¿Le comunicaste al cliente el diagnóstico final?'
    : '¿El equipo quedó funcionando correctamente?';
  const labelRevisoConexiones = esAireAcondicionado
    ? '¿Revisaste conexiones eléctricas, condensador y filtro?'
    : '¿Revisaste las mangueras de desagüe, entrada de agua y que la llave esté abierta?';

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

  // Setup del canvas de firma (SPRINT-159). Ejecuta al abrir el modal y al
  // cambiar el devicePixelRatio (rotación de iPad). Backing store en DPR
  // físico, transformación CSS aplicada vía `ctx.scale(dpr, dpr)` para que
  // el trazo se vea nítido en retina. Sin esto, en iPad la firma se ve
  // pixelada/borrosa.
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasFirmaRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f3460';
    // Fondo blanco explícito — sin esto el PNG sale transparente y se ve
    // raro al renderizar sobre fondos distintos (admin tiene fondo claro,
    // pero un futuro PDF de conduce podría tener fondo distinto).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
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
    setPeriodoGarantiaDias(PERIODO_GARANTIA_DEFAULT_DIAS);
    setTieneTrazos(false);
    // El canvas se reinicializa solo via useEffect al re-abrir el modal.
  };

  // --- Firma: handlers de canvas (Pointer Events para touch + mouse + pen) ---
  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasFirmaRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleFirmaPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (saving) return;
    e.preventDefault();
    const canvas = canvasFirmaRef.current;
    if (!canvas) return;
    // Capturar pointer evita que el evento se "escape" del canvas si el dedo
    // sale del área antes del pointerup — clave en touch.
    try { canvas.setPointerCapture(e.pointerId); } catch { /* algunos browsers tiran si ya tomado */ }
    dibujandoRef.current = true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    if (!tieneTrazos) setTieneTrazos(true);
  };

  const handleFirmaPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujandoRef.current) return;
    e.preventDefault();
    const ctx = canvasFirmaRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleFirmaPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujandoRef.current) return;
    dibujandoRef.current = false;
    try { canvasFirmaRef.current?.releasePointerCapture(e.pointerId); } catch { /* idem */ }
  };

  const limpiarFirma = () => {
    if (saving) return;
    const canvas = canvasFirmaRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    // Reset al estado inicial (fondo blanco, sin trazos).
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f3460';
    setTieneTrazos(false);
  };

  // Convierte el canvas a Blob PNG. Async porque `canvas.toBlob` lo es.
  const obtenerFirmaBlob = (): Promise<Blob | null> => {
    return new Promise(resolve => {
      const canvas = canvasFirmaRef.current;
      if (!canvas) { resolve(null); return; }
      canvas.toBlob(blob => resolve(blob), 'image/png');
    });
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
    piezasOk &&
    periodoValido &&
    tieneTrazos; // SPRINT-159: firma obligatoria

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
      tieneFirma: tieneTrazos,
    });

    if (!todoListo) {
      toast.error('Completá foto, preguntas, piezas, garantía y firma del cliente');
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

      // SPRINT-159: capturar firma del cliente como blob PNG y subir a Storage.
      // BLOQUEADOR go-live — sin esto, el conduce no tiene prueba documentada
      // de aceptación. Si el upload falla acá, la foto ya subió pero el cierre
      // NO se persiste a Firestore (catch abajo + return) — la foto queda
      // huérfana pero el técnico puede reintentar; el callback `obtenerFirmaBlob`
      // re-exporta el canvas en memoria (no se pierde la firma) y `subirFotoCierre`
      // genera nuevo timestamp en la próxima vuelta.
      console.log('Capturando firma del cliente...');
      const firmaBlob = await obtenerFirmaBlob();
      if (!firmaBlob) {
        toast.error('No pudimos exportar la firma. Reintentá.');
        setSaving(false);
        return;
      }
      console.log('Subiendo firma...', { ordenId: orden.id, fileSize: firmaBlob.size });
      const firmaUrl = await subirFirmaCierre(orden.id, firmaBlob);
      const firmaTimestamp = Timestamp.now();
      console.log('Firma subida OK:', firmaUrl);

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

      const fechaCierreTs = Timestamp.now();
      const cierrePayload: Record<string, unknown> = {
        fechaCierre: fechaCierreTs,
        tecnicoId,
        tecnicoNombre,
        equipoFunciona: equipoFunciona === 'si',
        clienteSatisfecho: clienteSatisfecho === 'si',
        revisoConexiones: revisoConexiones === 'si',
        fotoCierre,
        // SPRINT-159: firma del cliente (prueba legal de aceptación).
        firmaClienteUrl: firmaUrl,
        firmaClienteAt: firmaTimestamp,
      };

      // SPRINT-135a-UI: período de garantía + vencimiento computado.
      // Se persisten a nivel orden (no dentro de cierreServicio) según el
      // modelo definido en SPRINT-135a fase backend (75f6c7b). El endpoint
      // público los prefiere si están poblados; órdenes legacy siguen
      // leyendo de `facturas.garantia.*` sin cambios.
      const garantiaVencimientoTs = Timestamp.fromDate(
        calcularVencimiento(fechaCierreTs.toDate(), periodoGarantiaDias),
      );

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
        `Cerró el servicio. Equipo funciona: ${equipoFunciona === 'si' ? 'Sí' : 'No'}, Cliente satisfecho: ${clienteSatisfecho === 'si' ? 'Sí' : 'No'}, Revisó conexiones: ${revisoConexiones === 'si' ? 'Sí' : 'No'}${hayPiezas ? `, Piezas: ${piezasUsadas.length}` : ''}, Firma cliente: sí`,
      );

      console.log('Payload cierre:', { fase: 'trabajo_realizado', cierrePayload });
      console.log('Guardando cierre en Firestore...', { ordenId: orden.id });

      const ordenUpdate: Record<string, unknown> = {
        fase: 'trabajo_realizado',
        estadoSimple: 'completado',
        // El cierre vía wizard es generalmente reparación completa. Pero
        // si oficina aprobó una sugerencia de solo chequeo (sprint R4
        // endurecida), `soloChequeo: true` y `tipoCierre: 'solo_chequeo'`
        // ya están seteados — no los pisamos.
        tipoCierre: orden.soloChequeo === true ? 'solo_chequeo' : 'reparacion_completa',
        cierreServicio: cierrePayload,
        // SPRINT-187 Bug B (forward fix): denormalizar `fechaCierre` a nivel
        // raíz además de en `cierreServicio.fechaCierre`. Hasta SPRINT-187 la
        // fecha vivía SOLO anidada — `buscarChequeoVigentePorCliente` la
        // resolvía pero la query Firestore con `orderBy('fechaCierre')`
        // (ya removido) excluía estos docs. El helper sigue leyendo del
        // anidado como fuente preferida; el raíz queda como compat con
        // futuras queries que necesiten ordenar/filtrar por fecha de cierre.
        fechaCierre: fechaCierreTs,
        // SPRINT-135a-UI: campos nuevos a nivel orden (modelo 75f6c7b).
        periodoGarantiaDias,
        garantiaVencimiento: garantiaVencimientoTs,
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

      // SPRINT-GARANTIA-FLUJO-COMPLETO Fase A (2026-05-25): si esta orden es
      // de garantía y se usaron piezas en la re-reparación, descontar el 10%
      // del costo de piezas al técnico ORIGINAL (regla de Jorge entrevista
      // 2026-05-24). El técnico original CONSERVA su comisión original — el
      // descuento NO la anula. Se aplica siempre que haya piezas, lo cubra
      // él mismo u otro técnico. Try/catch defensivo: si el descuento falla
      // (comisión original no existe, etc.), el cierre ya quedó persistido.
      if (orden.esGarantia && hayPiezas && orden.tecnicoOriginalUid && orden.referenciaOrdenId) {
        try {
          const totales = calcularTotales(piezasUsadas);
          const result = await aplicarDescuentoGarantiaPorPiezas({
            ordenGarantiaId: orden.id,
            ordenOriginalId: orden.referenciaOrdenId,
            tecnicoOriginalUid: orden.tecnicoOriginalUid,
            costoPiezasReReparacion: totales.costoTotal,
            facturaIdReasignada: orden.referenciaFacturaId,
            conduceNumeroOriginal: orden.referenciaConduce,
            solicitanteUid: tecnicoId,
            solicitanteNombre: tecnicoNombre,
            motivoLabel: 'Garantía — 10% costo de piezas',
          });
          if (result.aplicado) {
            console.log(
              `[garantia-fase-A] descuento aplicado: monto=${result.monto} comisionId=${result.comisionId}`,
            );
          } else {
            console.warn(
              `[garantia-fase-A] descuento NO aplicado: razon=${result.razon}`,
            );
          }
        } catch (errGarantia) {
          console.error(
            '[garantia-fase-A] Error inesperado aplicando descuento por garantía:',
            errGarantia,
          );
          // No bloqueamos el cierre — el técnico ya cerró y se persistió.
        }
      }

      // SPRINT-174: emitir notif `cierre_completado` a la operaria del
      // técnico + admins/coords. Autoexclusión del propio técnico (es
      // quien cerró). Patrón canónico SPRINT-169 (`5823955`): try/catch
      // independiente por destinatario, `p.uid` siempre (P-007). No bloquea
      // el flujo de cierre si falla — el cierre ya quedó persistido.
      try {
        const piezasInfo = hayPiezas ? ` Piezas: ${piezasUsadas.length}.` : '';
        const mensajeBase = `Servicio cerrado por ${tecnicoNombre}. Cliente: ${orden.clienteNombre}. Equipo funciona: ${equipoFunciona === 'si' ? 'Sí' : 'No'}.${piezasInfo}`;

        // Operaria del técnico (operariaId persiste auth.uid post-SPRINT-149).
        if (orden.operariaId && orden.operariaId !== tecnicoId) {
          try {
            await crearNotificacion({
              userId: orden.operariaId,
              destinatarioNombre: orden.operariaNombre,
              tipo: 'cierre_completado',
              titulo: `Cierre completado · ${orden.numero || 'orden'}`,
              mensaje: mensajeBase,
              ordenId: orden.id,
              ordenNumero: orden.numero,
            });
          } catch (notifErr) {
            console.error('[SPRINT-174] cierre_completado a operaria falló:', notifErr);
          }
        }
        // Admins + coordinadoras activos.
        try {
          const qStaff = query(
            collection(db, 'personal'),
            where('activo', '==', true),
            where('rol', 'in', ['administrador', 'coordinadora']),
          );
          const snapStaff = await getDocs(qStaff);
          const destinatariosStaff = snapStaff.docs
            .map(d => ({ id: d.id, ...d.data() } as Personal))
            .filter(
              p =>
                !!p.uid &&
                p.uid !== tecnicoId &&
                p.uid !== orden.operariaId,
            );
          for (const destino of destinatariosStaff) {
            try {
              await crearNotificacion({
                userId: destino.uid!,
                destinatarioNombre: destino.nombre,
                tipo: 'cierre_completado',
                titulo: `Cierre completado · ${orden.numero || 'orden'}`,
                mensaje: mensajeBase,
                ordenId: orden.id,
                ordenNumero: orden.numero,
              });
            } catch (err) {
              console.error('[SPRINT-174] cierre_completado a staff falló para', destino.uid, err);
            }
          }
        } catch (errStaff) {
          console.error('[SPRINT-174] cierre_completado fallo enumerando staff:', errStaff);
        }
      } catch (errNotif) {
        console.error('[SPRINT-174] cierre_completado bloque externo:', errNotif);
      }

      toast.success('✅ Servicio cerrado exitosamente');

      // SPRINT-AGENDA-5 (2026-05-25): si la orden tiene cliente real
      // amarrado + equipoTipo, ofrecer programar próximo mantenimiento
      // preventivo. Toast custom con acción — el usuario decide. Default
      // +3 meses (trimestral, el más común en RD para electrodomésticos).
      // Solo aparece cuando hay clienteId real (post-SPRINT-AGENDA-1) y
      // se NO es solo chequeo (que NO es servicio real). Best-effort: si
      // falla la creación, log + toast informativo, NO bloquea el cierre.
      if (orden.clienteId && orden.equipoTipo && orden.soloChequeo !== true) {
        ofrecerProximoMantenimiento({
          clienteId: orden.clienteId,
          clienteNombre: orden.clienteNombre,
          clienteTelefono: orden.clienteTelefono || '',
          telefonoNormalizado: (orden as OrdenServicio & { telefonoNormalizado?: string }).telefonoNormalizado || '',
          clienteEmail: (orden as OrdenServicio & { clienteEmail?: string }).clienteEmail || '',
          clienteDireccion: orden.clienteDireccion || '',
          clienteLat: orden.clienteLat,
          clienteLng: orden.clienteLng,
          equipoTipo: orden.equipoTipo,
          tecnicoId,
        });
      }

      onClosed();
      handleClose();
    } catch (err: unknown) {
      console.error('Error cierre servicio:', err);
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      // Catch específico para `permission-denied` (sprint R4 endurecida).
      //
      // El payload del wizard NO toca `soloChequeo` ni `precioFinal` (son
      // campos de oficina, ver `ordenUpdate` arriba). Por eso un
      // permission-denied acá NO es por sesión desactualizada chocando con
      // el gate de R4 — es otro motivo (ej: técnico intentó cerrar una
      // orden no asignada, rule de noTocaAsignacion bloqueó algún campo,
      // etc.). Mostramos un mensaje genérico en lugar del toast de "app
      // desactualizada", que confundiría al técnico.
      const codeRaw = (err as { code?: unknown })?.code;
      const code = typeof codeRaw === 'string' ? codeRaw : '';
      if (code === 'permission-denied') {
        toast.error(
          'Error de permisos al cerrar la orden. Verificá con admin.',
          { duration: 6000 },
        );
      } else if (errMsg.includes('Timeout')) {
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
    const pieza = piezasUsadas[idx];
    // Fire-and-forget: si la pieza tenía foto en Storage, la borramos para
    // evitar leak. No bloquea la UI; si la URL es inválida, el helper
    // hace log silencioso.
    if (pieza?.fotoUrl) {
      void borrarFotoPieza(pieza.fotoUrl);
    }
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
                  className="w-full flex items-center justify-center gap-2 py-4 bg-primary hover:bg-primary-medium text-white rounded-xl font-semibold text-base transition-colors"
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

          {/* SECCIÓN 2: 3 PREGUNTAS — SPRINT-182 labels adaptativas */}
          <div className="space-y-4">
            {esSoloChequeo && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
                <span className="font-semibold">Cierre como solo chequeo:</span> el técnico
                no realizó reparación. Las preguntas abajo se adaptaron al diagnóstico.
              </div>
            )}
            <PreguntaSiNo
              label={labelEquipoFunciona}
              value={equipoFunciona}
              onChange={setEquipoFunciona}
            />
            <PreguntaSiNo
              label="¿El cliente está satisfecho con el servicio?"
              value={clienteSatisfecho}
              onChange={setClienteSatisfecho}
            />
            <PreguntaSiNo
              label={labelRevisoConexiones}
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
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-primary'
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
                          className="p-2 text-gray-500 hover:text-primary hover:bg-white rounded-lg"
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
                  className="w-full flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary-medium text-white rounded-xl font-semibold text-sm transition-colors"
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

          {/* SECCIÓN 4: PERÍODO DE GARANTÍA (SPRINT-135a-UI) */}
          <div className="border-t border-gray-200 pt-4">
            <label htmlFor="periodo-garantia" className="block text-sm font-semibold text-gray-900 mb-2">
              🛡️ Período de garantía (días)
            </label>
            <input
              id="periodo-garantia"
              type="number"
              min={1}
              max={365}
              value={periodoGarantiaDias}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                setPeriodoGarantiaDias(isNaN(v) ? 0 : v);
              }}
              className={`w-full px-3 py-2.5 border-2 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary ${
                periodoValido ? 'border-gray-200' : 'border-amber-400 bg-amber-50'
              }`}
            />
            {!periodoValido && (
              <p className="text-[11px] text-amber-700 mt-1">
                Ingresá un valor entre 1 y 365 días.
              </p>
            )}
            <p className="text-[11px] text-gray-500 mt-1">
              Default: {PERIODO_GARANTIA_DEFAULT_DIAS} días. Se cuenta desde el cierre del servicio.
            </p>
          </div>

          {/* SECCIÓN 5: FIRMA DEL CLIENTE (SPRINT-159, BLOQUEADOR go-live) */}
          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm font-semibold text-gray-900 mb-1">✍️ Firma del cliente</p>
            <p className="text-xs text-gray-500 mb-3">
              Pasale el equipo al cliente y pedile que firme acá abajo con el dedo o stylus.
              Su firma queda como prueba de aceptación del trabajo.
            </p>

            {tieneTrazos && (
              <div className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                <Check size={12} /> Firma capturada
              </div>
            )}

            <canvas
              ref={canvasFirmaRef}
              role="img"
              aria-label="Área de firma del cliente"
              className="block w-full h-[200px] rounded-xl border-2 touch-none cursor-crosshair bg-white"
              style={{ borderColor: tieneTrazos ? '#86efac' : '#e5e7eb' }}
              onPointerDown={handleFirmaPointerDown}
              onPointerMove={handleFirmaPointerMove}
              onPointerUp={handleFirmaPointerUp}
              onPointerCancel={handleFirmaPointerUp}
              onPointerLeave={handleFirmaPointerUp}
            />

            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={limpiarFirma}
                disabled={!tieneTrazos || saving}
                className="text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Limpiar firma
              </button>
              {!tieneTrazos && (
                <span className="text-[11px] text-amber-700">⚠️ Pendiente de firma</span>
              )}
            </div>
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
            title={
              razonCerrarServicioDisabled({
                saving,
                fotoTomada: !!fotoBlob,
                equipoFunciona,
                clienteSatisfecho,
                revisoConexiones,
                usoPiezas,
                cantidadPiezas: piezasUsadas.length,
                firmada: tieneTrazos,
              }) || 'Cerrar la orden y registrar la comisión.'
            }
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

