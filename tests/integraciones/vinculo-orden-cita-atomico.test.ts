import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests del write atómico orden+vínculo cita
 * (`src/utils/vinculoOrdenCita.ts::escribirOrdenConVinculoCita`).
 *
 * Bug original: `useOrdenCreateForm.handleSubmit` hacía dos writes
 * separados — `addDoc(ordenes_servicio)` + `updateDoc(citas_por_confirmar,
 * { ordenIdCreada })`. Si el segundo fallaba, un reintento generaba una
 * orden duplicada porque la cita no tenía cómo señalar "ya creé una".
 *
 * Escenarios cubiertos (los 5 que pidió el revisor):
 *   1. atomicidad: escritura de orden + vínculo cita en un solo commit
 *      (imposible tener uno sin el otro).
 *   2. commit fallido sin datos: si la tx aborta, ni la orden ni el
 *      vínculo persisten — retry desde cero, sin fantasmas.
 *   3. doble usuario tras lock timeout: si otro ya escribió el vínculo,
 *      el commit lanza `CITA_YA_VINCULADA` con el id ganador — nunca
 *      sobreescribe.
 *   4. garantía falla → retry misma orden: `validarOrdenReusable` retorna
 *      `existe:true`, permitiendo re-ejecutar el flujo garantía sin
 *      re-crear la orden.
 *   5. vínculo apunta a doc inexistente/rechazado: `validarOrdenReusable`
 *      retorna `existe:false` — el hook aborta con toast, no reintenta
 *      con id fantasma.
 *
 * Los tests corren SIN emulator (mocks de firestore por __path). Codex
 * puede replicar con el emulator en puerto 8080 (`--project
 * demo-mister-service-rules`) si lo requiere.
 */

type FakeRef = { __path: string; __collection: string; id: string };
type Op = { path: string; data: Record<string, unknown>; op: 'set' | 'update' };

const mock = vi.hoisted(() => ({
  docs: {} as Record<string, Record<string, unknown> | undefined>,
  writes: [] as Op[],
  // Fuerza fallo específico dentro de la tx (ej: `tx.set` throws).
  failOn: null as null | 'set' | 'update' | 'get',
  // Simula que ANOTHER operator escribió `ordenIdCreada` entre el lock
  // pre-tx y el commit de esta tx. El read dentro de la tx ve el nuevo id.
  txOverrides: {} as Record<string, Record<string, unknown> | undefined>,
  autoIdSeq: 0,
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ __collection: name }),
  doc: (...args: unknown[]): FakeRef => {
    // doc(collection) → auto-id nuevo
    if (args.length === 1) {
      mock.autoIdSeq += 1;
      const col = (args[0] as { __collection?: string }).__collection || 'unknown';
      const id = `auto-${mock.autoIdSeq}`;
      return { __path: `${col}/${id}`, __collection: col, id };
    }
    // doc(db, collection, id) → ref explícita
    const col = args[1] as string;
    const id = args[2] as string;
    return { __path: `${col}/${id}`, __collection: col, id };
  },
  getDoc: async (ref: FakeRef) => {
    const data = mock.docs[ref.__path];
    return { exists: () => data !== undefined, data: () => data };
  },
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    // Buffer pending writes: si el callback lanza, NO se commiten.
    const pending: Op[] = [];
    let readCount = 0;
    let writesFlushed = false;
    try {
      const result = await fn({
        get: async (ref: FakeRef) => {
          if (mock.failOn === 'get' && readCount === 0) {
            readCount += 1;
            throw new Error('fake get failure');
          }
          readCount += 1;
          const data = mock.txOverrides[ref.__path] ?? mock.docs[ref.__path];
          return { exists: () => data !== undefined, data: () => data };
        },
        set: (ref: FakeRef, data: Record<string, unknown>) => {
          if (mock.failOn === 'set') throw new Error('fake set failure');
          pending.push({ path: ref.__path, data, op: 'set' });
        },
        update: (ref: FakeRef, data: Record<string, unknown>) => {
          if (mock.failOn === 'update') throw new Error('fake update failure');
          pending.push({ path: ref.__path, data, op: 'update' });
        },
      });
      // Solo flush si el callback resolvió sin throw — mismo comportamiento
      // que el runTransaction real de Firestore.
      writesFlushed = true;
      for (const op of pending) {
        mock.writes.push(op);
        if (op.op === 'set') {
          mock.docs[op.path] = op.data;
        } else {
          mock.docs[op.path] = { ...(mock.docs[op.path] || {}), ...op.data };
        }
      }
      return result;
    } catch (err) {
      // Reasegurar que pending NO se materializa si abortamos.
      if (!writesFlushed) {
        // Deja `mock.writes` sin cambios — verificable en el test.
      }
      throw err;
    }
  },
  serverTimestamp: () => 'server-ts',
  // Los demás re-exports no se usan en el helper testeado, pero el módulo
  // debe seguir importándolos sin explotar.
  Timestamp: { now: () => 'now' },
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  setDoc: vi.fn(),
}));

import {
  escribirOrdenConVinculoCita, validarOrdenReusable, adquirirIntentoCita, liberarIntentoCita,
  ERR_CITA_DESAPARECIO, ERR_CITA_YA_VINCULADA_PREFIX,
} from '../../src/utils/vinculoOrdenCita';

const fakeDb = {} as unknown as Parameters<typeof escribirOrdenConVinculoCita>[0];

const intento = { usuarioId: 'user-1', intentoId: 'intento-1', huella: '{}' };
const lock = { procesando: true, procesandoPor: 'user-1', procesandoIntento: 'intento-1' };
function reset() {
  mock.docs = {};
  mock.writes = [];
  mock.txOverrides = {};
  mock.failOn = null;
  mock.autoIdSeq = 0;
}

describe('escribirOrdenConVinculoCita — write atómico', () => {
  beforeEach(() => reset());

  it('1) atomicidad: escribe orden + `ordenIdCreada` en un solo commit', async () => {
    mock.docs['citas_por_confirmar/c1'] = { ...lock };
    const { ordenId } = await escribirOrdenConVinculoCita(fakeDb, {
        intento,
      ordenData: { numero: 'OS-0001', clienteNombre: 'X' },
      citaId: 'c1',
      usuarioId: 'user-1',
    });
    expect(ordenId).toMatch(/^auto-\d+$/);
    // Exactamente 2 writes: la orden (set) y el update de la cita.
    expect(mock.writes).toHaveLength(2);
    const [wOrden, wCita] = mock.writes;
    expect(wOrden.op).toBe('set');
    expect(wOrden.path).toBe(`ordenes_servicio/${ordenId}`);
    expect(wOrden.data).toMatchObject({ numero: 'OS-0001', clienteNombre: 'X' });
    expect(wCita.op).toBe('update');
    expect(wCita.path).toBe('citas_por_confirmar/c1');
    expect(wCita.data).toMatchObject({
      ordenIdCreada: ordenId,
      procesando: true,
      procesandoPor: 'user-1',
    });
    // El estado post-tx refleja ambos cambios.
    expect(mock.docs[`ordenes_servicio/${ordenId}`]).toBeDefined();
    expect(mock.docs['citas_por_confirmar/c1']).toMatchObject({ ordenIdCreada: ordenId });
  });

  it('2) commit fallido sin datos: si la tx aborta, ni orden ni vínculo persisten', async () => {
    mock.docs['citas_por_confirmar/c1'] = { ...lock };
    // Forzar que `tx.update` del vínculo falle → commit aborta.
    mock.failOn = 'update';
    await expect(
      escribirOrdenConVinculoCita(fakeDb, {
        intento,
        ordenData: { numero: 'OS-0002' },
        citaId: 'c1',
      }),
    ).rejects.toThrow('fake update failure');
    // NADA se persistió — retry desde cero es limpio.
    expect(mock.writes).toHaveLength(0);
    expect(mock.docs['citas_por_confirmar/c1']).toEqual({ ...lock });
    // La orden no debe haber quedado en el store.
    const ordenPaths = Object.keys(mock.docs).filter(k => k.startsWith('ordenes_servicio/'));
    expect(ordenPaths).toHaveLength(0);
  });

  it('2b) commit fallido si `tx.set` de la orden falla: cita queda sin ordenIdCreada', async () => {
    mock.docs['citas_por_confirmar/c1'] = { ...lock };
    mock.failOn = 'set';
    await expect(
      escribirOrdenConVinculoCita(fakeDb, {
        intento,
        ordenData: { numero: 'OS-0002' },
        citaId: 'c1',
      }),
    ).rejects.toThrow('fake set failure');
    expect(mock.writes).toHaveLength(0);
    expect(mock.docs['citas_por_confirmar/c1']).toEqual({ ...lock });
    expect(mock.docs['citas_por_confirmar/c1'].ordenIdCreada).toBeUndefined();
  });

  it('3) doble usuario tras lock timeout: si otra tx escribió `ordenIdCreada` primero, lanzamos CITA_YA_VINCULADA con el id ganador', async () => {
    mock.docs['citas_por_confirmar/c1'] = { ...lock };
    // Simula: otra pasada corriendo en paralelo escribió `ordenIdCreada`
    // ANTES de que este commit alcance su read. El read dentro de la tx lo ve.
    mock.txOverrides['citas_por_confirmar/c1'] = {
      ...lock,
      ordenIdCreada: 'orden-ya-existente-por-otro-op',
    };
    await expect(
      escribirOrdenConVinculoCita(fakeDb, {
        intento,
        ordenData: { numero: 'OS-0003' },
        citaId: 'c1',
      }),
    ).rejects.toThrow(ERR_CITA_YA_VINCULADA_PREFIX + 'orden-ya-existente-por-otro-op');
    // Ninguna nueva orden fue escrita.
    expect(mock.writes).toHaveLength(0);
    // El vínculo del otro operador se mantuvo intacto.
    expect(mock.docs['citas_por_confirmar/c1']).toEqual({ ...lock });
  });

  it('lanza CITA_DESAPARECIO si el doc de la cita ya no existe al commit', async () => {
    // Cita nunca fue seedeada.
    await expect(
      escribirOrdenConVinculoCita(fakeDb, {
        intento,
        ordenData: { numero: 'OS-0004' },
        citaId: 'no-existe',
      }),
    ).rejects.toThrow(ERR_CITA_DESAPARECIO);
    expect(mock.writes).toHaveLength(0);
  });

  it('rechaza citaId inválido antes de tocar Firestore', async () => {
    await expect(
      escribirOrdenConVinculoCita(fakeDb, {
        intento,
        ordenData: {},
        citaId: '',
      }),
    ).rejects.toThrow('VINCULO:CITA_ID_INVALIDO');
    expect(mock.writes).toHaveLength(0);
  });

  it('la orden usa un id auto-generado por Firestore (no derivado del payload)', async () => {
    // Verifica que dos submits con el mismo cliente NUNCA chocarían por id
    // — cada uno recibe un auto-id distinto.
    mock.docs['citas_por_confirmar/c1'] = { ...lock };
    mock.docs['citas_por_confirmar/c2'] = { ...lock };
    const payloadIguales = { clienteId: '8095551234', numero: 'OS-0005' };
    const r1 = await escribirOrdenConVinculoCita(fakeDb, {
        intento,
      ordenData: payloadIguales,
      citaId: 'c1',
    });
    const r2 = await escribirOrdenConVinculoCita(fakeDb, {
        intento,
      ordenData: payloadIguales,
      citaId: 'c2',
    });
    expect(r1.ordenId).not.toBe(r2.ordenId);
    expect(mock.docs[`ordenes_servicio/${r1.ordenId}`]).toBeDefined();
    expect(mock.docs[`ordenes_servicio/${r2.ordenId}`]).toBeDefined();
  });
});

describe('validarOrdenReusable — garantía retry + vínculo bogus', () => {
  beforeEach(() => reset());

  it('4) garantía falla → retry misma orden: `existe:true` con `numero` del doc', async () => {
    mock.docs['ordenes_servicio/orden-existente'] = { numero: 'OS-0042', clienteTelefono: '8095551111', estado: 'activo', metadatosCita: { citaOrigenId: 'c1' } };
    mock.docs['citas_por_confirmar/c1'] = { ...lock, ordenIdCreada: 'orden-existente' };
    mock.docs['ordenes_servicio/orden-existente']!.clienteId = 'cliente';
    mock.docs['citas_por_confirmar/c1']!.clienteIdVinculado = 'cliente';
    const res = await validarOrdenReusable(fakeDb, 'orden-existente', { citaId: 'c1', intento });
    expect(res).toEqual({ existe: true, numero: 'OS-0042' });
  });

  it('5) vínculo apunta a doc inexistente/rechazado: `existe:false`', async () => {
    const res = await validarOrdenReusable(fakeDb, 'orden-bogus', { citaId: 'c1', intento });
    expect(res).toEqual({ existe: false, numero: '' });
  });

  it('doc existente sin campo `numero` retorna `numero:""` — el caller decide qué mostrar', async () => {
    mock.docs['ordenes_servicio/orden-sin-numero'] = { clienteTelefono: '8095551111', estado: 'activo', metadatosCita: { citaOrigenId: 'c1' } };
    mock.docs['citas_por_confirmar/c1'] = { ...lock, ordenIdCreada: 'orden-sin-numero', clienteIdVinculado: 'cliente' };
    mock.docs['ordenes_servicio/orden-sin-numero']!.clienteId = 'cliente';
    const res = await validarOrdenReusable(fakeDb, 'orden-sin-numero', { citaId: 'c1', intento });
    expect(res).toEqual({ existe: true, numero: '' });
  });
});

describe('propiedad y recuperación del intento', () => {
  beforeEach(reset);
  it('no roba un intento activo aunque exista orden vinculada', async () => {
    mock.docs['citas_por_confirmar/c1'] = { ...lock, ordenIdCreada: 'orden' };
    await expect(adquirirIntentoCita(fakeDb, 'c1', 'otro', 'otro-intento')).rejects.toThrow('CITA_YA_PROCESANDO');
    await liberarIntentoCita(fakeDb, 'c1', { ...intento, intentoId: 'viejo' });
    expect(mock.docs['citas_por_confirmar/c1']!.procesandoIntento).toBe('intento-1');
  });
  it('callback falla: libera solo su intento y recupera misma orden', async () => {
    mock.docs['citas_por_confirmar/c1'] = { ...lock, ordenIdCreada: 'orden' };
    await liberarIntentoCita(fakeDb, 'c1', intento);
    const siguiente = await adquirirIntentoCita(fakeDb, 'c1', 'otro', 'reintento');
    expect(siguiente.ordenId).toBe('orden');
    await liberarIntentoCita(fakeDb, 'c1', intento);
    expect(mock.docs['citas_por_confirmar/c1']!.procesandoIntento).toBe('reintento');
  });
  it('commit rechaza propietario distinto y cita editada durante procesamiento', async () => {
    mock.docs['citas_por_confirmar/c1'] = { ...lock, procesandoPor: 'otro' };
    await expect(escribirOrdenConVinculoCita(fakeDb, { citaId: 'c1', intento, ordenData: {} })).rejects.toThrow('LOCK_AJENO');
    mock.docs['citas_por_confirmar/c1'] = { ...lock, telefono: 'nuevo' };
    await expect(escribirOrdenConVinculoCita(fakeDb, { citaId: 'c1', intento, ordenData: {} })).rejects.toThrow('CITA_CAMBIO');
    expect(mock.writes).toHaveLength(0);
  });
  it.each(['origen', 'cliente', 'anulada'])('no reutiliza orden con %s ajeno/inactivo', async causa => {
    mock.docs['citas_por_confirmar/c1'] = { ...lock, ordenIdCreada: 'orden', clienteIdVinculado: 'cliente' };
    mock.docs['ordenes_servicio/orden'] = { clienteId: causa === 'cliente' ? 'otro' : 'cliente', estado: causa === 'anulada' ? 'cancelado' : 'activo', metadatosCita: { citaOrigenId: causa === 'origen' ? 'otra' : 'c1' } };
    expect((await validarOrdenReusable(fakeDb, 'orden', { citaId: 'c1', intento })).existe).toBe(false);
  });
});
