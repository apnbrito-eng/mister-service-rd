import { describe, expect, it } from 'vitest';
import { elegirResponsable } from '../../src/utils/repartoChats';
const personas = ['a', 'b', 'c'].map(uid => ({ uid, nombre: uid, rol: 'operaria', activo: true }));
const entradas = personas.map(p => ({ personalUid: p.uid, tipo: 'entrada', timestampMs: 100 }));
describe('Reparto de conversaciones por turno', () => {
  it('distribuye equitativamente y reinicia el ciclo', () => {
    let cursor = ''; const reparto = [];
    for (let i = 0; i < 9; i++) { cursor = elegirResponsable(personas, entradas, cursor)!.uid; reparto.push(cursor); }
    expect(reparto).toEqual(['a','b','c','a','b','c','a','b','c']);
  });
  it('excluye salida, sin entrada, desactivadas y roles ajenos', () => {
    expect(elegirResponsable([...personas, { uid: 'd', nombre: 'D', rol: 'administrador' }], [...entradas, { personalUid: 'a', tipo: 'salida', timestampMs: 101 }], 'c')?.uid).toBe('b');
    expect(elegirResponsable(personas.map(p => ({ ...p, activo: false })), entradas)).toBeNull();
    expect(elegirResponsable(personas, [])).toBeNull();
  });
  it('usa el último registro aunque llegue desordenado y favorece salida en empates', () => {
    expect(elegirResponsable([personas[0]], [{ personalUid: 'a', tipo: 'salida', timestampMs: 200 }, entradas[0]])).toBeNull();
    expect(elegirResponsable([personas[0]], [entradas[0], { ...entradas[0], tipo: 'salida' }])).toBeNull();
  });
});
