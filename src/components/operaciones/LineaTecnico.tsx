/**
 * LineaTecnico.tsx — fila con la jornada de un técnico. Dos presentaciones:
 *  - Desktop (md+): citas en orden cronológico con hora RD y cliente legible.
 *  - Mobile: tarjeta vertical con lista de citas (cliente primero).
 *
 * Correcciones post revisión Codex:
 *  - Horas en RD (`componentesRD`), no timezone navegador.
 *  - Botones/links táctiles ≥ 44 px.
 *  - El atraso solo se dibuja cuando `duracionMin` registrado (viene del helper
 *    puro ya en el `progreso.atrasoMin`).
 *  - Si `puedeAbrirOrden === false`, no se enlaza a la orden.
 */
import { Link } from 'react-router-dom';
import type { Personal } from '../../types';
import type { CitaDelTecnico, EstadoTecnicoActual } from '../../utils/operacionesPrioridad';
import { equipoDeTecnico } from '../../utils/operacionesPrioridad';
import { componentesRD, fechaValida } from '../../utils/mapaFechas';

interface Props {
  tecnico: Personal;
  jornada: CitaDelTecnico[];
  estado: EstadoTecnicoActual;
  pendientesAnteriores: number;
  estadoPendientes?: string;
  puedeAbrirOrden: boolean;
  onAbrirFicha: () => void;
}

function hhmmRD(d: Date | undefined): string {
  if (!d || !fechaValida(d)) return '';
  const c = componentesRD(d);
  return `${c.hora}:${String(c.minuto).padStart(2, '0')}`;
}

function colorPasoClase(indice: number, garantia: boolean, standby: boolean): string {
  if (garantia) return 'bg-ms-garantia';
  if (standby) return 'ms-rayado-standby';
  return ['bg-paso-0','bg-paso-1','bg-paso-2','bg-paso-3','bg-paso-4','bg-paso-5','bg-paso-6'][Math.min(6, Math.max(0, indice))];
}

function tonoAvatar(tono: EstadoTecnicoActual['tono']): string {
  if (tono === 'activo') return 'ring-2 ring-ms-accion';
  if (tono === 'standby') return 'ring-2 ring-slate-400';
  if (tono === 'cerrado') return 'ring-2 ring-ms-exito';
  if (tono === 'proximo') return 'ring-2 ring-ms-accion';
  if (tono === 'ausente') return 'ring-2 ring-slate-400';
  return 'ring-2 ring-slate-200';
}

export default function LineaTecnico({
  tecnico,
  jornada,
  estado,
  pendientesAnteriores,
  estadoPendientes,
  puedeAbrirOrden,
  onAbrirFicha,
}: Props) {
  const equipo = equipoDeTecnico(tecnico);
  const inicial = (tecnico.nombre || '?').trim().charAt(0).toUpperCase();
  const cerradas = jornada.filter((j) => j.progreso.completa).length;
  const atrasoMax = Math.max(0, ...jornada.map((j) => j.progreso.atrasoMin));

  const encabezado = (
    <button
      type="button"
      onClick={onAbrirFicha}
      className="group flex min-h-[64px] w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-slate-50"
      aria-label={`Ver día de ${tecnico.nombre}`}
    >
      <span
        className={`flex h-10 w-10 flex-none items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white ${tonoAvatar(estado.tono)}`}
        aria-hidden
      >
        {inicial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900">
          {tecnico.nombre}
          {atrasoMax > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              +{atrasoMax} min
            </span>
          )}
        </span>
        <span className="block truncate text-[11px] text-slate-500">
          {estado.etiqueta}
          {equipo ? ` · Eq. ${equipo}` : ''}
          {estadoPendientes ? ` · ${estadoPendientes}` : pendientesAnteriores > 0 ? ` · ${pendientesAnteriores} pendientes anteriores` : ''}
        </span>
      </span>
    </button>
  );

  const resumen = (
    <div className="flex min-w-[64px] flex-col items-end justify-center px-2 text-xs text-slate-600">
      <span className="font-semibold tabular-nums text-slate-900">
        {cerradas}/{jornada.length}
      </span>
      <span className="text-[11px]">cerradas</span>
    </div>
  );

  return (
    <div
      className="border-b border-slate-200 py-3 last:border-b-0"
      data-testid={`tecnico-${tecnico.uid || tecnico.id}`}
    >
      {/* Desktop: citas cronológicas; ancho legible, sin duraciones supuestas */}
      <div className="hidden items-stretch gap-2 md:grid md:grid-cols-[220px_minmax(0,1fr)_auto]">
        {encabezado}
        <div
          className="flex min-w-0 gap-2 overflow-x-auto py-1"
          role="group"
          aria-label={`Jornada de ${tecnico.nombre}`}
        >
          {jornada.map((j) => {
            const prog = j.progreso;
            const colorBarra = colorPasoClase(prog.indice, prog.garantia, prog.standby);
            const title = `${j.orden.clienteNombre} · ${j.orden.equipoTipo}${j.orden.equipoMarca ? ' ' + j.orden.equipoMarca : ''} · ${prog.etiqueta}${prog.atrasoMin > 0 ? ` · +${prog.atrasoMin} min` : ''}`;
            const contenido = (
              <>
                <span className="block text-sm font-semibold text-slate-900">
                  {j.orden.clienteNombre}
                </span>
                <span className="block text-xs text-slate-600">{hhmmRD(j.orden.fechaCita)} · {prog.etiqueta}</span>
                <span className="block truncate text-[10px] text-slate-500">
                  {j.orden.equipoTipo}
                  {j.orden.equipoMarca ? ` · ${j.orden.equipoMarca}` : ''}
                </span>
                <span className={`mt-auto block h-1.5 w-full flex-none rounded-sm ${colorBarra}`} aria-hidden />
                {prog.atrasoMin > 0 && (
                  <span className="pointer-events-none self-start rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-800">
                    +{prog.atrasoMin}
                  </span>
                )}
              </>
            );
            return puedeAbrirOrden ? (
              <Link
                key={j.orden.id}
                to={`/admin/ordenes/${j.orden.id}`}
                className="relative flex min-h-24 w-44 flex-none flex-col gap-1 rounded border border-slate-200 bg-white p-2 text-left text-xs hover:border-sky-400"
                title={title}
              >
                {contenido}
              </Link>
            ) : (
              <div
                key={j.orden.id}
                className="relative flex min-h-24 w-44 flex-none flex-col gap-1 rounded border border-slate-200 bg-white p-2 text-left text-xs"
                title={title}
              >
                {contenido}
              </div>
            );
          })}
        </div>
        {resumen}
      </div>

      {/* Mobile: lista vertical con cliente legible */}
      <div className="md:hidden">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{encabezado}</div>
          {resumen}
        </div>
        {jornada.length > 0 && (
          <ul className="mt-2 space-y-2 px-2">
            {jornada.map((j) => {
              const prog = j.progreso;
              const colorBarra = colorPasoClase(prog.indice, prog.garantia, prog.standby);
              const contenido = (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{j.orden.clienteNombre}</span>
                    <span className="text-[11px] tabular-nums text-slate-500">{hhmmRD(j.orden.fechaCita)}</span>
                  </div>
                  <p className="truncate text-[11px] text-slate-500">
                    {j.orden.equipoTipo}
                    {j.orden.equipoMarca ? ` · ${j.orden.equipoMarca}` : ''} · {prog.etiqueta}
                    {prog.atrasoMin > 0 ? ` · +${prog.atrasoMin} min` : ''}
                  </p>
                  <span className={`mt-1 block h-1 w-full rounded-sm ${colorBarra}`} aria-hidden />
                </>
              );
              return (
                <li key={j.orden.id}>
                  {puedeAbrirOrden ? (
                    <Link
                      to={`/admin/ordenes/${j.orden.id}`}
                      className="block min-h-[44px] rounded border border-slate-200 bg-white px-3 py-2 hover:border-sky-400"
                    >
                      {contenido}
                    </Link>
                  ) : (
                    <div className="block min-h-[44px] rounded border border-slate-200 bg-white px-3 py-2">
                      {contenido}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
