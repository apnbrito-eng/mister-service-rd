import { MapPin } from 'lucide-react';
import { OrdenServicio, Personal } from '../../types';
import { HORARIOS, HORARIOS_LABEL } from '../../utils';

export interface EditFormState {
  tecnicoId: string;
  tecnicoNombre: string;
  fechaCita: string;
  horaInicio: string;
  clienteTelefono: string;
  clienteDireccion: string;
  clienteReferencia: string;
  clienteLat: number | undefined;
  clienteLng: number | undefined;
  descripcionFalla: string;
  notas: string;
}

interface OrdenEditFormProps {
  editForm: EditFormState;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormState>>;
  selectedOrden: OrdenServicio;
  tecnicos: Personal[];
  horariosOcupados: string[];
  onSave: () => void;
  onCancel: () => void;
  savingEdit: boolean;
  dirInputRef: React.RefObject<HTMLInputElement>;
  handleEditDireccionChange: (texto: string) => void;
  handleUsarMiUbicacionEdit: () => void;
  geoEditLoading: boolean;
}

export default function OrdenEditForm({
  editForm,
  setEditForm,
  selectedOrden,
  tecnicos,
  horariosOcupados,
  onSave,
  onCancel,
  savingEdit,
  dirInputRef,
  handleEditDireccionChange,
  handleUsarMiUbicacionEdit,
  geoEditLoading,
}: OrdenEditFormProps) {
  return (
    <div className="space-y-5">
      <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
        <p className="text-xs text-blue-500 font-medium">{'\u{270F}\u{FE0F}'} Editando orden {selectedOrden.numero}</p>
        <p className="text-lg font-bold text-gray-900">{selectedOrden.clienteNombre}</p>
        <p className="text-sm text-gray-500">{selectedOrden.equipoTipo}{selectedOrden.equipoMarca ? ` \u{00B7} ${selectedOrden.equipoMarca}` : ''}</p>
      </div>

      {/* Tecnico */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Tecnico</label>
        <select
          value={editForm.tecnicoId}
          onChange={e => {
            const t = tecnicos.find(x => x.id === e.target.value);
            setEditForm(f => ({ ...f, tecnicoId: e.target.value, tecnicoNombre: t?.nombre || '' }));
          }}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
        >
          <option value="">Sin asignar</option>
          {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </div>

      {/* Fecha + Hora */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de Cita</label>
          <input
            type="date"
            value={editForm.fechaCita}
            onChange={e => setEditForm(f => ({ ...f, fechaCita: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hora de Inicio</label>
          <div className="grid grid-cols-5 gap-1">
            {HORARIOS.map(h => {
              const ocupado = horariosOcupados.includes(h);
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => !ocupado && setEditForm(f => ({ ...f, horaInicio: h }))}
                  disabled={ocupado}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    ocupado
                      ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed line-through'
                      : editForm.horaInicio === h
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
          {editForm.tecnicoId && editForm.fechaCita && horariosOcupados.length > 0 && (
            <p className="text-[10px] text-red-500 mt-1">{'\u{26A0}\u{FE0F}'} {horariosOcupados.length} horario(s) ocupado(s) ese dia</p>
          )}
        </div>
      </div>

      {/* Telefono de Contacto */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Telefono de Contacto</label>
        <input
          type="tel"
          value={editForm.clienteTelefono}
          onChange={e => setEditForm(f => ({ ...f, clienteTelefono: e.target.value }))}
          placeholder="Ej: 8095551234"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
        />
        <p className="text-[11px] text-gray-400 mt-1">Puede ser diferente al telefono principal del cliente</p>
      </div>

      {/* Direccion de la Cita (Google Places Autocomplete) */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Direccion de la Cita</label>
        <div className="flex gap-2">
          <input
            ref={dirInputRef}
            type="text"
            value={editForm.clienteDireccion}
            onChange={e => handleEditDireccionChange(e.target.value)}
            placeholder="Escribe o pega direccion, URL de Maps, o coordenadas..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={handleUsarMiUbicacionEdit}
            disabled={geoEditLoading}
            className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-60"
          >
            <MapPin size={12} /> {geoEditLoading ? '...' : 'Usar mi ubicacion actual'}
          </button>
        </div>
        {editForm.clienteLat && editForm.clienteLng && (
          <p className="text-[11px] text-green-600 mt-1 flex items-center gap-1">
            {'\u{2705}'} Coordenadas exactas guardadas {'\u{00B7}'}
            <a
              href={`https://maps.google.com/?q=${editForm.clienteLat},${editForm.clienteLng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-700 hover:underline font-medium"
            >
              Ver en Maps {'\u{2192}'}
            </a>
          </p>
        )}
      </div>

      {/* Referencia de direccion */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Referencia de direccion</label>
        <input
          type="text"
          value={editForm.clienteReferencia}
          onChange={e => setEditForm(f => ({ ...f, clienteReferencia: e.target.value }))}
          placeholder="Ej: Frente a Agora Mall, casa esquina, porton azul..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
        />
      </div>

      {/* Descripcion de la Falla */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Descripcion de la Falla</label>
        <textarea
          value={editForm.descripcionFalla}
          onChange={e => setEditForm(f => ({ ...f, descripcionFalla: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
        />
      </div>

      {/* Notas */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
        <textarea
          value={editForm.notas}
          onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
        />
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={savingEdit}
          className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={savingEdit}
          className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          {savingEdit ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
