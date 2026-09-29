import type { VercelRequest, VercelResponse } from '@vercel/node';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { prepararPausaBot, RUNTIME_BOT } from '../_lib/botServicioStore.js';
import { configEjecucionValida } from '../_lib/botServicioPipeline.js';
import { createHash } from 'node:crypto';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    if (!['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(rol)) throw new ErrorAcceso(403, 'Sin permiso.');
    let b;
    try { b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { throw new ErrorAcceso(400, 'Solicitud inválida.'); }
    if (!b || !/^\d{7,16}$/.test(b.waId) || typeof b.habilitado !== 'boolean' || !/^[\w-]{16,80}$/.test(b.requestId)) throw new ErrorAcceso(400, 'Solicitud inválida.');
    await db.runTransaction(async tx => {
      const convRef = db.doc(`whatsapp_conversaciones/${b.waId}`), audit = db.doc(`auditoria_admin/bot_sesion_${b.requestId}`);
      const [conv, previa, runtime] = await Promise.all([tx.get(convRef), tx.get(audit), tx.get(db.doc(RUNTIME_BOT))]);
      if (!conv.exists) throw new ErrorAcceso(404, 'Conversación no disponible.');
      if (!['administrador', 'coordinadora'].includes(rol) && conv.data()?.asignadaA !== uid) throw new ErrorAcceso(403, 'La conversación está asignada a otra persona.');
      if (previa.exists) {
        if (previa.data()?.solicitanteUid !== uid || previa.data()?.waId !== b.waId || previa.data()?.habilitado !== b.habilitado) throw new ErrorAcceso(409, 'Identificador reutilizado.');
        return;
      }
      if (b.habilitado && (process.env.BOT_SERVICIO_ENABLED !== 'true' || process.env.ALLOW_EXTERNAL_SENDS !== 'true' || !configEjecucionValida(runtime.data()))) throw new ErrorAcceso(409, 'El asistente automático todavía está desactivado.');
      const pausa = await prepararPausaBot(db, tx, b.waId, uid);
      pausa();
      if (b.habilitado) tx.set(db.doc(`bot_servicio_sesiones/${createHash('sha256').update(b.waId).digest('hex')}`), { pausado: false, trabajoActivo: null, leaseHastaMs: 0 }, { merge: true });
      tx.update(convRef, { 'bot.habilitado': b.habilitado });
      tx.create(audit, { solicitanteUid: uid, accion: b.habilitado ? 'wa_bot_activar' : 'wa_bot_pausar', waId: b.waId, habilitado: b.habilitado, timestampMs: Date.now() });
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    if (e instanceof ErrorAcceso) return res.status(e.status).json({ error: e.message });
    console.error('[bot-sesion] operación incompleta');
    return res.status(500).json({ error: 'No se pudo cambiar el asistente.' });
  }
}
