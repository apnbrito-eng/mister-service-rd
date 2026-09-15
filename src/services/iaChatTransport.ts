import { obtenerAppCheckToken } from '../lib/appCheck';

export class ErrorTransporteIA extends Error {}

/** Identidad y validación de la aplicación son necesarias para el chat. */
export async function enviarPreguntaIA(
  usuario: { getIdToken: () => Promise<string> },
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  let vencido = false;
  const cancelar = () => controller.abort();
  signal.addEventListener('abort', cancelar, { once: true });
  if (signal.aborted) cancelar();
  const timeout = setTimeout(() => { vencido = true; controller.abort(); }, 60000);
  try {
    if (controller.signal.aborted) throw new DOMException('Solicitud cancelada', 'AbortError');
    const [idToken, appToken] = await Promise.race([
      Promise.all([usuario.getIdToken(), obtenerAppCheckToken()]),
      new Promise<never>((_resolve, reject) => controller.signal.addEventListener('abort', () => reject(new DOMException('Solicitud cancelada', 'AbortError')), { once: true })),
    ]);
    if (controller.signal.aborted) throw new DOMException('Solicitud cancelada', 'AbortError');
    if (!appToken) throw new ErrorTransporteIA('No pudimos validar este navegador. Recarga la página; si continúa, administración debe revisar la configuración de acceso.');
    return await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
        'X-Firebase-AppCheck': appToken,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (vencido) throw new ErrorTransporteIA('La respuesta está tardando demasiado. Puedes continuar trabajando y consultar el historial antes de repetir una acción.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancelar);
  }
}
