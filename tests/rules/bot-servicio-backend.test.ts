import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
const acceso = vi.hoisted(() => ({ db: null as unknown, rol: 'administrador' }));
vi.mock('../../api/_lib/accesoEquipo.js', () => ({ accesoEquipo: async () => ({ db: acceso.db, uid: 'qa-admin', rol: acceso.rol }), ErrorAcceso: class extends Error { constructor(public status: number, mensaje: string) { super(mensaje); } } }));
import handler from '../../api/whatsapp/bot-config';
import { CONFIG_BOT_INICIAL } from '../../api/_lib/politicaBotServicio';
import { reservarPresupuestoBot, conciliarPresupuestoBot } from '../../api/_lib/presupuestoBotServicio';
import { encolarTrabajoBot, reclamarTrabajoBot, finalizarTrabajoBot, pausarPorHumanoBot } from '../../api/_lib/trabajosBotServicio';
import { asignarEquipoSimulado } from '../../api/_lib/equiposAtencion';
let app: App, db: Firestore;
const ahora = Date.parse('2026-09-28T20:00:00-04:00');
const tarifa = { modelo: 'modelo-qa', version: 'qa1', entradaMicroUsdPorMillon: 1_000_000, salidaMicroUsdPorMillon: 1_000_000, maxTokensEntrada: 50, maxTokensSalida: 50 };
const config = { ...CONFIG_BOT_INICIAL, tarifa };
beforeAll(() => { if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Solo emulador'); app = initializeApp({ projectId: 'demo-bot-servicio' }, 'bot-servicio'); db = getFirestore(app); acceso.db = db; });
afterAll(async () => { await db.terminate(); await deleteApp(app); });
beforeEach(async () => {
  acceso.rol = 'administrador';
  for (const c of await db.listCollections()) await db.recursiveDelete(c);
  await db.doc('bot_servicio_config/sistema').set(config);
});
const entrada = (id: string, clienteId = 'cliente') => ({ id, clienteId, modelo: tarifa.modelo, tarifaVersion: tarifa.version });
async function llamada(body: unknown, method = 'POST') {
  let status = 200, payload: any;
  const res = { setHeader() {}, status(n: number) { status = n; return res; }, json(v: unknown) { payload = v; return res; } };
  await handler({ method, body, headers: {} } as any, res as any); return { status, payload };
}
it('reserva concurrente global, sin duplicar y sin superar límite', async () => {
  await db.doc('bot_servicio_config/sistema').update({ limiteDiaMicroUsd: 100, limiteMesMicroUsd: 100 });
  const resultados = await Promise.allSettled([reservarPresupuestoBot(db, entrada('a', '1'), ahora), reservarPresupuestoBot(db, entrada('b', '2'), ahora)]);
  expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((await db.doc('bot_servicio_sim_presupuesto/dia_2026-09-28').get()).data()?.comprometido).toBe(100);
  expect((await db.collection('bot_servicio_sim_alertas').get()).size).toBe(2);
  const ganadora = resultados[0].status === 'fulfilled' ? entrada('a', '1') : entrada('b', '2');
  expect((await reservarPresupuestoBot(db, ganadora, ahora)).repetida).toBe(true);
  await expect(reservarPresupuestoBot(db, { ...ganadora, clienteId: 'otra' }, ahora)).rejects.toThrow('reutilizado');
});
it('15 reservas por cliente en ventana móvil y no por día calendario', async () => {
  for (let i = 0; i < 15; i++) await reservarPresupuestoBot(db, entrada(String(i)), ahora);
  await expect(reservarPresupuestoBot(db, entrada('16'), ahora + 3600000)).rejects.toThrow('Cupo');
  await expect(reservarPresupuestoBot(db, entrada('16'), ahora + 86400000)).resolves.toBeDefined();
});
it('ambigua conserva presupuesto; conciliación confirma coste una vez y libera fallo sin gasto', async () => {
  const r = await reservarPresupuestoBot(db, entrada('a'), ahora);
  await conciliarPresupuestoBot(db, r.id, { estado: 'ambigua', costeMicroUsd: 0 }, ahora);
  expect((await db.doc('bot_servicio_sim_presupuesto/dia_2026-09-28').get()).data()?.comprometido).toBe(100);
  await conciliarPresupuestoBot(db, r.id, { estado: 'confirmada', costeMicroUsd: 35 }, ahora);
  await conciliarPresupuestoBot(db, r.id, { estado: 'confirmada', costeMicroUsd: 35 }, ahora);
  expect((await db.doc('bot_servicio_sim_presupuesto/dia_2026-09-28').get()).data()?.comprometido).toBe(35);
  await expect(conciliarPresupuestoBot(db, r.id, { estado: 'liberada', costeMicroUsd: 0 })).rejects.toThrow();
  const otra = await reservarPresupuestoBot(db, entrada('b'), ahora);
  await conciliarPresupuestoBot(db, otra.id, { estado: 'liberada', costeMicroUsd: 0 }, ahora);
  expect((await db.doc('bot_servicio_sim_presupuesto/dia_2026-09-28').get()).data()?.comprometido).toBe(35);
});
it('sin tarifa o con versión equivocada no reserva', async () => {
  await expect(reservarPresupuestoBot(db, { ...entrada('x'), tarifaVersion: 'otra' }, ahora)).rejects.toThrow();
  await db.doc('bot_servicio_config/sistema').update({ tarifa: null });
  await expect(reservarPresupuestoBot(db, entrada('x'), ahora)).rejects.toThrow();
  expect((await db.collection('bot_servicio_sim_reservas').get()).empty).toBe(true);
});
it('trabajos duplicados, lease vencida y pausa humana invalidan al ejecutor anterior', async () => {
  const mensaje = { phoneNumberId: '123', wamid: 'wamid.1', clienteId: 'cliente' };
  const id = await encolarTrabajoBot(db, mensaje, ahora);
  expect(await encolarTrabajoBot(db, mensaje, ahora)).toBe(id);
  const token = await reclamarTrabajoBot(db, id, 'a', ahora, 1000);
  expect(token).not.toBeNull(); expect(await reclamarTrabajoBot(db, id, 'b', ahora, 1000)).toBeNull();
  const segundo = await reclamarTrabajoBot(db, id, 'b', ahora + 1001, 1000);
  await expect(finalizarTrabajoBot(db, token!, 'completado', ahora + 1002)).rejects.toThrow();
  await pausarPorHumanoBot(db, 'cliente', 'qa-admin', ahora + 1003);
  await expect(finalizarTrabajoBot(db, segundo!, 'completado', ahora + 1004)).rejects.toThrow();
  expect(await reclamarTrabajoBot(db, id, 'c', ahora + 3000)).toBeNull();
});
it('ambiguo nunca se reclama automáticamente de nuevo', async () => {
  const id = await encolarTrabajoBot(db, { phoneNumberId: '123', wamid: 'w', clienteId: 'c' }, ahora);
  const token = await reclamarTrabajoBot(db, id, 'a', ahora);
  await finalizarTrabajoBot(db, token!, 'ambiguo', ahora + 1);
  expect(await reclamarTrabajoBot(db, id, 'b', ahora + 100000)).toBeNull();
});
it('config solo admin, desactivada y cambios de límite auditados e idempotentes', async () => {
  acceso.rol = 'coordinadora'; expect((await llamada({}, 'GET')).status).toBe(403); acceso.rol = 'administrador';
  const body = { accion: 'guardar', requestId: 'peticion-prueba-123', motivo: 'Simulación QA', config: { ...config, permitirHorarioLaboral: true } };
  expect((await llamada({ ...body, config: { ...body.config, habilitado: true } })).status).toBe(400);
  expect((await llamada(body)).status).toBe(200); expect((await llamada(body)).status).toBe(200);
  expect((await db.collection('auditoria_admin').get()).size).toBe(1);
  expect((await llamada({ ...body, requestId: 'peticion-prueba-456' })).status).toBe(409);
});
it('reparte por carga, serializa nuevos y conserva el equipo existente', async () => {
  const equipos = [{ id: 'a', operariaUid: 'op-a', secretariaUid: 'sec-a' }, { id: 'b', operariaUid: 'op-b', secretariaUid: 'sec-b' }];
  await db.doc('bot_servicio_config/sistema').update({ equipos });
  for (const e of equipos) { await db.doc(`usuarios/${e.operariaUid}`).set({ rol: 'operaria', activo: true }); await db.doc(`usuarios/${e.secretariaUid}`).set({ rol: 'secretaria', activo: true }); }
  await db.doc('crm_clientes/existente').set({ equipoId: 'a' });
  await db.doc('ordenes_servicio/orden').set({ equipoId: 'a', fase: 'pendiente' });
  expect(await asignarEquipoSimulado(db, 'existente')).toEqual({ equipoId: 'a', conservado: true });
  expect((await asignarEquipoSimulado(db, 'nuevo')).equipoId).toBe('b');
  const resultados = await Promise.all([asignarEquipoSimulado(db, 'dos'), asignarEquipoSimulado(db, 'tres')]);
  expect(new Set(resultados.map(r => r.equipoId)).size).toBe(2);
  expect((await db.collection('bot_servicio_sim_asignaciones').get()).size).toBe(3);
});
it('serializa mensajes distintos del mismo cliente y completar es idempotente', async () => {
  const primero = await encolarTrabajoBot(db, { phoneNumberId: '123', wamid: '1', clienteId: 'c' }, ahora);
  const segundo = await encolarTrabajoBot(db, { phoneNumberId: '123', wamid: '2', clienteId: 'c' }, ahora);
  const token = await reclamarTrabajoBot(db, primero, 'a', ahora);
  expect(await reclamarTrabajoBot(db, segundo, 'b', ahora)).toBeNull();
  await finalizarTrabajoBot(db, token!, 'completado', ahora + 1);
  await finalizarTrabajoBot(db, token!, 'completado', ahora + 2);
  expect(await reclamarTrabajoBot(db, segundo, 'b', ahora + 3)).not.toBeNull();
});
it('mantiene el límite mensual al cambiar de día y concilia en el período original', async () => {
  await db.doc('bot_servicio_config/sistema').update({ limiteDiaMicroUsd: 100, limiteMesMicroUsd: 100 });
  const r = await reservarPresupuestoBot(db, entrada('dia1'), ahora);
  await expect(reservarPresupuestoBot(db, entrada('dia2'), ahora + 86400000)).rejects.toThrow('Presupuesto');
  await conciliarPresupuestoBot(db, r.id, { estado: 'liberada', costeMicroUsd: 0 }, ahora + 86400000);
  await expect(reservarPresupuestoBot(db, entrada('dia2'), ahora + 86400000)).resolves.toBeDefined();
  expect((await db.doc('bot_servicio_sim_presupuesto/dia_2026-09-28').get()).data()?.comprometido).toBe(0);
});
it('rechaza miembros de rol equivocado sin guardar configuración ni auditoría', async () => {
  await db.doc('usuarios/op').set({ rol: 'tecnico', activo: true });
  await db.doc('usuarios/sec').set({ rol: 'secretaria', activo: true });
  const body = { accion: 'guardar', requestId: 'peticion-equipo-123', motivo: 'Configurar QA', config: { ...config, equipos: [{ id: 'a', operariaUid: 'op', secretariaUid: 'sec' }] } };
  expect((await llamada(body)).status).toBe(400);
  expect((await db.doc('bot_servicio_config/sistema').get()).data()?.version).toBe(0);
  expect((await db.collection('auditoria_admin').get()).empty).toBe(true);
});
it('preserva cartera por responsable y deduplica pendiente por cliente vinculado', async () => {
  const equipos = [{ id: 'a', operariaUid: 'op-a', secretariaUid: 'sec-a' }, { id: 'b', operariaUid: 'op-b', secretariaUid: 'sec-b' }];
  await db.doc('bot_servicio_config/sistema').update({ equipos });
  for (const e of equipos) { await db.doc(`usuarios/${e.operariaUid}`).set({ rol: 'operaria' }); await db.doc(`usuarios/${e.secretariaUid}`).set({ rol: 'secretaria' }); }
  await db.doc('crm_clientes/c1').set({ responsableId: 'op-a' });
  expect((await asignarEquipoSimulado(db, 'c1')).equipoId).toBe('a');
  await db.doc('bot_servicio_sim_asignaciones/qa').set({ clienteId: 'c1', equipoId: 'a', pendiente: true });
  await db.doc('whatsapp_conversaciones/8291234567').set({ clienteId: 'c1' });
  await db.doc('crm_atencion/8291234567').set({ responsableId: 'sec-a', pendiente: true });
  await db.doc('ordenes_servicio/o-b').set({ equipoId: 'b', fase: 'pendiente' });
  // Una persona pendiente + una orden del otro equipo = empate. Si duplicase c1, elegiría b.
  expect((await asignarEquipoSimulado(db, 'nuevo')).equipoId).toBe('a');
  await db.doc('crm_atencion/sin-vinculo').set({ responsableId: 'sec-a', pendiente: true });
  await expect(asignarEquipoSimulado(db, 'otro')).rejects.toThrow('sin cliente vinculado');
});
it('ampliación vence al cambiar día RD y queda auditada una sola vez', async () => {
  const reloj = vi.spyOn(Date, 'now').mockReturnValue(ahora);
  try {
    const body = { accion: 'ampliar', periodo: 'dia', periodoEsperado: '2026-09-28', limiteAnterior: 5_000_000, limiteMicroUsd: 6_000_000, motivo: 'Ensayo diario', requestId: 'ampliacion-diaria-qa' };
    expect((await llamada(body)).status).toBe(200); expect((await llamada(body)).status).toBe(200);
    expect((await db.collection('auditoria_admin').get()).size).toBe(1);
    expect((await llamada({}, 'GET')).payload.presupuesto.dia.limite).toBe(6_000_000);
    reloj.mockReturnValue(ahora + 86400000);
    expect((await llamada({}, 'GET')).payload.presupuesto.dia.limite).toBe(5_000_000);
    expect((await llamada(body)).status).toBe(409);
    expect((await db.doc('bot_servicio_config/sistema').get()).data()?.limiteDiaMicroUsd).toBe(5_000_000);
  } finally { reloj.mockRestore(); }
});
it('HTTP local real acepta cuerpo string/objeto y rechaza otro rol', async () => {
  const { createServer } = await import('node:http');
  const server = createServer(async (req, res) => {
    const partes: Buffer[] = []; for await (const parte of req) partes.push(Buffer.from(parte));
    const texto = Buffer.concat(partes).toString('utf8');
    const body = req.headers['x-harness-body'] === 'objeto' ? JSON.parse(texto) : texto;
    const response = { setHeader: (k: string, v: string) => res.setHeader(k, v), status(n: number) { res.statusCode = n; return response; }, json(v: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(v)); } };
    await handler({ method: req.method, body, headers: req.headers } as any, response as any);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Puerto local no disponible');
    const url = `http://127.0.0.1:${address.port}`;
    const guardar = { accion: 'guardar', config, motivo: 'HTTP local', requestId: 'http-prueba-guardar' };
    expect((await fetch(url, { method: 'POST', body: JSON.stringify(guardar) })).status).toBe(200);
    const simular = { accion: 'simular', datos: {}, pideHumano: true, baja: false, ventanaAbierta: true };
    const respuesta = await fetch(url, { method: 'POST', headers: { 'x-harness-body': 'objeto' }, body: JSON.stringify(simular) });
    expect(respuesta.status).toBe(200); expect((await respuesta.json()).resultado.motivo).toBe('humano');
    acceso.rol = 'secretaria'; expect((await fetch(url)).status).toBe(403);
  } finally { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
});
it('límite mensual permanente es explícito y sobrevive al mes siguiente; diario permanente se rechaza', async () => {
  const reloj = vi.spyOn(Date, 'now').mockReturnValue(ahora);
  try {
    const body = { accion: 'ampliar', periodo: 'mes', alcance: 'permanente', periodoEsperado: '2026-09', limiteAnterior: 50_000_000, limiteMicroUsd: 60_000_000, motivo: 'Tope mensual QA', requestId: 'ampliacion-mensual-qa' };
    expect((await llamada(body)).status).toBe(200);
    reloj.mockReturnValue(Date.parse('2026-10-01T08:00:00-04:00'));
    expect((await llamada({}, 'GET')).payload.presupuesto.mes.limite).toBe(60_000_000);
    expect((await llamada({ ...body, periodo: 'dia' })).status).toBe(400);
  } finally { reloj.mockRestore(); }
});
it('prepara runtime real desactivado desde catálogo vigente sin copiar tarifa del navegador', async () => {
  const equipos = [{ id: 'a', operariaUid: 'op-a', secretariaUid: 'sec-a' }, { id: 'b', operariaUid: 'op-b', secretariaUid: 'sec-b' }];
  for (const e of equipos) { await db.doc(`usuarios/${e.operariaUid}`).set({ rol: 'operaria' }); await db.doc(`usuarios/${e.secretariaUid}`).set({ rol: 'secretaria' }); }
  const body = { accion: 'preparar', habilitado: false, version: 0, equipos, permitirHorarioLaboral: true, motivo: 'Preparación QA', requestId: 'runtime-preparar-qa', tarifaVersion: 'tarifa-browser-falsa' };
  expect((await llamada(body)).status).toBe(400);
  await db.doc('config/whatsapp_numeros').set({ numeros: [{ numeroReal: '+1 849-564-6767', phoneNumberId: '987654' }] });
  expect((await llamada({ ...body, habilitado: true })).status).toBe(400);
  expect((await llamada(body)).status).toBe(200);
  const runtime = (await db.doc('bot_servicio_runtime/sistema').get()).data();
  expect(runtime?.habilitado).toBe(false); expect(runtime?.phoneNumberId).toBe('987654'); expect(runtime?.tarifaVersion).not.toBe('tarifa-browser-falsa');
  expect(runtime?.permitirHorarioLaboral).toBe(true);
  expect((await db.collection('bot_servicio_real_trabajos').get()).empty).toBe(true);
});
it('ampliar real usa las mismas colecciones que reserva real y no afecta ensayo', async () => {
  const reloj = vi.spyOn(Date, 'now').mockReturnValue(ahora);
  try {
    const body = { accion: 'ampliar', destino: 'produccion', periodo: 'dia', periodoEsperado: '2026-09-28', limiteAnterior: 5_000_000, limiteMicroUsd: 8_000_000, motivo: 'Margen preparado', requestId: 'runtime-limite-diario' };
    expect((await llamada(body)).status).toBe(200);
    const data = (await llamada({}, 'GET')).payload;
    expect(data.presupuestoReal.dia.limite).toBe(8_000_000); expect(data.presupuesto.dia.limite).toBe(5_000_000);
    expect(data.runtime.habilitado).toBe(false);
  } finally { reloj.mockRestore(); }
});
it('activación explícita valida equipos y presupuesto; flags externos siguen bloqueados', async () => {
  vi.stubEnv('BOT_SERVICIO_ENABLED', 'false'); vi.stubEnv('ALLOW_EXTERNAL_SENDS', 'false');
  try {
    const { CONFIG_RUNTIME_INICIAL } = await import('../../api/_lib/botServicioRuntime');
    const equipos = [{ id: 'a', operariaUid: 'op-a', secretariaUid: 'sec-a' }, { id: 'b', operariaUid: 'op-b', secretariaUid: 'sec-b' }];
    for (const e of equipos) { await db.doc(`usuarios/${e.operariaUid}`).set({ rol: 'operaria' }); await db.doc(`usuarios/${e.secretariaUid}`).set({ rol: 'secretaria' }); }
    await db.doc('config/whatsapp_numeros').set({ numeros: [{ numeroReal: '18495646767', phoneNumberId: '987654' }] });
    await db.doc('bot_servicio_runtime/sistema').set({ ...CONFIG_RUNTIME_INICIAL, phoneNumberId: '987654', equipos });
    const body = { accion: 'estado', habilitado: true, version: 0, permitirHorarioLaboral: true, motivo: 'QA sin envíos', requestId: 'estado-runtime-prueba' };
    expect((await llamada(body)).status).toBe(400);
    expect((await llamada({ ...body, confirmacion: 'ACTIVAR' })).status).toBe(200);
    const data = (await llamada({}, 'GET')).payload;
    expect(data.runtime.habilitado).toBe(true); expect(data.servidorPreparado).toBe(false); expect(data.envioDisponible).toBe(false);
    expect((await llamada({ ...body, habilitado: false, version: 1, requestId: 'estado-runtime-apagar' })).status).toBe(200);
    expect((await db.doc('bot_servicio_runtime/sistema').get()).data()?.habilitado).toBe(false);
  } finally { vi.unstubAllEnvs(); }
});
it('reparto real aplica junto al handoff y retorna null sin inventar miembros', async () => {
  const { prepararAsignacionEquipoReal } = await import('../../api/_lib/equiposAtencion');
  expect(await db.runTransaction(tx => prepararAsignacionEquipoReal(db, tx, 'nuevo'))).toBeNull();
  const equipos = [{ id: 'a', operariaUid: 'op-a', secretariaUid: 'sec-a' }, { id: 'b', operariaUid: 'op-b', secretariaUid: 'sec-b' }];
  for (const e of equipos) { await db.doc(`usuarios/${e.operariaUid}`).set({ rol: 'operaria' }); await db.doc(`usuarios/${e.secretariaUid}`).set({ rol: 'secretaria' }); }
  await db.doc('bot_servicio_runtime/sistema').set({ equipos });
  await db.doc('crm_clientes/nuevo').set({nombre:'Cliente QA'});
  await db.runTransaction(async tx => { const resultado = await prepararAsignacionEquipoReal(db, tx, 'nuevo'); expect(resultado?.secretariaUid).toBe('sec-a'); resultado!.aplicar(); });
  expect((await db.doc('crm_clientes/nuevo').get()).data()?.equipoId).toBe('a');
});
it('GET de atención expone resumen seguro solo oficina y resolver lo retira', async () => {
  const { default: atencion } = await import('../../api/crm/atencion');
  const waId = '8291234567';
  await db.doc(`whatsapp_conversaciones/${waId}`).set({ clienteId: 'cliente', asignadaA: null });
  await db.doc('usuarios/qa-admin').set({ rol: 'administrador', nombre: 'QA' });
  await db.doc(`bot_servicio_real_handoffs/${waId}`).set({ estado: 'pendiente', motivo: 'humano', equipoId: null, datos: { equipo: 'lavadora', servicio: 'mantenimiento', tieneFoto: true, tieneUbicacion: false, urlPrivada: 'no-exponer' }, pendientes: ['tieneUbicacion'], secreto: 'no-exponer' });
  async function ejecutar(method: string, body?: unknown) {
    let status = 200, payload: any;
    const res = { setHeader() {}, status(n: number) { status = n; return res; }, json(v: unknown) { payload = v; return res; } };
    await atencion({ method, query: { waId }, body, headers: {} } as any, res as any); return { status, payload };
  }
  const respuesta = await ejecutar('GET');
  expect(respuesta.status).toBe(200); expect(respuesta.payload.resumenBot.pendientes).toEqual(['ubicacion']);
  expect(JSON.stringify(respuesta.payload)).not.toContain('no-exponer');
  acceso.rol = 'tecnico'; expect((await ejecutar('GET')).status).toBe(403); acceso.rol = 'administrador';
  expect((await ejecutar('POST', { waId, accion: 'resolver', version: 0, requestId: 'resolver-handoff-qa' })).status).toBe(200);
  expect((await ejecutar('GET')).payload.resumenBot).toBeNull();
});
it('vincular wa a cliente conserva cupo15 y liberar reserva antigua sigue alias', async () => {
  const alias = 'wa:8291234567';
  const antiguas = [];
  for (let i = 0; i < 14; i++) antiguas.push(await reservarPresupuestoBot(db, entrada(`previa-${i}`, alias), ahora));
  await reservarPresupuestoBot(db, { ...entrada('nueva', 'cliente-vinculado'), identidadesPrevias: [alias] }, ahora);
  await expect(reservarPresupuestoBot(db, { ...entrada('extra', 'cliente-vinculado'), identidadesPrevias: [alias] }, ahora)).rejects.toThrow('Cupo');
  await conciliarPresupuestoBot(db, antiguas[0].id, { estado: 'liberada', costeMicroUsd: 0 }, ahora);
  await expect(reservarPresupuestoBot(db, { ...entrada('extra', 'cliente-vinculado'), identidadesPrevias: [alias] }, ahora)).resolves.toBeDefined();
  await expect(reservarPresupuestoBot(db, { ...entrada('intruso', 'otro-cliente'), identidadesPrevias: [alias] }, ahora)).rejects.toThrow('otro cliente');
  await expect(reservarPresupuestoBot(db, entrada('retroceder', alias), ahora)).rejects.toThrow('canónico');
});
it('migrar alias ya lleno15 persiste aunque rechace reserva y bloquea otro teléfono del cliente', async () => {
  const alias = 'wa:8290000000';
  for (let i = 0; i < 15; i++) await reservarPresupuestoBot(db, entrada(`lleno-${i}`, alias), ahora);
  await expect(reservarPresupuestoBot(db, { ...entrada('vincular', 'cliente-canonico'), identidadesPrevias: [alias] }, ahora)).rejects.toThrow('Cupo');
  await expect(reservarPresupuestoBot(db, entrada('desde-otro-telefono', 'cliente-canonico'), ahora)).rejects.toThrow('Cupo');
});
it('prospectos se reparten sin inventar ficha y conservan equipo al vincularse', async () => {
 const {prepararAsignacionEquipoReal} = await import('../../api/_lib/equiposAtencion');
 const equipos = [{id:'a',operariaUid:'op-a',secretariaUid:'sec-a'},{id:'b',operariaUid:'op-b',secretariaUid:'sec-b'}];
 for(const e of equipos){await db.doc(`usuarios/${e.operariaUid}`).set({rol:'operaria'});await db.doc(`usuarios/${e.secretariaUid}`).set({rol:'secretaria'});}
 await db.doc('bot_servicio_runtime/sistema').set({equipos});
 const asignar = (waId: string, clienteId: string|null = null) => db.runTransaction(async tx => {const r=await prepararAsignacionEquipoReal(db,tx,clienteId,waId);if(!r)throw new Error('Sin equipo');r.aplicar();tx.set(db.doc(`crm_atencion/${waId}`),{pendiente:true,responsableId:r.secretariaUid},{merge:true});return r.equipoId;});
 expect(await asignar('18090000001')).toBe('a'); expect(await asignar('18090000002')).toBe('b');
 expect((await db.collection('crm_clientes').get()).size).toBe(0);
 await db.doc('crm_clientes/nuevo').set({nombre:'QA'});await db.doc('whatsapp_conversaciones/18090000001').set({clienteId:'nuevo'},{merge:true});
 expect(await asignar('18090000001','nuevo')).toBe('a');
 expect((await db.collection('bot_servicio_real_asignaciones').get()).size).toBe(2);
 expect((await db.doc('crm_clientes/nuevo').get()).data()).toMatchObject({responsableId:'op-a',equipoId:'a'});
 expect(await asignar('18090000003')).toBe('b'); // empate tras migración, no doble conteo de A.
});
it('administración habilita reparto independiente sin activar IA ni requerir línea central', async () => {
  const equipos = [{ id: 'equipo-a', operariaUid: 'op-a', secretariaUid: 'sec-a' }, { id: 'equipo-b', operariaUid: 'op-b', secretariaUid: 'sec-b' }];
  for (const [uid, rol] of [['op-a', 'operaria'], ['op-b', 'operaria'], ['sec-a', 'secretaria'], ['sec-b', 'secretaria']]) await db.doc(`usuarios/${uid}`).set({ rol, activo: true });
  const body = { accion: 'reparto', habilitado: true, version: 0, equipos, motivo: 'Activación de ensayo', requestId: 'reparto-qa-123456789' };
  expect((await llamada(body)).status).toBe(200);
  expect((await db.doc('bot_servicio_runtime/sistema').get()).data()).toMatchObject({ repartoHabilitado: true, habilitado: false, phoneNumberId: '', version: 1 });
  expect((await llamada(body)).status).toBe(200);
  expect((await db.collection('auditoria_admin').get()).size).toBe(1);
  acceso.rol = 'operaria';
  expect((await llamada({ ...body, habilitado: false, version: 1, requestId: 'reparto-qa-987654321' })).status).toBe(403);
});
