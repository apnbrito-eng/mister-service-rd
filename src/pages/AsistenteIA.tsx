import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { iaHabilitadaDefaultPorRol } from '../utils/permisos';
import { useAsistenteIAChat } from '../hooks/useAsistenteIAChat';

/**
 * Página de prueba para el Asistente IA.
 * Sprint 5: la lógica de chat vive en `useAsistenteIAChat`. La conversación
 * se persiste en la colección `conversaciones_ia` — al recargar la página el
 * estado local se pierde pero queda el audit log en Firestore.
 */
export default function AsistenteIA() {
  const { userProfile } = useApp();
  const { mensajes, enviar, pensando, error, tokensSesion, limpiar } = useAsistenteIAChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensajes, pensando]);

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

  const handleEnviar = async () => {
    const texto = input.trim();
    if (!texto || pensando) return;
    setInput('');
    await enviar(texto);
  };

  const handleNuevaConversacion = () => {
    limpiar();
    setInput('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Sparkles size={22} className="text-primary-medium" />
            Asistente IA · BETA
          </h1>
          <p className="text-gray-500 text-sm">Página de prueba — UI definitiva en próxima fase</p>
        </div>
        {mensajes.length > 0 && (
          <button
            type="button"
            onClick={handleNuevaConversacion}
            className="flex items-center gap-1 px-3 py-2 bg-white hover:bg-gray-50 text-primary border border-gray-200 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            Nueva conversación
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[60vh]">
        {/* Lista de mensajes */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {mensajes.length === 0 && !pensando && (
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
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {pensando && (
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
              disabled={pensando}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium resize-none disabled:bg-gray-50"
            />
            <button
              type="button"
              onClick={handleEnviar}
              disabled={pensando || !input.trim()}
              className="flex items-center gap-1 px-4 py-2 bg-primary hover:bg-primary-medium text-white rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={14} />
              Enviar
            </button>
          </div>
          {(tokensSesion.input > 0 || tokensSesion.output > 0) && (
            <div className="mt-2 text-xs text-gray-400 text-right">
              Sesión: {tokensSesion.input} in / {tokensSesion.output} out · Costo: ${tokensSesion.costoUSD.toFixed(6)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
