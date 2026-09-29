// Calendario 2026 publicado por Ministerio de Trabajo / Presidencia, 05-11-2025.
export const FERIADOS_RD_2026 = new Set(['2026-01-01','2026-01-05','2026-01-21','2026-01-26','2026-02-27','2026-04-03','2026-05-04','2026-06-04','2026-08-16','2026-09-24','2026-11-09','2026-12-25']);
export function fechaRD(fecha:Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(fecha);}
export function evaluarAsistencia(dia:string, entrada:Date|null, ahora=new Date()){
 if(!dia.startsWith('2026-'))return {tipo:'calendario_pendiente',sugerido:0,minutos:0};
 if(FERIADOS_RD_2026.has(dia))return {tipo:'feriado',sugerido:0,minutos:0};
 if(new Date(`${dia}T12:00:00-04:00`).getUTCDay()===0)return {tipo:'descanso',sugerido:0,minutos:0};
 if(dia>fechaRD(ahora))return {tipo:'futuro',sugerido:0,minutos:0};
 if(!entrada)return {tipo:dia===fechaRD(ahora)?'dia_en_curso':'sin_ponche',sugerido:dia===fechaRD(ahora)?0:618,minutos:0};
 const minutos=Math.floor((entrada.getTime()-new Date(`${dia}T08:00:00-04:00`).getTime())/60000);
 if(minutos<=10)return {tipo:'a_tiempo',sugerido:0,minutos:0};
 return {tipo:'tardanza',sugerido:minutos<60?100:200,minutos};
}
