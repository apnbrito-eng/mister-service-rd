import type { ReactNode } from 'react';
import { useChatClienteEmpresa } from '../../hooks/useChatClienteEmpresa';
import { numeroWhatsAppCliente } from '../../utils/resolverChatCliente';
interface Props {
  telefono?: string;
  nombre?: string;
  clienteId?: string;
  mensaje?: string;
  className?: string;
  children?: ReactNode;
  antesAbrir?: () => Promise<void>;
  disabled?: boolean;
}
export default function BotonChatCliente({ telefono, nombre, clienteId, mensaje, className, children, antesAbrir, disabled = false }: Props) {
  const { puedeAbrir, abriendo, abrirChat } = useChatClienteEmpresa();
  const valido = !!telefono && !!numeroWhatsAppCliente(telefono);
  return <button type="button" className={className} disabled={disabled || !puedeAbrir || !valido || abriendo}
    aria-label={`Abrir conversación empresarial${nombre ? ` de ${nombre}` : ''}`}
    title={!puedeAbrir ? 'El inbox empresarial requiere un rol de oficina autorizado.' : !valido ? 'Revisa el teléfono del cliente.' : 'Abrir conversación completa en WhatsApp empresarial'}
    onClick={event => { event.stopPropagation(); if (valido && !disabled) void abrirChat({ telefono, nombre, clienteId }, mensaje, antesAbrir); }}>
    {abriendo ? 'Abriendo…' : children || 'WhatsApp empresa'}
  </button>;
}
