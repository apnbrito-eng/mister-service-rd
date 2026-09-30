import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
const datos = vi.hoisted(() => ({ fuentes: {} as Record<string, { id: string; data: () => Record<string, unknown> }[]> }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ userProfile: { rol: 'administrador' } }) }));
vi.mock('../../src/hooks/useConfigWeb', () => ({ useConfigWeb: () => ({ config: {} }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), Link: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('../../src/components/AnalisisFunnel', () => ({ default: () => null }));
vi.mock('../../src/components/inbox/MetricasPlantillas', () => ({ default: () => null }));
vi.mock('../../src/services/nomina.service', () => ({ TIERS_BONO_SECRETARIA: [], calcularBonoSecretaria: () => 0 }));
vi.mock('firebase/firestore', async original => ({ ...await original<typeof import('firebase/firestore')>(), collection: (_: unknown, nombre: string) => nombre, query: (c: string) => c, where: vi.fn(),
  onSnapshot: (c: string, cb: (s: unknown) => void) => { cb({ docs: datos.fuentes[c] || [] }); return () => {}; },
}));
import Feedback from '../../src/pages/Feedback';
import MetricasMensuales from '../../src/pages/MetricasMensuales';
import ReporteAvanzado from '../../src/pages/ReporteAvanzado';
import Rendimiento from '../../src/pages/Rendimiento';

it('Feedback permite vaciar/corregir mes sin RangeError', async () => {
  let vista!: ReactTestRenderer;
  await act(async () => { vista = create(React.createElement(Feedback)); });
  await act(async () => { vista.root.findByProps({ type: 'month' }).props.onChange({ target: { value: '' } }); });
  expect(JSON.stringify(vista.toJSON())).toContain('Selecciona un mes válido');
  await act(async () => { vista.root.findByProps({ type: 'month' }).props.onChange({ target: { value: '2026-09' } }); });
  expect(JSON.stringify(vista.toJSON())).toContain('Feedback NPS');
  await act(async () => vista.unmount());
});
it('proyecciones señalan creador legacy incompleto y comparten devengadas con estado ausente/liquidado', async () => {
  const registro = (id: string, raw: Record<string, unknown>) => ({ id, data: () => raw });
  datos.fuentes = {
    personal: [registro('s', { nombre: 'Ana', rol: 'secretaria', activo: true, sueldoBase: 0 })],
    ordenes_servicio: [registro('legacy', { creadoPor: 'Ana', createdAt: '2026-09-05' })],
    comisiones: [registro('legacy', { fechaCobro: '2026-09-05', comisionMonto: 111 }), registro('liquidada', { fechaCobro: '2026-09-05', comisionMonto: 222, estadoLiquidacion: 'liquidada' }), registro('anulada', { fechaCobro: '2026-09-05', comisionMonto: 999, estaAnulada: true })],
  };
  for (const Pagina of [MetricasMensuales, ReporteAvanzado]) {
    let vista!: ReactTestRenderer;
    await act(async () => { vista = create(React.createElement(Pagina)); });
    await act(async () => { vista.root.findByProps({ type: 'month' }).props.onChange({ target: { value: '2026-09' } }); });
    const contenido = JSON.stringify(vista.toJSON());
    expect(contenido).toContain('Cálculo incompleto');
    expect(contenido).toContain('333');
    expect(contenido).not.toContain('1332');
    await act(async () => vista.unmount());
  }
  datos.fuentes = {};
});

it('métricas y reporte aceptan una selección mensual inválida sin romper render', async () => {
  for (const Pagina of [MetricasMensuales, ReporteAvanzado]) {
    let vista!: ReactTestRenderer;
    await act(async () => { vista = create(React.createElement(Pagina)); });
    await act(async () => { vista.root.findByProps({ type: 'month' }).props.onChange({ target: { value: '2026-13' } }); });
    expect(JSON.stringify(vista.toJSON())).toMatch(/mes válido|Rango inválido/);
    await act(async () => vista.unmount());
  }
});
it('rendimiento maneja rango imposible y permite volver al mes', async () => {
  let vista!: ReactTestRenderer;
  await act(async () => { vista = create(React.createElement(Rendimiento)); });
  await act(async () => { vista.root.findAllByType('button').find(b => b.props.children === 'Rango')!.props.onClick(); });
  await act(async () => { vista.root.findAllByProps({ type: 'date' })[0].props.onChange({ target: { value: '2026-99-99' } }); });
  expect(JSON.stringify(vista.toJSON())).toContain('Selecciona un rango válido');
  await act(async () => { vista.root.findByType('button').props.onClick(); });
  expect(JSON.stringify(vista.toJSON())).toContain('Rendimiento / KPIs');
  await act(async () => vista.unmount());
});
