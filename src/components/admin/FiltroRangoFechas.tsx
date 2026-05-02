interface OpcionCampoFecha {
  value: string;
  label: string;
}

/**
 * Formatea una fecha como YYYY-MM-DD usando los componentes de fecha
 * locales del browser (no UTC). Esto evita el bug en zona horaria RD
 * (UTC-4) donde `new Date().toISOString().slice(0, 10)` mostraba el día
 * siguiente entre 20:00 y 23:59 hora local.
 *
 * Pensado para inicializar `fechaDesde`/`fechaHasta` de los inputs
 * `<input type="date">` que consume este componente.
 */
export function formatYYYYMMDDLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface FiltroRangoFechasProps {
  fechaDesde: string;
  fechaHasta: string;
  onChange: (desde: string, hasta: string) => void;
  totalSinFiltrar: number;
  totalFiltrado: number;
  onLimpiar: () => void;
  // Toggle opcional para elegir sobre qué campo se filtra (ej: emisión vs pago).
  // Si no se pasa `opcionesCampoFecha`, no se renderiza el select.
  campoFecha?: string;
  onChangeCampo?: (valor: string) => void;
  opcionesCampoFecha?: OpcionCampoFecha[];
  // Etiqueta del bloque ("Rango de fechas:" por default).
  etiqueta?: string;
}

export default function FiltroRangoFechas({
  fechaDesde,
  fechaHasta,
  onChange,
  totalSinFiltrar,
  totalFiltrado,
  onLimpiar,
  campoFecha,
  onChangeCampo,
  opcionesCampoFecha,
  etiqueta = 'Rango de fechas:',
}: FiltroRangoFechasProps) {
  const mostrarSelectorCampo =
    Array.isArray(opcionesCampoFecha) &&
    opcionesCampoFecha.length > 0 &&
    typeof onChangeCampo === 'function';

  const hayFiltroActivo = Boolean(fechaDesde || fechaHasta);

  return (
    <div className="flex flex-wrap items-center gap-3 mt-3 pb-4 border-b border-gray-100">
      <span className="text-xs font-medium text-gray-500 uppercase">{etiqueta}</span>

      {mostrarSelectorCampo && (
        <select
          value={campoFecha ?? ''}
          onChange={e => onChangeCampo!(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
        >
          {opcionesCampoFecha!.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      <input
        type="date"
        value={fechaDesde}
        onChange={e => onChange(e.target.value, fechaHasta)}
        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
        aria-label="Fecha desde"
      />
      <span className="text-sm text-gray-500">→</span>
      <input
        type="date"
        value={fechaHasta}
        onChange={e => onChange(fechaDesde, e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
        aria-label="Fecha hasta"
      />

      {hayFiltroActivo && (
        <button
          type="button"
          onClick={onLimpiar}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          Limpiar
        </button>
      )}

      <span className="ml-auto text-xs text-gray-500">
        Mostrando {totalFiltrado} de {totalSinFiltrar}
      </span>
    </div>
  );
}
