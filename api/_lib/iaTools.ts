import { getAdminFirestore } from './firebaseAdmin.js';
import type { Firestore, Query, DocumentData, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';

/**
 * Módulo de tools READ-only que Claude puede invocar para consultar Firestore.
 * Todo lo de aquí se ejecuta dentro de la serverless function /api/ai/chat.
 * NINGÚN tool escribe a Firestore (reviewer lo verifica).
 */

export type Rol = 'administrador' | 'coordinadora' | 'operaria' | 'secretaria';

/**
 * Sprint 1 introdujo iaHabilitada como campo opcional con defaults por rol SOLO
 * en creaciones nuevas. Usuarios existentes no tienen el campo → se trata como
 * default por rol (admin/coord ON, resto OFF). Esta función es duplicada de
 * src/utils/permisos.ts porque api/_lib no puede importar de src/.
 */
export function iaHabilitadaDefaultPorRol(rol: string): boolean {
  return rol === 'administrador' || rol === 'coordinadora';
}

export function tieneAccesoAsistenteIA(perfil: { rol?: string; iaHabilitada?: boolean } | null | undefined): boolean {
  if (!perfil?.rol) return false;
  if (perfil.iaHabilitada === true) return true;
  if (perfil.iaHabilitada === undefined) return iaHabilitadaDefaultPorRol(perfil.rol);
  return false;
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  rolesPermitidos: Rol[];
  ejecutar: (input: any, contexto: { rol: Rol; uid: string }) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Helpers de fecha RD (GMT-4 fijo, sin DST)
// ---------------------------------------------------------------------------

const RD_OFFSET_MS = 4 * 60 * 60 * 1000; // RD = UTC-4

/**
 * Convierte un Date a un ISO parcial "YYYY-MM-DD HH:mm" en hora local RD.
 * Usado por los tools al devolver datos al LLM (en lenguaje natural).
 */
function formatHoraRD(fecha: Date): string {
  // Ajustar a RD: restar 4h al UTC
  const rdMs = fecha.getTime() - RD_OFFSET_MS;
  const rd = new Date(rdMs);
  const hh = String(rd.getUTCHours()).padStart(2, '0');
  const mm = String(rd.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatFechaRD(fecha: Date): string {
  const rdMs = fecha.getTime() - RD_OFFSET_MS;
  const rd = new Date(rdMs);
  const y = rd.getUTCFullYear();
  const m = String(rd.getUTCMonth() + 1).padStart(2, '0');
  const d = String(rd.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parsea "YYYY-MM-DD" como hora local RD (GMT-4), devolviendo el rango
 * [00:00:00, 23:59:59.999] de ese día en UTC.
 * No depende de Intl ni zonas horarias del runtime.
 */
export function parseFechaRD(fecha: string): { inicio: Date; fin: Date } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  if (!m) {
    throw new Error(`Fecha inválida '${fecha}'. Formato esperado: YYYY-MM-DD`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // 00:00 RD = 04:00 UTC; 23:59:59.999 RD = 03:59:59.999 UTC del día siguiente
  const inicio = new Date(Date.UTC(y, mo - 1, d, 4, 0, 0, 0));
  const fin = new Date(Date.UTC(y, mo - 1, d, 4, 0, 0, 0) + (24 * 60 * 60 * 1000 - 1));
  return { inicio, fin };
}

// ---------------------------------------------------------------------------
// Helpers de quincena (duplicados de src/utils/comisiones.ts — no podemos
// importar de `src/` desde `api/_lib/`).
// ---------------------------------------------------------------------------

/**
 * Calcula a qué quincena pertenece una fecha dada (usando hora local RD):
 *  - Día 1-14: Q1 de ese mes (paga el 15).
 *  - Día 15-29: Q2 de ese mes (paga el 30).
 *  - Día 30-31: Q1 del mes siguiente.
 */
function calcularQuincenaActual(fecha: Date): { quincena: 1 | 2; mes: number; anio: number } {
  // Interpretar la fecha en hora RD
  const rdMs = fecha.getTime() - RD_OFFSET_MS;
  const rd = new Date(rdMs);
  const d = rd.getUTCDate();
  let year = rd.getUTCFullYear();
  let month = rd.getUTCMonth() + 1;
  let q: 1 | 2;
  if (d >= 1 && d <= 14) {
    q = 1;
  } else if (d >= 15 && d <= 29) {
    q = 2;
  } else {
    // 30 o 31 → Q1 del mes siguiente
    q = 1;
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return { quincena: q, mes: month, anio: year };
}

/**
 * Devuelve el rango [inicio, fin] en UTC para una quincena dada, interpretando
 * límites como hora local RD (GMT-4).
 * - Q1 cubre días 30-31 del mes anterior + 1-14 del mes de la quincena.
 * - Q2 cubre días 15-29 del mes de la quincena.
 */
function rangoQuincena(q: 1 | 2, mes: number, anio: number): { inicio: Date; fin: Date } {
  if (q === 1) {
    // Inicio: día 30 del mes anterior, 00:00 RD = 04:00 UTC
    const inicioMes = mes === 1 ? 12 : mes - 1;
    const inicioAnio = mes === 1 ? anio - 1 : anio;
    const inicio = new Date(Date.UTC(inicioAnio, inicioMes - 1, 30, 4, 0, 0, 0));
    // Fin: día 14 del mes, 23:59:59.999 RD = 03:59:59.999 UTC del 15
    const fin = new Date(Date.UTC(anio, mes - 1, 14, 4, 0, 0, 0) + (24 * 60 * 60 * 1000 - 1));
    return { inicio, fin };
  }
  // Q2: día 15 al 29 (o al último día del mes si es febrero no bisiesto, 28
  // días). Usar `new Date(Date.UTC(anio, mes, 0)).getUTCDate()` aprovechando
  // que día=0 del mes siguiente retrocede al último día del mes actual. Sin
  // esto, feb 2027 (28 días) construye UTC(2027,1,29) y Date hace rollover
  // a 1 de marzo, incluyendo un día extra en el rango. Fix #77.
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const diaFin = Math.min(29, ultimoDia);
  const inicio = new Date(Date.UTC(anio, mes - 1, 15, 4, 0, 0, 0));
  const fin = new Date(Date.UTC(anio, mes - 1, diaFin, 4, 0, 0, 0) + (24 * 60 * 60 * 1000 - 1));
  return { inicio, fin };
}

/** Quincena actual basada en el reloj del servidor, convertido a hora RD. */
function quincenaActualAhora(): { inicio: Date; fin: Date } {
  const { quincena, mes, anio } = calcularQuincenaActual(new Date());
  return rangoQuincena(quincena, mes, anio);
}

// ---------------------------------------------------------------------------
// Contexto fecha/hora RD — usado por el system prompt del Asistente IA para
// que el modelo sepa qué día es "hoy", qué es "esta semana", etc.
// ---------------------------------------------------------------------------

const DIAS_SEMANA_ES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

const MESES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Último día del mes dado (1-12) en el año dado. Soporta años bisiestos. */
function ultimoDiaDelMes(mes: number, anio: number): number {
  // Truco estándar: el día 0 del mes siguiente = último día del mes actual.
  // Date.UTC con día=0 del mes (mes-1+1=mes) retrocede al último día.
  const d = new Date(Date.UTC(anio, mes, 0));
  return d.getUTCDate();
}

/** Formato YYYY-MM-DD a partir de componentes year/month/day (1-indexado). */
function ymd(anio: number, mes: number, dia: number): string {
  const y = String(anio);
  const m = String(mes).padStart(2, '0');
  const d = String(dia).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Fecha/hora ISO con offset -04:00 (RD, sin DST).
 * No usa Intl; construye el string manualmente a partir del Date UTC.
 */
function isoConOffsetRD(fecha: Date): string {
  const rdMs = fecha.getTime() - RD_OFFSET_MS;
  const rd = new Date(rdMs);
  const y = rd.getUTCFullYear();
  const mo = String(rd.getUTCMonth() + 1).padStart(2, '0');
  const d = String(rd.getUTCDate()).padStart(2, '0');
  const hh = String(rd.getUTCHours()).padStart(2, '0');
  const mm = String(rd.getUTCMinutes()).padStart(2, '0');
  const ss = String(rd.getUTCSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d}T${hh}:${mm}:${ss}-04:00`;
}

/** Devuelve los componentes (año/mes/día/dowSunday0) en hora RD del Date dado. */
function componentesRD(fecha: Date): { anio: number; mes: number; dia: number; dow: number } {
  const rdMs = fecha.getTime() - RD_OFFSET_MS;
  const rd = new Date(rdMs);
  return {
    anio: rd.getUTCFullYear(),
    mes: rd.getUTCMonth() + 1,
    dia: rd.getUTCDate(),
    dow: rd.getUTCDay(),
  };
}

/**
 * Contexto completo de fecha/hora en RD (GMT-4 fijo). Se inyecta como bloque
 * dinámico en el system prompt del Asistente IA para que el modelo sepa qué
 * día/semana/mes/quincena corresponde a "hoy".
 *
 * Reglas:
 * - Semana: lunes a domingo (estándar ES). Lunes = inicio.
 * - Quincena: Q1 = día 30 del mes anterior → día 14 del mes actual (paga 15).
 *             Q2 = día 15 → día 29 del mes actual (paga día 30, o último día
 *             del mes si el mes tiene menos de 30 días).
 * - Si hoy es día 30 o 31, ya estamos en Q1 del mes SIGUIENTE.
 */
export function contextoFechaRD(): {
  fechaHoraIso: string;
  diaSemanaEspanol: string;
  fechaLargaEspanol: string;
  hoy: string;
  ayer: string;
  manana: string;
  semanaActual: { inicio: string; fin: string };
  mesActual: { inicio: string; fin: string };
  quincenaActual: {
    etiqueta: string;
    inicio: string;
    fin: string;
    diaPago: string;
  };
} {
  const ahora = new Date();
  const { anio, mes, dia, dow } = componentesRD(ahora);

  // Hoy / ayer / mañana — se calculan sumando ms a partir de medianoche RD
  // (04:00 UTC del día correspondiente).
  const medianocheHoyUTC = Date.UTC(anio, mes - 1, dia, 4, 0, 0, 0);
  const hoyStr = ymd(anio, mes, dia);
  const ayerDate = new Date(medianocheHoyUTC - 24 * 60 * 60 * 1000);
  const mananaDate = new Date(medianocheHoyUTC + 24 * 60 * 60 * 1000);
  const ayerC = componentesRD(ayerDate);
  const mananaC = componentesRD(mananaDate);

  // Semana lunes→domingo. dow: 0=dom,1=lun,...6=sab.
  // Offset desde el lunes: lun=0, mar=1, ..., dom=6.
  const offsetLunes = (dow + 6) % 7;
  const lunesUTC = medianocheHoyUTC - offsetLunes * 24 * 60 * 60 * 1000;
  const domingoUTC = lunesUTC + 6 * 24 * 60 * 60 * 1000;
  const lunesC = componentesRD(new Date(lunesUTC));
  const domingoC = componentesRD(new Date(domingoUTC));

  // Mes actual: día 1 → último día del mes.
  const ultimoDia = ultimoDiaDelMes(mes, anio);

  // Quincena actual: reutiliza calcularQuincenaActual() existente.
  // Para el texto del system prompt computamos inicio/fin localmente (no via
  // rangoQuincena) porque rangoQuincena asume Q2 fin = día 29 y para febrero
  // non-bisiesto eso overflow a marzo 1 al construir el UTC Date. Acá queremos
  // strings YYYY-MM-DD limpios que matcheen el spec (ej feb no bisiesto:
  // "Q2 febrero (15 → 28 feb)").
  const qActual = calcularQuincenaActual(ahora);
  let qInicioStr: string;
  let qFinStr: string;
  let diaPagoStr: string;
  if (qActual.quincena === 1) {
    // Q1: día 30 del mes anterior → día 14 del mes actual de la quincena.
    const mesPrev = qActual.mes === 1 ? 12 : qActual.mes - 1;
    const anioPrev = qActual.mes === 1 ? qActual.anio - 1 : qActual.anio;
    qInicioStr = ymd(anioPrev, mesPrev, 30);
    qFinStr = ymd(qActual.anio, qActual.mes, 14);
    diaPagoStr = ymd(qActual.anio, qActual.mes, 15);
  } else {
    // Q2: día 15 → día 29 (o último día si el mes tiene < 29, caso feb no
    // bisiesto: termina día 28). diaPago = día 30 o último día si el mes
    // tiene < 30 (caso único: febrero, 28 o 29).
    const ultDia = ultimoDiaDelMes(qActual.mes, qActual.anio);
    qInicioStr = ymd(qActual.anio, qActual.mes, 15);
    qFinStr = ymd(qActual.anio, qActual.mes, Math.min(29, ultDia));
    diaPagoStr = ymd(qActual.anio, qActual.mes, Math.min(30, ultDia));
  }

  const etiqueta = `Q${qActual.quincena} ${MESES_ES[qActual.mes - 1]} ${qActual.anio}`;
  const fechaLarga = `${dia} de ${MESES_ES[mes - 1]} de ${anio}`;

  return {
    fechaHoraIso: isoConOffsetRD(ahora),
    diaSemanaEspanol: DIAS_SEMANA_ES[dow],
    fechaLargaEspanol: fechaLarga,
    hoy: hoyStr,
    ayer: ymd(ayerC.anio, ayerC.mes, ayerC.dia),
    manana: ymd(mananaC.anio, mananaC.mes, mananaC.dia),
    semanaActual: {
      inicio: ymd(lunesC.anio, lunesC.mes, lunesC.dia),
      fin: ymd(domingoC.anio, domingoC.mes, domingoC.dia),
    },
    mesActual: {
      inicio: ymd(anio, mes, 1),
      fin: ymd(anio, mes, ultimoDia),
    },
    quincenaActual: {
      etiqueta,
      inicio: qInicioStr,
      fin: qFinStr,
      diaPago: diaPagoStr,
    },
  };
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  // Firestore Admin Timestamp
  const ts = val as Partial<AdminTimestamp> & { toDate?: () => Date };
  if (typeof ts.toDate === 'function') {
    try { return ts.toDate(); } catch { /* noop */ }
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function redondear(n: number, decimales = 2): number {
  const factor = Math.pow(10, decimales);
  return Math.round(n * factor) / factor;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function incluyeBusqueda(campo: unknown, busqueda: string): boolean {
  if (typeof campo !== 'string') return false;
  return normalizar(campo).includes(normalizar(busqueda));
}

/**
 * Duplicado de src/services/clientes.service.ts (api/_lib no puede importar de src/).
 * Normaliza teléfono RD: quita no-dígitos, drop leading '1' si 11 dígitos,
 * toma últimos 10.
 */
function normalizarTelefono(tel: string): string {
  const soloDigitos = tel.replace(/\D/g, '');
  if (soloDigitos.length === 11 && soloDigitos.startsWith('1')) {
    return soloDigitos.substring(1);
  }
  return soloDigitos.slice(-10);
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

interface QueryOrdenesInput {
  fase?: string;
  tecnicoId?: string;
  clienteNombre?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  limite?: number;
}

const FASES_VALIDAS = new Set([
  'nuevo_lead',
  'en_gestion',
  'en_diagnostico',
  'en_cotizacion',
  'aprobado',
  'agendado',
  'trabajo_realizado',
  'cerrado',
  'cancelado',
]);

interface PostFiltrosOrdenes {
  clienteNombre?: string;
  fase?: string;
  tecnicoId?: string;
}

/**
 * Construye la query base de órdenes aplicando filtros de rol + input.
 * Aplica siempre `eliminada !== true`. Para secretaria excluye fases terminales.
 * No aplica `limit` — el caller decide (el count usa aggregate).
 *
 * IMPORTANTE (Firestore compound indexes): combinar `where('fase','==')` o
 * `where('tecnicoId','==')` con range filter sobre `fechaCita` requiere índice
 * compuesto (ver commit e776a8f en CLAUDE.md). Cuando hay rango de fechas,
 * movemos `fase` y `tecnicoId` a post-filter in-memory. Si NO hay rango,
 * se pueden aplicar server-side (single-field index, no requiere composite).
 */
function construirQueryOrdenes(
  db: Firestore,
  input: QueryOrdenesInput,
  _rol: Rol,
): { query: Query<DocumentData>; postFiltros: PostFiltrosOrdenes } {
  // Validación estricta de fase: si viene presente e inválida, error al LLM.
  if (input.fase !== undefined && input.fase !== null && input.fase !== '') {
    if (typeof input.fase !== 'string' || !FASES_VALIDAS.has(input.fase)) {
      throw new Error(
        `Fase inválida '${input.fase}'. Válidas: ${[...FASES_VALIDAS].join(', ')}`,
      );
    }
  }

  let q: Query<DocumentData> = db.collection('ordenes_servicio');

  const hayRangoFechas = Boolean(input.fechaDesde) || Boolean(input.fechaHasta);

  if (input.fechaDesde) {
    const { inicio } = parseFechaRD(input.fechaDesde);
    q = q.where('fechaCita', '>=', inicio);
  }
  if (input.fechaHasta) {
    const { fin } = parseFechaRD(input.fechaHasta);
    q = q.where('fechaCita', '<=', fin);
  }

  const postFiltros: PostFiltrosOrdenes = {};

  if (input.fase && typeof input.fase === 'string' && FASES_VALIDAS.has(input.fase)) {
    if (hayRangoFechas) {
      postFiltros.fase = input.fase;
    } else {
      q = q.where('fase', '==', input.fase);
    }
  }
  if (input.tecnicoId && typeof input.tecnicoId === 'string') {
    if (hayRangoFechas) {
      postFiltros.tecnicoId = input.tecnicoId;
    } else {
      q = q.where('tecnicoId', '==', input.tecnicoId);
    }
  }

  // clienteNombre requiere substring match → se resuelve client-side después
  // del fetch para evitar compound-index sobre varios campos.
  if (input.clienteNombre && typeof input.clienteNombre === 'string') {
    postFiltros.clienteNombre = input.clienteNombre;
  }

  return { query: q, postFiltros };
}

/** Filtra docs por eliminada/secretaria/clienteNombre/fase/tecnicoId (post-query in-memory). */
function aplicarFiltrosPost(
  docs: Array<{ id: string; data: DocumentData }>,
  rol: Rol,
  postFiltros: PostFiltrosOrdenes,
): Array<{ id: string; data: DocumentData }> {
  const FASES_TERMINALES = new Set(['cancelado', 'cerrado']);
  return docs.filter(({ data }) => {
    if (data.eliminada === true) return false;
    if (rol === 'secretaria' && typeof data.fase === 'string' && FASES_TERMINALES.has(data.fase)) {
      return false;
    }
    if (postFiltros.fase && data.fase !== postFiltros.fase) return false;
    if (postFiltros.tecnicoId && data.tecnicoId !== postFiltros.tecnicoId) return false;
    if (postFiltros.clienteNombre && !incluyeBusqueda(data.clienteNombre, postFiltros.clienteNombre)) {
      return false;
    }
    return true;
  });
}

function mapearOrdenResumen(data: DocumentData): Record<string, unknown> {
  const fechaCita = toDate(data.fechaCita);
  return {
    numero: data.numero || '',
    clienteNombre: data.clienteNombre || '',
    equipoTipo: data.equipoTipo || '',
    falla: data.descripcionFalla || '',
    fase: data.fase || '',
    fechaCita: fechaCita ? formatFechaRD(fechaCita) : null,
    hora: fechaCita ? formatHoraRD(fechaCita) : null,
    tecnicoNombre: data.tecnicoNombre || '',
    montoAprobado: typeof data.precioAprobado === 'number' ? data.precioAprobado : null,
  };
}

const CAMPOS_FINANCIEROS_SENSIBLES = new Set([
  'precioSugerido',
  'precioAprobado',
  'precioFinal',
  'precioChequeo',
  'montoPagado',
  'pagos',
  'costoPiezas',
]);

/** Remueve campos financieros + `comisionTecnico*` para el rol secretaria. */
function omitirCamposSensiblesSecretaria(data: DocumentData): DocumentData {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(data)) {
    if (CAMPOS_FINANCIEROS_SENSIBLES.has(k)) continue;
    if (k.startsWith('comisionTecnico')) continue;
    out[k] = v;
  }
  return out;
}

/** Convierte recursivamente Timestamps a Date para serialización JSON estable. */
function serializarTimestamps(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) return val.map(serializarTimestamps);
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown> & { toDate?: () => Date };
    if (typeof obj.toDate === 'function') {
      try { return obj.toDate().toISOString(); } catch { /* noop */ }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = serializarTimestamps(v);
    }
    return out;
  }
  return val;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

const TOOL_QUERY_ORDENES: ToolDef = {
  name: 'query_ordenes',
  description:
    "Busca órdenes de servicio por fase (nuevo_lead, en_gestion, agendado, en_diagnostico, en_cotizacion, aprobado, trabajo_realizado, cerrado, cancelado), técnico, nombre de cliente o rango de fechas (filtra sobre fechaCita). Retorna hasta 'limite' resultados (default 20, max 50).",
  input_schema: {
    type: 'object',
    properties: {
      fase: { type: 'string', description: 'Una de las fases válidas del sistema.' },
      tecnicoId: { type: 'string', description: 'ID del técnico asignado.' },
      clienteNombre: { type: 'string', description: 'Texto a buscar dentro del nombre del cliente (match parcial).' },
      fechaDesde: { type: 'string', description: 'Fecha inicio formato YYYY-MM-DD (hora local RD). Filtra fechaCita.' },
      fechaHasta: { type: 'string', description: 'Fecha fin formato YYYY-MM-DD (hora local RD). Filtra fechaCita.' },
      limite: { type: 'number', description: 'Cantidad máxima de resultados. Default 20, máximo 50.' },
    },
  },
  rolesPermitidos: ['administrador', 'coordinadora', 'operaria', 'secretaria'],
  ejecutar: async (input: QueryOrdenesInput, { rol }) => {
    const db = getAdminFirestore();
    const { query, postFiltros } = construirQueryOrdenes(db, input || {}, rol);
    const limite = Math.min(Math.max(typeof input?.limite === 'number' ? input.limite : 20, 1), 50);
    // Fetch con un margen para que el filtro post no deje lista vacía por capacidad
    const snap = await query.limit(limite * 3).get();
    const todos = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    const filtrados = aplicarFiltrosPost(todos, rol, postFiltros);
    const resultado = filtrados.slice(0, limite).map(({ data }) => mapearOrdenResumen(data));
    return { ordenes: resultado, cantidad: resultado.length };
  },
};

const TOOL_COUNT_ORDENES: ToolDef = {
  name: 'count_ordenes',
  description:
    "Cuenta cuántas órdenes coinciden con los filtros dados. Más rápido que query_ordenes cuando solo querés saber el total.",
  input_schema: {
    type: 'object',
    properties: {
      fase: { type: 'string' },
      tecnicoId: { type: 'string' },
      clienteNombre: { type: 'string' },
      fechaDesde: { type: 'string', description: 'YYYY-MM-DD, filtra fechaCita.' },
      fechaHasta: { type: 'string', description: 'YYYY-MM-DD, filtra fechaCita.' },
    },
  },
  rolesPermitidos: ['administrador', 'coordinadora', 'operaria', 'secretaria'],
  ejecutar: async (input: QueryOrdenesInput, { rol }) => {
    const db = getAdminFirestore();
    const { query, postFiltros } = construirQueryOrdenes(db, input || {}, rol);
    // No podemos usar .count() aggregate cuando hay filtros post-query
    // (clienteNombre, eliminada, rol=secretaria) porque Firestore no conoce esos filtros.
    // Bajamos docs y filtramos en memoria.
    const snap = await query.get();
    const todos = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    const filtrados = aplicarFiltrosPost(todos, rol, postFiltros);
    return { total: filtrados.length };
  },
};

const TOOL_GET_ORDEN: ToolDef = {
  name: 'get_orden',
  description:
    "Trae el detalle completo de una orden por su número (ej: 'OS-0035'). Para secretaria se ocultan los campos financieros (precios, pagos, comisiones).",
  input_schema: {
    type: 'object',
    properties: {
      numero: { type: 'string', description: 'Número de orden, ej: OS-0035.' },
    },
    required: ['numero'],
  },
  rolesPermitidos: ['administrador', 'coordinadora', 'operaria', 'secretaria'],
  ejecutar: async (input: { numero: string }, { rol }) => {
    if (!input?.numero || typeof input.numero !== 'string') {
      throw new Error("Falta 'numero' (string)");
    }
    const db = getAdminFirestore();
    const snap = await db
      .collection('ordenes_servicio')
      .where('numero', '==', input.numero.trim())
      .limit(1)
      .get();
    if (snap.empty) {
      return { encontrada: false, numero: input.numero };
    }
    const doc = snap.docs[0];
    const data = doc.data();
    if (data.eliminada === true) {
      return { encontrada: false, numero: input.numero, razon: 'orden eliminada' };
    }
    const base = rol === 'secretaria' ? omitirCamposSensiblesSecretaria(data) : data;
    const serializado = serializarTimestamps(base) as DocumentData;
    return { encontrada: true, ...serializado, id: doc.id };
  },
};

interface AgendaDiaInput {
  fecha: string;
  tecnicoId?: string;
}

const TOOL_AGENDA_DIA: ToolDef = {
  name: 'agenda_dia',
  description:
    "Trae todas las órdenes agendadas para una fecha específica (YYYY-MM-DD, hora RD), opcionalmente filtradas por técnico. Útil para preguntas como 'qué hay para hoy' o 'qué tiene Juan mañana'. Ordenadas por hora ascendente.",
  input_schema: {
    type: 'object',
    properties: {
      fecha: { type: 'string', description: 'YYYY-MM-DD, hora local RD.' },
      tecnicoId: { type: 'string' },
    },
    required: ['fecha'],
  },
  rolesPermitidos: ['administrador', 'coordinadora', 'operaria', 'secretaria'],
  ejecutar: async (input: AgendaDiaInput, { rol }) => {
    if (!input?.fecha) throw new Error("Falta 'fecha' (YYYY-MM-DD)");
    const db = getAdminFirestore();
    const { inicio, fin } = parseFechaRD(input.fecha);
    // NO aplicar `where('tecnicoId')` server-side: combinarlo con el range
    // filter sobre fechaCita requiere índice compuesto. Se filtra in-memory.
    const q: Query<DocumentData> = db
      .collection('ordenes_servicio')
      .where('fechaCita', '>=', inicio)
      .where('fechaCita', '<=', fin);
    const postFiltros: PostFiltrosOrdenes = {};
    if (input.tecnicoId && typeof input.tecnicoId === 'string') {
      postFiltros.tecnicoId = input.tecnicoId;
    }
    const snap = await q.get();
    const filtrados = aplicarFiltrosPost(
      snap.docs.map((d) => ({ id: d.id, data: d.data() })),
      rol,
      postFiltros,
    );
    const items = filtrados
      .map(({ data }) => {
        const fechaCita = toDate(data.fechaCita);
        return {
          hora: fechaCita ? formatHoraRD(fechaCita) : '',
          _ts: fechaCita ? fechaCita.getTime() : 0,
          clienteNombre: data.clienteNombre || '',
          direccion: data.clienteDireccion || '',
          equipoTipo: data.equipoTipo || '',
          tecnicoNombre: data.tecnicoNombre || '',
          fase: data.fase || '',
        };
      })
      .sort((a, b) => a._ts - b._ts)
      .map(({ _ts, ...rest }) => rest);
    return { fecha: input.fecha, cantidad: items.length, agenda: items };
  },
};

interface QueryProductosInput {
  busqueda?: string;
  stockMaximoAlerta?: number;
  limite?: number;
}

const TOOL_QUERY_PRODUCTOS: ToolDef = {
  name: 'query_productos',
  description:
    "Busca piezas del inventario. Si pasas stockMaximoAlerta, solo retorna productos con stock <= ese número (útil para detectar inventario bajo). Retorna hasta 'limite' resultados (default 20, max 50).",
  input_schema: {
    type: 'object',
    properties: {
      busqueda: { type: 'string', description: 'Texto a buscar dentro del nombre o código de la pieza (match parcial).' },
      stockMaximoAlerta: { type: 'number', description: 'Si se pasa, filtra solo piezas con stockActual <= ese valor.' },
      limite: { type: 'number', description: 'Cantidad máxima. Default 20, máx 50.' },
    },
  },
  rolesPermitidos: ['administrador', 'coordinadora', 'operaria', 'secretaria'],
  ejecutar: async (input: QueryProductosInput) => {
    const db = getAdminFirestore();
    const limite = Math.min(Math.max(typeof input?.limite === 'number' ? input.limite : 20, 1), 50);
    const snap = await db.collection('piezas_inventario').get();
    const docs = snap.docs.map((d) => d.data());
    const filtrados = docs.filter((p) => {
      if (input?.stockMaximoAlerta !== undefined) {
        const stock = typeof p.stockActual === 'number' ? p.stockActual : 0;
        if (stock > input.stockMaximoAlerta) return false;
      }
      if (input?.busqueda) {
        const match =
          incluyeBusqueda(p.nombre, input.busqueda) ||
          incluyeBusqueda(p.codigo, input.busqueda);
        if (!match) return false;
      }
      return true;
    });
    const items = filtrados.slice(0, limite).map((p) => ({
      codigo: p.codigo || '',
      nombre: p.nombre || '',
      categoria: p.categoria || '',
      stock: typeof p.stockActual === 'number' ? p.stockActual : 0,
      stockMinimo: typeof p.stockMinimo === 'number' ? p.stockMinimo : null,
      costoUnitario: typeof p.precioCompra === 'number' ? p.precioCompra : null,
      precioVenta: typeof p.precioVenta === 'number' ? p.precioVenta : null,
    }));
    return { productos: items, cantidad: items.length };
  },
};

interface QueryComisionesInput {
  tecnicoId?: string;
  desde?: string;
  hasta?: string;
  estado?: 'pendiente' | 'pagada';
}

const TOOL_QUERY_COMISIONES: ToolDef = {
  name: 'query_comisiones',
  description:
    "Consulta comisiones de técnicos. Filtra por técnico, rango de fechas (YYYY-MM-DD sobre fechaCobro) o estado ('pendiente' | 'pagada'). Si no pasás rango, usa la quincena actual.",
  input_schema: {
    type: 'object',
    properties: {
      tecnicoId: { type: 'string' },
      desde: { type: 'string', description: 'YYYY-MM-DD, hora RD.' },
      hasta: { type: 'string', description: 'YYYY-MM-DD, hora RD.' },
      estado: { type: 'string', enum: ['pendiente', 'pagada'] },
    },
  },
  rolesPermitidos: ['administrador', 'coordinadora'],
  ejecutar: async (input: QueryComisionesInput) => {
    const db = getAdminFirestore();
    let rangoInicio: Date;
    let rangoFin: Date;
    if (input?.desde || input?.hasta) {
      // Si pasan solo una de las dos, la otra cae en la quincena actual
      const actual = quincenaActualAhora();
      rangoInicio = input?.desde ? parseFechaRD(input.desde).inicio : actual.inicio;
      rangoFin = input?.hasta ? parseFechaRD(input.hasta).fin : actual.fin;
    } else {
      const actual = quincenaActualAhora();
      rangoInicio = actual.inicio;
      rangoFin = actual.fin;
    }

    let q: Query<DocumentData> = db
      .collection('comisiones')
      .where('fechaCobro', '>=', rangoInicio)
      .where('fechaCobro', '<=', rangoFin);
    if (input?.tecnicoId) q = q.where('tecnicoId', '==', input.tecnicoId);
    if (input?.estado) {
      const mapeado = input.estado === 'pagada' ? 'liquidada' : 'pendiente';
      q = q.where('estadoLiquidacion', '==', mapeado);
    }

    const snap = await q.get();
    const items = snap.docs.map((d) => {
      const data = d.data();
      const fechaCobro = toDate(data.fechaCobro);
      const estadoRaw = data.estadoLiquidacion;
      const estado = estadoRaw === 'liquidada' ? 'pagada' : 'pendiente';
      return {
        ordenNumero: data.ordenNumero || '',
        tecnicoNombre: data.tecnicoNombre || '',
        fechaCobro: fechaCobro ? fechaCobro.toISOString() : null,
        montoBase: typeof data.basePendienteComision === 'number' ? data.basePendienteComision : 0,
        comisionPorcentaje: typeof data.comisionPorcentaje === 'number' ? data.comisionPorcentaje : 0,
        montoComision: typeof data.comisionMonto === 'number' ? data.comisionMonto : 0,
        estado,
      };
    });
    return {
      comisiones: items,
      cantidad: items.length,
      rango: { inicio: rangoInicio.toISOString(), fin: rangoFin.toISOString() },
    };
  },
};

interface QueryFacturacionInput {
  desde?: string;
  hasta?: string;
}

const TOOL_QUERY_FACTURACION: ToolDef = {
  name: 'query_facturacion',
  description:
    "Calcula totales de facturación (Conduces de Garantía CG-####) en un rango de fechas. Si no pasás rango, usa la quincena actual. Excluye anuladas. Retorna total facturado, ITBIS interno, ganancia neta, comisiones de técnico y ganancia final.",
  input_schema: {
    type: 'object',
    properties: {
      desde: { type: 'string', description: 'YYYY-MM-DD, hora RD. Filtra fechaEmision.' },
      hasta: { type: 'string', description: 'YYYY-MM-DD, hora RD. Filtra fechaEmision.' },
    },
  },
  rolesPermitidos: ['administrador', 'coordinadora'],
  ejecutar: async (input: QueryFacturacionInput) => {
    const db = getAdminFirestore();
    let rangoInicio: Date;
    let rangoFin: Date;
    if (input?.desde || input?.hasta) {
      const actual = quincenaActualAhora();
      rangoInicio = input?.desde ? parseFechaRD(input.desde).inicio : actual.inicio;
      rangoFin = input?.hasta ? parseFechaRD(input.hasta).fin : actual.fin;
    } else {
      const actual = quincenaActualAhora();
      rangoInicio = actual.inicio;
      rangoFin = actual.fin;
    }

    // Traemos todas y filtramos en memoria por fechaEmision || createdAt
    // (compound index con OR no existe en Firestore; fallback requiere client-side).
    const snap = await db.collection('facturas').get();
    let totalFacturado = 0;
    let totalITBISInterno = 0;
    let totalGananciaNeta = 0;
    let totalComisiones = 0;
    let cantidadConduces = 0;

    for (const d of snap.docs) {
      const data = d.data();
      if (data.estado === 'anulada') continue;
      const fechaEmision = toDate(data.fechaEmision) || toDate(data.createdAt);
      if (!fechaEmision) continue;
      if (fechaEmision < rangoInicio || fechaEmision > rangoFin) continue;

      cantidadConduces += 1;
      if (typeof data.total === 'number') totalFacturado += data.total;
      if (typeof data.itbisMonto === 'number') totalITBISInterno += data.itbisMonto;
      if (typeof data.gananciaNeta === 'number') totalGananciaNeta += data.gananciaNeta;
      if (typeof data.comisionTecnicoMonto === 'number') totalComisiones += data.comisionTecnicoMonto;
    }

    const gananciaFinal = totalGananciaNeta - totalComisiones;
    return {
      rango: { inicio: rangoInicio.toISOString(), fin: rangoFin.toISOString() },
      totalFacturado: redondear(totalFacturado),
      totalITBISInterno: redondear(totalITBISInterno),
      totalGananciaNeta: redondear(totalGananciaNeta),
      totalComisiones: redondear(totalComisiones),
      gananciaFinal: redondear(gananciaFinal),
      cantidadConduces,
    };
  },
};

interface QueryPersonalInput {
  rol?: string;
  activo?: boolean;
  busqueda?: string;
}

const TOOL_QUERY_PERSONAL: ToolDef = {
  name: 'query_personal',
  description:
    "Lista personal del negocio filtrado por rol ('administrador','coordinadora','operaria','secretaria','tecnico','ayudante'), estado activo o búsqueda por nombre. admin/coord ven sueldoMensual; operaria/secretaria no.",
  input_schema: {
    type: 'object',
    properties: {
      rol: { type: 'string' },
      activo: { type: 'boolean' },
      busqueda: { type: 'string', description: 'Texto a buscar dentro del nombre (match parcial).' },
    },
  },
  rolesPermitidos: ['administrador', 'coordinadora', 'operaria', 'secretaria'],
  ejecutar: async (input: QueryPersonalInput, { rol }) => {
    const db = getAdminFirestore();
    let q: Query<DocumentData> = db.collection('personal');
    if (input?.rol) q = q.where('rol', '==', input.rol);
    if (typeof input?.activo === 'boolean') q = q.where('activo', '==', input.activo);
    const snap = await q.get();
    const muestraSueldo = rol === 'administrador' || rol === 'coordinadora';
    const items = snap.docs
      .map((d) => d.data())
      .filter((p) => {
        if (input?.busqueda && !incluyeBusqueda(p.nombre, input.busqueda)) return false;
        return true;
      })
      .map((p) => {
        const base: Record<string, unknown> = {
          nombre: p.nombre || '',
          rol: p.rol || '',
          telefono: p.telefono || '',
          email: p.email || '',
          activo: p.activo === true,
        };
        if (muestraSueldo && typeof p.sueldoBase === 'number') {
          base.sueldoMensual = p.sueldoBase;
        }
        return base;
      });
    return { personal: items, cantidad: items.length };
  },
};

interface QueryPreciosServiciosInput {
  marca?: string;
  equipoTipo?: string;
  servicio?: string;
  busqueda?: string;
  limite?: number;
}

const TOOL_QUERY_PRECIOS_SERVICIOS: ToolDef = {
  name: 'query_precios_servicios',
  description:
    "Consulta el tarifario de servicios (precios estándar por marca, tipo de equipo y servicio). Filtra por marca, tipo de equipo, nombre de servicio o búsqueda libre. Solo retorna servicios activos. Retorna hasta 'limite' resultados (default 20, max 50).",
  input_schema: {
    type: 'object',
    properties: {
      marca: { type: 'string', description: 'Marca del equipo (match parcial, ej: "LG", "Samsung").' },
      equipoTipo: { type: 'string', description: 'Tipo de equipo (match parcial, ej: "nevera", "lavadora").' },
      servicio: { type: 'string', description: 'Nombre del servicio (match parcial, ej: "cambio compresor").' },
      busqueda: { type: 'string', description: 'Búsqueda libre sobre marca, equipoTipo, servicio y categoría.' },
      limite: { type: 'number', description: 'Cantidad máxima. Default 20, máx 50.' },
    },
  },
  rolesPermitidos: ['administrador', 'coordinadora', 'operaria', 'secretaria'],
  ejecutar: async (input: QueryPreciosServiciosInput) => {
    const db = getAdminFirestore();
    const limite = Math.min(Math.max(typeof input?.limite === 'number' ? input.limite : 20, 1), 50);
    const snap = await db.collection('precios_servicios').limit(limite * 3).get();
    const filtrados = snap.docs
      .map((d) => d.data())
      .filter((raw) => {
        // Default ON: ocultar inactivos
        if (raw.activo === false) return false;
        if (input?.marca && !incluyeBusqueda(raw.marca, input.marca)) return false;
        if (input?.equipoTipo && !incluyeBusqueda(raw.equipoTipo, input.equipoTipo)) return false;
        if (input?.servicio && !incluyeBusqueda(raw.nombre, input.servicio)) return false;
        if (input?.busqueda) {
          const concat = [raw.marca, raw.equipoTipo, raw.nombre, raw.categoria]
            .filter((v) => typeof v === 'string')
            .join(' ');
          if (!incluyeBusqueda(concat, input.busqueda)) return false;
        }
        return true;
      });
    const items = filtrados.slice(0, limite).map((raw) => {
      const out: Record<string, unknown> = {
        marca: raw.marca || '',
        equipoTipo: raw.equipoTipo || '',
        categoria: raw.categoria || '',
        servicio: raw.nombre || '',
        precio: typeof raw.precio === 'number' ? raw.precio : 0,
      };
      if (typeof raw.notas === 'string' && raw.notas.length > 0) {
        out.notas = raw.notas;
      }
      return out;
    });
    return { servicios: items, cantidad: items.length };
  },
};

interface QueryClientesInput {
  telefono?: string;
  nombre?: string;
  email?: string;
  limite?: number;
}

const TOOL_QUERY_CLIENTES: ToolDef = {
  name: 'query_clientes',
  description:
    "Busca clientes por teléfono (match exacto con normalización RD), nombre o email (match parcial). Debes especificar al menos uno de los tres criterios. Retorna hasta 'limite' resultados (default 20, max 50).",
  input_schema: {
    type: 'object',
    properties: {
      telefono: { type: 'string', description: 'Teléfono del cliente. Se normaliza a 10 dígitos para match exacto.' },
      nombre: { type: 'string', description: 'Texto a buscar en el nombre (match parcial).' },
      email: { type: 'string', description: 'Texto a buscar en el email (match parcial).' },
      limite: { type: 'number', description: 'Cantidad máxima. Default 20, máx 50.' },
    },
  },
  rolesPermitidos: ['administrador', 'coordinadora', 'operaria', 'secretaria'],
  ejecutar: async (input: QueryClientesInput) => {
    const telefono = typeof input?.telefono === 'string' ? input.telefono.trim() : '';
    const nombre = typeof input?.nombre === 'string' ? input.nombre.trim() : '';
    const email = typeof input?.email === 'string' ? input.email.trim() : '';
    if (!telefono && !nombre && !email) {
      throw new Error('Debes especificar al menos un criterio de búsqueda (telefono, nombre o email).');
    }
    const db = getAdminFirestore();
    const limite = Math.min(Math.max(typeof input?.limite === 'number' ? input.limite : 20, 1), 50);

    let docs: DocumentData[];
    if (telefono) {
      // Match exacto server-side por telefonoNormalizado.
      const telNorm = normalizarTelefono(telefono);
      const q: Query<DocumentData> = db
        .collection('clientes')
        .where('telefonoNormalizado', '==', telNorm);
      const snap = await q.limit(limite).get();
      docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } else {
      // Nombre y/o email → fetch con margen y filtrar in-memory (AND si ambos).
      const snap = await db.collection('clientes').limit(limite * 3).get();
      docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => {
          if (nombre && !incluyeBusqueda(c.nombre, nombre)) return false;
          if (email && !incluyeBusqueda(c.email, email)) return false;
          return true;
        });
    }

    const items = docs.slice(0, limite).map((c) => {
      const out: Record<string, unknown> = {
        id: c.id,
        nombre: c.nombre || '',
        telefono: c.telefono || '',
        direccion: c.direccion || '',
      };
      if (typeof c.email === 'string' && c.email.length > 0) out.email = c.email;
      if (typeof c.sector === 'string' && c.sector.length > 0) out.sector = c.sector;
      if (typeof c.ciudad === 'string' && c.ciudad.length > 0) out.ciudad = c.ciudad;
      if (typeof c.zona === 'string' && c.zona.length > 0) out.zona = c.zona;
      if (typeof c.rnc === 'string' && c.rnc.length > 0) out.rnc = c.rnc;
      if (typeof c.cedula === 'string' && c.cedula.length > 0) out.cedula = c.cedula;
      return out;
    });
    return { clientes: items, cantidad: items.length };
  },
};

const CATEGORIAS_GASTO_VALIDAS = new Set([
  'repuestos',
  'transporte',
  'herramientas',
  'servicios',
  'otros',
]);

interface QueryGastosInput {
  desde?: string;
  hasta?: string;
  categoria?: string;
  limite?: number;
}

const TOOL_QUERY_GASTOS: ToolDef = {
  name: 'query_gastos',
  description:
    "Consulta gastos del negocio en un rango de fechas. Si no pasás rango, usa el mes actual. Filtra opcionalmente por categoría ('repuestos','transporte','herramientas','servicios','otros'). Retorna lista de gastos, total, cantidad y el rango usado. Solo accesible para administrador.",
  input_schema: {
    type: 'object',
    properties: {
      desde: { type: 'string', description: 'YYYY-MM-DD, hora RD. Filtra fecha.' },
      hasta: { type: 'string', description: 'YYYY-MM-DD, hora RD. Filtra fecha.' },
      categoria: {
        type: 'string',
        enum: ['repuestos', 'transporte', 'herramientas', 'servicios', 'otros'],
      },
      limite: { type: 'number', description: 'Cantidad máxima de gastos a listar. Default 30, máx 100.' },
    },
  },
  rolesPermitidos: ['administrador'],
  ejecutar: async (input: QueryGastosInput) => {
    const db = getAdminFirestore();
    const limite = Math.min(Math.max(typeof input?.limite === 'number' ? input.limite : 30, 1), 100);

    let rangoInicio: Date;
    let rangoFin: Date;
    let desdeStr: string;
    let hastaStr: string;
    if (input?.desde || input?.hasta) {
      const ctx = contextoFechaRD();
      const desdeUsado = input?.desde || ctx.mesActual.inicio;
      const hastaUsado = input?.hasta || ctx.mesActual.fin;
      rangoInicio = parseFechaRD(desdeUsado).inicio;
      rangoFin = parseFechaRD(hastaUsado).fin;
      desdeStr = desdeUsado;
      hastaStr = hastaUsado;
    } else {
      // Sin fechas → mes actual RD
      const ctx = contextoFechaRD();
      rangoInicio = parseFechaRD(ctx.mesActual.inicio).inicio;
      rangoFin = parseFechaRD(ctx.mesActual.fin).fin;
      desdeStr = ctx.mesActual.inicio;
      hastaStr = ctx.mesActual.fin;
    }

    // Validar categoría si se pasa (aunque el schema lo restringe, defensivo).
    if (input?.categoria && !CATEGORIAS_GASTO_VALIDAS.has(input.categoria)) {
      throw new Error(
        `Categoría inválida '${input.categoria}'. Válidas: ${[...CATEGORIAS_GASTO_VALIDAS].join(', ')}`,
      );
    }

    // where(fecha, range) + orderBy(fecha, desc) no requiere composite index.
    // Filtrar categoría post-query in-memory (misma regla que query_ordenes).
    const q: Query<DocumentData> = db
      .collection('gastos')
      .where('fecha', '>=', rangoInicio)
      .where('fecha', '<=', rangoFin)
      .orderBy('fecha', 'desc');
    const snap = await q.get();

    let total = 0;
    const gastos: Array<Record<string, unknown>> = [];
    for (const d of snap.docs) {
      const data = d.data();
      if (input?.categoria && data.categoria !== input.categoria) continue;
      const fecha = toDate(data.fecha);
      if (typeof data.monto === 'number') total += data.monto;
      if (gastos.length < limite) {
        gastos.push({
          fecha: fecha ? fecha.toISOString() : null,
          categoria: data.categoria || '',
          descripcion: data.descripcion || '',
          monto: typeof data.monto === 'number' ? data.monto : 0,
          metodoPago: data.metodoPago || '',
        });
      }
    }

    return {
      gastos,
      total: redondear(total),
      cantidad: gastos.length,
      rangoUsado: { desde: desdeStr, hasta: hastaStr },
    };
  },
};

// ---------------------------------------------------------------------------
// Tools admin-only (Sprint 6)
// ---------------------------------------------------------------------------

const TOOL_GET_ORDEN_DETALLADA: ToolDef = {
  name: 'get_orden_detallada',
  description:
    "Admin-only. Obtiene el detalle COMPLETO de una orden específica: todos los campos base más información enriquecida — piezas standby vinculadas, cotizaciones históricas, historial de fases, auditoría de cambios, registros de pago y detalles del conduce de garantía (CG) si existe. Úsala para preguntas como '¿qué pasó con la orden OS-0035?' o 'dame todo lo que sabes de la orden X'.",
  input_schema: {
    type: 'object',
    properties: {
      numero: { type: 'string', description: 'Número de orden, ej: OS-0035.' },
    },
    required: ['numero'],
  },
  rolesPermitidos: ['administrador'],
  ejecutar: async (input: { numero: string }) => {
    if (!input?.numero || typeof input.numero !== 'string') {
      throw new Error("Falta 'numero' (string)");
    }
    const numero = input.numero.trim();
    const db = getAdminFirestore();
    const snap = await db
      .collection('ordenes_servicio')
      .where('numero', '==', numero)
      .limit(1)
      .get();
    if (snap.empty) {
      throw new Error(`Orden '${numero}' no encontrada`);
    }
    const doc0 = snap.docs[0];
    const data = doc0.data();
    const ordenId = doc0.id;

    // Fetch en paralelo: piezas standby, cotizaciones y factura (si hay).
    const promesas: [
      Promise<FirebaseFirestore.QuerySnapshot<DocumentData>>,
      Promise<FirebaseFirestore.QuerySnapshot<DocumentData>>,
      Promise<FirebaseFirestore.DocumentSnapshot<DocumentData> | null>,
    ] = [
      db.collection('standby_piezas').where('ordenId', '==', ordenId).get(),
      db.collection('cotizaciones').where('ordenId', '==', ordenId).get(),
      typeof data.facturaId === 'string' && data.facturaId.length > 0
        ? db.collection('facturas').doc(data.facturaId).get()
        : Promise.resolve(null),
    ];
    const [standbySnap, cotizacionesSnap, facturaSnap] = await Promise.all(promesas);

    const piezasStandby = standbySnap.docs.map((d) => {
      const sd = d.data();
      return serializarTimestamps({ id: d.id, ...sd });
    });
    const cotizaciones = cotizacionesSnap.docs.map((d) => {
      const cd = d.data();
      return serializarTimestamps({ id: d.id, ...cd });
    });

    let conduceGarantia: unknown = null;
    if (facturaSnap && facturaSnap.exists) {
      const fd = facturaSnap.data() || {};
      conduceGarantia = serializarTimestamps({ id: facturaSnap.id, ...fd });
    }

    const ordenBase = serializarTimestamps({ id: ordenId, ...data });
    const pagosRegistrados = Array.isArray(data.pagos)
      ? data.pagos.map((p) => serializarTimestamps(p))
      : [];
    const historialFases = Array.isArray(data.historialFases)
      ? data.historialFases.map((h) => serializarTimestamps(h))
      : [];
    const auditoria = Array.isArray(data.auditoria)
      ? data.auditoria.map((a) => serializarTimestamps(a))
      : [];

    return {
      ordenBase,
      piezasStandby,
      cotizaciones,
      pagosRegistrados,
      historialFases,
      auditoria,
      conduceGarantia,
    };
  },
};

interface QueryPiezasInventarioInput {
  busqueda?: string;
  marca?: string;
  stockMaximoAlerta?: number;
  limite?: number;
}

const TOOL_QUERY_PIEZAS_INVENTARIO: ToolDef = {
  name: 'query_piezas_inventario',
  description:
    "Admin-only. Consulta las piezas del inventario interno del taller, incluyendo precioCompra y proveedorSugerido (datos sensibles no expuestos en query_productos). Filtra por nombre/código/descripción (busqueda), marca (buscado también dentro de nombre/código/descripción), o stock bajo un umbral. Útil para '¿cuánto stock tengo de actuador Mabe?' o '¿qué piezas tengo con menos de 3 unidades?'. Default limite 20, máx 50.",
  input_schema: {
    type: 'object',
    properties: {
      busqueda: { type: 'string', description: 'Texto a buscar en nombre, código o descripción (match parcial).' },
      marca: { type: 'string', description: 'Marca a buscar dentro de nombre/código/descripción (el schema no tiene campo marca dedicado).' },
      stockMaximoAlerta: { type: 'number', description: 'Si se pasa, filtra solo piezas con stockActual <= ese valor.' },
      limite: { type: 'number', description: 'Cantidad máxima. Default 20, máx 50.' },
    },
  },
  rolesPermitidos: ['administrador'],
  ejecutar: async (input: QueryPiezasInventarioInput) => {
    const db = getAdminFirestore();
    const limite = Math.min(Math.max(typeof input?.limite === 'number' ? input.limite : 20, 1), 50);
    const snap = await db.collection('piezas_inventario').get();
    const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    const filtrados = docs.filter(({ data: p }) => {
      // Default: ocultar inactivos (activo === false). Si activo es undefined, se incluye.
      if (p.activo === false) return false;
      if (input?.stockMaximoAlerta !== undefined) {
        const stock = typeof p.stockActual === 'number' ? p.stockActual : 0;
        if (stock > input.stockMaximoAlerta) return false;
      }
      if (input?.busqueda) {
        const match =
          incluyeBusqueda(p.nombre, input.busqueda) ||
          incluyeBusqueda(p.codigo, input.busqueda) ||
          incluyeBusqueda(p.descripcion, input.busqueda);
        if (!match) return false;
      }
      if (input?.marca) {
        const match =
          incluyeBusqueda(p.nombre, input.marca) ||
          incluyeBusqueda(p.codigo, input.marca) ||
          incluyeBusqueda(p.descripcion, input.marca);
        if (!match) return false;
      }
      return true;
    });
    const items = filtrados.slice(0, limite).map(({ id, data: p }) => {
      const out: Record<string, unknown> = {
        id,
        nombre: p.nombre || '',
        stock: typeof p.stockActual === 'number' ? p.stockActual : 0,
        precioVenta: typeof p.precioVenta === 'number' ? p.precioVenta : 0,
        activo: p.activo !== false,
      };
      if (typeof p.codigo === 'string' && p.codigo.length > 0) out.codigo = p.codigo;
      if (typeof p.categoria === 'string' && p.categoria.length > 0) out.categoria = p.categoria;
      if (typeof p.descripcion === 'string' && p.descripcion.length > 0) out.descripcion = p.descripcion;
      if (typeof p.stockMinimo === 'number') out.stockMinimo = p.stockMinimo;
      if (typeof p.precioCompra === 'number') out.precioCompra = p.precioCompra;
      if (typeof p.proveedorSugerido === 'string' && p.proveedorSugerido.length > 0) {
        out.proveedorSugerido = p.proveedorSugerido;
      }
      return out;
    });
    return { piezas: items, cantidad: items.length };
  },
};

const ESTADOS_STANDBY_VALIDOS = new Set(['buscando', 'importada', 'dificil', 'llego']);

interface QueryStandbyPiezasInput {
  estado?: string;
  tecnicoNombre?: string;
  ordenNumero?: string;
  desde?: string;
  hasta?: string;
  limite?: number;
}

const TOOL_QUERY_STANDBY_PIEZAS: ToolDef = {
  name: 'query_standby_piezas',
  description:
    "Admin-only. Consulta piezas en standby (esperando llegar) vinculadas a órdenes. Filtra por estado ('buscando','importada','dificil','llego'), nombre del técnico (match parcial sobre tecnicoNombre denormalizado), orden específica (pasando 'OS-####') o rango de fechas sobre fechaInicio. Útil para '¿qué piezas están pendientes de llegar?' o '¿qué piezas tiene esperando Juan?'. Default limite 20, máx 50.",
  input_schema: {
    type: 'object',
    properties: {
      estado: { type: 'string', enum: ['buscando', 'importada', 'dificil', 'llego'] },
      tecnicoNombre: { type: 'string', description: 'Match parcial sobre nombre del técnico (campo denormalizado tecnicoNombre).' },
      ordenNumero: { type: 'string', description: 'Número de orden, ej: OS-0035. Si se pasa, se resuelve a ordenId primero.' },
      desde: { type: 'string', description: 'YYYY-MM-DD, hora RD. Filtra fechaInicio.' },
      hasta: { type: 'string', description: 'YYYY-MM-DD, hora RD. Filtra fechaInicio.' },
      limite: { type: 'number', description: 'Cantidad máxima. Default 20, máx 50.' },
    },
  },
  rolesPermitidos: ['administrador'],
  ejecutar: async (input: QueryStandbyPiezasInput) => {
    const db = getAdminFirestore();
    const limite = Math.min(Math.max(typeof input?.limite === 'number' ? input.limite : 20, 1), 50);

    if (input?.estado !== undefined && input.estado !== null && input.estado !== '') {
      if (typeof input.estado !== 'string' || !ESTADOS_STANDBY_VALIDOS.has(input.estado)) {
        throw new Error(
          `Estado inválido '${input.estado}'. Válidos: ${[...ESTADOS_STANDBY_VALIDOS].join(', ')}`,
        );
      }
    }

    let ordenIdResuelto: string | null = null;
    if (input?.ordenNumero && typeof input.ordenNumero === 'string') {
      const ordenSnap = await db
        .collection('ordenes_servicio')
        .where('numero', '==', input.ordenNumero.trim())
        .limit(1)
        .get();
      if (ordenSnap.empty) {
        return { standby: [], cantidad: 0 };
      }
      ordenIdResuelto = ordenSnap.docs[0].id;
    }

    let q: Query<DocumentData> = db.collection('standby_piezas');
    if (ordenIdResuelto) {
      q = q.where('ordenId', '==', ordenIdResuelto);
    }
    if (input?.estado) {
      q = q.where('estado', '==', input.estado);
    }

    const snap = await q.get();
    let docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));

    // Filtro técnico post-query: StandbyPieza solo guarda tecnicoNombre
    // denormalizado (no tecnicoId), así que filtramos en memoria por match
    // parcial sobre ese campo.
    if (input?.tecnicoNombre && typeof input.tecnicoNombre === 'string') {
      docs = docs.filter(({ data }) => incluyeBusqueda(data.tecnicoNombre, input.tecnicoNombre!));
    }

    // Filtro fecha post-query para evitar composite index cuando se combina
    // con otros where.
    if (input?.desde || input?.hasta) {
      const inicio = input.desde ? parseFechaRD(input.desde).inicio : null;
      const fin = input.hasta ? parseFechaRD(input.hasta).fin : null;
      docs = docs.filter(({ data }) => {
        const f = toDate(data.fechaInicio);
        if (!f) return false;
        if (inicio && f < inicio) return false;
        if (fin && f > fin) return false;
        return true;
      });
    }

    const items = docs.slice(0, limite).map(({ id, data }) => {
      const fechaInicio = toDate(data.fechaInicio);
      const out: Record<string, unknown> = {
        id,
        piezaFaltante: data.piezaFaltante || '',
        clienteNombre: data.clienteNombre || '',
        equipoTipo: data.equipoTipo || '',
        equipoMarca: data.equipoMarca || '',
        estado: data.estado || '',
        fechaInicio: fechaInicio ? fechaInicio.toISOString() : null,
      };
      if (typeof data.ordenId === 'string' && data.ordenId.length > 0) out.ordenId = data.ordenId;
      if (typeof data.tecnicoNombre === 'string' && data.tecnicoNombre.length > 0) {
        out.tecnicoNombre = data.tecnicoNombre;
      }
      if (typeof data.notas === 'string' && data.notas.length > 0) out.notas = data.notas;
      return out;
    });

    return { standby: items, cantidad: items.length };
  },
};

const ESTADOS_COTIZACION_VALIDOS = new Set(['borrador', 'enviada', 'aceptada', 'rechazada']);

interface QueryCotizacionesInput {
  estado?: string;
  clienteNombre?: string;
  desde?: string;
  hasta?: string;
  limite?: number;
}

const TOOL_QUERY_COTIZACIONES: ToolDef = {
  name: 'query_cotizaciones',
  description:
    "Admin-only. Consulta cotizaciones emitidas a clientes. Filtra por estado ('borrador','enviada','aceptada','rechazada'), nombre de cliente (match parcial) o rango de fechas sobre createdAt. Útil para '¿cuántas cotizaciones enviadas tengo pendientes?' o '¿qué cotizamos a Juan Ramírez el mes pasado?'. Default limite 20, máx 50.",
  input_schema: {
    type: 'object',
    properties: {
      estado: { type: 'string', enum: ['borrador', 'enviada', 'aceptada', 'rechazada'] },
      clienteNombre: { type: 'string', description: 'Match parcial sobre nombre del cliente.' },
      desde: { type: 'string', description: 'YYYY-MM-DD, hora RD. Filtra createdAt.' },
      hasta: { type: 'string', description: 'YYYY-MM-DD, hora RD. Filtra createdAt.' },
      limite: { type: 'number', description: 'Cantidad máxima. Default 20, máx 50.' },
    },
  },
  rolesPermitidos: ['administrador'],
  ejecutar: async (input: QueryCotizacionesInput) => {
    const db = getAdminFirestore();
    const limite = Math.min(Math.max(typeof input?.limite === 'number' ? input.limite : 20, 1), 50);

    if (input?.estado !== undefined && input.estado !== null && input.estado !== '') {
      if (typeof input.estado !== 'string' || !ESTADOS_COTIZACION_VALIDOS.has(input.estado)) {
        throw new Error(
          `Estado inválido '${input.estado}'. Válidos: ${[...ESTADOS_COTIZACION_VALIDOS].join(', ')}`,
        );
      }
    }

    let q: Query<DocumentData> = db.collection('cotizaciones');
    if (input?.estado) {
      q = q.where('estado', '==', input.estado);
    }

    const snap = await q.get();
    let docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));

    if (input?.desde || input?.hasta) {
      const inicio = input.desde ? parseFechaRD(input.desde).inicio : null;
      const fin = input.hasta ? parseFechaRD(input.hasta).fin : null;
      docs = docs.filter(({ data }) => {
        const f = toDate(data.createdAt);
        if (!f) return false;
        if (inicio && f < inicio) return false;
        if (fin && f > fin) return false;
        return true;
      });
    }

    if (input?.clienteNombre) {
      docs = docs.filter(({ data }) => incluyeBusqueda(data.clienteNombre, input.clienteNombre!));
    }

    const items = docs.slice(0, limite).map(({ id, data }) => {
      const createdAt = toDate(data.createdAt);
      const itemsCount = Array.isArray(data.items) ? data.items.length : 0;
      const out: Record<string, unknown> = {
        id,
        numero: data.numero || '',
        clienteNombre: data.clienteNombre || '',
        total: typeof data.total === 'number' ? data.total : 0,
        estado: data.estado || '',
        fechaEmision: createdAt ? createdAt.toISOString() : null,
        itemsCount,
      };
      if (typeof data.tecnicoNombre === 'string' && data.tecnicoNombre.length > 0) {
        out.tecnicoNombre = data.tecnicoNombre;
      }
      if (typeof data.ordenId === 'string' && data.ordenId.length > 0) out.ordenId = data.ordenId;
      if (typeof data.convertida === 'boolean') out.convertida = data.convertida;
      if (typeof data.facturaId === 'string' && data.facturaId.length > 0) out.facturaId = data.facturaId;
      if (typeof data.notas === 'string' && data.notas.length > 0) out.notas = data.notas;
      return out;
    });

    return { cotizaciones: items, cantidad: items.length };
  },
};

interface QueryAvancesInput {
  personalId?: string;
  estado?: 'pendiente' | 'descontado';
  desde?: string;
  hasta?: string;
  limite?: number;
}

const TOOL_QUERY_AVANCES_EMPLEADOS: ToolDef = {
  name: 'query_avances_empleados',
  description:
    "Admin-only. Consulta avances (adelantos) de nómina dados a empleados en la colección 'avances'. Filtra por empleado, estado ('pendiente' = no descontado aún, 'descontado' = ya aplicado a una liquidación) o rango de fechas sobre fecha. Útil para '¿cuánto le he adelantado a Aury este mes?' o '¿qué avances quedan pendientes de descontar?'. Default limite 20, máx 50.",
  input_schema: {
    type: 'object',
    properties: {
      personalId: { type: 'string' },
      estado: { type: 'string', enum: ['pendiente', 'descontado'] },
      desde: { type: 'string', description: 'YYYY-MM-DD, hora RD. Filtra fecha.' },
      hasta: { type: 'string', description: 'YYYY-MM-DD, hora RD. Filtra fecha.' },
      limite: { type: 'number', description: 'Cantidad máxima. Default 20, máx 50.' },
    },
  },
  rolesPermitidos: ['administrador'],
  ejecutar: async (input: QueryAvancesInput) => {
    const db = getAdminFirestore();
    const limite = Math.min(Math.max(typeof input?.limite === 'number' ? input.limite : 20, 1), 50);

    let q: Query<DocumentData> = db.collection('avances');
    if (input?.personalId && typeof input.personalId === 'string') {
      q = q.where('personalId', '==', input.personalId);
    }
    if (input?.estado === 'pendiente') {
      q = q.where('descontado', '==', false);
    } else if (input?.estado === 'descontado') {
      q = q.where('descontado', '==', true);
    }

    const snap = await q.get();
    let docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));

    if (input?.desde || input?.hasta) {
      const inicio = input.desde ? parseFechaRD(input.desde).inicio : null;
      const fin = input.hasta ? parseFechaRD(input.hasta).fin : null;
      docs = docs.filter(({ data }) => {
        const f = toDate(data.fecha);
        if (!f) return false;
        if (inicio && f < inicio) return false;
        if (fin && f > fin) return false;
        return true;
      });
    }

    const items = docs.slice(0, limite).map(({ id, data }) => {
      const fecha = toDate(data.fecha);
      const out: Record<string, unknown> = {
        id,
        personalId: data.personalId || '',
        personalNombre: data.personalNombre || '',
        monto: typeof data.monto === 'number' ? data.monto : 0,
        fecha: fecha ? fecha.toISOString() : null,
        descontado: data.descontado === true,
        quincenaAsignada: data.quincenaAsignada || '',
      };
      if (typeof data.motivo === 'string' && data.motivo.length > 0) out.motivo = data.motivo;
      if (typeof data.liquidacionId === 'string' && data.liquidacionId.length > 0) {
        out.liquidacionId = data.liquidacionId;
      }
      if (typeof data.metodoPago === 'string' && data.metodoPago.length > 0) {
        out.metodoPago = data.metodoPago;
      }
      return out;
    });

    return { avances: items, cantidad: items.length };
  },
};

interface QueryLiquidacionesInput {
  quincena?: string;
  personalId?: string;
  desde?: string;
  hasta?: string;
  limite?: number;
}

const TOOL_QUERY_LIQUIDACIONES_NOMINA: ToolDef = {
  name: 'query_liquidaciones_nomina',
  description:
    "Admin-only. Consulta liquidaciones de nómina históricas. Cada documento contiene un array 'empleados[]'; esta tool RETORNA UNA FILA POR EMPLEADO × QUINCENA. Filtra por quincena (formato interno 'YYYY-MM-Q1' o 'YYYY-MM-Q2'), empleado específico (personalId) o rango de fechas sobre fechaGeneracion. Útil para '¿cuánto pagué en nómina la quincena pasada?' o '¿qué comisión final tuvo Aury en Q1 marzo?'. Default limite 20 filas, máx 50.",
  input_schema: {
    type: 'object',
    properties: {
      quincena: {
        type: 'string',
        description: "Quincena en formato interno 'YYYY-MM-Q1' o 'YYYY-MM-Q2' (ej. '2026-04-Q2').",
      },
      personalId: { type: 'string' },
      desde: { type: 'string', description: 'YYYY-MM-DD, hora RD. Filtra fechaGeneracion.' },
      hasta: { type: 'string', description: 'YYYY-MM-DD, hora RD. Filtra fechaGeneracion.' },
      limite: { type: 'number', description: 'Cantidad máxima de filas (empleado×quincena). Default 20, máx 50.' },
    },
  },
  rolesPermitidos: ['administrador'],
  ejecutar: async (input: QueryLiquidacionesInput) => {
    const db = getAdminFirestore();
    const limite = Math.min(Math.max(typeof input?.limite === 'number' ? input.limite : 20, 1), 50);

    let q: Query<DocumentData> = db.collection('liquidaciones_nomina');
    if (input?.quincena && typeof input.quincena === 'string') {
      q = q.where('quincena', '==', input.quincena.trim());
    }

    const snap = await q.get();
    let liquidaciones = snap.docs.map((d) => ({ id: d.id, data: d.data() }));

    if (input?.desde || input?.hasta) {
      const inicio = input.desde ? parseFechaRD(input.desde).inicio : null;
      const fin = input.hasta ? parseFechaRD(input.hasta).fin : null;
      liquidaciones = liquidaciones.filter(({ data }) => {
        const f = toDate(data.fechaGeneracion);
        if (!f) return false;
        if (inicio && f < inicio) return false;
        if (fin && f > fin) return false;
        return true;
      });
    }

    const filas: Array<Record<string, unknown>> = [];
    for (const { id, data } of liquidaciones) {
      if (filas.length >= limite) break;
      const empleados = Array.isArray(data.empleados) ? data.empleados : [];
      const fechaGeneracion = toDate(data.fechaGeneracion);
      const fechaGeneracionIso = fechaGeneracion ? fechaGeneracion.toISOString() : null;
      for (const emp of empleados) {
        if (filas.length >= limite) break;
        if (input?.personalId && emp.personalId !== input.personalId) continue;
        const fila: Record<string, unknown> = {
          liquidacionId: id,
          quincena: data.quincena || '',
          fechaGeneracion: fechaGeneracionIso,
          estado: data.estado || '',
          personalId: emp.personalId || '',
          personalNombre: emp.personalNombre || '',
          rol: emp.rol || '',
          sueldoBase: typeof emp.sueldoBase === 'number' ? emp.sueldoBase : 0,
          totalComisiones: typeof emp.totalComisiones === 'number' ? emp.totalComisiones : 0,
          totalDevengado: typeof emp.totalDevengado === 'number' ? emp.totalDevengado : 0,
          pagado: emp.pagado === true,
        };
        if (typeof emp.bono === 'number') fila.bono = emp.bono;
        if (typeof emp.totalAvances === 'number') fila.totalAvances = emp.totalAvances;
        if (typeof emp.totalNeto === 'number') fila.totalNeto = emp.totalNeto;
        filas.push(fila);
      }
    }

    return { liquidaciones: filas, cantidad: filas.length };
  },
};

const FRECUENCIAS_MANTENIMIENTO_VALIDAS = new Set(['mensual', 'trimestral', 'semestral', 'anual']);

interface QueryMantenimientoInput {
  clienteNombre?: string;
  activo?: boolean;
  proximasXdias?: number;
  frecuencia?: string;
  limite?: number;
}

const TOOL_QUERY_MANTENIMIENTO: ToolDef = {
  name: 'query_mantenimiento',
  description:
    "Admin-only. Consulta mantenimientos programados (servicios preventivos recurrentes) de la colección 'mantenimiento'. Filtra por cliente (match parcial), activo (true/false) o frecuencia ('mensual','trimestral','semestral','anual'). Si pasas 'proximasXdias', retorna mantenimientos con proximaFecha <= hoy + X días — esto incluye mantenimientos ATRASADOS (fechas pasadas) y los próximos X días. Útil para ver todo lo pendiente (ej. '¿qué mantenimientos tengo pendientes para esta semana?' o '¿ya agendé el mantenimiento de María González?'). Default limite 20, máx 50.",
  input_schema: {
    type: 'object',
    properties: {
      clienteNombre: { type: 'string', description: 'Match parcial sobre nombre del cliente.' },
      activo: { type: 'boolean' },
      proximasXdias: { type: 'number', description: 'Filtra proximaFecha <= hoy + X días (hora RD). Incluye mantenimientos ATRASADOS (proximaFecha en el pasado) además de los próximos X días.' },
      frecuencia: { type: 'string', enum: ['mensual', 'trimestral', 'semestral', 'anual'] },
      limite: { type: 'number', description: 'Cantidad máxima. Default 20, máx 50.' },
    },
  },
  rolesPermitidos: ['administrador'],
  ejecutar: async (input: QueryMantenimientoInput) => {
    const db = getAdminFirestore();
    const limite = Math.min(Math.max(typeof input?.limite === 'number' ? input.limite : 20, 1), 50);

    if (input?.frecuencia !== undefined && input.frecuencia !== null && input.frecuencia !== '') {
      if (typeof input.frecuencia !== 'string' || !FRECUENCIAS_MANTENIMIENTO_VALIDAS.has(input.frecuencia)) {
        throw new Error(
          `Frecuencia inválida '${input.frecuencia}'. Válidas: ${[...FRECUENCIAS_MANTENIMIENTO_VALIDAS].join(', ')}`,
        );
      }
    }

    let q: Query<DocumentData> = db.collection('mantenimiento');
    if (typeof input?.activo === 'boolean') {
      q = q.where('activo', '==', input.activo);
    }
    if (input?.frecuencia) {
      q = q.where('frecuencia', '==', input.frecuencia);
    }

    const snap = await q.get();
    let docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));

    // Filtro proximasXdias: proximaFecha <= hoy (RD) + X días.
    if (typeof input?.proximasXdias === 'number' && input.proximasXdias >= 0) {
      const ctx = contextoFechaRD();
      const { inicio: hoyInicioUTC } = parseFechaRD(ctx.hoy);
      const limiteMs = hoyInicioUTC.getTime() + input.proximasXdias * 24 * 60 * 60 * 1000 + (24 * 60 * 60 * 1000 - 1);
      const limiteDate = new Date(limiteMs);
      docs = docs.filter(({ data }) => {
        const f = toDate(data.proximaFecha);
        if (!f) return false;
        return f <= limiteDate;
      });
    }

    if (input?.clienteNombre) {
      docs = docs.filter(({ data }) => incluyeBusqueda(data.clienteNombre, input.clienteNombre!));
    }

    const items = docs.slice(0, limite).map(({ id, data }) => {
      const proximaFecha = toDate(data.proximaFecha);
      const out: Record<string, unknown> = {
        id,
        clienteNombre: data.clienteNombre || '',
        equipoTipo: data.equipoTipo || '',
        frecuencia: data.frecuencia || '',
        proximaFecha: proximaFecha ? proximaFecha.toISOString() : null,
        activo: data.activo === true,
      };
      if (typeof data.tecnicoId === 'string' && data.tecnicoId.length > 0) out.tecnicoId = data.tecnicoId;
      return out;
    });

    return { mantenimientos: items, cantidad: items.length };
  },
};

const ROLES_PONCHES_VALIDOS = new Set([
  'administrador',
  'coordinadora',
  'operaria',
  'secretaria',
  'tecnico',
  'ayudante',
]);

interface QueryPonchesInput {
  personalNombre?: string;
  rol?: string;
  desde?: string;
  hasta?: string;
  soloAusentes?: boolean;
  llegadaTardeDespuesDe?: string;
}

const TOOL_QUERY_PONCHES: ToolDef = {
  name: 'query_ponches',
  description:
    "Admin-only. Consulta ponches de asistencia del personal. Filtra por nombre del empleado (match parcial), rol específico, rango de fechas (default hoy en hora RD), llegadas tardías (entrada después de HH:MM) o ausentes (personal activo sin ponche de entrada en el rango). Retorna ponches agrupados por persona con tipo, hora, fotoUrl y ubicación GPS si está disponible. Útil para '¿quién no ponchó hoy?', '¿cuántas horas trabajó Aury esta quincena?', '¿quién llegó tarde el lunes?'.",
  input_schema: {
    type: 'object',
    properties: {
      personalNombre: { type: 'string', description: 'Match parcial sobre el nombre del empleado.' },
      rol: {
        type: 'string',
        enum: ['administrador', 'coordinadora', 'operaria', 'secretaria', 'tecnico', 'ayudante'],
        description: 'Filtro por rol exacto del empleado.',
      },
      desde: { type: 'string', description: 'YYYY-MM-DD, hora RD. Default hoy.' },
      hasta: { type: 'string', description: 'YYYY-MM-DD, hora RD. Default hoy.' },
      soloAusentes: {
        type: 'boolean',
        description: 'Si true, retorna solo personal activo que NO tiene ponche de entrada en el rango.',
      },
      llegadaTardeDespuesDe: {
        type: 'string',
        description: 'Hora HH:MM (ej. "09:00"). Filtra solo ponches de entrada con hora RD posterior a ese valor.',
      },
    },
  },
  rolesPermitidos: ['administrador'],
  ejecutar: async (input: QueryPonchesInput) => {
    const db = getAdminFirestore();

    if (input?.rol !== undefined && input.rol !== null && input.rol !== '') {
      if (typeof input.rol !== 'string' || !ROLES_PONCHES_VALIDOS.has(input.rol)) {
        throw new Error(
          `Rol inválido '${input.rol}'. Válidos: ${[...ROLES_PONCHES_VALIDOS].join(', ')}`,
        );
      }
    }

    if (input?.llegadaTardeDespuesDe !== undefined && input.llegadaTardeDespuesDe !== null && input.llegadaTardeDespuesDe !== '') {
      if (typeof input.llegadaTardeDespuesDe !== 'string' || !/^\d{2}:\d{2}$/.test(input.llegadaTardeDespuesDe)) {
        throw new Error(
          `llegadaTardeDespuesDe inválido '${input.llegadaTardeDespuesDe}'. Formato esperado: HH:MM (ej. '09:00').`,
        );
      }
    }

    // Default a hoy en hora RD si no se pasa rango.
    const ctx = contextoFechaRD();
    const fechaDesde = input?.desde && typeof input.desde === 'string' ? input.desde.trim() : ctx.hoy;
    const fechaHasta = input?.hasta && typeof input.hasta === 'string' ? input.hasta.trim() : ctx.hoy;

    // Validar formato YYYY-MM-DD vía parseFechaRD (lanza error si inválido).
    parseFechaRD(fechaDesde);
    parseFechaRD(fechaHasta);

    const snap = await db
      .collection('ponches')
      .where('fechaRD', '>=', fechaDesde)
      .where('fechaRD', '<=', fechaHasta)
      .get();

    let ponches = snap.docs.map((d) => ({ id: d.id, data: d.data() }));

    // Filtros post-query
    if (input?.personalNombre && typeof input.personalNombre === 'string') {
      ponches = ponches.filter(({ data }) => incluyeBusqueda(data.personalNombre, input.personalNombre!));
    }
    if (input?.rol) {
      ponches = ponches.filter(({ data }) => data.personalRol === input.rol);
    }
    if (input?.llegadaTardeDespuesDe) {
      const corte = input.llegadaTardeDespuesDe;
      ponches = ponches.filter(({ data }) => {
        if (data.tipo !== 'entrada') return false;
        const ts = toDate(data.timestamp);
        if (!ts) return false;
        const horaRD = formatHoraRD(ts);
        return horaRD > corte;
      });
    }

    // Agrupar por personalUid
    const porPersonal: Record<string, {
      personalUid: string;
      personalId: string;
      personalNombre: string;
      personalRol: string;
      ponches: Array<Record<string, unknown>>;
    }> = {};

    for (const { id, data } of ponches) {
      const uid = typeof data.personalUid === 'string' ? data.personalUid : '';
      if (!uid) continue;
      if (!porPersonal[uid]) {
        porPersonal[uid] = {
          personalUid: uid,
          personalId: typeof data.personalId === 'string' ? data.personalId : '',
          personalNombre: typeof data.personalNombre === 'string' ? data.personalNombre : '',
          personalRol: typeof data.personalRol === 'string' ? data.personalRol : '',
          ponches: [],
        };
      }
      const ts = toDate(data.timestamp);
      const ponche: Record<string, unknown> = {
        id,
        tipo: data.tipo || '',
        hora: ts ? ts.toISOString() : null,
        fechaRD: data.fechaRD || '',
      };
      if (typeof data.fotoUrl === 'string' && data.fotoUrl.length > 0) ponche.fotoUrl = data.fotoUrl;
      if (data.ubicacion && typeof data.ubicacion === 'object') {
        ponche.ubicacion = serializarTimestamps(data.ubicacion);
      }
      if (typeof data.dispositivo === 'string' && data.dispositivo.length > 0) ponche.dispositivo = data.dispositivo;
      if (typeof data.notas === 'string' && data.notas.length > 0) ponche.notas = data.notas;
      porPersonal[uid].ponches.push(ponche);
    }

    // Ordenar ponches de cada persona por hora ascendente para que el LLM
    // vea entrada antes que salida.
    for (const persona of Object.values(porPersonal)) {
      persona.ponches.sort((a, b) => {
        const ha = typeof a.hora === 'string' ? a.hora : '';
        const hb = typeof b.hora === 'string' ? b.hora : '';
        return ha.localeCompare(hb);
      });
    }

    const resultado = Object.values(porPersonal);

    if (input?.soloAusentes === true) {
      const personalSnap = await db.collection('personal').where('activo', '==', true).get();
      const activos = personalSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
      const uidsConEntrada = new Set(
        ponches
          .filter(({ data }) => data.tipo === 'entrada')
          .map(({ data }) => (typeof data.personalUid === 'string' ? data.personalUid : ''))
          .filter((uid) => uid.length > 0),
      );
      const ausentes = activos
        .filter(({ data }) => {
          const uid = typeof data.uid === 'string' ? data.uid : '';
          if (!uid) return false;
          if (input?.rol && data.rol !== input.rol) return false;
          if (input?.personalNombre && !incluyeBusqueda(data.nombre, input.personalNombre)) return false;
          return !uidsConEntrada.has(uid);
        })
        .map(({ id, data }) => {
          const out: Record<string, unknown> = {
            personalId: id,
            nombre: typeof data.nombre === 'string' ? data.nombre : '',
            rol: typeof data.rol === 'string' ? data.rol : '',
          };
          if (typeof data.telefono === 'string' && data.telefono.length > 0) out.telefono = data.telefono;
          return out;
        });

      return {
        ausentes,
        totalAusentes: ausentes.length,
        rango: { desde: fechaDesde, hasta: fechaHasta },
      };
    }

    return {
      totalPonches: ponches.length,
      totalPersonas: resultado.length,
      rango: { desde: fechaDesde, hasta: fechaHasta },
      personal: resultado,
    };
  },
};

export const TOOLS: ToolDef[] = [
  TOOL_QUERY_ORDENES,
  TOOL_COUNT_ORDENES,
  TOOL_GET_ORDEN,
  TOOL_AGENDA_DIA,
  TOOL_QUERY_PRODUCTOS,
  TOOL_QUERY_COMISIONES,
  TOOL_QUERY_FACTURACION,
  TOOL_QUERY_PERSONAL,
  TOOL_QUERY_PRECIOS_SERVICIOS,
  TOOL_QUERY_CLIENTES,
  TOOL_QUERY_GASTOS,
  // Admin-only (Sprint 6)
  TOOL_GET_ORDEN_DETALLADA,
  TOOL_QUERY_PIEZAS_INVENTARIO,
  TOOL_QUERY_STANDBY_PIEZAS,
  TOOL_QUERY_COTIZACIONES,
  TOOL_QUERY_AVANCES_EMPLEADOS,
  TOOL_QUERY_LIQUIDACIONES_NOMINA,
  TOOL_QUERY_MANTENIMIENTO,
  TOOL_QUERY_PONCHES,
];

export function toolsParaRol(rol: Rol): ToolDef[] {
  return TOOLS.filter((t) => t.rolesPermitidos.includes(rol));
}

export async function ejecutarTool(
  nombre: string,
  input: unknown,
  contexto: { rol: Rol; uid: string },
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const tool = TOOLS.find((t) => t.name === nombre);
  if (!tool) return { ok: false, error: `Tool '${nombre}' no existe` };
  if (!tool.rolesPermitidos.includes(contexto.rol)) {
    return { ok: false, error: `Tu rol (${contexto.rol}) no tiene permiso para usar '${nombre}'` };
  }
  try {
    const result = await tool.ejecutar(input as any, contexto);
    return { ok: true, result };
  } catch (err: unknown) {
    // Truncar a 200 chars: errores de Firestore pueden incluir URLs con
    // project_id (ej links a crear índices compuestos) — minor info leak.
    const raw = err instanceof Error ? err.message : 'Error desconocido';
    const error = raw.length > 200 ? raw.slice(0, 200) + '...' : raw;
    return { ok: false, error };
  }
}
