import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, Timestamp, type DocumentSnapshot, type Firestore, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { normalizarTelefono } from '../../src/utils/crm.js';
import { operariaDeTecnico } from '../_lib/equipoResponsable.js';

// Reasignación segura desde el mapa.
//
// Dos acciones sobre la misma ruta: `preview` (sin writes al negocio) y
// `confirmar` (transacción atómica). El preview emite un token con TTL y la
// confirmación lo canjea; si la orden cambió entre medio, abortamos sin tocar
// nada. Serializamos reasignaciones hacia el mismo técnico/día con un
// contador en `config_mapa/lock_tecnico_<uid>_dia_<YYYY-MM-DD>` para que dos
// mapas concurrentes compitan por el mismo documento (optimistic locking).
//
// Se escriben SOLO los campos acordados: tecnicoId, tecnicoNombre, operariaId,
// operariaNombre, auditoria (arrayUnion) y updatedAt. Nada más — fase, fecha,
// montos y pagos quedan intactos. El origen reagendar permite también fechaCita y
// restablece la fase agendado; no ofrece undo de fecha por el flujo del mapa.
//
// Control de versión ABA-safe:
//   - Preview captura `updateTime.seconds + nanoseconds` de la orden.
//   - Confirm re-tx.get del orden y compara seconds+nanoseconds; si cambió,
//     aborta con `codigo=cambio`.
//   - Al confirmar, también escribe un receipt doc dentro de la misma tx.
//     Fuera de tx, re-leemos la orden y el receipt: si ambos tienen el mismo
//     `updateTime`, nuestra tx fue la última y conocemos la versión exacta
//     escrita → emitimos `deshacer` con `updateSeconds/updateNanos`. Si otra
//     tx escribió DESPUÉS, el receipt y la orden divergen y respondemos con
//     `undoDisponible: false` (nunca ofrecer undo con triple ambigua).
//   - Deshacer EXIGE `esperado.updateSeconds + updateNanos`; el endpoint
//     rechaza undo si la orden ya quedó en otra versión.
//
// Guardas de bloqueo (fase 1): fase en {cerrado, cancelado, trabajo_realizado},
// eliminada, enStandby, o chequeo activo (`inicioChequeo` presente SIN
// reactivación posterior ni cierre registrado). No se infiere presencia por
// cotización/aprobación antigua (hallazgo QA 10).

export const config = { runtime: 'nodejs' } as const;

type Rol = 'administrador' | 'coordinadora' | 'operaria' | 'secretaria' | 'tecnico' | 'ayudante';

const ROLES_OFICINA: ReadonlySet<Rol> = new Set(['administrador', 'coordinadora', 'operaria', 'secretaria']);

const FASES_TERMINALES: ReadonlySet<string> = new Set(['cerrado', 'cancelado', 'trabajo_realizado']);

const PERMISOS_POR_ROL: Record<Rol, { ordenesModificar: boolean; ordenesModificarFueraGrupo: boolean }> = {
  administrador: { ordenesModificar: true, ordenesModificarFueraGrupo: true },
  coordinadora:  { ordenesModificar: true, ordenesModificarFueraGrupo: true },
  operaria:      { ordenesModificar: true, ordenesModificarFueraGrupo: true },
  secretaria:    { ordenesModificar: true, ordenesModificarFueraGrupo: false },
  tecnico:       { ordenesModificar: false, ordenesModificarFueraGrupo: false },
  ayudante:      { ordenesModificar: false, ordenesModificarFueraGrupo: false },
};

const TTL_PREVIEW_MS = 10 * 60 * 1000;
const MOTIVO_MAX = 300;
const DURACION_DEFAULT_MIN = 60;
const ORIGENES_VALIDOS: ReadonlySet<string> = new Set(['mapa', 'mapa_sugerencia', 'mapa_repartir', 'deshacer', 'reagendar']);
const PREVIEW_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UID_RE = /^[\w.-]{1,160}$/;

type Codigo =
  | 'bad_request'
  | 'destino_invalido'
  | 'tecnico_inactivo'
  | 'operaria_no_configurada'
  | 'operaria_cambio'
  | 'permiso'
  | 'motivo_requerido'
  | 'no_existe'
  | 'bloqueada'
  | 'cambio'
  | 'conflicto_agenda'
  | 'preview_vencido'
  | 'nada_que_cambiar'
  | 'red';

class ErrorReasignar extends Error {
  constructor(public status: number, public codigo: Codigo, mensaje: string) {
    super(mensaje);
  }
}

interface VersionDoc { seconds: number; nanos: number }

interface EsperadoPreview {
  tecnicoId: string | null;
  fase: string;
  fechaCitaMs: number | null;
  updateSeconds: number | null;
  updateNanos: number | null;
}

interface Conflicto {
  ordenId: string;
  clienteNombre: string;
  fechaCitaMs: number;
  duracionMin: number;
  fase: string;
}

interface PreviewPersistido {
  nuevaFechaCitaMs?: number;
  actorUid: string;
  ordenId: string;
  orderUpdateSeconds: number;
  orderUpdateNanos: number;
  anteriorTecnicoUid: string | null;
  anteriorTecnicoNombre: string | null;
  anteriorOperariaUid: string | null;
  anteriorOperariaNombre: string | null;
  destinoUid: string | null;
  destinoNombre: string | null;
  destinoOperariaUid: string | null;
  destinoOperariaNombre: string | null;
  fase: string;
  fechaCitaMs: number | null;
  duracionMin: number;
  cambioDeGrupo: boolean;
  requiereMotivoCambioGrupo: boolean;
  origen: string;
  motivoPrevio: string | null;
  conflictosObservados: Conflicto[];
  emitidoEnMs: number;
  ttlExpiraMs: number;
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  const raw = req.body;
  let parsed: unknown = raw;
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.length === 0)) return {};
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { throw new ErrorReasignar(400, 'bad_request', 'Cuerpo inválido (JSON malformado).'); }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ErrorReasignar(400, 'bad_request', 'Cuerpo inválido (se esperaba objeto).');
  }
  return parsed as Record<string, unknown>;
}

function asString(valor: unknown, max: number, campo: string, min = 1): string {
  if (typeof valor !== 'string') throw new ErrorReasignar(400, 'bad_request', `Campo inválido: ${campo}.`);
  const limpio = valor.trim();
  if (limpio.length < min || limpio.length > max) throw new ErrorReasignar(400, 'bad_request', `Campo inválido: ${campo}.`);
  return limpio;
}

function asOrdenId(valor: unknown): string {
  if (typeof valor !== 'string' || !UID_RE.test(valor)) {
    throw new ErrorReasignar(400, 'bad_request', 'ordenId inválido.');
  }
  return valor;
}

function asPreviewId(valor: unknown): string {
  if (typeof valor !== 'string' || !PREVIEW_ID_RE.test(valor)) {
    throw new ErrorReasignar(400, 'bad_request', 'previewId inválido.');
  }
  return valor;
}

function asMsOpcional(valor: unknown, campo: string): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || !Number.isSafeInteger(valor) || valor < 0) {
    throw new ErrorReasignar(400, 'bad_request', `Timestamp inválido: ${campo}.`);
  }
  return valor;
}

function asIntNoNegativo(valor: unknown, campo: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || !Number.isSafeInteger(valor) || valor < 0) {
    throw new ErrorReasignar(400, 'bad_request', `${campo} inválido.`);
  }
  return valor;
}

function duracionDeOrden(valor: unknown): number {
  if (valor === undefined || valor === null || valor === '') return DURACION_DEFAULT_MIN;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ErrorReasignar(409, 'bloqueada', 'La duración de la orden es inválida — corrige la cita antes de reasignar.');
  }
  return Math.round(n);
}

function msDeFirestore(valor: unknown): number | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor.getTime();
  const t = valor as { toMillis?: () => number };
  if (typeof t.toMillis === 'function') return t.toMillis();
  return null;
}

function diaRdDeMs(ms: number | null): string {
  if (ms === null) return 'sin-fecha';
  try {
    return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
  } catch {
    return 'sin-fecha';
  }
}

function permisosEfectivos(perfil: Record<string, unknown> | undefined): { ordenesModificar: boolean; ordenesModificarFueraGrupo: boolean } {
  if (!perfil) return { ordenesModificar: false, ordenesModificarFueraGrupo: false };
  const personalizado = perfil.permisosPersonalizados === true;
  const sistema = perfil.permisosSistema as Record<string, unknown> | undefined;
  if (personalizado && sistema) {
    return {
      ordenesModificar: sistema.ordenesModificar === true,
      ordenesModificarFueraGrupo: sistema.ordenesModificarFueraGrupo === true,
    };
  }
  const rol = perfil.rol as Rol;
  return PERMISOS_POR_ROL[rol] ?? { ordenesModificar: false, ordenesModificarFueraGrupo: false };
}

function esTerminal(fase: unknown): boolean {
  return typeof fase === 'string' && FASES_TERMINALES.has(fase);
}

function chequeoActivo(o: Record<string, unknown>): boolean {
  // Bloquea sólo cuando hay señal de visita EN PROGRESO.
  //
  // Modelo real `InicioChequeo = { fechaInicio, tecnicoId, tecnicoNombre, fotoUrl, ... }`.
  // Reglas (hallazgo QA 10 + revisión Codex 3):
  //   - Sin `inicioChequeo` → no activo.
  //   - Si `inicioChequeo.fechaInicio` NO tiene timestamp parseable → no inferimos
  //     presencia física (hallazgo 10: "no inferir presencia por fase o campo libre").
  //   - Si existe `cierreServicio.fechaCierre` posterior o igual al inicio del chequeo
  //     → el chequeo ya se cerró, no bloquea.
  //   - Si existe `reactivadaPostChequeoEn` posterior o igual al inicio del chequeo
  //     → el chequeo quedó histórico y la orden se reactivó, no bloquea.
  //   - Si el `fechaInicio` ES POSTERIOR a cualquier reactivación/cierre registrado
  //     (p. ej. el técnico reinició un chequeo nuevo tras reactivar la orden),
  //     el chequeo sí está activo → bloquea.
  if (!o.inicioChequeo || typeof o.inicioChequeo !== 'object') return false;
  const ic = o.inicioChequeo as Record<string, unknown>;
  const inicioMs = msDeFirestore(ic.fechaInicio);
  if (inicioMs === null) return false;
  const reactivadaMs = msDeFirestore(o.reactivadaPostChequeoEn);
  const cierreServicio = o.cierreServicio && typeof o.cierreServicio === 'object' ? (o.cierreServicio as Record<string, unknown>) : null;
  const cierreMs = cierreServicio ? msDeFirestore(cierreServicio.fechaCierre) : null;
  if (reactivadaMs !== null && inicioMs <= reactivadaMs) return false;
  if (cierreMs !== null && inicioMs <= cierreMs) return false;
  return true;
}

function registroAuditoria(args: {
  usuario: string;
  detalle: string;
  valorAnterior: string;
  valorNuevo: string;
}): Record<string, unknown> {
  // Shape idéntico a `crearRegistroAuditoria` en src/utils/index.ts (campo `fecha`,
  // no `timestamp`; strings "" se persisten como null; `accion = 'editar'`).
  return {
    fecha: Timestamp.now(),
    usuario: args.usuario,
    accion: 'editar',
    campo: 'tecnico',
    valorAnterior: args.valorAnterior || null,
    valorNuevo: args.valorNuevo || null,
    detalle: args.detalle,
  };
}

const ETIQUETA_ORIGEN: Record<string, string> = {
  reagendar: 'Reagendamiento de visita',
  mapa: 'Reasignación desde mapa',
  mapa_sugerencia: 'Reasignación desde mapa (sugerida por atraso)',
  mapa_repartir: 'Reasignación desde mapa (repartir el día)',
  deshacer: 'Reasignación deshecha desde mapa',
};

function versionDeSnap(snap: DocumentSnapshot | QueryDocumentSnapshot, contexto: string): VersionDoc {
  const ts = snap.updateTime;
  if (!ts) throw new ErrorReasignar(500, 'red', `Firestore no devolvió updateTime en ${contexto}.`);
  return { seconds: ts.seconds, nanos: ts.nanoseconds };
}

function versionIgual(a: VersionDoc, b: VersionDoc): boolean {
  return a.seconds === b.seconds && a.nanos === b.nanos;
}

async function cargarPerfilPersonal(db: Firestore, uid: string): Promise<Record<string, unknown> | null> {
  const q = await db.collection('personal').where('uid', '==', uid).limit(1).get();
  const doc = q.docs[0];
  return doc?.data() ?? null;
}

async function cargarPerfilPersonalTx(db: Firestore, tx: Transaction, uid: string): Promise<Record<string, unknown> | null> {
  const q = await tx.get(db.collection('personal').where('uid', '==', uid).limit(1));
  const doc = q.docs[0];
  return doc?.data() ?? null;
}

// IDs legacy del técnico destino. Órdenes antiguas guardan `tecnicoId` como `personal.id`
// (pre-SPRINT-108). La agenda debe consultar también esos IDs para no omitir conflictos.
async function idsLegacyDePersonal(db: Firestore, uid: string): Promise<string[]> {
  const q = await db.collection('personal').where('uid', '==', uid).get();
  const resultado: string[] = [];
  for (const d of q.docs) {
    if (d.id !== uid) resultado.push(d.id);
  }
  return resultado;
}

async function idsLegacyDePersonalTx(db: Firestore, tx: Transaction, uid: string): Promise<string[]> {
  const q = await tx.get(db.collection('personal').where('uid', '==', uid));
  const resultado: string[] = [];
  for (const d of q.docs) {
    if (d.id !== uid) resultado.push(d.id);
  }
  return resultado;
}

// Resuelve un `tecnicoId` posiblemente legacy (`personal.id`) a su `auth.uid` autorizado.
// - Si `idOrUid` ya es un UID válido en `usuarios` con rol=tecnico activo → se devuelve tal cual.
// - Si no, se busca `personal/{idOrUid}` y, si tiene `uid` apuntado a un técnico activo, se devuelve ese UID.
// - Si no hay UID autorizado (técnico eliminado, personal huérfano, etc.) → null.
async function resolverUidTecnicoAutorizado(db: Firestore, idOrUid: string): Promise<string | null> {
  if (!idOrUid) return null;
  const u = await db.collection('usuarios').doc(idOrUid).get();
  if (u.exists) {
    const d = u.data() ?? {};
    if (d.rol === 'tecnico' && d.activo !== false && d.eliminado !== true) return idOrUid;
  }
  const p = await db.collection('personal').doc(idOrUid).get();
  if (p.exists) {
    const d = p.data() ?? {};
    const uid = typeof d.uid === 'string' ? d.uid : null;
    if (uid) {
      const u2 = await db.collection('usuarios').doc(uid).get();
      if (u2.exists) {
        const dd = u2.data() ?? {};
        if (dd.rol === 'tecnico' && dd.activo !== false && dd.eliminado !== true) return uid;
      }
    }
  }
  return null;
}

type EquipoActor = { kind: 'todos' } | { kind: 'uid'; uid: string };

async function equipoDelActor(db: Firestore, uid: string, rol: Rol): Promise<EquipoActor> {
  if (rol === 'administrador' || rol === 'coordinadora') return { kind: 'todos' };
  if (rol === 'operaria') return { kind: 'uid', uid };
  if (rol === 'secretaria') {
    const personal = await cargarPerfilPersonal(db, uid);
    const operariaId = personal?.operariaId;
    if (typeof operariaId !== 'string' || operariaId.length === 0) {
      throw new ErrorReasignar(403, 'permiso', 'Tu usuario no tiene equipo configurado en Personal (operariaId).');
    }
    return { kind: 'uid', uid: operariaId };
  }
  throw new ErrorReasignar(403, 'permiso', 'Rol sin equipo asignable.');
}

function validarPertenencia(args: {
  equipo: EquipoActor;
  tieneFueraGrupo: boolean;
  anteriorOperariaUid: string | null;
  destinoOperariaUid: string | null;
}): void {
  if (args.equipo.kind === 'todos') return;
  if (args.tieneFueraGrupo) return;
  const miEquipo = args.equipo.uid;
  if (args.anteriorOperariaUid !== null && args.anteriorOperariaUid !== miEquipo) {
    throw new ErrorReasignar(403, 'permiso', 'La orden pertenece a otro equipo y no tienes permiso fuera de grupo.');
  }
  if (args.destinoOperariaUid !== null && args.destinoOperariaUid !== miEquipo) {
    throw new ErrorReasignar(403, 'permiso', 'El técnico destino pertenece a otro equipo y no tienes permiso fuera de grupo.');
  }
}

async function cargarDestinoUsuario(db: Firestore, destinoUid: string): Promise<{ uid: string; nombre: string }> {
  const snap = await db.collection('usuarios').doc(destinoUid).get();
  const data = snap.data();
  if (!snap.exists || !data) throw new ErrorReasignar(400, 'destino_invalido', 'Técnico destino no encontrado en usuarios.');
  if (data.rol !== 'tecnico') throw new ErrorReasignar(400, 'destino_invalido', 'El destino no es un técnico.');
  if (data.activo === false || data.eliminado === true) throw new ErrorReasignar(409, 'tecnico_inactivo', 'El técnico destino está inactivo en usuarios.');
  const nombre = typeof data.nombre === 'string' && data.nombre.length > 0 ? data.nombre : 'Técnico';
  return { uid: destinoUid, nombre };
}

async function validarDestinoPersonalActivo(db: Firestore, destinoUid: string): Promise<void> {
  const personal = await cargarPerfilPersonal(db, destinoUid);
  if (!personal) throw new ErrorReasignar(409, 'tecnico_inactivo', 'El técnico destino no existe en Personal.');
  if (personal.activo === false || personal.eliminado === true) {
    throw new ErrorReasignar(409, 'tecnico_inactivo', 'El técnico destino está inactivo en Personal.');
  }
}

async function validarDestinoPersonalActivoTx(db: Firestore, tx: Transaction, destinoUid: string): Promise<void> {
  const personal = await cargarPerfilPersonalTx(db, tx, destinoUid);
  if (!personal) throw new ErrorReasignar(409, 'tecnico_inactivo', 'El técnico destino no existe en Personal.');
  if (personal.activo === false || personal.eliminado === true) {
    throw new ErrorReasignar(409, 'tecnico_inactivo', 'El técnico destino está inactivo en Personal.');
  }
}

async function cargarOperariaDestinoTx(db: Firestore, tx: Transaction, destinoUid: string): Promise<{ uid: string; nombre: string }> {
  try {
    return await operariaDeTecnico(db, tx, destinoUid);
  } catch (e) {
    if (e instanceof ErrorAcceso) throw new ErrorReasignar(409, 'operaria_no_configurada', e.message);
    throw new ErrorReasignar(500, 'red', 'No se pudo resolver la operaria del destino.');
  }
}

function detectarConflictos(args: {
  ordenMovidaId: string;
  fechaCitaMs: number | null;
  duracionMin: number;
  docs: QueryDocumentSnapshot[];
}): Conflicto[] {
  if (args.fechaCitaMs === null) return [];
  const inicioA = args.fechaCitaMs;
  const finA = inicioA + args.duracionMin * 60000;
  const resultados: Conflicto[] = [];
  for (const d of args.docs) {
    if (d.id === args.ordenMovidaId) continue;
    const data = d.data();
    if (data.eliminada === true) continue;
    if (esTerminal(data.fase)) continue;
    if (data.enStandby === true || data.visitaCancelada) continue;
    const inicioB = msDeFirestore(data.fechaCita);
    if (inicioB === null) continue;
    const duracionBraw = data.duracionMin;
    let duracionB: number;
    if (duracionBraw === undefined || duracionBraw === null || duracionBraw === '') {
      duracionB = DURACION_DEFAULT_MIN;
    } else {
      const n = Number(duracionBraw);
      duracionB = Number.isFinite(n) && n > 0 ? Math.round(n) : DURACION_DEFAULT_MIN;
    }
    const finB = inicioB + duracionB * 60000;
    if (inicioA < finB && inicioB < finA) {
      resultados.push({
        ordenId: d.id,
        clienteNombre: typeof data.clienteNombre === 'string' ? data.clienteNombre : '',
        fechaCitaMs: inicioB,
        duracionMin: duracionB,
        fase: typeof data.fase === 'string' ? data.fase : '',
      });
    }
  }
  return resultados;
}

function parseEsperado(raw: unknown): EsperadoPreview {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ErrorReasignar(400, 'bad_request', 'Falta esperado.');
  }
  const esperado = raw as Record<string, unknown>;
  const fase = asString(esperado.fase, 60, 'esperado.fase');
  const tecnicoId = esperado.tecnicoId === null
    ? null
    : (typeof esperado.tecnicoId === 'string' && esperado.tecnicoId.length <= 160 && UID_RE.test(esperado.tecnicoId)
      ? esperado.tecnicoId
      : (() => { throw new ErrorReasignar(400, 'bad_request', 'esperado.tecnicoId inválido.'); })());
  const fechaCitaMs = asMsOpcional(esperado.fechaCitaMs, 'esperado.fechaCitaMs');
  let updateSeconds: number | null = null;
  let updateNanos: number | null = null;
  if (esperado.updateSeconds !== undefined && esperado.updateSeconds !== null) {
    updateSeconds = asIntNoNegativo(esperado.updateSeconds, 'esperado.updateSeconds');
  }
  if (esperado.updateNanos !== undefined && esperado.updateNanos !== null) {
    updateNanos = asIntNoNegativo(esperado.updateNanos, 'esperado.updateNanos');
    if (updateNanos >= 1_000_000_000) throw new ErrorReasignar(400, 'bad_request', 'esperado.updateNanos fuera de rango.');
  }
  if ((updateSeconds === null) !== (updateNanos === null)) {
    throw new ErrorReasignar(400, 'bad_request', 'esperado.updateSeconds y updateNanos deben ir juntos.');
  }
  return { tecnicoId, fase, fechaCitaMs, updateSeconds, updateNanos };
}

async function manejarPreview(args: {
  req: VercelRequest;
  db: Firestore;
  uid: string;
  perfil: Record<string, unknown>;
  rol: Rol;
}): Promise<Record<string, unknown>> {
  const { db, uid, perfil, rol } = args;
  const body = parseBody(args.req);
  const permisos = permisosEfectivos(perfil);
  if (!permisos.ordenesModificar) throw new ErrorReasignar(403, 'permiso', 'No tienes permiso para reasignar órdenes.');

  const ordenId = asOrdenId(body.ordenId);
  const estado = parseEsperado(body.esperado);
  const origen = asString(body.origen, 60, 'origen');
  if (!ORIGENES_VALIDOS.has(origen)) throw new ErrorReasignar(400, 'bad_request', 'origen inválido.');

  const nuevaFechaCitaMs = origen === 'reagendar' ? asMsOpcional(body.nuevaFechaCitaMs, 'nuevaFechaCitaMs') : null;
  if (origen === 'reagendar') {
    if (nuevaFechaCitaMs === null) throw new ErrorReasignar(400, 'bad_request', 'Selecciona la nueva fecha.');
    const rd = new Date(nuevaFechaCitaMs - 4 * 3600000);
    if (rd.getUTCHours() < 9 || rd.getUTCHours() > 18 || rd.getUTCMinutes() !== 0 || rd.getUTCSeconds() !== 0 || rd.getUTCMilliseconds() !== 0 || nuevaFechaCitaMs <= Date.now()) {
      throw new ErrorReasignar(400, 'bad_request', 'Selecciona una fecha futura y una hora en punto entre 9 AM y 6 PM.');
    }
    if (!body.destinoUid) throw new ErrorReasignar(400, 'destino_invalido', 'Selecciona un técnico para consultar su agenda.');
  }

  const destinoUid: string | null = body.destinoUid === null
    ? null
    : (typeof body.destinoUid === 'string' && UID_RE.test(body.destinoUid) ? body.destinoUid : (() => { throw new ErrorReasignar(400, 'bad_request', 'destinoUid inválido.'); })());

  let motivoPrevio: string | null = null;
  if (body.motivo !== undefined && body.motivo !== null) {
    if (typeof body.motivo !== 'string') throw new ErrorReasignar(400, 'bad_request', 'motivo debe ser string.');
    const limpio = body.motivo.trim();
    if (limpio.length > MOTIVO_MAX) throw new ErrorReasignar(400, 'bad_request', `motivo supera ${MOTIVO_MAX} caracteres.`);
    motivoPrevio = limpio.length > 0 ? limpio : null;
  }

  if (origen === 'deshacer' && (estado.updateSeconds === null || estado.updateNanos === null)) {
    throw new ErrorReasignar(400, 'bad_request', 'Deshacer requiere esperado.updateSeconds + updateNanos.');
  }

  // Lectura de la orden (sin tx — es sólo preview).
  const ordenSnap = await db.collection('ordenes_servicio').doc(ordenId).get();
  if (!ordenSnap.exists) throw new ErrorReasignar(404, 'no_existe', 'La orden no existe.');
  const orden = ordenSnap.data() as Record<string, unknown>;
  const version = versionDeSnap(ordenSnap, 'preview.orden');

  if (orden.eliminada === true) throw new ErrorReasignar(409, 'bloqueada', 'La orden fue eliminada.');
  if (esTerminal(orden.fase)) throw new ErrorReasignar(409, 'bloqueada', 'El trabajo ya se cerró o canceló.');
  if (orden.enStandby === true) throw new ErrorReasignar(409, 'bloqueada', 'La orden está en standby — reanúdala antes de reasignar.');
  if (chequeoActivo(orden)) {
    throw new ErrorReasignar(409, 'bloqueada', 'El técnico está en una visita activa en el sitio — no se puede reasignar hasta que la cierre o se reactive la orden.');
  }

  const faseActual = typeof orden.fase === 'string' ? orden.fase : '';
  const fechaCitaMsActual = msDeFirestore(orden.fechaCita);
  const tecnicoActual = typeof orden.tecnicoId === 'string' && orden.tecnicoId.length > 0 ? orden.tecnicoId : null;
  if ((tecnicoActual ?? null) !== estado.tecnicoId || faseActual !== estado.fase || fechaCitaMsActual !== estado.fechaCitaMs) {
    throw new ErrorReasignar(409, 'cambio', 'La orden cambió desde que la viste. Refresca el mapa.');
  }
  if (estado.updateSeconds !== null && estado.updateNanos !== null) {
    if (!versionIgual(version, { seconds: estado.updateSeconds, nanos: estado.updateNanos })) {
      throw new ErrorReasignar(409, 'cambio', 'La versión de la orden ya no coincide. Refresca el mapa.');
    }
  }

  if ((destinoUid ?? null) === tecnicoActual && origen !== 'reagendar') {
    throw new ErrorReasignar(400, 'nada_que_cambiar', 'La orden ya está asignada a ese técnico.');
  }

  const duracionMinOrden = duracionDeOrden(orden.duracionMin);

  let destinoNombre: string | null = null;
  let destinoOperariaUid: string | null = null;
  let destinoOperariaNombre: string | null = null;
  if (destinoUid) {
    const u = await cargarDestinoUsuario(db, destinoUid);
    destinoNombre = u.nombre;
    await validarDestinoPersonalActivo(db, destinoUid);
    const operaria = await db.runTransaction(async tx => operariaDeTecnico(db, tx, destinoUid))
      .catch((e: unknown) => { if (e instanceof ErrorAcceso) throw new ErrorReasignar(409, 'operaria_no_configurada', e.message); throw e; });
    destinoOperariaUid = operaria.uid;
    destinoOperariaNombre = operaria.nombre;
  }

  const anteriorOperariaUid = typeof orden.operariaId === 'string' && orden.operariaId.length > 0 ? orden.operariaId : null;
  const anteriorOperariaNombre = typeof orden.operariaNombre === 'string' ? orden.operariaNombre : null;
  const cambioDeGrupo = (anteriorOperariaUid ?? null) !== (destinoOperariaUid ?? null);

  // Permiso fueraGrupo: respeta el flag efectivo del actor (incluye overrides
  // personalizados). Admin/coord con override false TAMBIÉN quedan bloqueados.
  if (cambioDeGrupo && !permisos.ordenesModificarFueraGrupo) {
    throw new ErrorReasignar(403, 'permiso', 'No tienes permiso ordenesModificarFueraGrupo para cambiar la orden de equipo.');
  }

  // Pertenencia del actor: si no tiene fueraGrupo y no es admin/coord, debe
  // pertenecer al equipo origen Y al equipo destino. Esto bloquea el caso de
  // una secretaria moviendo órdenes de otro equipo a su propio equipo (o
  // viceversa) cuando ambos extremos no incluyen al actor.
  const equipo = await equipoDelActor(db, uid, rol);
  validarPertenencia({ equipo, tieneFueraGrupo: permisos.ordenesModificarFueraGrupo, anteriorOperariaUid, destinoOperariaUid });

  const requiereMotivoCambioGrupo = cambioDeGrupo;

  const fechaDestinoMs = nuevaFechaCitaMs ?? fechaCitaMsActual;
  let agendaDocs: QueryDocumentSnapshot[] = [];
  let conflictos: Conflicto[] = [];
  if (destinoUid && fechaDestinoMs !== null) {
    // Órdenes legacy guardan `tecnicoId` como `personal.id` (pre-SPRINT-108).
    // Consultamos el UID actual + todos los personal docs vinculados.
    const idsLegacy = await idsLegacyDePersonal(db, destinoUid);
    const todosLosIds = [destinoUid, ...idsLegacy];
    const resultados = await Promise.all(
      todosLosIds.map(id => db.collection('ordenes_servicio').where('tecnicoId', '==', id).get()),
    );
    const vistos = new Set<string>();
    const docsUnicos: QueryDocumentSnapshot[] = [];
    for (const r of resultados) {
      for (const d of r.docs) {
        if (!vistos.has(d.id)) { vistos.add(d.id); docsUnicos.push(d); }
      }
    }
    agendaDocs = docsUnicos;
    conflictos = detectarConflictos({
      ordenMovidaId: ordenId,
      fechaCitaMs: fechaDestinoMs,
      duracionMin: duracionMinOrden,
      docs: docsUnicos,
    });
  }

  if (body.consultarDisponibilidad === true && origen === 'reagendar' && fechaDestinoMs !== null) {
    const dia = diaRdDeMs(fechaDestinoMs);
    const horarios = Array.from({ length: 10 }, (_, i) => {
      const hora = `${String(i + 9).padStart(2, '0')}:00`;
      const ms = new Date(`${dia}T${hora}:00-04:00`).getTime();
      const ocupadas = detectarConflictos({ ordenMovidaId: ordenId, fechaCitaMs: ms, duracionMin: duracionMinOrden, docs: agendaDocs });
      return { hora, disponible: ms > Date.now() && ocupadas.length === 0, citas: ocupadas };
    });
    return { ok: true, horarios, duracionMin: duracionMinOrden };
  }
  if (origen === 'reagendar' && !motivoPrevio) throw new ErrorReasignar(400, 'motivo_requerido', 'Indica el motivo del reagendamiento.');
  const previewId = randomUUID();
  const emitidoEnMs = Date.now();
  const ttlExpiraMs = emitidoEnMs + TTL_PREVIEW_MS;
  const payload: PreviewPersistido = {
    ...(nuevaFechaCitaMs !== null ? { nuevaFechaCitaMs } : {}),
    actorUid: uid,
    ordenId,
    orderUpdateSeconds: version.seconds,
    orderUpdateNanos: version.nanos,
    anteriorTecnicoUid: tecnicoActual,
    anteriorTecnicoNombre: typeof orden.tecnicoNombre === 'string' ? orden.tecnicoNombre : null,
    anteriorOperariaUid,
    anteriorOperariaNombre,
    destinoUid: destinoUid,
    destinoNombre,
    destinoOperariaUid,
    destinoOperariaNombre,
    fase: faseActual,
    fechaCitaMs: fechaCitaMsActual,
    duracionMin: duracionMinOrden,
    cambioDeGrupo,
    requiereMotivoCambioGrupo,
    origen,
    motivoPrevio,
    conflictosObservados: conflictos,
    emitidoEnMs,
    ttlExpiraMs,
  };

  await db.collection('config_mapa').doc(`mapa_preview_${previewId}`).set({
    ...payload,
    emitidoEn: Timestamp.fromMillis(emitidoEnMs),
    ttlExpira: Timestamp.fromMillis(ttlExpiraMs),
  });

  return {
    ok: true,
    previewId,
    ttlMs: TTL_PREVIEW_MS,
    emitidoEnMs,
    orden: {
      ordenId,
      fase: faseActual,
      fechaCitaMs: fechaCitaMsActual,
      duracionMin: duracionMinOrden,
      version: { seconds: version.seconds, nanos: version.nanos },
      tecnicoAnterior: tecnicoActual ? { uid: tecnicoActual, nombre: payload.anteriorTecnicoNombre } : null,
      operariaAnterior: anteriorOperariaUid ? { uid: anteriorOperariaUid, nombre: anteriorOperariaNombre } : null,
    },
    destino: destinoUid ? {
      uid: destinoUid,
      nombre: destinoNombre,
      operariaUid: destinoOperariaUid,
      operariaNombre: destinoOperariaNombre,
    } : null,
    conflictos,
    cambioDeGrupo,
    requiereMotivoCambioGrupo,
  };
}

async function manejarConfirmar(args: {
  req: VercelRequest;
  db: Firestore;
  uid: string;
  perfil: Record<string, unknown>;
  rol: Rol;
  nombreActor: string;
}): Promise<Record<string, unknown>> {
  const { db, uid, perfil, rol, nombreActor } = args;
  const body = parseBody(args.req);
  const permisos = permisosEfectivos(perfil);
  if (!permisos.ordenesModificar) throw new ErrorReasignar(403, 'permiso', 'No tienes permiso para reasignar órdenes.');

  const previewId = asPreviewId(body.previewId);
  let motivoNuevo: string | null = null;
  if (body.motivo !== undefined && body.motivo !== null) {
    if (typeof body.motivo !== 'string') throw new ErrorReasignar(400, 'bad_request', 'motivo debe ser string.');
    const limpio = body.motivo.trim();
    if (limpio.length > MOTIVO_MAX) throw new ErrorReasignar(400, 'bad_request', `motivo supera ${MOTIVO_MAX} caracteres.`);
    motivoNuevo = limpio.length > 0 ? limpio : null;
  }

  const previewRef = db.collection('config_mapa').doc(`mapa_preview_${previewId}`);
  const receiptRef = db.collection('config_mapa').doc(`mapa_write_${previewId}`);
  const equipo = await equipoDelActor(db, uid, rol);

  const resultadoTx = await db.runTransaction(async tx => {
    const previewSnap = await tx.get(previewRef);
    if (!previewSnap.exists) throw new ErrorReasignar(409, 'preview_vencido', 'El preview ya no está disponible — vuelve a arrastrar la orden.');
    const prev = previewSnap.data() as PreviewPersistido | undefined;
    if (!prev) throw new ErrorReasignar(409, 'preview_vencido', 'El preview ya no está disponible.');
    if (prev.actorUid !== uid) throw new ErrorReasignar(403, 'permiso', 'Este preview pertenece a otra sesión.');
    if (Date.now() > prev.ttlExpiraMs) throw new ErrorReasignar(409, 'preview_vencido', 'El preview venció — vuelve a arrastrar.');

    const motivoEfectivo = motivoNuevo ?? prev.motivoPrevio;

    if (prev.cambioDeGrupo && !permisos.ordenesModificarFueraGrupo) {
      throw new ErrorReasignar(403, 'permiso', 'No tienes permiso ordenesModificarFueraGrupo para confirmar este cambio de equipo.');
    }
    validarPertenencia({
      equipo,
      tieneFueraGrupo: permisos.ordenesModificarFueraGrupo,
      anteriorOperariaUid: prev.anteriorOperariaUid,
      destinoOperariaUid: prev.destinoOperariaUid,
    });
    if (prev.requiereMotivoCambioGrupo && (!motivoEfectivo || motivoEfectivo.length === 0)) {
      throw new ErrorReasignar(400, 'motivo_requerido', 'Explica brevemente por qué cambias de grupo.');
    }

    const ordenRef = db.collection('ordenes_servicio').doc(prev.ordenId);
    const ordenSnap = await tx.get(ordenRef);
    if (!ordenSnap.exists) throw new ErrorReasignar(404, 'no_existe', 'La orden ya no existe.');
    const o = ordenSnap.data() as Record<string, unknown>;
    const ahora = versionDeSnap(ordenSnap, 'confirm.orden');
    if (!versionIgual(ahora, { seconds: prev.orderUpdateSeconds, nanos: prev.orderUpdateNanos })) {
      throw new ErrorReasignar(409, 'cambio', 'La orden cambió mientras preparabas el movimiento. Refresca el mapa.');
    }
    if (o.eliminada === true) throw new ErrorReasignar(409, 'bloqueada', 'La orden fue eliminada.');
    if (esTerminal(o.fase)) throw new ErrorReasignar(409, 'bloqueada', 'El trabajo ya se cerró o canceló.');
    if (o.enStandby === true) throw new ErrorReasignar(409, 'bloqueada', 'La orden está en standby.');
    if (chequeoActivo(o)) throw new ErrorReasignar(409, 'bloqueada', 'El técnico está en una visita activa en el sitio.');

    // Revalidar destino (usuarios + personal activos) y re-resolver operaria.
    let destinoNombreFinal: string | null = null;
    let operariaFinal: { uid: string; nombre: string } | null = null;
    if (prev.destinoUid) {
      const destinoSnap = await tx.get(db.collection('usuarios').doc(prev.destinoUid));
      const destinoData = destinoSnap.data();
      if (!destinoSnap.exists || !destinoData) throw new ErrorReasignar(400, 'destino_invalido', 'Técnico destino ya no existe.');
      if (destinoData.rol !== 'tecnico') throw new ErrorReasignar(400, 'destino_invalido', 'El destino no es un técnico.');
      if (destinoData.activo === false || destinoData.eliminado === true) throw new ErrorReasignar(409, 'tecnico_inactivo', 'El técnico destino quedó inactivo en usuarios.');
      destinoNombreFinal = typeof destinoData.nombre === 'string' && destinoData.nombre.length > 0 ? destinoData.nombre : 'Técnico';
      await validarDestinoPersonalActivoTx(db, tx, prev.destinoUid);
      operariaFinal = await cargarOperariaDestinoTx(db, tx, prev.destinoUid);
      if ((operariaFinal.uid !== (prev.destinoOperariaUid ?? '')) || (operariaFinal.nombre !== (prev.destinoOperariaNombre ?? ''))) {
        throw new ErrorReasignar(409, 'operaria_cambio', 'La operaria responsable del técnico destino cambió. Vuelve a arrastrar para revisar.');
      }
    } else if (prev.destinoOperariaUid !== null || prev.destinoOperariaNombre !== null) {
      throw new ErrorReasignar(500, 'red', 'Inconsistencia interna en el preview (sin destino pero con operaria).');
    }

    const fechaDestinoMs = prev.nuevaFechaCitaMs ?? prev.fechaCitaMs;
    if (prev.origen === 'reagendar' && (fechaDestinoMs === null || fechaDestinoMs <= Date.now())) throw new ErrorReasignar(409, 'cambio', 'El horario seleccionado ya pasó.');

    // Agenda overlap re-chequeo (incluye órdenes legacy con `tecnicoId` apuntando
    // a `personal.id` del destino). Bloqueamos siempre si hay solape.
    if (prev.destinoUid && fechaDestinoMs !== null) {
      const idsLegacy = await idsLegacyDePersonalTx(db, tx, prev.destinoUid);
      const todosLosIds = [prev.destinoUid, ...idsLegacy];
      const resultados = await Promise.all(
        todosLosIds.map(id => tx.get(db.collection('ordenes_servicio').where('tecnicoId', '==', id))),
      );
      const vistos = new Set<string>();
      const docsUnicos: QueryDocumentSnapshot[] = [];
      for (const r of resultados) {
        for (const d of r.docs) {
          if (!vistos.has(d.id)) { vistos.add(d.id); docsUnicos.push(d); }
        }
      }
      const conflictos = detectarConflictos({
        ordenMovidaId: prev.ordenId,
        fechaCitaMs: fechaDestinoMs,
        duracionMin: prev.duracionMin,
        docs: docsUnicos,
      });
      if (conflictos.length > 0) {
        throw new ErrorReasignar(409, 'conflicto_agenda', 'El técnico destino tiene otra orden en ese horario.');
      }
    }

    // El cambio de técnico desde una orden también mueve la responsabilidad
    // del CRM y sus chats; las lecturas deben ocurrir antes de cualquier write.
    const sincronizarCrm = prev.origen === 'reagendar' && prev.destinoUid !== prev.anteriorTecnicoUid && operariaFinal !== null;
    const crmRef = db.collection('crm_ordenes').doc(prev.ordenId);
    const crmAnterior = sincronizarCrm ? await tx.get(crmRef) : null;
    const telefono = normalizarTelefono(typeof o.clienteTelefono === 'string' ? o.clienteTelefono : '');
    const chats: QueryDocumentSnapshot[] = [];
    if (sincronizarCrm && telefono.length === 10) {
      const conversaciones = await Promise.all([telefono, '1' + telefono].map(tel => tx.get(db.collection('whatsapp_conversaciones').where('wa_id', '==', tel))));
      for (const q of conversaciones) for (const d of q.docs) if (!chats.some(c => c.id === d.id)) chats.push(d);
    }
    const estadosChat = await Promise.all(chats.map(d => tx.get(db.collection('crm_atencion').doc(d.id))));

    // Lock por técnico/día: increment compartido. Dos tx concurrentes al mismo
    // destinoUid+día chocan por el counter y Firestore reintenta.
    if (prev.destinoUid) {
      const dia = diaRdDeMs(fechaDestinoMs);
      const lockRef = db.collection('config_mapa').doc(`lock_tecnico_${prev.destinoUid}_dia_${dia}`);
      await tx.get(lockRef);
      tx.set(lockRef, {
        version: FieldValue.increment(1),
        ultimoActor: uid,
        ultimaOrden: prev.ordenId,
        ultimaAccion: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    if (sincronizarCrm && operariaFinal) {
      tx.set(crmRef, { responsableId: operariaFinal.uid, responsableNombre: operariaFinal.nombre, revision: null, version: (Number(crmAnterior?.data()?.version) || 0) + 1 }, { merge: true });
      for (const [i, chat] of chats.entries()) {
        tx.update(chat.ref, { asignadaA: operariaFinal.uid });
        tx.set(db.collection('crm_atencion').doc(chat.id), { responsableId: operariaFinal.uid, responsableNombre: operariaFinal.nombre, traspaso: null, pendiente: true, version: (Number(estadosChat[i].data()?.version) || 0) + 1, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(db.collection('crm_chat_rutas').doc(chat.id), { ordenId: prev.ordenId, desdeMs: Date.now(), actualizadoPor: uid }, { merge: true });
      }
    }

    // Receipt para re-leer el commit time exacto fuera de tx (undo ABA-safe).
    tx.set(receiptRef, {
      actorUid: uid,
      ordenId: prev.ordenId,
      previewId,
      writeTs: FieldValue.serverTimestamp(),
    });

    const detalle = (motivoEfectivo && motivoEfectivo.length > 0)
      ? `${ETIQUETA_ORIGEN[prev.origen] ?? ETIQUETA_ORIGEN.mapa} — ${motivoEfectivo}`
      : (ETIQUETA_ORIGEN[prev.origen] ?? ETIQUETA_ORIGEN.mapa);
    const auditoriaItem = registroAuditoria({
      usuario: nombreActor,
      detalle,
      valorAnterior: prev.anteriorTecnicoNombre ?? '',
      valorNuevo: destinoNombreFinal ?? 'Sin técnico',
    });

    const reagendamiento = prev.origen === 'reagendar' && fechaDestinoMs !== null ? {
      fechaCita: Timestamp.fromMillis(fechaDestinoMs),
      reagendada: true,
      visitaFallida: null,
      visitaCancelada: null,
      fase: 'agendado', estadoSimple: 'pendiente', estado: 'activo',
      historialFases: FieldValue.arrayUnion({ fase: 'agendado', timestamp: Timestamp.now(), usuario: nombreActor, nota: `Reagendada: ${motivoEfectivo}` }),
      ...(o.tokenPortalCliente ? {} : { tokenPortalCliente: randomUUID().replace(/-/g, '') }),
    } : {};
    if (prev.origen === 'reagendar') {
      auditoriaItem.campo = 'fechaCita';
      auditoriaItem.valorAnterior = prev.fechaCitaMs === null ? null : new Date(prev.fechaCitaMs).toISOString();
      auditoriaItem.valorNuevo = new Date(fechaDestinoMs!).toISOString();
    }
    tx.update(ordenRef, {
      ...reagendamiento,
      ...(sincronizarCrm && operariaFinal ? { responsableId: operariaFinal.uid, responsableNombre: operariaFinal.nombre } : {}),
      tecnicoId: prev.destinoUid,
      tecnicoNombre: destinoNombreFinal,
      operariaId: operariaFinal ? operariaFinal.uid : null,
      operariaNombre: operariaFinal ? operariaFinal.nombre : null,
      auditoria: FieldValue.arrayUnion(auditoriaItem),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (prev.origen === 'reagendar' && prev.destinoUid) {
      tx.set(db.collection('notificaciones').doc(`reagendar_${previewId}_${prev.destinoUid}`), {
        userId: prev.destinoUid, tipo: 'orden_asignada', titulo: 'Visita reagendada',
        mensaje: `${String(o.clienteNombre || 'Cliente')} · Revisa la nueva fecha y hora de la visita.`,
        ordenId: prev.ordenId, leida: false, createdAt: FieldValue.serverTimestamp(),
      });
    }
    tx.delete(previewRef);

    return {
      prev,
      ordenRef,
      aplicadoMs: Date.now(),
    };
  });

  // Fuera de tx: leemos el commit time exacto desde el receipt y verificamos
  // que la orden siga en ese updateTime. Si otra tx escribió después, NO
  // ofrecemos undo (no sabemos la versión exacta para una triple segura).
  // Además, si `anteriorTecnicoUid` apunta a un `personal.id` legacy, lo
  // resolvemos a su `auth.uid`; si no hay UID autorizado, undo no disponible.
  let undoDisponible = false;
  let motivoUndoNoDisponible:
    | 'orden_cambio_despues'
    | 'firestore_sin_updateTime'
    | 'tecnico_anterior_legacy_sin_uid'
    | null = null;
  let commit: VersionDoc | null = null;
  let deshacer: Record<string, unknown> | null = null;
  try {
    if (resultadoTx.prev.origen === 'reagendar') return { ok: true, aplicadoMs: resultadoTx.aplicadoMs, commit: null, undoDisponible: false, deshacer: null };
    const [ordenAfter, receiptAfter] = await Promise.all([
      resultadoTx.ordenRef.get(),
      receiptRef.get(),
    ]);
    const vReceipt = receiptAfter.updateTime ? { seconds: receiptAfter.updateTime.seconds, nanos: receiptAfter.updateTime.nanoseconds } : null;
    const vOrden = ordenAfter.updateTime ? { seconds: ordenAfter.updateTime.seconds, nanos: ordenAfter.updateTime.nanoseconds } : null;
    if (!vReceipt || !vOrden) {
      motivoUndoNoDisponible = 'firestore_sin_updateTime';
    } else if (!versionIgual(vReceipt, vOrden)) {
      motivoUndoNoDisponible = 'orden_cambio_despues';
      commit = vReceipt;
    } else {
      commit = vReceipt;
      const prev = resultadoTx.prev;
      let anteriorUidResolved: string | null = null;
      if (prev.anteriorTecnicoUid !== null) {
        anteriorUidResolved = await resolverUidTecnicoAutorizado(db, prev.anteriorTecnicoUid);
      }
      if (prev.anteriorTecnicoUid !== null && anteriorUidResolved === null) {
        motivoUndoNoDisponible = 'tecnico_anterior_legacy_sin_uid';
      } else {
        undoDisponible = true;
        deshacer = {
          ordenId: prev.ordenId,
          esperado: {
            tecnicoId: prev.destinoUid,
            fase: prev.fase,
            fechaCitaMs: prev.fechaCitaMs,
            updateSeconds: vReceipt.seconds,
            updateNanos: vReceipt.nanos,
          },
          destinoUid: anteriorUidResolved,
          origen: 'deshacer',
        };
      }
    }
  } catch {
    motivoUndoNoDisponible = 'firestore_sin_updateTime';
  }

  return {
    ok: true,
    aplicadoMs: resultadoTx.aplicadoMs,
    commit,
    undoDisponible,
    motivoUndoNoDisponible: motivoUndoNoDisponible ?? undefined,
    deshacer,
  };
}

async function cancelarVisita(args: { db: Firestore; uid: string; rol: Rol; perfil: Record<string, unknown>; nombreActor: string; body: Record<string, unknown> }): Promise<Record<string, unknown>> {
  const { db, uid, rol, perfil, nombreActor, body } = args;
  const permisos = permisosEfectivos(perfil);
  if (!permisos.ordenesModificar) throw new ErrorReasignar(403, 'permiso', 'No tienes permiso para cancelar visitas.');
  const ordenId = asOrdenId(body.ordenId);
  const motivo = asString(body.motivo, MOTIVO_MAX, 'motivo', 10);
  const esperado = parseEsperado(body.esperado);
  const equipo = await equipoDelActor(db, uid, rol);
  return db.runTransaction(async tx => {
    const ref = db.collection('ordenes_servicio').doc(ordenId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorReasignar(404, 'no_existe', 'La orden no existe.');
    const o = snap.data() ?? {};
    const operariaId = typeof o.operariaId === 'string' ? o.operariaId : null;
    validarPertenencia({ equipo, tieneFueraGrupo: permisos.ordenesModificarFueraGrupo, anteriorOperariaUid: operariaId, destinoOperariaUid: operariaId });
    if (o.eliminada || esTerminal(o.fase) || chequeoActivo(o)) throw new ErrorReasignar(409, 'bloqueada', 'No se puede cancelar esta visita en su estado actual.');
    if ((o.tecnicoId || null) !== esperado.tecnicoId || o.fase !== esperado.fase || msDeFirestore(o.fechaCita) !== esperado.fechaCitaMs) throw new ErrorReasignar(409, 'cambio', 'La cita cambió. Actualiza la orden antes de cancelar.');
    if (o.visitaCancelada) return { ok: true, yaCancelada: true };
    if (!o.visitaFallida) throw new ErrorReasignar(409, 'cambio', 'El aviso ya fue resuelto. Actualiza la orden.');
    let tecnicoUid = typeof o.tecnicoId === 'string' && UID_RE.test(o.tecnicoId) ? o.tecnicoId : null;
    if (tecnicoUid) {
      const tecnico = await tx.get(db.collection('usuarios').doc(tecnicoUid));
      if (!tecnico.exists) {
        const personal = await tx.get(db.collection('personal').doc(tecnicoUid));
        tecnicoUid = typeof personal.data()?.uid === 'string' ? personal.data()!.uid : null;
      }
    }
    const fecha = Timestamp.now();
    tx.update(ref, {
      visitaCancelada: { motivo, actorUid: uid, actorNombre: nombreActor, fecha, fechaCita: o.fechaCita ?? null, tecnicoId: o.tecnicoId ?? null },
      visitaFallida: null,
      auditoria: FieldValue.arrayUnion({ fecha, usuario: nombreActor, accion: 'editar', campo: 'visitaCancelada', valorAnterior: null, valorNuevo: motivo, detalle: `Canceló la visita, conservando la orden: ${motivo}` }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (tecnicoUid) tx.set(db.collection('notificaciones').doc(`visita_cancelada_${ordenId}_${fecha.seconds}_${fecha.nanoseconds}`), {
      userId: tecnicoUid, tipo: 'actividad_orden', titulo: 'Oficina canceló la visita',
      mensaje: `${String(o.clienteNombre || 'Cliente')} · ${motivo}`, ordenId, leida: false, createdAt: fecha,
    });
    return { ok: true, yaCancelada: false };
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Método no permitido' }); return; }
  try {
    const acceso = await accesoEquipo(req);
    if (!ROLES_OFICINA.has(acceso.rol as Rol)) throw new ErrorReasignar(403, 'permiso', 'Solo oficina puede reasignar órdenes.');
    const perfilSnap = await acceso.db.collection('usuarios').doc(acceso.uid).get();
    const perfil = perfilSnap.data() ?? {};
    const nombreActor = typeof perfil.nombre === 'string' && perfil.nombre.length > 0 ? perfil.nombre : 'Sistema';
    const body = parseBody(req);
    const action = typeof body.action === 'string' ? body.action : '';
    if (action === 'cancelar_visita') {
      res.status(200).json(await cancelarVisita({ db: acceso.db, uid: acceso.uid, rol: acceso.rol as Rol, perfil, nombreActor, body }));
      return;
    }
    if (action === 'preview') {
      const resultado = await manejarPreview({ req, db: acceso.db, uid: acceso.uid, perfil, rol: acceso.rol as Rol });
      res.status(200).json(resultado);
      return;
    }
    if (action === 'confirmar') {
      const resultado = await manejarConfirmar({ req, db: acceso.db, uid: acceso.uid, perfil, rol: acceso.rol as Rol, nombreActor });
      res.status(200).json(resultado);
      return;
    }
    throw new ErrorReasignar(400, 'bad_request', 'Acción no reconocida.');
  } catch (e) {
    if (e instanceof ErrorReasignar) {
      res.status(e.status).json({ ok: false, error: e.message, codigo: e.codigo });
      return;
    }
    if (e instanceof ErrorAcceso) {
      res.status(e.status).json({ ok: false, error: e.message, codigo: e.status === 401 ? 'permiso' : 'red' });
      return;
    }
    const err = e as { code?: string; message?: string };
    if (err?.code === 'permission-denied') {
      res.status(403).json({ ok: false, error: 'Permiso denegado.', codigo: 'permiso' });
      return;
    }
    res.status(500).json({ ok: false, error: 'No se pudo completar la reasignación.', codigo: 'red' });
  }
}
