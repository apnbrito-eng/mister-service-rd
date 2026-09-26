import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { getMessaging } from 'firebase-admin/messaging';
import { getAdminApp, getAdminFirestore } from '../_lib/firebaseAdmin.js';
import { accesoOrdenTecnico } from '../_lib/accesoOrdenTecnico.js';
/** Invocación programada autenticada. No se activa un cron ni se envía nada al instalar el código. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const secreto = process.env.CRON_SECRET || process.env.MOBILE_CRON_SECRET;
  const recibido = req.headers.authorization;
  const esperado = secreto ? `Bearer ${secreto}` : '';
  if (!esperado || typeof recibido !== 'string' || Buffer.byteLength(recibido) !== Buffer.byteLength(esperado) || !timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado))) return res.status(401).json({ error: 'No autorizado' });
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (process.env.MOBILE_PUSH_ENABLED !== 'true' || process.env.ALLOW_EXTERNAL_SENDS === 'false') return res.status(200).json({ enviados: 0, bloqueado: true });
  try {
    const db = getAdminFirestore();
    const cursorRef = db.collection('config').doc('cursor_push');
    const cursor = (await cursorRef.get()).data();
    const inicio = Math.max(Date.now() - 86400000, Number(process.env.MOBILE_PUSH_START_AT) || 0);
    // @safe-orderby: el where exige createdAt para seleccionar avisos de las últimas 24 horas.
    let consulta = db.collection('notificaciones').where('createdAt', '>=', new Date(inicio)).orderBy('createdAt', 'asc').limit(200);
    if (typeof cursor?.ultimoId === 'string') {
      const anterior = await db.collection('notificaciones').doc(cursor.ultimoId).get();
      if (anterior.exists && anterior.data()?.createdAt?.toMillis() >= inicio) consulta = consulta.startAfter(anterior);
    }
    const pendientes = await consulta.get();
    let enviados = 0;
    for (const aviso of pendientes.docs) {
      const data = aviso.data();
      if (data.leida || typeof data.userId !== 'string') continue;
      const perfil = (await db.collection('usuarios').doc(data.userId).get()).data();
      if (!perfil || !['administrador', 'coordinadora', 'secretaria', 'operaria', 'tecnico'].includes(perfil.rol) || perfil.activo === false || perfil.eliminado === true) continue;
      if (perfil.rol === 'tecnico' && data.ordenId) { try { await accesoOrdenTecnico(db, data.userId, data.ordenId); } catch { continue; } }
      if (data.conversacionId) {
        if (typeof data.conversacionId === 'string' && /^\d{7,16}$/.test(data.conversacionId)) {
          const preferencia = (await db.collection('usuarios').doc(data.userId).collection('preferencias_chat').doc(data.conversacionId).get()).data();
          if (preferencia?.silenciado === true && data.tipo === 'crm_mensaje') continue;
        }
        if (!/^\d{7,16}$/.test(data.conversacionId) || perfil.rol === 'tecnico') continue;
        const atencion = (await db.collection('crm_atencion').doc(data.conversacionId).get()).data();
        if (data.tipo === 'crm_traspaso' && atencion?.traspaso?.destinoId !== data.userId) continue;
        if (data.requiereResponsableActual) {
          const responsable = atencion ? atencion.responsableId : (await db.collection('whatsapp_conversaciones').doc(data.conversacionId).get()).data()?.asignadaA;
          if (responsable !== data.userId) continue;
        }
      }
      const devices = await db.collection('dispositivos_moviles').where('uid', '==', data.userId).limit(5).get();
      for (const device of devices.docs) {
        if (!device.data().activo) continue;
        const key = createHash('sha256').update(`${aviso.id}:${device.id}`).digest('hex');
        const ref = db.collection('envios_push').doc(key), lease = randomUUID();
        const tomar = await db.runTransaction(async tx => {
          const actual = (await tx.get(ref)).data();
          if (actual?.enviado || actual?.leaseHasta > Date.now()) return false;
          tx.set(ref, { avisoId: aviso.id, dispositivoId: device.id, uid: data.userId, lease, leaseHasta: Date.now() + 120000 }); return true;
        });
        if (!tomar) continue;
        try {
          await getMessaging(getAdminApp()).send({ token: device.data().token,
            notification: { title: 'Mister Service', body: 'Tienes una actualización de trabajo. Abre la app para revisarla.' },
            data: { avisoId: aviso.id, conversacionId: typeof data.conversacionId === 'string' ? data.conversacionId : '', ordenId: typeof data.ordenId === 'string' ? data.ordenId : '' },
            android: { collapseKey: key, priority: 'high', notification: { sound: 'default' } }, apns: { headers: { 'apns-collapse-id': key }, payload: { aps: { sound: 'default' } } },
          });
          await ref.update({ enviado: true, enviadoEn: Date.now() }); enviados++;
        } catch (err) {
          const code = (err as { code?: string }).code || 'desconocido';
          await ref.update({ leaseHasta: 0, errorCodigo: code });
          if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') await device.ref.delete();
        }
      }
    }
    await cursorRef.set({ ultimoId: pendientes.size === 200 ? pendientes.docs[pendientes.size - 1].id : null, actualizadoEn: Date.now() });
    return res.status(200).json({ enviados, revisados: pendientes.size });
  } catch { return res.status(500).json({ error: 'No se pudo completar el envío de avisos.' }); }
}
