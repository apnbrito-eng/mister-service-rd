import { useEffect, useState } from 'react';
import { detectarCoordenadasURL, type Coords } from '../../utils/direccion';
import { equipoApi } from '../../services/equipoApi';
import MiniMapaCliente from '../ordenes/MiniMapaCliente';
export interface EstadoUbicacionPegada { coords: Coords | null; pendiente: boolean; invalida: boolean }
export default function UbicacionPegada({ onCambio, direccion, recibidas = [] }: {
  onCambio: (estado: EstadoUbicacionPegada) => void;
  direccion: string;
  recibidas?: { id: string; lat: number; lng: number; etiqueta: string }[];
}) {
  const [texto, setTexto] = useState('');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState('');
  const [pendiente, setPendiente] = useState(false);
  const [intento, setIntento] = useState(0);
  const corto = texto.match(/https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[^\s]+/)?.[0];
  function cambiar(valor: string) {
    const punto = detectarCoordenadasURL(valor);
    const cortoNuevo = /https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//.test(valor);
    setTexto(valor); setCoords(punto); setError(''); setPendiente(!punto && cortoNuevo);
    onCambio({ coords: punto, pendiente: !punto && cortoNuevo, invalida: !!valor.trim() && !punto && !cortoNuevo });
  }
  useEffect(() => {
    if (!corto || detectarCoordenadasURL(texto)) return;
    let vigente = true;
    setPendiente(true); setError('');
    onCambio({ coords: null, pendiente: true, invalida: false });
    const timer = setTimeout(async () => {
      try {
        const resultado = await equipoApi<{ enlace: string }>('/api/mapa/ubicacion', { enlace: corto });
        if (!vigente) return;
        const punto = detectarCoordenadasURL(resultado.enlace);
        if (!punto) throw new Error('Sin coordenadas');
        setCoords(punto); setPendiente(false);
        onCambio({ coords: punto, pendiente: false, invalida: false });
      } catch {
        if (!vigente) return;
        setPendiente(false); setError('No pudimos obtener el punto. Reintenta o pega el enlace completo de Google Maps.');
        onCambio({ coords: null, pendiente: false, invalida: true });
      }
    }, 400);
    return () => { vigente = false; clearTimeout(timer); };
  }, [corto, texto, intento, onCambio]);
  return <div className="space-y-2">
    {!!recibidas.length && <label className="block text-sm">Ubicación recibida en el chat<select className="block w-full min-h-11 rounded-lg border" defaultValue="" onChange={e => { const p = recibidas.find(v => v.id === e.target.value); if (p) cambiar(`${p.lat}, ${p.lng}`); }}><option value="">Seleccionar ubicación</option>{recibidas.map(p => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}</select></label>}
    <label className="block text-sm">Pega la ubicación<input aria-label="Pega la ubicación" value={texto} onChange={e => cambiar(e.target.value)} placeholder="Pega aquí el location o enlace de Google Maps" className="mt-1 min-h-11 w-full rounded-lg border p-2 text-base" /></label>
    <p className="text-sm text-gray-600">Las coordenadas se obtienen automáticamente. Revisa el punto antes de guardar.</p>
    {pendiente && <p role="status">Obteniendo ubicación…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}<button type="button" className="block min-h-11 underline" onClick={() => setIntento(n => n + 1)}>Reintentar ubicación</button></p>}
    {!!texto.trim() && !coords && !corto && <p role="alert">Pega una ubicación o un enlace de mapas válido.</p>}
    {coords && <MiniMapaCliente {...coords} direccion={direccion} />}
  </div>;
}
