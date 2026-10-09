import { useEffect, useState } from 'react';
import { getToken } from 'firebase/app-check';
import { appCheck, auth } from '../firebase/config';
import { puede } from '../utils/permisos';
import type { Usuario } from '../types';
import type { EstadoBadgeSidebar } from '../navigation/badgesSidebar';
export function validarConteosSidebar(valor: unknown, ahora=new Date()) {
 const v=valor as {fechaRD?:string;consultadoEn?:string;conteos?:Record<string,{estado?:string;total?:number}>};
 const fecha=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(ahora);
 const epoch=Date.parse(v?.consultadoEn||'');
 if(v?.fechaRD!==fecha || !Number.isFinite(epoch) || Math.abs(ahora.getTime()-epoch)>120000 || !v.conteos || Array.isArray(v.conteos) || typeof v.conteos!=='object')throw new Error('Totales desactualizados.');
 const counts:Record<string,number>={},estados:Record<string,EstadoBadgeSidebar>={};
 for(const clave of ['clientes','empresasAliadas','ordenes','agendaDia','operacionesDia']){
  const c=v.conteos[clave];if(!c)continue;
  if(c.estado==='disponible'&&Number.isSafeInteger(c.total)&&c.total!>=0){counts[clave]=c.total!;estados[clave]='disponible';}
  else if(c.estado==='error')estados[clave]='error';else throw new Error('Contrato de totales inválido.');
 }
 return {counts,estados};
}
export function useConteosSidebar(uid:string|undefined,perfil:Usuario|null|undefined){
 const rol=perfil?.rol,clientes=puede(perfil,'clientesVer'),ordenes=puede(perfil,'ordenesVer');
 const claveSesion=JSON.stringify([uid,rol,clientes,ordenes]);
 const [datos,setDatos]=useState<{sesion:string;counts:Record<string,number>;estados:Record<string,EstadoBadgeSidebar>}>({sesion:'',counts:{},estados:{}});
 useEffect(()=>{
  if(!uid||!['administrador','coordinadora'].includes(rol||''))return;
  const claves=[...(clientes?['clientes']:[]),...(ordenes?['ordenes','agendaDia','operacionesDia']:[]),...(rol==='administrador'?['empresasAliadas']:[])];
  let activo=true,ocupado=false;const controller=new AbortController();
  const estados=(estado:EstadoBadgeSidebar)=>Object.fromEntries(claves.map(k=>[k,estado]));
  setDatos({sesion:claveSesion,counts:{},estados:estados('cargando')});
  const consultar=async()=>{
   if(!activo||ocupado||document.visibilityState==='hidden')return;ocupado=true;
   setDatos({sesion:claveSesion,counts:{},estados:estados('cargando')});
   const intento=new AbortController();const abortar=()=>intento.abort();controller.signal.addEventListener('abort',abortar);let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    const trabajo=async()=>{
    const usuario=auth.currentUser;if(usuario?.uid!==uid)throw new Error('Sesión cambiada.');
    if(!appCheck)throw new Error('App Check no disponible.');
    const [token,check]=await Promise.all([usuario.getIdToken(),getToken(appCheck,false)]);
    if(!activo||intento.signal.aborted||auth.currentUser?.uid!==uid)throw new Error('Consulta cancelada.');
    const respuesta=await fetch('/api/sidebar/conteos',{headers:{Authorization:`Bearer ${token}`,'X-Firebase-AppCheck':check.token},signal:intento.signal,cache:'no-store'});
    if(!respuesta.ok)throw new Error('Totales no disponibles.');
    return validarConteosSidebar(await respuesta.json());
    };
    const validos=await Promise.race([trabajo(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{intento.abort();reject(new Error('Tiempo de consulta agotado.'));},45000);})]);
    if(activo&&auth.currentUser?.uid===uid)setDatos({sesion:claveSesion,counts:Object.fromEntries(claves.filter(k=>validos.counts[k]!==undefined).map(k=>[k,validos.counts[k]])),estados:Object.fromEntries(claves.map(k=>[k,validos.estados[k]||'error']))});
   }catch{if(activo)setDatos({sesion:claveSesion,counts:{},estados:estados('error')});}finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abortar);ocupado=false;}
  };
  void consultar();const intervalo=setInterval(()=>void consultar(),60000);const visible=()=>void consultar();document.addEventListener('visibilitychange',visible);
  return()=>{activo=false;controller.abort();clearInterval(intervalo);document.removeEventListener('visibilitychange',visible);};
 },[uid,rol,clientes,ordenes,claveSesion]);
 return datos.sesion===claveSesion?datos:{counts:{},estados:{}};
}
