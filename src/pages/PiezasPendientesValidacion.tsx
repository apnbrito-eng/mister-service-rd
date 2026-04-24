import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  Timestamp,
  arrayUnion,
} from 'firebase/firestore';
import { Package, Filter, Check, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../firebase/config';
import { useApp } from '../context/AppContext';
import { crearRegistroAuditoria, formatFecha, formatMoneda, parseOrden } from '../utils';
import type { OrdenServicio, CondicionPieza, OrigenPieza } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import ModalEditarPiezasOrden from '../components/cierre/ModalEditarPiezasOrden';

function iconoCondicion(c: CondicionPieza): string {
  return c === 'nueva' ? '✨' : '♻️';
}

function iconoOrigen(o: OrigenPieza): string {
  return o === 'inventario_taller' ? '🏭' : o === 'inventario_vehiculo' ? '🚗' : '🛒';
}

function etiquetaOrigen(o: OrigenPieza): string {
  return o === 'inventario_taller' ? 'Taller' : o === 'inventario_vehiculo' ? 'Vehículo' : 'Externa';
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate();
  }
  return null;
}

export default function PiezasPendientesValidacion() {
  const { userProfile, currentUser } = useApp();
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [ordenEditando, setOrdenEditando] = useState<OrdenServicio | null>(null);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);

  // Filtros
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [filtroTecnico, setFiltroTecnico] = useState<string>('');
  const [filtroDesde, setFiltroDesde] = useState<string>('');
  const [filtroHasta, setFiltroHasta] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<'pendientes' | 'todas'>('pendientes');

  const esAdmin = userProfile?.rol === 'administrador';

  useEffect(() => {
    if (!esAdmin) {
      setLoading(false);
      return;
    }
    // Query base: todas las órdenes con algo en cierreServicio.
    // Filtramos client-side para evitar indexes compuestos y manejar
    // el caso de trabajo_realizado (que también ya tiene cierreServicio).
    // Nota: `fase in ['trabajo_realizado', 'cerrado']` no soportado con
    // orderBy de otro campo, así que hacemos query amplia y filtramos.
    const q = query(
      collection(db, 'ordenes_servicio'),
      where('fase', 'in', ['trabajo_realizado', 'cerrado']),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        const lista: OrdenServicio[] = [];
        snap.forEach(d => {
          const parsed = parseOrden(d.id, d.data() as Record<string, unknown>);
          const cs = parsed.cierreServicio;
          if (!cs) return;
          if (!Array.isArray(cs.piezasUsadas) || cs.piezasUsadas.length === 0) return;
          if (parsed.eliminada) return;
          lista.push(parsed);
        });
        setOrdenes(lista);
        setLoading(false);
      },
      err => {
        console.error('[piezas-pendientes] snapshot error:', err);
        toast.error('No se pudieron cargar las órdenes con piezas pendientes.');
        setLoading(false);
      },
    );
    return () => unsub();
  }, [esAdmin]);

  // Lista de técnicos únicos (para el dropdown de filtro)
  const tecnicosDisponibles = useMemo(() => {
    const set = new Map<string, string>();
    for (const o of ordenes) {
      const tid = o.tecnicoId || o.cierreServicio?.tecnicoId;
      const tn = o.tecnicoNombre || o.cierreServicio?.tecnicoNombre;
      if (tid && tn) set.set(tid, tn);
    }
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [ordenes]);

  const ordenesFiltradas = useMemo(() => {
    const desde = filtroDesde ? new Date(`${filtroDesde}T00:00:00`) : null;
    const hasta = filtroHasta ? new Date(`${filtroHasta}T23:59:59`) : null;
    return ordenes.filter(o => {
      const cs = o.cierreServicio!;
      if (filtroEstado === 'pendientes' && cs.piezasValidadasPorAdmin === true) return false;
      if (filtroTecnico) {
        const tid = o.tecnicoId || cs.tecnicoId;
        if (tid !== filtroTecnico) return false;
      }
      if (desde || hasta) {
        const fc = toDate(cs.fechaCierre);
        if (!fc) return false;
        if (desde && fc < desde) return false;
        if (hasta && fc > hasta) return false;
      }
      return true;
    }).sort((a, b) => {
      const fa = toDate(a.cierreServicio?.fechaCierre)?.getTime() || 0;
      const fb = toDate(b.cierreServicio?.fechaCierre)?.getTime() || 0;
      return fb - fa;
    });
  }, [ordenes, filtroTecnico, filtroDesde, filtroHasta, filtroEstado]);

  const pendientesCount = ordenes.filter(o => !o.cierreServicio?.piezasValidadasPorAdmin).length;

  const handleAprobarTodas = async (orden: OrdenServicio) => {
    if (!currentUser || !userProfile) return;
    const cs = orden.cierreServicio;
    if (!cs || !cs.piezasUsadas) return;

    const cantidad = cs.piezasUsadas.length;
    if (!window.confirm(`¿Aprobar las ${cantidad} pieza${cantidad === 1 ? '' : 's'} registrada${cantidad === 1 ? '' : 's'} en ${orden.numero}?`)) {
      return;
    }

    setAprobandoId(orden.id);
    try {
      const now = Timestamp.now();
      const adminUid = currentUser.uid;
      const adminNombre = userProfile.nombre || userProfile.email || 'Admin';

      const piezasAprobadas = cs.piezasUsadas.map(p => ({
        ...p,
        // Normalizar Date → Timestamp antes de guardar (Firestore acepta ambos,
        // pero Date dentro de arrays se serializa de forma inconsistente entre SDKs).
        registradaEn: p.registradaEn instanceof Date ? Timestamp.fromDate(p.registradaEn) : p.registradaEn,
        ...(p.aprobadaEn ? { aprobadaEn: p.aprobadaEn instanceof Date ? Timestamp.fromDate(p.aprobadaEn) : p.aprobadaEn } : {}),
        ...(p.editadaEn ? { editadaEn: p.editadaEn instanceof Date ? Timestamp.fromDate(p.editadaEn) : p.editadaEn } : {}),
        aprobadaPorAdmin: true,
        aprobadaEn: now,
        aprobadaPor: adminUid,
      }));

      // Strip undefined de cada pieza antes de escribir (convención CLAUDE.md)
      const piezasLimpias = piezasAprobadas.map(p => {
        return Object.fromEntries(
          Object.entries(p).filter(([, v]) => v !== undefined),
        );
      });

      const registro = crearRegistroAuditoria(
        adminNombre,
        'aprobar_piezas',
        `Aprobó ${cantidad} pieza${cantidad === 1 ? '' : 's'} registrada${cantidad === 1 ? '' : 's'} por ${cs.tecnicoNombre || 'el técnico'}.`,
      );

      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        'cierreServicio.piezasUsadas': piezasLimpias,
        'cierreServicio.piezasValidadasPorAdmin': true,
        'cierreServicio.piezasValidadasEn': now,
        'cierreServicio.piezasValidadasPor': adminUid,
        auditoria: arrayUnion(registro),
        updatedAt: now,
      });

      toast.success(`${cantidad} pieza${cantidad === 1 ? '' : 's'} aprobada${cantidad === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('[piezas-pendientes] aprobar error:', err);
      toast.error('No se pudieron aprobar las piezas. Reintenta.');
    } finally {
      setAprobandoId(null);
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando piezas pendientes..." />;

  if (!esAdmin) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium">
            Solo el administrador puede validar piezas registradas por los técnicos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
          <Package size={20} className="text-[#0f3460]" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-[#0f3460]">Piezas pendientes de validar</h1>
          <p className="text-gray-500 text-sm">
            Revisa y aprueba las piezas que los técnicos registraron al cerrar las órdenes.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1 rounded-full text-sm font-semibold">
          {pendientesCount} {pendientesCount === 1 ? 'orden pendiente' : 'órdenes pendientes'}
        </span>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <button
          type="button"
          onClick={() => setFiltrosAbiertos(v => !v)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-gray-700"
        >
          <span className="inline-flex items-center gap-2">
            <Filter size={14} /> Filtros
          </span>
          {filtrosAbiertos ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {filtrosAbiertos && (
          <div className="border-t border-gray-100 p-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Técnico</label>
              <select
                value={filtroTecnico}
                onChange={e => setFiltroTecnico(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#0f3460]"
              >
                <option value="">Todos</option>
                {tecnicosDisponibles.map(([id, nombre]) => (
                  <option key={id} value={id}>{nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
              <input
                type="date"
                value={filtroDesde}
                onChange={e => setFiltroDesde(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#0f3460]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
              <input
                type="date"
                value={filtroHasta}
                onChange={e => setFiltroHasta(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#0f3460]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
              <select
                value={filtroEstado}
                onChange={e => setFiltroEstado(e.target.value as 'pendientes' | 'todas')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#0f3460]"
              >
                <option value="pendientes">Solo pendientes</option>
                <option value="todas">Todas</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Lista */}
      {ordenesFiltradas.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Package size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">
            {pendientesCount === 0
              ? 'No hay órdenes con piezas pendientes. Cuando un técnico cierre una orden con piezas, aparecerán aquí.'
              : 'Ninguna orden coincide con los filtros.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordenesFiltradas.map(orden => {
            const cs = orden.cierreServicio!;
            const piezas = cs.piezasUsadas || [];
            const validada = cs.piezasValidadasPorAdmin === true;
            const costoTotal = piezas.reduce((acc, p) => acc + (Number(p.costoTotal) || 0), 0);
            const fechaCierre = toDate(cs.fechaCierre);

            return (
              <div
                key={orden.id}
                className={`bg-white rounded-2xl shadow-sm border p-4 ${
                  validada ? 'border-green-100' : 'border-gray-100'
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-[#0f3460]">
                        🔧 {orden.numero || '#--'}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{orden.clienteNombre}</span>
                      {fechaCierre && (
                        <span className="text-xs text-gray-500">· {formatFecha(fechaCierre)}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Técnico: <span className="font-medium">{cs.tecnicoNombre || 'Sin asignar'}</span>
                      {' · '}
                      {piezas.length} pieza{piezas.length === 1 ? '' : 's'} · Costo total: {formatMoneda(costoTotal)}
                      {validada ? (
                        <span className="ml-2 inline-flex items-center gap-1 text-green-700">
                          <Check size={12} /> Validadas
                        </span>
                      ) : (
                        <span className="ml-2 inline-flex items-center gap-1 text-orange-600">
                          Pendientes de validar
                        </span>
                      )}
                    </p>
                  </div>
                  {!validada && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOrdenEditando(orden)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      >
                        <Pencil size={12} /> Editar piezas
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAprobarTodas(orden)}
                        disabled={aprobandoId === orden.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 hover:bg-green-600 text-white disabled:opacity-50"
                      >
                        <Check size={12} /> {aprobandoId === orden.id ? 'Aprobando...' : 'Aprobar todas'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Piezas inline (compacta) */}
                <div className="mt-3 space-y-1.5">
                  {piezas.map(p => (
                    <div
                      key={p.id}
                      className="text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap"
                    >
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-medium text-gray-900 truncate">📦 {p.nombre}</span>
                        {p.marca && <span className="text-gray-500">· {p.marca}</span>}
                        <span className="text-gray-500">{iconoCondicion(p.condicion)} {p.condicion === 'nueva' ? 'Nueva' : 'Usada'}</span>
                        <span className="text-gray-500">{iconoOrigen(p.origen)} {etiquetaOrigen(p.origen)}</span>
                      </div>
                      <span className="text-gray-700 font-medium">
                        {p.cantidad} × {formatMoneda(p.costoUnitario)} = {formatMoneda(p.costoTotal)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ModalEditarPiezasOrden
        orden={ordenEditando}
        onClose={() => setOrdenEditando(null)}
      />
    </div>
  );
}
