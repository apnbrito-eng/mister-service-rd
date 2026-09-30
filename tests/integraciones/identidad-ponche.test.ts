import { expect, it } from 'vitest';
import { personalIdDePonche, claveIdentidadPonche } from '../../src/utils/identidadPonche';
it('legacy UID único filtra ficha exacta también de personal inactivo', () => {
  const lista = [{ id: 'p1', uid: 'u1', activo: false }, { id: 'p2', uid: 'u2', activo: true }];
  expect(personalIdDePonche({ personalUid: 'u1' }, lista)).toBe('p1');
  expect(personalIdDePonche({ personalId: 'p2', personalUid: 'u1' }, lista)).toBe('p2');
});
it('UID ambiguo o desconocido no se atribuye por nombre', () => {
  const lista = [{ id: 'p1', uid: 'u1', nombre: 'Ana' }, { id: 'p2', uid: 'u1', nombre: 'Ana' }];
  expect(personalIdDePonche({ personalUid: 'u1' }, lista)).toBeNull();
  expect(personalIdDePonche({ personalUid: 'u3' }, lista)).toBeNull();
});

it('entrada UID legacy y salida con documento comparten grupo únicamente si identidad es única', () => {
  const personal = [{ id: 'p1', uid: 'u1' }];
  const entrada = { id: 'entrada', personalUid: 'u1' };
  const salida = { id: 'salida', personalId: 'p1', personalUid: 'u1' };
  expect(claveIdentidadPonche(entrada, personal)).toBe(claveIdentidadPonche(salida, personal));
  const ambiguos = [...personal, { id: 'p2', uid: 'u1' }];
  expect(claveIdentidadPonche(entrada, ambiguos)).not.toBe(claveIdentidadPonche(salida, ambiguos));
  expect(claveIdentidadPonche(entrada, ambiguos)).not.toBe(claveIdentidadPonche({ ...entrada, id: 'otra-salida' }, ambiguos));
});
