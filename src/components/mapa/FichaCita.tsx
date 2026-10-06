/**
 * FichaCita.tsx — detalle de una cita o de una orden abierta sin fecha.
 *
 * Si la orden tiene `fechaCita`, construimos el `CitaMapa` arriba. Si no la
 * tiene, se pasa `orden` con `cita=null` y la ficha pinta un formato mínimo
 * (cliente/técnico/motivo/pieza/abrir orden) sin inventar fechas.
 *
 * Todas las fechas humanas se formatean en zona RD con `componentesRD`
 * (sin `date-fns/format` que usa la zona del dispositivo).
 */
import { ArrowLeft, Edit2, MapPin, Phone, Repeat, Clock, User, Wrench, ExternalLink } from 'lucide-react';
import type { OrdenServicio, Personal, StandbyPieza } from '../../types';
import { faseLabel, formatTelefono } from '../../utils';
import type { CitaMapa, Parada } from '../../utils/mapaOperaciones';
import { hora12 } from '../../utils/mapaOperaciones';
import { tieneCoord } from '../../utils/geo';
import { componentesRD } from '../../utils/mapaFechas';
import WhatsAppIcon from '../icons/WhatsAppIcon';

interface Props {
  /** Si viene, pintamos ficha completa; si es null requerimos `orden` para pintar la ficha mínima. */
  cita: CitaMapa | null;
  orden: OrdenServicio | null;
  parada: Parada | null;
  tecnico: Personal | null;
  piezasStandby?: StandbyPieza[];
  puedeEditar: boolean;
  puedeReasignar: boolean;
  avisoFueraRango?: string | null;
  onCerrar: () => void;
  onEditar: () => void;
  onReasignar: () => void;
  onVerRuta: () => void;
  onAvisarWhatsApp: () => void;
  onAbrirEnOrdenes: () => void;
}

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function fechaCivilRD(d: Date): string {
  const c = componentesRD(d);
  return `${DIAS_SEMANA[c.diaSemana]} ${c.dia} ${MESES[c.mes]}`;
}

export default function FichaCita({
  cita,
  orden,
  parada,
  tecnico,
  piezasStandby,
  puedeEditar,
  puedeReasignar,
  avisoFueraRango,
  onCerrar,
  onEditar,
  onReasignar,
  onVerRuta,
  onAvisarWhatsApp,
  onAbrirEnOrdenes,
}: Props) {
  const telefono = orden?.clienteTelefono || '';
  const direccion = orden?.clienteDireccion || '';
  const destino = tieneCoord(cita) ? `${cita.lat},${cita.lng}` : direccion;
  const nombreCliente = cita?.clienteNombre || orden?.clienteNombre || 'Sin cliente';

  if (!cita) {
    // Ficha mínima para orden sin fecha de cita.
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
            <div className="truncate text-base font-semibold text-gray-900">{nombreCliente}</div>
            <div className="truncate text-xs text-gray-500">
              {orden?.numero ? `#${orden.numero} · ` : ''}
              {orden?.equipoTipo || 'Equipo'}
              {orden?.equipoMarca ? ` · ${orden.equipoMarca}` : ''}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 text-sm text-gray-700">
          <div role="status" className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
            Orden abierta sin fecha de cita asignada.
          </div>
          <dl className="space-y-2">
            <div className="flex items-start gap-2">
              <User size={14} className="mt-0.5 text-gray-500" aria-hidden="true" />
              <div>{tecnico?.nombre || orden?.tecnicoNombre || orden?.tecnicoId || 'Sin asignar'}</div>
            </div>
            <div className="flex items-start gap-2">
              <Wrench size={14} className="mt-0.5 text-gray-500" aria-hidden="true" />
              <div>{orden?.motivoChequeo || orden?.descripcionFalla || 'Sin motivo'}</div>
            </div>
            {piezasStandby?.length ? (
              <div className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
                Esperando: {piezasStandby.map((s) => s.piezaFaltante).filter(Boolean).join(', ')}
              </div>
            ) : null}
            {telefono && (
              <div className="flex items-start gap-2">
                <Phone size={14} className="mt-0.5 text-gray-500" aria-hidden="true" />
                <div>{formatTelefono(telefono)}</div>
              </div>
            )}
          </dl>
        </div>
        <div className="grid gap-2 border-t border-gray-200 bg-white p-2">
          <button
            type="button"
            onClick={onAbrirEnOrdenes}
            className="inline-flex min-h-[48px] items-center justify-center gap-1 rounded-md bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <ExternalLink size={14} /> Abrir en Órdenes
          </button>
        </div>
      </div>
    );
  }

  const estadoLegible = parada
    ? parada.estado === 'hecha'
      ? 'Hecha'
      : parada.estado === 'en_sitio'
      ? parada.segunGPS
        ? 'En sitio (según GPS)'
        : 'En sitio'
      : parada.estado === 'en_camino'
      ? 'En camino'
      : 'Pendiente'
    : faseLabel(cita.fase);

  const horaCita = cita.inicio ? hora12(cita.inicio) : '—';
  const horaLlegadaEstimada = parada?.llega ? hora12(parada.llega) : null;

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
          {/* Nombre del cliente primero */}
          <div className="truncate text-base font-semibold text-gray-900">{cita.clienteNombre}</div>
          <div className="truncate text-xs text-gray-500">
            {orden?.numero ? `#${orden.numero} · ` : ''}
            {orden?.equipoTipo || cita.equipo || 'Equipo'}
            {orden?.equipoMarca ? ` · ${orden.equipoMarca}` : ''}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {avisoFueraRango && (
          <div role="status" className="mb-2 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800">
            {avisoFueraRango}
          </div>
        )}
        <dl className="space-y-2 text-sm text-gray-700">
          <div className="flex items-start gap-2">
            <Clock size={14} className="mt-0.5 text-gray-500" aria-hidden="true" />
            <div>
              <div>
                <span className="font-medium">{horaCita}</span>
                {cita.inicio ? ` · ${fechaCivilRD(cita.inicio)}` : ''}
              </div>
              <div className="text-xs text-gray-500">Estado: {estadoLegible}</div>
              {horaLlegadaEstimada && parada?.estado !== 'hecha' && (
                <div className="text-xs text-gray-500">
                  Llega aprox. {horaLlegadaEstimada}
                  {parada && parada.tardeMin > 10 ? ` · ${parada.tardeMin} min tarde` : ''}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <User size={14} className="mt-0.5 text-gray-500" aria-hidden="true" />
            <div>
              <div>{tecnico?.nombre || cita.tecnicoId || 'Sin asignar'}</div>
              {tecnico?.operariaNombre && <div className="text-xs text-gray-500">Equipo de {tecnico.operariaNombre}</div>}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Wrench size={14} className="mt-0.5 text-gray-500" aria-hidden="true" />
            <div>
              <div>{orden?.descripcionFalla || 'Sin descripción'}</div>
            </div>
          </div>
          {direccion && (
            <div className="flex items-start gap-2">
              <MapPin size={14} className="mt-0.5 text-gray-500" aria-hidden="true" />
              <div className="text-sm">{direccion}</div>
            </div>
          )}
          {telefono && (
            <div className="flex items-start gap-2">
              <Phone size={14} className="mt-0.5 text-gray-500" aria-hidden="true" />
              <div>{formatTelefono(telefono)}</div>
            </div>
          )}
          {cita.progreso.standby && (
            <div className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
              Esta orden está en stand-by (pieza).
              {piezasStandby?.length ? ` Esperando: ${piezasStandby.map((s) => s.piezaFaltante).filter(Boolean).join(', ')}.` : ''}
            </div>
          )}
          {cita.progreso.garantia && (
            <div className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">
              Visita de garantía.
            </div>
          )}
        </dl>
      </div>

      <div className="grid gap-2 border-t border-gray-200 bg-white p-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onVerRuta}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-md bg-brand-600 text-sm font-medium text-white hover:bg-brand-700"
          >
            Ver ruta del técnico
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {telefono && (
            <button
              type="button"
              onClick={onAvisarWhatsApp}
              className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
            >
              <WhatsAppIcon /> Avisar
            </button>
          )}
          {destino && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <MapPin size={14} /> Cómo llegar
            </a>
          )}
          {puedeEditar && (
            <button
              type="button"
              onClick={onEditar}
              className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Edit2 size={14} /> Editar
            </button>
          )}
          {puedeReasignar && (
            <button
              type="button"
              onClick={onReasignar}
              className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Repeat size={14} /> Reasignar
            </button>
          )}
        </div>
        <button type="button" onClick={onAbrirEnOrdenes} className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-brand-700 hover:bg-gray-50">
          <ExternalLink size={14} /> Abrir orden completa
        </button>
      </div>
    </div>
  );
}
