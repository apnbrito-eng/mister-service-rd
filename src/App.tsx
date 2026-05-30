import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { signOut } from 'firebase/auth';
import { auth } from './firebase/config';
import { useApp, AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';
import BannerNuevaVersion from './components/BannerNuevaVersion';

// SPRINT-143 (2026-05-11): rutas lazy-loaded para bajar INP.
// Antes todo bundle inicial — al clickear sub-item del sidebar React montaba
// la pagina destino + arrancaba 2-6 onSnapshot de Firestore simultaneos en
// el main thread → INP 397ms. Ahora cada pagina es un chunk separado y se
// descarga on-demand; el Suspense pinta el LoadingSpinner mientras llega.
import { lazy, Suspense, useEffect } from 'react';

// Páginas admin (todas lazy)
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Ordenes = lazy(() => import('./pages/Ordenes'));
const OrdenDetalle = lazy(() => import('./pages/OrdenDetalle'));
const Citas = lazy(() => import('./pages/Citas'));
const Calendario = lazy(() => import('./pages/Calendario'));
const Standby = lazy(() => import('./pages/Standby'));
const MapaRutas = lazy(() => import('./pages/MapaRutas'));
const Clientes = lazy(() => import('./pages/Clientes'));
const Cotizaciones = lazy(() => import('./pages/Cotizaciones'));
const Facturas = lazy(() => import('./pages/Facturas'));
const EquiposTaller = lazy(() => import('./pages/EquiposTaller'));
const Rendimiento = lazy(() => import('./pages/Rendimiento'));
const Mantenimiento = lazy(() => import('./pages/Mantenimiento'));
const Gastos = lazy(() => import('./pages/Gastos'));
const PersonalPage = lazy(() => import('./pages/PersonalPage'));
const Configuracion = lazy(() => import('./pages/Configuracion'));
const CierreDia = lazy(() => import('./pages/CierreDia'));
const PreciosServicios = lazy(() => import('./pages/PreciosServicios'));
const Inventario = lazy(() => import('./pages/Inventario'));
const Comisiones = lazy(() => import('./pages/Comisiones'));
const Nomina = lazy(() => import('./pages/Nomina'));
const HistorialAnuladas = lazy(() => import('./pages/HistorialAnuladas'));
const ConfiguracionWeb = lazy(() => import('./pages/ConfiguracionWeb'));
const EmpresasAliadas = lazy(() => import('./pages/EmpresasAliadas'));
const Formularios = lazy(() => import('./pages/Formularios'));
const FormularioEditor = lazy(() => import('./pages/FormularioEditor'));
const Solicitudes = lazy(() => import('./pages/Solicitudes'));
const FormularioPublico = lazy(() => import('./pages/public/FormularioPublico'));
const TecnicoVista = lazy(() => import('./pages/TecnicoVista'));
const Calendarios = lazy(() => import('./pages/Calendarios'));
const CitaPublica = lazy(() => import('./pages/CitaPublica'));
const GestionUsuarios = lazy(() => import('./pages/GestionUsuarios'));
const TrackingCliente = lazy(() => import('./pages/TrackingCliente'));
const AgendaDia = lazy(() => import('./pages/AgendaDia'));
const MetricasMensuales = lazy(() => import('./pages/MetricasMensuales'));
const Bancos = lazy(() => import('./pages/Bancos'));
const FacturacionPendiente = lazy(() => import('./pages/FacturacionPendiente'));
// SPRINT-PAGOS-CONFIRMA-MARIA-FASE-B-1 (2026-05-21): página dedicada para
// que coord/admin (María) confirme pagos pendientes registrados por la
// operaria. Lee del array `orden.pagos` legacy (fase B.2 migrará a
// subcolección). Gateada por permiso `pagosVerificar`.
const PagosPendientes = lazy(() => import('./pages/PagosPendientes'));
const Avances = lazy(() => import('./pages/Avances'));
const Prestamos = lazy(() => import('./pages/Prestamos'));
const EstadoResultado = lazy(() => import('./pages/EstadoResultado'));
const AsistenteIA = lazy(() => import('./pages/AsistenteIA'));
const AsistenteIAHistorial = lazy(() => import('./pages/AsistenteIAHistorial'));
const Ponche = lazy(() => import('./pages/Ponche'));
const AdminPonches = lazy(() => import('./pages/AdminPonches'));
const Feedback = lazy(() => import('./pages/Feedback'));
const SugerenciasChequeo = lazy(() => import('./pages/SugerenciasChequeo'));
const Reprogramaciones = lazy(() => import('./pages/Reprogramaciones'));
const ConfiguracionMarketing = lazy(() => import('./pages/ConfiguracionMarketing'));
const Notificaciones = lazy(() => import('./pages/Notificaciones'));
const Admin404 = lazy(() => import('./pages/Admin404'));
// SPRINT-INBOX-2 (2026-05-20): bandeja CRM WhatsApp para staff oficina.
// El bloque INBOX-3..6 agrega vistas hijas; ver `docs/sprints/COLA_AUTONOMA.md`.
const Inbox = lazy(() => import('./pages/Inbox'));
const InboxConversacion = lazy(() => import('./pages/InboxConversacion'));

// Public website pages (también lazy — el sitio público es un viewport distinto)
import PublicLayout from './components/public/PublicLayout';
const HomePage = lazy(() => import('./pages/public/HomePage'));
const ServiciosPage = lazy(() => import('./pages/public/ServiciosPage'));
const ServicioDetalle = lazy(() => import('./pages/public/ServicioDetalle'));
const AgendarPage = lazy(() => import('./pages/public/AgendarPage'));
const GarantiaCliente = lazy(() => import('./pages/public/GarantiaCliente'));
const PortalCliente = lazy(() => import('./pages/public/PortalCliente'));
import { seedDatabase } from './firebase/seedData';
import { seedWebConfig } from './services/seedWebConfig';
import { seedPrecios } from './firebase/seedPrecios';
import { limpiarOrdenDuplicada } from './utils/cleanFirestore';
import { puede, AccionPermiso } from './utils/permisos';
import { Rol } from './types';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, userProfile, loading, authError } = useApp();
  if (loading) return <LoadingSpinner fullPage text="Cargando..." />;
  if (!currentUser) return <Navigate to="/login" replace />;
  // Audit fix C3: usuario autenticado en Firebase Auth pero sin perfil real
  // en `usuarios/{uid}` ni `personal where email==`. Antes el AppContext
  // sintetizaba un admin en memoria (escalación silenciosa). Ahora bloqueamos.
  if (!userProfile && authError) return <PerfilNoEncontrado mensaje={authError} />;
  return <>{children}</>;
}

function PerfilNoEncontrado({ mensaje }: { mensaje: string }) {
  const handleCerrarSesion = async () => {
    await signOut(auth);
    window.location.href = '/login';
  };
  return (
    // @safe-gradient: splash full-screen sutil brand-50 → brand-100, pantalla de error/perfil no encontrado
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-red-600 px-8 py-6 text-white">
          <h1 className="text-xl font-bold">Acceso bloqueado</h1>
          <p className="text-red-100 text-sm mt-1">No se encontró tu perfil en el sistema</p>
        </div>
        <div className="px-8 py-6">
          <p className="text-gray-700 text-sm leading-relaxed mb-6">{mensaje}</p>
          <button
            onClick={handleCerrarSesion}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white py-3 rounded-xl font-semibold text-sm transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

function TecnicoRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, userProfile, loading } = useApp();
  if (loading) return <LoadingSpinner fullPage text="Cargando..." />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (userProfile?.rol === 'tecnico') return <Navigate to="/tecnico" replace />;
  return <>{children}</>;
}

/**
 * AyudanteRoute: el rol `ayudante` sólo tiene acceso al módulo de ponche.
 * Cualquier intento de entrar a /admin lo redirige a /ponche.
 */
function AyudanteRoute({ children }: { children: React.ReactNode }) {
  const { userProfile, loading } = useApp();
  if (loading) return <LoadingSpinner fullPage text="Cargando..." />;
  if (userProfile?.rol === 'ayudante') return <Navigate to="/ponche" replace />;
  return <>{children}</>;
}

function PermisoRoute({ permiso, children }: { permiso: AccionPermiso; children: React.ReactNode }) {
  const { userProfile, loading } = useApp();
  if (loading) return <LoadingSpinner fullPage text="Cargando..." />;
  if (!userProfile) return <Navigate to="/login" replace />;
  if (!puede(userProfile, permiso)) {
    return <Navigate to="/admin/dashboard" replace state={{ permisoDenegado: permiso }} />;
  }
  return <>{children}</>;
}

function RolRoute({ roles, children }: { roles: Rol[]; children: React.ReactNode }) {
  const { userProfile, loading } = useApp();
  if (loading) return <LoadingSpinner fullPage text="Cargando..." />;
  if (!userProfile) return <Navigate to="/login" replace />;
  if (!roles.includes(userProfile.rol)) {
    return <Navigate to="/admin/dashboard" replace state={{ permisoDenegado: roles.join('/') }} />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  // SPRINT-117c1: removido `loading` del destructuring — no se usaba en este
  // componente (ProtectedRoute/PermisoRoute manejan loading internamente).
  // Eliminaba warning preexistente que bloqueaba el pre-commit hook.
  const { currentUser, userProfile } = useApp();

  useEffect(() => {
    (window as unknown as { limpiarOrdenDuplicada: typeof limpiarOrdenDuplicada }).limpiarOrdenDuplicada = limpiarOrdenDuplicada;
  }, []);

  useEffect(() => {
    if (currentUser) {
      seedDatabase().catch(console.error);
      seedWebConfig().catch(console.error);
      seedPrecios().catch(console.error);
    }
  }, [currentUser]);

  return (
    <Suspense fallback={<LoadingSpinner fullPage text="Cargando..." />}>
    <Routes>
      {/* ═══════════════════════════════════════════════
          PUBLIC WEBSITE — misterservicerd.com
          No auth required. Visible to everyone.
          ═══════════════════════════════════════════════ */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/servicios" element={<ServiciosPage />} />
        <Route path="/servicios/:slug" element={<ServicioDetalle />} />
        <Route path="/agendar" element={<AgendarPage />} />
      </Route>

      {/* Public standalone pages (no nav/footer — focused experience) */}
      <Route path="/cita/:calendarId" element={<CitaPublica />} />
      <Route path="/tracking/:token" element={<TrackingCliente />} />
      <Route path="/f/:slug" element={<FormularioPublico />} />
      <Route path="/garantia/:token" element={<GarantiaCliente />} />
      <Route path="/cliente/:token" element={<PortalCliente />} />

      {/* ═══════════════════════════════════════════════
          ADMIN / INTERNAL SYSTEM
          Requires authentication.
          ═══════════════════════════════════════════════ */}
      <Route path="/login" element={
        currentUser ? (
          userProfile?.rol === 'tecnico'
            ? <Navigate to="/tecnico" replace />
            : userProfile?.rol === 'ayudante'
              ? <Navigate to="/ponche" replace />
              : <Navigate to="/admin" replace />
        ) : <Login />
      } />

      <Route path="/tecnico" element={
        <ProtectedRoute><TecnicoVista /></ProtectedRoute>
      } />

      {/* Ponche de asistencia — accesible a TODOS los roles autenticados,
          incluyendo ayudantes. No usa el Layout admin. */}
      <Route path="/ponche" element={
        <ProtectedRoute><Ponche /></ProtectedRoute>
      } />

      <Route path="/admin" element={
        <ProtectedRoute><TecnicoRoute><AyudanteRoute><Layout /></AyudanteRoute></TecnicoRoute></ProtectedRoute>
      }>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="ordenes" element={<Ordenes />} />
        <Route path="ordenes/:id" element={<OrdenDetalle />} />
        <Route path="citas" element={<Citas />} />
        <Route path="calendario" element={<Calendario />} />
        <Route path="agenda-dia" element={<PermisoRoute permiso="ordenesVer"><AgendaDia /></PermisoRoute>} />
        <Route path="calendarios" element={<Calendarios />} />
        <Route path="standby" element={<Standby />} />
        <Route path="mapa" element={<MapaRutas />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="cotizaciones" element={<PermisoRoute permiso="cotizacionesVer"><Cotizaciones /></PermisoRoute>} />
        <Route path="facturas" element={<PermisoRoute permiso="facturasVer"><Facturas /></PermisoRoute>} />
        <Route path="taller" element={<EquiposTaller />} />
        {/* SPRINT-121: Catálogo legacy eliminado del routing (oculto desde SPRINT-117c1).
            Redirect preventivo para bookmarks viejos y links externos. PreciosServicios
            cubre la funcionalidad real de catálogo de servicios. Rollback: git revert. */}
        <Route path="productos" element={<Navigate to="/admin/precios" replace />} />
        <Route path="rendimiento" element={<PermisoRoute permiso="rendimientoVer"><Rendimiento /></PermisoRoute>} />
        <Route path="metricas-mensuales" element={<PermisoRoute permiso="rendimientoVer"><MetricasMensuales /></PermisoRoute>} />
        <Route path="mantenimiento" element={<Mantenimiento />} />
        <Route path="gastos" element={<PermisoRoute permiso="gastosVer"><Gastos /></PermisoRoute>} />
        <Route path="personal" element={<PermisoRoute permiso="personalVer"><PersonalPage /></PermisoRoute>} />
        <Route path="usuarios" element={<RolRoute roles={['administrador', 'coordinadora']}><GestionUsuarios /></RolRoute>} />
        <Route path="web" element={<RolRoute roles={['administrador']}><ConfiguracionWeb /></RolRoute>} />
        <Route path="empresas-aliadas" element={<RolRoute roles={['administrador']}><EmpresasAliadas /></RolRoute>} />
        <Route path="formularios" element={<RolRoute roles={['administrador']}><Formularios /></RolRoute>} />
        <Route path="formularios/:id" element={<RolRoute roles={['administrador']}><FormularioEditor /></RolRoute>} />
        <Route path="solicitudes" element={<RolRoute roles={['administrador']}><Solicitudes /></RolRoute>} />
        <Route path="asistente" element={<RolRoute roles={['administrador']}><AsistenteIA /></RolRoute>} />
        <Route path="asistente/historial" element={<RolRoute roles={['administrador']}><AsistenteIAHistorial /></RolRoute>} />
        <Route path="configuracion" element={<PermisoRoute permiso="configuracionVer"><Configuracion /></PermisoRoute>} />
        <Route path="cierre-dia" element={<PermisoRoute permiso="cierreDiaEjecutar"><CierreDia /></PermisoRoute>} />
        <Route path="precios" element={<PermisoRoute permiso="configuracionVer"><PreciosServicios /></PermisoRoute>} />
        <Route path="inventario" element={<PermisoRoute permiso="configuracionVer"><Inventario /></PermisoRoute>} />
        <Route path="comisiones" element={<RolRoute roles={['administrador', 'coordinadora']}><Comisiones /></RolRoute>} />
        <Route path="nomina" element={<RolRoute roles={['administrador', 'coordinadora']}><Nomina /></RolRoute>} />
        <Route path="historial-anuladas" element={<PermisoRoute permiso="ordenesVerEliminadas"><HistorialAnuladas /></PermisoRoute>} />
        <Route path="bancos" element={<PermisoRoute permiso="bancosGestionar"><Bancos /></PermisoRoute>} />
        <Route path="facturacion-pendiente" element={<RolRoute roles={['administrador', 'coordinadora']}><FacturacionPendiente /></RolRoute>} />
        {/* SPRINT-PAGOS-CONFIRMA-MARIA-FASE-B-1 (2026-05-21): pagos pendientes
            de confirmación por coord/admin. La página tiene gate interno por
            permiso `pagosVerificar`; el PermisoRoute lo reforzá en routing
            para evitar pintar la página a roles sin acceso. */}
        <Route path="pagos-pendientes" element={<PermisoRoute permiso="pagosVerificar"><PagosPendientes /></PermisoRoute>} />
        <Route path="avances" element={<PermisoRoute permiso="avancesGestionar"><Avances /></PermisoRoute>} />
        <Route path="prestamos" element={<RolRoute roles={['administrador', 'coordinadora']}><Prestamos /></RolRoute>} />
        <Route path="estado-resultado" element={<RolRoute roles={['administrador', 'coordinadora']}><EstadoResultado /></RolRoute>} />
        {/* SPRINT-117c1: /admin/configuracion/usuarios es legacy — redirigir
            a la canónica /admin/usuarios para preservar bookmarks viejos.
            Antes era una segunda ruta activa al mismo componente. */}
        <Route path="configuracion/usuarios" element={<Navigate to="/admin/usuarios" replace />} />
        <Route path="ponches" element={<RolRoute roles={['administrador', 'coordinadora']}><AdminPonches /></RolRoute>} />
        <Route path="feedback" element={<RolRoute roles={['administrador', 'coordinadora']}><Feedback /></RolRoute>} />
        <Route path="sugerencias-chequeo" element={<RolRoute roles={['administrador', 'coordinadora']}><SugerenciasChequeo /></RolRoute>} />
        <Route path="reprogramaciones" element={<RolRoute roles={['administrador', 'coordinadora']}><Reprogramaciones /></RolRoute>} />
        <Route path="configuracion-marketing" element={<RolRoute roles={['administrador']}><ConfiguracionMarketing /></RolRoute>} />
        {/* SPRINT-INBOX-2 (2026-05-20): Inbox WhatsApp para staff oficina.
            Decisión D6=C: admin/coord/secretaria/operaria. Técnicos y
            ayudantes no entran (TecnicoRoute/AyudanteRoute ya gateaban). */}
        <Route path="inbox" element={<RolRoute roles={['administrador', 'coordinadora', 'secretaria', 'operaria']}><Inbox /></RolRoute>} />
        {/* SPRINT-INBOX-3 (2026-05-20): vista detalle de conversación. */}
        <Route path="inbox/:waId" element={<RolRoute roles={['administrador', 'coordinadora', 'secretaria', 'operaria']}><InboxConversacion /></RolRoute>} />
        {/* SPRINT-171 (2026-05-14): ruta `/admin/notificaciones` faltaba y el
            fallback `*` mandaba al landing público — confundía a la
            coordinadora. La rule de Firestore ya filtra por userId == auth.uid,
            así que no necesita PermisoRoute extra. */}
        <Route path="notificaciones" element={<Notificaciones />} />
        {/* SPRINT-180 (2026-05-18): catch-all DENTRO del layout admin. Sin
            esto, cualquier `/admin/<ruta-inexistente>` caía al `*` global
            que redirige a `/` (landing público) → coordinadora perdía
            sidebar + contexto de sesión. Detectado en QA E2E 2026-05-16
            ROL 6 bonus. Las rutas hermanas declaradas arriba tienen
            prioridad — react-router matchea en orden, las específicas
            ganan al catch-all. */}
        <Route path="*" element={<Admin404 />} />
      </Route>

      {/* Legacy redirects — old /dashboard, /ordenes etc. now under /admin */}
      <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/ordenes" element={<Navigate to="/admin/ordenes" replace />} />
      <Route path="/citas" element={<Navigate to="/admin/citas" replace />} />
      <Route path="/calendario" element={<Navigate to="/admin/calendario" replace />} />
      <Route path="/clientes" element={<Navigate to="/admin/clientes" replace />} />
      <Route path="/configuracion" element={<Navigate to="/admin/configuracion" replace />} />

      {/* Fallback — send to public home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <BannerNuevaVersion />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: { borderRadius: '12px', padding: '12px 16px', fontSize: '14px' },
            success: { iconTheme: { primary: '#22c55e', secondary: 'white' } },
            error: { iconTheme: { primary: '#ef4444', secondary: 'white' } },
          }}
        />
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  );
}
