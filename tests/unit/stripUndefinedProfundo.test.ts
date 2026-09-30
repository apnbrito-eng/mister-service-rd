/**
 * Tests para `stripUndefinedProfundo` en `src/services/solicitudes.service.ts`.
 *
 * Regla P-020: helpers de limpieza recursiva DEBEN preservar instancias de
 * clase (Date, Timestamp, FieldValue) intactas. Recursar sobre ellas las
 * reconstruye como mapas planos vacíos y destruye el sentinel — corrompe
 * contadores en Firestore y fechas.
 *
 * Cobertura de estos tests:
 *   - Strip de `undefined` en objetos planos anidados a cualquier profundidad.
 *   - Strip de `undefined` dentro de arrays (Firestore también los rechaza).
 *   - Preservación de `Date` (referencia identidad).
 *   - Preservación de `Timestamp` (referencia identidad + `toMillis`).
 *   - Preservación de `serverTimestamp()` (sentinel FieldValue).
 *   - Preservación de la estructura de `historialFases` (array de plain
 *     objects donde uno de los campos es `Timestamp`).
 *   - `null` es preservado (Firestore lo permite; sólo `undefined` está
 *     prohibido).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
// Importamos desde el módulo puro (sin dependencia de `firebase/config`) para
// que los tests corran en Node sin variables de entorno Vite. El servicio
// re-exporta el mismo símbolo — cualquier consumidor ve la misma función.
import { stripUndefinedProfundo } from '../../src/services/firestoreStrip';

test('quita undefined en objetos planos anidados', () => {
  const input = {
    a: 1,
    b: undefined,
    c: { d: 2, e: undefined, f: { g: undefined, h: 'x' } },
  };
  const out = stripUndefinedProfundo(input) as Record<string, unknown>;
  assert.deepEqual(out, { a: 1, c: { d: 2, f: { h: 'x' } } });
});

test('preserva null (no lo confunde con undefined)', () => {
  const input = { a: null, b: undefined, c: { d: null } };
  const out = stripUndefinedProfundo(input) as Record<string, unknown>;
  assert.deepEqual(out, { a: null, c: { d: null } });
});

test('preserva instancia Date exacta (misma referencia)', () => {
  const fecha = new Date('2026-09-29T15:30:00Z');
  const out = stripUndefinedProfundo({ createdAt: fecha, algo: undefined }) as { createdAt: Date };
  assert.equal(out.createdAt, fecha); // referencia idéntica (no reconstruido)
  assert.ok(out.createdAt instanceof Date);
});

test('preserva instancia Timestamp (referencia identidad + toMillis funcional)', () => {
  const ts = Timestamp.fromDate(new Date('2026-09-29T10:00:00Z'));
  const out = stripUndefinedProfundo({ createdAt: ts, huerfano: undefined }) as { createdAt: Timestamp };
  assert.equal(out.createdAt, ts); // referencia idéntica
  assert.ok(out.createdAt instanceof Timestamp);
  assert.equal(typeof out.createdAt.toMillis, 'function');
  assert.equal(out.createdAt.toMillis(), ts.toMillis());
});

test('preserva sentinel FieldValue de serverTimestamp (no lo reconstruye como {})', () => {
  const sentinel = serverTimestamp();
  const out = stripUndefinedProfundo({ updatedAt: sentinel, extra: undefined }) as Record<string, unknown>;
  // El sentinel es opaco (no exponemos toString): comparamos referencia.
  assert.equal(out.updatedAt, sentinel);
  // Y NO debe haberse convertido en un objeto plano {}.
  assert.ok(out.updatedAt !== null);
  assert.ok(Object.getPrototypeOf(out.updatedAt) !== Object.prototype);
});

test('recorre arrays: strip undefined en elementos y recursa en objetos planos internos', () => {
  const ts = Timestamp.fromDate(new Date('2026-09-29T10:00:00Z'));
  const input = {
    historialFases: [
      { fase: 'nuevo_lead', timestamp: ts, usuario: 'Sistema' },
      undefined, // ← Firestore rechaza undefined en arrays también
      { fase: 'agendado', timestamp: ts, usuario: 'Coord', nota: undefined },
    ],
  };
  const out = stripUndefinedProfundo(input) as { historialFases: Array<Record<string, unknown>> };
  assert.equal(out.historialFases.length, 2, 'debe filtrar el undefined del array');
  assert.equal(out.historialFases[0].timestamp, ts, 'Timestamp preservado por identidad en elemento 0');
  assert.equal(out.historialFases[1].timestamp, ts, 'Timestamp preservado por identidad en elemento 1');
  assert.equal((out.historialFases[1] as Record<string, unknown>).nota, undefined);
  assert.ok(!('nota' in out.historialFases[1]), 'la key nota se removió (no se guarda como undefined)');
});

test('no explota en tipos primitivos ni null/undefined top-level', () => {
  assert.equal(stripUndefinedProfundo(null), null);
  assert.equal(stripUndefinedProfundo(undefined), undefined);
  assert.equal(stripUndefinedProfundo('foo'), 'foo');
  assert.equal(stripUndefinedProfundo(42), 42);
  assert.equal(stripUndefinedProfundo(true), true);
});

test('objetos con proto Object.create(null) también se recursen (plain-null)', () => {
  const bareObj = Object.create(null) as Record<string, unknown>;
  bareObj.a = 1;
  bareObj.b = undefined;
  const out = stripUndefinedProfundo(bareObj) as Record<string, unknown>;
  assert.equal(out.a, 1);
  assert.ok(!('b' in out));
});

test('objetos anidados dentro de arrays también se limpian (no leak de undefined)', () => {
  const input = {
    campos: [
      { id: 'a', valor: 'x', extra: undefined },
      { id: 'b', valor: 'y' },
    ],
  };
  const out = stripUndefinedProfundo(input) as { campos: Array<Record<string, unknown>> };
  assert.deepEqual(out.campos[0], { id: 'a', valor: 'x' });
  assert.deepEqual(out.campos[1], { id: 'b', valor: 'y' });
});
