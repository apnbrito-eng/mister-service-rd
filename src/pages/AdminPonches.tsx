import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ClipboardCheck, Download, Image as ImageIcon, MapPin, X,
  Filter, Calendar as CalendarIcon, AlertCircle,
} from 'lucide-react';
import type { Personal, Ponche, Rol } from '../types';
import { fechaRDHoy } from '../services/ponches.service';

function tsToDate(t: Ponche['timestamp'] | undefined): Date | null {
  if (!t) return null;
  if (t instanceof Date) return t;
  const maybeTs = t as { toDate?: () => Date };
  if (typeof maybeTs.toDate === 'function') return maybeTs.toDate();
  return null;
}

function formatHora12(d: Date | null): string {
  if (!d) return '—';
  try {
    return format(d, 'h:mm a', { locale: es });
  } catch {
    return '—';
  }
}

function formatDuracion(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}

/** Día laborable: todos excepto domingo (getDay() === 0). */
function esDiaLaborable(fechaRD: string): boolean {
  // fechaRD es YYYY-MM-DD en hora RD; parseamos como fecha local
  const [y, m, d] = fechaRD.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getDay() !== 0;
}

const ROLES_FILTRO: Array<{ value: '' | Rol; label: string }> = [
  { value: '', label: 'Todos los roles' },
  { value: 'administrador', label: 'Administrador' },
  { value: 'coordinadora', label: 'Coordinadora' },
  { value: 'operaria', label: 'Operaria' },
  { value: 'secretaria', label: 'Secretaria' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'ayudante', label: 'Ayudante' },
];

/** Filas agrupadas por persona (join de entrada + salida). */
interface FilaPonche {
  personalId: string;
  personalUid: string;
  personalNombre: string;
  personalRol: Rol;
  entrada: Ponche | null;
  salida: Ponche | null;
}

function escaparCSV(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default function AdminPonches() {
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>(fechaRDHoy());
  const [filtroPersonal, setFiltroPersonal] = useState<string>('');
  const [filtroRol, setFiltroRol] = useState<'' | Rol>('');

  const [ponches, setPonches] = useState<Ponche[]>([]);
  const [cargando, setCargando] = useState(true);
  const [personal, setPersonal] = useState<Personal[]>([]);

  const [fotoLightbox, setFotoLightbox] = useState<string | null>(null);

  // Subscripción a ponches del día
  useEffect(() => {
    setCargando(true);
    const q = query(
      collection(db, 'ponches'),
      where('fechaRD', '==', fechaSeleccionada),
      orderBy('timestamp', 'asc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Ponche));
        setPonches(lista);
        setCargando(false);
      },
      (err) => {
        console.error('[AdminPonches] Error subscribiendo:', err);
        setCargando(false);
      },
    );
    return () => unsub();
  }, [fechaSeleccionada]);

  // Subscripción a personal (para el selector + badges de ausentes)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'personal'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Personal));
        setPersonal(list);
      },
      (err) => console.error('[AdminPonches] Error personal:', err),
    );
    return () => unsub();
  }, []);

  // Agrupar por personalUid
  const filas: FilaPonche[] = useMemo(() => {
    const map = new Map<string, FilaPonche>();
    for (const p of ponches) {
      const key = p.personalUid || p.personalId;
      const existente = map.get(key);
      if (!existente) {
        map.set(key, {
          personalId: p.personalId,
          personalUid: p.personalUid,
          personalNombre: p.personalNombre,
          personalRol: p.personalRol,
          entrada: p.tipo === 'entrada' ? p : null,
          salida: p.tipo === 'salida' ? p : null,
        });
      } else {
        if (p.tipo === 'entrada') existente.entrada = p;
        if (p.tipo === 'salida') existente.salida = p;
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.personalNombre.localeCompare(b.personalNombre, 'es'),
    );
  }, [ponches]);

  // Personal activo que no ponchó (badges de ausencia)
  const ausentes: Personal[] = useMemo(() => {
    if (!esDiaLaborable(fechaSeleccionada)) return [];
    const uidsConPonche = new Set(filas.map((f) => f.personalUid));
    return personal.filter(
      (p) =>
        p.activo &&
        !!p.uid &&
        !uidsConPonche.has(p.uid) &&
        // respetar filtros si están activos
        (filtroRol === '' || p.rol === filtroRol) &&
        (filtroPersonal === '' || p.id === filtroPersonal),
    );
  }, [personal, filas, fechaSeleccionada, filtroRol, filtroPersonal]);

  // Aplicar filtros sobre filas
  const filasFiltradas = useMemo(() => {
    return filas.filter((f) => {
      if (filtroRol && f.personalRol !== filtroRol) return false;
      if (filtroPersonal && f.personalId !== filtroPersonal) return false;
      return true;
    });
  }, [filas, filtroRol, filtroPersonal]);

  const exportarCSV = () => {
    const headers = ['nombre', 'rol', 'entrada', 'salida', 'horas', 'gps_entrada', 'gps_salida'];
    const rows = filasFiltradas.map((f) => {
      const fe = tsToDate(f.entrada?.timestamp);
      const fs = tsToDate(f.salida?.timestamp);
      const horas = fe && fs ? formatDuracion(fs.getTime() - fe.getTime()) : '';
      const gpsE = f.entrada?.ubicacion ? `${f.entrada.ubicacion.lat},${f.entrada.ubicacion.lng}` : '';
      const gpsS = f.salida?.ubicacion ? `${f.salida.ubicacion.lat},${f.salida.ubicacion.lng}` : '';
      return [
        f.personalNombre,
        f.personalRol,
        formatHora12(fe),
        formatHora12(fs),
        horas,
        gpsE,
        gpsS,
      ];
    });
    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map(escaparCSV).join(',')),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ponches_${fechaSeleccionada}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fechaTexto = (() => {
    const [y, m, d] = fechaSeleccionada.split('-').map(Number);
    try {
      return format(new Date(y, m - 1, d), "EEEE, d 'de' MMMM yyyy", { locale: es });
    } catch {
      return fechaSeleccionada;
    }
  })();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="text-brand-600" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reporte de Ponches</h1>
            <p className="text-sm text-gray-500 capitalize">{fechaTexto}</p>
          </div>
        </div>
        <button
          onClick={exportarCSV}
          disabled={filasFiltradas.length === 0}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Download size={16} />
          Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-700">
          <Filter size={14} />
          Filtros
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="date"
                value={fechaSeleccionada}
                onChange={(e) => setFechaSeleccionada(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Personal</label>
            <select
              value={filtroPersonal}
              onChange={(e) => setFiltroPersonal(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Todos</option>
              {personal
                .filter((p) => p.activo)
                .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.rol})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rol</label>
            <select
              value={filtroRol}
              onChange={(e) => setFiltroRol(e.target.value as '' | Rol)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {ROLES_FILTRO.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {cargando ? (
          <div className="p-8 text-center text-gray-500 text-sm">Cargando…</div>
        ) : filasFiltradas.length === 0 && ausentes.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No hay ponches registrados para esta fecha con los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-600">
                  <th className="px-4 py-3 font-semibold">Personal</th>
                  <th className="px-4 py-3 font-semibold">Entrada</th>
                  <th className="px-4 py-3 font-semibold">Salida</th>
                  <th className="px-4 py-3 font-semibold">Horas</th>
                  <th className="px-4 py-3 font-semibold">GPS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filasFiltradas.map((f) => {
                  const fe = tsToDate(f.entrada?.timestamp);
                  const fs = tsToDate(f.salida?.timestamp);
                  const horas = fe && fs ? formatDuracion(fs.getTime() - fe.getTime()) : (fe ? '—' : '');
                  const gps = f.entrada?.ubicacion || f.salida?.ubicacion;
                  return (
                    <tr key={f.personalUid || f.personalId} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{f.personalNombre}</div>
                        <span className="inline-block mt-1 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-700 rounded px-2 py-0.5">
                          {f.personalRol}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {f.entrada ? (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{formatHora12(fe)}</span>
                            {f.entrada.fotoUrl && (
                              <button
                                onClick={() => setFotoLightbox(f.entrada!.fotoUrl)}
                                title="Ver selfie"
                                className="text-brand-600 hover:text-brand-700"
                              >
                                <ImageIcon size={14} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {f.salida ? (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{formatHora12(fs)}</span>
                            {f.salida.fotoUrl && (
                              <button
                                onClick={() => setFotoLightbox(f.salida!.fotoUrl)}
                                title="Ver selfie"
                                className="text-brand-600 hover:text-brand-700"
                              >
                                <ImageIcon size={14} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{horas || <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3">
                        {gps ? (
                          <span
                            title={`${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`}
                            className="inline-flex items-center gap-1 text-green-600"
                          >
                            <MapPin size={14} />
                            <span className="text-xs">Sí</span>
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {/* Personal ausente */}
                {ausentes.map((p) => (
                  <tr key={`ausente-${p.id}`} className="bg-red-50/30 hover:bg-red-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{p.nombre}</div>
                      <span className="inline-block mt-1 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-700 rounded px-2 py-0.5">
                        {p.rol}
                      </span>
                    </td>
                    <td className="px-4 py-3" colSpan={4}>
                      <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full px-2 py-0.5">
                        <AlertCircle size={12} />
                        Sin entrada
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lightbox foto */}
      {fotoLightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setFotoLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2"
            onClick={() => setFotoLightbox(null)}
          >
            <X size={20} />
          </button>
          <img
            src={fotoLightbox}
            alt="Foto ponche"
            className="max-w-full max-h-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
