import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Calendar, Map,
  Users, UserCog, FileText, Settings, LogOut, Wrench,
  TrendingUp, DollarSign, Bell, Clock, ChevronLeft, ChevronRight,
  Receipt, ShoppingBag, CalendarDays, Shield,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useApp } from '../context/AppContext';
import Logo from './Logo';
import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { userProfile } = useApp();
  const navigate = useNavigate();
  const [standbyCount, setStandbyCount] = useState(0);
  const [citasCount, setCitasCount] = useState(0);

  useEffect(() => {
    const q1 = query(collection(db, 'standby_piezas'), where('estado', '!=', 'llego'));
    const unsub1 = onSnapshot(q1, (snap) => setStandbyCount(snap.size));

    const unsub2 = onSnapshot(collection(db, 'citas_por_confirmar'), (snap) => setCitasCount(snap.size));

    return () => { unsub1(); unsub2(); };
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const isAdmin = userProfile?.rol === 'administrador';
  const isOperaria = userProfile?.rol === 'operaria' || isAdmin;
  const isSecretaria = userProfile?.rol === 'secretaria' || isAdmin;

  const navItems = [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard', show: true },
    { to: '/admin/ordenes', icon: ClipboardList, label: 'Órdenes', show: true },
    { to: '/admin/citas', icon: Bell, label: 'Citas por Confirmar', badge: citasCount, show: true },
    { to: '/admin/calendario', icon: Calendar, label: 'Calendario', show: true },
    { to: '/admin/calendarios', icon: CalendarDays, label: 'Calendarios', show: isAdmin || isOperaria || isSecretaria },
    { to: '/admin/standby', icon: Clock, label: 'Stand-by / Piezas', badge: standbyCount, show: true },
    { to: '/admin/mapa', icon: Map, label: 'Mapa de Rutas', show: true },
    { to: '/admin/clientes', icon: Users, label: 'Clientes', show: true },
    { to: '/admin/cotizaciones', icon: FileText, label: 'Cotizaciones', show: isOperaria || isSecretaria },
    { to: '/admin/facturas', icon: Receipt, label: 'Facturas', show: isAdmin || isOperaria },
    { to: '/admin/taller', icon: Wrench, label: 'Equipos Taller', show: true },
    { to: '/admin/productos', icon: ShoppingBag, label: 'Catálogo', show: true },
    { to: '/admin/mantenimiento', icon: Calendar, label: 'Mantenimiento', show: true },
    { to: '/admin/gastos', icon: DollarSign, label: 'Gastos e Ingresos', show: isAdmin },
    { to: '/admin/rendimiento', icon: TrendingUp, label: 'Rendimiento', show: isAdmin || isOperaria },
    { to: '/admin/personal', icon: UserCog, label: 'Personal', show: isAdmin },
    { to: '/admin/usuarios', icon: Shield, label: 'Usuarios & Permisos', show: isAdmin },
    { to: '/admin/configuracion', icon: Settings, label: 'Configuración', show: isAdmin },
  ];

  return (
    <aside
      className={`bg-[#0f3460] flex flex-col h-full transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'} relative`}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-6 z-10 bg-[#1a5fa8] text-white rounded-full w-6 h-6 flex items-center justify-center shadow-lg hover:bg-[#2d7dd2] transition-colors"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Logo */}
      <div className={`p-4 border-b border-white/10 ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <div className="bg-white/20 rounded-xl p-2">
            <Wrench size={20} className="text-white" />
          </div>
        ) : (
          <Logo white />
        )}
      </div>

      {/* User info */}
      {!collapsed && userProfile && (
        <div className="px-4 py-3 border-b border-white/10">
          <div className="text-white font-medium text-sm truncate">{userProfile.nombre}</div>
          <div className="text-blue-300 text-xs capitalize">{userProfile.rol}</div>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.filter(item => item.show).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-colors text-sm relative group ${
                isActive
                  ? 'bg-white/20 text-white font-medium'
                  : 'text-blue-200 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <item.icon size={18} className="flex-shrink-0" />
            {!collapsed && (
              <>
                <span className="truncate">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                    {item.badge}
                  </span>
                )}
              </>
            )}
            {collapsed && item.badge !== undefined && item.badge > 0 && (
              <span className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
            {/* Tooltip for collapsed */}
            {collapsed && (
              <div className="absolute left-full ml-2 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {item.label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2.5 w-full rounded-lg text-blue-200 hover:bg-white/10 hover:text-white transition-colors text-sm group relative"
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
          {collapsed && (
            <div className="absolute left-full ml-2 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              Cerrar sesión
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
