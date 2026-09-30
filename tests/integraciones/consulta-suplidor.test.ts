import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/firebase/config', () => ({ db: {} }));
import {
  validarSuplidor, filtrarSuplidores, construirMensajeConsulta, ocultarContactos,
  esFotoPiezaSegura, numeroWhatsAppSuplidor, enlaceWhatsAppDispositivo, evaluarChatEmpresa, type Suplidor,
} from '../../src/utils/consultaSuplidor';

const sup = (extra: Partial<Suplidor>): Suplidor => ({ id: '8095550000', nombre: 'Repuestos Norte', telefono: '809-555-0000', telefonoNormalizado: '8095550000', especialidad: 'Lavadoras', activo: true, ...extra });
const FOTO = 'https://firebasestorage.googleapis.com/v0/b/mister-service.appspot.com/o/fotos-piezas%2Fo1%2Fp1.jpg?alt=media&token=abc';

describe('validarSuplidor', () => {
  it('normaliza teléfono RD y recorta espacios', () => {
    const r = validarSuplidor({ nombre: '  Repuestos  Norte ', telefono: '+1 (809) 555-0000', especialidad: 'Compresores' });
    expect(r.ok && r.datos).toMatchObject({ nombre: 'Repuestos Norte', telefonoNormalizado: '8095550000' });
  });
  it.each([
    [{ nombre: 'A', telefono: '8095550000', especialidad: 'X1' }, 'nombre'],
    [{ nombre: 'Ana', telefono: '555', especialidad: 'Lavadoras' }, 'teléfono'],
    [{ nombre: 'Ana', telefono: '+56 9 1234 5678', especialidad: 'Lavadoras' }, 'teléfono'],
    [{ nombre: 'Ana', telefono: '8095550000', especialidad: '' }, 'especialidad'],
  ])('rechaza datos incompletos %#', (entrada, campo) => {
    const r = validarSuplidor(entrada);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain(campo);
  });
});

describe('filtrarSuplidores', () => {
  const lista = [sup({}), sup({ id: '8095551111', nombre: 'Frío Central', especialidad: 'Compresores de nevera', telefonoNormalizado: '8095551111' }), sup({ id: '8095552222', nombre: 'Viejo', activo: false, telefonoNormalizado: '8095552222' })];
  it('busca sin tildes y oculta inactivos por defecto', () => {
    expect(filtrarSuplidores(lista, 'frio').map(s => s.nombre)).toEqual(['Frío Central']);
    expect(filtrarSuplidores(lista, '').some(s => s.nombre === 'Viejo')).toBe(false);
    expect(filtrarSuplidores(lista, '', true).at(-1)?.nombre).toBe('Viejo');
  });
  it('busca por teléfono con al menos 3 dígitos', () => {
    expect(filtrarSuplidores(lista, '1111').map(s => s.id)).toEqual(['8095551111']);
  });
});

describe('construirMensajeConsulta', () => {
  it('solo incluye pieza, equipo, modelo y detalle', () => {
    const { mensaje } = construirMensajeConsulta({ piezaFaltante: 'Bomba de desagüe', equipoTipo: 'Lavadora', equipoMarca: 'Samsung', equipoModelo: 'WF45R6100AW' });
    expect(mensaje).toContain('Bomba de desagüe');
    expect(mensaje).toContain('Lavadora Samsung');
    expect(mensaje).toContain('WF45R6100AW');
  });
  it('la firma no admite datos del cliente aunque vengan en el objeto', () => {
    const datos = { piezaFaltante: 'Tarjeta', clienteNombre: 'Cliente Privado', telefono: '8095559999', clienteDireccion: 'Calle 1' } as unknown as Parameters<typeof construirMensajeConsulta>[0];
    const { mensaje } = construirMensajeConsulta(datos);
    expect(mensaje).not.toContain('Cliente Privado');
    expect(mensaje).not.toContain('8095559999');
    expect(mensaje).not.toContain('Calle 1');
  });
  it('oculta teléfonos y correos escritos en la descripción', () => {
    const { mensaje, ocultados } = construirMensajeConsulta({ piezaFaltante: 'Motor, llamar al 809-555-1234', detalle: 'cliente@correo.com' });
    expect(ocultados).toBe(2);
    expect(mensaje).not.toMatch(/555-1234|correo\.com/);
  });
  it.each(['Parte DC97-16350 de 220V', 'Referencia WF45R6100AW', 'Tarjeta 5304511738 de repuesto', 'Correa 8PJ-1245'])('no altera número de pieza: %s', texto => {
    expect(ocultarContactos(texto)).toEqual({ texto, ocultados: 0 });
  });
  it.each(['(809) 555 1234', '+1 829-555-1234', '8495551234', '555-1234', '+34 612 345 678'])('oculta teléfono %s', tel => {
    expect(ocultarContactos(`Llamar ${tel} hoy`)).toEqual({ texto: 'Llamar [dato oculto] hoy', ocultados: 1 });
  });
});

describe('esFotoPiezaSegura', () => {
  it('acepta solo fotos de piezas de Firebase Storage', () => {
    expect(esFotoPiezaSegura(FOTO)).toBe(true);
  });
  it.each([
    'http://firebasestorage.googleapis.com/v0/b/x/o/fotos-piezas%2Fo1%2Fp1.jpg?alt=media',
    'https://evil.example.com/v0/b/x/o/fotos-piezas%2Fo1%2Fp1.jpg?alt=media',
    'https://firebasestorage.googleapis.com/v0/b/x/o/whatsapp-media%2F809%2Fa.jpg?alt=media',
    'https://firebasestorage.googleapis.com/v0/b/x/o/fotos-piezas%2F..%2Fsecreto.jpg?alt=media',
    'https://firebasestorage.googleapis.com/v0/b/x/o/fotos-piezas%2Fo1%2Fp1.jpg',
    'javascript:alert(1)', '', 123,
  ])('rechaza %s', url => { expect(esFotoPiezaSegura(url)).toBe(false); });
});

describe('WhatsApp', () => {
  it('prefija 1 y genera enlace sin enviar', () => {
    expect(numeroWhatsAppSuplidor('809-555-0000')).toBe('18095550000');
    expect(enlaceWhatsAppDispositivo('809-555-0000', 'Hola')).toBe('https://wa.me/18095550000?text=Hola');
    expect(enlaceWhatsAppDispositivo('555', 'Hola')).toBeNull();
  });
  it('Inbox empresarial solo con conversación propia y ventana abierta', () => {
    expect(evaluarChatEmpresa({ existe: false, ventanaAbierta: false })).toEqual({ puede: true, requierePlantilla: true });
    expect(evaluarChatEmpresa({ existe: true, clienteId: 'c1', ventanaAbierta: true }).puede).toBe(false);
    expect(evaluarChatEmpresa({ existe: true, ventanaAbierta: false })).toEqual({ puede: true, requierePlantilla: true });
    expect(evaluarChatEmpresa({ existe: true, ventanaAbierta: true })).toEqual({ puede: true, requierePlantilla: false });
    expect(evaluarChatEmpresa({ existe: false, clienteId: 'c1', ventanaAbierta: false }).puede).toBe(false);
  });
});
