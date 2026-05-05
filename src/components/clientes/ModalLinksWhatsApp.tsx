import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../Modal';
import { Cliente, PlantillaMarketing, Usuario } from '../../types';
import { whatsappUrl } from '../../utils/whatsapp';
import { formatTelefono } from '../../utils';
import { renderizarPlantilla } from '../../utils/plantillaRender';
import { marcarClienteEnviado } from '../../services/campanasMarketing.service';
import { tieneWhatsAppValido } from '../../utils/clientesFiltros';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  campanaId: string;
  plantilla: PlantillaMarketing;
  /** Subset que se pasó a `crearCampana` — el modal solo opera sobre estos. */
  clientes: Cliente[];
  agente: Pick<Usuario, 'id' | 'nombre'>;
}

interface FilaLink {
  cliente: Cliente;
  link: string;
  mensaje: string;
  enviado: boolean;
  guardando: boolean;
  whatsappValido: boolean;
}

/**
 * Modal post-creación de campaña. Lista cada cliente con su link WhatsApp
 * pre-cargado y un botón para marcar como enviado (transacción atómica
 * vía `marcarClienteEnviado`).
 *
 * NO hace bulk-send — WhatsApp Business API no está integrada y los links
 * se abren manualmente uno a uno (limitación documentada en el spec).
 */
export default function ModalLinksWhatsApp({
  isOpen,
  onClose,
  campanaId,
  plantilla,
  clientes,
  agente,
}: Props) {
  const [filas, setFilas] = useState<FilaLink[]>(() =>
    clientes.map((c) => ({
      cliente: c,
      mensaje: renderizarPlantilla(plantilla.mensaje, c),
      link: '',
      enviado: false,
      guardando: false,
      whatsappValido: tieneWhatsAppValido(c),
    })),
  );

  // Re-build cuando cambia plantilla/clientes (raro mientras el modal está abierto).
  useEffect(() => {
    setFilas(
      clientes.map((c) => ({
        cliente: c,
        mensaje: renderizarPlantilla(plantilla.mensaje, c),
        link: whatsappUrl(c.telefono, renderizarPlantilla(plantilla.mensaje, c)),
        enviado: false,
        guardando: false,
        whatsappValido: tieneWhatsAppValido(c),
      })),
    );
  }, [clientes, plantilla]);

  const totalEnviados = useMemo(() => filas.filter((f) => f.enviado).length, [filas]);
  const totalValidos = useMemo(() => filas.filter((f) => f.whatsappValido).length, [filas]);

  const handleMarcarEnviado = async (clienteId: string) => {
    setFilas((prev) =>
      prev.map((f) => (f.cliente.id === clienteId ? { ...f, guardando: true } : f)),
    );
    try {
      const res = await marcarClienteEnviado({
        campanaId,
        clienteId,
        agente,
        plantillaId: plantilla.id,
        plantillaNombre: plantilla.nombre,
      });
      setFilas((prev) =>
        prev.map((f) => (f.cliente.id === clienteId ? { ...f, enviado: true, guardando: false } : f)),
      );
      if (res.yaEstabaEnviado) {
        toast('Ya estaba marcado como enviado', { icon: 'ℹ️' });
      } else {
        toast.success('Marcado como enviado');
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'No se pudo marcar como enviado');
      setFilas((prev) =>
        prev.map((f) => (f.cliente.id === clienteId ? { ...f, guardando: false } : f)),
      );
    }
  };

  const handleCopiarTodos = async () => {
    try {
      const lista = filas
        .filter((f) => f.whatsappValido)
        .map((f) => `${f.cliente.nombre}: ${f.link}`)
        .join('\n');
      if (!lista) {
        toast.error('No hay links válidos para copiar.');
        return;
      }
      await navigator.clipboard.writeText(lista);
      toast.success(`Copiados ${filas.filter((f) => f.whatsappValido).length} links.`);
    } catch {
      toast.error('No se pudo copiar al portapapeles.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Links WhatsApp generados" size="xl">
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-900">
          <p className="font-semibold">
            Campaña creada — {filas.length} cliente{filas.length === 1 ? '' : 's'}
          </p>
          <p className="text-xs text-blue-800 mt-0.5">
            Plantilla: <span className="font-medium">{plantilla.nombre}</span> · Enviados: {totalEnviados}/{totalValidos}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-gray-500">
            Abrí los links uno por uno y marcá "Enviado" cuando confirmes el contacto. Si el
            cliente no tiene WhatsApp válido, el link queda deshabilitado.
          </p>
          <button
            type="button"
            onClick={handleCopiarTodos}
            className="text-xs flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            <Copy size={12} /> Copiar todos los links
          </button>
        </div>

        <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
          {filas.map((f) => (
            <div
              key={f.cliente.id}
              className={`p-3 flex items-center gap-3 flex-wrap ${
                f.enviado ? 'bg-emerald-50/40' : 'bg-white'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{f.cliente.nombre}</p>
                <p className="text-xs text-gray-500">
                  {f.cliente.telefono ? formatTelefono(f.cliente.telefono) : 'Sin teléfono'}
                  {!f.whatsappValido && (
                    <span className="ml-2 text-amber-700">· WhatsApp inválido</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {f.whatsappValido ? (
                  <a
                    href={f.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs rounded-lg transition-colors"
                  >
                    <MessageCircle size={12} /> Abrir WhatsApp
                    <ExternalLink size={10} />
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 text-gray-400 text-xs rounded-lg cursor-not-allowed"
                  >
                    <MessageCircle size={12} /> Sin WhatsApp
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleMarcarEnviado(f.cliente.id)}
                  disabled={f.enviado || f.guardando || !f.whatsappValido}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    f.enviado
                      ? 'bg-emerald-100 text-emerald-700 cursor-default'
                      : 'bg-[#0f3460] hover:bg-[#1a5fa8] text-white disabled:bg-gray-300'
                  }`}
                >
                  {f.enviado ? (
                    <>
                      <Check size={12} /> Enviado
                    </>
                  ) : f.guardando ? (
                    'Guardando...'
                  ) : (
                    'Marcar enviado'
                  )}
                </button>
              </div>
            </div>
          ))}
          {filas.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">Sin clientes en la campaña.</div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
}
