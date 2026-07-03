import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Search, Calendar, Eraser, Filter, Save, FolderOpen, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTiposEquipo } from '../../hooks/useTiposEquipo';

/**
 * Formatea una fecha como YYYY-MM-DD usando los componentes de fecha
 * locales del browser (no UTC). Esto evita el bug en zona horaria RD
 * (UTC-4) donde `new Date().toISOString().slice(0, 10)` mostraba el día
 * siguiente entre 20:00 y 23:59 hora local.
 *
 * Pensado para inicializar `fechaDesde`/`fechaHasta` de los inputs
 * `<input type="date">` que consume este componente.
 *
 * Hereda de `FiltroRangoFechas.tsx` (commit aebf689). El ticket de
 * cleanup `docs/sprints/PROMPT_CLEANUP_PAGOS_Y_FECHAS.md` planea
 * relocalizar este helper a `src/utils/fecha.ts`.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function formatYYYYMMDDLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type PaginaFiltro = 'facturas' | 'facturacion-pendiente' | 'cotizaciones';
export type CampoFecha = 'emision' | 'pago';
export type AtajoFecha = 'hoy' | 'semana' | 'mes' | 'trimestre' | 'año';
export type PresetKPI =
  | 'cobradoAnual'
  | 'emitidasHoy'
  | 'emitidasMes'
  | 'pagadasMes';

export interface FiltroValores {
  estado: string;
  busqueda: string;
  tipoEquipo: string;
  fechaDesde: string;
  fechaHasta: string;
  campoFecha: CampoFecha;
}

export interface FiltroActivo extends FiltroValores {
  filtrosActivosCount: number;
}

interface ItemFiltrable {
  clienteNombre?: string;
  clienteTelefono?: string;
  numero?: string;
  ordenNumero?: string;
  equipoTipo?: string;
  equipoMarca?: string;
  estado?: string;
  fechaEmision?: Date | null;
  fechaPago?: Date | null;
}

interface OpcionEstado {
  value: string;
  label: string;
}

interface Props<T extends ItemFiltrable> {
  pagina: PaginaFiltro;
  items: T[];
  onChange: (filtrados: T[], filtroActivo: FiltroActivo) => void;
  estados?: OpcionEstado[];
  /** Si la página tiene toggle por emisión vs pago. Solo Facturas. */
  permiteCampoFecha?: boolean;
  /** Etiqueta del rango (default: "Rango de fechas") */
  etiquetaFechas?: string;
  /** Año seleccionado para el preset Cobrado Anual */
  yearCobradoAnual?: number;
  mostrarIndicador?: boolean;
  permiteFiltrosGuardados?: boolean;
  /** Resolver tipo de equipo cuando el item no lo tiene directo (cotizaciones). */
  resolverEquipoTipo?: (item: T) => string | undefined;
  /** Resolver marca de equipo (para buscador unificado en cotizaciones). */
  resolverEquipoMarca?: (item: T) => string | undefined;
  /** Resolver teléfono cliente (para cotizaciones que no lo tienen directo). */
  resolverClienteTelefono?: (item: T) => string | undefined;
}

export interface FiltroAvanzadoFinanzasRef {
  aplicarPreset: (preset: PresetKPI) => void;
  aplicarAtajo: (atajo: AtajoFecha) => void;
  limpiar: () => void;
}

const STORAGE_KEY = 'filtros-finanzas-v1';
const MAX_GUARDADOS = 50;

interface FiltroGuardado {
  id: string;
  nombre: string;
  pagina: PaginaFiltro;
  filtros: FiltroValores;
  creadoEn: string;
}

interface StorageShape {
  ultimoFiltro?: FiltroValores & { pagina: PaginaFiltro };
  guardados?: FiltroGuardado[];
}

function leerStorage(): StorageShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as StorageShape;
  } catch {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return {};
  }
}

function escribirStorage(data: StorageShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota excedida o storage deshabilitado: ignoramos silenciosamente.
  }
}

const ATAJOS: Array<{ value: AtajoFecha; label: string }> = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'trimestre', label: 'Trimestre' },
  { value: 'año', label: 'Año' },
];

function calcularRangoAtajo(atajo: AtajoFecha): { desde: string; hasta: string } {
  const hoy = new Date();
  let desde: Date;
  switch (atajo) {
    case 'hoy':
      desde = hoy;
      break;
    case 'semana':
      desde = new Date(hoy);
      desde.setDate(hoy.getDate() - hoy.getDay());
      break;
    case 'mes':
      desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      break;
    case 'trimestre': {
      const q = Math.floor(hoy.getMonth() / 3);
      desde = new Date(hoy.getFullYear(), q * 3, 1);
      break;
    }
    case 'año':
      desde = new Date(hoy.getFullYear(), 0, 1);
      break;
  }
  return { desde: formatYYYYMMDDLocal(desde), hasta: formatYYYYMMDDLocal(hoy) };
}

function calcularRangoMes(): { desde: string; hasta: string } {
  return calcularRangoAtajo('mes');
}

function calcularRangoUltimos30Dias(): { desde: string; hasta: string } {
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(hoy.getDate() - 30);
  return { desde: formatYYYYMMDDLocal(desde), hasta: formatYYYYMMDDLocal(hoy) };
}

// El default de rango cambia por página. Cotizaciones y Conduces Pendientes
// arrancaban con "mes actual" (día 1 → hoy), lo que escondía todo el trabajo
// abierto del mes anterior. `Facturas` conserva "mes actual" — es su vista
// natural para KPIs mensuales.
function calcularRangoDefault(pagina: PaginaFiltro): { desde: string; hasta: string } {
  if (pagina === 'cotizaciones' || pagina === 'facturacion-pendiente') {
    return calcularRangoUltimos30Dias();
  }
  return calcularRangoMes();
}

function leerValoresDesdeURL(): Partial<FiltroValores> | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (
    !params.has('desde') &&
    !params.has('hasta') &&
    !params.has('q') &&
    !params.has('tipo') &&
    !params.has('estado') &&
    !params.has('campo')
  ) {
    return null;
  }
  const out: Partial<FiltroValores> = {};
  if (params.has('desde')) out.fechaDesde = params.get('desde') || '';
  if (params.has('hasta')) out.fechaHasta = params.get('hasta') || '';
  if (params.has('q')) out.busqueda = params.get('q') || '';
  if (params.has('tipo')) out.tipoEquipo = params.get('tipo') || 'Todos';
  if (params.has('estado')) out.estado = params.get('estado') || 'Todas';
  const campo = params.get('campo');
  if (campo === 'emision' || campo === 'pago') out.campoFecha = campo;
  return out;
}

function FiltroAvanzadoFinanzasInner<T extends ItemFiltrable>(
  props: Props<T>,
  ref: React.ForwardedRef<FiltroAvanzadoFinanzasRef>,
): JSX.Element {
  const {
    pagina,
    items,
    onChange,
    estados,
    permiteCampoFecha = false,
    etiquetaFechas = 'Rango de fechas',
    yearCobradoAnual,
    mostrarIndicador = true,
    permiteFiltrosGuardados = true,
    resolverEquipoTipo,
    resolverEquipoMarca,
    resolverClienteTelefono,
  } = props;

  const tiposEquipo = useTiposEquipo();
  const opcionesTipo = useMemo(() => ['Todos', ...tiposEquipo], [tiposEquipo]);

  const valoresIniciales = useMemo<FiltroValores>(() => {
    const rangoDefault = calcularRangoDefault(pagina);
    const defaults: FiltroValores = {
      estado: 'Todas',
      busqueda: '',
      tipoEquipo: 'Todos',
      fechaDesde: rangoDefault.desde,
      fechaHasta: rangoDefault.hasta,
      campoFecha: 'emision',
    };
    const desdeURL = leerValoresDesdeURL();
    if (desdeURL) {
      return { ...defaults, ...desdeURL };
    }
    const storage = leerStorage();
    if (storage.ultimoFiltro && storage.ultimoFiltro.pagina === pagina) {
      const { pagina: _, ...resto } = storage.ultimoFiltro;
      void _;
      return { ...defaults, ...resto };
    }
    return defaults;
  }, [pagina]);

  // Estado APLICADO (lo que se usa para filtrar).
  const [aplicado, setAplicado] = useState<FiltroValores>(valoresIniciales);
  // Estado LOCAL de los inputs de fecha (no aplicados hasta click).
  const [fechaDesdeLocal, setFechaDesdeLocal] = useState(valoresIniciales.fechaDesde);
  const [fechaHastaLocal, setFechaHastaLocal] = useState(valoresIniciales.fechaHasta);
  const [campoFechaLocal, setCampoFechaLocal] = useState<CampoFecha>(valoresIniciales.campoFecha);

  const [mostrarGuardados, setMostrarGuardados] = useState(false);
  const [guardados, setGuardados] = useState<FiltroGuardado[]>(() => {
    const s = leerStorage();
    return Array.isArray(s.guardados) ? s.guardados : [];
  });

  // Evita callbacks innecesarios en primer render duplicado por StrictMode.
  const inicializadoRef = useRef(false);

  const filtrosActivosCount = useMemo(() => {
    return [
      aplicado.estado !== 'Todas',
      aplicado.busqueda.trim().length > 0,
      aplicado.tipoEquipo !== 'Todos',
      Boolean(aplicado.fechaDesde),
      Boolean(aplicado.fechaHasta),
    ].filter(Boolean).length;
  }, [aplicado]);

  const filtroActivo = useMemo<FiltroActivo>(
    () => ({ ...aplicado, filtrosActivosCount }),
    [aplicado, filtrosActivosCount],
  );

  const filtrados = useMemo(() => {
    const q = aplicado.busqueda.trim().toLowerCase();
    const desdeMs = aplicado.fechaDesde
      ? new Date(aplicado.fechaDesde + 'T00:00:00').getTime()
      : null;
    const hastaMs = aplicado.fechaHasta
      ? new Date(aplicado.fechaHasta + 'T23:59:59').getTime()
      : null;

    return items.filter((item) => {
      if (aplicado.estado !== 'Todas') {
        const itemEstado = (item.estado || '').toLowerCase();
        if (itemEstado !== aplicado.estado.toLowerCase()) return false;
      }

      if (q.length > 0) {
        const equipoTipoItem = item.equipoTipo || resolverEquipoTipo?.(item) || '';
        const equipoMarcaItem = item.equipoMarca || resolverEquipoMarca?.(item) || '';
        const telefonoItem = item.clienteTelefono || resolverClienteTelefono?.(item) || '';
        const matches =
          (item.clienteNombre || '').toLowerCase().includes(q) ||
          (item.numero || '').toLowerCase().includes(q) ||
          (item.ordenNumero || '').toLowerCase().includes(q) ||
          telefonoItem.includes(aplicado.busqueda.trim()) ||
          equipoTipoItem.toLowerCase().includes(q) ||
          equipoMarcaItem.toLowerCase().includes(q);
        if (!matches) return false;
      }

      if (aplicado.tipoEquipo !== 'Todos') {
        const equipoTipoItem = item.equipoTipo || resolverEquipoTipo?.(item) || '';
        if (equipoTipoItem !== aplicado.tipoEquipo) return false;
      }

      if (desdeMs !== null || hastaMs !== null) {
        const fecha =
          aplicado.campoFecha === 'pago' ? item.fechaPago : item.fechaEmision;
        if (!fecha) return false;
        const t = fecha instanceof Date ? fecha.getTime() : new Date(fecha).getTime();
        if (desdeMs !== null && t < desdeMs) return false;
        if (hastaMs !== null && t > hastaMs) return false;
      }

      return true;
    });
    // resolverX son referencias del padre; las omitimos para evitar refiltrado innecesario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, aplicado]);

  // Persistir cambios en URL + localStorage cada vez que `aplicado` cambia.
  const sincronizarURLYStorage = useCallback((valores: FiltroValores) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (valores.fechaDesde) params.set('desde', valores.fechaDesde);
    if (valores.fechaHasta) params.set('hasta', valores.fechaHasta);
    if (valores.busqueda.trim()) params.set('q', valores.busqueda.trim());
    if (valores.tipoEquipo !== 'Todos') params.set('tipo', valores.tipoEquipo);
    if (valores.estado !== 'Todas') params.set('estado', valores.estado);
    if (valores.campoFecha !== 'emision') params.set('campo', valores.campoFecha);
    const qs = params.toString();
    const newUrl = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    try {
      window.history.replaceState({}, '', newUrl);
    } catch {
      // Algunos browsers limitan replaceState a misma origen; no es crítico.
    }
    const storage = leerStorage();
    storage.ultimoFiltro = { pagina, ...valores };
    escribirStorage(storage);
  }, [pagina]);

  useEffect(() => {
    onChange(filtrados, filtroActivo);
    if (inicializadoRef.current) {
      sincronizarURLYStorage(aplicado);
    } else {
      // Primer render: sincronizamos sin persistir todavía.
      inicializadoRef.current = true;
      sincronizarURLYStorage(aplicado);
    }
    // onChange cambia entre renders del padre; lo dejamos fuera para evitar loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados, filtroActivo, aplicado, sincronizarURLYStorage]);

  const aplicar = useCallback(() => {
    setAplicado((prev) => ({
      ...prev,
      fechaDesde: fechaDesdeLocal,
      fechaHasta: fechaHastaLocal,
      campoFecha: campoFechaLocal,
    }));
  }, [fechaDesdeLocal, fechaHastaLocal, campoFechaLocal]);

  const aplicarAtajo = useCallback((atajo: AtajoFecha) => {
    const rango = calcularRangoAtajo(atajo);
    setFechaDesdeLocal(rango.desde);
    setFechaHastaLocal(rango.hasta);
    setAplicado((prev) => ({
      ...prev,
      fechaDesde: rango.desde,
      fechaHasta: rango.hasta,
    }));
  }, []);

  const limpiar = useCallback(() => {
    const reset: FiltroValores = {
      estado: 'Todas',
      busqueda: '',
      tipoEquipo: 'Todos',
      fechaDesde: '',
      fechaHasta: '',
      campoFecha: 'emision',
    };
    setFechaDesdeLocal('');
    setFechaHastaLocal('');
    setCampoFechaLocal('emision');
    setAplicado(reset);
  }, []);

  const aplicarPreset = useCallback((preset: PresetKPI) => {
    const hoy = new Date();
    const finMes = formatYYYYMMDDLocal(hoy);
    const inicioMes = formatYYYYMMDDLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    const hoyStr = formatYYYYMMDDLocal(hoy);

    let nuevo: FiltroValores;
    switch (preset) {
      case 'cobradoAnual': {
        const year = yearCobradoAnual ?? hoy.getFullYear();
        nuevo = {
          estado: 'pagada',
          busqueda: '',
          tipoEquipo: 'Todos',
          fechaDesde: `${year}-01-01`,
          fechaHasta: `${year}-12-31`,
          campoFecha: 'pago',
        };
        break;
      }
      case 'emitidasHoy':
        nuevo = {
          estado: 'emitida',
          busqueda: '',
          tipoEquipo: 'Todos',
          fechaDesde: hoyStr,
          fechaHasta: hoyStr,
          campoFecha: 'emision',
        };
        break;
      case 'emitidasMes':
        nuevo = {
          estado: 'emitida',
          busqueda: '',
          tipoEquipo: 'Todos',
          fechaDesde: inicioMes,
          fechaHasta: finMes,
          campoFecha: 'emision',
        };
        break;
      case 'pagadasMes':
        nuevo = {
          estado: 'pagada',
          busqueda: '',
          tipoEquipo: 'Todos',
          fechaDesde: inicioMes,
          fechaHasta: finMes,
          campoFecha: 'pago',
        };
        break;
    }
    setFechaDesdeLocal(nuevo.fechaDesde);
    setFechaHastaLocal(nuevo.fechaHasta);
    setCampoFechaLocal(nuevo.campoFecha);
    setAplicado(nuevo);
  }, [yearCobradoAnual]);

  useImperativeHandle(ref, () => ({
    aplicarPreset,
    aplicarAtajo,
    limpiar,
  }), [aplicarPreset, aplicarAtajo, limpiar]);

  // Búsqueda y tabs son LIVE: se aplican en el momento.
  const handleBusqueda = (valor: string) => {
    setAplicado((prev) => ({ ...prev, busqueda: valor }));
  };
  const handleEstado = (valor: string) => {
    setAplicado((prev) => ({ ...prev, estado: valor }));
  };
  const handleTipoEquipo = (valor: string) => {
    setAplicado((prev) => ({ ...prev, tipoEquipo: valor }));
  };

  const guardarFiltro = () => {
    const nombre = window.prompt('Nombre del filtro guardado:');
    if (!nombre) return;
    const trimmed = nombre.trim().slice(0, 50);
    if (!trimmed) return;
    const nuevo: FiltroGuardado = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `f_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      nombre: trimmed,
      pagina,
      filtros: aplicado,
      creadoEn: new Date().toISOString(),
    };
    const storage = leerStorage();
    const previos = Array.isArray(storage.guardados) ? storage.guardados : [];
    let lista = [...previos, nuevo];
    if (lista.length > MAX_GUARDADOS) {
      lista = lista.slice(lista.length - MAX_GUARDADOS);
    }
    storage.guardados = lista;
    escribirStorage(storage);
    setGuardados(lista);
    toast.success(`Filtro "${trimmed}" guardado`);
  };

  const cargarFiltro = (g: FiltroGuardado) => {
    setFechaDesdeLocal(g.filtros.fechaDesde);
    setFechaHastaLocal(g.filtros.fechaHasta);
    setCampoFechaLocal(g.filtros.campoFecha);
    setAplicado(g.filtros);
    setMostrarGuardados(false);
    toast.success(`Filtro "${g.nombre}" aplicado`);
  };

  const borrarFiltroGuardado = (id: string) => {
    const storage = leerStorage();
    const lista = (storage.guardados || []).filter((g) => g.id !== id);
    storage.guardados = lista;
    escribirStorage(storage);
    setGuardados(lista);
  };

  const guardadosDePagina = guardados.filter((g) => g.pagina === pagina);

  return (
    <div className="space-y-3">
      {/* Línea 1: Tabs de estado (live) */}
      {Array.isArray(estados) && estados.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {estados.map((e) => (
            <button
              key={e.value}
              type="button"
              onClick={() => handleEstado(e.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                aplicado.estado === e.value
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
      )}

      {/* Línea 2: Buscador + Tipo equipo */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={aplicado.busqueda}
            onChange={(e) => handleBusqueda(e.target.value)}
            placeholder="Cliente, # orden, # conduce, teléfono, equipo..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
          />
          {aplicado.busqueda && (
            <button
              type="button"
              onClick={() => handleBusqueda('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              aria-label="Limpiar búsqueda"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <select
          value={aplicado.tipoEquipo}
          onChange={(e) => handleTipoEquipo(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
          aria-label="Tipo de equipo"
        >
          {opcionesTipo.map((t) => (
            <option key={t} value={t}>{t === 'Todos' ? 'Tipo: Todos' : t}</option>
          ))}
        </select>
      </div>

      {/* Línea 3: Rango de fechas + Aplicar/Limpiar */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
        <span className="text-xs font-medium text-gray-500 uppercase shrink-0">
          {etiquetaFechas}
        </span>
        {permiteCampoFecha && (
          <select
            value={campoFechaLocal}
            onChange={(e) => setCampoFechaLocal(e.target.value as CampoFecha)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
            aria-label="Campo de fecha"
          >
            <option value="emision">Por emisión</option>
            <option value="pago">Por pago</option>
          </select>
        )}
        <input
          type="date"
          value={fechaDesdeLocal}
          onChange={(e) => setFechaDesdeLocal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') aplicar(); }}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
          aria-label="Fecha desde"
        />
        <span className="text-sm text-gray-500">→</span>
        <input
          type="date"
          value={fechaHastaLocal}
          onChange={(e) => setFechaHastaLocal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') aplicar(); }}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
          aria-label="Fecha hasta"
        />

        <div className="flex flex-wrap items-center gap-1 ml-1">
          {ATAJOS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => aplicarAtajo(a.value)}
              className="px-2 py-1 text-[11px] font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md border border-gray-200"
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={aplicar}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-medium text-white rounded-lg text-xs font-semibold"
          >
            <Calendar size={12} /> Aplicar
          </button>
          <button
            type="button"
            onClick={limpiar}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold"
          >
            <Eraser size={12} /> Limpiar
          </button>
        </div>
      </div>

      {/* Línea 4: Indicador + Filtros guardados */}
      {(mostrarIndicador || permiteFiltrosGuardados) && (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {mostrarIndicador && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Filter size={12} className="text-gray-400" />
              <span>
                {filtrosActivosCount === 0
                  ? 'Sin filtros activos'
                  : `${filtrosActivosCount} filtro${filtrosActivosCount === 1 ? '' : 's'} activo${filtrosActivosCount === 1 ? '' : 's'}`}
                <span className="mx-1.5 text-gray-300">·</span>
                Mostrando {filtrados.length} de {items.length}
              </span>
            </div>
          )}

          {permiteFiltrosGuardados && (
            <div className="flex items-center gap-2 ml-auto relative">
              <button
                type="button"
                onClick={guardarFiltro}
                disabled={filtrosActivosCount === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                title={filtrosActivosCount === 0 ? 'Aplicá filtros antes de guardar' : 'Guardar combinación actual'}
              >
                <Save size={12} /> Guardar
              </button>
              <button
                type="button"
                onClick={() => setMostrarGuardados((v) => !v)}
                disabled={guardadosDePagina.length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                title={guardadosDePagina.length === 0 ? 'No hay filtros guardados' : 'Cargar filtro guardado'}
              >
                <FolderOpen size={12} /> Cargar ({guardadosDePagina.length})
              </button>
              {mostrarGuardados && guardadosDePagina.length > 0 && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg w-72 max-h-80 overflow-y-auto">
                  <div className="p-2 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Filtros guardados
                  </div>
                  <ul>
                    {guardadosDePagina.map((g) => (
                      <li key={g.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50">
                        <button
                          type="button"
                          onClick={() => cargarFiltro(g)}
                          className="flex-1 text-left text-xs text-gray-700"
                        >
                          <div className="font-medium">{g.nombre}</div>
                          <div className="text-[10px] text-gray-400">
                            {g.filtros.fechaDesde || 'sin desde'} → {g.filtros.fechaHasta || 'sin hasta'}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => borrarFiltroGuardado(g.id)}
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                          aria-label={`Borrar ${g.nombre}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const FiltroAvanzadoFinanzas = forwardRef(FiltroAvanzadoFinanzasInner) as <T extends ItemFiltrable>(
  props: Props<T> & { ref?: React.ForwardedRef<FiltroAvanzadoFinanzasRef> },
) => JSX.Element;

export default FiltroAvanzadoFinanzas;
