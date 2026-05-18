import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

/**
 * SPRINT-180 (2026-05-18) — 404 dentro del layout admin.
 *
 * Antes: cualquier `/admin/<ruta-inexistente>` caía al fallback global `*`
 * que redirige a `/` (landing público). Esto perdía contexto (sidebar
 * desaparecía, sesión visualmente cortada) y obligaba al usuario a hacer
 * login mental "me sigo logueado, donde estoy?" + volver manualmente.
 *
 * Después: catch-all `<Route path="*">` dentro del `/admin` route monta
 * este componente. Sidebar + Layout preservados, mensaje claro, dos
 * accesos rápidos (Dashboard + atrás).
 *
 * Regresión parcial reportada SPRINT-180 ROL 6 bonus QA E2E 2026-05-16:
 * coordinadora navegó a `/admin/notif-que-no-existe` y terminó en landing
 * público sin entender cómo volver. Este 404 in-layout resuelve ese caso.
 */
export default function Admin404() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-12 text-center">
      <div className="text-6xl font-bold text-gray-300 mb-2">404</div>
      <h1 className="text-2xl font-semibold text-gray-800 mb-2">
        Página no encontrada
      </h1>
      <p className="text-gray-600 max-w-md mb-8">
        La ruta que intentaste abrir dentro del panel administrativo no existe
        o fue movida. Tu sesión sigue activa.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          to="/admin/dashboard"
          className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 rounded-xl font-medium transition-colors"
        >
          <Home size={18} />
          Ir al Dashboard
        </Link>
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-6 py-3 rounded-xl font-medium transition-colors"
        >
          <ArrowLeft size={18} />
          Volver atrás
        </button>
      </div>
    </div>
  );
}
