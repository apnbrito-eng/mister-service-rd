import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';

export interface Mensaje {
  role: 'user' | 'assistant';
  content: string;
}

export interface TokensSesion {
  input: number;
  output: number;
  costoUSD: number;
}

export interface UseAsistenteIAChatReturn {
  mensajes: Mensaje[];
  enviar: (texto: string) => Promise<void>;
  cancelarEnvio: () => void;
  limpiar: () => void;
  pensando: boolean;
  error: string | null;
  tokensSesion: TokensSesion;
  conversacionId: string | null;
}

/**
 * Hook compartido para la lógica del chat con el Asistente IA. Extraído de
 * `AsistenteIA.tsx` (página) y `AsistenteIAFlotante.tsx` (burbuja) que tenían
 * la misma lógica duplicada — resuelve task #78.
 *
 * Convenciones:
 *  - Los errores NO se inyectan como mensajes del assistant en `mensajes[]`.
 *    Se exponen via `error: string | null` para que el consumidor los
 *    muestre como banner (decisión de Jorge).
 *  - `cancelarEnvio` está expuesto pero sin botón de UI todavía; se usa
 *    internamente en el cleanup del unmount para evitar leaks de setState.
 *  - `limpiar()` reinicia toda la sesión (nueva conversación). No hace abort
 *    del fetch en vuelo — si hay uno corriendo, cuando responda descubre que
 *    el mountedRef sigue true y hace setState sobre el estado nuevo; el
 *    `conversacionId` quedará guardado como el nuevo ID. Si se quiere evitar
 *    eso, llamar `cancelarEnvio()` antes de `limpiar()`.
 */
export function useAsistenteIAChat(): UseAsistenteIAChatReturn {
  const { currentUser } = useApp();

  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokensSesion, setTokensSesion] = useState<TokensSesion>({ input: 0, output: 0, costoUSD: 0 });
  const [conversacionId, setConversacionId] = useState<string | null>(null);

  // AbortController actual del fetch en vuelo (si hay).
  const controllerRef = useRef<AbortController | null>(null);
  // mountedRef evita setState tras unmount cuando la respuesta del fetch
  // llega después de que el componente se desmontó.
  const mountedRef = useRef<boolean>(true);
  // Refs-mirror del estado para que `enviar` vea los valores actuales sin
  // necesidad de declararse dependiente (evita recrear el callback en cada
  // render, que a su vez haría que los consumidores con useEffect-dependencia
  // bucleen).
  const mensajesRef = useRef<Mensaje[]>(mensajes);
  const conversacionIdRef = useRef<string | null>(conversacionId);

  useEffect(() => { mensajesRef.current = mensajes; }, [mensajes]);
  useEffect(() => { conversacionIdRef.current = conversacionId; }, [conversacionId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Abortar cualquier fetch en vuelo al desmontar.
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
    };
  }, []);

  const cancelarEnvio = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
  }, []);

  const limpiar = useCallback(() => {
    setMensajes([]);
    setPensando(false);
    setError(null);
    setTokensSesion({ input: 0, output: 0, costoUSD: 0 });
    setConversacionId(null);
  }, []);

  const enviar = useCallback(async (texto: string) => {
    const trimmed = texto.trim();
    if (!trimmed) return;
    if (!currentUser) {
      setError('Sesión expirada. Vuelve a iniciar sesión.');
      return;
    }

    // Abortar request previa si sigue en vuelo antes de empezar una nueva.
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    const userMsg: Mensaje = { role: 'user', content: trimmed };
    const nuevoHistorial: Mensaje[] = [...mensajesRef.current, userMsg];
    setMensajes(nuevoHistorial);
    setPensando(true);
    setError(null);

    try {
      const idToken = await currentUser.getIdToken();

      // Stripear undefined en el body (convención del proyecto). `conversacionId`
      // solo se incluye si existe — el backend lo interpreta como continuación.
      const body: Record<string, unknown> = { mensajes: nuevoHistorial };
      if (conversacionIdRef.current !== null) {
        body.conversacionId = conversacionIdRef.current;
      }

      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // Si el componente se desmontó mientras esperábamos la respuesta,
      // salir sin setState. Los fetches abortados caen por el catch con
      // AbortError, pero si el unmount fue después del parse, este guard lo
      // cubre.
      if (!mountedRef.current) return;

      const data = await resp.json().catch(() => ({} as Record<string, unknown>));

      if (!mountedRef.current) return;

      if (!resp.ok) {
        const mensajeError =
          resp.status === 403
            ? (typeof (data as { error?: unknown }).error === 'string'
                ? (data as { error: string }).error
                : 'Tu acceso al asistente fue desactivado.')
            : resp.status === 500
              ? 'Hubo un error procesando tu pregunta. Reintenta o reformula.'
              : (typeof (data as { error?: unknown }).error === 'string'
                  ? (data as { error: string }).error
                  : `Error ${resp.status}`);
        setError(mensajeError);
        return;
      }

      const respuesta: string = typeof (data as { respuesta?: unknown }).respuesta === 'string'
        ? (data as { respuesta: string }).respuesta
        : '';
      const assistantMsg: Mensaje = { role: 'assistant', content: respuesta };
      setMensajes(prev => [...prev, assistantMsg]);
      setTokensSesion(prev => ({
        input: prev.input + (Number((data as { tokensInput?: unknown }).tokensInput) || 0),
        output: prev.output + (Number((data as { tokensOutput?: unknown }).tokensOutput) || 0),
        costoUSD: prev.costoUSD + (Number((data as { costoEstimadoUSD?: unknown }).costoEstimadoUSD) || 0),
      }));
      const convId = (data as { conversacionId?: unknown }).conversacionId;
      if (typeof convId === 'string' && convId.length > 0 && conversacionIdRef.current === null) {
        setConversacionId(convId);
      }
    } catch (err: unknown) {
      // AbortError: cleanup silencioso (unmount o cancelarEnvio).
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      if (!mountedRef.current) return;
      console.error('[useAsistenteIAChat] error de red:', err);
      setError('No pude contactar al servidor. Reintenta.');
    } finally {
      if (mountedRef.current) {
        setPensando(false);
      }
      // Limpiar controllerRef si sigue apuntando al que acabamos de usar.
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, [currentUser]);

  return {
    mensajes,
    enviar,
    cancelarEnvio,
    limpiar,
    pensando,
    error,
    tokensSesion,
    conversacionId,
  };
}
