import { useEffect, useRef, useState } from 'react';
import type { Cliente } from '../../types';
import Modal from '../Modal';
import MiniMapaCliente from '../ordenes/MiniMapaCliente';
import { actualizarCliente } from '../../services/clientes.service';
import { equipoApi } from '../../services/equipoApi';
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
  const solicitud = useRef(0);
  const [resolviendo, setResolviendo] = useState(false);
  useEffect(() => { const contador = solicitud; contador.current++; setResolviendo(false); return () => { contador.current++; }; }, [isOpen, cliente.id]);
  // Inicializar al abrir/cambiar cliente; una actualización remota no pisa el borrador.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isOpen) { setLat(cliente.lat === undefined ? '' : String(cliente.lat)); setLng(cliente.lng === undefined ? '' : String(cliente.lng)); setEnlace(''); setError(''); } }, [isOpen, cliente.id]);
  const coords = coordenadasClienteValidas(lat, lng);
  const recibidasValidas = ubicacionesRecibidas.filter(p => coordenadasClienteValidas(String(p.lat), String(p.lng)));
  function leerEnlace(texto: string) {
    solicitud.current++; setResolviendo(false); setEnlace(texto);
    const p = detectarCoordenadasURL(texto);
    if (!p || !coordenadasClienteValidas(String(p.lat), String(p.lng))) {
      // No permitir que se guarde accidentalmente la ubicación anterior.
      setLat(''); setLng('');
      setError(texto.trim() ? 'No encontramos coordenadas todavía. Para un enlace corto de Google Maps, pulsa Obtener ubicación del enlace.' : '');
      return;
    }
    setLat(String(p.lat)); setLng(String(p.lng)); setError('');
  }
  async function resolverCorto() {
    const turno = ++solicitud.current;
    const url = enlace.match(/https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[^\s]+/)?.[0];
    if (!url) { setError('Pega un enlace corto de Google Maps válido.'); return; }
    setResolviendo(true); setError(''); setLat(''); setLng('');
    try {
      const resultado = await equipoApi<{enlace:string}>('/api/mapa/ubicacion', {enlace:url});
      if (solicitud.current !== turno) return;
      leerEnlace(resultado.enlace);
    } catch { if (solicitud.current === turno) setError('No pudimos obtener la ubicación. Reintenta o copia el enlace completo desde Google Maps.'); }
    finally { if (solicitud.current === turno) setResolviendo(false); }
  }
  async function guardar(e: React.FormEvent) {
    e.preventDefault(); if (bloqueado.current || resolviendo) return;
    if (!coords) { setError('Pega una ubicación válida antes de guardar.'); return; }
    bloqueado.current = true; setGuardando(true); setError('');
    try { await actualizarCliente(cliente.id, { ...coords, zona: cliente.zona || '' }); onGuardar({ ...cliente, ...coords }); onClose(); }
    catch { console.error('[clientes/ubicacion] No se pudo guardar', { codigo: 'UBICACION_CLIENTE_ERROR' }); setError('No se pudo guardar la ubicación. Tus cambios siguen aquí para reintentar.'); }
    finally { bloqueado.current = false; setGuardando(false); }
  }
  return <Modal movimiento isOpen={isOpen} onClose={() => { if (!guardando) onClose(); }} title="Ubicación del cliente">
    <form onSubmit={guardar} className="space-y-4">
      <p className="text-sm text-gray-600">La dirección escrita se conserva al cambiar el mapa.</p>
      {!!recibidasValidas.length && <label className="block text-sm">Ubicación recibida<select name="ubicacionRecibida" defaultValue="" className="block w-full min-h-11 border rounded-lg" onChange={e => { const p = recibidasValidas.find(v => v.id === e.target.value); if (p) { solicitud.current++; setResolviendo(false); setLat(String(p.lat)); setLng(String(p.lng)); setEnlace(`${p.lat}, ${p.lng}`); setError(''); } }}><option value="">Seleccionar ubicación</option>{recibidasValidas.map(p => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}</select></label>}
      <label className="block text-sm">Pega la ubicación<input aria-label="Pega la ubicación" placeholder="18.4933865, -69.997765 o enlace de mapas" value={enlace} onChange={e => leerEnlace(e.target.value)} className="block w-full min-h-11 border rounded-lg px-3" /></label>
      <p className="text-sm text-gray-600">Coordenadas juntas, enlaces completos de Google Maps, Apple Maps o Waze, y ubicaciones compartidas por WhatsApp. Revisa el punto antes de guardar.</p>
      {/https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//.test(enlace) && <button type="button" disabled={resolviendo || guardando} onClick={resolverCorto} className="min-h-11 underline">{resolviendo ? 'Obteniendo ubicación…' : 'Obtener ubicación del enlace'}</button>}
      {coords && <MiniMapaCliente {...coords} direccion={cliente.direccion} />}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3"><button type="button" disabled={guardando} onClick={onClose} className="min-h-11 px-3">Cancelar</button><button disabled={guardando || resolviendo || !coords} className="min-h-11 px-4 rounded-lg bg-primary text-white">{guardando ? 'Guardando…' : 'Guardar ubicación'}</button></div>
    </form>
  </Modal>;
}
