import { useRef, useState } from 'react';
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
} from '../../services/storage.service';
import { crearNotificacion } from '../../services/notificaciones.service';
import { crearRegistroAuditoria, faseLabel } from '../../utils';
import { Camera, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

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
  const inputRef = useRef<HTMLInputElement>(null);

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

  const dispararCamara = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const handleArchivo = async (file: File) => {
    if (!file) return;
    setProcesando(true);
    try {
      // 1. Capturar GPS (no bloqueante, si falla seguimos sin coords)
      toast.loading('Obteniendo ubicación...', { id: 'chequeo' });
      const gps = await obtenerUbicacionGPS();

      // 2. Si tenemos coords del cliente, comparar distancia
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

      // 3. Subir foto
      toast.loading('Subiendo foto...', { id: 'chequeo' });
      const fotoUrl = await subirFotoInicioChequeo(orden.id, file);

      // 4. Construir registro
      const usuario = userProfile?.nombre || orden.tecnicoNombre || 'Técnico';
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
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), updates);

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
              destinatarioId: uid,
              tipo: 'chequeo_iniciado',
              titulo: 'Técnico inició chequeo',
              mensaje: `${usuario} inició el chequeo de ${orden.numero || orden.id} — ${orden.clienteNombre}${distanciaTxt}.`,
              ordenId: orden.id,
              ordenNumero: orden.numero,
            }),
          ),
        );
      } catch (err) {
        console.warn('No se pudieron crear notificaciones de chequeo:', err);
      }

      toast.success('Chequeo iniciado · ' + new Date(fechaInicio).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }), {
        id: 'chequeo',
      });
    } catch (err) {
      console.error(err);
      toast.error('Error al iniciar el chequeo', { id: 'chequeo' });
    } finally {
      setProcesando(false);
    }
  };

  const tamano =
    size === 'sm'
      ? 'px-3 py-1.5 text-xs gap-1'
      : 'px-4 py-2 text-sm gap-2';

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleArchivo(f);
        }}
      />
      <button
        type="button"
        onClick={dispararCamara}
        disabled={procesando}
        className={`inline-flex items-center ${tamano} bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold disabled:opacity-60`}
      >
        <Camera size={size === 'sm' ? 12 : 16} />
        {procesando ? 'Iniciando...' : 'Iniciar chequeo'}
      </button>
    </>
  );
}
