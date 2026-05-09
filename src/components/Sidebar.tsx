import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Calendar, Map,
  Users, UserCog, FileText, Settings, LogOut, Wrench,
  TrendingUp, DollarSign, Bell, Clock, ChevronLeft, ChevronRight, ChevronDown,
  Receipt, ShoppingBag, CalendarDays, Shield, Globe, Building2, Inbox, ClipboardCheck, Tag, Boxes, Wallet, XCircle,
  CalendarCheck, Sparkles, History, Star, RefreshCw, Banknote,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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

type SidebarItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  show: boolean;
  badge?: number;
};

type SidebarSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: SidebarItem[];
  defaultExpanded: boolean;
};

type SidebarNode =
  | { kind: 'item'; item: SidebarItem }
  | { kind: 'section'; section: SidebarSection };

const STORAGE_KEY = 'sidebar_sections_state';

function loadState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* silencio */
  }
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { userProfile } = useApp();
  const navigate = useNavigate();
  const [standbyCount, setStandbyCount] = useState(0);
  const [ordenesStandbyCount, setOrdenesStandbyCount] = useState(0);
  const [citasCount, setCitasCount] = useState(0);
  const [solicitudesCount, setSolicitudesCount] = useState(0);
  const [facturacionPendienteCount, setFacturacionPendienteCount] = useState(0);
  const [sugerenciasChequeoCount, setSugerenciasChequeoCount] = useState(0);
  const [reprogramacionesCount, setReprogramacionesCount] = useState(0);
  const [sectionsState, setSectionsState] = useState<Record<string, boolean>>(loadState);

  useEffect(() => {
    const q1 = query(collection(db, 'standby_piezas'), where('estado', '!=', 'llego'));
    const unsub1 = onSnapshot(q1, (snap) => setStandbyCount(snap.size));

    const q1b = query(collection(db, 'ordenes_servicio'), where('enStandby', '==', true));
    const unsub1b = onSnapshot(q1b, (snap) => {
      // Filtrar eliminadas en cliente para evitar índice compuesto
      const count = snap.docs.filter(d => !d.data().eliminada).length;
      setOrdenesStandbyCount(count);
    });

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

    return () => { unsub1(); unsub1b(); unsub2(); unsub3(); unsub4(); };
  }, []);

  // Sugerencias de "solo chequeo" pendientes (sprint R4 endurecida).
  // El badge solo se renderiza para admin/coord; gateamos el listener al
  // mismo set de roles para evitar leer toda `ordenes_servicio` con
  // técnico/ayudante/secretaria/operaria. No hay índice compuesto;
  // filtramos client-side.
  useEffect(() => {
    if (
      userProfile?.rol !== 'administrador' &&
      userProfile?.rol !== 'coordinadora'
    ) {
      setSugerenciasChequeoCount(0);
      return;
    }
    const unsub = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      let count = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.eliminada) return;
        const lista = data.sugerenciasSoloChequeo;
        if (!Array.isArray(lista)) return;
        if (lista.some(s => s && s.estado === 'pendiente')) count++;
      });
      setSugerenciasChequeoCount(count);
    });
    return () => unsub();
  }, [userProfile?.rol]);

  // Reprogramaciones pendientes (Hito 2 Portal Cliente). Mismo patrón que
  // SugerenciasChequeo: gateamos por rol para no desperdiciar lecturas
  // y filtramos client-side para evitar índice compuesto sobre arrays.
  useEffect(() => {
    if (
      userProfile?.rol !== 'administrador' &&
      userProfile?.rol !== 'coordinadora'
    ) {
      setReprogramacionesCount(0);
      return;
    }
    const unsub = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      let count = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.eliminada) return;
        const lista = data.propuestasReprogramacion;
        if (!Array.isArray(lista)) return;
        // Solo contar propuestas del CLIENTE pendientes — las
        // contrapropuestas del propio admin no incrementan el badge.
        if (lista.some(p => p && p.estado === 'pendiente' && p.propuestaPor === 'cliente')) count++;
      });
      setReprogramacionesCount(count);
    });
    return () => unsub();
  }, [userProfile?.rol]);

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

  // Estructura del sidebar: secciones colapsables + items sueltos
  const estructura: SidebarNode[] = [
    // Ponche — item suelto (visible a TODOS los roles, primera posición)
    {
      kind: 'item',
      item: { to: '/ponche', icon: Clock, label: 'Ponche', show: true },
    },
    // Dashboard — item suelto
    {
      kind: 'item',
      item: { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard', show: true },
    },
    // Bandeja de entrada (SPRINT-117c2): agrupa los 3 inboxes de revisión
    // que comparten flujo "revisar → aprobar/rechazar". Reduce ruido en
    // Operaciones. Plan de rollback: revertir el commit, los 3 ítems
    // vuelven a Operaciones con su orden original.
    {
      kind: 'section',
      section: {
        id: 'bandeja_entrada',
        label: 'Bandeja de entrada',
        icon: Inbox,
        defaultExpanded: true,
        items: [
          { to: '/admin/citas', icon: Bell, label: 'Citas por Confirmar', badge: citasCount, show: p('ordenesVer') },
          { to: '/admin/reprogramaciones', icon: RefreshCw, label: 'Reprogramaciones', badge: reprogramacionesCount, show: esAdminOCoord },
          { to: '/admin/sugerencias-chequeo', icon: ClipboardCheck, label: 'Sugerencias chequeo', badge: sugerenciasChequeoCount, show: esAdminOCoord },
        ],
      },
    },
    // Operaciones
    {
      kind: 'section',
      section: {
        id: 'operaciones',
        label: 'Operaciones',
        icon: ClipboardList,
        defaultExpanded: true,
        items: [
          { to: '/admin/agenda-dia', icon: CalendarCheck, label: 'Agenda del Día', show: p('ordenesVer') },
          { to: '/admin/ordenes', icon: ClipboardList, label: 'Órdenes', show: p('ordenesVer') },
          { to: '/admin/calendario', icon: Calendar, label: 'Calendario', show: p('ordenesVer') },
          { to: '/admin/calendarios', icon: CalendarDays, label: 'Calendarios públicos (Calendly)', show: isAdmin || isOperaria || isSecretaria },
          { to: '/admin/standby', icon: Clock, label: 'Pendiente de piezas', badge: standbyCount + ordenesStandbyCount, show: p('ordenesVer') },
          { to: '/admin/mapa', icon: Map, label: 'Mapa de Rutas', show: p('ordenesVer') },
          { to: '/admin/cierre-dia', icon: ClipboardCheck, label: 'Cierre del Día', show: p('cierreDiaEjecutar') },
          { to: '/admin/feedback', icon: Star, label: 'Feedback NPS', show: esAdminOCoord },
          { to: '/admin/historial-anuladas', icon: XCircle, label: 'Historial Anuladas', show: isAdmin || userProfile?.rol === 'coordinadora' || p('ordenesVerEliminadas') },
        ],
      },
    },
    // Clientes — item suelto
    {
      kind: 'item',
      item: { to: '/admin/clientes', icon: Users, label: 'Clientes', show: p('clientesVer') },
    },
    // Cobranza y facturación (SPRINT-117c3): renombrada desde "Documentos"
    // y reordenada para que el pipeline factura se vea como pasos consecutivos:
    // Cotizaciones → Conduces pendientes → Conduces de Garantía. Los 3 ítems
    // que vivían en "Documentos" eran exactamente este pipeline, así que la
    // sección original queda absorbida (no quedan ítems huérfanos). Plan de
    // rollback: revertir el commit, vuelve a llamarse "Documentos" con el
    // orden previo Cotizaciones / Conduces de Garantía / Conduces Pendientes.
    {
      kind: 'section',
      section: {
        id: 'cobranza_facturacion',
        label: 'Cobranza y facturación',
        icon: Receipt,
        defaultExpanded: true,
        items: [
          { to: '/admin/cotizaciones', icon: FileText, label: 'Cotizaciones', show: p('cotizacionesVer') },
          { to: '/admin/facturacion-pendiente', icon: Inbox, label: 'Conduces Pendientes', badge: facturacionPendienteCount, show: isAdmin || userProfile?.rol === 'coordinadora' },
          { to: '/admin/facturas', icon: Receipt, label: 'Conduces de Garantía', show: p('facturasVer') },
        ],
      },
    },
    // Catálogo e Inventario
    {
      kind: 'section',
      section: {
        id: 'catalogo_inventario',
        label: 'Catálogo e Inventario',
        icon: Boxes,
        defaultExpanded: false,
        items: [
          // SPRINT-117c1: ocultar ítem "Catálogo" (apunta a /admin/productos, deuda histórica).
          // La ruta sigue activa en App.tsx — accesible por URL hasta sprint propio futuro
          // que la elimine del routing. Para revertir: cambiar show a `p('ordenesVer')`.
          { to: '/admin/productos', icon: ShoppingBag, label: 'Catálogo', show: false },
          { to: '/admin/inventario', icon: Boxes, label: 'Inventario', show: p('configuracionModificar') || userProfile?.rol === 'operaria' || isAdmin },
          { to: '/admin/taller', icon: Wrench, label: 'Equipos Taller', show: p('ordenesVer') },
          { to: '/admin/precios', icon: Tag, label: 'Precios de Servicios', show: isAdmin || p('configuracionModificar') },
        ],
      },
    },
    // Finanzas
    {
      kind: 'section',
      section: {
        id: 'finanzas',
        label: 'Finanzas',
        icon: DollarSign,
        defaultExpanded: true,
        items: [
          { to: '/admin/gastos', icon: DollarSign, label: 'Gastos e Ingresos', show: p('gastosVer') },
          { to: '/admin/bancos', icon: Building2, label: 'Bancos', show: p('bancosGestionar') },
          { to: '/admin/nomina', icon: Wallet, label: 'Nómina', show: isAdmin || userProfile?.rol === 'coordinadora' },
          { to: '/admin/avances', icon: Wallet, label: 'Avances a Empleados', show: p('avancesGestionar') },
          { to: '/admin/prestamos', icon: Banknote, label: 'Préstamos a Empleados', show: esAdminOCoord },
          { to: '/admin/comisiones', icon: DollarSign, label: 'Comisiones', show: isAdmin || p('configuracionVer') },
          { to: '/admin/estado-resultado', icon: TrendingUp, label: 'Estado de Resultado', show: isAdmin || userProfile?.rol === 'coordinadora' },
          // SPRINT-117c1: label dinámico — operaria/secretaria ven "Mi rendimiento" (KPI propio),
          // admin/coord siguen viendo "Rendimiento" (panel global). Sin cambios al gate `show:`.
          { to: '/admin/rendimiento', icon: TrendingUp, label: userProfile?.rol === 'operaria' || userProfile?.rol === 'secretaria' ? 'Mi rendimiento' : 'Rendimiento', show: p('rendimientoVer') },
          { to: '/admin/metricas-mensuales', icon: TrendingUp, label: 'Métricas del Mes', show: p('rendimientoVer') || isAdmin },
        ],
      },
    },
    // Mantenimiento — item suelto
    {
      kind: 'item',
      item: { to: '/admin/mantenimiento', icon: Calendar, label: 'Mantenimiento', show: p('ordenesVer') },
    },
    // Web y Solicitudes
    {
      kind: 'section',
      section: {
        id: 'web_solicitudes',
        label: 'Web y Solicitudes',
        icon: Globe,
        defaultExpanded: false,
        items: [
          { to: '/admin/web', icon: Globe, label: 'Página Web', show: isAdmin },
          { to: '/admin/empresas-aliadas', icon: Building2, label: 'Empresas Aliadas', show: isAdmin },
          { to: '/admin/formularios', icon: FileText, label: 'Formularios', show: isAdmin },
          { to: '/admin/solicitudes', icon: Inbox, label: 'Solicitudes', badge: solicitudesCount, show: isAdmin },
        ],
      },
    },
    // Asistente IA
    {
      kind: 'section',
      section: {
        id: 'asistente_ia',
        label: 'Asistente IA',
        icon: Sparkles,
        defaultExpanded: false,
        items: [
          { to: '/admin/asistente', icon: Sparkles, label: 'Chat (pantalla completa)', show: userProfile?.rol === 'administrador' },
          { to: '/admin/asistente/historial', icon: History, label: 'Historial IA', show: userProfile?.rol === 'administrador' },
        ],
      },
    },
    // Sistema
    {
      kind: 'section',
      section: {
        id: 'sistema',
        label: 'Sistema',
        icon: Settings,
        defaultExpanded: false,
        items: [
          { to: '/admin/personal', icon: UserCog, label: 'Personal', show: p('personalVer') },
          { to: '/admin/usuarios', icon: Shield, label: 'Usuarios & Permisos', show: p('personalModificar') },
          { to: '/admin/ponches', icon: ClipboardCheck, label: 'Reporte de Ponches', show: esAdminOCoord },
          { to: '/admin/configuracion', icon: Settings, label: 'Configuración', show: p('configuracionVer') },
          { to: '/admin/configuracion-marketing', icon: Sparkles, label: 'Plantillas Marketing', show: userProfile?.rol === 'administrador' },
        ],
      },
    },
  ];

  // Helpers para el estado de expansión de secciones
  const isExpanded = (id: string, defaultExpanded: boolean): boolean => {
    return id in sectionsState ? sectionsState[id] : defaultExpanded;
  };

  const toggleSection = (id: string, defaultExpanded: boolean) => {
    setSectionsState((prev) => {
      const current = id in prev ? prev[id] : defaultExpanded;
      const next = { ...prev, [id]: !current };
      saveState(next);
      return next;
    });
  };

  // Aplana todos los items visibles (para modo collapsed)
  const itemsPlanos: SidebarItem[] = estructura.flatMap((node) => {
    if (node.kind === 'item') {
      return node.item.show ? [node.item] : [];
    }
    return node.section.items.filter((it) => it.show);
  });

  // Clases compartidas del NavLink
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-colors text-sm relative group ${
      isActive
        ? 'bg-white/20 text-white font-medium'
        : 'text-blue-200 hover:bg-white/10 hover:text-white'
    }`;

  // Render de un item (usado tanto colapsado como expandido dentro de secciones)
  const renderItem = (item: SidebarItem, opts?: { tabDisabled?: boolean; indent?: boolean }) => (
    <NavLink
      key={item.to}
      to={item.to}
      tabIndex={opts?.tabDisabled ? -1 : undefined}
      className={({ isActive }) =>
        `${navLinkClass({ isActive })} ${opts?.indent && !collapsed ? 'pl-8' : ''}`
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
  );

  return (
    <aside
      className={`bg-brand-800 flex flex-col h-full transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'} relative`}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-6 z-10 bg-brand-600 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-lg hover:bg-brand-500 transition-colors"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Logo */}
      <div className={`p-4 border-b border-brand-700 transition-all duration-300 ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <Logo size="sm" compact />
        ) : (
          <Logo size="md" />
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
        {collapsed ? (
          // Modo colapsado: todos los items en un listado plano, sin headers
          itemsPlanos.map((item) => renderItem(item))
        ) : (
          // Modo expandido: secciones colapsables + items sueltos
          estructura.map((node, idx) => {
            if (node.kind === 'item') {
              if (!node.item.show) return null;
              return renderItem(node.item);
            }
            const sec = node.section;
            const visibleItems = sec.items.filter((it) => it.show);
            if (visibleItems.length === 0) return null;
            const expanded = isExpanded(sec.id, sec.defaultExpanded);
            return (
              <div key={sec.id} className={idx > 0 ? 'mt-1' : ''}>
                <button
                  type="button"
                  onClick={() => toggleSection(sec.id, sec.defaultExpanded)}
                  aria-expanded={expanded}
                  className="flex items-center gap-3 px-4 py-2 mx-2 w-[calc(100%-1rem)] rounded-lg text-blue-300 hover:bg-white/5 hover:text-white transition-colors text-xs uppercase tracking-wide font-semibold"
                >
                  <sec.icon size={16} className="flex-shrink-0" />
                  <span className="truncate flex-1 text-left">{sec.label}</span>
                  <ChevronDown
                    size={14}
                    className={`flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-200 ease-in-out ${
                    expanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  {visibleItems.map((item) =>
                    renderItem(item, { tabDisabled: !expanded, indent: true })
                  )}
                </div>
              </div>
            );
          })
        )}
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
