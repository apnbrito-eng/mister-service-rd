import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
const m = vi.hoisted(() => ({ snapshots: [] as Array<{ next: (s: { docs: Array<{ id: string; data(): Record<string, unknown> }> }) => void; error: () => void; unsub: ReturnType<typeof vi.fn> }> }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ collection: () => ({}), onSnapshot: (_ref: unknown, next: typeof m.snapshots[number]['next'], error: () => void) => { const unsub = vi.fn(); m.snapshots.push({ next, error, unsub }); return unsub; } }));
import { useClientesEnVivo } from '../../src/hooks/useClientesEnVivo';
let tree: ReactTestRenderer;
let estado: ReturnType<typeof useClientesEnVivo>;
function Probe() { estado = useClientesEnVivo(); return null; }
afterEach(() => { act(() => tree?.unmount()); m.snapshots = []; });
it('sale de loading ante error y reintenta sin aceptar callbacks de la suscripción anterior', () => {
  act(() => { tree = create(React.createElement(Probe)); });
  act(() => m.snapshots[0].next({ docs: [{ id: 'cliente-a', data: () => ({ nombre: 'Ana', carteraEquipo: 'A' }) }] }));
  expect(estado.clientes[0].nombre).toBe('Ana');
  act(() => m.snapshots[0].error());
  expect(estado.loading).toBe(false); expect(estado.error).toContain('No se pudo');
  expect(estado.clientes).toHaveLength(1);
  act(() => estado.reintentar());
  expect(m.snapshots[0].unsub).toHaveBeenCalledOnce(); expect(estado.loading).toBe(true); expect(estado.error).toBe('');
  act(() => m.snapshots[0].next({ docs: [] }));
  expect(estado.clientes).toHaveLength(1); expect(estado.loading).toBe(true);
  act(() => m.snapshots[1].next({ docs: [] }));
  expect(estado.loading).toBe(false); expect(estado.clientes).toHaveLength(0);
});
