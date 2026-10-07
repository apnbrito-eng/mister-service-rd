import {motion} from 'motion/react';
import {useMovimientoReducido} from '../../hooks/useMovimientoReducido';
import {obtenerTransicionMovimiento} from '../../utils/motion';
import {puede} from '../../utils/permisos';
import CrearClienteDesdeChat from './CrearClienteDesdeChat';
import ExpedienteCliente from './ExpedienteCliente';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Wrench, CheckCircle2, ChevronDown } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {resolverClienteFicha} from './resolverClienteFicha';
import { obtenerTodasOrdenesPorTelefono } from '../../services/ordenes.service';
import { useApp } from '../../context/AppContext';
import type { PrefillCrearOrden } from './CardCliente';
import FichaClienteCabecera, { type UbicacionClienteRecibida } from './FichaClienteCabecera';
import AtencionChat from './AtencionChat';
import TimelineUnificadoOrden from '../ordenes/TimelineUnificadoOrden';
import GestionOrden, { type FuenteCrm } from '../crm/GestionOrden';
import EnviarFacturacionButton from '../ordenes/EnviarFacturacionButton';
import { faseLabel, faseColor, formatFecha, formatMoneda } from '../../utils';
import type { Cliente, OrdenServicio, Factura } from '../../types';

interface Props {
  waId: string;
  clienteIdInicial?: string;
  conversacionExiste?: boolean;
  onCliente?: (cliente: Cliente) => void;
  ubicacionesRecibidas?: UbicacionClienteRecibida[];
  fuenteCrm?: FuenteCrm | null;
  alUsarFuente?: () => void;
  onCrearOrden?: (prefill: PrefillCrearOrden) => void;
  controlesChat?: ReactNode;
}
type Seccion = 'expediente' | 'anteriores' | 'garantias' | 'facturas' | 'historial';

/** Una sola carga de cliente y órdenes. La ficha y la gestión comparten scroll. */
export default function PanelCliente360(props: Props) {
  // El cambio de teléfono nunca reutiliza borradores ni resultados del cliente anterior.
  return <PanelCliente key={props.waId} {...props} />;
}
function PanelCliente({ waId, onCrearOrden, fuenteCrm, alUsarFuente, controlesChat, ubicacionesRecibidas, clienteIdInicial, conversacionExiste = true, onCliente }: Props) {
  const navigate = useNavigate();
  const reducido = useMovimientoReducido();
  const [creandoCliente,setCreandoCliente]=useState(false);
  const notificarCliente=useRef(onCliente);notificarCliente.current=onCliente;
  const { userProfile } = useApp();
  const [cliente, setCliente] = useState<{ id: string; data: Cliente } | null>(null);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const [seleccion, setSeleccion] = useState('');
  const [vistaOrden, setVistaOrden] = useState(false);
  const [vistaExpediente,setVistaExpediente]=useState(false);
  const [abiertas, setAbiertas] = useState<Partial<Record<Seccion, boolean>>>({});
  const [visitadas, setVisitadas] = useState<Partial<Record<Seccion, boolean>>>({});
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [estadoFacturas, setEstadoFacturas] = useState<'pendiente' | 'cargando' | 'listo' | 'error'>('pendiente');
  const [intentoFacturas, setIntentoFacturas] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const scrollFicha = useRef(0);
  const expedienteDirecto=useRef<HTMLElement>(null);
  useEffect(()=>{if(vistaExpediente && cliente && !cargando)requestAnimationFrame(()=>expedienteDirecto.current?.scrollIntoView?.({block:'start'}));},[vistaExpediente,cliente,cargando]);
  const activarSeccion = (seccion: Seccion, abierta: boolean) => {
    setAbiertas(prev => ({ ...prev, [seccion]: abierta }));
    if (abierta) setVisitadas(prev => ({ ...prev, [seccion]: true }));
  };
  const abrirOrden = (id: string) => {
    scrollFicha.current = scroll.current?.scrollTop ?? 0;
    setVistaExpediente(false);
    setSeleccion(id);
    setVistaOrden(true);
    scroll.current?.scrollTo({ top: 0 });
  };
  const volver = () => {
    setVistaOrden(false);
    requestAnimationFrame(() => scroll.current?.scrollTo({ top: scrollFicha.current }));
  };
  useEffect(() => {
    if (!fuenteCrm) return;
    if (fuenteCrm.accion === 'expediente') {
      setVistaOrden(false);
      setVistaExpediente(true);
      activarSeccion('expediente', true);
    } else {
      setVistaExpediente(false);
      setVistaOrden(true);
    }
    scroll.current?.scrollTo({ top: 0 });
  }, [fuenteCrm]);
  useEffect(() => {
    let activo = true;
    setCargando(true); setError(false);
    Promise.all([resolverClienteFicha(waId,clienteIdInicial), obtenerTodasOrdenesPorTelefono(waId)])
      .then(([c, o]) => { if (activo) { setCliente(c); setOrdenes(o); if(c)notificarCliente.current?.({...c.data,id:c.id}); } })
      .catch(() => { if (activo) setError(true); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [waId, clienteIdInicial, intento]);
  const necesitaFacturas = !!(visitadas.garantias || visitadas.facturas || visitadas.historial);
  useEffect(() => {
    if (!necesitaFacturas || !cliente?.id) return;
    let activo = true;
    setEstadoFacturas('cargando');
    getDocs(query(collection(db, 'facturas'), where('clienteId', '==', cliente.id)))
      .then(snap => {
        if (!activo) return;
        const rows = snap.docs.map(d => {
          const data = d.data();
          return { ...data, id: d.id,
            fechaEmision: data.fechaEmision?.toDate?.() ?? new Date(0),
            fechaVencimiento: data.fechaVencimiento?.toDate?.() ?? null,
            fechaPago: data.fechaPago?.toDate?.() ?? null,
          } as Factura;
        });
        rows.sort((a, b) => b.fechaEmision.getTime() - a.fechaEmision.getTime());
        setFacturas(rows); setEstadoFacturas('listo');
      }).catch(() => { if (activo) setEstadoFacturas('error'); });
    return () => { activo = false; };
  }, [cliente?.id, necesitaFacturas, intentoFacturas]);
  const activas = useMemo(() => ordenes.filter(o => !['cerrado', 'cancelado'].includes(o.fase)), [ordenes]);
  const anteriores = useMemo(() => ordenes.filter(o => ['cerrado', 'cancelado'].includes(o.fase)), [ordenes]);
  const crearOrden = () => {
    if (!cliente) return;
    if (onCrearOrden) onCrearOrden({ tipo: 'cliente-existente', cliente: { ...cliente.data, id: cliente.id } });
    else navigate(`/admin/ordenes?nueva=1&clienteId=${encodeURIComponent(cliente.id)}`);
  };
  const seccion = (id: Seccion, titulo: string, contenido: ReactNode) => (
    <section className="border-t border-stone-200">
      <button type="button" aria-expanded={!!abiertas[id]} aria-controls={`ficha-${id}`} onClick={() => activarSeccion(id, !abiertas[id])}
        className="flex min-h-12 w-full items-center justify-between gap-2 py-3 text-left text-sm font-semibold text-slate-700">
        {titulo}<ChevronDown size={17} className={`shrink-0 ${abiertas[id] ? 'rotate-180' : ''}`} />
      </button>
      <motion.div id={`ficha-${id}`} hidden={!abiertas[id]} animate={{opacity:abiertas[id]?1:0}} transition={obtenerTransicionMovimiento(reducido)} aria-hidden={!abiertas[id]} {...(!abiertas[id] ? { inert: '' } : {})} className="min-w-0"><div className="min-h-0 overflow-hidden"><div className="pb-4">{visitadas[id] && contenido}</div></div></motion.div>
    </section>
  );
  const contenidoFacturas = (contenido: ReactNode) => !cliente
    ? <p className="text-sm text-slate-600">Registra al cliente para consultar sus facturas y garantías.</p>
    : estadoFacturas === 'error'
      ? <div role="alert" className="text-sm text-red-700">No se pudieron consultar las facturas y garantías.<button type="button" className="block min-h-11 underline" onClick={() => setIntentoFacturas(n => n + 1)}>Reintentar consulta</button></div>
      : contenido;
  if (cargando) return <p role="status" className="p-4 text-sm text-slate-600">Cargando ficha del cliente…</p>;
  if (error) return <div role="alert" className="p-4 text-sm text-red-700">No se pudo cargar la ficha. Comprueba la conexión y vuelve a intentarlo.<button type="button" onClick={() => setIntento(n => n + 1)} className="block min-h-11 underline">Reintentar</button></div>;
  return <div ref={scroll} className="h-full min-h-0 overflow-y-auto overscroll-contain bg-stone-50 p-4">
    <div hidden={vistaOrden} className="space-y-4">
      {cliente ? <FichaClienteCabecera ubicacionesRecibidas={ubicacionesRecibidas} cliente={{ ...cliente.data, id: cliente.id }} onGuardar={data => {setCliente({ id: cliente.id, data });notificarCliente.current?.(data);}} />
        : <section><h2 className="font-semibold text-slate-900">Cliente no registrado</h2><p className="text-sm text-slate-600">{waId}</p>{puede(userProfile,'clientesCrear') && (creandoCliente ? <CrearClienteDesdeChat waId={waId} ubicacionesRecibidas={ubicacionesRecibidas} paraExpediente={fuenteCrm?.accion==='expediente'} onCancelar={()=>setCreandoCliente(false)} onGuardar={data=>{setCliente({id:data.id,data});setCreandoCliente(false);if(fuenteCrm?.accion==='expediente')activarSeccion('expediente',true);notificarCliente.current?.(data);}}/> : <button type="button" className="min-h-11 text-sm underline" onClick={()=>setCreandoCliente(true)}>{fuenteCrm?.accion==='expediente'?'Crear expediente del cliente':'Crear cliente'}</button>)}</section>}
      {vistaExpediente && <section ref={expedienteDirecto} className="rounded-xl border bg-white p-3"><h2 className="font-semibold">Guardar mensaje en el expediente</h2>{cliente ? <ExpedienteCliente key={cliente.id} clienteId={cliente.id} fuente={fuenteCrm?.accion==='expediente'?fuenteCrm:null} alUsarFuente={alUsarFuente}/> : <p>El mensaje seleccionado se conserva. Crea el expediente del cliente arriba para guardarlo.</p>}<button type="button" className="min-h-11 underline" onClick={()=>{setVistaExpediente(false);alUsarFuente?.();}}>Volver a la ficha del cliente</button></section>}
      {cliente && <button type="button" className="w-full min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white" onClick={crearOrden}>+ Crear orden</button>}
      {conversacionExiste && <AtencionChat waId={waId} />}
      <section aria-label="Órdenes activas" className="rounded-xl border border-stone-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Órdenes activas ({activas.length})</h3></div>
        <OrdenesTab loading={false} activas={activas} cerradas={[]} userProfile={userProfile} onClickOrden={abrirOrden} onIrReprogramaciones={() => navigate('/admin/reprogramaciones')} />
      </section>
      <div>
        {!vistaExpediente && seccion('expediente', 'Notas y archivos', cliente ? <ExpedienteCliente clienteId={cliente.id} fuente={fuenteCrm?.accion === 'expediente' ? fuenteCrm : null} alUsarFuente={alUsarFuente} /> : <p className="text-sm">Registra al cliente para crear su expediente.</p>)}
        {seccion('anteriores', `Órdenes anteriores (${anteriores.length})`, anteriores.length ? <ul className="space-y-2">{anteriores.map(o => <li key={o.id}><ItemOrden orden={o} userProfile={userProfile} onClick={() => abrirOrden(o.id)} /></li>)}</ul> : <p className="text-sm text-slate-600">Sin órdenes anteriores.</p>)}
        {seccion('garantias', 'Garantías', contenidoFacturas(<GarantiasTab loading={estadoFacturas !== 'listo'} facturas={facturas.filter(f => !!f.garantia)} onClickOrden={abrirOrden} />))}
        {seccion('facturas', 'Facturas', contenidoFacturas(<FacturasTab loading={estadoFacturas !== 'listo'} facturas={facturas} onClickFactura={id => navigate(`/admin/facturas?id=${encodeURIComponent(id)}`)} />))}
        {seccion('historial', 'Historial', contenidoFacturas(<HistorialTab ordenParaTimeline={activas[0] ?? ordenes[0] ?? null} facturas={facturas} loadingFacturas={estadoFacturas !== 'listo'} />))}
      </div>
      {controlesChat && <details className="border-t pt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Opciones de conversación</summary>{controlesChat}</details>}
    </div>
    <div hidden={!vistaOrden} className="space-y-3">
      <button type="button" onClick={volver} className="flex min-h-11 items-center gap-2 text-sm font-medium text-emerald-800"><ArrowLeft size={18} /> Volver a la ficha</button>
      <label className="block text-sm font-medium">Orden / equipo<select className="mt-1 w-full rounded-lg border bg-white p-3" value={seleccion} onChange={e => setSeleccion(e.target.value)}><option value="">Selecciona una orden</option>{ordenes.map(o => <option key={o.id} value={o.id}>{o.numero} · {o.equipoTipo} {o.equipoMarca}</option>)}</select></label>
      {!ordenes.length && <p className="text-sm">No hay órdenes para este teléfono.</p>}
      {seleccion && <><button type="button" className="min-h-11 text-sm underline" onClick={() => navigate(`/admin/ordenes/${encodeURIComponent(seleccion)}`)}>Abrir orden completa y editar</button><GestionOrden key={seleccion} ordenId={seleccion} fuente={fuenteCrm?.accion === 'expediente' ? null : fuenteCrm} alUsarFuente={alUsarFuente} /></>}
    </div>
  </div>;
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
    return <p className="text-xs text-gray-500 italic">Cargando órdenes...</p>;
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
          <p className="text-xs text-gray-500 italic">Sin órdenes activas.</p>
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
            <p className="text-xs text-gray-500 italic mt-1">
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
        className="w-full min-h-11 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono font-medium text-gray-900 truncate">
            {/* @safe-numero-doc: fallback display cuando la orden todavía no tiene número asignado; no persiste */}
            {orden.numero || `OS-${orden.id.slice(0, 6)}`}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${faseColor(orden.fase)}`}
          >
            {faseLabel(orden.fase)}
          </span>
        </div>
        <p className="text-[10px] text-gray-500 mt-0.5 truncate">
          {orden.equipoTipo}
          {orden.equipoMarca ? ` · ${orden.equipoMarca}` : ''}
        </p>
        <p className="text-xs text-slate-600 mt-1">Operaria: {orden.operariaNombre || 'Sin asignar'} · Técnico: {orden.tecnicoNombre || 'Sin asignar'}</p>
        <p className="text-xs text-gray-500 mt-0.5">
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
    return <p className="text-xs text-gray-500 italic">Cargando garantías...</p>;
  }
  if (facturas.length === 0) {
    return (
      <p className="text-xs text-gray-500 italic">
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
                  {g.estado === 'vigente' && !vigente ? 'vencida' : g.estado}
                </span>
              </div>
              {(f.equipoTipo || f.equipoMarca) && (
                <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                  {f.equipoTipo ?? ''}
                  {f.equipoMarca ? ` · ${f.equipoMarca}` : ''}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-0.5">
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
    return <p className="text-xs text-gray-500 italic">Cargando facturas...</p>;
  }
  if (facturas.length === 0) {
    return (
      <p className="text-xs text-gray-500 italic">
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
        <p className="text-xs text-gray-500 italic mt-1">
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
      <p className="text-xs text-gray-500 italic">
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
