import { collection, doc, getDocs, runTransaction, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { OrdenServicio, Usuario, Personal } from '../types';
import { crearRegistroAuditoria, parseOrden } from '../utils';
import { puedeGestionarRespuestaPresupuesto, validarAccionPresupuesto } from '../utils/presupuestoOrden';
import { crearNotificacion } from './notificaciones.service';

type Accion = 'aprobar' | 'aceptar' | 'proponer';
/** Una única transición para las tres entradas (agenda, lista y detalle). Las reglas
 * de Firestore validan de nuevo el rol y los campos permitidos en el servidor. */
export async function gestionarPresupuestoOrden(args: {
  orden: OrdenServicio; usuario: Usuario; uid: string; accion: Accion; monto: number;
  motivo?: string; camposDescuento?: Record<string, unknown>; detalleDescuento?: string;
}): Promise<void> {
  const { orden, usuario, uid, accion, monto } = args;
  if (!uid) throw new Error('Inicia sesión nuevamente.');
  const ref = doc(db, 'ordenes_servicio', orden.id);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('La orden ya no existe.');
    const actual = parseOrden(snap.id, snap.data());
    if (accion === 'aprobar' ? !['administrador', 'coordinadora'].includes(usuario.rol) : !puedeGestionarRespuestaPresupuesto(actual, usuario.rol, uid)) throw new Error('No tienes permiso para gestionar este presupuesto.');
    for (const campo of ['presupuestoEstado', 'estadoAprobacion', 'precioSugerido', 'precioAprobado', 'presupuestoMontoPropuesto'] as const) {
      if (actual[campo] !== orden[campo]) throw new Error('El presupuesto cambió. Revisa los datos actualizados.');
    }
    validarAccionPresupuesto(actual, accion, monto);
    if (accion === 'proponer' && (args.motivo || '').trim().length < 5) throw new Error('Explica el motivo del cambio (mínimo 5 caracteres).');
    const ahora = Timestamp.now();
    const fase = accion === 'aceptar' ? 'aprobado' : 'en_cotizacion';
    const nota = accion === 'aprobar' ? `Presupuesto aprobado por oficina: RD$${monto}. Pendiente de aceptación del cliente. ${args.detalleDescuento || ''}` : accion === 'aceptar' ? `Oficina registró aceptación del cliente por RD$${monto}. Técnico autorizado.` : `Solicitud de cambio a RD$${monto}: ${args.motivo?.trim()}`;
    const campos = accion === 'aprobar' ? {
      ...args.camposDescuento, precioAprobado: monto, precioFinal: monto,
      estadoAprobacion: 'pendiente', presupuestoEstado: 'pendiente_cliente', aprobadoPor: usuario.nombre, fechaAprobacion: ahora,
    } : accion === 'aceptar' ? {
      estadoAprobacion: 'aprobado', presupuestoEstado: 'aceptado',
      presupuestoAceptadoPor: uid, presupuestoAceptadoEn: ahora,
    } : {
      estadoAprobacion: 'pendiente', presupuestoEstado: 'cambio_solicitado', presupuestoMontoPropuesto: monto, presupuestoCambioMotivo: args.motivo!.trim(),
    };
    tx.update(ref, {
      ...campos, fase, estadoSimple: 'pendiente', estado: 'activo', updatedAt: ahora,
      historialFases: [...(actual.historialFases || []).map(h => ({fase: h.fase, timestamp: Timestamp.fromDate(h.timestamp), usuario: h.usuario || '', ...(h.nota ? {nota: h.nota} : {})})), {fase, timestamp: ahora, usuario: usuario.nombre, nota}],
      auditoria: arrayUnion(crearRegistroAuditoria(usuario.nombre, 'precio_sugerido', nota, 'precioAprobado', String(actual.precioAprobado ?? ''), String(monto))),
    });
  });
  // Un fallo del aviso no revierte una aceptación ya persistida ni invita a duplicarla.
  try {
    const staff = (await getDocs(collection(db, 'personal'))).docs.map(d => ({id: d.id, ...d.data()} as Personal));
    const destinos = new Set(staff.filter(p => p.activo && ['administrador', 'coordinadora'].includes(p.rol)).map(p => p.uid).filter((id): id is string => !!id));
    for (const responsableId of [orden.operariaId, orden.responsableId]) {
      const responsable = staff.find(p => p.id === responsableId || p.uid === responsableId);
      if (responsable?.activo && responsable.uid) destinos.add(responsable.uid);
    }
    if (accion === 'aceptar') {
      const tecnico = staff.find(p => p.id === orden.tecnicoId || p.uid === orden.tecnicoId);
      if (tecnico?.uid) destinos.add(tecnico.uid);
    }
    destinos.delete(uid);
    await Promise.all([...destinos].map(userId => crearNotificacion({
      userId, tipo: 'precio_aprobado', ordenId: orden.id, ordenNumero: orden.numero,
      titulo: accion === 'aceptar' ? 'Cliente aceptó · reparación autorizada' : accion === 'aprobar' ? 'Presupuesto listo para contactar al cliente' : 'Cambio de presupuesto pendiente',
      mensaje: `${orden.clienteNombre}: RD$${monto.toLocaleString('es-DO')}, piezas incluidas. ${accion === 'aceptar' ? 'El técnico puede proceder.' : 'Pendiente de gestión de oficina.'}`,
    })));
  } catch (error) { console.error('No se completaron los avisos del presupuesto:', error); }
}
