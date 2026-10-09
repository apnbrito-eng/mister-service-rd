import type { VercelRequest } from '@vercel/node';
const solicitudes = new WeakSet<object>();
/** Marca por identidad en memoria, jamás por header/body que un usuario pueda forjar. */
export async function conEnvioHorarioInterno<T>(req: VercelRequest, tarea:()=>Promise<T>):Promise<T> {
 solicitudes.add(req);
 try {return await tarea();}finally{solicitudes.delete(req);}
}
export function esEnvioHorarioInterno(req:VercelRequest):boolean{return solicitudes.has(req);}
