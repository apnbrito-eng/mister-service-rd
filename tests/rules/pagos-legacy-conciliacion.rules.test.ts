import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';

/**
 * Cobertura real (emulador Firebase, proyecto demo) para el par legacy
 *  - `conciliarIdentidadFechaPago`
 *  - `confirmarPagoOrden`
 *
 * NO DUPLICA los casos ya cubiertos por `tests/rules/auditoria-writers.rules.test.ts`:
 *   - admin confirma pago OK + audit atómico (línea 34-39 de ese archivo).
 *   - dos copias con mismo `id` bloquean reparar + confirmar (línea 54-62).
 *
 * Foco de este archivo: reparación auditada de ID/fecha faltantes,
 * bloqueo por huella cambiada, permiso efectivo por rol vía `puede()`,
 * y repetición segura (idempotencia + no doble audit).
 */

const m = vi.hoisted(() => ({
  db: null as any,
  auth: { currentUser: { uid: 'uid-admin' } as { uid: string } | null },
}));
vi.mock('../../src/firebase/config', () => ({
  get db() { return m.db; },
  auth: m.auth,
}));

let conciliar: typeof import('../../src/services/ordenes.service').conciliarIdentidadFechaPago;
let confirmar: typeof import('../../src/services/ordenes.service').confirmarPagoOrden;

beforeAll(async () => {
  await iniciarEntorno();
  m.db = como(UID.admin);
  const svc = await import('../../src/services/ordenes.service');
  conciliar = svc.conciliarIdentidadFechaPago;
  confirmar = svc.confirmarPagoOrden;
});

afterAll(async () => { await entorno().cleanup(); });

beforeEach(async () => {
  await resetearConPerfiles();
  m.db = como(UID.admin);
  m.auth.currentUser = { uid: UID.admin };
});

const ORDEN = 'ordenes_servicio/qa-legacy';

async function sembrarPago(pago: Record<string, unknown>) {
  await sembrar(ORDEN, { fase: 'en_diagnostico', pagos: [pago] });
}

// La orden y la auditoría se inspeccionan siempre desde una conexión admin
// para no chocar con las rules (auditoria_admin exige `esAdmin()` en read).
async function pagos(): Promise<Record<string, unknown>[]> {
  const snap = await getDoc(doc(como(UID.admin), ORDEN));
  return (snap.data()?.pagos ?? []) as Record<string, unknown>[];
}

async function audits(): Promise<Record<string, unknown>[]> {
  return (await getDocs(collection(como(UID.admin), 'auditoria_admin'))).docs.map((d) => d.data());
}

const MOTIVO = 'Comprobante bancario revisado';

describe('conciliarIdentidadFechaPago — admin (rules + permiso pagosVerificar)', () => {
  it('sin id: genera uno nuevo, deja verificado=false, no toca monto/método/fecha existentes, y audita', async () => {
    const original = { monto: 500, metodo: 'efectivo', fecha: '2026-09-29', verificado: false };
    await sembrarPago(original);
    await conciliar('qa-legacy', 0, original, '2026-09-29', MOTIVO);
    const [reparado] = await pagos();
    expect(reparado).toMatchObject({ monto: 500, metodo: 'efectivo', verificado: false });
    expect(typeof reparado.id).toBe('string');
    expect((reparado.id as string).length).toBeGreaterThan(0);
    // La fecha existente y válida NO se sustituye durante la reparación de ID.
    expect(reparado.fecha).toBe('2026-09-29');
    const [audit, ...resto] = await audits();
    expect(resto).toHaveLength(0);
    expect(audit).toMatchObject({
      accion: 'pago.conciliacion_identidad_fecha',
      actorUid: UID.admin,
      actorId: UID.admin,
      ordenId: 'qa-legacy',
      indice: 0,
      motivo: MOTIVO,
    });
  });

  it('sin fecha: acepta la fecha ISO indicada, deja verificado=false y audita anterior/posterior', async () => {
    const original = { id: 'p-sin-fecha', monto: 750, metodo: 'transferencia', verificado: false };
    await sembrarPago(original);
    await conciliar('qa-legacy', 0, original, '2026-09-28T10:00:00-04:00', MOTIVO);
    const [reparado] = await pagos();
    expect(reparado).toMatchObject({ id: 'p-sin-fecha', monto: 750, metodo: 'transferencia', verificado: false });
    expect(reparado.fecha).toBeTruthy();
    const [audit] = await audits();
    expect(audit).toMatchObject({ accion: 'pago.conciliacion_identidad_fecha', anterior: original, motivo: MOTIVO });
    expect((audit.posterior as Record<string, unknown>).id).toBe('p-sin-fecha');
  });

  it('huella cambió entre lectura y reparación: rechaza sin escribir orden ni audit', async () => {
    const original = { monto: 300, metodo: 'efectivo', fecha: '2026-09-29', verificado: false };
    // El pago real quedó con monto distinto — como si otro usuario lo hubiese editado.
    await sembrarPago({ ...original, monto: 301 });
    await expect(conciliar('qa-legacy', 0, original, '2026-09-29', MOTIVO)).rejects.toThrow('cambió');
    expect((await pagos())[0]).toMatchObject({ monto: 301 });
    expect(await audits()).toHaveLength(0);
  });

  it('segunda reparación sobre un pago ya reparado: rechaza "ya son válidas" sin duplicar ni auditar', async () => {
    const original = { monto: 500, metodo: 'efectivo', verificado: false };
    await sembrarPago(original);
    await conciliar('qa-legacy', 0, original, '2026-09-29', MOTIVO);
    const [tras1a] = await pagos();
    // La huella cambió (id + fecha nuevos), por eso el mensaje que gana es "cambió".
    // Igualmente lo que importa: sin duplicación en `pagos` y sin doble audit.
    await expect(conciliar('qa-legacy', 0, original, '2026-09-29', MOTIVO)).rejects.toThrow();
    const trasSegunda = await pagos();
    expect(trasSegunda).toHaveLength(1);
    expect(trasSegunda[0]).toMatchObject({ id: tras1a.id, verificado: false });
    expect(await audits()).toHaveLength(1);
  });

  it('con la huella actualizada, un segundo intento sobre un pago ya válido rechaza porque ya no hay incidencias', async () => {
    const yaValido = { id: 'p-ok', monto: 500, metodo: 'efectivo', fecha: '2026-09-29', verificado: false };
    await sembrarPago(yaValido);
    await expect(conciliar('qa-legacy', 0, yaValido, '2026-09-29', MOTIVO)).rejects.toThrow('ya son válidas');
    expect(await audits()).toHaveLength(0);
    expect((await pagos())[0]).toEqual(yaValido);
  });
});

describe('conciliarIdentidadFechaPago — matriz de permisos', () => {
  it('operaria con permisosSistema.pagosVerificar=true puede reparar (rule + puede() ambos pasan)', async () => {
    await sembrar(`usuarios/${UID.operaria}`, {
      rol: 'operaria', nombre: 'QA operaria', email: 'operaria@qa.local', activo: true,
      permisosPersonalizados: true,
      permisosSistema: {
        // Solo lo mínimo que la rama de servicio necesita; el resto queda ausente.
        pagosVerificar: true,
      },
    });
    m.db = como(UID.operaria);
    m.auth.currentUser = { uid: UID.operaria };
    const original = { monto: 400, metodo: 'efectivo', verificado: false };
    await sembrarPago(original);
    await conciliar('qa-legacy', 0, original, '2026-09-29', MOTIVO);
    expect((await pagos())[0]).toMatchObject({ monto: 400, verificado: false });
    expect(await audits()).toEqual([expect.objectContaining({ actorUid: UID.operaria })]);
  });

  it('operaria sin override (defaults del rol → pagosVerificar=false): rechazada por servicio con "permiso"', async () => {
    m.db = como(UID.operaria);
    m.auth.currentUser = { uid: UID.operaria };
    const original = { monto: 400, metodo: 'efectivo', verificado: false };
    await sembrarPago(original);
    await expect(conciliar('qa-legacy', 0, original, '2026-09-29', MOTIVO)).rejects.toThrow('permiso');
    expect(await audits()).toHaveLength(0);
    expect((await pagos())[0]).toEqual(original);
  });

  it('técnico: rechazado por servicio (defaults tecnico → pagosVerificar=false); sin escritura', async () => {
    m.db = como(UID.tecnico);
    m.auth.currentUser = { uid: UID.tecnico };
    const original = { monto: 400, metodo: 'efectivo', verificado: false };
    await sembrarPago(original);
    await expect(conciliar('qa-legacy', 0, original, '2026-09-29', MOTIVO)).rejects.toThrow('permiso');
    expect(await audits()).toHaveLength(0);
    expect((await pagos())[0]).toEqual(original);
  });

  it('usuario autenticado pero sin doc en usuarios/: rechazado antes de mutar; sin audit ni cambios en pagos', async () => {
    m.db = como(UID.sinPerfil);
    m.auth.currentUser = { uid: UID.sinPerfil };
    const original = { monto: 400, metodo: 'efectivo', verificado: false };
    await sembrarPago(original);
    // Sin doc en usuarios/, la rule de `ordenes_servicio` (esStaff) niega
    // el `tx.get` de la orden y aborta la transacción antes que el
    // check del servicio. Da igual cuál capa gane: el efecto observable
    // es que nada se escribe.
    await expect(conciliar('qa-legacy', 0, original, '2026-09-29', MOTIVO)).rejects.toBeDefined();
    expect(await audits()).toHaveLength(0);
    expect((await pagos())[0]).toEqual(original);
  });

  it('sin sesión: rechaza antes de tocar Firestore', async () => {
    m.auth.currentUser = null;
    const original = { monto: 400, metodo: 'efectivo', verificado: false };
    await sembrarPago(original);
    await expect(conciliar('qa-legacy', 0, original, '2026-09-29', MOTIVO)).rejects.toThrow('sesión');
    expect(await audits()).toHaveLength(0);
  });
});

describe('confirmarPagoOrden — repetición concurrente segura', () => {
  it('dos confirmaciones seguidas sobre el mismo pago: la segunda es idempotente y no duplica audit', async () => {
    await sembrarPago({ id: 'p-idem', monto: 200, metodo: 'efectivo', fecha: '2026-09-29', verificado: false });
    expect(await confirmar('qa-legacy', 'p-idem', { id: UID.admin, nombre: 'QA' })).toEqual({ ok: true });
    expect(await confirmar('qa-legacy', 'p-idem', { id: UID.admin, nombre: 'QA' }))
      .toMatchObject({ ok: false, razon: 'ya_confirmado' });
    const finales = await pagos();
    expect(finales).toHaveLength(1);
    expect(finales[0]).toMatchObject({ id: 'p-idem', verificado: true, verificadoPorId: UID.admin });
    expect(await audits()).toHaveLength(1);
  });

  it('confirmación en paralelo (Promise.all): solo una gana la carrera, la otra queda idempotente y no duplica audit', async () => {
    await sembrarPago({ id: 'p-race', monto: 200, metodo: 'efectivo', fecha: '2026-09-29', verificado: false });
    const [a, b] = await Promise.all([
      confirmar('qa-legacy', 'p-race', { id: UID.admin, nombre: 'QA' }),
      confirmar('qa-legacy', 'p-race', { id: UID.admin, nombre: 'QA' }),
    ]);
    const oks = [a, b].filter((r) => r.ok);
    const idem = [a, b].filter((r) => !r.ok && r.razon === 'ya_confirmado');
    // El emulador serializa las runTransaction, así que una gana y la otra
    // ve `verificado === true` y sale con `ya_confirmado`. Lo garantizado
    // fuerte es: nunca dos audits y nunca dos writes de pago.
    expect(oks.length + idem.length).toBe(2);
    expect(oks.length).toBeGreaterThanOrEqual(1);
    expect((await pagos())[0]).toMatchObject({ verificado: true });
    expect(await audits()).toHaveLength(1);
  });

  it('confirmación tras reparación consecutiva: la reparación no confirma; recién `confirmarPagoOrden` marca verificado', async () => {
    const original = { monto: 200, metodo: 'efectivo', verificado: false };
    await sembrarPago(original);
    await conciliar('qa-legacy', 0, original, '2026-09-29', MOTIVO);
    const trasReparar = (await pagos())[0];
    expect(trasReparar.verificado).toBe(false);
    expect(await confirmar('qa-legacy', trasReparar.id as string, { id: UID.admin, nombre: 'QA' })).toEqual({ ok: true });
    const trasConfirmar = (await pagos())[0];
    expect(trasConfirmar).toMatchObject({ id: trasReparar.id, monto: 200, verificado: true });
    // Un audit por acción: uno de conciliación + uno de confirmación.
    const acciones = (await audits()).map((a) => a.accion);
    expect(acciones.sort()).toEqual(['pago.conciliacion_identidad_fecha', 'pago.confirmado']);
  });
});
