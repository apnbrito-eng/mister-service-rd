import { useEffect, useState } from 'react';
import { collection, onSnapshot, Timestamp, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase/config';
export default function ActividadOrden({ ordenId }: { ordenId: string }) {
  const [eventos, setEventos] = useState<{id:string;detalle:string;nombre:string;fecha:Date|null}[]>([]);
  const [error,setError]=useState(false);
  // @safe-orderby: subcolección actividad; único writer api/movil/actividad-orden exige fecha serverTimestamp y las rules niegan escritura cliente.
  useEffect(()=>onSnapshot(query(collection(db,'ordenes_servicio',ordenId,'actividad'),orderBy('fecha','desc'),limit(50)),snap=>{setError(false);setEventos(snap.docs.map(d=>{const x=d.data();return {id:d.id,detalle:String(x.detalle||''),nombre:String(x.actorNombre||''),fecha:x.fecha instanceof Timestamp?x.fecha.toDate():null};}).sort((a,b)=>(b.fecha?.getTime()||0)-(a.fecha?.getTime()||0)).slice(0,50));},()=>setError(true)),[ordenId]);
  return <details className="rounded-lg border p-3"><summary className="font-semibold">Actividad de la orden</summary>{error?<p role="alert">No se pudo consultar la actividad.</p>:eventos.length?eventos.map(e=><p key={e.id} className="mt-2 text-sm"><strong>{e.nombre}</strong> · {e.fecha?.toLocaleString('es-DO')||'Guardando…'}<br/>{e.detalle}</p>):<p className="text-sm mt-2">Sin acciones registradas en este historial.</p>}</details>;
}
