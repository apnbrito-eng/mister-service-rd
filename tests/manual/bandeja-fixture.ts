const ahora = new Date();
const nombres: Record<string,string> = {'8095550100':'Laura Martínez · ejemplo','8095550101':'Carlos Pérez · ejemplo','8095550102':'Ana Rodríguez · ejemplo'};
const chats=Object.keys(nombres).map((wa_id,i)=>({id:wa_id,wa_id,ultimaActividad:ahora,noLeidos:i===0?2:0,asignadaA:i===0?'demo':'',bot:{habilitado:false},ultimoMensajeEntrante:{timestamp:ahora,preview:['Hola, ¿cómo va mi lavadora?','Quisiera agendar una visita.','Gracias por el servicio.'][i]}}));
export function useApp(){return {currentUser:{uid:'demo'},userProfile:{rol:'operaria'}};}
export function usePreferenciasChat(){return {preferencias:{},cambiar:async()=>{throw new Error('Esta vista no guarda cambios.');}};}
export function useNombresClientesInbox(){return nombres;}
export function suscribirConversaciones(next:(items:unknown[])=>void){next(chats);return ()=>{};}
export function parsearConversacion(id:string,data:Record<string,unknown>){return {...data,id};}
export async function equipoApi(ruta:string,body?:unknown){if(body)throw new Error('Esta vista no guarda cambios.');return {items:chats,cursor:null};}

export function useConteosBandeja(){return {conteos:{no_leidos:1,cartera:1,mias:1,hoy:2,mis_ordenes:1,pendientes:1},error:false};}
