import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminFirestore, verificarAppCheck } from '../_lib/firebaseAdmin.js';

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

  // Audit C3 fase A: soft enforcement. Loggeamos resultado pero NO bloqueamos.
  const appCheckResult = await verificarAppCheck(req);
  console.log(JSON.stringify({
    endpoint: 'garantia',
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

  /**
   * Busca la factura asociada al token. Estrategia:
   *  1. `facturas.garantia.token == token` (token de garantía emitido al
   *     emitir el conduce — comportamiento original).
   *  2. Fallback Portal Cliente: si el token es el `tokenPortalCliente` o
   *     `trackingGPS.token` de una orden cerrada con factura, devolver la
   *     factura asociada. Esto unifica los links del cliente.
   */
  async function buscarFactura() {
    // 1) Lookup directo (comportamiento original)
    let snap = await db
      .collection('facturas')
      .where('garantia.token', '==', token)
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0];
    // 2) Fallback portal cliente: buscar la orden por token y su factura
    let ordenSnap = await db
      .collection('ordenes_servicio')
      .where('tokenPortalCliente', '==', token)
      .limit(1)
      .get();
    if (ordenSnap.empty) {
      ordenSnap = await db
        .collection('ordenes_servicio')
        .where('trackingGPS.token', '==', token)
        .limit(1)
        .get();
    }
    if (ordenSnap.empty) return null;
    const ordenData = ordenSnap.docs[0].data() as Record<string, unknown>;
    const facturaId = typeof ordenData.facturaId === 'string' && ordenData.facturaId.length > 0
      ? ordenData.facturaId
      : null;
    if (!facturaId) return null;
    const facSnap = await db.collection('facturas').doc(facturaId).get();
    if (!facSnap.exists) return null;
    return facSnap;
  }

  if (req.method === 'GET') {
    try {
      const facturaDoc = await buscarFactura();

      if (!facturaDoc) {
        return res.status(404).json({ error: 'Garantía no encontrada' });
      }

      const data = facturaDoc.data() as Record<string, unknown>;
      const garantiaRaw = (data.garantia as Record<string, unknown>) || {};

      let inicioFecha = toDate(garantiaRaw.inicioFecha);
      let finFecha = toDate(garantiaRaw.finFecha);
      let tiempoDias = typeof garantiaRaw.tiempoDias === 'number' ? garantiaRaw.tiempoDias : 0;
      const reclamadaEn = toDate(garantiaRaw.reclamadaEn);
      const fechaServicio = toDate(data.fechaServicio);

      // SPRINT-135a-UI: si la factura tiene `ordenId`, intentar leer la orden
      // y preferir el modelo nuevo (`periodoGarantiaDias`, `garantiaVencimiento`,
      // `cierreServicio.fechaCierre`) sobre los campos heredados de
      // `facturas.garantia.*`. Esto permite migración progresiva sin breaking
      // change para el front (`GarantiaCliente.tsx`).
      const ordenIdRaw = data.ordenId;
      if (typeof ordenIdRaw === 'string' && ordenIdRaw.length > 0) {
        try {
          const ordenSnap = await db.collection('ordenes_servicio').doc(ordenIdRaw).get();
          if (ordenSnap.exists) {
            const ordenData = ordenSnap.data() as Record<string, unknown>;
            const periodoNuevo = ordenData.periodoGarantiaDias;
            const vencNuevo = toDate(ordenData.garantiaVencimiento);
            const cierreServicio = ordenData.cierreServicio as Record<string, unknown> | undefined;
            const fechaCierreNueva = cierreServicio ? toDate(cierreServicio.fechaCierre) : null;
            if (typeof periodoNuevo === 'number' && periodoNuevo > 0) {
              tiempoDias = periodoNuevo;
            }
            if (vencNuevo) {
              finFecha = vencNuevo;
            }
            if (fechaCierreNueva) {
              inicioFecha = fechaCierreNueva;
            }
          }
        } catch (ordenErr) {
          // Fallback silencioso: si la orden no se puede leer, seguimos con
          // los campos de `facturas.garantia.*` (modelo viejo).
          console.warn('[garantia][GET] fallback modelo nuevo no disponible:', ordenErr);
        }
      }

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
          tiempoDias,
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
      const facturaDoc = await buscarFactura();
      if (!facturaDoc) {
        return res.status(404).json({ error: 'Garantía no encontrada' });
      }

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
