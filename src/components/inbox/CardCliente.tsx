import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Phone,
  Mail,
  MapPin,
  ClipboardList,
  Plus,
  UserPlus,
  ExternalLink,
} from 'lucide-react';
import { buscarClientePorTelefono } from '../../services/clientes.service';
import { obtenerOrdenesActivasPorTelefono } from '../../services/ordenes.service';
import type { Cliente, OrdenServicio } from '../../types';
import { faseLabel, faseColor } from '../../utils';

/**
 * CardCliente — datos del cliente vinculado a la conversación + listado
 * de órdenes activas (SPRINT-INBOX-5, 2026-05-20).
 *
 * Comportamiento:
 *   - Busca cliente por `wa_id` (que ES el teléfono normalizado RD).
 *   - Si encuentra cliente: muestra nombre, email, dirección + órdenes
 *     activas (fase != cerrado/cancelado).
 *   - Si NO encuentra: muestra CTA "Crear cliente" + "Crear orden con
 *     este teléfono" (precarga el wa_id en la URL de Ordenes con query).
 *   - Las CTAs no escriben Firestore desde acá — navegan a flujos
 *     existentes (`/admin/clientes` y `/admin/ordenes`).
 *
 * Sin query con dos `where` → no requiere índice compuesto. La lógica
 * de fase activa corre client-side.
 */

interface Props {
  waId: string;
}

export default function CardCliente({ waId }: Props) {
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<{ id: string; data: Cliente } | null>(null);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    (async () => {
      try {
        const c = await buscarClientePorTelefono(waId);
        if (cancelado) return;
        setCliente(c);
        const ords = await obtenerOrdenesActivasPorTelefono(waId);
        if (cancelado) return;
        setOrdenes(ords);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CardCliente] carga falló:', err);
        if (!cancelado) {
          setCliente(null);
          setOrdenes([]);
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [waId]);

  if (loading) {
    return <p className="text-xs text-gray-400 italic">Buscando cliente...</p>;
  }

  return (
    <div className="space-y-3">
      {cliente ? (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <User size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-900 truncate">
                {cliente.data.nombre || 'Sin nombre'}
              </span>
            </div>
            {cliente.data.email && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Mail size={12} className="text-gray-400 flex-shrink-0" />
                <span className="truncate">{cliente.data.email}</span>
              </div>
            )}
            {cliente.data.direccion && (
              <div className="flex items-start gap-2 text-xs text-gray-500">
                <MapPin size={12} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <span className="break-words">{cliente.data.direccion}</span>
              </div>
            )}
          </div>

          {/* Acción rápida: ir a la ficha del cliente */}
          <button
            type="button"
            onClick={() => navigate(`/admin/clientes?id=${cliente.id}`)}
            className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-md"
          >
            <ExternalLink size={12} />
            Ver ficha del cliente
          </button>

          {/* Órdenes activas */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Órdenes activas {ordenes.length > 0 && `(${ordenes.length})`}
            </p>
            {ordenes.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Sin órdenes activas.</p>
            ) : (
              <ul className="space-y-1.5">
                {ordenes.slice(0, 5).map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/ordenes/${o.id}`)}
                      className="w-full text-left bg-white hover:bg-gray-50 border border-gray-200 rounded p-2 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-medium text-gray-900 truncate">
                          {o.numero || `OS-${o.id.slice(0, 6)}`}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
                          style={{ backgroundColor: faseColor(o.fase) }}
                        >
                          {faseLabel(o.fase)}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                        {o.equipoTipo}
                        {o.equipoMarca ? ` · ${o.equipoMarca}` : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* CTA crear orden con este cliente */}
            <button
              type="button"
              onClick={() => navigate(`/admin/ordenes?nueva=1&clienteId=${cliente.id}`)}
              className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md"
            >
              <Plus size={12} />
              Crear orden para este cliente
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Phone size={14} className="text-gray-400" />
            <span>Cliente no registrado</span>
          </div>
          <p className="text-xs text-gray-500">
            No encontramos un cliente con este teléfono. Podés crear uno o
            arrancar directamente una orden.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/admin/clientes?nuevo=1&telefono=${waId}`)}
            className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-md"
          >
            <UserPlus size={12} />
            Crear cliente
          </button>
          <button
            type="button"
            onClick={() => navigate(`/admin/ordenes?nueva=1&telefono=${waId}`)}
            className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md"
          >
            <ClipboardList size={12} />
            Crear orden
          </button>
        </>
      )}
    </div>
  );
}
