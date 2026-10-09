import { getAuth } from 'firebase/auth';
export interface ItemHorario { ordenId: string; editable:boolean; enviable:boolean; clienteNombre: string; equipoId: string | null; fecha: string; respuestaHorario?:string|null; solicitudHorario?:string|null; franja: {inicio:string;fin:string} | null; waId: string | null; version: string | null; bloqueos: string[] }
export interface LoteHorarios { fecha:string; items:ItemHorario[]; envioHabilitado:boolean; motivo:string }
export async function pedirLoteHorarios(body: Record<string, unknown>): Promise<LoteHorarios> {
 const usuario = getAuth().currentUser;
 if (!usuario) throw new Error('Inicia sesión.');
 const respuesta = await fetch('/api/citas/lote-horarios', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${await usuario.getIdToken()}`}, body:JSON.stringify(body) });
 const datos = await respuesta.json();
 if (!respuesta.ok) throw new Error(datos.error || 'No se pudo preparar el lote.');
 return datos;
}
