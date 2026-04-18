/**
 * Geocodificación via Nominatim (OpenStreetMap).
 * Nominatim limita a 1 request por segundo — los callers deben agregar
 * delays propios entre llamadas sucesivas.
 */
export async function geocodificarDireccion(
  direccion: string,
  signal?: AbortSignal,
): Promise<{ lat: number; lng: number } | null> {
  const texto = (direccion || '').trim();
  if (!texto) return null;

  const query = `${texto} Santo Domingo Dominican Republic`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=es`;

  const fetchOnce = async () => {
    return fetch(url, {
      headers: { 'Accept-Language': 'es' },
      signal,
    });
  };

  try {
    let res = await fetchOnce();
    // Reintento único ante rate limit o fallo transitorio
    if (res.status === 429 || res.status >= 500) {
      await new Promise(r => setTimeout(r, 3000));
      if (signal?.aborted) return null;
      res = await fetchOnce();
    }
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
