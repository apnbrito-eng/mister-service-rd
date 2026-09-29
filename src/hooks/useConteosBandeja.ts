import {useEffect,useState} from 'react';
import {equipoApi} from '../services/equipoApi';
export interface ConteosBandeja {no_leidos:number;cartera:number;mias:number;hoy:number;mis_ordenes:number;pendientes:number;}
export function useConteosBandeja(uid?:string){
 const [estado,setEstado]=useState<{uid?:string;conteos?:ConteosBandeja;error:boolean}>({error:false});
 useEffect(()=>{
  if(!uid)return;
  let activo=true,ocupado=false;
  const cargar=async()=>{
   if(ocupado || document.hidden)return;
   ocupado=true;
   try{const r=await equipoApi<{conteos:ConteosBandeja}>('/api/crm/bandeja?conteos=1');if(activo)setEstado({uid,conteos:r.conteos,error:false});}
   catch{if(activo)setEstado({uid,error:true});}
   finally{ocupado=false;}
  };
  void cargar();
  const timer=setInterval(()=>void cargar(),15000);
  const refrescar=()=>void cargar();
  window.addEventListener('focus',refrescar);document.addEventListener('visibilitychange',refrescar);
  return()=>{activo=false;clearInterval(timer);window.removeEventListener('focus',refrescar);document.removeEventListener('visibilitychange',refrescar);};
 },[uid]);
 return estado.uid===uid?estado:{error:false};
}
