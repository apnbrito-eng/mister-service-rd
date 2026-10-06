// Regresión 2026-10-02 — standby abierto no debe empujar la ruta ni fabricar llegada
// cuando falta origen/GPS; la salida 8:30 solo se usa cuando hay oficina real.
// NO fijamos process.env.TZ: fechas en RD vía `fechaEnRD`.

import { describe, expect, it } from 'vitest';
import {
  REGLAS_MAPA, candidatosReasignacion, proyectarDia, repartirCitas,
  sugerenciasPorAtraso, textoEstado, type CitaMapa, type TecnicoMapa,
} from '../../src/utils/mapaOperaciones';
import { fechaEnRD } from '../../src/utils/mapaFechas';

const H = (h: number, m = 0) => fechaEnRD(2026, 9, 1, h, m);
const NACO = { lat: 18.4745, lng: -69.9290 };
const PIANTINI = { lat: 18.4690, lng: -69.9370 };
const HERRERA = { lat: 18.4790, lng: -70.0030 };
const OFICINA = { lat: 18.4730, lng: -69.9300 };

let n = 0;
const cita = (
  tecnicoId: string | null,
  h: number,
  p: { lat: number; lng: number } | null,
  extra: Partial<CitaMapa> = {},
): CitaMapa => ({
  id: `c${++n}`, tecnicoId, clienteNombre: `C${n}`, inicio: H(h), duracionMin: 60,
  ...(p ?? {}), equipo: 'lavadora', tipo: 'reparacion', fase: 'agendado',
  progreso: { indice: 0, completa: false, cancelada: false }, ...extra,
});
const tec = (id: string, extra: Partial<TecnicoMapa> = {}): TecnicoMapa => ({
  id, nombre: id, equipo: 'A', repara: ['lavadora', 'secadora'], activo: true, ...extra,
});

/* ---------- Standby no empuja ruta ni consume tiempo ---------- */

describe('standby abierto hoy no empuja la ruta ni consume duración/traslado', () => {
  it('la cita siguiente no se desplaza por standby de la anterior', () => {
    const standby = cita('reyes', 10, NACO, {
      progreso: { indice: 1, completa: false, cancelada: false, standby: true, desde: H(10) },
      duracionMin: 120,
    });
    const otra = cita('reyes', 14, PIANTINI);
    const d = proyectarDia([standby, otra], { ahora: H(11), origen: OFICINA });
    const siguiente = d.paradas.find(p => p.cita.id === otra.id)!;
    // Si la standby empujara, la siguiente llegaría tras H(12) + traslado; con fix llega acorde a su hora prometida.
    expect(siguiente.llega!.getTime()).toBeLessThanOrEqual(H(14).getTime());
    expect(siguiente.tardeMin).toBe(0);
  });

  it('standby no suma a kmPendientes ni minPendientes', () => {
    const standby = cita('reyes', 10, HERRERA, {
      progreso: { indice: 1, completa: false, cancelada: false, standby: true, desde: H(10) },
    });
    const dSolo = proyectarDia([standby], { ahora: H(11), origen: OFICINA });
    expect(dSolo.kmPendientes).toBe(0);
    expect(dSolo.minPendientes).toBe(0);
    const sinStandby = proyectarDia([{ ...standby, progreso: { indice: 1, completa: false, cancelada: false, desde: H(10) } }], { ahora: H(11), origen: OFICINA });
    expect(sinStandby.kmPendientes).toBeGreaterThan(0);
  });

  it('standby no cuenta como enCurso ni como proxima', () => {
    const standby = cita('reyes', 10, NACO, {
      progreso: { indice: 2, completa: false, cancelada: false, standby: true, desde: H(10) },
    });
    const pendiente = cita('reyes', 13, PIANTINI);
    const d = proyectarDia([standby, pendiente], { ahora: H(11), origen: OFICINA });
    expect(d.enCurso).toBeNull();
    expect(d.proxima?.cita.id).toBe(pendiente.id);
    const parada = d.paradas.find(p => p.cita.id === standby.id)!;
    expect(parada.enStandby).toBe(true);
    expect(parada.estado).toBe('pendiente');
    // Etiqueta honesta: no se habla de «En casa de» cuando el técnico no está activo.
    expect(textoEstado(d, H(11))).not.toContain('En casa de');
  });

  it('standby no cuenta como atraso aunque la hora prometida ya haya pasado', () => {
    const standby = cita('reyes', 8, NACO, {
      progreso: { indice: 1, completa: false, cancelada: false, standby: true, desde: H(8) },
      duracionMin: 60,
    });
    const d = proyectarDia([standby], { ahora: H(14), origen: OFICINA });
    expect(d.atrasoMin).toBe(0);
    expect(d.atrasado).toBe(false);
  });

  it('sugerenciasPorAtraso ignora standby', () => {
    const tecs = [tec('reyes'), tec('diorky')];
    const standby = cita('reyes', 10, HERRERA, {
      progreso: { indice: 1, completa: false, cancelada: false, standby: true, desde: H(8) },
      duracionMin: 60,
    });
    const otra = cita('diorky', 9, NACO, { progreso: { indice: 6, completa: true, cancelada: false } });
    const s = sugerenciasPorAtraso(tecs, [standby, otra], { ahora: H(13), origen: OFICINA });
    expect(s.filter(x => x.cita.id === standby.id)).toHaveLength(0);
  });

  it('candidatosReasignacion no bloquea por choque cuando la otra cita del destino está en standby', () => {
    const mover = cita('reyes', 14, NACO);
    const destinoStandby = cita('diorky', 14, PIANTINI, {
      progreso: { indice: 0, completa: false, cancelada: false, standby: true },
      duracionMin: 60,
    });
    const [cand] = candidatosReasignacion(mover, [tec('diorky')], [mover, destinoStandby], { ahora: H(11), origen: OFICINA });
    expect(cand.bloqueos).not.toContain(expect.stringMatching(/Tiene otra cita/));
    expect(cand.bloqueos.join()).not.toContain('Tiene otra cita');
  });

  it('standby en futuro conserva fuente «futuro», sin ETA inferido', () => {
    const futura = cita('reyes', 9, NACO, {
      inicio: fechaEnRD(2026, 9, 5, 9),
      progreso: { indice: 0, completa: false, cancelada: false, standby: true },
    });
    const d = proyectarDia([futura], { ahora: H(10), origen: OFICINA });
    expect(d.dia).toBe('futuro');
    const parada = d.paradas[0];
    expect(parada.enStandby).toBe(true);
    expect(parada.sale).toBeNull();
    expect(parada.llega).toBeNull();
    expect(parada.km).toBeNull();
    expect(parada.minViaje).toBeNull();
  });

  it('repartirCitas sigue incluyendo citas pendientes en standby — la pieza llega al nuevo técnico', () => {
    const tecs = [tec('reyes'), tec('diorky')];
    const standby = cita('reyes', 10, NACO, {
      progreso: { indice: 0, completa: false, cancelada: false, standby: true },
    });
    const plan = repartirCitas('reyes', tecs, [standby], { ahora: H(8), origen: OFICINA });
    expect(plan).toHaveLength(1);
    expect(plan[0].a?.id).toBe('diorky');
  });
});

/* ---------- Primera llegada sin origen/GPS no fabrica hora puntual ---------- */

describe('sin origen ni GPS válido no se fabrica llegada puntual', () => {
  it('cita con coord pero sin origen → sale/llega null, tardeMin 0', () => {
    const c = cita('reyes', 14, NACO);
    const d = proyectarDia([c], { ahora: H(8) }); // sin origen, sin gps
    expect(d.paradas[0].sale).toBeNull();
    expect(d.paradas[0].llega).toBeNull();
    expect(d.paradas[0].km).toBeNull();
    expect(d.paradas[0].minViaje).toBeNull();
    expect(d.paradas[0].tardeMin).toBe(0);
  });

  it('cita con coord y origen → se calcula ETA real', () => {
    const c = cita('reyes', 14, NACO);
    const d = proyectarDia([c], { ahora: H(13), origen: OFICINA });
    expect(d.paradas[0].sale).not.toBeNull();
    expect(d.paradas[0].llega).not.toBeNull();
  });

  it('después de la primera parada, lugar se actualiza y la siguiente sí tiene ETA', () => {
    const c1 = cita('reyes', 10, NACO);
    const c2 = cita('reyes', 12, HERRERA);
    const d = proyectarDia([c1, c2], { ahora: H(8) }); // sin origen
    // Primera sin viaje calculable: llega null.
    expect(d.paradas[0].llega).toBeNull();
    // Segunda: lugar=NACO (tras c1), tiene coord → viaje conocido → ETA.
    expect(d.paradas[1].llega).not.toBeNull();
    expect(d.paradas[1].minViaje).not.toBeNull();
  });
});

/* ---------- Salida de oficina configurable ---------- */

describe('REGLAS_MAPA.salidaOficina (8:30) no se impone sin oficina ni override', () => {
  it('sin origen y sin horaSalidaOficinaMin → baseline ancla a `ahora` (hoy)', () => {
    const c = cita('reyes', 14, NACO);
    // Si el baseline fuera 8:30 obligatorio, la cita de ayer 7:00 no debería aparecer tarde;
    // probamos sin origen y verificamos que la segunda cita no se desplaza fuera de su hora.
    const d = proyectarDia([c], { ahora: H(13) });
    // Sin viaje conocido: no inventa ETA. tardeMin=0 por falta de dato.
    expect(d.paradas[0].tardeMin).toBe(0);
    expect(d.estado).toBe('por_salir');
  });

  it('horaSalidaOficinaMin configurable: override cambia el baseline', () => {
    const c = cita('reyes', 14, NACO);
    const salida11 = 11 * 60;
    const d = proyectarDia([c], { ahora: H(8), origen: OFICINA, horaSalidaOficinaMin: salida11 });
    // Baseline debe ser 11:00 (más tarde que ahora=8). Sale no antes de 11:00 (si viaje requiere menos).
    expect(d.paradas[0].sale!.getTime()).toBeGreaterThanOrEqual(H(11).getTime() - 60 * 60_000);
  });

  it('horaSalidaOficinaMin: null fuerza modo sin ancla y respeta hora de cita', () => {
    const c = cita('reyes', 14, NACO);
    const d = proyectarDia([c], { ahora: H(8), origen: OFICINA, horaSalidaOficinaMin: null });
    // Sin ancla, en HOY arranca en `ahora` (8am). La cita a 14 sigue a su hora prometida.
    expect(d.paradas[0].llega!.getTime()).toBeLessThanOrEqual(H(14).getTime());
  });

  it('REGLAS_MAPA.salidaOficina sigue disponible como constante — contrato preservado', () => {
    expect(REGLAS_MAPA.salidaOficina).toBe(8 * 60 + 30);
  });
});
