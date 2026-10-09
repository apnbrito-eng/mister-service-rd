import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { OrdenServicio } from '../../src/types';
const m = vi.hoisted(() => ({ raw: [] as Array<Record<string, unknown>>, resolver: vi.fn(), seleccionar: vi.fn(), resolverPropuesta: vi.fn(), open: vi.fn(), orden: null as OrdenServicio | null }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ userProfile: { rol: 'administrador', nombre: 'Oficina QA' }, currentUser: { uid: 'oficina-qa' } }) }));
vi.mock('../../src/context/AtencionContext', () => ({ useAtencion: () => ({ seleccionar: m.seleccionar }) }));
vi.mock('../../src/hooks/useConfigWeb', () => ({ useConfigWeb: () => ({ config: { feedbackNPS: { googleReviewsUrl: 'https://reseña.test/' } } }) }));
vi.mock('../../src/utils/resolverChatCliente', () => ({ resolverChatContacto: m.resolver, numeroWhatsAppCliente: (telefono: string) => /^1?\d{10}$/.test(telefono) ? `1${telefono.slice(-10)}` : null }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return { ...actual, collection: (_db: unknown, nombre: string) => nombre, onSnapshot: (nombre: string, callback: (snapshot: { docs: Array<{ id: string; data(): Record<string, unknown> }> }) => void) => { callback({ docs: nombre === 'ordenes_servicio' ? m.raw.map((datos, i) => ({ id: `orden-${i}`, data: () => datos })) : [] }); return () => {}; } };
});
vi.mock('../../src/services/ordenes.service', () => ({ suscribirOrdenesConPropuestaReprogramacionPendiente: (callback: (ordenes: OrdenServicio[]) => void) => { callback(m.orden ? [m.orden] : []); return () => {}; }, resolverPropuestaReprogramacionConNotif: m.resolverPropuesta }));
vi.mock('../../src/components/Modal', () => ({ default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => isOpen ? React.createElement('section', null, children) : null }));
import Feedback from '../../src/pages/Feedback';
import Reprogramaciones from '../../src/pages/Reprogramaciones';
import { ordenMetrica } from '../../src/utils/metricasNegocio';
let tree: ReactTestRenderer;
function Ubicacion() { const l = useLocation(); return React.createElement('output', null, JSON.stringify({ ruta: l.pathname + l.search, estado: l.state })); }
function montar(pagina: React.ComponentType) { act(() => { tree = create(React.createElement(MemoryRouter, { initialEntries: ['/admin/prueba'] }, React.createElement(React.Fragment, null, React.createElement(pagina), React.createElement(Ubicacion)))); }); }
function destino() { return JSON.parse(String(tree.root.findByType('output').children[0])) as { ruta: string; estado: { borradorChat: { waId: string; texto: string } } }; }
beforeEach(() => { vi.clearAllMocks(); m.raw = []; m.orden = null; m.resolver.mockResolvedValue({ clienteId: 'cliente-qa', telefono: '8494580318', nombre: 'Cliente QA', waId: '18494580318' }); m.resolverPropuesta.mockResolvedValue(undefined); vi.stubGlobal('window', { open: m.open, location: { origin: 'https://app.test' } }); });
afterEach(() => { act(() => tree?.unmount()); vi.unstubAllGlobals(); });
it('Feedback abre historial empresarial con borrador para detractor/promotor, sin enviar externamente', async () => {
  m.raw = [
    { clienteId: 'cliente-qa', clienteNombre: 'Cliente QA', clienteTelefono: '8494580318', feedback: { nps: 2, fechaFeedback: new Date(), ratingTipo: 'detractor' } },
    { clienteId: 'cliente-qa', clienteNombre: 'Cliente QA', clienteTelefono: '8494580318', feedback: { nps: 10, fechaFeedback: new Date(), ratingTipo: 'promotor' } },
  ];
  montar(Feedback);
  await act(async () => tree.root.findAllByType('button').find(n => n.children.some(c => typeof c === 'string' && c.trim() === 'Recontactar'))!.props.onClick());
  expect(destino().ruta).toBe('/admin/inbox/18494580318?clienteId=cliente-qa');
  expect(destino().estado.borradorChat.texto).toContain('¿Puedes darnos unos minutos');
  await act(async () => tree.root.findAllByType('button').find(n => n.children.some(c => typeof c === 'string' && c.trim() === 'Preparar enlace Google'))!.props.onClick());
  expect(destino().estado.borradorChat.texto).toContain('https://reseña.test/');
  expect(m.resolver).toHaveBeenCalledWith({ clienteId: 'cliente-qa', nombre: 'Cliente QA', telefono: '8494580318' });
  expect(m.open).not.toHaveBeenCalled();
});
it('abrir WhatsApp en reprogramación no cambia la propuesta; aprobar guarda antes de abrir borrador', async () => {
  const ahora = new Date();
  m.orden = ordenMetrica('orden-qa', { clienteId: 'cliente-qa', clienteNombre: 'Cliente QA', clienteTelefono: '8494580318', numero: 'OS-QA', propuestasReprogramacion: [{ id: 'propuesta-qa', estado: 'pendiente', propuestaPor: 'cliente', fechaPropuesta: ahora, fechaActualOrden: ahora, fechaNuevaPropuesta: ahora }] });
  montar(Reprogramaciones);
  const abrir = tree.root.findByProps({ 'aria-label': 'Abrir conversación empresarial de Cliente QA' });
  await act(async () => abrir.props.onClick({ stopPropagation() {} }));
  expect(destino().ruta).toBe('/admin/inbox/18494580318?clienteId=cliente-qa');
  expect(m.resolverPropuesta).not.toHaveBeenCalled();
  act(() => tree.root.findAllByType('button').find(n => n.children.some(c => typeof c === 'string' && c.trim() === 'Aceptar'))!.props.onClick());
  await act(async () => tree.root.findAllByType('button').find(n => n.children.some(c => typeof c === 'string' && c.trim() === 'Confirmar y abrir conversación'))!.props.onClick());
  expect(m.resolverPropuesta).toHaveBeenCalledWith(m.orden, expect.objectContaining({ id: 'propuesta-qa' }), 'aprobar', { resueltaPor: 'oficina-qa', resueltaPorNombre: 'Oficina QA' });
  expect(m.resolverPropuesta.mock.invocationCallOrder[0]).toBeLessThan(m.resolver.mock.invocationCallOrder[1]);
  expect(destino().estado.borradorChat.texto).toContain('confirmado');
  expect(m.open).not.toHaveBeenCalled();
  expect(tree.root.findAllByType('a').some(n => typeof n.props.href === 'string' && n.props.href.includes('wa.me'))).toBe(false);
});
