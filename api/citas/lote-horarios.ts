import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { accesoEquipo, ErrorAcceso } from '../_lib/accesoEquipo.js';
import { puedeOperarRutaCita, equipoRutaOrden } from '../_lib/accesoRutaCita.js';
import { comprobarPlantillaHorarios, enviarHorarioCita } from '../_lib/enviarHorarioCita.js';
import { siguienteDiaLaboralRD, validarFranja, versionHorario } from '../_lib/loteHorarios.js';

/** Solo prepara el lote y configura franjas. No envía ni interpreta aprobación cacheada como aprobación Meta. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  let acceso: Awaited<ReturnType<typeof accesoEquipo>>;
  try { acceso=await accesoEquipo(req); } catch(e) { return res.status(e instanceof ErrorAcceso?e.status:500).json({error:e instanceof ErrorAcceso?e.message:'No se pudo comprobar el acceso.'}); }
  const {db,uid}=acceso;
  const perfil=(await db.doc(`usuarios/${uid}`).get()).data();
  if (!perfil || !['administrador','coordinadora','secretaria','operaria'].includes(perfil.rol) || (perfil.permisosPersonalizados===true && perfil.permisosSistema?.ordenesVer!==true)) return res.status(403).json({error:'Acceso no autorizado.'});
  const gestion=await db.collection('gestion_accesos').get();
  const equipos=new Map(gestion.docs.filter(d=>['A','B'].includes(d.data().equipo)).map(d=>[d.id,String(d.data().equipo)]));
  const equipoActor=equipos.get(uid) ?? null;
  let body: Record<string, unknown>;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; if (!body || typeof body !== 'object') throw new Error(); } catch { return res.status(400).json({ error: 'Datos inválidos.' }); }
  
  try {
    if (body.accion === 'enviar') {
      if (body.confirmado !== true || typeof body.ordenId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.ordenId) || typeof body.version !== 'string' || !/^[a-f0-9]{24}$/.test(body.version)) return res.status(400).json({error:'Confirma el lote y la versión del horario.'});
      const orden=(await db.doc(`ordenes_servicio/${body.ordenId}`).get()).data();
      if(!orden || !puedeOperarRutaCita(perfil,uid,equipoActor,orden,equipos))return res.status(403).json({error:'No puede enviar horarios para esta cita.'});
      const plantilla = await comprobarPlantillaHorarios();
      return res.json(await enviarHorarioCita(db, req, uid, body.ordenId, body.version, plantilla.language, (orden)=>puedeOperarRutaCita(perfil,uid,equipoActor,orden,equipos))); 
    }
    if (body.accion === 'franja') {
      if (perfil.permisosPersonalizados === true && perfil.permisosSistema?.ordenesModificar !== true) return res.status(403).json({ error: 'No puede editar citas.' });
      if (typeof body.ordenId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.ordenId)) return res.status(400).json({ error: 'Orden inválida.' });
      const franja = validarFranja(body.franja);
      await db.runTransaction(async tx => {
        const ref = db.doc(`ordenes_servicio/${body.ordenId}`);
        const orden = await tx.get(ref);
        if (!orden.exists || ['cerrado', 'cancelado'].includes(orden.data()?.fase)) throw new Error('Cita no editable.');
        if (!puedeOperarRutaCita(perfil,uid,equipoActor,orden.data()!,equipos)) throw new ErrorAcceso(403,'No puede modificar la ruta de esta cita.');
        tx.update(ref, { franjaLlegada: franja });
        tx.create(db.collection('auditoria_admin').doc(), { accion: 'franja_llegada_cita', actorUid: uid, ordenId: body.ordenId, anterior: orden.data()?.franjaLlegada ?? null, nueva: franja, fecha: FieldValue.serverTimestamp() });
      });
      return res.json({ ok: true });
    }
    if (body.accion !== 'preparar') return res.status(400).json({ error: 'Acción inválida.' });
    const fecha = siguienteDiaLaboralRD();
    const desde = new Date(`${fecha}T00:00:00-04:00`), hasta = new Date(desde.getTime() + 86400000);
    const citas = await db.collection('ordenes_servicio').where('fechaCita', '>=', desde).where('fechaCita', '<', hasta).get();
    const items = citas.docs.filter(d => !['cerrado', 'cancelado', 'trabajo_realizado'].includes(d.data().fase) && !d.data().progreso?.standby).map(d => {
      const o = d.data(); const telefono = String(o.clienteTelefono ?? '').replace(/\D/g, '');
      let franja = null; try { franja = validarFranja(o.franjaLlegada); } catch { /* No inferir llegada de duración. */ }
      const valido = /^(1)?\d{10}$/.test(telefono);
      const waId = valido ? (telefono.length === 10 ? `1${telefono}` : telefono) : null;
      const version=franja && waId ? versionHorario(d.id, fecha, franja, waId) : null;
      return { ordenId: d.id, clienteNombre: String(o.clienteNombre ?? ''), equipoId: equipoRutaOrden(o,equipos), editable:puedeOperarRutaCita(perfil,uid,equipoActor,o,equipos), enviable:puedeOperarRutaCita(perfil,uid,equipoActor,o,equipos), respuestaHorario: o.respuestaHorario?.version===version ? o.respuestaHorario.estado : o.respuestaHorario ? 'horario_modificado' : null, solicitudHorario: o.solicitudHorario?.estado ?? null, fecha, franja, waId, version, bloqueos: [...(!valido ? ['Teléfono inválido'] : []), ...(!franja ? ['Definir franja de llegada'] : [])] };
    });
    let envioHabilitado=false;let motivo='Plantilla pendiente de aprobación Meta.';try {await comprobarPlantillaHorarios();envioHabilitado=true;motivo='Revisa los horarios y confirma el lote antes de enviar.';}catch(e){motivo=e instanceof Error ? e.message : motivo;}
    return res.json({ fecha, items, envioHabilitado, motivo });
  } catch (error) { return res.status(error instanceof ErrorAcceso?error.status:400).json({ error: error instanceof Error ? error.message : 'No se pudo preparar el lote.' }); }
}
