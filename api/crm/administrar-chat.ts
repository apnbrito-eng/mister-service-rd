import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';

const ms = (v: any) => typeof v?.toMillis === 'function' ? v.toMillis() : 0;
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    if (rol !== 'administrador') throw new ErrorAcceso(403, 'Solo el administrador puede realizar esta acción.');
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!b || !/^\d{7,16}$/.test(b.waId || '') || !/^[\w-]{16,80}$/.test(b.requestId || '') || !['ocultar', 'eliminar'].includes(b.accion) || b.confirmacion !== b.waId) throw new ErrorAcceso(400, 'Confirma la conversación antes de continuar.');
    const chat = db.collection('whatsapp_conversaciones').doc(b.waId);
    const operacion = db.collection('auditoria_chats').doc(b.requestId);
    await db.runTransaction(async tx => {
      const [c, o] = await Promise.all([tx.get(chat), tx.get(operacion)]);
      if (o.exists) {
        if (o.data()?.uid !== uid || o.data()?.waId !== b.waId || o.data()?.accion !== b.accion) throw new ErrorAcceso(409, 'Operación diferente.');
        return;
      }
      if (!c.exists) throw new ErrorAcceso(404, 'Conversación no disponible.');
      if (c.data()?.borradoEnCurso) throw new ErrorAcceso(409, 'Hay un borrado pendiente. Reanuda esa operación.');
      const corte = Date.now();
      tx.create(operacion, { uid, waId: b.waId, accion: b.accion, corte, fase: 0, cursor: null, total: 0, completada: b.accion === 'ocultar', fecha: FieldValue.serverTimestamp() });
      tx.update(chat, { ocultoGlobalHastaMs: corte, ...(b.accion === 'eliminar' ? { borradoEnCurso: b.requestId } : {}) });
    });
    if (b.accion === 'ocultar') return res.json({ ok: true, completada: true });
    let completada = false;
    await db.runTransaction(async tx => {
      const o = (await tx.get(operacion)).data()!;
      if (o.completada) { completada = true; return; }
      const coleccion = o.fase === 0 ? 'whatsapp_mensajes_inbox' : 'whatsapp_mensajes_outbox';
      let q = db.collection(coleccion).where('wa_id', '==', b.waId).orderBy(FieldPath.documentId()).limit(150);
      if (o.cursor) q = q.startAfter(o.cursor);
      const mensajes = await tx.get(q);
      const c = await tx.get(chat);
      const elegibles = mensajes.docs.filter(d => {
        const m = d.data();
        return !m.eliminadoDelChat && ms(o.fase === 0 ? m.timestampRecibido || m.timestampMeta : m.createdAt) <= o.corte;
      });
      if (o.fase === 1 && elegibles.some(d => ['queued', 'sending'].includes(d.data().estado))) throw new ErrorAcceso(409, 'Hay mensajes pendientes de envío. Espera a que terminen y pulsa Reintentar.');
      for (const d of elegibles) {
        const m = d.data();
        // Retener únicamente metadatos de deduplicación. Nunca escribir órdenes, clientes ni evidencias.
        tx.set(d.ref, { wa_id: b.waId, wamid: m.wamid || d.id, eliminadoDelChat: true, eliminadoPor: uid, eliminadoEn: o.corte,
          ...(o.fase === 0 ? { timestampMeta: m.timestampMeta || null, timestampRecibido: m.timestampRecibido || null } : { createdAt: m.createdAt || null, tempId: m.tempId || d.id, estado: m.estado || 'sent' }) });
      }
      const finFase = mensajes.size < 150;
      completada = finFase && o.fase === 1;
      tx.update(operacion, { total: o.total + elegibles.length, cursor: finFase ? null : mensajes.docs[mensajes.size - 1].id, fase: finFase ? o.fase + 1 : o.fase, completada });
      if (completada) {
        const actual = c.data() || {};
        const cambios: Record<string, unknown> = { borradoEnCurso: FieldValue.delete() };
        if (ms(actual.ultimoMensajeEntrante?.timestamp) <= o.corte) cambios.ultimoMensajeEntrante = FieldValue.delete();
        if (ms(actual.ultimoMensajeSaliente?.timestamp) <= o.corte) cambios.ultimoMensajeSaliente = FieldValue.delete();
        if (ms(actual.ultimaActividad) <= o.corte) cambios.noLeidos = 0;
        tx.update(chat, cambios);
      }
    });
    return res.json({ ok: true, completada });
  } catch (e) { return res.status(e instanceof ErrorAcceso ? e.status : 500).json({ error: e instanceof ErrorAcceso ? e.message : 'No se pudo completar. Reintenta la misma operación.' }); }
}
