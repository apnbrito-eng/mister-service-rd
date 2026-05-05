import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ShieldOff } from 'lucide-react';
import { Cliente } from '../../types';
import { formatTelefono } from '../../utils';
import { mesesDesdeUltimoServicio } from '../../utils/clientesFiltros';

interface Props {
  /** Clientes elegibles (los que ya pasaron filtros y, si aplica, override). */
  clientes: Cliente[];
  /** Clientes en cooldown que el override admin agregó. Render con badge. */
  clientesEnCooldown: Cliente[];
  cooldownDias: number;
  seleccionados: Set<string>;
  onToggleCliente: (id: string) => void;
  onSeleccionarTodos: () => void;
  onLimpiarSeleccion: () => void;
}

type ColumnaSort =
  | 'nombre'
  | 'telefono'
  | 'zona'
  | 'ultimoServicio'
  | 'totalServicios'
  | 'ultimaCampana';

type DireccionSort = 'asc' | 'desc';

const PAGE_SIZE = 50;

/** Compara dos clientes por la columna activa. */
function compareClientes(a: Cliente, b: Cliente, col: ColumnaSort): number {
  switch (col) {
    case 'nombre':
      return (a.nombre || '').localeCompare(b.nombre || '', 'es');
    case 'telefono':
      return (a.telefono || '').localeCompare(b.telefono || '');
    case 'zona':
      return (a.zona || '').localeCompare(b.zona || '', 'es');
    case 'ultimoServicio': {
      const ma = mesesDesdeUltimoServicio(a);
      const mb = mesesDesdeUltimoServicio(b);
      // Sin registro al final cuando asc.
      if (ma === null && mb === null) return 0;
      if (ma === null) return 1;
      if (mb === null) return -1;
      return ma - mb;
    }
    case 'totalServicios':
      return (a.legacyMetricas?.totalServicios || 0) - (b.legacyMetricas?.totalServicios || 0);
    case 'ultimaCampana': {
      const ta = a.ultimoContactoMarketing instanceof Date
        ? a.ultimoContactoMarketing.getTime()
        : 0;
      const tb = b.ultimoContactoMarketing instanceof Date
        ? b.ultimoContactoMarketing.getTime()
        : 0;
      return ta - tb;
    }
  }
}

function ultimoServicioLabel(c: Cliente): string {
  const meses = mesesDesdeUltimoServicio(c);
  if (meses === null) return 'Sin registro';
  if (meses < 1) return '< 1 mes';
  return `${Math.round(meses)} meses`;
}

function ultimaCampanaLabel(c: Cliente): string {
  const fecha = c.ultimoContactoMarketing;
  if (!fecha) return '—';
  const d = fecha instanceof Date ? fecha : null;
  if (!d) return '—';
  const diffDias = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias <= 0) return 'Hoy';
  if (diffDias === 1) return 'Ayer';
  return `Hace ${diffDias}d`;
}

export default function TablaReactivacion({
  clientes,
  clientesEnCooldown,
  cooldownDias,
  seleccionados,
  onToggleCliente,
  onSeleccionarTodos,
  onLimpiarSeleccion,
}: Props) {
  const [colSort, setColSort] = useState<ColumnaSort>('ultimoServicio');
  const [dirSort, setDirSort] = useState<DireccionSort>('desc');
  const [pagina, setPagina] = useState(0);

  const idsCooldown = useMemo(
    () => new Set(clientesEnCooldown.map((c) => c.id)),
    [clientesEnCooldown],
  );

  const ordenados = useMemo(() => {
    const arr = [...clientes];
    arr.sort((a, b) => {
      const cmp = compareClientes(a, b, colSort);
      return dirSort === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [clientes, colSort, dirSort]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / PAGE_SIZE));
  const paginaSegura = Math.min(pagina, totalPaginas - 1);
  const slice = ordenados.slice(paginaSegura * PAGE_SIZE, paginaSegura * PAGE_SIZE + PAGE_SIZE);

  const handleSort = (col: ColumnaSort) => {
    if (col === colSort) {
      setDirSort((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setColSort(col);
      setDirSort('asc');
    }
    setPagina(0);
  };

  const renderSortIcon = (col: ColumnaSort) => {
    if (col !== colSort) return <ArrowUpDown size={11} className="text-gray-300" />;
    return dirSort === 'asc'
      ? <ArrowUp size={11} className="text-[#0f3460]" />
      : <ArrowDown size={11} className="text-[#0f3460]" />;
  };

  const todosVisiblesSeleccionados = slice.length > 0 && slice.every((c) => seleccionados.has(c.id));
  const handleToggleTodosVisibles = () => {
    if (todosVisiblesSeleccionados) {
      // Deseleccionar los visibles solamente.
      slice.forEach((c) => {
        if (seleccionados.has(c.id)) onToggleCliente(c.id);
      });
    } else {
      slice.forEach((c) => {
        if (!seleccionados.has(c.id)) onToggleCliente(c.id);
      });
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {ordenados.length.toLocaleString('es-DO')} cliente{ordenados.length === 1 ? '' : 's'}
          </p>
          <p className="text-[11px] text-gray-500">
            {seleccionados.size.toLocaleString('es-DO')} seleccionados
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSeleccionarTodos}
            className="text-xs px-2 py-1 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg transition-colors"
          >
            Seleccionar todos ({ordenados.length})
          </button>
          {seleccionados.size > 0 && (
            <button
              type="button"
              onClick={onLimpiarSeleccion}
              className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              Limpiar selección
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={todosVisiblesSeleccionados}
                  onChange={handleToggleTodosVisibles}
                  className="accent-[#0f3460]"
                  aria-label="Seleccionar todos los visibles"
                />
              </th>
              <th className="px-3 py-2 text-left">
                <button type="button" onClick={() => handleSort('nombre')} className="flex items-center gap-1 hover:text-[#0f3460]">
                  Nombre {renderSortIcon('nombre')}
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button type="button" onClick={() => handleSort('telefono')} className="flex items-center gap-1 hover:text-[#0f3460]">
                  Teléfono {renderSortIcon('telefono')}
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button type="button" onClick={() => handleSort('zona')} className="flex items-center gap-1 hover:text-[#0f3460]">
                  Zona {renderSortIcon('zona')}
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button type="button" onClick={() => handleSort('ultimoServicio')} className="flex items-center gap-1 hover:text-[#0f3460]">
                  Último servicio {renderSortIcon('ultimoServicio')}
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                Equipos
              </th>
              <th className="px-3 py-2 text-left">
                <button type="button" onClick={() => handleSort('totalServicios')} className="flex items-center gap-1 hover:text-[#0f3460]">
                  Total {renderSortIcon('totalServicios')}
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button type="button" onClick={() => handleSort('ultimaCampana')} className="flex items-center gap-1 hover:text-[#0f3460]">
                  Última campaña {renderSortIcon('ultimaCampana')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {slice.map((c) => {
              const checked = seleccionados.has(c.id);
              const enCool = idsCooldown.has(c.id);
              const equiposCsv = c.legacyMetricas?.equiposAtendidos || '';
              const equipos = equiposCsv.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 2).join(', ');
              return (
                <tr
                  key={c.id}
                  className={`border-t border-gray-100 hover:bg-gray-50 ${
                    checked ? 'bg-blue-50/40' : ''
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleCliente(c.id)}
                      className="accent-[#0f3460]"
                      aria-label={`Seleccionar ${c.nombre}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate max-w-[180px]">
                        {c.nombre || '—'}
                      </span>
                      {enCool && (
                        <span
                          title={`En cooldown (${cooldownDias} días). Override admin activo.`}
                          className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full"
                        >
                          <ShieldOff size={9} /> override
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                    {c.telefono ? formatTelefono(c.telefono) : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{c.zona || '—'}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{ultimoServicioLabel(c)}</td>
                  <td className="px-3 py-2 text-gray-600 text-[12px] truncate max-w-[150px]">
                    {equipos || '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{c.legacyMetricas?.totalServicios || 0}</td>
                  <td className="px-3 py-2 text-gray-600 text-[12px]">{ultimaCampanaLabel(c)}</td>
                </tr>
              );
            })}
            {slice.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-sm">
                  Sin resultados con los filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
          <span>
            Página {paginaSegura + 1} de {totalPaginas}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
              disabled={paginaSegura === 0}
              className="p-1 hover:bg-gray-100 rounded-lg disabled:opacity-40"
              aria-label="Página anterior"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
              disabled={paginaSegura >= totalPaginas - 1}
              className="p-1 hover:bg-gray-100 rounded-lg disabled:opacity-40"
              aria-label="Página siguiente"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
