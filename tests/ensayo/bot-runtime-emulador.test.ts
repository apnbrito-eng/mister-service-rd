import { beforeEach, afterAll, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { crearAlmacenServicio, crearPresupuestoReal, prepararEntradaBot, prepararPausaBot, recuperarEfectosVencidos, recuperarTrabajosDesautorizados, RUNTIME_BOT } from '../../api/_lib/botServicioStore';
import { registrarCitaPublica } from '../../api/_lib/citaPublica';
import { persistirMensajeEntrante } from '../../api/whatsapp/webhook';
import { CONFIG_RUNTIME_INICIAL } from '../../api/_lib/botServicioRuntime';
import { ejecutarTrabajoServicio, type DependenciasServicio } from '../../api/_lib/botServicioPipeline';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8299') throw new Error('Requiere emulador aislado8299');
const app = initializeApp({ projectId: 'demo-bot-runtime' }, 'bot-runtime'), db = getFirestore(app);
const ahora = Date.UTC(2026, 8, 29, 2);
const config = { ...CONFIG_RUNTIME_INICIAL, habilitado: true, version: 1, phoneNumberId: '123' };
const wa = '18095550001';
let d: DependenciasServicio;
const colecciones = ['bot_servicio_runtime', 'bot_servicio_sesiones', 'bot_servicio_trabajos', 'whatsapp_conversaciones', 'whatsapp_mensajes_inbox', 'whatsapp_mensajes_outbox', 'whatsapp_opt_outs', 'bot_servicio_real_reservas', 'bot_servicio_real_presupuesto', 'bot_servicio_real_clientes', 'bot_servicio_real_limites', 'bot_servicio_real_alertas', 'bot_servicio_real_handoffs', 'crm_atencion', 'crm_clientes', 'usuarios', 'ponches', 'config', 'ordenes_servicio', 'bot_servicio_real_asignaciones', 'bot_servicio_real_reparto', 'bot_servicio_real_reparto_eventos', 'notificaciones', 'auditoria_admin', 'citas_por_confirmar', 'citas_publicas_control', 'citas_publicas_cuotas', 'citas_publicas_config'];
async function limpiar() { for (const col of colecciones) { const docs = await db.collection(col).get(); const b = db.batch(); docs.docs.forEach(s => b.delete(s.ref)); await b.commit(); } }
beforeEach(async () => {
  vi.unstubAllEnvs();
  await limpiar(); await db.doc(RUNTIME_BOT).set(config);
  await db.doc(`whatsapp_conversaciones/${wa}`).set({ clienteId: 'qa-cliente', bot: { habilitado: true }, ventana24h: { cierraEn: Timestamp.fromMillis(ahora + 86400000) } });
  const almacen = crearAlmacenServicio(db, crearPresupuestoReal(db));
  d = { almacen, permitirExternos: true, reloj: () => ahora + 6000, proveedor: { contar: vi.fn(async () => 200), generar: vi.fn(async () => ({ entrada: 200, salida: 20, datos: { paso: 'servicio' as const, equipo: 'Lavadora' } })) }, transporte: { enviar: vi.fn(async () => ({ wamid: 'wamid.salida' })) } };
});
afterAll(async () => { await limpiar(); await db.terminate(); await deleteApp(app); });
async function entrada(id: string, tipo = 'text') {
  await db.runTransaction(async tx => {
    const aplicar = await prepararEntradaBot(db, tx, { waId: wa, phoneNumberId: '123', wamid: id, botHabilitado: true }, ahora);
    aplicar(); tx.set(db.doc(`whatsapp_mensajes_inbox/${id}`), { wa_id: wa, tipo, contenido: { texto: 'Necesito ayuda con mi lavadora' } });
  });
  return (await db.collection('bot_servicio_trabajos').get()).docs.find(s => s.data().mensajeIds.includes(id))!.id;
}
it('recorrido real de colecciones deduplica, reserva, guarda extracción y libera sesión', async () => {
  const id = await entrada('wamid.uno'); await entrada('wamid.uno');
  expect((await db.collection('bot_servicio_trabajos').get()).size).toBe(1);
  expect(await ejecutarTrabajoServicio(id, config, d)).toBe('completado');
  const sesion = (await db.collection('bot_servicio_sesiones').get()).docs[0].data();
  expect(sesion.datos.equipo).toBe('Lavadora'); expect(sesion.saludoEnviado).toBe(true); expect(sesion.trabajoActivo).toBeNull();
  expect((await db.collection('bot_servicio_real_reservas').get()).docs[0].data()).toMatchObject({ estado: 'confirmada', costeMicroUsd: 900 });
  expect(await ejecutarTrabajoServicio(id, config, d)).toBe('ocupado');
  expect(d.proveedor.generar).toHaveBeenCalledTimes(1);
});
it('agrupa ráfaga y dos workers solo generan una respuesta', async () => {
  const id = await entrada('wamid.uno'); await entrada('wamid.dos');
  await Promise.all([ejecutarTrabajoServicio(id, config, d), ejecutarTrabajoServicio(id, config, d)]);
  expect(d.proveedor.generar).toHaveBeenCalledTimes(1);
  expect((await db.collection('bot_servicio_trabajos').get()).docs.map(s => s.data().estado).sort()).toEqual(['agrupado', 'completado']);
});
it('toma humana mientras genera cobra uso y nunca envía', async () => {
  const id = await entrada('wamid.uno');
  vi.mocked(d.proveedor.generar).mockImplementation(async () => {
    await db.runTransaction(async tx => { const aplicar = await prepararPausaBot(db, tx, wa, 'qa-admin', ahora + 6000); aplicar(); });
    return { entrada: 200, salida: 20, datos: { paso: 'servicio' } };
  });
  expect(await ejecutarTrabajoServicio(id, config, d)).toBe('cancelado');
  expect(d.transporte.enviar).not.toHaveBeenCalled();
  expect((await db.collection('bot_servicio_real_reservas').get()).docs[0].data().estado).toBe('confirmada');
});
it('runtime desactivado no crea trabajo pero sí permite persistir inbox', async () => {
  await db.doc(RUNTIME_BOT).set({ ...config, habilitado: false });
  await db.runTransaction(async tx => { const aplicar = await prepararEntradaBot(db, tx, { waId: wa, phoneNumberId: '123', wamid: 'wamid.off' }); aplicar(); tx.set(db.doc('whatsapp_mensajes_inbox/wamid.off'), { tipo: 'text' }); });
  expect((await db.collection('bot_servicio_trabajos').get()).empty).toBe(true);
  expect((await db.doc('whatsapp_mensajes_inbox/wamid.off').get()).exists).toBe(true);
});
it('primera respuesta informa IA, las siguientes conservan preguntas breves', async () => {
  await ejecutarTrabajoServicio(await entrada('wamid.uno'), config, d);
  await ejecutarTrabajoServicio(await entrada('wamid.dos'), config, d);
  const llamadas = vi.mocked(d.transporte.enviar).mock.calls;
  expect(llamadas[0][1]).toContain('asistente de IA'); expect(llamadas[1][1]).not.toContain('asistente de IA');
});
it('foto y pin reales se conservan sin depender del modelo', async () => {
  const id = await entrada('wamid.foto', 'image');
  await db.doc('whatsapp_mensajes_inbox/wamid.foto').update({ contenido: { mediaId: 'media-qa' } });
  await entrada('wamid.pin', 'location');
  await db.doc('whatsapp_mensajes_inbox/wamid.pin').update({ contenido: { location: { lat: 18.5, lng: -69.9 } } });
  await ejecutarTrabajoServicio(id, config, d);
  expect((await db.collection('bot_servicio_sesiones').get()).docs[0].data().datos).toMatchObject({ tieneFoto: true, tieneUbicacion: true });
});
it('dirección escrita se conserva como ubicación sin exigir pin', async () => {
  vi.mocked(d.proveedor.generar).mockResolvedValue({ entrada: 200, salida: 20, datos: { paso: 'foto', direccion: 'Calle de prueba número 10' } });
  const id = await entrada('wamid.direccion');
  await db.doc('whatsapp_mensajes_inbox/wamid.direccion').update({ contenido: { texto: 'Mi dirección es Calle de prueba número 10' } });
  await ejecutarTrabajoServicio(id, config, d);
  expect((await db.collection('bot_servicio_sesiones').get()).docs[0].data().datos).toMatchObject({ direccion: 'Calle de prueba número 10', tieneUbicacion: true });
});
it('un fallo ambiguo pausa la sesión y conserva el máximo reservado', async () => {
  vi.mocked(d.proveedor.generar).mockRejectedValue(new Error('timeout'));
  await ejecutarTrabajoServicio(await entrada('wamid.timeout'), config, d);
  expect((await db.collection('bot_servicio_sesiones').get()).docs[0].data().pausado).toBe(true);
  expect((await db.doc(`crm_atencion/${wa}`).get()).data()?.pendiente).toBe(true);
  expect((await db.doc(`bot_servicio_real_handoffs/${wa}`).get()).data()?.estado).toBe('pendiente');
  expect((await db.collection('bot_servicio_real_reservas').get()).docs[0].data()).toMatchObject({ estado: 'ambigua', monto: 24000 });
});

it('lease vencido después del proveedor deriva a oficina sin volver a consumir ni enviar', async () => {
  const id = await entrada('wamid.caida');
  const lease = await d.almacen.reclamar(id, ahora + 6000);
  expect(lease).not.toBeNull();
  const reserva = await d.almacen.reservar(lease!, 24000, ahora + 6000);
  expect(reserva).not.toBeNull();
  await d.almacen.iniciarProveedor(lease!, reserva!, ahora + 6000);
  await recuperarEfectosVencidos(db, ahora + 200000);
  expect((await db.doc(`bot_servicio_trabajos/${id}`).get()).data()?.estado).toBe('ambiguo');
  expect((await db.doc(`crm_atencion/${wa}`).get()).data()?.pendiente).toBe(true);
  expect((await db.doc(`bot_servicio_real_handoffs/${wa}`).get()).data()?.estado).toBe('pendiente');
  expect(await ejecutarTrabajoServicio(id, config, d)).toBe('ocupado');
  expect(d.proveedor.generar).not.toHaveBeenCalled();
  expect(d.transporte.enviar).not.toHaveBeenCalled();
});
it('vincular un teléfono a cliente no reinicia el cupo de respuestas', async () => {
  await db.doc(RUNTIME_BOT).update({ limiteRespuestas24h: 1 });
  await db.doc(`whatsapp_conversaciones/${wa}`).update({ clienteId: null });
  expect(await ejecutarTrabajoServicio(await entrada('wamid.anonimo'), config, d)).toBe('completado');
  await db.doc(`whatsapp_conversaciones/${wa}`).update({ clienteId: 'qa-cliente' });
  expect(await ejecutarTrabajoServicio(await entrada('wamid.vinculado'), config, d)).toBe('limite');
  expect(d.proveedor.generar).toHaveBeenCalledTimes(1);
  expect((await db.collection('bot_servicio_real_reservas').get()).size).toBe(1);
});

async function prepararWebhookNuevo(texto = 'Necesito mantenimiento de lavadora') {
  vi.stubEnv('BOT_SERVICIO_ENABLED', 'true'); vi.stubEnv('ALLOW_EXTERNAL_SENDS', 'true'); vi.stubEnv('BOT_CENTRAL_PHONE_NUMBER_ID', '123');
  await db.doc(`whatsapp_conversaciones/${wa}`).delete();
  await db.doc(RUNTIME_BOT).update({ permitirHorarioLaboral: true, equipos: [
    { id: 'equipo-a', operariaUid: 'op-a', secretariaUid: 'sec-a' }, { id: 'equipo-b', operariaUid: 'op-b', secretariaUid: 'sec-b' },
  ] });
  for (const [uid, rol] of [['op-a', 'operaria'], ['op-b', 'operaria'], ['sec-a', 'secretaria'], ['sec-b', 'secretaria']]) await db.doc(`usuarios/${uid}`).set({ rol, activo: true, nombre: uid });
  await db.doc('crm_clientes/otro').set({ responsableId: 'op-a', equipoId: 'equipo-a' });
  await db.doc('ordenes_servicio/carga').set({ clienteId: 'otro', equipoId: 'equipo-a', estado: 'pendiente' });
  await persistirMensajeEntrante(db, { wa_id: wa, from: wa, wamid: 'wamid.webhook', phoneNumberId: '123', timestampMeta: new Date(ahora), tipo: 'text', contenido: { texto }, rawMessage: {} });
  return (await db.collection('bot_servicio_trabajos').get()).docs[0].id;
}
it('WhatsApp nuevo pasa por embudo y entrega prospecto al equipo de menor carga sin ficha inventada', async () => {
  const id = await prepararWebhookNuevo();
  expect((await db.doc(`crm_atencion/${wa}`).get()).data()?.responsableId).toBeNull();
  vi.mocked(d.proveedor.generar).mockResolvedValue({ entrada: 200, salida: 20, datos: { paso: 'humano', equipo: 'Lavadora', servicio: 'mantenimiento' } });
  d.reloj = () => Date.now() + 6000;
  const cfg = { ...config, permitirHorarioLaboral: true };
  expect(await ejecutarTrabajoServicio(id, cfg, d)).toBe('humano');
  expect((await db.doc(`crm_atencion/${wa}`).get()).data()).toMatchObject({ equipoId: 'equipo-b', responsableId: 'sec-b', pendiente: true });
  expect((await db.doc(`whatsapp_conversaciones/${wa}`).get()).data()?.asignadaA).toBe('sec-b');
  expect((await db.collection('crm_clientes').get()).size).toBe(1);
  vi.unstubAllEnvs();
});
it('primera petición de persona queda visible y deriva sin consultar proveedor', async () => {
  const id = await prepararWebhookNuevo('Quiero hablar con una persona');
  expect((await db.doc(`whatsapp_conversaciones/${wa}`).get()).data()?.requiereHumano).toBe(true);
  d.reloj = () => Date.now() + 6000;
  expect(await ejecutarTrabajoServicio(id, { ...config, permitirHorarioLaboral: true }, d)).toBe('humano');
  expect(d.proveedor.generar).not.toHaveBeenCalled();
  expect((await db.doc(`crm_atencion/${wa}`).get()).data()).toMatchObject({ equipoId: 'equipo-b', responsableId: 'sec-b', pendiente: true });
  vi.unstubAllEnvs();
});
it('con flags apagados conserva reparto legacy y no crea trabajos', async () => {
  await db.doc(`whatsapp_conversaciones/${wa}`).delete();
  await db.doc('usuarios/secretaria-legacy').set({ rol: 'secretaria', activo: true, nombre: 'Ensayo' });
  const fechaRD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  await db.doc('ponches/entrada').set({ personalUid: 'secretaria-legacy', tipo: 'entrada', fechaRD, timestamp: Timestamp.now() });
  await persistirMensajeEntrante(db, { wa_id: wa, from: wa, wamid: 'wamid.legacy', phoneNumberId: '123', timestampMeta: new Date(ahora), tipo: 'text', contenido: { texto: 'Hola' }, rawMessage: {} });
  expect((await db.doc(`crm_atencion/${wa}`).get()).data()).toMatchObject({ responsableId: 'secretaria-legacy', pendiente: true });
  expect((await db.doc(`whatsapp_conversaciones/${wa}`).get()).data()?.bot.habilitado).toBe(false);
  expect((await db.collection('bot_servicio_trabajos').get()).empty).toBe(true);
});

it.each(['apagado', 'version', 'flags'])('embudo pendiente queda visible al cambiar %s sin proveedor', async modo => {
  const id = await prepararWebhookNuevo();
  if (modo === 'apagado') await db.doc(RUNTIME_BOT).update({ habilitado: false });
  if (modo === 'version') await db.doc(RUNTIME_BOT).update({ version: 2 });
  await recuperarTrabajosDesautorizados(db, Date.now() + 6000, modo !== 'flags');
  expect((await db.doc(`bot_servicio_trabajos/${id}`).get()).data()?.estado).toBe('cancelado');
  expect((await db.doc(`crm_atencion/${wa}`).get()).data()?.pendiente).toBe(true);
  expect((await db.doc(`bot_servicio_real_handoffs/${wa}`).get()).data()?.estado).toBe('pendiente');
  expect(d.proveedor.generar).not.toHaveBeenCalled(); expect(d.transporte.enviar).not.toHaveBeenCalled();
});

it('reparto global funciona en WhatsApp con IA apagada', async () => {
  await prepararWebhookNuevo();
  await db.doc(RUNTIME_BOT).update({ habilitado: false, repartoHabilitado: true });
  vi.stubEnv('BOT_SERVICIO_ENABLED', 'false');
  const numero = '18095550002';
  await persistirMensajeEntrante(db, { wa_id: numero, from: numero, wamid: 'wamid.sinia', phoneNumberId: '123', timestampMeta: new Date(ahora), tipo: 'text', contenido: { texto: 'Hola' }, rawMessage: {} });
  expect((await db.doc(`crm_atencion/${numero}`).get()).data()).toMatchObject({ equipoId: 'equipo-b', responsableId: 'sec-b', pendiente: true });
  expect((await db.doc(`whatsapp_conversaciones/${numero}`).get()).data()?.bot.habilitado).toBe(false);
  expect(d.proveedor.generar).not.toHaveBeenCalled();
});
it('entrada web usa equipo interno sin IA ni modificar una ficha por teléfono declarado', async () => {
  await prepararWebhookNuevo();
  await db.doc(RUNTIME_BOT).update({ habilitado: false, repartoHabilitado: true });
  const numero = '8095550002';
  await db.doc(`whatsapp_conversaciones/${numero}`).set({ clienteId: 'otro', equipoId: 'equipo-a', asignadaA: 'sec-a' });
  const respuesta = await registrarCitaPublica(db, { clienteNombre: 'Solicitud de ensayo', telefono: numero, equipoTipo: 'Nevera', falla: 'No enfría correctamente' }, ahora);
  expect(respuesta.ok).toBe(true); expect(respuesta).not.toHaveProperty('equipoId');
  const cita = (await db.collection('citas_por_confirmar').get()).docs[0].data();
  expect(cita).toMatchObject({ equipoId: 'equipo-b', responsableAtencionId: 'sec-b' });
  expect((await db.doc(`whatsapp_conversaciones/${numero}`).get()).data()).toMatchObject({ clienteId: 'otro', asignadaA: 'sec-a', equipoId: 'equipo-a' });
  expect((await db.doc('crm_clientes/otro').get()).data()?.responsableId).toBe('op-a');
});
it('cambio de configuración entre recuperación y claim también deja atención visible', async () => {
  const id = await prepararWebhookNuevo();
  await recuperarTrabajosDesautorizados(db, Date.now() + 6000, true);
  await db.doc(RUNTIME_BOT).update({ version: 2 });
  expect(await d.almacen.reclamar(id, Date.now() + 6000)).toBeNull();
  expect((await db.doc(`crm_atencion/${wa}`).get()).data()?.pendiente).toBe(true);
  expect((await db.doc(`bot_servicio_real_handoffs/${wa}`).get()).data()?.estado).toBe('pendiente');
});
