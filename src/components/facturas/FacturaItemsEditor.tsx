import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X, Plus, Pencil } from 'lucide-react';
import {
  ItemCotizacion,
  PiezaInventario,
  ServicioPrecio,
  Personal,
  Cliente,
} from '../../types';
import FacturaItemDetallesModal from './FacturaItemDetallesModal';

interface FacturaItemsEditorProps {
  items: ItemCotizacion[];
  onItemsChange: (items: ItemCotizacion[]) => void;
  catalogoServicios: ServicioPrecio[];
  catalogoPiezas: PiezaInventario[];
  tecnicos: Personal[];
  cliente: Cliente | null;
  /** Solo admin/coord pueden cambiar Mayoreo/Detalle (P3=b). */
  puedeOverrideModalidad: boolean;
  /**
   * IDs de técnicos a destacar en el dropdown del modal de detalles
   * (forwarded a `FacturaItemDetallesModal`). Útil cuando el editor se abre
   * desde una orden con técnico asignado.
   */
  tecnicosPrioritarios?: string[];
  disabled?: boolean;
}

/**
 * Editor inline de items de un Conduce de Garantía.
 *
 * C3b — features SIBS sobre el split:
 *  - Distingue items 'manual' (edición inline rápida: descripción + cant + precio)
 *    de items de Inventario (descripción readonly, modalidad y técnico vía modal).
 *  - Modal `FacturaItemDetallesModal` se abre para configurar líneas de Inventario.
 *  - Botón papelera con confirmación si la línea ya tiene técnico asignado
 *    (no borrar comisiones por accidente).
 *  - Botón "+ Agregar" con dropdown: Manual o de Inventario.
 *  - Quick-win 9: segmentado Mayoreo/Detalle dentro del modal.
 *
 * El editor NO abre listeners. Los catálogos y la lista de técnicos vienen
 * por props desde el padre (`FacturaCrearModal` / `Facturas.tsx`).
 */
export default function FacturaItemsEditor({
  items,
  onItemsChange,
  catalogoServicios,
  catalogoPiezas,
  tecnicos,
  cliente,
  puedeOverrideModalidad,
  tecnicosPrioritarios,
  disabled = false,
}: FacturaItemsEditorProps) {
  const [itemDetalleAbiertoIdx, setItemDetalleAbiertoIdx] = useState<number | null>(null);
  const [agregarMenuAbierto, setAgregarMenuAbierto] = useState(false);
  const agregarMenuRef = useRef<HTMLDivElement | null>(null);

  // Click-outside: cerrar dropdown "Agregar Manual / de Inventario" cuando
  // el usuario clickea fuera sin elegir. Sin esto el menú quedaba abierto
  // hasta que el user volvía a hacer click en el botón "Agregar".
  useEffect(() => {
    if (!agregarMenuAbierto) return;
    function handler(e: MouseEvent) {
      if (
        agregarMenuRef.current &&
        !agregarMenuRef.current.contains(e.target as Node)
      ) {
        setAgregarMenuAbierto(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [agregarMenuAbierto]);

  const updateItem = (
    i: number,
    field: keyof ItemCotizacion,
    value: string | number,
  ) => {
    onItemsChange(
      items.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)),
    );
  };

  const removeItem = (i: number) => {
    const item = items[i];
    if (item?.tecnicoId) {
      // Confirmación porque borrar la línea va a borrar la comisión asociada
      // al re-emitir/limpiar (no se borra todavía, pero al re-grabar el conduce
      // se recalculan las comisiones — y esta línea ya no aportará).
      if (!confirm(`Esta línea está asignada al técnico ${item.tecnicoNombre || ''}. Al guardar el conduce, NO se generará comisión por esta línea. ¿Confirmar eliminación?`)) {
        return;
      }
    }
    onItemsChange(items.filter((_, idx) => idx !== i));
  };

  const agregarManual = () => {
    onItemsChange([
      ...items,
      { descripcion: '', cantidad: 1, precio: 0, tipoItem: 'manual' },
    ]);
    setAgregarMenuAbierto(false);
  };

  const agregarInventario = () => {
    // Insertar item draft al final y abrir el modal apuntando a esa idx.
    const draft: ItemCotizacion = {
      descripcion: '',
      cantidad: 1,
      precio: 0,
      tipoItem: 'servicio',
    };
    const next = [...items, draft];
    onItemsChange(next);
    setItemDetalleAbiertoIdx(next.length - 1);
    setAgregarMenuAbierto(false);
  };

  const handleSaveDetalles = (idx: number) => (nuevoItem: ItemCotizacion) => {
    onItemsChange([...items.slice(0, idx), nuevoItem, ...items.slice(idx + 1)]);
    setItemDetalleAbiertoIdx(null);
  };

  const handleCancelDetalles = (idx: number) => () => {
    // Si el item es un draft vacío (recién agregado por "agregar de inventario"
    // y nunca se llegó a confirmar), lo removemos para no dejar fila huérfana.
    const item = items[idx];
    if (item && !item.servicioPrecioId && !item.piezaInventarioId && !item.descripcion) {
      onItemsChange(items.filter((_, i) => i !== idx));
    }
    setItemDetalleAbiertoIdx(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">Items</label>
        <div className="relative" ref={agregarMenuRef}>
          <button
            type="button"
            onClick={() => setAgregarMenuAbierto(o => !o)}
            disabled={disabled}
            className="flex items-center gap-1 text-xs text-[#1a5fa8] hover:underline font-medium disabled:opacity-60"
          >
            <Plus size={12} /> Agregar <ChevronDown size={12} />
          </button>
          {agregarMenuAbierto && (
            <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[180px]">
              <button
                type="button"
                onClick={agregarManual}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors"
              >
                + Agregar Manual
              </button>
              <button
                type="button"
                onClick={agregarInventario}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors border-t border-gray-100"
              >
                + Agregar de Inventario
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {items.map((item, i) => {
          const esInventario = item.tipoItem === 'servicio' || item.tipoItem === 'pieza';
          // SPRINT-132: (t.uid || t.id) — item.tecnicoId puede ser auth.uid post-c4be345.
          const tecnico = item.tecnicoId
            ? tecnicos.find(t => (t.uid || t.id) === item.tecnicoId)
            : null;
          return (
            <div
              key={i}
              className={`flex flex-col gap-1.5 p-2 rounded-lg border ${
                esInventario ? 'bg-green-50/30 border-green-100' : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex gap-2 items-center">
                {/* Chip tipo */}
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                    esInventario
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                  title={esInventario ? 'Inventario' : 'Manual'}
                >
                  {esInventario ? 'Inv' : 'Lib'}
                </span>

                {/* Descripción: readonly para Inventario, editable para Manual */}
                {esInventario ? (
                  <span className="flex-1 px-2 py-1.5 text-sm text-gray-900 truncate">
                    {item.descripcion || <span className="text-gray-400 italic">Sin seleccionar</span>}
                  </span>
                ) : (
                  <input
                    type="text"
                    value={item.descripcion}
                    onChange={e => updateItem(i, 'descripcion', e.target.value)}
                    placeholder="Descripción del item manual"
                    disabled={disabled}
                    className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
                  />
                )}

                {/* Cantidad — siempre editable inline */}
                <input
                  type="number"
                  value={item.cantidad}
                  onChange={e => updateItem(i, 'cantidad', parseInt(e.target.value) || 0)}
                  min={1}
                  disabled={disabled}
                  className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
                />

                {/* Precio — siempre editable inline */}
                <input
                  type="number"
                  value={item.precio}
                  onChange={e => updateItem(i, 'precio', parseFloat(e.target.value) || 0)}
                  placeholder="RD$"
                  disabled={disabled}
                  className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
                />

                {/* Botón editar (solo Inventario) */}
                {esInventario && (
                  <button
                    type="button"
                    onClick={() => setItemDetalleAbiertoIdx(i)}
                    disabled={disabled}
                    title="Cambiar modalidad o técnico"
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 disabled:opacity-60"
                  >
                    <Pencil size={13} />
                  </button>
                )}

                {/* Botón eliminar */}
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  disabled={disabled}
                  title="Eliminar item"
                  className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 disabled:opacity-60"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Sub-fila: modalidad + técnico (solo Inventario) */}
              {esInventario && (
                <div className="flex items-center gap-2 pl-7 text-[11px] text-gray-600">
                  {item.precioModalidad && (
                    <span className={`px-2 py-0.5 rounded-full font-medium ${
                      item.precioModalidad === 'mayoreo'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {item.precioModalidad === 'mayoreo' ? 'Mayoreo' : 'Detalle'}
                    </span>
                  )}
                  <span className="text-gray-500">
                    {tecnico
                      ? <>Técnico: <strong className="text-gray-800">{tecnico.nombre}</strong></>
                      : <span className="italic text-gray-400">Sin técnico (mostrador)</span>}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
            Aún no hay items. Usá el botón "+ Agregar".
          </p>
        )}
      </div>

      {/* Modal de detalles para item de Inventario */}
      {itemDetalleAbiertoIdx !== null && items[itemDetalleAbiertoIdx] && (
        <FacturaItemDetallesModal
          open
          item={items[itemDetalleAbiertoIdx]}
          catalogoPiezas={catalogoPiezas}
          catalogoServicios={catalogoServicios}
          tecnicos={tecnicos}
          cliente={cliente}
          puedeOverrideModalidad={puedeOverrideModalidad}
          tecnicosPrioritarios={tecnicosPrioritarios}
          onSave={handleSaveDetalles(itemDetalleAbiertoIdx)}
          onCancel={handleCancelDetalles(itemDetalleAbiertoIdx)}
        />
      )}
    </div>
  );
}
