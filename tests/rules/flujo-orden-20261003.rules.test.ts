import { beforeAll, afterAll, beforeEach, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';
beforeAll(iniciarEntorno);
afterAll(()=>entorno().cleanup());
beforeEach(async()=>{
 await resetearConPerfiles();
 await sembrar('ordenes_servicio/o',{tecnicoId:UID.tecnico,operariaId:UID.operaria,fase:'en_cotizacion',presupuestoEstado:'pendiente_cliente',estadoAprobacion:'pendiente',precioFinal:5200,precioAprobado:5200});
});
it('operaria acepta el monto aprobado y no puede modificarlo al aceptar',async()=>{
 const ref=doc(como(UID.operaria),'ordenes_servicio/o');
 await assertFails(updateDoc(ref,{presupuestoEstado:'aceptado',estadoAprobacion:'aprobado',presupuestoAceptadoPor:UID.operaria,precioFinal:6000}));
 await assertSucceeds(updateDoc(ref,{presupuestoEstado:'aceptado',estadoAprobacion:'aprobado',presupuestoAceptadoPor:UID.operaria}));
});
it('secretaria ajena no acepta presupuesto y técnico no autoriza',async()=>{
 for(const uid of [UID.secretaria,UID.tecnico]) await assertFails(updateDoc(doc(como(uid),'ordenes_servicio/o'),{presupuestoEstado:'aceptado',estadoAprobacion:'aprobado',presupuestoAceptadoPor:uid}));
});
it('cambio solicitado no habilita técnico; coordinadora aprueba el nuevo total',async()=>{
 await assertSucceeds(updateDoc(doc(como(UID.operaria),'ordenes_servicio/o'),{presupuestoEstado:'cambio_solicitado',presupuestoMontoPropuesto:4800,estadoAprobacion:'pendiente'}));
 await assertFails(updateDoc(doc(como(UID.tecnico),'ordenes_servicio/o'),{fase:'trabajo_realizado'}));
 await assertSucceeds(updateDoc(doc(como(UID.coordinadora),'ordenes_servicio/o'),{presupuestoEstado:'pendiente_cliente',precioFinal:4800,precioAprobado:4800,estadoAprobacion:'pendiente'}));
});
it('no permite falsificar entrega de efectivo, salida ni cancelar visita desde cliente',async()=>{
 for(const uid of [UID.admin, UID.coordinadora, UID.operaria, UID.secretaria, UID.tecnico, UID.ayudante])
  for(const campo of ['efectivoAceptaciones','efectivoEntregas','salidaTecnico','visitaCancelada']) await assertFails(updateDoc(doc(como(uid),'ordenes_servicio/o'),{[campo]:{uid}}));
});
it('aceptación efectivo impide alterar pago ya reconocido',async()=>{
 await sembrar('ordenes_servicio/o',{efectivoAceptaciones:{p1:{monto:5200}},pagos:[{id:'p1',monto:5200}]});
 await assertFails(updateDoc(doc(como(UID.admin),'ordenes_servicio/o'),{pagos:[{id:'p1',monto:2000}]}));
});
it('piezas enviadas son internas; técnico puede enviar pero no leer ni modificar',async()=>{
 const path='ordenes_servicio/o/interno/piezas_1';
 await assertFails(setDoc(doc(como(UID.tecnico),path),{tecnicoUid:UID.tecnico,fecha:new Date(),piezas:[{nombre:'Bomba',cantidad:1,costo:1000,foto:'https://example.test/foto'}]}));
 await sembrar(path,{tecnicoUid:UID.tecnico,piezas:[{nombre:'Bomba',cantidad:1,costo:1000,foto:'https://example.test/foto'}]});
 await assertFails(getDoc(doc(como(UID.tecnico),path)));
 await assertSucceeds(getDoc(doc(como(UID.coordinadora),path)));
 await assertFails(updateDoc(doc(como(UID.tecnico),path),{piezas:[]}));
});
it('coordinadora puede resolver reparación rechazada como solo chequeo',async()=>{
 await assertSucceeds(updateDoc(doc(como(UID.coordinadora),'ordenes_servicio/o'),{soloChequeo:true,precioChequeo:2000,precioFinal:2000,estadoAprobacion:'aprobado',chequeoConfirmacionEstado:'pendiente'}));
});
it('nuevo flujo de efectivo no permite retirar la obligación antes de aceptar',async()=>{
 await sembrar('ordenes_servicio/o',{flujoEfectivo:'confirmacion_tecnico',pagos:[{id:'p1',monto:5200,requiereAceptacionEfectivo:true}]});
 await assertFails(updateDoc(doc(como(UID.admin),'ordenes_servicio/o'),{pagos:[{id:'p1',monto:5200}]}));
});
it('solo chequeo confirmable por operaria asignada, sin alterar el importe',async()=>{
 await sembrar('ordenes_servicio/o',{operariaId:UID.operaria,tecnicoId:UID.tecnico,soloChequeo:true,chequeoConfirmacionEstado:'pendiente',precioFinal:2000,precioChequeo:2000});
 for(const uid of [UID.tecnico,UID.secretaria]) await assertFails(updateDoc(doc(como(uid),'ordenes_servicio/o'),{chequeoConfirmacionEstado:'confirmado',chequeoConfirmadoPor:uid}));
 await assertFails(updateDoc(doc(como(UID.operaria),'ordenes_servicio/o'),{chequeoConfirmacionEstado:'confirmado',chequeoConfirmadoPor:UID.operaria,precioChequeo:1000}));
 await assertSucceeds(updateDoc(doc(como(UID.operaria),'ordenes_servicio/o'),{chequeoConfirmacionEstado:'confirmado',chequeoConfirmadoPor:UID.operaria}));
});

it('no permite cierre con aprobación antigua y presupuesto nuevo pendiente',async()=>{
 for(const presupuestoEstado of ['cambio_solicitado','pendiente_cliente']) {
  await sembrar('ordenes_servicio/o',{tecnicoId:UID.tecnico,estadoAprobacion:'aprobado',presupuestoEstado});
  await assertFails(updateDoc(doc(como(UID.tecnico),'ordenes_servicio/o'),{fase:'trabajo_realizado'}));
 }
});

it('conserva cierre de reparación aceptada y solo chequeo aprobado',async()=>{
 for(const extra of [{presupuestoEstado:'aceptado'}, {soloChequeo:true,presupuestoEstado:'cambio_solicitado'}]) {
  await sembrar('ordenes_servicio/o',{tecnicoId:UID.tecnico,estadoAprobacion:'aprobado',fase:'en_cotizacion',...extra});
  await assertSucceeds(updateDoc(doc(como(UID.tecnico),'ordenes_servicio/o'),{fase:'trabajo_realizado'}));
 }
});
