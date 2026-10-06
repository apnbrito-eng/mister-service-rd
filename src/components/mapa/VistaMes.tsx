/* eslint-disable react-refresh/only-export-components */
/**
 * VistaMes.tsx — calendario mensual del Mapa, en zona Santo Domingo (RD).
 *
 * El rango que recibe (`rango.inicio`/`rango.fin`) viene del formulario y es
 * INCLUSIVO en ambos extremos: la UI de arriba lo deja a 00:00 RD del día
 * Desde y 00:00 RD del día Hasta.
 *
 * Reglas de pintado (hallazgos QA 02/10 pasada tres):
 *  - Si el rango abarca varios meses, se renderizan TODOS los meses tocados —
 *    nunca se corta al primero. Cada mes es una sección con encabezado y su
 *    grid de 6 semanas (42 celdas) armado con `fechaEnRD`, no con
 *    `startOfWeek/endOfWeek` dependientes de la zona del dispositivo.
 *  - Los días que caen fuera del rango se dibujan atenuados y marcados con
 *    `aria-disabled="true"` + `title="Fuera del rango seleccionado"`. NO se
 *    muestran como «cero disponible»: cuando el día está fuera del rango se
 *    pinta sin contador (no inventamos capacidad ni horarios de negocio).
 *  - La navegación «mes anterior / siguiente» no cambia el rango del
 *    formulario — solo mueve el `ref` interno de scroll. Cuando el ref sale
 *    fuera de los meses tocados por el rango, los controles se desactivan
 *    para no sugerir que hay más meses que mostrar.
 *  - Hoy en RD aparece siempre con el círculo brand, sin depender del rango.
 *
 * Mobile 375px: cada celda es un botón de 40 px (todo celda está dentro de
 * una franja de ≥44 px tocable gracias al padding del contenedor). Mes y
 * grid caben sin desplazamiento horizontal.
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CitaMapa } from '../../utils/mapaOperaciones';
import { componentesRD, diaEsHoyRD, fechaEnRD, mismoDiaRD } from '../../utils/mapaFechas';

interface Props {
  /** Inicio y fin inclusivos del rango activo (ambos a 00:00 RD de su día). */
  rango: { inicio: Date; fin: Date };
  citas: CitaMapa[];
  ahora: Date;
  onSeleccionarDia: (dia: Date) => void;
  /** Hook histórico — se preserva por compat con el padre. */
  onNavegarMes?: (nuevoRef: Date) => void;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

interface Mes {
  anio: number;
  mes: number; // 0..11
}

const mesKey = (m: Mes) => `${m.anio}-${String(m.mes + 1).padStart(2, '0')}`;

/**
 * Lista de meses alcanzados por el rango (`inicio` a `fin`, inclusivos). Para
 * un rango que empieza el 28 de octubre y termina el 3 de diciembre devuelve
 * `[oct, nov, dic]` — ninguno se omite.
 */
export function mesesAlcanzados(rangoInicio: Date, rangoFin: Date): Mes[] {
  const ini = componentesRD(rangoInicio);
  const fin = componentesRD(rangoFin);
  const inicioMes: Mes = { anio: ini.anio, mes: ini.mes };
  const finMes: Mes = { anio: fin.anio, mes: fin.mes };
  // Si el fin es anterior al inicio por error, devolvemos solo el inicio.
  if (finMes.anio < inicioMes.anio || (finMes.anio === inicioMes.anio && finMes.mes < inicioMes.mes)) {
    return [inicioMes];
  }
  const out: Mes[] = [];
  let actual = inicioMes;
  for (let guard = 0; guard < 240; guard += 1) {
    out.push(actual);
    if (actual.anio === finMes.anio && actual.mes === finMes.mes) break;
    const nextMes = actual.mes + 1;
    actual = nextMes > 11 ? { anio: actual.anio + 1, mes: 0 } : { anio: actual.anio, mes: nextMes };
  }
  return out;
}

/**
 * Devuelve las 42 celdas del grid de un mes (6 semanas) con lunes como primer
 * día. Todas las fechas se construyen con `fechaEnRD` para que la fila superior
 * del grid caiga sobre lunes RD, no sobre lunes de la zona del dispositivo.
 */
export function gridMes(anio: number, mes: number): Date[] {
  const primero = fechaEnRD(anio, mes, 1);
  const compPrim = componentesRD(primero);
  const offLunes = (compPrim.diaSemana + 6) % 7;
  const DIA = 86_400_000;
  const inicio = fechaEnRD(anio, mes, 1 - offLunes);
  const out: Date[] = [];
  for (let i = 0; i < 42; i += 1) out.push(new Date(inicio.getTime() + i * DIA));
  return out;
}

/** `true` si `(c.anio, c.mes, c.dia)` cae en el rango inclusivo. */
export function diaDentroDeRango(
  c: { anio: number; mes: number; dia: number },
  rangoInicio: Date,
  rangoFin: Date,
): boolean {
  const ri = componentesRD(rangoInicio);
  const rf = componentesRD(rangoFin);
  const dMs = Date.UTC(c.anio, c.mes, c.dia);
  const iMs = Date.UTC(ri.anio, ri.mes, ri.dia);
  const fMs = Date.UTC(rf.anio, rf.mes, rf.dia);
  return dMs >= iMs && dMs <= fMs;
}

const keyRD = (d: Date) => {
  const c = componentesRD(d);
  return `${c.anio}-${String(c.mes + 1).padStart(2, '0')}-${String(c.dia).padStart(2, '0')}`;
};

export default function VistaMes({ rango, citas, ahora, onSeleccionarDia, onNavegarMes }: Props) {
  const contenedorMeses = useRef<HTMLDivElement>(null);
  const meses = useMemo(() => mesesAlcanzados(rango.inicio, rango.fin), [rango.inicio, rango.fin]);

  // Ref interno de scroll: por defecto se ancla al primer mes del rango. Si el
  // rango cambia, lo reseteamos al primero. El usuario puede navegar prev/next
  // dentro de los meses alcanzados — no inventamos meses extra fuera del rango.
  const [refMesKey, setRefMesKey] = useState<string>(() => (meses[0] ? mesKey(meses[0]) : ''));
  useEffect(() => {
    if (!meses.length) return;
    if (!meses.some((m) => mesKey(m) === refMesKey)) setRefMesKey(mesKey(meses[0]));
  }, [meses, refMesKey]);

  const idx = meses.findIndex((m) => mesKey(m) === refMesKey);
  const hayPrev = idx > 0;
  const hayNext = idx >= 0 && idx < meses.length - 1;

  if (!meses.length) {
    return <div className="p-4 text-sm text-gray-600">Rango inválido.</div>;
  }

  const porDia = (() => {
    const m = new Map<string, number>();
    for (const c of citas) {
      const k = keyRD(c.inicio);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  })();

  const navegarA = (nuevoIdx: number) => {
    if (nuevoIdx < 0 || nuevoIdx >= meses.length) return;
    const m = meses[nuevoIdx];
    setRefMesKey(mesKey(m));
    const contenedor = contenedorMeses.current;
    const seccion = contenedor?.querySelector<HTMLElement>(`[data-mes="${mesKey(m)}"]`);
    if (contenedor && seccion) contenedor.scrollTo({ top: seccion.getBoundingClientRect().top - contenedor.getBoundingClientRect().top + contenedor.scrollTop });
    // Hook histórico — avisamos al padre por compat.
    onNavegarMes?.(fechaEnRD(m.anio, m.mes, 1, 12));
  };

  const totalMeses = meses.length;

  return (
    <div className="flex h-full flex-col">
      {/* Cabecera: navegación de meses dentro del rango */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <button
          type="button"
          onClick={() => navegarA(idx - 1)}
          disabled={!hayPrev}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Mes anterior dentro del rango"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex min-w-0 flex-col items-center">
          <div className="truncate text-sm font-semibold capitalize text-gray-900" aria-live="polite">
            {idx >= 0 ? `${MESES[meses[idx].mes]} ${meses[idx].anio}` : '—'}
          </div>
          {totalMeses > 1 && (
            <div className="text-[11px] text-gray-500">
              Mes {idx + 1} de {totalMeses} dentro del rango
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => navegarA(idx + 1)}
          disabled={!hayNext}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Mes siguiente dentro del rango"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div ref={contenedorMeses} className="flex-1 overflow-y-auto">
        {meses.map((m) => (
          <SeccionMes
            key={mesKey(m)}
            mes={m}
            rango={rango}
            porDia={porDia}
            ahora={ahora}
            resaltado={mesKey(m) === refMesKey}
            onSeleccionarDia={onSeleccionarDia}
          />
        ))}
      </div>
    </div>
  );
}

interface SeccionMesProps {
  mes: Mes;
  rango: { inicio: Date; fin: Date };
  porDia: Map<string, number>;
  ahora: Date;
  resaltado: boolean;
  onSeleccionarDia: (dia: Date) => void;
}

function SeccionMes({ mes, rango, porDia, ahora, resaltado, onSeleccionarDia }: SeccionMesProps) {
  const dias = useMemo(() => gridMes(mes.anio, mes.mes), [mes.anio, mes.mes]);

  return (
    <section
      aria-label={`${MESES[mes.mes]} ${mes.anio}`}
      className={`border-b border-gray-100 ${resaltado ? 'bg-brand-50/30' : ''}`}
      data-mes={mesKey(mes)}
    >
      <h2 className="sticky top-0 z-10 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
        {MESES[mes.mes]} {mes.anio}
      </h2>
      <div className="grid grid-cols-7 border-b border-gray-100 text-center text-[11px] uppercase tracking-wide text-gray-500">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-100" role="grid" aria-label={`Días de ${MESES[mes.mes]} ${mes.anio}`}>
        {dias.map((d) => {
          const c = componentesRD(d);
          const key = keyRD(d);
          const esDelMes = c.mes === mes.mes && c.anio === mes.anio;
          const dentro = diaDentroDeRango(c, rango.inicio, rango.fin);
          const esHoy = diaEsHoyRD(d, ahora);
          const count = porDia.get(key) ?? 0;
          const ariaLabel = esDelMes
            ? `${c.dia} de ${MESES[c.mes]} ${c.anio}${dentro ? '' : ' (fuera del rango seleccionado)'}${count > 0 && dentro ? `, ${count} cita${count === 1 ? '' : 's'}` : ''}`
            : `${c.dia} de ${MESES[c.mes]} ${c.anio} (otro mes)`;
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              onClick={() => onSeleccionarDia(d)}
              aria-current={mismoDiaRD(d, ahora) ? 'date' : undefined}
              aria-disabled={dentro ? undefined : true}
              aria-label={ariaLabel}
              title={!dentro ? 'Fuera del rango seleccionado' : undefined}
              data-dentro-rango={dentro ? 'true' : 'false'}
              data-del-mes={esDelMes ? 'true' : 'false'}
              className={[
                'flex min-h-[56px] flex-col items-start gap-1 p-1 text-left transition-colors',
                esDelMes ? 'bg-white' : 'bg-gray-50',
                esDelMes ? 'text-gray-900' : 'text-gray-400',
                dentro ? 'ring-1 ring-brand-200' : '',
                !dentro && esDelMes ? 'opacity-60' : '',
              ].filter(Boolean).join(' ')}
            >
              <span
                className={`text-xs font-semibold ${
                  esHoy ? 'rounded-full bg-brand-600 px-1.5 text-white' : ''
                }`}
              >
                {c.dia}
              </span>
              {/* Contador: SOLO si el día está dentro del rango. Fuera del rango,
                  no mostramos «0» — no inventamos capacidad disponible. */}
              {dentro && count > 0 && (
                <span className="rounded-full bg-brand-50 px-1.5 text-[10px] font-medium text-brand-700">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
