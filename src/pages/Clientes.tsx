import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, addDoc, updateDoc, doc, Timestamp, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Cliente, OrdenServicio } from '../types';
import { formatFechaCorta, formatTelefono } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { Search, Plus, User, Phone, Mail, MapPin, Download, History, ChevronRight, Calendar, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Clientes() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [historialOrdenes, setHistorialOrdenes] = useState<OrdenServicio[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  const [form, setForm] = useState({
    nombre: '', telefono: '', email: '', direccion: '', lat: 0, lng: 0,
  });

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'clientes'), orderBy('createdAt', 'desc')),
      (snap) => {
        setClientes(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
        } as Cliente)));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedCliente) return;
    getDocs(query(
      collection(db, 'ordenes_servicio'),
      where('clienteId', '==', selectedCliente.id)
    )).then(snap => {
      const ordenes = snap.docs.map(d => ({
        id: d.id, ...d.data(),
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
        updatedAt: d.data().updatedAt?.toDate?.() || new Date(),
        fechaCita: d.data().fechaCita?.toDate?.() || null,
      } as OrdenServicio));
      // Ordenar client-side por fecha descendente (más recientes primero)
      ordenes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setHistorialOrdenes(ordenes);
    });
  }, [selectedCliente]);

  const filteredClientes = clientes.filter(c =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.telefono.includes(busqueda)
  );

  const geocodeDireccion = async (direccion: string) => {
    if (!direccion) return;
    setGeocoding(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion + ', Santo Domingo, República Dominicana')}&limit=1`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const data = await resp.json();
      if (data.length > 0) {
        setForm(f => ({ ...f, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }));
        toast.success('Ubicación encontrada');
      } else {
        toast.error('No se encontró la ubicación');
      }
    } catch {
      toast.error('Error al buscar ubicación');
    } finally {
      setGeocoding(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.telefono) {
      toast.error('Nombre y teléfono son requeridos');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'clientes'), {
        ...form,
        lat: form.lat || null,
        lng: form.lng || null,
        createdAt: Timestamp.now(),
      });
      toast.success('Cliente creado');
      setShowModal(false);
      setForm({ nombre: '', telefono: '', email: '', direccion: '', lat: 0, lng: 0 });
    } catch {
      toast.error('Error al crear cliente');
    } finally {
      setSaving(false);
    }
  };

  const exportCSV = () => {
    const headers = 'Nombre,Teléfono,Email,Dirección\n';
    const rows = clientes.map(c => `"${c.nombre}","${c.telefono}","${c.email || ''}","${c.direccion}"`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clientes_misterservice.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando clientes..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-[#0f3460]">Clientes</h1>
        <div className="flex gap-2">
          <button onClick={exportCSV}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Download size={16} /> CSV
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Plus size={18} /> Nuevo Cliente
          </button>
        </div>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Lista */}
        <div className="w-full lg:w-1/3 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Buscar por nombre o teléfono..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] bg-white" />
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden max-h-[70vh] overflow-y-auto">
            {filteredClientes.map(c => (
              <button key={c.id} onClick={() => setSelectedCliente(c)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                  selectedCliente?.id === c.id ? 'bg-blue-50 border-l-4 border-l-[#1a5fa8]' : ''
                }`}>
                <div className="w-8 h-8 bg-[#0f3460]/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <User size={14} className="text-[#0f3460]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.nombre}</p>
                  <p className="text-xs text-gray-500">{formatTelefono(c.telefono)}</p>
                </div>
                <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
              </button>
            ))}
            {filteredClientes.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">Sin resultados</div>
            )}
          </div>
        </div>

        {/* Detalle */}
        <div className="flex-1">
          {selectedCliente ? (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{selectedCliente.nombre}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone size={14} /> {formatTelefono(selectedCliente.telefono)}
                  </div>
                  {selectedCliente.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail size={14} /> {selectedCliente.email}
                    </div>
                  )}
                  {selectedCliente.direccion && (
                    <div className="flex items-start gap-2 text-sm text-gray-600 col-span-full">
                      <MapPin size={14} className="mt-0.5 flex-shrink-0" /> {selectedCliente.direccion}
                      {selectedCliente.lat && (
                        <span className="text-xs text-green-600 ml-2">(GPS guardado)</span>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-4">Cliente desde {formatFechaCorta(selectedCliente.createdAt)}</p>
              </div>

              {/* Historial */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <History size={16} className="text-[#1a5fa8]" />
                  <h3 className="font-semibold text-gray-900">Historial de Servicios</h3>
                  <span className="text-xs text-gray-500">({historialOrdenes.length})</span>
                </div>
                {historialOrdenes.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin servicios registrados</p>
                ) : (
                  <div className="space-y-2">
                    {historialOrdenes.map(o => (
                      <button
                        key={o.id}
                        onClick={() => navigate(`/admin/ordenes/${o.id}`)}
                        className="w-full text-left p-3 bg-gray-50 hover:bg-blue-50 hover:border-[#1a5fa8] border border-transparent rounded-lg transition-all group"
                      >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-semibold text-[#0f3460] group-hover:text-[#1a5fa8]">
                                {o.numero}
                              </span>
                              <span className="text-sm text-gray-700">·</span>
                              <span className="flex items-center gap-1 text-sm text-gray-700">
                                <Wrench size={12} />
                                {o.equipoTipo}{o.equipoMarca ? ` ${o.equipoMarca}` : ''}
                              </span>
                            </div>
                            {o.descripcionFalla && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-1">{o.descripcionFalla}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
                              {o.fechaCita && (
                                <span className="flex items-center gap-1">
                                  <Calendar size={10} />
                                  {formatFechaCorta(o.fechaCita)}
                                </span>
                              )}
                              {o.tecnicoNombre && (
                                <span>Técnico: {o.tecnicoNombre}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge fase={o.fase} />
                            <ChevronRight size={14} className="text-gray-300 group-hover:text-[#1a5fa8] transition-colors" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
              <User size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400">Selecciona un cliente para ver su detalle</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal nuevo cliente */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Nuevo Cliente">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
              <input type="tel" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
            <div className="flex gap-2">
              <input type="text" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                placeholder="Av. Winston Churchill, Santo Domingo"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
              <button type="button" onClick={() => geocodeDireccion(form.direccion)} disabled={geocoding}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors flex items-center gap-1 disabled:opacity-50">
                <MapPin size={14} /> {geocoding ? '...' : 'GPS'}
              </button>
            </div>
            {form.lat !== 0 && (
              <p className="text-xs text-green-600 mt-1">Coordenadas: {form.lat.toFixed(4)}, {form.lng.toFixed(4)}</p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : 'Crear Cliente'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
