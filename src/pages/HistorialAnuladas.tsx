import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, FaseOrden } from '../types';
import { parseOrden, formatFecha, formatFechaCorta, crearRegistroAuditoria, faseLabel } from '../utils';
import { puede } from '../utils/permisos';
import { useApp } from '../context/AppContext';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { XCircle, Search, Download, Lock, RotateCcw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

type TipoAnulacion = 'todas' | 'eliminadas' | 'canceladas';

export default function HistorialAnuladas() {
  const { userProfile } = useApp();
  const esAdmin = userProfile?.rol === 'administrador';
  const puedeVer = esAdmin ||
    userProfile?.rol === 'coordinadora' ||
    puede(userProfile, 'ordenesVerEliminadas');

  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<TipoAnulacion>('todas');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [filtroResponsable, setFiltroResponsable] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [detalle, setDetalle] = useState<OrdenServicio | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      setOrdenes(snap.docs.map(d => parseOrden(d.id, d.data() as Record<string, unknown>)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const anuladas = useMemo(() => {
    return ordenes.filter(o => o.eliminada || o.fase === 'cancelado');
  }, [ordenes]);

  const tecnicosDisponibles = useMemo(() =>
    Array.from(new Set(anuladas.map(o => o.tecnicoNombre).filter(Boolean))).sort()
  , [anuladas]);

  const responsablesAnulacion = useMemo(() =>
    Array.from(new Set([
      ...anuladas.map(o => o.eliminadaPor).filter(Boolean),
      ...anuladas.map(o => o.canceladaPor).filter(Boolean),
    ])).sort()
  , [anuladas]);

  const filtradas = useMemo(() => {
    const desde = fechaDesde ? new Date(fechaDesde + 'T00:00:00') : null;
    const hasta = fechaHasta ? new Date(fechaHasta + 'T23:59:59') : null;
    return anuladas.filter(o => {
      if (filtroTipo === 'eliminadas' && !o.eliminada) return false;
      if (filtroTipo === 'canceladas' && (o.eliminada || o.fase !== 'cancelado')) return false;
      const fechaAnulacion = o.eliminada ? o.fechaEliminacion : o.fechaCancelacion;
      if (desde && fechaAnulacion && fechaAnulacion < desde) return false;
      if (hasta && fechaAnulacion && fechaAnulacion > hasta) return false;
      if (filtroTecnico && o.tecnicoNombre !== filtroTecnico) return false;
      if (filtroResponsable) {
        const resp = o.eliminada ? o.eliminadaPor : o.canceladaPor;
        if (resp !== filtroResponsable) return false;
      }
      if (busqueda) {
        const q = busqueda.toLowerCase();
        const motivo = (o.eliminada ? o.motivoEliminacion : o.motivoCancelacion) || '';
        if (
          !o.clienteNombre.toLowerCase().includes(q) &&
          !o.numero?.toLowerCase().includes(q) &&
          !motivo.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    }).sort((a, b) => {
      const fa = (a.eliminada ? a.fechaEliminacion : a.fechaCancelacion) || new Date(0);
      const fb = (b.eliminada ? b.fechaEliminacion : b.fechaCancelacion) || new Date(0);
      return fb.getTime() - fa.getTime();
    });
  }, [anuladas, filtroTipo, fechaDesde, fechaHasta, filtroTecnico, filtroResponsable, busqueda]);

  const totales = useMemo(() => ({
    total: filtradas.length,
    eliminadas: filtradas.filter(o => o.eliminada).length,
    canceladas: filtradas.filter(o => !o.eliminada && o.fase === 'cancelado').length,
  }), [filtradas]);

  const exportarCSV = () => {
    const headers = 'OS,Cliente,Equipo,Técnico,Tipo,Fecha Anulación,Anulada Por,Motivo\n';
    const rows = filtradas.map(o => {
      const tipo = o.eliminada ? 'Eliminada' : 'Cancelada';
      const fecha = o.eliminada ? o.fechaEliminacion : o.fechaCancelacion;
      const fechaStr = fecha ? formatFechaCorta(fecha) : '';
      const anuladaPor = o.eliminada ? o.eliminadaPor : o.canceladaPor;
      const motivo = o.eliminada ? o.motivoEliminacion : o.motivoCancelacion;
      const escape = (s: string | undefined) => `"${(s || '').replace(/"/g, '""')}"`;
      return [
        escape(o.numero),
        escape(o.clienteNombre),
        escape(o.equipoTipo + (o.equipoMarca ? ' ' + o.equipoMarca : '')),
        escape(o.tecnicoNombre || ''),
        tipo,
        fechaStr,
        escape(anuladaPor),
        escape(motivo),
      ].join(',');
    }).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial_anuladas_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  };

  const handleRestaurarEliminada = async (orden: OrdenServicio) => {
    if (!esAdmin) return;
    if (!confirm(`¿Restaurar la orden ${orden.numero}? Volverá al flujo normal.`)) return;
    setProcessing(true);
    try {
      const usuario = userProfile?.nombre || 'Sistema';
      const registro = crearRegistroAuditoria(
        usuario, 'editar', `Restauró orden desde historial de anuladas`,
        'eliminada', 'true', 'false'
      );
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        eliminada: false,
        motivoEliminacion: null,
        eliminadaPor: null,
        eliminadaPorId: null,
        fechaEliminacion: null,
        updatedAt: Timestamp.now(),
        auditoria: arrayUnion(registro),
      });
      toast.success('Orden restaurada');
      setDetalle(null);
    } catch (err) {
      console.error(err);
      toast.error('Error al restaurar');
    } finally {
      setProcessing(false);
    }
  };

  const handleReabrirCancelada = async (orden: OrdenServicio) => {
    if (!esAdmin) return;
    // Buscar la última fase no-cancelada en el historial
    const ultimaNoCancelada = [...orden.historialFases]
      .reverse()
      .find(h => h.fase !== 'cancelado')?.fase as FaseOrden | undefined;
    const nuevaFase: FaseOrden = ultimaNoCancelada || 'nuevo_lead';
    if (!confirm(`¿Reabrir la orden ${orden.numero}? Volverá a la fase "${faseLabel(nuevaFase)}".`)) return;
    setProcessing(true);
    try {
      const usuario = userProfile?.nombre || 'Sistema';
      const registro = crearRegistroAuditoria(
        usuario, 'cambio_fase', `Reabrió orden cancelada desde historial — vuelve a ${faseLabel(nuevaFase)}`,
        'fase', 'Cancelado', faseLabel(nuevaFase)
      );
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        fase: nuevaFase,
        estadoSimple: 'pendiente',
        estado: 'activo',
        motivoCancelacion: null,
        canceladaPor: null,
        canceladaPorId: null,
        fechaCancelacion: null,
        updatedAt: Timestamp.now(),
        auditoria: arrayUnion(registro),
      });
      toast.success('Orden reabierta');
      setDetalle(null);
    } catch (err) {
      console.error(err);
      toast.error('Error al reabrir');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando historial..." />;
  if (!puedeVer) {
    return (
      <div className="p-6 text-center">
        <Lock size={48} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">No tienes permiso para ver el historial de anuladas.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460] flex items-center gap-2">
            <XCircle size={24} /> Historial de órdenes anuladas
          </h1>
          <p className="text-gray-500 text-sm">
            {totales.total} anuladas · {totales.eliminadas} eliminadas · {totales.canceladas} canceladas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-purple-100 text-purple-700">
            Solo admin y coordinadora
          </span>
          <button type="button" onClick={exportarCSV}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as TipoAnulacion)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
            <option value="todas">Todas</option>
            <option value="eliminadas">Solo eliminadas</option>
            <option value="canceladas">Solo canceladas</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Técnico</label>
          <select value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
            <option value="">Todos</option>
            {tecnicosDisponibles.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Anulada por</label>
          <select value={filtroResponsable} onChange={e => setFiltroResponsable(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
            <option value="">Todos</option>
            {responsablesAnulacion.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="md:col-span-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Buscar</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Cliente, número de orden, motivo..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b border-gray-100">
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">OS</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Equipo</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Técnico</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Anulada por</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtradas.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-gray-400">Sin órdenes anuladas para los filtros</td></tr>
              ) : filtradas.map(o => {
                const esEliminada = o.eliminada;
                const motivo = (esEliminada ? o.motivoEliminacion : o.motivoCancelacion) || '';
                const fecha = esEliminada ? o.fechaEliminacion : o.fechaCancelacion;
                const por = esEliminada ? o.eliminadaPor : o.canceladaPor;
                return (
                  <tr key={o.id} onClick={() => setDetalle(o)}
                    className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-3 py-3 font-mono text-xs font-bold text-[#0f3460]">{o.numero}</td>
                    <td className="px-3 py-3 text-gray-700">{o.clienteNombre}</td>
                    <td className="px-3 py-3 text-gray-500 hidden md:table-cell">{o.equipoTipo}{o.equipoMarca ? ` · ${o.equipoMarca}` : ''}</td>
                    <td className="px-3 py-3 text-gray-500 hidden md:table-cell">{o.tecnicoNombre || '—'}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${esEliminada ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {esEliminada ? 'Eliminada' : 'Cancelada'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600">{fecha ? formatFechaCorta(fecha) : '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-600 hidden lg:table-cell">{por || '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-600 max-w-sm truncate" title={motivo}>{motivo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal detalle */}
      <Modal isOpen={!!detalle} onClose={() => setDetalle(null)}
        title={detalle ? `Detalle de ${detalle.numero}` : 'Detalle'} size="lg">
        {detalle && (() => {
          const esEliminada = !!detalle.eliminada;
          const esCancelada = !esEliminada && detalle.fase === 'cancelado';
          const motivo = esEliminada ? detalle.motivoEliminacion : detalle.motivoCancelacion;
          const por = esEliminada ? detalle.eliminadaPor : detalle.canceladaPor;
          const fecha = esEliminada ? detalle.fechaEliminacion : detalle.fechaCancelacion;
          return (
            <div className="space-y-4">
              {/* Banner con motivo */}
              <div className={`border-2 rounded-xl p-4 ${esEliminada ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle size={18} className={esEliminada ? 'text-red-700' : 'text-amber-700'} />
                  <div className="flex-1">
                    <p className={`font-semibold text-sm ${esEliminada ? 'text-red-900' : 'text-amber-900'}`}>
                      {esEliminada ? 'Orden eliminada' : 'Orden cancelada'}
                    </p>
                    <p className={`text-sm mt-1 ${esEliminada ? 'text-red-800' : 'text-amber-800'}`}>
                      <span className="font-medium">Motivo:</span> {motivo || '—'}
                    </p>
                    <p className={`text-xs mt-1 ${esEliminada ? 'text-red-700' : 'text-amber-700'}`}>
                      Por {por || '—'}{fecha ? ` · ${formatFecha(fecha)}` : ''}
                    </p>
                  </div>
                </div>
              </div>

              {/* Datos orden */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-500">Cliente</p><p className="font-medium">{detalle.clienteNombre}</p></div>
                <div><p className="text-xs text-gray-500">Equipo</p><p>{detalle.equipoTipo}{detalle.equipoMarca ? ` · ${detalle.equipoMarca}` : ''}</p></div>
                <div><p className="text-xs text-gray-500">Técnico</p><p>{detalle.tecnicoNombre || 'Sin asignar'}</p></div>
                <div><p className="text-xs text-gray-500">Fase antes de anular</p><p>{faseLabel(detalle.fase)}</p></div>
                {detalle.precioFinal !== undefined && (
                  <div><p className="text-xs text-gray-500">Precio final</p><p className="font-semibold">RD$ {detalle.precioFinal.toLocaleString('es-DO')}</p></div>
                )}
                {detalle.fechaCita && (
                  <div><p className="text-xs text-gray-500">Fecha cita</p><p>{formatFecha(detalle.fechaCita)}</p></div>
                )}
              </div>

              {/* Descripción falla */}
              {detalle.descripcionFalla && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Falla reportada</p>
                  <p className="text-sm">{detalle.descripcionFalla}</p>
                </div>
              )}

              {/* Auditoría */}
              {detalle.auditoria && detalle.auditoria.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Auditoría ({detalle.auditoria.length})</p>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {detalle.auditoria.slice().reverse().map((reg, i) => (
                      <div key={i} className="text-xs bg-gray-50 rounded-lg p-2 border border-gray-100">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-gray-700">{reg.usuario}</span>
                          <span className="text-gray-400">{formatFecha(reg.fecha)}</span>
                        </div>
                        <p className="text-gray-600 mt-0.5">{reg.detalle}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Acciones admin */}
              {esAdmin && (
                <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                  {esEliminada && (
                    <button type="button" onClick={() => handleRestaurarEliminada(detalle)} disabled={processing}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                      <RotateCcw size={14} /> Restaurar orden
                    </button>
                  )}
                  {esCancelada && (
                    <button type="button" onClick={() => handleReabrirCancelada(detalle)} disabled={processing}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                      <RotateCcw size={14} /> Reabrir orden
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
