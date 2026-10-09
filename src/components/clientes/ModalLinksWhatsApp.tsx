import { useMemo, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Modal from '../Modal';
import type { Cliente, PlantillaMarketing } from '../../types';
import { renderizarPlantilla } from '../../utils/plantillaRender';
import { numeroWhatsAppCliente, resolverChatCliente } from '../../utils/resolverChatCliente';
import { useAtencion } from '../../context/AtencionContext';
import { useApp } from '../../context/AppContext';
import { esAdminOCoord, puede } from '../../utils/permisos';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  campanaId: string;
  plantilla: PlantillaMarketing;
  clientes: Cliente[];
}

/** Audiencia preparada; abrir una conversación nunca equivale a enviar la campaña. */
export default function ModalLinksWhatsApp({ isOpen, onClose, campanaId, plantilla, clientes }: Props) {
  const navigate = useNavigate();
  const { seleccionar } = useAtencion();
  const { userProfile } = useApp();
  const permitido = esAdminOCoord(userProfile) && puede(userProfile, 'clientesReactivacionGestionar');
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const ocupado = useRef(false);
  const [error, setError] = useState('');
  const filas = useMemo(() => clientes.map(cliente => ({ cliente, valido: !!numeroWhatsAppCliente(cliente.telefono), borrador: renderizarPlantilla(plantilla.mensaje, cliente) })), [clientes, plantilla]);

  async function abrir(cliente: Cliente) {
    if (!permitido || ocupado.current || !numeroWhatsAppCliente(cliente.telefono)) return;
    ocupado.current = true;
    setAbriendo(cliente.id);
    setError('');
    try {
      const waId = await resolverChatCliente(cliente);
      seleccionar({ clienteId: cliente.id, telefono: cliente.telefono, nombre: cliente.nombre, waId });
      onClose();
      navigate(`/admin/inbox/${encodeURIComponent(waId)}?clienteId=${encodeURIComponent(cliente.id)}`);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo abrir la conversación. Reintenta.');
    } finally {
      ocupado.current = false;
      setAbriendo(null);
    }
  }

  return <Modal isOpen={isOpen} onClose={onClose} title="Audiencia preparada" size="xl">
    <div className="space-y-4">
      <p className="text-sm">{filas.length} clientes · Campaña {campanaId} · {plantilla.nombre}</p>
      <p className="text-sm text-gray-600">Abre la conversación completa en el WhatsApp empresarial para revisar el historial y atender al cliente. Abrirla no envía mensajes ni marca la campaña como enviada.</p>
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">El envío por lote de esta campaña está pendiente de integrar con las plantillas aprobadas por Meta, el consentimiento y las restricciones del canal. Este borrador local no acredita aprobación de Meta. Desde el inbox, utiliza las opciones empresariales disponibles.</p>
      {!permitido && <p role="alert">No tienes permiso para gestionar reactivación.</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="max-h-[60vh] overflow-y-auto divide-y border rounded-xl">{filas.map(({ cliente, valido, borrador }) => <div key={cliente.id} className="p-3 space-y-2">
        <div className="flex gap-3 items-center justify-between"><div><p className="font-medium">{cliente.nombre}</p><p className="text-sm text-gray-500">{cliente.telefono || 'Sin teléfono'}{!valido && ' · Teléfono incompatible con este canal'}</p></div><button type="button" aria-label={`Abrir conversación de ${cliente.nombre}`} disabled={!valido || !permitido || abriendo !== null} onClick={() => void abrir(cliente)} className="inline-flex items-center gap-2 rounded-lg bg-primary text-white px-3 py-2 text-sm disabled:bg-gray-300"><MessageCircle size={16} />{abriendo === cliente.id ? 'Abriendo…' : 'Abrir conversación'}</button></div>
        <details><summary className="text-sm">Ver borrador local</summary><p className="whitespace-pre-wrap text-sm text-gray-600">{borrador}</p></details>
      </div>)}</div>
      <div className="flex justify-end"><button type="button" onClick={onClose} className="btn-primary">Cerrar</button></div>
    </div>
  </Modal>;
}
