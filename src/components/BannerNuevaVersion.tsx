import { Sparkles, RefreshCw } from 'lucide-react';
import { useVersionCheck } from '../hooks/useVersionCheck';

export default function BannerNuevaVersion() {
  const { hayNuevaVersion, recargar } = useVersionCheck();
  if (!hayNuevaVersion) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-brand-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles size={16} />
          <span>Nueva versión disponible del sistema</span>
        </div>
        <button
          onClick={recargar}
          className="inline-flex items-center gap-1.5 bg-white text-brand-700 hover:bg-brand-50 transition-colors px-3 py-1.5 rounded-md text-sm font-semibold"
        >
          <RefreshCw size={14} />
          Recargar ahora
        </button>
      </div>
    </div>
  );
}
