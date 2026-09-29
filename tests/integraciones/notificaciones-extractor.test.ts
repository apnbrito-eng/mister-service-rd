import { expect, it } from 'vitest';
import { extraerTiposEmitidos } from '../../scripts/invariantes/check-tipo-notificacion-huerfano';
it('reconoce ambas ramas emitidas por CRM mediante Admin SDK',()=>{
 const src=`tx.create(db.collection('notificaciones').doc(), { tipo: body.accion === 'transferir' ? 'crm_asignacion' : 'crm_traspaso' });`;
 expect([...extraerTiposEmitidos(src,'api/crm/atencion.ts')].sort()).toEqual(['crm_asignacion','crm_traspaso']);
});
it('conserva literales y admite ternarios anidados en crearNotificacion',()=>{
 const src=`crearNotificacion({tipo: (primero ? 'uno' : segundo ? 'dos' : 'tres') as TipoNotificacion}); crearNotificacion({tipo:'cuatro'});`;
 expect([...extraerTiposEmitidos(src,'src/flujo.ts')].sort()).toEqual(['cuatro','dos','tres','uno']);
});
it('no cuenta la condición, comentarios, otras propiedades ni variables como emisiones',()=>{
 const src=`// tipo: 'comentario'\ncrearNotificacion({tipo: modo === 'solo_condicion' ? 'emitida' : dinamico, titulo:'otro'}); const fuera={tipo:'fuera'};`;
 expect([...extraerTiposEmitidos(src,'src/flujo.ts')]).toEqual(['emitida']);
});
it('un tipo realmente ausente continúa ausente',()=>{
 const tipos=extraerTiposEmitidos(`crearNotificacion({tipo: listo ? 'crm_asignacion' : 'crm_asignacion'});`,'src/flujo.ts');
 expect(tipos.has('crm_traspaso')).toBe(false);
});
