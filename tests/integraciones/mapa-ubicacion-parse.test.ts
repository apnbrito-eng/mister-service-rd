import { expect, it } from 'vitest';
import { parseUbicacionMapa } from '../../src/utils/parseUbicacionMapa';
it('no presenta una ubicación sin fecha como fresca', () => {
  expect(Number.isNaN(parseUbicacionMapa('van', { lat: 18, lng: -69 })!.timestamp.getTime())).toBe(true);
});
it('no convierte coordenadas ausentes en una posición', () => {
  expect(parseUbicacionMapa('van', {})).toBeNull();
});
it('una jornada finalizada deja de aparecer en vivo', () => {
  expect(parseUbicacionMapa('van', { jornadaActiva: false, timestamp: new Date() })).toBeNull();
});
it('conserva la fecha del dispositivo', () => {
  const fecha = new Date('2026-10-01T12:00:00Z');
  expect(parseUbicacionMapa('van', { lat: 18, lng: -69, timestamp: { toDate: () => fecha } })!.timestamp).toEqual(fecha);
});
