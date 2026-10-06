/**
 * FichaRuta.tsx — línea de tiempo con los tramos de la ruta del técnico. El
 * cálculo con Routes se dispara únicamente desde el botón «Calcular ruta»;
 * si Routes está deshabilitado o devuelve estimado, la pantalla lo informa
 * de forma honesta. Nunca se auto-llama.
 *
 * Fechas se formatean con `componentesRD` para no depender de la zona del
 * dispositivo.
 */
import { ArrowLeft, ExternalLink, Send, Zap, Trash2 } from 'lucide-react';
import type { Personal } from '../../types';
import type { DiaTecnico } from '../../utils/mapaOperaciones';
import { enlacesGoogleMaps, hora12 } from '../../utils/mapaOperaciones';
import { tieneCoord, type LatLng } from '../../utils/geo';
import { componentesRD } from '../../utils/mapaFechas';
import type { RespuestaRuta } from '../../services/tiemposRuta.service';

interface Props {
  tecnico: Personal;
  dia: DiaTecnico;
  diaSeleccionado: Date;
  origenOficina: LatLng | null;
  cargandoRuta: boolean;
  resultadoRuta: RespuestaRuta | null | undefined;
  rutaCaduca?: string | null;
  onCerrar: () => void;
  onAbrirCita: (ordenId: string) => void;
  onCalcularRuta: () => void;
  onLimpiarRuta: () => void;
  onEnviarRutaTecnico?: () => void;
}

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fechaCivilRD = (d: Date) => {
  const c = componentesRD(d);
  return `${DIAS_SEMANA[c.diaSemana]} ${c.dia} ${MESES[c.mes]}`;
};

/** Nuestro endpoint `/api/mapa/tiempos` acepta como máximo 9 puntos por llamada. */
const MAX_PUNTOS_API = 9;

export default function FichaRuta({
  tecnico,
  dia,
  diaSeleccionado,
  origenOficina,
  cargandoRuta,
  resultadoRuta,
  rutaCaduca,
  onCerrar,
  onAbrirCita,
  onCalcularRuta,
  onLimpiarRuta,
  onEnviarRutaTecnico,
}: Props) {
  const paradas = dia.paradas.filter(p => !p.enStandby && !p.cita.progreso.standby);
  const pausadas = dia.paradas.length - paradas.length;
  const paradasConCoord = paradas.filter((p) => tieneCoord(p.cita));
  const enlaces = enlacesGoogleMaps(
    origenOficina,
    paradasConCoord.map((p) => ({ lat: p.cita.lat as number, lng: p.cita.lng as number })),
  );
  const sobreCupo = paradasConCoord.length > MAX_PUNTOS_API;

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
          <div className="truncate text-base font-semibold text-gray-900">
            Ruta de {tecnico.nombre}
          </div>
          <div className="truncate text-xs text-gray-500">
            {fechaCivilRD(diaSeleccionado)} · {paradas.length} parada{paradas.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {pausadas > 0 && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-900">{pausadas} órdenes en espera de piezas quedan fuera del recorrido. Consúltalas en la ficha del técnico.</p>}
        <ol className="space-y-2" aria-label="Paradas en orden cronológico">
          {paradas.map((p, i) => (
            <li
              key={p.cita.id}
              className="flex gap-2 rounded-md border border-gray-100 bg-white px-2 py-2"
            >
              <div className="flex flex-col items-center">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white ${
                    p.cita.progreso.garantia ? 'bg-red-600' : p.estado === 'hecha' ? 'bg-gray-400' : 'bg-brand-600'
                  }`}
                  aria-hidden="true"
                >
                  {p.cita.progreso.garantia ? '!' : p.estado === 'hecha' ? '✓' : i + 1}
                </span>
                {i < paradas.length - 1 && <div className="my-1 w-px flex-1 bg-gray-200" />}
              </div>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onAbrirCita(p.cita.id)}
                  className="min-h-[44px] text-left text-sm font-semibold text-gray-900 hover:underline"
                >
                  {p.cita.clienteNombre}
                </button>
                <div className="text-xs text-gray-500">
                  {hora12(p.cita.inicio)}
                  {p.km !== null && ` · ${p.km.toFixed(1)} km`}
                  {p.minViaje !== null && ` · ${p.minViaje} min`}
                </div>
                {p.sinUbicacion && (
                  <div className="mt-0.5 text-[11px] text-amber-700">Sin ubicación — no se puede calcular tramo.</div>
                )}
              </div>
            </li>
          ))}
          {!paradas.length && (
            <li className="rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600">Sin citas este día.</li>
          )}
        </ol>

        <section className="mt-3 rounded-md border border-gray-200 bg-white p-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 text-xs text-gray-600">
              {resultadoRuta?.fuente === 'google' && (
                <>Tiempos con Google Routes (powered by Google Maps). Vigente para esta vista; se descarta si cambia rango/día/paradas.</>
              )}
              {resultadoRuta?.fuente === 'estimado' && (
                <>Tiempos estimados{resultadoRuta.motivo ? ` (${resultadoRuta.motivo})` : ''}. Las líneas punteadas unen ubicaciones y no representan calles.</>
              )}
              {!resultadoRuta && (
                <>Las líneas punteadas son orientativas. Pulsa «Calcular ruta» para consultar tiempos y calles con Google.</>
              )}
              {rutaCaduca && (
                <div className="mt-1 text-amber-800">{rutaCaduca}</div>
              )}
            </div>
            <button
              type="button"
              onClick={onCalcularRuta}
              disabled={cargandoRuta || paradasConCoord.length < 2 || sobreCupo}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
            >
              <Zap size={12} />
              {cargandoRuta ? 'Calculando…' : 'Calcular ruta'}
            </button>
            {resultadoRuta && (
              <button
                type="button"
                onClick={onLimpiarRuta}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-600 hover:bg-gray-50"
                aria-label="Descartar resultado"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
          {sobreCupo && (
            <p className="mt-1 text-[11px] text-amber-700">
              Nuestro endpoint acepta hasta {MAX_PUNTOS_API} paradas por llamada.
              Para rutas más largas, usa los enlaces de 3 paradas de abajo —
              ya salen en segmentos que preservan el orden.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-2 border-t border-gray-200 bg-white p-2">
        {enlaces.map((url, i) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ExternalLink size={14} /> Abrir tramo {i + 1} en Google Maps
          </a>
        ))}
        {onEnviarRutaTecnico && (
          <button
            type="button"
            onClick={onEnviarRutaTecnico}
            className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md bg-brand-600 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Send size={14} /> Enviar ruta al técnico (abre compositor; no envía)
          </button>
        )}
      </div>
    </div>
  );
}
