import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Minus, Plus } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

function Pagina({ pdf, numero, ancho }: { pdf: PDFDocumentProxy; numero: number; ancho: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [estado, setEstado] = useState('Cargando página…');
  useEffect(() => {
    let cancelado = false;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setEstado('Cargando página…');
    void pdf.getPage(numero).then(async page => {
      if (cancelado || !canvas.current) return;
      const viewport = page.getViewport({ scale: ancho / page.getViewport({ scale: 1 }).width });
      const factor = Math.min(window.devicePixelRatio || 1, 2);
      const target = canvas.current;
      target.width = Math.ceil(viewport.width * factor);
      target.height = Math.ceil(viewport.height * factor);
      target.style.width = `${viewport.width}px`; target.style.height = `${viewport.height}px`;
      render = page.render({ canvas: target, viewport, transform: [factor, 0, 0, factor, 0, 0] });
      await render.promise;
      if (!cancelado) setEstado('');
    }).catch(() => { if (!cancelado) setEstado('No se pudo mostrar esta página.'); });
    return () => { cancelado = true; render?.cancel(); };
  }, [pdf, numero, ancho]);
  return <><canvas ref={canvas} aria-label={`Página ${numero}`} className="block bg-white mx-auto" />{estado && <p role="status" className="text-sm p-2">{estado}</p>}</>;
}

export default function DocumentoPdf({ url, nombre }: { url: string; nombre: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [progreso, setProgreso] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [ancho, setAncho] = useState(320);
  const boton = useRef<HTMLButtonElement>(null);
  const cerrar = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelado = false;
    let task: ReturnType<typeof import('pdfjs-dist')['getDocument']> | undefined;
    setError(''); setPdf(undefined); setProgreso(0); setPagina(1);
    void import('pdfjs-dist').then(async lib => {
      if (cancelado) return;
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      task = lib.getDocument({ url, disableAutoFetch: true, disableStream: true });
      task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => { if (!cancelado && total) setProgreso(Math.min(100, Math.round(100 * loaded / total))); };
      const documento = await task.promise;
      if (!cancelado) setPdf(documento);
    }).catch(() => { if (!cancelado) setError('No se pudo previsualizar el PDF. Puede estar protegido o no haber conexión.'); });
    return () => { cancelado = true; void task?.destroy(); };
  }, [url, intento]);
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; cerrar.current?.focus();
    const medir = () => setAncho(Math.min(window.innerWidth - 24, 900));
    medir(); window.addEventListener('resize', medir);
    const teclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') history.back();
      if (e.key === 'Tab' && panel.current) {
        const botones = Array.from(panel.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const primero = botones[0], ultimo = botones[botones.length - 1];
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo?.focus(); }
        if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero?.focus(); }
      }
    };
    const volver = () => setAbierto(false);
    window.addEventListener('popstate', volver); window.addEventListener('keydown', teclado);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener('resize', medir); window.removeEventListener('popstate', volver); window.removeEventListener('keydown', teclado);
      boton.current?.focus({ preventScroll: true });
    };
  }, [abierto]);
  return <div className="w-[240px] max-w-full rounded-xl overflow-hidden border border-black/10 bg-white/80 text-slate-800">
    <button ref={boton} type="button" aria-label={`Abrir PDF: ${nombre}`} className="block w-full text-left" onClick={() => { history.pushState(history.state, '', location.href); setAbierto(true); }}>
      <div className="h-32 overflow-hidden bg-white pointer-events-none" aria-hidden="true">
        {pdf ? <Pagina pdf={pdf} numero={1} ancho={240} /> : <span className="block p-4 text-sm">{error ? 'Vista previa no disponible' : `Cargando PDF… ${progreso || ''}${progreso ? '%' : ''}`}</span>}
      </div>
      <div className="flex gap-2 p-3 border-t border-black/5"><FileText size={28} className="text-red-600 shrink-0" /><div className="min-w-0"><p className="truncate text-sm font-medium">{nombre}</p><p className="text-xs text-slate-500">{pdf ? `${pdf.numPages} ${pdf.numPages === 1 ? 'página' : 'páginas'} · ` : ''}PDF</p></div></div>
    </button>
    {error && <button type="button" className="p-3 text-sm underline" onClick={() => setIntento(x => x + 1)}>Reintentar vista previa</button>}
    {abierto && createPortal(<div ref={panel} role="dialog" aria-modal="true" aria-label={nombre} className="fixed inset-0 z-[200] flex flex-col bg-slate-100 text-slate-900" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <header className="flex items-center gap-2 p-2 bg-white border-b shrink-0"><button ref={cerrar} type="button" aria-label="Volver al chat" className="p-3" onClick={() => history.back()}><ArrowLeft size={22} /></button><h2 className="truncate text-sm font-semibold">{nombre}</h2></header>
      <div className="flex items-center justify-center gap-2 p-1 bg-white shrink-0">
        <button type="button" aria-label="Página anterior" className="p-3 disabled:opacity-30" disabled={!pdf || pagina <= 1} onClick={() => setPagina(x => x - 1)}><ChevronLeft size={20} /></button>
        <span className="text-sm" aria-live="polite">{pagina} / {pdf?.numPages || '…'}</span>
        <button type="button" aria-label="Página siguiente" className="p-3 disabled:opacity-30" disabled={!pdf || pagina >= pdf.numPages} onClick={() => setPagina(x => x + 1)}><ChevronRight size={20} /></button>
        <button type="button" aria-label="Reducir zoom" className="p-3" disabled={zoom <= 1} onClick={() => setZoom(x => Math.max(1, x - .5))}><Minus size={20} /></button>
        <button type="button" aria-label="Aumentar zoom" className="p-3" disabled={zoom >= 3} onClick={() => setZoom(x => Math.min(3, x + .5))}><Plus size={20} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3" key={pagina}>
        {pdf ? <Pagina pdf={pdf} numero={pagina} ancho={ancho * zoom} /> : <p role="status">{error || `Cargando documento… ${progreso}%`}</p>}
        {error && <button type="button" className="p-3 underline" onClick={() => setIntento(x => x + 1)}>Reintentar</button>}
      </div>
    </div>, document.body)}
  </div>;
}
