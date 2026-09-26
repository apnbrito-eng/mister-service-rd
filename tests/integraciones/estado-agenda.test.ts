import { describe, expect, it } from 'vitest';
import { visitaEnProgreso } from '../../src/utils/estadoAgenda';
import type { OrdenServicio } from '../../src/types';

describe('Agenda: visita realmente iniciada', () => {
  it.each(['agendado', 'en_gestion'] as const)('no cuenta %s sin inicio como trabajo en progreso', fase => {
    expect(visitaEnProgreso({ fase })).toBe(false);
  });
  it.each(['en_diagnostico', 'en_cotizacion', 'aprobado'] as const)('conserva fases activas %s de órdenes antiguas', fase => {
    expect(visitaEnProgreso({ fase })).toBe(true);
  });
  it('excluye trabajo terminado aunque conserve evidencia del inicio', () => {
    const inicioChequeo = { fotoUrl: 'foto-ficticia' } as OrdenServicio['inicioChequeo'];
    expect(visitaEnProgreso({ fase: 'agendado', inicioChequeo })).toBe(true);
    expect(visitaEnProgreso({ fase: 'trabajo_realizado', inicioChequeo })).toBe(false);
    expect(visitaEnProgreso({ fase: 'cerrado', inicioChequeo })).toBe(false);
  });
});
