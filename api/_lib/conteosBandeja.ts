import { ordenesDelResponsable } from "./ordenesDia.js";
import { Timestamp } from 'firebase-admin/firestore';

export interface ConteosBandeja { no_leidos: number; cartera: number; mias: number; hoy: number; mis_ordenes: number; pendientes: number; }
const ms = (valor: unknown): number => {
  if (valor instanceof Date) return valor.getTime();
  if (valor && typeof (valor as {toMillis?: unknown}).toMillis === 'function') return (valor as {toMillis(): number}).toMillis();
  return 0;
};

/** Cuenta conversaciones con mensajes sin leer, no mensajes ni páginas visibles. */
export async function obtenerConteosBandeja(db: FirebaseFirestore.Firestore, uid: string, ahora = new Date()): Promise<ConteosBandeja> {
  const dia = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(ahora);
  const inicio = new Date(`${dia}T00:00:00-04:00`);
  const [sinLeer, ordenes] = await Promise.all([
    db.collection('whatsapp_conversaciones').where('noLeidos','>',0).get(),
    db.collection('ordenes_servicio').where('fechaCita','>=',Timestamp.fromDate(inicio)).where('fechaCita','<',Timestamp.fromMillis(inicio.getTime()+86400000)).get(),
  ]);
  const activas = ordenes.docs.filter(d => {
    const o=d.data(); return !o.eliminada && !o.eliminado && !['cancelado','cerrado'].includes(o.fase);
  });
  const propias = await ordenesDelResponsable(db, activas, uid);
  const conteos: ConteosBandeja = {no_leidos:0,cartera:0,mias:0,pendientes:0,hoy:activas.length,mis_ordenes:propias.length};
  // Consulta solo vínculos de chats sin leer. Lotes acotados para getAll.
  for(let inicioLote=0;inicioLote<sinLeer.docs.length;inicioLote+=100){
    const lote=sinLeer.docs.slice(inicioLote,inicioLote+100);
    const idsClientes=[...new Set(lote.map(d=>d.data().clienteId).filter((v):v is string=>typeof v==='string' && /^[\w.-]{1,160}$/.test(v)))];
    const [atenciones, preferencias, carteras]=await Promise.all([
      db.getAll(...lote.map(d=>db.collection('crm_atencion').doc(d.id))),
      db.getAll(...lote.map(d=>db.collection('usuarios').doc(uid).collection('preferencias_chat').doc(d.id))),
      idsClientes.length ? db.getAll(...idsClientes.map(id=>db.collection('crm_clientes').doc(id))) : Promise.resolve([]),
    ]);
    const cartera=new Map(carteras.map(d=>[d.id,d.data()?.responsableId]));
    for(let i=0;i<lote.length;i++){
      const chat=lote[i].data(), pref=preferencias[i].data();
      const fecha=ms(chat.ultimaActividad);
      if(chat.ocultoGlobalHastaMs && fecha<=chat.ocultoGlobalHastaMs && !chat.borradoEnCurso)continue;
      if(pref?.ocultoHastaMs && fecha<=pref.ocultoHastaMs)continue;
      conteos.no_leidos++;
      if(chat.asignadaA===uid)conteos.mias++;
      if(cartera.get(chat.clienteId)===uid)conteos.cartera++;
      if(atenciones[i].data()?.pendiente===true)conteos.pendientes++;
    }
  }
  return conteos;
}
