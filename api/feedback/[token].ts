import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../_lib/firebaseAdmin.js';

/**
 * Endpoint público (sin auth) para enviar feedback NPS al cerrar una orden.
 * El cliente accede vía `/tracking/:token` cuando la orden está en `cerrado`
 * y envía el NPS desde el componente FeedbackNPS.
 *
 *   GET   /api/feedback/[token]   → ¿la orden ya tiene feedback enviado?
 *   POST  /api/feedback/[token]   → guarda nuevo feedback (inmutable) o
 *                                    actualiza flags de tracking de conversión
 *                                    (googleReviewClicked / whatsappContactClicked)
 *                                    si el feedback ya existe.
 *
 *  Convenciones del proyecto:
 *  - Strip undefined antes de cualquier write Firestore.
 *  - Si NPS ≤ 6 (detractor) → crea N notificaciones in-app, una por cada
 *    miembro de personal con rol administrador o coordinadora activo.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { token } = req.query;
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: 'token_invalido' });
  }

  let db: ReturnType<typeof getAdminFirestore>;
  try {
    db = getAdminFirestore();
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({ error: `Error inicializando Firebase Admin: ${m}` });
  }

  // Helper: encuentra la orden por trackingGPS.token. Reusamos el mismo token
  // que ya genera el sistema de tracking GPS — no creamos otro.
  async function buscarOrden() {
    const snap = await db
      .collection('ordenes_servicio')
      .where('trackingGPS.token', '==', token)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0];
  }

  if (req.method === 'GET') {
    try {
      const ordenDoc = await buscarOrden();
      if (!ordenDoc) {
        return res.status(404).json({ error: 'orden_no_encontrada' });
      }
      const data = ordenDoc.data() as Record<string, unknown>;
      const fb = data.feedback as Record<string, unknown> | undefined;
      if (!fb) {
        return res.status(200).json({ yaEnviado: false });
      }
      const fechaIso = (() => {
        const f = fb.fechaFeedback;
        if (!f) return null;
        if (f instanceof Date) return f.toISOString();
        if (typeof f === 'object' && 'toDate' in f && typeof (f as { toDate?: () => Date }).toDate === 'function') {
          return (f as { toDate: () => Date }).toDate().toISOString();
        }
        return null;
      })();
      return res.status(200).json({
        yaEnviado: true,
        feedback: {
          nps: typeof fb.nps === 'number' ? fb.nps : null,
          ratingTipo: fb.ratingTipo || null,
          comentario: typeof fb.comentario === 'string' ? fb.comentario : null,
          fechaFeedback: fechaIso,
          googleReviewClicked: fb.googleReviewClicked === true,
          whatsappContactClicked: fb.whatsappContactClicked === true,
        },
      });
    } catch (err) {
      console.error('[feedback][GET] error:', err);
      const m = err instanceof Error ? err.message : 'Error desconocido';
      return res.status(500).json({ error: `Error: ${m.substring(0, 300)}` });
    }
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as {
      nps?: unknown;
      comentario?: unknown;
      googleReviewClicked?: unknown;
      whatsappContactClicked?: unknown;
    };

    const npsRaw = body.nps;
    const comentarioRaw = body.comentario;
    const googleClickRaw = body.googleReviewClicked;
    const whatsappClickRaw = body.whatsappContactClicked;

    // Distingue entre 2 modos:
    //  1) Envío inicial: viene `nps` (number 0-10).
    //  2) Solo tracking: NO viene nps; viene googleReviewClicked o
    //     whatsappContactClicked. Se permite aunque ya haya feedback.
    const esEnvioInicial = typeof npsRaw === 'number';
    const esSoloTracking =
      !esEnvioInicial &&
      (googleClickRaw === true || whatsappClickRaw === true);

    if (!esEnvioInicial && !esSoloTracking) {
      return res.status(400).json({ error: 'payload_invalido' });
    }

    if (esEnvioInicial) {
      if (
        typeof npsRaw !== 'number' ||
        !Number.isInteger(npsRaw) ||
        npsRaw < 0 ||
        npsRaw > 10
      ) {
        return res.status(400).json({ error: 'nps_invalido' });
      }
      if (
        comentarioRaw !== undefined &&
        comentarioRaw !== null &&
        (typeof comentarioRaw !== 'string' || comentarioRaw.length > 500)
      ) {
        return res.status(400).json({ error: 'comentario_invalido' });
      }
    }

    try {
      const ordenDoc = await buscarOrden();
      if (!ordenDoc) {
        return res.status(404).json({ error: 'orden_no_encontrada' });
      }

      const data = ordenDoc.data() as Record<string, unknown>;
      if (data.fase !== 'cerrado') {
        return res.status(400).json({ error: 'orden_no_cerrada' });
      }

      const feedbackExistente = data.feedback as Record<string, unknown> | undefined;

      // Modo "solo tracking": sólo flags de conversión sobre feedback existente.
      if (esSoloTracking) {
        if (!feedbackExistente) {
          return res.status(400).json({ error: 'sin_feedback_previo' });
        }
        const update: Record<string, unknown> = {};
        if (googleClickRaw === true) update['feedback.googleReviewClicked'] = true;
        if (whatsappClickRaw === true) update['feedback.whatsappContactClicked'] = true;
        if (Object.keys(update).length === 0) {
          return res.status(400).json({ error: 'sin_cambios' });
        }
        await ordenDoc.ref.update(update);
        return res.status(200).json({ ok: true, soloTracking: true });
      }

      // Modo envío inicial: rechazar si ya hay feedback (inmutabilidad).
      if (feedbackExistente) {
        return res.status(409).json({ error: 'feedback_ya_enviado' });
      }

      const nps = npsRaw as number;
      const ratingTipo: 'detractor' | 'pasivo' | 'promotor' =
        nps <= 6 ? 'detractor' : nps <= 8 ? 'pasivo' : 'promotor';

      const comentarioLimpio =
        typeof comentarioRaw === 'string' ? comentarioRaw.trim() : '';

      const feedbackData: Record<string, unknown> = {
        nps,
        ratingTipo,
        fechaFeedback: FieldValue.serverTimestamp(),
      };
      if (comentarioLimpio.length > 0) feedbackData.comentario = comentarioLimpio;
      if (googleClickRaw === true) feedbackData.googleReviewClicked = true;
      if (whatsappClickRaw === true) feedbackData.whatsappContactClicked = true;

      await ordenDoc.ref.update({ feedback: feedbackData });

      // Si es detractor, notificación in-app a admin/coordinadora activos.
      if (ratingTipo === 'detractor') {
        try {
          const personalSnap = await db
            .collection('personal')
            .where('rol', 'in', ['administrador', 'coordinadora'])
            .where('activo', '==', true)
            .get();

          const tareas: Promise<unknown>[] = [];
          const ahora = FieldValue.serverTimestamp();
          const clienteNombre =
            typeof data.clienteNombre === 'string' ? data.clienteNombre : 'Cliente';
          const ordenNumero =
            typeof data.numero === 'string' ? data.numero : '';

          for (const p of personalSnap.docs) {
            const pData = p.data() as Record<string, unknown>;
            // destinatarioId: preferimos uid (Firebase Auth) — si no, doc id de personal
            const destinatarioId =
              typeof pData.uid === 'string' && pData.uid.length > 0
                ? pData.uid
                : p.id;
            const notif: Record<string, unknown> = {
              destinatarioId,
              tipo: 'feedback_detractor',
              titulo: 'Cliente con experiencia negativa',
              mensaje: `${clienteNombre} dio NPS ${nps}/10 a la orden ${ordenNumero}`.trim(),
              ordenId: ordenDoc.id,
              leida: false,
              createdAt: ahora,
            };
            if (typeof pData.nombre === 'string' && pData.nombre.length > 0) {
              notif.destinatarioNombre = pData.nombre;
            }
            if (ordenNumero) notif.ordenNumero = ordenNumero;

            // Strip undefined defensivo (Firestore rechaza undefined)
            const limpio = Object.fromEntries(
              Object.entries(notif).filter(([, v]) => v !== undefined),
            );

            tareas.push(db.collection('notificaciones').add(limpio));
          }
          await Promise.all(tareas);
        } catch (notifErr) {
          // No bloqueamos el envío del feedback si la creación de notifs falla
          console.warn('[feedback][POST] notifs detractor fallaron:', notifErr);
        }
      }

      return res.status(200).json({ ok: true, ratingTipo });
    } catch (err) {
      console.error('[feedback][POST] error:', err);
      const m = err instanceof Error ? err.message : 'Error desconocido';
      return res.status(500).json({ error: `Error: ${m.substring(0, 300)}` });
    }
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
