/**
 * mapa-ui-selectores.test.ts — pruebas puras de los selectores del panel y los
 * utilitarios de ruta. Validan los hallazgos QA tercera pasada:
 *
 *  1. `resolverCita` nunca produce side-effects: devuelve `backlog` sin disparar
 *     navegación cuando la orden vive solo en los pendientes anteriores.
 *  2. `unionBacklog` deduplica alias uid/docId sin falsos matches.
 *  3. `rutaPintable` rechaza huella distinta, fuente estimada y edad vencida.
 *  4. `filtrarFixturePorRango` del hook: QA Mañana no conserva órdenes de Hoy.
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/firebase/config', async () => {
  const { initializeApp } = await import('firebase/app');
  const { getFirestore } = await import('firebase/firestore');
  return { db: getFirestore(initializeApp({ projectId: 'demo-mapa-selectores' }, 'selectores-test')), auth: {} };
});
import {
  resolverCita,
  unionBacklog,
  huellaRuta,
  rutaPintable,
  MAX_EDAD_RUTA_MS_SIN_TRAFICO,
  MAX_EDAD_RUTA_MS_CON_TRAFICO,
} from '../../src/components/mapa/selectoresPanel';
import { filtrarFixturePorRango, type MapaFixture, type EstadoAbiertosTecnico } from '../../src/hooks/useMapaDatos';
import type { OrdenServicio } from '../../src/types';

const orden = (id: string, over: Partial<OrdenServicio> = {}): OrdenServicio => ({
  id,
  numero: id,
  clienteId: 'c',
  clienteNombre: 'C',
  clienteDireccion: '',
  equipoTipo: 'nevera',
  equipoMarca: 'LG',
  equipoModelo: 'Side-by-side',
  descripcionFalla: 'x',
  tecnicoId: 'uid-a',
  tecnicoNombre: 'A',
  fase: 'agendado',
  estadoSimple: 'pendiente',
  estado: 'activo',
  historialFases: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('resolverCita (sin side-effects, backlog visible)', () => {
  const ordenRango = orden('en-rango');
  const ordenBacklog = orden('backlog-1');
  const ordenesRango: OrdenServicio[] = [ordenRango];
  const abiertos: Record<string, EstadoAbiertosTecnico> = {
    'uid-a': { cargando: false, error: null, ordenes: [ordenBacklog] },
  };

  it('devuelve en_rango cuando la orden está en el listado del rango activo', () => {
    const r = resolverCita('en-rango', ordenesRango, abiertos);
    expect(r.tipo).toBe('en_rango');
  });

  it('devuelve backlog cuando la orden solo vive en abiertos anteriores', () => {
    const r = resolverCita('backlog-1', ordenesRango, abiertos);
    expect(r.tipo).toBe('backlog');
    expect(r.tipo === 'backlog' && r.orden.id).toBe('backlog-1');
  });

  it('reporta cargando mientras cualquier técnico aún trae su backlog', () => {
    const abiertosCarga = {
      ...abiertos,
      'uid-b': { cargando: true, error: null, ordenes: [] },
    };
    const r = resolverCita('fantasma', ordenesRango, abiertosCarga);
    expect(r.tipo).toBe('cargando');
  });

  it('reporta ausente cuando todos los backlogs ya resolvieron', () => {
    const r = resolverCita('fantasma', ordenesRango, abiertos);
    expect(r.tipo).toBe('ausente');
  });
});

describe('unionBacklog deduplica alias', () => {
  const dup = orden('dup');
  it('misma orden expuesta por uid y docId se cuenta UNA vez', () => {
    const abiertos: Record<string, EstadoAbiertosTecnico> = {
      'uid-a': { cargando: false, error: null, ordenes: [dup] },
      'personal-doc-a': { cargando: false, error: null, ordenes: [dup] },
    };
    const u = unionBacklog(['uid-a', 'personal-doc-a'], abiertos);
    expect(u).toHaveLength(1);
    expect(u[0].id).toBe('dup');
  });

  it('ignora alias no cargados', () => {
    const abiertos: Record<string, EstadoAbiertosTecnico> = {
      'uid-a': { cargando: false, error: null, ordenes: [dup] },
    };
    const u = unionBacklog(['uid-a', 'nunca-cargado'], abiertos);
    expect(u).toHaveLength(1);
  });
});

describe('huellaRuta + rutaPintable', () => {
  const puntos = [
    { lat: 18.4700, lng: -69.9400 },
    { lat: 18.4710, lng: -69.9420 },
    { lat: 18.4720, lng: -69.9440 },
  ];
  const huella = huellaRuta('uid-a', '2026-10-02', puntos, false);

  it('huella cambia si cambia el técnico', () => {
    expect(huellaRuta('uid-b', '2026-10-02', puntos, false)).not.toBe(huella);
  });
  it('huella cambia si cambia una coord', () => {
    const otra = [...puntos.slice(0, 2), { lat: 18.5, lng: -69.9 }];
    expect(huellaRuta('uid-a', '2026-10-02', otra, false)).not.toBe(huella);
  });
  it('huella cambia si cambia el día', () => {
    expect(huellaRuta('uid-a', '2026-10-03', puntos, false)).not.toBe(huella);
  });
  it('huella cambia si cambia el flag trafico', () => {
    expect(huellaRuta('uid-a', '2026-10-02', puntos, true)).not.toBe(huella);
  });

  const ahora = Date.now();

  it('rutaPintable rechaza null', () => {
    expect(rutaPintable(null, huella, ahora)).toBe(false);
  });
  it('rutaPintable rechaza huella distinta', () => {
    expect(rutaPintable({ huella: 'otra', calculadoEn: ahora, fuente: 'google', trafico: false }, huella, ahora)).toBe(false);
  });
  it('rutaPintable rechaza fuente estimado aunque huella coincida', () => {
    expect(rutaPintable({ huella, calculadoEn: ahora, fuente: 'estimado', trafico: false }, huella, ahora)).toBe(false);
  });
  it('rutaPintable rechaza respuesta vencida sin tráfico (>30 min)', () => {
    const antes = ahora - MAX_EDAD_RUTA_MS_SIN_TRAFICO - 1000;
    expect(rutaPintable({ huella, calculadoEn: antes, fuente: 'google', trafico: false }, huella, ahora)).toBe(false);
  });
  it('rutaPintable rechaza respuesta vencida con tráfico (>10 min)', () => {
    const antes = ahora - MAX_EDAD_RUTA_MS_CON_TRAFICO - 1000;
    expect(rutaPintable({ huella, calculadoEn: antes, fuente: 'google', trafico: true }, huella, ahora)).toBe(false);
  });
  it('rutaPintable acepta Google fresca con huella correcta', () => {
    expect(rutaPintable({ huella, calculadoEn: ahora - 1000, fuente: 'google', trafico: false }, huella, ahora)).toBe(true);
  });
});

describe('filtrarFixturePorRango simula la query real', () => {
  const DIA = 86_400_000;
  const inicioHoy = Date.UTC(2026, 9, 2); // 2 oct 2026 00:00 UTC (RD-00:00)
  const finHoy = inicioHoy + DIA;
  const inicioManana = inicioHoy + DIA;
  const finManana = inicioManana + DIA;

  const fixture: MapaFixture = {
    ordenes: [
      orden('hoy-1', { fechaCita: new Date(inicioHoy + 10 * 3600_000) }),
      orden('hoy-2', { fechaCita: new Date(inicioHoy + 15 * 3600_000) }),
      orden('manana-1', { fechaCita: new Date(inicioManana + 11 * 3600_000) }),
      orden('backlog-sin-fecha'),
      orden('vieja', { fechaCita: new Date(inicioHoy - 5 * DIA) }),
      orden('eliminada', { fechaCita: new Date(inicioHoy + 10 * 3600_000), eliminada: true }),
    ],
    personal: [],
    gps: [],
    clientes: [],
  };

  it('Hoy conserva solo las citas de hoy; descarta mañana, backlog, eliminadas', () => {
    const r = filtrarFixturePorRango(fixture, inicioHoy, finHoy);
    expect(r.map((o) => o.id).sort()).toEqual(['hoy-1', 'hoy-2']);
  });

  it('Mañana NO conserva órdenes de hoy (hallazgo QA tercera pasada)', () => {
    const r = filtrarFixturePorRango(fixture, inicioManana, finManana);
    expect(r.map((o) => o.id)).toEqual(['manana-1']);
    expect(r.some((o) => o.id.startsWith('hoy-'))).toBe(false);
  });

  it('Rango inválido (fin ≤ inicio) devuelve vacío', () => {
    expect(filtrarFixturePorRango(fixture, inicioHoy, inicioHoy)).toEqual([]);
    expect(filtrarFixturePorRango(fixture, finHoy, inicioHoy)).toEqual([]);
  });

  it('Rango con Infinity (no numérico) devuelve vacío (sin crash)', () => {
    expect(filtrarFixturePorRango(fixture, Infinity, finHoy)).toEqual([]);
    expect(filtrarFixturePorRango(fixture, inicioHoy, NaN)).toEqual([]);
  });
});
