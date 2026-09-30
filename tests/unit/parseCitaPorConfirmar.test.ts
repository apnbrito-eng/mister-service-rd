import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCitaPorConfirmar } from '../../src/utils/parseCitaPorConfirmar';

const fakeTimestamp = (iso: string) => ({ toDate: () => new Date(iso) });

test('parser lee los campos que `api/_lib/citaPublica.ts` persiste al agendar desde calendario', () => {
  // Simulamos EXACTAMENTE la forma que sale de `registrarCitaPublica`
  // (línea 125 de api/_lib/citaPublica.ts) cuando la cita vino de un
  // calendario público con técnico asignado + reparto WhatsApp.
  const raw = {
    clienteNombre: 'Ana Cliente',
    telefono: '8091234567',
    telefonoNormalizado: '8091234567',
    equipoTipo: 'Lavadora',
    servicio: 'Lavadora LG',
    falla: 'No centrifuga y hace ruido metálico',
    origen: 'formulario_publico',
    estado: 'pendiente',
    whatsappAsignado: '18495646767',
    whatsappAsignadoNombre: 'Mister Service RD',
    equipoMarca: 'LG',
    fechaSolicitada: fakeTimestamp('2026-10-01T13:00:00Z'),
    horaSolicitada: '09:00',
    calendarioId: 'cal-maria',
    calendarioNombre: 'Agenda María',
    asignadoId: 'auth-uid-maria',
    asignadoNombre: 'María Pérez',
    equipoId: 'equipo-wa-1',
    responsableAtencionId: 'auth-uid-secretaria',
    repartoPendiente: false,
    createdAt: fakeTimestamp('2026-09-29T14:00:00Z'),
  };
  const cita = parseCitaPorConfirmar('cita-abc', raw);
  assert.equal(cita.id, 'cita-abc');
  assert.equal(cita.clienteNombre, 'Ana Cliente');
  assert.equal(cita.telefono, '8091234567');
  assert.equal(cita.calendarioId, 'cal-maria');
  assert.equal(cita.calendarioNombre, 'Agenda María');
  assert.equal(cita.asignadoId, 'auth-uid-maria');
  assert.equal(cita.asignadoNombre, 'María Pérez');
  assert.equal(cita.equipoId, 'equipo-wa-1');
  assert.equal(cita.responsableAtencionId, 'auth-uid-secretaria');
  // repartoPendiente:false NO debe volar el campo — pero como la propiedad
  // solo carga cuando es true, verificamos que undefined.
  assert.equal(cita.repartoPendiente, undefined);
  assert.equal(cita.origen, 'formulario_publico');
  assert.ok(cita.fechaSolicitada instanceof Date);
});

test('repartoPendiente=true se preserva', () => {
  const raw = {
    clienteNombre: 'X',
    telefono: '8090000000',
    servicio: '',
    createdAt: fakeTimestamp('2026-09-29T00:00:00Z'),
    repartoPendiente: true,
  };
  const cita = parseCitaPorConfirmar('c', raw);
  assert.equal(cita.repartoPendiente, true);
});

test('docs viejos sin campos nuevos: fallback undefined sin explotar', () => {
  const raw = {
    clienteNombre: 'Legacy',
    telefono: '8092220000',
    servicio: 'Nevera',
    createdAt: fakeTimestamp('2026-05-01T00:00:00Z'),
  };
  const cita = parseCitaPorConfirmar('legacy-1', raw);
  assert.equal(cita.asignadoId, undefined);
  assert.equal(cita.calendarioId, undefined);
  assert.equal(cita.equipoId, undefined);
  assert.equal(cita.responsableAtencionId, undefined);
  assert.equal(cita.repartoPendiente, undefined);
});

test('valores no-string en asignadoId se ignoran defensivamente (no explota tipos)', () => {
  const raw = {
    clienteNombre: 'X',
    telefono: '8090000000',
    servicio: '',
    createdAt: fakeTimestamp('2026-09-29T00:00:00Z'),
    asignadoId: 123 as unknown, // tipo hostil
    equipoId: null,
  };
  const cita = parseCitaPorConfirmar('c', raw);
  assert.equal(cita.asignadoId, undefined);
  assert.equal(cita.equipoId, undefined);
});

test('camposPersonalizados solo se lee si es un objeto plano (rechaza arrays)', () => {
  const raw1 = {
    clienteNombre: 'X',
    telefono: '8090000000',
    servicio: '',
    createdAt: fakeTimestamp('2026-09-29T00:00:00Z'),
    camposPersonalizados: { 'Marca preferida': 'Samsung' },
  };
  const cita1 = parseCitaPorConfirmar('c1', raw1);
  assert.deepEqual(cita1.camposPersonalizados, { 'Marca preferida': 'Samsung' });

  const raw2 = { ...raw1, camposPersonalizados: [] as unknown };
  const cita2 = parseCitaPorConfirmar('c2', raw2);
  assert.equal(cita2.camposPersonalizados, undefined);
});

test('cita de garantía preserva referencias del reclamo', () => {
  const raw = {
    clienteNombre: 'X',
    telefono: '8090000000',
    servicio: '',
    createdAt: fakeTimestamp('2026-09-29T00:00:00Z'),
    tipo: 'garantia',
    esGarantia: true,
    referenciaFacturaId: 'fac-1',
    referenciaConduce: 'CG-0001',
    tecnicoOriginalUid: 'uid-tec',
    tecnicoOriginalNombre: 'Tecnico Uno',
  };
  const cita = parseCitaPorConfirmar('gar-1', raw);
  assert.equal(cita.esGarantia, true);
  assert.equal(cita.referenciaFacturaId, 'fac-1');
  assert.equal(cita.referenciaConduce, 'CG-0001');
  assert.equal(cita.tecnicoOriginalUid, 'uid-tec');
});
