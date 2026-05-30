import { Link } from 'react-router-dom';
import {
  Wrench, Shield, Clock, Phone, Star, ChevronRight,
  Thermometer, Waves, Wind, Flame, Refrigerator,
  CheckCircle, ArrowRight, Users, MapPin, Calendar
} from 'lucide-react';
import WhatsAppIcon from '../../components/icons/WhatsAppIcon';
import { useConfigWeb, getWhatsAppUrl } from '../../hooks/useConfigWeb';
import HeroCarrusel from '../../components/public/HeroCarrusel';
import HeroConGradient from '../../components/public/HeroConGradient';

// Mapa de tipo de equipo → icono Lucide para usar como fallback cuando un
// servicio no tiene `imagenCard` configurada.
// SPRINT-DISENO-A.5 (2026-05-31): unificado a un solo color brand
// (bg-brand-50 text-primary) — antes había 6 colores random (azul/cyan/
// indigo/naranja/púrpura/amarillo) que se sentían playful sin justificación.
const ICONO_POR_TIPO: { [tipo: string]: { icon: React.ElementType; color: string } } = {
  'Lavadora': { icon: Waves, color: 'bg-brand-50 text-primary' },
  'Nevera': { icon: Thermometer, color: 'bg-brand-50 text-primary' },
  'Aire Acondicionado': { icon: Wind, color: 'bg-brand-50 text-primary' },
  'Estufa': { icon: Flame, color: 'bg-brand-50 text-primary' },
  'Secadora': { icon: Refrigerator, color: 'bg-brand-50 text-primary' },
  'Microondas': { icon: Wrench, color: 'bg-brand-50 text-primary' },
  'Otro': { icon: Wrench, color: 'bg-brand-50 text-primary' },
};

function iconoParaTipo(tipo: string): { icon: React.ElementType; color: string } {
  return ICONO_POR_TIPO[tipo] || { icon: Wrench, color: 'bg-brand-50 text-primary' };
}

const PASOS_SERVICIO = [
  {
    numero: '01',
    titulo: 'Solicite su cita',
    descripcion: 'Agende en línea o escríbanos por WhatsApp. Escoja la fecha y hora que le convenga.',
    icon: Calendar,
  },
  {
    numero: '02',
    titulo: 'Diagnóstico profesional',
    descripcion: 'Nuestro técnico evalúa su equipo y le presenta un diagnóstico claro con cotización.',
    icon: Wrench,
  },
  {
    numero: '03',
    titulo: 'Reparación garantizada',
    descripcion: 'Realizamos el trabajo con repuestos de calidad. Seguimiento en tiempo real del técnico.',
    icon: CheckCircle,
  },
];

export default function HomePage() {
  const { config } = useConfigWeb();

  // ─── Hero: detectar si hay imagen de fondo configurada ───
  // Solo renderizamos la capa de imagen + overlay si:
  //   - modo 'fija' y hay una URL en imagenFija, o
  //   - modo 'carrusel' y hay >= 2 imágenes (validado en editor admin
  //     pero defensivo aquí por si Firestore tiene data stale).
  // Sin imagen, el hero queda exactamente como antes (gradient + shapes).
  const heroConfig = config.hero;
  const heroModo = heroConfig.modo ?? 'fija';
  const heroImagenFija = heroConfig.imagenFija ?? '';
  const heroImagenes = heroConfig.imagenesCarrusel ?? [];
  const heroTieneFondo =
    (heroModo === 'fija' && !!heroImagenFija) ||
    (heroModo === 'carrusel' && heroImagenes.length >= 2);

  // ─── Hero: contenido (texto + stats card) ───
  // Se reusa entre la rama "con imagen" (sigue inline aquí con su <section>
  // y overlay oscuro) y la rama "sin imagen" (delegada al componente
  // HeroConGradient, que aplica el gradient configurable y los shapes).
  const heroContenido = (
    <div className="relative z-10 max-w-6xl mx-auto px-4 py-20 md:py-28">
      <div className="grid md:grid-cols-2 gap-10 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-white/90 text-xs font-medium mb-6">
            <Shield size={14} /> {config.hero.badge}
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-5">
            {config.hero.titulo}{' '}
            <span className="text-blue-300">{config.hero.tituloDestacado}</span>
          </h1>
          <p className="text-blue-200 text-lg mb-8 leading-relaxed max-w-lg">
            {config.hero.subtitulo}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/agendar"
              className="flex items-center justify-center gap-2 bg-white text-primary px-6 py-3.5 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors shadow-lg shadow-black/20"
            >
              <Calendar size={18} /> Agendar Cita Online
            </Link>
            <a
              href={getWhatsAppUrl(config)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-green-500 text-white px-6 py-3.5 rounded-xl font-bold text-sm hover:bg-green-600 transition-colors"
            >
              <WhatsAppIcon filled={false} className="text-white" size={18} /> WhatsApp
            </a>
          </div>
        </div>

        {/* Stats card */}
        <div className="hidden md:block">
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20">
            <div className="grid grid-cols-2 gap-6">
              <div className="text-center">
                <div className="text-4xl font-extrabold text-white">{config.estadisticas.experiencia.valor}</div>
                <div className="text-blue-200 text-sm mt-1">{config.estadisticas.experiencia.etiqueta}</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-extrabold text-white">{config.estadisticas.servicios.valor}</div>
                <div className="text-blue-200 text-sm mt-1">{config.estadisticas.servicios.etiqueta}</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-extrabold text-white">{config.estadisticas.satisfaccion.valor}</div>
                <div className="text-blue-200 text-sm mt-1">{config.estadisticas.satisfaccion.etiqueta}</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-extrabold text-white">{config.estadisticas.respuesta.valor}</div>
                <div className="text-blue-200 text-sm mt-1">{config.estadisticas.respuesta.etiqueta}</div>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-white/20 flex items-center justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} size={18} className="text-yellow-400 fill-yellow-400" />
              ))}
              <span className="text-white text-sm ml-2 font-medium">{config.estadisticas.rating} / 5.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {/* ══════════ HERO ══════════ */}
      {/* @safe-gradient: hero marketing público HomePage — branding principal del sitio */}
      {heroTieneFondo ? (
        <section className="relative bg-gradient-to-br from-primary via-primary to-primary-medium overflow-hidden">
          {/* Capa de imagen / carrusel (debajo del overlay) */}
          {heroModo === 'carrusel' ? (
            <HeroCarrusel
              imagenes={heroImagenes}
              intervalo={heroConfig.intervaloCarrusel ?? 3}
              pausarEnHover={heroConfig.pausarEnHover ?? true}
            />
          ) : (
            <img
              src={heroImagenFija}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {/* Overlay oscuro: solo cuando hay fondo, para asegurar contraste */}
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

          {heroContenido}
        </section>
      ) : (
        <HeroConGradient
          preset={heroConfig.gradientPreset ?? 'navy'}
          customFrom={heroConfig.gradientCustomFrom}
          customTo={heroConfig.gradientCustomTo}
        >
          {heroContenido}
        </HeroConGradient>
      )}

      {/* ══════════ SERVICIOS ══════════ */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-3">Nuestros Servicios</h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Reparamos todas las marcas de electrodomésticos. Servicio a domicilio o en nuestro taller.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Object.values(config.servicios ?? {})
              .filter((s) => s.habilitado)
              .sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999))
              .map((s) => {
                const fallback = iconoParaTipo(s.tipoEquipo);
                const FallbackIcon = fallback.icon;
                return (
                  <Link
                    key={s.slug}
                    to={`/servicios/${s.slug}`}
                    className="group bg-gray-bg rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-transparent hover:border-gray-200 block"
                  >
                    {s.imagenCard ? (
                      <img
                        src={s.imagenCard}
                        alt={s.titulo}
                        className="w-full h-40 object-cover rounded-xl mb-4"
                      />
                    ) : (
                      <div className={`w-12 h-12 rounded-xl ${fallback.color} flex items-center justify-center mb-4`}>
                        <FallbackIcon size={24} />
                      </div>
                    )}
                    <h3 className="font-bold text-gray-900 text-lg mb-2">
                      {s.tipoEquipo || s.titulo}
                    </h3>
                    <p className="text-gray-500 text-sm leading-relaxed">
                      {s.descripcionCorta}
                    </p>
                    <span className="inline-flex items-center gap-1 text-primary text-sm font-semibold mt-3 group-hover:gap-2 transition-all">
                      Ver detalles <ArrowRight size={14} />
                    </span>
                  </Link>
                );
              })}
          </div>

          <div className="text-center mt-10">
            <Link
              to="/servicios"
              className="inline-flex items-center gap-2 text-primary font-semibold text-sm hover:gap-3 transition-all"
            >
              Ver todos los servicios <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════ CÓMO FUNCIONA ══════════ */}
      <section className="py-16 md:py-20 bg-gray-bg">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-3">¿Cómo funciona?</h2>
            <p className="text-gray-500 max-w-lg mx-auto">
              En 3 simples pasos resolvemos su problema. Sin complicaciones.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {PASOS_SERVICIO.map((paso, idx) => (
              <div key={paso.numero} className="relative">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                      <paso.icon size={20} className="text-white" />
                    </div>
                    <span className="text-3xl font-extrabold text-primary/15">{paso.numero}</span>
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2">{paso.titulo}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{paso.descripcion}</p>
                </div>
                {idx < 2 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                    <ChevronRight size={24} className="text-gray-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ MARCAS ══════════ */}
      <section className="py-14 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Marcas que reparamos</h2>
            <p className="text-gray-500 text-sm">Todas las marcas principales del mercado dominicano</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {config.marcas.map(marca => (
              <div
                key={marca}
                className="bg-gray-bg px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-700 border border-gray-100 hover:border-primary/30 hover:text-primary transition-colors"
              >
                {marca}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ POR QUÉ ELEGIRNOS ══════════ */}
      <section className="py-16 md:py-20 bg-gray-bg">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-3">¿Por qué elegirnos?</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Shield, titulo: 'Garantía en cada servicio', desc: 'Respaldamos nuestro trabajo con garantía por escrito.' },
              { icon: MapPin, titulo: 'Seguimiento GPS en vivo', desc: 'Vea dónde está su técnico en tiempo real desde su celular.' },
              { icon: Users, titulo: 'Técnicos certificados', desc: 'Personal capacitado con años de experiencia comprobada.' },
              { icon: Clock, titulo: 'Respuesta rápida', desc: 'Le contactamos en menos de 24 horas para confirmar su cita.' },
            ].map(item => (
              <div key={item.titulo} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <item.icon size={24} className="text-primary" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{item.titulo}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CTA FINAL ══════════ */}
      {/* @safe-gradient: sección CTA marketing público — branding */}
      <section className="py-16 bg-gradient-to-r from-primary to-primary-medium">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            ¿Tiene un electrodoméstico que necesita reparación?
          </h2>
          <p className="text-blue-200 text-lg mb-8 max-w-xl mx-auto">
            No espere más. Agende su cita hoy y nuestro equipo se encargará del resto.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/agendar"
              className="flex items-center justify-center gap-2 bg-white text-primary px-8 py-4 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors shadow-lg"
            >
              <Calendar size={18} /> Agendar Cita Ahora
            </Link>
            <a
              href={`tel:${config.contacto.telefono}`}
              className="flex items-center justify-center gap-2 bg-white/10 border border-white/30 text-white px-8 py-4 rounded-xl font-bold text-sm hover:bg-white/20 transition-colors"
            >
              <Phone size={18} /> Llamar Ahora
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
