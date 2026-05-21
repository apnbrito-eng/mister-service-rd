import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, User, Wrench, Calendar, AlertTriangle, CheckCircle, Loader2, Edit2, Home, ChevronDown, Shield, Tag, X } from 'lucide-react';
import { Cliente, Personal, OrdenServicio, DireccionCliente, CitaPorConfirmar } from '../../types';
import {
  DURACIONES, HORARIOS, HORARIOS_LABEL,
  formatTelefono, faseLabel,
} from '../../utils';
import { obtenerModelosDeTipo } from '../../utils/modelosEquipo';
import { useConfigWeb } from '../../hooks/useConfigWeb';
import { useTiposEquipo } from '../../hooks/useTiposEquipo';
import Modal from '../Modal';
import EditarClienteModal from '../clientes/EditarClienteModal';
import CampoDireccionConPlaces from '../shared/CampoDireccionConPlaces';
import FotoEquipoDisplay from '../shared/FotoEquipoDisplay';
import { ChequeoVigenteInfo, diasRestantesVigencia } from '../../utils/descuentoChequeo';

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
  /**
   * Configuración del equipo elegida del catálogo (ej: 'Torre',
   * 'Individual', 'French door'). Mal nombrado históricamente — el
   * label UI se renombró a "Configuración" en SPRINT-172. Si el tipo
   * no tiene modelos definidos en el catálogo, queda invisible
   * (mostramos solo el input libre de modelo del fabricante).
   */
  equipoModelo: string;
  /**
   * Modelo real del fabricante en texto libre (ej: 'WF45R6100AW').
   * Agregado en SPRINT-172.
   */
  equipoModeloFabricante: string;
  descripcionFalla: string;
  tecnicoId: string;
  tecnicoNombre: string;
  duracionMin: number;
  fechaCita: string;
  horaInicio: string;
}

interface OrdenCreateModalProps {
  form: CreateFormState;
  setForm: React.Dispatch<React.SetStateAction<CreateFormState>>;
  clienteBusqueda: string;
  setClienteBusqueda: (v: string) => void;
  showClienteDropdown: boolean;
  setShowClienteDropdown: (v: boolean) => void;
  isNewCliente: boolean;
  setIsNewCliente: (v: boolean) => void;
  saving: boolean;
  clientes?: Cliente[];
  clientesFiltrados: Cliente[];
  tecnicos: Personal[];
  horariosOcupadosCreate: string[];
  ordenesActivasCliente: OrdenServicio[];
  buscandoTelefono: boolean;
  showTelefonoDropdown: boolean;
  setShowTelefonoDropdown: (v: boolean) => void;
  clientesFiltradosTelefono: Cliente[];
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  handleDireccionChange: (datos: { direccion: string; lat?: number; lng?: number }) => void;
  handleSelectCliente: (c: Cliente) => void;
  handleClienteTelefonoChange: (telefono: string) => void;
  /**
   * Cita pública desde la que se construyó el preset. Cuando viene:
   *  - Se muestra un banner identificando el origen.
   *  - Si la cita es de garantía, se muestra el bloque amarillo con datos
   *    referenciales (técnico original, conduce, descripción del problema).
   *  - Si la cita trae `comoNosConocio` o `camposPersonalizados`, se renderiza
   *    una sección expandible al final del modal.
   * Esta prop es solo de presentación — la persistencia de los metadatos en
   * la orden creada la maneja el hook `useOrdenCreateForm`.
   */
  citaPreset?: CitaPorConfirmar | null;
  /** Bloque opcional inyectado al final del form (antes del footer). Útil
   *  para Citas.tsx que necesita meter la UI de garantía con motivo del
   *  cambio de técnico. */
  extraFooterSlot?: React.ReactNode;
  /** SPRINT-186: chequeo previo vigente detectado al cambiar cliente/equipo.
   *  Si null, no se muestra el banner. Si retorna info, el modal renderiza
   *  banner naranja con monto + vencimiento + checkbox para aplicar
   *  descuento al crear la orden. */
  chequeoPrevio?: ChequeoVigenteInfo | null;
  /** SPRINT-186: toggle del checkbox del banner. Controlado por el hook
   *  `useOrdenCreateForm` (auto-marca true si chequeo vigente). */
  aplicarDescuento?: boolean;
  setAplicarDescuento?: (v: boolean) => void;
  /**
   * SPRINT-INBOX-8b: modo de presentación. `'modal'` (default) usa el overlay
   * centrado clásico — comportamiento histórico, idéntico para Ordenes/Citas/
   * OrdenEditForm/FormularioAgendarPublico que NO pasan este prop. `'drawer'`
   * renderiza el form en un panel lateral derecho (50% lg+, 100% mobile) sin
   * overlay opaco, dejando visible la página de abajo — usado por
   * InboxConversacion para que el chat (columna 3) quede visible mientras se
   * crea la orden. Approach A1 aprobado por Jorge 2026-05-21 10:30.
   */
  presentationMode?: 'modal' | 'drawer';
}

export default function OrdenCreateModal({
  form,
  setForm,
  clienteBusqueda,
  setClienteBusqueda,
  showClienteDropdown,
  setShowClienteDropdown,
  isNewCliente,
  setIsNewCliente,
  saving,
  clientesFiltrados,
  tecnicos,
  horariosOcupadosCreate,
  ordenesActivasCliente,
  buscandoTelefono,
  showTelefonoDropdown,
  setShowTelefonoDropdown,
  clientesFiltradosTelefono,
  onSubmit,
  onClose,
  handleDireccionChange,
  handleSelectCliente,
  handleClienteTelefonoChange,
  clientes = [],
  citaPreset,
  extraFooterSlot,
  chequeoPrevio,
  aplicarDescuento,
  setAplicarDescuento,
  presentationMode = 'modal',
}: OrdenCreateModalProps) {
  const esClienteExistente = !!form.clienteId && !isNewCliente;
  const readonlyInputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-blue-50/50 text-gray-700 cursor-not-allowed';
  const editableInputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]';

  const clienteSeleccionado = useMemo<Cliente | undefined>(
    () => (form.clienteId ? clientes.find(c => c.id === form.clienteId) : undefined),
    [form.clienteId, clientes],
  );
  const direccionesAlternativas = useMemo<DireccionCliente[]>(
    () => clienteSeleccionado?.direcciones || [],
    [clienteSeleccionado],
  );
  const tieneAlternativas = direccionesAlternativas.length > 0;

  const [showEditarCliente, setShowEditarCliente] = useState(false);
  const [showSelectorDir, setShowSelectorDir] = useState(false);

  const direccionSeleccionada = useMemo(() => {
    if (!clienteSeleccionado) return null;
    const alt = direccionesAlternativas.find(d => d.direccion === form.clienteDireccion);
    if (alt) return { tipo: 'alternativa' as const, etiqueta: alt.etiqueta, direccion: alt.direccion };
    return { tipo: 'principal' as const, etiqueta: 'Principal', direccion: clienteSeleccionado.direccion };
  }, [clienteSeleccionado, direccionesAlternativas, form.clienteDireccion]);

  const aplicarDireccion = (d: DireccionCliente | { principal: true; cliente: Cliente }) => {
    if ('principal' in d) {
      setForm(f => ({
        ...f,
        clienteDireccion: d.cliente.direccion,
        clienteReferencia: d.cliente.referenciaDireccion || '',
        clienteLat: d.cliente.lat,
        clienteLng: d.cliente.lng,
      }));
    } else {
      setForm(f => ({
        ...f,
        clienteDireccion: d.direccion,
        clienteReferencia: d.referencia || '',
        clienteLat: d.lat,
        clienteLng: d.lng,
      }));
    }
    setShowSelectorDir(false);
  };

  // ¿Hay metadatos de la cita pública que mostrar?
  const tieneInfoAdicional = !!(
    citaPreset &&
    (citaPreset.comoNosConocio ||
      (citaPreset.camposPersonalizados && Object.keys(citaPreset.camposPersonalizados).length > 0))
  );

  // SPRINT-170: técnico elegido + operaria derivada (auto). Se busca por
  // `(p.uid || p.id)` porque el value del dropdown es `t.uid` post-c4be345
  // (rule `tecnicoId == auth.uid`). Si el técnico no tiene operaria
  // configurada en `personal[uid].operariaId`, mostramos warning y
  // bloqueamos el submit. La operaria de cada técnico se configura en
  // /admin/personal (no hay selector manual acá — decisión negocio para
  // evitar error humano).
  const tecnicoSeleccionado = useMemo<Personal | undefined>(
    () => (form.tecnicoId ? tecnicos.find(t => (t.uid || t.id) === form.tecnicoId) : undefined),
    [form.tecnicoId, tecnicos],
  );
  const operariaFaltante = !!tecnicoSeleccionado && !tecnicoSeleccionado.operariaId;

  // Catálogo configurable de modelos (vive en `config_web/sitio`). Cuando
  // el admin guarda cambios desde /admin/configuracion, el listener
  // re-renderiza este modal con las nuevas opciones.
  const { config: configWeb } = useConfigWeb();
  const tiposEquipo = useTiposEquipo();
  const catalogoModelos = useMemo<{ [tipo: string]: string[] }>(() => {
    const fromConfig = configWeb?.modelosPorTipoEquipo;
    if (fromConfig && Object.keys(fromConfig).length > 0) return fromConfig;
    // Fallback inline: defaults sensatos para que el modal funcione antes
    // de que el admin haya tocado el editor por primera vez.
    return {
      'Lavadora': ['Torre', 'Individual'],
      'Nevera': ['Side-by-side', 'French door', 'Top freezer', 'Mini bar'],
      'Estufa': ['Eléctrica', 'Gas', 'Mixta'],
      'Aire Acondicionado': ['Split', 'Ventana', 'Portátil', 'Cassette'],
      'Secadora': ['Torre', 'Individual'],
    };
  }, [configWeb]);
  const modelosDisponibles = useMemo(
    () => obtenerModelosDeTipo(form.equipoTipo, catalogoModelos),
    [form.equipoTipo, catalogoModelos],
  );

  // Reactivo: si la coord cambia el tipo de equipo, limpiamos
  // `equipoModelo` porque las opciones del catálogo (o el modo texto
  // libre) cambian con el tipo. Usamos una ref para detectar el cambio
  // real y NO limpiar en el mount inicial (donde equipoTipo va de '' a un
  // valor válido — ej: al abrir el modal con un citaPreset).
  const tipoEquipoPrevRef = useRef<string>('');
  useEffect(() => {
    const prev = tipoEquipoPrevRef.current;
    const actual = form.equipoTipo;
    if (prev && prev !== actual && form.equipoModelo) {
      setForm(f => ({ ...f, equipoModelo: '' }));
    }
    tipoEquipoPrevRef.current = actual;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.equipoTipo]);

  const tituloHeader = citaPreset ? 'Confirmar y Agendar Cita' : 'Crear Orden de Servicio';

  const formContent = (
    <>
      <form onSubmit={onSubmit} className="space-y-6">
        {/* Banner de origen — solo cuando viene de cita pública */}
        {citaPreset && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-start gap-2">
            <CheckCircle size={14} className="text-blue-700 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">
                Datos pre-cargados desde el formulario público
              </p>
              <p className="text-blue-700">
                Edita cualquier campo si el cliente cometió un error. Al confirmar se
                creará la orden y se borrará la cita.
              </p>
            </div>
          </div>
        )}

        {/* Banner garantía — si la cita es reasignación */}
        {citaPreset?.esGarantia && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={16} className="text-amber-700" />
              <span className="text-sm font-bold text-amber-900">Cita de garantía</span>
            </div>
            <div className="text-xs text-amber-900 space-y-0.5">
              {citaPreset.tecnicoOriginalNombre && (
                <p><span className="font-semibold">Técnico original:</span> {citaPreset.tecnicoOriginalNombre}</p>
              )}
              {citaPreset.referenciaConduce && (
                <p><span className="font-semibold">Conduce ref:</span> {citaPreset.referenciaConduce}</p>
              )}
              {citaPreset.descripcionProblema && (
                <p><span className="font-semibold">Problema reclamado:</span> {citaPreset.descripcionProblema}</p>
              )}
            </div>
          </div>
        )}

        {/* Section: Cliente */}
        <div>
          <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3 flex items-center gap-2">
            <User size={16} />
            Cliente
          </h3>
          <div className="space-y-3">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Buscar cliente existente</label>
              <input
                type="text"
                placeholder="Nombre o telefono del cliente..."
                value={clienteBusqueda}
                onChange={e => {
                  setClienteBusqueda(e.target.value);
                  setShowClienteDropdown(true);
                  if (form.clienteId) {
                    setForm(f => ({ ...f, clienteId: '', clienteNombre: e.target.value }));
                  } else {
                    setForm(f => ({ ...f, clienteNombre: e.target.value }));
                  }
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
              {showClienteDropdown && clienteBusqueda && clientesFiltrados.length > 0 && (
                <div className="absolute z-10 w-full border border-gray-200 rounded-lg mt-1 max-h-40 overflow-y-auto bg-white shadow-lg">
                  {clientesFiltrados.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectCliente(c)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0"
                    >
                      <span className="font-medium">{c.nombre}</span>
                      <span className="text-gray-500 ml-2">{formatTelefono(c.telefono)}</span>
                    </button>
                  ))}
                </div>
              )}
              {clienteBusqueda && !form.clienteId && clientesFiltrados.length === 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Cliente no encontrado. Puedes crearlo abajo.
                </p>
              )}
            </div>

            {!form.clienteId && !isNewCliente && (
              <button
                type="button"
                onClick={() => {
                  setIsNewCliente(true);
                  setForm(f => ({ ...f, clienteNombre: clienteBusqueda || '' }));
                  setShowClienteDropdown(false);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-[#1a5fa8] text-[#1a5fa8] hover:bg-[#1a5fa8]/5 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={16} />
                Crear nuevo cliente
              </button>
            )}

            {(isNewCliente || form.clienteId) && (
              <div className={`rounded-xl p-4 space-y-3 ${esClienteExistente ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs font-semibold text-[#1a5fa8] flex items-center gap-2">
                    {esClienteExistente ? (
                      <>
                        <CheckCircle size={14} className="text-green-600" />
                        Cliente ya registrado: {form.clienteNombre}
                      </>
                    ) : (
                      'Datos del nuevo cliente'
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    {esClienteExistente && (
                      <button
                        type="button"
                        onClick={() => setShowEditarCliente(true)}
                        className="inline-flex items-center gap-1 text-xs text-[#1a5fa8] hover:text-[#0f3460] font-medium"
                      >
                        <Edit2 size={11} /> Editar datos del cliente
                      </button>
                    )}
                    {(isNewCliente || esClienteExistente) && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewCliente(false);
                          setForm(f => ({
                            ...f,
                            clienteId: '', clienteNombre: '', clienteTelefono: '',
                            clienteEmail: '', clienteDireccion: '', clienteReferencia: '',
                            clienteLat: undefined, clienteLng: undefined,
                          }));
                          setClienteBusqueda('');
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 underline"
                      >
                        Cancelar y buscar otro
                      </button>
                    )}
                  </div>
                </div>

                {esClienteExistente && ordenesActivasCliente.length > 0 && (
                  <div className="rounded-lg p-3 bg-amber-50 border border-amber-300 flex items-start gap-2">
                    <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-900 flex-1">
                      <p className="font-semibold mb-1">
                        Este cliente ya tiene {ordenesActivasCliente.length} orden{ordenesActivasCliente.length > 1 ? 'es' : ''} activa{ordenesActivasCliente.length > 1 ? 's' : ''}:
                      </p>
                      <ul className="space-y-0.5">
                        {ordenesActivasCliente.slice(0, 3).map(o => (
                          <li key={o.id} className="font-mono">
                            {o.numero} · {o.equipoTipo} · {faseLabel(o.fase)}
                          </li>
                        ))}
                        {ordenesActivasCliente.length > 3 && (
                          <li className="italic">y {ordenesActivasCliente.length - 3} más...</li>
                        )}
                      </ul>
                      <p className="mt-1.5 text-amber-700">Puedes crear una nueva orden si es un servicio distinto.</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                    <input
                      type="text"
                      value={form.clienteNombre}
                      onChange={e => setForm(f => ({ ...f, clienteNombre: e.target.value }))}
                      readOnly={esClienteExistente}
                      className={esClienteExistente ? readonlyInputClass : editableInputClass}
                    />
                  </div>
                  <div className="relative">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Telefono *
                      {buscandoTelefono && (
                        <span className="ml-2 text-[10px] text-blue-600 inline-flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" />
                          Buscando...
                        </span>
                      )}
                    </label>
                    <input
                      type="tel"
                      value={form.clienteTelefono}
                      onChange={e => handleClienteTelefonoChange(e.target.value)}
                      onFocus={() => {
                        if ((form.clienteTelefono.replace(/\D/g, '').length >= 3) && !esClienteExistente) {
                          setShowTelefonoDropdown(true);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowTelefonoDropdown(false), 200);
                      }}
                      placeholder="8091234567"
                      className={editableInputClass}
                      autoComplete="off"
                    />
                    {showTelefonoDropdown && !esClienteExistente && clientesFiltradosTelefono.length > 0 && (
                      <div className="absolute z-20 w-full border border-gray-200 rounded-lg mt-1 max-h-40 overflow-y-auto bg-white shadow-lg">
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                          Clientes con ese teléfono
                        </div>
                        {clientesFiltradosTelefono.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectCliente(c);
                              setShowTelefonoDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-0 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-900 truncate">{c.nombre}</p>
                              <p className="text-xs text-gray-500">{formatTelefono(c.telefono)}</p>
                            </div>
                            <span className="text-[10px] text-blue-600 font-medium shrink-0">Ya registrado</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {!esClienteExistente && clientesFiltradosTelefono.length > 0 && form.clienteTelefono.replace(/\D/g, '').length >= 3 && (
                      <div className="mt-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
                        <AlertTriangle size={12} className="text-amber-600 mt-0.5 shrink-0" />
                        <div className="text-[11px] text-amber-900 flex-1">
                          {clientesFiltradosTelefono.length === 1 ? (
                            <>
                              Este teléfono ya pertenece a <span className="font-semibold">{clientesFiltradosTelefono[0].nombre}</span>.{' '}
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectCliente(clientesFiltradosTelefono[0]);
                                  setShowTelefonoDropdown(false);
                                }}
                                className="text-amber-900 underline font-semibold hover:text-amber-700"
                              >
                                Usar este cliente
                              </button>
                            </>
                          ) : (
                            <>
                              {clientesFiltradosTelefono.length} clientes con teléfonos similares.{' '}
                              <span className="text-amber-700">Haz click en uno del listado para seleccionarlo.</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {!esClienteExistente && !buscandoTelefono && form.clienteTelefono && !showTelefonoDropdown && clientesFiltradosTelefono.length === 0 && form.clienteTelefono.replace(/\D/g, '').length >= 3 && (
                      <p className="text-[10px] text-green-600 mt-1">
                        ✓ Teléfono disponible (no existe en la base)
                      </p>
                    )}
                    {!esClienteExistente && !buscandoTelefono && form.clienteTelefono && !showTelefonoDropdown && form.clienteTelefono.replace(/\D/g, '').length < 3 && (
                      <p className="text-[10px] text-gray-500 mt-1">
                        Escribe el teléfono completo (10 dígitos) para detectar clientes existentes
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email (opcional)</label>
                    <input
                      type="email"
                      value={form.clienteEmail}
                      onChange={e => setForm(f => ({ ...f, clienteEmail: e.target.value }))}
                      readOnly={esClienteExistente}
                      className={esClienteExistente ? readonlyInputClass : editableInputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Direccion
                      {!esClienteExistente && (
                        <span className="ml-2 text-[10px] text-gray-400 font-normal">
                          (Busca en Google: Agora Mall, Plaza Central, etc.)
                        </span>
                      )}
                    </label>

                    {esClienteExistente && tieneAlternativas && (
                      <div className="relative mb-2">
                        <button
                          type="button"
                          onClick={() => setShowSelectorDir(v => !v)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-white border border-blue-300 rounded-lg text-sm hover:bg-blue-50"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <Home size={14} className="text-[#0f3460] shrink-0" />
                            <span className="font-semibold text-[#0f3460]">
                              {direccionSeleccionada?.etiqueta}:
                            </span>
                            <span className="text-gray-700 truncate">
                              {direccionSeleccionada?.direccion}
                            </span>
                          </span>
                          <ChevronDown size={14} className="text-gray-400 shrink-0" />
                        </button>
                        {showSelectorDir && clienteSeleccionado && (
                          <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => aplicarDireccion({ principal: true, cliente: clienteSeleccionado })}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-100"
                            >
                              <div className="font-semibold text-[#0f3460]">Principal</div>
                              <div className="text-xs text-gray-600 truncate">{clienteSeleccionado.direccion || '(sin dirección)'}</div>
                            </button>
                            {direccionesAlternativas.map(d => (
                              <button
                                key={d.id}
                                type="button"
                                onClick={() => aplicarDireccion(d)}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-0"
                              >
                                <div className="font-semibold text-[#0f3460]">{d.etiqueta}</div>
                                <div className="text-xs text-gray-600 truncate">{d.direccion}</div>
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                setShowSelectorDir(false);
                                setShowEditarCliente(true);
                              }}
                              className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-blue-50 text-sm flex items-center gap-1 text-[#1a5fa8] font-medium border-t border-gray-200"
                            >
                              <Plus size={12} /> Agregar / editar direcciones
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {esClienteExistente && !tieneAlternativas && (
                      <button
                        type="button"
                        onClick={() => setShowEditarCliente(true)}
                        className="mb-2 inline-flex items-center gap-1 text-xs text-[#1a5fa8] hover:text-[#0f3460] font-medium"
                      >
                        <Plus size={11} /> Agregar otra dirección (mamá, oficina, etc.)
                      </button>
                    )}

                    {esClienteExistente ? (
                      // Cliente existente: dirección de solo-lectura, no permitir
                      // editar — para cambiar usar "Editar datos del cliente".
                      <input
                        type="text"
                        value={form.clienteDireccion}
                        readOnly
                        className={readonlyInputClass}
                      />
                    ) : (
                      <CampoDireccionConPlaces
                        valor={form.clienteDireccion}
                        lat={form.clienteLat}
                        lng={form.clienteLng}
                        onChange={handleDireccionChange}
                        placeholder="Escribe un lugar, dirección o pega URL de Google Maps"
                        inputClassName={`flex-1 ${editableInputClass}`}
                      />
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Referencia de direccion</label>
                  <input
                    type="text"
                    value={form.clienteReferencia}
                    onChange={e => setForm(f => ({ ...f, clienteReferencia: e.target.value }))}
                    placeholder="Al lado del colmado, frente al parque..."
                    readOnly={esClienteExistente}
                    className={esClienteExistente ? readonlyInputClass : editableInputClass}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section: Servicio */}
        <div>
          <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3 flex items-center gap-2">
            <Wrench size={16} />
            Servicio
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Equipo *</label>
                <input
                  type="text"
                  list="tipos-equipo-list"
                  value={form.equipoTipo}
                  onChange={e => setForm(f => ({ ...f, equipoTipo: e.target.value }))}
                  placeholder="Ej: Lavadora, Nevera..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
                <datalist id="tipos-equipo-list">
                  {tiposEquipo.map(t => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Marca</label>
                <input
                  type="text"
                  value={form.equipoMarca}
                  onChange={e => setForm(f => ({ ...f, equipoMarca: e.target.value }))}
                  placeholder="LG, Samsung, Mabe..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
              {/*
                SPRINT-172 (2026-05-12) — Reportado por Angelica: el combobox
                "Modelo" sólo permitía elegir Torre/Individual (que en
                realidad son configuraciones, no modelos del fabricante).
                Decisión coordinator (ruta conservadora): renombrar UI del
                combobox a "Configuración" + agregar input texto libre
                "Modelo" para el modelo real del fabricante. Sin migración
                de datos — `equipoModelo` sigue siendo el campo de
                configuración por compat con consumidores legacy
                (parseOrden, formatearEquipoLabel). El modelo del fabricante
                vive en el field nuevo `equipoModeloFabricante`.
              */}
              {modelosDisponibles.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Configuración</label>
                  <select
                    value={form.equipoModelo}
                    onChange={e => setForm(f => ({ ...f, equipoModelo: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] bg-white"
                  >
                    <option value="">Selecciona configuración (opcional)</option>
                    {modelosDisponibles.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Modelo</label>
              <input
                type="text"
                value={form.equipoModeloFabricante}
                onChange={e => setForm(f => ({ ...f, equipoModeloFabricante: e.target.value }))}
                placeholder="ej: WF45R6100AW (modelo del fabricante, opcional)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Descripcion de la Falla *</label>
              <textarea
                value={form.descripcionFalla}
                onChange={e => setForm(f => ({ ...f, descripcionFalla: e.target.value }))}
                rows={3}
                placeholder="Describe detalladamente el problema del equipo..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>

            {/* Foto del equipo (solo cuando viene de cita pública con foto) */}
            {citaPreset?.fotoEquipoUrl && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Foto del equipo (capturada por el cliente)
                </label>
                <FotoEquipoDisplay url={citaPreset.fotoEquipoUrl} size="md" />
              </div>
            )}
          </div>
        </div>

        {/*
          SPRINT-186: banner naranja descuento chequeo previo.
          Aparece cuando el hook `useOrdenCreateForm` detecta un chequeo
          vigente o vencido para el cliente+equipo. Sólo permite auto-aplicar
          sobre vigente; vencido se muestra como info read-only (el override
          con motivo se hace después en el flujo de aprobación de precio en
          /admin/ordenes — ver SPRINT-178). Replica patrón visual de
          "Operaria asignada" en mismo modal.
        */}
        {chequeoPrevio && (
          <div className={`p-4 rounded-lg border ${
            chequeoPrevio.vigente
              ? 'bg-orange-50 border-orange-300'
              : 'bg-gray-50 border-gray-300'
          }`}>
            <div className="flex items-start gap-3">
              <Tag size={18} className={`flex-shrink-0 mt-0.5 ${chequeoPrevio.vigente ? 'text-orange-600' : 'text-gray-500'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${chequeoPrevio.vigente ? 'text-orange-900' : 'text-gray-700'}`}>
                  {chequeoPrevio.vigente
                    ? 'Este cliente tiene un chequeo previo vigente para este equipo'
                    : 'Este cliente tuvo un chequeo previo (ya vencido)'}
                </p>
                <p className="text-xs text-gray-700 mt-1">
                  Origen: orden {chequeoPrevio.ordenNumero} —
                  Monto: <strong>RD$ {chequeoPrevio.montoChequeo.toLocaleString('es-DO')}</strong> —
                  {chequeoPrevio.vigente
                    ? ` vence en ${diasRestantesVigencia(chequeoPrevio.fechaCierre)} día(s).`
                    : ' vencido (ya pasaron más de 30 días).'}
                </p>
                {chequeoPrevio.vigente && setAplicarDescuento && (
                  <label className="mt-3 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aplicarDescuento === true}
                      onChange={e => setAplicarDescuento(e.target.checked)}
                      className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
                    />
                    <span className="text-sm text-gray-900">
                      Aplicar descuento de <strong>RD$ {chequeoPrevio.montoChequeo.toLocaleString('es-DO')}</strong> a esta orden
                    </span>
                  </label>
                )}
                {!chequeoPrevio.vigente && (
                  <p className="text-xs text-gray-500 italic mt-2">
                    Aplicar descuento sobre chequeo vencido requiere override
                    de admin/coord con motivo — se gestiona en el paso de
                    aprobación de precio, no al crear la orden.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Section: Programacion */}
        <div>
          <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3 flex items-center gap-2">
            <Calendar size={16} />
            Programacion
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Asignar Tecnico</label>
              <select
                value={form.tecnicoId}
                onChange={e => {
                  // BUG fix (P-006): el value del option es el auth.uid del técnico
                  // (personal.uid), NO el doc id de personal. Las rules comparan
                  // resource.data.tecnicoId == request.auth.uid, así que tecnicoId
                  // DEBE ser el auth.uid o el técnico recibe permission-denied al
                  // hacer cualquier write (Iniciar Chequeo, etc.).
                  const t = tecnicos.find(p => (p.uid || p.id) === e.target.value);
                  setForm(f => ({ ...f, tecnicoId: e.target.value, tecnicoNombre: t?.nombre || '' }));
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] bg-white"
              >
                <option value="">Sin asignar</option>
                {tecnicos.filter(t => t.uid).map(t => (
                  <option key={t.id} value={t.uid}>{t.nombre}</option>
                ))}
              </select>
              {/* SPRINT-170: preview de operaria auto-derivada del técnico */}
              {tecnicoSeleccionado && tecnicoSeleccionado.operariaNombre && (
                <div className="mt-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 flex items-center gap-2">
                  <CheckCircle size={14} className="flex-shrink-0" />
                  <span>
                    Operaria asignada: <strong>{tecnicoSeleccionado.operariaNombre}</strong>
                  </span>
                </div>
              )}
              {operariaFaltante && (
                <div className="mt-2 px-3 py-2 bg-yellow-50 border border-yellow-300 rounded-lg text-xs text-yellow-900 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <div>
                    El técnico <strong>{tecnicoSeleccionado?.nombre}</strong> no tiene operaria asignada.
                    Asignar una en <strong>/admin/personal</strong> antes de crear esta orden,
                    o las notificaciones a operaria no llegarán y el chip "Operaria" quedará vacío.
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Duracion</label>
              <div className="flex flex-wrap gap-2">
                {DURACIONES.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, duracionMin: d }))}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      form.duracionMin === d
                        ? 'bg-[#1a5fa8] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de Cita</label>
                <input
                  type="date"
                  value={form.fechaCita}
                  onChange={e => setForm(f => ({ ...f, fechaCita: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Hora de Inicio</label>
                <div className="grid grid-cols-5 gap-1">
                  {HORARIOS.map(h => {
                    const ocupado = horariosOcupadosCreate.includes(h);
                    return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => !ocupado && setForm(f => ({ ...f, horaInicio: h }))}
                      disabled={ocupado}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        ocupado
                          ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed line-through'
                          : form.horaInicio === h
                            ? 'bg-[#1a5fa8] text-white border-[#1a5fa8]'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a5fa8]'
                      }`}
                      title={ocupado ? 'Horario ocupado' : ''}
                    >
                      {HORARIOS_LABEL[h]}{ocupado && ' \u{2717}'}
                    </button>
                    );
                  })}
                </div>
                {form.tecnicoId && form.fechaCita && horariosOcupadosCreate.length > 0 && (
                  <p className="text-[10px] text-red-500 mt-1">{'\u{26A0}\u{FE0F}'} {horariosOcupadosCreate.length} horario(s) ocupado(s) ese dia</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Información adicional desde el formulario público (read-only) */}
        {tieneInfoAdicional && (
          <details className="border border-gray-200 rounded-lg p-3 bg-gray-50" open>
            <summary className="cursor-pointer text-sm font-medium text-gray-700">
              Información adicional del formulario
            </summary>
            <div className="mt-2 text-xs text-gray-700 space-y-1">
              {citaPreset?.comoNosConocio && (
                <div><strong>¿Cómo nos conoció?</strong> {citaPreset.comoNosConocio}</div>
              )}
              {citaPreset?.whatsappAsignadoNombre && (
                <div><strong>WhatsApp asignado:</strong> {citaPreset.whatsappAsignadoNombre}</div>
              )}
              {citaPreset?.camposPersonalizados &&
                Object.entries(citaPreset.camposPersonalizados).map(([k, v]) => {
                  // El form público nuevo guarda la key como `id` permanente
                  // del campo; las citas históricas la guardan como `label`.
                  // Buscamos el label actual en la config — si no aparece (es
                  // una cita vieja con label-as-key), mostramos `k` directo.
                  const labelActual =
                    configWeb?.formularioAgendar?.camposPersonalizados?.find(
                      c => c.id === k,
                    )?.label || k;
                  return (
                    <div key={k}><strong>{labelActual}:</strong> {String(v)}</div>
                  );
                })}
            </div>
          </details>
        )}

        {/* Slot extra inyectado por el caller (ej: garantía con cambio de técnico) */}
        {extraFooterSlot}

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || operariaFaltante}
            title={operariaFaltante ? 'Asigna una operaria al técnico antes de continuar' : ''}
            className="px-6 py-2.5 bg-[#1a5fa8] hover:bg-[#0f3460] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Plus size={16} />
                {citaPreset ? 'Confirmar y Agendar' : 'Guardar Orden de Servicio'}
              </>
            )}
          </button>
        </div>
      </form>

      {form.clienteId && (
        <EditarClienteModal
          isOpen={showEditarCliente}
          onClose={() => setShowEditarCliente(false)}
          clienteId={form.clienteId}
          onUpdated={c => {
            setForm(f => ({
              ...f,
              clienteNombre: c.nombre,
              clienteEmail: c.email || '',
              ...(direccionSeleccionada?.tipo === 'principal'
                ? {
                    clienteDireccion: c.direccion,
                    clienteLat: c.lat,
                    clienteLng: c.lng,
                  }
                : {}),
            }));
          }}
        />
      )}
    </>
  );

  // SPRINT-INBOX-8b: render condicional. Default 'modal' = comportamiento
  // histórico (overlay centrado vía <Modal />). 'drawer' = panel lateral
  // derecho para que la conversación de InboxConversacion quede visible.
  // El wrapper drawer NO usa <Modal /> porque ese componente fuerza overlay
  // centrado + backdrop opaco. Acá necesitamos un panel sin backdrop opaco
  // para no tapar la página de fondo.
  if (presentationMode === 'drawer') {
    return (
      <div
        role="dialog"
        aria-modal="false"
        aria-label={tituloHeader}
        className="fixed top-0 right-0 z-40 h-full w-full md:w-[60%] lg:w-[55%] xl:w-[50%] bg-white shadow-2xl border-l border-gray-200 flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">{tituloHeader}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">
          {formContent}
        </div>
      </div>
    );
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={tituloHeader}
      size="xl"
    >
      {formContent}
    </Modal>
  );
}
