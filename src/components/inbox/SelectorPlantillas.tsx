import { useEffect, useMemo, useState } from 'react';
import { FileText, X, Send, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { enviarPlantilla } from '../../services/whatsapp.service';
import { buscarClientePorTelefono } from '../../services/clientes.service';
import { obtenerOrdenesActivasPorTelefono } from '../../services/ordenes.service';
import type { Cliente, OrdenServicio } from '../../types';
import {
  PLANTILLAS_WHATSAPP,
  autopopularValor,
  type PlantillaCatalogo,
} from '../../config/plantillasWhatsApp';

/**
 * SelectorPlantillas — botón + modal para enviar una plantilla HSM aprobada
 * por Meta (SPRINT-INBOX-7-SELECTOR-PLANTILLAS, 2026-05-21).
 *
 * Cuándo se usa:
 *   - La ventana 24h de la conversación está cerrada (sólo HSM permite reabrir).
 *   - El operador quiere mandar un mensaje formal sin esperar respuesta.
 *
 * Flujo:
 *   1) Carga cliente + orden activa (por wa_id) para auto-popular variables.
 *   2) Mini-wizard de variables: cada una con label + hint + valor inicial.
 *   3) Al confirmar: llama `enviarPlantilla(wa_id, nombre, idioma, variables,
 *      { ordenId })`. El mensaje saliente aparece en el timeline por el
 *      onSnapshot existente.
 *
 * No escribe Firestore directamente — todo va por `whatsapp.service`.
 * No toca rules. No toca el endpoint.
 */

interface Props {
  waId: string;
}

export default function SelectorPlantillas({ waId }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [plantillaElegida, setPlantillaElegida] = useState<PlantillaCatalogo | null>(null);
  const [variables, setVariables] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  // Contexto del cliente para auto-popular variables.
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [ordenActiva, setOrdenActiva] = useState<OrdenServicio | null>(null);
  const [cargandoContexto, setCargandoContexto] = useState(false);

  // Cargar contexto sólo al abrir el modal — evita queries innecesarias.
  useEffect(() => {
    if (!abierto) return;
    let cancelado = false;
    setCargandoContexto(true);
    (async () => {
      try {
        const c = await buscarClientePorTelefono(waId);
        if (cancelado) return;
        setCliente(c?.data ?? null);
        const ords = await obtenerOrdenesActivasPorTelefono(waId);
        if (cancelado) return;
        // Preferimos la orden mas reciente activa (la lista ya viene sorted desc).
        setOrdenActiva(ords[0] ?? null);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[SelectorPlantillas] carga contexto falló:', err);
        if (!cancelado) {
          setCliente(null);
          setOrdenActiva(null);
        }
      } finally {
        if (!cancelado) setCargandoContexto(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [abierto, waId]);

  // Cuando se elige plantilla, precargar variables desde el contexto.
  useEffect(() => {
    if (!plantillaElegida) {
      setVariables([]);
      return;
    }
    const iniciales = plantillaElegida.variables.map((v) =>
      autopopularValor(v, { cliente, orden: ordenActiva }),
    );
    setVariables(iniciales);
  }, [plantillaElegida, cliente, ordenActiva]);

  const puedeEnviar = useMemo(() => {
    if (!plantillaElegida || enviando) return false;
    return plantillaElegida.variables.every((v, i) => {
      if (v.opcional) return true;
      return (variables[i] ?? '').trim().length > 0;
    });
  }, [plantillaElegida, variables, enviando]);

  function cerrarTodo() {
    setAbierto(false);
    setPlantillaElegida(null);
    setVariables([]);
  }

  async function handleEnviar() {
    if (!plantillaElegida || !puedeEnviar) return;
    setEnviando(true);
    // Sanitizar: cada variable se envia trimeada; si es opcional y vacia,
    // mandamos un placeholder con espacio (Meta rechaza variables vacias
    // en algunas plantillas — convencion historica del repo: "sin notas").
    const valores = plantillaElegida.variables.map((v, i) => {
      const raw = (variables[i] ?? '').trim();
      if (raw.length > 0) return raw;
      if (v.opcional && v.label.toLowerCase().includes('nota')) return 'sin notas';
      return raw;
    });
    try {
      const opciones = ordenActiva?.id ? { ordenId: ordenActiva.id } : undefined;
      const r = await enviarPlantilla(
        waId,
        plantillaElegida.nombre,
        plantillaElegida.idioma,
        valores,
        plantillaElegida.imagenEncabezadoUrl,
        opciones,
      );
      if ('error' in r && r.error) {
        toast.error(`No se pudo enviar: ${r.error}`);
      } else {
        toast.success('Plantilla enviada');
        cerrarTodo();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SelectorPlantillas] enviarPlantilla falló:', err);
      toast.error('Error al enviar — revisá la conexión');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-md transition-colors"
      >
        <FileText size={14} />
        Enviar plantilla
      </button>

      {abierto && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={cerrarTodo}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-brand-600" />
                <h3 className="font-semibold text-gray-900">
                  {plantillaElegida
                    ? `Plantilla: ${plantillaElegida.titulo}`
                    : 'Elegí una plantilla'}
                </h3>
              </div>
              <button
                type="button"
                onClick={cerrarTodo}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
                title="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!plantillaElegida ? (
                <ul className="space-y-2">
                  {PLANTILLAS_WHATSAPP.map((p) => (
                    <li key={p.nombre}>
                      <button
                        type="button"
                        onClick={() => setPlantillaElegida(p)}
                        className="w-full text-left bg-white hover:bg-brand-50 border border-gray-200 hover:border-brand-300 rounded-md p-3 transition-colors"
                      >
                        <p className="text-sm font-semibold text-gray-900">
                          {p.titulo}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {p.descripcion}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1 font-mono">
                          {p.nombre} · {p.idioma} · {p.variables.length} variables
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500">
                    {plantillaElegida.descripcion}
                  </p>
                  {cargandoContexto && (
                    <p className="text-[11px] text-gray-400 italic">
                      Cargando datos del cliente y orden activa...
                    </p>
                  )}
                  {!cargandoContexto && !ordenActiva && (
                    <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
                      <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                      <span>
                        Sin orden activa para este cliente. Completá manualmente
                        las variables que dependen de la orden (numero, fecha,
                        tecnico).
                      </span>
                    </div>
                  )}
                  {plantillaElegida.variables.map((v, i) => (
                    <div key={i}>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {i + 1}. {v.label}
                        {v.opcional && (
                          <span className="ml-1 text-gray-400 font-normal">
                            (opcional)
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={variables[i] ?? ''}
                        onChange={(e) => {
                          const next = [...variables];
                          next[i] = e.target.value;
                          setVariables(next);
                        }}
                        placeholder={v.hint ?? ''}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {v.hint && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{v.hint}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-2">
              {plantillaElegida ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPlantillaElegida(null)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md"
                    disabled={enviando}
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    onClick={handleEnviar}
                    disabled={!puedeEnviar}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 rounded-md transition-colors"
                  >
                    <Send size={14} />
                    {enviando ? 'Enviando...' : 'Enviar plantilla'}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-gray-500">
                    Las plantillas son las unicas que reabren la ventana 24h.
                  </p>
                  <button
                    type="button"
                    onClick={cerrarTodo}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md"
                  >
                    Cerrar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
