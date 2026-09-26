import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { puedeAprobar, validarAporte } from '../_lib/conocimiento.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method || '')) return res.status(405).json({ error: 'Método no permitido.' });
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    const col = db.collection('conocimiento_equipo');
    if (req.method === 'GET') {
      const aprobados = await col.where('estado', '==', 'aprobado').limit(60).get();
      const pendientes = puedeAprobar(rol)
        ? await col.where('estado', '==', 'pendiente').limit(60).get()
        : await col.where('autorUid', '==', uid).limit(60).get();
      const docs = new Map([...aprobados.docs, ...pendientes.docs].map(d => [d.id, d]));
      return res.json({ items: [...docs.values()].map(d => ({ id: d.id, ...d.data() })), puedeAprobar: puedeAprobar(rol) });
    }
    let body: Record<string, unknown>;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ error: 'Solicitud inválida.' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Solicitud inválida.' });
    if (body.accion === 'crear') {
      let aporte;
      try { aporte = validarAporte(body); } catch (e) { return res.status(400).json({ error: (e as Error).message }); }
      const ref = col.doc();
      await db.runTransaction(async tx => {
        const cap = db.collection('rate_limits').doc(uid + '_conocimiento_' + new Date().toISOString().slice(0, 10));
        const count = await tx.get(cap);
        if ((count.data()?.total ?? 0) >= 20) throw new ErrorAcceso(429, 'Puedes aportar hasta 20 conocimientos por día.');
        tx.set(cap, { total: (count.data()?.total ?? 0) + 1 });
        tx.create(ref, { ...aporte, autorUid: uid, estado: 'pendiente', version: 1, creadoEn: FieldValue.serverTimestamp() });
        tx.create(db.collection('auditoria_admin').doc(), { accion: 'conocimiento_creado', actorUid: uid, conocimientoId: ref.id, fecha: FieldValue.serverTimestamp() });
      });
      return res.status(201).json({ id: ref.id });
    }
    if (!puedeAprobar(rol)) return res.status(403).json({ error: 'Solo administración y coordinación revisan conocimientos.' });
    if (!['aprobar', 'archivar'].includes(String(body.accion)) || typeof body.id !== 'string' || !/^[a-zA-Z0-9]{20}$/.test(body.id)) return res.status(400).json({ error: 'Acción inválida.' });
    await db.runTransaction(async tx => {
      const ref = col.doc(body.id as string);
      const anterior = await tx.get(ref);
      if (!anterior.exists) throw new ErrorAcceso(404, 'Este conocimiento ya no existe.');
      if (anterior.data()?.version !== body.version) throw new ErrorAcceso(409, 'Otra persona lo actualizó. Recarga antes de continuar.');
      tx.update(ref, { estado: body.accion === 'aprobar' ? 'aprobado' : 'archivado', revisadoPor: uid, revisadoEn: FieldValue.serverTimestamp(), version: Number(body.version) + 1 });
      tx.create(db.collection('auditoria_admin').doc(), { accion: 'conocimiento_' + body.accion, actorUid: uid, conocimientoId: ref.id, fecha: FieldValue.serverTimestamp() });
    });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(e instanceof ErrorAcceso ? e.status : 500).json({ error: e instanceof ErrorAcceso ? e.message : 'No se pudo guardar o cargar el conocimiento. Intenta de nuevo.' });
  }
}
