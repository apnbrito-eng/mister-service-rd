import { Link, useLocation } from 'react-router-dom';
import { Home, MessageCircle, CalendarDays, Menu } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { obtenerAreas, areaPath } from '../navigation/areas';
import { puede } from '../utils/permisos';

/** Shortcuts mirror sidebar visibility; the full menu remains available. */
export default function NavegacionMovil({ onMenu, menuAbierto }: { onMenu: () => void; menuAbierto: boolean }) {
  const { userProfile } = useApp();
  const { pathname } = useLocation();
  if (!userProfile) return null;
  const oficina = ['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(userProfile.rol);
  const areas = obtenerAreas(userProfile);
  const accesoArea = (id: string) => {
    const nodo = areas.find(n => n.kind === 'section' && n.section.id === id);
    if (!nodo || nodo.kind !== 'section') return undefined;
    const items = nodo.section.items.filter(item => item.show);
    if (!items.length) return undefined;
    return { to: items[0].to, activo: pathname === areaPath(id) || items.some(item => pathname === item.to || pathname.startsWith(item.to + '/')) };
  };
  const atencion = accesoArea('v2_atencion'), servicios = accesoArea('v2_servicios');
  const accesos = [
    { to: '/admin/dashboard', nombre: 'Inicio', Icono: Home, visible: true, activo: pathname === '/admin/dashboard' },
    { to: atencion?.to ?? '', nombre: 'Atención', Icono: MessageCircle, visible: oficina && !!atencion, activo: atencion?.activo },
    { to: servicios?.to ?? '', nombre: 'Servicios', Icono: CalendarDays, visible: puede(userProfile, 'ordenesVer') && !!servicios, activo: servicios?.activo },
  ].filter(a => a.visible);
  return <nav aria-label="Navegación principal móvil" className="mobile-navigation lg:hidden">
    {accesos.map(({ to, nombre, Icono, activo }) => <Link key={to} to={to} aria-current={activo ? 'page' : undefined} className={`mobile-navigation-item ${activo ? 'is-active' : ''}`}>
      <Icono size={22} aria-hidden="true" /><span>{nombre}</span>
    </Link>)}
    <button type="button" className="mobile-navigation-item" onClick={onMenu} aria-expanded={menuAbierto} aria-label="Ver todos los módulos"><Menu size={22} aria-hidden="true" /><span>Más</span></button>
  </nav>;
}
