import { Outlet, Link, useLocation } from 'react-router-dom';
import { Phone, Mail, MapPin, Clock, Menu, X } from 'lucide-react';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import { useState, useEffect } from 'react';
import { useConfigWeb, getWhatsAppUrl } from '../../hooks/useConfigWeb';
import { ConfigWeb } from '../../services/configWeb.service';

function PublicNav({ config }: { config: ConfigWeb }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  const navLinks = [
    { to: '/', label: 'Inicio' },
    { to: '/servicios', label: 'Servicios' },
    { to: '/agendar', label: 'Agendar Cita' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-white/95 backdrop-blur-md shadow-md' : 'bg-white shadow-sm'
    }`}>
      {/* Top bar */}
      <div className="bg-primary text-white text-xs py-1.5 hidden md:block">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Phone size={10} /> {config.contacto.telefono}
            </span>
            <span className="flex items-center gap-1">
              <Mail size={10} /> {config.contacto.email}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={10} /> {config.contacto.horario}
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img
            src="/logo-compacto.png"
            alt="Mister Service RD"
            className="h-12 w-auto select-none"
            draggable={false}
          />
          <span className="font-bold text-lg text-primary leading-tight hidden sm:inline">
            Mister Service RD
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm font-medium transition-colors ${
                isActive(link.to)
                  ? 'text-primary border-b-2 border-primary pb-0.5'
                  : 'text-gray-600 hover:text-primary'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <a
            href={getWhatsAppUrl(config)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
          >
            <WhatsAppIcon filled={false} className="text-white" size={16} /> WhatsApp
          </a>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden p-2 text-gray-700 hover:text-primary"
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3 shadow-lg">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`block text-sm font-medium py-2 px-3 rounded-lg transition-colors ${
                isActive(link.to)
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <a
            href={getWhatsAppUrl(config)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-green-500 text-white px-4 py-3 rounded-xl text-sm font-semibold w-full"
          >
            <WhatsAppIcon filled={false} className="text-white" size={16} /> Escribir por WhatsApp
          </a>
        </div>
      )}
    </nav>
  );
}

function Footer({ config }: { config: ConfigWeb }) {
  return (
    <footer className="bg-primary text-white">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <img
                src="/logo-compacto.png"
                alt="Mister Service RD"
                className="h-12 w-auto select-none"
                draggable={false}
              />
              <span className="font-bold text-xl leading-tight">Mister Service RD</span>
            </div>
            <p className="text-blue-200 text-sm leading-relaxed">
              Servicio técnico profesional de electrodomésticos en República Dominicana.
              Más de 10 años cuidando el hogar dominicano.
            </p>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Navegación</h3>
            <div className="space-y-2">
              <Link to="/" className="block text-blue-200 hover:text-white text-sm transition-colors">Inicio</Link>
              <Link to="/servicios" className="block text-blue-200 hover:text-white text-sm transition-colors">Servicios</Link>
              <Link to="/agendar" className="block text-blue-200 hover:text-white text-sm transition-colors">Agendar Cita</Link>
              <Link to="/login" className="block text-blue-300/50 hover:text-white text-sm transition-colors mt-4">Acceso Personal</Link>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Contacto</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm text-blue-200">
                <Phone size={14} className="mt-0.5 shrink-0" />
                <div>
                  {config.whatsapp.numeros.filter(n => n.activo).map((n, i) => (
                    <span key={i} className="block">{n.numero}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-2 text-sm text-blue-200">
                <Mail size={14} className="mt-0.5 shrink-0" />
                <span>{config.contacto.email}</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-blue-200">
                <MapPin size={14} className="mt-0.5 shrink-0" />
                <span>{config.contacto.direccion}</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-blue-200">
                <Clock size={14} className="mt-0.5 shrink-0" />
                <span>{config.contacto.horario}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/20 mt-8 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-blue-200 text-xs">
            © {new Date().getFullYear()} Mister Service RD. Todos los derechos reservados.
          </p>
          <p className="text-blue-300/60 text-xs">
            misterservicerd.com
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function PublicLayout() {
  const { config } = useConfigWeb();

  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav config={config} />
      {/* Spacer for fixed nav */}
      <div className="h-[60px] md:h-[88px]" />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer config={config} />

      {/* Floating WhatsApp button (mobile) */}
      <a
        href={getWhatsAppUrl(config)}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 bg-green-500 text-white p-4 rounded-full shadow-lg hover:bg-green-600 transition-colors"
        aria-label="WhatsApp"
      >
        <WhatsAppIcon filled={false} className="text-white" size={24} />
      </a>
    </div>
  );
}
