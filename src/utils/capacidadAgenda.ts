import { kmEntre, minutosManejoEstimado, tieneCoord } from './geo';
export { kmEntre } from './geo';
/**
 * capacidadAgenda.ts — lógica pura del módulo «Agenda por llenar».
 * Destino sugerido: src/utils/capacidadAgenda.ts  (sin React, sin Firestore; probado con vitest)
 *
 * Fuentes reales a conectar (las busca Codex en el repo):
 *  - Horas disponibles de cada técnico: colección `calendarios` (type Calendario: asignadoId, dias, horas, activo).
 *  - Citas futuras: órdenes con `fechaCita` + `tecnicoId` (+ `duracionMin`), fases agendado en adelante, no canceladas.
 *  - Pendientes para rellenar: `citas_por_confirmar`, `standby_piezas` con estado 'llego',
 *    `mantenimientos` con `proximaFecha` cercana, órdenes `garantia_reclamada` sin cita,
 *    cotizaciones 'aceptada' sin cita.
 */
import type { Especialidad } from './equiposOperacion';
import { diaPasadoRD, inicioDiaRD, mismoDiaRD, componentesRD, fechaEnRD } from './mapaFechas';

export type DiaSemana = 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes' | 'Sábado' | 'Domingo';
const DIAS: DiaSemana[] = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Valores por defecto heredados del paquete original. Son **ORIENTATIVOS y CONFIGURABLES** —
 * la UI puede pasar `overrides` a `construirMapa`/`sugerirHuecos`/`calcularAvisos`. NO son
 * decisiones de Jorge: son los defaults que vienen del paquete y pueden cambiarse.
 *
 * `bloqueoMaximoDia` arranca en `false` por default: `sugerirHuecos` NO rechaza una
 * sugerencia solo porque el técnico ya tenga `maximoDia` citas. Avisa (sobrecargado), pero
 * la decisión final la toma la oficina / configuración. Para activar el tope duro: pasar
 * `{ bloqueoMaximoDia: true }` como override.
 */
export const REGLAS = {
  /** Meta diaria orientativa. Ajustable por configuración. */
  metaDia: 5,
  /** Meta sábado orientativa. Ajustable por configuración. */
  metaSabado: 3,
  /** Tope diario orientativo (nunca se impone sin `bloqueoMaximoDia: true`). */
  maximoDia: 7,
  /** OFF por defecto. Pasar true explícitamente para endurecer el tope. */
  bloqueoMaximoDia: false,
  /** Horizonte del mapa en días hábiles. Ajustable. */
  diasHabiles: 8,
  /** A partir de qué hora disparar el aviso «mañana sin citas». */
  avisoMananaHora: 14,
  /** Hasta cuántas citas mañana se considera «sin citas». */
  avisoMananaMaxCitas: 1,
  /** Ventana de la «semana floja» (días). */
  semanaFlojaDias: 3,
  /** Umbral para la semana floja. */
  semanaFlojaUmbral: 0.6,
  /** Cada km de distancia a las citas vecinas suma al puntaje. */
  pesoKm: 1.5,
  /** Cada minuto de traslado estimado a la cita vecina suma al puntaje. */
  pesoTraslado: 1,
  /** Dos citas del mismo técnico/día a más de esta distancia → aviso ruta cruzada. */
  rutaCruzadaKm: 25,
  /** Minutos de traslado + holgura entre citas; se usa al medir solapamiento con duración. */
  margenTrasladoMin: 15,
  /** Duración por defecto si la cita no la trae (coherente con mapaOperaciones.REGLAS_MAPA). */
  duracionDefectoMin: 60,
};

export type OverridesReglas = Partial<typeof REGLAS>;
const conOverrides = (o?: OverridesReglas) => ({ ...REGLAS, ...(o ?? {}) });

export interface TecnicoAgenda {
  // @safe-tecnicoid-id: `TecnicoAgenda.id` representa el mismo valor que `TecnicoMapa.id`:
  // el `auth.uid` que las rules validan en `ordenes_servicio.tecnicoId`. No el doc id de
  // `personal`. Los callers deben poblarlo desde `personal.uid` (ver `mapaAdaptadores`).
  id: string;
  nombre: string;
  equipo?: 'A' | 'B';
  repara: Especialidad[];
  soloMantenimiento?: Especialidad[];
  contratista?: boolean;
  /** Horas que ofrece por día, tomadas de su `Calendario` (p. ej. ['9:00 AM','10:00 AM']) */
  horasPorDia: Partial<Record<DiaSemana, string[]>>;
  /** Hora de almuerzo bloqueada, si existe (p. ej. '12:00 PM') */
  almuerzo?: string;
  /** Centro de sus zonas habituales; se usa como referencia de distancia en días sin citas */
  base?: { lat: number; lng: number };
}

export interface CitaFutura {
  id: string;
  tecnicoId: string;
  inicio: Date;
  duracionMin?: number;
  equipo?: Especialidad | null;
  clienteNombre: string;
  zona?: string;
  /** Coordenadas del cliente (orden.lat/lng o cliente.lat/lng). Opcional: sin ellas no se usa distancia */
  lat?: number;
  lng?: number;
  esMantenimiento?: boolean;
}

export type Nivel = 'no_trabaja' | 'vacio' | 'bajo' | 'casi' | 'meta' | 'lleno' | 'sobrecargado';

export interface CeldaDia {
  tecnicoId: string;
  fecha: Date;          // medianoche local
  trabaja: boolean;
  meta: number;
  citas: CitaFutura[];
  horasLibres: string[];
  horasChocadas: string[]; // dos o más citas a la misma hora
  nivel: Nivel;
}

/** '9:00 AM' → 540 */
export function horaAMinutos(h: string): number {
  const m = h.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) throw new Error(`Hora inválida: ${h}`);
  let hh = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') hh += 12;
  return hh * 60 + Number(m[2]);
}
export function minutosAHora(min: number): string {
  const h = Math.floor(min / 60), m = min % 60, pm = h >= 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${pm ? 'PM' : 'AM'}`;
}

/**
 * Inicio de día en zona Santo Domingo (UTC-4). Independiente de la zona del dispositivo.
 * Alias retrocompatible con `inicioDia` del archivo anterior.
 */
const inicioDia = (d: Date) => inicioDiaRD(d);
const mismoDia = (a: Date, b: Date) => mismoDiaRD(a, b);

/** Próximos N días hábiles a partir de mañana, saltando domingo (y cualquier día sin horas en ningún calendario). */
export function proximosDias(desde: Date, n: number = REGLAS.diasHabiles): Date[] {
  const out: Date[] = [];
  const c = componentesRD(desde);
  let dia = c.dia;
  while (out.length < n) {
    dia += 1;
    const f = fechaEnRD(c.anio, c.mes, dia);
    if (componentesRD(f).diaSemana !== 0) out.push(f);
  }
  return out;
}

export function nivelDe(n: number, meta: number, trabaja: boolean): Nivel {
  if (!trabaja) return 'no_trabaja';
  if (n === 0) return 'vacio';
  if (meta > 0 && n > meta) return 'sobrecargado';
  if (n <= 2) return 'bajo';
  if (n < meta) return 'casi';
  if (n === meta) return 'meta';
  return 'lleno';
}

export function construirMapa(
  tecnicos: TecnicoAgenda[],
  citas: CitaFutura[],
  dias: Date[],
  overrides: OverridesReglas = {},
): CeldaDia[] {
  const R = conOverrides(overrides);
  const celdas: CeldaDia[] = [];
  for (const t of tecnicos) {
    for (const f of dias) {
      const nombreDia = DIAS[componentesRD(f).diaSemana];
      const horas = (t.horasPorDia[nombreDia] ?? []).filter(h => h !== t.almuerzo);
      const trabaja = horas.length > 0;
      // Sin una meta explícita, la referencia son los horarios configurados del técnico.
      const meta = trabaja ? (nombreDia === 'Sábado' ? overrides.metaSabado : overrides.metaDia) ?? horas.length : 0;
      // @safe-tecnicoid-id: TecnicoAgenda.id y CitaFutura.tecnicoId ya están normalizados a UID por el adaptador; cálculo puro sin escrituras.
      const delDia = citas.filter(c => c.tecnicoId === t.id && mismoDia(c.inicio, f)).sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

      // Intervalos reales [inicioMin, finMin) de cada cita en minutos desde medianoche RD del día `f`.
      const inicioF = inicioDia(f).getTime();
      const intervalos = delDia.map(c => {
        const ini = Math.round((c.inicio.getTime() - inicioF) / 60_000);
        const fin = ini + (c.duracionMin ?? R.duracionDefectoMin);
        return { ini, fin };
      });

      const slotOcupado = (h: string) => {
        const s = horaAMinutos(h);
        const e = s + 60;
        return intervalos.some(iv => iv.ini < e && iv.fin > s);
      };

      const slotChocado = (h: string) => {
        const s = horaAMinutos(h);
        const e = s + 60;
        return intervalos.filter(iv => iv.ini < e && iv.fin > s).length >= 2;
      };

      celdas.push({
        tecnicoId: t.id, fecha: f, trabaja, meta, citas: delDia,
        horasLibres: trabaja ? horas.filter(h => !slotOcupado(h)) : [],
        horasChocadas: trabaja ? horas.filter(slotChocado) : [],
        nivel: nivelDe(delDia.length, meta, trabaja),
      });
    }
  }
  return celdas;
}

export function ocupacion(celdas: CeldaDia[]): { citas: number; meta: number; pct: number } {
  const t = celdas.filter(c => c.trabaja);
  const citas = t.reduce((a, c) => a + c.citas.length, 0);
  const meta = t.reduce((a, c) => a + c.meta, 0);
  return { citas, meta, pct: meta ? Math.round((citas / meta) * 100) : 0 };
}

/* ---------- Lista para rellenar huecos ---------- */

export type OrigenPendiente = 'solicitud' | 'pieza_llego' | 'mantenimiento' | 'garantia' | 'cotizacion_aceptada';

export interface Pendiente {
  id: string;
  origen: OrigenPendiente;
  clienteNombre: string;
  equipo: Especialidad;
  tipo: 'reparacion' | 'mantenimiento';
  zona?: string;
  /** No sugerir antes de esta fecha (p. ej. mantenimiento que toca el 5 oct) */
  noAntesDe?: Date;
  /** Técnico preferido (garantía → el técnico original) */
  tecnicoPreferidoId?: string;
  lat?: number;
  lng?: number;
}

export interface Sugerencia { pendienteId: string; tecnicoId: string; fecha: Date; hora: string }

export function puedeAtender(t: TecnicoAgenda, e: Especialidad, tipo: 'reparacion' | 'mantenimiento'): boolean {
  return t.repara.includes(e) || (tipo === 'mantenimiento' && !!t.soloMantenimiento?.includes(e));
}

const PRIORIDAD_ORIGEN: OrigenPendiente[] = ['garantia', 'pieza_llego', 'cotizacion_aceptada', 'solicitud', 'mantenimiento'];

/**
 * Asigna a cada pendiente el mejor hueco SIN repetir horas.
 * Puntaje (menor = mejor): llenar primero días vacíos, luego días cercanos, luego especialista antes que generalista.
 * Garantía: si hay técnico preferido con hueco, va primero con él.
 * Solo SUGIERE: la operaria confirma; nunca agenda solo.
 */
export function sugerirHuecos(
  pendientes: Pendiente[],
  tecnicos: TecnicoAgenda[],
  celdas: CeldaDia[],
  overrides: OverridesReglas = {},
): Sugerencia[] {
  const R = conOverrides(overrides);
  const reservadas = new Set<string>();
  const extra = new Map<string, number>(); // citas sugeridas que suben el conteo de una celda
  const clave = (c: CeldaDia) => `${c.tecnicoId}|${c.fecha.getTime()}`;
  const indiceDia = new Map<number, number>();
  [...new Set(celdas.map(c => c.fecha.getTime()))].sort((a, b) => a - b).forEach((t, i) => indiceDia.set(t, i));
  const porId = new Map(tecnicos.map(t => [t.id, t]));
  const orden = [...pendientes].sort((a, b) => PRIORIDAD_ORIGEN.indexOf(a.origen) - PRIORIDAD_ORIGEN.indexOf(b.origen));
  const out: Sugerencia[] = [];

  for (const p of orden) {
    let mejor: { c: CeldaDia; hora: string; puntaje: number } | null = null;
    for (const c of celdas) {
      if (!c.trabaja) continue;
      if (p.noAntesDe && c.fecha.getTime() < inicioDia(p.noAntesDe).getTime()) continue;
      const t = porId.get(c.tecnicoId);
      if (!t || !puedeAtender(t, p.equipo, p.tipo)) continue;
      const hora = c.horasLibres.find(h => !reservadas.has(`${clave(c)}|${h}`));
      if (!hora) continue;
      const n = c.citas.length + (extra.get(clave(c)) ?? 0);
      if (R.bloqueoMaximoDia && n >= R.maximoDia) continue;
      const generalidad = t.repara.length + (t.soloMantenimiento?.length ?? 0) - 1;
      let puntaje = n * 10 + (indiceDia.get(c.fecha.getTime()) ?? 0) * 4 + generalidad * 3;
      const dist = distanciaAlDia(p, c, t);
      if (dist !== null) {
        puntaje += dist * R.pesoKm;
        puntaje += minutosManejoEstimado(dist) * R.pesoTraslado;
      }
      if (p.tecnicoPreferidoId && p.tecnicoPreferidoId === t.id) puntaje -= 100;
      if (!mejor || puntaje < mejor.puntaje) mejor = { c, hora, puntaje };
    }
    if (mejor) {
      reservadas.add(`${clave(mejor.c)}|${mejor.hora}`);
      extra.set(clave(mejor.c), (extra.get(clave(mejor.c)) ?? 0) + 1);
      out.push({ pendienteId: p.id, tecnicoId: mejor.c.tecnicoId, fecha: mejor.c.fecha, hora: mejor.hora });
    }
  }
  return out;
}

/* ---------- Distancia ---------- */

/** Distancia aproximada por calle (línea recta × 1.3) en km. */


/** km desde el pendiente a la cita más cercana del técnico ese día (o a su base si el día está vacío). null si faltan coordenadas. */
export function distanciaAlDia(p: Pendiente, c: CeldaDia, t: TecnicoAgenda): number | null {
  if (!tieneCoord(p)) return null;
  const refs = c.citas.filter(tieneCoord);
  if (refs.length) return Math.min(...refs.map(r => kmEntre(p, r)));
  return t.base ? kmEntre(p, t.base) : null;
}

/** km recorridos en el día siguiendo el orden de las citas (sin contar salida/regreso). */
export function kmRuta(citasDelDia: CitaFutura[]): number {
  const cs = citasDelDia.filter(tieneCoord).sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  let km = 0;
  for (let i = 1; i < cs.length; i++) km += kmEntre(cs[i - 1], cs[i]);
  return Math.round(km);
}

/* ---------- Zonas ---------- */

export interface ResumenZona {
  zona: string;
  citas: number;
  tecnicos: number;              // técnicos distintos que la visitan en el período
  principal?: { tecnicoId: string; citas: number };
  porEquipo: { A: number; B: number };
  enEspera: number;              // pendientes de esa zona
  centro?: { lat: number; lng: number };
}

/** Agrupa por `zona` (sector del cliente; usar zonaDeOrden/inferirZona del repo). Orden: más citas primero. */
export function resumenPorZona(citas: CitaFutura[], tecnicos: TecnicoAgenda[], pendientes: Pendiente[] = []): ResumenZona[] {
  const porId = new Map(tecnicos.map(t => [t.id, t]));
  const g = new Map<string, CitaFutura[]>();
  for (const c of citas) { const z = c.zona || 'Sin zona'; g.set(z, [...(g.get(z) ?? []), c]); }
  return [...g].map(([zona, cs]) => {
    const cuenta = new Map<string, number>();
    cs.forEach(c => cuenta.set(c.tecnicoId, (cuenta.get(c.tecnicoId) ?? 0) + 1));
    const top = [...cuenta].sort((a, b) => b[1] - a[1])[0];
    const conC = cs.filter(tieneCoord);
    return {
      zona, citas: cs.length, tecnicos: cuenta.size,
      principal: top ? { tecnicoId: top[0], citas: top[1] } : undefined,
      porEquipo: {
        A: cs.filter(c => porId.get(c.tecnicoId)?.equipo === 'A').length,
        B: cs.filter(c => porId.get(c.tecnicoId)?.equipo === 'B').length,
      },
      enEspera: pendientes.filter(p => p.zona === zona).length,
      centro: conC.length ? { lat: conC.reduce((a, c) => a + c.lat, 0) / conC.length, lng: conC.reduce((a, c) => a + c.lng, 0) / conC.length } : undefined,
    };
  }).sort((a, b) => b.citas - a.citas);
}

/* ---------- Mes ---------- */

export interface DiaMes { fecha: Date; pasado: boolean; esHoy: boolean; citas: number; meta: number; pct: number; tecnicosVacios: number }

/**
 * Resumen por día del mes para el calendario mensual (solo días que trabaja alguien; domingos fuera).
 * HOY no cuenta como pasado — fix del hallazgo QA 2026-10-01 §2 (resumenMes trataba hoy como pasado).
 * Días se construyen en zona Santo Domingo para que la grilla coincida con la jornada operativa.
 */
export function resumenMes(celdas: CeldaDia[], anio: number, mes: number, hoy: Date): DiaMes[] {
  const out: DiaMes[] = [];
  // Último día del mes en zona RD: primer día del mes siguiente - 1 día.
  const diasEnMes = Math.round((fechaEnRD(anio, mes + 1, 1).getTime() - fechaEnRD(anio, mes, 1).getTime()) / 86_400_000);
  for (let d = 1; d <= diasEnMes; d++) {
    const f = fechaEnRD(anio, mes, d);
    if (componentesRD(f).diaSemana === 0) continue;
    const cs = celdas.filter(c => c.trabaja && c.fecha.getTime() === f.getTime());
    const citas = cs.reduce((a, c) => a + c.citas.length, 0);
    const meta = cs.reduce((a, c) => a + c.meta, 0);
    const pasado = diaPasadoRD(f, hoy);
    const esHoy = !pasado && f.getTime() === inicioDia(hoy).getTime();
    out.push({
      fecha: f,
      pasado,
      esHoy,
      citas,
      meta,
      pct: meta ? Math.round((citas / meta) * 100) : 0,
      tecnicosVacios: cs.filter(c => !c.citas.length).length,
    });
  }
  return out;
}

/** Horas libres por especialidad en un rango de días (para la secretaria en el chat). */
export function huecosPorEspecialidad(tecnicos: TecnicoAgenda[], celdas: CeldaDia[], dias: Date[]): Record<Especialidad, { total: number; primera?: { tecnicoId: string; fecha: Date; hora: string } }> {
  const esp: Especialidad[] = ['nevera', 'lavadora', 'secadora', 'estufa', 'aire'];
  const porId = new Map(tecnicos.map(t => [t.id, t]));
  const enRango = new Set(dias.map(d => inicioDia(d).getTime()));
  const r = {} as Record<Especialidad, { total: number; primera?: { tecnicoId: string; fecha: Date; hora: string } }>;
  for (const e of esp) {
    let total = 0; let primera: { tecnicoId: string; fecha: Date; hora: string } | undefined;
    const cs = celdas.filter(c => enRango.has(c.fecha.getTime()) && porId.get(c.tecnicoId)?.repara.includes(e))
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    for (const c of cs) {
      total += c.horasLibres.length;
      if (!primera && c.horasLibres.length) primera = { tecnicoId: c.tecnicoId, fecha: c.fecha, hora: c.horasLibres[0] };
    }
    r[e] = { total, primera };
  }
  return r;
}

/* ---------- Avisos automáticos ---------- */

export type TipoAviso = 'manana_sin_citas' | 'semana_floja' | 'sobrecargado' | 'choque_de_hora' | 'ruta_cruzada';
export interface Aviso { tipo: TipoAviso; equipo?: 'A' | 'B'; tecnicoId?: string; fecha?: Date; texto: string }

export function calcularAvisos(
  tecnicos: TecnicoAgenda[],
  celdas: CeldaDia[],
  ahora: Date = new Date(),
  overrides: OverridesReglas = {},
): Aviso[] {
  const R = conOverrides(overrides);
  const out: Aviso[] = [];
  const compAhora = componentesRD(ahora);
  const manana = fechaEnRD(compAhora.anio, compAhora.mes, compAhora.dia + 1);
  const porId = new Map(tecnicos.map(t => [t.id, t]));

  if (compAhora.hora >= R.avisoMananaHora) {
    for (const c of celdas) {
      if (c.trabaja && mismoDia(c.fecha, manana) && c.citas.length <= R.avisoMananaMaxCitas) {
        const t = porId.get(c.tecnicoId);
        out.push({ tipo: 'manana_sin_citas', equipo: t?.equipo, tecnicoId: c.tecnicoId, fecha: c.fecha,
          texto: `${t?.nombre ?? 'Técnico'} tiene ${c.citas.length} ${c.citas.length === 1 ? 'cita' : 'citas'} mañana` });
      }
    }
  }

  const fechas = [...new Set(celdas.map(c => c.fecha.getTime()))].sort((a, b) => a - b).slice(0, R.semanaFlojaDias);
  for (const eq of ['A', 'B'] as const) {
    const cs = celdas.filter(c => fechas.includes(c.fecha.getTime()) && porId.get(c.tecnicoId)?.equipo === eq);
    const o = ocupacion(cs);
    if (o.meta && o.citas / o.meta < R.semanaFlojaUmbral) {
      out.push({ tipo: 'semana_floja', equipo: eq, texto: `Equipo ${eq} al ${o.pct}% de su meta en los próximos ${R.semanaFlojaDias} días` });
    }
  }

  for (const c of celdas) {
    const cs = c.citas.filter(tieneCoord);
    let max = 0;
    for (const a of cs) for (const b of cs) max = Math.max(max, kmEntre(a, b));
    if (max > R.rutaCruzadaKm) {
      const t = porId.get(c.tecnicoId);
      out.push({ tipo: 'ruta_cruzada', equipo: t?.equipo, tecnicoId: c.tecnicoId, fecha: c.fecha, texto: `${t?.nombre} tiene citas a ${Math.round(max)} km entre sí ese día` });
    }
  }

  for (const c of celdas) {
    const t = porId.get(c.tecnicoId);
    const referencia = overrides.maximoDia ?? c.meta;
    if (referencia > 0 && c.citas.length > referencia) out.push({ tipo: 'sobrecargado', equipo: t?.equipo, tecnicoId: c.tecnicoId, fecha: c.fecha, texto: `${t?.nombre} tiene ${c.citas.length} citas para ${referencia} horarios de referencia` });
    for (const h of c.horasChocadas) out.push({ tipo: 'choque_de_hora', equipo: t?.equipo, tecnicoId: c.tecnicoId, fecha: c.fecha, texto: `${t?.nombre} tiene dos citas a las ${h}` });
  }
  return out;
}

/** Normaliza el texto libre de `equipoTipo` de órdenes/mantenimientos a una especialidad. */
export function especialidadDe(texto?: string | null): Especialidad | null {
  if (!texto) return null;
  const s = texto.toLowerCase();
  if (/(nevera|refrigerador|freezer|congelador)/.test(s)) return 'nevera';
  if (/secadora/.test(s)) return 'secadora';
  if (/lavadora/.test(s)) return 'lavadora';
  if (/(estufa|horno|cocina)/.test(s)) return 'estufa';
  if (/(aire|split|a\/c|btu)/.test(s)) return 'aire';
  return null;
}
