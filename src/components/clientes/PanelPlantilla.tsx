import { useMemo } from 'react';
import { AlertTriangle, FileText, Eye } from 'lucide-react';
import { Cliente, PlantillaMarketing } from '../../types';
import { renderizarPlantilla, variablesEnFallback } from '../../utils/plantillaRender';

interface Props {
  /** Plantillas activas (ya filtradas en el caller). */
  plantillas: PlantillaMarketing[];
  plantillaSeleccionadaId: string | null;
  onChangePlantilla: (id: string) => void;
  /** Primer cliente seleccionado — la plantilla se previsualiza con sus datos. */
  clienteParaPreview: Cliente | null;
}

/**
 * Selector de plantilla + preview en vivo. Si una variable se va a
 * renderizar con su fallback (ej: `equipoTipo` → "tu equipo" porque el
 * cliente no tiene `legacyMetricas`), mostramos warning en azul.
 */
export default function PanelPlantilla({
  plantillas,
  plantillaSeleccionadaId,
  onChangePlantilla,
  clienteParaPreview,
}: Props) {
  const plantillaActiva = useMemo(
    () => plantillas.find((p) => p.id === plantillaSeleccionadaId) || null,
    [plantillas, plantillaSeleccionadaId],
  );

  const previewTexto = useMemo(() => {
    if (!plantillaActiva) return '';
    if (!clienteParaPreview) return plantillaActiva.mensaje;
    return renderizarPlantilla(plantillaActiva.mensaje, clienteParaPreview);
  }, [plantillaActiva, clienteParaPreview]);

  const fallbacks = useMemo(() => {
    if (!plantillaActiva || !clienteParaPreview) return [];
    return variablesEnFallback(plantillaActiva.mensaje, clienteParaPreview);
  }, [plantillaActiva, clienteParaPreview]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText size={14} className="text-[#0f3460]" />
        <h3 className="text-sm font-semibold text-gray-900">Plantilla</h3>
      </div>

      {plantillas.length === 0 ? (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          No hay plantillas activas. Pedile a un admin que cree una en
          <span className="font-mono">/admin/configuracion-marketing</span>.
        </div>
      ) : (
        <select
          value={plantillaSeleccionadaId || ''}
          onChange={(e) => onChangePlantilla(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
        >
          {plantillas.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      )}

      {plantillaActiva && (
        <>
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold flex items-center gap-1 mb-1">
              <Eye size={10} /> Preview
              {clienteParaPreview && (
                <span className="ml-1 normal-case font-normal text-gray-400">
                  · con datos de {clienteParaPreview.nombre.trim().split(/\s+/)[0]}
                </span>
              )}
            </p>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-line min-h-[80px]">
              {previewTexto || (
                <span className="text-gray-400 italic">
                  Seleccioná un cliente para ver el preview con sus datos.
                </span>
              )}
            </div>
          </div>

          {fallbacks.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-[11px] text-blue-800 flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Variables con fallback:</p>
                <p className="mt-0.5">
                  {fallbacks.map((v) => `{${v}}`).join(', ')} — el cliente no tiene este dato,
                  se usa el valor por defecto.
                </p>
              </div>
            </div>
          )}

          <details className="text-[11px] text-gray-500">
            <summary className="cursor-pointer hover:text-gray-700">
              Ver mensaje original
            </summary>
            <pre className="mt-1 p-2 bg-gray-50 border border-gray-100 rounded font-mono text-[10px] whitespace-pre-wrap">
              {plantillaActiva.mensaje}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
