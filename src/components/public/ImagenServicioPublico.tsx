import { useState } from 'react';
import { Wrench } from 'lucide-react';

const POSICIONES: Record<string, string> = {
  Lavadora: '0% 0%', Estufa: '100% 0%', Nevera: '0% 100%', 'Aire Acondicionado': '100% 100%',
};

/** Conserva la imagen del CMS; si falta o falla, usa el recurso local disponible. */
export default function ImagenServicioPublico({ tipo, src, principal = false }: { tipo: string; src?: string; principal?: boolean }) {
  const [fallida, setFallida] = useState<string>();
  if (src && fallida !== src) return <img src={src} alt={tipo} loading={principal ? 'eager' : 'lazy'} className={principal ? 'web-detalle-imagen' : undefined} onError={() => setFallida(src)} />;
  const posicion = POSICIONES[tipo];
  return posicion
    ? <div role="img" aria-label={tipo} className="web-servicio-fallback" style={{ backgroundPosition: posicion }} />
    : <Wrench size={72} strokeWidth={1} aria-label={tipo} role="img" />;
}
