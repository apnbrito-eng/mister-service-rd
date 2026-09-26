import { describe, expect, it } from 'vitest';
import { desplazamientoVisible } from '../../src/mobile/viewport';
describe('Visibilidad de campos al abrir teclado', () => {
  it('detecta el campo que queda debajo del teclado', () => {
    expect(desplazamientoVisible(524, 574, 470)).toBe(120);
  });
  it('no mueve un campo visible ni reinicia el desplazamiento del chat', () => {
    expect(desplazamientoVisible(200, 250, 470)).toBe(0);
  });
  it('detecta campos escondidos por arriba y respeta el margen', () => {
    expect(desplazamientoVisible(-30, 20, 470)).toBe(-46);
  });
});
