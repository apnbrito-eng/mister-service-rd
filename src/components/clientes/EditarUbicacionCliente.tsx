import { useEffect, useRef, useState } from 'react';
import type { Cliente } from '../../types';
import Modal from '../Modal';
import MiniMapaCliente from '../ordenes/MiniMapaCliente';
import { actualizarCliente } from '../../services/clientes.service';
import { detectarCoordenadasURL } from '../../utils/direccion';
export interface UbicacionRecibidaCliente { id: string; lat: number; lng: number; etiqueta: string }
interface Props { cliente: Cliente; isOpen: boolean; onClose: () => void; onGuardar: (cliente: Cliente) => void; ubicacionesRecibidas?: UbicacionRecibidaCliente[] }
function coordenadasClienteValidas(lat: string, lng: string) {
  if (!lat.trim() || !lng.trim()) return null;
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null;
}
export default function EditarUbicacionCliente({ cliente, isOpen, onClose, onGuardar, ubicacionesRecibidas = [] }: Props) {
  const [lat, setLat] = useState(''), [lng, setLng] = useState(''), [enlace, setEnlace] = useState('');
  const [error, setError] = useState(''), [guardando, setGuardando] = useState(false);
  const bloqueado = useRef(false);
  // Inicializar al abrir/cambiar cliente; una actualización remota no pisa el borrador.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isOpen) { setLat(cliente.lat === undefined ? '' : String(cliente.lat)); setLng(cliente.lng === undefined ? '' : String(cliente.lng)); setEnlace(''); setError(''); } }, [isOpen, cliente.id]);
  const coords = coordenadasClienteValidas(lat, lng);
  const recibidasValidas = ubicacionesRecibidas.filter(p => coordenadasClienteValidas(String(p.lat), String(p.lng)));
  function leerEnlace() {
    let url: URL;
    try { url = new URL(enlace); } catch { setError('Pega un enlace de mapas con coordenadas completas.'); return; }
    if (url.protocol !== 'https:' || !/^(www\.)?(google\.[a-z.]+|maps\.google\.[a-z.]+|maps\.apple\.com|waze\.com)$/.test(url.hostname)) { setError('Usa un enlace de Google Maps, Apple Maps o Waze.'); return; }
    const p = detectarCoordenadasURL(enlace);
    if (!p || !coordenadasClienteValidas(String(p.lat), String(p.lng))) { setError('El enlace no contiene coordenadas. Introduce latitud y longitud; los enlaces cortos no se expanden.'); return; }
    setLat(String(p.lat)); setLng(String(p.lng)); setError('');
  }
  async function guardar(e: React.FormEvent) {
    e.preventDefault(); if (bloqueado.current) return;
    if (!coords) { setError('Introduce latitud y longitud válidas.'); return; }
    bloqueado.current = true; setGuardando(true); setError('');
    try { await actualizarCliente(cliente.id, { ...coords, zona: cliente.zona || '' }); onGuardar({ ...cliente, ...coords }); onClose(); }
    catch { console.error('[clientes/ubicacion] No se pudo guardar', { codigo: 'UBICACION_CLIENTE_ERROR' }); setError('No se pudo guardar la ubicación. Tus cambios siguen aquí para reintentar.'); }
    finally { bloqueado.current = false; setGuardando(false); }
  }
  return <Modal movimiento isOpen={isOpen} onClose={() => { if (!guardando) onClose(); }} title="Ubicación del cliente">
    <form onSubmit={guardar} className="space-y-4">
      <p className="text-sm text-gray-600">La dirección escrita se conserva al cambiar el mapa.</p>
      {!!recibidasValidas.length && <label className="block text-sm">Ubicación recibida<select name="ubicacionRecibida" defaultValue="" className="block w-full min-h-11 border rounded-lg" onChange={e => { const p = recibidasValidas.find(v => v.id === e.target.value); if (p) { setLat(String(p.lat)); setLng(String(p.lng)); } }}><option value="">Seleccionar ubicación</option>{recibidasValidas.map(p => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}</select></label>}
      <label className="block text-sm">Enlace de mapas<input value={enlace} onChange={e => setEnlace(e.target.value)} className="block w-full min-h-11 border rounded-lg px-3" /></label>
      <button type="button" onClick={leerEnlace} className="min-h-11 underline">Usar coordenadas del enlace</button>
      <div className="grid grid-cols-2 gap-3"><label>Latitud<input inputMode="decimal" value={lat} onChange={e => setLat(e.target.value)} className="block w-full min-h-11 border rounded-lg px-3" /></label><label>Longitud<input inputMode="decimal" value={lng} onChange={e => setLng(e.target.value)} className="block w-full min-h-11 border rounded-lg px-3" /></label></div>
      {coords && <MiniMapaCliente {...coords} direccion={cliente.direccion} />}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3"><button type="button" disabled={guardando} onClick={onClose} className="min-h-11 px-3">Cancelar</button><button disabled={guardando} className="min-h-11 px-4 rounded-lg bg-primary text-white">{guardando ? 'Guardando…' : 'Guardar ubicación'}</button></div>
    </form>
  </Modal>;
}
