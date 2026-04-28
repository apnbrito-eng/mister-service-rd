import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, addDoc, doc, setDoc, Timestamp, query, onSnapshot, orderBy,
  runTransaction, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { format, isSameDay } from 'date-fns';
import toast from 'react-hot-toast';

import { siguienteNumeroOrden } from '../services/contadores.service';
import {
  normalizarTelefono, buscarClientePorTelefono, crearOActualizarClienteDesdeCita,
} from '../services/clientes.service';
import { buscarPrecioMantenimiento } from '../services/precios.service';
import {
  Cliente, Personal, OrdenServicio, FaseOrden, EstadoOrdenSimple, CitaPorConfirmar,
} from '../types';
import {
  esOrdenMantenimiento, formatMoneda, crearRegistroAuditoria,
} from '../utils';

export interface CreateFormState {
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail: string;
  clienteDireccion: string;
  clienteReferencia: string;
  clienteLat: number | undefined;
  clienteLng: number | undefined;
  equipoTipo: string;
  equipoMarca: string;
  equipoModelo: string;
  descripcionFalla: string;
  tecnicoId: string;
  tecnicoNombre: string;
  duracionMin: number;
  fechaCita: string;
  horaInicio: string;
}

const FORM_INICIAL: CreateFormState = {
  clienteId: '',
  clienteNombre: '',
  clienteTelefono: '',
  clienteEmail: '',
  clienteDireccion: '',
  clienteReferencia: '',
  clienteLat: undefined,
  clienteLng: undefined,
  equipoTipo: '',
  equipoMarca: '',
  equipoModelo: '',
  descripcionFalla: '',
  tecnicoId: '',
  tecnicoNombre: '',
  duracionMin: 60,
  fechaCita: '',
  horaInicio: '',
};

export interface UseOrdenCreateFormOptions {
  /**
   * Lista compartida de órdenes (para validar double-booking del técnico).
   * Si se omite, la validación queda sin comprobación cliente — el caller
   * puede pasar `[]`. El hook NO carga órdenes por sí mismo para evitar
   * duplicar listeners.
   */
  ordenes?: OrdenServicio[];
  /** Cita pública desde la que se pre-llenan los campos. */
  citaPreset?: CitaPorConfirmar | null;
  /** Usuario actual (para auditoría / responsable). */
  usuarioActual?: { id?: string; nombre?: string };
  /**
   * Callback que se ejecuta DESPUÉS de un addDoc exitoso de la orden, antes
   * del toast final. Útil para que `Citas.tsx` aplique la lógica de garantía
   * y borre la cita por confirmar. Si lanza error, se reporta pero la orden
   * ya fue creada (no se intenta rollback — la cita quedará huérfana y la
   * coord la verá igual en /admin/citas para reintentar).
   */
  onAfterCreate?: (ordenId: string, ordenNumero: string) => Promise<void> | void;
}

export interface UseOrdenCreateFormReturn {
  // Estado primario
  form: CreateFormState;
  setForm: React.Dispatch<React.SetStateAction<CreateFormState>>;
  // Cliente
  clientes: Cliente[];
  clienteBusqueda: string;
  setClienteBusqueda: (v: string) => void;
  showClienteDropdown: boolean;
  setShowClienteDropdown: (v: boolean) => void;
  clientesFiltrados: Cliente[];
  isNewCliente: boolean;
  setIsNewCliente: (v: boolean) => void;
  buscandoTelefono: boolean;
  showTelefonoDropdown: boolean;
  setShowTelefonoDropdown: (v: boolean) => void;
  clientesFiltradosTelefono: Cliente[];
  ordenesActivasCliente: OrdenServicio[];
  // Personal
  personal: Personal[];
  tecnicos: Personal[];
  // Programación
  horariosOcupadosCreate: string[];
  // Submit
  saving: boolean;
  // Handlers
  handleSelectCliente: (c: Cliente) => void;
  handleClienteTelefonoChange: (telefono: string) => void;
  handleDireccionChange: (datos: { direccion: string; lat?: number; lng?: number }) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  resetForm: () => void;
}

/**
 * Hook compartido entre Ordenes.tsx (Crear Orden manual) y Citas.tsx
 * (Confirmar y Agendar). Encapsula:
 *   - Estado del form y búsqueda de clientes (por nombre, por teléfono).
 *   - Detección de cliente existente al teclear teléfono (debounce 400ms).
 *   - Validación de double-booking del técnico.
 *   - Submit transaccional (counter atómico) + creación de cliente nuevo si
 *     aplica + auto-aprobación de mantenimiento desde catálogo.
 *
 * El submit NO borra la cita ni aplica lógica de garantía: para eso, el
 * caller pasa `onAfterCreate(ordenId, numero)` que recibe el id de la orden
 * recién creada y puede ejecutar postprocesos (deleteDoc cita, descuento
 * comisión técnico original, audits, etc.).
 */
export function useOrdenCreateForm(opts: UseOrdenCreateFormOptions = {}): UseOrdenCreateFormReturn {
  const { ordenes = [], citaPreset, usuarioActual, onAfterCreate } = opts;

  const [form, setForm] = useState<CreateFormState>(FORM_INICIAL);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [clienteBusqueda, setClienteBusqueda] = useState('');
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [isNewCliente, setIsNewCliente] = useState(false);
  const [buscandoTelefono, setBuscandoTelefono] = useState(false);
  const [showTelefonoDropdown, setShowTelefonoDropdown] = useState(false);
  const [ordenesActivasCliente, setOrdenesActivasCliente] = useState<OrdenServicio[]>([]);
  const [saving, setSaving] = useState(false);

  const telefonoSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presetAplicadoIdRef = useRef<string | null>(null);

  // Suscripción en tiempo real a clientes y personal. Usamos onSnapshot
  // (no getDocs) para que si se crea un cliente o se desactiva un técnico
  // en otro tab/sesión mientras este modal está abierto, el form lo refleje
  // sin necesidad de cerrar y volver a abrir. El cleanup desconecta los
  // listeners al desmontar el componente que usa el hook.
  // Nota: si la colección `clientes` crece a miles de documentos, evaluar
  // mover a un fetch puntual al montar + revalidación on-demand.
  useEffect(() => {
    const unsubClientes = onSnapshot(collection(db, 'clientes'), (snap) => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cliente)));
    });
    const unsubPersonal = onSnapshot(
      query(collection(db, 'personal'), orderBy('nombre')),
      (snap) => {
        setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
      },
    );
    return () => {
      unsubClientes();
      unsubPersonal();
    };
  }, []);

  // Aplicar citaPreset una sola vez por id (evita pisar ediciones del usuario)
  useEffect(() => {
    if (!citaPreset) {
      presetAplicadoIdRef.current = null;
      return;
    }
    if (presetAplicadoIdRef.current === citaPreset.id) return;
    presetAplicadoIdRef.current = citaPreset.id;

    const fechaStr = citaPreset.fechaSolicitada
      ? format(citaPreset.fechaSolicitada, 'yyyy-MM-dd')
      : '';
    setForm({
      clienteId: '',
      clienteNombre: citaPreset.clienteNombre || '',
      clienteTelefono: citaPreset.telefono || '',
      clienteEmail: citaPreset.clienteEmail || '',
      clienteDireccion: citaPreset.clienteDireccion || '',
      clienteReferencia: citaPreset.clienteReferencia || '',
      clienteLat: typeof citaPreset.clienteLat === 'number' ? citaPreset.clienteLat : undefined,
      clienteLng: typeof citaPreset.clienteLng === 'number' ? citaPreset.clienteLng : undefined,
      equipoTipo: citaPreset.equipoTipo || '',
      equipoMarca: citaPreset.equipoMarca || '',
      equipoModelo: citaPreset.equipoModelo || '',
      descripcionFalla: citaPreset.descripcionProblema || citaPreset.falla || citaPreset.servicio || '',
      tecnicoId: '',
      tecnicoNombre: '',
      duracionMin: 60,
      fechaCita: fechaStr,
      horaInicio: citaPreset.horaSolicitada || '',
    });
    // Mostramos el bloque de cliente directamente (sin obligar al usuario a
    // tocar "Crear nuevo cliente"). Si al teclear teléfono se detecta un
    // cliente existente, el handler lo cambiará automáticamente.
    setIsNewCliente(true);
    setClienteBusqueda('');
    setShowClienteDropdown(false);
    setShowTelefonoDropdown(false);
    setOrdenesActivasCliente([]);

    // Disparar búsqueda por teléfono (puede que ya exista)
    const tel = citaPreset.telefono || '';
    const telDigits = tel.replace(/\D/g, '');
    if (telDigits.length >= 10) {
      setBuscandoTelefono(true);
      buscarClientePorTelefono(tel).then(existente => {
        if (existente) {
          setForm(f => ({
            ...f,
            clienteId: existente.id,
            clienteNombre: existente.data.nombre || f.clienteNombre,
            clienteTelefono: existente.data.telefono || f.clienteTelefono,
            clienteEmail: existente.data.email || f.clienteEmail,
            // Preferimos la dirección de la cita (más reciente, captada en el
            // formulario público) sobre la del cliente existente.
            clienteDireccion: f.clienteDireccion || existente.data.direccion || '',
            clienteReferencia: f.clienteReferencia || existente.data.referenciaDireccion || '',
            clienteLat: typeof f.clienteLat === 'number' ? f.clienteLat : existente.data.lat,
            clienteLng: typeof f.clienteLng === 'number' ? f.clienteLng : existente.data.lng,
          }));
          setIsNewCliente(false);
          // Cargar órdenes activas del cliente
          // (filtramos contra `ordenes` cuando esté disponible — ver siguiente effect)
        }
      }).catch(err => {
        console.warn('Error buscando cliente por teléfono al aplicar cita:', err);
      }).finally(() => setBuscandoTelefono(false));
    }
  }, [citaPreset]);

  // Mantener `ordenesActivasCliente` sincronizado cuando cambia el cliente
  // seleccionado o la lista de órdenes (por listener externo del padre).
  useEffect(() => {
    if (!form.clienteId) {
      setOrdenesActivasCliente([]);
      return;
    }
    const activas = ordenes.filter(o =>
      o.clienteId === form.clienteId &&
      !['cerrado', 'cancelado'].includes(o.fase)
    );
    setOrdenesActivasCliente(activas);
  }, [form.clienteId, ordenes]);

  const tecnicos = useMemo(
    () => personal.filter(p => p.rol === 'tecnico' && p.activo),
    [personal],
  );

  const horariosOcupadosCreate = useMemo(() => {
    if (!form.tecnicoId || !form.fechaCita) return [];
    const fechaSeleccionada = new Date(form.fechaCita + 'T00:00:00');
    return ordenes
      .filter(o =>
        !o.eliminada &&
        (o.tecnicoId === form.tecnicoId || o.tecnicoNombre === form.tecnicoNombre) &&
        o.fechaCita &&
        isSameDay(o.fechaCita, fechaSeleccionada) &&
        o.estado !== 'cancelado' &&
        o.fase !== 'cerrado'
      )
      .map(o => o.fechaCita ? format(o.fechaCita, 'HH:00') : '');
  }, [form.tecnicoId, form.tecnicoNombre, form.fechaCita, ordenes]);

  const clientesFiltrados = useMemo(() => {
    if (!clienteBusqueda) return [];
    const searchDigits = clienteBusqueda.replace(/\D/g, '');
    const searchLower = clienteBusqueda.toLowerCase();
    return clientes.filter(c => {
      const cTelDigits = (c.telefono || '').replace(/\D/g, '');
      const cTelNorm = (c.telefonoNormalizado || '').replace(/\D/g, '');
      const matchNombre = c.nombre.toLowerCase().includes(searchLower);
      const matchTelefono = searchDigits.length >= 3 && (
        cTelDigits.includes(searchDigits) || cTelNorm.includes(searchDigits)
      );
      return matchNombre || matchTelefono;
    }).slice(0, 5);
  }, [clientes, clienteBusqueda]);

  const clientesFiltradosTelefono = useMemo(() => {
    const tel = form.clienteTelefono.replace(/\D/g, '');
    if (!tel || tel.length < 3) return [];
    return clientes.filter(c => {
      const cTel = (c.telefono || '').replace(/\D/g, '');
      const cTelNorm = (c.telefonoNormalizado || '').replace(/\D/g, '');
      return cTel.includes(tel) || cTelNorm.includes(tel);
    }).slice(0, 5);
  }, [clientes, form.clienteTelefono]);

  const handleSelectCliente = (c: Cliente) => {
    setForm(f => ({
      ...f,
      clienteId: c.id,
      clienteNombre: c.nombre,
      clienteTelefono: c.telefono,
      clienteEmail: c.email || '',
      clienteDireccion: c.direccion || '',
      clienteReferencia: c.referenciaDireccion || '',
      clienteLat: c.lat,
      clienteLng: c.lng,
    }));
    setClienteBusqueda(c.nombre);
    setShowClienteDropdown(false);
    setIsNewCliente(false);
  };

  const handleClienteTelefonoChange = (telefono: string) => {
    setForm(f => ({ ...f, clienteTelefono: telefono }));
    const digitos = telefono.replace(/\D/g, '');
    setShowTelefonoDropdown(digitos.length >= 3);

    if (form.clienteId) {
      setForm(f => ({ ...f, clienteId: '' }));
      setIsNewCliente(true);
    }

    if (telefonoSearchTimeout.current) {
      clearTimeout(telefonoSearchTimeout.current);
    }

    const telNorm = normalizarTelefono(telefono);
    if (telNorm.length < 10) return;

    setBuscandoTelefono(true);
    telefonoSearchTimeout.current = setTimeout(async () => {
      try {
        const existente = await buscarClientePorTelefono(telefono);
        if (existente) {
          setForm(f => ({
            ...f,
            clienteId: existente.id,
            clienteNombre: existente.data.nombre,
            clienteTelefono: existente.data.telefono,
            clienteEmail: existente.data.email || '',
            clienteDireccion: existente.data.direccion || '',
            clienteReferencia: existente.data.referenciaDireccion || '',
            clienteLat: existente.data.lat,
            clienteLng: existente.data.lng,
          }));
          setIsNewCliente(false);
          setShowTelefonoDropdown(false);
          toast.success(`Cliente existente: ${existente.data.nombre}`);
        }
      } catch (err) {
        console.error('Error buscando cliente por teléfono:', err);
      } finally {
        setBuscandoTelefono(false);
      }
    }, 400);
  };

  const handleDireccionChange = (datos: { direccion: string; lat?: number; lng?: number }) => {
    setForm(f => ({
      ...f,
      clienteDireccion: datos.direccion,
      // Solo reemplazar lat/lng si vienen del componente (places, GPS, URL).
      // Si el componente las omite (texto manual sin coords), conservamos las
      // que ya teníamos para no borrar la geolocalización al editar texto.
      clienteLat: typeof datos.lat === 'number' ? datos.lat : f.clienteLat,
      clienteLng: typeof datos.lng === 'number' ? datos.lng : f.clienteLng,
    }));
  };

  const resetForm = () => {
    setForm(FORM_INICIAL);
    setClienteBusqueda('');
    setShowClienteDropdown(false);
    setShowTelefonoDropdown(false);
    setIsNewCliente(false);
    setOrdenesActivasCliente([]);
    if (telefonoSearchTimeout.current) {
      clearTimeout(telefonoSearchTimeout.current);
      telefonoSearchTimeout.current = null;
    }
    presetAplicadoIdRef.current = null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clienteNombre || !form.equipoTipo || !form.descripcionFalla) {
      toast.error('Completa los campos requeridos: cliente, equipo y descripción');
      return;
    }
    // Si vino de cita, exigir fecha y hora (la cita pública siempre las tiene)
    if (citaPreset && (!form.fechaCita || !form.horaInicio)) {
      toast.error('Selecciona fecha y hora para la cita');
      return;
    }
    // Validación defensiva double-booking
    if (form.tecnicoId && form.fechaCita && form.horaInicio) {
      const fechaSel = new Date(form.fechaCita + 'T00:00:00');
      const ocupados = ordenes
        .filter(o =>
          !o.eliminada &&
          (o.tecnicoId === form.tecnicoId || o.tecnicoNombre === form.tecnicoNombre) &&
          o.fechaCita &&
          isSameDay(o.fechaCita, fechaSel) &&
          o.fase !== 'cerrado' &&
          o.fase !== 'cancelado'
        )
        .map(o => o.fechaCita ? format(o.fechaCita, 'HH:00') : '');
      if (ocupados.includes(form.horaInicio)) {
        toast.error('Ese horario ya está ocupado por el técnico seleccionado');
        return;
      }
    }
    setSaving(true);

    // ─── Lock transaccional anti doble-confirmación ───
    // Si esta llamada nace de confirmar una cita pública, marcamos la cita
    // como `procesando: true` ANTES de crear cualquier dato. Esto evita que
    // dos coordinadoras corriendo el flujo en paralelo creen dos órdenes
    // para la misma cita. Los flags son transitorios — al éxito, la cita se
    // borra (el `onAfterCreate` del caller hace `deleteDoc`); al fallo, los
    // limpiamos en el catch / finally para permitir reintentos.
    let citaLockeada = false;
    if (citaPreset) {
      const citaRef = doc(db, 'citas_por_confirmar', citaPreset.id);
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(citaRef);
          if (!snap.exists()) {
            throw new Error('CITA_NO_EXISTE');
          }
          const data = snap.data();
          if (data.procesando === true) {
            throw new Error('CITA_YA_PROCESANDO');
          }
          tx.update(citaRef, {
            procesando: true,
            procesandoPor: usuarioActual?.id || null,
            procesandoEn: serverTimestamp(),
          });
        });
        citaLockeada = true;
      } catch (errLock) {
        const msg = errLock instanceof Error ? errLock.message : '';
        if (msg === 'CITA_NO_EXISTE') {
          toast.error('Esta cita ya fue confirmada por otro coordinador');
        } else if (msg === 'CITA_YA_PROCESANDO') {
          toast.error('Otra persona está confirmando esta cita en este momento');
        } else {
          console.error('Error al lockear la cita:', errLock);
          toast.error('No se pudo iniciar la confirmación. Intenta de nuevo.');
        }
        setSaving(false);
        return;
      }
    }

    // Helper para liberar el lock si el flujo falla después del lock pero
    // antes del éxito final (deleteDoc cita). Si la cita ya fue borrada, el
    // updateDoc fallará silencioso — eso está OK.
    const unlockCitaSiLockeada = async () => {
      if (!citaLockeada || !citaPreset) return;
      try {
        await updateDoc(doc(db, 'citas_por_confirmar', citaPreset.id), {
          procesando: false,
          procesandoPor: null,
          procesandoEn: null,
        });
      } catch (unlockErr) {
        console.warn('No se pudo unlockear la cita:', unlockErr);
      }
    };

    try {
      let clienteId = form.clienteId;
      let clienteTelefonoFinal = form.clienteTelefono;
      let clienteCreadoFlag = false;
      let direccionAgregadaFlag = false;

      if (citaPreset) {
        // Flujo desde Cita pública: usamos el helper que crea cliente nuevo
        // o agrega dirección al existente.
        try {
          const res = await crearOActualizarClienteDesdeCita(
            // Pasamos la cita CON los campos editados por la coord en el modal
            // (nombre, dirección, etc.), no los originales — para reflejar
            // correcciones manuales.
            {
              ...citaPreset,
              clienteNombre: form.clienteNombre,
              telefono: form.clienteTelefono,
              clienteEmail: form.clienteEmail || undefined,
              clienteDireccion: form.clienteDireccion || undefined,
              clienteReferencia: form.clienteReferencia || undefined,
              clienteLat: form.clienteLat,
              clienteLng: form.clienteLng,
            },
            { uid: usuarioActual?.id, nombre: usuarioActual?.nombre || 'Sistema' },
          );
          clienteId = res.clienteId;
          clienteTelefonoFinal = form.clienteTelefono;
          clienteCreadoFlag = res.creado;
          direccionAgregadaFlag = res.direccionAgregada;
        } catch (errCli) {
          console.error('No se pudo crear/actualizar cliente desde cita:', errCli);
          toast.error('No se pudo procesar el cliente. Intenta de nuevo.');
          // Liberar lock para permitir reintento. NO seguimos: no creamos
          // órdenes huérfanas con `clienteId` vacío.
          await unlockCitaSiLockeada();
          setSaving(false);
          return;
        }
      } else if (isNewCliente && form.clienteNombre) {
        // Flujo manual de Crear Orden (Ordenes.tsx)
        const telNorm = normalizarTelefono(form.clienteTelefono);
        if (telNorm.length < 7) {
          toast.error('Teléfono inválido. Debe tener al menos 7 dígitos.');
          setSaving(false);
          return;
        }
        const existente = await buscarClientePorTelefono(form.clienteTelefono);
        if (existente) {
          clienteId = existente.id;
          clienteTelefonoFinal = existente.data.telefono || form.clienteTelefono;
          toast.success(`Cliente ya existía: ${existente.data.nombre}. Usando registro existente.`);
        } else {
          const clienteData: Record<string, unknown> = {
            nombre: form.clienteNombre,
            telefono: form.clienteTelefono,
            telefonoNormalizado: telNorm,
            direccion: form.clienteDireccion || '',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          };
          if (form.clienteEmail) clienteData.email = form.clienteEmail;
          if (form.clienteReferencia) clienteData.referenciaDireccion = form.clienteReferencia;
          if (form.clienteLat !== undefined) clienteData.lat = form.clienteLat;
          if (form.clienteLng !== undefined) clienteData.lng = form.clienteLng;
          await setDoc(doc(db, 'clientes', telNorm), clienteData);
          clienteId = telNorm;
          clienteCreadoFlag = true;
          // Reflejar en cache local para UI
          setClientes(prev => [...prev, {
            id: telNorm,
            nombre: form.clienteNombre,
            telefono: form.clienteTelefono,
            telefonoNormalizado: telNorm,
            email: form.clienteEmail,
            direccion: form.clienteDireccion,
            referenciaDireccion: form.clienteReferencia,
            lat: form.clienteLat,
            lng: form.clienteLng,
            createdAt: new Date(),
          } as Cliente]);
        }
      }

      // Construir fechaCita
      let fechaCitaTs: Timestamp | null = null;
      if (form.fechaCita && form.horaInicio) {
        fechaCitaTs = Timestamp.fromDate(new Date(`${form.fechaCita}T${form.horaInicio}:00`));
      } else if (form.fechaCita) {
        fechaCitaTs = Timestamp.fromDate(new Date(`${form.fechaCita}T08:00:00`));
      }

      const numero = await siguienteNumeroOrden();
      const ahora = Timestamp.now();
      const tecnicoElegido = personal.find(p => p.id === form.tecnicoId);
      const operariaIdDerivada = tecnicoElegido?.operariaId;
      const operariaNombreDerivada = tecnicoElegido?.operariaNombre;

      const faseInicial: FaseOrden = 'agendado';
      const estadoInicial: EstadoOrdenSimple = 'pendiente';

      const ordenData: Record<string, unknown> = {
        numero,
        clienteId,
        clienteNombre: form.clienteNombre,
        clienteTelefono: clienteTelefonoFinal,
        clienteDireccion: form.clienteDireccion,
        equipoTipo: form.equipoTipo,
        equipoMarca: form.equipoMarca,
        equipoModelo: form.equipoModelo || '',
        descripcionFalla: form.descripcionFalla,
        tecnicoId: form.tecnicoId,
        tecnicoNombre: form.tecnicoNombre,
        responsableId: usuarioActual?.id || '',
        responsableNombre: usuarioActual?.nombre || '',
        creadoPor: usuarioActual?.nombre || 'Sistema',
        fase: faseInicial,
        estadoSimple: estadoInicial,
        estado: 'activo',
        fechaCita: fechaCitaTs,
        duracionMin: form.duracionMin,
        reagendada: false,
        notas: '',
        historialFases: citaPreset
          ? [
              { fase: 'nuevo_lead', timestamp: Timestamp.fromDate(citaPreset.createdAt), usuario: 'Sistema' },
              { fase: faseInicial, timestamp: ahora, usuario: usuarioActual?.nombre || 'Sistema' },
            ]
          : [{
              fase: faseInicial,
              timestamp: ahora,
              usuario: usuarioActual?.nombre || 'Sistema',
            }],
        createdAt: citaPreset ? Timestamp.fromDate(citaPreset.createdAt) : ahora,
        updatedAt: ahora,
      };
      if (form.clienteEmail) ordenData.clienteEmail = form.clienteEmail;
      if (form.clienteReferencia) ordenData.clienteReferencia = form.clienteReferencia;
      if (form.clienteLat !== undefined) ordenData.clienteLat = form.clienteLat;
      if (form.clienteLng !== undefined) ordenData.clienteLng = form.clienteLng;
      if (operariaIdDerivada) ordenData.operariaId = operariaIdDerivada;
      if (operariaNombreDerivada) ordenData.operariaNombre = operariaNombreDerivada;

      // Campos de garantía heredados de la cita (si aplica)
      if (citaPreset?.esGarantia) {
        ordenData.esGarantia = true;
        if (citaPreset.tecnicoOriginalUid) ordenData.tecnicoOriginalUid = citaPreset.tecnicoOriginalUid;
        if (citaPreset.tecnicoOriginalNombre) ordenData.tecnicoOriginalNombre = citaPreset.tecnicoOriginalNombre;
        if (citaPreset.referenciaConduce) ordenData.referenciaConduce = citaPreset.referenciaConduce;
        if (citaPreset.referenciaFacturaId) ordenData.referenciaFacturaId = citaPreset.referenciaFacturaId;
        if (citaPreset.referenciaOrdenId) ordenData.referenciaOrdenId = citaPreset.referenciaOrdenId;
      }

      // Foto del equipo capturada en el form público (si la cita la tenía)
      if (citaPreset?.fotoEquipoUrl) ordenData.fotoEquipoUrl = citaPreset.fotoEquipoUrl;

      // Metadatos de origen del lead público
      if (citaPreset) {
        const meta: Record<string, unknown> = {};
        if (citaPreset.comoNosConocio) meta.comoNosConocio = citaPreset.comoNosConocio;
        if (citaPreset.camposPersonalizados && Object.keys(citaPreset.camposPersonalizados).length > 0) {
          meta.camposPersonalizados = citaPreset.camposPersonalizados;
        }
        if (citaPreset.whatsappAsignado) meta.whatsappAsignado = citaPreset.whatsappAsignado;
        if (citaPreset.whatsappAsignadoNombre) meta.whatsappAsignadoNombre = citaPreset.whatsappAsignadoNombre;
        meta.citaOrigenId = citaPreset.id;
        if (Object.keys(meta).length > 0) ordenData.metadatosCita = meta;
      }

      // Auto-aprobar si es mantenimiento
      let precioMantenimientoEncontrado: number | null = null;
      if (esOrdenMantenimiento(form.descripcionFalla)) {
        const servicioMant = await buscarPrecioMantenimiento(form.equipoMarca, form.equipoTipo);
        if (servicioMant) {
          precioMantenimientoEncontrado = servicioMant.precio;
          ordenData.precioSugerido = servicioMant.precio;
          ordenData.precioAprobado = servicioMant.precio;
          ordenData.precioFinal = servicioMant.precio;
          ordenData.estadoAprobacion = 'aprobado';
          ordenData.aprobadoPor = 'Sistema (catálogo de precios)';
          ordenData.fechaAprobacion = ahora;
          const reg = crearRegistroAuditoria(
            usuarioActual?.nombre || 'Sistema',
            'precio_sugerido',
            `Precio preaprobado automáticamente por ser mantenimiento (catálogo: ${servicioMant.nombre})`,
            'precioFinal', '', `RD$ ${servicioMant.precio.toLocaleString('es-DO')}`
          );
          ordenData.auditoria = [reg];
        }
      }

      // Strip undefined defensivo
      const ordenLimpia = Object.fromEntries(
        Object.entries(ordenData).filter(([, v]) => v !== undefined),
      );

      const nuevaRef = await addDoc(collection(db, 'ordenes_servicio'), ordenLimpia);

      if (precioMantenimientoEncontrado !== null) {
        toast(`Mantenimiento detectado: precio preaprobado ${formatMoneda(precioMantenimientoEncontrado)} según catálogo.`, {
          duration: 6000,
          style: { borderLeft: '4px solid #1a5fa8', background: '#eff6ff', color: '#0f3460' },
        });
      }
      if (form.clienteLat === undefined || form.clienteLng === undefined) {
        toast('Esta orden no tiene ubicación GPS. El técnico no podrá verla en el mapa. Puedes agregarla después desde la orden.', {
          duration: 4000,
          style: { borderLeft: '4px solid #f59e0b', background: '#fffbeb', color: '#92400e' },
        });
      }

      // Callback para postprocesos (garantía, deleteDoc cita, etc.).
      // Si falla, intentamos liberar el lock para que la coord pueda
      // reintentar — el caller (Citas.tsx) puede haber NO borrado la cita
      // a propósito (ej: garantía con descuento parcialmente fallido). En
      // ese caso queremos que la cita siga siendo confirmable.
      if (onAfterCreate) {
        try {
          await onAfterCreate(nuevaRef.id, numero);
        } catch (err) {
          console.error('onAfterCreate falló:', err);
          toast.error('Orden creada, pero falló un paso posterior. Revisa logs.');
          await unlockCitaSiLockeada();
        }
      }

      // Toast final con sufijo según contexto cliente
      const sufijoCliente = clienteCreadoFlag
        ? ' (cliente creado)'
        : direccionAgregadaFlag
          ? ' (dirección agregada al cliente)'
          : '';
      toast.success(`Orden ${numero} creada${citaPreset ? ' y agendada' : ''}${sufijoCliente}`);

      resetForm();
    } catch (err) {
      console.error(err);
      toast.error('Error al crear la orden');
      // Liberar el lock para permitir un nuevo intento.
      await unlockCitaSiLockeada();
    } finally {
      setSaving(false);
    }
  };

  return {
    form,
    setForm,
    clientes,
    clienteBusqueda,
    setClienteBusqueda,
    showClienteDropdown,
    setShowClienteDropdown,
    clientesFiltrados,
    isNewCliente,
    setIsNewCliente,
    buscandoTelefono,
    showTelefonoDropdown,
    setShowTelefonoDropdown,
    clientesFiltradosTelefono,
    ordenesActivasCliente,
    personal,
    tecnicos,
    horariosOcupadosCreate,
    saving,
    handleSelectCliente,
    handleClienteTelefonoChange,
    handleDireccionChange,
    handleSubmit,
    resetForm,
  };
}
