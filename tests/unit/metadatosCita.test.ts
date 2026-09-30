import assert from 'node:assert/strict';
import { test } from 'node:test';
import { construirMetadatosCita } from '../../src/utils/metadatosCita';
import type { CitaPorConfirmar } from '../../src/types';

function citaBase(overrides: Partial<CitaPorConfirmar> = {}): CitaPorConfirmar {
  return {
    id: 'cita-123',
    clienteNombre: 'Juan Test',
    telefono: '8091234567',
    servicio: 'Lavadora LG',
    createdAt: new Date('2026-09-29T10:00:00Z'),
    ...overrides,
  };
}

test('preserva citaOrigenId siempre', () => {
  const meta = construirMetadatosCita(citaBase());
  assert.equal(meta.citaOrigenId, 'cita-123');
});

test('marca origen calendario_publico y persiste calendario cuando la cita vino de un calendario', () => {
  const meta = construirMetadatosCita(citaBase({
    calendarioId: 'cal-abc',
    calendarioNombre: 'Agenda María',
    asignadoId: 'auth-uid-maria',
    asignadoNombre: 'María Pérez',
    equipoId: 'equipo-wa-1',
    responsableAtencionId: 'auth-uid-secretaria',
    origen: 'formulario_publico',
  }));
  assert.equal(meta.origen, 'calendario_publico');
  assert.equal(meta.calendarioId, 'cal-abc');
  assert.equal(meta.calendarioNombre, 'Agenda María');
  assert.equal(meta.asignadoCaptadorId, 'auth-uid-maria');
  assert.equal(meta.asignadoCaptadorNombre, 'María Pérez');
  assert.equal(meta.equipoId, 'equipo-wa-1');
  assert.equal(meta.responsableAtencionId, 'auth-uid-secretaria');
});

test('marca origen formulario_publico si no hay calendario pero venía del form público', () => {
  const meta = construirMetadatosCita(citaBase({ origen: 'formulario_publico' }));
  assert.equal(meta.origen, 'formulario_publico');
  assert.equal(meta.calendarioId, undefined);
});

test('marca origen oficina cuando la cita se registró desde /admin/citas', () => {
  const meta = construirMetadatosCita(citaBase({ origen: 'oficina' }));
  assert.equal(meta.origen, 'oficina');
});

test('marca origen garantia cuando la cita es garantía sin calendario', () => {
  const meta = construirMetadatosCita(citaBase({ esGarantia: true }));
  assert.equal(meta.origen, 'garantia');
});

test('no persiste asignado captador si la cita no trae asignadoId (no inventa)', () => {
  const meta = construirMetadatosCita(citaBase({
    asignadoNombre: 'Solo nombre sin uid',
  }));
  assert.equal(meta.asignadoCaptadorId, undefined);
  assert.equal(meta.asignadoCaptadorNombre, undefined);
});

test('cambio humano de técnico no borra el captador porque el helper no lee tecnicoId', () => {
  // El captador es el técnico del calendario (asignadoId) — el helper NO lee
  // tecnicoId. Aunque la oficina cambie tecnicoId luego, el captador queda
  // congelado como referencia de atribución.
  const meta = construirMetadatosCita(citaBase({
    calendarioId: 'cal-x',
    asignadoId: 'uid-original-captador',
    asignadoNombre: 'Captador Original',
  }));
  assert.equal(meta.asignadoCaptadorId, 'uid-original-captador');
});

test('preserva whatsappAsignado + camposPersonalizados', () => {
  const meta = construirMetadatosCita(citaBase({
    whatsappAsignado: '18496265',
    whatsappAsignadoNombre: 'Línea 2',
    camposPersonalizados: { '¿Cómo se enteró?': 'Google' },
  }));
  assert.equal(meta.whatsappAsignado, '18496265');
  assert.equal(meta.whatsappAsignadoNombre, 'Línea 2');
  assert.deepEqual(meta.camposPersonalizados, { '¿Cómo se enteró?': 'Google' });
});

test('no incluye campos vacíos ni undefined (compatible con Firestore)', () => {
  const meta = construirMetadatosCita(citaBase());
  for (const v of Object.values(meta)) {
    assert.notEqual(v, undefined);
  }
});
