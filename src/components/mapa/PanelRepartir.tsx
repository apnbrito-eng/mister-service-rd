/**
 * PanelRepartir.tsx — propuesta de reparto del día de un técnico. Permite
 * marcar/desmarcar cada cita antes de ejecutar. No envía mensajes. Las
 * reasignaciones pasan por `previewReasignacion`/`confirmarReasignacion` del
 * servicio real; el panel reporta éxitos y fallos parciales.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, AlertTriangle, CheckCircle2, X as XIcon } from 'lucide-react';
import type { Personal } from '../../types';
import type { Movimiento, CitaMapa } from '../../utils/mapaOperaciones';
import { hora12 } from '../../utils/mapaOperaciones';

export interface ResultadoRepartir {
  cita: CitaMapa;
  ok: boolean;
  codigo?: string;
  mensaje?: string;
}

interface Props {
  tecnicoOrigen: Personal;
  movimientos: Movimiento[];
  onCerrar: () => void;
  onEjecutar: (seleccion: Set<string>) => Promise<ResultadoRepartir[]>;
}

export default function PanelRepartir({ tecnicoOrigen, movimientos, onCerrar, onEjecutar }: Props) {
  const asignables = useMemo(() => movimientos.filter((m) => !!m.a), [movimientos]);
  const sinAsignar = useMemo(() => movimientos.filter((m) => !m.a), [movimientos]);
  const [sel, setSel] = useState<Set<string>>(() => new Set(asignables.map((m) => m.cita.id)));
  const [resultados, setResultados] = useState<ResultadoRepartir[] | null>(null);
  const [ejecutando, setEjecutando] = useState(false);

  const toggle = (id: string) => {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ejecutar = async () => {
    setEjecutando(true);
    try {
      const r = await onEjecutar(sel);
      setResultados(r);
    } finally {
      setEjecutando(false);
    }
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
          <div className="truncate text-sm font-semibold text-gray-900">Repartir día</div>
          <div className="truncate text-xs text-gray-500">{tecnicoOrigen.nombre} · {movimientos.length} propuesta{movimientos.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {resultados ? (
          <div className="space-y-2">
            <div className="text-xs text-gray-500">Resultados</div>
            <ul className="space-y-1">
              {resultados.map((r) => (
                <li key={r.cita.id} className="flex items-start gap-2 rounded-md border border-gray-100 bg-white px-2 py-1 text-sm">
                  {r.ok ? <CheckCircle2 size={14} className="mt-0.5 text-emerald-700" /> : <AlertTriangle size={14} className="mt-0.5 text-amber-700" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.cita.clienteNombre}</div>
                    <div className="truncate text-xs text-gray-500">
                      {hora12(r.cita.inicio)}
                      {!r.ok && ` · ${r.codigo || 'error'}${r.mensaje ? ` · ${r.mensaje}` : ''}`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            {asignables.length === 0 && (
              <div className="rounded-md bg-gray-50 px-2 py-2 text-xs text-gray-600">
                Ninguna cita pendiente tiene un técnico libre con especialidad.
              </div>
            )}
            <ul className="space-y-1" aria-label="Movimientos propuestos">
              {asignables.map((m) => (
                <li key={m.cita.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-start gap-2 rounded-md border border-gray-100 bg-white px-2 py-1">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={sel.has(m.cita.id)}
                      onChange={() => toggle(m.cita.id)}
                      aria-label={`Reasignar ${m.cita.clienteNombre}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-900">{m.cita.clienteNombre}</div>
                      <div className="truncate text-xs text-gray-600">→ {m.a?.nombre}</div>
                      <div className="truncate text-[11px] text-gray-500">
                        {hora12(m.cita.inicio)} · {m.resumen}
                      </div>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
            {sinAsignar.length > 0 && (
              <section className="mt-3">
                <div className="mb-1 text-xs uppercase tracking-wide text-gray-500">Sin propuesta ({sinAsignar.length})</div>
                <ul className="space-y-1">
                  {sinAsignar.map((m) => (
                    <li key={m.cita.id} className="flex items-start gap-2 rounded-md border border-gray-100 bg-white px-2 py-1 text-sm">
                      <XIcon size={14} className="mt-0.5 text-gray-400" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-gray-900">{m.cita.clienteNombre}</div>
                        <div className="truncate text-xs text-gray-500">{m.resumen}</div>
                        <div className="truncate text-[11px] text-amber-700">
                          Llamar al cliente para cambiar la hora — ningún otro técnico puede tomarla.
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {!resultados && (
        <div className="grid gap-2 border-t border-gray-200 bg-white p-2">
          <button
            type="button"
            onClick={ejecutar}
            disabled={!sel.size || ejecutando}
            className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ejecutando ? 'Reasignando…' : `Reasignar ${sel.size} cita${sel.size === 1 ? '' : 's'}`}
          </button>
          <p className="text-[11px] text-gray-500">
            Cada reasignación pasa por el servidor (preview + confirmar). No se envía ningún mensaje.
          </p>
        </div>
      )}
      {resultados && (
        <div className="grid gap-2 border-t border-gray-200 bg-white p-2">
          <button
            type="button"
            onClick={onCerrar}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
