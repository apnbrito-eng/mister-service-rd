import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Timestamp } from 'firebase-admin/firestore';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { identidadActividad } from '../_lib/actividadOrdenAcceso.js';
const idValido = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,160}$/.test(v);
interface Pieza { nombre: string; cantidad: number; costo: number; foto: string; costoOficina?: number }
function piezasValidas(value: unknown): Pieza[] {
  if (!Array.isArray(value) || !value.length || value.length > 30) throw new ErrorAcceso(400, 'Envía entre 1 y 30 piezas.');
  return value.map(p => {
    if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(k => !['nombre','cantidad','costo','foto'].includes(k)) || typeof p.nombre !== 'string' || !p.nombre.trim() || p.nombre.length > 200 || !Number.isInteger(p.cantidad) || p.cantidad < 1 || p.cantidad > 1000 || typeof p.costo !== 'number' || !Number.isFinite(p.costo) || p.costo < 0 || typeof p.foto !== 'string' || p.foto.length > 4000) throw new ErrorAcceso(400, 'Revisa nombre, cantidad, costo y foto de cada pieza.');
    let url: URL; try { url = new URL(p.foto); } catch { throw new ErrorAcceso(400, 'Foto inválida'); }
    if (url.protocol !== 'https:' || url.hostname !== 'firebasestorage.googleapis.com') throw new ErrorAcceso(400, 'La foto debe haberse subido al sistema.');
    return {nombre:p.nombre.trim(),cantidad:p.cantidad,costo:p.costo,foto:p.foto};
  });
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).json({error:'Método no permitido'});
  try {
    const {db,uid,rol} = await accesoEquipo(req);
    let body; try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { throw new ErrorAcceso(400,'Solicitud inválida'); }
    if (!body || !idValido(body.ordenId) || !idValido(body.propuestaId) || !body.propuestaId.startsWith('piezas_') || !['enviar','revisar'].includes(body.accion)) throw new ErrorAcceso(400,'Solicitud inválida');
    const piezas = body.accion === 'enviar' ? piezasValidas(body.piezas) : null;
    if (body.accion === 'revisar' && (!Array.isArray(body.costos) || !body.costos.length || body.costos.length > 30 || body.costos.some((v:unknown)=>typeof v !== 'number' || !Number.isFinite(v) || v < 0) || !Number.isInteger(body.revisionEsperada) || body.revisionEsperada < 0)) throw new ErrorAcceso(400,'Costos o revisión inválidos');
    const ref = db.doc(`ordenes_servicio/${body.ordenId}`), propuesta = ref.collection('interno').doc(body.propuestaId);
    await db.runTransaction(async tx => {
      const [ordenSnap, previo, perfilSnap, personal] = await Promise.all([tx.get(ref),tx.get(propuesta),tx.get(db.doc(`usuarios/${uid}`)),tx.get(db.collection('personal'))]);
      const orden=ordenSnap.data(), perfil=perfilSnap.data();
      if (!perfil || perfil.activo === false || perfil.eliminado || perfil.rol !== rol || !orden || orden.eliminada) throw new ErrorAcceso(403,'Orden no disponible');
      if (body.accion === 'enviar') {
        if (rol !== 'tecnico' || !identidadActividad(uid,perfil,personal.docs.map(d=>({id:d.id,data:d.data()}))).ids.has(orden.tecnicoId)) throw new ErrorAcceso(403,'No tienes acceso a esta orden');
        if (previo.exists) {
          if (previo.data()?.tecnicoUid !== uid || JSON.stringify(previo.data()?.piezas) !== JSON.stringify(piezas)) throw new ErrorAcceso(409,'Identificador reutilizado con datos distintos');
          return;
        }
        if (!orden.inicioChequeo || ['cerrado','cancelado','trabajo_realizado'].includes(orden.fase)) throw new ErrorAcceso(409,'La orden no admite piezas de diagnóstico');
        tx.create(propuesta,{piezas,tecnicoUid:uid,fecha:Timestamp.now(),revision:0});
      } else {
        if (!['administrador','coordinadora'].includes(rol)) throw new ErrorAcceso(403,'Solo coordinación puede revisar costos');
        if (!previo.exists || orden.facturada || ['cerrado','cancelado'].includes(orden.fase)) throw new ErrorAcceso(409,'No se pueden revisar estas piezas');
        const datos=previo.data()!;
        if ((datos.revision ?? 0) !== body.revisionEsperada || !Array.isArray(datos.piezas) || datos.piezas.length !== body.costos.length) throw new ErrorAcceso(409,'La propuesta cambió. Recarga antes de guardar.');
        const ahora=Timestamp.now();
        tx.update(propuesta,{piezas:datos.piezas.map((p:Pieza,i:number)=>({...p,costoOficina:body.costos[i]})),revision:(datos.revision ?? 0)+1,revisadoPor:uid,revisadoEn:ahora,historialCostos:[...(Array.isArray(datos.historialCostos)?datos.historialCostos:[]),{actorUid:uid,fecha:ahora,antes:datos.piezas.map((p:Pieza)=>p.costoOficina ?? p.costo),despues:body.costos}]});
      }
    });
    return res.status(200).json({ok:true});
  } catch(error) { return res.status(error instanceof ErrorAcceso ? error.status : 500).json({error:error instanceof ErrorAcceso ? error.message : 'No se pudieron guardar las piezas'}); }
}
