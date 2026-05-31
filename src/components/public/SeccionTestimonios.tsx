/**
 * Sección "Lo que dicen nuestros clientes" de la HomePage pública.
 *
 * SPRINT-DISENO-D (2026-05-31). Lee `src/config/testimoniosHomePage.ts`.
 *
 * - En producción con `activo: false` → renderiza `null` (sección oculta).
 * - En desarrollo (`import.meta.env.DEV`) → renderiza placeholders
 *   visuales aunque `activo === false`, para que Jorge pueda previsualizar.
 * - Cuando Jorge active la sección con testimonios reales → renderiza
 *   los testimonios reales tanto en dev como en prod.
 *
 * No inventa contenido (sub-regla CLAUDE.md).
 */
import { Star, Quote } from 'lucide-react';
import { testimoniosHomePage, type TestimonioConfig } from '../../config/testimoniosHomePage';

function TarjetaTestimonio({ t, esPlaceholder }: { t: TestimonioConfig; esPlaceholder: boolean }) {
  return (
    <div
      className={`bg-white rounded-2xl p-6 shadow-sm border border-gray-100 ${
        esPlaceholder ? 'opacity-60 border-dashed' : ''
      }`}
    >
      <Quote size={28} className="text-primary/30 mb-3" />
      <p className="text-gray-700 text-sm leading-relaxed mb-5 italic">
        &ldquo;{t.frase}&rdquo;
      </p>
      <div className="flex items-center gap-3 mt-auto">
        {t.fotoUrl ? (
          <img
            src={t.fotoUrl}
            alt={t.nombre}
            className="w-12 h-12 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-brand-50 text-primary flex items-center justify-center font-bold text-lg flex-shrink-0">
            {t.nombre.charAt(0) === '[' ? '·' : t.nombre.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{t.nombre}</p>
          <p className="text-gray-500 text-xs truncate">
            {t.barrio} · {t.equipo}
          </p>
        </div>
        <div className="flex gap-0.5 flex-shrink-0">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} size={12} className="text-yellow-400 fill-yellow-400" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SeccionTestimonios() {
  const config = testimoniosHomePage;

  // En producción con activo=false, la sección NO se renderiza.
  if (!config.activo && !import.meta.env.DEV) {
    return null;
  }

  // Si activo=true → renderiza testimonios reales. Si activo=false en DEV
  // → renderiza placeholders visuales (con borde dashed + opacidad).
  const esPlaceholder = !config.activo;

  return (
    <section className="py-16 md:py-20 bg-gray-bg">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Lo que dicen nuestros clientes
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Vecinos del Cibao que ya nos llamaron y volvieron a tener su electrodoméstico funcionando.
          </p>
          {esPlaceholder && (
            <p className="text-xs text-amber-700 bg-amber-50 inline-block px-3 py-1.5 rounded-full mt-3 border border-amber-200">
              Vista previa (DEV) — esta sección está oculta en producción hasta cargar testimonios reales
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {config.testimonios.map((t, idx) => (
            <TarjetaTestimonio key={idx} t={t} esPlaceholder={esPlaceholder} />
          ))}
        </div>
      </div>
    </section>
  );
}
