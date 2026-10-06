// NO fijamos process.env.TZ: la lógica debe ser independiente de la zona del dispositivo.
// Si estos tests pasan bajo TZ=UTC y TZ=Asia/Tokyo (ver script de abajo o invocación manual),
// probamos que mapaFechas realmente ancla todo a RD UTC-4.

import { describe, expect, it } from 'vitest';
import {
  componentesRD, fechaEnRD, inicioDiaRD, finDiaRD, mismoDiaRD, rangoRD, enRangoRD,
  situacionDiaRD, diaPasadoRD, diaEsHoyRD, rangoAtajoRD, desplazarRangoRD, fechaValida,
} from '../../src/utils/mapaFechas';

// Un instante conocido: 1 oct 2026 15:00 RD = 19:00 UTC.
const JUEVES_15_RD = new Date('2026-10-01T19:00:00Z');

describe('mapaFechas — zona Santo Domingo (UTC-4), independiente del dispositivo', () => {
  it('componentesRD y fechaEnRD son inversas', () => {
    const d = fechaEnRD(2026, 9, 1, 14, 30);
    const c = componentesRD(d);
    expect(c).toMatchObject({ anio: 2026, mes: 9, dia: 1, hora: 14, minuto: 30 });
  });

  it('inicioDiaRD devuelve 00:00 RD aunque el dispositivo esté en UTC o Tokio', () => {
    const ini = inicioDiaRD(JUEVES_15_RD);
    expect(componentesRD(ini)).toMatchObject({ anio: 2026, mes: 9, dia: 1, hora: 0, minuto: 0 });
    // 00:00 RD = 04:00 UTC.
    expect(ini.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(finDiaRD(JUEVES_15_RD).getTime() - ini.getTime()).toBe(24 * 3_600_000);
  });

  it('mismoDiaRD trata correctamente el cruce 23:30 RD → día UTC siguiente', () => {
    const a = new Date('2026-10-02T03:30:00Z'); // 1 oct 23:30 RD
    const b = new Date('2026-10-01T05:00:00Z'); // 1 oct 01:00 RD
    expect(mismoDiaRD(a, b)).toBe(true);
    const c = new Date('2026-10-02T05:00:00Z'); // 2 oct 01:00 RD
    expect(mismoDiaRD(a, c)).toBe(false);
    expect(mismoDiaRD(new Date(NaN), b)).toBe(false);
  });

  it('rangoRD rechaza invertidos y fechas inválidas en vez de disparar query con Invalid Date', () => {
    const r = rangoRD(fechaEnRD(2026, 9, 5), fechaEnRD(2026, 9, 7))!;
    expect(r.inicio.toISOString()).toBe('2026-10-05T04:00:00.000Z');
    expect(r.fin.toISOString()).toBe('2026-10-08T04:00:00.000Z');
    expect(rangoRD(fechaEnRD(2026, 9, 7), fechaEnRD(2026, 9, 5))).toBeNull();
    expect(rangoRD(new Date(NaN), fechaEnRD(2026, 9, 5))).toBeNull();
    expect(rangoRD(fechaEnRD(2026, 9, 5), new Date(NaN))).toBeNull();
  });

  it('enRangoRD incluye todo el último día (hasta 23:59:59.999 RD)', () => {
    const desde = fechaEnRD(2026, 9, 5);
    const hasta = fechaEnRD(2026, 9, 7);
    expect(enRangoRD(fechaEnRD(2026, 9, 7, 23, 59), desde, hasta)).toBe(true);
    expect(enRangoRD(fechaEnRD(2026, 9, 8, 0, 0), desde, hasta)).toBe(false);
    expect(enRangoRD(fechaEnRD(2026, 9, 4, 23, 59), desde, hasta)).toBe(false);
    expect(enRangoRD(new Date(NaN), desde, hasta)).toBe(false);
  });

  it('situacionDiaRD devuelve «invalido» explícito en vez de caer silencioso a «futuro»', () => {
    const ahora = JUEVES_15_RD;
    expect(situacionDiaRD(fechaEnRD(2026, 8, 30), ahora)).toBe('pasado');
    expect(situacionDiaRD(fechaEnRD(2026, 9, 1), ahora)).toBe('hoy');
    expect(situacionDiaRD(fechaEnRD(2026, 9, 2), ahora)).toBe('futuro');
    expect(situacionDiaRD(new Date(NaN), ahora)).toBe('invalido');
    expect(situacionDiaRD(fechaEnRD(2026, 9, 1), new Date(NaN))).toBe('invalido');
    expect(diaPasadoRD(fechaEnRD(2026, 9, 1), ahora)).toBe(false);
    expect(diaEsHoyRD(fechaEnRD(2026, 9, 1), ahora)).toBe(true);
    // Fecha inválida nunca se da por «pasado» ni por «hoy».
    expect(diaPasadoRD(new Date(NaN), ahora)).toBe(false);
    expect(diaEsHoyRD(new Date(NaN), ahora)).toBe(false);
  });

  it('fechaValida reconoce Date reales', () => {
    expect(fechaValida(new Date())).toBe(true);
    expect(fechaValida(new Date(NaN))).toBe(false);
    expect(fechaValida('2026-10-01' as unknown as Date)).toBe(false);
    expect(fechaValida(null)).toBe(false);
  });

  it('rangoAtajoRD devuelve rangos anclados a RD; semana lunes→domingo', () => {
    const ahora = fechaEnRD(2026, 9, 1, 10, 0); // jueves 1 oct
    expect(rangoAtajoRD('hoy', ahora)).toEqual({ desde: fechaEnRD(2026, 9, 1), hasta: fechaEnRD(2026, 9, 1) });
    expect(rangoAtajoRD('manana', ahora)).toEqual({ desde: fechaEnRD(2026, 9, 2), hasta: fechaEnRD(2026, 9, 2) });
    const sem = rangoAtajoRD('semana', ahora);
    expect(componentesRD(sem.desde).diaSemana).toBe(1);
    expect(componentesRD(sem.hasta).diaSemana).toBe(0);
    const mes = rangoAtajoRD('mes', ahora);
    expect(componentesRD(mes.desde).dia).toBe(1);
    expect(componentesRD(mes.hasta).dia).toBe(31); // octubre
  });

  it('desplazarRangoRD mueve ambos extremos manteniendo RD', () => {
    const d = fechaEnRD(2026, 9, 5), h = fechaEnRD(2026, 9, 7);
    const siguiente = desplazarRangoRD(d, h, 3);
    expect(siguiente.desde.toISOString()).toBe('2026-10-08T04:00:00.000Z');
    expect(siguiente.hasta.toISOString()).toBe('2026-10-10T04:00:00.000Z');
  });
});
