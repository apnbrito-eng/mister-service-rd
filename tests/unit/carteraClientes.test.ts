import test from 'node:test';
import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';
import { autorizarCartera, asignarCartera, validarTraslado } from '../../api/_lib/carteraClientes.js';

test('traslados requieren equipo válido y motivo concreto', () => {
  assert.throws(() => validarTraslado('C', 'Cobertura de ruta'));
  assert.throws(() => validarTraslado('B', '  '));
  assert.deepEqual(validarTraslado('B', '  Cobertura de ruta  '), { destino: 'B', motivo: 'Cobertura de ruta' });
});

test('reintento de asignación conserva cartera y no avanza cursor', async () => {
  let escrituras = 0;
  const ref = { collection: () => ({ doc: () => ({}) }) };
  const db = {
    collection: () => ({ doc: () => ref }),
    runTransaction: async (fn: (tx: unknown) => unknown) => fn({
      get: async () => ({ exists: true, data: () => ({ carteraEquipo: 'B' }) }),
      update: () => { escrituras++; }, set: () => { escrituras++; }, create: () => { escrituras++; },
    }),
  } as unknown as Firestore;
  assert.equal(await asignarCartera(db, 'cliente', 'actor'), 'B');
  assert.equal(escrituras, 0);
});

test('altas alternan A/B y registran cursor e historial en la misma transacción', async () => {
  let ultimoEquipo: string | undefined;
  const carteras = new Map<string, string>();
  const db = {
    collection: (nombre: string) => ({ doc: (id: string) => ({ nombre, id, collection: (sub: string) => ({ doc: (entry: string) => ({ nombre: sub, id: `${id}/${entry}` }) }) }) }),
    runTransaction: async (fn: (tx: unknown) => unknown) => fn({
      get: async (ref: { nombre: string; id: string }) => ({ exists: true, data: () => ref.nombre === 'config' ? { ultimoEquipo } : ref.nombre === 'usuarios' ? { nombre: 'Responsable' } : { carteraEquipo: carteras.get(ref.id) } }),
      update: (ref: { id: string }, data: { carteraEquipo: string }) => { carteras.set(ref.id, data.carteraEquipo); },
      set: (_ref: unknown, data: { ultimoEquipo: string }) => { ultimoEquipo = data.ultimoEquipo; },
      create: (_ref: unknown, data: { origen: string; actorUid: string }) => { assert.equal(data.origen, 'alta'); assert.equal(data.actorUid, 'actor'); },
    }),
  } as unknown as Firestore;
  assert.equal(await asignarCartera(db, 'uno', 'actor'), 'A');
  assert.equal(await asignarCartera(db, 'dos', 'actor'), 'B');
  assert.equal(await asignarCartera(db, 'dos', 'actor'), 'B');
  assert.equal(await asignarCartera(db, 'tres', 'actor'), 'A');
});

test('secretaria y operaria tienen el mismo gate y respetan revocación individual', () => {
  for (const rol of ['secretaria', 'operaria']) {
    assert.doesNotThrow(() => autorizarCartera(rol, { activo: true }));
    assert.throws(() => autorizarCartera(rol, { permisosPersonalizados: true, permisosSistema: { clientesModificar: false } }));
    assert.throws(() => autorizarCartera(rol, { activo: false }));
  }
  assert.throws(() => autorizarCartera('tecnico', { activo: true }));
});
