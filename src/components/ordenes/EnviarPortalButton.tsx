import { useState } from 'react';
import { Send, Copy } from 'lucide-react';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { db } from '../../firebase/config';
import { OrdenServicio, Usuario } from '../../types';
import { normalizarTelefono } from '../../services/clientes.service';

interface Props {
  orden: OrdenServicio;
  userProfile: Usuario | null;
}

/**
 * Botón "Enviar portal al cliente" — sólo visible cuando la orden ya tiene
 * `tokenPortalCliente` (es decir, ya pasó por agendado). Al hacer click:
 *   1. Setea `portalClienteEnviado` con uid + nombre + timestamp + 'whatsapp'
 *   2. Abre `wa.me/<numero>?text=<mensaje>` en pestaña nueva.
 *
 * Si el teléfono del cliente está vacío o malformado, deshabilita la apertura
 * de WhatsApp y muestra un input copiable con el link del portal.
 *
 * Convención del proyecto: no emojis en código fuente. El mensaje WhatsApp
 * es texto plano profesional — el cliente lo lee, no es un identificador.
 */
export default function EnviarPortalButton({ orden, userProfile }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [mostrarLinkCopiable, setMostrarLinkCopiable] = useState(false);

  if (!orden.tokenPortalCliente) {
    return null;
  }

  const portalUrl = `https://www.misterservicerd.com/cliente/${orden.tokenPortalCliente}`;

  const telefonoNormalizado = orden.clienteTelefono
    ? normalizarTelefono(orden.clienteTelefono)
    : '';
  const telefonoValido = telefonoNormalizado.length === 10;

  // Construir mensaje de WhatsApp
  const fechaCitaTxt = orden.fechaCita
    ? formatFechaConDiaSemana(orden.fechaCita)
    : 'Por confirmar';
  const equipo = [orden.equipoTipo, orden.equipoMarca, orden.equipoModelo]
    .filter(p => p && p.length > 0)
    .join(' ');

  const lineas: string[] = [];
  lineas.push(`Hola ${orden.clienteNombre}, confirmamos tu cita con Mister Service RD:`);
  lineas.push('');
  lineas.push(`Fecha: ${fechaCitaTxt}`);
  if (orden.tecnicoNombre) {
    lineas.push(`Técnico: ${orden.tecnicoNombre}`);
  }
  if (equipo) {
    lineas.push(`Servicio: ${equipo}`);
  }
  lineas.push('');
  lineas.push('Sigue tu cita en tiempo real:');
  lineas.push(portalUrl);
  lineas.push('');
  lineas.push('En el link puedes:');
  lineas.push('- Ver el estado de tu orden en vivo');
  lineas.push('- Pedir posponer la cita si te surge algo');
  lineas.push('- Contactar al equipo');
  lineas.push('');
  lineas.push('Cualquier duda escríbenos por aquí.');
  lineas.push('- Mister Service RD');
  const mensaje = lineas.join('\n');

  const yaEnviado = orden.portalClienteEnviado?.enviadoEn;
  const yaEnviadoFecha = yaEnviado
    ? (yaEnviado instanceof Date ? yaEnviado : (yaEnviado as { toDate?: () => Date }).toDate?.() || null)
    : null;
  const labelBoton = yaEnviadoFecha
    ? `Reenviar portal al cliente (último envío: ${formatDistanceToNow(yaEnviadoFecha, { locale: es, addSuffix: true })})`
    : 'Enviar portal al cliente por WhatsApp';

  const ejecutarEnvio = async () => {
    if (!telefonoValido) {
      setMostrarLinkCopiable(true);
      return;
    }
    setEnviando(true);
    try {
      // 1) Persistir tracking del envío. Strip undefined defensivo.
      const portalEnviadoPayload: Record<string, unknown> = {
        enviadoEn: Timestamp.now(),
        enviadoPor: userProfile?.id || '',
        enviadoPorNombre: userProfile?.nombre || 'Sistema',
        metodo: 'whatsapp',
      };
      const portalEnviadoLimpio = Object.fromEntries(
        Object.entries(portalEnviadoPayload).filter(([, v]) => v !== undefined),
      );
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        portalClienteEnviado: portalEnviadoLimpio,
        updatedAt: Timestamp.now(),
      });

      // 2) Abrir WhatsApp
      const numeroIntl = `1${telefonoNormalizado}`;
      const url = `https://wa.me/${numeroIntl}?text=${encodeURIComponent(mensaje)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      toast.success('Portal enviado al cliente');
    } catch (err) {
      console.error('Error al registrar envío del portal:', err);
      toast.error('Error al registrar el envío');
    } finally {
      setEnviando(false);
    }
  };

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar — selecciónalo manualmente');
    }
  };

  if (mostrarLinkCopiable && !telefonoValido) {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-amber-900">
          Cliente sin teléfono válido. Copia el link manualmente:
        </p>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={portalUrl}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 text-xs bg-white border border-amber-200 rounded px-2 py-1.5 font-mono"
          />
          <button
            type="button"
            onClick={copiarLink}
            className="inline-flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded px-2 py-1.5"
          >
            <Copy size={12} /> Copiar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={ejecutarEnvio}
      disabled={enviando}
      title={!telefonoValido
        ? 'Cliente sin teléfono válido — clic para mostrar link copiable'
        : undefined}
      className={`inline-flex items-center gap-2 rounded-lg text-xs font-medium px-3 py-1.5 transition-colors ${
        telefonoValido
          ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
          : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200'
      } disabled:opacity-60`}
    >
      <Send size={12} />
      {enviando ? 'Enviando…' : labelBoton}
    </button>
  );
}

/**
 * Ej: "Lunes 30 de abril, 4:00 PM" — formato amigable para el cliente.
 */
function formatFechaConDiaSemana(d: Date): string {
  const fecha = format(d, "EEEE d 'de' MMMM", { locale: es });
  const hora = format(d, "h:mm a", { locale: es });
  // Capitalizar primer caracter
  const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1);
  return `${fechaCap}, ${hora}`;
}
