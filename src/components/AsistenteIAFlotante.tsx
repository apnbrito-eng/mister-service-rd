import { useMovimientoReducido } from '../hooks/useMovimientoReducido';
import { motion } from 'motion/react';
import { obtenerTransicionMovimiento, DESPLAZAMIENTO_PANEL } from '../utils/motion';
import BotonAsistenteMovil from './BotonAsistenteMovil';
import { TextoAsistente } from './TextoAsistente';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Minus, Send, ArrowLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { iaHabilitadaDefaultPorRol } from '../utils/permisos';
import { registrarCierreCapa } from '../mobile/capas';
import { useAsistenteIAChat } from '../hooks/useAsistenteIAChat';

/**
 * Burbuja flotante del Asistente IA.
 * Se monta en el Layout admin — aparece solo en /admin/*.
 *
 * Visibilidad:
 *  - userProfile.iaHabilitada === true (o undefined con default por rol ON).
 *  - rol distinto de tecnico / ayudante (backend igual lo rechaza, pero por UX no mostrar).
 *  - user autenticado (currentUser).
 *
 * Sprint 5: la lógica de chat vive en `useAsistenteIAChat`. La conversación
 * se persiste en la colección `conversaciones_ia` via backend. Al minimizar
 * el panel NO se limpia (se preserva la sesión). Al hacer refresh del navegador
 * se pierde el hilo local pero queda el audit log en Firestore.
 */
export default function AsistenteIAFlotante() {
  const { currentUser, userProfile } = useApp();
  const { mensajes, enviar, pensando, error, tokensSesion } = useAsistenteIAChat();

  const [abierto, setAbierto] = useState(false);
  const reducido = useMovimientoReducido();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lanzadorRef = useRef<HTMLSpanElement | null>(null);
  const [input, setInput] = useState('');
  const [hayNoLeido, setHayNoLeido] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Para detectar cuándo se agregó un nuevo mensaje del assistant y marcar
  // "no leído" si el panel está cerrado. Guarda el length previo visto.
  const mensajesLenAnterior = useRef<number>(0);
  const abiertoRef = useRef<boolean>(abierto);

  useEffect(() => { abiertoRef.current = abierto; }, [abierto]);

  // Auto-scroll al fondo cuando cambia la lista de mensajes o el estado "pensando"
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensajes, pensando, abierto]);

  // Detectar nuevos mensajes del assistant cuando el panel está cerrado:
  // si `mensajes.length` aumentó y el último es del assistant y no estamos
  // mirando el panel, marcar `hayNoLeido`. Evita disparar sobre el push del
  // user (el length aumenta también ahí).
  useEffect(() => {
    const prev = mensajesLenAnterior.current;
    mensajesLenAnterior.current = mensajes.length;
    if (mensajes.length > prev) {
      const ultimo = mensajes[mensajes.length - 1];
      if (ultimo?.role === 'assistant' && !abiertoRef.current) {
        setHayNoLeido(true);
      }
    }
  }, [mensajes]);

  // Auto-resize del textarea hasta ~4 líneas
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = 24 * 4 + 16; // ~4 líneas (line-height 24px + padding)
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
  }, [input, abierto]);

  const tieneAcceso = !!currentUser && !!userProfile &&
    userProfile.rol !== 'tecnico' && userProfile.rol !== 'ayudante' &&
    (userProfile.iaHabilitada === true ||
      (userProfile.iaHabilitada === undefined && iaHabilitadaDefaultPorRol(userProfile.rol)));

  const cerrarPanel = useCallback(() => {
    // Conservar mensajes y borrador. Restaurar foco al botón, nunca al teclado.
    setAbierto(false);
    requestAnimationFrame(() => lanzadorRef.current?.querySelector('button')?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (!abierto || !tieneAcceso) return;
    const quitarCierre = registrarCierreCapa(cerrarPanel);
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const teclado = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        cerrarPanel();
      }
      if (evento.key !== 'Tab') return;
      const botones = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), a[href]');
      if (!botones?.length) return;
      const primero = botones[0];
      const ultimo = botones[botones.length - 1];
      if (evento.shiftKey && (document.activeElement === primero || !panelRef.current?.contains(document.activeElement))) {
        evento.preventDefault(); ultimo.focus();
      } else if (!evento.shiftKey && (document.activeElement === ultimo || !panelRef.current?.contains(document.activeElement))) {
        evento.preventDefault(); primero.focus();
      }
    };
    document.addEventListener('keydown', teclado);
    return () => { quitarCierre(); document.removeEventListener('keydown', teclado); };
  }, [abierto, tieneAcceso, cerrarPanel]);

  // Hooks siempre antes de guards: el perfil puede llegar o revocarse en vivo.
  if (!tieneAcceso) return null;

  const abrirPanel = () => {
    setAbierto(true);
    setHayNoLeido(false);
  };

  const handleEnviar = async () => {
    const texto = input.trim();
    if (!texto || pensando) return;
    setInput('');
    await enviar(texto);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  };

  return <>
    <span ref={lanzadorRef}>{!abierto && <BotonAsistenteMovil onAbrir={abrirPanel} hayNoLeido={hayNoLeido} />}</span>
    {abierto && <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/10" />}
    <motion.div ref={panelRef} {...{ inert: abierto ? undefined : '' }} aria-hidden={!abierto}
      role="dialog" aria-modal={abierto ? true : undefined} aria-label="Asistente IA"
      initial={false}
      animate={{ opacity: abierto ? 1 : 0, y: reducido || abierto ? 0 : DESPLAZAMIENTO_PANEL }}
      transition={obtenerTransicionMovimiento(reducido)}
      style={{ pointerEvents: abierto ? 'auto' : 'none', transition: 'none' }}
      className={[
        'fixed z-40 bg-white flex flex-col overflow-hidden',
        'ia-panel-movil inset-0 w-full h-[100dvh] rounded-none',
        'sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[400px] sm:h-[600px] sm:max-h-[80vh] sm:rounded-2xl sm:shadow-2xl sm:border sm:border-primary/20',
      ].join(' ')}
    >
      {/* Header */}
      {/* @safe-gradient: header del panel Asistente IA — identidad visual del producto IA */}
      <div className="bg-gradient-to-r from-primary to-primary-medium text-white p-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={cerrarPanel} aria-label="Volver a la aplicación" className="w-11 h-11 flex items-center justify-center rounded hover:bg-white/10"><ArrowLeft size={20} /></button>
          <Sparkles size={18} className="flex-shrink-0" />
          <span className="font-semibold text-sm truncate">Asistente IA · BETA</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={cerrarPanel}
            aria-label="Minimizar Asistente IA"
            title="Minimizar"
            className="w-11 h-11 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            onClick={cerrarPanel}
            aria-label="Cerrar Asistente IA"
            title="Cerrar"
            className="w-11 h-11 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Banner de error — arriba del body para consistencia con página */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 px-3 py-2 text-xs flex-shrink-0">
          {error}
        </div>
      )}

      {/* Body — mensajes scrollables */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#f9fafb]">
        {mensajes.length === 0 && !pensando && (
          <div className="text-center text-sm text-gray-400 py-10 px-4">
            Hola. Soy tu Asistente IA interno. Preguntame sobre órdenes, clientes o cualquier cosa del taller.
          </div>
        )}

        {mensajes.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={
                m.role === 'user'
                  ? 'self-end bg-primary text-white rounded-2xl px-4 py-2 max-w-[85%] text-sm whitespace-pre-wrap'
                  : 'self-start bg-gray-100 text-gray-900 rounded-2xl px-4 py-2 max-w-[85%] text-sm whitespace-pre-wrap'
              }
            >
              {m.role === 'assistant' ? <TextoAsistente texto={m.content} /> : m.content}
            </div>
          </div>
        ))}

        {pensando && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 rounded-2xl px-4 py-2 text-sm flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 bg-gray-400 rounded-full"
              />
              <span
                className="inline-block w-2 h-2 bg-gray-400 rounded-full"
              />
              <span
                className="inline-block w-2 h-2 bg-gray-400 rounded-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer — input + contador */}
      <div className="border-t border-gray-100 p-3 space-y-2 flex-shrink-0 bg-white">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Escribe tu mensaje..."
            rows={1}
            disabled={pensando}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium resize-none disabled:bg-gray-50 leading-6"
          />
          <button
            type="button"
            onClick={handleEnviar}
            disabled={pensando || !input.trim()}
            aria-label="Enviar mensaje"
            className="flex items-center justify-center p-2 bg-primary hover:bg-primary-medium text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="text-xs text-gray-500">
          Tokens: {tokensSesion.input} in / {tokensSesion.output} out · ${tokensSesion.costoUSD.toFixed(4)}
        </div>
      </div>
    </motion.div>
  </>;
}
