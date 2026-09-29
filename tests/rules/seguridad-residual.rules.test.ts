import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, anonimo, UID } from './helpers';

// Regresiones: credenciales GPS privadas e identidad obligatoria en auditoría.
beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => { await resetearConPerfiles(); });

describe('configuración GPS · diagnóstico con credencial ficticia', () => {
  for (const uid of [UID.tecnico, UID.secretaria, UID.operaria, UID.coordinadora, UID.ayudante]) {
    it(`${uid} no puede leer la credencial GPS`, async () => {
      await sembrar('config_gps/sistema', { activo: true, apiKey: 'SOLO-PRUEBA-LOCAL' });
      await assertFails(getDoc(doc(como(uid), 'config_gps/sistema')));
    });
  }

  it('control: administrador lee; anónimo y usuario sin perfil no leen', async () => {
    await sembrar('config_gps/sistema', { apiKey: 'SOLO-PRUEBA-LOCAL' });
    await assertSucceeds(getDoc(doc(como(UID.admin), 'config_gps/sistema')));
    await assertFails(getDoc(doc(anonimo(), 'config_gps/sistema')));
    await assertFails(getDoc(doc(como(UID.sinPerfil), 'config_gps/sistema')));
  });
});

describe('auditoría · diagnóstico de identidad omitida', () => {
  it('rechaza auditoría sin actor y no persiste el registro', async () => {
    await assertFails(setDoc(doc(como(UID.tecnico), 'auditoria_admin/qa-sin-actor'), {
      accion: 'prueba-local',
    }));
    const snap = await getDoc(doc(como(UID.admin), 'auditoria_admin/qa-sin-actor'));
    expect(snap.exists()).toBe(false);
  });

  it('mantiene los dos formatos legítimos y rechaza identidad vacía o contradictoria', async () => {
    for (const campo of ['actorUid', 'solicitanteUid']) {
      await assertSucceeds(setDoc(doc(como(UID.tecnico), `auditoria_admin/qa-${campo}`), {
        accion: 'prueba-local', [campo]: UID.tecnico,
      }));
      for (const valor of ['', null, 123]) {
        await assertFails(setDoc(doc(como(UID.tecnico), 'auditoria_admin/qa-invalido'), {
          accion: 'prueba-local', [campo]: valor,
        }));
      }
    }
    await assertFails(setDoc(doc(como(UID.tecnico), 'auditoria_admin/qa-contradictorio'), {
      accion: 'prueba-local', actorUid: UID.tecnico, solicitanteUid: UID.admin,
    }));
  });

  it('control: identidad propia permitida; identidad ajena bloqueada', async () => {
    await assertSucceeds(setDoc(doc(como(UID.tecnico), 'auditoria_admin/qa-propio'), {
      accion: 'prueba-local', solicitanteUid: UID.tecnico, actorUid: UID.tecnico,
    }));
    for (const campo of ['solicitanteUid', 'actorUid']) {
      await assertFails(setDoc(doc(como(UID.tecnico), `auditoria_admin/qa-ajeno-${campo}`), {
        accion: 'prueba-local', [campo]: UID.admin,
      }));
    }
    await assertFails(setDoc(doc(anonimo(), 'auditoria_admin/qa-anonimo'), {
      accion: 'prueba-local',
    }));
  });
});

it('respaldo de asistencia y revisiones solo se acceden por el servidor autorizado', async () => {
  await sembrar('asistencia_evidencias/prueba', { imagen: 'IMAGEN-FICTICIA' });
  await sembrar('asistencia_revisiones/prueba', { motivo: 'Motivo ficticio' });
  for (const uid of [UID.admin, UID.coordinadora, UID.tecnico, UID.secretaria]) {
    await assertFails(getDoc(doc(como(uid), 'asistencia_evidencias/prueba')));
    await assertFails(setDoc(doc(como(uid), 'asistencia_revisiones/prueba'), { monto: 618 }));
  }
});
