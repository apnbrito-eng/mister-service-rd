import { prepararAsignacionEquipoReal } from './equiposAtencion.js';
import { createHash, randomUUID } from 'node:crypto';
import { FieldPath, type Firestore, type Transaction, type DocumentData } from 'firebase-admin/firestore';
import { configEjecucionValida, type AlmacenServicio, type ContextoServicio, type LeaseServicio } from './botServicioPipeline.js';
import { periodosBot } from './politicaBotServicio.js';
import { validarRuntimeSeguro, TARIFA_RUNTIME } from './botServicioRuntime.js';
import { reservarPresupuestoEnTransaccion, conciliarPresupuestoEnTransaccion } from './presupuestoBotServicio.js';

function ubicacionValida(d?: DocumentData) { const p = d?.contenido?.location; return d?.tipo === 'location' && typeof p?.lat === 'number' && typeof p?.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180; }
export const RUNTIME_BOT = 'bot_servicio_runtime/sistema';
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const waValido = (v: string) => /^\d{7,16}$/.test(v);
const sesionPath = (wa: string) => `bot_servicio_sesiones/${hash(wa)}`;
const trabajoPath = (id: string) => { if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Trabajo inválido'); return `bot_servicio_trabajos/${id}`; };
export interface PresupuestoStoreServicio {
  reservar(tx: Transaction, lease: LeaseServicio, waId: string, config: DocumentData, ahora: number, identidadesPrevias?: string[]): Promise<string | null>;
  liberar(reserva: string): Promise<void>;
  confirmar(reserva: string, coste: number): Promise<void>;
  ambiguo(reserva: string): Promise<void>;
}
export function crearPresupuestoReal(db: Firestore): PresupuestoStoreServicio {
  const conciliar = (id: string, estado: 'confirmada' | 'liberada' | 'ambigua', costeMicroUsd: number) => db.runTransaction(tx => conciliarPresupuestoEnTransaccion(db, tx, id, { estado, costeMicroUsd }, 'produccion'));
  return {
    async reservar(tx, l, waId, config, ahora, identidadesPrevias) {
      const c = validarRuntimeSeguro(config);
      const r = await reservarPresupuestoEnTransaccion(db, tx, { id: l.id, clienteId: waId, identidadesPrevias, modelo: TARIFA_RUNTIME.modelo, tarifaVersion: TARIFA_RUNTIME.version },
        { limiteDiaMicroUsd: c.limiteDiaMicroUsd, limiteMesMicroUsd: c.limiteMesMicroUsd, limiteRespuestas24h: c.limiteRespuestas24h, tarifa: TARIFA_RUNTIME }, 'produccion', ahora);
      // Una reserva de intento previo nunca compra una segunda llamada.
      return r.repetida || r.estado !== 'reservada' ? null : r.id;
    },
    liberar: id => conciliar(id, 'liberada', 0), confirmar: (id, coste) => conciliar(id, 'confirmada', coste), ambiguo: id => conciliar(id, 'ambigua', 0),
  };
}
/** Recuperación administrativa sin proveedor: cambiar configuración nunca oculta una conversación. */
export async function recuperarTrabajosDesautorizados(db: Firestore, ahora: number, permitirExternos: boolean) {
  const cursorRef = db.doc('bot_servicio_runtime/recuperacion');
  const cursor = (await cursorRef.get()).data()?.ultimoId;
  let consulta = db.collection('bot_servicio_trabajos').where('estado', 'in', ['pendiente', 'procesando', 'proveedor_iniciado', 'respuesta_lista', 'despachando']).orderBy(FieldPath.documentId()).limit(20);
  if (typeof cursor === 'string' && /^[a-f0-9]{64}$/.test(cursor)) consulta = consulta.startAfter(cursor);
  const trabajos = await consulta.get();
  for (const doc of trabajos.docs) await db.runTransaction(async tx => {
    const j = (await tx.get(doc.ref)).data();
    if (!j || !['pendiente', 'procesando', 'proveedor_iniciado', 'respuesta_lista', 'despachando'].includes(j.estado)) return;
    const [runtime, sesion] = await Promise.all([tx.get(db.doc(RUNTIME_BOT)), tx.get(db.doc(sesionPath(j.waId)))]);
    let vigente = false;
    try { const c = validarRuntimeSeguro(runtime.data()); vigente = permitirExternos && c.habilitado && c.version === j.configVersion && c.phoneNumberId === j.phoneNumberId; } catch { /* Configuración inválida requiere atención humana. */ }
    if (vigente) return;
    const s = sesion.data();
    tx.update(doc.ref, { estado: ['proveedor_iniciado', 'respuesta_lista', 'despachando'].includes(j.estado) ? 'ambiguo' : 'cancelado', motivo: 'configuracion_cambiada' });
    tx.set(db.doc(sesionPath(j.waId)), { pausado: true, epoch: (s?.epoch ?? 0) + 1 }, { merge: true });
    tx.set(db.doc(`whatsapp_conversaciones/${j.waId}`), { requiereHumano: true }, { merge: true });
    tx.set(db.doc(`crm_atencion/${j.waId}`), { pendiente: true }, { merge: true });
    tx.set(db.doc(`bot_servicio_real_handoffs/${j.waId}`), { waId: j.waId, clienteId: j.clienteId ?? null, datos: s?.datos ?? {}, pendientes: [], motivo: 'configuracion_cambiada', estado: 'pendiente', updatedAt: new Date(ahora) }, { merge: true });
  });
  await cursorRef.set({ ultimoId: trabajos.size === 20 ? trabajos.docs[trabajos.docs.length - 1].id : null, actualizadoMs: ahora });
}
/** Un efecto incierto nunca vuelve a la cola. La reserva completa permanece comprometida. */
export async function recuperarEfectosVencidos(db: Firestore, ahora: number) {
  // @safe-orderby: leaseHastaMs se escribe al crear y reclamar todos los trabajos.
  const vencidos = await db.collection('bot_servicio_trabajos').where('estado', 'in', ['proveedor_iniciado', 'respuesta_lista', 'despachando']).where('leaseHastaMs', '<=', ahora).orderBy('leaseHastaMs', 'asc').limit(10).get();
  for (const doc of vencidos.docs) await db.runTransaction(async tx => {
    const j = (await tx.get(doc.ref)).data();
    if (!j || !['proveedor_iniciado', 'respuesta_lista', 'despachando'].includes(j.estado) || j.leaseHastaMs > ahora) return;
    const sr = db.doc(sesionPath(j.waId)), s = (await tx.get(sr)).data();
    tx.update(doc.ref, { estado: 'ambiguo', motivo: 'lease_vencido_tras_efecto' });
    tx.set(sr, { pausado: true, epoch: (s?.epoch ?? 0) + 1 }, { merge: true });
    tx.set(db.doc(`whatsapp_conversaciones/${j.waId}`), { requiereHumano: true }, { merge: true });
    tx.set(db.doc(`crm_atencion/${j.waId}`), { pendiente: true }, { merge: true });
    tx.set(db.doc(`bot_servicio_real_handoffs/${j.waId}`), { waId: j.waId, clienteId: j.clienteId ?? null, equipoId: null, datos: s?.datos ?? {}, pendientes: [], motivo: 'envio_o_proveedor_incierto', estado: 'pendiente', updatedAt: new Date(ahora) }, { merge: true });
  });
}
/** Se llama antes de los writes del webhook; devuelve únicamente writes de la misma transacción. */
const entradaInactiva = () => Object.assign(() => false, { activo: false });
export async function prepararEntradaBot(db: Firestore, tx: Transaction, entrada: { waId: string; wamid: string; phoneNumberId: string; pideHumano?: boolean; baja?: boolean; botHabilitado?: boolean }, ahora = Date.now()) {
  if (!waValido(entrada.waId) || !entrada.wamid || entrada.wamid.length > 256) throw new Error('Entrada inválida');
  const sRef = db.doc(sesionPath(entrada.waId)), cRef = db.doc(RUNTIME_BOT);
  const [cs, ss, conv] = await Promise.all([tx.get(cRef), tx.get(sRef), tx.get(db.doc(`whatsapp_conversaciones/${entrada.waId}`))]);
  let c;
  try { c = validarRuntimeSeguro(cs.data()); } catch { return entradaInactiva(); }
  const s = ss.data();
  if (!configEjecucionValida(c) || c.phoneNumberId !== entrada.phoneNumberId || entrada.botHabilitado === false) return entradaInactiva();
  const id = hash(JSON.stringify([entrada.phoneNumberId, entrada.wamid]));
  const ref = db.doc(trabajoPath(id)), previo = await tx.get(ref);
  if (previo.exists) return entradaInactiva();
  const pausa = entrada.baja === true;
  const epoch = (s?.epoch ?? 0) + (entrada.pideHumano && !s?.pausado ? 1 : 0);
  const activo = !pausa && !s?.pausado && (!periodosBot(ahora).laboral || c.permitirHorarioLaboral);
  return Object.assign(() => {
    if (pausa || entrada.pideHumano && !s?.pausado) tx.set(sRef, { epoch: pausa ? epoch + 1 : epoch, pausado: pausa, motivo: pausa ? 'baja' : 'humano_solicitado', actualizadoMs: ahora }, { merge: true });
    const clienteId = typeof conv.data()?.clienteId === 'string' && conv.data()!.clienteId.length <= 110 ? conv.data()!.clienteId : null;
    tx.create(ref, { waId: entrada.waId, clienteId, identidadCupo: clienteId ? `cliente:${clienteId}` : `wa:${entrada.waId}`, phoneNumberId: entrada.phoneNumberId, mensajeIds: [entrada.wamid], pideHumano: entrada.pideHumano === true, epoch, configVersion: c.version,
      estado: activo ? 'pendiente' : 'cancelado', intentos: 0, creadoMs: ahora, disponibleMs: ahora + 5000, leaseHastaMs: 0 });
    return activo;
  }, { activo });
}
/** No reactiva al liberar atención. Reanudar requerirá acción explícita versionada. */
export async function prepararPausaBot(db: Firestore, tx: Transaction, waId: string, actorUid: string, ahora = Date.now()) {
  if (!waValido(waId) || !actorUid) throw new Error('Pausa inválida');
  const ref = db.doc(sesionPath(waId)), s = (await tx.get(ref)).data();
  return () => tx.set(ref, { epoch: (s?.epoch ?? 0) + 1, pausado: true, actorUid, actualizadoMs: ahora }, { merge: true });
}
export function crearAlmacenServicio(db: Firestore, presupuesto: PresupuestoStoreServicio): AlmacenServicio {
  const jobRef = (l: LeaseServicio) => db.doc(trabajoPath(l.id));
  async function leer(tx: Transaction, l: LeaseServicio, ahora: number) {
    const j = (await tx.get(jobRef(l))).data();
    if (!j || !waValido(j.waId)) throw new Error('Trabajo inexistente');
    const [ss, cs, conv, opt] = await Promise.all([tx.get(db.doc(sesionPath(j.waId))), tx.get(db.doc(RUNTIME_BOT)), tx.get(db.doc(`whatsapp_conversaciones/${j.waId}`)), tx.get(db.doc(`whatsapp_opt_outs/${j.waId}`))]);
    const s = ss.data(), c = cs.data(), v = conv.data();
    const hasta = v?.ventana24h?.cierraEn?.toMillis?.() ?? 0;
    const valido = configEjecucionValida(c) && c.version === l.configVersion && c.phoneNumberId === j.phoneNumberId &&
      j.epoch === l.epoch && j.intento === l.intento && j.trabajador === l.trabajador && j.leaseHastaMs > ahora &&
      !s?.pausado && (s?.epoch ?? 0) === l.epoch && s?.trabajoActivo === l.id && s?.intentoActivo === l.intento && !opt.exists && v?.bot?.habilitado === true && hasta > ahora &&
      (!periodosBot(ahora).laboral || c.permitirHorarioLaboral);
    return { j, s, c, v, valido, hasta };
  }
  return {
    async reclamar(id, ahora) {
      const ref = db.doc(trabajoPath(id));
      return db.runTransaction(async tx => {
        const j = (await tx.get(ref)).data();
        if (!j || !waValido(j.waId) || !['pendiente', 'procesando'].includes(j.estado) || j.disponibleMs > ahora || j.leaseHastaMs > ahora || j.intentos >= 3) return null;
        const [ss, cs] = await Promise.all([tx.get(db.doc(sesionPath(j.waId))), tx.get(db.doc(RUNTIME_BOT))]);
        const s = ss.data(), c = cs.data();
        if (s?.pausado || (s?.epoch ?? 0) !== j.epoch) { tx.update(ref, { estado: 'cancelado' }); return null; }
        if (!configEjecucionValida(c) || c.version !== j.configVersion) {
          tx.update(ref, { estado: 'cancelado', motivo: 'configuracion_cambiada' });
          tx.set(db.doc(`whatsapp_conversaciones/${j.waId}`), { requiereHumano: true }, { merge: true });
          tx.set(db.doc(`crm_atencion/${j.waId}`), { pendiente: true }, { merge: true });
          tx.set(db.doc(`bot_servicio_real_handoffs/${j.waId}`), { waId: j.waId, clienteId: j.clienteId ?? null, datos: s?.datos ?? {}, pendientes: [], motivo: 'configuracion_cambiada', estado: 'pendiente', updatedAt: new Date(ahora) }, { merge: true });
          return null;
        }
        if (s?.trabajoActivo && s.trabajoActivo !== id && s.leaseHastaMs > ahora) return null;
        if (s?.trabajoActivo && s.leaseHastaMs <= ahora) {
          const anteriorRef = db.doc(trabajoPath(s.trabajoActivo)), anterior = (await tx.get(anteriorRef)).data();
          if (anterior && ['proveedor_iniciado', 'respuesta_lista', 'despachando'].includes(anterior.estado)) {
            // Proceso muerto tras iniciar un efecto externo: cupo retenido y atención humana.
            tx.update(anteriorRef, { estado: 'ambiguo', motivo: 'lease_vencido_tras_efecto' });
            tx.set(db.doc(sesionPath(j.waId)), { pausado: true, epoch: (s.epoch ?? 0) + 1 }, { merge: true });
            tx.set(db.doc(`whatsapp_conversaciones/${j.waId}`), { requiereHumano: true }, { merge: true });
            return null;
          }
        }
        // @safe-orderby: creadoMs se escribe al crear todo trabajo del bot.
        const rafaga = await tx.get(db.collection('bot_servicio_trabajos').where('waId', '==', j.waId).where('estado', '==', 'pendiente').where('creadoMs', '<=', ahora).orderBy('creadoMs', 'asc').limit(8));
        const absorbidos = rafaga.docs.filter(d => d.id !== id && d.data().epoch === j.epoch && d.data().configVersion === j.configVersion).slice(0, 7);
        const mensajeIds = [...new Set([...j.mensajeIds, ...absorbidos.flatMap(d => d.data().mensajeIds)])].slice(-8);
        const l = { id, intento: j.intentos + 1, epoch: j.epoch, configVersion: j.configVersion, trabajador: randomUUID() };
        tx.update(ref, { estado: 'procesando', mensajeIds, intento: l.intento, intentos: l.intento, trabajador: l.trabajador, leaseHastaMs: ahora + 120000 });
        absorbidos.forEach(d => tx.update(d.ref, { estado: 'agrupado', grupoId: id }));
        tx.set(db.doc(sesionPath(j.waId)), { epoch: l.epoch, trabajoActivo: id, intentoActivo: l.intento, leaseHastaMs: ahora + 120000 }, { merge: true });
        return l;
      });
    },
    async contexto(l) {
      return db.runTransaction(async tx => {
        const j = (await tx.get(jobRef(l))).data();
        if (!j || !waValido(j.waId) || j.intento !== l.intento || j.trabajador !== l.trabajador) throw new Error('Trabajo inválido');
        const sr = db.doc(sesionPath(j.waId));
        const [ss, conv, ...mensajes] = await Promise.all([tx.get(sr), tx.get(db.doc(`whatsapp_conversaciones/${j.waId}`)), ...j.mensajeIds.slice(-8).map((id: string) => tx.get(db.doc(`whatsapp_mensajes_inbox/${id}`)))]);
        if (mensajes.some(m => m.data()?.wa_id !== j.waId)) throw new Error('Mensaje ajeno a conversación');
        const datos = { ...(ss.data()?.datos ?? {}) }, v = conv.data();
        datos.tieneFoto = datos.tieneFoto === true || mensajes.some(m => m.data()?.tipo === 'image' && typeof m.data()?.contenido?.mediaId === 'string');
        datos.tieneUbicacion = datos.tieneUbicacion === true || typeof datos.direccion === 'string' && datos.direccion.trim().length > 0 || mensajes.some(m => ubicacionValida(m.data()));
        if (!ss.data()?.pausado && (ss.data()?.epoch ?? 0) === l.epoch) tx.set(sr, { datos }, { merge: true });
        return { saludoEnviado: ss.data()?.saludoEnviado === true, mensajes: mensajes.map(m => String(m.data()?.contenido?.texto ?? `[${m.data()?.tipo ?? 'mensaje'} recibido]`)), equipo: datos.equipo, servicio: datos.servicio, falla: datos.falla, direccion: datos.direccion,
          tieneFoto: datos.tieneFoto, tieneUbicacion: datos.tieneUbicacion, pideHumano: j.pideHumano === true, baja: false,
          ventanaHastaMs: v?.ventana24h?.cierraEn?.toMillis?.() ?? 0, phoneNumberId: j.phoneNumberId } as ContextoServicio;
      });
    },
    vigente: (l, ahora) => db.runTransaction(async tx => (await leer(tx, l, ahora)).valido),
    reservar: (l, _max, ahora) => db.runTransaction(async tx => {
      const r = await leer(tx, l, ahora);
      if (!r.valido || r.j.estado !== 'procesando') return null;
      // El core de presupuesto realiza sus lecturas antes de los writes.
      return presupuesto.reservar(tx, l, r.j.identidadCupo, r.c!, ahora, r.j.clienteId ? [`wa:${r.j.waId}`] : undefined);
    }),
    iniciarProveedor: (l, reserva, ahora) => db.runTransaction(async tx => {
      const r = await leer(tx, l, ahora);
      if (!r.valido || r.j.estado !== 'procesando') return false;
      tx.update(jobRef(l), { estado: 'proveedor_iniciado', reserva }); return true;
    }),
    liberar: reserva => presupuesto.liberar(reserva),
    async registrarResultado(l, reserva, respuesta, coste) {
      await presupuesto.confirmar(reserva, coste);
      await db.runTransaction(async tx => {
        const ref = jobRef(l), j = (await tx.get(ref)).data();
        if (!j || j.reserva !== reserva || j.intento !== l.intento || j.trabajador !== l.trabajador || j.estado !== 'proveedor_iniciado') throw new Error('Resultado fuera de lease');
        const sRef = db.doc(sesionPath(j.waId)), s = (await tx.get(sRef)).data();
        const mensajes = await Promise.all(j.mensajeIds.slice(-8).map((id: string) => tx.get(db.doc(`whatsapp_mensajes_inbox/${id}`))));
        const datos = { ...(s?.datos ?? {}), ...Object.fromEntries(Object.entries(respuesta.datos).filter(([k, v]) => ['equipo', 'servicio', 'falla', 'direccion'].includes(k) && typeof v === 'string' && v.trim())) };
        datos.tieneFoto = datos.tieneFoto === true || mensajes.some(m => m.data()?.tipo === 'image' && typeof m.data()?.contenido?.mediaId === 'string');
        datos.tieneUbicacion = datos.tieneUbicacion === true || typeof datos.direccion === 'string' && datos.direccion.trim().length > 0 || mensajes.some(m => ubicacionValida(m.data()));
        tx.update(ref, { estado: 'respuesta_lista', resultado: respuesta.datos, costeMicroUsd: coste });
        if (!s?.pausado && (s?.epoch ?? 0) === l.epoch) tx.set(sRef, { datos }, { merge: true });
      });
    },
    prepararEnvio: (l, texto, ahora) => db.runTransaction(async tx => {
      const r = await leer(tx, l, ahora);
      const out = db.doc(`whatsapp_mensajes_outbox/bot_${l.id}`), previo = await tx.get(out);
      if (!r.valido || r.j.estado !== 'respuesta_lista' || previo.exists) return false;
      tx.create(out, { wa_id: r.j.waId, phoneNumberId: r.j.phoneNumberId, texto, tipo: 'texto_libre', estado: 'queued', origen: 'bot_servicio', trabajoId: l.id, createdAt: new Date(ahora) });
      tx.update(jobRef(l), { estado: 'despachando' }); return true;
    }),
    async completar(l, wamid) {
      await db.runTransaction(async tx => {
        const ref = jobRef(l), j = (await tx.get(ref)).data();
        if (!j || j.estado !== 'despachando' || j.intento !== l.intento || j.trabajador !== l.trabajador) throw new Error('Confirmación fuera de lease');
        const sr = db.doc(sesionPath(j.waId)), s = (await tx.get(sr)).data();
        tx.update(ref, { estado: 'completado', wamid });
        tx.update(db.doc(`whatsapp_mensajes_outbox/bot_${l.id}`), { estado: 'sent', wamid });
        if (s?.trabajoActivo === l.id && s?.intentoActivo === l.intento) tx.set(sr, { trabajoActivo: null, leaseHastaMs: 0, saludoEnviado: true }, { merge: true });
      });
    },
    async ambiguo(l, reserva, etapa) {
      if (etapa === 'proveedor') await presupuesto.ambiguo(reserva);
      await db.runTransaction(async tx => {
        const j = (await tx.get(jobRef(l))).data();
        if (!j || j.intento !== l.intento || j.trabajador !== l.trabajador) throw new Error('Ambigüedad fuera de lease');
        const sesion = (await tx.get(db.doc(sesionPath(j.waId)))).data();
        const pausa = await prepararPausaBot(db, tx, j.waId, 'bot_servicio');
        pausa();
        tx.update(jobRef(l), { estado: 'ambiguo', etapa });
        tx.set(db.doc(`whatsapp_conversaciones/${j.waId}`), { requiereHumano: true }, { merge: true });
        tx.set(db.doc(`crm_atencion/${j.waId}`), { pendiente: true }, { merge: true });
        tx.set(db.doc(`bot_servicio_real_handoffs/${j.waId}`), { waId: j.waId, clienteId: j.clienteId ?? null, datos: sesion?.datos ?? {}, pendientes: [], motivo: 'envio_o_proveedor_incierto', estado: 'pendiente', updatedAt: new Date() }, { merge: true });
      });
    },
    async cancelar(l, motivo) {
      await db.runTransaction(async tx => {
        const j = (await tx.get(jobRef(l))).data();
        if (j?.intento !== l.intento || j.trabajador !== l.trabajador) return;
        const sr = db.doc(sesionPath(j.waId)), s = (await tx.get(sr)).data();
        tx.update(jobRef(l), { estado: 'cancelado', motivo });
        if (s?.trabajoActivo === l.id && s?.intentoActivo === l.intento) tx.set(sr, { trabajoActivo: null, leaseHastaMs: 0 }, { merge: true });
      });
    },
    async entregarHumano(l, motivo) {
      await db.runTransaction(async tx => {
        const j = (await tx.get(jobRef(l))).data();
        if (!j || j.intento !== l.intento || j.trabajador !== l.trabajador) throw new Error('Entrega fuera de lease');
        const s = (await tx.get(db.doc(sesionPath(j.waId)))).data();
        const datos = s?.datos ?? {};
        const pendientes = ['equipo', 'servicio', ...(datos.servicio === 'mantenimiento' ? [] : ['falla']), 'tieneFoto', 'tieneUbicacion'].filter(k => !datos[k]);
        const atencion = (await tx.get(db.doc(`crm_atencion/${j.waId}`))).data();
        // Si oficina ya tomó la sesión, conservar su reparto y no producir otra entrega.
        if (s?.pausado || (s?.epoch ?? 0) !== l.epoch) {
          tx.update(jobRef(l), { estado: 'cancelado', motivo: 'atencion_humana_actual' }); return;
        }
        const asignacion = await prepararAsignacionEquipoReal(db, tx, j.clienteId ?? null, j.waId);
        const aplicar = await prepararPausaBot(db, tx, j.waId, 'bot_servicio');
        aplicar(); asignacion?.aplicar();
        tx.set(db.doc(`bot_servicio_real_handoffs/${j.waId}`), { waId: j.waId, clienteId: j.clienteId ?? null, equipoId: asignacion?.equipoId ?? atencion?.equipoId ?? null, clasificacionPendiente: !asignacion, datos, pendientes, motivo, estado: 'pendiente', createdAt: new Date(), updatedAt: new Date() }, { merge: true });
        tx.set(db.doc(`crm_atencion/${j.waId}`), { pendiente: true, ...(asignacion ? { equipoId: asignacion.equipoId, ...(!atencion?.responsableId ? { responsableId: asignacion.secretariaUid } : {}) } : {}) }, { merge: true }); tx.update(jobRef(l), { estado: 'humano', motivo });
        if (asignacion && !atencion?.responsableId) tx.set(db.doc(`whatsapp_conversaciones/${j.waId}`), { asignadaA: asignacion.secretariaUid }, { merge: true });
        tx.set(db.doc(`whatsapp_conversaciones/${j.waId}`), { requiereHumano: true }, { merge: true });
      });
    },
  };
}
