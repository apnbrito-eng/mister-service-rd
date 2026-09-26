import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { getAdminStorage } from '../_lib/firebaseAdmin.js';
/** Upload only. Sending remains behind the ordinary WhatsApp permissions and 24h gate. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    const { db, uid, rol } = await accesoEquipo(req);
    if (!['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(rol)) throw new ErrorAcceso(403, 'No tienes acceso a este chat.');
    const { waId, audio, mimeType } = req.body || {};
    if (typeof waId !== 'string' || !/^\d{7,16}$/.test(waId) || typeof audio !== 'string' || audio.length > 2800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio) || !['audio/mp4', 'audio/ogg'].includes(mimeType)) throw new ErrorAcceso(400, 'Audio inválido o demasiado largo.');
    const conv = (await db.collection('whatsapp_conversaciones').doc(waId).get()).data();
    if (!conv || conv.bajaSolicitada) throw new ErrorAcceso(403, 'La conversación no admite envíos.');
    const buffer = Buffer.from(audio, 'base64');
    const valido = mimeType === 'audio/mp4' ? buffer.toString('ascii', 4, 8) === 'ftyp' : buffer.toString('ascii', 0, 4) === 'OggS' && buffer.subarray(0, 256).includes(Buffer.from('OpusHead'));
    if (!valido || buffer.length < 32 || buffer.length > 2 * 1024 * 1024) throw new ErrorAcceso(400, 'Formato de audio no compatible.');
    const file = getAdminStorage().bucket().file(`whatsapp-media/${waId}/voz-${randomUUID()}.${mimeType === 'audio/mp4' ? 'm4a' : 'ogg'}`);
    await file.save(buffer, { contentType: mimeType, metadata: { metadata: { autorUid: uid, waId, origen: 'grabacion-chat' } } });
    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 86400000 });
    return res.status(200).json({ url });
  } catch (err) {
    if (err instanceof ErrorAcceso) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: 'No se pudo guardar el audio. Intenta de nuevo.' });
  }
}
