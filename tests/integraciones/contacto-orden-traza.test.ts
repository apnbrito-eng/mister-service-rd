import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/actividadOrden.service', () => ({ registrarActividadOrden: vi.fn() }));
vi.mock('../../src/utils/whatsapp', () => ({ whatsappUrl: () => 'https://wa.me/18095551234' }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
import ContactoOrden from '../../src/components/ordenes/ContactoOrden';
import { registrarActividadOrden } from '../../src/services/actividadOrden.service';
import toast from 'react-hot-toast';

let tree: ReactTestRenderer;
const registrar = vi.mocked(registrarActividadOrden);
const navegar = vi.fn();
const reemplazar = vi.fn();
const cerrar = vi.fn();
const ventana = { closed: false, opener: {}, location: { replace: reemplazar }, close: cerrar };
const abrir = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  ventana.closed = false;
  abrir.mockReturnValue(ventana);
  vi.stubGlobal('window', { open: abrir, location: { assign: navegar } });
  act(() => { tree = create(React.createElement(ContactoOrden, { ordenId: 'orden-1', nombre: 'Cliente', telefono: '809-555-1234' })); });
});
afterEach(() => { act(() => tree.unmount()); vi.unstubAllGlobals(); });
const pulsar = (indice: number) => tree.root.findAllByType('button')[indice].props.onClick() as Promise<void>;
function pendiente() {
  let resolver!: (valor: unknown) => void;
  registrar.mockReturnValue(new Promise(resolve => { resolver = resolve; }));
  return () => resolver({ ok: true });
}

describe('contacto desde la orden', () => {
  it('registra antes de salir a WhatsApp y reserva una pestaña sin abrir aún el chat', async () => {
    const resolver = pendiente();
    let tarea!: Promise<void>;
    act(() => { tarea = pulsar(0); });
    expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
    expect(registrar).toHaveBeenCalledWith('orden-1', 'whatsapp');
    expect(reemplazar).not.toHaveBeenCalled();
    expect(tree.root.findAllByType('button').every(b => b.props.disabled)).toBe(true);
    await act(async () => { resolver(); await tarea; });
    expect(reemplazar).toHaveBeenCalledWith('https://wa.me/18095551234');
    expect(ventana.opener).toBeNull();
  });
  it('no navega ni pierde la traza cuando falla el registro y permite reintentar', async () => {
    registrar.mockRejectedValueOnce(new Error('sin red'));
    await act(async () => { await pulsar(0); });
    expect(cerrar).toHaveBeenCalledOnce();
    expect(reemplazar).not.toHaveBeenCalled();
    expect(tree.root.findAllByType('a')).toHaveLength(0);
    expect(toast.error).toHaveBeenCalled();
    registrar.mockResolvedValueOnce({ ok: true });
    await act(async () => { await pulsar(0); });
    expect(reemplazar).toHaveBeenCalledOnce();
  });
  it('ofrece enlace tras guardar si el navegador bloquea la pestaña', async () => {
    abrir.mockReturnValueOnce(null);
    registrar.mockResolvedValueOnce({ ok: true });
    await act(async () => { await pulsar(0); });
    expect(tree.root.findByType('a').props.href).toBe('https://wa.me/18095551234');
    expect(reemplazar).not.toHaveBeenCalled();
  });
  it('espera el registro antes de abrir el teléfono y deja alternativa de toque directo', async () => {
    const resolver = pendiente();
    let tarea!: Promise<void>;
    act(() => { tarea = pulsar(1); });
    expect(navegar).not.toHaveBeenCalled();
    expect(registrar).toHaveBeenCalledWith('orden-1', 'llamar');
    await act(async () => { resolver(); await tarea; });
    expect(navegar).toHaveBeenCalledWith('tel:8095551234');
    expect(tree.root.findByType('a').props.href).toBe('tel:8095551234');
  });
  it('ignora pulsaciones duplicadas mientras guarda', async () => {
    const resolver = pendiente();
    let tarea!: Promise<void>;
    act(() => { tarea = pulsar(0); void pulsar(1); });
    expect(registrar).toHaveBeenCalledOnce();
    await act(async () => { resolver(); await tarea; });
  });
});
