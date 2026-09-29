import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  iniciarEntorno, entorno, resetearConPerfiles, sembrar, como, anonimo, UID,
} from './helpers';

/**
 * Superficie pública: todo lo que un visitante SIN sesión puede tocar.
 * Es el perímetro más expuesto del sistema y donde la auditoría de seguridad
 * del 2026-09-06 concentró la mitad de sus hallazgos.
 *
 * Algunos tests de acá NO describen el comportamiento deseado sino el ACTUAL:
 * son tests de caracterización de huecos conocidos y están marcados con
 * "HUECO CONOCIDO". Sirven para que, el día que alguien endurezca la rule,
 * el test se ponga en rojo y obligue a actualizarlo a conciencia en vez de
 * que el cambio pase inadvertido.
 */

beforeAll(async () => { await iniciarEntorno(); });
afterAll(async () => { await entorno().cleanup(); });
beforeEach(async () => { await resetearConPerfiles(); });

describe('citas_por_confirmar · formulario público de agendar', () => {
  it('un visitante usa el endpoint y no puede crear citas directamente', async () => {
    await assertFails(
      setDoc(doc(anonimo(), 'citas_por_confirmar/cita-1'), {
        clienteNombre: 'QA Test',
        telefono: '8090000000',
        origen: 'formulario_publico',
        estado: 'pendiente',
        createdAt: new Date(),
      }),
    );
  });

  it('preserva creación interna de secretaria para citas y garantías', async () => {
    await assertSucceeds(setDoc(doc(como(UID.secretaria), 'citas_por_confirmar/interna'), {
      clienteNombre: 'QA', telefono: '8090000000', origen: 'manual', estado: 'pendiente', createdAt: new Date(),
    }));
  });
  it('ni anónimo ni administrador cliente pueden alterar cuotas servidor', async () => {
    for (const coleccion of ['citas_publicas_control', 'citas_publicas_cuotas', 'citas_publicas_config', 'citas_publicas_alertas']) {
      await assertFails(setDoc(doc(anonimo(), `${coleccion}/x`), { total: 0 }));
      await assertFails(setDoc(doc(como(UID.admin), `${coleccion}/x`), { total: 0 }));
    }
  });

  it('pero NO puede leer las citas de los demás', async () => {
    await sembrar('citas_por_confirmar/cita-2', { clienteTelefono: '8090000000' });
    await assertFails(getDoc(doc(anonimo(), 'citas_por_confirmar/cita-2')));
  });

  it('ni modificarlas ni borrarlas', async () => {
    await sembrar('citas_por_confirmar/cita-3', { clienteTelefono: '8090000000' });
    await assertFails(updateDoc(doc(anonimo(), 'citas_por_confirmar/cita-3'), { clienteTelefono: 'X' }));
    await assertFails(deleteDoc(doc(anonimo(), 'citas_por_confirmar/cita-3')));
  });

  it('el staff sí las lee', async () => {
    await sembrar('citas_por_confirmar/cita-4', { clienteTelefono: '8090000000' });
    await assertSucceeds(getDoc(doc(como(UID.secretaria), 'citas_por_confirmar/cita-4')));
  });

  it('un anónimo NO puede crear cita con shape invalido / campos faltantes', async () => {
    // Fix SPRINT-FIX-A3 (2026-09-26): antes era HUECO CONOCIDO (hallazgo #4)
    // porque la rule era `allow create: if true`. Ahora la rule exige
    // clienteNombre + telefono + origen + estado + createdAt con caps de
    // tamaño. Un payload sin esos campos base debe ser rechazado.
    await assertFails(
      setDoc(doc(anonimo(), 'citas_por_confirmar/basura-1'), {
        campoInventado: 'x'.repeat(5000),
        otroCampoQueNadieEspera: { anidado: true },
      }),
    );
  });
});

describe('solicitudes_servicio · formularios dinámicos /f/:slug', () => {
  it('un visitante usa API y no puede crear directamente una solicitud', async () => {
    // Fix SPRINT-FIX-A3 (2026-09-26): la rule ahora exige formularioId +
    // estado + createdAt como shape base. `datos` sigue siendo mapa libre.
    await assertFails(
      setDoc(doc(anonimo(), 'solicitudes_servicio/sol-1'), {
        formularioId: 'qa',
        estado: 'pendiente',
        createdAt: new Date(),
        datos: { nombre: 'QA Test' },
      }),
    );
  });

  it('pero no puede leerlas', async () => {
    await sembrar('solicitudes_servicio/sol-2', { formularioSlug: 'qa' });
    await assertFails(getDoc(doc(anonimo(), 'solicitudes_servicio/sol-2')));
  });
});

describe('ubicaciones_vehiculos · GPS de los técnicos', () => {
  it('HUECO CONOCIDO (hallazgo #6) — cualquiera sin sesión lee la ubicación en vivo', async () => {
    // `allow read: if true` sobre toda la colección. Expone la posición en
    // tiempo real de TODOS los vehículos de la empresa a cualquier persona
    // que sepa el id del documento, sin token ni relación con una orden.
    // Es un tema de privacidad de los técnicos, no solo de datos de negocio.
    // Cuando se acote a staff o a token de orden, este test pasa a assertFails.
    await sembrar('ubicaciones_vehiculos/veh-1', {
      vehiculoId: 'veh-1', tecnicoNombre: 'QA tecnico', lat: 18.48, lng: -69.93,
    });
    await assertSucceeds(getDoc(doc(anonimo(), 'ubicaciones_vehiculos/veh-1')));
  });

  it('escribir sí requiere staff', async () => {
    await assertFails(
      setDoc(doc(anonimo(), 'ubicaciones_vehiculos/veh-2'), { lat: 0, lng: 0 }),
    );
    await assertSucceeds(
      setDoc(doc(como(UID.tecnico), 'ubicaciones_vehiculos/veh-2'), { lat: 18.4, lng: -69.9 }),
    );
  });
});

describe('clientes · datos personales', () => {
  it('un anónimo no puede leer la ficha de un cliente', async () => {
    await sembrar('clientes/cli-1', { nombre: 'QA Test', telefono: '8090000000' });
    await assertFails(getDoc(doc(anonimo(), 'clientes/cli-1')));
  });
});
