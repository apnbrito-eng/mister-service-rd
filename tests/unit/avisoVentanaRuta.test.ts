/**
 * Prueba unitaria de `avisoDentroDeVentana` (plan integral §6, 09/10/2026).
 * Verifica que el banner de "Resumen de hoy" dura exactamente 15 min
 * desde el inicio de cada ventana (9:00 y 11:00) y se oculta después.
 *
 * No prueba `avisoCompletado` ni la persistencia Firestore — eso vive en
 * `RecordatorioBanner` y queda cubierto por la validación visual.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoDentroDeVentana } from '../../src/utils/avisoVentanaRuta.ts';

function fijar(hora: number, minuto: number): Date {
  const d = new Date();
  d.setHours(hora, minuto, 0, 0);
  return d;
}

test('ruta_manana: visible 9:00, 9:14 y oculto 9:15, 8:59, 10:00', () => {
  assert.equal(avisoDentroDeVentana('ruta_manana', fijar(9, 0)), true);
  assert.equal(avisoDentroDeVentana('ruta_manana', fijar(9, 14)), true);
  assert.equal(avisoDentroDeVentana('ruta_manana', fijar(9, 15)), false);
  assert.equal(avisoDentroDeVentana('ruta_manana', fijar(8, 59)), false);
  assert.equal(avisoDentroDeVentana('ruta_manana', fijar(10, 0)), false);
});

test('horarios_clientes: visible 11:00, 11:14 y oculto 11:15, 10:59, 12:00', () => {
  assert.equal(avisoDentroDeVentana('horarios_clientes', fijar(11, 0)), true);
  assert.equal(avisoDentroDeVentana('horarios_clientes', fijar(11, 14)), true);
  assert.equal(avisoDentroDeVentana('horarios_clientes', fijar(11, 15)), false);
  assert.equal(avisoDentroDeVentana('horarios_clientes', fijar(10, 59)), false);
  assert.equal(avisoDentroDeVentana('horarios_clientes', fijar(12, 0)), false);
});

test('límite inferior inclusivo, límite superior exclusivo', () => {
  // 9:00:00.000 → true (inclusivo)
  assert.equal(avisoDentroDeVentana('ruta_manana', fijar(9, 0)), true);
  // Un milisegundo antes de 9:15 → true
  const casiFin = fijar(9, 14);
  casiFin.setSeconds(59, 999);
  assert.equal(avisoDentroDeVentana('ruta_manana', casiFin), true);
  // 9:15:00.000 → false (exclusivo)
  assert.equal(avisoDentroDeVentana('ruta_manana', fijar(9, 15)), false);
});

test('mañana del día siguiente: funciona con fechas futuras (no sensible al día)', () => {
  const dentro = new Date();
  dentro.setDate(dentro.getDate() + 7);
  dentro.setHours(9, 5, 0, 0);
  assert.equal(avisoDentroDeVentana('ruta_manana', dentro), true);
  const fuera = new Date(dentro);
  fuera.setMinutes(30);
  assert.equal(avisoDentroDeVentana('ruta_manana', fuera), false);
});
