import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';
import { CONFIG_FORMULARIO_AGENDAR_DEFAULTS } from '../../src/types/configFormularioAgendar';
const m = vi.hoisted(() => ({ db: null as any, auth: { currentUser: { uid: 'uid-admin' } as {uid:string}|null } }));
// Solo se sustituye la selección de sesión/conexión. El SDK, los escritores y
// las reglas son reales, ejecutados contra el emulador con datos ficticios.
vi.mock('../../src/firebase/config', () => ({ get db() { return m.db; }, auth: m.auth }));
let guardar: typeof import('../../src/services/formularioAgendar.service').guardarConfigFormularioAgendar;
let pago: typeof import('../../src/services/ordenes.service').confirmarPagoOrden;
let descuento: typeof import('../../src/utils/comisiones').aplicarDescuentoGarantiaPorPiezas;
beforeAll(async () => {
 await iniciarEntorno(); m.db = como(UID.admin);
 guardar = (await import('../../src/services/formularioAgendar.service')).guardarConfigFormularioAgendar;
 pago = (await import('../../src/services/ordenes.service')).confirmarPagoOrden;
 descuento = (await import('../../src/utils/comisiones')).aplicarDescuentoGarantiaPorPiezas;
});
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => { await resetearConPerfiles(); m.auth.currentUser = {uid:UID.admin}; });
const audits = async () => (await getDocs(collection(m.db, 'auditoria_admin'))).docs.map(d => d.data());
describe('escritores reales y reglas de identidad', () => {
 it('guarda formulario y auditoría aunque el perfil tenga otro id', async () => {
  await guardar(CONFIG_FORMULARIO_AGENDAR_DEFAULTS, { id: 'documento-personal', nombre: 'QA' });
  expect((await getDoc(doc(m.db,'config_web/sitio'))).exists()).toBe(true);
  expect(await audits()).toEqual([expect.objectContaining({solicitanteUid:UID.admin,accion:'editar_config_formulario_agendar'})]);
 });
 it('si las reglas rechazan la auditoría tampoco se guarda el formulario', async () => {
  // Simula una sesión que cambió entre capturar la identidad y enviar el lote.
  m.auth.currentUser = {uid:'otra-sesion'};
  await expect(guardar(CONFIG_FORMULARIO_AGENDAR_DEFAULTS,{nombre:'QA'})).rejects.toBeDefined();
  expect((await getDoc(doc(m.db,'config_web/sitio'))).exists()).toBe(false);
  expect(await audits()).toHaveLength(0);
 });
 it('confirma el pago y su auditoría con la sesión, no con el id de perfil', async () => {
  await sembrar('ordenes_servicio/qa-pago',{fase:'en_diagnostico',pagos:[{id:'p',monto:500,metodo:'efectivo',fecha:'2026-09-29',verificado:false}]});
  expect(await pago('qa-pago','p',{id:'documento-personal',nombre:'QA'})).toEqual({ok:true});
  expect((await getDoc(doc(m.db,'ordenes_servicio/qa-pago'))).data()?.pagos[0]).toMatchObject({verificado:true,verificadoPorId:UID.admin,monto:500});
  expect(await audits()).toEqual([expect.objectContaining({actorUid:UID.admin,monto:500})]);
 });
 it('aplica descuento y auditoría juntos con UID de sesión aunque el parámetro esté vacío', async () => {
  await sembrar('comisiones/qa-comision',{ordenId:'original',tecnicoId:UID.tecnico,estadoLiquidacion:'pendiente',comisionMonto:1500});
  await sembrar('ordenes_servicio/qa-garantia',{esGarantia:true,referenciaOrdenId:'original',tecnicoOriginalUid:UID.tecnico,cierreServicio:{fechaCierre:new Date(),piezasValidadasPorAdmin:true,piezasUsadas:[{cantidad:2,costoUnitario:500}]}});
  expect(await descuento({ordenGarantiaId:'qa-garantia',ordenOriginalId:'original',tecnicoOriginalUid:UID.tecnico,costoPiezasReReparacion:1000,solicitanteUid:''})).toMatchObject({aplicado:true,monto:-100});
  expect((await getDoc(doc(m.db,'comisiones/qa-comision'))).data()?.descuentoPorGarantia).toMatchObject({monto:-100,aplicadoPor:UID.admin});
  expect(await audits()).toEqual([expect.objectContaining({solicitanteUid:UID.admin,monto:-100})]);
 });
 it('sin sesión el formulario rechaza antes de guardar', async () => {
  m.auth.currentUser=null;
  await expect(guardar(CONFIG_FORMULARIO_AGENDAR_DEFAULTS,{nombre:'QA'})).rejects.toThrow('sesión');
  expect((await getDoc(doc(m.db,'config_web/sitio'))).exists()).toBe(false);
  expect(await audits()).toHaveLength(0);
 });
});
