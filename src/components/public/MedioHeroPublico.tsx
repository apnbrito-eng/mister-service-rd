import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ConfigWeb } from '../../services/configWeb.service';

/** El contenido del CMS se presenta sobre blanco. Carrusel manual sin movimiento forzado. */
export default function MedioHeroPublico({ hero }: { hero: ConfigWeb['hero'] }) {
  const [indice, setIndice] = useState(0);
  const [fallidas, setFallidas] = useState<string[]>([]);
  const imagenes = (hero.modo === 'carrusel' ? hero.imagenesCarrusel || [] : [hero.imagenFija || '']).filter(url => url && !fallidas.includes(url));
  const actual = indice % Math.max(1, imagenes.length);
  return <div className="portada-publica-galeria" aria-label="Imágenes de nuestros servicios">
    <img src={imagenes[actual] || '/portada/equipos-servicio.webp'} alt="Electrodomésticos y servicio técnico" onError={() => { if (imagenes[actual]) setFallidas(anteriores => [...anteriores, imagenes[actual]]); }} />
    {imagenes.length > 1 && <div className="portada-publica-galeria-controles"><button type="button" aria-label="Imagen anterior" onClick={() => setIndice((actual + imagenes.length - 1) % imagenes.length)}><ChevronLeft size={20} /></button><span aria-live="polite">{actual + 1} / {imagenes.length}</span><button type="button" aria-label="Imagen siguiente" onClick={() => setIndice((actual + 1) % imagenes.length)}><ChevronRight size={20} /></button></div>}
  </div>;
}
