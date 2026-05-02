import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminFirestore, verificarAppCheck } from '../_lib/firebaseAdmin.js';

/**
 * Endpoint público (sin auth) que sirve datos de la orden al Portal del
 * Cliente (`/cliente/:token`). Usa Firebase Admin SDK (bypassa rules) para
 * leer la colección `ordenes_servicio` y devuelve **un subset whitelisted**
 * de campos. Nunca expone datos internos (costos, márgenes, notas, auditoría,
 * tecnicoId/uid, raw historial, etc.).
 *
 *   GET   /api/portal-cliente/[token]
 *
 * Búsqueda:
 *   1. `tokenPortalCliente == token` (preferido).
 *   2. Fallback compat: `trackingGPS.token == token` (links viejos siguen
 *      funcionando — el portal es el sucesor de `/tracking/:token`).
 *
 * Respuestas:
 *   - 400: token con forma inválida (no string o length < 16).
 *   - 404: ninguna orden encontrada con ese token.
 *   - 410: orden cancelada (la cita ya no aplica).
 *   - 200: datos públicos de la orden (ver shape al final del archivo).
 *
 * Convenciones:
 *  - `Cache-Control: no-store` — el portal hace polling, no queremos cache.
 *  - El token NUNCA se incluye en logs ni en el body de respuesta de error
 *    (más allá del eco del request, el server no debe exponerlo a terceros).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Cache off siempre — datos en vivo
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { token } = req.query;
  if (typeof token !== 'string' || token.length < 16) {
    return res.status(400).json({ error: 'token_invalido' });
  }

  // Audit C3 fase A: soft enforcement. Loggeamos resultado pero NO bloqueamos.
  const appCheckResult = await verificarAppCheck(req);
  console.log(JSON.stringify({
    endpoint: 'portal-cliente',
    app_check: appCheckResult,
    token_orden: token.substring(0, 8) + '...',
  }));

  let db: ReturnType<typeof getAdminFirestore>;
  try {
    db = getAdminFirestore();
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({ error: `Error inicializando Firebase Admin: ${m}` });
  }

  try {
    // 1) Buscar por tokenPortalCliente
    let snap = await db
      .collection('ordenes_servicio')
      .where('tokenPortalCliente', '==', token)
      .limit(1)
      .get();

    // 2) Fallback compat: aceptar el token GPS legacy
    if (snap.empty) {
      snap = await db
        .collection('ordenes_servicio')
        .where('trackingGPS.token', '==', token)
        .limit(1)
        .get();
    }

    if (snap.empty) {
      return res.status(404).json({ error: 'no_encontrada' });
    }

    const ordenDoc = snap.docs[0];
    const orden = ordenDoc.data() as Record<string, unknown>;
    const fase = typeof orden.fase === 'string' ? orden.fase : '';

    // Cita cancelada — bloquear (410 Gone es semánticamente correcto)
    if (fase === 'cancelado') {
      return res.status(410).json({
        error: 'cancelada',
        mensaje: 'Esta cita fue cancelada. Contáctanos por WhatsApp si necesitas ayuda.',
      });
    }

    // ───── Foto del técnico (lectura defensiva del doc personal) ─────
    // Decisión del sprint: leer `personal/{tecnicoId}.fotoUrl` en runtime,
    // no denormalizar a la orden. Si no hay tecnicoId o no hay foto, null.
    let tecnicoFotoUrl: string | null = null;
    const tecnicoId = typeof orden.tecnicoId === 'string' && orden.tecnicoId.length > 0
      ? orden.tecnicoId
      : null;
    if (tecnicoId) {
      try {
        const personalSnap = await db.collection('personal').doc(tecnicoId).get();
        if (personalSnap.exists) {
          const pData = personalSnap.data() as Record<string, unknown>;
          if (typeof pData.fotoUrl === 'string' && pData.fotoUrl.length > 0) {
            tecnicoFotoUrl = pData.fotoUrl;
          }
        }
      } catch (lookupErr) {
        // Si falla, no bloqueamos el portal — sólo no mostramos foto.
        // Loggeamos sin incluir el token.
        console.warn('[portal-cliente] error leyendo foto técnico:', lookupErr);
      }
    }

    // ───── Tracking GPS — sólo exponer lo público ─────
    const trackingRaw = orden.trackingGPS as Record<string, unknown> | undefined;
    let tracking: {
      activo: boolean;
      token: string | null;
      vehiculoId: string | null;
      expiresAt: string | null;
    } | null = null;
    if (trackingRaw) {
      tracking = {
        activo: trackingRaw.habilitado === true,
        token: typeof trackingRaw.token === 'string' ? trackingRaw.token : null,
        vehiculoId: typeof trackingRaw.vehiculoId === 'string' ? trackingRaw.vehiculoId : null,
        expiresAt: serializeFecha(trackingRaw.expiresAt),
      };
    }

    // ───── Propuesta reprogramación pendiente (sin internals) ─────
    const propuestasRaw = Array.isArray(orden.propuestasReprogramacion)
      ? (orden.propuestasReprogramacion as Array<Record<string, unknown>>)
      : [];
    const pendientes = propuestasRaw.filter(p => p.estado === 'pendiente');
    pendientes.sort((a, b) => {
      const ta = toDate(a.fechaPropuesta)?.getTime() ?? 0;
      const tb = toDate(b.fechaPropuesta)?.getTime() ?? 0;
      return tb - ta;
    });
    const pendiente = pendientes[0];
    let propuestaReprogramacionPendiente: {
      id: string;
      fechaActualOrden: string | null;
      fechaNuevaPropuesta: string | null;
      motivo: string;
      fechaPropuesta: string | null;
    } | null = null;
    if (pendiente) {
      propuestaReprogramacionPendiente = {
        id: typeof pendiente.id === 'string' ? pendiente.id : '',
        fechaActualOrden: serializeFecha(pendiente.fechaActualOrden),
        fechaNuevaPropuesta: serializeFecha(pendiente.fechaNuevaPropuesta),
        motivo: typeof pendiente.motivo === 'string' ? pendiente.motivo : '',
        fechaPropuesta: serializeFecha(pendiente.fechaPropuesta),
      };
    }

    // ───── Historial filtrado para cliente ─────
    const historialFasesRaw = Array.isArray(orden.historialFases)
      ? (orden.historialFases as Array<Record<string, unknown>>)
      : [];
    const historial = filtrarHistorialPublico(historialFasesRaw);

    // ───── Cierre — sólo cuando fase === 'cerrado' ─────
    let cierre: {
      fechaCierre: string | null;
      garantiaFin: string | null;
      conduceGenerado: boolean;
    } | null = null;
    if (fase === 'cerrado') {
      const cs = orden.cierreServicio as Record<string, unknown> | undefined;
      const fechaCierre = serializeFecha(cs?.fechaCierre);
      // Si el conduce ya se emitió, la factura tiene el campo `garantia.finFecha`.
      // No re-leemos `facturas` para reducir lecturas en el portal: si la orden
      // tiene `facturaId` la factura ya existe, y para fecha fin pedimos al
      // endpoint de garantía dedicado. Dejamos `garantiaFin` null acá si no
      // está accesible (el frontend muestra el botón de descargar conduce y el
      // cliente lo verá del propio conduce).
      cierre = {
        fechaCierre,
        garantiaFin: null,
        conduceGenerado: typeof orden.facturaNumero === 'string' && orden.facturaNumero.length > 0,
      };
      // Best-effort: leer la factura si existe para mostrar fecha fin garantía.
      const facturaId = typeof orden.facturaId === 'string' && orden.facturaId.length > 0
        ? orden.facturaId
        : null;
      if (facturaId) {
        try {
          const facSnap = await db.collection('facturas').doc(facturaId).get();
          if (facSnap.exists) {
            const facData = facSnap.data() as Record<string, unknown>;
            const garantia = facData.garantia as Record<string, unknown> | undefined;
            if (garantia) {
              cierre.garantiaFin = serializeFecha(garantia.finFecha);
            }
          }
        } catch (facErr) {
          console.warn('[portal-cliente] error leyendo factura para garantía:', facErr);
        }
      }
    }

    return res.status(200).json({
      numero: typeof orden.numero === 'string' ? orden.numero : '',
      estado: fase,
      cliente: {
        nombre: typeof orden.clienteNombre === 'string' ? orden.clienteNombre : '',
        telefono: typeof orden.clienteTelefono === 'string' ? orden.clienteTelefono : '',
      },
      servicio: {
        equipoTipo: typeof orden.equipoTipo === 'string' ? orden.equipoTipo : '',
        marca: typeof orden.equipoMarca === 'string' ? orden.equipoMarca : '',
        modelo: typeof orden.equipoModelo === 'string' ? orden.equipoModelo : '',
        descripcionFalla: typeof orden.descripcionFalla === 'string' ? orden.descripcionFalla : '',
      },
      cita: {
        fecha: serializeFecha(orden.fechaCita),
        hora: typeof orden.horaCita === 'string' ? orden.horaCita : null,
        tecnicoNombre: typeof orden.tecnicoNombre === 'string' ? orden.tecnicoNombre : '',
        tecnicoFotoUrl,
      },
      tracking,
      propuestaReprogramacionPendiente,
      historial,
      cierre,
    });
  } catch (err) {
    console.error('[portal-cliente] error:', err);
    const m = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({ error: `Error: ${m.substring(0, 300)}` });
  }
}

/**
 * Eventos de fase considerados públicos para el cliente. Otros eventos
 * (notas internas, retrocesos, asignaciones admin) NO se exponen.
 */
const FASES_PUBLICAS_CLIENTE = new Set<string>([
  'nuevo_lead',
  'en_gestion',
  'agendado',
  'en_diagnostico',
  'en_cotizacion',
  'aprobado',
  'trabajo_realizado',
  'cerrado',
]);

/**
 * Mapea una entrada `historialFases[]` cruda al shape que ve el cliente.
 * Filtra fases internas y omite el campo `nota` (puede contener detalles
 * que no son para el cliente).
 */
function filtrarHistorialPublico(
  historialRaw: Array<Record<string, unknown>>,
): Array<{ fase: string; timestamp: string | null }> {
  const out: Array<{ fase: string; timestamp: string | null }> = [];
  for (const h of historialRaw) {
    const fase = typeof h.fase === 'string' ? h.fase : '';
    if (!FASES_PUBLICAS_CLIENTE.has(fase)) continue;
    out.push({
      fase,
      timestamp: serializeFecha(h.timestamp),
    });
  }
  // Ordenar cronológico ascendente
  out.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return ta - tb;
  });
  return out;
}

/** Convierte Timestamp/Date/string a Date, o null si no se puede */
function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'object' && val !== null && 'toDate' in val) {
    const fn = (val as { toDate?: () => Date }).toDate;
    if (typeof fn === 'function') return fn.call(val);
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Serializa fecha a ISO string o null */
function serializeFecha(val: unknown): string | null {
  const d = toDate(val);
  return d ? d.toISOString() : null;
}
