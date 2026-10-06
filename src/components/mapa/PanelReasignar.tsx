/**
 * PanelReasignar.tsx — flujo real de reasignación respaldado por el servicio
 * `reasignacion.service` (preview + confirmar) del tercer Claude.
 *
 * Pasos:
 *  1. Elegir candidato (lista ordenada local por `candidatosReasignacion`).
 *  2. Pulsar «Ver confirmación» → ejecuta `previewReasignacion` con los
 *     datos ORIGINALES de la orden (`tecnicoId`, `fase`, `fechaCitaMs`) sin
 *     convertirlos a UID: el backend compara literalmente. Si cambió algo
 *     mientras tanto, el servidor responde `cambio` y el panel invita a
 *     refrescar.
 *  3. El servidor devuelve `conflictos`, `cambioDeGrupo` y `requiereMotivo`.
 *     El panel pide motivo si corresponde, muestra conflictos y permite
 *     cancelar.
 *  4. «Confirmar» ejecuta `confirmarReasignacion(previewId, { motivo })`.
 *     Si hay conflictos el panel NO ofrece forzar (política actual de Jorge:
 *     no bypass — ver revisión Codex §5). Si el usuario quiere forzar, por
 *     ahora debe cancelar y resolver conflicto desde la agenda.
 *  5. Devuelve `deshacer` para que el padre lo guarde y use al pulsar Undo.
 */
import { useState } from 'react';
import { ArrowLeft, AlertTriangle, CheckCircle2, Lock, RefreshCw } from 'lucide-react';
import type { OrdenServicio } from '../../types';
import type { Candidato, CitaMapa, TecnicoMapa } from '../../utils/mapaOperaciones';
import { hora12 } from '../../utils/mapaOperaciones';
import {
  previewReasignacion,
  confirmarReasignacion,
  ErrorReasignacion,
  type PreviewReasignacionResultado,
  type ConfirmarReasignacionResultado,
  type OrigenReasignacion,
} from '../../services/reasignacion.service';

const MOTIVOS = [
  'Va atrasado',
  'Queda más cerca',
  'Sabe de ese equipo',
  'El cliente lo pidió',
  'Avería de la van',
] as const;

interface Props {
  cita: CitaMapa;
  orden: OrdenServicio;
  candidatos: Candidato[];
  origen: OrigenReasignacion;
  modoDemo?: boolean;
  onCerrar: () => void;
  /** Se llama al terminar exitosamente, con el payload `deshacer` listo para pasar. */
  onCompletado: (resultado: ConfirmarReasignacionResultado) => void;
}

export default function PanelReasignar({ cita, orden, candidatos, origen, modoDemo, onCerrar, onCompletado }: Props) {
  const [elegido, setElegido] = useState<Candidato | null>(null);
  const [preview, setPreview] = useState<PreviewReasignacionResultado | null>(null);
  const [motivoChip, setMotivoChip] = useState<string>('');
  const [motivoTexto, setMotivoTexto] = useState<string>('');
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ codigo?: string; mensaje: string } | null>(null);

  const motivoFinal = [motivoChip, motivoTexto.trim()].filter(Boolean).join(' — ');
  const requiereMotivo = preview?.requiereMotivoCambioGrupo === true;

  const puedeConfirmar =
    !!preview && !guardando && !cargandoPreview &&
    (!requiereMotivo || motivoFinal.length > 0) &&
    (preview?.conflictos.length ?? 0) === 0;

  const resolverPreview = async (cand: Candidato) => {
    if (modoDemo) {
      setError({ mensaje: 'Demostración: puedes revisar los candidatos, pero no se guardan cambios.' });
      return;
    }
    setElegido(cand);
    setPreview(null);
    setError(null);
    setCargandoPreview(true);
    try {
      const resultado = await previewReasignacion({
        ordenId: orden.id,
        esperado: {
          tecnicoId: orden.tecnicoId ?? null,
          fase: orden.fase,
          fechaCitaMs: orden.fechaCita ? orden.fechaCita.getTime() : null,
        },
        destinoUid: cand.tecnico.id,
        origen,
      });
      setPreview(resultado);
    } catch (err) {
      if (err instanceof ErrorReasignacion) {
        setError({ codigo: err.codigo, mensaje: err.message });
      } else {
        setError({ mensaje: (err as Error)?.message || 'No se pudo preparar la reasignación.' });
      }
    } finally {
      setCargandoPreview(false);
    }
  };

  const confirmar = async () => {
    if (!preview) return;
    setGuardando(true);
    setError(null);
    try {
      const resultado = await confirmarReasignacion(preview.previewId, { motivo: motivoFinal || undefined });
      onCompletado(resultado);
      onCerrar();
    } catch (err) {
      if (err instanceof ErrorReasignacion) {
        setError({ codigo: err.codigo, mensaje: err.message });
        // Si cambió entre preview y confirm, invalidamos el preview para forzar
        // al usuario a refrescar antes de insistir.
        if (err.codigo === 'cambio' || err.codigo === 'preview_vencido') setPreview(null);
      } else {
        setError({ mensaje: (err as Error)?.message || 'No se pudo guardar.' });
      }
    } finally {
      setGuardando(false);
    }
  };

  const reiniciar = () => {
    setPreview(null);
    setElegido(null);
    setMotivoChip('');
    setMotivoTexto('');
    setError(null);
  };

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
          <div className="truncate text-sm font-semibold text-gray-900">
            Pasar a otro técnico
          </div>
          <div className="truncate text-xs text-gray-500">
            {cita.clienteNombre} · {hora12(cita.inicio)}
          </div>
        </div>
      </div>

      {/* Lista de candidatos */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-2" aria-label="Candidatos ordenados del mejor al peor">
          {candidatos.map((c) => {
            const activo = elegido?.tecnico.id === c.tecnico.id;
            const icon = c.nivel === 'recomendado' ? <CheckCircle2 size={14} className="text-emerald-700" /> :
              c.nivel === 'con_avisos' ? <AlertTriangle size={14} className="text-amber-700" /> :
              <Lock size={14} className="text-gray-500" />;
            const bloqueado = c.nivel === 'bloqueado';
            return (
              <li key={c.tecnico.id}>
                <button
                  type="button"
                  disabled={bloqueado || guardando}
                  onClick={() => resolverPreview(c)}
                  className={`flex w-full min-h-[44px] items-start gap-2 rounded-md border p-2 text-left ${
                    activo ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                  } ${bloqueado ? 'opacity-60' : ''}`}
                >
                  <span className="mt-0.5">{icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {c.tecnico.nombre}
                    </div>
                    <div className="truncate text-xs text-gray-600">{c.resumen}</div>
                    {(c.bloqueos.length > 0 || c.avisos.length > 0) && (
                      <ul className="mt-1 space-y-0.5">
                        {c.bloqueos.map((b) => (
                          <li key={b} className="text-[11px] text-red-700">• {b}</li>
                        ))}
                        {c.avisos.map((a) => (
                          <li key={a} className="text-[11px] text-amber-700">• {a}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
          {!candidatos.length && (
            <li className="rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600">
              No hay candidatos disponibles.
            </li>
          )}
        </ul>
      </div>

      {/* Preview + motivos + confirmación */}
      {(elegido || cargandoPreview || error) && (
        <div className="grid gap-2 border-t border-gray-200 bg-white p-2">
          {cargandoPreview && (
            <div className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800">
              Consultando confirmación con el servidor…
            </div>
          )}
          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">
              <span className="flex-1">
                {error.codigo === 'cambio' && 'La orden cambió desde que la viste. Refrescá y volvé a intentar.'}
                {error.codigo === 'preview_vencido' && 'La ventana de confirmación venció. Intentá de nuevo.'}
                {!['cambio', 'preview_vencido'].includes(error.codigo || '') && error.mensaje}
              </span>
              <button
                type="button"
                onClick={reiniciar}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-red-300 bg-white px-2 text-xs text-red-800 hover:bg-red-50"
              >
                <RefreshCw size={12} /> Reiniciar
              </button>
            </div>
          )}

          {preview && (
            <>
              {preview.conflictos.length > 0 && (
                <div role="alert" className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
                  <div className="font-semibold">Conflicto de agenda:</div>
                  <ul className="mt-1 list-disc pl-4">
                    {preview.conflictos.map((c) => (
                      <li key={c.ordenId}>
                        {c.clienteNombre} · {new Date(c.fechaCitaMs).toLocaleString('es-DO', { hour: '2-digit', minute: '2-digit' })} · {c.duracionMin} min
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 text-[11px] text-amber-800">
                    Resolvé el solapamiento desde la agenda antes de pasar la cita. (Forzar está deshabilitado.)
                  </div>
                </div>
              )}
              {preview.cambioDeGrupo && (
                <div className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-900">
                  La orden pasará al equipo de {preview.destino?.operariaNombre ?? '—'}.
                </div>
              )}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Motivo{requiereMotivo ? ' (obligatorio)' : ''}
                </legend>
                <div className="mt-1 flex flex-wrap gap-1">
                  {MOTIVOS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMotivoChip(m === motivoChip ? '' : m)}
                      className={`min-h-[44px] rounded-full border px-3 text-xs ${
                        motivoChip === m ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-gray-700'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Nota adicional"
                  value={motivoTexto}
                  onChange={(e) => setMotivoTexto(e.target.value)}
                  className="mt-2 min-h-[44px] w-full rounded-md border border-gray-300 px-2 text-sm"
                  maxLength={280}
                />
              </fieldset>
              <button
                type="button"
                onClick={confirmar}
                disabled={!puedeConfirmar}
                className="inline-flex min-h-[48px] items-center justify-center gap-1 rounded-md bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {guardando ? 'Guardando…' : `Confirmar: pasar a ${(preview.destino?.nombre) || elegido?.tecnico.nombre}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
// Mantengo tipo exportado por compatibilidad con el consumidor anterior.
export type PayloadReasignacion = {
  cita: CitaMapa;
  destino: TecnicoMapa;
  candidato: Candidato | null;
  motivo: string;
};
