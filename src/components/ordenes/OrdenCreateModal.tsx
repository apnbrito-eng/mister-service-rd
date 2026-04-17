import { Plus, User, Wrench, Calendar, MapPin } from 'lucide-react';
import { Cliente, Personal } from '../../types';
import {
  TIPOS_EQUIPO, DURACIONES, HORARIOS, HORARIOS_LABEL,
  formatTelefono,
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
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  handleGetUbicacion: () => void;
  handleCreateDireccionChange: (texto: string) => void;
  handleSelectCliente: (c: Cliente) => void;
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
  onSubmit,
  onClose,
  handleGetUbicacion,
  handleCreateDireccionChange,
  handleSelectCliente,
}: OrdenCreateModalProps) {
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
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#1a5fa8]">
                    {isNewCliente ? 'Datos del nuevo cliente' : 'Datos del cliente'}
                  </p>
                  {isNewCliente && (
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                    <input
                      type="text"
                      value={form.clienteNombre}
                      onChange={e => setForm(f => ({ ...f, clienteNombre: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Telefono *</label>
                    <input
                      type="tel"
                      value={form.clienteTelefono}
                      onChange={e => setForm(f => ({ ...f, clienteTelefono: e.target.value }))}
                      placeholder="8091234567"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email (opcional)</label>
                    <input
                      type="email"
                      value={form.clienteEmail}
                      onChange={e => setForm(f => ({ ...f, clienteEmail: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Direccion</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.clienteDireccion}
                        onChange={e => handleCreateDireccionChange(e.target.value)}
                        placeholder="Calle, sector, ciudad o URL de Google Maps"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                      />
                      <button
                        type="button"
                        onClick={handleGetUbicacion}
                        disabled={geoLoading}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shrink-0 disabled:opacity-50"
                      >
                        <MapPin size={12} />
                        {geoLoading ? 'Obteniendo...' : 'Mi ubicacion'}
                      </button>
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
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
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
