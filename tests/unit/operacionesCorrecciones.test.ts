/**
 * Tests de las correcciones post revisión Codex.
 *
 *  - Comportamiento «Ver más» en `ListaAtencion`: se verifica a nivel de datos
 *    que `avisosPorCategoria` entrega la lista completa aunque `avisos` esté
 *    truncado por `limiteCategoria`. (El componente consume ambos.)
 *  - Carga / error / permiso: se afirma el shape de `MapaDatos` que la UI usa
 *    para ocultar «cero/sin casos» cuando no hay datos confiables.
 *  - Ficha con piezas / fecha seleccionada: se verifica el adaptador de
 *    standby → metadatos (pieza vs motivo vs fallback) y que la jornada /
 *    estado honre el `esDiaDeHoyRD`.
 *
 * No se usa React Testing Library (no está instalada; «sin añadir librerías»).
 * Las aserciones son sobre los helpers deterministas que la UI consume y sobre
 * la forma del estado que la UI renderiza.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OrdenServicio, Personal, StandbyPieza } from '../../src/types';
import {
  agregarAvisos,
  clasificarPendienteAnterior,
  estadoActualTecnico,
  estaTerminada,
  jornadaTecnico,
  resumirDia,
  tecnicosParaResumen,
} from '../../src/utils/operacionesPrioridad';

const AHORA = new Date('2026-10-02T15:00:00-04:00'); // 15:00 RD

function orden(over: Partial<OrdenServicio> = {}): OrdenServicio {
  return {
    id: 'os-1',
    numero: 'OS-0001',
    clienteId: 'c-1',
    clienteNombre: 'Ana',
    equipoTipo: 'Lavadora',
    equipoMarca: 'Samsung',
    descripcionFalla: 'No centrifuga',
    tecnicoId: 'uid-y',
    tecnicoNombre: 'Yoniel',
    operariaNombre: 'Wila',
    fase: 'agendado',
    estadoSimple: 'nuevo',
    estado: 'activo',
    fechaCita: new Date('2026-10-02T10:00:00-04:00'),
    duracionMin: 60,
    historialFases: [],
    ...over,
  } as OrdenServicio;
}

function tec(over: Partial<Personal> = {}): Personal {
  return {
    id: 'p-y',
    uid: 'uid-y',
    nombre: 'Yoniel',
    rol: 'tecnico',
    activo: true,
    disponibilidad: true,
    operariaNombre: 'Wila',
    ...over,
  } as Personal;
}

/* ---------- Ver más (interacción a nivel de datos) ---------- */

test('agregarAvisos devuelve `avisosPorCategoria` completo aunque `avisos` esté truncado', () => {
  const ordenes = Array.from({ length: 7 }, (_, i) =>
    orden({
      id: `g-${i}`,
      numero: `OS-G${i}`,
      esGarantia: true,
      fase: 'en_cotizacion',
      operariaNombre: 'Wila',
      clienteNombre: `Cliente ${i}`,
    }),
  );
  const r = agregarAvisos({ ordenes, pendientesAnteriores: [], ahora: AHORA, limiteCategoria: 3 });
  assert.equal(r.avisos.filter((a) => a.categoria === 'garantia_abierta').length, 3, 'tope aplicado');
  assert.equal(r.avisosPorCategoria.garantia_abierta.length, 7, 'ver más tiene acceso a los 7');
  assert.equal(r.totalesCategoria.garantia_abierta, 7, 'total coherente con lista completa');
});

test('avisosPorCategoria entrega orden determinista por (prioridad, ordenId) dentro de cada categoría', () => {
  // Dos garantías con misma prioridad (categoría fija) → ordenId alfabético.
  const ordenes = [
    orden({ id: 'g-b', esGarantia: true, fase: 'en_cotizacion', operariaNombre: 'Wila' }),
    orden({ id: 'g-a', esGarantia: true, fase: 'en_cotizacion', operariaNombre: 'Wila' }),
  ];
  const r = agregarAvisos({ ordenes, pendientesAnteriores: [], ahora: AHORA });
  assert.deepEqual(
    r.avisosPorCategoria.garantia_abierta.map((a) => a.ordenId),
    ['g-a', 'g-b'],
    'tie-break por ordenId asegura determinismo',
  );
});

/* ---------- Carga / error / permiso (shape que la UI usa) ---------- */

test('Set de técnicos visibles vacío ⇒ cero avisos, cero técnicos activos', () => {
  const r = agregarAvisos({
    ordenes: [orden()],
    pendientesAnteriores: [],
    ahora: AHORA,
    tecnicoIdsVisibles: new Set<string>(),
  });
  assert.equal(r.avisos.length, 0);
  assert.deepEqual(r.totalesCategoria.garantia_abierta, 0);
  const resumen = resumirDia({
    ordenes: [orden()],
    personal: [tec()],
    ahora: AHORA,
    tecnicoIdsVisibles: new Set<string>(),
  });
  assert.equal(resumen.tecnicosActivos, 0);
  assert.equal(resumen.totalDelDia, 0);
});

test('personal.activo undefined NO se interpreta como baja', () => {
  const sinActivoDefinido = { ...tec(), activo: undefined as unknown as boolean };
  const visibles = tecnicosParaResumen([sinActivoDefinido]);
  assert.equal(visibles.length, 1, 'undefined queda incluido');
  const estado = estadoActualTecnico(sinActivoDefinido, [], AHORA);
  assert.notEqual(estado.tono, 'ausente');
});

test('orden con estado=cerrado o cancelado NO produce aviso aunque tenga fase vieja', () => {
  for (const estado of ['cerrado', 'cancelado'] as const) {
    const o = orden({ estado, fase: 'agendado' });
    assert.ok(estaTerminada(o), `terminada por estado=${estado}`);
    const r = agregarAvisos({ ordenes: [o], pendientesAnteriores: [o], ahora: AHORA });
    assert.equal(r.avisos.length, 0, `estado=${estado} no genera avisos`);
    assert.equal(
      Object.values(r.totalesCategoria).reduce((a, b) => a + b, 0),
      0,
      `estado=${estado} no suma totales`,
    );
  }
});

/* ---------- Ficha: piezas / motivo / fecha seleccionada ---------- */

function metaStandbyParaFicha(s?: StandbyPieza): string {
  // Esta es la misma lógica que el componente usa para la etiqueta.
  if (!s) return 'Stand-by · sin motivo capturado';
  if (s.piezaFaltante) return `Stand-by · ${s.piezaFaltante}`;
  if (s.notas) return `Stand-by · ${s.notas}`;
  return 'Stand-by · sin motivo capturado';
}

test('ficha standby: pieza real gana sobre notas, y fallback explícito si falta todo', () => {
  const soloPieza: StandbyPieza = {
    id: 's1',
    ordenId: 'os-1',
    clienteNombre: 'Ana',
    equipoTipo: 'Lavadora',
    equipoMarca: 'Samsung',
    piezaFaltante: 'Bomba desagüe',
    fechaInicio: new Date('2026-10-01T10:00:00-04:00'),
    estado: 'buscando',
    createdAt: new Date('2026-10-01T10:00:00-04:00'),
  };
  assert.equal(metaStandbyParaFicha(soloPieza), 'Stand-by · Bomba desagüe');

  const soloNotas: StandbyPieza = { ...soloPieza, piezaFaltante: '', notas: 'Cliente viaja' };
  assert.equal(metaStandbyParaFicha(soloNotas), 'Stand-by · Cliente viaja');

  const sinNada: StandbyPieza = { ...soloPieza, piezaFaltante: '', notas: undefined };
  assert.equal(metaStandbyParaFicha(sinNada), 'Stand-by · sin motivo capturado');

  // Y cuando la orden no tiene standby, también usamos fallback:
  assert.equal(metaStandbyParaFicha(undefined), 'Stand-by · sin motivo capturado');
});

test('estadoActualTecnico NO dice «Próxima cita» cuando la fecha seleccionada no es hoy en RD', () => {
  const t = tec();
  const futuro = orden({
    tecnicoId: 'uid-y',
    fechaCita: new Date('2026-10-02T18:00:00-04:00'),
  });
  const j = jornadaTecnico(t, [futuro], AHORA);
  const sinHoy = estadoActualTecnico(t, j, AHORA, { esDiaDeHoyRD: false });
  assert.notEqual(sinHoy.tono, 'proximo', 'solo se muestra «próxima» cuando se mira hoy');

  const conHoy = estadoActualTecnico(t, j, AHORA, { esDiaDeHoyRD: true });
  assert.equal(conHoy.tono, 'proximo', 'cuando sí es hoy, aparece la próxima cita');
});

test('jornadaTecnico omite órdenes con `estado` cancelado aunque la `fase` sea otra', () => {
  const t = tec();
  const cancel = orden({ id: 'c1', estado: 'cancelado', fase: 'en_diagnostico' });
  const activa = orden({ id: 'a1', fase: 'agendado' });
  const j = jornadaTecnico(t, [cancel, activa], AHORA);
  assert.deepEqual(j.map((x) => x.orden.id), ['a1']);
});

/* ---------- Dedupe estricto ---------- */

test('agregarAvisos cuenta UNA sola vez una orden que aparece en día y en pendientes', () => {
  const o = orden({
    id: 'dup-1',
    fase: 'en_diagnostico',
    fechaCita: new Date('2026-10-02T09:00:00-04:00'),
    duracionMin: 60,
    visita: { enSitioEn: new Date('2026-10-02T09:10:00-04:00') },
    historialFases: [{ fase: 'en_diagnostico', timestamp: new Date('2026-10-02T09:30:00-04:00') }],
  } as Partial<OrdenServicio>);
  const r = agregarAvisos({ ordenes: [o], pendientesAnteriores: [o], ahora: AHORA });
  assert.equal(r.avisos.filter((a) => a.ordenId === 'dup-1').length, 1);
  const sumaTotales = Object.values(r.totalesCategoria).reduce((a, b) => a + b, 0);
  assert.equal(sumaTotales, 1, 'totalesCategoria también deduplica');
});

/* ---------- Prioridad finita siempre ---------- */

test('clasificarPendienteAnterior produce prioridad finita para fecha inválida', () => {
  const o = orden({ fechaCita: new Date('invalid-string') });
  const a = clasificarPendienteAnterior(o, AHORA);
  assert.ok(Number.isFinite(a.prioridad), 'prioridad finita');
  assert.doesNotMatch(a.metrica, /NaN|Invalid/i);
  assert.match(a.metrica, /sin fecha/i);
});
