// Destino: src/utils/__tests__/mapaOperaciones.test.ts
// Fechas construidas en zona RD explícita (fechaEnRD) para que las pruebas pasen bajo cualquier TZ.
import { describe, expect, it } from 'vitest';
import {
  REGLAS_MAPA, agruparPorTecnico, candidatosReasignacion, citasDelDia, compararConMasCorto, enlacesGoogleMaps,
  enSitioSegunGPS, proyectarDia, repartirCitas, senalGPS, sugerenciasPorAtraso, textoEstado, validarReasignacion,
  type CitaMapa, type TecnicoMapa,
} from '../../src/utils/mapaOperaciones';
import { kmEntre, tieneCoord } from '../../src/utils/geo';
import { fechaEnRD, componentesRD } from '../../src/utils/mapaFechas';

const H = (h: number, m = 0) => fechaEnRD(2026, 9, 1, h, m);
const OFICINA = { lat: 18.4730, lng: -69.9300 };
// Puntos reales aproximados de Santo Domingo
const NACO = { lat: 18.4745, lng: -69.9290 }, PIANTINI = { lat: 18.4690, lng: -69.9370 },
  HERRERA = { lat: 18.4790, lng: -70.0030 }, LOS_MINA = { lat: 18.4950, lng: -69.8580 }, PRADOS = { lat: 18.4810, lng: -69.9470 };

let n = 0;
const cita = (tecnicoId: string | null, h: number, p: { lat: number; lng: number } | null, extra: Partial<CitaMapa> = {}): CitaMapa => ({
  id: `c${++n}`, tecnicoId, clienteNombre: `Cliente ${n}`, inicio: H(h), duracionMin: 60,
  ...(p ?? {}), equipo: 'lavadora', tipo: 'reparacion', fase: 'agendado',
  progreso: { indice: 0, completa: false, cancelada: false }, ...extra,
});
const tec = (id: string, extra: Partial<TecnicoMapa> = {}): TecnicoMapa => ({ id, nombre: id, equipo: 'A', repara: ['lavadora', 'secadora'], activo: true, ...extra });
const hecha = { indice: 6, completa: true, cancelada: false };

describe('geo', () => {
  it('descarta coordenadas vacías o 0,0', () => {
    expect(tieneCoord({ lat: 0, lng: 0 })).toBe(false);
    expect(tieneCoord({ lat: NaN, lng: 1 })).toBe(false);
    expect(tieneCoord({})).toBe(false);
    expect(tieneCoord(NACO)).toBe(true);
    expect(kmEntre(NACO, HERRERA)).toBeGreaterThan(8);
  });
});

describe('día y agrupado', () => {
  it('solo citas activas del día, ordenadas por hora', () => {
    const cs = [cita('a', 14, NACO), cita('a', 9, NACO), cita('a', 10, NACO, { fase: 'cancelado' }), cita('a', 11, NACO, { eliminada: true }),
      { ...cita('a', 9, NACO), inicio: fechaEnRD(2026, 9, 2, 9) }];
    const d = citasDelDia(cs, H(0));
    expect(d.map(c => componentesRD(c.inicio).hora)).toEqual([9, 14]);
  });
  it('agrupa por id, no por nombre', () => {
    const g = agruparPorTecnico([cita('u1', 9, NACO), cita('u1', 10, NACO), cita(null, 11, NACO)]);
    expect(g.get('u1')).toHaveLength(2);
    expect(g.get('')).toHaveLength(1);
  });
});

describe('proyección del día', () => {
  it('sale de la oficina y respeta la hora prometida', () => {
    const d = proyectarDia([cita('a', 14, PIANTINI), cita('a', 9, NACO)], { ahora: H(7), origen: OFICINA });
    expect(componentesRD(d.paradas[0].cita.inicio).hora).toBe(9);
    expect(d.paradas[0].llega!.getTime()).toBeLessThanOrEqual(H(9).getTime());
    expect(d.paradas[1].llega!.getTime()).toBeLessThanOrEqual(H(14).getTime());
    expect(d.estado).toBe('por_salir');
    expect(d.atrasado).toBe(false);
    expect(d.fuente).toBe('estimado');
  });
  it('si la cita anterior se alarga, la siguiente sale tarde', () => {
    const enSitio = cita('a', 9, NACO, { progreso: { indice: 3, completa: false, cancelada: false, desde: H(9) } });
    const d = proyectarDia([enSitio, cita('a', 10, HERRERA)], { ahora: H(10, 30), origen: OFICINA });
    expect(d.estado).toBe('en_sitio');
    expect(d.paradas[1].tardeMin).toBeGreaterThan(REGLAS_MAPA.atrasoParaSugerirMin);
    expect(d.atrasado).toBe(true);
    expect(textoEstado(d, H(10, 30))).toContain('En casa de');
  });
  it('en camino usa el GPS para la hora de llegada', () => {
    const c = cita('a', 11, HERRERA, { progreso: { indice: 1, completa: false, cancelada: false, desde: H(10, 40) } });
    const gps = { tecnicoId: 'a', ...PIANTINI, timestamp: H(10, 59), enMovimiento: true };
    const d = proyectarDia([c], { ahora: H(11), origen: OFICINA, gps });
    expect(d.estado).toBe('en_camino');
    expect(d.paradas[0].llega!.getTime()).toBeGreaterThan(H(11).getTime());
    expect(textoEstado(d, H(11))).toMatch(/llega en \d+ min/);
  });
  it('detecta «en sitio» por GPS sin cambiar la orden', () => {
    const c = cita('a', 9, NACO);
    const gps = { tecnicoId: 'a', lat: NACO.lat + 0.0005, lng: NACO.lng, timestamp: H(9, 5), enMovimiento: false };
    expect(enSitioSegunGPS(c, gps, H(9, 6))).toBe(true);
    expect(enSitioSegunGPS(c, { ...gps, timestamp: H(8) }, H(9, 6))).toBe(false); // GPS viejo
    const d = proyectarDia([c], { ahora: H(9, 6), origen: OFICINA, gps });
    expect(d.paradas[0].estado).toBe('en_sitio');
    expect(d.paradas[0].segunGPS).toBe(true);
    expect(c.progreso.indice).toBe(0);
  });
  it('terminado y sin citas', () => {
    expect(proyectarDia([cita('a', 9, NACO, { progreso: hecha })], { ahora: H(12) }).estado).toBe('termino');
    expect(proyectarDia([], { ahora: H(12) }).estado).toBe('sin_citas');
  });
  it('señal GPS', () => {
    const p = { tecnicoId: 'a', ...NACO, timestamp: H(10), enMovimiento: true };
    expect(senalGPS(p, H(10, 2)).senal).toBe('ok');
    expect(senalGPS(p, H(10, 8)).senal).toBe('vieja');
    expect(senalGPS(p, H(10, 30)).senal).toBe('perdida');
    expect(senalGPS(null, H(10)).senal).toBe('sin_gps');
  });
});

describe('candidatos para reasignar', () => {
  const tecs = [tec('reyes'), tec('diorky'), tec('yunior', { equipo: 'B' }), tec('wilfredo', { repara: ['estufa'] }), tec('franklin', { activo: false })];
  const mover = cita('reyes', 14, NACO);
  const todas = [
    mover,
    cita('diorky', 13, PIANTINI),                 // libre a las 2, cerca
    cita('yunior', 13, LOS_MINA),                 // otro equipo y lejos
    cita('wilfredo', 12, NACO),                   // no repara lavadoras
    cita('reyes', 9, HERRERA),
  ];
  const cands = candidatosReasignacion(mover, tecs, todas, { ahora: H(11), origen: OFICINA });
  it('ordena del mejor al peor y explica', () => {
    expect(cands[0].tecnico.id).toBe('diorky');
    expect(cands[0].nivel).toBe('recomendado');
    expect(cands[0].resumen).toMatch(/a tiempo/);
    const y = cands.find(c => c.tecnico.id === 'yunior')!;
    expect(y.avisos.join()).toContain('equipo B');
    const w = cands.find(c => c.tecnico.id === 'wilfredo')!;
    expect(w.avisos.join()).toContain('No repara lavadoras');
    expect(cands.at(-1)!.tecnico.id).toBe('franklin');
    expect(cands.at(-1)!.nivel).toBe('bloqueado');
    expect(cands.some(c => c.tecnico.id === 'reyes')).toBe(false);
  });
  it('bloquea choques y aplica tope diario solo si está configurado', () => {
    const choque = candidatosReasignacion(mover, [tec('x')], [mover, cita('x', 14, NACO, { duracionMin: 30 })], { ahora: H(11) });
    expect(choque[0].bloqueos.join()).toContain('Tiene otra cita');
    const lleno = Array.from({ length: 7 }, (_, i) => cita('x', 9 + i, NACO));
    expect(candidatosReasignacion(cita('reyes', 17, NACO), [tec('x')], lleno, { ahora: H(8) })[0].bloqueos).toEqual([]);
    expect(candidatosReasignacion(cita('reyes', 17, NACO), [tec('x')], lleno, { ahora: H(8), maximoDia: 7 })[0].bloqueos.join()).toContain('máximo 7');
  });
  it('al evaluar una cita no cuenta como ocupadas las citas de otros días del rango', () => {
    const manana = cita('x', 10, NACO, { inicio: fechaEnRD(2026, 9, 2, 10) });
    const resultado = candidatosReasignacion(mover, [tec('x')], [manana], { ahora: H(8) })[0];
    expect(resultado.citasEseDia).toBe(0);
    expect(resultado.diaActual.paradas).toHaveLength(0);
    expect(resultado.bloqueos).toEqual([]);
  });
  it('validación final', () => {
    const v = validarReasignacion(mover, tecs[1], cands[0], H(11));
    expect(v).toMatchObject({ puede: true, requiereMotivo: false });
    const enSitio = { ...mover, progreso: { indice: 2, completa: false, cancelada: false } };
    expect(validarReasignacion(enSitio, tecs[1], null, H(11)).puede).toBe(false);
    const enCamino = { ...mover, progreso: { indice: 1, completa: false, cancelada: false } };
    expect(validarReasignacion(enCamino, tecs[1], null, H(11)).requiereMotivo).toBe(true);
    expect(validarReasignacion(mover, tecs[0], null, H(11)).bloqueos.join()).toContain('ya es de');
    expect(validarReasignacion({ ...mover, fase: 'trabajo_realizado' }, tecs[1], null, H(11)).puede).toBe(false);
  });
  it('cita sin técnico también tiene candidatos', () => {
    const libre = cita(null, 15, PRADOS);
    expect(candidatosReasignacion(libre, tecs, [...todas, libre], { ahora: H(11), origen: OFICINA })).toHaveLength(tecs.length);
  });
});

describe('según el avance', () => {
  it('propone mover la cita que va a llegar muy tarde a alguien del mismo equipo', () => {
    const tecs = [tec('reyes'), tec('diorky'), tec('yunior', { equipo: 'B' })];
    const todas = [
      cita('reyes', 9, HERRERA, { progreso: { indice: 4, completa: false, cancelada: false, desde: H(10, 30) }, duracionMin: 90 }),
      cita('reyes', 12, LOS_MINA),
      cita('diorky', 9, NACO, { progreso: hecha }),
      cita('yunior', 9, LOS_MINA, { progreso: hecha }),
    ];
    const s = sugerenciasPorAtraso(tecs, todas, { ahora: H(11, 20), origen: OFICINA });
    expect(s).toHaveLength(1);
    expect(s[0].a.id).toBe('diorky');
    expect(s[0].texto).toContain('puede llegar a tiempo');
  });
  it('reparte el día de un técnico y deja sin asignar lo que nadie puede tomar', () => {
    const tecs = [tec('reyes'), tec('diorky')];
    const todas = [cita('reyes', 10, NACO), cita('reyes', 15, PIANTINI), cita('diorky', 10, PRADOS), cita('diorky', 15, PRADOS, { duracionMin: 60 })];
    const plan = repartirCitas('reyes', tecs, todas, { ahora: H(8), origen: OFICINA });
    expect(plan).toHaveLength(2);
    expect(plan.every(m => m.a === null)).toBe(true);
    const plan2 = repartirCitas('reyes', tecs, todas.slice(0, 3), { ahora: H(8), origen: OFICINA });
    expect(plan2.map(m => m.a?.id ?? null)).toEqual([null, 'diorky']);
  });
});

describe('ruta y enlaces', () => {
  it('el orden más corto es solo informativo', () => {
    const cs = [cita('a', 9, HERRERA), cita('a', 10, LOS_MINA), cita('a', 11, PRADOS), cita('a', 12, PIANTINI)];
    const r = compararConMasCorto(cs, OFICINA)!;
    expect(r.ahorroKm).toBeGreaterThan(0);
    expect(r.cambianDeLugar.length).toBeGreaterThan(0);
    expect(compararConMasCorto(cs.slice(0, 2), OFICINA)).toBeNull();
  });
  it('enlaces de Google Maps en tramos de 3 paradas intermedias', () => {
    const pts = [NACO, PIANTINI, HERRERA, LOS_MINA, PRADOS, NACO, PIANTINI];
    const u = enlacesGoogleMaps(OFICINA, pts);
    expect(u).toHaveLength(2);
    expect(u[0]).toContain('waypoints=');
    expect(decodeURIComponent(u[1])).toContain(`origin=${LOS_MINA.lat.toFixed(6)}`);
    expect(enlacesGoogleMaps(OFICINA, [])).toEqual([]);
    expect(enlacesGoogleMaps(null, [{ lat: 0, lng: 0 }])).toEqual([]);
  });
});
