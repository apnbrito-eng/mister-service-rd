import { getAdminFirestore } from './firebaseAdmin.js';
import type { Firestore, Query, DocumentData, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';

/**
 * Módulo de tools READ-only que Claude puede invocar para consultar Firestore.
 * Todo lo de aquí se ejecuta dentro de la serverless function /api/ai/chat.
 * NINGÚN tool escribe a Firestore (reviewer lo verifica).
 */

export type Rol = 'administrador' | 'coordinadora' | 'operaria' | 'secretaria';

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
  // Q2: día 15 al 29
  const inicio = new Date(Date.UTC(anio, mes - 1, 15, 4, 0, 0, 0));
  const fin = new Date(Date.UTC(anio, mes - 1, 29, 4, 0, 0, 0) + (24 * 60 * 60 * 1000 - 1));
  return { inicio, fin };
}

/** Quincena actual basada en el reloj del servidor, convertido a hora RD. */
function quincenaActualAhora(): { inicio: Date; fin: Date } {
  const { quincena, mes, anio } = calcularQuincenaActual(new Date());
  return rangoQuincena(quincena, mes, anio);
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

export const TOOLS: ToolDef[] = [
  TOOL_QUERY_ORDENES,
  TOOL_COUNT_ORDENES,
  TOOL_GET_ORDEN,
  TOOL_AGENDA_DIA,
  TOOL_QUERY_PRODUCTOS,
  TOOL_QUERY_COMISIONES,
  TOOL_QUERY_FACTURACION,
  TOOL_QUERY_PERSONAL,
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
