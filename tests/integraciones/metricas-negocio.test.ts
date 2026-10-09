import { describe, expect, it } from 'vitest';
import { Personal } from '../../src/types';
import { calidadServicio, creadorIdentificable, coberturaCreadores, cerradasDelPeriodo, periodoValido, comisionAjustada, enPeriodo, fechaCierreMetrica, identidadPersonal, ordenMetrica, rangoMesRD, resumenNegocio } from '../../src/utils/metricasNegocio';
const personal = [{ id: 'p1', uid: 'u1', nombre: 'Ana' }, { id: 'p2', uid: 'u2', nombre: 'Ana' }] as Personal[];
const rango = rangoMesRD('2026-09');
describe('métricas con fuentes verificables', () => {
  it('usa identidades únicas sin unir homónimos ni alias ambiguos', () => {
    expect(identidadPersonal('Ana', personal)).toBeUndefined();
    expect(identidadPersonal('u1', personal)?.id).toBe('p1');
    expect(identidadPersonal('p2', personal)?.id).toBe('p2');
    expect(identidadPersonal('u1', [...personal, { id: 'u1' } as Personal])).toBeUndefined();
  });
  it('delimita mes RD incluso en diciembre y excluye UTC anterior al inicio', () => {
    expect(rango.inicio.toISOString()).toBe('2026-09-01T04:00:00.000Z');
    expect(rango.fin.toISOString()).toBe('2026-10-01T03:59:59.999Z');
    expect(enPeriodo('2026-09-01T02:00:00Z', rango.inicio, rango.fin)).toBe(false);
    expect(rangoMesRD('2026-12').fin.toISOString()).toBe('2027-01-01T03:59:59.999Z');
  });
  it('no transforma fecha ausente ni actualización posterior en fecha de cierre', () => {
    const orden = ordenMetrica('o', { fase: 'cerrado', updatedAt: new Date(), historialFases: [{ fase: 'cerrado' }] });
    expect(Number.isNaN(orden.createdAt.getTime())).toBe(true);
    expect(fechaCierreMetrica(orden)).toBeNull();
    const cerrado = ordenMetrica('o', { historialFases: [{ fase: 'cerrado', timestamp: '2026-09-10' }], updatedAt: '2026-10-01' });
    expect(fechaCierreMetrica(cerrado)?.toISOString()).toBe('2026-09-10T04:00:00.000Z');
  });
  it('refleja ajuste firmado de garantía sin anular comisión ni capar negativos', () => {
    expect(comisionAjustada({ comisionMonto: 1000, descuentoPorGarantia: { monto: -250 } })).toBe(750);
    expect(comisionAjustada({ comisionMonto: 100, descuentoPorGarantia: { monto: -250 } })).toBe(-150);
    expect(comisionAjustada({ comisionMonto: 1000, estaAnulada: true })).toBe(0);
  });
  it('caja usa pagos confirmados reales del período, admite parcial y señala fecha ausente', () => {
    const resumen = resumenNegocio([{ id: 'o', datos: { precio: 10000, pagos: [
      { id: '1', monto: 200, fecha: '2026-09-15', metodo: 'efectivo', verificado: true },
      { id: '2', monto: 300, fecha: '2026-09-15', metodo: 'efectivo', verificado: false },
      { id: '3', monto: 500, metodo: 'efectivo', verificado: true },
      { id: '4', monto: 600, fecha: '2026-08-15', metodo: 'efectivo', verificado: true },
    ] } }], [{ monto: 50, fecha: '2026-09-01' }, { monto: 100 }], rango.inicio, rango.fin);
    expect(resumen.totalConfirmado).toBe(200); expect(resumen.totalPendiente).toBe(300);
    expect(resumen.gastos).toBe(50); expect(resumen.incidencias).toHaveLength(1); expect(resumen.incidenciasGastos).toBe(1);
  });
  it('evaluación usa escala y fecha propia, independiente de NPS', () => {
    const datos = { tecnicoId: 'u1', operariaId: 'u2', evaluacionServicio: { fecha: '2026-09-02', categorias: { puntualidad: 1, trato: 2, claridad: 3, calidad: 4 }, comentario: 'Detalle' } };
    const calidad = calidadServicio([{ id: 'o', datos }, { id: 'nps', datos: { feedback: { nps: 10 } } }], rango.inicio, rango.fin);
    expect(calidad.evaluaciones).toHaveLength(1); expect(calidad.evaluaciones[0].responsableId).toBe('u2');
    expect(calidad.promedios.map(p => p.promedio)).toEqual([1, 2, 3, 4]);
    expect(calidadServicio([{ id: 'x', datos: { evaluacionServicio: { ...datos.evaluacionServicio, fecha: undefined } } }], rango.inicio, rango.fin).incidencias).toBe(1);
  });
});

it('rango inválido no lanza al proyectar caja y creador legacy no se atribuye por nombre', () => {
  for (const mes of ['', '2026-13', '2026-00', 'texto']) {
    const r = rangoMesRD(mes);
    expect(periodoValido(r.inicio, r.fin)).toBe(false);
    expect(resumenNegocio([], [], r.inicio, r.fin).rangoInvalido).toBe(true);
  }
  expect(coberturaCreadores([ordenMetrica('legacy', { creadoPor: 'Ana', createdAt: '2026-09-05' })], personal, rango.inicio, rango.fin)).toBe(1);
});
it('cierres respetan responsable y eliminadas sin exigir creación en el mismo período', () => {
  const o = (id: string, operariaId: string, eliminada = false) => ordenMetrica(id, { operariaId, eliminada, fase: 'cerrado', createdAt: '2026-08-01', cierreServicio: { fechaCierre: '2026-09-05' } });
  expect(cerradasDelPeriodo([o('valida', 'u1'), o('otro', 'u2'), o('eliminada', 'u1', true)], personal, rango.inicio, rango.fin, 'p1').map(o => o.id)).toEqual(['valida']);
});

it('prefiere creador explícito al nombre legacy sin resolver identidades ambiguas', () => {
  const orden = ordenMetrica('o', { creadoPorId: 'u1', creadoPor: 'Ana', createdAt: '2026-09-05', fase: 'cerrado', cierreServicio: { fechaCierre: '2026-09-06' } });
  expect(creadorIdentificable(orden, personal)?.id).toBe('p1');
  expect(coberturaCreadores([orden], personal, rango.inicio, rango.fin)).toBe(0);
  expect(cerradasDelPeriodo([orden], personal, rango.inicio, rango.fin, 'p1')).toHaveLength(1);
  const ambiguos = [...personal, { id: 'u1', nombre: 'Otro' } as Personal];
  expect(creadorIdentificable(orden, ambiguos)).toBeUndefined();
  expect(coberturaCreadores([orden], ambiguos, rango.inicio, rango.fin)).toBe(1);
  expect(creadorIdentificable(ordenMetrica('legacy', { creadoPor: 'Ana' }), personal)).toBeUndefined();
  expect(creadorIdentificable(ordenMetrica('vacio', {}), personal)).toBeUndefined();
  expect(creadorIdentificable(ordenMetrica('desconocido', { creadoPorId: 'desconocido', creadoPor: 'u1' }), personal)).toBeUndefined();
});

it('separa evaluación v2 de atención y técnico y no mezcla respuestas legacy', () => {
  const resultado = calidadServicio([
    { id: 'v2', datos: { tecnicoId: 'otro', operariaId: 'otra', evaluacionServicio: { version: 2, fecha: '2026-09-03', atencion: { puntualidad: 1, trato: 2, claridad: 3 }, tecnico: { puntualidad: 5, trato: 4, claridad: 3, calidad: 2 }, participantes: { atencionUid: 'u1', tecnicoUid: 'u2', atribucionAtencionConfiable: true, atribucionTecnicoConfiable: true } } } },
    { id: 'v1', datos: { evaluacionServicio: { fecha: '2026-09-03', categorias: { puntualidad: 4, trato: 4, claridad: 4, calidad: 4 } } } },
  ], rango.inicio, rango.fin);
  expect(resultado.respuestas).toBe(2);
  expect(resultado.atencion.promedios.map(p => p.promedio)).toEqual([1, 2, 3]);
  expect(resultado.tecnico.promedios.map(p => p.promedio)).toEqual([5, 4, 3, 2]);
  expect(resultado.promedios.map(p => p.promedio)).toEqual([4, 4, 4, 4]);
  expect(resultado.atencion.evaluaciones[0].participanteUid).toBe('u1');
  expect(resultado.tecnico.evaluaciones[0].participanteUid).toBe('u2');
  expect(resultado.evaluaciones[0].participanteUid).toBeNull();
});

it('sección omitida no es cero y atribución no confiable queda sin identidad', () => {
  const resultado = calidadServicio([{ id: 'una', datos: { tecnicoId: 'u2', evaluacionServicio: { version: 2, fecha: '2026-09-03', atencion: null, tecnico: { puntualidad: 5, trato: 5, claridad: 5, calidad: 5 }, participantes: { tecnicoUid: 'u2', atribucionTecnicoConfiable: false } } } }], rango.inicio, rango.fin);
  expect(resultado.respuestas).toBe(1);
  expect(resultado.atencion.evaluaciones).toHaveLength(0);
  expect(resultado.atencion.promedios.every(p => p.promedio === null)).toBe(true);
  expect(resultado.tecnico.evaluaciones[0].participanteUid).toBeNull();
});

it('evalúa fecha propia y excluye datos eliminados o puntuaciones incompletas', () => {
  const evaluacionServicio = { version: 2, fecha: '2026-09-03', atencion: { puntualidad: 3, trato: 4 }, tecnico: null };
  const resultado = calidadServicio([
    { id: 'incompleta', datos: { evaluacionServicio } },
    { id: 'eliminada', datos: { eliminado: true, evaluacionServicio: { ...evaluacionServicio, atencion: { puntualidad: 3, trato: 4, claridad: 5 } } } },
    { id: 'fuera', datos: { evaluacionServicio: { ...evaluacionServicio, fecha: '2026-10-03' } } },
  ], rango.inicio, rango.fin);
  expect(resultado.respuestas).toBe(0);
  expect(resultado.incidencias).toBe(1);
});
