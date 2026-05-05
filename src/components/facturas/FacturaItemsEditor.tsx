import { X } from 'lucide-react';
import { ItemCotizacion } from '../../types';

interface FacturaItemsEditorProps {
  items: ItemCotizacion[];
  onItemsChange: (items: ItemCotizacion[]) => void;
  disabled?: boolean;
}

/**
 * Editor inline de items de un Conduce de Garantía.
 *
 * C3a (split puro): mantiene el comportamiento exacto que tenía
 * `Facturas.tsx` antes del split — solo descripción + cantidad + precio,
 * sin selector de catálogo, sin vendedor por línea, sin modalidad.
 * Esos features entran en C3b.
 */
export default function FacturaItemsEditor({
  items,
  onItemsChange,
  disabled = false,
}: FacturaItemsEditorProps) {
  const addItem = () => {
    onItemsChange([...items, { descripcion: '', cantidad: 1, precio: 0 }]);
  };

  const removeItem = (i: number) => {
    onItemsChange(items.filter((_, idx) => idx !== i));
  };

  const updateItem = (
    i: number,
    field: keyof ItemCotizacion,
    value: string | number,
  ) => {
    onItemsChange(
      items.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)),
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">Items</label>
        <button
          type="button"
          onClick={addItem}
          disabled={disabled}
          className="text-xs text-[#1a5fa8] hover:underline font-medium disabled:opacity-60"
        >
          + Agregar item
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              type="text"
              value={item.descripcion}
              onChange={e => updateItem(i, 'descripcion', e.target.value)}
              placeholder="Descripción del servicio o pieza"
              disabled={disabled}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
            />
            <input
              type="number"
              value={item.cantidad}
              onChange={e => updateItem(i, 'cantidad', parseInt(e.target.value) || 0)}
              min={1}
              disabled={disabled}
              className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
            />
            <input
              type="number"
              value={item.precio}
              onChange={e => updateItem(i, 'precio', parseFloat(e.target.value) || 0)}
              placeholder="RD$"
              disabled={disabled}
              className="w-28 px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => removeItem(i)}
                disabled={disabled}
                className="p-2 hover:bg-red-50 rounded-lg text-red-500 disabled:opacity-60"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {/* Column labels */}
      <div className="flex gap-2 mt-1 text-[10px] text-gray-400 px-1">
        <span className="flex-1">Descripción</span>
        <span className="w-16 text-center">Cant.</span>
        <span className="w-28 text-center">Precio</span>
        {items.length > 1 && <span className="w-[38px]"></span>}
      </div>
    </div>
  );
}
