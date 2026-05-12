import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, Timestamp, query, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';
import { EquipoTaller, EstadoEquipo } from '../types';
import { formatFechaCorta, formatMoneda, whatsappLink } from '../utils';
import { useTiposEquipo } from '../hooks/useTiposEquipo';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Plus, Package, Clock } from 'lucide-react';
import WhatsAppIcon from '../components/icons/WhatsAppIcon';
import { differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

const ESTADO_LABELS: Record<EstadoEquipo, string> = {
  recibido: 'Recibido', en_diagnostico: 'En Diagnóstico', en_reparacion: 'En Reparación',
  en_standby: 'En Stand-by', listo: 'Listo', entregado: 'Entregado',
};
const ESTADO_COLORS: Record<EstadoEquipo, string> = {
  recibido: 'bg-gray-100 text-gray-700', en_diagnostico: 'bg-yellow-100 text-yellow-700',
  en_reparacion: 'bg-blue-100 text-blue-700', en_standby: 'bg-orange-100 text-orange-700',
  listo: 'bg-green-100 text-green-700', entregado: 'bg-emerald-100 text-emerald-700',
};

export default function EquiposTaller() {
  const tiposEquipo = useTiposEquipo();
  const [loading, setLoading] = useState(true);
  const [equipos, setEquipos] = useState<EquipoTaller[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    clienteNombre: '', clienteTelefono: '', equipoTipo: '', equipoMarca: '', numeroSerie: '',
    fallaReportada: '', diagnostico: '', tecnicoNombre: '', fechaPrometida: '', costoReparacion: '',
  });

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'equipos_taller'), orderBy('createdAt', 'desc')),
      (snap) => {
        setEquipos(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          fechaRecibido: d.data().fechaRecibido?.toDate?.() || new Date(),
          fechaPrometida: d.data().fechaPrometida?.toDate?.() || null,
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
        } as EquipoTaller)));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = filtroEstado ? equipos.filter(e => e.estado === filtroEstado) : equipos;
  const enTaller = equipos.filter(e => e.estado !== 'entregado').length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clienteNombre || !form.numeroSerie || !form.equipoTipo) {
      toast.error('Cliente, tipo y número de serie son requeridos');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'equipos_taller'), {
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

  // SPRINT-134-equipos: writeBatch atómico cuando hay mutación cross-collection
  // (equipos_taller + standby_piezas). El único caso cross-collection es la
  // transición a 'en_standby'. Los otros cambios de estado son single-collection
  // y mantienen el updateDoc directo. Sin batch, si la red corta entre el update
  // del equipo y el create del standby, queda un equipo "en standby" sin
  // registro de stand-by — operaria queda ciega al equipo bloqueado.
  const handleChangeEstado = async (equipo: EquipoTaller, nuevoEstado: EstadoEquipo) => {
    try {
      if (nuevoEstado === 'en_standby') {
        const batch = writeBatch(db);
        batch.update(doc(db, 'equipos_taller', equipo.id), { estado: nuevoEstado });
        const standbyRef = doc(collection(db, 'standby_piezas'));
        batch.set(standbyRef, {
          clienteNombre: equipo.clienteNombre, equipoTipo: equipo.equipoTipo,
          equipoMarca: equipo.equipoMarca, piezaFaltante: 'Pieza por definir',
          tecnicoNombre: equipo.tecnicoNombre || '', fechaInicio: Timestamp.now(),
          estado: 'buscando', notas: `Desde equipo taller S/N: ${equipo.numeroSerie}`,
          createdAt: Timestamp.now(),
        });
        await batch.commit();
        toast.success('Estado cambiado y registro stand-by creado');
      } else {
        await updateDoc(doc(db, 'equipos_taller', equipo.id), { estado: nuevoEstado });
        toast.success(`Estado: ${ESTADO_LABELS[nuevoEstado]}`);
      }
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const handleNotificarCliente = (equipo: EquipoTaller) => {
    const tel = equipo.clienteTelefono || '';
    if (!tel) { toast.error('El cliente no tiene teléfono registrado'); return; }
    const msg = `Hola ${equipo.clienteNombre}, le informamos que su ${equipo.equipoTipo} ${equipo.equipoMarca} (S/N: ${equipo.numeroSerie}) está listo para ser recogido. Mister Service RD.`;
    window.open(whatsappLink(tel, msg), '_blank');
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando equipos..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460]">Equipos en Taller</h1>
          <p className="text-gray-500 text-sm">{enTaller} en taller</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={18} /> Recibir Equipo
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFiltroEstado('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!filtroEstado ? 'bg-[#0f3460] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Todos</button>
        {(Object.keys(ESTADO_LABELS) as EstadoEquipo[]).map(e => (
          <button key={e} onClick={() => setFiltroEstado(e)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtroEstado === e ? 'bg-[#0f3460] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{ESTADO_LABELS[e]}</button>
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
                        <select value={eq.estado} onChange={e => handleChangeEstado(eq, e.target.value as EstadoEquipo)}
                          className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${ESTADO_COLORS[eq.estado]}`}>
                          {(Object.keys(ESTADO_LABELS) as EstadoEquipo[]).map(e => (
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
                        {eq.estado === 'listo' && eq.clienteTelefono && (
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
              <input type="text" value={form.clienteNombre} onChange={e => setForm(f => ({ ...f, clienteNombre: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono cliente</label>
              <input type="tel" value={form.clienteTelefono} onChange={e => setForm(f => ({ ...f, clienteTelefono: e.target.value }))}
                placeholder="8095551234"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo equipo *</label>
              <select value={form.equipoTipo} onChange={e => setForm(f => ({ ...f, equipoTipo: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                <option value="">Seleccionar...</option>
                {tiposEquipo.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
              <input type="text" value={form.equipoMarca} onChange={e => setForm(f => ({ ...f, equipoMarca: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Número de serie *</label>
            <input type="text" value={form.numeroSerie} onChange={e => setForm(f => ({ ...f, numeroSerie: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Falla reportada</label>
            <textarea value={form.fallaReportada} onChange={e => setForm(f => ({ ...f, fallaReportada: e.target.value }))} rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
              <input type="text" value={form.tecnicoNombre} onChange={e => setForm(f => ({ ...f, tecnicoNombre: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha prometida</label>
              <input type="date" value={form.fechaPrometida} onChange={e => setForm(f => ({ ...f, fechaPrometida: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Costo est. (RD$)</label>
              <input type="number" value={form.costoReparacion} onChange={e => setForm(f => ({ ...f, costoReparacion: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : 'Registrar Equipo'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
