import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Minus, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';

interface Mensaje {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Burbuja flotante del Asistente IA (Sprint 4).
 * Se monta en el Layout admin — aparece solo en /admin/*.
 *
 * Visibilidad:
 *  - userProfile.iaHabilitada === true
 *  - rol distinto de tecnico / ayudante (backend igual lo rechaza, pero por UX no mostrar).
 *  - user autenticado (currentUser).
 *
 * Estado de conversación vivo dentro del componente. Persiste mientras el
 * Layout esté montado (navegación entre páginas admin). No persiste entre
 * refreshes — la persistencia en Firestore llega en Sprint 5.
 */
export default function AsistenteIAFlotante() {
  const { currentUser, userProfile } = useApp();

  const [abierto, setAbierto] = useState(false);
  const [montado, setMontado] = useState(false); // para animación de entrada
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [input, setInput] = useState('');
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokensSesion, setTokensSesion] = useState<{ input: number; output: number; costoUSD: number }>({
    input: 0,
    output: 0,
    costoUSD: 0,
  });
  const [hayNoLeido, setHayNoLeido] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll al fondo cuando cambia la lista de mensajes o el estado "pensando"
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensajes, pensando, abierto]);

  // Animación de entrada del panel: dejar que el DOM pinte el estado inicial
  // antes de aplicar las clases "abiertas" para que la transición se vea.
  useEffect(() => {
    if (abierto) {
      const t = window.setTimeout(() => setMontado(true), 20);
      return () => window.clearTimeout(t);
    }
    setMontado(false);
    return undefined;
  }, [abierto]);

  // Auto-resize del textarea hasta ~4 líneas
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = 24 * 4 + 16; // ~4 líneas (line-height 24px + padding)
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
  }, [input, abierto]);

  // ----- Guards tempranos -----
  if (!userProfile?.iaHabilitada) return null;
  if (userProfile.rol === 'tecnico' || userProfile.rol === 'ayudante') return null;
  if (!currentUser) return null;

  const abrirPanel = () => {
    setAbierto(true);
    setHayNoLeido(false);
  };

  const cerrarPanel = () => {
    setAbierto(false);
  };

  const enviar = async () => {
    const texto = input.trim();
    if (!texto || pensando) return;

    const userMsg: Mensaje = { role: 'user', content: texto };
    const nuevoHistorial = [...mensajes, userMsg];
    setMensajes(nuevoHistorial);
    setInput('');
    setPensando(true);
    setError(null);

    try {
      const idToken = await currentUser.getIdToken();
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ mensajes: nuevoHistorial }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const errorMsg =
          resp.status === 403
            ? (typeof data.error === 'string' && data.error) ||
              'Tu acceso al asistente fue desactivado. Contacta al administrador.'
            : resp.status === 500
            ? 'Hubo un error procesando tu pregunta. Reintenta o reformula.'
            : (typeof data.error === 'string' && data.error) || `Error ${resp.status}`;
        setMensajes(prev => [...prev, { role: 'assistant', content: errorMsg }]);
        if (!abierto) setHayNoLeido(true);
        return;
      }

      const respuesta: string = typeof data.respuesta === 'string' ? data.respuesta : '';
      setMensajes(prev => [...prev, { role: 'assistant', content: respuesta }]);
      setTokensSesion(prev => ({
        input: prev.input + (Number(data.tokensInput) || 0),
        output: prev.output + (Number(data.tokensOutput) || 0),
        costoUSD: prev.costoUSD + (Number(data.costoEstimadoUSD) || 0),
      }));
      if (!abierto) setHayNoLeido(true);
    } catch (err) {
      console.error('[AsistenteIAFlotante] error de red:', err);
      toast.error('No pude contactar al servidor. Reintenta.');
      setError('No pude contactar al servidor. Reintenta.');
    } finally {
      setPensando(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  // ----- Estado COLAPSADO (botón flotante) -----
  if (!abierto) {
    return (
      <button
        type="button"
        onClick={abrirPanel}
        title="Asistente IA"
        aria-label="Abrir Asistente IA"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-[#0f3460] to-[#1a5fa8] text-white shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center justify-center"
      >
        <Sparkles className="w-6 h-6 text-white" />
        {hayNoLeido && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"
          />
        )}
      </button>
    );
  }

  // ----- Estado EXPANDIDO (panel de chat) -----
  // Mobile por defecto: fullscreen. sm: desktop floating panel.
  return (
    <div
      className={[
        'fixed z-40 bg-white flex flex-col overflow-hidden',
        'inset-0 w-screen h-screen rounded-none',
        'sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[400px] sm:h-[600px] sm:max-h-[80vh] sm:rounded-2xl sm:shadow-2xl sm:border sm:border-[#0f3460]/20',
        'transition-all duration-200 ease-out',
        montado ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
      ].join(' ')}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0f3460] to-[#1a5fa8] text-white p-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={18} className="flex-shrink-0" />
          <span className="font-semibold text-sm truncate">Asistente IA · BETA</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={cerrarPanel}
            aria-label="Minimizar Asistente IA"
            title="Minimizar"
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            onClick={cerrarPanel}
            aria-label="Cerrar Asistente IA"
            title="Cerrar"
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

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
                  ? 'self-end bg-[#0f3460] text-white rounded-2xl px-4 py-2 max-w-[85%] text-sm whitespace-pre-wrap'
                  : 'self-start bg-gray-100 text-gray-900 rounded-2xl px-4 py-2 max-w-[85%] text-sm whitespace-pre-wrap'
              }
            >
              {m.content}
            </div>
          </div>
        ))}

        {pensando && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 rounded-2xl px-4 py-2 text-sm flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-pulse"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-pulse"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-pulse"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer — input + contador */}
      <div className="border-t border-gray-100 p-3 space-y-2 flex-shrink-0 bg-white">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-2 text-xs">
            {error}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Escribe tu mensaje..."
            rows={1}
            disabled={pensando}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] resize-none disabled:bg-gray-50 leading-6"
          />
          <button
            type="button"
            onClick={enviar}
            disabled={pensando || !input.trim()}
            aria-label="Enviar mensaje"
            className="flex items-center justify-center p-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="text-xs text-gray-500">
          Tokens: {tokensSesion.input} in / {tokensSesion.output} out · ${tokensSesion.costoUSD.toFixed(4)}
        </div>
      </div>
    </div>
  );
}
