export * from '@firebase/firestore';
import { Timestamp } from '@firebase/firestore';
export function onSnapshot(target: any, callback: any) {
  const path = target.path || target._query?.path?.canonicalString?.() || '';
  const rows = path === 'precios_servicios' ? [{id:'precio-demo',marca:'Marca de prueba',equipoTipo:'Lavadora',categoria:'Reparación',nombre:'Servicio de prueba con nombre largo',precio:1500,precioMayoreo:1200,precioDetalle:1500,activo:true}]
    : path === 'citas_por_confirmar' ? [{id:'cita-demo',clienteNombre:'Cliente de prueba con nombre largo',telefono:'8095550100',servicio:'Reparación de lavadora',equipoTipo:'Lavadora',equipoMarca:'Marca de prueba',estado:'pendiente',createdAt:Timestamp.now(),falla:'No completa el ciclo. Descripción de prueba para revisar el ancho disponible.'}] : [];
  const docs = rows.map(row => ({id:row.id,data:()=>row}));
  queueMicrotask(()=> callback({docs,empty:!docs.length,size:docs.length,forEach:(fn:any)=>docs.forEach(fn)}));
  return () => {};
}
export async function getDocs(){ return {docs:[],empty:true,size:0}; }
export async function addDoc(){throw new Error('Ensayo: escritura bloqueada');}
export async function updateDoc(){throw new Error('Ensayo: escritura bloqueada');}
export async function deleteDoc(){throw new Error('Ensayo: escritura bloqueada');}
