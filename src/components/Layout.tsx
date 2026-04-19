import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useApp } from '../context/AppContext';
import { Menu } from 'lucide-react';
import NotificacionesPanel from './NotificacionesPanel';

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { userProfile } = useApp();

  return (
    <div className="flex h-screen bg-[#f0f4f8] overflow-hidden">
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
      <div
        className={`fixed inset-y-0 left-0 z-50 lg:hidden transition-transform duration-300 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar collapsed={false} onToggle={() => setMobileSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar - mobile */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#0f3460] text-white">
          <button onClick={() => setMobileSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <span className="font-semibold text-sm truncate">{userProfile?.nombre || 'Mister Service RD'}</span>
          <NotificacionesPanel theme="dark" />
        </div>

        {/* Top bar - desktop */}
        <div className="hidden lg:flex items-center justify-end px-6 py-2 bg-white border-b border-gray-100">
          <NotificacionesPanel theme="light" />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
