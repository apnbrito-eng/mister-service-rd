import { collection, doc, getDoc, getDocs, runTransaction, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { Cliente, EquipoTaller, EstadoEquipo, StandbyPieza } from '../types';
import { resolverChatCliente } from '../utils/resolverChatCliente';

export type EquipoVinculado = Omit<EquipoTaller, 'estado'> & { estado: EstadoEquipo | 'descartado'; ordenId?: string; motivoDescarte?: string };
export type PiezaVinculada = StandbyPieza & { equipoTallerId?: string; clienteId?: string; fotoUrl?: string };

export async function abrirChatVinculado(clienteId?: string): Promise<string> {
  if (!clienteId) throw new Error('Vincula primero el equipo a una orden con cliente registrado.');
  const cliente = await getDoc(doc(db, 'clientes', clienteId));
  if (!cliente.exists()) throw new Error('El cliente vinculado ya no existe.');
  return `/admin/inbox/${encodeURIComponent(await resolverChatCliente({ ...cliente.data(), id: cliente.id } as Cliente))}?clienteId=${encodeURIComponent(cliente.id)}`;
}

/** ID estable: repetir la transición no crea otra solicitud ni borra su detalle. */
export async function cambiarEstadoTaller(equipoId: string, estado: EquipoVinculado['estado'], motivo = '') {
  const actorUid = auth.currentUser?.uid;
  if (!actorUid) throw new Error('Inicia sesión para actualizar el equipo.');
  if (estado === 'descartado' && motivo.trim().length < 5) throw new Error('Explica por qué el equipo no pudo repararse (mínimo 5 caracteres).');
  await runTransaction(db, async tx => {
    const equipoRef = doc(db, 'equipos_taller', equipoId);
    const equipo = await tx.get(equipoRef);
    if (!equipo.exists()) throw new Error('El equipo ya no existe.');
    const datos = equipo.data();
    const piezaRef = doc(db, 'standby_piezas', `taller_${equipoId}`);
    const pieza = estado === 'en_standby' ? await tx.get(piezaRef) : null;
    const ordenRef = estado === 'en_standby' && datos.ordenId ? doc(db, 'ordenes_servicio', datos.ordenId) : null;
    const orden = ordenRef ? await tx.get(ordenRef) : null;
    if (orden && (!orden.exists() || orden.data().eliminada || (['cerrado', 'cancelado', 'completado'].includes(orden.data().estado) || ['cerrado', 'cancelado', 'completado'].includes(orden.data().fase)))) throw new Error('La orden vinculada ya no está activa. Revisa su estado antes de solicitar piezas.');
    if (pieza?.exists() && pieza.data().estado === 'llego') throw new Error('La solicitud anterior ya llegó; registra una nueva pieza en Pendiente de piezas.');
    const cambio: Record<string, unknown> = { estado, updatedAt: Timestamp.now() };
    if (estado === 'descartado') Object.assign(cambio, { motivoDescarte: motivo.trim(), descartadoPor: actorUid, descartadoEn: Timestamp.now() });
    tx.update(equipoRef, cambio);
    if (ordenRef) tx.update(ordenRef, { enStandby: true, updatedAt: Timestamp.now() });
    if (pieza && !pieza.exists()) {
      const payload: Record<string, unknown> = {
        equipoTallerId: equipoId, clienteNombre: datos.clienteNombre || '', equipoTipo: datos.equipoTipo || '',
        equipoMarca: datos.equipoMarca || '', piezaFaltante: 'Pendiente de detallar', estado: 'buscando',
        fechaInicio: Timestamp.now(), createdAt: Timestamp.now(), notas: `Equipo S/N: ${datos.numeroSerie || ''}`,
      };
      if (datos.ordenId) payload.ordenId = datos.ordenId;
      if (datos.clienteId) payload.clienteId = datos.clienteId;
      tx.set(piezaRef, payload);
    }
  });
}

/** Llegada + avisos en una transacción. Conserva standby hasta coordinación humana. */
export async function registrarLlegadaPieza(piezaId: string): Promise<void> {
  const actorUid = auth.currentUser?.uid;
  if (!actorUid) throw new Error('Inicia sesión para registrar la llegada.');
  const personal = await getDocs(collection(db, 'personal'));
  const activos = personal.docs.filter(p => p.data().activo === true && typeof p.data().uid === 'string' && p.data().uid.trim()).map(p => ({ ...p.data(), id: p.id } as { id: string; uid: string; rol: string }));
  await runTransaction(db, async tx => {
    const piezaRef = doc(db, 'standby_piezas', piezaId);
    const pieza = await tx.get(piezaRef);
    if (!pieza.exists()) throw new Error('La pieza ya no existe.');
    const datos = pieza.data();
    if (datos.estado === 'llego') return;
    const orden = datos.ordenId ? await tx.get(doc(db, 'ordenes_servicio', datos.ordenId)) : null;
    const ids = [orden?.data()?.operariaId, orden?.data()?.responsableId].filter(Boolean);
    const uids = new Set(ids.flatMap(id => { const candidatos = activos.filter(p => p.id === id || p.uid === id); return candidatos.length === 1 ? [candidatos[0].uid] : []; }));
    let responsables = activos.filter(p => uids.has(p.uid));
    if (!responsables.length) responsables = activos.filter(p => ['administrador', 'coordinadora'].includes(p.rol));
    responsables = responsables.filter((p, i, lista) => lista.findIndex(otro => otro.uid === p.uid) === i);
    if (!responsables.length) throw new Error('No hay responsables activos con acceso para recibir el aviso.');
    tx.update(piezaRef, { estado: 'llego', llegadaEn: Timestamp.now(), llegadaPor: actorUid });
    for (const responsable of responsables) {
      const payload: Record<string, unknown> = { userId: responsable.uid, tipo: 'pieza_llego', titulo: 'Pieza recibida: coordinar instalación', mensaje: `${datos.piezaFaltante || 'Pieza'} · ${datos.clienteNombre || 'Cliente'}. Revisar las demás piezas y contactar al cliente para coordinar.`, leida: false, createdAt: Timestamp.now() };
      if (datos.ordenId) payload.ordenId = datos.ordenId;
      tx.set(doc(db, 'notificaciones', `pieza_llego_${piezaId}_${responsable.uid}`), payload);
    }
  });
}

export async function guardarSolicitudPieza(id: string, ordenId: string, datos: Record<string, unknown>, equipoTallerId = '') {
  if (!auth.currentUser) throw new Error('Inicia sesión para registrar la pieza.');
  if (typeof datos.piezaFaltante !== 'string' || !datos.piezaFaltante.trim()) throw new Error('Describe la pieza solicitada.');
  const piezaFaltante = datos.piezaFaltante.trim();
  await runTransaction(db, async tx => {
    const ordenRef = doc(db, 'ordenes_servicio', ordenId);
    const orden = await tx.get(ordenRef);
    const piezaRef = doc(db, 'standby_piezas', id);
    const anterior = await tx.get(piezaRef);
    const equipo = equipoTallerId ? await tx.get(doc(db, 'equipos_taller', equipoTallerId)) : null;
    if (!orden.exists() || orden.data().eliminada || !orden.data().clienteId || ['cerrado', 'cancelado', 'completado'].includes(orden.data().estado) || ['cerrado', 'cancelado', 'completado'].includes(orden.data().fase)) throw new Error('Selecciona una orden vigente con cliente registrado.');
    if (equipo && (!equipo.exists() || equipo.data().ordenId !== ordenId)) throw new Error('El equipo no está vinculado a esta orden.');
    if (anterior.exists() && anterior.data().estado === 'llego') throw new Error('La pieza ya llegó; conserva su historial.');
    if (anterior.exists() && anterior.data().ordenId && anterior.data().ordenId !== ordenId) throw new Error('No se puede trasladar una pieza a otra orden.');
    const o = orden.data();
    const payload: Record<string, unknown> = { piezaFaltante, notas: typeof datos.notas === 'string' ? datos.notas : '', ordenId, clienteId: o.clienteId, clienteNombre: o.clienteNombre || '', equipoTipo: o.equipoTipo || '', equipoMarca: o.equipoMarca || '', tecnicoNombre: o.tecnicoNombre || '', updatedAt: Timestamp.now() };
    if (typeof datos.fotoUrl === 'string' && datos.fotoUrl) payload.fotoUrl = datos.fotoUrl;
    if (equipoTallerId) payload.equipoTallerId = equipoTallerId;
    if (!anterior.exists()) Object.assign(payload, { estado: 'buscando', createdAt: Timestamp.now(), fechaInicio: Timestamp.now() });
    tx.set(piezaRef, payload, { merge: true });
    tx.update(ordenRef, { enStandby: true, updatedAt: Timestamp.now() });
  });
}

export async function vincularEquipoOrden(equipoId: string, ordenId: string) {
  const actorUid = auth.currentUser?.uid;
  if (!actorUid) throw new Error('Inicia sesión para vincular el equipo.');
  await runTransaction(db, async tx => {
    const equipoRef = doc(db, 'equipos_taller', equipoId);
    const equipo = await tx.get(equipoRef);
    const ordenRef = doc(db, 'ordenes_servicio', ordenId);
    const orden = await tx.get(ordenRef);
    const piezaRef = doc(db, 'standby_piezas', `taller_${equipoId}`);
    const pieza = await tx.get(piezaRef);
    if (!equipo.exists() || !orden.exists() || orden.data().eliminada || !orden.data().clienteId) throw new Error('Orden o equipo no disponible.');
    if (equipo.data().ordenId && equipo.data().ordenId !== ordenId) throw new Error('El equipo ya tiene una orden vinculada.');
    if (pieza.exists() && (pieza.data().estado === 'llego' || (pieza.data().ordenId && pieza.data().ordenId !== ordenId))) throw new Error('La solicitud de este equipo ya llegó o pertenece a otra orden. Requiere revisión antes de vincular.');
    if (pieza.exists() && (['cerrado', 'cancelado', 'completado'].includes(orden.data().estado) || ['cerrado', 'cancelado', 'completado'].includes(orden.data().fase))) throw new Error('La orden no está activa para recibir una solicitud pendiente.');
    const vinculo = { ordenId, clienteId: orden.data().clienteId, clienteNombre: orden.data().clienteNombre || '' };
    tx.update(equipoRef, { ...vinculo, clienteTelefono: orden.data().clienteTelefono || '', vinculadoPor: actorUid, vinculadoEn: Timestamp.now() });
    if (pieza.exists()) {
      tx.update(piezaRef, { ...vinculo, equipoTallerId: equipoId, updatedAt: Timestamp.now() });
      tx.update(ordenRef, { enStandby: true, updatedAt: Timestamp.now() });
    }
  });
}

export async function cambiarEstadoSolicitud(id: string, estado: 'buscando' | 'importada' | 'dificil') {
  await runTransaction(db, async tx => {
    const referencia = doc(db, 'standby_piezas', id);
    const actual = await tx.get(referencia);
    if (!actual.exists() || actual.data().estado === 'llego') throw new Error('La pieza ya llegó o no está disponible. Actualiza la lista.');
    tx.update(referencia, { estado, updatedAt: Timestamp.now() });
  });
}

/** Recepción toma la identidad de la orden releída, nunca de campos editables. */
export async function recibirEquipoTaller(id: string, ordenId: string, datos: Record<string, unknown>) {
  const actorUid = auth.currentUser?.uid;
  if (!actorUid) throw new Error('Inicia sesión para recibir el equipo.');
  await runTransaction(db, async tx => {
    const orden = await tx.get(doc(db, 'ordenes_servicio', ordenId));
    const equipoRef = doc(db, 'equipos_taller', id);
    const existente = await tx.get(equipoRef);
    if (!orden.exists() || orden.data().eliminada || !orden.data().clienteId || ['cerrado', 'cancelado', 'completado'].includes(orden.data().estado) || ['cerrado', 'cancelado'].includes(orden.data().fase)) throw new Error('Selecciona una orden activa con cliente registrado.');
    if (existente.exists()) return;
    const o = orden.data();
    const payload: Record<string, unknown> = { ordenId, clienteId: o.clienteId, clienteNombre: o.clienteNombre || '', clienteTelefono: o.clienteTelefono || '', equipoTipo: o.equipoTipo || '', equipoMarca: o.equipoMarca || '', tecnicoNombre: o.tecnicoNombre || '', estado: 'recibido', fechaRecibido: Timestamp.now(), createdAt: Timestamp.now(), recibidoPor: actorUid };
    for (const campo of ['numeroSerie', 'fallaReportada', 'diagnostico', 'fechaPrometida', 'costoReparacion']) if (datos[campo] !== undefined) payload[campo] = datos[campo];
    tx.set(equipoRef, payload);
  });
}
