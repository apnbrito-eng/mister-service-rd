import { useEffect, useRef, useState } from 'react';
import {
  doc,
  updateDoc,
  Timestamp,
  arrayUnion,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { OrdenServicio, Usuario, Personal } from '../../types';
import {
  subirFotoInicioChequeo,
  obtenerUbicacionGPS,
  distanciaMetros,
  type GpsErrorInfo,
} from '../../services/storage.service';
import { crearNotificacion } from '../../services/notificaciones.service';
import { crearRegistroAuditoria, faseLabel } from '../../utils';
import { Camera, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

/** Log con timestamp para diagnóstico del flujo de chequeo. */
function logChequeo(msg: string, extra?: unknown): void {
  const t = new Date().toISOString().substring(11, 23);
  if (extra !== undefined) console.log(`[chequeo ${t}] ${msg}`, extra);
  else console.log(`[chequeo ${t}] ${msg}`);
}

/** Mensaje específico por código de error de Geolocation API. */
function mensajeGpsError(err: GpsErrorInfo | null): string {
  if (!err) return 'No pudimos obtener tu ubicación GPS.';
  switch (err.code) {
    case 1:
      return 'Permiso de ubicación bloqueado. Toca el candado en la barra de direcciones y permite la ubicación.';
    case 2:
      return 'GPS no disponible. Revisa que la ubicación esté activada en el sistema.';
    case 3:
      return 'GPS tardó demasiado. Sal al exterior y vuelve a intentar.';
    default:
      return err.message || 'No pudimos obtener tu ubicación GPS.';
  }
}

interface Props {
  orden: OrdenServicio;
  userProfile: Usuario | null;
  /** Tamaño visual del botón */
  size?: 'sm' | 'md';
  /** Si pasas true, ignora la validación de "solo el día de la cita" */
  forzarVisible?: boolean;
}

const UMBRAL_LEJOS_METROS = 500;

function esMismoDiaQueHoy(fecha?: Date): boolean {
  if (!fecha) return false;
  const f = fecha instanceof Date ? fecha : new Date(fecha);
  const hoy = new Date();
  return (
    f.getFullYear() === hoy.getFullYear() &&
    f.getMonth() === hoy.getMonth() &&
    f.getDate() === hoy.getDate()
  );
}

export default function IniciarChequeoButton({
  orden,
  userProfile,
  size = 'md',
  forzarVisible = false,
}: Props) {
  const [procesando, setProcesando] = useState(false);
  const [permisoGps, setPermisoGps] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const inputRef = useRef<HTMLInputElement>(null);

  // Query del Permissions API al montar (Chrome/Android soportan; iOS Safari no tiene 'geolocation' pero no rompe)
  useEffect(() => {
    const nav = navigator as Navigator & {
      permissions?: { query: (p: { name: PermissionName }) => Promise<PermissionStatus> };
    };
    if (!nav.permissions?.query) return;
    let cancelado = false;
    nav.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then(status => {
        if (cancelado) return;
        setPermisoGps(status.state as typeof permisoGps);
        logChequeo(`permiso geolocation inicial = ${status.state}`);
        // Reaccionar a cambios (ej: técnico acaba de conceder el permiso)
        status.onchange = () => {
          if (cancelado) return;
          setPermisoGps(status.state as typeof permisoGps);
          logChequeo(`permiso geolocation cambió a = ${status.state}`);
        };
      })
      .catch(() => {
        // Permissions API no soporta 'geolocation' en este navegador → dejar 'unknown'
      });
    return () => { cancelado = true; };
  }, []);

  // Reglas de visibilidad
  const yaIniciado = !!orden.inicioChequeo;
  const ordenActiva = orden.fase !== 'cancelado' && orden.fase !== 'cerrado' && !orden.eliminada;
  const esDiaCita = forzarVisible || esMismoDiaQueHoy(orden.fechaCita);

  // Si ya inició → mostrar pill informativa
  if (yaIniciado) {
    return (
      <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full text-xs font-semibold">
        <CheckCircle2 size={12} /> Chequeo iniciado
      </span>
    );
  }
  if (!ordenActiva || !esDiaCita) return null;

  /**
   * Al tocar el botón abrimos la cámara inmediatamente (user-gesture válido).
   * El GPS se pide en `handleArchivo` DESPUÉS de recibir la foto, porque Chrome
   * móvil suspende getCurrentPosition mientras la cámara ocupa foreground.
   * El change event del input sigue contando como user-gesture en Chrome e iOS.
   */
  const dispararCamara = () => {
    if (procesando) return;

    // Si sabemos (Permissions API) que el permiso ya fue denegado, abortar sin pedir cámara.
    if (permisoGps === 'denied') {
      toast.error(mensajeGpsError({ code: 1, message: 'denied', highAccuracy: true }), {
        duration: 8000,
      });
      logChequeo('abortar — permiso geolocation = denied');
      return;
    }

    setProcesando(true);
    logChequeo('tap botón Iniciar chequeo', { ordenId: orden.id, permisoGps });

    // Abrir cámara inmediatamente — user gesture preservado (iOS + Chrome)
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
      logChequeo('cámara abierta (input.click)');
    } else {
      logChequeo('inputRef null — cámara no se abrió');
      setProcesando(false);
    }
  };

  const handleArchivo = async (file: File) => {
    if (!file) {
      setProcesando(false);
      return;
    }
    logChequeo('foto recibida', { sizeKB: Math.round(file.size / 1024), type: file.type });
    try {
      // GPS se pide DESPUÉS de la foto: Chrome móvil suspende getCurrentPosition
      // mientras la cámara tenía foco, así que pedirlo antes devolvía null.
      // El change event del input sigue contando como user-gesture.
      // Sin race externo — dejamos que obtenerUbicacionGPS controle sus propios
      // timeouts (alta 8s + baja 6s) y dispare onError con el código real.
      let ultimoGpsError: GpsErrorInfo | null = null;
      toast.loading('Obteniendo GPS...', { id: 'chequeo' });
      logChequeo('GPS request start (post-foto)');
      const gps = await obtenerUbicacionGPS(err => {
        ultimoGpsError = err;
        logChequeo(`GPS error (highAccuracy=${err.highAccuracy})`, err);
      });
      if (gps) logChequeo('GPS resolved', gps);
      else logChequeo('GPS resolved = null');

      // Si GPS falló, preguntar al técnico si quiere continuar sin verificación
      if (!gps) {
        toast.dismiss('chequeo');
        // Cast defensivo: TS narrow-ea a 'never' por el flow de la let capturada en closure.
        const err = ultimoGpsError as GpsErrorInfo | null;
        const motivo = mensajeGpsError(err);
        logChequeo('GPS sin resultado — mostrar confirm', { err, motivo });
        // Si el error es permiso denegado, cortar — no tiene sentido preguntar.
        if (err?.code === 1) {
          toast.error(motivo, { duration: 8000 });
          setProcesando(false);
          return;
        }
        const continuar = confirm(
          motivo +
          '\n\n¿Deseas iniciar el chequeo SIN verificación de ubicación?\n\n' +
          'La foto se registrará pero el chequeo quedará marcado como "GPS no verificado".',
        );
        if (!continuar) {
          logChequeo('técnico canceló el flujo sin GPS');
          setProcesando(false);
          return;
        }
        logChequeo('técnico aceptó continuar sin GPS');
      }

      // Validar distancia solo si tenemos ambas coords
      let distancia: number | undefined;
      if (gps && typeof orden.clienteLat === 'number' && typeof orden.clienteLng === 'number') {
        distancia = distanciaMetros(gps.lat, gps.lng, orden.clienteLat, orden.clienteLng);
        if (distancia > UMBRAL_LEJOS_METROS) {
          toast.dismiss('chequeo');
          const ok = confirm(
            `Estás a ${distancia} m del cliente (más de ${UMBRAL_LEJOS_METROS} m). ¿Confirmar inicio de chequeo de todas formas?`,
          );
          if (!ok) {
            setProcesando(false);
            return;
          }
        }
      }

      // Subir foto
      toast.loading('Subiendo foto...', { id: 'chequeo' });
      logChequeo('subiendo foto a Storage...');
      const fotoUrl = await subirFotoInicioChequeo(orden.id, file);
      logChequeo('foto subida', { fotoUrl });

      // 4. Construir registro
      const usuario = userProfile?.nombre || orden.tecnicoNombre || 'Técnico';
      // @safe-userprofile-id: inicioChequeo.tecnicoId es descriptor nested
      // dentro de ordenes_servicio. La rule de la colección valida tecnicoId
      // raíz contra auth.uid (no este nested). El fallback a orden.tecnicoId
      // mantiene consistencia con el dueño de la orden.
      const usuarioId = userProfile?.id || orden.tecnicoId || '';
      const ahora = Timestamp.now();
      const fechaInicio = ahora.toDate();

      const inicioChequeo: Record<string, unknown> = {
        fechaInicio: ahora,
        tecnicoId: usuarioId,
        tecnicoNombre: usuario,
        fotoUrl,
      };
      if (gps) {
        inicioChequeo.lat = gps.lat;
        inicioChequeo.lng = gps.lng;
      } else {
        inicioChequeo.sinGPS = true;
        inicioChequeo.gpsVerificado = false;
      }
      if (typeof distancia === 'number') {
        inicioChequeo.distanciaClienteMetros = distancia;
        inicioChequeo.gpsVerificado = distancia <= UMBRAL_LEJOS_METROS;
      }

      // 5. Cambiar fase a en_diagnostico (si no está ya en una fase posterior)
      const fasesPosteriores = ['en_diagnostico', 'en_cotizacion', 'aprobado', 'trabajo_realizado', 'cerrado'];
      const debeAvanzarFase = !fasesPosteriores.includes(orden.fase);

      const updates: Record<string, unknown> = {
        inicioChequeo,
        updatedAt: ahora,
      };

      if (debeAvanzarFase) {
        updates.fase = 'en_diagnostico';
        updates.estadoSimple = 'en_proceso';
        // Agregar al historial de fases
        const histPrev = (orden.historialFases || []).map(h => ({
          fase: h.fase,
          timestamp: h.timestamp instanceof Date ? Timestamp.fromDate(h.timestamp) : h.timestamp,
          usuario: h.usuario || '',
          ...(h.nota ? { nota: h.nota } : {}),
        }));
        updates.historialFases = [
          ...histPrev,
          {
            fase: 'en_diagnostico',
            timestamp: ahora,
            usuario,
            nota: 'Chequeo iniciado en sitio (foto + GPS)',
          },
        ];
      }

      // 6. Audit
      const registro = crearRegistroAuditoria(
        usuario,
        debeAvanzarFase ? 'cambio_fase' : 'editar',
        debeAvanzarFase
          ? `Chequeo iniciado en sitio${distancia !== undefined ? ` (a ${distancia}m del cliente)` : ''}`
          : `Foto de inicio de chequeo registrada`,
        debeAvanzarFase ? 'fase' : 'inicioChequeo',
        debeAvanzarFase ? faseLabel(orden.fase) : '—',
        debeAvanzarFase ? 'En diagnóstico' : 'iniciado',
      );
      updates.auditoria = arrayUnion(registro);

      // 7. Actualizar Firestore
      logChequeo('firestore update inicio...');
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), updates);
      logChequeo('firestore update OK');

      // 8. Notificar a admin/coordinadora/operaria
      try {
        const destinos = new Set<string>();
        // Operaria de la orden
        if (orden.operariaId) destinos.add(orden.operariaId);

        const qPersonal = query(
          collection(db, 'personal'),
          where('activo', '==', true),
          where('rol', 'in', ['administrador', 'coordinadora']),
        );
        const snap = await getDocs(qPersonal);
        snap.docs.forEach(d => {
          const p = { id: d.id, ...d.data() } as Personal;
          if (p.uid) destinos.add(p.uid);
        });

        const distanciaTxt =
          typeof distancia === 'number'
            ? distancia <= UMBRAL_LEJOS_METROS
              ? ` (a ${distancia}m, GPS OK)`
              : ` (a ${distancia}m del cliente — alejado)`
            : '';

        await Promise.all(
          Array.from(destinos).map(uid =>
            crearNotificacion({
              userId: uid,
              tipo: 'chequeo_iniciado',
              titulo: 'Técnico inició chequeo',
              mensaje: `${usuario} inició el chequeo de ${orden.numero || orden.id} — ${orden.clienteNombre}${distanciaTxt}.`,
              ordenId: orden.id,
              ordenNumero: orden.numero,
            }),
          ),
        );
        logChequeo('notificaciones enviadas', { destinos: destinos.size });
      } catch (err) {
        console.warn('[chequeo] No se pudieron crear notificaciones:', err);
      }

      toast.success('Chequeo iniciado · ' + new Date(fechaInicio).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }), {
        id: 'chequeo',
      });
    } catch (err) {
      const e = err as { code?: string; message?: string; stack?: string };
      console.error('[chequeo] error completo:', err);
      console.error('[chequeo] code:', e?.code);
      console.error('[chequeo] message:', e?.message);
      console.error('[chequeo] stack:', e?.stack);
      // Toast con código/mensaje específico para diagnóstico inmediato sin
      // requerir DevTools. Patrón establecido en afc5e4a/5f8f256
      // (Reactivación) — gotcha P-002 ya documentada.
      const motivo = e?.code || e?.message || 'error desconocido';
      toast.error(`Error al iniciar chequeo: ${motivo}`, { id: 'chequeo', duration: 8000 });
    } finally {
      setProcesando(false);
    }
  };

  const tamano =
    size === 'sm'
      ? 'px-3 py-1.5 text-xs gap-1'
      : 'px-4 py-2 text-sm gap-2';

  return (
    <div className="inline-flex flex-col gap-1.5 items-start">
      {permisoGps === 'denied' && (
        <div className="inline-flex items-start gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1 max-w-xs">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>
            Permiso de ubicación bloqueado. Toca el candado en la barra de direcciones
            y permite la ubicación para poder iniciar chequeo.
          </span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) {
            handleArchivo(f);
          } else {
            // Usuario canceló la cámara sin tomar foto
            logChequeo('usuario canceló la cámara');
            setProcesando(false);
          }
        }}
      />
      <button
        type="button"
        onClick={dispararCamara}
        disabled={procesando || permisoGps === 'denied'}
        className={`inline-flex items-center ${tamano} bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        <Camera size={size === 'sm' ? 12 : 16} />
        {procesando ? 'Iniciando...' : 'Iniciar chequeo'}
      </button>
    </div>
  );
}
