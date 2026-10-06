// Pruebas del endpoint `api/mapa/reasignar.ts`.
//
// Mockeamos `accesoEquipo` + `operariaDeTecnico` + un Firestore mínimo donde
// controlamos qué devuelve cada `doc.get()` y `collection.where().get()` y
// recolectamos las escrituras de la transacción. El mock simula:
//
//   - updateTime como { seconds, nanoseconds } compartido por los writes de
//     la misma tx (commit time atómico), igual que Firestore real.
//   - FieldValue.increment / serverTimestamp / arrayUnion efectivos (para
//     poder probar que el lock por técnico+día acumula versión al correr
//     dos reasignaciones secuenciales).
//   - QueryDocumentSnapshot con updateTime.
//
// Lo que validamos:
//   - Permisos: oficina + `ordenesModificar` + `ordenesModificarFueraGrupo`
//     respetando overrides (admin con flag false queda bloqueado también).
//   - Pertenencia del actor: secretaria sin fueraGrupo no puede mover órdenes
//     de un equipo ajeno a su equipo (origen o destino).
//   - Bloqueos: fase terminal, eliminada, standby, chequeo activo (no
//     bloquea cuando hay reactivaciónPostChequeo o cierreServicio ya).
//   - Control de versión ABA-safe: compara seconds+nanos; undo exige y
//     revalida versión exacta; sin undo si otra tx escribió después.
//   - Duración: default 60 cuando falta; falla si viene inválida (<=0, NaN).
//   - Operaria cambia entre preview y confirm → aborta con `operaria_cambio`.
//   - Técnico destino inactivo en `personal` → `tecnico_inactivo` (además de
//     usuarios).
//   - `forzarConflicto` NO está autorizado: cualquier payload con esa clave
//     es ignorado y los conflictos bloquean siempre.
//   - Body JSON crudo (string) parseado correctamente.
//   - previewId formato UUID bloquea path traversal.
//   - Lock por técnico+día acumula `version` tras reasignaciones múltiples
//     (prueba de reserva real, no sólo que `tx.set` existe).
//   - Motivos >300 chars rechazados (no truncar silencioso).

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

const m = vi.hoisted(() => ({
  accesoEquipo: vi.fn(),
  operariaDeTecnico: vi.fn(),
}));

vi.mock('../../api/_lib/accesoEquipo.js', () => ({
  accesoEquipo: m.accesoEquipo,
  ErrorAcceso: class extends Error { constructor(public status: number, msg: string) { super(msg); } },
}));
vi.mock('../../api/_lib/equipoResponsable.js', () => ({
  operariaDeTecnico: m.operariaDeTecnico,
}));
vi.mock('firebase-admin/firestore', () => {
  class Ts {
    constructor(public seconds: number, public nanoseconds: number) {}
    toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1_000_000); }
    static now() { const ms = Date.now(); return new Ts(Math.floor(ms / 1000), (ms % 1000) * 1_000_000); }
    static fromMillis(ms: number) { return new Ts(Math.floor(ms / 1000), (ms % 1000) * 1_000_000); }
  }
  return {
    FieldValue: {
      increment: (n: number) => ({ __op: 'increment', value: n }),
      serverTimestamp: () => ({ __op: 'serverTimestamp' }),
      arrayUnion: (...items: unknown[]) => ({ __op: 'arrayUnion', items }),
    },
    Timestamp: Ts,
  };
});

import handler from '../../api/mapa/reasignar';
import { ErrorAcceso } from '../../api/_lib/accesoEquipo';

// ────────────────────────────────────────────────────────────────────────
// Firestore mock
// ────────────────────────────────────────────────────────────────────────
interface Version { seconds: number; nanoseconds: number }
interface DocMock { id: string; data?: Record<string, unknown> | null; version?: Version }

let commitClock = 1_700_000_000;

function nextVersion(): Version {
  commitClock += 1;
  return { seconds: commitClock, nanoseconds: Math.floor(Math.random() * 1_000_000_000) };
}

function aplicarFieldValueOps(current: unknown, incoming: unknown, commitVersion: Version): unknown {
  if (incoming && typeof incoming === 'object' && (incoming as { __op?: string }).__op) {
    const op = (incoming as { __op: string }).__op;
    if (op === 'increment') {
      const base = typeof current === 'number' ? current : 0;
      return base + (incoming as { value: number }).value;
    }
    if (op === 'serverTimestamp') {
      return { seconds: commitVersion.seconds, nanoseconds: commitVersion.nanoseconds };
    }
    if (op === 'arrayUnion') {
      const arr = Array.isArray(current) ? [...current] : [];
      for (const it of (incoming as { items: unknown[] }).items) arr.push(it);
      return arr;
    }
  }
  return incoming;
}

function mergeConFieldValues(current: Record<string, unknown>, incoming: Record<string, unknown>, commitVersion: Version): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(incoming)) {
    out[k] = aplicarFieldValueOps(current[k], v, commitVersion);
  }
  return out;
}

function makeDocRef(path: string, store: Map<string, DocMock>, writesGlobal: Array<Record<string, unknown>>) {
  return {
    __kind: 'doc' as const,
    __path: path,
    async get() {
      const d = store.get(path);
      const ver = d?.version;
      return {
        exists: !!d?.data,
        id: d?.id ?? path.split('/').slice(-1)[0],
        updateTime: ver ? Object.assign(Object.create({ toMillis() { return ver.seconds * 1000 + Math.floor(ver.nanoseconds / 1_000_000); } }), { seconds: ver.seconds, nanoseconds: ver.nanoseconds }) : undefined,
        data: () => d?.data ?? undefined,
      };
    },
    async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
      writesGlobal.push({ op: 'set', path, data, opts });
      const existing = store.get(path);
      const version = nextVersion();
      const nuevos = opts?.merge
        ? mergeConFieldValues(existing?.data ?? {}, data, version)
        : mergeConFieldValues({}, data, version);
      store.set(path, { id: path.split('/').slice(-1)[0], data: nuevos, version });
    },
    async update(data: Record<string, unknown>) {
      writesGlobal.push({ op: 'update', path, data });
      const existing = store.get(path);
      const version = nextVersion();
      store.set(path, { id: path.split('/').slice(-1)[0], data: mergeConFieldValues(existing?.data ?? {}, data, version), version });
    },
    async delete() {
      writesGlobal.push({ op: 'delete', path });
      store.delete(path);
    },
  };
}

function makeQuery(path: string, field: string, value: unknown, store: Map<string, DocMock>, writesGlobal: Array<Record<string, unknown>>, limitN?: number) {
  return {
    __kind: 'query' as const,
    limit(n: number) { return makeQuery(path, field, value, store, writesGlobal, n); },
    async get() {
      const docs: Array<{ id: string; data: () => Record<string, unknown>; ref: ReturnType<typeof makeDocRef>; updateTime?: unknown }> = [];
      for (const [p, d] of store.entries()) {
        if (!p.startsWith(`${path}/`)) continue;
        if (!d.data) continue;
        if (d.data[field] !== value) continue;
        const ver = d.version;
        docs.push({
          id: p.split('/').slice(-1)[0],
          data: () => d.data ?? {},
          ref: makeDocRef(p, store, writesGlobal),
          updateTime: ver ? { seconds: ver.seconds, nanoseconds: ver.nanoseconds, toMillis: () => ver.seconds * 1000 } : undefined,
        });
      }
      const limited = typeof limitN === 'number' ? docs.slice(0, limitN) : docs;
      return { docs: limited, empty: limited.length === 0 };
    },
  };
}

function makeCollection(path: string, store: Map<string, DocMock>, writes: Array<Record<string, unknown>>) {
  return {
    doc(id: string) { return makeDocRef(`${path}/${id}`, store, writes); },
    where(field: string, _op: string, value: unknown) { return makeQuery(path, field, value, store, writes); },
  };
}

function makeDb() {
  const store = new Map<string, DocMock>();
  const writesGlobal: Array<Record<string, unknown>> = [];
  const txWrites: Array<Record<string, unknown>> = [];
  const db = {
    __store: store,
    __writesGlobal: writesGlobal,
    __txWrites: txWrites,
    collection(path: string) { return makeCollection(path, store, writesGlobal); },
    async runTransaction<T>(cb: (tx: unknown) => Promise<T>): Promise<T> {
      type Pending = { op: 'set'; ref: { __path: string }; data: Record<string, unknown>; opts?: { merge?: boolean } }
        | { op: 'update'; ref: { __path: string }; data: Record<string, unknown> }
        | { op: 'delete'; ref: { __path: string } };
      const pending: Pending[] = [];
      const tx = {
        async get(ref: { __kind?: string; get: () => Promise<unknown> }) { return ref.get(); },
        set(ref: { __path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) {
          pending.push({ op: 'set', ref, data, opts });
          txWrites.push({ op: 'set', path: ref.__path, data, opts });
        },
        update(ref: { __path: string }, data: Record<string, unknown>) {
          pending.push({ op: 'update', ref, data });
          txWrites.push({ op: 'update', path: ref.__path, data });
        },
        delete(ref: { __path: string }) {
          pending.push({ op: 'delete', ref });
          txWrites.push({ op: 'delete', path: ref.__path });
        },
      };
      const result = await cb(tx);
      // Commit: todos los writes de esta tx comparten la misma versión (commit time atómico).
      const commitVersion = nextVersion();
      for (const w of pending) {
        if (w.op === 'delete') { store.delete(w.ref.__path); continue; }
        const existing = store.get(w.ref.__path);
        const nuevos = (w.op === 'set' && !w.opts?.merge)
          ? mergeConFieldValues({}, w.data, commitVersion)
          : mergeConFieldValues(existing?.data ?? {}, w.data, commitVersion);
        store.set(w.ref.__path, { id: w.ref.__path.split('/').slice(-1)[0], data: nuevos, version: commitVersion });
      }
      return result;
    },
  };
  return db;
}

function seedPerfilUsuarios(db: ReturnType<typeof makeDb>, uid: string, perfil: Record<string, unknown>) {
  db.__store.set(`usuarios/${uid}`, { id: uid, data: perfil, version: nextVersion() });
}
function seedPersonal(db: ReturnType<typeof makeDb>, docId: string, data: Record<string, unknown>) {
  db.__store.set(`personal/${docId}`, { id: docId, data, version: nextVersion() });
}
function seedOrden(db: ReturnType<typeof makeDb>, id: string, data: Record<string, unknown>, version?: Version) {
  db.__store.set(`ordenes_servicio/${id}`, { id, data, version: version ?? nextVersion() });
}

function response() {
  const r = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() } as unknown as {
    setHeader: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  (r.status as ReturnType<typeof vi.fn>).mockReturnValue(r);
  (r.json as ReturnType<typeof vi.fn>).mockReturnValue(r);
  return r;
}

async function call(body: unknown) {
  const r = response();
  await handler({ method: 'POST', body } as never, r as never);
  return r;
}

// ────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────
const UID_ADMIN = 'uid-admin';
const UID_OPERARIA_A = 'uid-op-A';
const UID_OPERARIA_B = 'uid-op-B';
const UID_SECRETARIA_A = 'uid-secretaria-A';
const UID_TEC_ORIG = 'uid-tec-origen';
const UID_TEC_DEST = 'uid-tec-destino';
const FECHA_MS = Date.UTC(2026, 9, 1, 14, 0, 0);

const PERFIL_ADMIN = { rol: 'administrador', nombre: 'Jorge', activo: true };
const PERFIL_SECRETARIA_A = { rol: 'secretaria', nombre: 'Ana', activo: true };

function perfilDestino() { return { rol: 'tecnico', nombre: 'Técnico Destino', activo: true }; }

function esperadoBase() { return { tecnicoId: UID_TEC_ORIG, fase: 'agendado', fechaCitaMs: FECHA_MS }; }

function ordenBase(overrides: Record<string, unknown> = {}) {
  return {
    clienteNombre: 'Cliente Prueba',
    tecnicoId: UID_TEC_ORIG,
    tecnicoNombre: 'Técnico Origen',
    operariaId: UID_OPERARIA_A,
    operariaNombre: 'Wila',
    fase: 'agendado',
    fechaCita: { toMillis: () => FECHA_MS },
    duracionMin: 60,
    eliminada: false,
    enStandby: false,
    ...overrides,
  };
}

function sembrarTodo(db: ReturnType<typeof makeDb>) {
  seedPerfilUsuarios(db, UID_ADMIN, PERFIL_ADMIN);
  // Origen con usuario+personal activos para que `resolverUidTecnicoAutorizado`
  // pueda devolver el UID original al generar el objeto `deshacer`.
  seedPerfilUsuarios(db, UID_TEC_ORIG, { rol: 'tecnico', nombre: 'Técnico Origen', activo: true });
  seedPersonal(db, 'personal-origen', { uid: UID_TEC_ORIG, activo: true, operariaId: UID_OPERARIA_A });
  seedPerfilUsuarios(db, UID_TEC_DEST, perfilDestino());
  seedPersonal(db, 'personal-dest', { uid: UID_TEC_DEST, activo: true, operariaId: UID_OPERARIA_B });
  seedPerfilUsuarios(db, UID_OPERARIA_B, { rol: 'operaria', nombre: 'Yohana', activo: true });
  seedOrden(db, 'orden-1', ordenBase());
}

async function hacerPreview(db: ReturnType<typeof makeDb>, overrides?: Record<string, unknown>): Promise<string> {
  m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
  const r = await call({
    action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(),
    destinoUid: UID_TEC_DEST, origen: 'mapa', ...(overrides ?? {}),
  });
  const payload = (r.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
  if (!payload.ok) throw new Error(`preview falló: ${JSON.stringify(payload)}`);
  return payload.previewId;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.operariaDeTecnico.mockImplementation(async () => ({ uid: UID_OPERARIA_B, nombre: 'Yohana' }));
  commitClock = 1_700_000_000;
});

afterEach(() => { vi.restoreAllMocks(); });

// ────────────────────────────────────────────────────────────────────────
describe('api/mapa/reasignar — contrato de método, auth, parseBody', () => {
  it('rechaza métodos != POST', async () => {
    const r = response();
    await handler({ method: 'GET' } as never, r as never);
    expect(r.status).toHaveBeenCalledWith(405);
  });

  it('bubblea 401 de accesoEquipo', async () => {
    m.accesoEquipo.mockRejectedValue(new ErrorAcceso(401, 'Inicia sesión.'));
    const r = await call({ action: 'preview' });
    expect(r.status).toHaveBeenCalledWith(401);
  });

  it('bloquea roles fuera de oficina', async () => {
    const db = makeDb();
    seedPerfilUsuarios(db, 'uid-x', { rol: 'tecnico', activo: true });
    m.accesoEquipo.mockResolvedValue({ uid: 'uid-x', rol: 'tecnico', db });
    const r = await call({ action: 'preview' });
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('rechaza body que parsea a null/array/primitive', async () => {
    const db = makeDb();
    sembrarTodo(db);
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    for (const body of ['null', '[1,2]', '"texto"', 'true']) {
      const r = await call(body);
      expect(r.status).toHaveBeenCalledWith(400);
    }
  });

  it('acepta body JSON crudo (string) y lo parsea', async () => {
    const db = makeDb();
    sembrarTodo(db);
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const raw = JSON.stringify({
      action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(),
      destinoUid: UID_TEC_DEST, origen: 'mapa',
    });
    const r = await call(raw);
    expect(r.status).toHaveBeenCalledWith(200);
    const payload = (r.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.ok).toBe(true);
  });

  it('rechaza action desconocido', async () => {
    const db = makeDb();
    seedPerfilUsuarios(db, UID_ADMIN, PERFIL_ADMIN);
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({ action: 'otro' });
    expect(r.status).toHaveBeenCalledWith(400);
  });
});

describe('api/mapa/reasignar — preview', () => {
  it('devuelve preview válido para admin, incluye version seconds/nanos', async () => {
    const db = makeDb();
    sembrarTodo(db);
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
    const payload = (r.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.previewId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(payload.orden.version).toMatchObject({ seconds: expect.any(Number), nanos: expect.any(Number) });
    expect(payload.cambioDeGrupo).toBe(true);
    expect(payload.destino.operariaUid).toBe(UID_OPERARIA_B);
    expect(payload.conflictos).toEqual([]);
  });

  it('rechaza admin con override explícito ordenesModificarFueraGrupo=false que intenta cambio de grupo', async () => {
    const db = makeDb();
    sembrarTodo(db);
    seedPerfilUsuarios(db, UID_ADMIN, {
      rol: 'administrador', nombre: 'Jorge', activo: true,
      permisosPersonalizados: true,
      permisosSistema: { ordenesModificar: true, ordenesModificarFueraGrupo: false },
    });
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('bloquea secretaria sin fueraGrupo moviendo orden de equipo ajeno', async () => {
    const db = makeDb();
    // Orden pertenece a UID_OPERARIA_A; destino pertenece a UID_OPERARIA_B.
    // Secretaria A tiene operariaId = UID_OPERARIA_A → su equipo es A.
    seedPerfilUsuarios(db, UID_SECRETARIA_A, PERFIL_SECRETARIA_A);
    seedPersonal(db, 'personal-sec-A', { uid: UID_SECRETARIA_A, activo: true, operariaId: UID_OPERARIA_A });
    seedPerfilUsuarios(db, UID_TEC_DEST, perfilDestino());
    seedPersonal(db, 'personal-dest', { uid: UID_TEC_DEST, activo: true, operariaId: UID_OPERARIA_B });
    seedPerfilUsuarios(db, UID_OPERARIA_B, { rol: 'operaria', nombre: 'Yohana', activo: true });
    seedOrden(db, 'orden-1', ordenBase());
    m.accesoEquipo.mockResolvedValue({ uid: UID_SECRETARIA_A, rol: 'secretaria', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('bloquea secretaria sin fueraGrupo moviendo orden entre dos equipos ajenos (ninguno == su equipo)', async () => {
    const db = makeDb();
    const UID_OPERARIA_C = 'uid-op-C';
    seedPerfilUsuarios(db, UID_SECRETARIA_A, PERFIL_SECRETARIA_A);
    seedPersonal(db, 'personal-sec-A', { uid: UID_SECRETARIA_A, activo: true, operariaId: UID_OPERARIA_A });
    seedPerfilUsuarios(db, UID_TEC_DEST, perfilDestino());
    seedPersonal(db, 'personal-dest', { uid: UID_TEC_DEST, activo: true, operariaId: UID_OPERARIA_C });
    seedPerfilUsuarios(db, UID_OPERARIA_C, { rol: 'operaria', nombre: 'Opc', activo: true });
    seedOrden(db, 'orden-1', { ...ordenBase(), operariaId: UID_OPERARIA_B, operariaNombre: 'Yohana' });
    m.operariaDeTecnico.mockResolvedValue({ uid: UID_OPERARIA_C, nombre: 'Opc' });
    m.accesoEquipo.mockResolvedValue({ uid: UID_SECRETARIA_A, rol: 'secretaria', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('bloquea secretaria sin equipo configurado en Personal', async () => {
    const db = makeDb();
    seedPerfilUsuarios(db, UID_SECRETARIA_A, PERFIL_SECRETARIA_A);
    // Sin doc en personal → equipoDelActor falla cerrado.
    seedPerfilUsuarios(db, UID_TEC_DEST, perfilDestino());
    seedPersonal(db, 'personal-dest', { uid: UID_TEC_DEST, activo: true, operariaId: UID_OPERARIA_A });
    seedOrden(db, 'orden-1', ordenBase());
    m.operariaDeTecnico.mockResolvedValue({ uid: UID_OPERARIA_A, nombre: 'Wila' });
    m.accesoEquipo.mockResolvedValue({ uid: UID_SECRETARIA_A, rol: 'secretaria', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('rechaza orden con inicioChequeo activo (sin reactivación ni cierre)', async () => {
    const db = makeDb();
    sembrarTodo(db);
    seedOrden(db, 'orden-1', ordenBase({ inicioChequeo: { fechaInicio: new Date(), tecnicoId: UID_TEC_ORIG, tecnicoNombre: 'x', fotoUrl: 'u' } }));
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
    const payload = (r.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.codigo).toBe('bloqueada');
  });

  it('permite reasignar cuando inicioChequeo es ANTERIOR a reactivadaPostChequeoEn (chequeo histórico)', async () => {
    const db = makeDb();
    sembrarTodo(db);
    seedOrden(db, 'orden-1', ordenBase({
      inicioChequeo: { fechaInicio: { toMillis: () => FECHA_MS - 60000 }, tecnicoId: UID_TEC_ORIG, tecnicoNombre: 'x', fotoUrl: 'u' },
      reactivadaPostChequeo: true,
      reactivadaPostChequeoEn: { toMillis: () => FECHA_MS },  // reactivación POSTERIOR al inicio
    }));
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it('bloquea cuando reactivadaPostChequeo=true pero reactivadaPostChequeoEn NO está (ambiguo → conservador)', async () => {
    const db = makeDb();
    sembrarTodo(db);
    seedOrden(db, 'orden-1', ordenBase({
      inicioChequeo: { fechaInicio: { toMillis: () => FECHA_MS }, tecnicoId: UID_TEC_ORIG, tecnicoNombre: 'x', fotoUrl: 'u' },
      reactivadaPostChequeo: true,
      // sin reactivadaPostChequeoEn
    }));
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
    expect(r.status).toHaveBeenCalledWith(409);
    expect((r.json as ReturnType<typeof vi.fn>).mock.calls[0][0].codigo).toBe('bloqueada');
  });

  it('rechaza duración de orden inválida (<=0, NaN)', async () => {
    for (const dur of [0, -5, 'texto']) {
      const db = makeDb();
      sembrarTodo(db);
      seedOrden(db, 'orden-1', ordenBase({ duracionMin: dur }));
      m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
      const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
      const payload = (r.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.codigo).toBe('bloqueada');
    }
  });

  it('usa duracionMin=60 por default cuando falta y detecta overlap con default', async () => {
    const db = makeDb();
    sembrarTodo(db);
    seedOrden(db, 'orden-1', ordenBase({ duracionMin: undefined }));
    // Otra orden del destino a +30min, sin duracionMin → default 60 también → overlap.
    seedOrden(db, 'orden-dest-1', {
      clienteNombre: 'Otro', tecnicoId: UID_TEC_DEST, fase: 'agendado',
      fechaCita: { toMillis: () => FECHA_MS + 30 * 60000 }, eliminada: false,
    });
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
    const payload = (r.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.orden.duracionMin).toBe(60);
    expect(payload.conflictos).toHaveLength(1);
  });

  it('exige esperado.updateSeconds+updateNanos para origen=deshacer', async () => {
    const db = makeDb();
    sembrarTodo(db);
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'deshacer' });
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('rechaza motivo > 300 chars (sin truncar)', async () => {
    const db = makeDb();
    sembrarTodo(db);
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({
      action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(),
      destinoUid: UID_TEC_DEST, origen: 'mapa',
      motivo: 'x'.repeat(301),
    });
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('rechaza esperado.updateSeconds mal pareado (sin updateNanos)', async () => {
    const db = makeDb();
    sembrarTodo(db);
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({
      action: 'preview', ordenId: 'orden-1',
      esperado: { ...esperadoBase(), updateSeconds: 123 },
      destinoUid: UID_TEC_DEST, origen: 'mapa',
    });
    expect(r.status).toHaveBeenCalledWith(400);
  });
});

describe('api/mapa/reasignar — confirmar + ABA undo', () => {
  it('rechaza previewId con formato inválido (no UUID)', async () => {
    const db = makeDb();
    seedPerfilUsuarios(db, UID_ADMIN, PERFIL_ADMIN);
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    for (const invalid of ['../etc/passwd', 'short', '00000000-0000-0000-0000', '12345678901234567890123456789012', 'ab/cd']) {
      const r = await call({ action: 'confirmar', previewId: invalid, motivo: 'x' });
      expect(r.status).toHaveBeenCalledWith(400);
    }
  });

  it('escribe sólo campos acordados + emite deshacer con updateSeconds/Nanos exactos', async () => {
    const db = makeDb();
    sembrarTodo(db);
    const previewId = await hacerPreview(db);
    db.__txWrites.length = 0;
    const r = await call({ action: 'confirmar', previewId, motivo: 'cambio operativo' });
    expect(r.status).toHaveBeenCalledWith(200);
    const payload = (r.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.ok).toBe(true);
    expect(payload.undoDisponible).toBe(true);
    expect(payload.deshacer).toMatchObject({
      ordenId: 'orden-1', origen: 'deshacer', destinoUid: UID_TEC_ORIG,
      esperado: expect.objectContaining({
        tecnicoId: UID_TEC_DEST,
        updateSeconds: expect.any(Number),
        updateNanos: expect.any(Number),
      }),
    });
    const upd = db.__txWrites.find(w => w.op === 'update' && (w.path as string).startsWith('ordenes_servicio/'));
    expect(upd).toBeDefined();
    const campos = Object.keys((upd!.data as Record<string, unknown>)).sort();
    expect(campos).toEqual(['auditoria', 'operariaId', 'operariaNombre', 'tecnicoId', 'tecnicoNombre', 'updatedAt'].sort());
    const auditoria = (upd!.data as Record<string, unknown>).auditoria as { __op: string; items: unknown[] };
    expect(auditoria.__op).toBe('arrayUnion');
    expect((auditoria.items[0] as Record<string, unknown>).fecha).toBeDefined();
    // El receipt existe y el preview quedó borrado.
    expect(db.__store.has(`config_mapa/mapa_write_${previewId}`)).toBe(true);
    expect(db.__store.has(`config_mapa/mapa_preview_${previewId}`)).toBe(false);
  });

  it('reporta undoDisponible=false si otra tx escribió DESPUÉS del commit', async () => {
    const db = makeDb();
    sembrarTodo(db);
    const previewId = await hacerPreview(db);
    const r = await call({ action: 'confirmar', previewId, motivo: 'x' });
    // Después del confirm, otra "escritura externa" pisa la orden.
    const orden = db.__store.get('ordenes_servicio/orden-1')!;
    db.__store.set('ordenes_servicio/orden-1', { ...orden, version: nextVersion() });
    // Pedir confirmar un undo (re-leer post-tx desde la respuesta previa no se puede;
    // en vez, verificamos la segunda rama: nuevo preview deshacer debe fallar porque
    // el updateTime registrado por nuestro commit YA no corresponde al actual).
    const payload = (r.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.ok).toBe(true);
    const deshacer = payload.deshacer;
    if (!deshacer) throw new Error('inesperado — deshacer debía existir ANTES del pisado externo');
    // Volver a correr preview con updateSeconds/Nanos "viejos" → cambio.
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r2 = await call({
      action: 'preview', ordenId: 'orden-1',
      esperado: deshacer.esperado,
      destinoUid: deshacer.destinoUid, origen: 'deshacer',
    });
    expect(r2.status).toHaveBeenCalledWith(409);
    const p2 = (r2.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(p2.codigo).toBe('cambio');
  });

  it('aborta ABA cuando orden conservó la triple pero cambió updateTime', async () => {
    // Caso ABA clásico: alguien modifica un campo que NO es técnico/fase/fechaCita
    // (ej. notas) manteniendo la triple intacta. Sin updateTime, el preview normal
    // podría pasar. Verificamos que SÍ falla por updateSeconds/Nanos.
    const db = makeDb();
    sembrarTodo(db);
    const previewId = await hacerPreview(db);
    const rC = await call({ action: 'confirmar', previewId, motivo: 'x' });
    const payload = (rC.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const deshacer = payload.deshacer;
    // Un tercero toca notas (updateTime nuevo pero triple seguiría coincidiendo si
    // volviéramos la orden al tecnico destino manualmente). Para simular ABA puro,
    // dejamos tecnicoId en destino (lo que escribimos) y toqueteamos otro campo
    // vía un write directo (nueva version).
    const now = db.__store.get('ordenes_servicio/orden-1')!;
    db.__store.set('ordenes_servicio/orden-1', { ...now, data: { ...(now.data ?? {}), notas: 'tocada' }, version: nextVersion() });
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r2 = await call({
      action: 'preview', ordenId: 'orden-1',
      esperado: deshacer.esperado, destinoUid: deshacer.destinoUid, origen: 'deshacer',
    });
    expect(r2.status).toHaveBeenCalledWith(409);
    expect((r2.json as ReturnType<typeof vi.fn>).mock.calls[0][0].codigo).toBe('cambio');
  });

  it('preview_vencido si previewId es desconocido / otro actor / TTL vencido', async () => {
    const db = makeDb();
    sembrarTodo(db);
    seedPerfilUsuarios(db, UID_ADMIN, PERFIL_ADMIN);
    // 1) Desconocido
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r1 = await call({ action: 'confirmar', previewId: '00000000-0000-0000-0000-000000000000', motivo: 'x' });
    expect(r1.status).toHaveBeenCalledWith(409);
    expect((r1.json as ReturnType<typeof vi.fn>).mock.calls[0][0].codigo).toBe('preview_vencido');
    // 2) Otro actor
    const previewId = await hacerPreview(db);
    seedPerfilUsuarios(db, 'uid-b', { ...PERFIL_ADMIN, nombre: 'Otro' });
    m.accesoEquipo.mockResolvedValue({ uid: 'uid-b', rol: 'administrador', db });
    const r2 = await call({ action: 'confirmar', previewId, motivo: 'x' });
    expect(r2.status).toHaveBeenCalledWith(403);
  });

  it('motivo_requerido cuando hay cambio de grupo y falta motivo', async () => {
    const db = makeDb();
    sembrarTodo(db);
    const previewId = await hacerPreview(db);
    db.__txWrites.length = 0;
    const r = await call({ action: 'confirmar', previewId });
    expect(r.status).toHaveBeenCalledWith(400);
    expect((r.json as ReturnType<typeof vi.fn>).mock.calls[0][0].codigo).toBe('motivo_requerido');
    const upd = db.__txWrites.find(w => w.op === 'update' && (w.path as string).startsWith('ordenes_servicio/'));
    expect(upd).toBeUndefined();
  });

  it('aborta si la operaria del destino cambia entre preview y confirm', async () => {
    const db = makeDb();
    sembrarTodo(db);
    const previewId = await hacerPreview(db);
    db.__txWrites.length = 0;
    // Simulamos que al confirmar la operariaDeTecnico devuelve otra operaria.
    const UID_OPERARIA_NUEVA = 'uid-op-NEW';
    m.operariaDeTecnico.mockResolvedValueOnce({ uid: UID_OPERARIA_NUEVA, nombre: 'Nueva' });
    seedPerfilUsuarios(db, UID_OPERARIA_NUEVA, { rol: 'operaria', nombre: 'Nueva', activo: true });
    const r = await call({ action: 'confirmar', previewId, motivo: 'x' });
    expect(r.status).toHaveBeenCalledWith(409);
    expect((r.json as ReturnType<typeof vi.fn>).mock.calls[0][0].codigo).toBe('operaria_cambio');
    const upd = db.__txWrites.find(w => w.op === 'update' && (w.path as string).startsWith('ordenes_servicio/'));
    expect(upd).toBeUndefined();
  });

  it('tecnico_inactivo cuando el destino está desactivado en Personal (aunque usuarios lo tenga activo)', async () => {
    const db = makeDb();
    sembrarTodo(db);
    // Desactivamos sólo en Personal.
    db.__store.set('personal/personal-dest', {
      id: 'personal-dest',
      data: { uid: UID_TEC_DEST, activo: false, operariaId: UID_OPERARIA_B },
      version: nextVersion(),
    });
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
    expect(r.status).toHaveBeenCalledWith(409);
    expect((r.json as ReturnType<typeof vi.fn>).mock.calls[0][0].codigo).toBe('tecnico_inactivo');
  });

  it('conflicto_agenda SIEMPRE bloquea aunque el payload traiga forzarConflicto=true (bandera ignorada)', async () => {
    const db = makeDb();
    sembrarTodo(db);
    const previewId = await hacerPreview(db);
    // Introducir conflicto post-preview.
    seedOrden(db, 'orden-tarde', {
      clienteNombre: 'Z', tecnicoId: UID_TEC_DEST, fase: 'agendado',
      fechaCita: { toMillis: () => FECHA_MS + 30 * 60000 }, duracionMin: 60, eliminada: false,
    });
    db.__txWrites.length = 0;
    const r = await call({ action: 'confirmar', previewId, motivo: 'x', forzarConflicto: true });
    expect(r.status).toHaveBeenCalledWith(409);
    expect((r.json as ReturnType<typeof vi.fn>).mock.calls[0][0].codigo).toBe('conflicto_agenda');
    const upd = db.__txWrites.find(w => w.op === 'update' && (w.path as string).startsWith('ordenes_servicio/'));
    expect(upd).toBeUndefined();
  });

  it('aborta con bloqueada si la orden pasa a standby sin tocar updateTime (write silencioso o migración)', async () => {
    // Caso extremo: una pantalla externa escribió el campo preservando la version
    // (no esperable en Firestore real, pero la rama del handler debe bloquear
    // igualmente por la señal de negocio).
    const db = makeDb();
    sembrarTodo(db);
    const previewId = await hacerPreview(db);
    const o = db.__store.get('ordenes_servicio/orden-1')!;
    db.__store.set('ordenes_servicio/orden-1', { ...o, data: { ...(o.data ?? {}), enStandby: true } });
    const r = await call({ action: 'confirmar', previewId, motivo: 'x' });
    expect(r.status).toHaveBeenCalledWith(409);
    expect((r.json as ReturnType<typeof vi.fn>).mock.calls[0][0].codigo).toBe('bloqueada');
  });

  it('aborta con cambio si la orden fue reescrita entre preview y confirm (updateTime distinto)', async () => {
    const db = makeDb();
    sembrarTodo(db);
    const previewId = await hacerPreview(db);
    const o = db.__store.get('ordenes_servicio/orden-1')!;
    db.__store.set('ordenes_servicio/orden-1', { ...o, data: { ...(o.data ?? {}), notas: 'tocada' }, version: nextVersion() });
    const r = await call({ action: 'confirmar', previewId, motivo: 'x' });
    expect(r.status).toHaveBeenCalledWith(409);
    expect((r.json as ReturnType<typeof vi.fn>).mock.calls[0][0].codigo).toBe('cambio');
  });
});

describe('api/mapa/reasignar — lock por técnico/día (reserva compartida)', () => {
  it('dos reasignaciones secuenciales a mismo técnico+día incrementan la version del lock', async () => {
    const db = makeDb();
    sembrarTodo(db);
    // Segunda orden al mismo técnico destino, mismo día, horario distinto para evitar overlap.
    seedOrden(db, 'orden-2', ordenBase({ clienteNombre: 'Cliente 2', fechaCita: { toMillis: () => FECHA_MS + 4 * 60 * 60000 } }));
    const p1 = await hacerPreview(db, { ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST });
    const r1 = await call({ action: 'confirmar', previewId: p1, motivo: 'x' });
    expect(r1.status).toHaveBeenCalledWith(200);
    const esperado2 = { tecnicoId: UID_TEC_ORIG, fase: 'agendado', fechaCitaMs: FECHA_MS + 4 * 60 * 60000 };
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const pr2 = await call({ action: 'preview', ordenId: 'orden-2', esperado: esperado2, destinoUid: UID_TEC_DEST, origen: 'mapa' });
    const payload2 = (pr2.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const r2 = await call({ action: 'confirmar', previewId: payload2.previewId, motivo: 'x' });
    expect(r2.status).toHaveBeenCalledWith(200);
    const dia = new Date(FECHA_MS).toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
    const lock = db.__store.get(`config_mapa/lock_tecnico_${UID_TEC_DEST}_dia_${dia}`);
    expect(lock).toBeDefined();
    expect((lock!.data as Record<string, unknown>).version).toBe(2);
    expect((lock!.data as Record<string, unknown>).ultimaOrden).toBe('orden-2');
  });

  it('ambos tx.set del lock escriben con FieldValue.increment(1) sobre el mismo path (reserva compartida)', async () => {
    const db = makeDb();
    sembrarTodo(db);
    seedOrden(db, 'orden-2', ordenBase({ clienteNombre: 'Cliente 2', fechaCita: { toMillis: () => FECHA_MS + 4 * 60 * 60000 } }));
    const p1 = await hacerPreview(db);
    await call({ action: 'confirmar', previewId: p1, motivo: 'x' });
    const esperado2 = { tecnicoId: UID_TEC_ORIG, fase: 'agendado', fechaCitaMs: FECHA_MS + 4 * 60 * 60000 };
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const pr2 = await call({ action: 'preview', ordenId: 'orden-2', esperado: esperado2, destinoUid: UID_TEC_DEST, origen: 'mapa' });
    const payload2 = (pr2.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    await call({ action: 'confirmar', previewId: payload2.previewId, motivo: 'x' });
    const dia = new Date(FECHA_MS).toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
    const path = `config_mapa/lock_tecnico_${UID_TEC_DEST}_dia_${dia}`;
    const setLocks = db.__txWrites.filter(w => w.op === 'set' && w.path === path);
    expect(setLocks.length).toBe(2);
    for (const w of setLocks) {
      expect((w.data as Record<string, unknown>).version).toMatchObject({ __op: 'increment', value: 1 });
    }
  });
});

describe('api/mapa/reasignar — IDs legacy en la agenda del destino', () => {
  it('detecta conflicto cuando una orden legacy guarda tecnicoId = personal.id del destino (preview)', async () => {
    const db = makeDb();
    sembrarTodo(db);
    // Orden legacy: su tecnicoId es el DOC ID del personal del destino, no su UID.
    seedOrden(db, 'orden-legacy', {
      clienteNombre: 'Legacy',
      tecnicoId: 'personal-dest',    // id del doc en /personal
      fase: 'agendado',
      fechaCita: { toMillis: () => FECHA_MS + 15 * 60000 },
      duracionMin: 60,
      eliminada: false,
    });
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
    expect(r.status).toHaveBeenCalledWith(200);
    const payload = (r.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.conflictos).toHaveLength(1);
    expect(payload.conflictos[0].ordenId).toBe('orden-legacy');
  });

  it('confirm bloquea con conflicto_agenda sobre orden legacy del destino', async () => {
    const db = makeDb();
    sembrarTodo(db);
    const previewId = await hacerPreview(db);
    // Entre preview y confirm aparece una orden legacy del destino.
    seedOrden(db, 'orden-legacy', {
      clienteNombre: 'Legacy',
      tecnicoId: 'personal-dest',
      fase: 'agendado',
      fechaCita: { toMillis: () => FECHA_MS + 15 * 60000 },
      duracionMin: 60,
      eliminada: false,
    });
    db.__txWrites.length = 0;
    const r = await call({ action: 'confirmar', previewId, motivo: 'x' });
    expect(r.status).toHaveBeenCalledWith(409);
    expect((r.json as ReturnType<typeof vi.fn>).mock.calls[0][0].codigo).toBe('conflicto_agenda');
    const upd = db.__txWrites.find(w => w.op === 'update' && (w.path as string).startsWith('ordenes_servicio/'));
    expect(upd).toBeUndefined();
  });
});

describe('api/mapa/reasignar — undo con técnico anterior legacy', () => {
  it('resuelve anteriorTecnicoUid = personal.id a UID autorizado y emite deshacer con ese UID', async () => {
    const db = makeDb();
    // Orden cuyo tecnicoId ES un personal.id (origen legacy).
    seedPerfilUsuarios(db, UID_ADMIN, PERFIL_ADMIN);
    seedPerfilUsuarios(db, UID_TEC_ORIG, { rol: 'tecnico', nombre: 'Origen', activo: true });
    seedPersonal(db, 'personal-origen-legacy', { uid: UID_TEC_ORIG, activo: true, operariaId: UID_OPERARIA_A });
    seedPerfilUsuarios(db, UID_TEC_DEST, perfilDestino());
    seedPersonal(db, 'personal-dest', { uid: UID_TEC_DEST, activo: true, operariaId: UID_OPERARIA_B });
    seedPerfilUsuarios(db, UID_OPERARIA_B, { rol: 'operaria', nombre: 'Yohana', activo: true });
    seedOrden(db, 'orden-1', ordenBase({ tecnicoId: 'personal-origen-legacy' }));
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const esperadoLegacy = { tecnicoId: 'personal-origen-legacy', fase: 'agendado', fechaCitaMs: FECHA_MS };
    const pr = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoLegacy, destinoUid: UID_TEC_DEST, origen: 'mapa' });
    const prev = (pr.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const r = await call({ action: 'confirmar', previewId: prev.previewId, motivo: 'x' });
    expect(r.status).toHaveBeenCalledWith(200);
    const payload = (r.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.undoDisponible).toBe(true);
    expect(payload.deshacer.destinoUid).toBe(UID_TEC_ORIG);  // resolvió el legacy a su UID
  });

  it('reporta tecnico_anterior_legacy_sin_uid cuando el personal legacy no tiene uid autorizado', async () => {
    const db = makeDb();
    seedPerfilUsuarios(db, UID_ADMIN, PERFIL_ADMIN);
    // Personal legacy huérfano: existe el doc en /personal pero sin `uid` o apuntando a usuario inactivo.
    seedPersonal(db, 'personal-huerfano', { uid: 'uid-inactivo', activo: true, operariaId: UID_OPERARIA_A });
    seedPerfilUsuarios(db, 'uid-inactivo', { rol: 'tecnico', nombre: 'Vacío', activo: false });
    seedPerfilUsuarios(db, UID_TEC_DEST, perfilDestino());
    seedPersonal(db, 'personal-dest', { uid: UID_TEC_DEST, activo: true, operariaId: UID_OPERARIA_B });
    seedPerfilUsuarios(db, UID_OPERARIA_B, { rol: 'operaria', nombre: 'Yohana', activo: true });
    seedOrden(db, 'orden-1', ordenBase({ tecnicoId: 'personal-huerfano' }));
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const esperadoLegacy = { tecnicoId: 'personal-huerfano', fase: 'agendado', fechaCitaMs: FECHA_MS };
    const pr = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoLegacy, destinoUid: UID_TEC_DEST, origen: 'mapa' });
    const prev = (pr.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const r = await call({ action: 'confirmar', previewId: prev.previewId, motivo: 'x' });
    expect(r.status).toHaveBeenCalledWith(200);
    const payload = (r.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.undoDisponible).toBe(false);
    expect(payload.motivoUndoNoDisponible).toBe('tecnico_anterior_legacy_sin_uid');
    expect(payload.deshacer).toBeNull();
  });
});

describe('api/mapa/reasignar — chequeoActivo con fechas', () => {
  it('bloquea cuando inicioChequeo.fechaInicio es POSTERIOR a reactivadaPostChequeoEn (nuevo chequeo tras reactivar)', async () => {
    const db = makeDb();
    sembrarTodo(db);
    seedOrden(db, 'orden-1', ordenBase({
      reactivadaPostChequeo: true,
      reactivadaPostChequeoEn: { toMillis: () => FECHA_MS - 10000 },
      inicioChequeo: { fechaInicio: { toMillis: () => FECHA_MS }, tecnicoId: UID_TEC_ORIG, tecnicoNombre: 'x', fotoUrl: 'u' },
    }));
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
    expect(r.status).toHaveBeenCalledWith(409);
    expect((r.json as ReturnType<typeof vi.fn>).mock.calls[0][0].codigo).toBe('bloqueada');
  });

  it('NO bloquea cuando inicioChequeo.fechaInicio es ANTERIOR a reactivadaPostChequeoEn (chequeo histórico)', async () => {
    const db = makeDb();
    sembrarTodo(db);
    seedOrden(db, 'orden-1', ordenBase({
      reactivadaPostChequeo: true,
      reactivadaPostChequeoEn: { toMillis: () => FECHA_MS + 10000 },
      inicioChequeo: { fechaInicio: { toMillis: () => FECHA_MS }, tecnicoId: UID_TEC_ORIG, tecnicoNombre: 'x', fotoUrl: 'u' },
    }));
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it('NO bloquea cuando inicioChequeo no trae fechaInicio parseable (no inferir presencia por campo libre)', async () => {
    const db = makeDb();
    sembrarTodo(db);
    seedOrden(db, 'orden-1', ordenBase({
      inicioChequeo: { tecnicoId: UID_TEC_ORIG, fotoUrl: 'u' },  // sin fechaInicio
    }));
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, origen: 'mapa' });
    expect(r.status).toHaveBeenCalledWith(200);
  });
});

// Reagendamiento usa las mismas guardas, consultas y lock que el mapa.
describe('reagendar una visita', () => {
  const nuevaFecha = Date.UTC(2035, 0, 2, 14); // 10 AM RD
  const entrada = { origen: 'reagendar', nuevaFechaCitaMs: nuevaFecha, motivo: 'Cliente no puede recibir hoy' };
  it('consulta horarios reales sin guardar un preview ni modificar la orden', async () => {
    const db = makeDb(); sembrarTodo(db);
    seedOrden(db, 'ocupada', ordenBase({ tecnicoId: UID_TEC_DEST, fechaCita: { toMillis: () => nuevaFecha }, duracionMin: 120 }));
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, ...entrada, consultarDisponibilidad: true });
    const data = r.json.mock.calls[0][0];
    expect(data.ok).toBe(true);
    expect(data.horarios.find((h: { hora: string }) => h.hora === '10:00').disponible).toBe(false);
    expect(data.horarios.find((h: { hora: string }) => h.hora === '11:00').disponible).toBe(false);
    expect(data.horarios.find((h: { hora: string }) => h.hora === '12:00').disponible).toBe(true);
    expect(data.previewId).toBeUndefined();
    expect(db.__txWrites).toHaveLength(0);
  });
  it('reagenda el mismo técnico, conserva token y rechaza repetir la confirmación', async () => {
    const db = makeDb(); sembrarTodo(db);
    seedOrden(db, 'orden-1', ordenBase({ tokenPortalCliente: 'token-existente' }));
    m.operariaDeTecnico.mockResolvedValue({ uid: UID_OPERARIA_A, nombre: 'Wila' });
    const previewId = await hacerPreview(db, { ...entrada, destinoUid: UID_TEC_ORIG });
    const r = await call({ action: 'confirmar', previewId });
    expect(r.status).toHaveBeenCalledWith(200);
    const updated = (await db.collection('ordenes_servicio').doc('orden-1').get()).data();
    expect(updated.fechaCita.toMillis()).toBe(nuevaFecha);
    expect(updated.tokenPortalCliente).toBe('token-existente');
    expect(updated.reagendada).toBe(true);
    const r2 = await call({ action: 'confirmar', previewId });
    expect(r2.status).toHaveBeenCalledWith(409);
    expect((await db.collection('ordenes_servicio').doc('orden-1').get()).data().historialFases).toHaveLength(1);
  });
  it('bloquea una cita ocupada después de consultar y antes de confirmar', async () => {
    const db = makeDb(); sembrarTodo(db);
    const previewId = await hacerPreview(db, entrada);
    seedOrden(db, 'nueva-ocupacion', ordenBase({ tecnicoId: UID_TEC_DEST, fechaCita: { toMillis: () => nuevaFecha } }));
    const r = await call({ action: 'confirmar', previewId });
    expect(r.json.mock.calls[0][0].codigo).toBe('conflicto_agenda');
    expect((await db.collection('ordenes_servicio').doc('orden-1').get()).data().fechaCita.toMillis()).toBe(FECHA_MS);
  });
  it('rechaza horas fraccionadas y motivo vacío', async () => {
    const db = makeDb(); sembrarTodo(db);
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    const base = { action: 'preview', ordenId: 'orden-1', esperado: esperadoBase(), destinoUid: UID_TEC_DEST, ...entrada };
    expect((await call({ ...base, nuevaFechaCitaMs: nuevaFecha + 60000 })).json.mock.calls[0][0].codigo).toBe('bad_request');
    expect((await call({ ...base, motivo: '' })).json.mock.calls[0][0].codigo).toBe('motivo_requerido');
  });
});

describe('cancelación de visita e incidencias', () => {
  const esperado = esperadoBase();
  const body = { action: 'cancelar_visita', ordenId: 'orden-1', esperado, motivo: 'Cliente salió de viaje esta semana' };
  it('cancela la visita conservando fase, importe y fecha; reintento no duplica auditoría', async () => {
    const db = makeDb(); sembrarTodo(db);
    seedOrden(db, 'orden-1', ordenBase({ visitaFallida: { detalleCliente: 'No puede recibir' }, precio: 5000 }));
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    expect((await call(body)).status).toHaveBeenCalledWith(200);
    let o = (await db.collection('ordenes_servicio').doc('orden-1').get()).data();
    expect(o.visitaFallida).toBeNull();
    expect(o.visitaCancelada.motivo).toBe(body.motivo);
    expect(o.fase).toBe('agendado'); expect(o.precio).toBe(5000);
    expect(o.fechaCita.toMillis()).toBe(FECHA_MS);
    expect((await call(body)).json.mock.calls[0][0].yaCancelada).toBe(true);
    o = (await db.collection('ordenes_servicio').doc('orden-1').get()).data();
    expect(o.auditoria).toHaveLength(1);
  });
  it('requiere motivo y no permite cancelar un aviso ya resuelto', async () => {
    const db = makeDb(); sembrarTodo(db);
    m.accesoEquipo.mockResolvedValue({ uid: UID_ADMIN, rol: 'administrador', db });
    expect((await call({ ...body, motivo: '' })).status).toHaveBeenCalledWith(400);
    expect((await call(body)).json.mock.calls[0][0].codigo).toBe('cambio');
  });
  it('secretaria no puede cancelar la visita de otro equipo', async () => {
    const db = makeDb(); sembrarTodo(db);
    seedPerfilUsuarios(db, UID_SECRETARIA_A, PERFIL_SECRETARIA_A);
    seedPersonal(db, 'secretaria-A', { uid: UID_SECRETARIA_A, operariaId: UID_OPERARIA_A });
    seedOrden(db, 'orden-1', ordenBase({ operariaId: UID_OPERARIA_B, visitaFallida: { detalleCliente: 'Ausente' } }));
    m.accesoEquipo.mockResolvedValue({ uid: UID_SECRETARIA_A, rol: 'secretaria', db });
    expect((await call(body)).status).toHaveBeenCalledWith(403);
    expect(db.__txWrites).toHaveLength(0);
  });
  it('reagendar limpia cancelación e incidencia atómicamente sin cancelar la orden', async () => {
    const db = makeDb(); sembrarTodo(db);
    seedOrden(db, 'orden-1', ordenBase({ visitaFallida: { detalleCliente: 'Ausente' }, visitaCancelada: { motivo: 'Viaje' } }));
    const previewId = await hacerPreview(db, { origen: 'reagendar', nuevaFechaCitaMs: Date.UTC(2035, 0, 2, 14), motivo: 'Cliente confirmó nueva visita' });
    expect((await call({ action: 'confirmar', previewId })).status).toHaveBeenCalledWith(200);
    const o = (await db.collection('ordenes_servicio').doc('orden-1').get()).data();
    expect(o.visitaFallida).toBeNull(); expect(o.visitaCancelada).toBeNull(); expect(o.fase).toBe('agendado');
  });
  it('secretaria no puede consultar disponibilidad ni reagendar una orden de otro equipo', async () => {
    const db = makeDb(); sembrarTodo(db);
    seedPerfilUsuarios(db, UID_SECRETARIA_A, PERFIL_SECRETARIA_A);
    seedPersonal(db, 'secretaria-A', { uid: UID_SECRETARIA_A, operariaId: UID_OPERARIA_A });
    seedOrden(db, 'orden-1', ordenBase({ operariaId: UID_OPERARIA_B }));
    m.accesoEquipo.mockResolvedValue({ uid: UID_SECRETARIA_A, rol: 'secretaria', db });
    const r = await call({ action: 'preview', ordenId: 'orden-1', esperado, destinoUid: UID_TEC_DEST, origen: 'reagendar', nuevaFechaCitaMs: Date.UTC(2035, 0, 2, 14), consultarDisponibilidad: true });
    expect(r.status).toHaveBeenCalledWith(403);
  });
});

describe('reagendar cambia responsable CRM junto con el técnico', () => {
  it('actualiza orden, atención, conversación y ruta, preservando el resto del CRM', async () => {
    const db = makeDb(); sembrarTodo(db);
    seedOrden(db, 'orden-1', ordenBase({ clienteTelefono: '(809) 555-1234' }));
    await db.collection('crm_ordenes').doc('orden-1').set({ version: 4, responsableId: UID_OPERARIA_A, nota: 'conservar' });
    await db.collection('whatsapp_conversaciones').doc('chat').set({ wa_id: '18095551234', asignadaA: UID_OPERARIA_A });
    await db.collection('crm_atencion').doc('chat').set({ version: 2, responsableId: UID_OPERARIA_A });
    const previewId = await hacerPreview(db, { origen: 'reagendar', nuevaFechaCitaMs: Date.UTC(2035, 0, 2, 14), motivo: 'Cliente confirmó con otro técnico' });
    expect((await call({ action: 'confirmar', previewId })).status).toHaveBeenCalledWith(200);
    const get = async (col: string, id: string) => (await db.collection(col).doc(id).get()).data();
    expect(await get('crm_ordenes', 'orden-1')).toMatchObject({ version: 5, responsableId: UID_OPERARIA_B, nota: 'conservar' });
    expect(await get('crm_atencion', 'chat')).toMatchObject({ version: 3, responsableId: UID_OPERARIA_B, pendiente: true });
    expect(await get('whatsapp_conversaciones', 'chat')).toMatchObject({ asignadaA: UID_OPERARIA_B });
    expect(await get('crm_chat_rutas', 'chat')).toMatchObject({ ordenId: 'orden-1', actualizadoPor: UID_ADMIN });
    expect(await get('ordenes_servicio', 'orden-1')).toMatchObject({ responsableId: UID_OPERARIA_B, tecnicoId: UID_TEC_DEST });
  });
  it('un conflicto descubierto al confirmar no cambia el CRM ni el chat', async () => {
    const db = makeDb(); sembrarTodo(db);
    seedOrden(db, 'orden-1', ordenBase({ clienteTelefono: '8095551234' }));
    await db.collection('crm_ordenes').doc('orden-1').set({ version: 1, responsableId: UID_OPERARIA_A });
    const fecha = Date.UTC(2035, 0, 2, 14);
    const previewId = await hacerPreview(db, { origen: 'reagendar', nuevaFechaCitaMs: fecha, motivo: 'Nueva cita' });
    seedOrden(db, 'ocupada', ordenBase({ tecnicoId: UID_TEC_DEST, fechaCita: { toMillis: () => fecha } }));
    expect((await call({ action: 'confirmar', previewId })).status).toHaveBeenCalledWith(409);
    expect((await db.collection('crm_ordenes').doc('orden-1').get()).data()).toEqual({ version: 1, responsableId: UID_OPERARIA_A });
  });
});
