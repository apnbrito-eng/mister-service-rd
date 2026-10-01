import { Outlet, Link, useLocation } from 'react-router-dom';
import { Phone, Mail, MapPin, Clock, Menu, X, ArrowUpRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import { useConfigWeb } from '../../hooks/useConfigWeb';
import { obtenerWhatsAppPublico } from '../../utils/whatsappPublico';
import type { ConfigWeb } from '../../services/configWeb.service';
import './PublicWebsite.css';

function PublicNav({ config }: { config: ConfigWeb }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const botonMenu = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  useEffect(() => { setMenuAbierto(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!menuAbierto) return;
    const cerrar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') { setMenuAbierto(false); botonMenu.current?.focus(); }
    };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [menuAbierto]);
  const enlaces = [{ to: '/', label: 'Inicio' }, { to: '/servicios', label: 'Servicios' }, { to: '/agendar', label: 'Agendar cita' }];
  const activo = (ruta: string) => ruta === '/' ? location.pathname === '/' : location.pathname.startsWith(ruta);
  const links = enlaces.map(enlace => <Link key={enlace.to} to={enlace.to} aria-current={activo(enlace.to) ? 'page' : undefined}>{enlace.label}</Link>);
  return <header className="web-cabecera">
    <nav aria-label="Agendar o contactar" className="web-accesos-superiores">
      <div className="web-contenedor">
        <Link to="/agendar" className="web-boton web-boton-primario">Agendar servicio</Link>
        <a className="web-boton web-boton-whatsapp" href={obtenerWhatsAppPublico(config)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={18} /><span>Escribir por WhatsApp</span></a>
      </div>
    </nav>
    <nav aria-label="Navegación principal" className="web-contenedor web-navegacion">
      <Link to="/" className="web-marca" aria-label="Mister Service RD, inicio"><img src="/logo-compacto.png" alt="" width="48" height="48" /><span>Mister Service<span className="web-marca-rd">RD</span></span></Link>
      <div className="web-nav-escritorio">{links}</div>
      <button ref={botonMenu} type="button" className="web-menu-boton min-h-[48px] min-w-[48px]" aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuAbierto} aria-controls="menu-publico-movil" onClick={() => setMenuAbierto(!menuAbierto)}>{menuAbierto ? <X size={24} /> : <Menu size={24} />}</button>
    </nav>
    {menuAbierto && <nav aria-label="Navegación móvil" id="menu-publico-movil" className="web-menu-movil">{links}<a href={obtenerWhatsAppPublico(config)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={18} /> Escribir por WhatsApp <ArrowUpRight size={16} /></a></nav>}
  </header>;
}

function Footer({ config }: { config: ConfigWeb }) {
  const contacto = config.contacto;
  return <footer className="web-pie" id="contacto">
    <div className="web-contenedor">
      <div className="web-pie-superior">
        <div><Link to="/" className="web-marca"><img src="/logo-compacto.png" alt="" width="48" height="48" /><span>Mister Service RD</span></Link><p>Reparación y mantenimiento de electrodomésticos.<br />A domicilio y en taller.</p><a className="web-enlace" href={obtenerWhatsAppPublico(config)} target="_blank" rel="noopener noreferrer">Conversemos por WhatsApp <ArrowUpRight size={18} /></a></div>
        <nav aria-label="Enlaces del pie"><h2>Explora</h2><Link to="/servicios">Nuestros servicios</Link><Link to="/agendar">Agendar una cita</Link><Link to="/login">Acceso personal</Link></nav>
        <div className="web-contacto"><h2>Estamos para ayudarte</h2>
          {contacto.telefono && <a href={`tel:${contacto.telefono.replace(/[^+\d]/g, '')}`}><Phone size={17} />{contacto.telefono}</a>}
          {contacto.email && <a href={`mailto:${contacto.email}`}><Mail size={17} />{contacto.email}</a>}
          {contacto.direccion && <p><MapPin size={17} />{contacto.direccion}</p>}
          {contacto.horario && <p><Clock size={17} />{contacto.horario}</p>}
        </div>
      </div>
      <div className="web-pie-legal"><p>© {new Date().getFullYear()} Mister Service RD</p><div><a href="/privacidad">Privacidad</a><a href="/eliminacion-datos">Eliminar mis datos</a></div></div>
    </div>
  </footer>;
}

export default function PublicLayout() {
  const { config } = useConfigWeb();
  const location = useLocation();
  useEffect(() => {
    if (!location.hash && typeof window.scrollTo === 'function') window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname, location.hash]);
  return <div className="web-publica"><a className="web-saltar" href="#contenido-publico">Ir al contenido</a><PublicNav config={config} /><main id="contenido-publico" tabIndex={-1}><Outlet /></main><Footer config={config} /></div>;
}
