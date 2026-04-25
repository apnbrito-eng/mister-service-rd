import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminFirestore } from '../_lib/firebaseAdmin.js';

/**
 * Endpoint público (sin auth) para consultar y reclamar la garantía de un
 * Conduce. El cliente accede vía `/garantia/:token` desde el link enviado por
 * WhatsApp al emitir el conduce.
 *
 *  GET   /api/garantia/[token]   → info pública (filtrada). No expone precios
 *                                   ni datos internos sensibles.
 *  POST  /api/garantia/[token]   → reclama la garantía. Crea entrada en
 *                                   `citas_por_confirmar` con `tipo: 'garantia'`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { token } = req.query;
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: 'Token requerido' });
  }

  let db: ReturnType<typeof getAdminFirestore>;
  try {
    db = getAdminFirestore();
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({ error: `Error inicializando Firebase Admin: ${m}` });
  }

  if (req.method === 'GET') {
    try {
      const snap = await db
        .collection('facturas')
        .where('garantia.token', '==', token)
        .limit(1)
        .get();

      if (snap.empty) {
        return res.status(404).json({ error: 'Garantía no encontrada' });
      }

      const facturaDoc = snap.docs[0];
      const data = facturaDoc.data() as Record<string, unknown>;
      const garantiaRaw = (data.garantia as Record<string, unknown>) || {};

      const inicioFecha = toDate(garantiaRaw.inicioFecha);
      const finFecha = toDate(garantiaRaw.finFecha);
      const reclamadaEn = toDate(garantiaRaw.reclamadaEn);
      const fechaServicio = toDate(data.fechaServicio);

      // Estado dinámico — calculado al leer (sin scheduler)
      const now = new Date();
      let estado = (garantiaRaw.estado as string) || 'vigente';
      if (estado === 'vigente' && finFecha && now > finFecha) {
        estado = 'expirada';
      }

      const diasRestantes = finFecha
        ? Math.max(0, Math.ceil((finFecha.getTime() - now.getTime()) / 86400000))
        : 0;

      // Sólo campos públicos — el cliente NO ve precios ni detalles internos
      return res.status(200).json({
        conduceNumero: (data.numero as string) || null,
        clienteNombre: (data.clienteNombre as string) || null,
        equipoTipo: (data.equipoTipo as string) || null,
        equipoMarca: (data.equipoMarca as string) || null,
        equipoModelo: (data.equipoModelo as string) || null,
        tecnicoNombre: (data.tecnicoNombre as string) || null,
        fechaServicio: fechaServicio ? fechaServicio.toISOString() : null,
        garantia: {
          tiempoDias: typeof garantiaRaw.tiempoDias === 'number' ? garantiaRaw.tiempoDias : 0,
          inicioFecha: inicioFecha ? inicioFecha.toISOString() : null,
          finFecha: finFecha ? finFecha.toISOString() : null,
          estado,
          diasRestantes,
          reclamadaEn: reclamadaEn ? reclamadaEn.toISOString() : null,
        },
      });
    } catch (err) {
      console.error('[garantia][GET] error:', err);
      const m = err instanceof Error ? err.message : 'Error desconocido';
      return res.status(500).json({ error: `Error: ${m.substring(0, 300)}` });
    }
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as { problemaDescripcion?: unknown };
    const problemaRaw =
      typeof body.problemaDescripcion === 'string' ? body.problemaDescripcion : '';
    const problema = problemaRaw.trim();
    if (problema.length < 10) {
      return res.status(400).json({
        error: 'Descripción del problema requerida (mínimo 10 caracteres)',
      });
    }

    try {
      const snap = await db
        .collection('facturas')
        .where('garantia.token', '==', token)
        .limit(1)
        .get();

      if (snap.empty) {
        return res.status(404).json({ error: 'Garantía no encontrada' });
      }

      const facturaDoc = snap.docs[0];
      const data = facturaDoc.data() as Record<string, unknown>;
      const garantiaRaw = (data.garantia as Record<string, unknown>) || {};

      const finFecha = toDate(garantiaRaw.finFecha);
      const now = new Date();

      if (finFecha && now > finFecha) {
        return res.status(400).json({ error: 'Garantía expirada' });
      }
      if (garantiaRaw.estado && garantiaRaw.estado !== 'vigente') {
        return res
          .status(400)
          .json({ error: 'Esta garantía ya fue reclamada o atendida' });
      }

      const ahora = new Date();

      // 1) Update factura — pasa a 'reclamada'
      await facturaDoc.ref.update({
        'garantia.estado': 'reclamada',
        'garantia.reclamadaEn': ahora,
        'garantia.problemaDescripcion': problema,
        'garantia.origen': 'reclamo_cliente',
      });

      // 2) Crear cita_por_confirmar con tipo 'garantia'
      const citaPayload: Record<string, unknown> = {
        tipo: 'garantia',
        esGarantia: true,
        referenciaFacturaId: facturaDoc.id,
        referenciaConduce: data.numero || null,
        referenciaOrdenId: data.ordenId || null,
        clienteId: data.clienteId || null,
        clienteNombre: data.clienteNombre || null,
        clienteNombre_alias: data.clienteNombre || null, // por si alguna view legacy depende
        telefono: data.clienteTelefono || null,
        clienteTelefono: data.clienteTelefono || null,
        equipoTipo: data.equipoTipo || null,
        equipoMarca: data.equipoMarca || null,
        equipoModelo: data.equipoModelo || null,
        servicio: 'Reclamo de garantía',
        falla: problema,
        descripcionProblema: problema,
        tecnicoOriginalUid: data.tecnicoId || null,
        tecnicoOriginalNombre: data.tecnicoNombre || null,
        origen: 'reclamo_garantia',
        origenGarantia: 'reclamo_cliente',
        createdAt: ahora,
        estado: 'pendiente',
      };

      const citaLimpia = Object.fromEntries(
        Object.entries(citaPayload).filter(([, v]) => v !== undefined),
      );

      await db.collection('citas_por_confirmar').add(citaLimpia);

      // 3) Audit log
      try {
        const auditPayload: Record<string, unknown> = {
          accion: 'reclamo_garantia_cliente',
          objetivoTipo: 'factura',
          objetivoId: facturaDoc.id,
          conduceNumero: data.numero || null,
          tokenGarantia: token.substring(0, 8) + '...', // truncado
          problemaDescripcion: problema,
          timestamp: ahora,
        };
        await db.collection('auditoria_admin').add(
          Object.fromEntries(
            Object.entries(auditPayload).filter(([, v]) => v !== undefined),
          ),
        );
      } catch (auditErr) {
        console.warn('[garantia][POST] audit log falló (no bloquea):', auditErr);
      }

      return res.status(200).json({
        ok: true,
        mensaje: 'Recibimos tu reclamo. Te contactaremos pronto.',
      });
    } catch (err) {
      console.error('[garantia][POST] error:', err);
      const m = err instanceof Error ? err.message : 'Error desconocido';
      return res.status(500).json({ error: `Error: ${m.substring(0, 300)}` });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

/** Convierte un Timestamp/Date/string a Date, o null si no se puede */
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
