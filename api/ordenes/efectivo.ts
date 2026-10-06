import { leerComisionRetenida, liberarComisionPorCobro } from '../_lib/comisionCobro.js';
import { POLITICA_COBRO_COMISION } from '../../src/utils/comisionCobro.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Timestamp } from 'firebase-admin/firestore';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { mapaEfectivo, prepararAceptacionEfectivo, prepararEntregaEfectivo, pagoEfectivoActual, puedeRecibirEfectivo } from '../../src/utils/efectivoResponsabilidad.js';
import { incidenciasPago } from '../../src/utils/pagosConciliacion.js';
const idValido = (v: unknown): v is string => typeof v === 'string' && /^[\w.-]{1,160}$/.test(v);
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const { db, uid } = await accesoEquipo(req);
    let body: Record<string, unknown>;
    try { body = mapaEfectivo(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); }
    catch { throw new ErrorAcceso(400, 'Solicitud inválida'); }
    const accion = body.accion;
    if (!['aceptar', 'recibir', 'entregar_lote', 'verificar', 'registrar'].includes(String(accion))) throw new ErrorAcceso(400, 'Acción inválida');
    const items = accion === 'entregar_lote' && Array.isArray(body.movimientos) ? body.movimientos.map(mapaEfectivo) : [body];
    if (!items.length || items.length > 200 || items.some(i => !idValido(i.ordenId) || !idValido(i.pagoId))) throw new ErrorAcceso(400, 'Pagos inválidos');
    const ids = [...new Set(items.map(i => String(i.ordenId)))];
    const result = await db.runTransaction(async tx => {
      const perfilSnap = await tx.get(db.doc(`usuarios/${uid}`));
      const perfil = perfilSnap.data();
      if (!perfil || perfil.activo === false || perfil.eliminado === true) throw new ErrorAcceso(403, 'Usuario inactivo');
      const actor = { uid, nombre: String(perfil.nombre || ''), rol: String(perfil.rol), activo: true };
      const refs = ids.map(id => db.doc(`ordenes_servicio/${id}`));
      const snaps = await Promise.all(refs.map(ref => tx.get(ref)));
      const configEquipos = ['operaria', 'secretaria'].includes(actor.rol) ? (await tx.get(db.doc('bot_servicio_config/sistema'))).data() : null;
      // Leer antes de escribir: conservar la notificación original, incluso si ya fue leída.
      const avisoRef = accion === 'registrar' && body.metodo === 'efectivo'
        ? db.doc(`notificaciones/efectivo-${String(body.ordenId)}-${String(body.pagoId)}`) : null;
      const avisoExiste = avisoRef ? (await tx.get(avisoRef)).exists : false;
      const comisiones = ['registrar', 'verificar'].includes(String(accion))
        ? new Map(await Promise.all(ids.map(async id => [id, await leerComisionRetenida(tx, db, id)] as const))) : new Map();
      const ordenesFinales = new Map<string, Record<string, unknown>>();
      const ahora = Timestamp.now();
      const cambios: { ref: typeof refs[number]; datos: Record<string, unknown> }[] = [];
      for (const snap of snaps) {
        if (!snap.exists || snap.data()?.eliminada === true) throw new ErrorAcceso(404, 'Orden no disponible');
        let orden = snap.data()!;
        const equipos = Array.isArray(configEquipos?.equipos) ? configEquipos.equipos.map(mapaEfectivo) : [];
        const equipo = equipos.find(e => e.operariaUid === orden.operariaId && [e.operariaUid, e.secretariaUid].includes(uid));
        if (equipo && actor.rol === 'secretaria') orden = { ...orden, secretariaId: uid };
        const datos: Record<string, unknown> = {};
        for (const item of items.filter(i => i.ordenId === snap.id)) {
          const pagoId = String(item.pagoId);
          if (accion === 'registrar') {
            const permiso = perfil.permisosPersonalizados === true ? perfil.permisosSistema?.pagosRegistrar === true : ['administrador', 'coordinadora', 'operaria', 'secretaria'].includes(actor.rol);
            if (!permiso) throw new ErrorAcceso(403, 'Sin permiso para registrar pagos');
            if (orden.crmGestion === true) throw new ErrorAcceso(409, 'Registra el pago desde la gestión CRM de esta orden');
            if (orden.chequeoConfirmacionEstado === 'pendiente') throw new ErrorAcceso(409, 'Confirma con el cliente el servicio de solo chequeo antes de registrar el pago');
            if (!puedeRecibirEfectivo(actor, orden)) throw new ErrorAcceso(403, 'Esta orden no pertenece a tu equipo');
            const pagos = Array.isArray(orden.pagos) ? orden.pagos.map(mapaEfectivo) : [];
            const previo = pagos.find(p => p.id === pagoId);
            const monto = item.monto;
            if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0 || !['efectivo', 'transferencia', 'tarjeta'].includes(String(item.metodo))) throw new ErrorAcceso(400, 'Pago inválido');
            if (previo) {
              if (previo.monto !== monto || previo.metodo !== item.metodo) throw new ErrorAcceso(409, 'Identificador de pago reutilizado con datos diferentes');
              continue;
            }
            const total = Number(orden.soloChequeo ? orden.precioChequeo ?? orden.precioFinal ?? 0 : orden.precioFinal ?? orden.precioAprobado ?? orden.precioSugerido ?? 0);
            const pagadoPrevio = pagos.reduce((sum, p) => sum + Math.round(Number(p.monto || 0) * 100), 0);
            // Firestore reintenta la transacción si otro cobro cambia la orden: validar el saldo fresco.
            if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(pagadoPrevio)) throw new ErrorAcceso(409, 'Revisa el importe de la orden antes de registrar el pago');
            if (pagadoPrevio + Math.round(monto * 100) > Math.round(total * 100)) throw new ErrorAcceso(409, 'El pago supera el saldo pendiente. Actualiza la orden y revisa los pagos registrados');
            const pago: Record<string, unknown> = { id: pagoId, monto, metodo: item.metodo, fecha: ahora, registradoPorId: uid, registradoPorNombre: actor.nombre, verificado: false };
            if (item.metodo === 'efectivo') {
              if (!idValido(orden.tecnicoId)) throw new ErrorAcceso(409, 'Asigna el técnico receptor antes de registrar efectivo');
              datos.flujoEfectivo = 'confirmacion_tecnico';
              Object.assign(pago, { recibidoPorId: orden.tecnicoId, recibidoPorNombre: String(orden.tecnicoNombre || 'Técnico'), requiereAceptacionEfectivo: true });
            } else {
              if (item.metodo === 'transferencia' && !idValido(item.bancoId)) throw new ErrorAcceso(400, 'Selecciona el banco destino');
              if (idValido(item.bancoId)) {
                const banco = await tx.get(db.doc(`bancos/${item.bancoId}`));
                if (!banco.exists || banco.data()?.activo === false) throw new ErrorAcceso(400, 'Banco no disponible');
                Object.assign(pago, { bancoId: item.bancoId, bancoNombre: String(banco.data()?.nombre || '') });
              }
              if (typeof item.referencia === 'string') pago.referencia = item.referencia.trim().slice(0, 200);
            }
            if (typeof item.notas === 'string') pago.notas = item.notas.trim().slice(0, 3000);
            const nuevos = [...pagos, pago];
            const pagado = (pagadoPrevio + Math.round(monto * 100)) / 100;
            Object.assign(datos, { pagos: nuevos, montoPagado: pagado, estadoPago: total > 0 && pagado >= total ? 'completo' : pagado > 0 ? 'parcial' : 'pendiente' });
          } else if (accion === 'verificar') {
            const permiso = perfil.permisosPersonalizados === true ? perfil.permisosSistema?.pagosVerificar === true : ['administrador', 'coordinadora'].includes(actor.rol);
            if (!permiso) return { ok: false, razon: 'sin_permiso' };
            const pagos = Array.isArray(orden.pagos) ? orden.pagos.map(mapaEfectivo) : [];
            const index = pagos.findIndex(p => p.id === pagoId);
            if (index < 0) return { ok: false, razon: 'pago_no_existe' };
            if (pagos[index].verificado === true) return { ok: false, razon: 'ya_confirmado' };
            if (incidenciasPago(pagos[index], pagos).length) return { ok: false, razon: 'requiere_conciliacion' };
            pagos[index] = { ...pagos[index], verificado: true, verificadoPorId: uid, verificadoPorNombre: actor.nombre, verificadoAt: ahora };
            datos.pagos = pagos;
          } else {
            const monto = item.monto;
            if (typeof monto !== 'number') throw new ErrorAcceso(400, 'Monto inválido');
            if (accion === 'entregar_lote') {
              const permiso = perfil.permisosPersonalizados === true ? perfil.permisosSistema?.cierreDiaEjecutar === true : ['administrador', 'coordinadora'].includes(actor.rol);
              if (!permiso) throw new ErrorAcceso(403, 'Sin permiso para cierre de caja');
              const pago = pagoEfectivoActual(orden, pagoId, monto);
              if (pago.verificado !== true) throw new ErrorAcceso(409, 'Verifica primero el pago');
              if (pago.requiereAceptacionEfectivo !== true) {
                const entregas = mapaEfectivo(orden.efectivoEntregas);
                if (orden.efectivoEntregado === true && !Object.keys(entregas).length) throw new ErrorAcceso(409, 'Entrega histórica sin detalle: requiere conciliación');
                if (entregas[pagoId] && mapaEfectivo(entregas[pagoId]).monto !== monto) throw new ErrorAcceso(409, 'Importe entregado distinto: requiere conciliación');
                if (!entregas[pagoId]) datos.efectivoEntregas = { ...entregas, [pagoId]: { monto, entregadoEn: ahora, entregadoPor: uid, entregadoPorNombre: actor.nombre } };
              } else {
                const mapa = prepararEntregaEfectivo(orden, pagoId, monto, actor, ahora);
                if (mapa) datos.efectivoEntregas = mapa;
              }
            } else {
              const mapa = accion === 'aceptar' ? prepararAceptacionEfectivo(orden, pagoId, monto, actor, ahora) : prepararEntregaEfectivo(orden, pagoId, monto, actor, ahora);
              if (mapa) datos[accion === 'aceptar' ? 'efectivoAceptaciones' : 'efectivoEntregas'] = mapa;
            }
          }
          // Mantener el espejo CRM de rendición sin sumar un segundo cobro.
          if (datos.efectivoEntregas && Array.isArray(orden.pagos)) {
            const entregas = mapaEfectivo(datos.efectivoEntregas);
            datos.pagos = orden.pagos.map((raw: unknown) => {
              const pago = mapaEfectivo(raw);
              return pago.crm === true && entregas[String(pago.id)] ? { ...pago, entregadoOficina: mapaEfectivo(entregas[String(pago.id)]).monto } : pago;
            });
          }
          orden = { ...orden, ...datos };
        }
        ordenesFinales.set(snap.id, orden);
        if (Object.keys(datos).length) cambios.push({ ref: snap.ref, datos });
      }
      const comisionesLiberadas = new Set<string>();
      for (const [id, comision] of comisiones) {
        if (liberarComisionPorCobro(tx, comision, ordenesFinales.get(id)!, ahora, POLITICA_COBRO_COMISION)) comisionesLiberadas.add(id);
      }
      for (const cambio of cambios) {
        tx.update(cambio.ref, { ...cambio.datos, updatedAt: ahora });
        if (avisoRef && !avisoExiste && Array.isArray(cambio.datos.pagos)) {
          const pago = cambio.datos.pagos.map(mapaEfectivo).find(p => p.id === body.pagoId)!;
          tx.create(avisoRef, { userId: pago.recibidoPorId, destinatarioNombre: pago.recibidoPorNombre, tipo: 'pago_registrado', titulo: 'Confirma el efectivo recibido', mensaje: `Oficina registró RD$${pago.monto} en efectivo. Confirma en la orden si recibiste ese importe del cliente.`, ordenId: cambio.ref.id, leida: false, createdAt: ahora });
        }
        tx.create(db.collection('auditoria_admin').doc(), { accion: `efectivo.${accion}`, comisionLiberada: comisionesLiberadas.has(cambio.ref.id), ordenId: cambio.ref.id, actorUid: uid, actorNombre: actor.nombre, ts: ahora, pagos: items.filter(i => i.ordenId === cambio.ref.id).map(i => ({ pagoId: i.pagoId, ...(typeof i.monto === 'number' ? { monto: i.monto } : {}) })) });
      }
      const final = accion === 'registrar' ? cambios[0]?.datos : undefined;
      const pagoNuevo = Array.isArray(final?.pagos) ? final.pagos.map(mapaEfectivo).find(p => p.id === body.pagoId) : undefined;
      return { ok: true, modificado: cambios.length > 0, duplicado: cambios.length === 0, ...(final ? { nuevoMontoPagado: final.montoPagado, receptorUid: pagoNuevo?.recibidoPorId || '', receptorNombre: pagoNuevo?.recibidoPorNombre || '' } : {}) };
    });
    return res.json(result);
  } catch (error) {
    return res.status(error instanceof ErrorAcceso ? error.status : 409).json({ error: error instanceof Error ? error.message : 'No se pudo registrar el efectivo' });
  }
}
