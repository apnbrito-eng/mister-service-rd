import test from 'node:test';
import assert from 'node:assert/strict';
import { crearContratoFinanzasPersonal, leerContratoFinanzasPersonal, exigirValorFinanzasPersonal, particionarFinanzasPersonalNuevo } from '../../src/utils/contratoFinanzasPersonal.ts';
const identidad = { personalId: 'empleado-qa', uid: 'uid-canonico-qa' };
test('partición financiera excluye dinero del público sin mutar el origen', () => {
  const datos = { nombre: 'QA', sueldoBase: 15000, comisionPorcentaje: 8 };
  const r = particionarFinanzasPersonalNuevo(identidad, datos);
  assert.deepEqual(r.publico, { nombre: 'QA' });
  assert.equal(r.privado.sueldoBase, 15000); assert.equal(r.privado.comisionPorcentaje, 8);
  assert.equal(datos.sueldoBase, 15000);
});
test('cero explícito permanece válido y campo ausente bloquea cálculo', () => {
  const cero = crearContratoFinanzasPersonal(identidad, { sueldoBase: 0, comisionPorcentaje: 0 });
  assert.equal(exigirValorFinanzasPersonal(cero, 'sueldoBase'), 0);
  assert.equal(exigirValorFinanzasPersonal(cero, 'comisionPorcentaje'), 0);
  const ausente = crearContratoFinanzasPersonal(identidad, {});
  assert.equal(Object.hasOwn(ausente, 'sueldoBase'), false);
  assert.throws(() => exigirValorFinanzasPersonal(ausente, 'sueldoBase'));
  assert.throws(() => exigirValorFinanzasPersonal(ausente, 'comisionPorcentaje'));
});
test('valida tipos, números finitos y límites sin coerción ni defaults', () => {
  for (const valor of [undefined, null, '', '8', -1, NaN, Infinity, -Infinity]) {
    assert.throws(() => crearContratoFinanzasPersonal(identidad, { sueldoBase: valor }));
    assert.throws(() => crearContratoFinanzasPersonal(identidad, { comisionPorcentaje: valor }));
  }
  assert.throws(() => crearContratoFinanzasPersonal(identidad, { comisionPorcentaje: 100.01 }));
  assert.equal(crearContratoFinanzasPersonal(identidad, { comisionPorcentaje: 100 }).comisionPorcentaje, 100);
});
test('lectura privada exige versión e identidad exactas, sin fallback a valores públicos', () => {
  const valido = crearContratoFinanzasPersonal(identidad, { sueldoBase: 15000 });
  assert.deepEqual(leerContratoFinanzasPersonal(identidad, valido), valido);
  for (const privado of [undefined, null, { sueldoBase: 15000 }, { ...valido, versionFinanzas: 2 }, { ...valido, uid: 'otro' }, { ...valido, personalId: 'otro' }]) assert.throws(() => leerContratoFinanzasPersonal(identidad, privado));
  assert.throws(() => crearContratoFinanzasPersonal({ ...identidad, uid: '' }, {}));
  assert.throws(() => crearContratoFinanzasPersonal({ ...identidad, uid: ' uid ' }, {}));
  assert.throws(() => crearContratoFinanzasPersonal({ ...identidad, personalId: '../otro' }, {}));
});
