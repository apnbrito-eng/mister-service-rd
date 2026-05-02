import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore, verificarAppCheck } from '../../_lib/firebaseAdmin.js';

/**
 * Endpoint público (sin auth) para que el cliente proponga una nueva fecha de
 * cita desde el Portal del Cliente (`/cliente/:token`). Crea una entrada en
 * `OrdenServicio.propuestasReprogramacion[]` con `estado: 'pendiente'` y
 * dispara fan-out de notificaciones a admin/coord activos.
 *
 *   POST  /api/portal-cliente/[token]/posponer
 *   body: { fechaNuevaPropuesta: ISO8601, motivo?: string }
 *
 * Respuestas:
 *   - 200: `{ ok: true, propuestaId }`
 *   - 400: validación falló (`token_invalido`, `fecha_invalida`,
 *          `motivo_largo`, `fecha_pasada_o_muy_proxima`, `fecha_muy_lejana`,
 *          `fecha_domingo`, `orden_sin_fecha_agendada`)
 *   - 404: orden no encontrada
 *   - 405: método no permitido
 *   - 409: fase no admite reprogramación (sin uso interno hoy — reservado)
 *   - 410: orden cancelada o cerrada (`no_reprogramable`)
 *   - 429: rate limit (`limite_propuestas`)
 *   - 500: error interno
 *
 * Convenciones del proyecto:
 *  - Token NUNCA se loguea ni se incluye en mensajes de error al cliente.
 *  - Strip undefined antes de cualquier write a Firestore (incl. arrayUnion).
 *  - Cache-Control: no-store.
 *  - Búsqueda por `tokenPortalCliente` con fallback compat a `trackingGPS.token`.
 *
 * Concurrencia: el chequeo de fase + rate limit + append usa
 * `db.runTransaction` para evitar TOCTOU (un cliente adversarial mandando
 * N requests en paralelo no puede saltarse el cap de 3 propuestas pendientes).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { token } = req.query;
  if (typeof token !== 'string' || token.length < 16) {
    return res.status(400).json({ error: 'token_invalido' });
  }

  // Audit C3 fase A: soft enforcement. Loggeamos resultado pero NO bloqueamos.
  const appCheckResult = await verificarAppCheck(req);
  console.log(JSON.stringify({
    endpoint: 'portal-cliente/posponer',
    app_check: appCheckResult,
    token_orden: token.substring(0, 8) + '...',
  }));

  // ─── Body parsing y validaciones de forma ───
  const body = (req.body ?? {}) as {
    fechaNuevaPropuesta?: unknown;
    motivo?: unknown;
  };

  const fechaRaw = body.fechaNuevaPropuesta;
  if (typeof fechaRaw !== 'string' || fechaRaw.length === 0) {
    return res.status(400).json({ error: 'fecha_invalida' });
  }
  const fechaNueva = new Date(fechaRaw);
  if (isNaN(fechaNueva.getTime())) {
    return res.status(400).json({ error: 'fecha_invalida' });
  }

  const motivoStr = typeof body.motivo === 'string' ? body.motivo : '';
  if (motivoStr.length > 500) {
    return res.status(400).json({ error: 'motivo_largo' });
  }

  // ─── Validaciones de calendario en zona Dominicana ───
  // RD = UTC-4 sin DST. Calculamos comparativos sobre el "instante" UTC pero
  // chequeamos día de la semana y rango con offset RD aplicado.
  const RD_OFFSET_MS = -4 * 60 * 60 * 1000; // -4h
  const ahoraUtcMs = Date.now();
  // "Hoy" en RD = floor del momento actual desplazado a RD a la medianoche RD.
  const ahoraRd = new Date(ahoraUtcMs + RD_OFFSET_MS);
  const hoyRdYear = ahoraRd.getUTCFullYear();
  const hoyRdMonth = ahoraRd.getUTCMonth();
  const hoyRdDay = ahoraRd.getUTCDate();
  // Medianoche de hoy en RD expresada como instante UTC (00:00 RD = 04:00 UTC)
  const hoyRdMidnightUtcMs =
    Date.UTC(hoyRdYear, hoyRdMonth, hoyRdDay, 0, 0, 0, 0) - RD_OFFSET_MS;
  // Mínimo permitido: hoy + 1 día (medianoche RD del día siguiente)
  const minPermitidoMs = hoyRdMidnightUtcMs + 24 * 60 * 60 * 1000;
  // Máximo permitido: hoy + 60 días (medianoche RD)
  const maxPermitidoMs = hoyRdMidnightUtcMs + 60 * 24 * 60 * 60 * 1000;

  const fechaNuevaMs = fechaNueva.getTime();
  if (fechaNuevaMs < minPermitidoMs) {
    return res.status(400).json({
      error: 'fecha_pasada_o_muy_proxima',
      mensaje: 'La fecha debe ser al menos un día después de hoy.',
    });
  }
  if (fechaNuevaMs > maxPermitidoMs) {
    return res.status(400).json({
      error: 'fecha_muy_lejana',
      mensaje: 'La fecha no puede ser más de 60 días en el futuro.',
    });
  }

  // Día de la semana en zona RD: tomamos el instante propuesto, aplicamos
  // offset RD y leemos el día UTC del Date desplazado.
  const fechaNuevaRd = new Date(fechaNuevaMs + RD_OFFSET_MS);
  const diaSemanaRd = fechaNuevaRd.getUTCDay(); // 0 = domingo
  if (diaSemanaRd === 0) {
    return res.status(400).json({
      error: 'fecha_domingo',
      mensaje: 'No atendemos domingos. Elegí otro día.',
    });
  }

  // ─── Conexión a Firestore Admin ───
  let db: ReturnType<typeof getAdminFirestore>;
  try {
    db = getAdminFirestore();
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({ error: `Error inicializando Firebase Admin: ${m}` });
  }

  // 1) Buscar la orden por tokenPortalCliente; fallback compat a trackingGPS.token
  //    (afuera de la transacción — sólo para encontrar el doc ID)
  let ordenId: string;
  let ordenNumeroParaNotif: string = '';
  let clienteNombreParaNotif: string = 'Cliente';
  try {
    let snap = await db
      .collection('ordenes_servicio')
      .where('tokenPortalCliente', '==', token)
      .limit(1)
      .get();
    if (snap.empty) {
      snap = await db
        .collection('ordenes_servicio')
        .where('trackingGPS.token', '==', token)
        .limit(1)
        .get();
    }
    if (snap.empty) {
      return res.status(404).json({ error: 'orden_no_encontrada' });
    }
    ordenId = snap.docs[0].id;
    const ordenData = snap.docs[0].data();
    if (typeof ordenData.numero === 'string') ordenNumeroParaNotif = ordenData.numero;
    if (typeof ordenData.clienteNombre === 'string' && ordenData.clienteNombre.length > 0) {
      clienteNombreParaNotif = ordenData.clienteNombre;
    }
  } catch (err) {
    console.error('[portal-cliente][posponer] error buscando orden:', err);
    const m = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({ error: `Error: ${m.substring(0, 300)}` });
  }

  const ordenRef = db.collection('ordenes_servicio').doc(ordenId);

  // ─── Construir la propuesta (UUID estable antes de la tx; los reintentos
  //    dentro de runTransaction reusan el mismo id y arrayUnion deduplica
  //    si por algún motivo se ejecuta dos veces el callback) ───
  const propuestaId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  // 2) Transacción: re-leer orden, validar fase + fechaCita + rate limit, append.
  //    Mapeamos errores del callback a HTTP status afuera.
  try {
    await db.runTransaction(async (tx) => {
      const ordenSnap = await tx.get(ordenRef);
      if (!ordenSnap.exists) {
        throw new Error('TX_NOT_FOUND');
      }
      const ordenData = ordenSnap.data() as Record<string, unknown>;
      const fase = typeof ordenData.fase === 'string' ? ordenData.fase : '';

      // 2a) Fase no reprogramable
      if (fase === 'cancelado' || fase === 'cerrado') {
        throw new Error('TX_NOT_REPROGRAMABLE');
      }

      // 2b) Validación: orden debe tener `fechaCita` agendada. Si no la tiene,
      //     la propuesta sería filtrada por `parseOrden` en el panel admin
      //     y quedaría huérfana. Bloqueamos antes.
      const fechaCitaActual = ordenData.fechaCita;
      const tieneFecha =
        fechaCitaActual instanceof Timestamp ||
        fechaCitaActual instanceof Date ||
        // Fallback defensivo: doc serializado con `_seconds` por algún path raro
        (fechaCitaActual !== null &&
          fechaCitaActual !== undefined &&
          typeof fechaCitaActual === 'object');
      if (!tieneFecha) {
        throw new Error('TX_NO_FECHA');
      }

      // 2c) Rate limit: max 3 propuestas pendientes DEL CLIENTE.
      //     Las contrapropuestas del admin no cuentan en el cap del cliente.
      const propuestasRaw = Array.isArray(ordenData.propuestasReprogramacion)
        ? (ordenData.propuestasReprogramacion as Array<Record<string, unknown>>)
        : [];
      const pendientesCliente = propuestasRaw.filter(
        p => p.estado === 'pendiente' && p.propuestaPor === 'cliente',
      ).length;
      if (pendientesCliente >= 3) {
        throw new Error('TX_RATE_LIMIT');
      }

      // 2d) Construir y appendear la propuesta DENTRO de la tx
      const propuestaPayload: Record<string, unknown> = {
        id: propuestaId,
        propuestaPor: 'cliente',
        fechaPropuesta: Timestamp.now(),
        fechaActualOrden: fechaCitaActual,
        fechaNuevaPropuesta: Timestamp.fromDate(fechaNueva),
        motivo: motivoStr.slice(0, 500),
        estado: 'pendiente',
      };
      // Strip undefined defensivo (Firestore rechaza undefined dentro de arrays
      // pasados por arrayUnion).
      const propuestaLimpia = Object.fromEntries(
        Object.entries(propuestaPayload).filter(([, v]) => v !== undefined),
      );

      tx.update(ordenRef, {
        propuestasReprogramacion: FieldValue.arrayUnion(propuestaLimpia),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'TX_NOT_FOUND') {
      return res.status(404).json({ error: 'orden_no_encontrada' });
    }
    if (code === 'TX_NOT_REPROGRAMABLE') {
      return res.status(410).json({
        error: 'no_reprogramable',
        mensaje: 'Esta cita ya no se puede reprogramar.',
      });
    }
    if (code === 'TX_NO_FECHA') {
      return res.status(400).json({
        error: 'orden_sin_fecha_agendada',
        mensaje: 'Esta orden todavía no está agendada. No se puede reprogramar.',
      });
    }
    if (code === 'TX_RATE_LIMIT') {
      return res.status(429).json({
        error: 'limite_propuestas',
        mensaje: 'Has enviado muchas propuestas. Esperá la respuesta antes de enviar más.',
      });
    }
    console.error('[portal-cliente][posponer] tx error:', err);
    const m = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({ error: `Error: ${m.substring(0, 300)}` });
  }

  // 3) Fan-out de notificaciones a admin/coord activos (best-effort,
  //    fuera de la tx — no bloqueamos respuesta si fallan)
  try {
    const personalSnap = await db
      .collection('personal')
      .where('rol', 'in', ['administrador', 'coordinadora'])
      .where('activo', '==', true)
      .get();

    const ahora = FieldValue.serverTimestamp();

    const tareas: Promise<unknown>[] = [];
    for (const p of personalSnap.docs) {
      const pData = p.data() as Record<string, unknown>;
      // destinatarioId: preferimos uid (Firebase Auth) — si no, doc id de personal
      const destinatarioId =
        typeof pData.uid === 'string' && pData.uid.length > 0 ? pData.uid : p.id;
      const notif: Record<string, unknown> = {
        destinatarioId,
        tipo: 'reprogramacion_solicitada',
        titulo: 'Cliente pide reprogramar cita',
        mensaje: `${clienteNombreParaNotif} pidió posponer la orden ${ordenNumeroParaNotif || ordenId}.`,
        ordenId,
        leida: false,
        createdAt: ahora,
      };
      if (typeof pData.nombre === 'string' && pData.nombre.length > 0) {
        notif.destinatarioNombre = pData.nombre;
      }
      if (ordenNumeroParaNotif) notif.ordenNumero = ordenNumeroParaNotif;

      const limpio = Object.fromEntries(
        Object.entries(notif).filter(([, v]) => v !== undefined),
      );
      tareas.push(db.collection('notificaciones').add(limpio));
    }
    // Best-effort: usar allSettled para que un fallo individual no aborte
    await Promise.allSettled(tareas);
  } catch (notifErr) {
    console.warn('[portal-cliente][posponer] notifs fan-out fallaron:', notifErr);
  }

  // Loggear sin exponer el token
  console.log('[portal-cliente][posponer] propuesta creada', {
    ordenId,
    propuestaId,
  });

  return res.status(200).json({ ok: true, propuestaId });
}
