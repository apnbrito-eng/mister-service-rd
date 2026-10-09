import { validarEvaluacion, validarEvaluacionV2, extraerParticipantes, candidatosParticipantes } from '../_lib/evaluacionServicio.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore, exigirAppCheck } from '../_lib/firebaseAdmin.js';

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
  res.setHeader('Cache-Control', 'no-store');
  const { token } = req.query;
  if (typeof token !== 'string' || token.length < 16) {
    return res.status(400).json({ error: 'token_invalido' });
  }

  // Audit C3: soft por defecto; hard cuando APPCHECK_ENFORCE=1. Loggea siempre.
  let appCheckResult;
  try {
    appCheckResult = await exigirAppCheck(req);
  } catch (err) {
    const e = err as Error & { status?: number };
    return res.status(e.status ?? 403).json({ error: e.message || 'app_check_requerido' });
  }
  console.log(JSON.stringify({
    endpoint: 'feedback',
    app_check: appCheckResult,
  }));

  let db: ReturnType<typeof getAdminFirestore>;
  try {
    db = getAdminFirestore();
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(500).json({ error: `Error inicializando Firebase Admin: ${m}` });
  }

  // Helper: encuentra la orden por `tokenPortalCliente` (preferido, sprint
  // Portal Cliente) o `trackingGPS.token` (legacy, links viejos). Un solo
  // token sirve para todo el ciclo: tracking, feedback, garantía, portal.
  async function buscarOrden() {
    // 1) Preferido: token unificado del Portal del Cliente
    let snap = await db
      .collection('ordenes_servicio')
      .where('tokenPortalCliente', '==', token)
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0];
    // 2) Compat: token GPS legacy
    snap = await db
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
      if (data.evaluacionServicio) return res.status(200).json({ yaEnviado: true, evaluacionServicio: true });
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

  // Evaluación versionada. v2 (actual): atención/técnico separados + participantes
  // capturados del doc (NO del cliente). v1 (compat): un bloque de 4 categorías.
  // No convierte estrellas en NPS histórico.
  if (req.method === 'POST' && req.body?.evaluacion !== undefined) {
    const raw = req.body.evaluacion as unknown;
    const esV2 =
      !!raw &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      (
        Object.prototype.hasOwnProperty.call(raw, 'atencion') ||
        Object.prototype.hasOwnProperty.call(raw, 'tecnico')
      );
    const evaluacionV2 = esV2 ? validarEvaluacionV2(raw) : null;
    const evaluacionV1 = esV2 ? null : validarEvaluacion(raw);
    const comentario = req.body.comentario;
    const comentarioInvalido =
      comentario !== undefined &&
      (typeof comentario !== 'string' || comentario.length > 500);
    if ((!evaluacionV2 && !evaluacionV1) || comentarioInvalido) {
      return res.status(400).json({ error: 'evaluacion_invalida' });
    }
    try {
      const ordenDoc = await buscarOrden();
      if (!ordenDoc) return res.status(404).json({ error: 'orden_no_encontrada' });
      const result = await db.runTransaction(async tx => {
        const actual = await tx.get(ordenDoc.ref);
        const data = actual.data();
        if (!data || (data.tokenPortalCliente !== token && data.trackingGPS?.token !== token)) return 'orden_no_encontrada';
        if (data.fase !== 'cerrado') return 'orden_no_cerrada';
        if (data.evaluacionServicio || data.feedback) return 'feedback_ya_enviado';
        const comentarioLimpio =
          typeof comentario === 'string' ? comentario.trim() : '';
        // Participantes se derivan DEL DOC, no del body — invariante del sprint
        // Portal Cliente 2026-10-09: no aceptar atribución suministrada por cliente.
        const candidatos = candidatosParticipantes(data);
        const ids = [...new Set([candidatos.tecnicoUid, candidatos.atencionUid].filter((id): id is string => !!id && !id.includes('/')))];
        // Todas las lecturas preceden al update: un docId legacy no se promueve a UID.
        const usuarios = await Promise.all(ids.map(id => tx.get(db.collection('usuarios').doc(id))));
        const verificados = new Set(usuarios.filter(usuario => usuario.exists).map(usuario => usuario.id));
        const participantes = extraerParticipantes(data, verificados);
        const base: Record<string, unknown> = {
          escala: 5,
          fecha: FieldValue.serverTimestamp(),
          comentario: comentarioLimpio,
          participantes,
        };
        if (evaluacionV2) {
          base.version = 2;
          base.atencion = evaluacionV2.atencion;
          base.tecnico = evaluacionV2.tecnico;
        } else if (evaluacionV1) {
          base.version = 1;
          base.categorias = evaluacionV1;
        }
        // Strip undefined defensivo (Firestore rechaza undefined). `null`
        // se preserva adrede: significa "cliente omitió esta sección" o
        // "atribución explícitamente no fiable".
        const limpio = Object.fromEntries(
          Object.entries(base).filter(([, v]) => v !== undefined),
        );
        tx.update(ordenDoc.ref, { evaluacionServicio: limpio });
        return 'ok';
      });
      if (result !== 'ok') return res.status(result === 'feedback_ya_enviado' ? 409 : result === 'orden_no_encontrada' ? 404 : 400).json({ error: result });
      return res.status(200).json({ ok: true });
    } catch {
      return res.status(500).json({ error: 'No se pudo guardar la evaluación. Intenta de nuevo.' });
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

      const guardado = await db.runTransaction(async tx => {
        const actual = await tx.get(ordenDoc.ref);
        const vigente = actual.data();
        if (!vigente || (vigente.tokenPortalCliente !== token && vigente.trackingGPS?.token !== token)) return 'orden_no_encontrada';
        if (vigente.fase !== 'cerrado') return 'orden_no_cerrada';
        if (vigente.feedback || vigente.evaluacionServicio) return 'feedback_ya_enviado';
        tx.update(ordenDoc.ref, { feedback: feedbackData });
        return 'ok';
      });
      if (guardado !== 'ok') return res.status(guardado === 'feedback_ya_enviado' ? 409 : 400).json({ error: guardado });

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
