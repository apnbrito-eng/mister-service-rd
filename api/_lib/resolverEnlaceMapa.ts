/** Solo sigue enlaces de mapas de Google, nunca URLs arbitrarias ni HTML. */
export function enlaceMapaPermitido(valor: string): URL {
  const url = new URL(valor);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Enlace no permitido.');
  const valido = (url.hostname === 'maps.app.goo.gl') ||
    (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps/')) ||
    (['www.google.com', 'google.com'].includes(url.hostname) && /^\/maps(?:\/|$)/.test(url.pathname)) ||
    url.hostname === 'maps.google.com';
  if (!valido) throw new Error('Usa un enlace de Google Maps.');
  return url;
}
export async function resolverEnlaceMapa(texto: string, solicitar = fetch): Promise<string> {
  if (texto.length > 4096) throw new Error('Enlace demasiado largo.');
  let url = enlaceMapaPermitido(texto);
  const vistos = new Set<string>();
  const signal = AbortSignal.timeout(8000);
  for (let paso = 0; paso < 5; paso++) {
    if (vistos.has(url.href)) throw new Error('El enlace contiene un ciclo.');
    vistos.add(url.href);
    // La URL de destino ya es suficiente: no descargar la página de Maps.
    if (['www.google.com', 'google.com', 'maps.google.com'].includes(url.hostname)) return url.href;
    const respuesta = await solicitar(url.href, { redirect: 'manual', signal });
    await respuesta.body?.cancel();
    const destino = respuesta.headers.get('location');
    if (![301,302,303,307,308].includes(respuesta.status) || !destino) throw new Error('Google no devolvió la ubicación. Copia el enlace completo del mapa.');
    url = enlaceMapaPermitido(new URL(destino, url).href);
  }
  throw new Error('El enlace tiene demasiadas redirecciones.');
}
