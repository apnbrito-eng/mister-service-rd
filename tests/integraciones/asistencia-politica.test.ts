import {expect,it} from 'vitest';
import {evaluarAsistencia} from '../../api/_lib/asistenciaPolitica';
const ahora=new Date('2026-09-26T19:00:00-04:00');
it('respeta tolerancia y tramos de tardanza completos',()=>{
 for(const [hora,monto,minutos] of [['08:10',0,0],['08:11',100,11],['08:15',100,15],['08:59',100,59],['09:00',200,60]] as const){expect(evaluarAsistencia('2026-09-25',new Date(`2026-09-25T${hora}:00-04:00`),ahora)).toMatchObject({sugerido:monto,minutos});}
});
it('separa falta por confirmar, hoy, futuro, domingo y feriado pagado',()=>{
 expect(evaluarAsistencia('2026-09-25',null,ahora)).toMatchObject({tipo:'sin_ponche',sugerido:618});
 expect(evaluarAsistencia('2026-09-26',null,ahora)).toMatchObject({tipo:'dia_en_curso',sugerido:0});
 expect(evaluarAsistencia('2026-09-28',null,ahora)).toMatchObject({tipo:'futuro',sugerido:0});
 expect(evaluarAsistencia('2026-09-20',null,ahora)).toMatchObject({tipo:'descanso',sugerido:0});
 expect(evaluarAsistencia('2026-09-24',null,ahora)).toMatchObject({tipo:'feriado',sugerido:0});
 expect(evaluarAsistencia('2027-09-25',null,ahora)).toMatchObject({tipo:'calendario_pendiente',sugerido:0});
});
