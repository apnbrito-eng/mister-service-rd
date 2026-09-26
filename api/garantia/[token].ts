import { resolverVigenciaGarantia, fechaGarantia as toDate } from '../_lib/vigenciaGarantia.js';
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
  res.setHeader('Cache-Control', 'no-store');
  const { token } = req.query;
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: 'Token requerido' });
  }

  // Audit C3 fase A: soft enforcement. Loggeamos resultado pero NO bloqueamos.
  const appCheckResult = await verificarAppCheck(req);
  console.log(JSON.stringify({
    endpoint: 'garantia',
    app_check: appCheckResult,
  }));

  let db: ReturnType<typeof getAdminFirestore>;
  try {
    db = getAdminFirestore();
  } catch (err) {
    console.error('[garantia] servicio no disponible');
    return res.status(500).json({ error: 'Servicio temporalmente no disponible' });
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
      const ordenDoc = typeof data.ordenId === 'string' && data.ordenId
        ? await db.collection('ordenes_servicio').doc(data.ordenId).get() : null;
      const { inicioFecha, finFecha, tiempoDias, reclamadaEn, estado, diasRestantes } =
        resolverVigenciaGarantia(data, ordenDoc?.exists ? ordenDoc.data()! : null);
      const fechaServicio = toDate(data.fechaServicio);

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
      return res.status(500).json({ error: 'No se pudo procesar la garantía. Intenta de nuevo.' });
    }
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as { problemaDescripcion?: unknown };
    const problemaRaw =
      typeof body.problemaDescripcion === 'string' ? body.problemaDescripcion : '';
    const problema = problemaRaw.trim();
    if (problema.length < 10 || problema.length > 2000) {
      return res.status(400).json({
        error: 'La descripción debe tener entre 10 y 2000 caracteres',
      });
    }

    try {
      const facturaDoc = await buscarFactura();
      if (!facturaDoc) {
        return res.status(404).json({ error: 'Garantía no encontrada' });
      }

      // ID estable y transacción: dos clics simultáneos producen una sola solicitud.
      const solicitudRef = db.collection('citas_por_confirmar').doc(`garantia_${facturaDoc.id}`);
      const auditRef = db.collection('auditoria_admin').doc(`reclamo_garantia_${facturaDoc.id}`);
      await db.runTransaction(async tx => {
        const actual = await tx.get(facturaDoc.ref);
        if (!actual.exists) throw new ReclamoError(404, 'Garantía no encontrada');
        const data = actual.data()!;
        const ordenDoc = typeof data.ordenId === 'string' && data.ordenId
          ? await tx.get(db.collection('ordenes_servicio').doc(data.ordenId)) : null;
        const orden = ordenDoc?.exists ? ordenDoc.data()! : null;
        const tokenValido = data.garantia?.token === token ||
          (orden?.facturaId === actual.id && (orden?.tokenPortalCliente === token || orden?.trackingGPS?.token === token));
        if (!tokenValido) throw new ReclamoError(404, 'Garantía no encontrada');
        const solicitud = await tx.get(solicitudRef);
        if (solicitud.exists) return;
        const ahora = new Date();
        const vigencia = resolverVigenciaGarantia(data, ordenDoc?.exists ? ordenDoc.data()! : null, ahora);
        if (vigencia.estado !== 'vigente') {
          const mensaje = vigencia.estado === 'expirada' ? 'Garantía expirada'
            : vigencia.estado === 'por_confirmar' ? 'La oficina debe confirmar la vigencia de esta garantía'
            : 'Esta garantía ya fue reclamada o atendida';
          throw new ReclamoError(409, mensaje);
        }
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


        tx.update(facturaDoc.ref, {
          'garantia.estado': 'reclamada',
          'garantia.reclamadaEn': ahora,
          'garantia.problemaDescripcion': problema,
          'garantia.origen': 'reclamo_cliente',
          'garantia.solicitudId': solicitudRef.id,
        });
        tx.create(solicitudRef, citaPayload);
        tx.create(auditRef, {
          accion: 'reclamo_garantia_cliente', objetivoTipo: 'factura',
          objetivoId: facturaDoc.id, solicitudId: solicitudRef.id,
          actorTipo: 'cliente_portal', timestamp: ahora,
        });
      });

      return res.status(200).json({
        ok: true,
        mensaje: 'Recibimos tu reclamo. Te contactaremos pronto.',
      });
    } catch (err) {
      if (err instanceof ReclamoError) return res.status(err.status).json({ error: err.message });
      console.error('[garantia][POST] error:', err);
      return res.status(500).json({ error: 'No se pudo procesar la garantía. Intenta de nuevo.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

class ReclamoError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
