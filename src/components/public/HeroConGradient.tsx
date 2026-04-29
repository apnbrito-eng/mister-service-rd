import { ReactNode } from 'react';
import { GradientPreset } from '../../services/configWeb.service';
import { obtenerColoresGradient } from '../../utils/heroGradient';

interface Props {
  /** Preset elegido en `/admin/web`. */
  preset: GradientPreset;
  /** Color inicial cuando `preset === 'personalizado'`. Hex `#rrggbb`. */
  customFrom?: string;
  /** Color final cuando `preset === 'personalizado'`. Hex `#rrggbb`. */
  customTo?: string;
  /** Contenido del hero (texto, badge, stats card). */
  children: ReactNode;
}

/**
 * Wrapper del hero que renderiza un fondo gradient configurable. NO
 * incluye la imagen ni el carrusel — sólo el path "sin imagen". El
 * caller (HomePage) decide entre la rama "con imagen" (sigue inline en
 * HomePage) y este componente.
 *
 * Mantiene los decorative shapes (`bg-white/10` con blur) que el hero
 * original tenía cuando no había imagen, para preservar la sensación
 * visual existente.
 */
export default function HeroConGradient({
  preset,
  customFrom,
  customTo,
  children,
}: Props) {
  const { from, via, to } = obtenerColoresGradient(preset, customFrom, customTo);

  return (
    <section
      className="relative overflow-hidden"
      style={{
        backgroundImage: `linear-gradient(to bottom right, ${from}, ${via}, ${to})`,
      }}
    >
      {/* Decorative shapes — invariantes por preset. */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute bottom-0 -left-12 w-72 h-72 bg-white/5 rounded-full" />
        <div className="absolute top-1/2 right-1/4 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
      </div>

      {children}
    </section>
  );
}
