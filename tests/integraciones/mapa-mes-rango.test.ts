/**
 * mapa-mes-rango.test.ts — pruebas directas de `VistaMes` del Mapa de
 * operaciones. Verifican:
 *
 *  1. `mesesAlcanzados` lista TODOS los meses tocados por un rango (28 oct →
 *     3 dic ⇒ oct, nov, dic). Sin recortar al primero.
 *  2. `gridMes` arranca en lunes RD independiente de la zona del dispositivo
 *     (se corre bajo `TZ=UTC` y `TZ=Asia/Tokyo`).
 *  3. `diaDentroDeRango` marca inclusivos ambos extremos y excluye un día
 *     fuera.
 *  4. Render con `react-test-renderer`: encabezado dice «Mes 1 de N dentro
 *     del rango» cuando N > 1; hay secciones por cada mes alcanzado; los
 *     días fuera del rango llevan `aria-disabled="true"` y NO muestran el
 *     contador aunque haya citas de ese día.
 *  5. Navegación prev/next avanza entre los meses del rango — nunca fuera.
 *
 * No usa red, Firestore ni API real. react-test-renderer solo rinde el árbol
 * virtual.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import VistaMes, {
  mesesAlcanzados,
  gridMes,
  diaDentroDeRango,
} from '../../src/components/mapa/VistaMes';
import { fechaEnRD, componentesRD } from '../../src/utils/mapaFechas';
import type { CitaMapa } from '../../src/utils/mapaOperaciones';

function cita(id: string, inicio: Date): CitaMapa {
  return {
    id,
    tecnicoId: 'uid-a',
    clienteNombre: 'C',
    inicio,
    equipo: null,
    tipo: 'reparacion',
    fase: 'agendado',
    progreso: { indice: 0, completa: false, cancelada: false },
  };
}

describe('mesesAlcanzados', () => {
  it('rango que empieza y termina en el mismo mes devuelve 1 mes', () => {
    const inicio = fechaEnRD(2026, 9, 2); // 2 oct
    const fin = fechaEnRD(2026, 9, 20); // 20 oct
    const m = mesesAlcanzados(inicio, fin);
    expect(m).toHaveLength(1);
    expect(m[0]).toEqual({ anio: 2026, mes: 9 });
  });

  it('rango que cruza 3 meses devuelve los 3 meses en orden', () => {
    const inicio = fechaEnRD(2026, 9, 28); // 28 oct
    const fin = fechaEnRD(2026, 11, 3);   // 3 dic
    const m = mesesAlcanzados(inicio, fin);
    expect(m).toEqual([
      { anio: 2026, mes: 9 },
      { anio: 2026, mes: 10 },
      { anio: 2026, mes: 11 },
    ]);
  });

  it('cruza fin de año', () => {
    const inicio = fechaEnRD(2026, 11, 15); // 15 dic 2026
    const fin = fechaEnRD(2027, 1, 10);    // 10 feb 2027
    const m = mesesAlcanzados(inicio, fin);
    expect(m).toEqual([
      { anio: 2026, mes: 11 },
      { anio: 2027, mes: 0 },
      { anio: 2027, mes: 1 },
    ]);
  });

  it('fin anterior a inicio por error — devuelve sólo el inicio', () => {
    const inicio = fechaEnRD(2026, 9, 20);
    const fin = fechaEnRD(2026, 9, 10);
    const m = mesesAlcanzados(inicio, fin);
    expect(m).toEqual([{ anio: 2026, mes: 9 }]);
  });
});

describe('gridMes arranca en lunes RD independiente del TZ', () => {
  // En RD, 1 oct 2026 es jueves (diaSemana=4). El grid lunes-primero debe
  // empezar en el lunes RD de esa semana: 28 sep 2026.
  const esperadoPrimerDiaMsRD = fechaEnRD(2026, 8, 28).getTime();

  const correrEnTZ = (tz: string) => {
    const prev = process.env.TZ;
    process.env.TZ = tz;
    try {
      const dias = gridMes(2026, 9);
      expect(dias).toHaveLength(42);
      expect(dias[0].getTime()).toBe(esperadoPrimerDiaMsRD);
      // Verificamos un día del mes principal (15 oct) está en la grid.
      const quince = fechaEnRD(2026, 9, 15).getTime();
      expect(dias.some((d) => d.getTime() === quince)).toBe(true);
      // Último día cae ya en noviembre (fila de desbordamiento).
      const compUltimo = componentesRD(dias[41]);
      expect(compUltimo.mes === 10 || compUltimo.mes === 9).toBe(true);
    } finally {
      process.env.TZ = prev;
    }
  };

  it('corre bajo TZ=UTC', () => { correrEnTZ('UTC'); });
  it('corre bajo TZ=Asia/Tokyo', () => { correrEnTZ('Asia/Tokyo'); });
});

describe('diaDentroDeRango', () => {
  const inicio = fechaEnRD(2026, 9, 5);
  const fin = fechaEnRD(2026, 10, 10);

  it('inclusivo en el extremo inicial', () => {
    const c = componentesRD(inicio);
    expect(diaDentroDeRango(c, inicio, fin)).toBe(true);
  });
  it('inclusivo en el extremo final', () => {
    const c = componentesRD(fin);
    expect(diaDentroDeRango(c, inicio, fin)).toBe(true);
  });
  it('día anterior al inicio queda fuera', () => {
    const c = componentesRD(fechaEnRD(2026, 9, 4));
    expect(diaDentroDeRango(c, inicio, fin)).toBe(false);
  });
  it('día posterior al fin queda fuera', () => {
    const c = componentesRD(fechaEnRD(2026, 10, 11));
    expect(diaDentroDeRango(c, inicio, fin)).toBe(false);
  });
});

/** Helper: recorre el árbol y recoge nodos que satisfacen el predicado. */
function recoger(nodo: TestRenderer.ReactTestInstance | TestRenderer.ReactTestInstance[], pred: (n: TestRenderer.ReactTestInstance) => boolean): TestRenderer.ReactTestInstance[] {
  if (Array.isArray(nodo)) return nodo.flatMap((n) => recoger(n, pred));
  const found: TestRenderer.ReactTestInstance[] = [];
  if (pred(nodo)) found.push(nodo);
  for (const child of nodo.children) {
    if (typeof child !== 'string') found.push(...recoger(child, pred));
  }
  return found;
}

describe('<VistaMes /> renderiza TODOS los meses alcanzados', () => {
  const inicio = fechaEnRD(2026, 9, 28); // 28 oct 2026
  const fin = fechaEnRD(2026, 11, 3);   // 3 dic 2026
  const ahora = fechaEnRD(2026, 9, 29, 12);
  const citas: CitaMapa[] = [
    cita('c1', fechaEnRD(2026, 9, 30, 10)), // 30 oct — dentro
    cita('c2', fechaEnRD(2026, 10, 15, 10)), // 15 nov — dentro
    cita('c3', fechaEnRD(2026, 11, 2, 10)), // 2 dic — dentro
    cita('c4', fechaEnRD(2026, 9, 5, 10)), // 5 oct — FUERA del rango
  ];

  const render = () =>
    TestRenderer.create(
      createElement(VistaMes, {
        rango: { inicio, fin },
        citas,
        ahora,
        onSeleccionarDia: () => {},
        onNavegarMes: () => {},
      }),
    );

  it('crea una sección por cada mes del rango (oct/nov/dic)', () => {
    const tree = render();
    try {
      const secciones = tree.root.findAll((n) => n.type === 'section' && typeof n.props?.['data-mes'] === 'string');
      const claves = secciones.map((s) => s.props['data-mes']);
      expect(claves).toContain('2026-10'); // oct
      expect(claves).toContain('2026-11'); // nov
      expect(claves).toContain('2026-12'); // dic
      expect(claves).toHaveLength(3);
    } finally { tree.unmount(); }
  });

  it('encabezado reporta «Mes 1 de 3 dentro del rango»', () => {
    const tree = render();
    try {
      // El texto se arma con interpolaciones, así que React genera varios children.
      const divs = tree.root.findAll((n) => n.type === 'div');
      const presente = divs.some((d) => {
        const texto = d.children.map((c) => (typeof c === 'string' ? c : '')).join('');
        return /Mes 1 de 3 dentro del rango/.test(texto);
      });
      expect(presente).toBe(true);
    } finally { tree.unmount(); }
  });

  it('días fuera del rango son aria-disabled y NO muestran contador aunque haya citas', () => {
    const tree = render();
    try {
      // Buscamos el botón del 5 de octubre: dentro del mes oct, 5, fuera del rango inclusive.
      const botones = tree.root.findAll((n) => n.type === 'button' && n.props?.['data-del-mes'] === 'true' && n.props?.['data-dentro-rango'] === 'false');
      // Esperamos al menos un botón fuera de rango (p.ej. el 1-27 oct).
      expect(botones.length).toBeGreaterThan(0);
      // Ninguno debería tener contador (span con bg-brand-50 — count>0 solo si dentro).
      for (const b of botones) {
        const contadores = recoger(b, (n) => n.type === 'span' && typeof n.props?.className === 'string' && n.props.className.includes('bg-brand-50'));
        expect(contadores).toHaveLength(0);
        expect(b.props['aria-disabled']).toBe(true);
        expect(b.props.title).toBe('Fuera del rango seleccionado');
      }
    } finally { tree.unmount(); }
  });

  it('días dentro del rango con citas muestran el contador correcto', () => {
    const tree = render();
    try {
      // El 30 oct tiene una cita; el botón del día 30 oct dentro del grid de oct debe mostrar 1.
      const grid = tree.root.findAll((n) => n.type === 'section' && n.props?.['data-mes'] === '2026-10');
      expect(grid).toHaveLength(1);
      const botones = grid[0].findAll((n) => n.type === 'button' && n.props?.['data-del-mes'] === 'true' && n.props?.['data-dentro-rango'] === 'true');
      // Mapa de dia -> count. Un botón del día 30 debe mostrar count 1.
      const treinta = botones.find((b) => {
        const spans = b.findAll((n) => n.type === 'span');
        return spans.some((s) => {
          const txt = s.children[0];
          return typeof txt === 'string' && txt.trim() === '30';
        });
      });
      expect(treinta).toBeDefined();
      const contador = treinta!.findAll((n) => n.type === 'span' && typeof n.props?.className === 'string' && n.props.className.includes('bg-brand-50'));
      expect(contador).toHaveLength(1);
      const txt = contador[0].children.map((c) => (typeof c === 'string' ? c : String(c))).join('');
      expect(txt).toBe('1');
    } finally { tree.unmount(); }
  });

  it('botón «mes anterior» está deshabilitado en el primer mes y «siguiente» avanza', () => {
    const tree = render();
    try {
      const prev = tree.root.findAll((n) => n.type === 'button' && n.props?.['aria-label'] === 'Mes anterior dentro del rango');
      const next = tree.root.findAll((n) => n.type === 'button' && n.props?.['aria-label'] === 'Mes siguiente dentro del rango');
      expect(prev).toHaveLength(1);
      expect(next).toHaveLength(1);
      expect(prev[0].props.disabled).toBe(true);
      expect(next[0].props.disabled).toBe(false);

      // Avanzamos al siguiente mes.
      act(() => { next[0].props.onClick(); });

      // Ahora debería mostrar «Mes 2 de 3 dentro del rango».
      const divs2 = tree.root.findAll((n) => n.type === 'div');
      const encabezado2 = divs2.some((d) => {
        const texto = d.children.map((c) => (typeof c === 'string' ? c : '')).join('');
        return /Mes 2 de 3 dentro del rango/.test(texto);
      });
      expect(encabezado2).toBe(true);
    } finally { tree.unmount(); }
  });

  it('navegación nunca sale de los meses alcanzados', () => {
    const tree = render();
    try {
      const next = tree.root.findAll((n) => n.type === 'button' && n.props?.['aria-label'] === 'Mes siguiente dentro del rango');
      // Avanzamos 2 veces hasta el último mes.
      act(() => { next[0].props.onClick(); });
      act(() => { next[0].props.onClick(); });
      // En el último mes, next debe quedar deshabilitado y prev habilitado.
      const next2 = tree.root.findAll((n) => n.type === 'button' && n.props?.['aria-label'] === 'Mes siguiente dentro del rango');
      const prev2 = tree.root.findAll((n) => n.type === 'button' && n.props?.['aria-label'] === 'Mes anterior dentro del rango');
      expect(next2[0].props.disabled).toBe(true);
      expect(prev2[0].props.disabled).toBe(false);
    } finally { tree.unmount(); }
  });
});

describe('<VistaMes /> rango de un solo mes', () => {
  const inicio = fechaEnRD(2026, 9, 5);
  const fin = fechaEnRD(2026, 9, 20);
  const ahora = fechaEnRD(2026, 9, 10, 12);

  it('solo pinta un mes y oculta el subheader «Mes k de N»', () => {
    const tree = TestRenderer.create(
      createElement(VistaMes, {
        rango: { inicio, fin },
        citas: [],
        ahora,
        onSeleccionarDia: () => {},
      }),
    );
    try {
      const secciones = tree.root.findAll((n) => n.type === 'section' && typeof n.props?.['data-mes'] === 'string');
      expect(secciones).toHaveLength(1);
      const divs = tree.root.findAll((n) => n.type === 'div');
      const subheader = divs.some((d) => {
        const texto = d.children.map((c) => (typeof c === 'string' ? c : '')).join('');
        return /Mes \d+ de \d+ dentro del rango/.test(texto);
      });
      expect(subheader).toBe(false);
    } finally { tree.unmount(); }
  });

  it('onSeleccionarDia recibe el Date exacto del botón clickeado', () => {
    let diaRecibido: Date | null = null;
    const tree = TestRenderer.create(
      createElement(VistaMes, {
        rango: { inicio, fin },
        citas: [],
        ahora,
        onSeleccionarDia: (d: Date) => { diaRecibido = d; },
      }),
    );
    try {
      // Botón del 10 oct — dentro del rango.
      const botones = tree.root.findAll((n) => n.type === 'button' && n.props?.['data-del-mes'] === 'true');
      const diez = botones.find((b) => {
        const spans = b.findAll((n) => n.type === 'span');
        return spans.some((s) => {
          const txt = s.children[0];
          return typeof txt === 'string' && txt.trim() === '10';
        });
      });
      expect(diez).toBeDefined();
      act(() => { diez!.props.onClick(); });
      expect(diaRecibido).not.toBeNull();
      const c = componentesRD(diaRecibido!);
      expect(c.anio).toBe(2026);
      expect(c.mes).toBe(9);
      expect(c.dia).toBe(10);
    } finally { tree.unmount(); }
  });
});
