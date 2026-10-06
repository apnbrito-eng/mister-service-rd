import { beforeAll, afterAll, beforeEach, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, getDocs, getDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';
beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(resetearConPerfiles);
it('reconoce GPS legacy de personal por uid y protege el vínculo', async () => {
  await sembrar('personal/persona-prueba', { uid: UID.tecnico, rol: 'tecnico', activo: true });
  await sembrar('ubicaciones_vehiculos/van-prueba', { tecnicoId: 'persona-prueba', lat: 18, lng: -69 });
  await assertSucceeds(getDoc(doc(como(UID.tecnico), 'ubicaciones_vehiculos/van-prueba')));
  await assertSucceeds(updateDoc(doc(como(UID.tecnico), 'ubicaciones_vehiculos/van-prueba'), { lat: 18.1 }));
  await assertFails(updateDoc(doc(como(UID.tecnico), 'ubicaciones_vehiculos/van-prueba'), { tecnicoId: UID.tecnicoOtro }));
  await assertFails(setDoc(doc(como(UID.tecnicoOtro), 'ubicaciones_vehiculos/otra-van'), { tecnicoId: 'persona-prueba', lat: 18, lng: -69 }));
});
it('solo oficina puede consultar la flota completa', async () => {
  await sembrar('ubicaciones_vehiculos/van', { tecnicoId: UID.tecnico });
  await assertSucceeds(getDocs(collection(como(UID.operaria), 'ubicaciones_vehiculos')));
  await assertFails(getDocs(collection(como(UID.tecnico), 'ubicaciones_vehiculos')));
  await assertFails(getDocs(collection(como(UID.ayudante), 'ubicaciones_vehiculos')));
});
it('perfiles inactivos o eliminados no consultan ubicaciones', async () => {
  await sembrar('ubicaciones_vehiculos/van', { tecnicoId: UID.tecnico });
  await sembrar(`usuarios/${UID.operaria}`, { rol: 'operaria', activo: false });
  await sembrar(`usuarios/${UID.tecnico}`, { rol: 'tecnico', eliminado: true });
  await assertFails(getDoc(doc(como(UID.operaria), 'ubicaciones_vehiculos/van')));
  await assertFails(getDoc(doc(como(UID.tecnico), 'ubicaciones_vehiculos/van')));
});
it('cuotas y locks servidor nunca son modificables por clientes', async () => {
  await sembrar('config_mapa/uso_2026-10', { solicitudes: 5 });
  await assertFails(getDoc(doc(como(UID.admin), 'config_mapa/uso_2026-10')));
  await assertFails(updateDoc(doc(como(UID.admin), 'config_mapa/uso_2026-10'), { solicitudes: 0 }));
});
