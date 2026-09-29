import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ cliente: vi.fn(), ordenes: vi.fn(), facturas: vi.fn(), guardar: vi.fn(), documento: vi.fn(), rol: 'administrador', navigate: vi.fn() }));
vi.mock('../../src/services/clientes.service', () => ({ buscarClientePorTelefono: m.cliente, actualizarCliente: m.guardar, normalizarTelefono:(v:string)=> /^1?\d{10}$/.test(v)?v.replace(/^1(?=\d{10}$)/,''):'' }));
vi.mock('../../src/services/ordenes.service', () => ({ obtenerTodasOrdenesPorTelefono: m.ordenes }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), query: vi.fn(), where: vi.fn(), getDocs: m.facturas, getDoc:m.documento,doc:vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => m.navigate }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ userProfile: { rol: m.rol } }) }));
vi.mock('../../src/components/Modal', () => ({default: ({isOpen,children}:any) => isOpen ? React.createElement('div',null,children) : null}));
vi.mock('../../src/components/inbox/AtencionChat', () => ({ default: () => null }));
vi.mock('../../src/components/inbox/ExpedienteCliente', () => ({ default: () => React.createElement('textarea', { defaultValue: 'Nota pendiente' }) }));
vi.mock('../../src/components/crm/GestionOrden', () => ({ default: ({ ordenId }: { ordenId: string }) => React.createElement('article', null, ordenId) }));
vi.mock('../../src/components/ordenes/TimelineUnificadoOrden', () => ({ default: () => null }));
vi.mock('../../src/components/ordenes/EnviarFacturacionButton', () => ({ default: () => null }));
vi.mock('../../src/components/ordenes/MiniMapaCliente', () => ({ default: (props: { lat: number; lng: number }) => React.createElement('div', { 'data-mapa-cliente': true, ...props }) }));
import PanelCliente360 from '../../src/components/inbox/PanelCliente360';
import {resolverClienteFicha} from '../../src/components/inbox/resolverClienteFicha';
let r: any;
const cliente = { id: 'cliente-prueba', nombre: 'Cliente ficticio', telefono: '8095550100', direccion: 'Dirección de prueba', lat: 18, lng: -69 };
const texto = () => JSON.stringify(r.toJSON());
const boton = (label: string) => r.root.findAllByType('button').find((b: any) => b.children.some((x: any) => typeof x === 'string' && x.trim() === label));
async function montar() { await act(async () => { r = create(React.createElement(PanelCliente360, { waId: '8095550100' })); }); }
beforeEach(() => {
  vi.clearAllMocks(); m.rol = 'administrador';
  m.cliente.mockResolvedValue({ id: cliente.id, data: cliente });
  m.ordenes.mockResolvedValue([{ id: 'orden-1', numero: 'PRUEBA-1', fase: 'en_diagnostico', equipoTipo: 'Lavadora', createdAt: new Date() }]);
  m.facturas.mockResolvedValue({ docs: [] }); m.guardar.mockResolvedValue(undefined);
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { fn(); return 1; });
});
afterEach(() => { if (r) act(() => r.unmount()); r = undefined; vi.unstubAllGlobals(); });
describe('Ficha integrada en WhatsApp', () => {
  it('un error de carga no se presenta como cliente inexistente y permite reintentar', async () => {
    m.cliente.mockRejectedValueOnce(new Error('offline'));
    await montar();
    expect(texto()).toContain('No se pudo cargar la ficha');
    expect(texto()).not.toContain('Cliente no registrado');
    await act(async () => boton('Reintentar').props.onClick());
    expect(texto()).toContain('Cliente ficticio');
  });
  it('carga cliente y órdenes una vez, y facturas solo al abrir garantías; los errores no parecen ausencia de garantías', async () => {
    m.facturas.mockRejectedValueOnce(new Error('offline'));
    await montar();
    expect(m.cliente).toHaveBeenCalledTimes(1); expect(m.ordenes).toHaveBeenCalledTimes(1); expect(m.facturas).not.toHaveBeenCalled();
    await act(async () => boton('Garantías').props.onClick());
    expect(texto()).toContain('No se pudieron consultar las facturas y garantías');
    expect(texto()).not.toContain('Sin garantías emitidas');
    await act(async () => boton('Reintentar consulta').props.onClick());
    expect(texto()).toContain('Sin garantías emitidas');
    await act(async () => boton('Garantías').props.onClick());
    await act(async () => boton('Garantías').props.onClick());
    expect(m.facturas).toHaveBeenCalledTimes(2);
  });
  it('edita la ficha sin cambiar el teléfono ni las coordenadas y conserva el borrador si guardar falla', async () => {
    await montar(); await act(async () => boton('Editar ficha').props.onClick());
    await act(async () => r.root.findAllByType('input').find((i: any) => i.props.name === 'nombre').props.onChange({ target: { value: 'Nombre corregido' } }));
    m.guardar.mockRejectedValueOnce(new Error('offline'));
    await act(async () => r.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    expect(texto()).toContain('Nombre corregido'); expect(texto()).toContain('No se pudo guardar');
    await act(async () => r.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    expect(texto()).toContain('Ficha guardada');
    expect(m.guardar.mock.calls[1][0]).toBe(cliente.id);
    expect(m.guardar.mock.calls[1][1]).toMatchObject({ nombre: 'Nombre corregido' });
    expect(m.guardar.mock.calls[1][1]).not.toHaveProperty('telefono'); expect(m.guardar.mock.calls[1][1]).not.toHaveProperty('lat');
    expect(r.root.findAllByType('a').some((a: any) => a.props.href.includes('18,-69'))).toBe(true);
  });
  it('mantiene notas montadas al abrir la orden y volver, sin navegar fuera del chat', async () => {
    await montar(); await act(async () => boton('Notas y archivos').props.onClick());
    const nota = r.root.findByType('textarea');
    const orden = r.root.findAllByType('button').find((b: any) => b.findAllByType('span').some((s: any) => s.children.includes('PRUEBA-1')));
    await act(async () => orden.props.onClick());
    expect(r.root.findByType('article').children).toEqual(['orden-1']);
    await act(async () => boton('Volver a la ficha').props.onClick());
    expect(r.root.findByType('textarea')).toBe(nota); expect(m.navigate).not.toHaveBeenCalled();
  });
  it('un técnico no recibe el control de editar datos del cliente', async () => {
    m.rol = 'tecnico'; await montar(); expect(boton('Editar ficha')).toBeUndefined();
  });
  it('al cambiar de conversación descarta la ficha previa y sus borradores', async () => {
    await montar(); await act(async () => boton('Editar ficha').props.onClick());
    m.cliente.mockResolvedValue(null); m.ordenes.mockResolvedValue([]);
    await act(async () => r.update(React.createElement(PanelCliente360, { waId: '8295550101' })));
    expect(texto()).not.toContain('Cliente ficticio'); expect(texto()).toContain('Cliente no registrado');
    expect(r.root.findAllByType('input')).toHaveLength(0);
  });
});

it('la ficha previsualiza las coordenadas guardadas y no inventa ubicación si faltan', async () => {
  await montar();
  expect(r.root.findByProps({ 'data-mapa-cliente': true }).props).toMatchObject({ lat: 18, lng: -69 });
  act(() => r.unmount()); r = undefined;
  m.cliente.mockResolvedValue({ id: cliente.id, data: { ...cliente, lat: undefined, lng: undefined } });
  await montar();
  expect(r.root.findAllByProps({ 'data-mapa-cliente': true })).toHaveLength(0);
});

const recibidas = [{ id: 'location-1', lat: 18.5, lng: -69.9, etiqueta: 'Ubicación enviada de prueba' }];
async function montarConUbicacion() {
  await act(async () => { r = create(React.createElement(PanelCliente360, { waId: '8095550100', ubicacionesRecibidas: recibidas })); });
  await act(async () => boton('Cambiar ubicación').props.onClick());
  await act(async () => r.root.findByProps({ name: 'ubicacionRecibida' }).props.onChange({ target: { value: 'location-1' } }));
}
it('previsualiza la ubicación recibida y solo sustituye las coordenadas al confirmar', async () => {
  await montarConUbicacion();
  expect(m.guardar).not.toHaveBeenCalled();
  expect(r.root.findAllByProps({ 'data-mapa-cliente': true }).map((n: any) => n.props.lat)).toEqual([18, 18.5]);
  await act(async () => r.root.findByType('form').props.onSubmit({preventDefault(){}}));
  expect(m.guardar).toHaveBeenCalledWith(cliente.id, { lat: 18.5, lng: -69.9, zona: '' });
  expect(r.root.findByProps({ 'data-mapa-cliente': true }).props).toMatchObject({ lat: 18.5, lng: -69.9 });
  expect(texto()).toContain('Dirección de prueba');
  expect(texto()).toContain('Ubicación del cliente actualizada');
});
it('conserva mapa y selección al fallar y permite reintentar; cancelar no escribe', async () => {
  await montarConUbicacion();
  m.guardar.mockRejectedValueOnce(new Error('offline'));
  await act(async () => r.root.findByType('form').props.onSubmit({preventDefault(){}}));
  expect(texto()).toContain('Tus cambios siguen aquí');
  expect(r.root.findAllByProps({ 'data-mapa-cliente': true })[1].props.lat).toBe(18.5);
  expect(r.root.findAllByProps({ 'data-mapa-cliente': true })[0].props.lat).toBe(18);
  await act(async () => r.root.findByType('form').props.onSubmit({preventDefault(){}}));
  expect(m.guardar).toHaveBeenCalledTimes(2);
  await act(async () => boton('Cambiar ubicación').props.onClick());
  await act(async () => boton('Cancelar').props.onClick());
  expect(m.guardar).toHaveBeenCalledTimes(2);
});
it('oculta la edición de ubicación para técnicos y rechaza coordenadas inválidas', async () => {
  m.rol = 'tecnico'; await montar(); expect(boton('Cambiar ubicación')).toBeUndefined();
  act(() => r.unmount()); r = undefined; m.rol = 'administrador';
  await act(async () => { r = create(React.createElement(PanelCliente360, { waId: '8095550100', ubicacionesRecibidas: [{ ...recibidas[0], lat: Infinity }, { ...recibidas[0], id: 'otra', lng: 181 }] })); });
  await act(async () => boton('Cambiar ubicación').props.onClick());
  expect(r.root.findAllByProps({name:'ubicacionRecibida'})).toHaveLength(0);
  expect(texto()).toContain('Latitud');
  expect(m.guardar).not.toHaveBeenCalled();
});
it('descarta la ubicación elegida al cambiar de cliente', async () => {
  await montarConUbicacion();
  m.cliente.mockResolvedValue({ id: 'otro', data: { ...cliente, id: 'otro', nombre: 'Otro cliente' } });
  await act(async () => r.update(React.createElement(PanelCliente360, { waId: '8295550101' })));
  expect(r.root.findAllByProps({ name: 'ubicacionRecibida' })).toHaveLength(0);
  expect(texto()).not.toContain('Ubicación enviada de prueba');
  expect(m.guardar).not.toHaveBeenCalled();
});

it('referencia de cliente exige identidad de teléfono exacta y excluye eliminado',async()=>{
 m.documento.mockResolvedValue({id:'c',exists:()=>true,data:()=>({nombre:'QA',telefono:'+34 612345678'})});
 expect((await resolverClienteFicha('34612345678','c'))?.id).toBe('c');
 await expect(resolverClienteFicha('18095550100','c')).rejects.toThrow('no corresponde');
 m.documento.mockResolvedValue({id:'c',exists:()=>true,data:()=>({telefono:'8095550100',eliminado:true})});
 await expect(resolverClienteFicha('18095550100','c')).rejects.toThrow('no disponible');
});
it('sin cliente ofrece registro separado y no permite crear orden antes',async()=>{
 m.cliente.mockResolvedValue(null);m.ordenes.mockResolvedValue([]);await montar();
 expect(texto()).toContain('Crear cliente');expect(texto()).not.toContain('Crear cliente y orden');expect(boton('+ Crear orden')).toBeUndefined();
});
