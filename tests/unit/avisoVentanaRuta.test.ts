/**
 * Prueba unitaria de `avisoDentroDeVentana` (plan integral §6, 09/10/2026).
 * Verifica que el banner de "Resumen de hoy" dura exactamente 15 min
 * después del cierre, conservando toda la ventana de trabajo.
 *
 * No prueba `avisoCompletado` ni la persistencia Firestore — eso vive en
 * `RecordatorioBanner` y queda cubierto por la validación visual.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoDentroDeVentana } from '../../src/utils/avisoVentanaRuta.ts';

function fijar(hora: number, minuto: number): Date {
  const d = new Date();
  d.setUTCHours(hora + 4, minuto, 0, 0);
  return d;
}

for (const [tipo, inicio] of [['ruta_manana', 9], ['horarios_clientes', 11]] as const) {
  test(`${tipo}: conserva ventana y urgencia solo hasta 15 minutos después`, () => {
    assert.equal(avisoDentroDeVentana(tipo, fijar(inicio - 1, 59)), false);
    assert.equal(avisoDentroDeVentana(tipo, fijar(inicio, 0)), true);
    assert.equal(avisoDentroDeVentana(tipo, fijar(inicio, 59)), true);
    assert.equal(avisoDentroDeVentana(tipo, fijar(inicio + 1, 0)), true);
    assert.equal(avisoDentroDeVentana(tipo, fijar(inicio + 1, 14)), true);
    const limite = fijar(inicio + 1, 15);
    assert.equal(avisoDentroDeVentana(tipo, new Date(limite.getTime() - 1)), true);
    assert.equal(avisoDentroDeVentana(tipo, limite), false);
    assert.equal(avisoDentroDeVentana(tipo, fijar(inicio + 2, 0)), false);
  });
}
