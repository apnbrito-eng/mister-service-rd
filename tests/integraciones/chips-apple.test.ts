import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('../../src/firebase/config', () => ({ db: {}, auth: {} }));
import Badge from '../../src/components/Badge';
import { estadoChipDeFase } from '../../src/utils/chipEstado';

it('conserva fase y etiqueta; trabajo realizado no se presenta como cierre confirmado', () => {
  const html = renderToStaticMarkup(React.createElement(Badge, { fase: 'trabajo_realizado', apariencia: 'apple' }));
  expect(html).toContain('Trabajo Realizado');
  expect(html).toContain('data-estado-chip="cobro"');
  expect(html).not.toContain('bg-ms-exito');
});
it('garantía reclamada conserva texto y rojo sólido incluso ante un estado explícito', () => {
  const html = renderToStaticMarkup(React.createElement(Badge, { fase: 'garantia_reclamada', apariencia: 'apple', estado: 'cerrada' }));
  expect(html).toContain('Garantía reclamada');
  expect(html).toContain('bg-ms-garantia text-white');
});
it('cancelación histórica y fases sin visita siguen con etiqueta y tratamiento neutro', () => {
  expect(estadoChipDeFase('cancelado')).toBe('neutro');
  const html = renderToStaticMarkup(React.createElement(Badge, { fase: 'agendado', apariencia: 'apple' }));
  expect(html).toContain('Agendado');
  expect(html).not.toContain('En camino');
  expect(html).not.toContain('En sitio');
});
it('los consumidores previos conservan apariencia y personalización existentes', () => {
  const html = renderToStaticMarkup(React.createElement(Badge, { label: 'Sin verificar', color: 'bg-custom text-custom' }));
  expect(html).toContain('bg-custom text-custom');
  expect(html).not.toContain('data-estado-chip');
});

it('la adopción por defecto conserva trabajo realizado como cobro, sin afirmar cierre', () => {
  const html=renderToStaticMarkup(React.createElement(Badge,{fase:'trabajo_realizado'}));
  expect(html).toContain('data-estado-chip="cobro"');
  expect(html).not.toContain('data-estado-chip="cerrada"');
});
it('el modo anterior sigue disponible explícitamente para consumidores con excepciones',()=>{
  const html=renderToStaticMarkup(React.createElement(Badge,{fase:'agendado',apariencia:'actual'}));
  expect(html).toContain('Agendado');
  expect(html).not.toContain('data-estado-chip');
});
