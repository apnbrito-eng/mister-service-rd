import { useState, useEffect } from 'react';
import { collection, onSnapshot, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio } from '../types';
import { formatFechaCorta, formatMoneda, parseOrden } from '../utils';
import { useTiposEquipo } from '../hooks/useTiposEquipo';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Plus, Package, Clock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import { useNavigate } from 'react-router-dom';
import { abrirChatVinculado, cambiarEstadoTaller, recibirEquipoTaller, vincularEquipoOrden, type EquipoVinculado } from '../services/flujoPiezasTaller.service';
import WhatsAppIcon from '../components/icons/WhatsAppIcon';
import { differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

const ESTADO_LABELS: Record<EquipoVinculado['estado'], string> = {
  recibido: 'Recibido', en_diagnostico: 'En Diagnóstico', en_reparacion: 'En Reparación',
  en_standby: 'En Stand-by', listo: 'Listo', entregado: 'Entregado', descartado: 'Descartado / no reparable',
};
const ESTADO_COLORS: Record<EquipoVinculado['estado'], string> = {
  recibido: 'bg-gray-100 text-gray-700', en_diagnostico: 'bg-yellow-100 text-yellow-700',
  en_reparacion: 'bg-blue-100 text-blue-700', en_standby: 'bg-orange-100 text-orange-700',
  listo: 'bg-green-100 text-green-700', entregado: 'bg-emerald-100 text-emerald-700', descartado: 'bg-red-100 text-red-700',
};

export default function EquiposTaller() {
  const navigate = useNavigate();
  const { userProfile } = useApp();
  const puedeGestionar = puede(userProfile, 'ordenesModificar') && ['administrador', 'coordinadora', 'operaria', 'secretaria'].includes(userProfile?.rol || '');
  const [recepcionId, setRecepcionId] = useState<string>(() => crypto.randomUUID());
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [ordenId, setOrdenId] = useState('');
  const tiposEquipo = useTiposEquipo();
  const [loading, setLoading] = useState(true);
  const [equipos, setEquipos] = useState<EquipoVinculado[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    clienteNombre: '', clienteTelefono: '', equipoTipo: '', equipoMarca: '', numeroSerie: '',
    fallaReportada: '', diagnostico: '', tecnicoNombre: '', fechaPrometida: '', costoReparacion: '',
  });

  useEffect(() => {
    const unsubOrdenes = onSnapshot(collection(db, 'ordenes_servicio'), snap => setOrdenes(snap.docs.map(d => parseOrden(d.id, d.data())).filter(o => !o.eliminada)));
    const unsub = onSnapshot(
      query(collection(db, 'equipos_taller'), orderBy('createdAt', 'desc')),
      (snap) => {
        setEquipos(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          fechaRecibido: d.data().fechaRecibido?.toDate?.() || new Date(),
          fechaPrometida: d.data().fechaPrometida?.toDate?.() || null,
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
        } as EquipoVinculado)));
        setLoading(false);
      }
    );
    return () => { unsub(); unsubOrdenes(); };
  }, []);

  const filtered = filtroEstado ? equipos.filter(e => e.estado === filtroEstado) : equipos;
  const enTaller = equipos.filter(e => e.estado !== 'entregado').length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeGestionar) { toast.error('No tienes permiso para gestionar equipos.'); return; }
    if (!ordenId || !form.clienteNombre || !form.numeroSerie || !form.equipoTipo) {
      toast.error('Cliente, tipo y número de serie son requeridos');
      return;
    }
    setSaving(true);
    try {
      await recibirEquipoTaller(recepcionId, ordenId, {
        ordenId,
        clienteId: ordenes.find(o => o.id === ordenId)?.clienteId || '',
        clienteNombre: form.clienteNombre,
        clienteTelefono: form.clienteTelefono,
        equipoTipo: form.equipoTipo,
        equipoMarca: form.equipoMarca,
        numeroSerie: form.numeroSerie,
        fallaReportada: form.fallaReportada,
        diagnostico: form.diagnostico,
        tecnicoNombre: form.tecnicoNombre,
        estado: 'recibido',
        fechaRecibido: Timestamp.now(),
        fechaPrometida: form.fechaPrometida ? Timestamp.fromDate(new Date(form.fechaPrometida)) : null,
        costoReparacion: form.costoReparacion ? parseFloat(form.costoReparacion) : null,
        createdAt: Timestamp.now(),
      });
      toast.success('Equipo registrado');
      setShowModal(false);
      setForm({ clienteNombre: '', clienteTelefono: '', equipoTipo: '', equipoMarca: '', numeroSerie: '', fallaReportada: '', diagnostico: '', tecnicoNombre: '', fechaPrometida: '', costoReparacion: '' });
    } catch {
      toast.error('Error al registrar');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeEstado = async (equipo: EquipoVinculado, nuevoEstado: EquipoVinculado['estado']) => {
    if (!puedeGestionar) { toast.error('No tienes permiso para gestionar equipos.'); return; }
    const motivo = nuevoEstado === 'descartado' ? window.prompt('Motivo por el que no se pudo reparar:') : '';
    if (motivo === null) return;
    try { await cambiarEstadoTaller(equipo.id, nuevoEstado, motivo); toast.success('Estado actualizado'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Error al actualizar'); }
  };
  const handleNotificarCliente = async (equipo: EquipoVinculado) => {
    try { navigate(await abrirChatVinculado(equipo.clienteId)); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo abrir el chat'); }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando equipos..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Equipos en Taller</h1>
          <p className="text-gray-500 text-sm">{enTaller} en taller</p>
        </div>
        <button disabled={!puedeGestionar} onClick={() => { setRecepcionId(crypto.randomUUID()); setShowModal(true); }}
          className="flex items-center gap-2 bg-primary hover:bg-primary-medium text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={18} /> Recibir Equipo
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFiltroEstado('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!filtroEstado ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Todos</button>
        {(Object.keys(ESTADO_LABELS) as EquipoVinculado['estado'][]).map(e => (
          <button key={e} onClick={() => setFiltroEstado(e)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtroEstado === e ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{ESTADO_LABELS[e]}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Package size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400">Sin equipos en esta categoría</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">S/N</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Cliente</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Equipo</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Falla</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Técnico</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Estado</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Días</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">F. Prometida</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Costo</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(eq => {
                  const diasEnTaller = differenceInDays(new Date(), eq.fechaRecibido);
                  return (
                    <tr key={eq.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-sm font-medium">{eq.numeroSerie || 'N/A'}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium">{eq.clienteNombre}</p>
                        {eq.clienteTelefono && <p className="text-xs text-gray-500">{eq.clienteTelefono}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm">{eq.equipoTipo} · {eq.equipoMarca}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell max-w-[150px] truncate">{eq.fallaReportada}</td>
                      <td className="px-4 py-3 text-sm hidden lg:table-cell">{eq.tecnicoNombre || '—'}</td>
                      <td className="px-4 py-3">
                        <select disabled={!puedeGestionar} value={eq.estado} onChange={e => handleChangeEstado(eq, e.target.value as EquipoVinculado['estado'])}
                          className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${ESTADO_COLORS[eq.estado]}`}>
                          {(Object.keys(ESTADO_LABELS) as EquipoVinculado['estado'][]).map(e => (
                            <option key={e} value={e}>{ESTADO_LABELS[e]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`flex items-center gap-1 text-xs font-medium ${diasEnTaller > 14 ? 'text-red-600' : diasEnTaller > 7 ? 'text-yellow-600' : 'text-green-600'}`}>
                          <Clock size={10} /> {diasEnTaller}d
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">
                        {eq.fechaPrometida ? formatFechaCorta(eq.fechaPrometida) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium hidden lg:table-cell">
                        {eq.costoReparacion ? formatMoneda(eq.costoReparacion) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {!eq.ordenId && <select disabled={!puedeGestionar} aria-label={`Vincular orden de ${eq.clienteNombre}`} defaultValue="" className="border rounded p-1 text-xs max-w-40" onChange={async e => { try { await vincularEquipoOrden(eq.id, e.target.value); toast.success('Orden vinculada'); } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo vincular'); } }}><option value="" disabled>Vincular orden</option>{ordenes.map(o => <option key={o.id} value={o.id}>{o.numero} · {o.clienteNombre}</option>)}</select>}
                        {eq.ordenId && <button className="text-primary text-xs underline mr-2" onClick={() => navigate(`/admin/ordenes/${eq.ordenId}`)}>Abrir orden</button>}
                        {eq.motivoDescarte && <p className="text-xs text-red-700">{eq.motivoDescarte}</p>}
                        {eq.clienteId && (
                          <button onClick={() => handleNotificarCliente(eq)}
                            className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded-lg text-xs transition-colors"
                            title="Notificar cliente por WhatsApp">
                            <WhatsAppIcon filled={false} className="text-white" size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Recibir Equipo en Taller" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm">Orden del cliente *</label><select required value={ordenId} onChange={e => { setOrdenId(e.target.value); const o = ordenes.find(x => x.id === e.target.value); if (o) setForm(f => ({ ...f, clienteNombre: o.clienteNombre, clienteTelefono: o.clienteTelefono || '', equipoTipo: o.equipoTipo, equipoMarca: o.equipoMarca || '', tecnicoNombre: o.tecnicoNombre || '' })); }} className="w-full border rounded-lg p-2"><option value="">Seleccionar orden</option>{ordenes.map(o => <option key={o.id} value={o.id}>{o.numero} · {o.clienteNombre} · {o.equipoTipo}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
              <input type="text" readOnly value={form.clienteNombre} onChange={e => setForm(f => ({ ...f, clienteNombre: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono cliente</label>
              <input type="tel" readOnly value={form.clienteTelefono} onChange={e => setForm(f => ({ ...f, clienteTelefono: e.target.value }))}
                placeholder="8095551234"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo equipo *</label>
              <select value={form.equipoTipo} onChange={e => setForm(f => ({ ...f, equipoTipo: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium">
                <option value="">Seleccionar...</option>
                {tiposEquipo.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
              <input type="text" value={form.equipoMarca} onChange={e => setForm(f => ({ ...f, equipoMarca: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Número de serie *</label>
            <input type="text" value={form.numeroSerie} onChange={e => setForm(f => ({ ...f, numeroSerie: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Falla reportada</label>
            <textarea value={form.fallaReportada} onChange={e => setForm(f => ({ ...f, fallaReportada: e.target.value }))} rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
              <input type="text" value={form.tecnicoNombre} onChange={e => setForm(f => ({ ...f, tecnicoNombre: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha prometida</label>
              <input type="date" value={form.fechaPrometida} onChange={e => setForm(f => ({ ...f, fechaPrometida: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Costo est. (RD$)</label>
              <input type="number" value={form.costoReparacion} onChange={e => setForm(f => ({ ...f, costoReparacion: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : 'Registrar Equipo'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
