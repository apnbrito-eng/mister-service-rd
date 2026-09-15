import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { equipoApi } from '../../services/equipoApi';
export default function SugerenciaIA({ waId, onUsar }: { waId: string; onUsar: (texto: string) => void }) {
  const [borrador, setBorrador] = useState('');
  const [error, setError] = useState('');
  const [fuentes, setFuentes] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const activo = useRef(waId);
  useEffect(() => { activo.current = waId; setBorrador(''); setError(''); setCargando(false); }, [waId]);
  async function sugerir() {
    const solicitado = waId; setCargando(true); setError('');
    try { const data = await equipoApi<{ borrador: string; fuentes: { titulo: string }[] }>('/api/ai/borrador', { waId }); if (activo.current === solicitado) { setBorrador(data.borrador); setFuentes(data.fuentes.map(f => f.titulo)); } }
    catch (e) { if (activo.current === solicitado) setError((e as Error).message); }
    finally { if (activo.current === solicitado) setCargando(false); }
  }
  return <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3"><button type="button" onClick={sugerir} disabled={cargando} className="inline-flex items-center gap-2 text-sm font-medium text-indigo-800 min-h-[44px]"><Sparkles size={17} />{cargando ? 'Preparando sugerencia…' : 'Ayúdame a responder'}</button><p className="text-xs text-gray-500">La IA prepara un borrador. Tú lo revisas y decides qué enviar.</p>{error && <p role="alert" className="text-sm text-red-700 mt-2">{error}</p>}{borrador && <div className="mt-3"><p className="whitespace-pre-wrap text-sm text-gray-800">{borrador}</p>{fuentes.length > 0 && <p className="text-xs text-gray-500 mt-2">Referencias facilitadas a la IA: {fuentes.join('; ')}</p>}<button type="button" onClick={() => { onUsar(borrador); setBorrador(''); }} className="mt-3 rounded-lg bg-primary text-white px-4 py-3 text-sm">Usar como borrador</button><button type="button" onClick={() => setBorrador('')} className="ml-3 p-3 text-sm">Descartar</button></div>}</div>;
}
