import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Minus, Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { iaHabilitadaDefaultPorRol } from '../utils/permisos';
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
 * SPRINT-FIX-FAB-ARRASTRABLE (2026-09-12) — el botón era `fixed bottom-6
 * right-6` y tapaba controles reales en 4 pantallas: el botón "Enviar" del
 * Inbox (67% tapado — `document.elementFromPoint` devolvía el FAB, así que
 * el clic abría el asistente en vez de mandar el mensaje), un botón de Citas
 * por Confirmar, "Desactivar" en Precios de Servicios y "Eliminar bloque" en
 * Página Web. Ahora se arrastra y recuerda dónde lo dejó cada usuario.
 *
 * Sprint 5: la lógica de chat vive en `useAsistenteIAChat`. La conversación
 * se persiste en la colección `conversaciones_ia` via backend. Al minimizar
 * el panel NO se limpia (se preserva la sesión). Al hacer refresh del navegador
 * se pierde el hilo local pero queda el audit log en Firestore.
 */
/** Lado del botón en px (w-14 h-14 = 56px). */
const FAB_TAM = 56;
/** Margen mínimo contra los bordes del viewport. */
const FAB_MARGEN = 16;
/**
 * Separación por defecto desde el fondo. Más alta que el `bottom-6` original
 * (24px) para despejar la barra de composición del Inbox, que mide ~72px.
 * Solo aplica la primera vez: después manda la posición que guardó el usuario.
 */
const FAB_FONDO_DEFAULT = 104;
const FAB_DERECHA_DEFAULT = 24;

/** Umbral en px para distinguir un arrastre de un clic. */
const FAB_UMBRAL_ARRASTRE = 5;

const claveStorage = (uid: string | undefined) =>
  `msrd_asistente_ia_pos_${uid || 'anon'}`;

/** Mantiene el botón dentro del viewport. Se aplica al cargar y al redimensionar. */
function acotarAlViewport(pos: { x: number; y: number }): { x: number; y: number } {
  const maxX = Math.max(FAB_MARGEN, window.innerWidth - FAB_TAM - FAB_MARGEN);
  const maxY = Math.max(FAB_MARGEN, window.innerHeight - FAB_TAM - FAB_MARGEN);
  return {
    x: Math.min(Math.max(pos.x, FAB_MARGEN), maxX),
    y: Math.min(Math.max(pos.y, FAB_MARGEN), maxY),
  };
}

function posicionPorDefecto(): { x: number; y: number } {
  return acotarAlViewport({
    x: window.innerWidth - FAB_TAM - FAB_DERECHA_DEFAULT,
    y: window.innerHeight - FAB_TAM - FAB_FONDO_DEFAULT,
  });
}

export default function AsistenteIAFlotante() {
  const { currentUser, userProfile } = useApp();
  const { mensajes, enviar, pensando, error, tokensSesion } = useAsistenteIAChat();

  // --- SPRINT-FIX-FAB-ARRASTRABLE: posición del botón colapsado ---
  const [posicion, setPosicion] = useState<{ x: number; y: number } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  /** Offset del puntero respecto de la esquina del botón al empezar a arrastrar. */
  const offsetArrastre = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  /** Se pone en true si el puntero se movió más que el umbral: suprime el click. */
  const huboArrastre = useRef(false);
  /** Punto donde se presionó, para medir la distancia recorrida. */
  const inicioArrastre = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  /** Espejo de `posicion` para leerla al soltar sin meter efectos en el updater. */
  const posicionRef = useRef<{ x: number; y: number } | null>(null);
  /**
   * Guard "ya restauré" — convención CLAUDE.md para effects que leen de
   * localStorage. Sin esto, el effect que depende de `currentUser?.uid` puede
   * pisar una posición que el usuario acaba de mover, porque `uid` llega en un
   * render posterior al primero.
   */
  const yaRestaurado = useRef(false);

  const [abierto, setAbierto] = useState(false);
  const [montado, setMontado] = useState(false); // para animación de entrada
  const [input, setInput] = useState('');
  const [hayNoLeido, setHayNoLeido] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Para detectar cuándo se agregó un nuevo mensaje del assistant y marcar
  // "no leído" si el panel está cerrado. Guarda el length previo visto.
  const mensajesLenAnterior = useRef<number>(0);
  const abiertoRef = useRef<boolean>(abierto);

  useEffect(() => { abiertoRef.current = abierto; }, [abierto]);

  // Restaurar la posición guardada una sola vez, cuando ya conocemos el uid.
  useEffect(() => {
    if (yaRestaurado.current) return;
    if (!currentUser) return;
    yaRestaurado.current = true;
    let guardada: { x: number; y: number } | null = null;
    try {
      const raw = localStorage.getItem(claveStorage(currentUser.uid));
      if (raw) {
        const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          guardada = { x: parsed.x, y: parsed.y };
        }
      }
    } catch {
      // localStorage puede tirar en modo privado o con storage bloqueado.
      // No es crítico: caemos a la posición por defecto.
    }
    const inicial = acotarAlViewport(guardada ?? posicionPorDefecto());
    posicionRef.current = inicial;
    setPosicion(inicial);
  }, [currentUser]);

  // Si la ventana cambia de tamaño, re-acotar para que el botón no quede fuera.
  useEffect(() => {
    const alRedimensionar = () => {
      setPosicion((prev) => {
        if (!prev) return prev;
        const acotada = acotarAlViewport(prev);
        posicionRef.current = acotada;
        return acotada;
      });
    };
    window.addEventListener('resize', alRedimensionar);
    return () => window.removeEventListener('resize', alRedimensionar);
  }, []);

  // Arrastre. Usamos Pointer Events (cubre mouse, touch y lápiz con una sola
  // implementación) y listeners a nivel `window` para que el botón siga al
  // puntero aunque se salga de él.
  useEffect(() => {
    if (!arrastrando) return;

    const alMover = (e: PointerEvent) => {
      e.preventDefault();
      // Distancia total desde donde se presionó. Recién pasado el umbral lo
      // tratamos como arrastre — así un clic con temblor de pulso sigue
      // abriendo el panel en vez de quedar anulado.
      const dist = Math.hypot(
        e.clientX - inicioArrastre.current.x,
        e.clientY - inicioArrastre.current.y,
      );
      if (dist > FAB_UMBRAL_ARRASTRE) huboArrastre.current = true;
      const nueva = acotarAlViewport({
        x: e.clientX - offsetArrastre.current.dx,
        y: e.clientY - offsetArrastre.current.dy,
      });
      posicionRef.current = nueva;
      setPosicion(nueva);
    };

    const alSoltar = () => {
      setArrastrando(false);
      // Persistir leyendo del ref, NO desde dentro de un updater de estado:
      // en StrictMode el updater corre dos veces y duplicaría la escritura.
      const fin = posicionRef.current;
      if (fin && currentUser && huboArrastre.current) {
        try {
          localStorage.setItem(claveStorage(currentUser.uid), JSON.stringify(fin));
        } catch {
          // Si no se puede persistir, la posición igual vale para esta sesión.
        }
      }
    };

    window.addEventListener('pointermove', alMover, { passive: false });
    window.addEventListener('pointerup', alSoltar);
    window.addEventListener('pointercancel', alSoltar);
    return () => {
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alSoltar);
      window.removeEventListener('pointercancel', alSoltar);
    };
  }, [arrastrando, currentUser]);

  const alPresionarFab = (e: React.PointerEvent<HTMLButtonElement>) => {
    // Solo botón principal del mouse; touch y lápiz no reportan `button`.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    offsetArrastre.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    inicioArrastre.current = { x: e.clientX, y: e.clientY };
    huboArrastre.current = false;
    setArrastrando(true);
  };

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
  // iaHabilitada === undefined se trata como default por rol (Sprint 1 solo aplicó
  // defaults en creaciones nuevas — usuarios existentes no tienen el campo).
  const tieneAcceso =
    userProfile?.iaHabilitada === true ||
    (userProfile?.iaHabilitada === undefined &&
      !!userProfile?.rol &&
      iaHabilitadaDefaultPorRol(userProfile.rol));

  if (!tieneAcceso) return null;
  if (userProfile?.rol === 'tecnico' || userProfile?.rol === 'ayudante') return null;
  if (!currentUser) return null;

  const abrirPanel = () => {
    setAbierto(true);
    setHayNoLeido(false);
  };

  const cerrarPanel = () => {
    // NO llamar limpiar() — preservar la conversación al minimizar.
    setAbierto(false);
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

  // ----- Estado COLAPSADO (botón flotante) -----
  if (!abierto) {
    return (
      <button
        type="button"
        onPointerDown={alPresionarFab}
        onClick={() => {
          // Si el puntero recorrió más que el umbral, fue un arrastre: no abrir.
          if (huboArrastre.current) {
            huboArrastre.current = false;
            return;
          }
          abrirPanel();
        }}
        title="Asistente IA · arrastrá para moverlo"
        aria-label="Abrir Asistente IA"
        style={
          posicion
            ? { left: posicion.x, top: posicion.y, touchAction: 'none' }
            : // Hasta que se restaura la posición guardada, lo dejamos fuera de
              // pantalla en vez de pintarlo en la esquina: evita el salto visual.
              { left: -9999, top: -9999, touchAction: 'none' }
        }
        // @safe-gradient: botón flotante Asistente IA — identidad visual del producto IA
        className={[
          'fixed z-40 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary-medium',
          'text-white shadow-md flex items-center justify-center',
          arrastrando
            ? 'cursor-grabbing scale-105 shadow-xl transition-none'
            : 'cursor-grab hover:shadow-lg hover:scale-105 transition-all duration-200',
        ].join(' ')}
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
        'sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[400px] sm:h-[600px] sm:max-h-[80vh] sm:rounded-2xl sm:shadow-2xl sm:border sm:border-primary/20',
        'transition-all duration-200 ease-out',
        montado ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
      ].join(' ')}
    >
      {/* Header */}
      {/* @safe-gradient: header del panel Asistente IA — identidad visual del producto IA */}
      <div className="bg-gradient-to-r from-primary to-primary-medium text-white p-3 flex items-center justify-between flex-shrink-0">
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
    </div>
  );
}
