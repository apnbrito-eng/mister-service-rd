import type {VercelRequest,VercelResponse} from '@vercel/node';
import {FieldValue} from 'firebase-admin/firestore';
import {accesoEquipo,ErrorAcceso} from './_lib/accesoEquipo.js';
import {evaluarAsistencia,fechaRD} from './_lib/asistenciaPolitica.js';
const valido=(v:unknown):v is string=>typeof v==='string' && /^[\w.-]{1,160}$/.test(v);
function rango(desde:unknown,hasta:unknown){
 if(typeof desde!=='string'||typeof hasta!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(desde)||!/^\d{4}-\d{2}-\d{2}$/.test(hasta))throw new ErrorAcceso(400,'Fechas inválidas.');
 const a=new Date(`${desde}T12:00:00-04:00`),b=new Date(`${hasta}T12:00:00-04:00`);
 if(!Number.isFinite(+a)||!Number.isFinite(+b)||fechaRD(a)!==desde||fechaRD(b)!==hasta||b<a||+b-+a>31*86400000)throw new ErrorAcceso(400,'Selecciona un rango de hasta 32 días.');
 return {desde,hasta};
}
async function filas(db:FirebaseFirestore.Firestore,desde:string,hasta:string){
 const [personal,ponches,revisiones]=await Promise.all([
  db.collection('personal').get(),db.collection('ponches').where('fechaRD','>=',desde).where('fechaRD','<=',hasta).get(),
  db.collection('asistencia_revisiones').where('dia','>=',desde).where('dia','<=',hasta).get(),
 ]);
 const revisadas=new Map(revisiones.docs.map(d=>[d.id,d.data()]));
 const result=[];
 for(const persona of personal.docs){
  const p=persona.data();if(!p.activo||!p.uid)continue;
  for(let t=+new Date(`${desde}T12:00:00-04:00`);t<=+new Date(`${hasta}T12:00:00-04:00`);t+=86400000){
   const dia=fechaRD(new Date(t));if(p.createdAt?.toDate && dia<fechaRD(p.createdAt.toDate()))continue;
   const entradas=ponches.docs.filter(d=>d.data().personalUid===p.uid && d.data().fechaRD===dia && d.data().tipo==='entrada').map(d=>d.data().timestamp?.toDate?.()).filter((d):d is Date=>d instanceof Date).sort((a,b)=>+a-+b);
   const id=`${persona.id}_${dia}`, calculo=evaluarAsistencia(dia,entradas[0]||null),revision=revisadas.get(id);
   result.push({id,personalId:persona.id,nombre:p.nombre||'Sin nombre',rol:p.rol,dia,entrada:entradas[0]?.toISOString()||null,...calculo,revision:revision?{estado:revision.estado,monto:revision.monto,motivo:revision.motivo,version:revision.version,conImagen:!!revision.conImagen,liquidacionId:revision.liquidacionId||null}:null});
  }
 }
 return result;
}
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 try{
  const {db,uid,rol}=await accesoEquipo(req);
  if(!['administrador','coordinadora'].includes(rol))throw new ErrorAcceso(403,'Solo administración o coordinación revisan asistencia.');
  if(req.method==='GET'){
   if(req.query.imagen){if(!valido(req.query.imagen))throw new ErrorAcceso(400,'Referencia inválida.');const foto=(await db.collection('asistencia_evidencias').doc(req.query.imagen).get()).data();if(!foto)throw new ErrorAcceso(404,'Sin imagen.');return res.json({imagen:foto.imagen});}
   const {desde,hasta}=rango(req.query.desde,req.query.hasta);return res.json({items:await filas(db,desde,hasta)});
  }
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!b||typeof b!=='object')throw new ErrorAcceso(400,'Solicitud inválida.');
  if(b.accion==='aplicar'){
   if(!valido(b.liquidacionId))throw new ErrorAcceso(400,'Nómina inválida.');
   const ref=db.collection('liquidaciones_nomina').doc(b.liquidacionId);
   const resultado=await db.runTransaction(async tx=>{
    const liq=await tx.get(ref),l=liq.data();if(!l||l.estado!=='abierta'||l.asistenciaBloqueada)throw new ErrorAcceso(409,'La nómina no está disponible para cambios.');
    const desde=fechaRD(l.periodoInicio.toDate()),hasta=fechaRD(l.periodoFin.toDate());
    const revisiones=await tx.get(db.collection('asistencia_revisiones').where('dia','>=',desde).where('dia','<=',hasta));
    const empleados=(l.empleados||[]).map((e:Record<string,any>)=>({...e}));
    let aplicadas=0,omitidas=0;
    for(const rev of revisiones.docs){const r=rev.data();if(r.estado!=='aprobada')continue;
     if(r.liquidacionId && r.liquidacionId!==liq.id)throw new ErrorAcceso(409,'Una incidencia ya pertenece a otra nómina.');
     if(r.liquidacionId===liq.id)continue;
     const e=empleados.find((e:Record<string,any>)=>e.personalId===r.personalId);if(!e){omitidas++;continue;}
     if(++aplicadas>400)throw new ErrorAcceso(400,'Hay más de 400 incidencias. Divide la revisión antes de aplicar.');
     if(e.pagado)throw new ErrorAcceso(409,'Hay empleados pagados; no se modifica su asistencia.');
     const items=(e.descuentosAsistencia||[]).filter((x:Record<string,any>)=>x.id!==rev.id);
     items.push({id:rev.id,dia:r.dia,monto:r.monto});e.descuentosAsistencia=items;
     e.totalAsistencia=items.reduce((s:number,x:Record<string,any>)=>s+x.monto,0);
     e.totalDescuentos=(e.totalAvances||0)+(e.totalDescuentosAdHoc||0)+(e.totalCuotasPrestamos||0)+e.totalAsistencia;
     e.totalNeto=Math.max(0,e.totalDevengado-e.totalDescuentos);
     tx.update(rev.ref,{liquidacionId:liq.id});
    }
    tx.update(ref,{empleados});tx.create(db.collection('auditoria_admin').doc(),{accion:'asistencia_aplicada',actorUid:uid,liquidacionId:liq.id,fecha:FieldValue.serverTimestamp()});
    return {aplicadas,omitidas};
   });return res.json({ok:true,...resultado});
  }
  if(!valido(b.personalId)||!['aprobar','excusar','descartar'].includes(b.accion))throw new ErrorAcceso(400,'Acción inválida.');
  rango(b.dia,b.dia);if(typeof b.motivo!=='string'||!b.motivo.trim()||b.motivo.length>1000)throw new ErrorAcceso(400,'Escribe el motivo (hasta 1000 caracteres).');
  const dia=b.dia as string,id=`${b.personalId}_${dia}`,ref=db.collection('asistencia_revisiones').doc(id);
  if(b.imagen && (typeof b.imagen!=='string'||b.imagen.length>700000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.imagen)))throw new ErrorAcceso(400,'La imagen debe ser JPG, PNG o WebP de hasta 500 KB.');
  await db.runTransaction(async tx=>{
   const [persona,anterior,ponches]=await Promise.all([tx.get(db.collection('personal').doc(b.personalId)),tx.get(ref),tx.get(db.collection('ponches').where('fechaRD','==',dia))]);
   const p=persona.data(),prev=anterior.data();if(!p||!p.activo||!p.uid)throw new ErrorAcceso(400,'Empleado no disponible.');
   if(p.createdAt?.toDate && dia<fechaRD(p.createdAt.toDate()))throw new ErrorAcceso(400,'Fecha anterior al registro del empleado.');
   if((prev?.version||0)!==b.version)throw new ErrorAcceso(409,'La revisión cambió. Actualiza antes de continuar.');
   if(prev?.liquidacionId)throw new ErrorAcceso(409,'Esta revisión ya se aplicó a nómina. Conserva el registro y tramita la corrección desde administración.');
   const entradas=ponches.docs.filter(d=>d.data().personalUid===p.uid&&d.data().tipo==='entrada').map(d=>d.data().timestamp?.toDate?.()).filter((d):d is Date=>d instanceof Date).sort((a,b)=>+a-+b);
   const calculo=evaluarAsistencia(dia,entradas[0]||null);
   if(b.accion==='aprobar' && (!['tardanza','sin_ponche'].includes(calculo.tipo)||calculo.tipo==='sin_ponche'&&b.faltaConfirmada!==true))throw new ErrorAcceso(400,'Confirma la ausencia completa; feriados, domingos y días abiertos no generan descuentos.');
   const monto=b.accion==='aprobar'?b.monto:0;
   if(!Number.isFinite(monto)||monto<0||monto>100000||Math.abs(Math.round(monto*100)-monto*100)>0.00001)throw new ErrorAcceso(400,'Importe inválido.');
   const estado=b.accion==='aprobar'?'aprobada':b.accion==='excusar'?'excusada':'descartada';
   const datos={personalId:persona.id,personalUid:p.uid,dia,estado,monto,sugerido:calculo.sugerido,tipo:calculo.tipo,minutos:calculo.minutos,motivo:b.motivo.trim(),actorUid:uid,actualizadoEn:FieldValue.serverTimestamp(),version:(prev?.version||0)+1,conImagen:!!b.imagen||!!prev?.conImagen};
   tx.set(ref,datos);tx.create(ref.collection('historial').doc(),datos);
   if(b.imagen)tx.set(db.collection('asistencia_evidencias').doc(id),{imagen:b.imagen,actorUid:uid,fecha:FieldValue.serverTimestamp()});
  });return res.json({ok:true});
 }catch(e){return res.status(e instanceof ErrorAcceso?e.status:500).json({error:e instanceof ErrorAcceso?e.message:'No se pudo completar la revisión de asistencia.'});}
}
