import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Phone, Pencil, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../Modal';
import { suscribirSuplidores, guardarSuplidor, cambiarActivoSuplidor } from '../../services/suplidores.service';
import { filtrarSuplidores, type Suplidor } from '../../utils/consultaSuplidor';

interface Props {
  puedeGestionar: boolean;
  /** Si se pasa, cada suplidor muestra un botón para elegirlo. */
  onSeleccionar?: (s: Suplidor) => void;
}

const VACIO = { nombre: '', telefono: '', especialidad: '', notas: '' };

export default function DirectorioSuplidores({ puedeGestionar, onSeleccionar }: Props) {
  const [lista, setLista] = useState<Suplidor[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<Suplidor | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => suscribirSuplidores(
    datos => { setLista(datos); setError(''); setCargando(false); },
    mensaje => { setError(mensaje); setCargando(false); },
  ), []);

  const visibles = useMemo(() => filtrarSuplidores(lista, texto, verInactivos), [lista, texto, verInactivos]);

  const abrirNuevo = () => { setEditando(null); setForm(VACIO); setAbierto(true); };
  const abrirEdicion = (s: Suplidor) => { setEditando(s); setForm({ nombre: s.nombre, telefono: s.telefono, especialidad: s.especialidad, notas: s.notas || '' }); setAbierto(true); };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    try {
      await guardarSuplidor(form, editando?.id);
      toast.success(editando ? 'Suplidor actualizado' : 'Suplidor registrado');
      setAbierto(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const alternar = async (s: Suplidor) => {
    try {
      await cambiarActivoSuplidor(s.id, !s.activo);
      toast.success(s.activo ? 'Suplidor desactivado' : 'Suplidor reactivado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar');
    }
  };

  return (
    <div className="space-y-4" data-tab="suplidores">
      <div className="flex flex-wrap gap-2 items-center">
        <label className="relative flex-1 min-w-[200px]">
          <span className="sr-only">Buscar suplidor</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por nombre, especialidad o teléfono"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} /> Ver inactivos
        </label>
        {puedeGestionar && (
          <button type="button" onClick={abrirNuevo}
            className="flex items-center gap-2 bg-primary hover:bg-primary-medium text-white px-4 py-2.5 rounded-xl text-sm font-medium min-h-[44px]">
            <Plus size={16} /> Nuevo suplidor
          </button>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{error}</p>}

      {cargando ? (
        <p className="text-sm text-gray-500">Cargando suplidores…</p>
      ) : visibles.length === 0 && !error ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
          {lista.length === 0 ? 'Todavía no hay suplidores registrados.' : 'Ningún suplidor coincide con la búsqueda.'}
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {visibles.map(s => (
            <li key={s.id} className={`bg-white rounded-2xl border p-4 ${s.activo ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
              <p className="font-semibold text-gray-900 break-words">{s.nombre}</p>
              <p className="text-sm text-gray-600 break-words">{s.especialidad}</p>
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><Phone size={12} aria-hidden="true" /> {s.telefono}</p>
              {s.notas && <p className="text-xs text-gray-500 mt-2 break-words">{s.notas}</p>}
              {!s.activo && <p className="text-xs text-gray-500 mt-1">Inactivo</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                {onSeleccionar && s.activo && (
                  <button type="button" onClick={() => onSeleccionar(s)} className="bg-primary text-white rounded-lg px-3 py-2 text-sm min-h-[44px]">Elegir</button>
                )}
                {puedeGestionar && (
                  <>
                    <button type="button" onClick={() => abrirEdicion(s)} className="flex items-center gap-1 border rounded-lg px-3 py-2 text-sm min-h-[44px]"><Pencil size={14} aria-hidden="true" /> Editar</button>
                    <button type="button" onClick={() => alternar(s)} className="flex items-center gap-1 border rounded-lg px-3 py-2 text-sm min-h-[44px]"><Power size={14} aria-hidden="true" /> {s.activo ? 'Desactivar' : 'Reactivar'}</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={abierto} onClose={() => setAbierto(false)} title={editando ? 'Editar suplidor' : 'Nuevo suplidor'}>
        <form onSubmit={guardar} className="space-y-3">
          <label className="block text-sm">Nombre
            <input required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} maxLength={120}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5" />
          </label>
          <label className="block text-sm">Teléfono (RD)
            <input required inputMode="tel" value={form.telefono} disabled={!!editando} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} maxLength={40}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 disabled:bg-gray-50" />
            {editando && <span className="block text-xs text-gray-500 mt-1">Para cambiar el teléfono, desactiva este suplidor y registra uno nuevo.</span>}
          </label>
          <label className="block text-sm">Especialidad
            <input required value={form.especialidad} onChange={e => setForm(f => ({ ...f, especialidad: e.target.value }))} maxLength={120}
              placeholder="Ej.: piezas de lavadora, compresores" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5" />
          </label>
          <label className="block text-sm">Notas (opcional)
            <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} maxLength={500} rows={2}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAbierto(false)} className="border rounded-xl px-4 py-2.5 text-sm min-h-[44px]">Cancelar</button>
            <button type="submit" disabled={guardando} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm min-h-[44px] disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
