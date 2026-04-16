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

// Public website pages
import PublicLayout from './components/public/PublicLayout';
import HomePage from './pages/public/HomePage';
import ServiciosPage from './pages/public/ServiciosPage';
import AgendarPage from './pages/public/AgendarPage';

import { useEffect } from 'react';
import { seedDatabase } from './firebase/seedData';
import { seedWebConfig } from './services/seedWebConfig';
import { limpiarOrdenDuplicada } from './utils/cleanFirestore';

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

function AppRoutes() {
  const { currentUser, userProfile, loading } = useApp();

  useEffect(() => {
    (window as unknown as { limpiarOrdenDuplicada: typeof limpiarOrdenDuplicada }).limpiarOrdenDuplicada = limpiarOrdenDuplicada;
  }, []);

  useEffect(() => {
    if (currentUser) {
      seedDatabase().catch(console.error);
      seedWebConfig().catch(console.error);
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
        <Route path="calendarios" element={<Calendarios />} />
        <Route path="standby" element={<Standby />} />
        <Route path="mapa" element={<MapaRutas />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="cotizaciones" element={<Cotizaciones />} />
        <Route path="facturas" element={<Facturas />} />
        <Route path="taller" element={<EquiposTaller />} />
        <Route path="productos" element={<Productos />} />
        <Route path="rendimiento" element={<Rendimiento />} />
        <Route path="mantenimiento" element={<Mantenimiento />} />
        <Route path="gastos" element={<Gastos />} />
        <Route path="personal" element={<PersonalPage />} />
        <Route path="usuarios" element={<GestionUsuarios />} />
        <Route path="web" element={<ConfiguracionWeb />} />
        <Route path="empresas-aliadas" element={<EmpresasAliadas />} />
        <Route path="formularios" element={<Formularios />} />
        <Route path="formularios/:id" element={<FormularioEditor />} />
        <Route path="solicitudes" element={<Solicitudes />} />
        <Route path="configuracion" element={<Configuracion />} />
        <Route path="configuracion/usuarios" element={<GestionUsuarios />} />
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
