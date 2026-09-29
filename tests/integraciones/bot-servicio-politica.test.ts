import { describe, expect, it } from 'vitest';
import { CONFIG_BOT_INICIAL, costeMaximoBot, evaluarBot, periodosBot, resolverLineaBot, validarConfigBot } from '../../api/_lib/politicaBotServicio';
const tarifa = { modelo: 'modelo-exacto', version: '2026-09', entradaMicroUsdPorMillon: 3_000_000, salidaMicroUsdPorMillon: 15_000_000, maxTokensEntrada: 1000, maxTokensSalida: 100 };
const config = { ...CONFIG_BOT_INICIAL, tarifa };
describe('Política del bot aislada de envíos', () => {
  it.each([
    ['2026-09-28T07:59:59-04:00', false], ['2026-09-28T08:00:00-04:00', true],
    ['2026-09-28T17:59:59-04:00', true], ['2026-09-28T18:00:00-04:00', false],
    ['2026-09-26T15:59:59-04:00', true], ['2026-09-26T16:00:00-04:00', false], ['2026-09-27T10:00:00-04:00', false],
  ])('usa hora RD %s', (fecha, laboral) => expect(periodosBot(Date.parse(fecha)).laboral).toBe(laboral));
  it('el mes usa RD, no UTC', () => expect(periodosBot(Date.parse('2026-10-01T02:00:00Z')).mes).toBe('2026-09'));
  it('rechaza habilitación real, tarifa insegura y duplicar miembros', () => {
    expect(() => validarConfigBot({ ...config, habilitado: true })).toThrow();
    expect(() => validarConfigBot({ ...config, tarifa: { ...tarifa, maxTokensEntrada: Number.MAX_SAFE_INTEGER } })).toThrow();
    expect(() => validarConfigBot({ ...config, equipos: [{ id: 'a', operariaUid: 'x', secretariaUid: 'x' }] })).toThrow();
    expect(costeMaximoBot(tarifa)).toBe(4500);
  });
  it('no adivina phoneNumberId ante ausencia o ambigüedad', () => {
    expect(resolverLineaBot('18495646767', [{ numero: '+1 (849) 564-6767', phoneNumberId: '123' }])).toBe('123');
    expect(() => resolverLineaBot('18495646767', [])).toThrow();
    expect(() => resolverLineaBot('18495646767', [{ numero: '18495646767', phoneNumberId: '1' }, { numero: '18495646767', phoneNumberId: '2' }])).toThrow();
  });
  it('prioriza baja/humano y nunca retorna enviar', () => {
    const entrada = { ahora: Date.parse('2026-09-28T20:00:00-04:00'), pideHumano: false, baja: false, ventanaAbierta: true, datos: {} };
    expect(evaluarBot(CONFIG_BOT_INICIAL, entrada).motivo).toBe('sin_tarifa');
    expect(evaluarBot(config, entrada).accion).toBe('simular');
    expect(evaluarBot(config, { ...entrada, pideHumano: true }).accion).toBe('entregar');
    expect(evaluarBot(config, { ...entrada, pideHumano: true, baja: true }).motivo).toBe('baja');
    expect(evaluarBot(config, { ...entrada, datos: { equipo: 'lavadora', servicio: 'reparacion', falla: 'no enciende', fotoId: 'foto', ubicacion: { lat: 18, lng: -69 } } }).motivo).toBe('datos_completos');
  });
});
it('mantenimiento completo no exige una falla inventada; reparación sí', () => {
  const entrada = { ahora: Date.parse('2026-09-28T20:00:00-04:00'), pideHumano: false, baja: false, ventanaAbierta: true, datos: { equipo: 'lavadora', servicio: 'mantenimiento' as const, fotoId: 'foto', ubicacion: { lat: 18, lng: -69 } } };
  expect(evaluarBot(config, entrada).motivo).toBe('datos_completos');
  expect(evaluarBot(config, { ...entrada, datos: { ...entrada.datos, servicio: 'reparacion' } }).motivo).toBe('recopilar');
});
