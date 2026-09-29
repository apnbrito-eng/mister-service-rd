import { useMovimientoReducido } from '../hooks/useMovimientoReducido';
import AvisosMoviles from '../mobile/AvisosMoviles';
import { desactivarNotificacionesMoviles } from '../mobile/notificaciones';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { obtenerAreas, type SidebarItem } from '../navigation/areas';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import Logo from './Logo';
import { useState, useEffect, useId, useRef, useCallback, useLayoutEffect, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { obtenerTransicionMovimiento, ESCALA_PRESION, DESPLAZAMIENTO_PANEL } from '../utils/motion';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { suscribirContadorSinLeer } from '../services/whatsappInbox.service';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

/** El panel pierde interacción al cerrar; termina su salida antes de retirarse del flujo. */
function PanelSeccion({ id, abierto, reducido, children }: { id: string; abierto: boolean; reducido: boolean; children: ReactNode }) {
  const [oculto, setOculto] = useState(!abierto);
  const abiertoActual = useRef(abierto);
  abiertoActual.current = abierto;
  const asociarPanel = useCallback((nodo: HTMLDivElement | null) => {
    if (!abierto && typeof document !== 'undefined' && nodo?.contains(document.activeElement)) {
      document.getElementById(`${id}-control`)?.focus();
    }
    nodo?.toggleAttribute('inert', !abierto);
  }, [abierto, id]);
  useLayoutEffect(() => {
    if (abierto) setOculto(false);
  }, [abierto]);
  return <motion.div id={id} ref={asociarPanel} aria-labelledby={`${id}-control`} aria-hidden={!abierto}
    hidden={!abierto && (reducido || oculto)} initial={false}
    animate={{ opacity: abierto ? 1 : 0, y: reducido || abierto ? 0 : -DESPLAZAMIENTO_PANEL }}
    transition={obtenerTransicionMovimiento(reducido)} style={{ transition: 'none', pointerEvents: abierto ? 'auto' : 'none' }}
    onAnimationComplete={() => { if (!abiertoActual.current) setOculto(true); }}>
    {children}
  </motion.div>;
}

export default function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const { userProfile, currentUser } = useApp();
  const reducido = useMovimientoReducido();
  const navId = useId();
  const claveExpansion = `ms:sidebar:expansion:v1:${currentUser?.uid ?? 'sin-sesion'}`;
  const [expansion, setExpansion] = useState<Record<string, boolean>>({});
  const perfilActual = useRef(userProfile);
  perfilActual.current = userProfile;
  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(claveExpansion) || '{}');
      setExpansion(guardado && typeof guardado === 'object' && !Array.isArray(guardado)
        ? Object.fromEntries(Object.entries(guardado).filter(([, valor]) => typeof valor === 'boolean')) as Record<string, boolean> : {});
    } catch { setExpansion({}); }
  }, [claveExpansion]);
  const alternarSeccion = (id: string, abierta: boolean) => {
    const siguiente = { ...expansion, [id]: !abierta };
    setExpansion(siguiente);
    try { localStorage.setItem(claveExpansion, JSON.stringify(siguiente)); } catch { /* Preferencia opcional. */ }
  };
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    const actual = obtenerAreas(perfilActual.current).find(node => node.kind === 'section' && node.section.items.some(item => item.show && (pathname === item.to || pathname.startsWith(item.to + '/'))));
    if (actual?.kind === 'section') setExpansion(previa => ({ ...previa, [actual.section.id]: true }));
  }, [pathname, claveExpansion, userProfile?.rol]);
  const [standbyCount, setStandbyCount] = useState(0);
  const [ordenesStandbyCount, setOrdenesStandbyCount] = useState(0);
  const [citasCount, setCitasCount] = useState(0);
  const [solicitudesCount, setSolicitudesCount] = useState(0);
  const [facturacionPendienteCount, setFacturacionPendienteCount] = useState(0);
  const [sugerenciasChequeoCount, setSugerenciasChequeoCount] = useState(0);
  const [reprogramacionesCount, setReprogramacionesCount] = useState(0);
  const [whatsappInboxCount, setWhatsappInboxCount] = useState(0);
  // SPRINT-PAGOS-CONFIRMA-MARIA-FASE-B-1 (2026-05-21): count de pagos
  // pendientes de confirmación. Solo se lee si el user tiene permiso
  // `pagosVerificar` (mismo gate que la entrada del sidebar). Sin gate por
  // rol — el permiso ya es defaults admin/coord=true, resto=false.
  const [pagosPendientesCount, setPagosPendientesCount] = useState(0);

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

  // ─────────────────────────────────────────────────────────────────────
  // SPRINT-FIX-SIDEBAR-LISTENERS (2026-09-09) — auditoría hallazgo P-1.
  //
  // ANTES: tres `useEffect` separados, cada uno con su propio
  // `onSnapshot(collection(db, 'ordenes_servicio'))` SIN where ni limit,
  // recorriendo todos los docs en memoria para calcular un contador de
  // badge (sugerencias de chequeo, reprogramaciones, pagos sin verificar).
  //
  // El Sidebar está montado en TODAS las páginas del layout admin, así que
  // cualquier admin/coordinadora mantenía TRES streams en vivo de la tabla
  // completa de órdenes de forma permanente. Firestore cobra por documento
  // leído y un listener re-emite el snapshot completo con cada cambio en la
  // colección — el costo crecía con órdenes × usuarios × cambios por minuto.
  //
  // AHORA: un único listener que calcula los tres contadores en la misma
  // pasada. Se elimina 2/3 de la lectura sin cambiar arquitectura ni rules.
  //
  // El filtrado client-side se mantiene a propósito (evita índices
  // compuestos sobre arrays — misma decisión que tenían los tres originales).
  //
  // Gate: nos suscribimos si el usuario necesita AL MENOS UNO de los tres
  // contadores. Cada contador se pone en 0 individualmente si ese usuario
  // no tiene por qué verlo, para no cambiar el comportamiento de los badges.
  //
  // @safe-listener-sin-where: `ordenes_servicio` tiene `esStaff()` como
  // short-circuit en su `allow read`, así que la query sin where no es
  // rechazada por rules (cazador P-012 no aplica).
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const rol = userProfile?.rol;
    const esAdminOCoord = rol === 'administrador' || rol === 'coordinadora';
    const puedeVerPagos = puede(userProfile, 'pagosVerificar');

    if (!esAdminOCoord && !puedeVerPagos) {
      setSugerenciasChequeoCount(0);
      setReprogramacionesCount(0);
      setPagosPendientesCount(0);
      return;
    }

    const unsub = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      let sugerencias = 0;
      let reprogramaciones = 0;
      let pagosPendientes = 0;

      for (const d of snap.docs) {
        const data = d.data();
        if (data.eliminada === true) continue;

        if (esAdminOCoord) {
          // Sugerencias de "solo chequeo" pendientes (sprint R4 endurecida).
          const sugs = data.sugerenciasSoloChequeo;
          if (Array.isArray(sugs) && sugs.some(s => s && s.estado === 'pendiente')) {
            sugerencias++;
          }

          // Reprogramaciones pendientes (Hito 2 Portal Cliente). Solo cuentan
          // las propuestas del CLIENTE — las contrapropuestas del propio admin
          // no incrementan el badge.
          const props = data.propuestasReprogramacion;
          if (
            Array.isArray(props) &&
            props.some(pr => pr && pr.estado === 'pendiente' && pr.propuestaPor === 'cliente')
          ) {
            reprogramaciones++;
          }
        }

        if (puedeVerPagos) {
          // SPRINT-PAGOS-FASE-B-2 (opción B 2026-05-25): este callsite opera
          // sobre el doc raw de Firestore (no sobre OrdenServicio parseado),
          // así que NO usa el helper `obtenerPagosDeOrden`. Cuando B-3 cambie
          // source-of-truth a subcolección, este sitio se refactoriza junto
          // con `suscribirPagosPendientes` y el resto.
          // @safe-pagos-raw: lectura defensiva sobre data.pagos del doc Firestore.
          const pagos = Array.isArray(data.pagos) ? data.pagos : [];
          if (pagos.some((pg: { verificado?: boolean }) => pg?.verificado === false)) {
            pagosPendientes++;
          }
        }
      }

      setSugerenciasChequeoCount(esAdminOCoord ? sugerencias : 0);
      setReprogramacionesCount(esAdminOCoord ? reprogramaciones : 0);
      setPagosPendientesCount(puedeVerPagos ? pagosPendientes : 0);
    });

    return () => unsub();
  }, [userProfile]);

  // SPRINT-INBOX-2 (2026-05-20): badge de mensajes WhatsApp sin leer.
  // Gateamos por rol staff oficina (D6=C); técnico/ayudante no llegan
  // acá porque TecnicoRoute/AyudanteRoute redirigen antes del Layout.
  // La rule `whatsapp_conversaciones` (firestore.rules:730) restringe
  // a esStaffOficina(); el gate cliente evita listener inútil para
  // roles que no van a ver el ítem.
  useEffect(() => {
    const rol = userProfile?.rol;
    if (
      rol !== 'administrador' &&
      rol !== 'coordinadora' &&
      rol !== 'secretaria' &&
      rol !== 'operaria'
    ) {
      setWhatsappInboxCount(0);
      return;
    }
    const unsub = suscribirContadorSinLeer(setWhatsappInboxCount);
    return () => unsub();
  }, [userProfile?.rol]);

  const handleLogout = async () => {
    try { await desactivarNotificacionesMoviles(); } catch { /* El cierre de sesión continúa incluso sin conexión. */ }
    await signOut(auth);
    navigate('/login');
  };

  const estructura = obtenerAreas(userProfile, {standbyCount, ordenesStandbyCount, citasCount, solicitudesCount, facturacionPendienteCount, sugerenciasChequeoCount, reprogramacionesCount, whatsappInboxCount, pagosPendientesCount});

  // Clases compartidas del NavLink
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg min-h-11 text-sm relative group ${
      isActive
        ? 'bg-white/90 text-blue-700 shadow-sm font-semibold'
        : 'text-slate-600 hover:bg-white/70 hover:text-slate-950'
    }`;

  // Render de un item (usado tanto colapsado como expandido dentro de secciones)
  const renderItem = (item: SidebarItem, opts?: { tabDisabled?: boolean; indent?: boolean }) => (
    <NavLink
      key={item.to}
      to={item.to}
      aria-label={item.badge !== undefined && item.badge > 0 ? `${item.label}, ${item.badge} avisos` : item.label}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      tabIndex={opts?.tabDisabled ? -1 : undefined}
      className={({ isActive }) =>
        `${navLinkClass({ isActive: isActive || !!item.active })} ${opts?.indent && !collapsed ? 'pl-8' : ''}`
      }
    >
      <item.icon size={18} className="flex-shrink-0" />
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <span aria-label={`${item.badge} avisos en ${item.label}`} className="ml-auto bg-primary/10 text-primary text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
              {item.badge}
            </span>
          )}
        </>
      )}
      {collapsed && item.badge !== undefined && item.badge > 0 && (
        <span aria-label={`${item.badge} avisos en ${item.label}`} className="absolute top-1 right-1 bg-primary/10 text-primary text-xs rounded-full w-4 h-4 flex items-center justify-center">
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
      className={`glass-sidebar flex flex-col h-full ${collapsed ? 'w-16' : 'w-64'} relative`}
    >
      {/* Toggle button */}
      <motion.button data-movimiento="piloto"
        whileTap={reducido ? undefined : { scale: ESCALA_PRESION }}
        transition={obtenerTransicionMovimiento(reducido)} style={{ transition: 'none' }}
        onClick={onToggle}
        aria-label={collapsed ? 'Expandir menú' : 'Cerrar o reducir menú'}
        className="absolute right-2 top-2 z-10 bg-brand-600 text-white rounded-full w-11 h-11 flex items-center justify-center shadow-lg hover:bg-brand-500"
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </motion.button>

      {/* Logo */}
      <div className={`p-4 pt-16 border-b border-white/70 ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <Logo size="sm" compact />
        ) : (
          <Logo size="md" />
        )}
      </div>

      {/* User info */}
      {!collapsed && userProfile && (
        <div className="px-4 py-3 border-b border-white/10">
          <div className="text-slate-900 font-semibold text-sm truncate">{userProfile.nombre}</div>
          <div className="text-slate-600 text-xs capitalize">{userProfile.rol}</div>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-2">
        {estructura.map(node => {
          if (node.kind === 'item') return node.item.show ? renderItem(node.item) : null;
          const items = node.section.items.filter(item => item.show);
          if (!items.length) return null;
          // Todos los destinos visibles inicialmente; cambiar de ruta abre su sección.
          const abierta = expansion[node.section.id] !== false;
          const badge = items.reduce((sum, item) => sum + (item.badge ?? 0), 0);
          if (collapsed) return <div key={node.section.id}>{items.map(item => renderItem(item))}</div>;
          const panelId = `${navId}-${node.section.id}`;
          return <section key={node.section.id}>
            <motion.button data-movimiento="piloto" type="button" id={`${panelId}-control`} aria-expanded={abierta} aria-controls={panelId}
              className="w-full flex items-center gap-3 px-4 py-2 min-h-11 text-sm text-slate-600 text-left"
              whileTap={reducido ? undefined : { scale: ESCALA_PRESION }} transition={obtenerTransicionMovimiento(reducido)} style={{ transition: 'none' }}
              onClick={() => alternarSeccion(node.section.id, abierta)}>
              <node.section.icon size={18} className="shrink-0" />
              <span className="flex-1 truncate">{node.section.label}</span>
              {badge > 0 && <span aria-label={`${badge} avisos en ${node.section.label}`} className="bg-primary/10 text-primary text-xs rounded-full px-1.5">{badge}</span>}
              <motion.span animate={{ rotate: abierta ? 0 : -90 }} transition={obtenerTransicionMovimiento(reducido)} style={{ transition: 'none' }}><ChevronDown size={16}/></motion.span>
            </motion.button>
            <PanelSeccion id={panelId} abierto={abierta} reducido={reducido}>{items.map(item => renderItem(item, { indent: true }))}</PanelSeccion>
          </section>;
        })}
        {!collapsed && <AvisosMoviles />}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-white/10">
        <button
          aria-label="Cerrar sesión"
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2.5 w-full rounded-lg text-slate-600 hover:bg-white/70 hover:text-slate-950 transition-colors text-sm group relative"
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
