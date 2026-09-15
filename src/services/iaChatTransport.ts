import { obtenerAppCheckToken } from '../lib/appCheck';

export class ErrorTransporteIA extends Error {}

/** Identidad y validación de la aplicación son necesarias para el chat. */
export async function enviarPreguntaIA(
  usuario: { getIdToken: () => Promise<string> },
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const controller = new AbortController();
  let vencido = false;
  const cancelar = () => controller.abort();
  signal.addEventListener('abort', cancelar, { once: true });
  if (signal.aborted) cancelar();
  const timeout = setTimeout(() => { vencido = true; controller.abort(); }, 60000);
  try {
    if (controller.signal.aborted) throw new DOMException('Solicitud cancelada', 'AbortError');
    const abortado = new Promise<never>((_resolve, reject) => controller.signal.addEventListener('abort', () => reject(new DOMException('Solicitud cancelada', 'AbortError')), { once: true }));
    const [idToken, appToken] = await Promise.race([
      Promise.all([usuario.getIdToken(), obtenerAppCheckToken()]),
      abortado,
    ]);
    if (controller.signal.aborted) throw new DOMException('Solicitud cancelada', 'AbortError');
    if (!appToken) throw new ErrorTransporteIA('No pudimos validar este navegador. Recarga la página; si continúa, administración debe revisar la configuración de acceso.');
    const respuesta = await Promise.race([fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
        'X-Firebase-AppCheck': appToken,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }), abortado]);
    // Mantener cancelación y plazo hasta consumir el cuerpo, no solo cabeceras.
    const data = await Promise.race([respuesta.json(), abortado]);
    if (controller.signal.aborted) throw new DOMException('Solicitud cancelada', 'AbortError');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ErrorTransporteIA('El servidor devolvió una respuesta no válida. Intenta de nuevo.');
    return { ok: respuesta.ok, status: respuesta.status, data };
  } catch (error) {
    if (vencido) throw new ErrorTransporteIA('La respuesta está tardando demasiado. Puedes continuar trabajando y consultar el historial antes de repetir una acción.');
    if (error instanceof SyntaxError) throw new ErrorTransporteIA('El servidor devolvió una respuesta no válida. Intenta de nuevo.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancelar);
  }
}
