import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock del store de docs por path. `doc(db, col, id)` retorna un ref
// tipado con `__path` para que `getDoc`/`tx.get` distingan entre solicitud
// y cliente y devuelvan lo correcto.
type FakeRef = { __path: string; __collection: string; id: string };
type Op = { path: string; data: Record<string, unknown>; op: 'set' | 'update' };

const mock = vi.hoisted(() => ({
  docs: {} as Record<string, Record<string, unknown> | undefined>,
  writes: [] as Op[],
  // Fuerza que el read DENTRO de la tx vea un estado distinto (race).
  txOverrides: {} as Record<string, Record<string, unknown> | undefined>,
  siguienteNumero: 'OS-0999',
}));

vi.mock('../../src/firebase/config', () => ({ db: {}, storage: {} }));
vi.mock('../../src/services/contadores.service', () => ({
  siguienteNumeroOrden: async () => mock.siguienteNumero,
}));
vi.mock('../../src/lib/appCheck', () => ({ obtenerAppCheckToken: async () => 'tok' }));
vi.mock('../../src/services/subidasPublicas.service', () => ({ subirArchivoPublicoSeguro: vi.fn() }));

vi.mock('firebase/firestore', () => {
  let newOrdenSeq = 0;
  return {
    collection: (_db: unknown, name: string) => ({ __collection: name }),
    doc: (...args: unknown[]): FakeRef => {
      if (args.length === 1) {
        newOrdenSeq += 1;
        const col = (args[0] as { __collection?: string }).__collection || 'unknown';
        const id = `new-orden-${newOrdenSeq}`;
        return { __path: `${col}/${id}`, __collection: col, id };
      }
      const col = args[1] as string;
      const id = args[2] as string;
      return { __path: `${col}/${id}`, __collection: col, id };
    },
    getDoc: async (ref: FakeRef) => {
      const data = mock.docs[ref.__path];
      return { exists: () => data !== undefined, data: () => data };
    },
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: FakeRef) => {
          const data = mock.txOverrides[ref.__path] ?? mock.docs[ref.__path];
          return { exists: () => data !== undefined, data: () => data };
        },
        set: (ref: FakeRef, data: Record<string, unknown>) => {
          mock.writes.push({ path: ref.__path, data, op: 'set' });
          mock.docs[ref.__path] = data;
        },
        update: (ref: FakeRef, data: Record<string, unknown>) => {
          mock.writes.push({ path: ref.__path, data, op: 'update' });
          mock.docs[ref.__path] = { ...(mock.docs[ref.__path] || {}), ...data };
        },
      }),
    Timestamp: { now: () => 'now' },
    serverTimestamp: () => 'server',
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    getDocs: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    onSnapshot: vi.fn(),
  };
});

import { convertirAOrden, type ClienteConversion } from '../../src/services/solicitudes.service';

function reset() {
  mock.docs = {};
  mock.writes = [];
  mock.txOverrides = {};
  mock.siguienteNumero = 'OS-0999';
}

function seedSolicitud(id: string, data: Record<string, unknown>) {
  mock.docs[`solicitudes_servicio/${id}`] = data;
}
function seedCliente(id: string, data: Record<string, unknown>) {
  mock.docs[`clientes/${id}`] = data;
}

describe('convertirAOrden — flujo base', () => {
  beforeEach(() => reset());

  it('escribe orden y actualiza solicitud dentro de la misma transacción', async () => {
    seedSolicitud('s1', { estado: 'pendiente' });
    const ordenId = await convertirAOrden(
      's1',
      { numero: 'no sobrescribir', clienteNombre: 'Prueba' },
    );
    expect(ordenId).toMatch(/^new-orden-/);
    // 2 writes: orden (set) + solicitud (update).
    expect(mock.writes).toHaveLength(2);
    const [wOrden, wSolicitud] = mock.writes;
    expect(wOrden.op).toBe('set');
    expect(wOrden.data).toMatchObject({ numero: 'OS-0999', fase: 'nuevo_lead' });
    expect(wSolicitud.op).toBe('update');
    expect(wSolicitud.data).toMatchObject({ estado: 'convertida', ordenId });
  });

  it('devuelve la orden existente al reintentar (idempotencia pre-tx)', async () => {
    seedSolicitud('s1', { estado: 'convertida', ordenId: 'existing' });
    const ordenId = await convertirAOrden('s1', {});
    expect(ordenId).toBe('existing');
    expect(mock.writes).toHaveLength(0);
  });

  it('detecta otra conversión que ocurrió entre el read pre-tx y el read dentro de la tx', async () => {
    seedSolicitud('s1', { estado: 'pendiente' });
    // El read dentro de la tx ve `ordenId` ya escrito por otra transacción.
    mock.txOverrides['solicitudes_servicio/s1'] = { estado: 'convertida', ordenId: 'concurrent' };
    const ordenId = await convertirAOrden('s1', {});
    expect(ordenId).toBe('concurrent');
    expect(mock.writes).toHaveLength(0);
  });

  it('rechaza convertir una solicitud en estado rechazada con mensaje unificado', async () => {
    seedSolicitud('s1', { estado: 'rechazada' });
    await expect(convertirAOrden('s1', {})).rejects.toThrow('no puede convertirse');
    expect(mock.writes).toHaveLength(0);
  });

  it('rechaza convertir una solicitud en estado convertida sin ordenId (inconsistente) con mensaje unificado', async () => {
    seedSolicitud('s1', { estado: 'convertida' });
    // Sin ordenId el fallback a estado bloquea la conversión — mismo texto que
    // el chequeo dentro de la tx (ambos comparten "no puede convertirse").
    await expect(convertirAOrden('s1', {})).rejects.toThrow('no puede convertirse');
    expect(mock.writes).toHaveLength(0);
  });

  it('strippea undefined anidados en metadatosCita (Firestore los rechaza)', async () => {
    seedSolicitud('s1', { estado: 'pendiente' });
    await convertirAOrden('s1', {
      clienteNombre: 'X',
      metadatosCita: {
        origen: 'solicitud_formulario',
        asignadoCaptadorId: undefined,
        empresaNombre: 'Acme',
        camposPersonalizados: {
          nota: 'ok',
          ausente: undefined,
        },
      },
    });
    const wOrden = mock.writes[0].data;
    const meta = wOrden.metadatosCita as Record<string, unknown>;
    expect(meta).toBeDefined();
    expect('asignadoCaptadorId' in meta).toBe(false);
    expect(meta.origen).toBe('solicitud_formulario');
    const campos = meta.camposPersonalizados as Record<string, unknown>;
    expect(campos.nota).toBe('ok');
    expect('ausente' in campos).toBe(false);
  });
});

describe('convertirAOrden — cliente existente (tipo: existente)', () => {
  beforeEach(() => reset());

  it('vincula la orden al cliente sin sobrescribirlo', async () => {
    seedSolicitud('s1', { estado: 'pendiente' });
    seedCliente('8095551234', {
      nombre: 'Juan Original',
      telefono: '8095551234',
      telefonoNormalizado: '8095551234',
      email: 'juan@correo.com',
    });
    const conv: ClienteConversion = { tipo: 'existente', clienteId: '8095551234' };
    const ordenId = await convertirAOrden(
      's1',
      { clienteNombre: 'Juan Distinto Solicitud' },
      conv,
    );
    expect(ordenId).toMatch(/^new-orden-/);
    // 2 writes esperados: orden + solicitud. NO se toca el cliente.
    expect(mock.writes).toHaveLength(2);
    const paths = mock.writes.map(w => w.path);
    expect(paths).not.toContain('clientes/8095551234');
    // El cliente conserva su nombre original.
    expect((mock.docs['clientes/8095551234'] as Record<string, unknown>).nombre).toBe('Juan Original');
    // La orden apunta al clienteId correcto (no al valor que venía en ordenData).
    const wOrden = mock.writes.find(w => w.path.startsWith('ordenes_servicio/'))!;
    expect(wOrden.data.clienteId).toBe('8095551234');
  });

  it('falla y no crea orden si el cliente vinculado ya no existe', async () => {
    seedSolicitud('s1', { estado: 'pendiente' });
    // NO se seedea el cliente — desapareció entre búsqueda y conversión.
    const conv: ClienteConversion = { tipo: 'existente', clienteId: '8095551234' };
    await expect(convertirAOrden('s1', { clienteNombre: 'X' }, conv)).rejects.toThrow(
      /cliente vinculado ya no existe/i,
    );
    // Fallo atómico: ninguna orden se escribió.
    const ordenWrites = mock.writes.filter(w => w.path.startsWith('ordenes_servicio/'));
    expect(ordenWrites).toHaveLength(0);
    // Y la solicitud NO quedó marcada como convertida.
    expect((mock.docs['solicitudes_servicio/s1'] as Record<string, unknown>).estado).toBe('pendiente');
  });

  it('rechaza vinculación con clienteId vacío antes de reservar contador', async () => {
    seedSolicitud('s1', { estado: 'pendiente' });
    const conv: ClienteConversion = { tipo: 'existente', clienteId: '' };
    await expect(convertirAOrden('s1', {}, conv)).rejects.toThrow(/clienteId requerido/i);
    expect(mock.writes).toHaveLength(0);
  });
});

describe('convertirAOrden — crear cliente (tipo: crear)', () => {
  beforeEach(() => reset());

  it('crea cliente nuevo y orden atómicamente cuando no hay doc existente', async () => {
    seedSolicitud('s1', { estado: 'pendiente' });
    const conv: ClienteConversion = {
      tipo: 'crear',
      telefonoNormalizado: '8095557788',
      telefonoOriginal: '(809) 555-7788',
      nombre: 'María Nueva',
      email: 'maria@correo.com',
      direccion: 'Calle X',
      lat: 18.5,
      lng: -69.9,
    };
    const ordenId = await convertirAOrden('s1', { clienteNombre: 'María Nueva' }, conv);
    expect(ordenId).toMatch(/^new-orden-/);
    // Tres writes: cliente (set) + orden (set) + solicitud (update).
    expect(mock.writes).toHaveLength(3);
    const wCliente = mock.writes.find(w => w.path === 'clientes/8095557788')!;
    expect(wCliente.op).toBe('set');
    expect(wCliente.data).toMatchObject({
      nombre: 'María Nueva',
      telefono: '(809) 555-7788',
      telefonoNormalizado: '8095557788',
      email: 'maria@correo.com',
      direccion: 'Calle X',
      lat: 18.5,
      lng: -69.9,
      origen: 'solicitud_formulario',
    });
    const wOrden = mock.writes.find(w => w.path.startsWith('ordenes_servicio/'))!;
    expect(wOrden.data.clienteId).toBe('8095557788');
  });

  it('si el cliente ya existe (race entre dos operadores), preserva sus campos y NO los sobrescribe', async () => {
    seedSolicitud('s1', { estado: 'pendiente' });
    // El "primer operador" ya creó el cliente entre el listar y la tx.
    seedCliente('8095557788', {
      nombre: 'María Existente',
      telefono: '(809) 555-7788',
      telefonoNormalizado: '8095557788',
      email: 'maria@existente.com',
      direccion: 'Calle Ya Puesta',
    });
    const conv: ClienteConversion = {
      tipo: 'crear',
      telefonoNormalizado: '8095557788',
      telefonoOriginal: '8095557788',
      nombre: 'María Otra',                 // NO debe sobrescribir "María Existente"
      email: 'nuevo@correo.com',            // NO debe sobrescribir "maria@existente.com"
      direccion: 'Otra Calle',              // NO debe sobrescribir "Calle Ya Puesta"
      referenciaDireccion: 'Frente al colmado', // sí se agrega — no había
      lat: 18.6,                             // sí — no había
      lng: -69.8,                            // sí — no había
    };
    const ordenId = await convertirAOrden('s1', { clienteNombre: 'María Otra' }, conv);
    expect(ordenId).toMatch(/^new-orden-/);
    const wCliente = mock.writes.find(w => w.path === 'clientes/8095557788')!;
    expect(wCliente.op).toBe('update');
    // Solo campos que estaban vacíos + updatedAt.
    expect(wCliente.data).toMatchObject({
      referenciaDireccion: 'Frente al colmado',
      lat: 18.6,
      lng: -69.8,
    });
    expect('nombre' in wCliente.data).toBe(false);
    expect('email' in wCliente.data).toBe(false);
    expect('direccion' in wCliente.data).toBe(false);
    // El doc final conserva los campos originales.
    const clienteFinal = mock.docs['clientes/8095557788'] as Record<string, unknown>;
    expect(clienteFinal.nombre).toBe('María Existente');
    expect(clienteFinal.email).toBe('maria@existente.com');
    expect(clienteFinal.direccion).toBe('Calle Ya Puesta');
    // La orden apunta al cliente correcto.
    const wOrden = mock.writes.find(w => w.path.startsWith('ordenes_servicio/'))!;
    expect(wOrden.data.clienteId).toBe('8095557788');
  });

  it('rechaza teléfono normalizado inválido (menos de 10 dígitos) sin reservar contador', async () => {
    seedSolicitud('s1', { estado: 'pendiente' });
    const conv: ClienteConversion = {
      tipo: 'crear',
      telefonoNormalizado: '80955',
      telefonoOriginal: '80955',
      nombre: 'X',
    };
    await expect(convertirAOrden('s1', {}, conv)).rejects.toThrow(/tel[eé]fono inv[aá]lido/i);
    expect(mock.writes).toHaveLength(0);
  });

  it('rechaza nombre vacío para creación nueva', async () => {
    seedSolicitud('s1', { estado: 'pendiente' });
    const conv: ClienteConversion = {
      tipo: 'crear',
      telefonoNormalizado: '8095551234',
      telefonoOriginal: '8095551234',
      nombre: '   ',
    };
    await expect(convertirAOrden('s1', {}, conv)).rejects.toThrow(/nombre requerido/i);
    expect(mock.writes).toHaveLength(0);
  });

  it('convertir dos veces con el mismo telNorm no duplica cliente ni orden', async () => {
    seedSolicitud('s1', { estado: 'pendiente' });
    const conv: ClienteConversion = {
      tipo: 'crear',
      telefonoNormalizado: '8095550001',
      telefonoOriginal: '8095550001',
      nombre: 'Ana',
    };
    const ordenId1 = await convertirAOrden('s1', { clienteNombre: 'Ana' }, conv);
    // Segundo intento — la solicitud ya está convertida, cortocircuita al ordenId1.
    const ordenId2 = await convertirAOrden('s1', { clienteNombre: 'Ana' }, conv);
    expect(ordenId2).toBe(ordenId1);
    // Se escribió UNA sola orden y UN solo cliente.
    const ordenWrites = mock.writes.filter(w => w.path.startsWith('ordenes_servicio/'));
    const clienteWrites = mock.writes.filter(w => w.path.startsWith('clientes/'));
    expect(ordenWrites).toHaveLength(1);
    expect(clienteWrites).toHaveLength(1);
    expect(clienteWrites[0].op).toBe('set');
  });
});
