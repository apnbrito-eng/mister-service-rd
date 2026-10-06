// Destino: src/utils/__tests__/clusterPantalla.test.ts
import { describe, expect, it } from 'vitest';
import { agruparEnPantalla, aPixel } from '../../src/utils/clusterPantalla';

const SD = { norte: 18.56, sur: 18.40, este: -69.80, oeste: -70.05 };
// 10,000 clientes repartidos en Santo Domingo (determinista)
const puntos = Array.from({ length: 10_000 }, (_, i) => ({ id: `c${i}`, lat: 18.42 + ((i * 7919) % 1000) / 1000 * 0.12, lng: -70.02 + ((i * 104729) % 1000) / 1000 * 0.2 }));

describe('agrupar en pantalla', () => {
  it('nunca pasa del máximo de marcadores y no pierde clientes', () => {
    const g = agruparEnPantalla(puntos, SD, 12);
    expect(g.length).toBeLessThanOrEqual(300);
    expect(g.reduce((a, x) => a + x.items.length, 0)).toBe(10_000);
  });
  it('con zoom alto y pocos visibles los muestra sueltos', () => {
    const chico = { norte: 18.4705, sur: 18.4695, este: -69.9295, oeste: -69.9305 };
    const g = agruparEnPantalla([...puntos, { id: 'x', lat: 18.47, lng: -69.93 }], chico, 17);
    expect(g.every(x => x.items.length === 1)).toBe(true);
    expect(g.some(x => x.id === 'x')).toBe(true);
  });
  it('deja fuera lo que no se ve', () => {
    const g = agruparEnPantalla([{ id: 'lejos', lat: 19.45, lng: -70.7 }], SD, 12);
    expect(g).toHaveLength(0);
  });
  it('es rápido con 10,000', () => {
    const t = performance.now();
    for (let i = 0; i < 10; i++) agruparEnPantalla(puntos, SD, 11 + (i % 4));
    expect((performance.now() - t) / 10).toBeLessThan(60);
  });
  it('proyección', () => {
    const a = aPixel({ lat: 0, lng: 0 }, 0);
    expect(a.x).toBeCloseTo(128); expect(a.y).toBeCloseTo(128);
  });
});
