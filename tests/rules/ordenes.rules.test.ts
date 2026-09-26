import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
  iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, anonimo, UID,
} from './helpers';

/**
 * `ordenes_servicio` es el spine del sistema: 50 archivos la leen y 29 la
 * escriben. Su rule concentra la regla de negocio R4 (defense-in-depth contra
 * inflación de precio y skip de la revisión de oficina) y hasta el 2026-09-09
 * tenía además una rama de lectura pública.
 */

const ORDEN = 'ordenes_servicio/OS-0001';

/** Orden base: asignada al técnico `UID.tecnico`, sin aprobar. */
function ordenBase(extra: Record<string, unknown> = {}) {
  return {
    numero: 'OS-0001',
    clienteNombre: 'QA Test',
    clienteTelefono: '8090000000',
    tecnicoId: UID.tecnico,
    tecnicoNombre: 'QA tecnico',
    fase: 'en_diagnostico',
    precioFinal: 5000,
    estadoAprobacion: 'pendiente',
    soloChequeo: false,
    eliminada: false,
    ...extra,
  };
}

beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => { await resetearConPerfiles(); });

describe('ordenes_servicio · lectura', () => {
  it('REGRESIÓN #2 — un visitante SIN sesión no puede leer una orden', async () => {
    await sembrar(ORDEN, ordenBase());
    await assertFails(getDoc(doc(anonimo(), ORDEN)));
  });

  it('REGRESIÓN #2 — tampoco puede leerla con trackingGPS.activo = true', async () => {
    // Este es el test que cierra el hallazgo #2 de la auditoría de seguridad.
    // La rule vieja decía:
    //   allow read: if (resource.data.trackingGPS.activo == true) || esStaff();
    // y exponía el documento COMPLETO — precios, costos, margen, teléfono,
    // dirección y notas internas — a cualquiera sin autenticar. Estaba dormida
    // sólo porque ningún camino del código escribe `activo` (todos usan
    // `habilitado`). Si alguien "arregla" el tracking unificando el nombre del
    // campo, este test tiene que seguir en rojo para que no se reabra la fuga.
    await sembrar(ORDEN, ordenBase({ trackingGPS: { activo: true, token: 'tok-123' } }));
    await assertFails(getDoc(doc(anonimo(), ORDEN)));
  });

  it('un autenticado SIN doc en usuarios/ tampoco lee (audit C3, no hay perfil demo)', async () => {
    await sembrar(ORDEN, ordenBase());
    await assertFails(getDoc(doc(como(UID.sinPerfil), ORDEN)));
  });

  it('cualquier rol de staff sí lee', async () => {
    await sembrar(ORDEN, ordenBase());
    for (const uid of [UID.admin, UID.coordinadora, UID.secretaria, UID.operaria, UID.tecnico, UID.ayudante]) {
      await assertSucceeds(getDoc(doc(como(uid), ORDEN)));
    }
  });
});

describe('ordenes_servicio · creación', () => {
  it('la oficina puede crear', async () => {
    for (const uid of [UID.admin, UID.coordinadora, UID.secretaria, UID.operaria]) {
      await assertSucceeds(
        setDoc(doc(como(uid), `ordenes_servicio/OS-${uid}`), ordenBase()),
      );
    }
  });

  it('técnico y ayudante NO pueden crear órdenes', async () => {
    for (const uid of [UID.tecnico, UID.ayudante]) {
      await assertFails(
        setDoc(doc(como(uid), `ordenes_servicio/OS-nueva-${uid}`), ordenBase()),
      );
    }
  });

  it('un anónimo no puede crear una orden', async () => {
    await assertFails(setDoc(doc(anonimo(), 'ordenes_servicio/OS-anon'), ordenBase()));
  });
});

describe('ordenes_servicio · R4, el gate de aprobación de oficina', () => {
  beforeEach(async () => { await sembrar(ORDEN, ordenBase()); });

  it('el técnico asignado puede actualizar campos operativos de SU orden', async () => {
    await assertSucceeds(
      updateDoc(doc(como(UID.tecnico), ORDEN), { diagnostico: 'Compresor quemado' }),
    );
  });

  it('un técnico distinto NO puede tocar la orden de otro', async () => {
    await assertFails(
      updateDoc(doc(como(UID.tecnicoOtro), ORDEN), { diagnostico: 'intruso' }),
    );
  });

  it('el técnico NO puede pasar a trabajo_realizado sin aprobación previa', async () => {
    await assertFails(
      updateDoc(doc(como(UID.tecnico), ORDEN), { fase: 'trabajo_realizado' }),
    );
  });

  it('el técnico NO puede cambiar precioFinal (afecta su propia comisión)', async () => {
    await assertFails(
      updateDoc(doc(como(UID.tecnico), ORDEN), { precioFinal: 99000 }),
    );
  });

  it('el técnico NO puede auto-aprobarse cambiando estadoAprobacion', async () => {
    // El bypass obvio es hacerlo en dos writes: primero aprobar, después subir
    // el precio. Los campos de aprobación son inmutables desde técnico
    // justamente para cerrar esa puerta.
    await assertFails(
      updateDoc(doc(como(UID.tecnico), ORDEN), { estadoAprobacion: 'aprobado' }),
    );
  });

  it('el técnico NO puede reasignarse la orden a sí mismo ni a otro', async () => {
    await assertFails(
      updateDoc(doc(como(UID.tecnicoOtro), ORDEN), { tecnicoId: UID.tecnicoOtro }),
    );
  });

  it('el técnico NO puede tocar el flag soloChequeo', async () => {
    await assertFails(
      updateDoc(doc(como(UID.tecnico), ORDEN), { soloChequeo: true }),
    );
  });

  it('la oficina sí puede aprobar y mover el precio', async () => {
    await assertSucceeds(
      updateDoc(doc(como(UID.coordinadora), ORDEN), {
        estadoAprobacion: 'aprobado',
        precioFinal: 7500,
      }),
    );
  });
});
