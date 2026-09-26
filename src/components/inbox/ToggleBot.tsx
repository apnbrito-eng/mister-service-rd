import { Sparkles } from 'lucide-react';
interface Props { waId: string; habilitado: boolean; puedeTogglear?: boolean }
export default function ToggleBot(_props: Props) {
  return <span className="inline-flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800" title="Usa Ayúdame a responder para preparar una respuesta y revisarla antes de enviarla."><Sparkles size={14} />IA con revisión del equipo</span>;
}
