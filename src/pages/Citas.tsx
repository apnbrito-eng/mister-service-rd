import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, Timestamp, getDocs, query, orderBy, where, limit } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { CitaPorConfirmar, OrdenServicio, GarantiaOrigen } from '../types';
import { tiempoTranscurrido, whatsappLink, HORARIOS, HORARIOS_LABEL, parseOrden, formatFechaCorta, formatMoneda, labelTipoMotor } from '../utils';
import { useTiposEquipo } from '../hooks/useTiposEquipo';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import MiniMapaCliente from '../components/ordenes/MiniMapaCliente';
import OrdenCreateModal from '../components/ordenes/OrdenCreateModal';
import FotoEquipoDisplay from '../components/shared/FotoEquipoDisplay';
import { useOrdenCreateForm } from '../hooks/useOrdenCreateForm';
import { Phone, Clock, Check, X, Plus, AlertTriangle, MapPin, Camera, Wrench, Shield } from 'lucide-react';
import WhatsAppIcon from '../components/icons/WhatsAppIcon';
import { differenceInMinutes, format } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';

const MARCAS_SUGERIDAS = ['LG', 'Samsung', 'Mabe', 'Whirlpool', 'GE', 'Frigidaire'];

export default function Citas() {
  const { userProfile, currentUser } = useApp();
  const tiposEquipo = useTiposEquipo();
  const [loading, setLoading] = useState(true);
  const [citas, setCitas] = useState<CitaPorConfirmar[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showAgendarModal, setShowAgendarModal] = useState(false);
  const [selectedCita, setSelectedCita] = useState<CitaPorConfirmar | null>(null);
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
    // SPRINT-183 (2026-05-18): notas/observaciones opcionales al registrar
    // cita desde oficina. Antes la secretaria tenía que abrir la orden
    // después y agregar las notas — friction innecesaria. Persiste a
    // `citas_por_confirmar.observaciones`.
    observaciones: '',
  });

  const [fotoEquipo, setFotoEquipo] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const dirInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRef = useRef<any>(null);

  const [saving, setSaving] = useState(false);

  // ─── Garantía: cambio de técnico ───
  const MOTIVOS_CAMBIO_TECNICO = [
    'Técnico original no disponible',
    'Técnico ya no trabaja aquí',
    'Cliente prefiere otro técnico',
    'Otro',
  ] as const;
  const [garantiaMotivo, setGarantiaMotivo] = useState<string>('');
  const [garantiaNotas, setGarantiaNotas] = useState<string>('');
  const [comisionMontoOriginal, setComisionMontoOriginal] = useState<number | null>(null);
  const [cargandoComisionOriginal, setCargandoComisionOriginal] = useState(false);
  const [comisionOriginalId, setComisionOriginalId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'citas_por_confirmar'), orderBy('createdAt', 'asc')),
      (snap) => {
        setCitas(snap.docs.map(d => {
          const raw = d.data();
          return {
            id: d.id,
            clienteNombre: raw.clienteNombre || '',
            telefono: raw.telefono || raw.clienteTelefono || '',
            servicio: raw.servicio || '',
            falla: raw.falla,
            horarioSolicitado: raw.horarioSolicitado,
            origen: raw.origen,
            ordenNumero: raw.ordenNumero,
            fotoEquipoUrl: raw.fotoEquipoUrl,
            clienteEmail: raw.clienteEmail,
            clienteDireccion: raw.clienteDireccion,
            clienteReferencia: raw.clienteReferencia,
            clienteSector: raw.clienteSector,
            clienteLat: typeof raw.clienteLat === 'number' ? raw.clienteLat : undefined,
            clienteLng: typeof raw.clienteLng === 'number' ? raw.clienteLng : undefined,
            equipoTipo: raw.equipoTipo,
            equipoMarca: raw.equipoMarca,
            equipoModelo: raw.equipoModelo,
            equipoTipoMotor: raw.equipoTipoMotor === 'torre' || raw.equipoTipoMotor === 'individual'
              ? raw.equipoTipoMotor
              : undefined,
            citaIdProvisional: typeof raw.citaIdProvisional === 'string' && raw.citaIdProvisional.length > 0
              ? raw.citaIdProvisional
              : undefined,
            comoNosConocio: typeof raw.comoNosConocio === 'string' && raw.comoNosConocio.length > 0
              ? raw.comoNosConocio
              : undefined,
            calendarioId: raw.calendarioId,
            calendarioNombre: raw.calendarioNombre,
            fechaSolicitada: raw.fechaSolicitada?.toDate?.() || undefined,
            horaSolicitada: raw.horaSolicitada,
            // Garantía
            tipo: raw.tipo,
            esGarantia: raw.esGarantia === true,
            referenciaFacturaId: raw.referenciaFacturaId,
            referenciaConduce: raw.referenciaConduce,
            referenciaOrdenId: raw.referenciaOrdenId,
            tecnicoOriginalUid: raw.tecnicoOriginalUid,
            tecnicoOriginalNombre: raw.tecnicoOriginalNombre,
            descripcionProblema: raw.descripcionProblema,
            origenGarantia: raw.origenGarantia as GarantiaOrigen | undefined,
            whatsappAsignado: raw.whatsappAsignado,
            whatsappAsignadoNombre: raw.whatsappAsignadoNombre,
            telefonoNormalizado:
              typeof raw.telefonoNormalizado === 'string' && raw.telefonoNormalizado.length > 0
                ? raw.telefonoNormalizado
                : undefined,
            camposPersonalizados:
              raw.camposPersonalizados &&
              typeof raw.camposPersonalizados === 'object' &&
              !Array.isArray(raw.camposPersonalizados)
                ? (raw.camposPersonalizados as Record<string, string>)
                : undefined,
            createdAt: raw.createdAt?.toDate?.() || new Date(),
          } as CitaPorConfirmar;
        }));
        setLoading(false);
      }
    );

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

  // ─── Garantía: cargar comisión original cuando el modal de agendar se abre con una cita de garantía ───
  useEffect(() => {
    if (!showAgendarModal || !selectedCita?.esGarantia || !selectedCita.referenciaOrdenId || !selectedCita.tecnicoOriginalUid) {
      setComisionMontoOriginal(null);
      setComisionOriginalId(null);
      return;
    }
    let cancelado = false;
    (async () => {
      setCargandoComisionOriginal(true);
      try {
        const q = query(
          collection(db, 'comisiones'),
          where('ordenId', '==', selectedCita.referenciaOrdenId),
          where('tecnicoId', '==', selectedCita.tecnicoOriginalUid),
          limit(1),
        );
        const snap = await getDocs(q);
        if (cancelado) return;
        if (snap.empty) {
          setComisionMontoOriginal(null);
          setComisionOriginalId(null);
        } else {
          const d = snap.docs[0];
          const data = d.data() as Record<string, unknown>;
          const monto = typeof data.comisionMonto === 'number' ? (data.comisionMonto as number) : 0;
          setComisionMontoOriginal(monto);
          setComisionOriginalId(d.id);
        }
      } catch (err) {
        console.warn('No se pudo cargar la comisión original de la garantía:', err);
        if (!cancelado) {
          setComisionMontoOriginal(null);
          setComisionOriginalId(null);
        }
      } finally {
        if (!cancelado) setCargandoComisionOriginal(false);
      }
    })();
    return () => { cancelado = true; };
  }, [showAgendarModal, selectedCita?.esGarantia, selectedCita?.referenciaOrdenId, selectedCita?.tecnicoOriginalUid]);

  // Reset garantía form al cerrar el modal
  useEffect(() => {
    if (!showAgendarModal) {
      setGarantiaMotivo('');
      setGarantiaNotas('');
    }
  }, [showAgendarModal]);

  // Hook compartido: maneja el form completo de Crear Orden cuando se abre el
  // modal "Confirmar y Agendar" con una cita pre-cargada. Incluye búsqueda /
  // creación de cliente, double-booking, auto-aprobación de mantenimiento, y
  // persiste la orden + metadatos de la cita pública. Después del addDoc
  // exitoso, ejecuta `onAfterCreate` que aplica garantía + borra la cita.
  const createForm = useOrdenCreateForm({
    ordenes,
    citaPreset: showAgendarModal ? selectedCita : null,
    // SPRINT-114: auth.uid para `responsableId` consistente con auth.uid.
    usuarioActual: { id: currentUser?.uid, nombre: userProfile?.nombre },
    onAfterCreate: async (nuevaOrdenId) => {
      if (!selectedCita) return;
      const ahoraTs = Timestamp.now();
      const tecnicoElegidoId = createForm.form.tecnicoId;
      const tecnicoElegidoNombre = createForm.form.tecnicoNombre;
      const cambioTecnicoGarantia = !!(
        selectedCita.esGarantia &&
        tecnicoElegidoId &&
        selectedCita.tecnicoOriginalUid &&
        tecnicoElegidoId !== selectedCita.tecnicoOriginalUid
      );

      // ─── Garantía Fase A (2026-05-25 SPRINT-GARANTIA-FLUJO-COMPLETO): ───
      // Cambio de modelo respecto a la lógica vieja (que aplicaba
      // `-comisionMontoOriginal` + `estaAnulada=true` al confirmar la cita).
      //
      // Reglas de Jorge (entrevista 2026-05-24):
      //   1. El técnico original CONSERVA su comisión original.
      //   2. El descuento es 10% del costo de PIEZAS de la re-reparación,
      //      NO el 100% de la comisión.
      //   3. El descuento se aplica al cerrar la NUEVA orden de garantía
      //      (donde se conoce `costoPiezasTotal`), no al confirmar la cita.
      //   4. Lo cubra él mismo u otro técnico, el descuento va al ORIGINAL
      //      siempre que haya gasto en piezas.
      //   5. Si otro técnico cubre, ese gana su comisión normal por el
      //      trabajo (flujo estándar de comisión cuando se factura).
      //   6. Si el mismo técnico cubre, no gana comisión adicional (la
      //      orden de garantía no genera comisión nueva en flujo estándar).
      //
      // Por eso este bloque ya NO toca la comisión original. Solo:
      //   - Actualiza la factura original con snapshot tecnico_original y
      //     marca `garantia.estado='reclamada'` + `ordenGarantiaId`.
      //   - Registra audit log `garantia_reabierta` para forensia.
      //
      // El descuento real se aplica en `CierreServicioWizard.tsx` vía
      // `aplicarDescuentoGarantiaPorPiezas` cuando el técnico cierra la
      // orden de garantía con piezas.
      let garantiaProcesadaOk = true;
      if (selectedCita.esGarantia) {
        // 1) Actualizar factura: snapshot del técnico original + ordenGarantiaId + estado reclamada
        if (selectedCita.referenciaFacturaId) {
          try {
            const facturaUpdate: Record<string, unknown> = {
              'garantia.ordenGarantiaId': nuevaOrdenId,
              'garantia.estado': 'reclamada',
            };
            if (selectedCita.tecnicoOriginalUid) facturaUpdate['garantia.tecnicoOriginalUid'] = selectedCita.tecnicoOriginalUid;
            if (selectedCita.tecnicoOriginalNombre) facturaUpdate['garantia.tecnicoOriginalNombre'] = selectedCita.tecnicoOriginalNombre;
            await updateDoc(doc(db, 'facturas', selectedCita.referenciaFacturaId), facturaUpdate);
          } catch (errFact) {
            console.error('No se pudo actualizar la factura referenciada:', errFact);
            toast.error('Error procesando garantía: factura no actualizada.');
            garantiaProcesadaOk = false;
          }
        }

        // 2) Audit log: garantia_reabierta (no crítico — el descuento real
        // se persiste en el audit `descuento_garantia_tecnico` cuando el
        // técnico cierra la orden de garantía con piezas).
        try {
          const auditPayload: Record<string, unknown> = {
            accion: 'garantia_reabierta',
            solicitanteUid: userProfile?.id || null,
            solicitanteNombre: userProfile?.nombre || null,
            objetivoTipo: 'orden',
            objetivoId: nuevaOrdenId,
            ordenIdReasignada: nuevaOrdenId,
            ordenIdOriginal: selectedCita.referenciaOrdenId || null,
            facturaId: selectedCita.referenciaFacturaId || null,
            conduceNumero: selectedCita.referenciaConduce || null,
            tecnicoOriginalUid: selectedCita.tecnicoOriginalUid || null,
            tecnicoOriginalNombre: selectedCita.tecnicoOriginalNombre || null,
            tecnicoNuevoUid: tecnicoElegidoId,
            tecnicoNuevoNombre: tecnicoElegidoNombre,
            cambioTecnico: cambioTecnicoGarantia,
            motivo: garantiaMotivo,
            notas: garantiaNotas.trim() || null,
            comisionOriginalId: comisionOriginalId || null,
            // Descuento real se aplicará al cerrar la orden de garantía.
            descuentoPendienteAlCierre: true,
            timestamp: ahoraTs,
          };
          await addDoc(collection(db, 'auditoria_admin'),
            Object.fromEntries(Object.entries(auditPayload).filter(([, v]) => v !== undefined)),
          );
        } catch (errAudit) {
          console.warn('Audit log garantia_reabierta falló:', errAudit);
          // No crítico — no marcamos garantiaProcesadaOk en false.
        }
      }

      if (garantiaProcesadaOk) {
        // Camino feliz: borrar la cita por confirmar (esto también limpia el
        // lock procesando=true, ya que el doc deja de existir).
        try {
          await deleteDoc(doc(db, 'citas_por_confirmar', selectedCita.id));
        } catch (errDel) {
          console.warn('No se pudo borrar la cita por confirmar:', errDel);
          toast.error('Orden creada, pero la cita no se eliminó. Bórrala manualmente.');
        }
      } else {
        // La orden ya está creada (no la rolleamos). La cita NO se borra para
        // que la coord pueda reintentar la lógica de garantía manualmente.
        // Liberamos el lock para que pueda volver a intentar confirmarla.
        toast.error('La cita NO fue eliminada porque la garantía no se procesó completamente. Revisa y vuelve a confirmar.');
        try {
          await updateDoc(doc(db, 'citas_por_confirmar', selectedCita.id), {
            procesando: false,
            procesandoPor: null,
            procesandoEn: null,
          });
        } catch (errUnlock) {
          console.warn('No se pudo unlockear la cita tras fallo de garantía:', errUnlock);
        }
      }

      setShowAgendarModal(false);
      setSelectedCita(null);
    },
  });

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
      observaciones: '',
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
      // SPRINT-183: persistir observaciones si la secretaria las cargó.
      if (form.observaciones.trim()) data.observaciones = form.observaciones.trim();

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


  const handleNoAgendar = async (cita: CitaPorConfirmar) => {
    if (!confirm('¿Seguro que deseas eliminar esta cita?')) return;
    try {
      await deleteDoc(doc(db, 'citas_por_confirmar', cita.id));
      toast.success('Cita eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  // ─── Garantía: derivados para el modal de agendar (basado en el técnico
  // seleccionado dentro del modal Crear Orden, que ahora vive en `createForm`) ───
  const esGarantiaConCambioTecnico = !!(
    selectedCita?.esGarantia &&
    createForm.form.tecnicoId &&
    selectedCita.tecnicoOriginalUid &&
    createForm.form.tecnicoId !== selectedCita.tecnicoOriginalUid
  );
  const motivoRequeridoIncompleto = esGarantiaConCambioTecnico && !garantiaMotivo;

  // Wrapper del submit: si es garantía con cambio de técnico exigimos motivo
  // antes de delegar al hook. El hook maneja el resto (validación, double-
  // booking, addDoc, etc.) y dispara `onAfterCreate` para la garantía + cita.
  const handleSubmitConGarantiaCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (esGarantiaConCambioTecnico && !garantiaMotivo) {
      toast.error('Selecciona un motivo para el cambio de técnico');
      return;
    }
    await createForm.handleSubmit(e);
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando citas..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Citas por Confirmar</h1>
          <p className="text-gray-500 text-sm">{citas.length} citas pendientes</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary hover:bg-primary-medium text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={18} />
          Registrar Cita
        </button>
      </div>

      {citas.length === 0 ? (
        // SPRINT-DISENO-D (2026-05-31): EmptyState reusable.
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <EmptyState
            icon={<Check size={48} className="text-green-400" />}
            titulo="Todo al día"
            descripcion="No hay citas pendientes de confirmación por ahora. Cuando un cliente agende desde la web, vas a verla acá."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {citas.map(cita => {
            const minutos = differenceInMinutes(new Date(), cita.createdAt);
            const esUrgente = minutos > 15;
            const esGarantia = cita.tipo === 'garantia' || cita.esGarantia === true;
            const borderClass = esGarantia
              ? 'border-amber-300 bg-amber-50/40'
              : esUrgente
                ? 'border-red-300 bg-red-50/50'
                : 'border-gray-100';
            return (
              <div
                key={cita.id}
                className={`bg-white rounded-2xl shadow-sm border-2 p-5 ${borderClass}`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{cita.clienteNombre}</h3>
                      {esGarantia && (
                        <span className="flex items-center gap-1 bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">
                          <Shield size={11} /> GARANTÍA
                        </span>
                      )}
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
                    {esGarantia && (
                      <div className="mt-1 mb-2 bg-amber-100/60 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900 space-y-0.5">
                        {cita.tecnicoOriginalNombre && (
                          <p><span className="font-semibold">Técnico original:</span> {cita.tecnicoOriginalNombre}</p>
                        )}
                        {cita.referenciaConduce && (
                          <p><span className="font-semibold">Conduce ref:</span> {cita.referenciaConduce}</p>
                        )}
                        {cita.descripcionProblema && (
                          <p><span className="font-semibold">Problema:</span> {cita.descripcionProblema}</p>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                      <Phone size={14} /> {cita.telefono}
                    </div>
                    <p className="text-sm text-gray-700 flex items-center gap-1">
                      <Wrench size={12} className="text-gray-400" />
                      {cita.equipoTipo || cita.servicio}
                      {cita.equipoMarca ? ` · ${cita.equipoMarca}` : ''}
                      {cita.equipoTipoMotor
                        ? ` · ${labelTipoMotor(cita.equipoTipoMotor)}`
                        : cita.equipoModelo
                          ? ` · ${cita.equipoModelo}`
                          : ''}
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
                      <div className="mt-2">
                        <FotoEquipoDisplay url={cita.fotoEquipoUrl} size="sm" />
                      </div>
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
                        setShowAgendarModal(true);
                      }}
                      className="flex items-center gap-1 bg-primary hover:bg-primary-medium text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
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
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">Cliente</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                  <input type="text" value={form.clienteNombre}
                    onChange={e => setForm(f => ({ ...f, clienteNombre: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono *</label>
                  <input type="tel" value={form.telefono}
                    onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                    placeholder="8091234567"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email (opcional)</label>
                  <input type="email" value={form.clienteEmail}
                    onChange={e => setForm(f => ({ ...f, clienteEmail: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Origen</label>
                  <select value={form.origen}
                    onChange={e => setForm(f => ({ ...f, origen: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium">
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
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
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
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
              </div>
            </div>
          </div>

          {/* Sección B — Equipo */}
          <div>
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">Equipo</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de equipo *</label>
                  <input type="text" list="cita-tipos-equipo" value={form.equipoTipo}
                    onChange={e => setForm(f => ({ ...f, equipoTipo: e.target.value }))}
                    placeholder="Lavadora, Nevera..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
                  <datalist id="cita-tipos-equipo">
                    {tiposEquipo.map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Marca</label>
                  <input type="text" list="cita-marcas" value={form.equipoMarca}
                    onChange={e => setForm(f => ({ ...f, equipoMarca: e.target.value }))}
                    placeholder="LG, Samsung, Mabe..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
                  <datalist id="cita-marcas">
                    {MARCAS_SUGERIDAS.map(m => <option key={m} value={m} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Modelo</label>
                  <input type="text" value={form.equipoModelo}
                    onChange={e => setForm(f => ({ ...f, equipoModelo: e.target.value }))}
                    placeholder="Modelo"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción de la falla *</label>
                <textarea rows={3} value={form.falla}
                  onChange={e => setForm(f => ({ ...f, falla: e.target.value }))}
                  placeholder="Ej: La lavadora no centrifuga al finalizar el ciclo..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
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
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">Fecha y hora solicitada</h3>
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
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
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
                          ? 'bg-primary-medium text-white border-primary-medium'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-primary-medium'
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

          {/* SPRINT-183 (2026-05-18) — Observaciones opcionales.
              Antes la secretaria tenía que abrir la orden después y agregar
              las notas. Persiste a `citas_por_confirmar.observaciones`. */}
          <div>
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">Observaciones (opcional)</h3>
            <textarea
              rows={2}
              value={form.observaciones}
              onChange={e => setForm(f => ({ ...f, observaciones: e.target.value.slice(0, 500) }))}
              placeholder="Notas internas: contexto del cliente, urgencia, preferencias, etc."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium resize-none"
            />
            <p className="text-[10px] text-gray-400 mt-1 text-right">{form.observaciones.length}/500</p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={() => { setShowModal(false); resetFormRegistrar(); }}
              className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : 'Registrar cita'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal "Confirmar y Agendar" — reusa el modal completo de Crear Orden
          de Servicio con `citaPreset`. Trae todos los datos pre-cargados desde
          la cita pública y permite editarlos antes de crear la orden. */}
      {showAgendarModal && selectedCita && (
        <OrdenCreateModal
          form={createForm.form}
          setForm={createForm.setForm}
          clienteBusqueda={createForm.clienteBusqueda}
          setClienteBusqueda={createForm.setClienteBusqueda}
          showClienteDropdown={createForm.showClienteDropdown}
          setShowClienteDropdown={createForm.setShowClienteDropdown}
          isNewCliente={createForm.isNewCliente}
          setIsNewCliente={createForm.setIsNewCliente}
          saving={createForm.saving || saving || motivoRequeridoIncompleto}
          clientes={createForm.clientes}
          clientesFiltrados={createForm.clientesFiltrados}
          tecnicos={createForm.tecnicos}
          horariosOcupadosCreate={createForm.horariosOcupadosCreate}
          ordenesActivasCliente={createForm.ordenesActivasCliente}
          buscandoTelefono={createForm.buscandoTelefono}
          showTelefonoDropdown={createForm.showTelefonoDropdown}
          setShowTelefonoDropdown={createForm.setShowTelefonoDropdown}
          clientesFiltradosTelefono={createForm.clientesFiltradosTelefono}
          onSubmit={handleSubmitConGarantiaCheck}
          onClose={() => { setShowAgendarModal(false); setSelectedCita(null); createForm.resetForm(); }}
          handleDireccionChange={createForm.handleDireccionChange}
          handleSelectCliente={createForm.handleSelectCliente}
          handleClienteTelefonoChange={createForm.handleClienteTelefonoChange}
          citaPreset={selectedCita}
          chequeoPrevio={createForm.chequeoPrevioCreate}
          aplicarDescuento={createForm.aplicarDescuentoCreate}
          setAplicarDescuento={createForm.setAplicarDescuentoCreate}
          extraFooterSlot={
            esGarantiaConCambioTecnico ? (
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-red-700" />
                  <span className="text-sm font-bold text-red-800">ADVERTENCIA: Cambio de técnico</span>
                </div>
                <div className="text-xs text-red-900 space-y-1">
                  <p><span className="font-semibold">Técnico original:</span> {selectedCita?.tecnicoOriginalNombre || '—'}</p>
                  <p><span className="font-semibold">Técnico nuevo:</span> {createForm.form.tecnicoNombre || '—'}</p>
                </div>
                <div className="bg-white border border-red-200 rounded-lg p-3 text-xs text-red-900">
                  <p>
                    Al cerrar la orden de garantía, se descontará el{' '}
                    <span className="font-bold">10% del costo de piezas</span> a{' '}
                    <span className="font-semibold">{selectedCita?.tecnicoOriginalNombre || 'el técnico original'}</span>.
                    Conserva su comisión original.
                  </p>
                  <p className="text-xs text-red-700 mt-2">
                    Comisión original (referencia, no se anula):{' '}
                    {cargandoComisionOriginal
                      ? 'Cargando...'
                      : comisionMontoOriginal !== null
                        ? formatMoneda(comisionMontoOriginal)
                        : 'No registrada'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-red-900 mb-1">
                    Motivo del cambio <span className="text-red-700">*</span>
                  </label>
                  <div className="space-y-1">
                    {MOTIVOS_CAMBIO_TECNICO.map(m => (
                      <label key={m} className="flex items-center gap-2 text-xs text-red-900 cursor-pointer">
                        <input
                          type="radio"
                          name="garantia-motivo"
                          value={m}
                          checked={garantiaMotivo === m}
                          onChange={() => setGarantiaMotivo(m)}
                          className="accent-red-600"
                        />
                        {m}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-red-900 mb-1">
                    Notas adicionales (opcional)
                  </label>
                  <textarea
                    value={garantiaNotas}
                    onChange={e => setGarantiaNotas(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-red-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                    placeholder="Detalles del cambio..."
                  />
                </div>
              </div>
            ) : null
          }
        />
      )}
    </div>
  );
}
