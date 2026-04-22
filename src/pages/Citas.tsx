import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, Timestamp, getDocs, query, orderBy } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { CitaPorConfirmar, Personal, OrdenServicio } from '../types';
import { tiempoTranscurrido, TIPOS_EQUIPO, whatsappLink, HORARIOS, HORARIOS_LABEL, parseOrden, formatFechaCorta, esOrdenMantenimiento, formatMoneda, crearRegistroAuditoria } from '../utils';
import { buscarPrecioMantenimiento } from '../services/precios.service';
import { siguienteNumeroOrden } from '../services/contadores.service';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import MiniMapaCliente from '../components/ordenes/MiniMapaCliente';
import { Phone, Clock, Check, X, Plus, AlertTriangle, MapPin, Camera, Wrench } from 'lucide-react';
import WhatsAppIcon from '../components/icons/WhatsAppIcon';
import { differenceInMinutes, isSameDay, format } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';

const MARCAS_SUGERIDAS = ['LG', 'Samsung', 'Mabe', 'Whirlpool', 'GE', 'Frigidaire'];

export default function Citas() {
  const { userProfile } = useApp();
  const [loading, setLoading] = useState(true);
  const [citas, setCitas] = useState<CitaPorConfirmar[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showAgendarModal, setShowAgendarModal] = useState(false);
  const [selectedCita, setSelectedCita] = useState<CitaPorConfirmar | null>(null);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);

  const [form, setForm] = useState({
    clienteNombre: '',
    telefono: '',
    clienteEmail: '',
    clienteDireccion: '',
    clienteReferencia: '',
    clienteLat: undefined as number | undefined,
    clienteLng: undefined as number | undefined,
    equipoTipo: '',
    equipoMarca: '',
    equipoModelo: '',
    falla: '',
    fechaSolicitada: '',
    horaSolicitada: '',
    origen: 'WhatsApp',
  });

  const [fotoEquipo, setFotoEquipo] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const dirInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRef = useRef<any>(null);

  const [agendarForm, setAgendarForm] = useState({
    equipoTipo: '', equipoMarca: '', tecnicoId: '', tecnicoNombre: '',
    fechaCita: '', horaInicio: '', notas: '',
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'citas_por_confirmar'), orderBy('createdAt', 'asc')),
      (snap) => {
        setCitas(snap.docs.map(d => {
          const raw = d.data();
          return {
            id: d.id,
            clienteNombre: raw.clienteNombre || '',
            telefono: raw.telefono || '',
            servicio: raw.servicio || '',
            falla: raw.falla,
            horarioSolicitado: raw.horarioSolicitado,
            origen: raw.origen,
            ordenNumero: raw.ordenNumero,
            fotoEquipoUrl: raw.fotoEquipoUrl,
            clienteEmail: raw.clienteEmail,
            clienteDireccion: raw.clienteDireccion,
            clienteReferencia: raw.clienteReferencia,
            clienteLat: typeof raw.clienteLat === 'number' ? raw.clienteLat : undefined,
            clienteLng: typeof raw.clienteLng === 'number' ? raw.clienteLng : undefined,
            equipoTipo: raw.equipoTipo,
            equipoMarca: raw.equipoMarca,
            equipoModelo: raw.equipoModelo,
            calendarioId: raw.calendarioId,
            calendarioNombre: raw.calendarioNombre,
            fechaSolicitada: raw.fechaSolicitada?.toDate?.() || undefined,
            horaSolicitada: raw.horaSolicitada,
            createdAt: raw.createdAt?.toDate?.() || new Date(),
          } as CitaPorConfirmar;
        }));
        setLoading(false);
      }
    );

    getDocs(collection(db, 'personal')).then(snap => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
    });

    // Listener de órdenes para validar disponibilidad del técnico al agendar
    const unsubOrdenes = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      const data = snap.docs.map(d => parseOrden(d.id, d.data() as Record<string, unknown>));
      setOrdenes(data);
    });

    return () => {
      unsub();
      unsubOrdenes();
    };
  }, []);

  // Horarios ya tomados por el técnico seleccionado en la fecha de la cita
  const horariosOcupadosAgendar = useMemo(() => {
    if (!agendarForm.tecnicoId || !agendarForm.fechaCita) return [];
    const fechaSeleccionada = new Date(agendarForm.fechaCita + 'T00:00:00');
    return ordenes
      .filter(o =>
        !o.eliminada &&
        (o.tecnicoId === agendarForm.tecnicoId || o.tecnicoNombre === agendarForm.tecnicoNombre) &&
        o.fechaCita &&
        isSameDay(o.fechaCita, fechaSeleccionada) &&
        o.estado !== 'cancelado' &&
        o.estado !== 'cerrado'
      )
      .map(o => o.fechaCita ? format(o.fechaCita, 'HH:00') : '');
  }, [agendarForm.tecnicoId, agendarForm.tecnicoNombre, agendarForm.fechaCita, ordenes]);

  // Google Places Autocomplete en el campo de dirección
  useEffect(() => {
    if (!showModal) return;

    const initAC = () => {
      if (!dirInputRef.current || !window.google?.maps?.places) return;
      autocompleteRef.current = new window.google.maps.places.Autocomplete(
        dirInputRef.current,
        {
          componentRestrictions: { country: 'do' },
          fields: ['formatted_address', 'geometry', 'name'],
        }
      );
      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace();
        if (!place.geometry) return;
        const nombre = place.name || '';
        const direccion = place.formatted_address || '';
        const textoFinal = nombre && !direccion.startsWith(nombre)
          ? `${nombre}, ${direccion}`
          : direccion;
        setForm(f => ({
          ...f,
          clienteDireccion: textoFinal,
          clienteLat: place.geometry.location.lat(),
          clienteLng: place.geometry.location.lng(),
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
  }, [showModal]);

  useEffect(() => {
    return () => {
      if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    };
  }, [fotoPreview]);

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    if (file) {
      setFotoEquipo(file);
      setFotoPreview(URL.createObjectURL(file));
    } else {
      setFotoEquipo(null);
      setFotoPreview(null);
    }
  };

  const handleQuitarFoto = () => {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoEquipo(null);
    setFotoPreview(null);
  };

  const handleMiUbicacion = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalización no disponible');
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=es`,
            { headers: { 'Accept-Language': 'es' } }
          );
          const data = await res.json();
          const raw = (data?.display_name || '').toString();
          const direccion = raw
            ? raw.split(',').slice(0, 3).join(',').trim()
            : '';
          setForm(f => ({
            ...f,
            clienteDireccion: direccion || f.clienteDireccion,
            clienteLat: latitude,
            clienteLng: longitude,
          }));
          toast.success('Ubicación capturada');
        } catch {
          setForm(f => ({ ...f, clienteLat: latitude, clienteLng: longitude }));
          toast.success('Coordenadas capturadas');
        } finally {
          setGeoLoading(false);
        }
      },
      (err) => {
        setGeoLoading(false);
        toast.error('No se pudo obtener la ubicación: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const resetFormRegistrar = () => {
    setForm({
      clienteNombre: '', telefono: '', clienteEmail: '', clienteDireccion: '',
      clienteReferencia: '', clienteLat: undefined, clienteLng: undefined,
      equipoTipo: '', equipoMarca: '', equipoModelo: '',
      falla: '', fechaSolicitada: '', horaSolicitada: '',
      origen: 'WhatsApp',
    });
    handleQuitarFoto();
  };

  const handleRegistrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clienteNombre || !form.telefono) {
      toast.error('Nombre y teléfono son requeridos');
      return;
    }
    if (!form.equipoTipo) {
      toast.error('Selecciona el tipo de equipo');
      return;
    }
    if (!form.falla.trim()) {
      toast.error('Describe la falla');
      return;
    }
    if (form.fechaSolicitada) {
      const dia = new Date(form.fechaSolicitada + 'T00:00:00').getDay();
      if (dia === 0) {
        toast.error('Los domingos no atendemos. Escoge otro día.');
        return;
      }
    }
    setSaving(true);
    try {
      // Subir foto si existe; si falla, continuar sin foto
      let fotoEquipoUrl: string | undefined;
      if (fotoEquipo) {
        try {
          const ts = Date.now();
          const slug = form.clienteNombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'cliente';
          const path = `citas_admin/${ts}_${slug}.jpg`;
          const ref = storageRef(storage, path);
          await uploadBytes(ref, fotoEquipo);
          fotoEquipoUrl = await getDownloadURL(ref);
        } catch (err) {
          console.error('Error subiendo foto del equipo:', err);
        }
      }

      const data: Record<string, unknown> = {
        clienteNombre: form.clienteNombre.trim(),
        telefono: form.telefono.trim(),
        servicio: `${form.equipoTipo}${form.equipoMarca ? ` ${form.equipoMarca}` : ''}`,
        falla: form.falla.trim(),
        equipoTipo: form.equipoTipo,
        origen: 'oficina',
        createdAt: Timestamp.now(),
      };
      if (form.clienteEmail) data.clienteEmail = form.clienteEmail.trim();
      if (form.clienteDireccion) data.clienteDireccion = form.clienteDireccion.trim();
      if (form.clienteReferencia) data.clienteReferencia = form.clienteReferencia.trim();
      if (typeof form.clienteLat === 'number') data.clienteLat = form.clienteLat;
      if (typeof form.clienteLng === 'number') data.clienteLng = form.clienteLng;
      if (form.equipoMarca) data.equipoMarca = form.equipoMarca.trim();
      if (form.equipoModelo) data.equipoModelo = form.equipoModelo.trim();
      if (form.fechaSolicitada) {
        data.fechaSolicitada = Timestamp.fromDate(new Date(form.fechaSolicitada + 'T00:00:00'));
      }
      if (form.horaSolicitada) {
        data.horaSolicitada = form.horaSolicitada;
        // Componer texto humano para retrocompatibilidad con citas viejas
        if (form.fechaSolicitada) {
          const fechaTxt = format(new Date(form.fechaSolicitada + 'T00:00:00'), "EEEE dd 'de' MMMM", { locale: es });
          data.horarioSolicitado = `${fechaTxt} a las ${HORARIOS_LABEL[form.horaSolicitada] || form.horaSolicitada}`;
        }
      }
      if (fotoEquipoUrl) data.fotoEquipoUrl = fotoEquipoUrl;

      await addDoc(collection(db, 'citas_por_confirmar'), data);
      toast.success('Cita registrada. Pendiente de confirmación.');
      setShowModal(false);
      resetFormRegistrar();
    } catch (err) {
      console.error(err);
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
    // Validación defensiva: el horario puede haberse ocupado entre que se abrió el modal y este submit
    if (horariosOcupadosAgendar.includes(agendarForm.horaInicio)) {
      toast.error('Ese horario ya está ocupado por el técnico seleccionado');
      return;
    }
    setSaving(true);
    try {
      const numero = await siguienteNumeroOrden();
      const ahora = Timestamp.now();
      const fechaCitaTs = Timestamp.fromDate(
        new Date(`${agendarForm.fechaCita}T${agendarForm.horaInicio}:00`)
      );
      // Resolver operaria a partir del técnico escogido
      const tecnicoElegido = personal.find(p => p.id === agendarForm.tecnicoId);
      const ordenData: Record<string, unknown> = {
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
      };
      if (tecnicoElegido?.operariaId) ordenData.operariaId = tecnicoElegido.operariaId;
      if (tecnicoElegido?.operariaNombre) ordenData.operariaNombre = tecnicoElegido.operariaNombre;
      // Copiar datos del cliente capturados en el registro/formulario público (strip undefined)
      if (selectedCita.clienteEmail) ordenData.clienteEmail = selectedCita.clienteEmail;
      if (selectedCita.clienteDireccion) ordenData.clienteDireccion = selectedCita.clienteDireccion;
      if (selectedCita.clienteReferencia) ordenData.clienteReferencia = selectedCita.clienteReferencia;
      if (typeof selectedCita.clienteLat === 'number') ordenData.clienteLat = selectedCita.clienteLat;
      if (typeof selectedCita.clienteLng === 'number') ordenData.clienteLng = selectedCita.clienteLng;
      // Preferir modelo/marca original de la cita si no se editaron al agendar
      if (!ordenData.equipoMarca && selectedCita.equipoMarca) ordenData.equipoMarca = selectedCita.equipoMarca;
      if (selectedCita.equipoModelo) ordenData.equipoModelo = selectedCita.equipoModelo;
      if (selectedCita.fotoEquipoUrl) ordenData.fotoEquipoUrl = selectedCita.fotoEquipoUrl;
      // Auto-aprobar precio si es mantenimiento (Fase 4B)
      const descripcion = (selectedCita.falla || selectedCita.servicio || '');
      let precioMantPreaprobado: number | null = null;
      if (esOrdenMantenimiento(descripcion)) {
        const servicioMant = await buscarPrecioMantenimiento(agendarForm.equipoMarca, agendarForm.equipoTipo);
        if (servicioMant) {
          precioMantPreaprobado = servicioMant.precio;
          ordenData.precioSugerido = servicioMant.precio;
          ordenData.precioAprobado = servicioMant.precio;
          ordenData.precioFinal = servicioMant.precio;
          ordenData.estadoAprobacion = 'aprobado';
          ordenData.aprobadoPor = 'Sistema (catálogo de precios)';
          ordenData.fechaAprobacion = ahora;
          const reg = crearRegistroAuditoria(
            userProfile?.nombre || 'Sistema',
            'precio_sugerido',
            `Precio preaprobado automáticamente por ser mantenimiento (catálogo: ${servicioMant.nombre})`,
            'precioFinal', '', `RD$ ${servicioMant.precio.toLocaleString('es-DO')}`
          );
          // Insertar registro al inicio de la auditoría manteniendo historial
          ordenData.auditoria = [reg];
        }
      }

      await addDoc(collection(db, 'ordenes_servicio'), ordenData);
      if (precioMantPreaprobado !== null) {
        toast(`Mantenimiento detectado: precio preaprobado ${formatMoneda(precioMantPreaprobado)} según catálogo.`, {
          duration: 6000,
          style: { borderLeft: '4px solid #1a5fa8', background: '#eff6ff', color: '#0f3460' },
        });
      }
      await deleteDoc(doc(db, 'citas_por_confirmar', selectedCita.id));
      if (typeof selectedCita.clienteLat !== 'number' || typeof selectedCita.clienteLng !== 'number') {
        toast('Esta orden no tiene ubicación GPS. El técnico no podrá verla en el mapa. Puedes agregarla después desde la orden.', {
          duration: 4000,
          style: { borderLeft: '4px solid #f59e0b', background: '#fffbeb', color: '#92400e' },
        });
      }
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
                    <p className="text-sm text-gray-700 flex items-center gap-1">
                      <Wrench size={12} className="text-gray-400" />
                      {cita.equipoTipo || cita.servicio}
                      {cita.equipoMarca ? ` · ${cita.equipoMarca}` : ''}
                      {cita.equipoModelo ? ` · ${cita.equipoModelo}` : ''}
                    </p>
                    {cita.falla && <p className="text-xs text-gray-500 mt-0.5">Falla: {cita.falla}</p>}
                    {cita.clienteDireccion && (
                      <p className="text-xs text-gray-500 mt-0.5 flex items-start gap-1">
                        <MapPin size={11} className="text-gray-400 mt-0.5 shrink-0" />
                        <span>{cita.clienteDireccion}</span>
                      </p>
                    )}
                    {cita.fechaSolicitada && cita.horaSolicitada ? (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Solicita: {formatFechaCorta(cita.fechaSolicitada)} {HORARIOS_LABEL[cita.horaSolicitada] || cita.horaSolicitada}
                      </p>
                    ) : cita.horarioSolicitado ? (
                      <p className="text-xs text-gray-500">Horario: {cita.horarioSolicitado}</p>
                    ) : null}
                    {cita.fotoEquipoUrl && (
                      <a href={cita.fotoEquipoUrl} target="_blank" rel="noreferrer"
                        className="mt-2 inline-block">
                        <img src={cita.fotoEquipoUrl} alt="Foto del equipo"
                          className="w-24 h-24 object-cover rounded-lg border border-gray-200 hover:border-[#1a5fa8] transition-colors" />
                      </a>
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
                      <WhatsAppIcon filled={false} className="text-white" size={14} /> WhatsApp
                    </a>
                    <button
                      onClick={() => {
                        setSelectedCita(cita);
                        // Pre-poblar con los datos capturados al registrar
                        const fechaStr = cita.fechaSolicitada
                          ? format(cita.fechaSolicitada, 'yyyy-MM-dd')
                          : '';
                        setAgendarForm({
                          equipoTipo: cita.equipoTipo || '',
                          equipoMarca: cita.equipoMarca || '',
                          tecnicoId: '',
                          tecnicoNombre: '',
                          fechaCita: fechaStr,
                          horaInicio: cita.horaSolicitada || '',
                          notas: '',
                        });
                        setShowAgendarModal(true);
                      }}
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
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetFormRegistrar(); }}
        title="Registrar Nueva Cita"
        size="xl"
      >
        <form onSubmit={handleRegistrar} className="space-y-6">
          {/* Sección A — Cliente */}
          <div>
            <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3">Cliente</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                  <input type="text" value={form.clienteNombre}
                    onChange={e => setForm(f => ({ ...f, clienteNombre: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono *</label>
                  <input type="tel" value={form.telefono}
                    onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                    placeholder="8091234567"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email (opcional)</label>
                  <input type="email" value={form.clienteEmail}
                    onChange={e => setForm(f => ({ ...f, clienteEmail: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Origen</label>
                  <select value={form.origen}
                    onChange={e => setForm(f => ({ ...f, origen: e.target.value }))}
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
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Dirección
                  <span className="ml-2 text-[10px] text-gray-400 font-normal">
                    (Busca en Google: Agora Mall, Plaza Central, etc.)
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    ref={dirInputRef}
                    type="text"
                    value={form.clienteDireccion}
                    onChange={e => setForm(f => ({ ...f, clienteDireccion: e.target.value }))}
                    placeholder="Escribe un lugar, dirección o usa GPS"
                    autoComplete="off"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                  />
                  <button type="button" onClick={handleMiUbicacion} disabled={geoLoading}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shrink-0 disabled:opacity-50">
                    <MapPin size={12} />
                    {geoLoading ? 'Obteniendo...' : 'Mi ubicación'}
                  </button>
                </div>
                {form.clienteLat !== undefined && form.clienteLng !== undefined && (
                  <MiniMapaCliente
                    lat={form.clienteLat}
                    lng={form.clienteLng}
                    direccion={form.clienteDireccion}
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Referencia de dirección</label>
                <input type="text" value={form.clienteReferencia}
                  onChange={e => setForm(f => ({ ...f, clienteReferencia: e.target.value }))}
                  placeholder="Al lado del colmado, frente al parque..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
              </div>
            </div>
          </div>

          {/* Sección B — Equipo */}
          <div>
            <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3">Equipo</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de equipo *</label>
                  <input type="text" list="cita-tipos-equipo" value={form.equipoTipo}
                    onChange={e => setForm(f => ({ ...f, equipoTipo: e.target.value }))}
                    placeholder="Lavadora, Nevera..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                  <datalist id="cita-tipos-equipo">
                    {TIPOS_EQUIPO.map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Marca</label>
                  <input type="text" list="cita-marcas" value={form.equipoMarca}
                    onChange={e => setForm(f => ({ ...f, equipoMarca: e.target.value }))}
                    placeholder="LG, Samsung, Mabe..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                  <datalist id="cita-marcas">
                    {MARCAS_SUGERIDAS.map(m => <option key={m} value={m} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Modelo</label>
                  <input type="text" value={form.equipoModelo}
                    onChange={e => setForm(f => ({ ...f, equipoModelo: e.target.value }))}
                    placeholder="Modelo"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción de la falla *</label>
                <textarea rows={3} value={form.falla}
                  onChange={e => setForm(f => ({ ...f, falla: e.target.value }))}
                  placeholder="Ej: La lavadora no centrifuga al finalizar el ciclo..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Foto del equipo (opcional)</label>
                {fotoPreview ? (
                  <div className="space-y-2">
                    <img src={fotoPreview} alt="Vista previa del equipo"
                      className="w-full max-w-xs rounded-lg border border-gray-200 object-cover" />
                    <button type="button" onClick={handleQuitarFoto}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                      <X size={12} /> Quitar foto
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer transition-colors">
                    <Camera size={14} />
                    Tomar o subir foto
                    <input type="file" accept="image/*" capture="environment"
                      onChange={handleFotoChange} className="hidden" />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Sección C — Fecha y hora solicitada */}
          <div>
            <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3">Fecha y hora solicitada</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha solicitada</label>
                <input type="date" value={form.fechaSolicitada}
                  onChange={e => {
                    const valor = e.target.value;
                    if (valor) {
                      const dia = new Date(valor + 'T00:00:00').getDay();
                      if (dia === 0) {
                        toast.error('Los domingos no atendemos. Escoge otro día.');
                        setForm(f => ({ ...f, fechaSolicitada: '' }));
                        return;
                      }
                    }
                    setForm(f => ({ ...f, fechaSolicitada: valor }));
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                <p className="text-[10px] text-gray-400 mt-1">Lunes a sábado (los domingos no atendemos).</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Hora solicitada</label>
                <div className="grid grid-cols-5 gap-1">
                  {HORARIOS.map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, horaSolicitada: h }))}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        form.horaSolicitada === h
                          ? 'bg-[#1a5fa8] text-white border-[#1a5fa8]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a5fa8]'
                      }`}
                    >
                      {HORARIOS_LABEL[h]}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Esta cita queda pendiente de confirmación por oficina.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={() => { setShowModal(false); resetFormRegistrar(); }}
              className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : 'Registrar cita'}
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
                {HORARIOS.map(h => {
                  const ocupado = horariosOcupadosAgendar.includes(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => !ocupado && setAgendarForm(f => ({ ...f, horaInicio: h }))}
                      disabled={ocupado}
                      title={ocupado ? 'Horario ocupado' : ''}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        ocupado
                          ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed line-through'
                          : agendarForm.horaInicio === h
                            ? 'bg-[#1a5fa8] text-white border-[#1a5fa8]'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a5fa8]'
                      }`}
                    >
                      {HORARIOS_LABEL[h]}
                    </button>
                  );
                })}
              </div>
              {agendarForm.tecnicoId && agendarForm.fechaCita && horariosOcupadosAgendar.length > 0 && (
                <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                  <AlertTriangle size={10} /> {horariosOcupadosAgendar.length} horario(s) ocupado(s) ese día
                </p>
              )}
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
