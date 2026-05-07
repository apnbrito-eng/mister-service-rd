import { useEffect, useState } from 'react';
import { MapPin, User, Wrench, Calendar, Camera, X as XIcon } from 'lucide-react';
import { OrdenServicio, Personal } from '../../types';
import { HORARIOS, HORARIOS_LABEL, DURACIONES } from '../../utils';
import { useTiposEquipo } from '../../hooks/useTiposEquipo';
import MiniMapaCliente from './MiniMapaCliente';

const MARCAS_SUGERIDAS = ['LG', 'Samsung', 'Mabe', 'Whirlpool', 'GE', 'Frigidaire'];

export interface EditFormState {
  // Cliente
  clienteNombre: string;
  clienteEmail: string;
  clienteTelefono: string;
  clienteDireccion: string;
  clienteReferencia: string;
  clienteLat: number | undefined;
  clienteLng: number | undefined;
  // Equipo
  equipoTipo: string;
  equipoMarca: string;
  equipoModelo: string;
  descripcionFalla: string;
  fotoEquipoUrl?: string;
  // Programación
  tecnicoId: string;
  tecnicoNombre: string;
  duracionMin: number;
  fechaCita: string;
  horaInicio: string;
  // Notas
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
  // Manejo de foto del equipo (el padre sube a Storage al guardar)
  fotoFile: File | null;
  onPickFoto: (file: File) => void;
  onQuitarFoto: () => void;
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
  fotoFile,
  onPickFoto,
  onQuitarFoto,
}: OrdenEditFormProps) {
  const tiposEquipo = useTiposEquipo();
  // Derivar operaria del técnico actualmente elegido
  const tecnicoElegido = tecnicos.find(t => t.id === editForm.tecnicoId);
  const operariaNuevaNombre = tecnicoElegido?.operariaNombre;
  const operariaPrevNombre = selectedOrden.operariaNombre;
  const cambiaDeGrupo = !!editForm.tecnicoId &&
    (operariaNuevaNombre || '') !== (operariaPrevNombre || '');

  // Preview local del file nuevo (blob URL). Si no hay file nuevo, se muestra la URL existente.
  const [fotoPreviewNueva, setFotoPreviewNueva] = useState<string | null>(null);
  useEffect(() => {
    if (!fotoFile) {
      setFotoPreviewNueva(null);
      return;
    }
    const url = URL.createObjectURL(fotoFile);
    setFotoPreviewNueva(url);
    return () => URL.revokeObjectURL(url);
  }, [fotoFile]);

  const fotoVisible = fotoPreviewNueva || editForm.fotoEquipoUrl || null;

  return (
    <div className="space-y-6">
      <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
        <p className="text-xs text-blue-500 font-medium">{'\u{270F}\u{FE0F}'} Editando orden {selectedOrden.numero}</p>
        <p className="text-sm text-gray-600">Creada {selectedOrden.createdAt ? new Date(selectedOrden.createdAt).toLocaleDateString('es-DO') : ''}</p>
      </div>

      {/* ─────────── SECCIÓN CLIENTE ─────────── */}
      <div>
        <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3 flex items-center gap-2">
          <User size={16} /> Cliente
        </h3>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
              <input
                type="text"
                value={editForm.clienteNombre}
                onChange={e => setEditForm(f => ({ ...f, clienteNombre: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono de contacto</label>
              <input
                type="tel"
                value={editForm.clienteTelefono}
                onChange={e => setEditForm(f => ({ ...f, clienteTelefono: e.target.value }))}
                placeholder="Ej: 8095551234"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email (opcional)</label>
            <input
              type="email"
              value={editForm.clienteEmail}
              onChange={e => setEditForm(f => ({ ...f, clienteEmail: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
            <div className="flex gap-2">
              <input
                ref={dirInputRef}
                type="text"
                value={editForm.clienteDireccion}
                onChange={e => handleEditDireccionChange(e.target.value)}
                placeholder="Escribe o pega dirección, URL de Maps, o coordenadas..."
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={handleUsarMiUbicacionEdit}
                disabled={geoEditLoading}
                className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-60"
              >
                <MapPin size={12} /> {geoEditLoading ? '...' : 'Mi ubicación'}
              </button>
            </div>
            {editForm.clienteLat !== undefined && editForm.clienteLng !== undefined && (
              <MiniMapaCliente
                lat={editForm.clienteLat}
                lng={editForm.clienteLng}
                direccion={editForm.clienteDireccion}
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Referencia de dirección</label>
            <input
              type="text"
              value={editForm.clienteReferencia}
              onChange={e => setEditForm(f => ({ ...f, clienteReferencia: e.target.value }))}
              placeholder="Al lado del colmado, frente al parque..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>
        </div>
      </div>

      {/* ─────────── SECCIÓN EQUIPO ─────────── */}
      <div>
        <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3 flex items-center gap-2">
          <Wrench size={16} /> Equipo
        </h3>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de equipo *</label>
              <input
                type="text"
                list="edit-tipos-equipo"
                value={editForm.equipoTipo}
                onChange={e => setEditForm(f => ({ ...f, equipoTipo: e.target.value }))}
                placeholder="Lavadora, Nevera..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
              <datalist id="edit-tipos-equipo">
                {tiposEquipo.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Marca</label>
              <input
                type="text"
                list="edit-marcas"
                value={editForm.equipoMarca}
                onChange={e => setEditForm(f => ({ ...f, equipoMarca: e.target.value }))}
                placeholder="LG, Samsung, Mabe..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
              <datalist id="edit-marcas">
                {MARCAS_SUGERIDAS.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Modelo</label>
              <input
                type="text"
                value={editForm.equipoModelo}
                onChange={e => setEditForm(f => ({ ...f, equipoModelo: e.target.value }))}
                placeholder="Modelo"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción de la falla</label>
            <textarea
              value={editForm.descripcionFalla}
              onChange={e => setEditForm(f => ({ ...f, descripcionFalla: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Foto del equipo</label>
            {fotoVisible ? (
              <div className="space-y-2">
                <img
                  src={fotoVisible}
                  alt="Foto del equipo"
                  className="w-full max-w-xs rounded-lg border border-gray-200 object-cover"
                />
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer transition-colors">
                    <Camera size={12} /> Cambiar foto
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) onPickFoto(file);
                      }}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={onQuitarFoto}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <XIcon size={12} /> Quitar foto
                  </button>
                </div>
              </div>
            ) : (
              <label className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer transition-colors">
                <Camera size={14} />
                Agregar foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) onPickFoto(file);
                  }}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* ─────────── SECCIÓN PROGRAMACIÓN ─────────── */}
      <div>
        <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3 flex items-center gap-2">
          <Calendar size={16} /> Programación
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Técnico</label>
            <select
              value={editForm.tecnicoId}
              onChange={e => {
                // BUG fix (P-006): el value del option es el auth.uid del técnico
                // (personal.uid), NO el doc id de personal. Ver OrdenCreateModal.tsx
                // para el contexto completo del bug.
                const t = tecnicos.find(x => (x.uid || x.id) === e.target.value);
                setEditForm(f => ({ ...f, tecnicoId: e.target.value, tecnicoNombre: t?.nombre || '' }));
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            >
              <option value="">Sin asignar</option>
              {tecnicos.filter(t => t.uid).map(t => (
                <option key={t.id} value={t.uid}>{t.nombre}</option>
              ))}
            </select>
            {editForm.tecnicoId && operariaNuevaNombre && (
              <p className={`text-[11px] mt-1 ${cambiaDeGrupo ? 'text-purple-700' : 'text-gray-500'}`}>
                {cambiaDeGrupo
                  ? `Esta orden pasará al grupo de ${operariaNuevaNombre}.`
                  : `Grupo: ${operariaNuevaNombre}.`}
              </p>
            )}
            {editForm.tecnicoId && !operariaNuevaNombre && (
              <p className="text-[11px] text-amber-600 mt-1">
                Este técnico no tiene operaria asignada.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Duración</label>
            <div className="flex flex-wrap gap-2">
              {DURACIONES.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setEditForm(f => ({ ...f, duracionMin: d }))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    editForm.duracionMin === d
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de cita</label>
              <input
                type="date"
                value={editForm.fechaCita}
                onChange={e => setEditForm(f => ({ ...f, fechaCita: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hora de inicio</label>
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
                <p className="text-[10px] text-red-500 mt-1">{'\u{26A0}\u{FE0F}'} {horariosOcupados.length} horario(s) ocupado(s) ese día</p>
              )}
            </div>
          </div>
        </div>
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
