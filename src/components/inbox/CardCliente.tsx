import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  User,
  Phone,
  Mail,
  MapPin,
  ClipboardList,
  Plus,
  UserPlus,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { buscarClientePorTelefono } from '../../services/clientes.service';
import { obtenerOrdenesActivasPorTelefono } from '../../services/ordenes.service';
import type { Cliente, OrdenServicio } from '../../types';
import { faseLabel, faseColor } from '../../utils';

/**
 * SPRINT-WA-INBOX-UX-QUICKWINS quickwin 3 (2026-05-23) — botones de copiar
 * sobre datos del cliente (teléfono/email/dirección). Pequeño helper local
 * para feedback (Check verde por 1.5s) + toast.
 */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copiado, setCopiado] = useState(false);
  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiado(true);
      toast.success(`${label} copiado`);
      window.setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.error('No se pudo copiar');
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className="p-1 text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors flex-shrink-0"
      title={`Copiar ${label.toLowerCase()}`}
      aria-label={`Copiar ${label.toLowerCase()}`}
    >
      {copiado ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
    </button>
  );
}

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
 *   - SPRINT-INBOX-8 (2026-05-21): si el padre provee `onCrearOrden`,
 *     los CTAs de crear orden invocan ese callback en lugar de
 *     navigate(...) — abre el modal SOBRE el inbox. La ficha del cliente
 *     sigue navegando (Jorge no objetó eso).
 *
 * Sin query con dos `where` → no requiere índice compuesto. La lógica
 * de fase activa corre client-side.
 */

/**
 * Prefill que CardCliente le pasa al padre cuando el operario clickea
 * "Crear orden". El padre lo usa para precargar el modal.
 */
export type PrefillCrearOrden =
  | { tipo: 'cliente-existente'; cliente: Cliente }
  | { tipo: 'cliente-nuevo'; telefono: string; nombre?: string };

interface Props {
  waId: string;
  /**
   * Callback opcional. Si el padre lo provee, los CTAs "Crear orden" lo
   * invocan en lugar de navegar a /admin/ordenes. Permite abrir el modal
   * crear orden EN contexto del inbox. Si es undefined, el componente
   * mantiene el comportamiento navegador legacy (fallback seguro).
   */
  onCrearOrden?: (prefill: PrefillCrearOrden) => void;
}

export default function CardCliente({ waId, onCrearOrden }: Props) {
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
              <span className="text-sm font-medium text-gray-900 truncate flex-1">
                {cliente.data.nombre || 'Sin nombre'}
              </span>
              {cliente.data.nombre && (
                <CopyButton value={cliente.data.nombre} label="Nombre" />
              )}
            </div>
            {/* Teléfono del waId — quickwin 3: botón copiar */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Phone size={12} className="text-gray-400 flex-shrink-0" />
              <span className="truncate flex-1 font-mono">{waId}</span>
              <CopyButton value={waId} label="Teléfono" />
            </div>
            {cliente.data.email && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Mail size={12} className="text-gray-400 flex-shrink-0" />
                <span className="truncate flex-1">{cliente.data.email}</span>
                <CopyButton value={cliente.data.email} label="Email" />
              </div>
            )}
            {cliente.data.direccion && (
              <div className="flex items-start gap-2 text-xs text-gray-500">
                <MapPin size={12} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <span className="break-words flex-1">{cliente.data.direccion}</span>
                <CopyButton value={cliente.data.direccion} label="Dirección" />
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
                          {/* @safe-numero-doc: fallback display cuando la orden todavía no tiene número asignado; no persiste */}
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

            {/* CTA crear orden con este cliente — SPRINT-INBOX-8: si el
                padre proveyó callback, abre modal en contexto. */}
            <button
              type="button"
              onClick={() => {
                if (onCrearOrden) {
                  // El shape del state interno es { id, data } pero el
                  // Cliente type espera `id` como property top-level. Para
                  // evitar el TS2783 ("id especificado mas de una vez"),
                  // spreadeamos data primero y sobreescribimos id explicito.
                  const clienteCompleto = { ...cliente.data, id: cliente.id } as Cliente;
                  onCrearOrden({ tipo: 'cliente-existente', cliente: clienteCompleto });
                } else {
                  navigate(`/admin/ordenes?nueva=1&clienteId=${cliente.id}`);
                }
              }}
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
            onClick={() => {
              // SPRINT-INBOX-8: si el padre provee callback de crear orden,
              // abrimos el modal en modo nuevo cliente (el cliente se crea
              // al guardar la orden via path isNewCliente del hook).
              if (onCrearOrden) {
                onCrearOrden({ tipo: 'cliente-nuevo', telefono: waId });
              } else {
                navigate(`/admin/clientes?nuevo=1&telefono=${waId}`);
              }
            }}
            className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-md"
          >
            <UserPlus size={12} />
            {onCrearOrden ? 'Crear cliente + orden aqui' : 'Crear cliente'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (onCrearOrden) {
                onCrearOrden({ tipo: 'cliente-nuevo', telefono: waId });
              } else {
                navigate(`/admin/ordenes?nueva=1&telefono=${waId}`);
              }
            }}
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
