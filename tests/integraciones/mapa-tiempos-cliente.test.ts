import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../src/services/equipoApi', () => ({ equipoApi: m.api }));
import { consultarRuta, tramoDeRuta } from '../../src/services/tiemposRuta.service';
const puntos = [{ lat: 18.5, lng: -69.9 }, { lat: 18.6, lng: -69.8 }];
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T14:00:00Z')); });
afterEach(() => vi.useRealTimers());
it('fuente vencida o futura regresa a estimación', () => {
  for (const calculadoEn of [Date.now() - 31 * 60_000, Date.now() + 1]) {
    const tramo = tramoDeRuta(puntos, { fuente: 'google', calculadoEn, tramos: [{ km: 1, min: 3 }], polilinea: null });
    expect(tramo(puntos[0], puntos[1]).fuente).toBe('estimado');
  }
});
it('no reutiliza consulta Google para un tramo diferente', () => {
  const tramo = tramoDeRuta(puntos, { fuente: 'google', calculadoEn: Date.now(), tramos: [{ km: 1, min: 3 }], polilinea: null });
  expect(tramo(puntos[0], puntos[1]).fuente).toBe('google');
  expect(tramo(puntos[1], puntos[0]).fuente).toBe('estimado');
});
it('coalesce llamadas concurrentes; fallo no deja solicitud bloqueada', async () => {
  m.api.mockRejectedValue(new Error('sin conexión'));
  await Promise.all([consultarRuta(puntos), consultarRuta(puntos)]);
  expect(m.api).toHaveBeenCalledTimes(1);
  await consultarRuta(puntos); expect(m.api).toHaveBeenCalledTimes(2);
});
it('no recorta ni elimina puntos inválidos creando una ruta distinta', async () => {
  expect((await consultarRuta([...puntos, { lat: NaN, lng: 0 }])).fuente).toBe('estimado');
  expect(m.api).not.toHaveBeenCalled();
});
it('conserva el motivo del servidor cuando la cuota impide consultar Google', async () => {
  m.api.mockResolvedValue({ fuente: 'estimado', tramos: null, motivo: 'tope_mensual' });
  expect(await consultarRuta(puntos)).toEqual({ fuente: 'estimado', tramos: null, motivo: 'tope_mensual' });
});

it('una pareja de puntos repetida no recibe el tiempo de otra parada', () => {
  const ruta = [puntos[0], puntos[1], puntos[0], puntos[1]];
  const tramo = tramoDeRuta(ruta, { fuente: 'google', calculadoEn: Date.now(), polilinea: null,
    tramos: [{ km: 1, min: 3 }, { km: 2, min: 4 }, { km: 1, min: 8 }] });
  expect(tramo(puntos[0], puntos[1]).fuente).toBe('estimado');
});
