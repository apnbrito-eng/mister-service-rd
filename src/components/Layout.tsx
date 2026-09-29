import { useMovimientoReducido } from '../hooks/useMovimientoReducido';
import { AtencionProvider } from '../context/AtencionContext';
import NavegacionMovil from './NavegacionMovil';
import EspacioTrabajo from './EspacioTrabajo';
import { Suspense, useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { obtenerTransicionMovimiento } from '../utils/motion';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';
import NotificacionesPanel from './NotificacionesPanel';
import AsistenteIAFlotante from './AsistenteIAFlotante';

export default function Layout() {
  const { pathname } = useLocation();

  const chatAbierto = /^\/admin\/inbox\/[^/]+/.test(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const reducido = useMovimientoReducido();
  const panelMovil = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelMovil.current?.toggleAttribute('inert', !mobileSidebarOpen);
    const cerrar = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileSidebarOpen(false); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [mobileSidebarOpen]);

  return (
    <AtencionProvider><div className={`app-shell service-ui flex overflow-hidden ${chatAbierto ? 'chat-enfocado' : ''}`} >
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar - desktop */}
      <div className="hidden lg:flex">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      {/* Sidebar - mobile */}
      <motion.div
        ref={panelMovil}
        initial={false}
        animate={{ x: reducido ? 0 : mobileSidebarOpen ? 0 : '-100%', opacity: mobileSidebarOpen ? 1 : 0 }}
        transition={obtenerTransicionMovimiento(reducido)}
        aria-hidden={!mobileSidebarOpen}
        style={{ pointerEvents: mobileSidebarOpen ? 'auto' : 'none', top: 'calc(var(--alto-aviso-entorno, 0px) + env(safe-area-inset-top, 0px))', bottom: 'env(safe-area-inset-bottom, 0px)' }}
        className="fixed inset-y-0 left-0 z-50 lg:hidden"
      >
        <Sidebar collapsed={false} onToggle={() => setMobileSidebarOpen(false)} onNavigate={() => setMobileSidebarOpen(false)} />
      </motion.div>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Top bar - mobile */}
        <div className="relative z-30 lg:hidden shrink-0 flex items-center justify-between glass-toolbar px-3 py-1 min-h-[52px] text-slate-800">
          <button className="shrink-0 min-h-11 min-w-11 flex items-center justify-center" aria-label="Abrir menú" onClick={() => setMobileSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <div className="min-w-0 flex-1 flex justify-center"><EspacioTrabajo compacto /></div>
          <NotificacionesPanel theme="light" />
        </div>

        {/* Top bar - desktop */}
        <div className="relative z-30 hidden lg:flex items-center justify-end glass-toolbar px-6 py-2">
          <NotificacionesPanel theme="light" />
        </div>

        {/* Page content */}
        <main className="service-main flex-1 min-h-0 min-w-0 overflow-y-auto">
          <EspacioTrabajo />
          <Suspense fallback={<div role="status" className="p-6 text-gray-500">Cargando vista…</div>}>
            <Outlet />
          </Suspense>
        </main>
        <NavegacionMovil onMenu={() => setMobileSidebarOpen(true)} menuAbierto={mobileSidebarOpen} />
      </div>

      {/* Burbuja flotante del Asistente IA — solo /admin/* (Sprint 4) */}
      <AsistenteIAFlotante />
    </div></AtencionProvider>
  );
}
