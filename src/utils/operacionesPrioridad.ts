/**
 * operacionesPrioridad.ts — lógica pura para el Centro de Operaciones.
 *
 * Decisiones (verificadas con las pruebas independientes de Codex
 * `tests/integraciones/codex-operaciones-cotejo.test.ts`):
 *  - Cliente como título del aviso; técnico/equipo son metadatos.
 *  - Prioridad determinista con razón visible por aviso.
 *  - Antigüedad real: si no hay fecha o la fecha es inválida, el aviso dice
 *    «sin fecha» y la prioridad baja a la cola (nunca NaN).
 *  - NO se inventa atraso cuando la orden no registró `duracionMin` finito y
 *    positivo. `calcularProgreso` cae a un default propio; acá se vuelve a
 *    chequear localmente para no reportar un atraso que nadie registró.
 *  - Órdenes con `estado` o `fase` en {'cerrado','cancelado'} nunca producen
 *    aviso ni cuentan como pendientes.
 *  - Deduplicación por `ordenId` ANTES de contar — tanto para `avisos` como
 *    para `totalesCategoria` (ninguna orden cuenta dos veces aunque aparezca
 *    en `ordenes` del día y en `pendientesAnteriores`).
 *  - Filtro de equipo A/B excluye órdenes con equipo desconocido (null).
 *  - Filtro `tecnicoIdsVisibles`: Set vacío = «ningún técnico visible» → cero.
 *    No vacío = restringe las métricas y los avisos a esos técnicos.
 *  - Técnico «activo»: solo se descarta cuando `personal.activo === false`.
 *    `undefined` no se interpreta como baja.
 *  - IDs técnico son canonicalizados contra `personal`: la misma persona no
 *    se cuenta dos veces aunque sus órdenes usen `uid` o `docId`.
 */
import type { OrdenServicio, Personal } from '../types';
import { obtenerSugerenciaSoloChequeoPendiente } from './index';
import { calcularProgreso, type EntradaProgreso, type ProgresoOrden } from './progresoOrden';
import { tipoDeOrden } from './mapaAdaptadores';
import { equipoDeOperaria, type EquipoOperacion } from './equiposOperacion';
import { componentesRD, fechaValida, inicioDiaRD } from './mapaFechas';

/**
 * `visita` no vive en el tipo oficial `OrdenServicio` (vive como extensión opcional
 * en el adaptador del mapa; ver `mapaAdaptadores.ts`). Lo tipamos acá explícitamente
 * para no castear in-line en cada callsite.
 */
type OrdenConVisita = OrdenServicio & {
  visita?: {
    enCaminoEn?: Date | string | { toDate?: () => Date };
    enSitioEn?: Date | string | { toDate?: () => Date };
  };
  estadoPago?: 'pendiente' | 'parcial' | 'completo';
};

/** Normaliza a Date lo que `OrdenServicio` puede guardar como Timestamp/Date/string. */
function aDate(v: unknown): Date | undefined {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : undefined;
  if (
    v &&
    typeof v === 'object' &&
    'toDate' in (v as Record<string, unknown>) &&
    typeof (v as { toDate: unknown }).toDate === 'function'
  ) {
    try {
      const d = (v as { toDate: () => unknown }).toDate();
      return d instanceof Date && Number.isFinite(d.getTime()) ? d : undefined;
    } catch {
      return undefined;
    }
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : undefined;
  }
  return undefined;
}

/** Convierte una orden Firestore-shape a la EntradaProgreso que espera `calcularProgreso`. */
function entradaProgresoDesdeOrden(o: OrdenConVisita): EntradaProgreso {
  return {
    fase: o.fase,
    historialFases: (o.historialFases ?? []).flatMap<{ fase: string; timestamp: Date }>((h) => {
      const t = aDate(h.timestamp);
      return t ? [{ fase: h.fase as string, timestamp: t }] : [];
    }),
    visita: o.visita
      ? { enCaminoEn: aDate(o.visita.enCaminoEn), enSitioEn: aDate(o.visita.enSitioEn) }
      : undefined,
    estadoPago: o.estadoPago,
    fechaCita: fechaValida(o.fechaCita) ? o.fechaCita : undefined,
    duracionMin: o.duracionMin,
    tipoServicio: tipoDeOrden(o),
    standbyAbierto: o.enStandby === true,
    standbyDesde: aDate(o.standbyDesde),
  };
}

/** `true` si la orden tiene un `duracionMin` finito > 0 (único caso donde `atrasoMin` es creíble). */
function duracionRegistrada(o: OrdenConVisita): boolean {
  return typeof o.duracionMin === 'number' && Number.isFinite(o.duracionMin) && o.duracionMin > 0;
}

/** Terminal: una orden en estos estados no produce avisos y no entra en «pendientes». */
export function estaTerminada(o: OrdenServicio): boolean {
  if (o.eliminada) return true;
  if (o.fase === 'cerrado' || o.fase === 'cancelado') return true;
  if (o.estado === 'cerrado' || o.estado === 'cancelado') return true;
  return false;
}

/** `atrasoMin` solo si la orden tiene duración registrada; si no, 0. */
function atrasoReal(o: OrdenConVisita, prog: ProgresoOrden): number {
  if (!duracionRegistrada(o)) return 0;
  return prog.atrasoMin > 0 ? prog.atrasoMin : 0;
}

/**
 * Progreso «operativo» de una orden: envuelve `calcularProgreso` y
 *   (a) nulifica `atrasoMin` si la orden no registró duración (no inventa),
 *   (b) honra `estado === 'cerrado'` como cerrada aunque la fase sea otra
 *       (fix revisión Codex 2026-10-02).
 */
export function progresoOperativo(o: OrdenConVisita, ahora: Date): ProgresoOrden {
  const base = calcularProgreso(entradaProgresoDesdeOrden(o), ahora);
  const atraso = atrasoReal(o, base);
  if (o.estado === 'cerrado' && o.fase !== 'cerrado') {
    return { ...base, indice: 6, paso: 'cerrada', etiqueta: 'Cerrada', completa: true, standby: false, atrasoMin: 0 };
  }
  return atraso === base.atrasoMin ? base : { ...base, atrasoMin: atraso };
}

export type CategoriaAviso =
  | 'chequeo_por_revisar'
  | 'precio_por_revisar'
  | 'cliente_por_confirmar'
  | 'atrasada'
  | 'garantia_abierta'
  | 'standby_pieza'
  | 'sin_salir'
  | 'por_cobrar'
  | 'pendiente_anterior';

export interface AvisoOperaciones {
  /** Clave estable para React key. */
  id: string;
  categoria: CategoriaAviso;
  /** Menor número = más urgente. Determinista: mismo input → mismo output. */
  prioridad: number;
  /** Cliente como título. */
  clienteNombre: string;
  tecnicoNombre?: string;
  /** `tecnicoId` tal cual viene en la orden (puede ser auth.uid o doc id). */
  tecnicoId: string | null;
  /** Razón explícita de por qué está en la lista. */
  razon: string;
  /** Métrica cuantitativa visible: minutos atrasada, días pendiente, etc. */
  metrica: string;
  /** ID de la orden para link a `/admin/ordenes/:id`. */
  ordenId: string;
  equipoTipo?: string;
  equipoMarca?: string;
  equipoOperacion: EquipoOperacion | null;
  importeSugerido?: number;
  detalleTecnico?: string;
}

export interface ResumenOperaciones {
  tecnicosActivos: number;
  enCamino: number;
  enSitio: number;
  libres: number;
  cerradas: number;
  pendientesCierre: number;
  atrasadas: number;
  mayorAtrasoMin: number;
  standby: number;
  garantiasAbiertas: number;
  totalDelDia: number;
}

export interface EstadoTecnicoActual {
  /** Etiqueta corta: "En camino", "Diagnóstico", "Sin actividad registrada"... */
  etiqueta: string;
  /** Clase semántica para pintar el estado (no color literal). */
  tono: 'activo' | 'standby' | 'cerrado' | 'ocioso' | 'proximo' | 'ausente';
  /** Orden actual si está trabajando en una. */
  ordenActual?: OrdenServicio;
  progresoActual?: ProgresoOrden;
}

export interface ProgresoDelDia {
  conteos: Record<number, number>;
  cerradas: number;
  standby: number;
  total: number;
}

/* ---------- helpers internos ---------- */

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function esTecnico(p: Personal): boolean {
  return p.rol === 'tecnico';
}

export function tecnicosActivos(personal: Personal[]): Personal[] {
  // Fix (revisión Codex #4): `undefined` NO equivale a baja; solo `=== false`.
  return personal.filter((p) => esTecnico(p) && p.activo !== false);
}

/** Devuelve el `tecnicoId` canónico — prefiere `uid` (lo que las rules validan). */
export function idOperativoTecnico(p: Personal): string {
  return p.uid || p.id;
}

/** `tecnicoId` de la orden puede ser el `uid` o un doc id de personal (bug histórico). */
export function perteneceAlTecnico(orden: OrdenServicio, p: Personal): boolean {
  const t = orden.tecnicoId;
  if (!t) return false;
  return t === p.uid || t === p.id;
}

export function equipoDeTecnico(p: Personal): EquipoOperacion | null {
  // La fuente canónica es la operaria asignada (campo `operariaNombre`).
  // Fallback: NO adivinar — devolver null si no hay operaria registrada.
  return equipoDeOperaria(p.operariaNombre);
}

/** Dada una orden, devuelve el `uid` canónico del técnico si existe en `personal`. */
function canonicalizarTecnicoDeOrden(orden: OrdenServicio, personal: Personal[]): string | null {
  if (!orden.tecnicoId) return null;
  const encontrado = personal.find((p) => perteneceAlTecnico(orden, p));
  if (!encontrado) return orden.tecnicoId; // No está en plantilla; mantenemos su id tal cual.
  return idOperativoTecnico(encontrado);
}

/** Hora `H:MM` en zona RD. */
function hhmmRD(d: Date): string {
  if (!fechaValida(d)) return '';
  const c = componentesRD(d);
  return `${c.hora}:${String(c.minuto).padStart(2, '0')}`;
}

/* ---------- clasificación de avisos ---------- */

/** Decisiones de oficina basadas en solicitudes persistidas, nunca en la cita o updatedAt. */
export function respuestaPendiente(orden: OrdenServicio, ahora: Date): AvisoOperaciones | null {
  if (estaTerminada(orden)) return null;
  const chequeo = obtenerSugerenciaSoloChequeoPendiente(orden);
  const clientePendiente = orden.presupuestoEstado === 'pendiente_cliente' && !orden.soloChequeo;
  const cambioPendiente = orden.presupuestoEstado === 'cambio_solicitado' && !orden.soloChequeo;
  const precioPendiente = !orden.soloChequeo && typeof orden.precioSugerido === 'number'
    && Number.isFinite(orden.precioSugerido) && orden.estadoAprobacion !== 'aprobado';
  if (!chequeo && !precioPendiente && !clientePendiente && !cambioPendiente) return null;
  // Cada nuevo precio reinicia la espera; no usar fecha de cita ni otra edición de la orden.
  const fechasPrecio = (orden.auditoria ?? [])
    .filter(r => r.accion === 'precio_sugerido')
    .map(r => aDate(r.fecha)).filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime());
  const desde = chequeo ? aDate(chequeo.fechaSugerencia) : fechasPrecio[0];
  const minutos = desde && desde.getTime() <= ahora.getTime()
    ? Math.floor((ahora.getTime() - desde.getTime()) / 60_000) : null;
  const categoria = chequeo ? 'chequeo_por_revisar' : clientePendiente ? 'cliente_por_confirmar' : 'precio_por_revisar';
  return {
    id: `${categoria}-${orden.id}`, ordenId: orden.id, categoria,
    prioridad: -1000000 - (minutos ?? -1),
    clienteNombre: orden.clienteNombre || 'Cliente sin nombre',
    tecnicoNombre: orden.tecnicoNombre, tecnicoId: orden.tecnicoId ?? null,
    equipoTipo: orden.equipoTipo, equipoMarca: orden.equipoMarca,
    equipoOperacion: equipoDeOperaria(orden.operariaNombre),
    razon: chequeo ? 'Oficina: responder sugerencia de solo chequeo'
      : clientePendiente ? 'Operaria: presentar el monto aprobado y registrar la respuesta del cliente'
      : cambioPendiente ? 'Coordinadora: revisar el cambio de monto solicitado por operaria'
      : 'Oficina: revisar diagnóstico y confirmar precio con el cliente',
    metrica: minutos === null ? 'Espera sin fecha registrada' : minutos < 60
      ? `${minutos} min esperando respuesta` : `${Math.floor(minutos / 60)} h ${minutos % 60} min esperando respuesta`,
    importeSugerido: chequeo ? chequeo.montoChequeo : clientePendiente ? orden.precioAprobado : cambioPendiente ? orden.presupuestoMontoPropuesto : orden.precioSugerido,
    detalleTecnico: chequeo ? chequeo.motivo : cambioPendiente ? orden.presupuestoCambioMotivo : orden.notasTecnico,
  };
}

/**
 * Convierte una orden + su progreso en 0..1 aviso. Un mismo problema NO cuenta dos veces:
 * la primera categoría que matchea gana.
 */
export function clasificarOrden(
  orden: OrdenServicio,
  progreso: ProgresoOrden,
  ahora: Date,
): AvisoOperaciones | null {
  if (estaTerminada(orden)) return null;
  const respuesta = respuestaPendiente(orden, ahora);
  if (respuesta) return respuesta;
  const o = orden as OrdenConVisita;
  const tecnicoId = orden.tecnicoId ?? null;
  const base = {
    ordenId: orden.id,
    clienteNombre: orden.clienteNombre || 'Cliente sin nombre',
    tecnicoNombre: orden.tecnicoNombre,
    tecnicoId,
    equipoTipo: orden.equipoTipo,
    equipoMarca: orden.equipoMarca,
    equipoOperacion: equipoDeOperaria(orden.operariaNombre),
  };

  const tipo = tipoDeOrden(orden);
  const atraso = atrasoReal(o, progreso);

  // 1) Atrasada en vivo — solo si hay duración registrada (regla Codex #1).
  if (atraso > 0 && !progreso.standby) {
    return {
      ...base,
      id: `atrasada-${orden.id}`,
      categoria: 'atrasada',
      // Cada minuto adicional aumenta la urgencia, sin saturar a los nueve minutos.
      prioridad: -atraso,
      razon: `Atrasada en ${progreso.etiqueta.toLowerCase()}`,
      metrica: `+${atraso} min`,
    };
  }

  // 2) Garantía abierta.
  if (tipo === 'garantia' && !progreso.completa && !progreso.cancelada) {
    return {
      ...base,
      id: `garantia-${orden.id}`,
      categoria: 'garantia_abierta',
      prioridad: 20,
      razon: 'Garantía abierta sin cerrar',
      metrica: progreso.etiqueta,
    };
  }

  // 3) Stand-by (motivo real lo expone la ficha; acá no lo afirmamos como «pieza»).
  if (progreso.standby) {
    const desde = progreso.desde;
    const horas =
      desde && fechaValida(desde)
        ? Math.max(0, Math.round((ahora.getTime() - desde.getTime()) / 3_600_000))
        : null;
    return {
      ...base,
      id: `standby-${orden.id}`,
      categoria: 'standby_pieza',
      prioridad: 40,
      razon: 'En stand-by',
      metrica: horas != null ? `${horas} h en espera` : 'sin fecha de inicio',
    };
  }

  // 4) Sin salir: orden agendada cuya hora ya pasó y aún no hay marca de visita.
  if (
    progreso.indice === 0 &&
    fechaValida(orden.fechaCita as Date | undefined) &&
    ahora.getTime() >= (orden.fechaCita as Date).getTime() - 15 * 60_000
  ) {
    const diff = Math.round((ahora.getTime() - (orden.fechaCita as Date).getTime()) / 60_000);
    const metrica =
      diff >= 0 ? `cita a las ${hhmmRD(orden.fechaCita as Date)} (+${diff} min)` : `cita en ${-diff} min`;
    return {
      ...base,
      id: `sinsalir-${orden.id}`,
      categoria: 'sin_salir',
      // Conserva esta categoría entre garantía (20) y stand-by (40), sin empatar
      // todas las salidas que llevan más de nueve minutos pendientes.
      prioridad: 21 + 9 / (1 + Math.max(0, diff)),
      razon: 'Sin registrar salida',
      metrica,
    };
  }

  // 5) Por cobrar: trabajo realizado hace > 30 min sin cobrar y sin ser garantía.
  if (progreso.indice === 5 && tipo !== 'garantia' && progreso.desde && fechaValida(progreso.desde)) {
    const minutos = Math.round((ahora.getTime() - progreso.desde.getTime()) / 60_000);
    if (minutos > 30) {
      return {
        ...base,
        id: `cobro-${orden.id}`,
        categoria: 'por_cobrar',
        prioridad: 50,
        razon: 'Terminada sin cobrar',
        metrica: `${minutos} min sin cobrar`,
      };
    }
  }

  return null;
}

/**
 * Pendiente anterior. Si la fecha es inválida o falta → metrica `sin fecha` y la prioridad baja
 * (no NaN). Nunca inventa antigüedad.
 */
export function clasificarPendienteAnterior(orden: OrdenServicio, ahora: Date): AvisoOperaciones {
  const fechaCruda = orden.fechaCita;
  const fecha = fechaValida(fechaCruda as Date | undefined) ? (fechaCruda as Date) : null;
  const dias = fecha && fechaValida(ahora)
    ? Math.max(0, Math.round((inicioDiaRD(ahora).getTime() - inicioDiaRD(fecha).getTime()) / 86_400_000))
    : null;
  const diasClamp = clamp(dias ?? 0, 0, 10);
  return {
    ordenId: orden.id,
    id: `pend-${orden.id}`,
    categoria: 'pendiente_anterior',
    prioridad: dias !== null ? 60 - diasClamp : 70,
    clienteNombre: orden.clienteNombre || 'Cliente sin nombre',
    tecnicoNombre: orden.tecnicoNombre,
    tecnicoId: orden.tecnicoId ?? null,
    equipoTipo: orden.equipoTipo,
    equipoMarca: orden.equipoMarca,
    equipoOperacion: equipoDeOperaria(orden.operariaNombre),
    razon: 'Pendiente de días anteriores',
    metrica: dias !== null ? (dias === 1 ? '1 día pendiente' : `${dias} días pendiente`) : 'sin fecha',
  };
}

export interface AgregadorAvisosEntrada {
  ordenes: OrdenServicio[];
  pendientesAnteriores: OrdenServicio[];
  ahora: Date;
  /** Filtro por equipo A/B. `null`/undefined = todos los equipos. */
  equipo?: EquipoOperacion | null;
  /** Set de ids técnicos canónicos permitidos. Vacío = ningún técnico visible. */
  tecnicoIdsVisibles?: Set<string>;
  /** Lista de personal — para canonicalizar `tecnicoId` de órdenes contra `uid`/`docId`. */
  personal?: Personal[];
  /** Tope por categoría — el UI muestra «ver más» cuando se supera. */
  limiteCategoria?: number;
}

export interface ResultadoAgregadoAvisos {
  /** Avisos truncados por `limiteCategoria`. */
  avisos: AvisoOperaciones[];
  /** Lista completa por categoría (sin tope) — para `ver más`. */
  avisosPorCategoria: Record<CategoriaAviso, AvisoOperaciones[]>;
  conteosCategoria: Record<CategoriaAviso, number>;
  totalesCategoria: Record<CategoriaAviso, number>;
}

function categoriasVacias(): Record<CategoriaAviso, number> {
  return {
    chequeo_por_revisar: 0,
    precio_por_revisar: 0,
    cliente_por_confirmar: 0,
    atrasada: 0,
    garantia_abierta: 0,
    standby_pieza: 0,
    sin_salir: 0,
    por_cobrar: 0,
    pendiente_anterior: 0,
  };
}

function categoriasListaVacia(): Record<CategoriaAviso, AvisoOperaciones[]> {
  return {
    chequeo_por_revisar: [],
    precio_por_revisar: [],
    cliente_por_confirmar: [],
    atrasada: [],
    garantia_abierta: [],
    standby_pieza: [],
    sin_salir: [],
    por_cobrar: [],
    pendiente_anterior: [],
  };
}

/**
 * Clasifica órdenes del día + pendientes anteriores, DEDUPLICA por ordenId antes de contar,
 * ordena por prioridad asc y aplica tope por categoría. El filtro de equipo excluye órdenes
 * con equipo desconocido (regla Codex #2). `tecnicoIdsVisibles` vacío → cero avisos.
 */
export function agregarAvisos(input: AgregadorAvisosEntrada): ResultadoAgregadoAvisos {
  const { ordenes, pendientesAnteriores, ahora, equipo, tecnicoIdsVisibles, personal, limiteCategoria } = input;
  const limite = typeof limiteCategoria === 'number' && limiteCategoria > 0 ? limiteCategoria : 4;

  // Set vacío explícito = «ningún técnico visible».
  const filtroVacio = tecnicoIdsVisibles !== undefined && tecnicoIdsVisibles.size === 0;
  if (filtroVacio) {
    return {
      avisos: [],
      avisosPorCategoria: categoriasListaVacia(),
      conteosCategoria: categoriasVacias(),
      totalesCategoria: categoriasVacias(),
    };
  }

  const canonId = (orden: OrdenServicio): string | null =>
    personal ? canonicalizarTecnicoDeOrden(orden, personal) : orden.tecnicoId ?? null;

  const pasaFiltro = (equipoAviso: EquipoOperacion | null, tecnicoCanon: string | null): boolean => {
    // Fix Codex #2: con equipo seleccionado, excluimos los desconocidos (null).
    if (equipo) {
      if (!equipoAviso) return false;
      if (equipoAviso !== equipo) return false;
    }
    if (tecnicoIdsVisibles && tecnicoIdsVisibles.size > 0) {
      if (!tecnicoCanon) return false;
      return tecnicoIdsVisibles.has(tecnicoCanon);
    }
    return true;
  };

  // Paso 1: clasificar y DEDUP por ordenId. Antes de contar nada.
  const porOrden = new Map<string, AvisoOperaciones>();

  for (const o of ordenes) {
    if (estaTerminada(o)) continue;
    const prog = progresoOperativo(o as OrdenConVisita, ahora);
    const aviso = clasificarOrden(o, prog, ahora);
    if (!aviso) continue;
    const canon = canonId(o);
    if (!pasaFiltro(aviso.equipoOperacion, canon)) continue;
    const existente = porOrden.get(aviso.ordenId);
    if (!existente || aviso.prioridad < existente.prioridad) porOrden.set(aviso.ordenId, aviso);
  }

  for (const o of pendientesAnteriores) {
    if (estaTerminada(o)) continue;
    const aviso = respuestaPendiente(o, ahora) ?? clasificarPendienteAnterior(o, ahora);
    const canon = canonId(o);
    if (!pasaFiltro(aviso.equipoOperacion, canon)) continue;
    if (!porOrden.has(aviso.ordenId)) porOrden.set(aviso.ordenId, aviso);
  }

  // Paso 2: contar totales a partir de la lista deduplicada.
  const totalesCategoria = categoriasVacias();
  const avisosPorCategoria = categoriasListaVacia();
  const dedup = [...porOrden.values()].sort(
    (a, b) => a.prioridad - b.prioridad || a.ordenId.localeCompare(b.ordenId),
  );
  for (const a of dedup) {
    totalesCategoria[a.categoria] += 1;
    avisosPorCategoria[a.categoria].push(a);
  }

  // Paso 3: aplicar tope por categoría.
  const conteosCategoria = categoriasVacias();
  const avisos: AvisoOperaciones[] = [];
  for (const a of dedup) {
    if (conteosCategoria[a.categoria] >= limite) continue;
    conteosCategoria[a.categoria] += 1;
    avisos.push(a);
  }

  return { avisos, avisosPorCategoria, conteosCategoria, totalesCategoria };
}

/* ---------- resumen y progreso del día ---------- */

export interface ResumenEntrada {
  ordenes: OrdenServicio[];
  personal: Personal[];
  ahora: Date;
  equipo?: EquipoOperacion | null;
  /** Set de ids técnicos canónicos visibles. Vacío = ningún técnico. */
  tecnicoIdsVisibles?: Set<string>;
}

/** Lista de técnicos considerados «visibles» para un filtro. */
export function tecnicosParaResumen(
  personal: Personal[],
  equipo?: EquipoOperacion | null,
  tecnicoIdsVisibles?: Set<string>,
): Personal[] {
  if (tecnicoIdsVisibles !== undefined && tecnicoIdsVisibles.size === 0) return [];
  const activos = tecnicosActivos(personal);
  const porEquipo = equipo
    ? activos.filter((p) => {
        const eq = equipoDeTecnico(p);
        return eq === equipo;
      })
    : activos;
  if (tecnicoIdsVisibles && tecnicoIdsVisibles.size > 0) {
    return porEquipo.filter((p) => tecnicoIdsVisibles.has(idOperativoTecnico(p)));
  }
  return porEquipo;
}

const RESUMEN_VACIO: ResumenOperaciones = {
  tecnicosActivos: 0,
  enCamino: 0,
  enSitio: 0,
  libres: 0,
  cerradas: 0,
  pendientesCierre: 0,
  atrasadas: 0,
  mayorAtrasoMin: 0,
  standby: 0,
  garantiasAbiertas: 0,
  totalDelDia: 0,
};

export function resumirDia(input: ResumenEntrada): ResumenOperaciones {
  const { ordenes, personal, ahora, equipo, tecnicoIdsVisibles } = input;

  // Set vacío explícito = «ningún técnico visible».
  if (tecnicoIdsVisibles !== undefined && tecnicoIdsVisibles.size === 0) return { ...RESUMEN_VACIO };

  // Técnicos ACTIVOS canónicos. Sirven para `tecnicosActivos`, `libres`, y para
  // determinar quién cuenta en `enCamino/enSitio`.
  const activos = tecnicosParaResumen(personal, equipo, tecnicoIdsVisibles);
  const idsCanon = new Set(activos.map(idOperativoTecnico));

  // Filtro de órdenes:
  //  - Elimina `eliminada`.
  //  - Equipo si está pedido (siempre aplica).
  //  - Técnico SOLO cuando `tecnicoIdsVisibles` está explícitamente provisto.
  //    Si no está provisto, cuenta TODAS las órdenes (incluidas las sin técnico
  //    asignado y las de técnicos inactivos — `totalDelDia` refleja el día real).
  const ordenesFiltradas = ordenes.filter((o) => {
    if (o.eliminada) return false;
    if (equipo) {
      const eq = equipoDeOperaria(o.operariaNombre);
      if (!eq || eq !== equipo) return false;
    }
    if (tecnicoIdsVisibles !== undefined) {
      const canon = canonicalizarTecnicoDeOrden(o, personal);
      if (!canon) return false;
      return tecnicoIdsVisibles.has(canon);
    }
    return true;
  });

  let cerradas = 0;
  let atrasadas = 0;
  let standby = 0;
  let garantias = 0;
  let mayorAtraso = 0;
  const enCaminoTec = new Set<string>();
  const enSitioTec = new Set<string>();
  const ocupadoTec = new Set<string>();

  for (const o of ordenesFiltradas) {
    if (o.fase === 'cancelado' || o.estado === 'cancelado') continue;
    if (o.fase === 'cerrado' || o.estado === 'cerrado') {
      cerradas += 1;
      continue;
    }
    const tipo = tipoDeOrden(o);
    const prog = progresoOperativo(o as OrdenConVisita, ahora);
    if (prog.atrasoMin > 0 && !prog.standby) {
      atrasadas += 1;
      if (prog.atrasoMin > mayorAtraso) mayorAtraso = prog.atrasoMin;
    }
    if (prog.standby) standby += 1;
    if (tipo === 'garantia' && !prog.completa) garantias += 1;

    // enCamino / enSitio / ocupado: contamos solo técnicos ACTIVOS canónicos
    // para no inflar con órdenes de técnicos de baja o sin asignar.
    const canon = canonicalizarTecnicoDeOrden(o, personal);
    if (canon && idsCanon.has(canon)) {
      if (prog.indice === 1) enCaminoTec.add(canon);
      if (prog.indice === 2) enSitioTec.add(canon);
      if (prog.indice >= 1 && prog.indice <= 4 && !prog.standby) ocupadoTec.add(canon);
    }
  }

  const totalDelDia = ordenesFiltradas.filter((o) => o.fase !== 'cancelado' && o.estado !== 'cancelado').length;
  const pendientesCierre = Math.max(0, totalDelDia - cerradas);
  const tecnicosActivosCount = idsCanon.size;
  const libres = Math.max(0, tecnicosActivosCount - ocupadoTec.size);

  return {
    tecnicosActivos: tecnicosActivosCount,
    enCamino: enCaminoTec.size,
    enSitio: enSitioTec.size,
    libres,
    cerradas,
    pendientesCierre,
    atrasadas,
    mayorAtrasoMin: mayorAtraso,
    standby,
    garantiasAbiertas: garantias,
    totalDelDia,
  };
}

export function progresoDelDia(ordenes: OrdenServicio[], ahora: Date): ProgresoDelDia {
  const conteos: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let cerradas = 0;
  let standby = 0;
  let total = 0;
  for (const o of ordenes) {
    if (o.eliminada || o.fase === 'cancelado' || o.estado === 'cancelado') continue;
    total += 1;
    if (o.fase === 'cerrado' || o.estado === 'cerrado') {
      cerradas += 1;
      conteos[6] += 1;
      continue;
    }
    const prog = progresoOperativo(o as OrdenConVisita, ahora);
    if (prog.standby) standby += 1;
    else if (prog.indice >= 0 && prog.indice <= 6) conteos[prog.indice] += 1;
  }
  return { conteos, cerradas, standby, total };
}

/* ---------- jornada / estado por técnico ---------- */

export interface CitaDelTecnico {
  orden: OrdenServicio;
  progreso: ProgresoOrden;
}

/** Devuelve las citas del día de un técnico ordenadas cronológicamente. */
export function jornadaTecnico(
  tecnico: Personal,
  ordenes: OrdenServicio[],
  ahora: Date,
): CitaDelTecnico[] {
  const propias = ordenes.filter(
    (o) => perteneceAlTecnico(o, tecnico) && !o.eliminada && o.fase !== 'cancelado' && o.estado !== 'cancelado',
  );
  const con = propias.map((o) => ({
    orden: o,
    progreso: progresoOperativo(o as OrdenConVisita, ahora),
  }));
  con.sort((a, b) => {
    const fa = fechaValida(a.orden.fechaCita) ? a.orden.fechaCita.getTime() : Infinity;
    const fb = fechaValida(b.orden.fechaCita) ? b.orden.fechaCita.getTime() : Infinity;
    return fa - fb || a.orden.id.localeCompare(b.orden.id);
  });
  return con;
}

export interface OpcionesEstadoTecnico {
  /** `true` si la fecha mostrada por la UI es hoy en RD. Afecta frases «próxima cita». */
  esDiaDeHoyRD?: boolean;
}

export function estadoActualTecnico(
  tecnico: Personal,
  jornada: CitaDelTecnico[],
  ahora: Date,
  opciones: OpcionesEstadoTecnico = {},
): EstadoTecnicoActual {
  // Fix Codex #4: solo `activo === false` cuenta como baja; undefined NO.
  if (tecnico.activo === false) {
    return { etiqueta: 'Sin disponibilidad', tono: 'ausente' };
  }
  const activa = jornada.find((j) => {
    const p = j.progreso;
    return p.indice >= 1 && p.indice <= 5 && !p.standby;
  });
  if (activa) {
    return {
      etiqueta: activa.progreso.etiqueta,
      tono: 'activo',
      ordenActual: activa.orden,
      progresoActual: activa.progreso,
    };
  }
  const enStandby = jornada.find((j) => j.progreso.standby);
  if (enStandby) {
    return {
      etiqueta: 'Stand-by',
      tono: 'standby',
      ordenActual: enStandby.orden,
      progresoActual: enStandby.progreso,
    };
  }
  const todas = jornada.length;
  const cerradas = jornada.filter((j) => j.progreso.completa).length;
  if (todas > 0 && cerradas === todas) {
    return { etiqueta: 'Terminó el día', tono: 'cerrado' };
  }
  if (opciones.esDiaDeHoyRD) {
    const proxima = jornada.find(
      (j) => j.orden.fechaCita && fechaValida(j.orden.fechaCita) && j.orden.fechaCita.getTime() > ahora.getTime(),
    );
    if (proxima && todas > 0) {
      const minutos = Math.max(0, Math.round((proxima.orden.fechaCita!.getTime() - ahora.getTime()) / 60_000));
      return { etiqueta: `Próxima cita en ${minutos} min`, tono: 'proximo' };
    }
  }
  if (todas === 0) {
    return { etiqueta: 'Sin citas asignadas', tono: 'ocioso' };
  }
  return { etiqueta: 'Sin actividad registrada', tono: 'ocioso' };
}

/* ---------- técnicos visibles tras filtro ---------- */

export function tecnicosVisibles(
  personal: Personal[],
  equipo: EquipoOperacion | null | undefined,
): Personal[] {
  const base = tecnicosActivos(personal);
  if (!equipo) return base;
  return base.filter((p) => equipoDeTecnico(p) === equipo);
}

export const _internal = { clamp, hhmmRD, atrasoReal, duracionRegistrada, canonicalizarTecnicoDeOrden };
