import { useMovimientoReducido } from '../hooks/useMovimientoReducido';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { obtenerTransicionMovimiento, proyectarDestinoMovimiento, MUESTRA_VELOCIDAD_MS, UMBRAL_ARRASTRE, ESCALA_PRESION } from '../utils/motion';
import { Sparkles } from 'lucide-react';

const STORAGE_KEY = 'ms:assistant-launcher-position:v1';
type Point = { x: number; y: number };
type Bounds = { left: number; top: number; right: number; bottom: number };
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));

/** Solo guarda una preferencia visual del dispositivo, nunca contenido del chat. */
export default function BotonAsistenteMovil({ onAbrir, hayNoLeido }: { onAbrir: () => void; hayNoLeido: boolean }) {
  const button = useRef<HTMLButtonElement>(null);
  const [ubicado, setUbicado] = useState(false);
  const x = useMotionValue(0), y = useMotionValue(0);
  const reducido = useMovimientoReducido();
  const detener = useCallback(() => { x.stop(); y.stop(); }, [x, y]);
  const muestras = useRef<Array<Point & { tiempo: number }>>([]);
  const registrarMuestra = (punto: Point, tiempo: number) => {
    muestras.current = [...muestras.current.filter(m => tiempo - m.tiempo <= MUESTRA_VELOCIDAD_MS), { ...punto, tiempo }];
  };
  const [dragging, setDragging] = useState(false);
  const [presionado, setPresionado] = useState(false);
  const normalized = useRef<Point | null>(null);
  const drag = useRef<{ id: number; start: Point; origin: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const description = useId();

  const bounds = useCallback((): Bounds => {
    const el = button.current;
    const view = window.visualViewport;
    const style = el ? getComputedStyle(el) : null;
    const inset = (name: string) => Number.parseFloat(style?.getPropertyValue(name) || '') || 0;
    const left = (view?.offsetLeft || 0) + 12 + inset('--ia-safe-left');
    const top = (view?.offsetTop || 0) + 12 + inset('--ia-safe-top');
    return {
      left, top,
      right: (view?.offsetLeft || 0) + (view?.width || window.innerWidth) - (el?.offsetWidth || 56) - 12 - inset('--ia-safe-right'),
      bottom: (view?.offsetTop || 0) + (view?.height || window.innerHeight) - (el?.offsetHeight || 56) - 12 - inset('--ia-safe-bottom'),
    };
  }, []);
  const move = useCallback((point: Point, save = false) => {
    const b = bounds();
    const next = { x: clamp(point.x, b.left, b.right), y: clamp(point.y, b.top, b.bottom) };
    normalized.current = { x: (next.x - b.left) / Math.max(1, b.right - b.left), y: (next.y - b.top) / Math.max(1, b.bottom - b.top) };
    x.set(next.x); y.set(next.y); setUbicado(true);
    if (save) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized.current)); } catch { /* Funciona también sin almacenamiento disponible. */ }
    }
  }, [bounds, x, y]);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored && [stored.x, stored.y].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) normalized.current = stored;
    } catch { /* Ignorar una preferencia antigua o inválida. */ }
    const fit = () => {
      if (!normalized.current) return;
      const b = bounds(), p = normalized.current;
      detener();
      move({ x: b.left + p.x * Math.max(0, b.right - b.left), y: b.top + p.y * Math.max(0, b.bottom - b.top) });
    };
    fit();
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('scroll', fit);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    if (button.current) observer?.observe(button.current);
    return () => {
      detener();
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('scroll', fit);
      observer?.disconnect();
    };
  }, [bounds, detener, move]);

  useEffect(() => {
    if (!reducido) return;
    detener();
    if (normalized.current) move({ x: x.get(), y: y.get() }, true);
  }, [reducido, detener, move, x, y]);

  function end(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    setPresionado(false);
    suppressClick.current = current.moved;
    if (current.moved) {
      const tiempo = event.timeStamp || performance.now();
      registrarMuestra({ x: event.clientX, y: event.clientY }, tiempo);
      const primera = muestras.current[0];
      const segundos = (tiempo - primera.tiempo) / 1000;
      const velocidad = !cancelled && segundos > 0 ? { x: (event.clientX - primera.x) / segundos, y: (event.clientY - primera.y) / segundos } : { x: 0, y: 0 };
      const b = bounds();
      const actual = { x: x.get(), y: y.get() };
      const destino = reducido || cancelled ? actual : {
        x: clamp(proyectarDestinoMovimiento(actual.x, velocidad.x), b.left, b.right),
        y: clamp(proyectarDestinoMovimiento(actual.y, velocidad.y), b.top, b.bottom),
      };
      // Guardamos la preferencia final; los valores visuales mantienen la continuidad.
      normalized.current = { x: (destino.x - b.left) / Math.max(1, b.right - b.left), y: (destino.y - b.top) / Math.max(1, b.bottom - b.top) };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized.current)); } catch { /* Preferencia opcional. */ }
      if (!reducido && !cancelled) {
        animate(x, destino.x, { ...obtenerTransicionMovimiento(false, true, velocidad.x), onUpdate: valor => { if (valor < b.left || valor > b.right) { x.stop(); x.set(clamp(valor, b.left, b.right)); } } });
        animate(y, destino.y, { ...obtenerTransicionMovimiento(false, true, velocidad.y), onUpdate: valor => { if (valor < b.top || valor > b.bottom) { y.stop(); y.set(clamp(valor, b.top, b.bottom)); } } });
      }
    }
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <>
    <motion.button data-movimiento="piloto" ref={button} type="button" title="Asistente IA · arrastra para mover" aria-label="Abrir Asistente IA" aria-describedby={description}
      className="service-assistant-launcher fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-md flex items-center justify-center"
      style={{ '--ia-safe-top': 'env(safe-area-inset-top, 0px)', '--ia-safe-bottom': 'env(safe-area-inset-bottom, 0px)', '--ia-safe-left': 'env(safe-area-inset-left, 0px)', '--ia-safe-right': 'env(safe-area-inset-right, 0px)', touchAction: 'none', userSelect: 'none', cursor: dragging ? 'grabbing' : 'grab', scale: '1', transition: 'none', ...(ubicado ? { left: 0, top: 0, right: 'auto', bottom: 'auto', x, y } : {}) } as CSSProperties}
      onPointerDown={event => {
        if (event.button !== 0 || event.isPrimary === false) return;
        setPresionado(true);
        detener();
        const rect = event.currentTarget.getBoundingClientRect();
        if (ubicado) move({ x: rect.left, y: rect.top }, true);
        muestras.current = [];
        registrarMuestra({ x: event.clientX, y: event.clientY }, event.timeStamp || performance.now());
        suppressClick.current = false;
        drag.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: rect.left, y: rect.top }, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        const dx = event.clientX - current.start.x, dy = event.clientY - current.start.y;
        if (!current.moved && Math.hypot(dx, dy) < UMBRAL_ARRASTRE) return;
        registrarMuestra({ x: event.clientX, y: event.clientY }, event.timeStamp || performance.now());
        current.moved = true;
        setDragging(true);
        move({ x: current.origin.x + dx, y: current.origin.y + dy });
      }}
      onPointerUp={event => end(event)} onPointerCancel={event => end(event, true)}
      onLostPointerCapture={() => { setPresionado(false); if (drag.current) { suppressClick.current = drag.current.moved; drag.current = null; setDragging(false); } }}
      onClick={event => { const moved = suppressClick.current; suppressClick.current = false; if (moved && event.detail !== 0) return; onAbrir(); }}
      onKeyDown={event => {
        const delta: Record<string, Point> = { ArrowLeft: { x: -24, y: 0 }, ArrowRight: { x: 24, y: 0 }, ArrowUp: { x: 0, y: -24 }, ArrowDown: { x: 0, y: 24 } };
        if (event.key === 'Home') {
          event.preventDefault(); detener(); normalized.current = null; setUbicado(false);
          try { localStorage.removeItem(STORAGE_KEY); } catch { /* Preferencia opcional. */ }
        } else if (delta[event.key]) {
          event.preventDefault(); detener(); const rect = event.currentTarget.getBoundingClientRect(), d = delta[event.key];
          move({ x: rect.left + d.x, y: rect.top + d.y }, true);
        }
      }}>
      <motion.span animate={{ scale: !reducido && presionado ? ESCALA_PRESION : 1 }} transition={obtenerTransicionMovimiento(reducido)}><Sparkles className="w-6 h-6 text-white" aria-hidden="true" /></motion.span>
      {hayNoLeido && <span aria-hidden="true" className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />}
    </motion.button>
    <span id={description} className="sr-only">Toca para abrir. Arrastra para mover. Con teclado, usa las flechas para mover e Inicio para restablecer la posición.</span>
  </>;
}
