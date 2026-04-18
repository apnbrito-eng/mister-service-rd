import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { ComisionRegistro, Personal } from '../types';
import { formatMoneda, formatFecha } from '../utils';
import { calcularQuincenaActual, listarUltimasQuincenas } from '../utils/comisiones';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import LoadingSpinner from '../components/LoadingSpinner';
import { DollarSign, Lock, ChevronDown, ChevronRight } from 'lucide-react';

export default function Comisiones() {
  const { userProfile } = useApp();
  const puedeVer = puede(userProfile, 'configuracionVer') ||
    userProfile?.rol === 'administrador' ||
    userProfile?.rol === 'coordinadora';

  const [loading, setLoading] = useState(true);
  const [comisiones, setComisiones] = useState<ComisionRegistro[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [filtroQuincena, setFiltroQuincena] = useState<string>(calcularQuincenaActual(new Date()));
  const [filtroTecnico, setFiltroTecnico] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<'pendiente' | 'liquidada' | 'todas'>('pendiente');
  const [vista, setVista] = useState<'detallado' | 'por_tecnico'>('detallado');
  const [tecnicosExpandidos, setTecnicosExpandidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'comisiones'), orderBy('fechaCobro', 'desc')),
      (snap) => {
        setComisiones(snap.docs.map(d => {
          const raw = d.data();
          return {
            id: d.id,
            tecnicoId: raw.tecnicoId || '',
            tecnicoNombre: raw.tecnicoNombre || '',
            ordenId: raw.ordenId || '',
            ordenNumero: raw.ordenNumero || '',
            clienteNombre: raw.clienteNombre || '',
            fechaCobro: raw.fechaCobro?.toDate?.() || new Date(),
            precioFinal: raw.precioFinal || 0,
            costoPiezas: raw.costoPiezas || 0,
            basePendienteComision: raw.basePendienteComision || 0,
            comisionPorcentaje: raw.comisionPorcentaje || 0,
            comisionMonto: raw.comisionMonto || 0,
            estadoLiquidacion: raw.estadoLiquidacion || 'pendiente',
            quincenaAsignada: raw.quincenaAsignada,
            liquidadaEn: raw.liquidadaEn?.toDate?.() || undefined,
            liquidadaPor: raw.liquidadaPor,
            notas: raw.notas,
            createdAt: raw.createdAt?.toDate?.() || new Date(),
          } as ComisionRegistro;
        }));
        setLoading(false);
      }
    );
    getDocs(collection(db, 'personal')).then(snap => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
    });
    return () => unsub();
  }, []);

  const quincenasDisponibles = useMemo(() => listarUltimasQuincenas(12), []);
  const tecnicos = personal.filter(p => p.rol === 'tecnico' && p.activo);

  const comisionesFiltradas = useMemo(() => {
    return comisiones.filter(c => {
      if (filtroQuincena && c.quincenaAsignada !== filtroQuincena) return false;
      if (filtroTecnico && c.tecnicoId !== filtroTecnico) return false;
      if (filtroEstado !== 'todas' && c.estadoLiquidacion !== filtroEstado) return false;
      return true;
    });
  }, [comisiones, filtroQuincena, filtroTecnico, filtroEstado]);

  const totales = useMemo(() => {
    return comisionesFiltradas.reduce((acc, c) => ({
      base: acc.base + c.basePendienteComision,
      piezas: acc.piezas + c.costoPiezas,
      comision: acc.comision + c.comisionMonto,
    }), { base: 0, piezas: 0, comision: 0 });
  }, [comisionesFiltradas]);

  const porTecnico = useMemo(() => {
    const grupos: Record<string, { tecnicoId: string; tecnicoNombre: string; comisiones: ComisionRegistro[]; total: number }> = {};
    comisionesFiltradas.forEach(c => {
      if (!grupos[c.tecnicoId]) {
        grupos[c.tecnicoId] = { tecnicoId: c.tecnicoId, tecnicoNombre: c.tecnicoNombre, comisiones: [], total: 0 };
      }
      grupos[c.tecnicoId].comisiones.push(c);
      grupos[c.tecnicoId].total += c.comisionMonto;
    });
    return Object.values(grupos).sort((a, b) => b.total - a.total);
  }, [comisionesFiltradas]);

  const toggleTecnico = (id: string) => {
    setTecnicosExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando comisiones..." />;
  if (!puedeVer) {
    return (
      <div className="p-6 text-center">
        <Lock size={48} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">No tienes permiso para ver comisiones.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460] flex items-center gap-2">
            <DollarSign size={24} /> Comisiones
          </h1>
          <p className="text-gray-500 text-sm">Quincena {filtroQuincena} · {comisionesFiltradas.length} comisiones</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Quincena</label>
          <select value={filtroQuincena} onChange={e => setFiltroQuincena(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
            {quincenasDisponibles.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Técnico</label>
          <select value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
            <option value="">Todos los técnicos</option>
            {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as 'pendiente' | 'liquidada' | 'todas')}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
            <option value="pendiente">Pendientes</option>
            <option value="liquidada">Liquidadas</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Vista</label>
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button type="button" onClick={() => setVista('detallado')}
              className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${vista === 'detallado' ? 'bg-white shadow-sm text-[#0f3460]' : 'text-gray-600'}`}>
              Detallado
            </button>
            <button type="button" onClick={() => setVista('por_tecnico')}
              className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${vista === 'por_tecnico' ? 'bg-white shadow-sm text-[#0f3460]' : 'text-gray-600'}`}>
              Por técnico
            </button>
          </div>
        </div>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Total base (sin piezas)</p>
          <p className="text-xl font-bold text-[#0f3460] mt-1">{formatMoneda(totales.base)}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Total piezas</p>
          <p className="text-xl font-bold text-[#0f3460] mt-1">{formatMoneda(totales.piezas)}</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl shadow-sm border border-emerald-200 p-4">
          <p className="text-xs font-medium text-emerald-700 uppercase">Total comisiones</p>
          <p className="text-xl font-bold text-emerald-900 mt-1">{formatMoneda(totales.comision)}</p>
        </div>
      </div>

      {/* Vista detallada */}
      {vista === 'detallado' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Fecha cobro</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">OS-#</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Cliente</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Técnico</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Precio final</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Piezas</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Base</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase">%</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Comisión</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {comisionesFiltradas.length === 0 ? (
                  <tr><td colSpan={10} className="py-12 text-center text-gray-400">Sin comisiones para los filtros seleccionados</td></tr>
                ) : comisionesFiltradas.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 text-xs text-gray-600">{formatFecha(c.fechaCobro)}</td>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-[#0f3460]">{c.ordenNumero}</td>
                    <td className="px-3 py-3 text-gray-700 hidden md:table-cell">{c.clienteNombre}</td>
                    <td className="px-3 py-3 text-gray-700">{c.tecnicoNombre}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{formatMoneda(c.precioFinal)}</td>
                    <td className="px-3 py-3 text-right text-gray-500 hidden md:table-cell">{formatMoneda(c.costoPiezas)}</td>
                    <td className="px-3 py-3 text-right text-gray-700 hidden md:table-cell">{formatMoneda(c.basePendienteComision)}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{c.comisionPorcentaje}%</td>
                    <td className="px-3 py-3 text-right font-semibold text-emerald-700">{formatMoneda(c.comisionMonto)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.estadoLiquidacion === 'liquidada' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {c.estadoLiquidacion === 'liquidada' ? 'Liquidada' : 'Pendiente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vista por técnico */}
      {vista === 'por_tecnico' && (
        <div className="space-y-3">
          {porTecnico.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
              Sin comisiones para los filtros seleccionados
            </div>
          ) : porTecnico.map(g => {
            const expandido = tecnicosExpandidos.has(g.tecnicoId);
            const tec = personal.find(p => p.id === g.tecnicoId);
            return (
              <div key={g.tecnicoId} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <button type="button" onClick={() => toggleTecnico(g.tecnicoId)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    {expandido ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: tec?.color || '#0f3460' }}>
                      {g.tecnicoNombre.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900">{g.tecnicoNombre}</p>
                      <p className="text-xs text-gray-500">{g.comisiones.length} orden(es)</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-emerald-700">{formatMoneda(g.total)}</p>
                </button>
                {expandido && (
                  <div className="border-t border-gray-100 bg-gray-50/50">
                    {g.comisiones.map(c => (
                      <div key={c.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-100 last:border-0 text-xs">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="font-mono font-semibold text-[#0f3460]">{c.ordenNumero}</span>
                          <span className="text-gray-700 truncate">{c.clienteNombre}</span>
                          <span className="text-gray-400">{formatFecha(c.fechaCobro)}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-gray-500">{formatMoneda(c.basePendienteComision)} × {c.comisionPorcentaje}%</span>
                          <span className="font-semibold text-emerald-700">{formatMoneda(c.comisionMonto)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
