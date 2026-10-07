import { beforeAll, afterAll, beforeEach, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, anonimo, UID } from './helpers';
beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => { await resetearConPerfiles(); });
it('solo dirección accede al domicilio, cédula y referencias; no personal operativo ni anónimos', async () => {
  await sembrar('personal_privado/p', { cedula: 'PRUEBA', direccion: 'Domicilio ficticio' });
  for (const uid of [UID.admin, UID.coordinadora]) {
    await assertSucceeds(getDoc(doc(como(uid), 'personal_privado/p')));
    await assertSucceeds(setDoc(doc(como(uid), 'personal_privado/nuevo'), { direccion: 'Prueba' }));
  }
  for (const uid of [UID.secretaria, UID.operaria, UID.tecnico]) {
    await assertFails(getDoc(doc(como(uid), 'personal_privado/p')));
    await assertFails(setDoc(doc(como(uid), 'personal_privado/nuevo'), { cedula: 'Prueba' }));
  }
  await assertFails(getDoc(doc(anonimo(), 'personal_privado/p')));
});
