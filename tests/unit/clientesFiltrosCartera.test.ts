import test from 'node:test';
import assert from 'node:assert/strict';
import type { Cliente } from '../../src/types';
import { aplicaFiltros, FILTROS_DEFAULT } from '../../src/utils/clientesFiltros';

test('filtros de mapa/campaña usan cartera de cliente y preservan sin cartera en Todos', () => {
  const cliente = { id: 'uno', nombre: 'Cliente', carteraEquipo: 'A', telefono: '8494580318' } as Cliente;
  assert.equal(aplicaFiltros(cliente, { ...FILTROS_DEFAULT, carteraEquipo: 'A' }), true);
  assert.equal(aplicaFiltros(cliente, { ...FILTROS_DEFAULT, carteraEquipo: 'B' }), false);
  assert.equal(aplicaFiltros({ ...cliente, carteraEquipo: undefined }, FILTROS_DEFAULT), true);
  assert.equal(aplicaFiltros({ ...cliente, mergedaCon: 'otro' }, FILTROS_DEFAULT), false);
});
