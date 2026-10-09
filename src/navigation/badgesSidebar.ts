export type EstadoBadgeSidebar='cargando'|'disponible'|'error';
const BADGES:Record<string,{clave:string;unidad:string}[]>={
 '/admin/inbox':[{clave:'whatsappInboxCount',unidad:'conversaciones sin leer'}],
 '/admin/citas':[{clave:'citasCount',unidad:'citas por confirmar'}],
 '/admin/solicitudes':[{clave:'solicitudesCount',unidad:'solicitudes pendientes'}],
 '/admin/reprogramaciones':[{clave:'reprogramacionesCount',unidad:'órdenes con propuesta pendiente del cliente'}],
 '/admin/sugerencias-chequeo':[{clave:'sugerenciasChequeoCount',unidad:'órdenes con sugerencia pendiente'}],
 '/admin/pagos-pendientes':[{clave:'pagosPendientesCount',unidad:'órdenes con pagos sin verificar'}],
 '/admin/facturacion-pendiente':[{clave:'facturacionPendienteCount',unidad:'órdenes enviadas a facturación sin conduce emitido'}],
 '/admin/standby':[{clave:'standbyCount',unidad:'piezas pendientes'},{clave:'ordenesStandbyCount',unidad:'órdenes en espera'}],
};
export function badgesParaRuta(ruta:string,counts:Record<string,number>,estados:Record<string,EstadoBadgeSidebar>){
 return (BADGES[ruta]??[]).map(({clave,unidad})=>{
  const disponible=estados[clave]==='disponible';
  const count=disponible?counts[clave]:undefined;
  return {clave,unidad,texto:count===undefined?'—':String(count),descripcion:count===undefined?`${unidad}: ${estados[clave]==='error'?'datos no disponibles':'cargando'}`:`${count} ${unidad}`};
 });
}
