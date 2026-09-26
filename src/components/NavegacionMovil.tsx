import { NavLink } from 'react-router-dom';
import { Home, MessageCircle, CalendarDays, Users, Menu } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';

/** Shortcuts mirror sidebar visibility; the full menu remains available. */
export default function NavegacionMovil({ onMenu, menuAbierto }: { onMenu: () => void; menuAbierto: boolean }) {
  const { userProfile } = useApp();
  if (!userProfile) return null;
  const oficina = ['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(userProfile.rol);
  const accesos = [
    { to: '/admin/dashboard', nombre: 'Inicio', Icono: Home, visible: true },
    { to: '/admin/inbox', nombre: 'Chats', Icono: MessageCircle, visible: oficina },
    { to: '/admin/ordenes', nombre: 'Servicios', Icono: CalendarDays, visible: puede(userProfile, 'ordenesVer') },
    { to: '/admin/clientes', nombre: 'Clientes', Icono: Users, visible: puede(userProfile, 'clientesVer') },
  ].filter(a => a.visible);
  return <nav aria-label="Navegación principal móvil" className="mobile-navigation lg:hidden">
    {accesos.map(({ to, nombre, Icono }) => <NavLink key={to} to={to} className={({ isActive }) => `mobile-navigation-item ${isActive ? 'is-active' : ''}`}>
      <Icono size={22} aria-hidden="true" /><span>{nombre}</span>
    </NavLink>)}
    <button type="button" className="mobile-navigation-item" onClick={onMenu} aria-expanded={menuAbierto} aria-label="Ver todos los módulos"><Menu size={22} aria-hidden="true" /><span>Más</span></button>
  </nav>;
}
