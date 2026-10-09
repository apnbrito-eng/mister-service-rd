import test from 'node:test';import assert from 'node:assert/strict';
import {badgesParaRuta} from '../../src/navigation/badgesSidebar.js';
test('cero aparece solo tras carga completa; errores no aparentan cero',()=>{
 assert.equal(badgesParaRuta('/admin/citas',{citasCount:0},{})[0].texto,'—');
 assert.equal(badgesParaRuta('/admin/citas',{citasCount:0},{citasCount:'disponible'})[0].texto,'0');
 assert.equal(badgesParaRuta('/admin/citas',{citasCount:3},{citasCount:'error'})[0].texto,'—');
 assert.match(badgesParaRuta('/admin/citas',{citasCount:3},{citasCount:'error'})[0].descripcion,/no disponibles/);
});
test('standby conserva unidades independientes sin suma ficticia',()=>{
 const b=badgesParaRuta('/admin/standby',{standbyCount:4,ordenesStandbyCount:2},{standbyCount:'disponible',ordenesStandbyCount:'disponible'});
 assert.deepEqual(b.map(x=>x.texto),['4','2']);assert.deepEqual(b.map(x=>x.descripcion),['4 piezas pendientes','2 órdenes en espera']);
});
test('pagos e inbox anuncian unidad real y módulos sin fuente no inventan badge',()=>{
 assert.equal(badgesParaRuta('/admin/pagos-pendientes',{pagosPendientesCount:2},{pagosPendientesCount:'disponible'})[0].descripcion,'2 órdenes con pagos sin verificar');
 assert.equal(badgesParaRuta('/admin/inbox',{whatsappInboxCount:2},{whatsappInboxCount:'disponible'})[0].descripcion,'2 conversaciones sin leer');
 assert.deepEqual(badgesParaRuta('/admin/sin-fuente',{},{}),[]);
});
