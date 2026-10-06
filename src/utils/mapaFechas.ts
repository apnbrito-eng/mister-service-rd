/**
 * mapaFechas.ts — fechas y rangos del Mapa en zona Santo Domingo (UTC-4, sin horario de verano).
 * Destino: src/utils/mapaFechas.ts
 *
 * Reglas (ver docs/qa/2026-10-01-mapa-operaciones.md §Diseño combinado):
 *  - Rangos Desde/Hasta se interpretan en RD, independiente de la zona del dispositivo.
 *    Desde se ancla a las 00:00 RD de ese día; Hasta se ancla a las 00:00 RD del día SIGUIENTE,
 *    exclusiva. Ambos días quedan incluidos.
 *  - Hoy es el día actual en RD (no «hoy del dispositivo»). Nunca cuenta como pasado.
 *  - El módulo expone helpers puros: no lee navigator ni Intl del entorno de ejecución
 *    para que las pruebas sean deterministas y reproducibles.
 *
 * Importante: Santo Domingo observa UTC-4 fijo (sin DST desde 1970). Si eso cambiara, se
 * reemplazaría la constante OFFSET_RD por una tabla.
 */
export const OFFSET_RD_MIN = -4 * 60;

const MIN = 60_000;
const DIA = 24 * 60 * MIN;

/** `true` si `d` es Date real con timestamp finito. */
export function fechaValida(d: unknown): d is Date {
  return d instanceof Date && Number.isFinite(d.getTime());
}

/**
 * Devuelve los componentes de calendario (año/mes/día/hora/minuto) de `fecha` en zona RD.
 * Mes es 0..11 para coincidir con `Date`. Si la fecha es inválida devuelve `null`.
 */
export function componentesRD(fecha: Date): { anio: number; mes: number; dia: number; hora: number; minuto: number; diaSemana: number } {
  if (!fechaValida(fecha)) {
    throw new RangeError('componentesRD: fecha inválida');
  }
  const tsRD = fecha.getTime() + OFFSET_RD_MIN * MIN;
  const d = new Date(tsRD);
  return {
    anio: d.getUTCFullYear(),
    mes: d.getUTCMonth(),
    dia: d.getUTCDate(),
    hora: d.getUTCHours(),
    minuto: d.getUTCMinutes(),
    diaSemana: d.getUTCDay(),
  };
}

/**
 * Construye un `Date` que corresponde al instante (anio-mes-dia hh:mm) en zona RD.
 * `mes` es 0..11.
 */
export function fechaEnRD(anio: number, mes: number, dia: number, hora: number = 0, minuto: number = 0): Date {
  const utcMs = Date.UTC(anio, mes, dia, hora, minuto) - OFFSET_RD_MIN * MIN;
  return new Date(utcMs);
}

/** Instante 00:00 RD del día que contiene a `fecha`. */
export function inicioDiaRD(fecha: Date): Date {
  const c = componentesRD(fecha);
  return fechaEnRD(c.anio, c.mes, c.dia, 0, 0);
}

/** Instante 00:00 RD del día siguiente a `fecha` (exclusivo para rangos). */
export function finDiaRD(fecha: Date): Date {
  return new Date(inicioDiaRD(fecha).getTime() + DIA);
}

/** `true` si ambas fechas caen el mismo día calendario en zona RD. Si alguna es inválida → false. */
export function mismoDiaRD(a: Date, b: Date): boolean {
  if (!fechaValida(a) || !fechaValida(b)) return false;
  return inicioDiaRD(a).getTime() === inicioDiaRD(b).getTime();
}

/**
 * Rango inclusivo Desde..Hasta en RD. `inicio` = 00:00 RD del día `desde`;
 * `fin` = 00:00 RD del día siguiente a `hasta` (exclusivo). Si cualquier extremo es inválido
 * o `hasta` < `desde`, devuelve `null`: la UI debe BLOQUEAR la query y mostrar error en vez de
 * disparar un onSnapshot con Invalid Date (fix revisión Codex 2026-10-02).
 */
export function rangoRD(desde: Date, hasta: Date): { inicio: Date; fin: Date } | null {
  if (!fechaValida(desde) || !fechaValida(hasta)) return null;
  const ini = inicioDiaRD(desde);
  const fin = finDiaRD(hasta);
  if (fin.getTime() <= ini.getTime()) return null;
  return { inicio: ini, fin };
}

/**
 * ¿La fecha `f` cae dentro del rango inclusivo `[desde, hasta]` en RD?
 * `hasta` se interpreta hasta las 23:59:59.999 RD de ese día. Fechas inválidas → false.
 */
export function enRangoRD(f: Date, desde: Date, hasta: Date): boolean {
  if (!fechaValida(f)) return false;
  const r = rangoRD(desde, hasta);
  if (!r) return false;
  const t = f.getTime();
  return t >= r.inicio.getTime() && t < r.fin.getTime();
}

/**
 * Compara `f` contra el día actual (`ahora`) en RD y devuelve:
 *  - 'pasado' si cae antes de hoy RD,
 *  - 'hoy'   si cae en el día de hoy RD,
 *  - 'futuro' si cae después,
 *  - 'invalido' si alguna fecha es inválida (fix revisión Codex 2026-10-02: antes caía a
 *    `'futuro'` silenciosamente porque `NaN < x` es false).
 * HOY no cuenta como pasado — fix del hallazgo QA original sobre `resumenMes`.
 */
export function situacionDiaRD(f: Date, ahora: Date): 'pasado' | 'hoy' | 'futuro' | 'invalido' {
  if (!fechaValida(f) || !fechaValida(ahora)) return 'invalido';
  const dHoy = inicioDiaRD(ahora).getTime();
  const dF = inicioDiaRD(f).getTime();
  if (dF < dHoy) return 'pasado';
  if (dF === dHoy) return 'hoy';
  return 'futuro';
}

/** Atajo: ¿este día cae antes de hoy en RD? Inválido → false (no se asume nada). */
export const diaPasadoRD = (f: Date, ahora: Date) => situacionDiaRD(f, ahora) === 'pasado';
/** Atajo: ¿este día es hoy en RD? Inválido → false. */
export const diaEsHoyRD = (f: Date, ahora: Date) => situacionDiaRD(f, ahora) === 'hoy';

export type AtajoRango = 'hoy' | 'manana' | 'semana' | 'mes';

/**
 * Rango inclusivo según atajo, anclado a RD. «semana» = lunes..domingo de la semana de hoy.
 * «mes» = primer..último día del mes de hoy.
 */
export function rangoAtajoRD(atajo: AtajoRango, ahora: Date): { desde: Date; hasta: Date } {
  const c = componentesRD(ahora);
  if (atajo === 'hoy') {
    const d = fechaEnRD(c.anio, c.mes, c.dia);
    return { desde: d, hasta: d };
  }
  if (atajo === 'manana') {
    const d = fechaEnRD(c.anio, c.mes, c.dia + 1);
    return { desde: d, hasta: d };
  }
  if (atajo === 'semana') {
    // Lunes como inicio (RD convencional).
    const offsetLunes = (c.diaSemana + 6) % 7;
    const lunes = fechaEnRD(c.anio, c.mes, c.dia - offsetLunes);
    const domingo = fechaEnRD(c.anio, c.mes, c.dia - offsetLunes + 6);
    return { desde: lunes, hasta: domingo };
  }
  // 'mes'
  const inicio = fechaEnRD(c.anio, c.mes, 1);
  const ultimoDia = new Date(fechaEnRD(c.anio, c.mes + 1, 1).getTime() - DIA);
  return { desde: inicio, hasta: ultimoDia };
}

/**
 * Desplaza un rango completo (desde/hasta) por N días. Útil para los botones anterior/siguiente.
 */
export function desplazarRangoRD(desde: Date, hasta: Date, dias: number): { desde: Date; hasta: Date } {
  const ini = inicioDiaRD(desde);
  const finInc = inicioDiaRD(hasta);
  return {
    desde: new Date(ini.getTime() + dias * DIA),
    hasta: new Date(finInc.getTime() + dias * DIA),
  };
}
