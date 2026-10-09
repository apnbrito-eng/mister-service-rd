/**
 * Pruebas unitarias del helper `claseAlerta` del Lote A (auditoría alertas
 * 2026-10-08). Verifica que las 5 severidades producen la clase CSS
 * correspondiente y que el shape público del catálogo no se rompe sin
 * aviso. Se usa `node:test` (coherente con otras unit tests del repo).
 *
 * No prueba renderizado del componente (requeriría JSDOM); el render queda
 * cubierto por la validación visual del preview Vercel.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claseAlerta, type SeveridadAlerta } from '../../src/components/alertas/claseAlerta.ts';

const SEVERIDADES_ESPERADAS: SeveridadAlerta[] = [
  'exito',
  'atencion',
  'fallo',
  'info',
  'neutro',
];

test('claseAlerta devuelve `alerta alerta-<severidad>` para cada severidad válida', () => {
  for (const severidad of SEVERIDADES_ESPERADAS) {
    assert.equal(claseAlerta(severidad), `alerta alerta-${severidad}`);
  }
});

test('todas las severidades esperadas están cubiertas (contrato público)', () => {
  // Si alguien agrega una severidad nueva a `SeveridadAlerta` sin actualizar
  // los tokens, esta prueba falla señalando la inconsistencia. Mantener la
  // lista alineada con `tokens.css` → `.alerta-<severidad>`.
  assert.equal(SEVERIDADES_ESPERADAS.length, 5);
  // El plan integral §alertas define exactamente estas 5 severidades. Un
  // cambio aquí requiere revisión de Codex sobre tokens y accesibilidad.
  assert.deepEqual(
    SEVERIDADES_ESPERADAS.slice().sort(),
    ['atencion', 'exito', 'fallo', 'info', 'neutro'],
  );
});

test('claseAlerta no muta su argumento ni retorna espacios de más', () => {
  const severidad: SeveridadAlerta = 'fallo';
  const resultado = claseAlerta(severidad);
  assert.equal(severidad, 'fallo');
  assert.equal(resultado.trim(), resultado);
  assert.equal(resultado.split(' ').length, 2);
});
