import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Calendar, Map,
  Users, UserCog, FileText, Settings, LogOut, Wrench,
  TrendingUp, DollarSign, Bell, Clock, ChevronLeft, ChevronRight,
  Receipt, ShoppingBag, CalendarDays, Shield, Globe, Building2, Inbox, ClipboardCheck, Tag, Boxes, Wallet, XCircle,
  CalendarCheck,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useApp } from '../context/AppContext';
import { puede, type AccionPermiso } from '../utils/permisos';
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
  const [solicitudesCount, setSolicitudesCount] = useState(0);
  const [facturacionPendienteCount, setFacturacionPendienteCount] = useState(0);

  useEffect(() => {
    const q1 = query(collection(db, 'standby_piezas'), where('estado', '!=', 'llego'));
    const unsub1 = onSnapshot(q1, (snap) => setStandbyCount(snap.size));

    const unsub2 = onSnapshot(collection(db, 'citas_por_confirmar'), (snap) => setCitasCount(snap.size));

    const q3 = query(collection(db, 'solicitudes_servicio'), where('estado', '==', 'pendiente'));
    const unsub3 = onSnapshot(q3, (snap) => setSolicitudesCount(snap.size));

    const q4 = query(collection(db, 'ordenes_servicio'), where('enviadaAFacturacion', '==', true));
    const unsub4 = onSnapshot(q4, (snap) => {
      const count = snap.docs.filter(d => {
        const data = d.data();
        return !data.facturada && !data.eliminada;
      }).length;
      setFacturacionPendienteCount(count);
    });

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const esAdminOCoord = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';
  // Alias mantenido: ahora coordinadora también cuenta como "admin" en visibilidad
  const isAdmin = esAdminOCoord;
  const isOperaria = userProfile?.rol === 'operaria' || isAdmin;
  const isSecretaria = userProfile?.rol === 'secretaria' || isAdmin;
  // Permisos granulares
  const p = (acc: AccionPermiso) => puede(userProfile, acc);

  const navItems = [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard', show: true },
    { to: '/admin/agenda-dia', icon: CalendarCheck, label: 'Agenda del Día', show: p('ordenesVer') },
    { to: '/admin/ordenes', icon: ClipboardList, label: 'Órdenes', show: p('ordenesVer') },
    { to: '/admin/citas', icon: Bell, label: 'Citas por Confirmar', badge: citasCount, show: p('ordenesVer') },
    { to: '/admin/calendario', icon: Calendar, label: 'Calendario', show: p('ordenesVer') },
    { to: '/admin/calendarios', icon: CalendarDays, label: 'Calendarios', show: isAdmin || isOperaria || isSecretaria },
    { to: '/admin/standby', icon: Clock, label: 'Stand-by / Piezas', badge: standbyCount, show: p('ordenesVer') },
    { to: '/admin/mapa', icon: Map, label: 'Mapa de Rutas', show: p('ordenesVer') },
    { to: '/admin/clientes', icon: Users, label: 'Clientes', show: p('clientesVer') },
    { to: '/admin/cotizaciones', icon: FileText, label: 'Cotizaciones', show: p('cotizacionesVer') },
    { to: '/admin/facturas', icon: Receipt, label: 'Conduces de Garantía', show: p('facturasVer') },
    { to: '/admin/facturacion-pendiente', icon: Inbox, label: 'Conduces Pendientes', badge: facturacionPendienteCount, show: isAdmin || userProfile?.rol === 'coordinadora' },
    { to: '/admin/taller', icon: Wrench, label: 'Equipos Taller', show: p('ordenesVer') },
    { to: '/admin/productos', icon: ShoppingBag, label: 'Catálogo', show: p('ordenesVer') },
    { to: '/admin/mantenimiento', icon: Calendar, label: 'Mantenimiento', show: p('ordenesVer') },
    { to: '/admin/gastos', icon: DollarSign, label: 'Gastos e Ingresos', show: p('gastosVer') },
    { to: '/admin/rendimiento', icon: TrendingUp, label: 'Rendimiento', show: p('rendimientoVer') },
    { to: '/admin/metricas-mensuales', icon: TrendingUp, label: 'Métricas del Mes', show: p('rendimientoVer') || isAdmin },
    { to: '/admin/cierre-dia', icon: ClipboardCheck, label: 'Cierre del Día', show: p('cierreDiaEjecutar') },
    { to: '/admin/comisiones', icon: DollarSign, label: 'Comisiones', show: isAdmin || p('configuracionVer') },
    { to: '/admin/nomina', icon: Wallet, label: 'Nómina', show: isAdmin || userProfile?.rol === 'coordinadora' },
    { to: '/admin/avances', icon: Wallet, label: 'Avances a Empleados', show: p('avancesGestionar') },
    { to: '/admin/estado-resultado', icon: TrendingUp, label: 'Estado de Resultado', show: isAdmin || userProfile?.rol === 'coordinadora' },
    { to: '/admin/historial-anuladas', icon: XCircle, label: 'Historial Anuladas', show: isAdmin || userProfile?.rol === 'coordinadora' || p('ordenesVerEliminadas') },
    { to: '/admin/precios', icon: Tag, label: 'Precios de Servicios', show: isAdmin || p('configuracionModificar') },
    { to: '/admin/bancos', icon: Building2, label: 'Bancos', show: p('bancosGestionar') },
    { to: '/admin/inventario', icon: Boxes, label: 'Inventario', show: p('configuracionModificar') || userProfile?.rol === 'operaria' || isAdmin },
    { to: '/admin/personal', icon: UserCog, label: 'Personal', show: p('personalVer') },
    { to: '/admin/usuarios', icon: Shield, label: 'Usuarios & Permisos', show: p('personalModificar') },
    { to: '/admin/web', icon: Globe, label: 'Página Web', show: isAdmin },
    { to: '/admin/empresas-aliadas', icon: Building2, label: 'Empresas Aliadas', show: isAdmin },
    { to: '/admin/formularios', icon: FileText, label: 'Formularios', show: isAdmin },
    { to: '/admin/solicitudes', icon: Inbox, label: 'Solicitudes', badge: solicitudesCount, show: isAdmin },
    { to: '/admin/configuracion', icon: Settings, label: 'Configuración', show: p('configuracionVer') },
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
