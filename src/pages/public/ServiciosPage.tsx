import { Link } from 'react-router-dom';
import {
  Waves, Thermometer, Wind, Flame, Refrigerator, Zap,
  CheckCircle, Calendar, MessageCircle, Phone, ArrowRight,
  Home, Building, Repeat, Wrench, Shield, Clock
} from 'lucide-react';
import { useConfigWeb, getWhatsAppUrl } from '../../hooks/useConfigWeb';

interface Servicio {
  icon: React.ElementType;
  titulo: string;
  descripcion: string;
  problemas: string[];
  color: string;
  bgColor: string;
}

const SERVICIOS: Servicio[] = [
  {
    icon: Waves,
    titulo: 'Lavadoras',
    descripcion: 'Reparación y mantenimiento de lavadoras de carga frontal y superior, automáticas y semiautomáticas.',
    problemas: [
      'No centrifuga o centrifuga mal',
      'No drena el agua',
      'Hace ruido fuerte al lavar',
      'No enciende o no arranca',
      'Vibra excesivamente',
      'Fuga de agua',
      'Error en panel digital',
      'Puerta no abre / no cierra',
    ],
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  {
    icon: Thermometer,
    titulo: 'Neveras y Refrigeradores',
    descripcion: 'Diagnóstico y reparación de neveras, refrigeradores y congeladores de todas las marcas.',
    problemas: [
      'No enfría correctamente',
      'Forma hielo excesivo',
      'Hace ruido extraño',
      'Fuga de agua interior',
      'Compresor no arranca',
      'Termostato defectuoso',
      'Luz interior no enciende',
      'Puerta no sella bien',
    ],
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
  },
  {
    icon: Wind,
    titulo: 'Aires Acondicionados',
    descripcion: 'Instalación, reparación y mantenimiento de sistemas de aire acondicionado split e inverter.',
    problemas: [
      'No enfría suficiente',
      'Gotea agua dentro de la casa',
      'Hace ruido o vibración',
      'No enciende',
      'Recarga de gas refrigerante',
      'Limpieza profunda de equipos',
      'Instalación de equipos nuevos',
      'Mantenimiento preventivo',
    ],
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
  },
  {
    icon: Flame,
    titulo: 'Estufas y Hornos',
    descripcion: 'Servicio técnico de estufas de gas, eléctricas, hornos y cooktops de todas las marcas.',
    problemas: [
      'Quemador no enciende',
      'Horno no calienta',
      'Olor a gas',
      'Encendido electrónico dañado',
      'Válvula de gas defectuosa',
      'Resistencia quemada',
      'Termostato no regula',
      'Perillas dañadas',
    ],
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  {
    icon: Refrigerator,
    titulo: 'Secadoras',
    descripcion: 'Reparación de secadoras de ropa a gas y eléctricas. Servicio a domicilio.',
    problemas: [
      'No calienta',
      'No gira el tambor',
      'Hace ruido fuerte',
      'No seca la ropa',
      'Se apaga sola',
      'Correa rota',
      'Sensor de humedad dañado',
      'Ventilación obstruida',
    ],
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  {
    icon: Zap,
    titulo: 'Otros Electrodomésticos',
    descripcion: 'También reparamos microondas, dispensadores de agua, extractores de grasa y más.',
    problemas: [
      'Microondas no calienta',
      'Dispensador no enfría agua',
      'Extractor no succiona',
      'Lavavajillas no lava bien',
      'Licuadora industrial',
      'Batidora profesional',
      'Otros equipos — consúltenos',
    ],
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
  },
];

const TIPOS_SERVICIO = [
  {
    icon: Home,
    titulo: 'Servicio a domicilio',
    descripcion: 'Nuestro técnico va a su casa con las herramientas necesarias para el diagnóstico y reparación.',
  },
  {
    icon: Building,
    titulo: 'Servicio en taller',
    descripcion: 'Para reparaciones que requieren trabajo especializado, recogemos y entregamos su equipo.',
  },
  {
    icon: Repeat,
    titulo: 'Mantenimiento preventivo',
    descripcion: 'Programe mantenimientos periódicos para extender la vida útil de sus equipos.',
  },
];

export default function ServiciosPage() {
  const { config } = useConfigWeb();

  return (
    <div>
      {/* ══════════ HERO ══════════ */}
      <section className="bg-gradient-to-br from-primary to-primary-medium py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Nuestros Servicios
          </h1>
          <p className="text-blue-200 text-lg max-w-2xl mx-auto">
            Reparación profesional de electrodomésticos en República Dominicana.
            Todas las marcas, todos los equipos, a domicilio o en taller.
          </p>
        </div>
      </section>

      {/* ══════════ TIPOS DE SERVICIO ══════════ */}
      <section className="py-12 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TIPOS_SERVICIO.map(tipo => (
              <div key={tipo.titulo} className="flex items-start gap-4 bg-gray-bg rounded-2xl p-5 border border-gray-100">
                <div className="w-11 h-11 bg-primary rounded-xl flex items-center justify-center shrink-0">
                  <tipo.icon size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{tipo.titulo}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{tipo.descripcion}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ SERVICIOS DETALLADOS ══════════ */}
      <section className="py-16 bg-gray-bg">
        <div className="max-w-6xl mx-auto px-4 space-y-8">
          {SERVICIOS.map((servicio, idx) => (
            <div
              key={servicio.titulo}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="p-6 md:p-8">
                <div className="flex flex-col md:flex-row md:items-start gap-6">
                  {/* Icon + Title */}
                  <div className="md:w-1/3">
                    <div className={`w-14 h-14 rounded-2xl ${servicio.bgColor} ${servicio.color} flex items-center justify-center mb-3`}>
                      <servicio.icon size={28} />
                    </div>
                    <h3 className="text-2xl font-extrabold text-gray-900 mb-2">{servicio.titulo}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed mb-4">{servicio.descripcion}</p>
                    <Link
                      to="/agendar"
                      className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-medium transition-colors"
                    >
                      <Calendar size={14} /> Agendar servicio
                    </Link>
                  </div>

                  {/* Problems list */}
                  <div className="md:w-2/3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                      Problemas que solucionamos
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {servicio.problemas.map(prob => (
                        <div key={prob} className="flex items-start gap-2 text-sm text-gray-700">
                          <CheckCircle size={14} className="text-green-500 mt-0.5 shrink-0" />
                          <span>{prob}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ MARCAS ══════════ */}
      <section className="py-14 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Marcas que atendemos</h2>
            <p className="text-gray-500 text-sm">Técnicos capacitados en todas las marcas del mercado</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {config.marcas.map(m => (
              <span
                key={m}
                className="bg-gray-bg px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-100"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ GARANTÍAS ══════════ */}
      <section className="py-14 bg-gray-bg">
        <div className="max-w-6xl mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Nuestra garantía</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Shield size={24} className="text-green-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-1">Garantía por escrito</h3>
                <p className="text-gray-500 text-sm">Cada servicio incluye garantía documentada de nuestro trabajo y repuestos.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Wrench size={24} className="text-blue-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-1">Repuestos originales</h3>
                <p className="text-gray-500 text-sm">Utilizamos repuestos de calidad y originales cuando están disponibles.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Clock size={24} className="text-purple-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-1">Seguimiento post-servicio</h3>
                <p className="text-gray-500 text-sm">Le contactamos después del servicio para asegurar su satisfacción.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ CTA ══════════ */}
      <section className="py-16 bg-gradient-to-r from-primary to-primary-medium">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-extrabold text-white mb-4">
            ¿Listo para reparar su equipo?
          </h2>
          <p className="text-blue-200 text-lg mb-8">
            Agende su cita en línea o contáctenos directamente. Respondemos en menos de 24 horas.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/agendar"
              className="flex items-center justify-center gap-2 bg-white text-primary px-8 py-4 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors shadow-lg"
            >
              <Calendar size={18} /> Agendar Cita Online
            </Link>
            <a
              href={getWhatsAppUrl(config, 'Hola, me interesa un servicio')}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-green-500 text-white px-8 py-4 rounded-xl font-bold text-sm hover:bg-green-600 transition-colors"
            >
              <MessageCircle size={18} /> Escribir por WhatsApp
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
