import { Plus, User, Wrench, Calendar, MapPin, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { Cliente, Personal, OrdenServicio } from '../../types';
import {
  TIPOS_EQUIPO, DURACIONES, HORARIOS, HORARIOS_LABEL,
  formatTelefono, faseLabel,
} from '../../utils';
import Modal from '../Modal';

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
  geoLoading: boolean;
  clientes: Cliente[];
  clientesFiltrados: Cliente[];
  personal: Personal[];
  tecnicos: Personal[];
  horariosOcupadosCreate: string[];
  ordenesActivasCliente: OrdenServicio[];
  buscandoTelefono: boolean;
  showTelefonoDropdown: boolean;
  setShowTelefonoDropdown: (v: boolean) => void;
  clientesFiltradosTelefono: Cliente[];
  dirInputRef: React.RefObject<HTMLInputElement>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  handleGetUbicacion: () => void;
  handleCreateDireccionChange: (texto: string) => void;
  handleSelectCliente: (c: Cliente) => void;
  handleClienteTelefonoChange: (telefono: string) => void;
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
  geoLoading,
  clientesFiltrados,
  tecnicos,
  horariosOcupadosCreate,
  ordenesActivasCliente,
  buscandoTelefono,
  showTelefonoDropdown,
  setShowTelefonoDropdown,
  clientesFiltradosTelefono,
  dirInputRef,
  onSubmit,
  onClose,
  handleGetUbicacion,
  handleCreateDireccionChange,
  handleSelectCliente,
  handleClienteTelefonoChange,
}: OrdenCreateModalProps) {
  // Es cliente existente si clienteId está set y NO estamos en modo "nuevo cliente"
  const esClienteExistente = !!form.clienteId && !isNewCliente;
  // Estilo de input readonly (cliente existente: no editable, visual diferente)
  const readonlyInputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-blue-50/50 text-gray-700 cursor-not-allowed';
  const editableInputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]';
  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Crear Orden de Servicio"
      size="xl"
    >
      <form onSubmit={onSubmit} className="space-y-6">
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

            {/* Botón para crear nuevo cliente — visible siempre que no haya cliente seleccionado ni esté creándose uno */}
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

            {/* New client fields */}
            {(isNewCliente || form.clienteId) && (
              <div className={`rounded-xl p-4 space-y-3 ${esClienteExistente ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
                <div className="flex items-center justify-between">
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

                {/* Banner advertencia órdenes activas */}
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
                        // Pequeño delay para permitir click en dropdown
                        setTimeout(() => setShowTelefonoDropdown(false), 200);
                      }}
                      placeholder="8091234567"
                      className={editableInputClass}
                      autoComplete="off"
                    />
                    {/* Dropdown de coincidencias por teléfono */}
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
                    {/* Aviso inline: este teléfono ya existe (coincidencia por dígitos) */}
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
                    <div className="flex gap-2">
                      <input
                        ref={dirInputRef}
                        type="text"
                        value={form.clienteDireccion}
                        onChange={e => handleCreateDireccionChange(e.target.value)}
                        placeholder="Escribe un lugar, dirección o pega URL de Google Maps"
                        readOnly={esClienteExistente}
                        className={esClienteExistente ? `flex-1 ${readonlyInputClass}` : `flex-1 ${editableInputClass}`}
                        autoComplete="off"
                      />
                      {!esClienteExistente && (
                        <button
                          type="button"
                          onClick={handleGetUbicacion}
                          disabled={geoLoading}
                          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shrink-0 disabled:opacity-50"
                        >
                          <MapPin size={12} />
                          {geoLoading ? 'Obteniendo...' : 'Mi ubicacion'}
                        </button>
                      )}
                    </div>
                    {form.clienteLat && form.clienteLng && (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        {'\u{2705}'} Coordenadas exactas guardadas {'\u{00B7}'}
                        <a
                          href={`https://maps.google.com/?q=${form.clienteLat},${form.clienteLng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-700 hover:underline font-medium"
                        >
                          Ver en Maps {'\u{2192}'}
                        </a>
                      </p>
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
                  {TIPOS_EQUIPO.map(t => <option key={t} value={t} />)}
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
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Modelo</label>
                <input
                  type="text"
                  value={form.equipoModelo}
                  onChange={e => setForm(f => ({ ...f, equipoModelo: e.target.value }))}
                  placeholder="Modelo del equipo"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
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
          </div>
        </div>

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
                  const t = tecnicos.find(p => p.id === e.target.value);
                  setForm(f => ({ ...f, tecnicoId: e.target.value, tecnicoNombre: t?.nombre || '' }));
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] bg-white"
              >
                <option value="">Sin asignar</option>
                {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
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
            disabled={saving}
            className="px-6 py-2.5 bg-[#1a5fa8] hover:bg-[#0f3460] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Plus size={16} />
                Guardar Orden de Servicio
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
