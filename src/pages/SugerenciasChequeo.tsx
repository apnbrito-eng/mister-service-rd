import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { OrdenServicio, Personal, SugerenciaSoloChequeo } from '../types';
import {
  parseOrden,
  formatMoneda,
  tiempoTranscurrido,
  obtenerSugerenciaSoloChequeoPendiente,
  formatearEquipoLabel,
} from '../utils';
import { useApp } from '../context/AppContext';
import { resolverSugerenciaSoloChequeoConNotif } from '../services/ordenes.service';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import WhatsAppIcon from '../components/icons/WhatsAppIcon';
import {
  CheckCircle2, XCircle, ClipboardCheck, AlertCircle, User as UserIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { whatsappLink } from '../utils';

const MIN_NOTA_CHARS = 10;

interface SugerenciaConOrden {
  orden: OrdenServicio;
  sugerencia: SugerenciaSoloChequeo;
}

export default function SugerenciasChequeo() {
  const { userProfile } = useApp();
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [trabajando, setTrabajando] = useState<string | null>(null); // sugerenciaId activo

  // Modal de rechazo (motivo obligatorio)
  const [rechazandoSug, setRechazandoSug] = useState<SugerenciaConOrden | null>(null);
  const [notaRechazo, setNotaRechazo] = useState('');

  useEffect(() => {
    let loaded = 0;
    const checkLoaded = () => {
      loaded++;
      if (loaded >= 2) setLoading(false);
    };

    // Listener de órdenes — filtramos client-side por sugerencia pendiente
    // para no requerir índice compuesto (convención del repo).
    const unsubOrd = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      setOrdenes(snap.docs.map(d => parseOrden(d.id, d.data())));
      checkLoaded();
    });

    // Personal para resolver teléfono del técnico al hacer WhatsApp
    const unsubPers = onSnapshot(collection(db, 'personal'), (snap) => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
      checkLoaded();
    });

    return () => {
      unsubOrd();
      unsubPers();
    };
  }, []);

  // Lista de sugerencias pendientes (client-side filter + sort)
  const pendientes = useMemo<SugerenciaConOrden[]>(() => {
    const out: SugerenciaConOrden[] = [];
    for (const orden of ordenes) {
      if (orden.eliminada) continue;
      const sug = obtenerSugerenciaSoloChequeoPendiente(orden);
      if (sug) out.push({ orden, sugerencia: sug });
    }
    out.sort((a, b) => {
      const at = a.sugerencia.fechaSugerencia instanceof Date
        ? a.sugerencia.fechaSugerencia.getTime()
        : (a.sugerencia.fechaSugerencia.toDate?.()?.getTime() ?? 0);
      const bt = b.sugerencia.fechaSugerencia instanceof Date
        ? b.sugerencia.fechaSugerencia.getTime()
        : (b.sugerencia.fechaSugerencia.toDate?.()?.getTime() ?? 0);
      return bt - at; // más recientes primero
    });
    return out;
  }, [ordenes]);

  const handleAprobar = async (item: SugerenciaConOrden) => {
    if (!userProfile?.id) {
      toast.error('No se identificó al usuario');
      return;
    }
    setTrabajando(item.sugerencia.id);
    try {
      await resolverSugerenciaSoloChequeoConNotif(
        item.orden,
        item.sugerencia,
        'aprobada',
        {
          resueltaPor: userProfile.id,
          resueltaPorNombre: userProfile.nombre || 'Oficina',
        },
      );
      toast.success('Sugerencia aprobada — el técnico puede cerrar la orden');
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('No se pudo aprobar: ' + msg);
    } finally {
      setTrabajando(null);
    }
  };

  const abrirRechazo = (item: SugerenciaConOrden) => {
    setRechazandoSug(item);
    setNotaRechazo('');
  };

  const cerrarRechazo = () => {
    setRechazandoSug(null);
    setNotaRechazo('');
  };

  const handleConfirmarRechazo = async () => {
    if (!rechazandoSug || !userProfile?.id) return;
    if (notaRechazo.trim().length < MIN_NOTA_CHARS) {
      toast.error(`El motivo debe tener al menos ${MIN_NOTA_CHARS} caracteres`);
      return;
    }
    setTrabajando(rechazandoSug.sugerencia.id);
    try {
      await resolverSugerenciaSoloChequeoConNotif(
        rechazandoSug.orden,
        rechazandoSug.sugerencia,
        'rechazada',
        {
          resueltaPor: userProfile.id,
          resueltaPorNombre: userProfile.nombre || 'Oficina',
          notaResolucion: notaRechazo.trim(),
        },
      );
      toast.success('Sugerencia rechazada — el técnico fue notificado');
      cerrarRechazo();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('No se pudo rechazar: ' + msg);
    } finally {
      setTrabajando(null);
    }
  };

  const personalById = useMemo(() => {
    const m = new Map<string, Personal>();
    for (const p of personal) {
      if (p.uid) m.set(p.uid, p);
      m.set(p.id, p);
    }
    return m;
  }, [personal]);

  const whatsappTecnicoUrl = (item: SugerenciaConOrden): string | null => {
    const p = personalById.get(item.sugerencia.sugeridaPor);
    const tel = p?.telefono;
    if (!tel) return null;
    const mensaje = `Hola ${p.nombre}, sobre tu sugerencia de solo chequeo en la orden ${item.orden.numero || item.orden.id} (${item.orden.clienteNombre}):`;
    return whatsappLink(tel, mensaje);
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando sugerencias..." />;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460] flex items-center gap-2">
            <ClipboardCheck size={22} /> Sugerencias de solo chequeo
          </h1>
          <p className="text-gray-500 text-sm">
            {pendientes.length === 0
              ? 'No hay sugerencias pendientes de revisión.'
              : `${pendientes.length} sugerencia${pendientes.length === 1 ? '' : 's'} pendiente${pendientes.length === 1 ? '' : 's'}.`}
          </p>
        </div>
      </div>

      {pendientes.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
          <ClipboardCheck size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay sugerencias pendientes.</p>
          <p className="text-xs mt-1">
            Cuando un técnico sugiera cerrar una orden como solo chequeo, aparecerá acá para revisar.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendientes.map((item) => {
            const fecha = item.sugerencia.fechaSugerencia instanceof Date
              ? item.sugerencia.fechaSugerencia
              : item.sugerencia.fechaSugerencia.toDate?.() ?? new Date();
            const waUrl = whatsappTecnicoUrl(item);
            const enProgreso = trabajando === item.sugerencia.id;
            return (
              <div
                key={item.sugerencia.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3"
              >
                {/* Header con número + cliente */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-mono text-xs text-[#0f3460] font-semibold">
                      {item.orden.numero || item.orden.id}
                    </p>
                    <p className="text-base font-semibold text-gray-900 mt-0.5">
                      {item.orden.clienteNombre}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatearEquipoLabel(item.orden)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">{tiempoTranscurrido(fecha)}</p>
                    <p className="text-sm font-bold text-amber-700 mt-0.5">
                      {formatMoneda(item.sugerencia.montoChequeo)}
                    </p>
                  </div>
                </div>

                {/* Falla reportada */}
                {item.orden.descripcionFalla && (
                  <div className="bg-gray-50 rounded-lg p-3 text-xs">
                    <p className="font-semibold text-gray-700">Falla reportada</p>
                    <p className="text-gray-600 mt-0.5">{item.orden.descripcionFalla}</p>
                  </div>
                )}

                {/* Motivo del técnico */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                  <div className="flex items-center gap-1.5 mb-1">
                    <UserIcon size={12} className="text-amber-700" />
                    <p className="font-semibold text-amber-900">
                      {item.sugerencia.sugeridaPorNombre || 'Técnico'} sugiere
                    </p>
                  </div>
                  <p className="text-amber-800 italic">"{item.sugerencia.motivo}"</p>
                </div>

                {/* Acciones */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleAprobar(item)}
                    disabled={enProgreso}
                    className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
                  >
                    <CheckCircle2 size={14} /> {enProgreso ? 'Procesando...' : 'Aprobar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirRechazo(item)}
                    disabled={enProgreso}
                    className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
                  >
                    <XCircle size={14} /> Rechazar
                  </button>
                  {waUrl ? (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
                      title="Mandar WhatsApp al técnico"
                    >
                      <WhatsAppIcon filled={false} className="text-gray-700" size={14} />
                      WhatsApp
                    </a>
                  ) : (
                    <span
                      className="flex items-center justify-center gap-1.5 bg-gray-50 text-gray-400 px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed"
                      title="El técnico no tiene teléfono en su ficha"
                    >
                      <WhatsAppIcon filled={false} className="text-gray-400" size={14} />
                      WhatsApp
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal rechazo */}
      <Modal
        isOpen={!!rechazandoSug}
        onClose={trabajando ? () => {} : cerrarRechazo}
        title="Rechazar sugerencia"
      >
        <div className="space-y-4">
          {rechazandoSug && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs">
              <p className="font-semibold">{rechazandoSug.orden.clienteNombre}</p>
              <p className="text-gray-600">
                {rechazandoSug.orden.numero} · {formatearEquipoLabel(rechazandoSug.orden)}
              </p>
            </div>
          )}
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">El técnico recibirá esta nota como motivo del rechazo.</p>
              <p className="mt-1">
                La orden volverá al flujo normal — el técnico deberá esperar aprobación de precio
                regular para cerrar.
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo del rechazo *
            </label>
            <textarea
              rows={3}
              value={notaRechazo}
              onChange={(e) => setNotaRechazo(e.target.value)}
              disabled={!!trabajando}
              placeholder="Ej: El cliente sí tiene presupuesto — coordiná con él de nuevo antes de cerrar."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Mínimo {MIN_NOTA_CHARS} caracteres.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={cerrarRechazo}
              disabled={!!trabajando}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmarRechazo}
              disabled={!!trabajando || notaRechazo.trim().length < MIN_NOTA_CHARS}
              className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {trabajando ? 'Procesando...' : 'Confirmar rechazo'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
