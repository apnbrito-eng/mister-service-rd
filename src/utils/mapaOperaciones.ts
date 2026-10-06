/**
 * mapaOperaciones.ts — lógica pura del módulo Mapa (sin React, sin Firestore, sin Google).
 * Destino: src/utils/mapaOperaciones.ts
 *
 * Qué resuelve:
 *  - La ruta de cada técnico es de UN día, sale de la oficina y sigue la HORA de las citas.
 *  - Proyecta el resto del día según el avance real (paso de cada orden + GPS).
 *  - Ordena a quién se le puede pasar una cita y explica por qué, con bloqueos y avisos.
 *  - Propone mover citas cuando un técnico va atrasado, y repartir el día de un técnico.
 *
 * Nada aquí escribe datos ni envía mensajes: solo calcula. La oficina siempre confirma.
 */
import type { FaseOrden } from '../types';
import type { Especialidad } from './equiposOperacion';
import { kmEntre, metrosEntre, minutosManejoEstimado, tieneCoord, type LatLng } from './geo';
import { mismoDiaRD, inicioDiaRD, situacionDiaRD, componentesRD } from './mapaFechas';

export const REGLAS_MAPA = {
  /** Hora en que las vans salen de la oficina (min desde medianoche) */
  salidaOficina: 8 * 60 + 30,
  primeraCita: 9 * 60,
  ultimaCita: 18 * 60,
  duracionDefectoMin: 60,
  /** Llegar unos minutos antes de la hora */
  margenAntesMin: 5,
  /** Se considera tarde si llega más de esto después de la hora */
  toleranciaMin: 10,
  /** Desde este atraso proyectado el mapa propone mover la cita */
  atrasoParaSugerirMin: 30,
  maximoDia: 7,
  gpsViejoMin: 5,
  gpsPerdidoMin: 20,
  /** A menos de esto, con la van detenida, se considera que está en la casa del cliente */
  radioEnSitioM: 150,
  /** Google Maps en el navegador del teléfono acepta 3 paradas intermedias por enlace */
  paradasPorEnlace: 3,
  /** Pesos del puntaje de candidatos (menor es mejor) */
  peso: { minTarde: 2, kmExtra: 1.5, cita: 4, otraEspecialidad: 80, otroEquipo: 12, retrasaOtra: 25, sinGps: 6 },
} as const;

export type TipoServicio = 'reparacion' | 'mantenimiento' | 'garantia';
export type EquipoOp = 'A' | 'B';

export interface TecnicoMapa {
  // @safe-tecnicoid-id: `TecnicoMapa.id` es el valor normalizado que las rules validan contra
  // `auth.uid` (campo `tecnicoId` en `ordenes_servicio`). Debe venir SIEMPRE del `uid` del doc
  // `personal`, no del doc id. `mapaAdaptadores.tecnicoDesdePersonal` cae a doc id solo cuando
  // `uid` falta y marca `emparejado=false`; los callers que escriben a Firestore no deben
  // confiar en ese fallback.
  id: string;
  nombre: string;
  equipo: EquipoOp | null;
  repara: Especialidad[];
  soloMantenimiento?: Especialidad[];
  contratista?: boolean;
  activo: boolean;
  color?: string;
}

/** Lo mínimo del progreso (salida de calcularProgreso de progresoOrden.ts). */
export interface ProgresoMin {
  /** -1 sin agendar · 0 agendada · 1 en camino · 2 en sitio · 3 diagnóstico · 4 trabajando · 5 cobro · 6 cerrada */
  indice: number;
  completa: boolean;
  cancelada: boolean;
  desde?: Date;
  garantia?: boolean;
  standby?: boolean;
}

export interface CitaMapa {
  id: string;
  numero?: string;
  tecnicoId: string | null;
  clienteNombre: string;
  inicio: Date;
  duracionMin?: number;
  lat?: number;
  lng?: number;
  equipo: Especialidad | null;
  tipo: TipoServicio;
  fase: FaseOrden;
  progreso: ProgresoMin;
  eliminada?: boolean;
}

export interface PosicionGPS { tecnicoId: string; lat: number; lng: number; timestamp: Date; enMovimiento: boolean }

export interface ResultadoTramo { km: number; min: number; fuente: 'google' | 'estimado' }
/** Tiempo entre dos puntos. Por defecto se estima; la app pasa uno con los tiempos de Google ya cargados. */
export type Tramo = (desde: LatLng, hasta: LatLng) => ResultadoTramo;
export const tramoEstimado: Tramo = (a, b) => { const km = kmEntre(a, b); return { km, min: minutosManejoEstimado(km), fuente: 'estimado' }; };

export interface OpcionesDia {
  ahora: Date;
  /** Oficina. Si falta, el primer tramo del día no se cuenta. */
  origen?: LatLng | null;
  gps?: PosicionGPS | null;
  tramo?: Tramo;
  /**
   * Minutos desde medianoche RD en los que la van sale de la oficina. Si no se configura:
   *  - con `origen` definido: se usa `REGLAS_MAPA.salidaOficina` (default heredado) como ancla.
   *  - sin `origen`: NO se inventa una salida 8:30; el baseline se ancla a `ahora` (hoy) o
   *    al inicio de la primera cita (futuro/pasado).
   * Pasar `null` para forzar que no se use ancla alguna.
   */
  horaSalidaOficinaMin?: number | null;
}

/* ---------------- Utilidades de tiempo ---------------- */

const MIN = 60_000;
/**
 * Comparación por día en zona Santo Domingo (UTC-4). Antes usaba la zona local del dispositivo,
 * lo que podía mezclar lunes y martes para técnicos operando con un navegador fuera de RD.
 */
export const mismoDia = (a: Date, b: Date) => mismoDiaRD(a, b);
const finDe = (c: CitaMapa) => c.inicio.getTime() + (c.duracionMin ?? REGLAS_MAPA.duracionDefectoMin) * MIN;
const minutosDelDia = (d: Date) => {
  const c = componentesRD(d);
  return c.hora * 60 + c.minuto;
};
export function hora12(d: Date): string {
  const c = componentesRD(d);
  const h = c.hora, m = c.minuto;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
/** Minutos desde medianoche RD + `minutos` adelantados — para construir la hora de salida del día. */
const conDia = (base: Date, minutos: number) => inicioDiaRD(base).getTime() + minutos * MIN;

/* ---------------- Filtrado y agrupado ---------------- */

/** Citas que cuentan para el mapa ese día: no eliminadas, no canceladas, con hora. Ordenadas por hora. */
export function citasDelDia(citas: CitaMapa[], fecha: Date): CitaMapa[] {
  return citas
    .filter(c => !c.eliminada && c.fase !== 'cancelado' && !c.progreso.cancelada && c.inicio instanceof Date && !Number.isNaN(c.inicio.getTime()) && mismoDia(c.inicio, fecha))
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/** Agrupa por tecnicoId (nunca por nombre). La clave '' son las citas sin técnico. */
export function agruparPorTecnico(citas: CitaMapa[]): Map<string, CitaMapa[]> {
  const m = new Map<string, CitaMapa[]>();
  for (const c of citas) { const k = c.tecnicoId ?? ''; (m.get(k) ?? m.set(k, []).get(k)!).push(c); }
  return m;
}

/* ---------------- GPS ---------------- */

export type Senal = 'sin_gps' | 'ok' | 'vieja' | 'perdida';

/** Timestamp válido: Date real, no NaN, no futuro más allá del margen de reloj. */
const TS_FUTURO_MAX_MIN = 2;
function tsValido(ts: unknown, ahora: Date): ts is Date {
  if (!(ts instanceof Date)) return false;
  const t = ts.getTime();
  if (!Number.isFinite(t)) return false;
  // Reloj del cliente puede estar hasta ~2 min por delante del servidor. Más que eso → inválido.
  if (t - ahora.getTime() > TS_FUTURO_MAX_MIN * MIN) return false;
  return true;
}

export function senalGPS(p: PosicionGPS | null | undefined, ahora: Date): { senal: Senal; minutos: number | null } {
  if (!p || !tieneCoord(p)) return { senal: 'sin_gps', minutos: null };
  if (!tsValido(p.timestamp, ahora)) return { senal: 'sin_gps', minutos: null };
  const minutos = Math.max(0, Math.round((ahora.getTime() - p.timestamp.getTime()) / MIN));
  if (minutos >= REGLAS_MAPA.gpsPerdidoMin) return { senal: 'perdida', minutos };
  if (minutos >= REGLAS_MAPA.gpsViejoMin) return { senal: 'vieja', minutos };
  return { senal: 'ok', minutos };
}

/**
 * Si el técnico no marcó «Llegué» pero la van está detenida en la casa del cliente,
 * el mapa lo muestra como «En sitio (según GPS)». No cambia la orden.
 *
 * Fix hallazgo QA 2026-10-01 §5:
 *  - exige que el GPS sea del MISMO técnico (`p.tecnicoId === c.tecnicoId`).
 *  - exige que el GPS sea del MISMO día RD que la cita.
 *  - exige que la cita sea de HOY (no inferir presencia física de citas futuras o pasadas).
 *  - exige que la hora ya haya empezado (`ahora >= c.inicio`), con margen de -15 min.
 * El mapa NO cambia la orden en Firestore — es solo una etiqueta visual.
 */
export function enSitioSegunGPS(c: CitaMapa, p: PosicionGPS | null | undefined, ahora: Date): boolean {
  if (c.progreso.indice >= 2 || c.progreso.completa) return false;
  if (!p || !tieneCoord(c) || !tieneCoord(p)) return false;
  if (!c.tecnicoId || p.tecnicoId !== c.tecnicoId) return false;
  if (!tsValido(p.timestamp, ahora)) return false;
  if (!mismoDiaRD(p.timestamp, c.inicio)) return false;
  if (!mismoDiaRD(ahora, c.inicio)) return false;
  if (ahora.getTime() + REGLAS_MAPA.margenAntesMin * MIN < c.inicio.getTime()) return false;
  if (senalGPS(p, ahora).senal !== 'ok' || p.enMovimiento) return false;
  return metrosEntre(p, c) <= REGLAS_MAPA.radioEnSitioM;
}

/* ---------------- Proyección del día ---------------- */

export type EstadoParada = 'hecha' | 'en_sitio' | 'en_camino' | 'pendiente';
export function estadoParada(p: ProgresoMin): EstadoParada {
  if (p.completa || p.indice >= 5) return 'hecha';
  if (p.indice >= 2) return 'en_sitio';
  if (p.indice === 1) return 'en_camino';
  return 'pendiente';
}

export interface Parada {
  cita: CitaMapa;
  estado: EstadoParada;
  /** true si se dedujo del GPS y no de lo que marcó el técnico */
  segunGPS: boolean;
  km: number | null;
  minViaje: number | null;
  sale: Date | null;
  llega: Date | null;
  termina: Date | null;
  /** Minutos que llega después de la hora (0 si a tiempo) */
  tardeMin: number;
  sinUbicacion: boolean;
  /**
   * Standby abierto en la orden: la parada se muestra pero NO cuenta como visita activa.
   * No consume duración ni traslado, no empuja el horario de las siguientes, no suma
   * km/min pendientes y no entra en `enCurso`/`proxima`/`sugerenciasPorAtraso`.
   * Hasta que la pieza llegue y se reactive, la pieza/orden queda visible pero inactiva.
   */
  enStandby?: boolean;
}

export type EstadoTecnico = 'sin_citas' | 'por_salir' | 'en_camino' | 'en_sitio' | 'libre' | 'termino';
/**
 * Diferencia plan futuro, operación en vivo e historial — fix hallazgo QA 2026-10-01 §11.
 * `hoy` recorre la lógica completa; `futuro` solo horas prometidas; `pasado` lo que efectivamente pasó.
 */
export type FuenteDia = 'hoy' | 'futuro' | 'pasado' | 'mezcla' | 'invalido';

export interface DiaTecnico {
  paradas: Parada[];
  total: number;
  hechas: number;
  estado: EstadoTecnico;
  enCurso: Parada | null;
  proxima: Parada | null;
  /** Mayor atraso proyectado entre las citas que faltan */
  atrasoMin: number;
  atrasado: boolean;
  libreDesde: Date | null;
  kmPendientes: number;
  minPendientes: number;
  fuente: 'google' | 'estimado';
  /** Si el día corresponde a hoy / futuro / pasado en RD. `mezcla` si vienen citas de días distintos. */
  dia: FuenteDia;
}

/**
 * Clasifica el día en RD a partir de la fecha-ancla y `ahora`.
 */
function clasificarDia(citas: CitaMapa[], ahora: Date): FuenteDia {
  if (!citas.length) return 'hoy';
  const validas = citas.filter(c => c.inicio instanceof Date && Number.isFinite(c.inicio.getTime()));
  if (validas.length !== citas.length) return 'invalido';
  const dias = new Set(validas.map(c => inicioDiaRD(c.inicio).getTime()));
  if (dias.size > 1) return 'mezcla';
  const dia = validas[0].inicio;
  const s = situacionDiaRD(dia, ahora);
  return s === 'invalido' ? 'invalido' : s;
}

/**
 * Proyecta el día de UN técnico. `citas` = sus citas activas de ese día (cualquier orden).
 * Respeta la hora prometida: nunca adelanta una cita, solo calcula si llega a tiempo.
 *
 * Fix hallazgo QA 2026-10-01 §11:
 *  - Separa plan futuro (sin GPS, sin proyección «en vivo»), operación en vivo (hoy) e historial (pasado).
 *  - Standby no cuenta como atraso.
 *  - Sin ubicación: la hora de llegada no se inventa (`llega` queda null) y `minViaje` también.
 *  - Mezcla de días devuelve `dia: 'mezcla'` y no proyecta.
 */
export function proyectarDia(citas: CitaMapa[], o: OpcionesDia): DiaTecnico {
  const tramo = o.tramo ?? tramoEstimado;
  const lista = [...citas].filter(c => c.inicio instanceof Date && Number.isFinite(c.inicio.getTime())).sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const diaClas = clasificarDia(citas, o.ahora);
  // Fecha de 'ahora' inválida o mezcla → no proyectamos nada; devolvemos esqueleto honesto.
  if (diaClas === 'invalido' || !Number.isFinite(o.ahora.getTime())) {
    return {
      paradas: [], total: 0, hechas: 0, estado: 'sin_citas',
      enCurso: null, proxima: null,
      atrasoMin: 0, atrasado: false, libreDesde: null,
      kmPendientes: 0, minPendientes: 0, fuente: 'estimado',
      dia: 'invalido',
    };
  }
  const ahora = o.ahora.getTime();
  const esHoy = diaClas === 'hoy';
  const esPasado = diaClas === 'pasado';
  const esFuturo = diaClas === 'futuro';
  const esMezcla = diaClas === 'mezcla';

  // GPS solo cuenta en HOY (operación en vivo). En futuro y pasado no se infiere nada.
  const gpsOk = esHoy && o.gps && senalGPS(o.gps, o.ahora).senal === 'ok' ? { lat: o.gps.lat, lng: o.gps.lng } : null;
  const diaRef = lista[0]?.inicio ?? o.ahora;
  let lugar: LatLng | null = tieneCoord(o.origen) ? o.origen : null;
  /**
   * Baseline de salida: solo se usa la constante `REGLAS_MAPA.salidaOficina` cuando hay
   * `origen` (oficina) real o cuando el caller la pide por `horaSalidaOficinaMin`. Sin esos,
   * NO fabricamos una salida 8:30 obligatoria — nos anclamos a `ahora` (hoy) o a la primera
   * cita (futuro/pasado). `horaSalidaOficinaMin: null` fuerza el modo sin ancla explícita.
   */
  const salidaConfigurada = o.horaSalidaOficinaMin === null
    ? null
    : (typeof o.horaSalidaOficinaMin === 'number' ? o.horaSalidaOficinaMin : (lugar ? REGLAS_MAPA.salidaOficina : null));
  const salidaOficina = salidaConfigurada !== null ? conDia(diaRef, salidaConfigurada) : null;
  let libre = esHoy
    ? (salidaOficina !== null ? Math.max(ahora, salidaOficina) : ahora)
    : (salidaOficina !== null ? salidaOficina : (lista[0]?.inicio?.getTime() ?? ahora));
  let fuente: 'google' | 'estimado' = 'google';
  let kmPend = 0, minPend = 0;
  const paradas: Parada[] = [];

  if (esHoy) {
    // Si hay algo hecho, el punto de partida es la última parada hecha (o el GPS si está fresco).
    const ultimaHecha = [...lista].reverse().find(c => estadoParada(c.progreso) === 'hecha' && tieneCoord(c));
    if (ultimaHecha) lugar = { lat: ultimaHecha.lat!, lng: ultimaHecha.lng! };
    if (gpsOk) lugar = gpsOk;
  }

  for (const c of lista) {
    let estado = estadoParada(c.progreso);
    let segunGPS = false;
    // Solo inferimos «en sitio» por GPS en operación en vivo.
    if (esHoy && estado !== 'hecha' && estado !== 'en_sitio' && enSitioSegunGPS(c, o.gps, o.ahora)) {
      estado = 'en_sitio'; segunGPS = true;
    }
    // Si el día es futuro o pasado, los estados «en camino» / «en sitio» no se proyectan en vivo;
    // los conservamos solo si vienen del historial de la orden (progreso ya lo marcó así en el pasado).
    const dur = (c.duracionMin ?? REGLAS_MAPA.duracionDefectoMin) * MIN;
    const sinUbic = !tieneCoord(c);
    const base: Parada = { cita: c, estado, segunGPS, km: null, minViaje: null, sale: null, llega: null, termina: null, tardeMin: 0, sinUbicacion: sinUbic };

    if (estado === 'hecha') { paradas.push(base); continue; }

    // STANDBY ABIERTO — fix revisión 2026-10-02.
    // La orden está pausada hasta que llegue la pieza / se reactive. NO es visita activa:
    // la mostramos como pendiente informativa, pero no empuja la ruta ni consume duración
    // ni traslado; no cuenta como parada operativa; no se sugiere mover por «atraso»
    // (no hay atraso cuando no está activa); no entra en `enCurso`/`proxima`.
    if (c.progreso.standby === true) {
      paradas.push({
        ...base,
        estado: 'pendiente',
        enStandby: true,
        segunGPS: false,
        km: null, minViaje: null, sale: null, llega: null, termina: null,
        tardeMin: 0,
      });
      continue;
    }

    // En futuro/mezcla: sin proyección en vivo. Solo plan honesto (hora prometida).
    if (esFuturo || esMezcla) {
      let km: number | null = null;
      let mv: number | null = null;
      if (lugar && tieneCoord(c)) {
        const t = tramo(lugar, c);
        if (t.fuente === 'estimado') fuente = 'estimado';
        km = t.km; mv = t.min; kmPend += t.km; minPend += t.min;
      }
      const inicioC = c.inicio.getTime();
      const sale = mv !== null ? inicioC - (mv + REGLAS_MAPA.margenAntesMin) * MIN : null;
      const llega = sinUbic ? null : inicioC; // la hora prometida; sin coords, no inventamos
      const termina = inicioC + dur;
      paradas.push({
        ...base,
        estado: 'pendiente',
        km, minViaje: mv,
        sale: sale !== null ? new Date(sale) : null,
        llega: llega !== null ? new Date(llega) : null,
        termina: new Date(termina),
        tardeMin: 0,
      });
      if (tieneCoord(c)) lugar = { lat: c.lat, lng: c.lng };
      libre = termina;
      continue;
    }

    // En pasado: no se proyecta nada; solo se refleja lo que la orden guarda.
    if (esPasado) {
      // Para pasado: hora de inicio promesa + duración → termina. Sin km/minViaje (no sabemos ruta real).
      const inicioC = c.inicio.getTime();
      paradas.push({
        ...base,
        km: null, minViaje: null, sale: null,
        llega: estado === 'pendiente' ? null : new Date(inicioC),
        termina: new Date(inicioC + dur),
        tardeMin: 0,
      });
      if (tieneCoord(c)) lugar = { lat: c.lat, lng: c.lng };
      libre = inicioC + dur;
      continue;
    }

    // HOY — operación en vivo.
    if (estado === 'en_sitio') {
      const llego = c.progreso.desde?.getTime() ?? Math.min(ahora, c.inicio.getTime());
      const termina = Math.max(ahora + 10 * MIN, llego + dur);
      paradas.push({ ...base, llega: new Date(llego), termina: new Date(termina) });
      if (tieneCoord(c)) lugar = { lat: c.lat, lng: c.lng };
      libre = termina;
      continue;
    }

    let km: number | null = null;
    let mv: number | null = null;
    if (lugar && tieneCoord(c)) {
      const t = tramo(lugar, c);
      if (t.fuente === 'estimado') fuente = 'estimado';
      km = t.km; mv = t.min; kmPend += t.km; minPend += t.min;
    }
    let sale: number | null;
    let llega: number | null;
    if (estado === 'en_camino') {
      // Sin viaje calculable (sin origen conocido o sin ubicación destino) no fabricamos ETA.
      sale = c.progreso.desde?.getTime() ?? ahora;
      llega = mv !== null ? ahora + mv * MIN : null;
    } else if (mv === null) {
      // Pendiente SIN viaje calculable: no sabemos el origen o la cita no tiene coord.
      // No inventamos llegada puntual a la hora prometida: eso falsea el día.
      sale = null;
      llega = null;
    } else {
      // Pendiente con viaje conocido: sale como muy tarde para llegar a la hora (con margen).
      sale = Math.max(libre, c.inicio.getTime() - (mv + REGLAS_MAPA.margenAntesMin) * MIN);
      llega = sinUbic ? null : sale + mv * MIN;
    }
    const termina = llega !== null ? Math.max(llega, c.inicio.getTime()) + dur : c.inicio.getTime() + dur;
    const tardeMin = llega !== null ? Math.max(0, Math.round((llega - c.inicio.getTime()) / MIN)) : 0;
    paradas.push({
      ...base,
      km, minViaje: mv,
      sale: sale !== null ? new Date(sale) : null,
      llega: llega !== null ? new Date(llega) : null,
      termina: new Date(termina),
      tardeMin,
    });
    if (tieneCoord(c)) lugar = { lat: c.lat, lng: c.lng };
    libre = termina;
  }

  const hechas = paradas.filter(p => p.estado === 'hecha').length;
  // enCurso: standby no cuenta (su parada se fija a estado 'pendiente' + enStandby=true).
  const enCurso = paradas.find(p => !p.enStandby && (p.estado === 'en_sitio' || p.estado === 'en_camino')) ?? null;
  // proxima: la próxima VISITA activa, no una pausada en standby.
  const proxima = paradas.find(p => !p.enStandby && p.estado === 'pendiente') ?? null;
  // atraso: solo paradas activas (ni hechas, ni en standby) aportan atrasoMin.
  const atrasoMin = Math.max(0, ...paradas.filter(p => p.estado !== 'hecha' && !p.enStandby).map(p => p.tardeMin));
  let estado: EstadoTecnico;
  if (!paradas.length) estado = 'sin_citas';
  else if (hechas === paradas.length) estado = 'termino';
  else if (enCurso) estado = enCurso.estado === 'en_camino' ? 'en_camino' : 'en_sitio';
  else estado = hechas === 0 ? 'por_salir' : 'libre';
  const ultima = [...paradas].reverse().find(p => p.termina);
  return {
    paradas, total: paradas.length, hechas, estado, enCurso, proxima,
    atrasoMin, atrasado: atrasoMin > REGLAS_MAPA.toleranciaMin,
    libreDesde: ultima?.termina ?? null,
    kmPendientes: Math.round(kmPend * 10) / 10, minPendientes: minPend,
    fuente: paradas.some(p => p.km !== null) ? fuente : 'estimado',
    dia: diaClas,
  };
}

export function textoEstado(d: DiaTecnico, ahora: Date): string {
  if (d.paradas.length && d.paradas.every(p => p.enStandby)) return 'En espera de piezas';
  switch (d.estado) {
    case 'sin_citas': return 'Sin citas hoy';
    case 'termino': return 'Terminó el día';
    case 'en_sitio': return `En casa de ${d.enCurso!.cita.clienteNombre}${d.enCurso!.segunGPS ? ' (según GPS)' : ''}`;
    case 'en_camino': {
      const p = d.enCurso!; const min = p.llega ? Math.max(0, Math.round((p.llega.getTime() - ahora.getTime()) / MIN)) : null;
      return `Va a ${p.cita.clienteNombre}${min !== null ? ` · llega en ${min} min` : ''}`;
    }
    case 'por_salir': return d.proxima?.sale ? `Sale a las ${hora12(d.proxima.sale)}` : 'Por salir';
    case 'libre': return d.proxima?.sale ? `Libre · sale a las ${hora12(d.proxima.sale)}` : 'Libre';
  }
}

/* ---------------- Reasignar ---------------- */

export function puedeAtender(t: TecnicoMapa, e: Especialidad | null, tipo: TipoServicio): boolean {
  if (!e) return true; // sin especialidad conocida no se puede juzgar: no se bloquea
  if (t.repara.includes(e)) return true;
  return tipo === 'mantenimiento' && !!t.soloMantenimiento?.includes(e);
}

export type NivelCandidato = 'recomendado' | 'con_avisos' | 'bloqueado';
export interface Candidato {
  tecnico: TecnicoMapa;
  nivel: NivelCandidato;
  bloqueos: string[];
  avisos: string[];
  /** Hora estimada de llegada a esta cita si se la pasan */
  llega: Date | null;
  tardeMin: number;
  /** km que se le suman a su día */
  kmExtra: number;
  citasEseDia: number;
  /** Cuántas de sus otras citas pasarían a llegar tarde */
  retrasaOtras: number;
  diaActual: DiaTecnico;
  resumen: string;
  puntaje: number;
}

export interface OpcionesCandidatos extends Omit<OpcionesDia, 'gps'> {
  gpsPorTecnico?: Map<string, PosicionGPS>;
  /** Tope solo cuando oficina lo configura expresamente; no se impone uno por defecto. */
  maximoDia?: number;
}

const ESP: Record<Especialidad, string> = { nevera: 'neveras', lavadora: 'lavadoras', secadora: 'secadoras', estufa: 'estufas', aire: 'aires' };

/**
 * Lista de técnicos a quienes se puede pasar `cita`, del mejor al peor, con el porqué.
 * `todas` = todas las citas activas de ese día (de todos los técnicos).
 */
export function candidatosReasignacion(cita: CitaMapa, tecnicos: TecnicoMapa[], todas: CitaMapa[], o: OpcionesCandidatos): Candidato[] {
  // @safe-tecnicoid-id: TecnicoMapa.id y cita.tecnicoId usan la misma identidad canónica en este cálculo puro; el backend valida UID antes de escribir.
  const actual = tecnicos.find(t => t.id === cita.tecnicoId) ?? null;
  const porTec = agruparPorTecnico(citasDelDia(todas, cita.inicio).filter(c => c.id !== cita.id));
  const P = REGLAS_MAPA.peso;
  const out: Candidato[] = [];

  for (const t of tecnicos) {
    if (t.id === cita.tecnicoId) continue;
    const suyas = porTec.get(t.id) ?? [];
    const gps = o.gpsPorTecnico?.get(t.id) ?? null;
    const opts: OpcionesDia = { ahora: o.ahora, origen: o.origen, tramo: o.tramo, gps };
    const antes = proyectarDia(suyas, opts);
    const despues = proyectarDia([...suyas, cita], opts);
    const nueva = despues.paradas.find(p => p.cita.id === cita.id)!;

    const bloqueos: string[] = [];
    const avisos: string[] = [];
    if (!t.activo) bloqueos.push('No está activo');
    if (o.maximoDia && Number.isSafeInteger(o.maximoDia) && o.maximoDia > 0 && suyas.length >= o.maximoDia) {
      bloqueos.push(`Ya tiene ${suyas.length} citas ese día (máximo ${o.maximoDia})`);
    }
    // Choque de horario: las citas en standby del destino NO ocupan franja (la pausa en la pieza
    // hace que no haya visita activa a esa hora). No deben bloquear una reasignación.
    const choque = suyas.find(c => c.progreso.standby !== true && estadoParada(c.progreso) !== 'hecha' && c.inicio.getTime() < finDe(cita) && cita.inicio.getTime() < finDe(c));
    if (choque) bloqueos.push(`Tiene otra cita a las ${hora12(choque.inicio)} (${choque.clienteNombre})`);

    if (!puedeAtender(t, cita.equipo, cita.tipo)) avisos.push(`No repara ${cita.equipo ? ESP[cita.equipo] : 'ese equipo'}`);
    const otroEquipo = !!(actual?.equipo && t.equipo && actual.equipo !== t.equipo);
    if (otroEquipo) avisos.push(`Es del equipo ${t.equipo}: la orden pasa a la otra operaria`);
    if (t.contratista) avisos.push('Es contratista');
    if (nueva.tardeMin > REGLAS_MAPA.toleranciaMin) avisos.push(`Llegaría ${nueva.tardeMin} min tarde`);
    const tardeAntes = new Set(antes.paradas.filter(p => p.tardeMin > REGLAS_MAPA.toleranciaMin).map(p => p.cita.id));
    const retrasaOtras = despues.paradas.filter(p => p.cita.id !== cita.id && p.tardeMin > REGLAS_MAPA.toleranciaMin && !tardeAntes.has(p.cita.id)).length;
    if (retrasaOtras) avisos.push(`Retrasaría ${retrasaOtras} de sus otras citas`);
    const s = senalGPS(gps, o.ahora).senal;
    if (s === 'vieja' || s === 'perdida') avisos.push('Sin GPS reciente: la hora de llegada es aproximada');
    if (nueva.sinUbicacion) avisos.push('La cita no tiene ubicación: no se puede calcular la distancia');

    const kmExtra = Math.max(0, Math.round((despues.kmPendientes - antes.kmPendientes) * 10) / 10);
    const nivel: NivelCandidato = bloqueos.length ? 'bloqueado' : avisos.length ? 'con_avisos' : 'recomendado';
    const puntaje = (bloqueos.length ? 10_000 : 0)
      + nueva.tardeMin * P.minTarde + kmExtra * P.kmExtra + suyas.length * P.cita
      + (puedeAtender(t, cita.equipo, cita.tipo) ? 0 : P.otraEspecialidad)
      + (otroEquipo ? P.otroEquipo : 0) + retrasaOtras * P.retrasaOtra
      + (s === 'vieja' || s === 'perdida' ? P.sinGps : 0);

    const partes: string[] = [];
    if (nueva.llega) partes.push(nueva.tardeMin > REGLAS_MAPA.toleranciaMin ? `Llega ${hora12(nueva.llega)} (${nueva.tardeMin} min tarde)` : `Llega ${hora12(nueva.llega)}, a tiempo`);
    if (!nueva.sinUbicacion) partes.push(`+${kmExtra.toFixed(1)} km`);
    partes.push(`${suyas.length} cita${suyas.length === 1 ? '' : 's'} ese día`);

    out.push({ tecnico: t, nivel, bloqueos, avisos, llega: nueva.llega, tardeMin: nueva.tardeMin, kmExtra, citasEseDia: suyas.length, retrasaOtras, diaActual: antes, resumen: partes.join(' · '), puntaje });
  }
  return out.sort((a, b) => a.puntaje - b.puntaje || a.tecnico.nombre.localeCompare(b.tecnico.nombre));
}

export interface Validacion { puede: boolean; bloqueos: string[]; avisos: string[]; requiereMotivo: boolean }

/** Revisión final antes de guardar. Se llama otra vez dentro de la transacción con los datos frescos. */
export function validarReasignacion(cita: CitaMapa, destino: TecnicoMapa, candidato: Candidato | null, ahora: Date): Validacion {
  const bloqueos: string[] = [];
  const avisos: string[] = [];
  if (cita.eliminada || cita.fase === 'cancelado' || cita.progreso.cancelada) bloqueos.push('La orden está cancelada o eliminada');
  else if (cita.progreso.completa || cita.progreso.indice >= 5 || cita.fase === 'cerrado' || cita.fase === 'trabajo_realizado') bloqueos.push('El trabajo de esta orden ya se hizo');
  else if (cita.progreso.indice >= 2) bloqueos.push('El técnico ya está en la casa del cliente. Termina o cancela la visita primero');
  if (destino.id === cita.tecnicoId) bloqueos.push(`La cita ya es de ${destino.nombre}`);
  if (candidato) bloqueos.push(...candidato.bloqueos);
  if (cita.progreso.indice === 1) avisos.push('El técnico actual ya va en camino. Avísale antes de cambiarla');
  if (cita.inicio.getTime() < ahora.getTime() && cita.progreso.indice < 1) avisos.push(`La hora de esta cita (${hora12(cita.inicio)}) ya pasó`);
  if (candidato) avisos.push(...candidato.avisos);
  const unicos = (xs: string[]) => [...new Set(xs)];
  const b = unicos(bloqueos), a = unicos(avisos);
  return { puede: b.length === 0, bloqueos: b, avisos: a, requiereMotivo: a.length > 0 };
}

/* ---------------- Sugerencias por atraso ---------------- */

export interface SugerenciaMover {
  cita: CitaMapa;
  de: TecnicoMapa;
  a: TecnicoMapa;
  atrasoActualMin: number;
  llegaNueva: Date | null;
  texto: string;
}

/**
 * Para cada cita que va a llegar muy tarde (≥ atrasoParaSugerirMin), busca un técnico
 * que llegue a tiempo, repare ese equipo y sea del mismo equipo de operaria.
 * Solo propone; la oficina decide.
 */
export function sugerenciasPorAtraso(tecnicos: TecnicoMapa[], todas: CitaMapa[], o: OpcionesCandidatos): SugerenciaMover[] {
  const porTec = agruparPorTecnico(todas);
  const out: SugerenciaMover[] = [];
  const usados = new Set<string>();
  for (const t of tecnicos) {
    const dia = proyectarDia(porTec.get(t.id) ?? [], { ahora: o.ahora, origen: o.origen, tramo: o.tramo, gps: o.gpsPorTecnico?.get(t.id) ?? null });
    for (const p of dia.paradas) {
      // Standby: pendiente pero NO visita activa; no se sugiere mover por «atraso».
      if (p.enStandby) continue;
      if (p.estado !== 'pendiente' || p.tardeMin < REGLAS_MAPA.atrasoParaSugerirMin) continue;
      const mejor = candidatosReasignacion(p.cita, tecnicos, todas, o)
        .find(c => c.nivel === 'recomendado' && !usados.has(c.tecnico.id) && c.tecnico.equipo === t.equipo);
      if (!mejor) continue;
      usados.add(mejor.tecnico.id);
      out.push({
        cita: p.cita, de: t, a: mejor.tecnico, atrasoActualMin: p.tardeMin, llegaNueva: mejor.llega,
        texto: `${t.nombre} llegaría ${p.tardeMin} min tarde a ${p.cita.clienteNombre} (${hora12(p.cita.inicio)}). ${mejor.tecnico.nombre} puede llegar a tiempo${mejor.llega ? ` (${hora12(mejor.llega)})` : ''}.`,
      });
    }
  }
  return out.sort((a, b) => b.atrasoActualMin - a.atrasoActualMin);
}

/* ---------------- Repartir el día de un técnico ---------------- */

export interface Movimiento { cita: CitaMapa; a: TecnicoMapa | null; resumen: string }

/**
 * Cuando un técnico no puede seguir (avería, enfermedad): propone a quién pasar cada cita
 * que le falta. Las que nadie puede tomar salen con `a: null` → llamar al cliente para cambiar la hora.
 */
export function repartirCitas(tecnicoId: string, tecnicos: TecnicoMapa[], todas: CitaMapa[], o: OpcionesCandidatos): Movimiento[] {
  let trabajo = todas.map(c => ({ ...c }));
  const pendientes = trabajo
    .filter(c => c.tecnicoId === tecnicoId && estadoParada(c.progreso) === 'pendiente')
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const otros = tecnicos.filter(t => t.id !== tecnicoId);
  const out: Movimiento[] = [];
  for (const c of pendientes) {
    const mejor = candidatosReasignacion(c, otros, trabajo, o).find(x => x.nivel !== 'bloqueado' && !x.avisos.some(a => a.startsWith('No repara')));
    if (mejor) {
      trabajo = trabajo.map(x => (x.id === c.id ? { ...x, tecnicoId: mejor.tecnico.id } : x));
      out.push({ cita: c, a: mejor.tecnico, resumen: mejor.resumen });
    } else {
      out.push({ cita: c, a: null, resumen: 'Nadie libre a esa hora: llamar al cliente para cambiar la hora' });
    }
  }
  return out;
}

/* ---------------- Ruta más corta (solo como dato para reagendar) ---------------- */

export interface ComparacionOrden { kmAgenda: number; kmMasCorto: number; ahorroKm: number; ordenSugerido: string[]; cambianDeLugar: string[] }

/**
 * La ruta real sigue las horas. Esto solo dice cuánto se ahorraría si se cambiaran horas,
 * para que la oficina decida si vale la pena llamar a los clientes. Hasta 8 paradas.
 */
export function compararConMasCorto(citas: CitaMapa[], origen: LatLng | null): ComparacionOrden | null {
  const pend = [...citas].filter(c => tieneCoord(c) && estadoParada(c.progreso) === 'pendiente').sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  if (pend.length < 3 || pend.length > 8) return null;
  const pts = pend.map(c => ({ lat: c.lat!, lng: c.lng! }));
  const km = (orden: number[]) => { let k = 0; let prev: LatLng | null = origen; for (const i of orden) { if (prev) k += kmEntre(prev, pts[i]); prev = pts[i]; } return k; };
  const agenda = pend.map((_, i) => i);
  let mejor = agenda, kmMejor = km(agenda);
  const permutar = (resto: number[], pref: number[]) => {
    if (!resto.length) { const k = km(pref); if (k < kmMejor - 1e-9) { kmMejor = k; mejor = pref; } return; }
    for (let i = 0; i < resto.length; i++) permutar([...resto.slice(0, i), ...resto.slice(i + 1)], [...pref, resto[i]]);
  };
  permutar(agenda, []);
  const kmAgenda = km(agenda);
  return {
    kmAgenda: Math.round(kmAgenda * 10) / 10,
    kmMasCorto: Math.round(kmMejor * 10) / 10,
    ahorroKm: Math.round((kmAgenda - kmMejor) * 10) / 10,
    ordenSugerido: mejor.map(i => pend[i].id),
    cambianDeLugar: mejor.map((i, pos) => (i !== pos ? pend[i].id : null)).filter((x): x is string => !!x),
  };
}

/* ---------------- Enlaces de Google Maps ---------------- */

const ll = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
/**
 * Enlaces «Cómo llegar» con todas las paradas en orden. Si hay más de las que acepta un enlace,
 * devuelve varios tramos (el segundo empieza donde termina el primero).
 */
export function enlacesGoogleMaps(origen: LatLng | null, paradas: LatLng[], porEnlace: number = REGLAS_MAPA.paradasPorEnlace): string[] {
  const pts = paradas.filter(p => tieneCoord(p));
  if (!pts.length) return [];
  const urls: string[] = [];
  let desde: LatLng | null = tieneCoord(origen) ? origen : null;
  let i = 0;
  while (i < pts.length) {
    const tramo = pts.slice(i, i + porEnlace + 1);
    const destino = tramo[tramo.length - 1];
    const intermedias = tramo.slice(0, -1);
    const q = new URLSearchParams({ api: '1', destination: ll(destino), travelmode: 'driving' });
    if (desde) q.set('origin', ll(desde));
    if (intermedias.length) q.set('waypoints', intermedias.map(ll).join('|'));
    urls.push(`https://www.google.com/maps/dir/?${q.toString()}`);
    desde = destino;
    i += tramo.length;
  }
  return urls;
}

/** Minutos desde medianoche (útil para la línea de tiempo del día). */
export const minutosDe = minutosDelDia;
