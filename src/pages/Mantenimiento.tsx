import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, Timestamp, getDocs, query, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Mantenimiento as MantenimientoType, Personal, Cliente } from '../types';
import { formatFechaCorta, generarTokenPortalCliente } from '../utils';
import { siguienteNumeroOrden } from '../services/contadores.service';
import { buscarClientePorTelefono, buscarOCrearCliente, normalizarTelefono } from '../services/clientes.service';
import { crearNotificacion } from '../services/notificaciones.service';
import { useTiposEquipo } from '../hooks/useTiposEquipo';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Plus, Calendar, Check, X, RefreshCw, Search } from 'lucide-react';
import { isBefore, addMonths } from 'date-fns';
import toast from 'react-hot-toast';

const FRECUENCIA_LABELS: Record<string, string> = {
  mensual: 'Mensual',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

interface FormState {
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail: string;
  clienteDireccion: string;
  clienteLat?: number;
  clienteLng?: number;
  equipoTipo: string;
  frecuencia: string;
  proximaFecha: string;
  /**
   * SPRINT-AGENDA-1 (2026-05-25) — guarda `auth.uid` del técnico
   * (NO `personal.id`). Coincide con la convención del resto del
   * sistema (P-006 + gotcha CLAUDE.md "tecnicoId, operariaId,
   * responsableId son auth.uid").
   */
  tecnicoId: string;
}

const FORM_INICIAL: FormState = {
  clienteId: '',
  clienteNombre: '',
  clienteTelefono: '',
  clienteEmail: '',
  clienteDireccion: '',
  clienteLat: undefined,
  clienteLng: undefined,
  equipoTipo: '',
  frecuencia: 'trimestral',
  proximaFecha: '',
  tecnicoId: '',
};

export default function Mantenimiento() {
  const tiposEquipo = useTiposEquipo();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MantenimientoType[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<FormState>(FORM_INICIAL);

  // SPRINT-AGENDA-1: typeahead de cliente + búsqueda por teléfono (reusa
  // los mismos patrones de `useOrdenCreateForm`).
  const [clienteBusqueda, setClienteBusqueda] = useState('');
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [isNewCliente, setIsNewCliente] = useState(false);
  const [buscandoTelefono, setBuscandoTelefono] = useState(false);
  const telefonoSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'mantenimiento'), orderBy('proximaFecha', 'asc')),
      (snap) => {
        setItems(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          proximaFecha: d.data().proximaFecha?.toDate?.() || new Date(),
        } as MantenimientoType)));
        setLoading(false);
      }
    );
    getDocs(collection(db, 'personal')).then(snap => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
    });
    // SPRINT-AGENDA-1: cargar clientes para typeahead. onSnapshot para
    // refrescar live (otro tab puede crear un cliente mientras el modal
    // está abierto). Filtra soft-deleted como hace `useOrdenCreateForm`.
    const unsubClientes = onSnapshot(collection(db, 'clientes'), (snap) => {
      setClientes(
        snap.docs
          .filter(d => d.data().eliminado !== true)
          .map(d => ({ id: d.id, ...d.data() } as Cliente)),
      );
    });
    return () => {
      unsub();
      unsubClientes();
    };
  }, []);

  // SPRINT-AGENDA-1: typeahead de cliente filtrado por nombre o teléfono.
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

  const handleSelectCliente = (c: Cliente) => {
    setForm(f => ({
      ...f,
      clienteId: c.id,
      clienteNombre: c.nombre,
      clienteTelefono: c.telefono,
      clienteEmail: c.email || '',
      clienteDireccion: c.direccion || '',
      clienteLat: c.lat,
      clienteLng: c.lng,
    }));
    setClienteBusqueda(c.nombre);
    setShowClienteDropdown(false);
    setIsNewCliente(false);
  };

  const handleClienteTelefonoChange = (telefono: string) => {
    setForm(f => ({ ...f, clienteTelefono: telefono }));
    if (form.clienteId) {
      // si tenía cliente seleccionado y cambia el teléfono, desliga.
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
            clienteLat: existente.data.lat,
            clienteLng: existente.data.lng,
          }));
          setIsNewCliente(false);
          toast.success(`Cliente existente: ${existente.data.nombre}`);
        }
      } catch (err) {
        console.error('Error buscando cliente por teléfono:', err);
      } finally {
        setBuscandoTelefono(false);
      }
    }, 400);
  };

  const resetForm = () => {
    setForm(FORM_INICIAL);
    setClienteBusqueda('');
    setShowClienteDropdown(false);
    setIsNewCliente(false);
    if (telefonoSearchTimeout.current) {
      clearTimeout(telefonoSearchTimeout.current);
      telefonoSearchTimeout.current = null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // SPRINT-AGENDA-1 (2026-05-25): un mantenimiento NO se crea sin
    // cliente real amarrado. Antes guardaba `clienteId: ''` y todo el
    // flujo aguas abajo (orden generada, histórico cliente, descuento
    // chequeo previo) quedaba huérfano. Causa raíz #1 del bucle de
    // bugs (auditoría FLUJO_DEPENDENCIAS 2026-05-25).
    if (!form.clienteNombre.trim()) {
      toast.error('Selecciona o crea un cliente real (nombre obligatorio)');
      return;
    }
    if (!form.clienteTelefono.trim()) {
      toast.error('Teléfono del cliente obligatorio (para amarrar el mantenimiento)');
      return;
    }
    const telNorm = normalizarTelefono(form.clienteTelefono);
    if (telNorm.length !== 10) {
      toast.error('Teléfono inválido. Debe ser un número RD de 10 dígitos.');
      return;
    }
    if (!form.proximaFecha) {
      toast.error('Fecha próxima requerida');
      return;
    }
    setSaving(true);
    try {
      // Resolver o crear el cliente. Si el form trae `clienteId` (vino del
      // typeahead o lookup por teléfono), `buscarOCrearCliente` lo deja
      // amarrado por teléfono normalizado (mismo id) — idempotente. Si no
      // existía, lo crea con los datos del modal.
      const clienteIdResuelto = await buscarOCrearCliente(form.clienteTelefono, {
        nombre: form.clienteNombre.trim(),
        email: form.clienteEmail.trim() || undefined,
        direccion: form.clienteDireccion.trim() || undefined,
        lat: typeof form.clienteLat === 'number' ? form.clienteLat : undefined,
        lng: typeof form.clienteLng === 'number' ? form.clienteLng : undefined,
      });

      // Persistir el mantenimiento amarrado al cliente real + denormalizados
      // (nombre/teléfono/dirección) para que la UI no haga lookup extra.
      // `tecnicoId` ya es `auth.uid` (P-006) — el dropdown usa `p.uid`.
      const payload: Record<string, unknown> = {
        clienteId: clienteIdResuelto,
        clienteNombre: form.clienteNombre.trim(),
        clienteTelefono: form.clienteTelefono,
        telefonoNormalizado: telNorm,
        clienteEmail: form.clienteEmail.trim() || '',
        clienteDireccion: form.clienteDireccion.trim() || '',
        equipoTipo: form.equipoTipo,
        frecuencia: form.frecuencia,
        proximaFecha: Timestamp.fromDate(new Date(form.proximaFecha)),
        tecnicoId: form.tecnicoId || '',
        activo: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      if (typeof form.clienteLat === 'number') payload.clienteLat = form.clienteLat;
      if (typeof form.clienteLng === 'number') payload.clienteLng = form.clienteLng;
      // strip undefined defensivo (Firestore los rechaza).
      const payloadLimpio = Object.fromEntries(
        Object.entries(payload).filter(([, v]) => v !== undefined),
      );
      await addDoc(collection(db, 'mantenimiento'), payloadLimpio);
      toast.success('Mantenimiento programado y amarrado al cliente');
      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error('Error programando mantenimiento:', err);
      toast.error(err instanceof Error ? err.message : 'Error al programar mantenimiento');
    } finally {
      setSaving(false);
    }
  };

  // SPRINT-134 (sub-sprint Mantenimiento, 2026-05-11): cross-collection
  // mantenimiento + ordenes_servicio envuelto en writeBatch para atomicidad.
  // `siguienteNumeroOrden()` ya es transaccional internamente (counter), por lo
  // que se invoca antes del batch (lectura/escritura aislada en su propia tx).
  // El batch garantiza: o se crea la orden Y se actualiza proximaFecha, o ninguna
  // de las dos. Si el batch falla, el número de orden ya consumido queda como
  // hueco numérico (mismo comportamiento que SPRINT-133 — counter no se revierte).
  //
  // SPRINT-AGENDA-1 (2026-05-25): la orden generada ahora HEREDA el cliente
  // real del mantenimiento (`clienteId` validado al alta) + denormaliza
  // teléfono/dirección/lat/lng para que entre en el histórico del cliente,
  // dispare el descuento de chequeo previo y figure en el mapa. Además
  // sincroniza `estadoSimple` + emite notificación `orden_asignada` igual
  // que `useOrdenCreateForm`. NO duplicamos lógica de selección de cliente
  // — eso vive en el modal de alta.
  const handleGenerarOrden = async (item: MantenimientoType) => {
    // Defense-in-depth: mantenimientos viejos (pre SPRINT-AGENDA-1) pueden
    // tener `clienteId: ''`. NO generamos orden huérfana — pedimos editar.
    if (!item.clienteId) {
      toast.error('Este mantenimiento no tiene cliente amarrado. Edítalo y asigna un cliente real antes de generar la orden.');
      return;
    }
    try {
      const numero = await siguienteNumeroOrden();
      const ahora = Timestamp.now();
      const meses = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 }[item.frecuencia] || 3;
      const nextDate = addMonths(item.proximaFecha, meses);

      // Resolver nombre del técnico desde el dropdown actual. `item.tecnicoId`
      // ya es `auth.uid` (SPRINT-AGENDA-1, P-006). Para mantenimientos
      // viejos creados pre-SPRINT puede ser `personal.id` — el filtro
      // `(p.uid || p.id) === tecnicoId` cubre ambos sin romper.
      const itemConCliente = item as MantenimientoType & {
        clienteTelefono?: string;
        clienteDireccion?: string;
        clienteEmail?: string;
        clienteLat?: number;
        clienteLng?: number;
        telefonoNormalizado?: string;
      };
      const tecnicoAsignado = item.tecnicoId
        ? personal.find(p => (p.uid || p.id) === item.tecnicoId)
        : undefined;
      const tecnicoNombre = tecnicoAsignado?.nombre || '';

      const batch = writeBatch(db);
      const ordenRef = doc(collection(db, 'ordenes_servicio'));
      const ordenPayload: Record<string, unknown> = {
        numero,
        clienteId: item.clienteId,
        clienteNombre: item.clienteNombre,
        clienteTelefono: itemConCliente.clienteTelefono || '',
        telefonoNormalizado: itemConCliente.telefonoNormalizado || (itemConCliente.clienteTelefono ? normalizarTelefono(itemConCliente.clienteTelefono) : ''),
        clienteEmail: itemConCliente.clienteEmail || '',
        clienteDireccion: itemConCliente.clienteDireccion || '',
        equipoTipo: item.equipoTipo,
        equipoMarca: '',
        descripcionFalla: `Mantenimiento programado (${FRECUENCIA_LABELS[item.frecuencia]})`,
        tecnicoId: item.tecnicoId || '',
        tecnicoNombre,
        responsableId: '',
        // SPRINT-AGENDA-1 (P-011): sincronizar fase + estado + estadoSimple
        // para que la orden entre en queries `where('estadoSimple', ...)` y
        // en el resto del flujo lifecycle igual que las creadas por el
        // camino canónico `useOrdenCreateForm`.
        fase: 'agendado',
        estado: 'activo',
        estadoSimple: 'agendado',
        fechaCita: Timestamp.fromDate(item.proximaFecha),
        notas: 'Generada automáticamente por mantenimiento programado',
        historialFases: [{ fase: 'agendado', timestamp: ahora, usuario: 'Sistema' }],
        // Portal del Cliente: orden nace en `agendado`, generar token.
        tokenPortalCliente: generarTokenPortalCliente(),
        createdAt: ahora,
        updatedAt: ahora,
      };
      if (typeof itemConCliente.clienteLat === 'number') ordenPayload.clienteLat = itemConCliente.clienteLat;
      if (typeof itemConCliente.clienteLng === 'number') ordenPayload.clienteLng = itemConCliente.clienteLng;
      const ordenLimpia = Object.fromEntries(
        Object.entries(ordenPayload).filter(([, v]) => v !== undefined),
      );
      batch.set(ordenRef, ordenLimpia);
      batch.update(doc(db, 'mantenimiento', item.id), {
        proximaFecha: Timestamp.fromDate(nextDate),
        updatedAt: ahora,
      });
      await batch.commit();

      toast.success(`Orden ${numero} creada`);

      // SPRINT-AGENDA-1: emitir notificación `orden_asignada` al técnico
      // asignado (best-effort, no rompe el flujo si falla). Patrón hermano
      // de `useOrdenCreateForm.handleSubmit`. NO notificamos a operaria
      // ni admins acá — el mantenimiento siempre lo dispara oficina y el
      // técnico es el actor que necesita enterarse.
      if (item.tecnicoId && tecnicoAsignado?.uid) {
        try {
          await crearNotificacion({
            userId: tecnicoAsignado.uid,
            tipo: 'orden_asignada',
            titulo: `Orden asignada · ${numero}`,
            mensaje: `Mantenimiento programado de ${item.clienteNombre} (${item.equipoTipo || 'equipo'}) para el ${formatFechaCorta(item.proximaFecha)}.`,
            ordenId: ordenRef.id,
            ordenNumero: numero,
          });
        } catch (notifErr) {
          console.warn('No se pudo notificar al técnico de orden_asignada (mantenimiento):', notifErr);
        }
      }
    } catch (err) {
      console.error('Error al generar orden de mantenimiento:', err);
      toast.error('Error al generar orden');
    }
  };

  const toggleActivo = async (item: MantenimientoType) => {
    await updateDoc(doc(db, 'mantenimiento', item.id), { activo: !item.activo });
    toast.success(item.activo ? 'Desactivado' : 'Activado');
  };

  // SPRINT-AGENDA-1 (P-006): filtramos técnicos que tengan `uid` para que el
  // dropdown guarde `auth.uid`, NO `personal.id`. Antes el código usaba
  // `t.id` ignorando el uid → mantenimientos creados quedaban con
  // `tecnicoId = personal docId` que no matchea agenda del técnico ni
  // rules `auth.uid == tecnicoId`. El comentario `@safe-tecnicoid-id`
  // anterior justificaba el uso por la rule de mantenimiento, pero la
  // ORDEN generada SÍ se gatea por uid en aguas abajo. Migramos a uid
  // para que toda la cadena (mantenimiento → orden → notificación) use
  // el mismo identificador. Filtramos `p.uid` para excluir empleados
  // sin Auth (alta vieja sin doble-doc — P-004 ya cubre futuras altas).
  const tecnicos = personal.filter(p => p.rol === 'tecnico' && p.activo && p.uid);

  if (loading) return <LoadingSpinner fullPage text="Cargando mantenimientos..." />;

  const vencidos = items.filter(i => i.activo && isBefore(i.proximaFecha, new Date()));
  const proximos = items.filter(i => i.activo && !isBefore(i.proximaFecha, new Date()));
  const inactivos = items.filter(i => !i.activo);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#0f3460]">Mantenimiento Programado</h1>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={18} /> Programar
        </button>
      </div>

      {/* Vencidos */}
      {vencidos.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-red-600 mb-2 uppercase">Vencidos ({vencidos.length})</h2>
          <div className="space-y-2">
            {vencidos.map(item => (
              <MantenimientoCard key={item.id} item={item} onGenerar={handleGenerarOrden} onToggle={toggleActivo} isVencido />
            ))}
          </div>
        </div>
      )}

      {/* Próximos */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-2 uppercase">Próximos ({proximos.length})</h2>
        {proximos.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-400 text-sm">
            Sin mantenimientos programados
          </div>
        ) : (
          <div className="space-y-2">
            {proximos.map(item => (
              <MantenimientoCard key={item.id} item={item} onGenerar={handleGenerarOrden} onToggle={toggleActivo} />
            ))}
          </div>
        )}
      </div>

      {inactivos.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 mb-2 uppercase">Inactivos ({inactivos.length})</h2>
          <div className="space-y-2">
            {inactivos.map(item => (
              <MantenimientoCard key={item.id} item={item} onGenerar={handleGenerarOrden} onToggle={toggleActivo} />
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); }} title="Programar Mantenimiento">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* SPRINT-AGENDA-1 (2026-05-25): typeahead de cliente + búsqueda
              por teléfono. Antes el modal solo pedía nombre como texto libre
              y guardaba `clienteId: ''` (causa raíz del bucle). Ahora se
              elige un cliente real (o se crea uno nuevo amarrado por
              teléfono normalizado). */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cliente * {form.clienteId && <span className="ml-2 text-emerald-600 text-xs">[amarrado: {form.clienteId.slice(0, 8)}…]</span>}
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={clienteBusqueda}
                placeholder="Buscar cliente por nombre o teléfono..."
                onChange={e => {
                  setClienteBusqueda(e.target.value);
                  setShowClienteDropdown(true);
                  if (form.clienteId) {
                    // si el usuario empieza a tipear sobre un cliente seleccionado, desliga
                    setForm(f => ({ ...f, clienteId: '', clienteNombre: '' }));
                    setIsNewCliente(false);
                  }
                }}
                onFocus={() => setShowClienteDropdown(true)}
                onBlur={() => setTimeout(() => setShowClienteDropdown(false), 200)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>
            {showClienteDropdown && clientesFiltrados.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {clientesFiltrados.map(c => (
                  <button
                    type="button"
                    key={c.id}
                    onMouseDown={() => handleSelectCliente(c)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                  >
                    <div className="font-medium text-gray-900">{c.nombre}</div>
                    <div className="text-xs text-gray-500">{c.telefono} {c.direccion ? `· ${c.direccion}` : ''}</div>
                  </button>
                ))}
              </div>
            )}
            {showClienteDropdown && clienteBusqueda && clientesFiltrados.length === 0 && !form.clienteId && (
              <button
                type="button"
                onMouseDown={() => {
                  // Modo "nuevo cliente": deja que el usuario complete nombre + teléfono manual.
                  setForm(f => ({ ...f, clienteNombre: clienteBusqueda }));
                  setIsNewCliente(true);
                  setShowClienteDropdown(false);
                }}
                className="absolute z-20 w-full mt-1 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700 text-left hover:bg-emerald-100"
              >
                + Crear cliente nuevo: <strong>{clienteBusqueda}</strong>
              </button>
            )}
          </div>

          {/* Si el cliente fue seleccionado del dropdown, mostramos solo lectura.
              Si es nuevo, pedimos nombre + teléfono + dirección editable. */}
          {(isNewCliente || !form.clienteId) ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                  <input
                    type="text"
                    value={form.clienteNombre}
                    onChange={e => setForm(f => ({ ...f, clienteNombre: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono * {buscandoTelefono && <span className="ml-1 text-xs text-gray-400">(buscando...)</span>}
                  </label>
                  <input
                    type="tel"
                    value={form.clienteTelefono}
                    placeholder="809-555-1234"
                    onChange={e => handleClienteTelefonoChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email (opcional)</label>
                  <input
                    type="email"
                    value={form.clienteEmail}
                    onChange={e => setForm(f => ({ ...f, clienteEmail: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección (opcional)</label>
                  <input
                    type="text"
                    value={form.clienteDireccion}
                    onChange={e => setForm(f => ({ ...f, clienteDireccion: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div><span className="text-gray-500">Nombre:</span> <span className="font-medium">{form.clienteNombre}</span></div>
              <div><span className="text-gray-500">Teléfono:</span> {form.clienteTelefono}</div>
              {form.clienteDireccion && <div><span className="text-gray-500">Dirección:</span> {form.clienteDireccion}</div>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo equipo</label>
              <select value={form.equipoTipo} onChange={e => setForm(f => ({ ...f, equipoTipo: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                <option value="">Seleccionar...</option>
                {tiposEquipo.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frecuencia</label>
              <select value={form.frecuencia} onChange={e => setForm(f => ({ ...f, frecuencia: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                {Object.entries(FRECUENCIA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Próxima fecha *</label>
              <input type="date" value={form.proximaFecha} onChange={e => setForm(f => ({ ...f, proximaFecha: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
              <select value={form.tecnicoId} onChange={e => setForm(f => ({ ...f, tecnicoId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                <option value="">Sin asignar</option>
                {/* SPRINT-AGENDA-1 (2026-05-25, P-006): dropdown usa `t.uid`
                    para que `tecnicoId` guarde `auth.uid` y la cadena
                    mantenimiento → orden → rule sea consistente. El filtro
                    `tecnicos` (línea arriba) excluye empleados sin uid
                    (alta vieja sin doble-doc). */}
                {tecnicos.map(t => <option key={t.id} value={t.uid}>{t.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowModal(false); resetForm(); }}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : 'Programar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function MantenimientoCard({ item, onGenerar, onToggle, isVencido }: {
  item: MantenimientoType; onGenerar: (i: MantenimientoType) => void;
  onToggle: (i: MantenimientoType) => void; isVencido?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4 ${
      isVencido ? 'border-red-200 bg-red-50/50' : !item.activo ? 'opacity-50 border-gray-100' : 'border-gray-100'
    }`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isVencido ? 'bg-red-100' : 'bg-[#0f3460]/10'}`}>
        <Calendar size={18} className={isVencido ? 'text-red-600' : 'text-[#0f3460]'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{item.clienteNombre}</p>
        <p className="text-xs text-gray-500">
          {item.equipoTipo} · {FRECUENCIA_LABELS[item.frecuencia]} · {formatFechaCorta(item.proximaFecha)}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {item.activo && (
          <button onClick={() => onGenerar(item)}
            className="flex items-center gap-1 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
            <RefreshCw size={12} /> Generar Orden
          </button>
        )}
        <button onClick={() => onToggle(item)}
          className={`p-1.5 rounded-lg text-xs ${item.activo ? 'hover:bg-red-50 text-red-500' : 'hover:bg-green-50 text-green-500'}`}>
          {item.activo ? <X size={14} /> : <Check size={14} />}
        </button>
      </div>
    </div>
  );
}
