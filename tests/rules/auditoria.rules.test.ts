import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, anonimo, UID,
} from './helpers';

/**
 * Auditoría y notificaciones: las dos colecciones donde un insider puede
 * hacer más daño con menos ruido. Los dos huecos de acá ya están abiertos
 * en `docs/sprints/BLOQUEOS.md` — estos tests los dejan ejecutables.
 */

beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => { await resetearConPerfiles(); });

describe('auditoria_admin · log append-only', () => {
  it('el log es inmutable: nadie actualiza ni borra, ni el admin', async () => {
    await sembrar('auditoria_admin/aud-1', {
      solicitanteUid: UID.admin, accion: 'reset-password',
    });
    await assertFails(updateDoc(doc(como(UID.admin), 'auditoria_admin/aud-1'), { accion: 'otra' }));
    await assertFails(deleteDoc(doc(como(UID.admin), 'auditoria_admin/aud-1')));
  });

  it('solo el admin puede leer el log', async () => {
    await sembrar('auditoria_admin/aud-2', { solicitanteUid: UID.admin });
    await assertSucceeds(getDoc(doc(como(UID.admin), 'auditoria_admin/aud-2')));
    for (const uid of [UID.coordinadora, UID.operaria, UID.tecnico]) {
      await assertFails(getDoc(doc(como(uid), 'auditoria_admin/aud-2')));
    }
  });

  it('un anónimo no puede escribir en el log', async () => {
    await assertFails(setDoc(doc(anonimo(), 'auditoria_admin/aud-anon'), { accion: 'x' }));
  });

  it('un tecnico NO puede falsificar entradas atribuyendolas a otro uid', async () => {
    // Fix SPRINT-FIX-C1 (2026-09-26): rule ahora exige
    // `solicitanteUid == request.auth.uid` (idem `actorUid`). Este test
    // era HUECO CONOCIDO #5 (assertSucceeds); invertido a assertFails
    // para verificar que el bloqueo esta en pie. Los endpoints server-side
    // (Admin SDK) bypasean rules y siguen escribiendo la auditoria correcta.
    await assertFails(
      setDoc(doc(como(UID.tecnico), 'auditoria_admin/falsa-1'), {
        solicitanteUid: UID.admin,          // ← se atribuye al admin
        accion: 'reset-password',
        detalle: 'entrada inventada por un tecnico',
      }),
    );
  });
});

describe('notificaciones', () => {
  it('cada quien lee las suyas', async () => {
    await sembrar('notificaciones/noti-1', { userId: UID.tecnico, titulo: 'Tu orden' });
    await assertSucceeds(getDoc(doc(como(UID.tecnico), 'notificaciones/noti-1')));
  });

  it('el dueño puede marcarla como leída', async () => {
    await sembrar('notificaciones/noti-2', { userId: UID.tecnico, leida: false });
    await assertSucceeds(
      updateDoc(doc(como(UID.tecnico), 'notificaciones/noti-2'), { leida: true }),
    );
  });

  it('un anónimo no lee notificaciones', async () => {
    await sembrar('notificaciones/noti-3', { userId: UID.tecnico });
    await assertFails(getDoc(doc(anonimo(), 'notificaciones/noti-3')));
  });

  it('HUECO CONOCIDO (SPRINT-WA-NOTIF-CREATE-RULE-FIX) — staff puede spoofear userId', async () => {
    // `allow create: if esStaff()` no valida que `userId` sea de quien escribe
    // ni que el destinatario tenga sentido. Cualquier miembro del staff puede
    // crear notificaciones a nombre de otro usuario. Está abierto en
    // BLOQUEOS.md. El fix natural es exigir que el creador sea staff de
    // oficina y que `userId` exista en `usuarios/`.
    await assertSucceeds(
      setDoc(doc(como(UID.tecnico), 'notificaciones/spoof-1'), {
        userId: UID.admin,               // ← notificación dirigida al admin
        titulo: 'Mensaje inventado',
        tipo: 'precio_aprobado',
      }),
    );
  });
});

describe('usuarios · escalada de privilegios', () => {
  it('un técnico NO puede cambiarse el rol a administrador', async () => {
    // El vector más directo: si pudiera escribir su propio doc de `usuarios/`,
    // se haría admin y toda la matriz de permisos se cae, porque el rol sale
    // justamente de ahí vía get().
    await assertFails(
      updateDoc(doc(como(UID.tecnico), `usuarios/${UID.tecnico}`), { rol: 'administrador' }),
    );
  });

  it('un técnico tampoco puede cambiarle el rol a otro', async () => {
    await assertFails(
      updateDoc(doc(como(UID.tecnico), `usuarios/${UID.operaria}`), { rol: 'ayudante' }),
    );
  });
});
