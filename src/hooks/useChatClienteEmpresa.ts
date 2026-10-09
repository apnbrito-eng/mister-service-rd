import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { useAtencion } from '../context/AtencionContext';
import { resolverChatContacto, type ContactoChatCliente } from '../utils/resolverChatCliente';

/** Abrir el historial y preparar un borrador nunca envía un mensaje. */
export function useChatClienteEmpresa() {
  const { userProfile } = useApp();
  const { seleccionar } = useAtencion();
  const navigate = useNavigate();
  const ocupado = useRef(false);
  const [abriendo, setAbriendo] = useState(false);
  const puedeAbrir = !!userProfile && ['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(userProfile.rol);
  async function abrirChat(contacto: ContactoChatCliente, mensaje?: string, antesAbrir?: () => Promise<void>): Promise<boolean> {
    if (!puedeAbrir || ocupado.current) return false;
    ocupado.current = true;
    setAbriendo(true);
    try {
      const destino = await resolverChatContacto(contacto);
      if (antesAbrir) await antesAbrir();
      seleccionar(destino);
      const params = destino.clienteId ? `?clienteId=${encodeURIComponent(destino.clienteId)}` : '';
      navigate(`/admin/inbox/${encodeURIComponent(destino.waId)}${params}`, {
        state: mensaje ? { borradorChat: { waId: destino.waId, texto: mensaje.slice(0, 4096) } } : null,
      });
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo abrir la conversación empresarial. Reintenta.');
      return false;
    } finally {
      ocupado.current = false;
      setAbriendo(false);
    }
  }
  return { puedeAbrir, abriendo, abrirChat };
}
