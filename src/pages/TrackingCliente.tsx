import Logo from '../components/Logo';
import { useConfigWeb } from '../hooks/useConfigWeb';
import { whatsappLink } from '../utils';
import { MessageCircle, Wrench } from 'lucide-react';

// SPRINT-FIX-C2 (2026-09-26): la rule publica de `ordenes_servicio` fue
// removida el 2026-09-09 por exponer el documento completo. La pagina
// intentaba una query que hoy siempre falla con permission-denied. Se
// reemplaza por un mensaje amable + boton WhatsApp para no romper enlaces
// viejos ni ampliar `api/portal-cliente/[token]`. Decision Jorge 2026-09-26:
// "reemplaza la pagina por un mensaje amable ... no borres la ruta para
// que los enlaces viejos no muestren error".
export default function TrackingCliente() {
  const { config: configWeb } = useConfigWeb();
  const numeroWhatsapp = configWeb?.whatsapp?.numeros?.find((n) => n.activo)?.numero;
  const linkWa = numeroWhatsapp
    ? whatsappLink(numeroWhatsapp, 'Hola, quiero saber sobre mi servicio.')
    : null;

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col">
      <div className="bg-white px-4 py-3 shadow-sm border-b border-gray-100">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Logo size="sm" />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageCircle size={32} className="text-[#0f3460]" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Este enlace ya no está activo
          </h1>
          <p className="text-gray-600 text-sm mb-6">
            Escríbenos por WhatsApp y te damos el estado de tu servicio al momento.
          </p>
          {linkWa ? (
            <a
              href={linkWa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold shadow-sm transition"
            >
              <MessageCircle size={18} /> Escribir por WhatsApp
            </a>
          ) : (
            <p className="text-xs text-gray-400">
              Comuníquese con nosotros por los canales habituales.
            </p>
          )}
        </div>
      </div>

      <div className="text-center text-xs text-gray-400 py-3 inline-flex items-center justify-center gap-1 w-full">
        <Wrench size={11} /> Mister Service RD
      </div>
    </div>
  );
}
