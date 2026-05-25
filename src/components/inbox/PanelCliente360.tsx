import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, ClipboardList, Shield, Receipt, History,
  Calendar, Wrench, CheckCircle2,
} from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { buscarClientePorTelefono } from '../../services/clientes.service';
import { obtenerTodasOrdenesPorTelefono } from '../../services/ordenes.service';
import { useApp } from '../../context/AppContext';
import CardCliente, { type PrefillCrearOrden } from './CardCliente';
import TimelineUnificadoOrden from '../ordenes/TimelineUnificadoOrden';
import EnviarFacturacionButton from '../ordenes/EnviarFacturacionButton';
import { faseLabel, faseColor, formatFecha, formatMoneda } from '../../utils';
import type { Cliente, OrdenServicio, Factura } from '../../types';

/**
 * PanelCliente360 — centro de mando del cliente en el panel lateral del
 * inbox (SPRINT-INBOX-10, 2026-05-22).
 *
 * Convierte el `aside` Col 2 de `InboxConversacion` en una vista 360 del
 * cliente identificado por `wa_id` (= teléfono normalizado RD): datos,
 * órdenes (activas + histórico), garantías vigentes/expiradas, facturas,
 * y un timeline unificado de la orden activa más reciente (lo que dijo
 * el técnico + cambios de fase + WhatsApp).
 *
 * Diseño:
 *   - Tabs internos: Datos | Órdenes | Garantías | Facturas | Historial.
 *   - Tab "Datos" reusa `CardCliente` INTACTO (no rompe su contrato; ese
 *     componente sigue siendo el único responsable de buscar cliente +
 *     mostrar órdenes activas + CTAs de crear orden/cliente).
 *   - Tabs nuevos: carga propia (todas las órdenes, facturas) hecha acá.
 *   - El callback `onCrearOrden` se delega a CardCliente (tab Datos).
 *
 * Convenciones del repo:
 *   - Sin orderBy en queries Firestore (cazador P-015): sort client-side.
 *   - Búsqueda de facturas por clienteId con `where` simple, sort
 *     client-side por fechaEmision desc — patrón `Clientes.tsx:143`.
 *   - Permisos: `EnviarFacturacionButton` ya gatea internamente (tienePago).
 *   - El operario interactúa SIN salir del inbox: las acciones que
 *     escriben (reagendar, enviar a conduce) lo hacen vía componentes
 *     reusados o navegan a la sección existente (NO duplicamos lógica).
 */

interface Props {
  waId: string;
  /** Callback opcional para abrir el drawer "crear orden" desde el inbox.
   *  Pasa a través al `CardCliente` interno. */
  onCrearOrden?: (prefill: PrefillCrearOrden) => void;
}

type TabKey = 'datos' | 'ordenes' | 'garantias' | 'facturas' | 'historial';

const TABS: { key: TabKey; label: string; icono: typeof User }[] = [
  { key: 'datos', label: 'Datos', icono: User },
  { key: 'ordenes', label: 'Órdenes', icono: ClipboardList },
  { key: 'garantias', label: 'Garantías', icono: Shield },
  { key: 'facturas', label: 'Facturas', icono: Receipt },
  { key: 'historial', label: 'Historial', icono: History },
];

export default function PanelCliente360({ waId, onCrearOrden }: Props) {
  const navigate = useNavigate();
  const { userProfile } = useApp();
  const [tab, setTab] = useState<TabKey>('datos');

  // Estado cargado para los tabs que NO son "datos" (CardCliente carga lo
  // suyo internamente).
  const [cliente, setCliente] = useState<{ id: string; data: Cliente } | null>(null);
  const [todasOrdenes, setTodasOrdenes] = useState<OrdenServicio[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loadingOrdenes, setLoadingOrdenes] = useState(false);
  const [loadingFacturas, setLoadingFacturas] = useState(false);

  // Carga global (todas las órdenes por teléfono + cliente). Se dispara al
  // montar y al cambiar waId. Se hace eager — la mayoría de tabs lo
  // necesitan y son lecturas chicas.
  useEffect(() => {
    let cancelado = false;
    setLoadingOrdenes(true);
    (async () => {
      try {
        const [c, ords] = await Promise.all([
          buscarClientePorTelefono(waId),
          obtenerTodasOrdenesPorTelefono(waId),
        ]);
        if (cancelado) return;
        setCliente(c);
        setTodasOrdenes(ords);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[PanelCliente360] carga global falló:', err);
        if (!cancelado) {
          setCliente(null);
          setTodasOrdenes([]);
        }
      } finally {
        if (!cancelado) setLoadingOrdenes(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [waId]);

  // Facturas del cliente — se cargan SOLO cuando entramos al tab facturas
  // (o al historial que también las muestra resumidas). Patrón
  // `Clientes.tsx:143`: query by clienteId, sort client-side.
  useEffect(() => {
    if (!cliente?.id) {
      setFacturas([]);
      return;
    }
    if (tab !== 'facturas' && tab !== 'historial' && tab !== 'garantias') return;
    let cancelado = false;
    setLoadingFacturas(true);
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'facturas'), where('clienteId', '==', cliente.id)),
        );
        if (cancelado) return;
        const rows = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            fechaEmision: data.fechaEmision?.toDate?.() ?? new Date(),
            fechaVencimiento: data.fechaVencimiento?.toDate?.() ?? null,
            fechaPago: data.fechaPago?.toDate?.() ?? null,
          } as Factura;
        });
        rows.sort((a, b) => b.fechaEmision.getTime() - a.fechaEmision.getTime());
        setFacturas(rows);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[PanelCliente360] carga facturas falló:', err);
        if (!cancelado) setFacturas([]);
      } finally {
        if (!cancelado) setLoadingFacturas(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [cliente?.id, tab]);

  const ordenesActivas = useMemo(
    () => todasOrdenes.filter((o) => o.fase !== 'cerrado' && o.fase !== 'cancelado'),
    [todasOrdenes],
  );
  const ordenesCerradas = useMemo(
    () => todasOrdenes.filter((o) => o.fase === 'cerrado' || o.fase === 'cancelado'),
    [todasOrdenes],
  );

  // Garantías: facturas (conduces) con `garantia` definida. La garantía
  // vive denormalizada en `Factura.garantia: GarantiaInfo` al emitir el
  // conduce. La orden tiene `garantiaVencimiento` (Date) pero la info
  // completa (estado, tiempoDias, token) está en la factura.
  const facturasConGarantia = useMemo(
    () => facturas.filter((f) => !!f.garantia),
    [facturas],
  );

  // Orden activa más reciente para el tab Historial (timeline unificado).
  const ordenParaTimeline = useMemo<OrdenServicio | null>(() => {
    if (ordenesActivas.length > 0) return ordenesActivas[0];
    if (todasOrdenes.length > 0) return todasOrdenes[0];
    return null;
  }, [ordenesActivas, todasOrdenes]);

  // SPRINT-WA-INBOX-UX-QUICKWINS quickwin 2 (2026-05-23) — último servicio
  // realizado (orden terminal más reciente). Sort client-side (P-015: NO
  // agregar orderBy a la query Firestore). Cascada de fechas: fechaCita →
  // fechaCierre raíz → cierreServicio.fechaCierre → createdAt.
  const ultimoServicioRealizado = useMemo<OrdenServicio | null>(() => {
    if (ordenesCerradas.length === 0) return null;
    const fechaDe = (o: OrdenServicio): number => {
      type O = OrdenServicio & {
        fechaCierre?: Date | { toDate?: () => Date };
        cierreServicio?: { fechaCierre?: Date | { toDate?: () => Date } };
      };
      const ox = o as O;
      const cand: unknown =
        ox.cierreServicio?.fechaCierre ??
        ox.fechaCierre ??
        ox.fechaCita ??
        ox.createdAt;
      if (!cand) return 0;
      if (cand instanceof Date) return cand.getTime();
      const obj = cand as { toDate?: () => Date };
      if (typeof obj.toDate === 'function') return obj.toDate().getTime();
      return 0;
    };
    const ordenadas = [...ordenesCerradas].sort((a, b) => fechaDe(b) - fechaDe(a));
    return ordenadas[0] ?? null;
  }, [ordenesCerradas]);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs header — compacto, scrollable horizontal en angosto */}
      <div className="flex items-center gap-0.5 border-b border-gray-200 px-1 overflow-x-auto">
        {TABS.map((t) => {
          const activa = tab === t.key;
          const Icono = t.icono;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1 px-2 py-2 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                activa
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              title={t.label}
            >
              <Icono size={12} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'datos' && (
          <div className="space-y-3">
            {/* SPRINT-WA-INBOX-UX-QUICKWINS quickwin 2: último servicio realizado.
                Aparece solo si hay órdenes terminales. NO suprime ni reemplaza
                a CardCliente — es un destacado contextual arriba de los datos. */}
            {ultimoServicioRealizado && (
              <UltimoServicioCard
                orden={ultimoServicioRealizado}
                onClick={() => navigate(`/admin/ordenes/${ultimoServicioRealizado.id}`)}
              />
            )}
            <CardCliente waId={waId} onCrearOrden={onCrearOrden} />
          </div>
        )}

        {tab === 'ordenes' && (
          <OrdenesTab
            loading={loadingOrdenes}
            activas={ordenesActivas}
            cerradas={ordenesCerradas}
            userProfile={userProfile}
            onClickOrden={(id) => navigate(`/admin/ordenes/${id}`)}
            onIrReprogramaciones={() => navigate('/admin/reprogramaciones')}
          />
        )}

        {tab === 'garantias' && (
          <GarantiasTab
            loading={loadingFacturas}
            facturas={facturasConGarantia}
            onClickOrden={(ordenId) => navigate(`/admin/ordenes/${ordenId}`)}
          />
        )}

        {tab === 'facturas' && (
          <FacturasTab
            loading={loadingFacturas}
            facturas={facturas}
            onClickFactura={(id) => navigate(`/admin/facturas?id=${id}`)}
          />
        )}

        {tab === 'historial' && (
          <HistorialTab
            ordenParaTimeline={ordenParaTimeline}
            facturas={facturas}
            loadingFacturas={loadingFacturas}
          />
        )}
      </div>
    </div>
  );
}

// ─── Tab: Órdenes ──────────────────────────────────────────────────────────
interface OrdenesTabProps {
  loading: boolean;
  activas: OrdenServicio[];
  cerradas: OrdenServicio[];
  userProfile: ReturnType<typeof useApp>['userProfile'];
  onClickOrden: (id: string) => void;
  onIrReprogramaciones: () => void;
}

function OrdenesTab({
  loading,
  activas,
  cerradas,
  userProfile,
  onClickOrden,
  onIrReprogramaciones,
}: OrdenesTabProps) {
  if (loading) {
    return <p className="text-xs text-gray-400 italic">Cargando órdenes...</p>;
  }
  const hayPropuestaPendiente = activas.some(
    (o) =>
      Array.isArray(o.propuestasReprogramacion) &&
      o.propuestasReprogramacion.some((p) => p.estado === 'pendiente'),
  );

  return (
    <div className="space-y-4">
      {hayPropuestaPendiente && (
        <button
          type="button"
          onClick={onIrReprogramaciones}
          className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md"
        >
          <Calendar size={12} />
          Hay propuesta de reprogramación pendiente — revisar
        </button>
      )}

      <section>
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Activas {activas.length > 0 && `(${activas.length})`}
        </p>
        {activas.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Sin órdenes activas.</p>
        ) : (
          <ul className="space-y-1.5">
            {activas.map((o) => (
              <li key={o.id}>
                <ItemOrden
                  orden={o}
                  onClick={() => onClickOrden(o.id)}
                  userProfile={userProfile}
                  mostrarEnviarFacturacion
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {cerradas.length > 0 && (
        <section>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Histórico ({cerradas.length})
          </p>
          <ul className="space-y-1.5">
            {cerradas.slice(0, 10).map((o) => (
              <li key={o.id}>
                <ItemOrden
                  orden={o}
                  onClick={() => onClickOrden(o.id)}
                  userProfile={userProfile}
                />
              </li>
            ))}
          </ul>
          {cerradas.length > 10 && (
            <p className="text-[10px] text-gray-400 italic mt-1">
              Mostrando 10 de {cerradas.length}. Abrí la ficha del cliente para ver todas.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

interface ItemOrdenProps {
  orden: OrdenServicio;
  onClick: () => void;
  userProfile: ReturnType<typeof useApp>['userProfile'];
  mostrarEnviarFacturacion?: boolean;
}

function ItemOrden({
  orden,
  onClick,
  userProfile,
  mostrarEnviarFacturacion,
}: ItemOrdenProps) {
  // EnviarFacturacionButton gatea internamente por tienePago + !facturada,
  // se renderiza solo cuando aplica. Stop propagation para no navegar al
  // clickearlo.
  return (
    <div className="bg-white hover:bg-gray-50 border border-gray-200 rounded p-2 transition-colors">
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono font-medium text-gray-900 truncate">
            {/* @safe-numero-doc: fallback display cuando la orden todavía no tiene número asignado; no persiste */}
            {orden.numero || `OS-${orden.id.slice(0, 6)}`}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white flex-shrink-0"
            style={{ backgroundColor: faseColor(orden.fase) }}
          >
            {faseLabel(orden.fase)}
          </span>
        </div>
        <p className="text-[10px] text-gray-500 mt-0.5 truncate">
          {orden.equipoTipo}
          {orden.equipoMarca ? ` · ${orden.equipoMarca}` : ''}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {orden.fechaCita ? formatFecha(orden.fechaCita) : formatFecha(orden.createdAt)}
        </p>
      </button>
      {mostrarEnviarFacturacion && (
        <div
          className="mt-1.5 pt-1.5 border-t border-gray-100"
          onClick={(e) => e.stopPropagation()}
        >
          <EnviarFacturacionButton orden={orden} userProfile={userProfile} />
        </div>
      )}
    </div>
  );
}

// ─── Tab: Garantías ────────────────────────────────────────────────────────
interface GarantiasTabProps {
  loading: boolean;
  /** Facturas (conduces) que tienen `garantia: GarantiaInfo` denormalizada. */
  facturas: Factura[];
  /** Si la factura tiene `ordenId`, navega al detalle de la orden subyacente. */
  onClickOrden: (ordenId: string) => void;
}

function GarantiasTab({ loading, facturas, onClickOrden }: GarantiasTabProps) {
  if (loading) {
    return <p className="text-xs text-gray-400 italic">Cargando garantías...</p>;
  }
  if (facturas.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">
        Sin garantías emitidas para este cliente.
      </p>
    );
  }
  const ahora = Date.now();
  return (
    <ul className="space-y-2">
      {facturas.map((f) => {
        const g = f.garantia!;
        const fin = g.finFecha instanceof Date
          ? g.finFecha
          : (g.finFecha as { toDate?: () => Date }).toDate?.() ?? new Date(0);
        const vigente = fin.getTime() > ahora && g.estado === 'vigente';
        const colores = vigente
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : g.estado === 'reclamada'
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-gray-50 border-gray-200 text-gray-600';
        // El conduce siempre tiene `numero` (CG-####). Si tiene ordenId,
        // el click navega al detalle de orden (donde se ve toda la info).
        // Si no, navega al detalle del conduce (no debería pasar con
        // conduces post-2025 pero es defensa para legacy).
        return (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => {
                if (f.ordenId) onClickOrden(f.ordenId);
              }}
              disabled={!f.ordenId}
              className="w-full text-left bg-white hover:bg-gray-50 border border-gray-200 rounded p-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-medium text-gray-900 truncate">
                  {f.numero}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${colores}`}>
                  {g.estado}
                </span>
              </div>
              {(f.equipoTipo || f.equipoMarca) && (
                <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                  {f.equipoTipo ?? ''}
                  {f.equipoMarca ? ` · ${f.equipoMarca}` : ''}
                </p>
              )}
              <p className="text-[10px] text-gray-400 mt-0.5">
                {g.tiempoDias}d · vence {formatFecha(fin)}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Tab: Facturas ─────────────────────────────────────────────────────────
interface FacturasTabProps {
  loading: boolean;
  facturas: Factura[];
  onClickFactura: (id: string) => void;
}

function FacturasTab({ loading, facturas, onClickFactura }: FacturasTabProps) {
  if (loading) {
    return <p className="text-xs text-gray-400 italic">Cargando facturas...</p>;
  }
  if (facturas.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">
        Sin conduces de garantía emitidos.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {facturas.slice(0, 20).map((f) => (
        <li key={f.id}>
          <button
            type="button"
            onClick={() => onClickFactura(f.id)}
            className="w-full text-left bg-white hover:bg-gray-50 border border-gray-200 rounded p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono font-medium text-gray-900 truncate">
                {f.numero}
              </span>
              <span className="text-[10px] font-semibold text-gray-700 flex-shrink-0">
                {formatMoneda(f.total)}
              </span>
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {formatFecha(f.fechaEmision)}
              {f.estado ? ` · ${f.estado}` : ''}
            </p>
          </button>
        </li>
      ))}
      {facturas.length > 20 && (
        <p className="text-[10px] text-gray-400 italic mt-1">
          Mostrando 20 de {facturas.length}.
        </p>
      )}
    </ul>
  );
}

// ─── Tab: Historial (timeline + resumen) ───────────────────────────────────
interface HistorialTabProps {
  ordenParaTimeline: OrdenServicio | null;
  facturas: Factura[];
  loadingFacturas: boolean;
}

function HistorialTab({
  ordenParaTimeline,
  facturas,
  loadingFacturas,
}: HistorialTabProps) {
  if (!ordenParaTimeline) {
    return (
      <p className="text-xs text-gray-400 italic">
        Sin orden vinculada al cliente — sin historial todavía.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="bg-blue-50/40 border border-blue-100 rounded p-2">
        <p className="text-[10px] text-blue-700 uppercase font-semibold tracking-wide mb-0.5">
          {ordenParaTimeline.fase === 'cerrado' || ordenParaTimeline.fase === 'cancelado'
            ? 'Última orden'
            : 'Orden en curso'}
        </p>
        <p className="text-xs font-mono font-medium text-blue-900">
          {/* @safe-numero-doc: fallback display cuando la orden todavía no tiene número asignado; no persiste */}
          {ordenParaTimeline.numero || `OS-${ordenParaTimeline.id.slice(0, 6)}`}
        </p>
        <p className="text-[10px] text-blue-600 mt-0.5">
          <Wrench size={10} className="inline mr-1" />
          {ordenParaTimeline.equipoTipo}
          {ordenParaTimeline.equipoMarca ? ` · ${ordenParaTimeline.equipoMarca}` : ''}
        </p>
      </div>

      <TimelineUnificadoOrden
        orden={ordenParaTimeline}
        variant="modal"
        max={30}
      />

      {!loadingFacturas && facturas.length > 0 && (
        <div className="bg-white border border-gray-200 rounded p-2">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
            <CheckCircle2 size={10} className="inline mr-1" />
            Último conduce
          </p>
          <p className="text-xs font-mono font-medium text-gray-900">
            {facturas[0].numero} · {formatMoneda(facturas[0].total)}
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {formatFecha(facturas[0].fechaEmision)}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Destacado: Último servicio realizado (quickwin 2) ─────────────────────
function UltimoServicioCard({
  orden,
  onClick,
}: {
  orden: OrdenServicio;
  onClick: () => void;
}) {
  // Misma cascada de fechas que el sort que eligió esta orden, para mostrar
  // la fecha más representativa del cierre.
  type O = OrdenServicio & {
    fechaCierre?: Date | { toDate?: () => Date };
    cierreServicio?: { fechaCierre?: Date | { toDate?: () => Date } };
  };
  const ox = orden as O;
  const cand =
    ox.cierreServicio?.fechaCierre ??
    ox.fechaCierre ??
    ox.fechaCita ??
    ox.createdAt;
  const fechaCierre =
    cand instanceof Date
      ? cand
      : ((cand as { toDate?: () => Date })?.toDate?.() ?? null);
  const falla =
    (orden as { descripcionFalla?: string; falla?: string }).descripcionFalla ??
    (orden as { descripcionFalla?: string; falla?: string }).falla ??
    null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-emerald-50/60 hover:bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 transition-colors"
      title="Abrir esta orden"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <CheckCircle2 size={12} className="text-emerald-600" />
        <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">
          Último servicio realizado
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono font-medium text-gray-900 truncate">
          {/* @safe-numero-doc: fallback display cuando la orden todavía no tiene número asignado; no persiste */}
          {orden.numero || `OS-${orden.id.slice(0, 6)}`}
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white flex-shrink-0"
          style={{ backgroundColor: faseColor(orden.fase) }}
        >
          {faseLabel(orden.fase)}
        </span>
      </div>
      <p className="text-[11px] text-gray-700 mt-0.5 truncate">
        <Wrench size={10} className="inline mr-1 text-gray-500" />
        {orden.equipoTipo}
        {orden.equipoMarca ? ` · ${orden.equipoMarca}` : ''}
      </p>
      {falla && (
        <p className="text-[11px] text-gray-600 mt-0.5 line-clamp-2">{falla}</p>
      )}
      {fechaCierre && (
        <p className="text-[10px] text-gray-500 mt-1">
          Cerrado · {formatFecha(fechaCierre)}
        </p>
      )}
    </button>
  );
}
