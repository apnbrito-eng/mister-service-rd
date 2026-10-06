/**
 * mapa-ui-marcadores.test.ts — garantiza que los marcadores creados por los
 * builders de `componentes/mapa/marcadores.ts` tengan atributos de accesibilidad
 * correctos: `role=button`, `aria-label`, `tabIndex=0`. Y, crítico, verifica
 * que `pinCita` NUNCA pinta gris cuando la cita es garantía (hallazgo histórico
 * QA #16 — garantía SIEMPRE roja).
 *
 * No necesita jsdom: construimos un stub mínimo de `document` nativo con
 * `createElement` basado en EventTarget. El objetivo es ejercitar el shape de
 * los nodos devueltos y asegurar atributos accesibles — no renderizar.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

interface NodoFake {
  tagName: string;
  style: { cssText: string };
  title: string;
  tabIndex: number;
  textContent: string;
  _attrs: Record<string, string>;
  _children: NodoFake[];
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | null;
  append: (...xs: NodoFake[]) => void;
}

function crearNodo(tag: string): NodoFake {
  const n: NodoFake = {
    tagName: tag.toUpperCase(),
    style: { cssText: '' },
    title: '',
    tabIndex: -1,
    textContent: '',
    _attrs: {},
    _children: [],
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k] ?? null; },
    append(...xs: NodoFake[]) { this._children.push(...xs); },
  };
  return n;
}

const docStub = {
  createElement(tag: string) { return crearNodo(tag) as unknown as HTMLElement; },
  createElementNS(_ns: string, tag: string) {
    const n = crearNodo(tag) as unknown as SVGElement & NodoFake;
    return n;
  },
};

const prevDoc = (globalThis as unknown as { document?: unknown }).document;
beforeAll(() => {
  (globalThis as unknown as { document: typeof docStub }).document = docStub;
});
afterAll(() => {
  (globalThis as unknown as { document: unknown }).document = prevDoc;
});

describe('marcadores — accesibilidad y colores', () => {
  it('pinCita envoltorio es botón accesible por teclado', async () => {
    const { pinCita } = await import('../../src/components/mapa/marcadores');
    const nodo = pinCita({
      numero: 1, color: '#0f3460', garantia: false, hecha: false,
      atrasada: false, seleccionada: false, titulo: 'Cliente Simulado',
    }) as unknown as NodoFake;
    expect(nodo.getAttribute('role')).toBe('button');
    expect(nodo.getAttribute('aria-label')).toBe('Cliente Simulado');
    expect(nodo.tabIndex).toBe(0);
  });

  it('pinCita pinta rojo cuando garantia=true aunque esté hecha', async () => {
    const { pinCita, COLOR } = await import('../../src/components/mapa/marcadores');
    const nodo = pinCita({
      numero: 1, color: '#0f3460', garantia: true, hecha: true,
      atrasada: false, seleccionada: false, titulo: 'Garantía',
    }) as unknown as NodoFake;
    // La envoltura contiene al wrapper; dentro del wrapper, la gota tiene el color.
    const anidar: NodoFake[] = [];
    const recorrer = (n: NodoFake) => { anidar.push(n); n._children.forEach(recorrer); };
    recorrer(nodo);
    const gota = anidar.find((n) => n.style.cssText.includes('border-radius:50% 50% 50% 0'));
    expect(gota).toBeDefined();
    expect(gota!.style.cssText).toContain(COLOR.garantia);
  });

  it('marcadorVan es botón con teclado', async () => {
    const { marcadorVan } = await import('../../src/components/mapa/marcadores');
    const nodo = marcadorVan({
      inicial: 'A', color: '#000', hechas: 1, total: 3, atrasado: false,
      senal: 'ok', etiqueta: 'A · 1/3', titulo: 'Técnico A',
    }) as unknown as NodoFake;
    expect(nodo.getAttribute('role')).toBe('button');
    expect(nodo.getAttribute('aria-label')).toBe('Técnico A');
    expect(nodo.tabIndex).toBe(0);
  });

  it('puntoCliente es botón con teclado', async () => {
    const { puntoCliente } = await import('../../src/components/mapa/marcadores');
    const nodo = puntoCliente('#4a6fa5', 'Cliente X') as unknown as NodoFake;
    expect(nodo.getAttribute('role')).toBe('button');
    expect(nodo.getAttribute('aria-label')).toBe('Cliente X');
    expect(nodo.tabIndex).toBe(0);
  });

  it('grupoClientes es botón con teclado', async () => {
    const { grupoClientes } = await import('../../src/components/mapa/marcadores');
    const nodo = grupoClientes(5, [{ color: '#4a6fa5', n: 5 }]) as unknown as NodoFake;
    expect(nodo.getAttribute('role')).toBe('button');
    expect(nodo.getAttribute('aria-label')).toContain('5 clientes');
    expect(nodo.tabIndex).toBe(0);
  });
});
