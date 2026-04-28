import { useEffect, useState } from 'react';

interface Props {
  imagenes: string[];
  /** Segundos entre cambio de slide. */
  intervalo: number;
  /** Si true, el carrusel se detiene cuando el cursor está encima. */
  pausarEnHover: boolean;
}

/**
 * Carrusel de imágenes con transición fade para el hero del sitio público.
 *
 * - `setInterval` con cleanup en el `useEffect` (sin memory leak).
 * - Si `imagenes.length < 2` no rota — solo muestra la primera.
 * - Indicadores clickeables abajo para saltar a un slide específico.
 * - Pausa en hover opcional (no aplica en mobile táctil — degrada graceful).
 *
 * Cada `<img>` se posiciona absoluta y la rotación se hace alternando
 * `opacity` con `transition-opacity duration-1000`. Las imágenes que no
 * están activas reciben `aria-hidden`.
 */
export default function HeroCarrusel({ imagenes, intervalo, pausarEnHover }: Props) {
  const [idx, setIdx] = useState(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (pausado) return;
    if (imagenes.length < 2) return;
    const id = setInterval(() => {
      setIdx((prev) => (prev + 1) % imagenes.length);
    }, Math.max(2, intervalo) * 1000);
    return () => clearInterval(id);
  }, [pausado, intervalo, imagenes.length]);

  // Si admin redujo la lista mientras el carrusel mostraba un índice fuera
  // de rango, lo reseteamos para evitar quedar en un slide que ya no existe.
  useEffect(() => {
    if (idx >= imagenes.length) setIdx(0);
  }, [imagenes.length, idx]);

  const handlePausa = pausarEnHover
    ? {
        onMouseEnter: () => setPausado(true),
        onMouseLeave: () => setPausado(false),
      }
    : {};

  return (
    <div className="absolute inset-0" {...handlePausa}>
      {imagenes.map((url, i) => (
        <img
          key={`${i}-${url}`}
          src={url}
          alt=""
          aria-hidden={i !== idx}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
            i === idx ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}

      {/* Indicadores: solo se muestran si hay >1 imagen */}
      {imagenes.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
          {imagenes.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Ir a imagen ${i + 1} de ${imagenes.length}`}
              className={`h-2 rounded-full transition-all ${
                i === idx ? 'bg-white w-6' : 'bg-white/50 w-2 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
