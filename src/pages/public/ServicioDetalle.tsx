import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Calendar,
  CheckCircle,
  Clock,
  Shield,
  Phone,
  Wrench,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  MapPin,
  Users,
} from 'lucide-react';
import WhatsAppIcon from '../../components/icons/WhatsAppIcon';
import { useConfigWeb, getWhatsAppUrl } from '../../hooks/useConfigWeb';
import {
  ConfigWeb,
  ServicioDetalle as ServicioDetalleType,
} from '../../services/configWeb.service';

// ─── Helpers ───────────────────────────────────────────

/**
 * Construye el JSON-LD Schema.org `Service` + `LocalBusiness` para el servicio
 * actual. Se inyecta en `<head>` desde un useEffect (ver más abajo).
 * Removemos campos `undefined` para que el JSON quede limpio.
 */
function buildServiceJsonLd(
  servicio: ServicioDetalleType,
  config: ConfigWeb,
): string {
  const telefono = config.contacto?.telefono;
  const whatsapp = config.whatsapp?.numeros?.find((n) => n.activo)?.numero;
  const direccion = config.contacto?.direccion;
  const descripcion = servicio.descripcionLarga || servicio.descripcionCorta;

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: servicio.titulo,
    provider: {
      '@type': 'LocalBusiness',
      name: 'Mister Service RD',
      ...(telefono ? { telephone: telefono } : whatsapp ? { telephone: whatsapp } : {}),
      ...(direccion ? { address: direccion } : {}),
    },
    areaServed: 'Santo Domingo, República Dominicana',
    ...(descripcion ? { description: descripcion } : {}),
  };
  return JSON.stringify(data);
}

// ─── 404 amigable ──────────────────────────────────────

function ServicioNoEncontrado({ config }: { config: ConfigWeb }) {
  const whatsappActivo = config.whatsapp?.numeros?.find((n) => n.activo);
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-lg w-full text-center bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-10">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Wrench size={32} className="text-gray-400" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-2">
          Servicio no encontrado
        </h1>
        <p className="text-gray-500 mb-8">
          El servicio que buscas no está disponible.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-primary-medium transition-colors"
          >
            <ArrowLeft size={16} /> Volver al inicio
          </Link>
          {whatsappActivo && (
            <a
              href={getWhatsAppUrl(config)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-green-500 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-green-600 transition-colors"
            >
              <WhatsAppIcon filled={false} className="text-white" size={16} />
              Hablar por WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FAQ accordion ─────────────────────────────────────

function FaqAccordion({ faqs }: { faqs: ServicioDetalleType['faqs'] }) {
  const [abierto, setAbierto] = useState<number | null>(0);
  if (!faqs || faqs.length === 0) return null;
  return (
    <div className="space-y-3">
      {faqs.map((f, idx) => {
        const isOpen = abierto === idx;
        return (
          <div
            key={idx}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setAbierto(isOpen ? null : idx)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="font-semibold text-gray-900 text-sm md:text-base">
                {f.pregunta || 'Pregunta'}
              </span>
              {isOpen ? (
                <ChevronUp size={18} className="text-gray-400 shrink-0" />
              ) : (
                <ChevronDown size={18} className="text-gray-400 shrink-0" />
              )}
            </button>
            {isOpen && (
              <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed">
                {f.respuesta || '—'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Página principal ──────────────────────────────────

export default function ServicioDetalle() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { config, loading } = useConfigWeb();

  const servicios = config.servicios || {};
  const servicio = servicios[slug];
  const valido = !!servicio && servicio.habilitado !== false;

  // ─── Meta tags + JSON-LD ────────────────────────────
  // Manejamos los nodos que añadimos manualmente para limpiarlos en
  // unmount sin tocar otros <meta> / <title> / <script> del documento.
  useEffect(() => {
    if (!valido || !servicio) return;

    const prevTitle = document.title;
    document.title = `${servicio.titulo} | Mister Service RD`;

    // <meta name="description">
    let descMeta = document.querySelector(
      'meta[name="description"]',
    ) as HTMLMetaElement | null;
    let descMetaCreated = false;
    const previousDescContent = descMeta?.content;
    if (!descMeta) {
      descMeta = document.createElement('meta');
      descMeta.name = 'description';
      document.head.appendChild(descMeta);
      descMetaCreated = true;
    }
    descMeta.content =
      servicio.descripcionCorta || servicio.descripcionLarga || '';

    // <script type="application/ld+json"> propio
    const ldScript = document.createElement('script');
    ldScript.type = 'application/ld+json';
    ldScript.dataset.servicio = servicio.slug;
    ldScript.text = buildServiceJsonLd(servicio, config);
    document.head.appendChild(ldScript);

    return () => {
      document.title = prevTitle;
      if (descMetaCreated) {
        descMeta?.parentNode?.removeChild(descMeta);
      } else if (descMeta) {
        descMeta.content = previousDescContent ?? '';
      }
      ldScript.parentNode?.removeChild(ldScript);
    };
  }, [valido, servicio, config]);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-gray-400">
        Cargando…
      </div>
    );
  }

  if (!valido || !servicio) {
    return <ServicioNoEncontrado config={config} />;
  }

  const whatsappUrl = getWhatsAppUrl(
    config,
    `Hola, me interesa el servicio de ${servicio.tipoEquipo || servicio.titulo}.`,
  );
  const tieneHero = !!servicio.imagenHero;

  return (
    <div>
      {/* ══════════ HERO ══════════ */}
      {/* @safe-gradient: hero marketing detalle de servicio — branding */}
      <section className="relative bg-gradient-to-br from-primary via-primary to-primary-medium overflow-hidden">
        {tieneHero && (
          <>
            <img
              src={servicio.imagenHero}
              alt={servicio.titulo}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div
              className="absolute inset-0 bg-black/55"
              aria-hidden="true"
            />
          </>
        )}
        {!tieneHero && (
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full" />
            <div className="absolute bottom-0 -left-12 w-72 h-72 bg-white/5 rounded-full" />
          </div>
        )}

        <div className="relative z-10 max-w-6xl mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-white/90 text-xs font-medium mb-5">
              <Shield size={14} /> {servicio.tipoEquipo || 'Servicio técnico'}
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-4">
              {servicio.titulo}
            </h1>
            {servicio.descripcionCorta && (
              <p className="text-blue-100 text-base md:text-lg mb-7 leading-relaxed max-w-2xl">
                {servicio.descripcionCorta}
              </p>
            )}
            {servicio.tiempoEstimadoReparacion && (
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg text-white/90 text-xs mb-7">
                <Clock size={14} />
                Tiempo estimado: {servicio.tiempoEstimadoReparacion}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/agendar"
                className="flex items-center justify-center gap-2 bg-white text-primary px-6 py-3.5 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors shadow-lg"
              >
                <Calendar size={18} /> Agendar Cita Online
              </Link>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-green-500 text-white px-6 py-3.5 rounded-xl font-bold text-sm hover:bg-green-600 transition-colors"
              >
                <WhatsAppIcon filled={false} className="text-white" size={18} />
                Escribir por WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ DESCRIPCIÓN LARGA ══════════ */}
      {servicio.descripcionLarga && (
        <section className="py-12 bg-white">
          <div className="max-w-3xl mx-auto px-4">
            <p className="text-gray-700 text-base md:text-lg leading-relaxed whitespace-pre-line">
              {servicio.descripcionLarga}
            </p>
          </div>
        </section>
      )}

      {/* ══════════ PROBLEMAS COMUNES ══════════ */}
      {servicio.problemasComunes.length > 0 && (
        <section className="py-12 md:py-16 bg-gray-bg">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">
                Problemas que reparamos
              </h2>
              <p className="text-gray-500 max-w-xl mx-auto">
                Atendemos las fallas más comunes y también las difíciles. Si no ves
                la tuya en la lista, escríbenos.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {servicio.problemasComunes.map((p) => (
                <div
                  key={p}
                  className="flex items-start gap-3 bg-white rounded-xl border border-gray-100 p-4"
                >
                  <CheckCircle
                    size={18}
                    className="text-green-500 mt-0.5 shrink-0"
                  />
                  <span className="text-sm text-gray-700">{p}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════ MARCAS ══════════ */}
      {servicio.marcasReparadas.length > 0 && (
        <section className="py-12 bg-white">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
                Marcas que reparamos
              </h2>
              <p className="text-gray-500 text-sm">
                Técnicos capacitados en las principales marcas del mercado dominicano.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {servicio.marcasReparadas.map((m) => (
                <span
                  key={m}
                  className="bg-gray-bg px-4 py-2 rounded-xl text-sm font-semibold text-gray-700 border border-gray-100"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════ CÓMO TRABAJAMOS ══════════ */}
      <section className="py-12 md:py-16 bg-gray-bg">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">
              Cómo trabajamos
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Proceso claro de principio a fin. Sin sorpresas.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                titulo: '1. Agendas',
                desc: 'Online o por WhatsApp. Eliges fecha y hora.',
                icon: Calendar,
              },
              {
                titulo: '2. Visitamos',
                desc: 'Técnico va a tu casa con sus herramientas.',
                icon: MapPin,
              },
              {
                titulo: '3. Diagnóstico',
                desc: 'Honesto: chequeo a domicilio RD$2,000.',
                icon: Wrench,
              },
              {
                titulo: '4. Reparación',
                desc: 'Con Conduce de Garantía CG-#### por escrito.',
                icon: Shield,
              },
            ].map((paso) => (
              <div
                key={paso.titulo}
                className="bg-white rounded-2xl border border-gray-100 p-5"
              >
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mb-3">
                  <paso.icon size={20} className="text-primary" />
                </div>
                <h3 className="font-bold text-gray-900 text-sm mb-1">
                  {paso.titulo}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  {paso.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ GARANTÍA ══════════ */}
      <section className="py-12 bg-white">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-emerald-50 rounded-2xl p-6 md:p-8 border border-emerald-200">
            <div className="flex flex-col md:flex-row items-start gap-5">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shrink-0">
                <Shield size={28} className="text-emerald-600" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-extrabold text-gray-900 mb-2">
                  Conduce de Garantía con cada servicio
                </h2>
                <p className="text-gray-700 text-sm md:text-base leading-relaxed">
                  Cada reparación incluye un Conduce de Garantía CG-#### por
                  escrito. Cubre repuestos y mano de obra. Si vuelve a fallar lo
                  mismo dentro del periodo de garantía, lo cubrimos sin costo
                  adicional.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ CTA GRANDE ══════════ */}
      {/* @safe-gradient: sección CTA marketing público — branding */}
      <section className="py-14 md:py-16 bg-gradient-to-r from-primary to-primary-medium">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-4">
            ¿Listo para agendar?
          </h2>
          <p className="text-blue-100 text-base md:text-lg mb-8 max-w-xl mx-auto">
            Reserva en línea o escríbenos por WhatsApp. Respondemos en menos de 24
            horas.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/agendar"
              className="flex items-center justify-center gap-2 bg-white text-primary px-8 py-4 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors shadow-lg"
            >
              <Calendar size={18} />
              Agendar reparación de {servicio.tipoEquipo || 'equipo'}
            </Link>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-green-500 text-white px-8 py-4 rounded-xl font-bold text-sm hover:bg-green-600 transition-colors"
            >
              <WhatsAppIcon filled={false} className="text-white" size={18} />
              Hablar por WhatsApp
            </a>
          </div>
          {config.contacto?.telefono && (
            <a
              href={`tel:${config.contacto.telefono}`}
              className="inline-flex items-center justify-center gap-2 mt-4 text-blue-100 text-sm hover:text-white transition-colors"
            >
              <Phone size={14} /> {config.contacto.telefono}
            </a>
          )}
        </div>
      </section>

      {/* ══════════ FAQs ══════════ */}
      {servicio.faqs.length > 0 && (
        <section className="py-12 md:py-16 bg-gray-bg">
          <div className="max-w-3xl mx-auto px-4">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-2">
                Preguntas frecuentes
              </h2>
              <p className="text-gray-500 text-sm">
                Resolvemos las dudas más comunes sobre el servicio.
              </p>
            </div>
            <FaqAccordion faqs={servicio.faqs} />
          </div>
        </section>
      )}

      {/* ══════════ CONFIANZA / FOOTER LIGERO ══════════ */}
      <section className="py-12 bg-white">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: Shield,
                titulo: 'Garantía por escrito',
                desc: 'CG-#### con cada servicio.',
              },
              {
                icon: Users,
                titulo: 'Técnicos certificados',
                desc: 'Personal capacitado con experiencia.',
              },
              {
                icon: Clock,
                titulo: 'Respuesta rápida',
                desc: 'Confirmamos en menos de 24 horas.',
              },
            ].map((b) => (
              <div
                key={b.titulo}
                className="flex items-start gap-3 bg-gray-bg rounded-2xl p-5 border border-gray-100"
              >
                <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                  <b.icon size={20} className="text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">{b.titulo}</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              to="/servicios"
              className="inline-flex items-center gap-1 text-primary text-sm font-semibold hover:gap-2 transition-all"
            >
              <ArrowLeft size={14} /> Ver todos los servicios
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
