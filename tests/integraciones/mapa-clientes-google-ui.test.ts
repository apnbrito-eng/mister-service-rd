/**
 * MapaClientes · motor Google compartido.
 *
 * El objetivo es verificar comportamiento de UI del componente nuevo sin montar
 * Google Maps real (no se puede en Node) y sin regenerar la infraestructura ya
 * cubierta por tests existentes:
 *   - `codex-mapa-google.test.ts` cubre el motor `MapaGoogle` y su loader.
 *   - `clusterPantalla.test.ts` cubre el agrupador por pantalla (10k puntos).
 *   - `chat-cliente-empresa.test.ts` cubre `BotonChatCliente`.
 *
 * Acá se mockea `MapaGoogle` para exponer directamente los marcadores que recibe,
 * y se mockea `BotonChatCliente` para evitar su contexto de router/atencion. Lo
 * que se prueba es cómo `MapaClientes`:
 *   - delega el callback de expediente;
 *   - usa la lista accesible como fallback cuando el motor falla (prop `sinMapa`);
 *   - produce menos de 300 marcadores incluso con 9.000 clientes;
 *   - olvida la selección cuando el dataset cambia;
 *   - usa `BotonChatCliente` (inbox empresarial) y nunca `wa.me`.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cliente } from '../../src/types';

type MarcadorMock = {
  id: string;
  capa: string;
  titulo: string;
  pos: { lat: number; lng: number };
  clave: string;
};

type MapaGoogleMockProps = {
  marcadores: MarcadorMock[];
  sinMapa?: React.ReactNode;
  onClickMarcador: (m: MarcadorMock) => void;
  onCambioVista?: (v: { limites: { norte: number; sur: number; este: number; oeste: number }; zoom: number }) => void;
  onClickMapa?: () => void;
};

const estado = vi.hoisted(() => ({
  props: null as MapaGoogleMockProps | null,
}));

vi.mock('../../src/components/mapa/MapaGoogle', () => ({
  __esModule: true,
  default: (p: MapaGoogleMockProps) => {
    estado.props = p;
    return React.createElement(
      'div',
      { 'data-testid': 'mapa-google-mock' },
      React.createElement('output', { 'data-ids': 'si' }, JSON.stringify(p.marcadores.map((m) => m.id))),
      React.createElement('div', { 'data-sin-mapa': 'si' }, p.sinMapa ?? null),
    );
  },
}));

vi.mock('../../src/components/shared/BotonChatCliente', () => ({
  __esModule: true,
  default: (props: {
    telefono?: string;
    nombre?: string;
    clienteId?: string;
    children?: React.ReactNode;
    className?: string;
  }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        'data-boton-chat': 'si',
        'data-cliente-id': props.clienteId ?? '',
        'data-telefono': props.telefono ?? '',
        'data-nombre': props.nombre ?? '',
        className: props.className ?? '',
      },
      props.children ?? 'WhatsApp empresa',
    ),
}));

import MapaClientes from '../../src/components/clientes/MapaClientes';

const VISTA_ANCHA = {
  limites: { norte: 19.5, sur: 17.5, este: -68.0, oeste: -72.0 },
  zoom: 11,
};
const VISTA_PINES_SUELTOS = { ...VISTA_ANCHA, zoom: 18 };

function cli(id: string, lat?: number, lng?: number, nombre?: string): Cliente {
  return {
    id,
    nombre: nombre ?? `Cliente ${id}`,
    telefono: '8095550101',
    direccion: '',
    lat,
    lng,
  } as Cliente;
}

let tree: ReactTestRenderer;

async function montar(
  clientes: Cliente[],
  totalSinCoords = 0,
  onSelectCliente: (id: string) => void = vi.fn(),
): Promise<(id: string) => void> {
  await act(async () => {
    tree = create(
      React.createElement(MapaClientes, { clientes, totalSinCoords, onSelectCliente }),
    );
  });
  return onSelectCliente;
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.props = null;
});

afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});

describe('MapaClientes · motor Google compartido', () => {
  it('arranca sin marcadores: espera que el motor reporte su vista antes de agrupar', async () => {
    const cs = [cli('a', 18.47, -69.92), cli('b', 18.48, -69.9)];
    await montar(cs);
    expect(estado.props).toBeTruthy();
    expect(estado.props?.marcadores).toHaveLength(0);
  });

  it('usa la misma lista accesible como fallback (prop `sinMapa`) cuando Google no está', async () => {
    const cs = [cli('a', 18.47, -69.92, 'Rosa'), cli('b', 18.48, -69.9, 'Marcos')];
    const onSelect = vi.fn();
    await montar(cs, 0, onSelect);
    const botonRosa = tree.root.findAllByProps({ 'aria-label': 'Abrir expediente de Rosa' });
    expect(botonRosa.length).toBeGreaterThan(0);
    await act(async () => botonRosa[0].props.onClick());
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('un click en un pin individual abre la tarjeta, "Ver expediente" dispara el callback con el id correcto', async () => {
    const cs = [cli('a', 18.47, -69.92, 'Rosa'), cli('b', 18.6, -69.5, 'Marcos')];
    const onSelect = vi.fn();
    await montar(cs, 0, onSelect);
    await act(async () => estado.props?.onCambioVista?.(VISTA_PINES_SUELTOS));
    const pinA = estado.props?.marcadores.find((m) => m.capa === 'cliente' && m.id.includes(':a:'));
    expect(pinA).toBeTruthy();
    await act(async () => estado.props?.onClickMarcador(pinA!));
    const aside = tree.root.findByProps({ 'aria-label': 'Resumen de Rosa' });
    const buttons = aside.findAllByType('button');
    const verExp = buttons.find((b) => b.children.some((n) => typeof n === 'string' && n.trim() === 'Ver expediente'));
    expect(verExp).toBeTruthy();
    await act(async () => verExp!.props.onClick());
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('la tarjeta usa BotonChatCliente (inbox empresarial) y nunca enlaces wa.me', async () => {
    const cs = [cli('a', 18.47, -69.92, 'Rosa')];
    await montar(cs);
    await act(async () => estado.props?.onCambioVista?.(VISTA_PINES_SUELTOS));
    const pin = estado.props?.marcadores.find((m) => m.capa === 'cliente');
    expect(pin).toBeTruthy();
    await act(async () => estado.props?.onClickMarcador(pin!));
    const chat = tree.root.findByProps({ 'data-boton-chat': 'si' });
    expect(chat.props['data-cliente-id']).toBe('a');
    expect(chat.props['data-telefono']).toBe('8095550101');
    expect(chat.props['data-nombre']).toBe('Rosa');
    expect(JSON.stringify(tree.toJSON())).not.toContain('wa.me');
    expect(JSON.stringify(tree.toJSON())).not.toContain('whatsapp://');
  });

  it('la selección individual se descarta cuando cambia el dataset', async () => {
    const cs = [cli('a', 18.47, -69.92, 'Rosa'), cli('b', 18.6, -69.5, 'Marcos')];
    await montar(cs);
    await act(async () => estado.props?.onCambioVista?.(VISTA_PINES_SUELTOS));
    const pinA = estado.props?.marcadores.find((m) => m.capa === 'cliente' && m.id.includes(':a:'));
    await act(async () => estado.props?.onClickMarcador(pinA!));
    expect(tree.root.findAllByProps({ 'aria-label': 'Resumen de Rosa' }).length).toBeGreaterThan(0);
    await act(async () => {
      tree.update(
        React.createElement(MapaClientes, {
          clientes: [cli('c', 18.49, -69.95, 'Nuevo')],
          totalSinCoords: 0,
          onSelectCliente: vi.fn(),
        }),
      );
    });
    expect(tree.root.findAllByProps({ 'aria-label': 'Resumen de Rosa' })).toHaveLength(0);
  });

  it('clic en un grupo abre un panel lateral; elegir un cliente del grupo dispara el callback', async () => {
    // Dos clientes bien pegados → se agrupan en zoom bajo.
    const cs = [cli('a', 18.470, -69.920, 'Rosa'), cli('b', 18.4701, -69.9201, 'Marcos')];
    const onSelect = vi.fn();
    await montar(cs, 0, onSelect);
    await act(async () => estado.props?.onCambioVista?.(VISTA_ANCHA));
    const grupo = estado.props?.marcadores.find((m) => m.capa === 'grupo');
    expect(grupo).toBeTruthy();
    await act(async () => estado.props?.onClickMarcador(grupo!));
    const panel = tree.root.findByProps({ 'aria-label': 'Clientes del grupo seleccionado' });
    const abrirRosa = panel.findAllByProps({ 'aria-label': 'Abrir expediente de Rosa' });
    expect(abrirRosa.length).toBeGreaterThan(0);
    await act(async () => abrirRosa[0].props.onClick());
    // Tras abrir Rosa desde el panel, callback se dispara al pulsar "Ver expediente" en la tarjeta.
    const aside = tree.root.findByProps({ 'aria-label': 'Resumen de Rosa' });
    const verExp = aside.findAllByType('button').find((b) => b.children.some((n) => typeof n === 'string' && n.trim() === 'Ver expediente'));
    await act(async () => verExp!.props.onClick());
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('con 9.000 clientes jamás se envían 9.000 marcadores al motor', async () => {
    const cs: Cliente[] = [];
    for (let i = 0; i < 9_000; i++) {
      // Dispersión determinista sobre el área de Santo Domingo.
      const lat = 18.42 + (((i * 7919) % 1000) / 1000) * 0.12;
      const lng = -70.02 + (((i * 104729) % 1000) / 1000) * 0.2;
      cs.push(cli(`c${i}`, lat, lng));
    }
    await montar(cs);
    await act(async () => estado.props?.onCambioVista?.(VISTA_ANCHA));
    expect(estado.props?.marcadores.length ?? 0).toBeLessThanOrEqual(300);
    expect(estado.props?.marcadores.length ?? 0).toBeGreaterThan(0);
  });

  it('vacío: muestra mensaje en el fallback y no banner de "sin ubicación"', async () => {
    await montar([], 0);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('No hay clientes para mostrar');
    expect(json).not.toContain('no tiene');
  });

  it('banner "sin ubicación" refleja el total cuando ningún cliente tiene coords', async () => {
    await montar([], 25);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('25');
    expect(json).toContain('no aparece');
  });

  it('cambiar la vista (cluster ↔ zonas) no reemplaza el motor: la clave del encuadre y el conteo de marcadores siguen vivos', async () => {
    const cs = [cli('a', 18.47, -69.92), cli('b', 18.6, -69.5)];
    await montar(cs);
    await act(async () => estado.props?.onCambioVista?.(VISTA_PINES_SUELTOS));
    const marcadoresPre = estado.props?.marcadores.length ?? 0;
    const botonZonas = tree.root
      .findAllByType('button')
      .find((b) => b.children.includes('Zonas'));
    expect(botonZonas).toBeTruthy();
    await act(async () => botonZonas!.props.onClick());
    expect(estado.props?.marcadores.length).toBe(marcadoresPre);
    // El contenido del marcador cambió (color), pero el motor es el mismo.
    expect(estado.props?.marcadores.every((m) => m.clave.startsWith('uno|zonas') || m.clave.startsWith('g|zonas'))).toBe(true);
  });
  it('permite acceder a clientes después del límite inicial en un grupo coincidente', async () => {
    await montar(Array.from({ length: 40 }, (_, i) => cli(String(i), 18.47, -69.92)));
    await act(async () => estado.props?.onCambioVista?.(VISTA_PINES_SUELTOS));
    await act(async () => estado.props?.onClickMarcador(estado.props.marcadores[0]));
    const panel = tree.root.findByProps({ 'aria-label': 'Clientes del grupo seleccionado' });
    expect(panel.findAllByType('li')).toHaveLength(30);
    const mas = panel.findAllByType('button').find((b) => b.children.some((n) => typeof n === 'string' && n.includes('Mostrar más')));
    await act(async () => mas!.props.onClick());
    expect(panel.findAllByType('li')).toHaveLength(40);
  });

});
