import { afterEach, expect, it, vi } from 'vitest';
import { detectarCoordenadasURL, reverseGeocode } from '../../src/utils/direccion';
afterEach(() => vi.unstubAllGlobals());
it('acepta una ubicación compartida válida y rechaza coordenadas fuera de rango', () => {
  expect(detectarCoordenadasURL('https://maps.google.com/?q=18.49,-70.00')).toEqual({ lat: 18.49, lng: -70 });
  for (const texto of ['91.00,-70.00', 'https://maps.apple.com/?ll=18.00,190.00', 'lat: 999.00, lng: -70.00']) {
    expect(detectarCoordenadasURL(texto)).toBeNull();
  }
});
it('no consulta geocodificación con ubicación inválida ni interpreta errores HTTP como dirección', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, json: vi.fn() });
  vi.stubGlobal('fetch', fetch);
  expect(await reverseGeocode(999, -70)).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(await reverseGeocode(18, -70)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([
  ['18, -70', {lat:18,lng:-70}],
  ['(18.4933865, -69.997765)', {lat:18.4933865,lng:-69.997765}],
  ['Ubicación: https://maps.google.com/?q=18.49%2C%20-70.00', {lat:18.49,lng:-70}],
  ['https://www.google.com/maps/search/?api=1&query=18.49,-70', {lat:18.49,lng:-70}],
  ['https://www.google.com/maps/place/test/@18,-69,15z/data=!3d19.2!4d-70.1', {lat:19.2,lng:-70.1}],
  ['geo:18.49,-70', {lat:18.49,lng:-70}],
  ['latitud: 18.49, longitud: -70', {lat:18.49,lng:-70}],
  ['https://waze.com/ul?ll=18.49,-70', {lat:18.49,lng:-70}],
])('interpreta ubicación %s', (texto, esperado) => expect(detectarCoordenadasURL(texto)).toEqual(esperado));
it.each(['https://maps.app.goo.gl/ejemplo', 'Sin ubicación', '18, -181', 'https://google.com/maps/?q=91,-70'])('no inventa coordenadas: %s', texto => expect(detectarCoordenadasURL(texto)).toBeNull());
