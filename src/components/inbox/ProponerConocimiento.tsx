import { useRef, useState } from 'react';
import { equipoApi } from '../../services/equipoApi';

/** Redacción manual: no recibe ni copia mensajes o datos del cliente. */
export default function ProponerConocimiento() {
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const enviando = useRef(false);
  const solicitud = useRef<{ huella: string; id: string } | null>(null);
  async function guardar() {
    if (enviando.current) return;
    enviando.current = true;
    setGuardando(true); setAviso('');
    try {
      const aporte = { titulo: titulo.trim(), contenido: contenido.trim() };
      const huella = JSON.stringify(aporte);
      if (solicitud.current?.huella !== huella) solicitud.current = { huella, id: crypto.randomUUID() };
      await equipoApi('/api/ai/conocimiento', { accion: 'crear', ...aporte, requestId: solicitud.current.id });
      solicitud.current = null;
      setTitulo(''); setContenido(''); setAbierto(false);
      setAviso('Propuesta guardada para revisión. No se publica automáticamente.');
    } catch (e) { setAviso((e as Error).message); }
    finally { enviando.current = false; setGuardando(false); }
  }
  return <div className="space-y-2">
    <button type="button" className="min-h-11 rounded-lg border px-3 py-2 text-sm" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} disabled={guardando}>Proponer conocimiento</button>
    {abierto && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void guardar(); }}>
      <p className="text-sm text-gray-600">Redacta un procedimiento general, sin nombres, teléfonos ni datos privados. Administración o coordinación lo revisarán antes de incorporarlo al conocimiento interno.</p>
      <label className="block">Título<input className="mt-1 min-h-11 w-full rounded-lg border p-2" disabled={guardando} value={titulo} onChange={e => setTitulo(e.target.value)} required minLength={5} maxLength={120} /></label>
      <label className="block">Procedimiento<textarea className="mt-1 w-full rounded-lg border p-2" rows={5} disabled={guardando} value={contenido} onChange={e => setContenido(e.target.value)} required minLength={20} maxLength={4000} /></label>
      <button type="submit" disabled={guardando} className="min-h-11 rounded-lg border px-3 py-2 disabled:opacity-50">{guardando ? 'Guardando…' : 'Enviar a revisión'}</button>
    </form>}
    {aviso && <p role="status">{aviso}</p>}
  </div>;
}
