import { createHash } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { CONFIG_BOT_INICIAL, costeMaximoBot, enteroSeguro, periodosBot, validarConfigBot, type ConfigBotServicio } from './politicaBotServicio.js';
export const claveBot = (v: string) => createHash('sha256').update(v).digest('hex');
const configRef = (db: Firestore) => db.doc('bot_servicio_config/sistema');
export type NamespacePresupuestoBot = 'simulacion' | 'produccion';
export type PoliticaPresupuestoBot = Pick<ConfigBotServicio, 'limiteDiaMicroUsd' | 'limiteMesMicroUsd' | 'limiteRespuestas24h' | 'tarifa'>;
export interface EntradaReservaBot { id: string; clienteId: string; modelo: string; tarifaVersion: string; identidadesPrevias?: string[] }
export interface ResultadoReservaBot { estado: 'confirmada' | 'liberada' | 'ambigua'; costeMicroUsd: number }
function prefijoBot(namespace: NamespacePresupuestoBot) {
  if (namespace === 'simulacion') return 'bot_servicio_sim';
  if (namespace === 'produccion') return 'bot_servicio_real';
  throw new Error('Namespace inválido');
}
/** Wrapper del simulador. No llama proveedores ni autoriza envíos. */
export async function reservarPresupuestoBot(db: Firestore, entrada: EntradaReservaBot, ahora = Date.now()) {
  const resultado = await db.runTransaction(async tx => {
    const config = validarConfigBot((await tx.get(configRef(db))).data() ?? CONFIG_BOT_INICIAL);
    return reservarPresupuestoEnTransaccion(db, tx, entrada, config, 'simulacion', ahora);
  });
  if (resultado.estado === 'limite_conversacion') throw new Error('Cupo de conversación agotado');
  if (resultado.estado === 'limite_presupuesto') throw new Error('Presupuesto agotado');
  return resultado;
}
/** Interno: el consumidor valida autorización/lease y obtiene política de servidor dentro de ESTA transacción antes de llamar. */
export async function reservarPresupuestoEnTransaccion(db: Firestore, tx: Transaction, entrada: EntradaReservaBot, politica: PoliticaPresupuestoBot, namespace: NamespacePresupuestoBot, ahora = Date.now()) {
  const prefijo = prefijoBot(namespace);
  const c = validarConfigBot({ ...CONFIG_BOT_INICIAL, limiteDiaMicroUsd: politica.limiteDiaMicroUsd, limiteMesMicroUsd: politica.limiteMesMicroUsd, limiteRespuestas24h: politica.limiteRespuestas24h, tarifa: politica.tarifa });
  if (!entrada.id || entrada.id.length > 256 || !entrada.clienteId || entrada.clienteId.length > 128) throw new Error('Identidad inválida');
  const aliases = [...new Set(entrada.identidadesPrevias ?? [])].filter(v => v !== entrada.clienteId).sort();
  if (aliases.length > 2 || aliases.some(v => typeof v !== 'string' || !v || v.length > 128)) throw new Error('Alias de identidad inválido');
  const id = claveBot(entrada.id), huella = claveBot(JSON.stringify(aliases.length ? { ...entrada, identidadesPrevias: aliases } : entrada));
  const reserva = db.doc(`${prefijo}_reservas/${id}`), cliente = db.doc(`${prefijo}_clientes/${claveBot(entrada.clienteId)}`);
  const periodo = periodosBot(ahora), dia = db.doc(`${prefijo}_presupuesto/dia_${periodo.dia}`), mes = db.doc(`${prefijo}_presupuesto/mes_${periodo.mes}`);
    const aliasRefs = aliases.map(v => db.doc(`${prefijo}_clientes/${claveBot(v)}`));
    const [previa, diario, mensual, persona, extraDia, extraMes] = await Promise.all([tx.get(reserva), tx.get(dia), tx.get(mes), tx.get(cliente), tx.get(db.doc(`${prefijo}_limites/dia_${periodo.dia}`)), tx.get(db.doc(`${prefijo}_limites/mes_${periodo.mes}`))]);
    const aliasDatos = await Promise.all(aliasRefs.map(ref => tx.get(ref)));
    if (previa.exists) {
      if (previa.data()?.huella !== huella) throw new Error('Identificador reutilizado');
      return { id, repetida: true, estado: String(previa.data()?.estado) };
    }
    const t = c.tarifa;
    if (!t || t.modelo !== entrada.modelo || t.version !== entrada.tarifaVersion) throw new Error('Tarifa/modelo no disponible');
    const limiteDia = extraDia.data()?.limiteMicroUsd ?? c.limiteDiaMicroUsd;
    const limiteMes = extraMes.data()?.limiteMicroUsd ?? c.limiteMesMicroUsd;
    if (!enteroSeguro(limiteDia, 1) || !enteroSeguro(limiteMes, 1)) throw new Error('Límites inválidos');
    const monto = costeMaximoBot(t);
    if (persona.data()?.redirigeA) throw new Error('Identidad anterior: requiere usar el cliente canónico');
    const unidos = new Map<string, { id: string; fecha: number }>();
    for (const registro of [persona, ...aliasDatos]) {
      const datos = registro.data();
      if (datos?.redirigeA && datos.redirigeA !== cliente.path) throw new Error('Alias pertenece a otro cliente: revisión necesaria');
      for (const turno of datos?.turnos ?? []) {
        if (typeof turno.id !== 'string' || !enteroSeguro(turno.fecha)) throw new Error('Cupo de cliente inconsistente');
        if (turno.fecha > ahora - 86_400_000 && (!unidos.has(turno.id) || unidos.get(turno.id)!.fecha < turno.fecha)) unidos.set(turno.id, { id: turno.id, fecha: turno.fecha });
      }
    }
    const turnos = [...unidos.values()];

    const uso = [diario.data()?.comprometido ?? 0, mensual.data()?.comprometido ?? 0];
    if (!uso.every(n => enteroSeguro(n))) throw new Error('Presupuesto inconsistente');
    const cupoAgotado = turnos.length >= c.limiteRespuestas24h;
    if (cupoAgotado || uso[0] + monto > limiteDia || uso[1] + monto > limiteMes) {
      // La fusión debe sobrevivir incluso al rechazo: lanzar dentro de la tx permitiría reiniciar el cupo desde otro teléfono vinculado.
      if (aliasRefs.length) {
        tx.set(cliente, { turnos });
        for (const aliasRef of aliasRefs) tx.set(aliasRef, { turnos: [], redirigeA: cliente.path });
      }
      return { id, repetida: false, estado: cupoAgotado ? 'limite_conversacion' : 'limite_presupuesto' };
    }
    tx.set(reserva, { huella, estado: 'reservada', monto, clientePath: cliente.path, diaPath: dia.path, mesPath: mes.path, creadoMs: ahora, tarifa: t, modo: namespace });
    tx.set(cliente, { turnos: [...turnos, { id, fecha: ahora }] });
    for (const aliasRef of aliasRefs) tx.set(aliasRef, { turnos: [], redirigeA: cliente.path });
    for (const [indice, ref, limite] of [[0, dia, limiteDia], [1, mes, limiteMes]] as const) {
      tx.set(ref, { comprometido: uso[indice] + monto }, { merge: true });
      if (uso[indice] < limite * .8 && uso[indice] + monto >= limite * .8) {
        // ID estable por período: subir/bajar límites no duplica la misma alerta.
        tx.set(db.doc(`${prefijo}_alertas/${ref.id}`), { periodo: ref.id, umbral: 80, limite, creadoMs: ahora });
      }
    }
    return { id, repetida: false, estado: 'reservada' };
}
/** Un resultado ambiguo retiene todo el cupo. Solo la conciliación explícita puede liberarlo. */
export async function conciliarPresupuestoBot(db: Firestore, id: string, resultado: ResultadoReservaBot, ahora = Date.now()) {
  return db.runTransaction(tx => conciliarPresupuestoEnTransaccion(db, tx, id, resultado, 'simulacion', ahora));
}
export async function conciliarPresupuestoEnTransaccion(db: Firestore, tx: Transaction, id: string, resultado: ResultadoReservaBot, namespace: NamespacePresupuestoBot, ahora = Date.now()) {
  const prefijo = prefijoBot(namespace);
  if (!/^[a-f0-9]{64}$/.test(id) || !enteroSeguro(resultado.costeMicroUsd)) throw new Error('Conciliación inválida');
    const ref = db.doc(`${prefijo}_reservas/${id}`), snap = await tx.get(ref), r = snap.data();
    if (!r) throw new Error('Reserva inexistente');
    if (!enteroSeguro(r.monto, 1) || r.modo !== namespace || !String(r.diaPath).startsWith(`${prefijo}_presupuesto/dia_`) || !String(r.mesPath).startsWith(`${prefijo}_presupuesto/mes_`) || !String(r.clientePath).startsWith(`${prefijo}_clientes/`)) throw new Error('Reserva corrupta');
    if (['confirmada', 'liberada'].includes(r.estado)) {
      if (r.estado !== resultado.estado || r.costeMicroUsd !== resultado.costeMicroUsd) throw new Error('Conciliación incompatible');
      return;
    }
    if (resultado.estado === 'ambigua') { tx.update(ref, { estado: 'ambigua', actualizadoMs: ahora }); return; }
    if (resultado.costeMicroUsd > r.monto || (resultado.estado === 'liberada' && resultado.costeMicroUsd !== 0)) throw new Error('Coste incompatible con reserva');
    const dia = db.doc(r.diaPath), mes = db.doc(r.mesPath), cliente = db.doc(r.clientePath);
    const [d, m, p] = await Promise.all([tx.get(dia), tx.get(mes), tx.get(cliente)]);
    let clienteFinal = cliente, personaFinal = p;
    const redirige = p.data()?.redirigeA;
    if (redirige) {
      if (typeof redirige !== 'string' || !new RegExp(`^${prefijo}_clientes/[a-f0-9]{64}$`).test(redirige)) throw new Error('Redirección de cupo inválida');
      clienteFinal = db.doc(redirige); personaFinal = await tx.get(clienteFinal);
      if (!personaFinal.exists || personaFinal.data()?.redirigeA) throw new Error('Redirección de cupo inconsistente');
    }
    const devolver = r.monto - resultado.costeMicroUsd;
    for (const [doc, dato] of [[dia, d], [mes, m]] as const) {
      const valor = dato.data()?.comprometido;
      if (!enteroSeguro(valor) || valor < devolver) throw new Error('Contabilidad de reserva inconsistente');
      tx.update(doc, { comprometido: valor - devolver });
    }
    if (resultado.estado === 'liberada') tx.update(clienteFinal, { turnos: (personaFinal.data()?.turnos ?? []).filter((v: { id: string }) => v.id !== id) });
    tx.update(ref, { estado: resultado.estado, costeMicroUsd: resultado.costeMicroUsd, actualizadoMs: ahora });
 }
