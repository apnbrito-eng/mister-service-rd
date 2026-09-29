import { FirebaseAppCheck } from '@capacitor-firebase/app-check';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { App } from '@capacitor/app';
import { origenApiMovil } from './politicas';
export async function iniciarRuntimeMovil() {
  if (!Capacitor.isNativePlatform()) return;
  const origin = origenApiMovil(import.meta.env.VITE_MOBILE_API_ORIGIN);
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    // Solo APIs relativas propias. Firebase y archivos locales conservan su transporte.
    if (typeof input !== 'string' || !input.startsWith('/api/')) return original(input, init);
    if (init?.signal?.aborted) throw new DOMException('Solicitud cancelada', 'AbortError');
    if (init?.body && typeof init.body !== 'string') throw new Error('Este servicio móvil requiere un cuerpo JSON.');
    const method = (init?.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => { headers[key] = value; });
    if (input.split('?')[0] === '/api/movil/estado') {
      const { token } = await FirebaseAppCheck.getToken({ forceRefresh: false });
      if (!token) throw new Error('No se pudo verificar la app móvil.');
      headers['X-Firebase-AppCheck'] = token;
    }
    const pedir = () => CapacitorHttp.request({ url: origin + input, method, headers,
      data: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      connectTimeout: 20000, readTimeout: 45000, responseType: 'text', disableRedirects: true,
    });
    let response = await pedir();
    if (response.status === 403 && input.split('?')[0] === '/api/movil/estado') {
      const { token } = await FirebaseAppCheck.getToken({ forceRefresh: true });
      if (token) { headers['X-Firebase-AppCheck'] = token; response = await pedir(); }
    }
    if (init?.signal?.aborted) throw new DOMException('Solicitud cancelada', 'AbortError');
    return new Response(typeof response.data === 'string' ? response.data : JSON.stringify(response.data), { status: response.status, headers: response.headers });
  };
  document.documentElement.classList.add('app-nativa');
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) history.back(); else if (Capacitor.getPlatform() === 'android') void App.minimizeApp();
  });
}
