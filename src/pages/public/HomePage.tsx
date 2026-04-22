import { Link } from 'react-router-dom';
import {
  Wrench, Shield, Clock, Phone, Star, ChevronRight,
  Thermometer, Waves, Wind, Flame, Refrigerator, Zap,
  CheckCircle, ArrowRight, Users, MapPin, Calendar
} from 'lucide-react';
import WhatsAppIcon from '../../components/icons/WhatsAppIcon';
import { useConfigWeb, getWhatsAppUrl } from '../../hooks/useConfigWeb';

const SERVICIOS_DESTACADOS = [
  {
    icon: Waves,
    titulo: 'Lavadoras',
    descripcion: 'Reparación de todo tipo de lavadoras: no centrifuga, no drena, hace ruido, no enciende.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: Thermometer,
    titulo: 'Neveras y Refrigeradores',
    descripcion: 'No enfría, hace hielo excesivo, ruido extraño, fuga de agua. Todas las marcas.',
    color: 'bg-cyan-50 text-cyan-600',
  },
  {
    icon: Wind,
    titulo: 'Aires Acondicionados',
    descripcion: 'Instalación, mantenimiento preventivo, recarga de gas, limpieza profunda.',
    color: 'bg-indigo-50 text-indigo-600',
  },
  {
    icon: Flame,
    titulo: 'Estufas y Hornos',
    descripcion: 'Quemadores, hornos, encendido electrónico, válvulas de gas, resistencias.',
    color: 'bg-orange-50 text-orange-600',
  },
  {
    icon: Refrigerator,
    titulo: 'Secadoras',
    descripcion: 'No calienta, no gira, hace ruido, no seca correctamente. Servicio completo.',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: Zap,
    titulo: 'Otros Equipos',
    descripcion: 'Microondas, dispensadores de agua, extractores y más. Consúltenos.',
    color: 'bg-yellow-50 text-yellow-600',
  },
];

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

  return (
    <div>
      {/* ══════════ HERO ══════════ */}
      <section className="relative bg-gradient-to-br from-primary via-primary to-primary-medium overflow-hidden">
        {/* Decorative shapes */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full" />
          <div className="absolute bottom-0 -left-12 w-72 h-72 bg-white/5 rounded-full" />
          <div className="absolute top-1/2 right-1/4 w-48 h-48 bg-primary-light/20 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 py-20 md:py-28">
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
      </section>

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
            {SERVICIOS_DESTACADOS.map((s) => (
              <div
                key={s.titulo}
                className="group bg-gray-bg rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-transparent hover:border-gray-200"
              >
                <div className={`w-12 h-12 rounded-xl ${s.color} flex items-center justify-center mb-4`}>
                  <s.icon size={24} />
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{s.titulo}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.descripcion}</p>
              </div>
            ))}
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
