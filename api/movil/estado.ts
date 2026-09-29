import { exigirAppMovil } from '../_lib/appMovilVerificada.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID, createHash } from 'node:crypto';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { muestraValida } from '../../src/mobile/politicas.js';
/** Sesiones de jornada y dispositivos: el usuario y las fechas de recepción los fija el servidor. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { db, uid, rol } = await accesoEquipo(req);
    await exigirAppMovil(req);
    if (!['GET', 'POST'].includes(req.method || '')) return res.status(405).json({ error: 'Método no permitido' });
    const body = req.body || {};
    if (req.method === 'POST' && ['dispositivo', 'desregistrar'].includes(body.accion) && !['administrador', 'coordinadora', 'secretaria', 'operaria', 'tecnico'].includes(rol)) throw new ErrorAcceso(403, 'Este rol no puede registrar avisos móviles.');
    if (req.method === 'POST' && body.accion === 'dispositivo') {
      if (typeof body.token !== 'string' || body.token.length < 20 || body.token.length > 4096 || !['ios', 'android'].includes(body.plataforma)) throw new ErrorAcceso(400, 'Dispositivo inválido');
      const id = createHash('sha256').update(body.token).digest('hex');
      await db.collection('dispositivos_moviles').doc(id).set({ uid, token: body.token, plataforma: body.plataforma, activo: true, actualizadoEn: Date.now() });
      return res.status(200).json({ ok: true, dispositivoId: id });
    }
    if (req.method === 'POST' && body.accion === 'desregistrar') {
      if (typeof body.dispositivoId !== 'string' || !/^[a-f0-9]{64}$/.test(body.dispositivoId)) throw new ErrorAcceso(400, 'Dispositivo inválido');
      const dispositivo = db.collection('dispositivos_moviles').doc(body.dispositivoId);
      await db.runTransaction(async tx => {
        const doc = await tx.get(dispositivo);
        if (doc.data()?.uid === uid) tx.delete(dispositivo);
      });
      return res.status(200).json({ ok: true });
    }
    if (rol !== 'tecnico') throw new ErrorAcceso(403, 'Esta función requiere una cuenta de técnico.');
    const ref = db.collection('jornadas_moviles').doc(uid);
    const personal = await db.collection('personal').where('uid', '==', uid).limit(1).get();
    const vehiculoId = personal.empty ? uid : personal.docs[0].id;
    const vehiculoRef = db.collection('ubicaciones_vehiculos').doc(vehiculoId);

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref), anterior = snap.data(), ahora = Date.now();
      // La asistencia del servidor delimita el seguimiento, incluso tras reiniciar la app.
      const fechaRD = new Date(ahora - 4 * 3600000).toISOString().slice(0, 10);
      const ponches = await tx.get(db.collection('ponches').where('personalUid', '==', uid).where('fechaRD', '==', fechaRD));
      const tipos = ponches.docs.map(d => d.data().tipo);
      const enTurno = tipos.includes('entrada') && !tipos.includes('salida');
      if (req.method === 'GET' || body.accion === 'iniciar') {
        if (!enTurno || (anterior?.activa && anterior.expiraEn <= ahora)) {
          if (anterior?.activa) tx.update(ref, { activa: false, finalizadaEn: ahora });
          tx.set(vehiculoRef, { jornadaActiva: false }, { merge: true });
        }
        if (req.method === 'GET') return enTurno && anterior?.activa && anterior.expiraEn > ahora ? anterior : null;
        if (!enTurno) return null;
      }
      if (body.accion === 'iniciar') {
        if (anterior?.activa && anterior.expiraEn > ahora) return anterior;
        const jornada = { id: randomUUID(), uid, activa: true, iniciadaEn: ahora, expiraEn: ahora + 12 * 3600000 };
        tx.set(ref, jornada);
        return jornada;
      }
      if (!anterior || body.jornadaId !== anterior.id) throw new ErrorAcceso(409, 'La jornada cambió. Actualiza la app.');
      if (body.accion === 'finalizar') {
        tx.update(ref, { activa: false, finalizadaEn: ahora });
        tx.set(vehiculoRef, { jornadaActiva: false }, { merge: true });
        return { ...anterior, activa: false };
      }
      if (body.accion !== 'ubicacion' || !muestraValida(body.muestra, ahora)) throw new ErrorAcceso(400, 'Ubicación inválida');
      if (!enTurno || !anterior.activa || anterior.expiraEn <= ahora) {
        tx.update(ref, { activa: false, finalizadaEn: ahora });
        tx.set(vehiculoRef, { jornadaActiva: false }, { merge: true });
        return null;
      }
      // Una muestra previa al inicio no invalida una jornada vigente.
      if (body.muestra.capturadaEn < anterior.iniciadaEn) return anterior;
      if (body.muestra.simulada) throw new ErrorAcceso(400, 'Ubicación simulada no aceptada.');
      if (anterior.ultimaUbicacion?.capturadaEn >= body.muestra.capturadaEn) return anterior;
      if (anterior.recibidaEn && ahora - anterior.recibidaEn < 15000) throw new ErrorAcceso(429, 'Espera antes de enviar otra ubicación.');
      const muestra = { lat: body.muestra.lat, lng: body.muestra.lng, precision: body.muestra.precision, capturadaEn: body.muestra.capturadaEn, simulada: false };
      tx.update(ref, { ultimaUbicacion: muestra, recibidaEn: ahora });
      tx.set(vehiculoRef, { vehiculoId, tecnicoId: vehiculoId, tecnicoUid: uid, lat: muestra.lat, lng: muestra.lng, precision: muestra.precision, timestamp: new Date(muestra.capturadaEn), recibidaEn: new Date(ahora), origen: 'app_nativa', jornadaActiva: true }, { merge: true });
      return { ...anterior, ultimaUbicacion: muestra, recibidaEn: ahora };
    });
    return res.status(200).json({ ok: true, jornada: result });
  } catch (err) {
    if (err instanceof ErrorAcceso) return res.status(err.status).json({ error: err.message });
    console.error('[movil/estado] fallo inesperado', { codigo: 'ESTADO_MOVIL_ERROR', clase: err instanceof Error ? 'error' : 'desconocido' });
    return res.status(500).json({ error: 'No se pudo actualizar la app. Intenta de nuevo.' });
  }
}
