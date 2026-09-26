import { describe, it, expect } from 'vitest';
import { muestraValida, estadoUbicacion, origenApiMovil } from '../../src/mobile/politicas';
import { validarAsignacionTecnico } from '../../api/_lib/accesoOrdenTecnico';
const now = Date.now();
const muestra = { lat: 18.4, lng: -69.9, precision: 10, capturadaEn: now, simulada: false };
describe('Controles de app móvil', () => {
  it('distingue ubicación reciente, retrasada y ausente sin inventar coordenadas', () => {
    expect(estadoUbicacion(now, now)).toBe('reciente');
    expect(estadoUbicacion(now - 180000, now)).toBe('retrasada');
    expect(estadoUbicacion(undefined, now)).toBe('sin datos');
    expect(estadoUbicacion(now - 1000000, now)).toBe('sin datos');
  });
  it('rechaza coordenadas, precisión y fechas inválidas', () => {
    expect(muestraValida(muestra, now)).toBe(true);
    for (const change of [{ lat: 100 }, { lng: Infinity }, { precision: -1 }, { capturadaEn: now + 3600000 }, { capturadaEn: now - 90000000 }, { simulada: 'false' }]) expect(muestraValida({ ...muestra, ...change }, now)).toBe(false);
  });
  it('el origen móvil debe ser HTTPS y no puede incluir credenciales o rutas', () => {
    expect(origenApiMovil('https://ensayo.example')).toBe('https://ensayo.example');
    for (const value of [undefined, 'http://host', 'https://user:password@host', 'https://host/api', 'https://host/?secret=1']) expect(() => origenApiMovil(value)).toThrow();
  });
  it('solo acepta el técnico asignado por identificador, nunca por nombre', () => {
    expect(validarAsignacionTecnico({ tecnicoId: 't1', clienteTelefono: '8095550100', fase: 'agendado' }, ['t1'])).toBe('18095550100');
    expect(() => validarAsignacionTecnico({ tecnicoId: 't2', tecnicoNombre: 'Mismo Nombre', clienteTelefono: '8095550100', fase: 'agendado' }, ['t1'])).toThrow();
  });
  it('cierre, reasignación y otro destinatario bloquean mensajería', () => {
    for (const fase of ['cerrado', 'cancelado', 'trabajo_realizado', 'facturada']) expect(() => validarAsignacionTecnico({ tecnicoId: 't1', clienteTelefono: '8095550100', fase }, ['t1'])).toThrow();
    expect(() => validarAsignacionTecnico({ tecnicoId: 't1', clienteTelefono: '8095550100', fase: 'agendado' }, ['t1'], '18095559999')).toThrow();
  });
});
