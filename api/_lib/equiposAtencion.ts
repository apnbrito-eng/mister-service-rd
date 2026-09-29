import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { CONFIG_BOT_INICIAL, validarConfigBot, type EquipoBotServicio } from './politicaBotServicio.js';
import { claveBot } from './presupuestoBotServicio.js';
import { ordenAbiertaChat } from './rutaChatOrden.js';
export async function validarMiembrosEquipos(db: Firestore, tx: Transaction, equipos: EquipoBotServicio[]) {
  const personas = await Promise.all(equipos.flatMap(e => [tx.get(db.doc(`usuarios/${e.operariaUid}`)), tx.get(db.doc(`usuarios/${e.secretariaUid}`))]));
  equipos.forEach((_e, i) => {
    for (const [offset, rol] of [[0, 'operaria'], [1, 'secretaria']] as const) {
      const persona = personas[i * 2 + offset].data();
      if (!persona || persona.rol !== rol || persona.activo === false || persona.eliminado === true) throw new Error('Miembro de equipo inválido');
    }
  });
}
/** Simulación aislada. Lee carga completa en transacción; no usa contadores aproximados ni límites de consulta. */
export async function asignarEquipoSimulado(db: Firestore, clienteId: string) {
  return db.runTransaction(async tx => {
    const config = validarConfigBot((await tx.get(db.doc('bot_servicio_config/sistema'))).data() ?? CONFIG_BOT_INICIAL);
    const resultado = await prepararEquipo(db, tx, clienteId, config.equipos, 'sim');
    resultado.aplicar();
    return { equipoId: resultado.equipoId, conservado: resultado.conservado };
  });
}
/** Lee antes de escribir. El consumidor ejecuta aplicar junto con su handoff. */
async function prepararEquipo(db: Firestore, tx: Transaction, clienteId: string | null, listaEquipos: EquipoBotServicio[], espacio: 'sim' | 'real', waId?: string, origen: 'whatsapp' | 'web' = 'whatsapp') {
    if ((clienteId !== null && (!clienteId || clienteId.length > 128 || clienteId.includes('/'))) || (waId !== undefined && !/^\d{10,15}$/.test(waId)) || (!clienteId && !waId)) throw new Error('Cliente inválido');
    const cursor = db.doc(`bot_servicio_${espacio}_reparto/cursor`);
    const [clientes, pendientes, ordenes, reservas, control, conversaciones, citas] = await Promise.all([
      tx.get(db.collection('crm_clientes')),
      tx.get(db.collection('crm_atencion')), tx.get(db.collection('ordenes_servicio')),
      tx.get(db.collection(`bot_servicio_${espacio}_asignaciones`)), tx.get(cursor), tx.get(db.collection('whatsapp_conversaciones')), tx.get(db.collection('citas_por_confirmar')),
    ]);
    const c = validarConfigBot({ ...CONFIG_BOT_INICIAL, equipos: listaEquipos });
    if (c.equipos.length !== 2) throw new Error('Configura los dos equipos antes de simular reparto');
    await validarMiembrosEquipos(db, tx, c.equipos);
    const equipoPorPersona = new Map(c.equipos.flatMap(e => [[e.operariaUid, e.id], [e.secretariaUid, e.id]]));
    const equiposCliente = new Map(clientes.docs.map(d => {
      const dato = d.data();
      const derivado = equipoPorPersona.get(dato.responsableId);
      if (dato.equipoId && derivado && dato.equipoId !== derivado) throw new Error('Cartera contradice el equipo guardado');
      if (dato.responsableId && !derivado && !dato.equipoId) throw new Error('Cartera sin equipo clasificable');
      return [d.id, dato.equipoId || derivado];
    }));
    const clientesConversacion = new Map(conversaciones.docs.map(d => [d.id, d.data().clienteId]));
    const conversacion = origen === 'web' ? undefined : conversaciones.docs.find(d => d.id === waId)?.data();
    if (conversacion?.clienteId && clienteId && conversacion.clienteId !== clienteId) throw new Error('Identidad del cliente contradictoria');
    clienteId = clienteId || conversacion?.clienteId || null;
    if (espacio === 'real' && clienteId && !clientes.docs.some(d => d.id === clienteId)) throw new Error('Cliente inválido');
    const identidad = clienteId || `${origen === 'web' ? 'web' : 'wa'}:${waId}`;
    const previas = reservas.docs.filter(d => d.data().clienteId === identidad || (origen !== 'web' && waId && d.data().waId === waId) || (clienteId && d.data().waId && clientesConversacion.get(d.data().waId) === clienteId));
    const atencionActual = origen === 'web' ? undefined : pendientes.docs.find(d => d.id === waId)?.data();
    const candidatos = new Set([clienteId ? equiposCliente.get(clienteId) : null, conversacion?.equipoId, equipoPorPersona.get(atencionActual?.responsableId), ...previas.map(d => d.data().equipoId)].filter(Boolean));
    if (candidatos.size > 1) throw new Error('Asignación simulada contradice cartera vigente');
    const conservado = [...candidatos][0];
    const aplicarAsignacion = (equipo: EquipoBotServicio, cargas: {id: string; carga: number}[], existente: boolean) => {
      tx.set(db.doc(`bot_servicio_${espacio}_asignaciones/${claveBot(identidad)}`), {clienteId: identidad, ...(waId && origen !== 'web' ? {waId} : {}), equipoId: equipo.id, pendiente: espacio === 'sim'});
      // El alias no debe contar una segunda vez cuando se vincula el prospecto.
      for (const previa of previas) if (previa.id !== claveBot(identidad)) tx.delete(previa.ref);
      if (espacio === 'real') {
        if (clienteId) {
          const original = clientes.docs.find(d => d.id === clienteId)!.data();
          tx.set(db.doc(`crm_clientes/${clienteId}`), {equipoId: equipo.id, ...(!original.responsableId ? {responsableId: equipo.operariaUid} : {})}, {merge:true});
        }
        if (waId && origen !== 'web') tx.set(db.doc(`whatsapp_conversaciones/${waId}`), {equipoId: equipo.id}, {merge:true});
        tx.set(db.doc(`bot_servicio_real_reparto_eventos/${claveBot(identidad)}`), {clienteId, ...(waId && origen !== 'web' ? {waId} : {}), equipoId: equipo.id, criterio: existente ? 'conservar_equipo' : 'menor_carga_clientes_pendientes_y_ordenes_activas', cargas, actorTipo:'sistema', actorId:'bot_servicio'});
      }
      tx.set(cursor, {ultimoEquipoId: equipo.id, version:(control.data()?.version ?? 0)+1});
    };
    if (conservado) {
      const equipo = c.equipos.find(e => e.id === conservado);
      if (!equipo) throw new Error('Equipo existente requiere revisión; no se reasigna automáticamente');
      return {equipoId:equipo.id, conservado:true, secretariaUid:equipo.secretariaUid, operariaUid:equipo.operariaUid, aplicar:()=>{ if (espacio === 'real') aplicarAsignacion(equipo,[],true); }};
    }
    const equipos = new Map(c.equipos.map(e => [e.id, { esperando: new Set<string>(), ordenes: 0 }]));
    for (const d of reservas.docs) {
      const r = d.data();
      if (r.pendiente === true) equipos.get(r.equipoId)?.esperando.add(clientesConversacion.get(r.waId) || r.clienteId);
    }
    for (const d of pendientes.docs) {
      const p = d.data();
      if (p.pendiente !== true) continue;
      const vinculado = clientesConversacion.get(d.id);
      if (p.clienteId && vinculado && p.clienteId !== vinculado) throw new Error('Identidad del cliente contradictoria');
      if (!p.clienteId && !vinculado && !/^\d{10,15}$/.test(d.id)) throw new Error('Chat pendiente sin cliente vinculado: clasificar antes de repartir');
      const identidadPendiente = String(p.clienteId || vinculado || `wa:${d.id}`);
      const equipoId = p.equipoId || equiposCliente.get(identidadPendiente) || conversaciones.docs.find(v => v.id === d.id)?.data().equipoId || equipoPorPersona.get(p.responsableId);
      if (!equipoId && d.id === waId) continue;
      if (!equipos.has(equipoId)) throw new Error('Pendientes sin equipo: requiere clasificación previa');
      equipos.get(equipoId)!.esperando.add(identidadPendiente);
    }
    for (const d of citas.docs) {
      const cita = d.data();
      if (cita.estado === 'pendiente' && equipos.has(cita.equipoId)) equipos.get(cita.equipoId)!.esperando.add(`web:${cita.telefonoNormalizado || d.id}`);
    }
    for (const d of ordenes.docs) {
      const o = d.data();
      if (!ordenAbiertaChat(o)) continue;
      const equipoId = o.equipoId || equiposCliente.get(o.clienteId) || equipoPorPersona.get(o.responsableId || o.operariaId);
      if (!equipos.has(equipoId)) throw new Error('Órdenes activas sin equipo: requiere clasificación previa');
      equipos.get(equipoId)!.ordenes += 1;
    }
    const cargas = c.equipos.map(e => ({ id: e.id, carga: equipos.get(e.id)!.esperando.size + equipos.get(e.id)!.ordenes })).sort((a, b) => a.carga - b.carga || a.id.localeCompare(b.id));
    const empates = cargas.filter(e => e.carga === cargas[0].carga);
    const seleccion = empates.find(e => e.id > String(control.data()?.ultimoEquipoId ?? '')) ?? empates[0];
    const equipo = c.equipos.find(e => e.id === seleccion.id)!;
    return { equipoId: seleccion.id, conservado: false, secretariaUid: equipo.secretariaUid, operariaUid: equipo.operariaUid, aplicar: () => aplicarAsignacion(equipo, cargas, false) };

}
/** Runtime sin equipos/migración incompleta: retorna null; el caller crea aviso administrativo, nunca inventa miembros. */
export async function prepararAsignacionEquipoReal(db: Firestore, tx: Transaction, clienteId: string | null, waId?: string, origen: 'whatsapp' | 'web' = 'whatsapp') {
  const runtime = (await tx.get(db.doc('bot_servicio_runtime/sistema'))).data();
  if (!runtime || !Array.isArray(runtime.equipos) || runtime.equipos.length !== 2) return null;
  try { return await prepararEquipo(db, tx, clienteId, runtime.equipos, 'real', waId, origen); }
  catch (error) {
    // Solo conflictos de datos definidos aquí se degradan a revisión. Firestore/red deben abortar la transacción.
    const mensajes = ['Cliente inválido', 'Equipos inválidos', 'Miembro de equipo inválido', 'Configuración inválida', 'Cartera contradice el equipo guardado', 'Cartera sin equipo clasificable', 'Asignación simulada contradice cartera vigente', 'Equipo existente requiere revisión; no se reasigna automáticamente', 'Identidad del cliente contradictoria', 'Chat pendiente sin cliente vinculado: clasificar antes de repartir', 'Pendientes sin equipo: requiere clasificación previa', 'Órdenes activas sin equipo: requiere clasificación previa'];
    if (error instanceof Error && mensajes.includes(error.message)) return null;
    throw error;
  }
}

/** Bandera de reparto independiente de llamadas IA. Null conserva el comportamiento previo. */
export async function prepararRepartoCanal(db: Firestore, tx: Transaction, clienteId: string | null, waId: string, origen: 'whatsapp' | 'web' = 'whatsapp') {
  const runtime = (await tx.get(db.doc('bot_servicio_runtime/sistema'))).data();
  if (runtime?.repartoHabilitado !== true) return null;
  return { asignacion: await prepararAsignacionEquipoReal(db, tx, clienteId, waId, origen) };
}
