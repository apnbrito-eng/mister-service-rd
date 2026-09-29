import EditarUbicacionCliente from '../clientes/EditarUbicacionCliente';
import {puede} from '../../utils/permisos';
import { useState } from 'react';
import { actualizarCliente } from '../../services/clientes.service';
import { useApp } from '../../context/AppContext';
import { coordsFromLatLng, googleMapsViewUrl } from '../../utils/maps';
import MiniMapaCliente from '../ordenes/MiniMapaCliente';
import type { Cliente } from '../../types';

export interface UbicacionClienteRecibida { id: string; lat: number; lng: number; etiqueta: string }

type Campos = Pick<Cliente, 'nombre' | 'email' | 'direccion' | 'sector' | 'ciudad' | 'referenciaDireccion'>;
const campos: { key: keyof Campos; label: string; type?: string }[] = [
  { key: 'nombre', label: 'Nombre' }, { key: 'email', label: 'Correo', type: 'email' },
  { key: 'direccion', label: 'Dirección' }, { key: 'sector', label: 'Sector' },
  { key: 'ciudad', label: 'Ciudad' }, { key: 'referenciaDireccion', label: 'Referencia de dirección' },
];
function copiarCampos(cliente: Cliente): Campos {
  return Object.fromEntries(campos.map(({ key }) => [key, cliente[key] ?? ''])) as Campos;
}
export default function FichaClienteCabecera({ cliente, onGuardar, ubicacionesRecibidas = [] }: { cliente: Cliente; ubicacionesRecibidas?: UbicacionClienteRecibida[]; onGuardar: (cliente: Cliente) => void }) {
  const { userProfile } = useApp();
  const puedeEditar = puede(userProfile,'clientesModificar');
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState(() => copiarCampos(cliente));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [cambiandoUbicacion, setCambiandoUbicacion] = useState(false);
  const coords = coordsFromLatLng(cliente.lat, cliente.lng);
  const mapa = googleMapsViewUrl(coords);
  async function guardar(event: React.FormEvent) {
    event.preventDefault();
    if (guardando || !puedeEditar) return;
    if (!valores.nombre.trim()) { setError('Escribe el nombre del cliente.'); return; }
    setGuardando(true); setError('');
    const cambios = Object.fromEntries(Object.entries(valores).map(([key, value]) => [key, value?.trim() ?? ''])) as Campos;
    try {
      await actualizarCliente(cliente.id, cambios);
      onGuardar({ ...cliente, ...cambios });
      setEditando(false); setConfirmacion('Ficha guardada.');
    } catch { setError('No se pudo guardar la ficha. Tus cambios siguen aquí para reintentar.'); }
    finally { setGuardando(false); }
  }
  return <section aria-label="Ficha del cliente" className="space-y-2">
    <div className="flex items-start justify-between gap-3">
      <h2 className="min-w-0 break-words text-lg font-semibold text-slate-900">{cliente.nombre}</h2>
      {puedeEditar && !editando && <button type="button" className="min-h-11 shrink-0 text-sm font-medium text-emerald-800" onClick={() => { setValores(copiarCampos(cliente)); setError(''); setConfirmacion(''); setEditando(true); }}>Editar ficha</button>}
    </div>
    <a className="inline-flex min-h-11 items-center text-sm text-slate-700" href={`tel:${cliente.telefono}`}>{cliente.telefono}</a>
    {editando ? <form onSubmit={guardar} className="space-y-3 rounded-xl border border-stone-200 bg-white p-3">
      <fieldset disabled={guardando} className="space-y-3">
        {campos.map(({ key, label, type }) => <label key={key} className="block text-sm text-slate-700">{label}<input name={key} type={type ?? 'text'} required={key === 'nombre'} value={valores[key] ?? ''} onChange={e => setValores(prev => ({ ...prev, [key]: e.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-stone-300 px-3 text-base" /></label>)}
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2"><button type="submit" disabled={guardando} className="min-h-11 rounded-lg bg-emerald-800 px-4 text-sm text-white disabled:opacity-60">{guardando ? 'Guardando…' : 'Guardar ficha'}</button><button type="button" disabled={guardando} onClick={() => { setEditando(false); setError(''); }} className="min-h-11 rounded-lg border px-4 text-sm">Cancelar</button></div>
    </form> : <>
      {cliente.email && <p className="break-words text-sm text-slate-600">{cliente.email}</p>}
      <p className="break-words text-sm text-slate-600">{[cliente.direccion, cliente.sector, cliente.ciudad].filter(Boolean).join(', ') || 'Dirección sin registrar'}</p>
      {cliente.referenciaDireccion && <p className="text-sm text-slate-600">{cliente.referenciaDireccion}</p>}
    </>}
    {coords && <MiniMapaCliente lat={coords.lat} lng={coords.lng} direccion={cliente.direccion} />}
    {mapa && <a href={mapa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-emerald-800 underline">Ver ubicación guardada</a>}
    {puedeEditar && !cambiandoUbicacion && <button type="button" disabled={guardando} className="block min-h-11 text-sm font-medium text-primary" onClick={() => { setCambiandoUbicacion(true); setConfirmacion(''); }}>{coords ? 'Cambiar ubicación' : 'Agregar ubicación'}</button>}
    {puedeEditar && <EditarUbicacionCliente cliente={cliente} isOpen={cambiandoUbicacion} onClose={()=>setCambiandoUbicacion(false)} ubicacionesRecibidas={ubicacionesRecibidas} onGuardar={data=>{onGuardar(data);setCambiandoUbicacion(false);setConfirmacion('Ubicación del cliente actualizada.');}}/>}
    {confirmacion && <p role="status" className="text-sm text-emerald-800">{confirmacion}</p>}
  </section>;
}
