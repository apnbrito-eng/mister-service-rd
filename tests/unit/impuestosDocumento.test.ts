import test from 'node:test';import assert from 'node:assert/strict';
import { desgloseImpuestosDocumento,esConduceSinImpuestos } from '../../src/utils/impuestosDocumento.js';
test('conduce garantía conserva total y desglose con impuesto cero',()=>{
 assert.deepEqual(desgloseImpuestosDocumento(1180,'conduce_garantia'),{total:1180,subtotal:1180,itbis:0,itbisPorcentaje:0});
 assert.deepEqual(desgloseImpuestosDocumento(0,'conduce_garantia'),{total:0,subtotal:0,itbis:0,itbisPorcentaje:0});
});
test('factura normal conserva tasa fiscal y no hereda regla del conduce',()=>{
 assert.deepEqual(desgloseImpuestosDocumento(1180,'factura',18),{total:1180,subtotal:1000,itbis:180,itbisPorcentaje:18});
 assert.deepEqual(desgloseImpuestosDocumento(1100,'factura',10),{total:1100,subtotal:1000,itbis:100,itbisPorcentaje:10});
});
test('representación depende del snapshot emitido no de garantía/recalculo histórico',()=>{
 assert.equal(esConduceSinImpuestos({numero:'CG-1',origen:'post-cierre',itbisPorcentaje:0,itbisMonto:0}),true);
 assert.equal(esConduceSinImpuestos({numero:'CG-1',origen:'manual',itbisPorcentaje:0,itbisMonto:0}),true);
 assert.equal(esConduceSinImpuestos({numero:'CG-1',origen:'post-cierre',itbisPorcentaje:18,itbisMonto:180}),false);
 assert.equal(esConduceSinImpuestos({numero:'FAC-1',origen:'manual',itbisPorcentaje:0,itbisMonto:0}),false);
});
test('importes negativos o no finitos no se emiten',()=>{for(const total of [-1,NaN,Infinity])assert.throws(()=>desgloseImpuestosDocumento(total,'conduce_garantia'));assert.throws(()=>desgloseImpuestosDocumento(100,'factura',-1));});
