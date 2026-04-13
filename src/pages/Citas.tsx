import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, Timestamp, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { CitaPorConfirmar, Personal } from '../types';
import { tiempoTranscurrido, TIPOS_EQUIPO, whatsappLink, formatTelefono, HORARIOS, HORARIOS_LABEL } from '../utils';
import { siguienteNumeroOrden } from '../services/contadores.service';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Phone, Clock, MessageCircle, Check, X, Plus, AlertTriangle } from 'lucide-react';
import { differenceInMinutes } from 'date-fns';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';

export default function Citas() {
  const { userProfile } = useApp();
  const [loading, setLoading] = useState(true);
  const [citas, setCitas] = useState<CitaPorConfirmar[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showAgendarModal, setShowAgendarModal] = useState(false);
  const [selectedCita, setSelectedCita] = useState<CitaPorConfirmar | null>(null);
  const [personal, setPersonal] = useState<Personal[]>([]);

  const [form, setForm] = useState({
    clienteNombre: '', telefono: '', servicio: '', falla: '',
    horarioSolicitado: '', origen: 'WhatsApp',
  });

  const [agendarForm, setAgendarForm] = useState({
    equipoTipo: '', equipoMarca: '', tecnicoId: '', tecnicoNombre: '',
    fechaCita: '', horaInicio: '', notas: '',
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'citas_por_confirmar'), orderBy('createdAt', 'asc')),
      (snap) => {
        setCitas(snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
        } as CitaPorConfirmar)));
        setLoading(false);
      }
    );

    getDocs(collection(db, 'personal')).then(snap => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
    });

    return () => unsub();
  }, []);

  const handleRegistrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clienteNombre || !form.telefono) {
      toast.error('Nombre y teléfono son requeridos');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'citas_por_confirmar'), {
        ...form,
        createdAt: Timestamp.now(),
      });
      toast.success('Cita registrada');
      setShowModal(false);
      setForm({ clienteNombre: '', telefono: '', servicio: '', falla: '', horarioSolicitado: '', origen: 'WhatsApp' });
    } catch {
      toast.error('Error al registrar');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmarYAgendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCita || !agendarForm.equipoTipo || !agendarForm.fechaCita) {
      toast.error('Completa equipo y fecha');
      return;
    }
    if (!agendarForm.horaInicio) {
      toast.error('Selecciona una hora');
      return;
    }
    setSaving(true);
    try {
      const numero = await siguienteNumeroOrden();
      const ahora = Timestamp.now();
      const fechaCitaTs = Timestamp.fromDate(
        new Date(`${agendarForm.fechaCita}T${agendarForm.horaInicio}:00`)
      );
      await addDoc(collection(db, 'ordenes_servicio'), {
        numero,
        clienteId: '',
        clienteNombre: selectedCita.clienteNombre,
        clienteTelefono: selectedCita.telefono,
        equipoTipo: agendarForm.equipoTipo,
        equipoMarca: agendarForm.equipoMarca,
        descripcionFalla: selectedCita.falla || selectedCita.servicio,
        tecnicoId: agendarForm.tecnicoId,
        tecnicoNombre: agendarForm.tecnicoNombre,
        responsableId: userProfile?.id || '',
        fase: 'agendado',
        estadoSimple: 'pendiente',
        estado: 'activo',
        creadoPor: userProfile?.nombre || 'Sistema',
        fechaCita: fechaCitaTs,
        notas: agendarForm.notas,
        historialFases: [
          { fase: 'nuevo_lead', timestamp: Timestamp.fromDate(selectedCita.createdAt), usuario: 'Sistema' },
          { fase: 'agendado', timestamp: ahora, usuario: userProfile?.nombre || 'Sistema' },
        ],
        createdAt: Timestamp.fromDate(selectedCita.createdAt),
        updatedAt: ahora,
      });
      await deleteDoc(doc(db, 'citas_por_confirmar', selectedCita.id));
      toast.success(`Orden ${numero} creada y agendada`);
      setShowAgendarModal(false);
      setSelectedCita(null);
    } catch {
      toast.error('Error al agendar');
    } finally {
      setSaving(false);
    }
  };

  const handleNoAgendar = async (cita: CitaPorConfirmar) => {
    if (!confirm('¿Seguro que deseas eliminar esta cita?')) return;
    try {
      await deleteDoc(doc(db, 'citas_por_confirmar', cita.id));
      toast.success('Cita eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const tecnicos = personal.filter(p => p.rol === 'tecnico' && p.activo);

  if (loading) return <LoadingSpinner fullPage text="Cargando citas..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460]">Citas por Confirmar</h1>
          <p className="text-gray-500 text-sm">{citas.length} citas pendientes</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={18} />
          Registrar Cita
        </button>
      </div>

      {citas.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Check size={48} className="mx-auto text-green-400 mb-3" />
          <p className="text-gray-500">Sin citas pendientes de confirmación</p>
        </div>
      ) : (
        <div className="space-y-3">
          {citas.map(cita => {
            const minutos = differenceInMinutes(new Date(), cita.createdAt);
            const esUrgente = minutos > 15;
            return (
              <div
                key={cita.id}
                className={`bg-white rounded-2xl shadow-sm border-2 p-5 ${
                  esUrgente ? 'border-red-300 bg-red-50/50' : 'border-gray-100'
                }`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{cita.clienteNombre}</h3>
                      {esUrgente && (
                        <span className="flex items-center gap-1 bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
                          <AlertTriangle size={10} /> +{minutos} min
                        </span>
                      )}
                      {cita.origen && (
                        <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                          {cita.origen}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                      <Phone size={14} /> {cita.telefono}
                    </div>
                    <p className="text-sm text-gray-700">{cita.servicio}</p>
                    {cita.falla && <p className="text-xs text-gray-500 mt-0.5">Falla: {cita.falla}</p>}
                    {cita.horarioSolicitado && (
                      <p className="text-xs text-gray-500">Horario: {cita.horarioSolicitado}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Clock size={10} /> {tiempoTranscurrido(cita.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={whatsappLink(cita.telefono)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                    >
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                    <button
                      onClick={() => { setSelectedCita(cita); setShowAgendarModal(true); }}
                      className="flex items-center gap-1 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Check size={14} /> Confirmar
                    </button>
                    <button
                      onClick={() => handleNoAgendar(cita)}
                      className="flex items-center gap-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal registrar cita */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Registrar Nueva Cita">
        <form onSubmit={handleRegistrar} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del cliente *</label>
            <input type="text" value={form.clienteNombre} onChange={e => setForm(f => ({ ...f, clienteNombre: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
              <input type="tel" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Origen</label>
              <select value={form.origen} onChange={e => setForm(f => ({ ...f, origen: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                <option value="WhatsApp">WhatsApp</option>
                <option value="Llamada">Llamada</option>
                <option value="Instagram">Instagram</option>
                <option value="Referido">Referido</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Servicio requerido</label>
            <input type="text" value={form.servicio} onChange={e => setForm(f => ({ ...f, servicio: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Falla</label>
            <input type="text" value={form.falla} onChange={e => setForm(f => ({ ...f, falla: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Horario solicitado</label>
            <input type="text" value={form.horarioSolicitado} onChange={e => setForm(f => ({ ...f, horarioSolicitado: e.target.value }))}
              placeholder="Ej: Mañana a las 9 AM"
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

      {/* Modal agendar */}
      <Modal isOpen={showAgendarModal} onClose={() => { setShowAgendarModal(false); setSelectedCita(null); }} title="Confirmar y Agendar" size="lg">
        {selectedCita && (
          <form onSubmit={handleConfirmarYAgendar} className="space-y-4">
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-sm font-medium text-blue-900">{selectedCita.clienteNombre} · {selectedCita.telefono}</p>
              <p className="text-sm text-blue-700">{selectedCita.servicio}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de equipo *</label>
                <select value={agendarForm.equipoTipo} onChange={e => setAgendarForm(f => ({ ...f, equipoTipo: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                  <option value="">Seleccionar...</option>
                  {TIPOS_EQUIPO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                <input type="text" value={agendarForm.equipoMarca} onChange={e => setAgendarForm(f => ({ ...f, equipoMarca: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
                <select value={agendarForm.tecnicoId} onChange={e => {
                  const t = personal.find(p => p.id === e.target.value);
                  setAgendarForm(f => ({ ...f, tecnicoId: e.target.value, tecnicoNombre: t?.nombre || '' }));
                }} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                  <option value="">Sin asignar</option>
                  {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                <input type="date" value={agendarForm.fechaCita} onChange={e => setAgendarForm(f => ({ ...f, fechaCita: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hora de Inicio *</label>
              <div className="grid grid-cols-5 gap-1">
                {HORARIOS.map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setAgendarForm(f => ({ ...f, horaInicio: h }))}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      agendarForm.horaInicio === h
                        ? 'bg-[#1a5fa8] text-white border-[#1a5fa8]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a5fa8]'
                    }`}
                  >
                    {HORARIOS_LABEL[h]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
              <textarea value={agendarForm.notas} onChange={e => setAgendarForm(f => ({ ...f, notas: e.target.value }))} rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => { setShowAgendarModal(false); setSelectedCita(null); }}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button type="submit" disabled={saving}
                className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
                {saving ? 'Agendando...' : 'Confirmar y Agendar'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
