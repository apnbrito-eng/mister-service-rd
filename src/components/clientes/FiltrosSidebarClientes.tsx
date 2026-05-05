import { Filter, X, Eraser } from 'lucide-react';
import { FiltrosClientes } from '../../utils/clientesFiltros';

interface Props {
  filtros: FiltrosClientes;
  onChange: (f: FiltrosClientes) => void;
  zonasDisponibles: string[];
  equiposDisponibles: string[];
  totalCoincidentes: number;
  totalSinCoords: number;
  onLimpiar: () => void;
  /** Solo en mobile: si está visible como drawer. */
  drawerOpen?: boolean;
  onCloseDrawer?: () => void;
}

const OPCIONES_ULTIMO_SERVICIO: { value: FiltrosClientes['ultimoServicio']; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'sin_registro', label: 'Sin registro' },
  { value: 'menos_3m', label: 'Menos de 3 meses' },
  { value: '3_6m', label: '3 a 6 meses' },
  { value: '6_12m', label: '6 a 12 meses' },
  { value: 'mas_12m', label: 'Más de 12 meses' },
  { value: 'mas_24m', label: 'Más de 24 meses (frío)' },
];

const OPCIONES_TIPO: { value: FiltrosClientes['tipo']; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'particular', label: 'Particular' },
  { value: 'b2b', label: 'B2B' },
];

const OPCIONES_TOTAL: { value: FiltrosClientes['totalServicios']; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: '1', label: '1 servicio' },
  { value: '2_5', label: '2 a 5' },
  { value: '6_10', label: '6 a 10' },
  { value: '11_mas', label: '11 o más (VIP)' },
];

const OPCIONES_WHATSAPP: { value: FiltrosClientes['whatsapp']; label: string }[] = [
  { value: 'indiferente', label: 'Indiferente' },
  { value: 'si', label: 'Tiene WhatsApp válido' },
  { value: 'no', label: 'Sin WhatsApp válido' },
];

/**
 * Sidebar de filtros para el tab Mapa de `/admin/clientes`. En viewport
 * `<lg` se vuelve un drawer toggleable controlado por `drawerOpen`.
 */
export default function FiltrosSidebarClientes({
  filtros,
  onChange,
  zonasDisponibles,
  equiposDisponibles,
  totalCoincidentes,
  totalSinCoords,
  onLimpiar,
  drawerOpen = false,
  onCloseDrawer,
}: Props) {
  const toggleZona = (zona: string) => {
    const ya = filtros.zonas.includes(zona);
    onChange({
      ...filtros,
      zonas: ya ? filtros.zonas.filter(z => z !== zona) : [...filtros.zonas, zona],
    });
  };

  const toggleEquipo = (equipo: string) => {
    const ya = filtros.equipos.includes(equipo);
    onChange({
      ...filtros,
      equipos: ya ? filtros.equipos.filter(e => e !== equipo) : [...filtros.equipos, equipo],
    });
  };

  const contenido = (
    <div className="space-y-5">
      {/* Header con contador y limpiar */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Filtros</p>
          <p className="text-sm text-gray-900 mt-0.5">
            <span className="font-bold text-[#0f3460]">{totalCoincidentes.toLocaleString('es-DO')}</span>{' '}
            cliente{totalCoincidentes === 1 ? '' : 's'} coincide{totalCoincidentes === 1 ? '' : 'n'}
          </p>
          {totalSinCoords > 0 && (
            <p className="text-[11px] text-amber-700 mt-0.5">
              {totalSinCoords.toLocaleString('es-DO')} sin coords (no aparecen en mapa)
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onLimpiar}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-[#0f3460] hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors"
          title="Restablecer filtros"
        >
          <Eraser size={12} /> Limpiar
        </button>
      </div>

      {/* Zona */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">Zona</p>
        {zonasDisponibles.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic">Sin zonas disponibles</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {zonasDisponibles.map(z => {
              const activa = filtros.zonas.includes(z);
              return (
                <button
                  key={z}
                  type="button"
                  onClick={() => toggleZona(z)}
                  className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                    activa
                      ? 'bg-[#0f3460] text-white border-[#0f3460]'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-[#1a5fa8]'
                  }`}
                >
                  {z}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Último servicio */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">Último servicio</p>
        <div className="space-y-1">
          {OPCIONES_ULTIMO_SERVICIO.map(op => (
            <label key={op.value} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="ultimoServicio"
                checked={filtros.ultimoServicio === op.value}
                onChange={() => onChange({ ...filtros, ultimoServicio: op.value })}
                className="accent-[#0f3460]"
              />
              {op.label}
            </label>
          ))}
        </div>
      </div>

      {/* Tipo cliente */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">Tipo de cliente</p>
        <div className="space-y-1">
          {OPCIONES_TIPO.map(op => (
            <label key={op.value} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="tipoCliente"
                checked={filtros.tipo === op.value}
                onChange={() => onChange({ ...filtros, tipo: op.value })}
                className="accent-[#0f3460]"
              />
              {op.label}
            </label>
          ))}
        </div>
      </div>

      {/* Total servicios */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">Total servicios histórico</p>
        <div className="space-y-1">
          {OPCIONES_TOTAL.map(op => (
            <label key={op.value} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="totalServicios"
                checked={filtros.totalServicios === op.value}
                onChange={() => onChange({ ...filtros, totalServicios: op.value })}
                className="accent-[#0f3460]"
              />
              {op.label}
            </label>
          ))}
        </div>
      </div>

      {/* Equipo tipo */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">Equipo atendido</p>
        {equiposDisponibles.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic">Sin equipos registrados en la base</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {equiposDisponibles.map(e => {
              const activo = filtros.equipos.includes(e);
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => toggleEquipo(e)}
                  className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                    activo
                      ? 'bg-[#1a5fa8] text-white border-[#1a5fa8]'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-[#1a5fa8]'
                  }`}
                >
                  {e}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* WhatsApp */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">WhatsApp</p>
        <div className="space-y-1">
          {OPCIONES_WHATSAPP.map(op => (
            <label key={op.value} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="whatsapp"
                checked={filtros.whatsapp === op.value}
                onChange={() => onChange({ ...filtros, whatsapp: op.value })}
                className="accent-[#0f3460]"
              />
              {op.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Versión desktop: panel lateral fijo */}
      <aside className="hidden lg:block w-72 shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 max-h-[80vh] overflow-y-auto">
        {contenido}
      </aside>

      {/* Versión mobile: drawer slide-in derecho */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onCloseDrawer}
          />
          <div className="absolute right-0 top-0 bottom-0 w-[85%] max-w-sm bg-white shadow-2xl overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-[#0f3460]" />
                <h3 className="text-sm font-semibold text-gray-900">Filtros</h3>
              </div>
              <button
                type="button"
                onClick={onCloseDrawer}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                aria-label="Cerrar filtros"
              >
                <X size={18} />
              </button>
            </div>
            {contenido}
            <div className="sticky bottom-0 -mx-5 mt-4 px-5 py-3 bg-white border-t border-gray-100">
              <button
                type="button"
                onClick={onCloseDrawer}
                className="w-full py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-xl text-sm font-medium transition-colors"
              >
                Aplicar y cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
