// Destino sugerido: src/utils/__tests__/capacidadAgenda.test.ts
// Fechas construidas con `fechaEnRD` para que las pruebas sean independientes de la zona del dispositivo.
import { describe, expect, it } from 'vitest';
import {
  construirMapa, sugerirHuecos, calcularAvisos, horaAMinutos, minutosAHora, proximosDias,
  especialidadDe, huecosPorEspecialidad, type TecnicoAgenda, type CitaFutura,
} from '../../src/utils/capacidadAgenda';
import { fechaEnRD, componentesRD } from '../../src/utils/mapaFechas';

const H = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];
const semana = { Lunes: H, Martes: H, Miércoles: H, Jueves: H, Viernes: H, Sábado: H.slice(0, 6) };
const tec = (id: string, nombre: string, equipo: 'A' | 'B', repara: TecnicoAgenda['repara'], extra: Partial<TecnicoAgenda> = {}): TecnicoAgenda =>
  ({ id, nombre, equipo, repara, horasPorDia: semana, almuerzo: '12:00 PM', ...extra });

const yoniel = tec('y', 'Yoniel', 'A', ['nevera', 'lavadora', 'secadora', 'estufa', 'aire']);
const franklin = tec('f', 'Franklin', 'B', ['estufa']);
const albert = tec('a', 'Albert Brito', 'A', ['aire'], { soloMantenimiento: ['lavadora', 'secadora', 'estufa'] });
const wilmer = tec('w', 'Wilmer', 'B', ['nevera'], { contratista: true, horasPorDia: { Lunes: H, Martes: H, Miércoles: H, Jueves: H, Viernes: H } });

const jue1 = fechaEnRD(2026, 9, 1, 15, 0); // jueves 1 oct 2026, 3:00 PM RD
const dias = proximosDias(jue1, 8);
const at = (d: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const c = componentesRD(d);
  return fechaEnRD(c.anio, c.mes, c.dia, h, m);
};

describe('utilidades', () => {
  it('convierte horas', () => {
    expect(horaAMinutos('9:00 AM')).toBe(540);
    expect(horaAMinutos('12:00 PM')).toBe(720);
    expect(minutosAHora(13 * 60)).toBe('1:00 PM');
  });
  it('salta domingos', () => {
    expect(dias.map(d => d.getDay())).not.toContain(0);
    expect(dias[0].getDate()).toBe(2);
  });
  it('normaliza equipos', () => {
    expect(especialidadDe('Nevera Frigidaire')).toBe('nevera');
    expect(especialidadDe('Aire 12k BTU')).toBe('aire');
    expect(especialidadDe('Secadora Mabe')).toBe('secadora');
  });
});

describe('construirMapa', () => {
  const citas: CitaFutura[] = [
    { id: '1', tecnicoId: 'y', inicio: at(dias[0], '9:45'), clienteNombre: 'X' },   // fuera de hora fija: ocupa 9:00
    { id: '2', tecnicoId: 'y', inicio: at(dias[0], '10:00'), clienteNombre: 'Y' },
    { id: '3', tecnicoId: 'y', inicio: at(dias[0], '10:00'), clienteNombre: 'Z' },  // choque
  ];
  const celdas = construirMapa([yoniel, franklin, wilmer], citas, dias);
  it('cuenta citas, libres y choques', () => {
    const c = celdas.find(c => c.tecnicoId === 'y' && c.fecha.getTime() === dias[0].getTime())!;
    expect(c.citas).toHaveLength(3);
    expect(c.horasLibres).not.toContain('9:00 AM');
    expect(c.horasLibres).not.toContain('12:00 PM'); // almuerzo
    expect(c.horasChocadas).toEqual(['10:00 AM']);
  });
  it('vacío y no trabaja', () => {
    expect(celdas.find(c => c.tecnicoId === 'f' && c.fecha.getTime() === dias[0].getTime())!.nivel).toBe('vacio');
    const sab = dias.find(d => d.getDay() === 6)!;
    expect(celdas.find(c => c.tecnicoId === 'w' && c.fecha.getTime() === sab.getTime())!.nivel).toBe('no_trabaja');
  });
});

describe('sugerirHuecos', () => {
  it('prefiere al especialista con el día vacío y no repite horas', () => {
    const lleno: CitaFutura[] = ['9:00', '10:00', '11:00'].map((h, i) => ({ id: 'y' + i, tecnicoId: 'y', inicio: at(dias[0], h), clienteNombre: 'C' }));
    const celdas = construirMapa([yoniel, franklin], lleno, dias);
    const s = sugerirHuecos([
      { id: 'p1', origen: 'solicitud', clienteNombre: 'A', equipo: 'estufa', tipo: 'reparacion' },
      { id: 'p2', origen: 'solicitud', clienteNombre: 'B', equipo: 'estufa', tipo: 'reparacion' },
    ], [yoniel, franklin], celdas);
    expect(s[0].tecnicoId).toBe('f');
    expect(`${s[0].fecha.getTime()}${s[0].hora}`).not.toBe(`${s[1].fecha.getTime()}${s[1].hora}`);
  });
  it('mantenimiento de lavadora puede ir a Albert; reparación no', () => {
    const celdas = construirMapa([albert], [], dias);
    expect(sugerirHuecos([{ id: 'm', origen: 'mantenimiento', clienteNombre: 'M', equipo: 'lavadora', tipo: 'mantenimiento' }], [albert], celdas)).toHaveLength(1);
    expect(sugerirHuecos([{ id: 'r', origen: 'solicitud', clienteNombre: 'R', equipo: 'lavadora', tipo: 'reparacion' }], [albert], celdas)).toHaveLength(0);
  });
  it('respeta noAntesDe y técnico preferido de garantía', () => {
    const celdas = construirMapa([yoniel, franklin], [], dias);
    const [m] = sugerirHuecos([{ id: 'm', origen: 'mantenimiento', clienteNombre: 'M', equipo: 'estufa', tipo: 'mantenimiento', noAntesDe: dias[3] }], [yoniel, franklin], celdas);
    expect(m.fecha.getTime()).toBeGreaterThanOrEqual(dias[3].getTime());
    const [g] = sugerirHuecos([{ id: 'g', origen: 'garantia', clienteNombre: 'G', equipo: 'estufa', tipo: 'reparacion', tecnicoPreferidoId: 'y' }], [yoniel, franklin], celdas);
    expect(g.tecnicoId).toBe('y');
  });
});

describe('avisos y huecos por especialidad', () => {
  it('mañana sin citas después de las 2 PM y semana floja', () => {
    const celdas = construirMapa([yoniel, franklin], [], dias);
    const tipos = calcularAvisos([yoniel, franklin], celdas, jue1).map(a => a.tipo);
    expect(tipos.filter(t => t === 'manana_sin_citas')).toHaveLength(2);
    expect(tipos).toContain('semana_floja');
    expect(calcularAvisos([yoniel, franklin], celdas, new Date(2026, 9, 1, 10)).some(a => a.tipo === 'manana_sin_citas')).toBe(false);
  });
  it('cuenta huecos de estufa', () => {
    const celdas = construirMapa([franklin], [], dias);
    const r = huecosPorEspecialidad([franklin], celdas, dias.slice(0, 2));
    expect(r.estufa.total).toBe(8 + 5); // viernes 8 horas sin almuerzo, sábado 5
    expect(r.nevera.total).toBe(0);
  });
});

import { kmEntre, kmRuta, resumenPorZona, resumenMes } from '../../src/utils/capacidadAgenda';

describe('zonas, distancia y mes', () => {
  const naco = { lat: 18.474, lng: -69.928 }, pedroBrand = { lat: 18.566, lng: -70.093 }, prados = { lat: 18.478, lng: -69.951 };
  it('km aproximados por calle', () => {
    expect(kmEntre(naco, prados)).toBeLessThan(4);
    expect(kmEntre(naco, pedroBrand)).toBeGreaterThan(25);
  });
  it('prefiere al técnico que ya va a estar cerca', () => {
    const otro = tec('o', 'Otro', 'B', ['estufa']);
    const citas: CitaFutura[] = [
      { id: '1', tecnicoId: 'f', inicio: at(dias[0], '9:00'), clienteNombre: 'A', ...pedroBrand },
      { id: '2', tecnicoId: 'o', inicio: at(dias[0], '9:00'), clienteNombre: 'B', ...naco },
    ];
    const celdas = construirMapa([franklin, otro], citas, dias.slice(0, 1));
    const [s] = sugerirHuecos([{ id: 'p', origen: 'solicitud', clienteNombre: 'C', equipo: 'estufa', tipo: 'reparacion', ...prados }], [franklin, otro], celdas);
    expect(s.tecnicoId).toBe('o');
  });
  it('ruta y aviso de ruta cruzada', () => {
    const citas: CitaFutura[] = [
      { id: '1', tecnicoId: 'f', inicio: at(dias[0], '9:00'), clienteNombre: 'A', ...naco },
      { id: '2', tecnicoId: 'f', inicio: at(dias[0], '11:00'), clienteNombre: 'B', ...pedroBrand },
    ];
    expect(kmRuta(citas)).toBeGreaterThan(25);
    const celdas = construirMapa([franklin], citas, dias.slice(0, 1));
    expect(calcularAvisos([franklin], celdas, new Date(2026, 9, 1, 9)).some(a => a.tipo === 'ruta_cruzada')).toBe(true);
  });
  it('resumen por zona con técnico principal', () => {
    const citas: CitaFutura[] = [
      { id: '1', tecnicoId: 'f', inicio: at(dias[0], '9:00'), clienteNombre: 'A', zona: 'Naco' },
      { id: '2', tecnicoId: 'f', inicio: at(dias[1], '9:00'), clienteNombre: 'B', zona: 'Naco' },
      { id: '3', tecnicoId: 'y', inicio: at(dias[1], '9:00'), clienteNombre: 'C', zona: 'Naco' },
    ];
    const [z] = resumenPorZona(citas, [franklin, yoniel]);
    expect(z).toMatchObject({ zona: 'Naco', citas: 3, tecnicos: 2, principal: { tecnicoId: 'f', citas: 2 }, porEquipo: { A: 1, B: 2 } });
  });
  it('resumen del mes sin domingos; hoy no cuenta como pasado', () => {
    const celdas = construirMapa([franklin], [], proximosDias(fechaEnRD(2026, 8, 30), 27));
    const m = resumenMes(celdas, 2026, 9, jue1);
    // Dia semanal en RD, no en zona del dispositivo.
    expect(m.some(d => componentesRD(d.fecha).diaSemana === 0)).toBe(false);
    expect(m[0].pasado).toBe(false);
    expect(m[0].esHoy).toBe(true);
    const mPasado = resumenMes(construirMapa([franklin], [], proximosDias(fechaEnRD(2026, 8, 28), 10)), 2026, 8, jue1);
    const diaPasado = mPasado.find(d => componentesRD(d.fecha).dia === 30)!;
    expect(diaPasado.pasado).toBe(true);
    expect(diaPasado.esHoy).toBe(false);
    expect(m.find(d => componentesRD(d.fecha).dia === 2)!.tecnicosVacios).toBe(1);
  });
});
