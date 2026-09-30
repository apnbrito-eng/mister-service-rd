import { ordenVigenteParaChequeo, soloChequeoDisponible } from '../utils/soloChequeoDisponible';
import { fechaCalendarioRD } from '../utils/fechaMantenimiento';
import { useNavigate } from 'react-router-dom';
import { resolverChatCliente } from '../utils/resolverChatCliente';
import { guardarSeguimientoChequeo, type SeguimientoChequeo } from '../services/seguimientoChequeo.service';
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { Cliente, OrdenServicio, Personal, SugerenciaSoloChequeo } from '../types';
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
  const navigate = useNavigate();
  const [gestiones, setGestiones] = useState<Record<string, SeguimientoChequeo>>({});
  const [seleccionada, setSeleccionada] = useState<OrdenServicio | null>(null);
  const [gestion, setGestion] = useState<SeguimientoChequeo>({ responsableUid: '', proximaFecha: '', resultado: 'pendiente', nota: '' });
  const [guardandoGestion, setGuardandoGestion] = useState(false);
  const { userProfile, currentUser } = useApp();
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
      setGestiones(Object.fromEntries(snap.docs.filter(d => d.data().seguimientoChequeo).map(d => [d.id, d.data().seguimientoChequeo])));
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

  useEffect(() => {
    if (seleccionada && !soloChequeoDisponible(ordenes.find(o => o.id === seleccionada.id))) setSeleccionada(null);
  }, [ordenes, seleccionada]);

  // Lista de sugerencias pendientes (client-side filter + sort)
  const pendientes = useMemo<SugerenciaConOrden[]>(() => {
    const out: SugerenciaConOrden[] = [];
    for (const orden of ordenes) {
      if (!ordenVigenteParaChequeo(orden)) continue;
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
    // P-001: la rule R4 valida resueltaPor == request.auth.uid. Para
    // perfiles cargados vía cascada personal/, userProfile.id es el
    // personalDocId, NO auth.uid. Usar currentUser.uid del Firebase Auth.
    if (!currentUser?.uid) {
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
          resueltaPor: currentUser.uid,
          resueltaPorNombre: userProfile?.nombre || 'Oficina',
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
    // P-001: ver comentario en handleAprobar.
    if (!rechazandoSug || !currentUser?.uid) return;
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
          resueltaPor: currentUser.uid,
          resueltaPorNombre: userProfile?.nombre || 'Oficina',
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

  const hoyRD = fechaCalendarioRD(new Date());
  const comerciales = ordenes.filter(soloChequeoDisponible).sort((a, b) => (gestiones[a.id]?.proximaFecha || '').localeCompare(gestiones[b.id]?.proximaFecha || ''));
  const abrirChatCliente = async (orden: OrdenServicio) => {
    try {
      if (!orden.clienteId) throw new Error('La orden requiere vincular un cliente.');
      const snap = await getDoc(doc(db, 'clientes', orden.clienteId));
      if (!snap.exists() || snap.data().eliminado) throw new Error('El cliente no está disponible.');
      const cliente = { ...snap.data(), id: snap.id } as Cliente;
      const waId = await resolverChatCliente(cliente);
      navigate(`/admin/inbox/${encodeURIComponent(waId)}?clienteId=${encodeURIComponent(cliente.id)}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo abrir el chat.'); }
  };
  const guardarGestion = async () => {
    if (!seleccionada || guardandoGestion) return;
    setGuardandoGestion(true);
    try { await guardarSeguimientoChequeo(seleccionada.id, gestion); setSeleccionada(null); toast.success('Seguimiento guardado; responsable notificado.'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setGuardandoGestion(false); }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando sugerencias..." />;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <ClipboardCheck size={22} /> Sugerencias de solo chequeo
          </h1>
          <p className="text-gray-500 text-sm">
            {pendientes.length === 0
              ? 'No hay sugerencias pendientes de revisión.'
              : `${pendientes.length} sugerencia${pendientes.length === 1 ? '' : 's'} pendiente${pendientes.length === 1 ? '' : 's'}.`}
          </p>
        </div>
      </div>

      <section className="space-y-3" aria-label="Seguimiento comercial de solo chequeo">
        <h2 className="text-xl font-semibold">Seguimiento al cliente ({comerciales.length})</h2>
        <p className="text-sm text-gray-600">Registra la próxima gestión y prepara la propuesta en el chat de la empresa. La oferta se revisa y se envía desde allí.</p>
        {comerciales.map(orden => <article key={orden.id} className="bg-white border rounded-xl p-4 space-y-2">
          <h3 className="font-semibold">{orden.numero} · {orden.clienteNombre}</h3>
          <p>{gestiones[orden.id] ? `${gestiones[orden.id].resultado} · Próxima gestión: ${gestiones[orden.id].proximaFecha}` : 'Sin seguimiento programado'}</p>
          {gestiones[orden.id]?.resultado !== 'no_interesado' && gestiones[orden.id]?.proximaFecha <= hoyRD && <p className="text-amber-800 font-semibold">Gestión pendiente para hoy o vencida</p>}
          <p className="text-sm">Responsable: {personal.find(p => p.uid === gestiones[orden.id]?.responsableUid)?.nombre || (gestiones[orden.id]?.responsableUid === currentUser?.uid ? userProfile?.nombre : gestiones[orden.id]?.responsableUid || 'Sin asignar')}</p>
          <p className="text-sm">{gestiones[orden.id]?.nota}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => navigate(`/admin/ordenes/${encodeURIComponent(orden.id)}`)}>Abrir orden</button>
            <button className="btn-secondary" onClick={() => void abrirChatCliente(orden)}>WhatsApp / preparar oferta</button>
            <button className="btn-primary" onClick={() => { setSeleccionada(orden); setGestion(gestiones[orden.id] || { responsableUid: currentUser?.uid || '', proximaFecha: '', resultado: 'pendiente', nota: '' }); }}>Registrar seguimiento</button>
          </div>
        </article>)}
      </section>
      <Modal isOpen={!!seleccionada} onClose={() => !guardandoGestion && setSeleccionada(null)} title="Seguimiento al cliente">
        <div className="space-y-3">
          <label className="block">Responsable<select className="input-field" value={gestion.responsableUid} onChange={e => setGestion({ ...gestion, responsableUid: e.target.value })}>
            <option value="">Seleccionar</option>
            {currentUser && <option value={currentUser.uid}>Yo ({userProfile?.nombre || 'Usuario actual'})</option>}
            {personal.filter(p => p.uid && p.uid !== currentUser?.uid && p.activo !== false && ['administrador', 'coordinadora', 'operaria', 'secretaria'].includes(p.rol)).map(p => <option key={p.id} value={p.uid}>{p.nombre}</option>)}
          </select></label>
          <label className="block">Próxima gestión<input className="input-field" type="date" value={gestion.proximaFecha} onChange={e => setGestion({ ...gestion, proximaFecha: e.target.value })} /></label>
          <label className="block">Resultado<select className="input-field" value={gestion.resultado} onChange={e => setGestion({ ...gestion, resultado: e.target.value as SeguimientoChequeo['resultado'] })}><option value="pendiente">Pendiente de contacto</option><option value="contactado">Contactado</option><option value="interesado">Interesado en continuar</option><option value="no_interesado">No interesado / detener seguimiento</option></select></label>
          <label className="block">Nota<textarea className="input-field" value={gestion.nota} onChange={e => setGestion({ ...gestion, nota: e.target.value })} /></label>
          <button className="btn-primary" disabled={guardandoGestion} onClick={() => void guardarGestion()}>Guardar seguimiento</button>
        </div>
      </Modal>

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
                    <p className="font-mono text-xs text-primary font-semibold">
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
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
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
