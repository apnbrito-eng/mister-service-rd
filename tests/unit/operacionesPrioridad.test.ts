import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OrdenServicio, Personal } from '../../src/types';
import {
  agregarAvisos,
  respuestaPendiente,
  clasificarOrden,
  clasificarPendienteAnterior,
  estadoActualTecnico,
  idOperativoTecnico,
  jornadaTecnico,
  progresoDelDia,
  resumirDia,
  tecnicosActivos,
  tecnicosVisibles,
} from '../../src/utils/operacionesPrioridad';
import { calcularProgreso } from '../../src/utils/progresoOrden';

const AHORA = new Date('2026-10-02T15:00:00-04:00'); // 15:00 RD

function orden(overrides: Partial<OrdenServicio> = {}): OrdenServicio {
  return {
    id: 'os-1',
    numero: 'OS-0001',
    clienteId: 'cli-1',
    clienteNombre: 'Ana Rodríguez',
    equipoTipo: 'Lavadora',
    equipoMarca: 'Samsung',
    descripcionFalla: 'No centrifuga',
    tecnicoId: 'uid-yoniel',
    tecnicoNombre: 'Yoniel',
    operariaNombre: 'Wila',
    fase: 'agendado',
    estadoSimple: 'nuevo',
    estado: 'activo',
    fechaCita: new Date('2026-10-02T14:00:00-04:00'),
    duracionMin: 60,
    historialFases: [],
    ...overrides,
  } as OrdenServicio;
}

function tecnico(overrides: Partial<Personal> = {}): Personal {
  return {
    id: 'p-yoniel',
    uid: 'uid-yoniel',
    nombre: 'Yoniel',
    rol: 'tecnico',
    disponibilidad: true,
    activo: true,
    operariaNombre: 'Wila',
    ...overrides,
  } as Personal;
}

test('idOperativoTecnico prefiere uid sobre doc id (P-006)', () => {
  assert.equal(idOperativoTecnico(tecnico({ uid: 'u-1', id: 'p-1' })), 'u-1');
  assert.equal(idOperativoTecnico(tecnico({ uid: undefined, id: 'p-only' })), 'p-only');
});

test('tecnicosActivos excluye roles no-técnicos y activo=false', () => {
  const lista: Personal[] = [
    tecnico({ nombre: 'Yoniel' }),
    tecnico({ nombre: 'Baja', activo: false }),
    { ...tecnico({ nombre: 'Secretaria' }), rol: 'secretaria' },
  ];
  const activos = tecnicosActivos(lista);
  assert.equal(activos.length, 1);
  assert.equal(activos[0].nombre, 'Yoniel');
});

test('tecnicosVisibles filtra por equipo si se pide', () => {
  const lista: Personal[] = [
    tecnico({ nombre: 'Yoniel', operariaNombre: 'Wila' }), // A
    tecnico({ nombre: 'Miguel', operariaNombre: 'Yohana' }), // B
    tecnico({ nombre: 'Suelto', operariaNombre: undefined }), // null → fuera cuando se filtra
  ];
  const soloA = tecnicosVisibles(lista, 'A');
  assert.deepEqual(
    soloA.map((p) => p.nombre),
    ['Yoniel'],
  );
  const todos = tecnicosVisibles(lista, null);
  assert.equal(todos.length, 3);
});

test('clasificarOrden marca atrasada cuando atrasoMin > 0 y no es standby', () => {
  // cita a las 13:00 con 60min → fin 14:00; ahora 15:00 → 60 min atraso
  const o = orden({
    fechaCita: new Date('2026-10-02T13:00:00-04:00'),
    duracionMin: 60,
    historialFases: [{ fase: 'en_diagnostico', timestamp: new Date('2026-10-02T13:30:00-04:00') }],
    fase: 'en_diagnostico',
    visita: { enSitioEn: new Date('2026-10-02T13:15:00-04:00') },
  } as Partial<OrdenServicio>);
  const prog = calcularProgreso(
    {
      fase: o.fase,
      historialFases: o.historialFases!.map((h) => ({ fase: h.fase, timestamp: h.timestamp as Date })),
      visita: { enSitioEn: new Date('2026-10-02T13:15:00-04:00') },
      fechaCita: o.fechaCita,
      duracionMin: 60,
      tipoServicio: 'reparacion',
    },
    AHORA,
  );
  const aviso = clasificarOrden(o, prog, AHORA);
  assert.ok(aviso);
  assert.equal(aviso!.categoria, 'atrasada');
  assert.equal(aviso!.clienteNombre, 'Ana Rodríguez');
  assert.ok(aviso!.metrica.includes('min'));
});

test('clasificarOrden ignora atraso cuando hay standby', () => {
  const o = orden({ enStandby: true, standbyDesde: new Date('2026-10-02T14:00:00-04:00') });
  const prog = calcularProgreso(
    {
      fase: 'en_diagnostico',
      historialFases: [],
      fechaCita: new Date('2026-10-02T13:00:00-04:00'),
      duracionMin: 60,
      tipoServicio: 'reparacion',
      standbyAbierto: true,
      standbyDesde: new Date('2026-10-02T14:00:00-04:00'),
      visita: { enSitioEn: new Date('2026-10-02T13:15:00-04:00') },
    },
    AHORA,
  );
  const aviso = clasificarOrden(o, prog, AHORA);
  assert.ok(aviso);
  assert.equal(aviso!.categoria, 'standby_pieza');
  assert.ok(aviso!.metrica.includes('en espera') || aviso!.metrica.includes('sin fecha'));
});

test('clasificarPendienteAnterior reporta días reales sin inventar cuando no hay fecha', () => {
  const sinFecha = orden({ id: 'os-sin', fechaCita: undefined });
  const aviso = clasificarPendienteAnterior(sinFecha, AHORA);
  assert.equal(aviso.metrica, 'sin fecha');

  const hace3dias = orden({ id: 'os-3d', fechaCita: new Date(AHORA.getTime() - 3 * 86_400_000) });
  const aviso2 = clasificarPendienteAnterior(hace3dias, AHORA);
  assert.equal(aviso2.metrica, '3 días pendiente');
  // Determinismo: prioridad reproducible
  const otra = clasificarPendienteAnterior(hace3dias, AHORA);
  assert.equal(aviso2.prioridad, otra.prioridad);
});

test('antigüedad cuenta cambios de día RD, incluso con pocos minutos transcurridos', () => {
  const ayer = orden({ fechaCita: new Date('2026-10-01T23:55:00-04:00') });
  assert.equal(clasificarPendienteAnterior(ayer, new Date('2026-10-02T00:05:00-04:00')).metrica, '1 día pendiente');
  // Cruzar medianoche UTC no cambia el día dominicano.
  const hoy = orden({ fechaCita: new Date('2026-10-01T19:55:00-04:00') });
  assert.equal(clasificarPendienteAnterior(hoy, new Date('2026-10-01T20:05:00-04:00')).metrica, '0 días pendiente');
});

test('atrasos de 60 y 30 minutos se ordenan por demora, y empates por ID', () => {
  const atrasada = (id: string, minutos: number) => orden({
    id,
    fechaCita: new Date(AHORA.getTime() - (60 + minutos) * 60_000),
    duracionMin: 60,
    fase: 'en_diagnostico',
    visita: { enSitioEn: new Date(AHORA.getTime() - 120 * 60_000) },
  });
  const resultado = agregarAvisos({
    ordenes: [atrasada('a-30', 30), atrasada('z-60', 60), atrasada('b-60', 60)],
    pendientesAnteriores: [], ahora: AHORA,
  });
  assert.deepEqual(resultado.avisos.map(a => a.ordenId), ['b-60', 'z-60', 'a-30']);
});

test('salidas sin registrar de 60 y 30 minutos no empatan por saturación', () => {
  const resultado = agregarAvisos({
    ordenes: [orden({ id: 'a-30', fechaCita: new Date(AHORA.getTime() - 30 * 60_000) }),
      orden({ id: 'z-60', fechaCita: new Date(AHORA.getTime() - 60 * 60_000) })],
    pendientesAnteriores: [], ahora: AHORA,
  });
  assert.deepEqual(resultado.avisos.map(a => a.ordenId), ['z-60', 'a-30']);
});

test('jornada ordena fechas inválidas al final y una orden cerrada no queda en stand-by', () => {
  const jornada = jornadaTecnico(tecnico(), [
    orden({ id: 'invalida', fechaCita: new Date('invalid') }),
    orden({ id: 'cerrada', estado: 'cerrado', enStandby: true }),
  ], AHORA);
  assert.deepEqual(jornada.map(j => j.orden.id), ['cerrada', 'invalida']);
  assert.equal(jornada[0].progreso.standby, false);
  assert.equal(jornada[0].progreso.completa, true);
});

test('agregarAvisos deduplica misma orden en múltiples categorías', () => {
  // Una orden atrasada que también está en standby — standby gana porque atraso no cuenta.
  // Verificamos que solo haya 1 aviso por ordenId.
  const o = orden({
    enStandby: true,
    standbyDesde: new Date('2026-10-02T14:00:00-04:00'),
    fechaCita: new Date('2026-10-02T10:00:00-04:00'),
    visita: { enSitioEn: new Date('2026-10-02T10:15:00-04:00') },
    fase: 'en_diagnostico',
  });
  const resultado = agregarAvisos({
    ordenes: [o],
    pendientesAnteriores: [o],
    ahora: AHORA,
  });
  const porEstaOrden = resultado.avisos.filter((a) => a.ordenId === o.id);
  assert.equal(porEstaOrden.length, 1, 'una sola entrada por orden');
});

test('agregarAvisos ordena por prioridad asc determinista', () => {
  const atrasada = orden({
    id: 'os-A',
    fechaCita: new Date('2026-10-02T12:00:00-04:00'),
    duracionMin: 60,
    visita: { enSitioEn: new Date('2026-10-02T12:15:00-04:00') },
    fase: 'en_diagnostico',
    historialFases: [{ fase: 'en_diagnostico', timestamp: new Date('2026-10-02T12:30:00-04:00') }],
  });
  const garantia = orden({ id: 'os-G', esGarantia: true, fase: 'en_cotizacion' });
  const resultado = agregarAvisos({
    ordenes: [garantia, atrasada],
    pendientesAnteriores: [],
    ahora: AHORA,
  });
  assert.equal(resultado.avisos[0].categoria, 'atrasada');
  assert.equal(resultado.avisos[1].categoria, 'garantia_abierta');
});

test('agregarAvisos aplica tope por categoría con `ver más» en totalesCategoria', () => {
  const ordenes: OrdenServicio[] = [];
  for (let i = 0; i < 8; i++) {
    ordenes.push(
      orden({
        id: `os-g-${i}`,
        esGarantia: true,
        fase: 'en_cotizacion',
        operariaNombre: 'Wila',
        clienteNombre: `Cliente G${i}`,
      }),
    );
  }
  const resultado = agregarAvisos({ ordenes, pendientesAnteriores: [], ahora: AHORA, limiteCategoria: 3 });
  assert.equal(resultado.conteosCategoria.garantia_abierta, 3);
  assert.equal(resultado.totalesCategoria.garantia_abierta, 8);
});

test('agregarAvisos filtra por equipo A/B', () => {
  const a = orden({ id: 'os-A', operariaNombre: 'Wila', esGarantia: true, fase: 'en_cotizacion' });
  const b = orden({ id: 'os-B', operariaNombre: 'Yohana', esGarantia: true, fase: 'en_cotizacion' });
  const rA = agregarAvisos({ ordenes: [a, b], pendientesAnteriores: [], ahora: AHORA, equipo: 'A' });
  assert.deepEqual(rA.avisos.map((x) => x.ordenId), ['os-A']);
  const rB = agregarAvisos({ ordenes: [a, b], pendientesAnteriores: [], ahora: AHORA, equipo: 'B' });
  assert.deepEqual(rB.avisos.map((x) => x.ordenId), ['os-B']);
});

test('resumirDia cuenta técnicos activos de la plantilla aunque no tengan citas', () => {
  const personal: Personal[] = [
    tecnico({ nombre: 'Yoniel', uid: 'u-y' }),
    tecnico({ nombre: 'Miguel', uid: 'u-m', operariaNombre: 'Yohana' }),
    { ...tecnico({ nombre: 'Secretaria' }), rol: 'secretaria' },
  ];
  const resumen = resumirDia({ ordenes: [], personal, ahora: AHORA });
  assert.equal(resumen.tecnicosActivos, 2);
  assert.equal(resumen.cerradas, 0);
  assert.equal(resumen.totalDelDia, 0);
  assert.equal(resumen.libres, 2);
});

test('resumirDia distingue cerradas (fase=cerrado) de pendientes', () => {
  const ordenes = [
    orden({ id: 'os-1', fase: 'cerrado' }),
    orden({ id: 'os-2', fase: 'trabajo_realizado' }),
    orden({ id: 'os-3', fase: 'en_diagnostico' }),
  ];
  const personal = [tecnico({ nombre: 'Yoniel' })];
  const r = resumirDia({ ordenes, personal, ahora: AHORA });
  assert.equal(r.cerradas, 1);
  assert.equal(r.pendientesCierre, 2);
  assert.equal(r.totalDelDia, 3);
});

test('resumirDia no incluye importes financieros', () => {
  const r = resumirDia({ ordenes: [], personal: [], ahora: AHORA });
  assert.ok(!('cobrado' in r));
  assert.ok(!('esperado' in r));
});

test('progresoDelDia distribuye órdenes en los 7 pasos + standby', () => {
  const ordenes = [
    orden({ id: 'os-1', fase: 'cerrado' }),
    orden({ id: 'os-2', fase: 'agendado' }),
    orden({
      id: 'os-3',
      fase: 'en_diagnostico',
      enStandby: true,
      standbyDesde: new Date('2026-10-02T13:00:00-04:00'),
    }),
  ];
  const p = progresoDelDia(ordenes, AHORA);
  assert.equal(p.cerradas, 1);
  assert.equal(p.standby, 1);
  assert.equal(p.conteos[0], 1); // agendada
  assert.equal(p.total, 3);
});

test('jornadaTecnico ordena cronológicamente y filtra solo las del técnico', () => {
  const t = tecnico({ uid: 'u-y' });
  const ordenes = [
    orden({ id: 'os-10', tecnicoId: 'u-y', fechaCita: new Date('2026-10-02T15:00:00-04:00') }),
    orden({ id: 'os-11', tecnicoId: 'u-y', fechaCita: new Date('2026-10-02T09:00:00-04:00') }),
    orden({ id: 'os-12', tecnicoId: 'otro-uid', fechaCita: new Date('2026-10-02T10:00:00-04:00') }),
  ];
  const j = jornadaTecnico(t, ordenes, AHORA);
  assert.deepEqual(j.map((x) => x.orden.id), ['os-11', 'os-10']);
});

test('estadoActualTecnico reconoce "Terminó el día"', () => {
  const t = tecnico({ uid: 'u-y' });
  const ordenes = [
    orden({ id: 'os-x', tecnicoId: 'u-y', fase: 'cerrado' }),
    orden({ id: 'os-y', tecnicoId: 'u-y', fase: 'cerrado' }),
  ];
  const j = jornadaTecnico(t, ordenes, AHORA);
  const estado = estadoActualTecnico(t, j, AHORA);
  assert.equal(estado.tono, 'cerrado');
  assert.equal(estado.etiqueta, 'Terminó el día');
});

test('estadoActualTecnico sin citas → "Sin citas asignadas"', () => {
  const t = tecnico({ uid: 'u-y' });
  const estado = estadoActualTecnico(t, [], AHORA);
  assert.equal(estado.tono, 'ocioso');
  assert.equal(estado.etiqueta, 'Sin citas asignadas');
});

test('estadoActualTecnico marca activo con la orden en curso', () => {
  const t = tecnico({ uid: 'u-y' });
  const inProgress = orden({
    id: 'os-live',
    tecnicoId: 'u-y',
    fase: 'en_diagnostico',
    visita: { enSitioEn: new Date('2026-10-02T14:00:00-04:00') },
    historialFases: [{ fase: 'en_diagnostico', timestamp: new Date('2026-10-02T14:15:00-04:00') }],
  });
  const j = jornadaTecnico(t, [inProgress], AHORA);
  const estado = estadoActualTecnico(t, j, AHORA);
  assert.equal(estado.tono, 'activo');
  assert.ok(estado.ordenActual);
  assert.equal(estado.ordenActual!.id, 'os-live');
});


test('presupuesto aprobado requiere contacto cliente y no revisión de coordinadora', () => {
  const aviso = respuestaPendiente(orden({precioSugerido:5200, precioAprobado:4800, estadoAprobacion:'pendiente', presupuestoEstado:'pendiente_cliente'}), AHORA);
  assert.equal(aviso?.categoria, 'cliente_por_confirmar');
  assert.equal(aviso?.importeSugerido, 4800);
});
test('cambio propuesto vuelve a revisión mostrando nuevo monto, aceptación quita aviso', () => {
  const base = orden({precioSugerido:5200, precioAprobado:4800, presupuestoMontoPropuesto:4500, estadoAprobacion:'pendiente', presupuestoEstado:'cambio_solicitado'});
  const aviso = respuestaPendiente(base, AHORA);
  assert.equal(aviso?.categoria, 'precio_por_revisar');
  assert.equal(aviso?.importeSugerido, 4500);
  assert.equal(respuestaPendiente({...base,estadoAprobacion:'aprobado',presupuestoEstado:'aceptado'},AHORA),null);
});
