import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { auth } from '../firebase/config';
import { useApp } from '../context/AppContext';
import { iaHabilitadaDefaultPorRol } from '../utils/permisos';

interface Mensaje {
  role: 'user' | 'assistant';
  content: string;
}

interface UsoInfo {
  in: number;
  out: number;
  costo: number;
}

/**
 * Página de prueba para el Asistente IA (Sprint 2 del proyecto IA interno).
 * Sin persistencia: el historial vive en useState y se reinicia al recargar.
 * La UI definitiva (chat flotante role-aware) llega en Sprint 4.
 */
export default function AsistenteIA() {
  const { userProfile } = useApp();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [input, setInput] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimoUso, setUltimoUso] = useState<UsoInfo | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensajes, enviando]);

  // iaHabilitada === undefined se trata como default por rol (Sprint 1 solo aplicó
  // defaults en creaciones nuevas — usuarios existentes no tienen el campo).
  const tieneAcceso =
    userProfile?.iaHabilitada === true ||
    (userProfile?.iaHabilitada === undefined &&
      !!userProfile?.rol &&
      iaHabilitadaDefaultPorRol(userProfile.rol));

  if (!tieneAcceso) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-yellow-900">
          Tu usuario no tiene el Asistente IA habilitado. Pedí acceso al administrador.
        </div>
      </div>
    );
  }

  const enviar = async () => {
    const texto = input.trim();
    if (!texto || enviando) return;

    const user = auth.currentUser;
    if (!user) {
      setError('Sesión expirada. Vuelve a iniciar sesión.');
      return;
    }

    setError(null);
    const nuevoUser: Mensaje = { role: 'user', content: texto };
    const proximaConversacion = [...mensajes, nuevoUser];
    setMensajes(proximaConversacion);
    setInput('');
    setEnviando(true);

    try {
      const idToken = await user.getIdToken();
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ mensajes: proximaConversacion }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        setError(data.error || `Error ${resp.status}`);
        return;
      }

      const respuesta: string = typeof data.respuesta === 'string' ? data.respuesta : '';
      setMensajes(prev => [...prev, { role: 'assistant', content: respuesta }]);
      setUltimoUso({
        in: Number(data.tokensInput) || 0,
        out: Number(data.tokensOutput) || 0,
        costo: Number(data.costoEstimadoUSD) || 0,
      });
    } catch (err) {
      console.error(err);
      setError('Error de red al llamar al Asistente IA');
    } finally {
      setEnviando(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0f3460] flex items-center gap-2">
          <Sparkles size={22} className="text-[#1a5fa8]" />
          Asistente IA · BETA
        </h1>
        <p className="text-gray-500 text-sm">Página de prueba — UI definitiva en próxima fase</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[60vh]">
        {/* Lista de mensajes */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {mensajes.length === 0 && !enviando && (
            <div className="text-center text-sm text-gray-400 py-10">
              Escribí tu primer mensaje abajo para probar el asistente.
            </div>
          )}

          {mensajes.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-[#0f3460] text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {enviando && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-500 italic rounded-2xl px-4 py-2 text-sm">
                Pensando...
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Escribe tu mensaje... (Enter para enviar, Shift+Enter para salto de línea)"
              rows={2}
              disabled={enviando}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] resize-none disabled:bg-gray-50"
            />
            <button
              type="button"
              onClick={enviar}
              disabled={enviando || !input.trim()}
              className="flex items-center gap-1 px-4 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={14} />
              Enviar
            </button>
          </div>
          {ultimoUso && (
            <div className="mt-2 text-xs text-gray-400 text-right">
              Tokens: {ultimoUso.in} in / {ultimoUso.out} out · Costo: ${ultimoUso.costo.toFixed(6)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
