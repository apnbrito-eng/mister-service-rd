/**
 * FichaTecnicoSheet.tsx — side-sheet con la vista completa de un técnico:
 *  - resumen numérico (pendientes del día seleccionado, pendientes anteriores, cerradas)
 *  - lista de pendientes de días anteriores con antigüedad real
 *  - jornada del día seleccionado cronológica
 *  - cerradas del día seleccionado
 *
 * Correcciones post revisión Codex:
 *  - Standby muestra pieza/motivo real desde `standby_piezas` (no afirma "pieza"
 *    cuando el motivo no está capturado; usa fallback explícito).
 *  - Secciones etiquetadas por "del día" / "de días anteriores" (ya no "hoy")
 *    para no mentir cuando la fecha seleccionada es histórica o futura.
 *  - Foco contenido en el panel y restaurado al cerrar.
 *  - Botones ≥ 44 px.
 *  - Horas en zona RD (`hhmmRD`), no timezone navegador.
 *  - Si `puedeAbrirOrden === false`, los links son texto plano.
 */
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { OrdenServicio, Personal, StandbyPieza } from '../../types';
import type { CitaDelTecnico } from '../../utils/operacionesPrioridad';
import { clasificarPendienteAnterior, equipoDeTecnico, progresoOperativo } from '../../utils/operacionesPrioridad';
import { componentesRD, fechaValida } from '../../utils/mapaFechas';

interface Props {
  tecnico: Personal | null;
  jornada: CitaDelTecnico[];
  pendientesAnteriores: OrdenServicio[];
  /** Items de `standby_piezas` abiertos relevantes al técnico (motivo + pieza). */
  standbyItems: StandbyPieza[];
  cargandoPendientesAnteriores?: boolean;
  errorPendientesAnteriores?: string | null;
  cargandoStandby?: boolean;
  errorStandby?: string | null;
  /** `true` si el día abierto en la UI coincide con hoy en RD. Afecta las etiquetas. */
  esDiaDeHoyRD: boolean;
  ahora: Date;
  puedeAbrirOrden: boolean;
  puedeAbrirCliente?: boolean;
  onCerrar: () => void;
}

function hhmmRD(d: Date | undefined): string {
  if (!d || !fechaValida(d)) return 'sin hora';
  const c = componentesRD(d);
  return `${c.hora}:${String(c.minuto).padStart(2, '0')}`;
}

export default function FichaTecnicoSheet({
  tecnico,
  jornada,
  pendientesAnteriores,
  standbyItems,
  cargandoPendientesAnteriores,
  errorPendientesAnteriores,
  cargandoStandby,
  errorStandby,
  esDiaDeHoyRD,
  ahora,
  puedeAbrirOrden,
  puedeAbrirCliente = false,
  onCerrar,
}: Props) {
  const abierto = !!tecnico;
  const refClose = useRef<HTMLButtonElement>(null);
  const refSheet = useRef<HTMLElement>(null);
  const refFocoPrevio = useRef<HTMLElement | null>(null);

  // Mapa ordenId → standby real para resolver pieza/motivo en el render.
  const standbyPorOrden = new Map<string, StandbyPieza>();
  for (const s of standbyItems) {
    if (!s.ordenId) continue;
    const anterior = standbyPorOrden.get(s.ordenId);
    standbyPorOrden.set(s.ordenId, anterior ? { ...s,
      piezaFaltante: [...new Set([anterior.piezaFaltante, s.piezaFaltante].filter(Boolean))].join('; '),
      notas: [...new Set([anterior.notas, s.notas].filter(Boolean))].join(' · '),
    } : s);
  }

  useEffect(() => {
    if (!abierto) return;
    refFocoPrevio.current = (document.activeElement as HTMLElement | null) ?? null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'Tab' && refSheet.current) {
        const focusables = refSheet.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    refClose.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      // Restaura foco al abrir cerrar.
      refFocoPrevio.current?.focus?.();
    };
  }, [abierto, onCerrar]);

  if (!tecnico) return null;

  const pendientesHoy = jornada.filter((j) => !j.progreso.completa);
  const cerradasHoy = jornada.filter((j) => j.progreso.completa);
  const equipo = equipoDeTecnico(tecnico);
  const etiquetaDia = esDiaDeHoyRD ? 'de hoy' : 'del día seleccionado';
  const etiquetaCierre = 'Citas cerradas';

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Cerrar panel"
        className="absolute inset-0 cursor-default bg-slate-900/40"
        onClick={onCerrar}
      />
      <aside
        ref={refSheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ficha-tecnico-titulo"
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl md:w-[480px]"
      >
        <header className="flex items-start gap-3 border-b border-slate-200 p-4">
          <span
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-slate-800 text-base font-semibold text-white"
            aria-hidden
          >
            {(tecnico.nombre || '?').trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="ficha-tecnico-titulo" className="truncate text-base font-semibold text-slate-900">
              {tecnico.nombre}
            </h2>
            <p className="truncate text-xs text-slate-500">
              {equipo ? `Equipo ${equipo}` : 'Sin equipo asignado'}
              {tecnico.especialidad ? ` · ${tecnico.especialidad}` : ''}
            </p>
          </div>
          <button
            ref={refClose}
            type="button"
            onClick={onCerrar}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 bg-white text-lg text-slate-600 hover:bg-slate-50"
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="grid grid-cols-3 gap-2 border-b border-slate-200 bg-slate-50 p-4 text-center">
          <Resumen cifra={pendientesHoy.length} etiqueta={`Pendientes ${etiquetaDia}`} />
          <Resumen cifra={cargandoPendientesAnteriores || errorPendientesAnteriores ? '—' : pendientesAnteriores.length} etiqueta={errorPendientesAnteriores ? 'No disponibles' : cargandoPendientesAnteriores ? 'Cargando anteriores' : 'De días anteriores'} tono="warn" />
          <Resumen cifra={cerradasHoy.length} etiqueta={etiquetaCierre} tono="ok" />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <Seccion titulo="Pendientes de días anteriores" conteo={cargandoPendientesAnteriores || errorPendientesAnteriores ? '—' : pendientesAnteriores.length}>
            {cargandoPendientesAnteriores ? (
              <p className="text-xs text-slate-500">Cargando pendientes anteriores…</p>
            ) : errorPendientesAnteriores ? (
              <p className="text-xs text-rose-600">{errorPendientesAnteriores}</p>
            ) : pendientesAnteriores.length === 0 ? (
              <p className="text-xs text-slate-500">Sin pendientes previos.</p>
            ) : (
              <ul className="space-y-3">
                {pendientesAnteriores.map((o) => {
                  const aviso = clasificarPendienteAnterior(o, ahora);
                  const sb = standbyPorOrden.get(o.id);
                  return (
                    <li key={o.id}>
                      <CardOrden
                        orden={o}
                        titulo={o.clienteNombre || 'Cliente sin nombre'}
                        subtitulo={`${o.equipoTipo || 'Sin tipo'}${o.equipoMarca ? ' · ' + o.equipoMarca : ''} · ${o.numero || o.id}`}
                        meta={aviso.metrica}
                        standby={sb}
                        extra={<p className="text-xs text-slate-500">Estado: {progresoOperativo(o, ahora).etiqueta}</p>}
                        puedeAbrirOrden={puedeAbrirOrden} puedeAbrirCliente={puedeAbrirCliente}
                        tonoBorde="border-amber-200 bg-amber-50"
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </Seccion>

          {cargandoStandby && (
            <p className="mb-4 text-xs text-slate-500">Cargando piezas pendientes…</p>
          )}
          {errorStandby && (
            <p className="mb-4 text-xs text-rose-600">No se pudieron leer las piezas pendientes: {errorStandby}</p>
          )}

          <Seccion titulo={`Pendientes ${etiquetaDia}`} conteo={pendientesHoy.length}>
            {pendientesHoy.length === 0 ? (
              <p className="text-xs text-slate-500">Sin pendientes.</p>
            ) : (
              <ul className="space-y-3">
                {pendientesHoy.map((j) => (
                  <li key={j.orden.id}>
                    <CardCita piezasNoDisponibles={cargandoStandby || !!errorStandby} cita={j} standby={standbyPorOrden.get(j.orden.id)} puedeAbrirOrden={puedeAbrirOrden} puedeAbrirCliente={puedeAbrirCliente} />
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          <Seccion titulo={etiquetaCierre} conteo={cerradasHoy.length}>
            {cerradasHoy.length === 0 ? (
              <p className="text-xs text-slate-500">Aún sin cierres.</p>
            ) : (
              <ul className="space-y-3">
                {cerradasHoy.map((j) => (
                  <li key={j.orden.id}>
                    <CardCita cita={j} standby={undefined} puedeAbrirOrden={puedeAbrirOrden} puedeAbrirCliente={puedeAbrirCliente} />
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        </div>
      </aside>
    </div>
  );
}

function Resumen({ cifra, etiqueta, tono }: { cifra: number | string; etiqueta: string; tono?: 'ok' | 'warn' }) {
  const color = tono === 'warn' ? 'text-amber-700' : tono === 'ok' ? 'text-emerald-700' : 'text-slate-900';
  return (
    <div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{cifra}</div>
      <div className="text-[11px] text-slate-500">{etiqueta}</div>
    </div>
  );
}

function Seccion({
  titulo,
  conteo,
  children,
}: {
  titulo: string;
  conteo: number | string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
        <span className="text-xs text-slate-500">{conteo}</span>
      </header>
      {children}
    </section>
  );
}

interface CardCitaProps {
  piezasNoDisponibles?: boolean;
  cita: CitaDelTecnico;
  standby?: StandbyPieza;
  puedeAbrirOrden: boolean;
  puedeAbrirCliente?: boolean;
}

function CardCita({ cita, standby, puedeAbrirOrden, puedeAbrirCliente, piezasNoDisponibles }: CardCitaProps) {
  const { orden, progreso } = cita;
  const meta = progreso.standby
    ? standby?.piezaFaltante
      ? `Stand-by · ${standby.piezaFaltante}`
      : standby?.notas
        ? `Stand-by · ${standby.notas}`
        : piezasNoDisponibles ? 'Stand-by · pieza o motivo pendiente de consultar' : 'Stand-by · sin motivo capturado'
    : progreso.atrasoMin > 0
      ? `${progreso.etiqueta} · atrasada ${progreso.atrasoMin} min`
      : progreso.etiqueta;
  return (
    <CardOrden
      orden={orden}
      titulo={orden.clienteNombre || 'Cliente sin nombre'}
      subtitulo={`${orden.equipoTipo || 'Sin tipo'}${orden.equipoMarca ? ' · ' + orden.equipoMarca : ''} · ${orden.numero || orden.id}`}
      meta={hhmmRD(orden.fechaCita)}
      standby={standby}
      extra={<p className="text-xs text-slate-500">{meta}</p>}
      puedeAbrirOrden={puedeAbrirOrden} puedeAbrirCliente={puedeAbrirCliente}
      tonoBorde="border-slate-200 bg-white"
    />
  );
}

interface CardOrdenProps {
  orden: OrdenServicio;
  titulo: string;
  subtitulo: string;
  meta: string;
  standby?: StandbyPieza;
  extra?: React.ReactNode;
  puedeAbrirOrden: boolean;
  puedeAbrirCliente?: boolean;
  tonoBorde: string;
}

function CardOrden({ orden, titulo, subtitulo, meta, standby, extra, puedeAbrirOrden, puedeAbrirCliente, tonoBorde }: CardOrdenProps) {
  const contenido = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-slate-900">{titulo}</span>
        <span className="text-[11px] font-medium text-slate-500 tabular-nums">{meta}</span>
      </div>
      <p className="text-xs text-slate-600">{subtitulo}</p>
      {extra}
      {standby && (
        <p className="text-xs text-slate-500">
          {standby.piezaFaltante ? (
            <>
              <b>Pieza:</b> {standby.piezaFaltante}
              {standby.notas ? ` · ${standby.notas}` : ''}
            </>
          ) : standby.notas ? (
            <>
              <b>Motivo:</b> {standby.notas}
            </>
          ) : (
            <>Stand-by sin motivo capturado</>
          )}
        </p>
      )}
    </>
  );
  if (!puedeAbrirOrden) {
    return (
      <div className={`block rounded-lg border p-3 text-sm ${tonoBorde}`}>{contenido}</div>
    );
  }
  return (
    <div>
    <Link
      to={`/admin/ordenes/${orden.id}`}
      className={`block min-h-[44px] rounded-lg border p-3 text-sm hover:border-sky-400 ${tonoBorde}`}
    >
      {contenido}
    </Link>
    {puedeAbrirCliente && orden.clienteId && <Link to={`/admin/clientes?id=${encodeURIComponent(orden.clienteId)}`} className="inline-flex min-h-11 items-center px-2 text-sm text-blue-800 underline underline-offset-4">Ver cliente</Link>}
    </div>
  );
}
