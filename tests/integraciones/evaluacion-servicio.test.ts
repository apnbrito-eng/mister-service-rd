import { expect, it } from 'vitest';
import { validarEvaluacion } from '../../api/_lib/evaluacionServicio';
const values = { puntualidad: 4, trato: 5, claridad: 3, calidad: 2 };
it('guarda las cuatro dimensiones sin convertirlas a NPS', () => { expect(validarEvaluacion(values)).toEqual(values); });
it('rechaza categorías incompletas, extras, fracciones y valores fuera de escala', () => {
  for (const value of [null, {}, { ...values, puntualidad: 0 }, { ...values, trato: 6 }, { ...values, claridad: 2.5 }, { ...values, calidad: '5' }, { ...values, nps: 10 }]) expect(validarEvaluacion(value)).toBeNull();
});
