import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useApp, AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Ordenes from './pages/Ordenes';
import OrdenDetalle from './pages/OrdenDetalle';
import Citas from './pages/Citas';
import Calendario from './pages/Calendario';
import Standby from './pages/Standby';
import MapaRutas from './pages/MapaRutas';
import Clientes from './pages/Clientes';
import Cotizaciones from './pages/Cotizaciones';
import Facturas from './pages/Facturas';
import EquiposTaller from './pages/EquiposTaller';
import Productos from './pages/Productos';
import Rendimiento from './pages/Rendimiento';
import Mantenimiento from './pages/Mantenimiento';
import Gastos from './pages/Gastos';
import PersonalPage from './pages/PersonalPage';
import Configuracion from './pages/Configuracion';
import CierreDia from './pages/CierreDia';
import PreciosServicios from './pages/PreciosServicios';
import Inventario from './pages/Inventario';
import Comisiones from './pages/Comisiones';
import Nomina from './pages/Nomina';
import HistorialAnuladas from './pages/HistorialAnuladas';
import ConfiguracionWeb from './pages/ConfiguracionWeb';
import EmpresasAliadas from './pages/EmpresasAliadas';
import Formularios from './pages/Formularios';
import FormularioEditor from './pages/FormularioEditor';
import Solicitudes from './pages/Solicitudes';
import FormularioPublico from './pages/public/FormularioPublico';
import TecnicoVista from './pages/TecnicoVista';
import Calendarios from './pages/Calendarios';
import CitaPublica from './pages/CitaPublica';
import GestionUsuarios from './pages/GestionUsuarios';
import TrackingCliente from './pages/TrackingCliente';
import AgendaDia from './pages/AgendaDia';
import MetricasMensuales from './pages/MetricasMensuales';
import Bancos from './pages/Bancos';
import FacturacionPendiente from './pages/FacturacionPendiente';
import Avances from './pages/Avances';
import ReportesDGII from './pages/ReportesDGII';

// Public website pages
import PublicLayout from './components/public/PublicLayout';
import HomePage from './pages/public/HomePage';
import ServiciosPage from './pages/public/ServiciosPage';
import AgendarPage from './pages/public/AgendarPage';

import { useEffect } from 'react';
import { seedDatabase } from './firebase/seedData';
import { seedWebConfig } from './services/seedWebConfig';
import { seedPrecios } from './firebase/seedPrecios';
import { limpiarOrdenDuplicada } from './utils/cleanFirestore';
import { puede, AccionPermiso } from './utils/permisos';
import { Rol } from './types';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useApp();
  if (loading) return <LoadingSpinner fullPage text="Cargando..." />;
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function TecnicoRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, userProfile, loading } = useApp();
  if (loading) return <LoadingSpinner fullPage text="Cargando..." />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (userProfile?.rol === 'tecnico') return <Navigate to="/tecnico" replace />;
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
  const { currentUser, userProfile, loading } = useApp();

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
    <Routes>
      {/* ═══════════════════════════════════════════════
          PUBLIC WEBSITE — misterservicerd.com
          No auth required. Visible to everyone.
          ═══════════════════════════════════════════════ */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/servicios" element={<ServiciosPage />} />
        <Route path="/agendar" element={<AgendarPage />} />
      </Route>

      {/* Public standalone pages (no nav/footer — focused experience) */}
      <Route path="/cita/:calendarId" element={<CitaPublica />} />
      <Route path="/tracking/:token" element={<TrackingCliente />} />
      <Route path="/f/:slug" element={<FormularioPublico />} />

      {/* ═══════════════════════════════════════════════
          ADMIN / INTERNAL SYSTEM
          Requires authentication.
          ═══════════════════════════════════════════════ */}
      <Route path="/login" element={
        currentUser ? (
          userProfile?.rol === 'tecnico'
            ? <Navigate to="/tecnico" replace />
            : <Navigate to="/admin" replace />
        ) : <Login />
      } />

      <Route path="/tecnico" element={
        <ProtectedRoute><TecnicoVista /></ProtectedRoute>
      } />

      <Route path="/admin" element={
        <ProtectedRoute><TecnicoRoute><Layout /></TecnicoRoute></ProtectedRoute>
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
        <Route path="productos" element={<Productos />} />
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
        <Route path="configuracion" element={<PermisoRoute permiso="configuracionVer"><Configuracion /></PermisoRoute>} />
        <Route path="cierre-dia" element={<PermisoRoute permiso="cierreDiaEjecutar"><CierreDia /></PermisoRoute>} />
        <Route path="precios" element={<PermisoRoute permiso="configuracionVer"><PreciosServicios /></PermisoRoute>} />
        <Route path="inventario" element={<PermisoRoute permiso="configuracionVer"><Inventario /></PermisoRoute>} />
        <Route path="comisiones" element={<RolRoute roles={['administrador', 'coordinadora']}><Comisiones /></RolRoute>} />
        <Route path="nomina" element={<RolRoute roles={['administrador', 'coordinadora']}><Nomina /></RolRoute>} />
        <Route path="historial-anuladas" element={<PermisoRoute permiso="ordenesVerEliminadas"><HistorialAnuladas /></PermisoRoute>} />
        <Route path="bancos" element={<PermisoRoute permiso="bancosGestionar"><Bancos /></PermisoRoute>} />
        <Route path="facturacion-pendiente" element={<RolRoute roles={['administrador', 'coordinadora']}><FacturacionPendiente /></RolRoute>} />
        <Route path="avances" element={<PermisoRoute permiso="avancesGestionar"><Avances /></PermisoRoute>} />
        <Route path="reportes-dgii" element={<RolRoute roles={['administrador', 'coordinadora']}><ReportesDGII /></RolRoute>} />
        <Route path="configuracion/usuarios" element={<RolRoute roles={['administrador', 'coordinadora']}><GestionUsuarios /></RolRoute>} />
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
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
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
