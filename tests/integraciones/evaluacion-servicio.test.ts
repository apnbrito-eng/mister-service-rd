import { describe, expect, it } from 'vitest';
import {
  validarEvaluacion,
  validarEvaluacionV2,
  extraerParticipantes,
} from '../../api/_lib/evaluacionServicio';

// ─── v1 (legacy — mantener para lecturas antiguas) ───────────────────────────

const v1Values = { puntualidad: 4, trato: 5, claridad: 3, calidad: 2 };
it('v1 guarda las cuatro dimensiones sin convertirlas a NPS', () => {
  expect(validarEvaluacion(v1Values)).toEqual(v1Values);
});
it('v1 rechaza categorías incompletas, extras, fracciones y valores fuera de escala', () => {
  for (const value of [
    null,
    {},
    { ...v1Values, puntualidad: 0 },
    { ...v1Values, trato: 6 },
    { ...v1Values, claridad: 2.5 },
    { ...v1Values, calidad: '5' },
    { ...v1Values, nps: 10 },
  ]) {
    expect(validarEvaluacion(value)).toBeNull();
  }
});

// ─── v2 (writer actual) ──────────────────────────────────────────────────────

const atencionValida = { puntualidad: 5, trato: 4, claridad: 3 };
const tecnicoValido = { puntualidad: 4, trato: 5, claridad: 3, calidad: 5 };

describe('validarEvaluacionV2', () => {
  it('acepta sólo la sección atención (técnico ausente)', () => {
    expect(validarEvaluacionV2({ atencion: atencionValida })).toEqual({
      atencion: atencionValida,
      tecnico: null,
    });
  });
  it('acepta sólo la sección técnico (atención ausente)', () => {
    expect(validarEvaluacionV2({ tecnico: tecnicoValido })).toEqual({
      atencion: null,
      tecnico: tecnicoValido,
    });
  });
  it('acepta ambas secciones completas', () => {
    expect(
      validarEvaluacionV2({ atencion: atencionValida, tecnico: tecnicoValido }),
    ).toEqual({ atencion: atencionValida, tecnico: tecnicoValido });
  });
  it('rechaza cuando ambas secciones faltan o son nulas', () => {
    expect(validarEvaluacionV2({})).toBeNull();
    expect(validarEvaluacionV2({ atencion: null, tecnico: null })).toBeNull();
    expect(validarEvaluacionV2(null)).toBeNull();
    expect(validarEvaluacionV2(undefined)).toBeNull();
  });
  it('rechaza claves fuera de atencion/tecnico', () => {
    expect(
      validarEvaluacionV2({ atencion: atencionValida, nps: 10 }),
    ).toBeNull();
    expect(
      validarEvaluacionV2({ tecnico: tecnicoValido, participantes: {} }),
    ).toBeNull();
  });
  it('rechaza bloques con categorías incompletas o inválidas', () => {
    // atención con sólo 2 categorías
    expect(
      validarEvaluacionV2({ atencion: { puntualidad: 5, trato: 4 } }),
    ).toBeNull();
    // atención con una categoría extra
    expect(
      validarEvaluacionV2({ atencion: { ...atencionValida, calidad: 4 } }),
    ).toBeNull();
    // técnico con score fuera de rango
    expect(
      validarEvaluacionV2({ tecnico: { ...tecnicoValido, puntualidad: 0 } }),
    ).toBeNull();
    // técnico con fracciones
    expect(
      validarEvaluacionV2({ tecnico: { ...tecnicoValido, trato: 4.5 } }),
    ).toBeNull();
    // atención no es objeto
    expect(validarEvaluacionV2({ atencion: 'cinco' })).toBeNull();
    // atención es array
    expect(validarEvaluacionV2({ atencion: [1, 2, 3] })).toBeNull();
  });
});

// ─── extraerParticipantes (atribución server-side) ───────────────────────────

describe('extraerParticipantes', () => {
  it('toma tecnicoId y metadatosCita.responsableAtencionId del doc', () => {
    const resultado = extraerParticipantes({
      tecnicoId: 'uid-tecnico-1',
      metadatosCita: { responsableAtencionId: 'uid-atencion-7' },
    }, new Set(['uid-tecnico-1', 'uid-atencion-7']));
    expect(resultado).toEqual({
      tecnicoUid: 'uid-tecnico-1',
      atencionUid: 'uid-atencion-7',
      atribucionTecnicoConfiable: true,
      atribucionAtencionConfiable: true,
    });
  });
  it('deja atribución explícitamente nula cuando el doc no trae identidad fiable', () => {
    expect(extraerParticipantes({})).toEqual({
      tecnicoUid: null,
      atencionUid: null,
      atribucionTecnicoConfiable: false,
      atribucionAtencionConfiable: false,
    });
    expect(extraerParticipantes(null)).toEqual({
      tecnicoUid: null,
      atencionUid: null,
      atribucionTecnicoConfiable: false,
      atribucionAtencionConfiable: false,
    });
  });
  it('no infiere atención desde operariaId ni responsableId legacy', () => {
    // Órdenes viejas pueden tener operariaId/responsableId con doc.id en vez
    // de uid. La regla "identidad estable o nada" se refleja aquí: sólo
    // metadatosCita.responsableAtencionId es la fuente aceptada.
    const resultado = extraerParticipantes({
      tecnicoId: 'uid-tecnico-9',
      operariaId: 'doc-id-legacy',
      responsableId: 'doc-id-legacy-2',
    }, new Set(['uid-tecnico-9']));
    expect(resultado.atencionUid).toBeNull();
    expect(resultado.atribucionAtencionConfiable).toBe(false);
    expect(resultado.tecnicoUid).toBe('uid-tecnico-9');
    expect(resultado.atribucionTecnicoConfiable).toBe(true);
  });
  it('ignora strings vacías o whitespace', () => {
    const resultado = extraerParticipantes({
      tecnicoId: '   ',
      metadatosCita: { responsableAtencionId: '' },
    });
    expect(resultado.tecnicoUid).toBeNull();
    expect(resultado.atencionUid).toBeNull();
    expect(resultado.atribucionTecnicoConfiable).toBe(false);
    expect(resultado.atribucionAtencionConfiable).toBe(false);
  });
  it('ignora identificadores que no son strings', () => {
    const resultado = extraerParticipantes({
      tecnicoId: 123,
      metadatosCita: { responsableAtencionId: { uid: 'anidado' } },
    } as unknown as Record<string, unknown>);
    expect(resultado.tecnicoUid).toBeNull();
    expect(resultado.atencionUid).toBeNull();
  });
});

it('no atribuye un docId legacy sin usuario canónico verificado', () => {
  expect(extraerParticipantes({ tecnicoId: 'personal-doc-legacy' })).toMatchObject({ tecnicoUid: null, atribucionTecnicoConfiable: false });
});
