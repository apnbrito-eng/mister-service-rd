import type { OrdenServicio, Factura } from '../../types';
import { formatMoneda, formatFechaCorta, formatearEquipoLabel } from '../../utils';
import { AlertTriangle, CheckCircle2, XCircle, MinusCircle, Camera, Trash2, StickyNote } from 'lucide-react';

interface Props {
  orden: OrdenServicio | null | undefined;
  variant?: 'compacto' | 'completo';
  /**
   * SPRINT-153 (2026-05-12) — factura asociada al conduce.
   * Cuando está presente, habilita:
   *  - Render del bloque "Nota del conduce" si `factura.notaConduce` existe (Bug 1).
   *  - Fallback del período de garantía cuando `orden.periodoGarantiaDias`
   *    no está hidratado pero la factura tiene `garantia.tiempoDias` (Bug 2).
   */
  factura?: Factura | null;
}

/**
 * SPRINT-148 — Display read-only del contexto de la orden original
 * detrás de un conduce de garantía. Se monta en:
 *  1. Fila expandida de Facturas.tsx (variant='compacto')
 *  2. Modal "Marcar garantía manual" en Facturas.tsx (variant='completo')
 *
 * Sin acciones, sin escrituras a Firestore. Lee shape nuevo
 * (`cierreServicio.piezasUsadas`, `equipoFunciona`, `clienteSatisfecho`,
 * `revisoConexiones`, `fotoCierre`, `tipoCierre`, `periodoGarantiaDias`,
 * `garantiaVencimiento`) y soporta shape legacy (`piezasRetiradas`,
 * `checklist`, `satisfaccionCliente`) en sección colapsable.
 *
 * SPRINT-153 (2026-05-12) — recibe opcionalmente `factura` para renderizar
 * la nota del conduce y proveer fallback del período de garantía.
 */
export default function OrdenResumenLectura({ orden, variant = 'completo', factura }: Props) {
  if (!orden) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500 italic">
        Orden original no disponible.
      </div>
    );
  }

  const cierre = orden.cierreServicio;
  const esSoloChequeo = orden.tipoCierre === 'solo_chequeo' || orden.soloChequeo === true;
  const equipoLabel = formatearEquipoLabel({
    equipoTipo: orden.equipoTipo,
    equipoMarca: orden.equipoMarca,
    equipoModelo: orden.equipoModelo,
    equipoTipoMotor: orden.equipoTipoMotor,
  });

  // Piezas: prioriza shape nuevo (`piezasUsadas`), fallback a totales agregados.
  const piezasUsadas = Array.isArray(cierre?.piezasUsadas) ? cierre!.piezasUsadas! : [];
  const costoPiezasFallback = typeof orden.costoPiezasTotal === 'number' ? orden.costoPiezasTotal : null;
  const cantidadPiezasFallback = typeof orden.cantidadPiezasUsadas === 'number' ? orden.cantidadPiezasUsadas : null;

  // Fecha de vencimiento de garantía con días restantes.
  // SPRINT-153: si `orden.garantiaVencimiento` falta pero la factura asociada
  // tiene `garantia.finFecha`, usamos esa como fallback. Lo mismo para
  // `periodoGarantiaDias` → `factura.garantia.tiempoDias`.
  const periodoGarantiaDias = typeof orden.periodoGarantiaDias === 'number'
    ? orden.periodoGarantiaDias
    : typeof factura?.garantia?.tiempoDias === 'number'
      ? factura.garantia.tiempoDias
      : null;
  const garantiaVenc = orden.garantiaVencimiento
    ? toDate(orden.garantiaVencimiento)
    : factura?.garantia?.finFecha
      ? toDate(factura.garantia.finFecha)
      : null;
  const periodoDesdeFactura =
    typeof orden.periodoGarantiaDias !== 'number' &&
    typeof factura?.garantia?.tiempoDias === 'number';
  const diasRestantes = garantiaVenc
    ? Math.ceil((garantiaVenc.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  // Detección de shape legacy (para sección colapsable).
  const tieneLegacy = !!(
    (Array.isArray(cierre?.piezasRetiradas) && cierre!.piezasRetiradas!.length > 0) ||
    (Array.isArray(cierre?.checklist) && cierre!.checklist!.length > 0) ||
    typeof cierre?.satisfaccionCliente === 'number'
  );

  const gridClass = variant === 'compacto'
    ? 'grid grid-cols-1 md:grid-cols-2 gap-3'
    : 'grid grid-cols-1 gap-3';

  return (
    <div className="text-sm text-gray-800 space-y-3">
      {/* Badges prominentes arriba */}
      <div className="flex flex-wrap items-center gap-2">
        {esSoloChequeo && (
          <span className="inline-flex items-center gap-1.5 bg-amber-100 border border-amber-300 text-amber-900 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">
            <AlertTriangle size={14} />
            Solo chequeo · sin reparación
          </span>
        )}
        {orden.eliminada && (
          <span className="inline-flex items-center gap-1.5 bg-red-100 border border-red-300 text-red-900 px-3 py-1 rounded-full text-[11px] font-semibold uppercase">
            <Trash2 size={12} />
            Orden eliminada
          </span>
        )}
        {orden.esGarantia && (
          <span className="inline-flex items-center gap-1.5 bg-purple-100 border border-purple-300 text-purple-900 px-3 py-1 rounded-full text-[11px] font-semibold uppercase">
            Visita de garantía
          </span>
        )}
      </div>

      {/* Encabezado (solo en variant 'completo' — en 'compacto' la card padre ya lo muestra) */}
      {variant === 'completo' && (
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="font-semibold text-gray-900">{orden.numero}</div>
            <div className="text-xs text-gray-500">
              {cierre?.fechaCierre ? `Cerrada ${formatFechaCorta(toDate(cierre.fechaCierre))}` : 'Sin cierre registrado'}
            </div>
          </div>
          <div className="text-xs text-gray-600 mt-1">
            <span className="font-medium">Cliente:</span> {orden.clienteNombre}
            {orden.tecnicoNombre && (
              <>
                <span className="mx-2 text-gray-300">·</span>
                <span className="font-medium">Técnico:</span> {orden.tecnicoNombre}
              </>
            )}
          </div>
        </div>
      )}

      <div className={gridClass}>
        {/* Equipo */}
        <Bloque titulo="Equipo">
          <div className="text-gray-800">{equipoLabel || <Sin />}</div>
        </Bloque>

        {/* Falla reportada */}
        <Bloque titulo="Falla reportada">
          <div className="text-gray-800 whitespace-pre-wrap">{orden.descripcionFalla || <Sin />}</div>
        </Bloque>

        {/* Fecha de cita original */}
        <Bloque titulo="Fecha de cita original">
          <div className="text-gray-800">
            {orden.fechaCita ? formatFechaCorta(toDate(orden.fechaCita)) : <Sin />}
          </div>
        </Bloque>

        {/* Período de garantía */}
        <Bloque titulo="Período de garantía">
          {periodoGarantiaDias !== null && garantiaVenc ? (
            <div className="text-gray-800">
              {periodoGarantiaDias} días
              <span className="mx-1 text-gray-400">·</span>
              vence el {formatFechaCorta(garantiaVenc)}
              {diasRestantes !== null && (
                <span className={`ml-1.5 text-[11px] font-medium ${diasRestantes >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ({diasRestantes >= 0 ? `faltan ${diasRestantes} días` : `venció hace ${Math.abs(diasRestantes)} días`})
                </span>
              )}
              {periodoDesdeFactura && (
                <span className="ml-1.5 text-[10px] text-gray-500 italic">
                  (según conduce emitido)
                </span>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic">
              No configurado (orden previa al SPRINT-135a-UI)
            </div>
          )}
        </Bloque>
      </div>

      {/* Cierre del técnico */}
      {cierre && (
        <Bloque titulo="Cierre del técnico">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <CheckRow label="Equipo funciona" valor={cierre.equipoFunciona} />
            <CheckRow label="Cliente satisfecho" valor={cierre.clienteSatisfecho} />
            <CheckRow label="Revisó conexiones" valor={cierre.revisoConexiones} />
          </div>
          {cierre.fotoCierre?.url && (
            <a
              href={cierre.fotoCierre.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 underline"
            >
              <Camera size={14} />
              Ver foto del cierre
            </a>
          )}
        </Bloque>
      )}

      {/* Piezas utilizadas (shape nuevo) */}
      <Bloque titulo="Piezas utilizadas">
        {piezasUsadas.length > 0 ? (
          <div className="space-y-1.5">
            {piezasUsadas.map((p) => {
              const total = p.cantidad * (p.costoUnitario ?? 0);
              return (
                <div key={p.id} className="flex items-center justify-between text-xs gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-800 font-medium">{p.nombre}</span>
                    {p.marca && <span className="ml-1 text-gray-500">· {p.marca}</span>}
                    {p.modelo && <span className="ml-1 text-gray-500">· {p.modelo}</span>}
                    <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-600 px-1.5 rounded-full">
                      {p.condicion}
                    </span>
                  </div>
                  <div className="text-gray-500 whitespace-nowrap">
                    {p.cantidad} × {formatMoneda(p.costoUnitario ?? 0)}
                  </div>
                  <div className="font-semibold text-gray-900 w-20 text-right">{formatMoneda(total)}</div>
                </div>
              );
            })}
          </div>
        ) : costoPiezasFallback !== null || cantidadPiezasFallback !== null ? (
          <div className="text-xs text-gray-600">
            {cantidadPiezasFallback !== null && <>Cantidad: {cantidadPiezasFallback}</>}
            {costoPiezasFallback !== null && (
              <>
                {cantidadPiezasFallback !== null && <span className="mx-2 text-gray-300">·</span>}
                Costo total: {formatMoneda(costoPiezasFallback)}
              </>
            )}
          </div>
        ) : (
          <div className="text-xs text-gray-500 italic">Sin piezas</div>
        )}
      </Bloque>

      {/* Notas del técnico */}
      {orden.notasTecnico && (
        <Bloque titulo="Notas del técnico">
          <div className="text-xs text-gray-700 whitespace-pre-wrap">{orden.notasTecnico}</div>
        </Bloque>
      )}

      {/* SPRINT-153 — Nota del conduce (texto que la operaria escribió al
          emitirlo, persistido en factura.notaConduce desde SPRINT-151).
          Render diferenciado con fondo gris claro y borde para no confundirlo
          con "Notas del técnico" (que viene del flujo de cierre). */}
      {factura?.notaConduce && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            <StickyNote size={12} />
            <span>Nota del conduce</span>
          </div>
          <div className="text-xs text-gray-700 whitespace-pre-wrap">
            {factura.notaConduce}
          </div>
        </div>
      )}

      {/* Datos legacy del cierre (colapsable) */}
      {tieneLegacy && (
        <details className="bg-gray-50 border border-gray-200 rounded-xl">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:bg-gray-100 rounded-xl">
            Datos legacy del cierre
          </summary>
          <div className="px-3 pb-3 pt-1 text-xs space-y-2">
            {typeof cierre?.satisfaccionCliente === 'number' && (
              <div>
                <span className="text-gray-500">Satisfacción del cliente: </span>
                <span className="text-gray-800 font-semibold">{cierre.satisfaccionCliente}/5</span>
              </div>
            )}
            {Array.isArray(cierre?.piezasRetiradas) && cierre!.piezasRetiradas!.length > 0 && (
              <div>
                <div className="text-gray-500 mb-1">Piezas retiradas (legacy):</div>
                <ul className="list-disc ml-5 text-gray-700">
                  {cierre!.piezasRetiradas!.map((p, i) => (
                    <li key={i}>
                      {p.descripcion || '—'}
                      <span className="text-gray-400"> · destino: {p.destino}</span>
                      {p.motivoDetalle && <span className="text-gray-400"> · {p.motivoDetalle}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(cierre?.checklist) && cierre!.checklist!.length > 0 && (
              <div>
                <div className="text-gray-500 mb-1">Checklist (legacy):</div>
                <ul className="list-disc ml-5 text-gray-700">
                  {cierre!.checklist!.map((c) => (
                    <li key={c.id}>
                      {c.pregunta}
                      {c.respuesta && <>: <span className="text-gray-500">{c.respuesta === 'si' ? 'Sí' : 'No'}</span></>}
                      {c.explicacion && <span className="text-gray-400"> — {c.explicacion}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

// ─── Sub-componentes locales ───────────────────────────────────────────────

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {titulo}
      </div>
      {children}
    </div>
  );
}

function CheckRow({ label, valor }: { label: string; valor?: boolean }) {
  if (typeof valor !== 'boolean') {
    return (
      <span className="inline-flex items-center gap-1 text-gray-400">
        <MinusCircle size={14} />
        <span>{label}: sin dato</span>
      </span>
    );
  }
  return valor ? (
    <span className="inline-flex items-center gap-1 text-emerald-700">
      <CheckCircle2 size={14} />
      <span>{label}: Sí</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-red-700">
      <XCircle size={14} />
      <span>{label}: No</span>
    </span>
  );
}

function Sin() {
  return <span className="text-gray-400 italic">—</span>;
}

// ─── Helper local ──────────────────────────────────────────────────────────

function toDate(v: Date | { toDate(): Date } | null | undefined): Date {
  if (!v) return new Date(0);
  if (v instanceof Date) return v;
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate(): Date }).toDate();
  }
  return new Date(0);
}
