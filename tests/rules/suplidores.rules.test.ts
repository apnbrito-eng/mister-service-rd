import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, UID } from './helpers';

beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => { await resetearConPerfiles(); });

const ID = '8095550000';
const nuevo = (uid: string, extra: Record<string, unknown> = {}) => ({
  nombre: 'Repuestos Norte', telefono: '809-555-0000', telefonoNormalizado: ID, especialidad: 'Lavadoras', notas: '',
  activo: true, creadoPor: uid, actualizadoPor: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
});

it.each([UID.admin, UID.coordinadora, UID.secretaria, UID.operaria])('oficina crea y lee (%s)', async uid => {
  await assertSucceeds(setDoc(doc(como(uid), 'suplidores', ID), nuevo(uid)));
  await assertSucceeds(getDoc(doc(como(uid), 'suplidores', ID)));
});

it.each([UID.tecnico, UID.ayudante, UID.sinPerfil])('técnico, ayudante y sin perfil no leen ni escriben (%s)', async uid => {
  await sembrar(`suplidores/${ID}`, { nombre: 'X', telefonoNormalizado: ID });
  await assertFails(getDoc(doc(como(uid), 'suplidores', ID)));
  await assertFails(setDoc(doc(como(uid), 'suplidores', '8095551111'), nuevo(uid, { telefonoNormalizado: '8095551111' })));
});

it('rechaza ID distinto del teléfono, campos extra, actor ajeno y datos del cliente', async () => {
  const db = como(UID.operaria);
  await assertFails(setDoc(doc(db, 'suplidores', '8095551111'), nuevo(UID.operaria)));
  await assertFails(setDoc(doc(db, 'suplidores', ID), nuevo(UID.operaria, { clienteNombre: 'Privado' })));
  await assertFails(setDoc(doc(db, 'suplidores', ID), nuevo(UID.admin)));
  await assertFails(setDoc(doc(db, 'suplidores', ID), nuevo(UID.operaria, { nombre: 'A' })));
});

it('update conserva creador y fecha; no se puede borrar', async () => {
  const db = como(UID.operaria);
  await assertSucceeds(setDoc(doc(db, 'suplidores', ID), nuevo(UID.operaria)));
  await assertSucceeds(updateDoc(doc(como(UID.secretaria), 'suplidores', ID), { activo: false, actualizadoPor: UID.secretaria, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(como(UID.secretaria), 'suplidores', ID), { creadoPor: UID.secretaria, actualizadoPor: UID.secretaria, updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(como(UID.admin), 'suplidores', ID)));
});
it('anónimo no lee ni crea suplidores', async () => {
 const db=entorno().unauthenticatedContext().firestore();
 await assertFails(getDoc(doc(db,'suplidores',ID)));
 await assertFails(setDoc(doc(db,'suplidores',ID),nuevo(UID.admin)));
});
it('update rechaza actor falso, createdAt alterado y campos adicionales', async () => {
 const ref=doc(como(UID.admin),'suplidores',ID);
 await assertSucceeds(setDoc(ref,nuevo(UID.admin)));
 await assertFails(updateDoc(ref,{notas:'Cambio',actualizadoPor:UID.operaria,updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{createdAt:Timestamp.fromMillis(0),actualizadoPor:UID.admin,updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{saldo:100,actualizadoPor:UID.admin,updatedAt:serverTimestamp()}));
});
it('rechaza campos inválidos y teléfono normalizado mutable', async () => {
 const ref=doc(como(UID.admin),'suplidores',ID);
 await assertFails(setDoc(ref,nuevo(UID.admin,{activo:'sí'})));
 await assertFails(setDoc(ref,nuevo(UID.admin,{updatedAt:Timestamp.fromMillis(0)})));
 await assertSucceeds(setDoc(ref,nuevo(UID.admin)));
 await assertFails(updateDoc(ref,{telefonoNormalizado:'8095552222',actualizadoPor:UID.admin,updatedAt:serverTimestamp()}));
 expect((await getDoc(ref)).data()?.telefonoNormalizado).toBe(ID);
});
