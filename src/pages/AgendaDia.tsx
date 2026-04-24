import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import { OrdenServicio, Personal } from '../types';
import {
  faseLabel, faseBgColor, formatMoneda, formatHora, parseOrden,
  getTecnicoColor, estadoSimpleLabel,
} from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import { useApp } from '../context/AppContext';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ClipboardList, Calendar, CheckCircle, Clock, DollarSign,
  ChevronDown, ChevronUp, User, Wrench, UserCheck,
} from 'lucide-react';

export default function AgendaDia() {
  const navigate = useNavigate();
  const { userProfile } = useApp();
  const rol = userProfile?.rol;
  const esOperaria = rol === 'operaria';
  const esTecnico = rol === 'tecnico';
  const esAdminOCoord = rol === 'administrador' || rol === 'coordinadora';

  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [fechaStr, setFechaStr] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [filtroOperaria, setFiltroOperaria] = useState('');
  const [soloMiGrupo, setSoloMiGrupo] = useState(true);
  const [mostrarSinCitas, setMostrarSinCitas] = useState(false);

  const fechaSeleccionada = useMemo(() => {
    const d = new Date(fechaStr + 'T00:00:00');
    return isNaN(d.getTime()) ? new Date() : d;
  }, [fechaStr]);

  useEffect(() => {
    let loadedCount = 0;
    const total = 2;
    const checkLoaded = () => { loadedCount++; if (loadedCount >= total) setLoading(false); };

    const unsubOrd = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      setOrdenes(snap.docs.map(d => parseOrden(d.id, d.data()) as OrdenServicio));
      checkLoaded();
    });
    const unsubPers = onSnapshot(collection(db, 'personal'), (snap) => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
      checkLoaded();
    });
    return () => { unsubOrd(); unsubPers(); };
  }, []);

  const tecnicos = useMemo(
    () => personal.filter(p => p.rol === 'tecnico' && p.activo),
    [personal],
  );
  const operarias = useMemo(
    () => personal.filter(p => p.rol === 'operaria' && p.activo),
    [personal],
  );

  // Técnicos visibles según rol + filtros
  const tecnicosVisibles = useMemo(() => {
    let lista = tecnicos;
    if (esTecnico && userProfile) {
      lista = lista.filter(t => t.id === userProfile.id);
    } else if (esOperaria && soloMiGrupo && userProfile) {
      lista = lista.filter(t => t.operariaId === userProfile.id);
    } else if (esAdminOCoord && filtroOperaria) {
      lista = lista.filter(t => t.operariaId === filtroOperaria);
    }
    if (filtroTecnico) {
      lista = lista.filter(t => t.id === filtroTecnico);
    }
    return lista;
  }, [tecnicos, esTecnico, esOperaria, esAdminOCoord, soloMiGrupo, userProfile, filtroTecnico, filtroOperaria]);

  // Órdenes del día (sin eliminar)
  const ordenesDelDia = useMemo(() => {
    return ordenes.filter(o =>
      !o.eliminada &&
      o.fechaCita && isSameDay(o.fechaCita, fechaSeleccionada),
    );
  }, [ordenes, fechaSeleccionada]);

  const tecnicosConOrdenes = useMemo(() => {
    const idsConOrden = new Set(ordenesDelDia.map(o => o.tecnicoId).filter(Boolean) as string[]);
    return tecnicosVisibles.filter(t => idsConOrden.has(t.id));
  }, [tecnicosVisibles, ordenesDelDia]);

  const tecnicosSinOrdenes = useMemo(() => {
    const idsConOrden = new Set(tecnicosConOrdenes.map(t => t.id));
    return tecnicosVisibles.filter(t => !idsConOrden.has(t.id));
  }, [tecnicosVisibles, tecnicosConOrdenes]);

  const ordenesPorTecnico = useMemo(() => {
    const map: Record<string, OrdenServicio[]> = {};
    for (const o of ordenesDelDia) {
      const key = o.tecnicoId || '__sin_asignar__';
      if (!map[key]) map[key] = [];
      map[key].push(o);
    }
    Object.values(map).forEach(lista => lista.sort((a, b) => {
      const at = a.fechaCita?.getTime() || 0;
      const bt = b.fechaCita?.getTime() || 0;
      return at - bt;
    }));
    return map;
  }, [ordenesDelDia]);

  // Órdenes visibles (aplicando los mismos filtros que tecnicosVisibles)
  const ordenesVisibles = useMemo(() => {
    const idsVisibles = new Set(tecnicosVisibles.map(t => t.id));
    return ordenesDelDia.filter(o => !o.tecnicoId || idsVisibles.has(o.tecnicoId));
  }, [ordenesDelDia, tecnicosVisibles]);

  const kpis = useMemo(() => {
    const total = ordenesVisibles.length;
    const completadas = ordenesVisibles.filter(o => ['trabajo_realizado', 'cerrado'].includes(o.fase)).length;
    const enProgreso = ordenesVisibles.filter(o =>
      ['en_gestion', 'en_diagnostico', 'en_cotizacion', 'aprobado', 'agendado'].includes(o.fase),
    ).length;
    const ingresos = ordenesVisibles
      .filter(o => o.fase === 'cerrado')
      .reduce((sum, o) => sum + (o.precioFinal || o.precioAprobado || 0), 0);
    return { total, completadas, enProgreso, ingresos };
  }, [ordenesVisibles]);

  const diaLabel = useMemo(
    () => format(fechaSeleccionada, "EEEE dd 'de' MMMM yyyy", { locale: es }),
    [fechaSeleccionada],
  );

  if (loading) return <LoadingSpinner fullPage text="Cargando agenda..." />;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460]">Agenda del Día</h1>
          <p className="text-gray-500 text-sm capitalize">{diaLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={fechaStr}
            onChange={e => setFechaStr(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
          />
          {!esTecnico && (
            <select
              value={filtroTecnico}
              onChange={e => setFiltroTecnico(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            >
              <option value="">Todos los técnicos</option>
              {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          )}
          {esAdminOCoord && (
            <select
              value={filtroOperaria}
              onChange={e => setFiltroOperaria(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            >
              <option value="">Todas las operarias</option>
              {operarias.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          )}
          {esOperaria && (
            <button
              type="button"
              onClick={() => setSoloMiGrupo(v => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                soloMiGrupo
                  ? 'bg-[#0f3460] text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <UserCheck size={13} /> {soloMiGrupo ? 'Solo mi grupo' : 'Todas las operarias'}
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total del día" value={String(kpis.total)} icon={<ClipboardList size={18} />} color="bg-blue-50 text-blue-700" />
        <KpiCard label="Completadas" value={String(kpis.completadas)} icon={<CheckCircle size={18} />} color="bg-green-50 text-green-700" />
        <KpiCard label="En progreso" value={String(kpis.enProgreso)} icon={<Clock size={18} />} color="bg-orange-50 text-orange-700" />
        <KpiCard label="Ingresos del día" value={formatMoneda(kpis.ingresos)} icon={<DollarSign size={18} />} color="bg-emerald-50 text-emerald-700" />
      </div>

      {/* Grid de técnicos */}
      {ordenesVisibles.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
          <Calendar size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin citas programadas para este día.</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-3">
          {tecnicosConOrdenes.map(t => (
            <TecnicoColumn
              key={t.id}
              tecnico={t}
              ordenes={ordenesPorTecnico[t.id] || []}
              onSelectOrden={(o) => navigate(`/admin/ordenes/${o.id}`)}
            />
          ))}
          {ordenesPorTecnico['__sin_asignar__'] && ordenesPorTecnico['__sin_asignar__'].length > 0 && !esTecnico && (
            <TecnicoColumn
              tecnico={null}
              ordenes={ordenesPorTecnico['__sin_asignar__']}
              onSelectOrden={(o) => navigate(`/admin/ordenes/${o.id}`)}
            />
          )}
        </div>
      )}

      {/* Sección colapsable: técnicos sin citas */}
      {tecnicosSinOrdenes.length > 0 && !esTecnico && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <button
            type="button"
            onClick={() => setMostrarSinCitas(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <User size={14} /> Sin citas hoy ({tecnicosSinOrdenes.length})
            </span>
            {mostrarSinCitas ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {mostrarSinCitas && (
            <div className="px-4 pb-3 pt-1 flex flex-wrap gap-2">
              {tecnicosSinOrdenes.map(t => (
                <div
                  key={t.id}
                  className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: t.color || getTecnicoColor(t.nombre) }}
                  />
                  <span>{t.nombre}</span>
                  {t.zona && <span className="text-gray-400">· {t.zona}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon, color }: {
  label: string; value: string; icon: React.ReactNode; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">{label}</span>
      </div>
      <p className="text-xl font-bold text-[#0f3460] truncate">{value}</p>
    </div>
  );
}

function TecnicoColumn({ tecnico, ordenes, onSelectOrden }: {
  tecnico: Personal | null;
  ordenes: OrdenServicio[];
  onSelectOrden: (o: OrdenServicio) => void;
}) {
  const color = tecnico?.color || getTecnicoColor(tecnico?.nombre || 'Sin asignar');
  const inicial = (tecnico?.nombre || 'Sin asignar').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const conteos = useMemo(() => {
    let pendiente = 0, enProceso = 0, completado = 0, cancelado = 0, cerradas = 0;
    let totalFacturado = 0;
    for (const o of ordenes) {
      if (o.estadoSimple === 'pendiente') pendiente++;
      else if (o.estadoSimple === 'en_proceso') enProceso++;
      else if (o.estadoSimple === 'completado') completado++;
      else if (o.estadoSimple === 'cancelado') cancelado++;
      if (o.fase === 'cerrado') {
        cerradas++;
        totalFacturado += (o.precioFinal || o.precioAprobado || 0);
      }
    }
    return { pendiente, enProceso, completado, cancelado, cerradas, totalFacturado };
  }, [ordenes]);

  const total = ordenes.length;
  const progreso = total > 0 ? Math.round((conteos.completado / total) * 100) : 0;

  return (
    <div className="flex-shrink-0 w-80 bg-gray-50 rounded-xl border border-gray-200 flex flex-col max-h-[70vh]">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 bg-white rounded-t-xl">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: color }}
          >
            {inicial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {tecnico?.nombre || 'Sin asignar'}
            </p>
            {tecnico?.zona && (
              <p className="text-[11px] text-gray-500 truncate">{tecnico.zona}</p>
            )}
          </div>
        </div>
        {/* Barra progreso */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-gray-600">
            <span>{conteos.completado} de {total} completadas</span>
            <span className="font-semibold">{progreso}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
        {/* Chips */}
        <div className="flex flex-wrap gap-1 mt-2">
          {conteos.pendiente > 0 && (
            <Chip label={estadoSimpleLabel('pendiente')} count={conteos.pendiente} className="bg-blue-100 text-blue-700" />
          )}
          {conteos.enProceso > 0 && (
            <Chip label={estadoSimpleLabel('en_proceso')} count={conteos.enProceso} className="bg-orange-100 text-orange-700" />
          )}
          {conteos.completado > 0 && (
            <Chip label={estadoSimpleLabel('completado')} count={conteos.completado} className="bg-green-100 text-green-700" />
          )}
          {conteos.cancelado > 0 && (
            <Chip label={estadoSimpleLabel('cancelado')} count={conteos.cancelado} className="bg-gray-200 text-gray-600" />
          )}
        </div>
      </div>

      {/* Lista de órdenes */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {ordenes.length === 0 ? (
          <p className="text-center text-[11px] text-gray-400 py-6">Sin órdenes</p>
        ) : ordenes.map(o => {
          const borderColor = faseBgColor(o.fase);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelectOrden(o)}
              className="w-full text-left bg-white rounded-lg border border-gray-200 border-l-4 shadow-sm hover:shadow-md transition-shadow p-2.5"
              style={{ borderLeftColor: borderColor }}
            >
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-[11px] font-bold text-[#0f3460]">{o.numero || '#--'}</span>
                  {o.cierreServicio?.piezasUsadas &&
                    o.cierreServicio.piezasUsadas.length > 0 &&
                    !o.cierreServicio.piezasValidadasPorAdmin && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-medium">
                      ⚠️ Piezas por validar
                    </span>
                  )}
                </div>
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: borderColor }}
                >
                  {faseLabel(o.fase)}
                </span>
              </div>
              <p className="text-xs font-semibold text-gray-900 truncate">{o.clienteNombre}</p>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500 flex-wrap">
                {o.fechaCita && (
                  <span className="inline-flex items-center gap-0.5">
                    <Clock size={10} /> {formatHora(o.fechaCita)}
                  </span>
                )}
                <span className="inline-flex items-center gap-0.5 truncate">
                  <Wrench size={10} /> {o.equipoTipo}{o.equipoMarca ? ` · ${o.equipoMarca}` : ''}
                </span>
              </div>
              {o.fase === 'cerrado' && (o.precioFinal || o.precioAprobado) && (
                <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                  {formatMoneda(o.precioFinal || o.precioAprobado || 0)}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      {conteos.cerradas > 0 && (
        <div className="border-t border-gray-200 bg-white px-3 py-2 rounded-b-xl">
          <p className="text-[11px] text-gray-600">
            Facturado hoy: <span className="font-semibold text-emerald-700">{formatMoneda(conteos.totalFacturado)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function Chip({ label, count, className }: { label: string; count: number; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${className}`}>
      {label} · {count}
    </span>
  );
}
