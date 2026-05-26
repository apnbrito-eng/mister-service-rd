import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, Personal } from '../types';
import { getTecnicoColor, formatHora, faseLabel } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import { ChevronLeft, ChevronRight, Calendar as CalIcon } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, addWeeks, subWeeks } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

type Vista = 'mes' | 'semana' | 'dia';

/**
 * SPRINT-AGENDA-2 (2026-05-25): el calendario ahora muestra 3 tipos de
 * eventos: órdenes confirmadas (color técnico), citas por confirmar
 * (color ámbar) y mantenimientos programados (color ámbar punteado).
 * Antes solo leía `ordenes_servicio` → lo solicitado quedaba invisible.
 * Solo lectura: no muta los datos. Sigue el patrón P-015 (sort/filter
 * client-side, no orderBy en queries para campos potencialmente missing).
 */
type EventoTipo = 'orden' | 'cita' | 'mantenimiento';

interface EventoCalendario {
  id: string;
  tipo: EventoTipo;
  fecha: Date;
  hora: string;
  clienteNombre: string;
  equipoTipo: string;
  tecnicoNombre?: string;
  fase?: string;
  rawId: string; // para navegar
}

// Color del evento tentativo (cita/mantenimiento) — distinguible del color
// del técnico (que sale de `getTecnicoColor`). Ámbar como semáforo "espera".
const COLOR_TENTATIVO = '#f59e0b'; // amber-500
const COLOR_MANTENIMIENTO = '#a855f7'; // purple-500

export default function Calendario() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  // SPRINT-AGENDA-2: nuevos listeners read-only (citas + mantenimientos).
  const [citasPorConfirmar, setCitasPorConfirmar] = useState<Array<{
    id: string; clienteNombre: string; equipoTipo?: string; servicio?: string;
    fechaSolicitada?: Date | null; horaSolicitada?: string;
  }>>([]);
  const [mantenimientos, setMantenimientos] = useState<Array<{
    id: string; clienteNombre: string; equipoTipo?: string; tecnicoNombre?: string;
    proximaFecha: Date | null; activo: boolean;
  }>>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [vista, setVista] = useState<Vista>('mes');
  const [filtroTecnico, setFiltroTecnico] = useState('');
  // SPRINT-AGENDA-2: toggle para ocultar/mostrar la capa tentativa. Default ON.
  const [mostrarTentativos, setMostrarTentativos] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      setOrdenes(snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id, ...raw,
          fechaCita: raw.fechaCita?.toDate?.() || null,
          createdAt: raw.createdAt?.toDate?.() || new Date(),
          updatedAt: raw.updatedAt?.toDate?.() || new Date(),
        } as OrdenServicio;
      }));
      setLoading(false);
    });

    // SPRINT-AGENDA-2: citas por confirmar (tentativas). Sort client-side
    // por `fechaSolicitada` (puede faltar — P-015 forbids orderBy en
    // colección sin shape garantizado).
    const unsubCitas = onSnapshot(collection(db, 'citas_por_confirmar'), (snap) => {
      setCitasPorConfirmar(snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          clienteNombre: raw.clienteNombre || 'Sin nombre',
          equipoTipo: raw.equipoTipo,
          servicio: raw.servicio,
          fechaSolicitada: raw.fechaSolicitada?.toDate?.() || null,
          horaSolicitada: raw.horaSolicitada || '',
        };
      }));
    });

    // SPRINT-AGENDA-2: mantenimientos programados (tentativos).
    const unsubMant = onSnapshot(collection(db, 'mantenimiento'), (snap) => {
      setMantenimientos(snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          clienteNombre: raw.clienteNombre || 'Sin nombre',
          equipoTipo: raw.equipoTipo,
          tecnicoNombre: raw.tecnicoNombre,
          proximaFecha: raw.proximaFecha?.toDate?.() || null,
          activo: raw.activo !== false,
        };
      }));
    });

    getDocs(collection(db, 'personal')).then(snap => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
    });

    return () => { unsub(); unsubCitas(); unsubMant(); };
  }, []);

  const ordenesConCita = useMemo(() => {
    return ordenes.filter(o => o.fechaCita && o.estado !== 'cancelado' && !o.eliminada)
      .filter(o => !filtroTecnico || o.tecnicoNombre === filtroTecnico);
  }, [ordenes, filtroTecnico]);

  const tecnicos = personal.filter(p => p.rol === 'tecnico' && p.activo);

  // SPRINT-AGENDA-2: unifica los 3 tipos de evento en una sola lista por día.
  // El filtro de técnico solo aplica a órdenes confirmadas (las citas
  // tentativas no tienen técnico asignado todavía); los mantenimientos
  // se filtran por `tecnicoNombre` denormalizado si aplica.
  const getEventosDelDia = (date: Date): EventoCalendario[] => {
    const evOrdenes: EventoCalendario[] = ordenesConCita
      .filter(o => o.fechaCita && isSameDay(o.fechaCita, date))
      .map(o => ({
        id: `o-${o.id}`,
        tipo: 'orden',
        fecha: o.fechaCita!,
        hora: formatHora(o.fechaCita),
        clienteNombre: o.clienteNombre,
        equipoTipo: o.equipoTipo,
        tecnicoNombre: o.tecnicoNombre,
        fase: o.fase,
        rawId: o.id,
      }));
    if (!mostrarTentativos) return evOrdenes;
    const evCitas: EventoCalendario[] = citasPorConfirmar
      .filter(c => c.fechaSolicitada && isSameDay(c.fechaSolicitada, date))
      .map(c => ({
        id: `c-${c.id}`,
        tipo: 'cita',
        fecha: c.fechaSolicitada!,
        hora: c.horaSolicitada || '',
        clienteNombre: c.clienteNombre,
        equipoTipo: c.equipoTipo || c.servicio || '',
        rawId: c.id,
      }));
    const evMant: EventoCalendario[] = mantenimientos
      .filter(m => m.activo && m.proximaFecha && isSameDay(m.proximaFecha, date))
      .filter(m => !filtroTecnico || m.tecnicoNombre === filtroTecnico)
      .map(m => ({
        id: `m-${m.id}`,
        tipo: 'mantenimiento',
        fecha: m.proximaFecha!,
        hora: '',
        clienteNombre: m.clienteNombre,
        equipoTipo: m.equipoTipo || '',
        tecnicoNombre: m.tecnicoNombre,
        rawId: m.id,
      }));
    return [...evOrdenes, ...evCitas, ...evMant].sort(
      (a, b) => a.fecha.getTime() - b.fecha.getTime(),
    );
  };

  const colorDeEvento = (e: EventoCalendario): string => {
    if (e.tipo === 'orden') return getTecnicoColor(e.tecnicoNombre || '');
    if (e.tipo === 'mantenimiento') return COLOR_MANTENIMIENTO;
    return COLOR_TENTATIVO;
  };

  const onClickEvento = (e: EventoCalendario) => {
    if (e.tipo === 'orden') navigate(`/admin/ordenes/${e.rawId}`);
    else if (e.tipo === 'cita') navigate('/admin/citas');
    else if (e.tipo === 'mantenimiento') navigate('/admin/mantenimiento');
  };

  // Month calendar days
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { locale: es });
  const calEnd = endOfWeek(monthEnd, { locale: es });

  const calendarDays: Date[] = [];
  let day = calStart;
  while (day <= calEnd) {
    calendarDays.push(day);
    day = addDays(day, 1);
  }

  // Week days
  const weekStart = startOfWeek(currentDate, { locale: es });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const handlePrev = () => {
    if (vista === 'mes') setCurrentDate(subMonths(currentDate, 1));
    else if (vista === 'semana') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, -1));
  };

  const handleNext = () => {
    if (vista === 'mes') setCurrentDate(addMonths(currentDate, 1));
    else if (vista === 'semana') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando calendario..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-[#0f3460]">Calendario Técnico</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
            <option value="">Todos los técnicos</option>
            {tecnicos.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
          </select>
          {/* SPRINT-AGENDA-2 (2026-05-25): toggle para capa tentativa
              (citas por confirmar + mantenimientos). Default ON. */}
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mostrarTentativos}
              onChange={e => setMostrarTentativos(e.target.checked)}
              className="rounded"
            />
            <span>Mostrar tentativos</span>
          </label>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(['mes', 'semana', 'dia'] as Vista[]).map(v => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  vista === v ? 'bg-white shadow text-[#0f3460]' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {v === 'dia' ? 'Día' : v === 'mes' ? 'Mes' : 'Semana'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
        <button onClick={handlePrev} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
        <h2 className="text-lg font-semibold text-gray-900 capitalize">
          {vista === 'dia'
            ? format(currentDate, "EEEE, dd 'de' MMMM yyyy", { locale: es })
            : vista === 'semana'
              ? `Semana del ${format(weekStart, "dd MMM", { locale: es })} al ${format(addDays(weekStart, 6), "dd MMM yyyy", { locale: es })}`
              : format(currentDate, "MMMM yyyy", { locale: es })
          }
        </h2>
        <button onClick={handleNext} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight size={20} /></button>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {vista === 'mes' && (
          <>
            <div className="grid grid-cols-7 border-b border-gray-100">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                <div key={d} className="text-center text-xs font-semibold text-gray-500 py-3">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((d, i) => {
                const eventos = getEventosDelDia(d);
                const isToday = isSameDay(d, new Date());
                const isCurrentMonth = isSameMonth(d, currentDate);
                return (
                  <div
                    key={i}
                    onClick={() => { setCurrentDate(d); setVista('dia'); }}
                    className={`min-h-[80px] md:min-h-[100px] border-b border-r border-gray-100 p-1.5 cursor-pointer hover:bg-gray-50 ${
                      !isCurrentMonth ? 'bg-gray-50/50' : ''
                    }`}
                  >
                    <span className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${
                      isToday ? 'bg-[#0f3460] text-white' : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                    }`}>
                      {format(d, 'd')}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {eventos.slice(0, 3).map(e => (
                        <div
                          key={e.id}
                          className={`text-[10px] px-1 py-0.5 rounded truncate text-white ${
                            e.tipo !== 'orden' ? 'border border-dashed border-white/50' : ''
                          }`}
                          style={{ backgroundColor: colorDeEvento(e) }}
                          title={e.tipo === 'orden'
                            ? `Orden · ${e.clienteNombre}`
                            : e.tipo === 'cita'
                              ? `Cita por confirmar · ${e.clienteNombre}`
                              : `Mantenimiento · ${e.clienteNombre}`}
                        >
                          {e.hora ? `${e.hora} ` : ''}{e.clienteNombre.split(' ')[0]}
                        </div>
                      ))}
                      {eventos.length > 3 && (
                        <div className="text-[10px] text-gray-500 px-1">+{eventos.length - 3} más</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {vista === 'semana' && (
          <div className="grid grid-cols-7 divide-x divide-gray-100">
            {weekDays.map((d, i) => {
              const eventos = getEventosDelDia(d);
              const isToday = isSameDay(d, new Date());
              return (
                <div key={i} className="min-h-[300px]">
                  <div className={`text-center py-3 border-b border-gray-100 ${isToday ? 'bg-[#0f3460] text-white' : 'bg-gray-50'}`}>
                    <div className="text-xs font-medium capitalize">{format(d, 'EEE', { locale: es })}</div>
                    <div className="text-lg font-bold">{format(d, 'd')}</div>
                  </div>
                  <div className="p-1.5 space-y-1">
                    {eventos.map(e => (
                      <div
                        key={e.id}
                        onClick={() => onClickEvento(e)}
                        className={`text-xs p-1.5 rounded-lg text-white cursor-pointer hover:opacity-90 ${
                          e.tipo !== 'orden' ? 'border border-dashed border-white/40' : ''
                        }`}
                        style={{ backgroundColor: colorDeEvento(e) }}
                      >
                        <div className="font-medium flex items-center gap-1">
                          <span>{e.hora || (e.tipo === 'mantenimiento' ? 'Mant.' : '—')}</span>
                          {e.tipo === 'cita' && <span className="text-[9px] opacity-90">(por confirmar)</span>}
                          {e.tipo === 'mantenimiento' && <span className="text-[9px] opacity-90">(prog.)</span>}
                        </div>
                        <div className="truncate">{e.clienteNombre}</div>
                        <div className="truncate opacity-80">{e.equipoTipo}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {vista === 'dia' && (
          <div className="p-4">
            {getEventosDelDia(currentDate).length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <CalIcon size={48} className="mx-auto mb-3 opacity-30" />
                <p>Sin citas para este día</p>
              </div>
            ) : (
              <div className="space-y-3">
                {getEventosDelDia(currentDate).map(e => (
                  <div
                    key={e.id}
                    onClick={() => onClickEvento(e)}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer hover:shadow-md transition-shadow ${
                      e.tipo !== 'orden' ? 'border-dashed bg-amber-50/30' : ''
                    }`}
                    style={{ borderColor: colorDeEvento(e) }}
                  >
                    <div className="text-center min-w-[50px]">
                      <div className="text-lg font-bold text-[#0f3460]">{e.hora || '—'}</div>
                    </div>
                    <div className="h-10 w-1 rounded-full" style={{ backgroundColor: colorDeEvento(e) }} />
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {e.clienteNombre}
                        {e.tipo === 'cita' && <span className="ml-2 text-xs text-amber-700 font-normal">(por confirmar)</span>}
                        {e.tipo === 'mantenimiento' && <span className="ml-2 text-xs text-purple-700 font-normal">(mantenimiento programado)</span>}
                      </p>
                      <p className="text-sm text-gray-600">{e.equipoTipo || '—'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {e.tipo === 'orden'
                          ? `${faseLabel(e.fase as never)} · ${e.tecnicoNombre || 'Sin técnico'}`
                          : e.tipo === 'cita'
                            ? 'Tap para ir a Citas por confirmar'
                            : `Tap para ir a Mantenimiento · ${e.tecnicoNombre || 'sin técnico'}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 items-center">
        {tecnicos.map(t => (
          <div key={t.id} className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getTecnicoColor(t.nombre) }} />
            {t.nombre}
          </div>
        ))}
        {/* SPRINT-AGENDA-2: leyenda de tipos tentativos */}
        {mostrarTentativos && (
          <>
            <div className="flex items-center gap-2 text-sm text-gray-600 ml-3 border-l border-gray-200 pl-3">
              <div className="w-3 h-3 rounded-full border-2 border-dashed border-white" style={{ backgroundColor: COLOR_TENTATIVO }} />
              Cita por confirmar
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="w-3 h-3 rounded-full border-2 border-dashed border-white" style={{ backgroundColor: COLOR_MANTENIMIENTO }} />
              Mantenimiento programado
            </div>
          </>
        )}
      </div>
    </div>
  );
}
