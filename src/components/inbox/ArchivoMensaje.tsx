import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { equipoApi } from '../../services/equipoApi';
import type { WhatsAppMensajeInbox } from '../../types';

const DocumentoPdf = lazy(() => import('./DocumentoPdf'));

export default function ArchivoMensaje({ mensaje }: { mensaje: WhatsAppMensajeInbox }) {
  const [url, setUrl] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const contenedor = useRef<HTMLDivElement>(null);
  const solicitando = useRef(false);
  const { tipo, contenido } = mensaje;
  const esPdf = tipo === 'document' && (contenido.mediaMimeType?.split(';')[0].trim().toLowerCase() === 'application/pdf' || /\.pdf$/i.test(contenido.mediaFilename || ''));
  const visual = ['image', 'video', 'sticker'].includes(tipo);
  const cargar = useCallback(async () => {
    if (solicitando.current) return;
    solicitando.current = true; setCargando(true); setError('');
    try {
      const r = await equipoApi<{ urlImagen: string }>('/api/whatsapp/media-proxy', { wamid: mensaje.wamid, wa_id: mensaje.wa_id });
      setUrl(r.urlImagen);
    } catch { setError('No se pudo cargar el archivo. Pulsa para reintentar.'); }
    finally { solicitando.current = false; setCargando(false); }
  }, [mensaje.wamid, mensaje.wa_id]);
  useEffect(() => {
    if (!visual && !esPdf) return;
    if (typeof IntersectionObserver === 'undefined') { void cargar(); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { observer.disconnect(); void cargar(); }
    }, { rootMargin: '200px' });
    if (contenedor.current) observer.observe(contenedor.current);
    return () => observer.disconnect();
  }, [visual, esPdf, cargar]);
  const titulo = contenido.mediaFilename || 'Abrir documento';
  return <div ref={contenedor} className="min-w-0 space-y-2">
    {esPdf && url && <Suspense fallback={<p role="status">Preparando PDF…</p>}><DocumentoPdf url={url} nombre={contenido.mediaFilename || "Documento PDF"} /></Suspense>}
    {visual && <div className="w-[240px] max-w-full aspect-[4/3] rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center">
      {!url && <span role="status" className="text-xs text-slate-500">{error ? 'Vista previa no disponible' : 'Cargando vista previa…'}</span>}
      {url && tipo !== 'video' && <a href={url} target="_blank" rel="noopener noreferrer" className="h-full w-full"><img src={url} alt={contenido.mediaCaption || 'Imagen del cliente'} className="w-full h-full object-contain" onError={() => { setUrl(''); setError('No se pudo mostrar la imagen. Reintentar.'); }} /></a>}
      {url && tipo === 'video' && <video controls playsInline preload="metadata" src={url + '#t=0.1'} className="w-full h-full object-contain" onError={() => { setUrl(''); setError('No se pudo mostrar el video. Reintentar.'); }} />}
    </div>}
    {!url && (!visual || error) && <button type="button" className="min-h-11 text-sm underline" disabled={cargando} onClick={cargar}>{cargando ? 'Cargando archivo…' : error ? 'Reintentar' : titulo}</button>}
    {url && tipo === 'audio' && <audio controls preload="metadata" src={url} className="max-w-full" />}
    {url && !visual && !esPdf && <a href={url} target="_blank" rel="noopener noreferrer" className="block text-xs underline break-all">Abrir {contenido.mediaFilename || 'archivo'}</a>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
