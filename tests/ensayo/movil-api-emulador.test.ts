import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const m = vi.hoisted(() => ({ db: null as any, uid: '', rol: 'tecnico' }));
vi.mock('../../api/_lib/accesoEquipo.js', () => {
  class ErrorAcceso extends Error { constructor(public status: number, message: string) { super(message); } }
  return { ErrorAcceso, accesoEquipo: async () => ({ db: m.db, uid: m.uid, rol: m.rol }) };
});
vi.mock('../../api/_lib/appMovilVerificada.js', () => ({ exigirAppMovil: vi.fn() }));
import handler from '../../api/movil/estado';
import { accesoOrdenTecnico } from '../../api/_lib/accesoOrdenTecnico';
if (!['127.0.0.1:8289', '127.0.0.1:8299'].includes(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Requiere emulador local explícito');
const id = `movil-test-${Date.now()}`;
const app = initializeApp({ projectId: 'demo-mister-ensayo' }, id), db = getFirestore(app);
const refs: any[] = [];
async function llamar(body: any, method = 'POST') {
  let status = 200, result: any;
  const res: any = { setHeader() {}, status(n: number) { status = n; return this; }, json(v: any) { result = v; return this; } };
  await handler({ method, body, headers: {}, query: {} } as any, res); return { status, result };
}
async function tecnico(suffix: string) {
  m.uid = `${id}-${suffix}`; m.rol = 'tecnico';
  for (const collection of ['jornadas_moviles', 'ubicaciones_vehiculos', 'usuarios']) refs.push(db.doc(`${collection}/${m.uid}`));
  await db.doc(`usuarios/${m.uid}`).set({ rol: 'tecnico', activo: true });
  return m.uid;
}
beforeAll(() => { m.db = db; });
afterAll(async () => { await Promise.all(refs.map(ref => ref.delete())); await db.terminate(); await deleteApp(app); });
describe('Jornada móvil con almacenamiento real aislado', () => {
  it('dos inicios simultáneos recuperan la misma jornada', async () => {
    await tecnico('doble');
    const [a, b] = await Promise.all([llamar({ accion: 'iniciar' }), llamar({ accion: 'iniciar' })]);
    expect(a.status).toBe(200); expect(b.status).toBe(200); expect(a.result.jornada.id).toBe(b.result.jornada.id);
  });
  it('guarda precisión y fecha real, y actualiza el mapa de oficina', async () => {
    const uid = await tecnico('gps'); const start = await llamar({ accion: 'iniciar' });
    const muestra = { lat: 18.4, lng: -69.9, precision: 12, capturadaEn: Date.now(), simulada: false };
    const body = { accion: 'ubicacion', jornadaId: start.result.jornada.id, muestra };
    expect((await llamar(body)).status).toBe(200);
    expect((await db.doc(`ubicaciones_vehiculos/${uid}`).get()).data()?.timestamp.toMillis()).toBe(muestra.capturadaEn);
    expect((await llamar(body)).status).toBe(200); // muestra repetida idempotente
    await llamar({ accion: 'finalizar', jornadaId: start.result.jornada.id });
    expect((await llamar({ ...body, muestra: { ...muestra, capturadaEn: Date.now() } })).status).toBe(409);
    expect((await db.doc(`ubicaciones_vehiculos/${uid}`).get()).data()?.jornadaActiva).toBe(false);
  });
  it('rechaza ubicación simulada y jornadas ajenas', async () => {
    await tecnico('invalidos'); const start = await llamar({ accion: 'iniciar' });
    const muestra = { lat: 18.4, lng: -69.9, precision: 12, capturadaEn: Date.now(), simulada: true };
    expect((await llamar({ accion: 'ubicacion', jornadaId: start.result.jornada.id, muestra })).status).toBe(400);
    expect((await llamar({ accion: 'finalizar', jornadaId: 'ajena' })).status).toBe(409);
    m.rol = 'operaria'; expect((await llamar({ accion: 'iniciar' })).status).toBe(403); m.rol = 'tecnico';
  });
  it('no reutiliza una jornada vencida', async () => {
    const uid = await tecnico('vencida'); const start = await llamar({ accion: 'iniciar' });
    await db.doc(`jornadas_moviles/${uid}`).update({ expiraEn: Date.now() - 1 });
    const next = await llamar({ accion: 'iniciar' }); expect(next.result.jornada.id).not.toBe(start.result.jornada.id);
  });
  it('cambio de asignación y suspensión de empleado revocan acceso al chat', async () => {
    const uid = await tecnico('asignacion'); const ref = db.doc(`ordenes_servicio/${uid}`); refs.push(ref);
    await ref.set({ tecnicoId: uid, fase: 'agendado', clienteTelefono: '8095550100' });
    expect((await accesoOrdenTecnico(db, uid, uid)).telefono).toBe('18095550100');
    await ref.update({ tecnicoId: 'otro' }); await expect(accesoOrdenTecnico(db, uid, uid)).rejects.toThrow();
    await ref.update({ tecnicoId: uid }); await db.doc(`usuarios/${uid}`).update({ activo: false }); await expect(accesoOrdenTecnico(db, uid, uid)).rejects.toThrow();
  });
  it.each(['administrador', 'coordinadora', 'secretaria', 'operaria', 'tecnico'])('registra y retira avisos de %s sin conceder GPS a oficina', async rol => {
    await tecnico(`avisos-${rol}`); m.rol = rol;
    const respuesta = await llamar({ accion: 'dispositivo', token: `${id}-token-ficticio-${rol}`, plataforma: 'android' });
    expect(respuesta.status).toBe(200);
    const dispositivo = db.doc(`dispositivos_moviles/${respuesta.result.dispositivoId}`); refs.push(dispositivo);
    expect((await dispositivo.get()).data()?.uid).toBe(m.uid);
    if (rol !== 'tecnico') expect((await llamar({ accion: 'iniciar' })).status).toBe(403);
    expect((await llamar({ accion: 'desregistrar', dispositivoId: dispositivo.id })).status).toBe(200);
    expect((await dispositivo.get()).exists).toBe(false);
  });
  it('no permite borrar el dispositivo de otra persona ni registrar ayudantes', async () => {
    const uid = await tecnico('device-owner');
    const r = await llamar({ accion: 'dispositivo', token: `${id}-token-propietario`, plataforma: 'ios' });
    const dispositivo = db.doc(`dispositivos_moviles/${r.result.dispositivoId}`); refs.push(dispositivo);
    m.uid = `${id}-otro`; await llamar({ accion: 'desregistrar', dispositivoId: dispositivo.id });
    expect((await dispositivo.get()).data()?.uid).toBe(uid);
    m.rol = 'ayudante'; expect((await llamar({ accion: 'dispositivo', token: `${id}-token-ayudante`, plataforma: 'android' })).status).toBe(403);
  });
  it('el envío del técnico exige permiso explícito y respeta la revocación personalizada', async () => {
    const uid = await tecnico('contacto'); const orden = db.doc(`ordenes_servicio/${uid}`); refs.push(orden);
    await orden.set({ tecnicoId: uid, fase: 'agendado', clienteTelefono: '8095550100' });
    await expect(accesoOrdenTecnico(db, uid, uid, '18095550100', true)).rejects.toThrow('permiso');
    await db.doc(`usuarios/${uid}`).update({ permisos: { puedeContactarCliente: true } });
    await expect(accesoOrdenTecnico(db, uid, uid, '18095550100', true)).resolves.toBeDefined();
    await db.doc(`usuarios/${uid}`).update({ permisosPersonalizados: true, permisosSistema: { tecnicoPuedeContactarCliente: false } });
    await expect(accesoOrdenTecnico(db, uid, uid, '18095550100', true)).rejects.toThrow('permiso');
  });

});
