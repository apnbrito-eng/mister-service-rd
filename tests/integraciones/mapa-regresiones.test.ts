// Regresiones de los hallazgos del QA 2026-10-01 §Mapa de operaciones + revisión Codex 2026-10-02.
// NO fijamos process.env.TZ: estas pruebas deben pasar con TZ=UTC, TZ=America/Santo_Domingo o
// TZ=Asia/Tokyo. Si pasan solo en una zona, estamos encubriendo el bug que la auditoría pidió corregir.

import { describe, expect, it } from 'vitest';
import {
  enSitioSegunGPS, proyectarDia, senalGPS, type CitaMapa,
} from '../../src/utils/mapaOperaciones';
import { agruparEnPantalla } from '../../src/utils/clusterPantalla';
import { construirMapa, sugerirHuecos, type TecnicoAgenda, type CitaFutura, type Pendiente } from '../../src/utils/capacidadAgenda';
import { citaDesdeOrden, posicionDesdeGPS, tecnicoDesdePersonal, tipoDeOrden } from '../../src/utils/mapaAdaptadores';
import { calcularProgreso } from '../../src/utils/progresoOrden';
import { fechaEnRD } from '../../src/utils/mapaFechas';
import type { OrdenServicio, Personal, UbicacionVehiculo, Rol } from '../../src/types';

// Fechas en RD construidas con offset explícito, independientes del dispositivo.
const H = (h: number, m = 0) => fechaEnRD(2026, 9, 1, h, m);
const NACO = { lat: 18.4745, lng: -69.9290 };

/* ---------- §1 capacidadAgenda: solapamiento por duración ---------- */

describe('§1 capacidad — una cita 09:45 de 90 min ocupa 10:00 y 11:00', () => {
  it('horasLibres y horasChocadas reflejan el intervalo real, no solo la hora de inicio', () => {
    const horas = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM'];
    const t: TecnicoAgenda = { id: 't', nombre: 'T', equipo: 'A', repara: ['nevera'], horasPorDia: { Jueves: horas }, almuerzo: '12:00 PM' };
    const dia = fechaEnRD(2026, 9, 1); // jueves RD
    const citas: CitaFutura[] = [
      { id: 'a', tecnicoId: 't', inicio: fechaEnRD(2026, 9, 1, 9, 45), duracionMin: 90, clienteNombre: 'X' },
    ];
    const [celda] = construirMapa([t], citas, [dia]);
    expect(celda.horasLibres).not.toContain('9:00 AM');
    expect(celda.horasLibres).not.toContain('10:00 AM');
    expect(celda.horasLibres).not.toContain('11:00 AM');
  });

  it('horasChocadas detecta solapamiento, no solo coincidencia exacta de inicio', () => {
    const horas = ['9:00 AM', '10:00 AM', '11:00 AM'];
    const t: TecnicoAgenda = { id: 't', nombre: 'T', equipo: 'A', repara: ['nevera'], horasPorDia: { Jueves: horas } };
    const dia = fechaEnRD(2026, 9, 1);
    const citas: CitaFutura[] = [
      { id: 'a', tecnicoId: 't', inicio: fechaEnRD(2026, 9, 1, 9, 30), duracionMin: 90, clienteNombre: 'A' },
      { id: 'b', tecnicoId: 't', inicio: fechaEnRD(2026, 9, 1, 10, 0), duracionMin: 60, clienteNombre: 'B' },
    ];
    const [celda] = construirMapa([t], citas, [dia]);
    expect(celda.horasChocadas).toContain('10:00 AM');
  });

  it('sugerirHuecos pondera traslado, no solo km lineales', () => {
    const horas = ['9:00 AM', '10:00 AM', '11:00 AM'];
    const tCerca: TecnicoAgenda = { id: 'cerca', nombre: 'Cerca', equipo: 'A', repara: ['nevera'], horasPorDia: { Jueves: horas } };
    const tLejos: TecnicoAgenda = { id: 'lejos', nombre: 'Lejos', equipo: 'A', repara: ['nevera'], horasPorDia: { Jueves: horas } };
    const dia = fechaEnRD(2026, 9, 1);
    const citas: CitaFutura[] = [
      { id: 'c1', tecnicoId: 'cerca', inicio: fechaEnRD(2026, 9, 1, 9, 0), clienteNombre: 'A', lat: 18.475, lng: -69.930 },
      { id: 'c2', tecnicoId: 'lejos', inicio: fechaEnRD(2026, 9, 1, 9, 0), clienteNombre: 'B', lat: 18.566, lng: -70.093 },
    ];
    const celdas = construirMapa([tCerca, tLejos], citas, [dia]);
    const p: Pendiente = { id: 'p', origen: 'solicitud', clienteNombre: 'C', equipo: 'nevera', tipo: 'reparacion', lat: 18.478, lng: -69.933 };
    const [s] = sugerirHuecos([p], [tCerca, tLejos], celdas);
    expect(s.tecnicoId).toBe('cerca');
  });

  it('bloqueoMaximoDia es false por default — sugerirHuecos no impone tope sin pedirlo', () => {
    const horas = Array.from({ length: 9 }, (_, i) => `${(i + 9) % 12 || 12}:00 ${i + 9 >= 12 ? 'PM' : 'AM'}`);
    const t: TecnicoAgenda = { id: 't', nombre: 'T', equipo: 'A', repara: ['nevera'], horasPorDia: { Jueves: horas } };
    const dia = fechaEnRD(2026, 9, 1);
    // 7 citas ya ocupan 7 horas distintas. Hay horasLibres remanentes.
    const citas: CitaFutura[] = Array.from({ length: 7 }, (_, i) => ({
      id: `o${i}`, tecnicoId: 't', inicio: fechaEnRD(2026, 9, 1, 9 + i, 0), clienteNombre: `C${i}`,
    }));
    const celdas = construirMapa([t], citas, [dia]);
    const p: Pendiente = { id: 'p', origen: 'solicitud', clienteNombre: 'Nuevo', equipo: 'nevera', tipo: 'reparacion' };
    const sugDefault = sugerirHuecos([p], [t], celdas);
    expect(sugDefault).toHaveLength(1); // sin bloqueo
    const sugEstricto = sugerirHuecos([p], [t], celdas, { bloqueoMaximoDia: true });
    expect(sugEstricto).toHaveLength(0); // con override se bloquea
  });
});

/* ---------- §3 clusterPantalla: 10k puntos a zoom 22 agrupa a <=300 sin perder puntos ---------- */

describe('§3 cluster — nunca pierde puntos y respeta el máximo', () => {
  it('10,000 puntos a zoom 22 no explotan en 10,000 grupos', () => {
    const SD = { norte: 18.56, sur: 18.40, este: -69.80, oeste: -70.05 };
    const puntos = Array.from({ length: 10_000 }, (_, i) => ({
      id: `c${i}`,
      lat: 18.42 + ((i * 7919) % 1000) / 1000 * 0.12,
      lng: -70.02 + ((i * 104729) % 1000) / 1000 * 0.2,
    }));
    const g = agruparEnPantalla(puntos, SD, 22);
    expect(g.length).toBeLessThanOrEqual(300);
    expect(g.reduce((a, x) => a + x.items.length, 0)).toBe(10_000);
  });
});

/* ---------- §4 senalGPS: NaN y futuros ---------- */

describe('§4 señalGPS — timestamp inválido o futuro no es «ok»', () => {
  it('NaN timestamp → sin_gps', () => {
    const p = { tecnicoId: 'a', lat: NACO.lat, lng: NACO.lng, timestamp: new Date(NaN), enMovimiento: false };
    expect(senalGPS(p, H(10)).senal).toBe('sin_gps');
  });

  it('timestamp futuro más allá del margen → sin_gps', () => {
    const p = { tecnicoId: 'a', lat: NACO.lat, lng: NACO.lng, timestamp: H(11), enMovimiento: false };
    expect(senalGPS(p, H(10)).senal).toBe('sin_gps');
  });

  it('timestamp casi al momento (dentro del margen de reloj) sigue siendo ok', () => {
    const p = { tecnicoId: 'a', lat: NACO.lat, lng: NACO.lng, timestamp: new Date(H(10).getTime() + 60_000), enMovimiento: false };
    expect(senalGPS(p, H(10)).senal).toBe('ok');
  });
});

/* ---------- §5 enSitioSegunGPS: identidad, mismo día, no futuras ---------- */

const base = (overrides: Partial<CitaMapa> = {}): CitaMapa => ({
  id: 'c', tecnicoId: 'reyes', clienteNombre: 'C', inicio: H(9), duracionMin: 60,
  lat: NACO.lat, lng: NACO.lng, equipo: 'lavadora', tipo: 'reparacion', fase: 'agendado',
  progreso: { indice: 0, completa: false, cancelada: false }, ...overrides,
});

describe('§5 enSitioSegunGPS — no infiere presencia si falla identidad/día/hora', () => {
  it('rechaza GPS de otro técnico', () => {
    const c = base();
    const gps = { tecnicoId: 'otro', lat: NACO.lat, lng: NACO.lng, timestamp: H(9, 2), enMovimiento: false };
    expect(enSitioSegunGPS(c, gps, H(9, 3))).toBe(false);
  });

  it('rechaza GPS de otro día RD aunque el dispositivo esté en otra zona', () => {
    const c = base({ inicio: fechaEnRD(2026, 9, 2, 9) });
    const gps = { tecnicoId: 'reyes', lat: NACO.lat, lng: NACO.lng, timestamp: H(9, 2), enMovimiento: false };
    expect(enSitioSegunGPS(c, gps, H(9, 3))).toBe(false);
  });

  it('rechaza inferencia para una cita futura (todavía no empezó)', () => {
    const c = base({ inicio: H(12) });
    const gps = { tecnicoId: 'reyes', lat: NACO.lat, lng: NACO.lng, timestamp: H(9), enMovimiento: false };
    expect(enSitioSegunGPS(c, gps, H(9, 5))).toBe(false);
  });

  it('rechaza inferencia si la cita no tiene técnico asignado', () => {
    const c = base({ tecnicoId: null });
    const gps = { tecnicoId: 'reyes', lat: NACO.lat, lng: NACO.lng, timestamp: H(9, 2), enMovimiento: false };
    expect(enSitioSegunGPS(c, gps, H(9, 3))).toBe(false);
  });
});

/* ---------- §10/§11 proyectarDia: pasado/futuro/hoy; standby no cuenta atraso ---------- */

describe('§11 proyectarDia — plan futuro / historial / en vivo', () => {
  it('día futuro: no infiere en-sitio por GPS, standby no cuenta atraso', () => {
    const futura = base({ inicio: fechaEnRD(2026, 9, 5, 9), progreso: { indice: 0, completa: false, cancelada: false } });
    const gps = { tecnicoId: 'reyes', lat: NACO.lat, lng: NACO.lng, timestamp: H(10), enMovimiento: false };
    const d = proyectarDia([futura], { ahora: H(10), origen: NACO, gps });
    expect(d.dia).toBe('futuro');
    expect(d.paradas[0].estado).toBe('pendiente');
    expect(d.paradas[0].segunGPS).toBe(false);
    expect(d.atrasoMin).toBe(0);
  });

  it('día pasado: no proyecta ETA desde ahora', () => {
    const pasada = base({ inicio: fechaEnRD(2026, 8, 29, 9) });
    const d = proyectarDia([pasada], { ahora: H(10), origen: NACO });
    expect(d.dia).toBe('pasado');
    expect(d.paradas[0].km).toBeNull();
    expect(d.paradas[0].minViaje).toBeNull();
    expect(d.paradas[0].tardeMin).toBe(0);
  });

  it('hoy con standby abierto: no cuenta atraso aunque haya pasado la hora', () => {
    const c = base({
      inicio: H(8),
      duracionMin: 60,
      progreso: { indice: 1, completa: false, cancelada: false, standby: true, desde: H(8) },
    });
    const d = proyectarDia([c], { ahora: H(11), origen: NACO });
    expect(d.dia).toBe('hoy');
    expect(d.atrasoMin).toBe(0);
    expect(d.atrasado).toBe(false);
  });

  it('sin ubicación: no inventa llegada precisa', () => {
    const c = base({ lat: undefined, lng: undefined });
    const d = proyectarDia([c], { ahora: H(7), origen: NACO });
    expect(d.paradas[0].sinUbicacion).toBe(true);
    expect(d.paradas[0].llega).toBeNull();
    expect(d.paradas[0].minViaje).toBeNull();
  });

  it('inicio inválido devuelve dia="invalido" en vez de proyectar', () => {
    const c = base({ inicio: new Date(NaN) });
    const d = proyectarDia([c], { ahora: H(10), origen: NACO });
    expect(d.dia).toBe('invalido');
    expect(d.paradas).toHaveLength(0);
    expect(d.estado).toBe('sin_citas');
  });
});

/* ---------- §12 adaptadores: garantía real, standby real, Timestamp real ---------- */

describe('§12 adaptadores — leen campos reales de la orden', () => {
  it('tipoDeOrden usa esGarantia, no texto libre', () => {
    expect(tipoDeOrden({ fase: 'agendado', descripcionFalla: 'mantenimiento del equipo', equipoTipo: 'Lavadora' })).toBe('reparacion');
    expect(tipoDeOrden({ fase: 'agendado', descripcionFalla: 'rota', equipoTipo: 'Lavadora', esGarantia: true })).toBe('garantia');
    expect(tipoDeOrden({ fase: 'garantia_reclamada', descripcionFalla: '', equipoTipo: 'Lavadora' })).toBe('garantia');
  });

  it('standby: callsite false NO borra enStandby real de la orden', () => {
    const nowTs = { seconds: Math.floor(H(9).getTime() / 1000), nanoseconds: 0 } as unknown as Date;
    const orden = {
      id: 'o1', numero: 'OS-1', clienteNombre: 'C', clienteLat: NACO.lat, clienteLng: NACO.lng,
      fase: 'agendado' as const, historialFases: [{ fase: 'agendado' as const, timestamp: nowTs, usuario: 'u' }],
      fechaCita: nowTs, duracionMin: 60, enStandby: true, equipoTipo: 'Lavadora',
    } as unknown as OrdenServicio;
    // callsite envía `standbyAbierto: false` (Map vacío de standby_piezas).
    const cita = citaDesdeOrden(orden, H(10), { standbyAbierto: false })!;
    expect(cita.progreso.standby).toBe(true);
    // callsite envía true (abierto en standby_piezas).
    const sinEnStandby = { ...orden, enStandby: false } as OrdenServicio;
    expect(citaDesdeOrden(sinEnStandby, H(10), { standbyAbierto: true })!.progreso.standby).toBe(true);
    // sin extra ni enStandby, no es standby.
    expect(citaDesdeOrden(sinEnStandby, H(10))!.progreso.standby).toBe(false);
  });

  it('citaDesdeOrden lee enStandby y convierte Timestamp sin romperse', () => {
    const nowTs = { seconds: Math.floor(H(9).getTime() / 1000), nanoseconds: 0 } as unknown as Date;
    const orden = {
      id: 'o1', numero: 'OS-1', clienteNombre: 'C', clienteLat: NACO.lat, clienteLng: NACO.lng,
      fase: 'agendado' as const, historialFases: [{ fase: 'agendado' as const, timestamp: nowTs, usuario: 'u' }],
      fechaCita: nowTs, duracionMin: 60, enStandby: true, equipoTipo: 'Lavadora',
    } as unknown as OrdenServicio;
    const cita = citaDesdeOrden(orden, H(10))!;
    expect(cita.progreso.standby).toBe(true);
    expect(cita.inicio.getTime()).toBe(H(9).getTime());
  });

  it('posicionDesdeGPS maneja timestamp Date normal y Timestamp Firestore', () => {
    const ts = H(10);
    const u: UbicacionVehiculo = { vehiculoId: 'v', tecnicoId: 't', lat: 18.47, lng: -69.93, velocidad: 0, rumbo: 0, timestamp: ts, enMovimiento: false };
    const p = posicionDesdeGPS(u);
    expect(p.timestamp.getTime()).toBe(ts.getTime());

    const u2 = { ...u, timestamp: { seconds: Math.floor(ts.getTime() / 1000), nanoseconds: 0 } as unknown as Date };
    const p2 = posicionDesdeGPS(u2);
    expect(p2.timestamp.getTime()).toBe(ts.getTime());
  });

  it('tecnicoDesdePersonal: match único y estricto — rechaza ambiguos y no inventa equipo', () => {
    // Nombre que coincide con DOS referencias por tokens: ambiguo → emparejado=false.
    const ambiguo: Personal = { id: 'p1', uid: 'u1', nombre: 'Yoniel Miguel', rol: 'tecnico' as Rol, disponibilidad: true, activo: true };
    expect(tecnicoDesdePersonal(ambiguo).emparejado).toBe(false);

    // Nombre tokens no coinciden: no inventa (Albert ≠ Alberto).
    const diferente: Personal = { id: 'p2', uid: 'u2', nombre: 'Alberto Luna', rol: 'tecnico' as Rol, disponibilidad: true, activo: true };
    const t2 = tecnicoDesdePersonal(diferente);
    expect(t2.emparejado).toBe(false);
    expect(t2.equipo).toBeNull();

    // Match exacto por nombre completo: ok.
    const exacto: Personal = { id: 'p3', uid: 'u3', nombre: 'Reyes Guzmán', rol: 'tecnico' as Rol, disponibilidad: true, activo: true, operariaNombre: 'Wila' };
    const t3 = tecnicoDesdePersonal(exacto);
    expect(t3.emparejado).toBe(true);
    expect(t3.equipo).toBe('A');
    expect(t3.id).toBe('u3');

    // Apodo multi-word: solo matchea si aparece como frase completa.
    const conFrase: Personal = { id: 'p4', uid: 'u4', nombre: 'Wilfredo Gata salvaje', rol: 'tecnico' as Rol, disponibilidad: true, activo: true };
    // 'Wilfredo' ya matchea por tokens; devuelve wilfredo.
    expect(tecnicoDesdePersonal(conFrase).emparejado).toBe(true);

    // Wila es el alias confirmado de Wilainy, no un prefijo arbitrario.
    const operariaConfusa: Personal = { id: 'p5', uid: 'u5', nombre: 'Desconocido XYZ', rol: 'tecnico' as Rol, disponibilidad: true, activo: true, operariaNombre: 'Wilainy' };
    expect(tecnicoDesdePersonal(operariaConfusa).equipo).toBe('A');
    expect(tecnicoDesdePersonal({ ...operariaConfusa, operariaNombre: 'Wilana' }).equipo).toBeNull();
  });
});

/* ---------- §10 progresoOrden: no infiere en-sitio a partir de fase ---------- */

describe('§10 progreso — sin enSitioEn no se infiere presencia aunque la fase ya avanzó', () => {
  it('fase aprobado con cita en el pasado y sin visita → sigue en agendada', () => {
    const p = calcularProgreso({
      fase: 'aprobado',
      historialFases: [{ fase: 'agendado', timestamp: H(8) }, { fase: 'aprobado', timestamp: H(9) }],
      fechaCita: H(9),
      duracionMin: 60,
    }, H(12));
    expect(p.indice).toBe(0);
    expect(p.paso).toBe('agendada');
  });

  it('fase en_diagnostico sin visita → sigue en agendada', () => {
    const p = calcularProgreso({
      fase: 'en_diagnostico',
      historialFases: [{ fase: 'agendado', timestamp: H(8) }, { fase: 'en_diagnostico', timestamp: H(9) }],
      fechaCita: H(9),
    }, H(12));
    expect(p.indice).toBe(0);
  });

  it('con visita.enSitioEn → entra en sitio o avanza', () => {
    const p = calcularProgreso({
      fase: 'en_diagnostico',
      historialFases: [{ fase: 'agendado', timestamp: H(8) }, { fase: 'en_diagnostico', timestamp: H(9, 30) }],
      visita: { enSitioEn: H(9, 15) },
      fechaCita: H(9),
    }, H(10));
    expect(p.indice).toBe(3);
  });

  it('standby abierto no genera atraso aunque la hora ya pasó', () => {
    const p = calcularProgreso({
      fase: 'agendado',
      historialFases: [{ fase: 'agendado', timestamp: H(8) }],
      visita: { enCaminoEn: H(9) },
      fechaCita: H(9),
      duracionMin: 60,
      standbyAbierto: true,
    }, H(12));
    expect(p.atrasoMin).toBe(0);
  });
});
