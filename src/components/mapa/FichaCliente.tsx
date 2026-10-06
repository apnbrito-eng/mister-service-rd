/**
 * FichaCliente.tsx — ficha de la capa de clientes del mapa.
 * Lee el modelo Cliente existente, muestra direcciones alternativas con coords
 * (cada punto es independiente en el mapa) y las acciones comunes: nueva orden,
 * cómo llegar, WhatsApp, llamar. NO duplica el conteo cliente.
 */
import { Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Phone, Plus } from 'lucide-react';
import type { Cliente } from '../../types';
import { formatTelefono } from '../../utils';
import { tieneCoord } from '../../utils/geo';
import WhatsAppIcon from '../icons/WhatsAppIcon';

interface Props {
  cliente: Cliente;
  onCerrar: () => void;
  onNuevaOrden: () => void;
  puedeCrear?: boolean;
  onAbrirWhatsApp: () => void;
}

export default function FichaCliente({ cliente, onCerrar, onNuevaOrden, puedeCrear = false, onAbrirWhatsApp }: Props) {
  const telefono = cliente.telefono || '';
  const direccion = cliente.direccion || '';
  const direccionesAlternas = cliente.direcciones ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
        <button
          type="button"
          onClick={onCerrar}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-gray-700 hover:bg-gray-100"
          aria-label="Volver"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-gray-900">{cliente.nombre}</div>
          <div className="truncate text-xs text-gray-500">
            {cliente.sector || cliente.zona || 'Sin sector'}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 text-sm text-gray-700">
        {telefono && (
          <div className="flex items-start gap-2 py-1">
            <Phone size={14} className="mt-0.5 text-gray-500" />
            <div>{formatTelefono(telefono)}</div>
          </div>
        )}
        {direccion && (
          <div className="flex items-start gap-2 py-1">
            <MapPin size={14} className="mt-0.5 text-gray-500" />
            <div>
              <div>{direccion}</div>
              <div className="text-xs text-gray-500">Principal</div>
            </div>
          </div>
        )}
        {direccionesAlternas.length > 0 && (
          <section className="mt-2">
            <div className="mb-1 text-xs uppercase tracking-wide text-gray-500">
              Direcciones alternas
            </div>
            <ul className="space-y-1">
              {direccionesAlternas.map((d) => (
                <li key={d.id} className="flex items-start gap-2 rounded-md border border-gray-100 bg-white px-2 py-1">
                  <MapPin size={14} className="mt-0.5 text-gray-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{d.direccion}</div>
                    <div className="truncate text-xs text-gray-500">{d.etiqueta}</div>
                    {tieneCoord(d) ? <a className="inline-flex min-h-[44px] items-center text-brand-700 underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`}>Cómo llegar</a> : <span className="text-xs text-amber-800">Sin coordenadas registradas</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {cliente.legacyMetricas && (
          <section className="mt-3 rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600">
            <div>Servicios del historial importado: {cliente.legacyMetricas.totalServicios}</div>
            {cliente.legacyMetricas.fechaUltimoServicio && (
              <div>Último servicio del historial importado: {cliente.legacyMetricas.fechaUltimoServicio}</div>
            )}
          </section>
        )}
      </div>

      <div className="grid gap-2 border-t border-gray-200 bg-white p-2">
        <Link className="flex min-h-[44px] items-center justify-center rounded-md border text-sm font-semibold text-brand-700" to={`/admin/clientes?id=${encodeURIComponent(cliente.id)}`}>Ficha completa e historial</Link>
        {puedeCrear && <button
          type="button"
          onClick={onNuevaOrden}
          className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md bg-brand-600 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus size={14} /> Nueva orden
        </button>}
        <div className="grid grid-cols-2 gap-2">
          {telefono && (
            <button
              type="button"
              onClick={onAbrirWhatsApp}
              className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
            >
              <WhatsAppIcon /> WhatsApp
            </button>
          )}
          {telefono && (
            <a
              href={`tel:${telefono}`}
              className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Phone size={14} /> Llamar
            </a>
          )}
          {direccion && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(direccion)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <MapPin size={14} /> Cómo llegar
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
