export function equipoRutaOrden(orden:Record<string,unknown>,equipos:Map<string,string>):string|null {
 const directo=orden.equipoId==='A' || orden.equipoId==='B' ? orden.equipoId : null;
 const operaria=typeof orden.operariaId==='string'?equipos.get(orden.operariaId):undefined;
 const responsable=typeof orden.responsableId==='string'?equipos.get(orden.responsableId):undefined;
 const candidatos=[...new Set([directo,operaria,responsable].filter((v):v is string=>v==='A'||v==='B'))];
 return candidatos.length===1?candidatos[0]:null;
}
export function puedeOperarRutaCita(perfil:Record<string,unknown>,uid:string,equipoActor:string|null,orden:Record<string,unknown>,equipos:Map<string,string>):boolean{
 if(perfil.activo===false || perfil.eliminado===true || !['administrador','coordinadora','secretaria','operaria'].includes(String(perfil.rol)))return false;
 const p=perfil.permisosSistema as Record<string,unknown>|undefined;
 if(perfil.permisosPersonalizados===true && (p?.ordenesVer!==true || p?.ordenesModificar!==true))return false;
 if(orden.eliminado===true || orden.borrado===true || ['cerrado','cancelado','trabajo_realizado'].includes(String(orden.fase)))return false;
 if(['administrador','coordinadora'].includes(String(perfil.rol)))return true;
 if(perfil.permisosPersonalizados===true && p?.ordenesModificarFueraGrupo===true)return true;
 if(orden.operariaId===uid || orden.responsableId===uid)return true;
 const equipoOrden=equipoRutaOrden(orden,equipos);
 return (equipoActor==='A'||equipoActor==='B') && equipoOrden===equipoActor;
}
