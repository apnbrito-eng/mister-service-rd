import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, writeFileSync } from 'node:fs';
import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ history: vi.fn(), query: vi.fn() }));
vi.mock('../../src/firebase/config', () => ({ db: {}, storage: {} }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ userProfile: { rol: 'administrador', id: 'qa' } }) }));
vi.mock('../../src/utils/permisos', () => ({ puede: () => true }));
vi.mock('firebase/firestore', () => ({
 collection: vi.fn(), doc: vi.fn(), query: mock.query, orderBy: vi.fn(), where: vi.fn(), updateDoc: vi.fn(), Timestamp: { now: vi.fn() },
 onSnapshot: (_: unknown, cb: Function) => { cb({ docs: Array.from({ length: 120 }, (_, i) => ({ id: `c${i}`, data: () => ({ nombre: `Cliente ${i}`, telefono: `202555${String(i).padStart(4,'0')}` }) })) }); return () => {}; },
 getDocs: mock.history,
}));
vi.mock('../../src/utils', () => ({ parseCliente: (id: string, d: object) => ({ id, ...d }), formatTelefono: (s: string) => s, formatFechaCorta: () => '', formatMoneda: () => '' }));
vi.mock('../../src/services/clientes.service', () => ({ buscarOCrearCliente: vi.fn(), buscarClientePorTelefono: vi.fn(), normalizarTelefono: (s: string) => s }));
vi.mock('../../src/components/Modal', () => ({ default: () => null }));
vi.mock('../../src/components/clientes/EditarClienteModal', () => ({ default: () => null }));
vi.mock('../../src/components/ordenes/MiniMapaCliente', () => ({ default: () => null }));
vi.mock('../../src/components/ordenes/EliminarOrdenButton', () => ({ default: () => null }));
vi.mock('../../src/components/shared/BotonComoLlegar', () => ({ default: () => null }));
import Clientes from '../../src/pages/Clientes';
it('limita filas iniciales y busca también clientes fuera de las primeras 50', async () => {
 let tree: any;
 await act(async () => { tree = create(React.createElement(MemoryRouter, null, React.createElement(Clientes))); });
 const rows = () => tree.root.findAll((n: any) => n.props.className?.includes('service-client-row'));
 expect(rows()).toHaveLength(50);
 if (process.env.MR_DESIGN_PREVIEW === '1') {
   const rebuild = (n: any): any => typeof n === 'string' ? n : n ? React.createElement(n.type, n.props, ...(n.children || []).map(rebuild)) : null;
   mkdirSync('tests/manual/clientes-layout', { recursive: true });
   writeFileSync('tests/manual/clientes-layout/index.html', `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clientes · Vista de prueba</title><link rel="stylesheet" href="/src/index.css"><body><div class="app-shell service-ui flex overflow-hidden"><div class="flex-1 min-w-0 flex flex-col overflow-hidden"><header class="glass-toolbar min-h-[52px] flex items-center justify-between px-4"><span>☰</span><span>Clientes ▾</span><span>♧</span></header><main class="service-main flex-1 min-h-0 overflow-y-auto">${renderToStaticMarkup(rebuild(tree.toJSON()))}</main><nav class="mobile-navigation"><span class="mobile-navigation-item">Inicio</span><span class="mobile-navigation-item">Chats</span><span class="mobile-navigation-item">Servicios</span><span class="mobile-navigation-item is-active">Clientes</span><span class="mobile-navigation-item">Más</span></nav></div></div></body></html>`);
 }

 await act(async () => { tree.root.findByProps({ 'aria-label': 'Buscar cliente por nombre o teléfono' }).props.onChange({ target: { value: 'Cliente 119' } }); });
 expect(rows()).toHaveLength(1);
 expect(JSON.stringify(tree.toJSON())).toContain('Cliente 119');
 await act(async () => { tree.unmount(); });
});
it('descarta historial atrasado de otra ficha al cambiar rápidamente de cliente', async () => {
 let resolveA: Function = () => {}, resolveB: Function = () => {};
 mock.history.mockImplementationOnce(() => new Promise(r => { resolveA = r; })).mockImplementationOnce(() => new Promise(r => { resolveB = r; }));
 let tree: any;
 await act(async () => { tree = create(React.createElement(MemoryRouter, null, React.createElement(Clientes))); });
 const rows = () => tree.root.findAll((n: any) => n.props.className?.includes('service-client-row'));
 await act(async () => { rows()[0].findByType('button').props.onClick(); });
 await act(async () => { rows()[1].findByType('button').props.onClick(); });
 await act(async () => { resolveB({ docs: [] }); });
 await act(async () => { resolveA({ docs: [{ id:'old', data: () => ({ numero:'NO-DEBE-APARECER', createdAt:{toDate:()=>new Date()} }) }] }); });
 expect(JSON.stringify(tree.toJSON())).not.toContain('NO-DEBE-APARECER');
 await act(async () => { tree.unmount(); });
});
