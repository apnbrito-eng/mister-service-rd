import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, getDoc, doc, Timestamp, query, orderBy, where, arrayUnion } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { StandbyPieza, EstadoStandby, MovimientoPieza, OrdenServicio } from '../types';
import { formatFechaCorta, formatFecha, parseOrden, crearRegistroAuditoria } from '../utils';
import { useApp } from '../context/AppContext';
import { crearNotificacion } from '../services/notificaciones.service';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { differenceInDays } from 'date-fns';
import { Plus, Package, Check, Clock, History, ArrowDown, ArrowUp, Pause, Play, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';

const ESTADO_LABELS: Record<EstadoStandby, string> = {
  buscando: 'Buscando',
  importada: 'Importada',
  dificil: 'Difícil',
  llego: 'Llegó',
};

const ESTADO_COLORS: Record<EstadoStandby, string> = {
  buscando: 'bg-yellow-100 text-yellow-700',
  importada: 'bg-blue-100 text-blue-700',
  dificil: 'bg-red-100 text-red-700',
  llego: 'bg-green-100 text-green-700',
};

export default function Standby() {
  const navigate = useNavigate();
  const { userProfile } = useApp();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StandbyPieza[]>([]);
  const [ordenesStandby, setOrdenesStandby] = useState<OrdenServicio[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoPieza[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<string>('activas');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'piezas' | 'ordenes' | 'historial'>('piezas');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'retirada' | 'instalada'>('todos');
  const [reactivandoId, setReactivandoId] = useState<string | null>(null);

  const [form, setForm] = useState({
    clienteNombre: '', equipoTipo: '', equipoMarca: '',
    piezaFaltante: '', tecnicoNombre: '', notas: '',
  });

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'standby_piezas'), orderBy('createdAt', 'desc')),
      (snap) => {
        setItems(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          fechaInicio: d.data().fechaInicio?.toDate?.() || new Date(),
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
        } as StandbyPieza)));
        setLoading(false);
      }
    );
    const unsub2 = onSnapshot(
      query(collection(db, 'movimientos_piezas'), orderBy('fecha', 'desc')),
      (snap) => {
        setMovimientos(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          fecha: d.data().fecha?.toDate?.() || new Date(),
        } as MovimientoPieza)));
      }
    );
    // Órdenes en stand-by — query simple por flag (sin índice compuesto).
    // Filtramos eliminadas en cliente para evitar requisito de índice.
    const unsub3 = onSnapshot(
      query(collection(db, 'ordenes_servicio'), where('enStandby', '==', true)),
      (snap) => {
        const lista = snap.docs
          .map(d => parseOrden(d.id, d.data() as Record<string, unknown>) as OrdenServicio)
          .filter(o => !o.eliminada);
        // Más recientes primero por standbyDesde (fallback updatedAt)
        lista.sort((a, b) => {
          const ta = a.standbyDesde instanceof Date ? a.standbyDesde.getTime() : (a.updatedAt?.getTime() || 0);
          const tb = b.standbyDesde instanceof Date ? b.standbyDesde.getTime() : (b.updatedAt?.getTime() || 0);
          return tb - ta;
        });
        setOrdenesStandby(lista);
      }
    );
    return () => { unsub(); unsub2(); unsub3(); };
  }, []);

  const filteredItems = items.filter(i => {
    if (filtroEstado === 'activas') return i.estado !== 'llego';
    if (filtroEstado === 'llego') return i.estado === 'llego';
    return i.estado === filtroEstado;
  });

  const getDiasColor = (fechaInicio: Date) => {
    const dias = differenceInDays(new Date(), fechaInicio);
    if (dias > 14) return { color: 'text-red-600 bg-red-50 border-red-200', dias };
    if (dias >= 7) return { color: 'text-yellow-600 bg-yellow-50 border-yellow-200', dias };
    return { color: 'text-green-600 bg-green-50 border-green-200', dias };
  };

  const handleRegistrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clienteNombre || !form.piezaFaltante) {
      toast.error('Cliente y pieza son requeridos');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'standby_piezas'), {
        ...form,
        fechaInicio: Timestamp.now(),
        estado: 'buscando',
        createdAt: Timestamp.now(),
      });
      toast.success('Pieza pendiente registrada');
      setShowModal(false);
      setForm({ clienteNombre: '', equipoTipo: '', equipoMarca: '', piezaFaltante: '', tecnicoNombre: '', notas: '' });
    } catch {
      toast.error('Error al registrar');
    } finally {
      setSaving(false);
    }
  };

  const notificarTecnicoPiezaLlego = async (item: StandbyPieza) => {
    if (!item.ordenId) return;
    try {
      const snap = await getDoc(doc(db, 'ordenes_servicio', item.ordenId));
      if (!snap.exists()) return;
      const orden = parseOrden(snap.id, snap.data() as Record<string, unknown>) as OrdenServicio;
      if (!orden.tecnicoId) return;
      await crearNotificacion({
        userId: orden.tecnicoId,
        destinatarioNombre: orden.tecnicoNombre,
        tipo: 'pieza_llego',
        titulo: 'Pieza lista — puedes proceder',
        mensaje: `La pieza "${item.piezaFaltante}" para OS-${orden.numero} llegó al taller. Cliente: ${orden.clienteNombre}.`,
        ordenId: orden.id,
        ordenNumero: orden.numero,
      });
      toast.success('Técnico notificado');
    } catch (err) {
      console.error('Error notificando técnico:', err);
    }
  };

  const handlePiezaLlego = async (item: StandbyPieza) => {
    try {
      await updateDoc(doc(db, 'standby_piezas', item.id), { estado: 'llego' });
      toast.success(`Pieza "${item.piezaFaltante}" marcada como llegada`);
      if (item.estado !== 'llego') {
        await notificarTecnicoPiezaLlego(item);
      }
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const handleCambiarEstado = async (item: StandbyPieza, nuevoEstado: EstadoStandby) => {
    try {
      await updateDoc(doc(db, 'standby_piezas', item.id), { estado: nuevoEstado });
      toast.success(`Estado cambiado a "${ESTADO_LABELS[nuevoEstado]}"`);
      if (nuevoEstado === 'llego' && item.estado !== 'llego') {
        await notificarTecnicoPiezaLlego(item);
      }
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const handleReactivarOrden = async (orden: OrdenServicio) => {
    if (!confirm(`¿Reactivar la orden ${orden.numero || orden.id}? Volverá a estado activo.`)) return;
    setReactivandoId(orden.id);
    try {
      const usuario = userProfile?.nombre || 'Sistema';
      const registro = crearRegistroAuditoria(
        usuario,
        'reactivar_orden',
        'Reactivó la orden desde stand-by',
        'enStandby',
        'true',
        'false',
      );
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        enStandby: false,
        auditoria: arrayUnion(registro),
        updatedAt: Timestamp.now(),
      });
      toast.success('Orden reactivada');
    } catch (err) {
      console.error('Error al reactivar orden:', err);
      toast.error('Error al reactivar la orden');
    } finally {
      setReactivandoId(null);
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando pendientes de piezas..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460]">Pendiente de piezas</h1>
          <p className="text-gray-500 text-sm">
            {items.filter(i => i.estado !== 'llego').length} piezas activas · {ordenesStandby.length} órdenes pendientes
          </p>
        </div>
        {tab === 'piezas' && (
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Plus size={18} /> Registrar Pieza
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-xl p-1 shadow-sm border border-gray-100 w-fit flex-wrap">
        <button onClick={() => setTab('piezas')}
          className={`flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${tab === 'piezas' ? 'bg-[#0f3460] text-white' : 'text-gray-600'}`}>
          <Package size={14} /> Piezas ({items.filter(i => i.estado !== 'llego').length})
        </button>
        <button onClick={() => setTab('ordenes')}
          className={`flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${tab === 'ordenes' ? 'bg-[#0f3460] text-white' : 'text-gray-600'}`}>
          <Pause size={14} /> Órdenes ({ordenesStandby.length})
        </button>
        <button onClick={() => setTab('historial')}
          className={`flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${tab === 'historial' ? 'bg-[#0f3460] text-white' : 'text-gray-600'}`}>
          <History size={14} /> Historial de Piezas
        </button>
      </div>

      {tab === 'historial' ? (
        <>
          <div className="flex gap-2 flex-wrap" data-tab="historial">
            {(['todos', 'retirada', 'instalada'] as const).map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtroTipo === t ? 'bg-[#0f3460] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t === 'todos' ? 'Todos' : t === 'retirada' ? 'Retiradas' : 'Instaladas'}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {(() => {
              const filtrados = filtroTipo === 'todos' ? movimientos : movimientos.filter(m => m.tipo === filtroTipo);
              if (filtrados.length === 0) {
                return (
                  <div className="p-12 text-center text-gray-400">
                    <History size={48} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Sin movimientos de piezas registrados</p>
                  </div>
                );
              }
              return (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Tipo</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Descripción</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Orden</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Cliente</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Técnico</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Detalle</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Fecha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtrados.map(m => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            {m.tipo === 'retirada' ? (
                              <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 w-fit">
                                <ArrowUp size={10} /> Retirada
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 w-fit">
                                <ArrowDown size={10} /> Instalada
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium">{m.descripcion}</td>
                          <td className="px-4 py-3 text-xs text-gray-600 font-mono hidden md:table-cell">{m.ordenNumero}</td>
                          <td className="px-4 py-3 text-xs text-gray-600 hidden md:table-cell">{m.clienteNombre}</td>
                          <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell">{m.tecnicoNombre}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {m.tipo === 'retirada' ? `${m.motivo || ''} → ${m.destino || ''}` : `${m.procedencia || ''}${m.numeroParte ? ` (${m.numeroParte})` : ''}`}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">{formatFecha(m.fecha)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </>
      ) : tab === 'ordenes' ? (
        <>
          {ordenesStandby.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
              <Pause size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400 text-sm">Sin órdenes pendientes de piezas</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {ordenesStandby.map(o => {
                const desde = o.standbyDesde instanceof Date ? o.standbyDesde : null;
                const hasta = o.standbyHasta instanceof Date ? o.standbyHasta : null;
                const dias = desde ? differenceInDays(new Date(), desde) : 0;
                const colorBorder = dias > 14 ? 'border-red-200' : dias >= 7 ? 'border-yellow-200' : 'border-gray-100';
                return (
                  <div
                    key={o.id}
                    className={`bg-white rounded-2xl shadow-sm border-2 p-5 cursor-pointer hover:shadow-md transition-shadow ${colorBorder}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/admin/ordenes/${o.id}`)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') navigate(`/admin/ordenes/${o.id}`); }}
                  >
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-bold text-[#0f3460]">{o.numero || '#--'}</span>
                        <h3 className="font-semibold text-gray-900 truncate">{o.clienteNombre}</h3>
                        <p className="text-sm text-gray-600 truncate">
                          <Wrench size={11} className="inline mr-1" />
                          {o.equipoTipo}{o.equipoMarca ? ` · ${o.equipoMarca}` : ''}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 shrink-0">
                        <Pause size={10} /> Pendiente de piezas
                      </span>
                    </div>
                    {o.standbyMotivo && (
                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <p className="text-[10px] text-gray-500 uppercase">Motivo</p>
                        <p className="text-sm font-medium text-gray-900">{o.standbyMotivo}</p>
                        {o.standbyNotas && <p className="text-xs text-gray-500 italic mt-1">{o.standbyNotas}</p>}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-3 flex-wrap gap-2">
                      {desde && (
                        <span className="flex items-center gap-1">
                          <Clock size={10} /> Desde {formatFechaCorta(desde)}
                        </span>
                      )}
                      {desde && (
                        <span className={`px-2 py-0.5 rounded-full border font-medium ${
                          dias > 14 ? 'text-red-600 bg-red-50 border-red-200'
                          : dias >= 7 ? 'text-yellow-600 bg-yellow-50 border-yellow-200'
                          : 'text-green-600 bg-green-50 border-green-200'
                        }`}>
                          {dias} días
                        </span>
                      )}
                    </div>
                    {hasta && (
                      <p className="text-xs text-gray-500 mb-3">
                        Reactivación estimada: <span className="font-medium text-gray-700">{formatFechaCorta(hasta)}</span>
                      </p>
                    )}
                    {o.standbyPor && (
                      <p className="text-[11px] text-gray-400 mb-3">Puesto por: {o.standbyPor}</p>
                    )}
                    {o.tecnicoNombre && (
                      <p className="text-xs text-gray-500 mb-3">Técnico: {o.tecnicoNombre}</p>
                    )}
                    <button
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); handleReactivarOrden(o); }}
                      disabled={reactivandoId === o.id}
                      className="w-full flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-60"
                    >
                      <Play size={12} />
                      {reactivandoId === o.id ? 'Reactivando...' : 'Reactivar orden'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
      <>
      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {['activas', 'buscando', 'importada', 'dificil', 'llego'].map(e => (
          <button key={e} onClick={() => setFiltroEstado(e)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtroEstado === e ? 'bg-[#0f3460] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {e === 'activas' ? 'Activas' : ESTADO_LABELS[e as EstadoStandby] || e}
          </button>
        ))}
      </div>

      {/* Lista */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Package size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400">Sin piezas en esta categoría</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredItems.map(item => {
            const { color, dias } = getDiasColor(item.fechaInicio);
            return (
              <div key={item.id} className={`bg-white rounded-2xl shadow-sm border-2 p-5 ${
                item.estado === 'llego' ? 'border-green-200 opacity-70' : dias > 14 ? 'border-red-200' : dias >= 7 ? 'border-yellow-200' : 'border-gray-100'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{item.clienteNombre}</h3>
                    <p className="text-sm text-gray-600">{item.equipoTipo} · {item.equipoMarca}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_COLORS[item.estado]}`}>
                    {ESTADO_LABELS[item.estado]}
                  </span>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <p className="text-xs text-gray-500">Pieza faltante</p>
                  <p className="text-sm font-medium text-gray-900">{item.piezaFaltante}</p>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                  <span className="flex items-center gap-1"><Clock size={10} /> {formatFechaCorta(item.fechaInicio)}</span>
                  <span className={`px-2 py-0.5 rounded-full border font-medium ${color}`}>
                    {dias} días
                  </span>
                </div>
                {item.tecnicoNombre && <p className="text-xs text-gray-500 mb-3">Técnico: {item.tecnicoNombre}</p>}
                {item.notas && <p className="text-xs text-gray-500 italic mb-3">{item.notas}</p>}

                {item.estado !== 'llego' && (
                  <div className="flex gap-2">
                    <select
                      value={item.estado}
                      onChange={e => handleCambiarEstado(item, e.target.value as EstadoStandby)}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none"
                    >
                      <option value="buscando">Buscando</option>
                      <option value="importada">Importada</option>
                      <option value="dificil">Difícil</option>
                    </select>
                    <button
                      onClick={() => handlePiezaLlego(item)}
                      className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Check size={12} /> Llegó
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* Modal registrar */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Registrar Pieza Pendiente">
        <form onSubmit={handleRegistrar} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
            <input type="text" value={form.clienteNombre} onChange={e => setForm(f => ({ ...f, clienteNombre: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo equipo</label>
              <input type="text" value={form.equipoTipo} onChange={e => setForm(f => ({ ...f, equipoTipo: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
              <input type="text" value={form.equipoMarca} onChange={e => setForm(f => ({ ...f, equipoMarca: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pieza faltante *</label>
            <input type="text" value={form.piezaFaltante} onChange={e => setForm(f => ({ ...f, piezaFaltante: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
            <input type="text" value={form.tecnicoNombre} onChange={e => setForm(f => ({ ...f, tecnicoNombre: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
