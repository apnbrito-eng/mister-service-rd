import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Calendario, DiaSemana } from '../types';
import Logo from '../components/Logo';
import LoadingSpinner from '../components/LoadingSpinner';
import MiniMapaCliente from '../components/ordenes/MiniMapaCliente';
import { MapPin, Check, ChevronLeft, ChevronRight, Calendar as CalendarIcon, User, Phone, Mail, Wrench, AlertCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isBefore, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { normalizarTelefono } from '../services/clientes.service';

const DIA_NOMBRE: Record<number, DiaSemana> = {
  0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado',
};

const TIPOS_EQUIPO = ['Lavadora', 'Secadora', 'Nevera', 'Estufa', 'Aire Acondicionado', 'Otro'];

export default function CitaPublica() {
  const { calendarId } = useParams<{ calendarId: string }>();
  const [loading, setLoading] = useState(true);
  const [calendario, setCalendario] = useState<Calendario | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedHora, setSelectedHora] = useState<string>('');

  const [form, setForm] = useState({
    nombre: '',
    telefono: '',
    email: '',
    direccion: '',
    lat: 0,
    lng: 0,
    equipoTipo: '',
    equipoMarca: '',
    falla: '',
  });

  const dirInputRefCita = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRefCita = useRef<any>(null);

  useEffect(() => {
    if (loading || !calendario) return;

    const initAC = () => {
      if (!dirInputRefCita.current || !window.google?.maps?.places) return;
      autocompleteRefCita.current = new window.google.maps.places.Autocomplete(
        dirInputRefCita.current,
        {
          componentRestrictions: { country: 'do' },
          fields: ['formatted_address', 'geometry', 'name'],
        }
      );
      autocompleteRefCita.current.addListener('place_changed', () => {
        const place = autocompleteRefCita.current.getPlace();
        if (!place.geometry) return;
        const nombre = place.name || '';
        const direccion = place.formatted_address || '';
        const textoFinal = nombre && !direccion.startsWith(nombre)
          ? `${nombre}, ${direccion}`
          : direccion;
        setForm(f => ({
          ...f,
          direccion: textoFinal,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        }));
        toast.success('\u{1F4CD} Ubicación capturada');
      });
    };

    if (window.google?.maps?.places) {
      initAC();
      return;
    }

    if (!document.getElementById('google-places-script')) {
      const script = document.createElement('script');
      script.id = 'google-places-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_KEY}&libraries=places&language=es`;
      script.async = true;
      script.defer = true;
      script.onload = initAC;
      document.head.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(interval);
          initAC();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [loading, calendario]);

  useEffect(() => {
    if (!calendarId) return;
    getDoc(doc(db, 'calendarios', calendarId)).then(snap => {
      if (snap.exists()) {
        const raw = snap.data();
        setCalendario({
          id: snap.id,
          nombre: raw.nombre || '',
          asignadoId: raw.asignadoId || '',
          asignadoNombre: raw.asignadoNombre || '',
          color: raw.color || '#2563EB',
          activo: raw.activo !== false,
          dias: raw.dias || [],
          horas: raw.horas || [],
          createdAt: raw.createdAt?.toDate?.() || new Date(),
        });
      }
      setLoading(false);
    });
  }, [calendarId]);

  // Calendar grid days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { locale: es });
    const calEnd = endOfWeek(monthEnd, { locale: es });
    const days: Date[] = [];
    let day = calStart;
    while (day <= calEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  const esDiaDisponible = (date: Date): boolean => {
    if (!calendario) return false;
    if (isBefore(startOfDay(date), startOfDay(new Date()))) return false;
    const diaNombre = DIA_NOMBRE[date.getDay()];
    return calendario.dias.includes(diaNombre);
  };

  const handleUbicacion = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalización no disponible');
      return;
    }
    setGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setForm(f => ({ ...f, lat: latitude, lng: longitude }));
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=es`,
            { headers: { 'Accept-Language': 'es' } }
          );
          const data = await res.json();
          if (data.display_name) {
            setForm(f => ({ ...f, direccion: data.display_name, lat: latitude, lng: longitude }));
            toast.success('Ubicación capturada');
          }
        } catch {
          toast.success('Coordenadas capturadas');
        } finally {
          setGeocoding(false);
        }
      },
      (err) => {
        setGeocoding(false);
        toast.error('No se pudo obtener la ubicación: ' + err.message);
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calendario) return;

    // Validations
    if (!form.nombre.trim()) { toast.error('Nombre es obligatorio'); return; }
    const telNorm = normalizarTelefono(form.telefono);
    if (telNorm.length !== 10) { toast.error('Teléfono debe tener 10 dígitos'); return; }
    if (!form.equipoTipo) { toast.error('Selecciona tipo de equipo'); return; }
    if (!form.falla.trim()) { toast.error('Describe la falla o servicio'); return; }
    if (!selectedDate) { toast.error('Selecciona una fecha'); return; }
    if (!selectedHora) { toast.error('Selecciona una hora'); return; }

    setSubmitting(true);
    try {
      const horario = `${format(selectedDate, "EEEE dd 'de' MMMM", { locale: es })} a las ${selectedHora}`;
      await addDoc(collection(db, 'citas_por_confirmar'), {
        clienteNombre: form.nombre.trim(),
        telefono: form.telefono,
        clienteEmail: form.email,
        clienteDireccion: form.direccion,
        clienteLat: form.lat || null,
        clienteLng: form.lng || null,
        servicio: `${form.equipoTipo}${form.equipoMarca ? ` ${form.equipoMarca}` : ''}`,
        falla: form.falla,
        horarioSolicitado: horario,
        fechaSolicitada: Timestamp.fromDate(selectedDate),
        horaSolicitada: selectedHora,
        calendarioId: calendario.id,
        calendarioNombre: calendario.nombre,
        asignadoId: calendario.asignadoId,
        asignadoNombre: calendario.asignadoNombre,
        origen: 'formulario_publico',
        estado: 'pendiente',
        createdAt: Timestamp.now(),
      });
      setSubmitted(true);
      toast.success('¡Solicitud enviada!');
    } catch (err) {
      console.error(err);
      toast.error('Error al enviar la solicitud');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando calendario..." />;

  if (!calendario) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <AlertCircle size={48} className="mx-auto text-red-400 mb-3" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Calendario no encontrado</h2>
          <p className="text-gray-600 text-sm">El enlace que utilizó no es válido.</p>
        </div>
      </div>
    );
  }

  if (!calendario.activo) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <AlertCircle size={48} className="mx-auto text-orange-400 mb-3" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Este calendario no está disponible.</h2>
          <p className="text-gray-600 text-sm">Por favor contáctenos por otro medio.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f3460] to-[#1a5fa8] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Solicitud recibida!</h2>
          <p className="text-gray-600 mb-4">Hemos recibido su solicitud de cita. Nos comunicaremos con usted para confirmar.</p>
          <div className="bg-blue-50 rounded-xl p-4 text-left text-sm">
            <p><strong>Fecha:</strong> {selectedDate && format(selectedDate, "EEEE dd 'de' MMMM", { locale: es })}</p>
            <p><strong>Hora:</strong> {selectedHora}</p>
            <p><strong>Servicio:</strong> {form.equipoTipo}</p>
          </div>
          <p className="text-xs text-gray-400 mt-6">Mister Service RD · Gracias por confiar en nosotros</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f4f8] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 text-center">
          <div className="flex justify-center mb-3">
            <Logo size="md" />
          </div>
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: calendario.color }} />
            <p className="text-sm text-gray-600">
              Agendando con: <span className="font-semibold text-gray-900">{calendario.nombre}</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* SECCIÓN 1: Sus Datos */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3 pb-2 border-b border-gray-100">
              Sus Datos
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre y Apellido *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input type="text" value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono *</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input type="tel" value={form.telefono}
                      onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                      placeholder="Ej: 8091234567"
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Correo Electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input type="email" value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Dirección del Servicio
                  <span className="ml-2 text-[10px] text-gray-400 font-normal">
                    (Busca en Google: Agora Mall, Plaza Central, etc.)
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    ref={dirInputRefCita}
                    type="text"
                    value={form.direccion}
                    onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                    placeholder="Escribe un lugar, dirección o usa GPS"
                    autoComplete="off"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                  <button type="button" onClick={handleUbicacion} disabled={geocoding}
                    className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs transition-colors disabled:opacity-60">
                    <MapPin size={14} /> {geocoding ? '...' : 'Mi ubicación'}
                  </button>
                </div>
                {form.lat !== 0 && (
                  <p className="text-xs text-green-600 mt-1">✓ Coordenadas capturadas</p>
                )}
                {form.lat !== 0 && form.lng !== 0 && (
                  <MiniMapaCliente lat={form.lat} lng={form.lng} direccion={form.direccion} />
                )}
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: Detalles del Servicio */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3 pb-2 border-b border-gray-100">
              Detalles del Servicio
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de Equipo *</label>
                  <div className="relative">
                    <Wrench className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <select value={form.equipoTipo}
                      onChange={e => setForm(f => ({ ...f, equipoTipo: e.target.value }))}
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                      <option value="">Seleccionar...</option>
                      {TIPOS_EQUIPO.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Marca</label>
                  <input type="text" value={form.equipoMarca}
                    onChange={e => setForm(f => ({ ...f, equipoMarca: e.target.value }))}
                    placeholder="LG, Samsung, Mabe..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Describa la falla o servicio *</label>
                <textarea value={form.falla}
                  onChange={e => setForm(f => ({ ...f, falla: e.target.value }))}
                  rows={3}
                  placeholder="Ej: La lavadora no centrifuga al finalizar el ciclo..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: Fecha y Hora */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3 pb-2 border-b border-gray-100">
              Fecha y Hora Deseada
            </h3>

            {/* Paso 1: Fecha */}
            <div className="mb-4">
              <p className="text-xs text-gray-600 mb-2">Paso 1 — Elige una fecha</p>
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <button type="button" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                    className="p-1 hover:bg-gray-200 rounded">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-semibold text-gray-900 capitalize">
                    {format(currentMonth, 'MMMM yyyy', { locale: es })}
                  </span>
                  <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    className="p-1 hover:bg-gray-200 rounded">
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                    <div key={d} className="text-center text-[10px] font-semibold text-gray-500">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((d, i) => {
                    const disponible = esDiaDisponible(d);
                    const isSelected = selectedDate && isSameDay(d, selectedDate);
                    const isCurrentMonth = isSameMonth(d, currentMonth);
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={!disponible}
                        onClick={() => { setSelectedDate(d); setSelectedHora(''); }}
                        className={`aspect-square rounded-lg text-xs font-medium transition-colors ${
                          isSelected
                            ? 'bg-[#0f3460] text-white'
                            : disponible
                              ? 'bg-white hover:bg-[#1a5fa8] hover:text-white text-gray-900'
                              : 'text-gray-300 cursor-not-allowed'
                        } ${!isCurrentMonth ? 'opacity-40' : ''}`}
                      >
                        {format(d, 'd')}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                  <CalendarIcon size={10} /> Días disponibles: {calendario.dias.join(', ')}
                </p>
              </div>
            </div>

            {/* Paso 2: Hora */}
            {selectedDate && (
              <div>
                <p className="text-xs text-gray-600 mb-2">Paso 2 — Elige una hora</p>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {calendario.horas.map(h => {
                    const selected = selectedHora === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setSelectedHora(h)}
                        className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                          selected
                            ? 'bg-[#0f3460] text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {h}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <button type="submit" disabled={submitting}
            className="w-full bg-[#0f3460] hover:bg-[#1a5fa8] text-white py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60">
            {submitting ? 'Enviando...' : 'Solicitar Cita'}
          </button>

          <p className="text-center text-xs text-gray-400">
            © Mister Service RD · Nos comunicaremos con usted para confirmar
          </p>
        </form>
      </div>
    </div>
  );
}
