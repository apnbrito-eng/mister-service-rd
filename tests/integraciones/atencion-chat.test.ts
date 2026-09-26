import { describe, it, expect } from 'vitest';
import { cambiarAtencion, type AtencionChat } from '../../src/utils/atencionChat';
const original: AtencionChat = { version: 2, responsableId: 'ana', responsableNombre: 'Ana', pendiente: true, traspaso: null };
const ana = { uid: 'ana', nombre: 'Ana', supervisor: false };
const bea = { uid: 'bea', nombre: 'Bea', supervisor: false };
describe('Responsabilidad de chat independiente de cartera', () => {
  it('retiene responsable y pendientes hasta recibir; no muta el estado anterior', () => {
    const solicitado = cambiarAtencion(original, ana, 'traspasar', bea, 'Confirmar horario');
    expect(solicitado.responsableId).toBe('ana'); expect(original.traspaso).toBeNull();
    const recibido = cambiarAtencion(solicitado, bea, 'aceptar');
    expect(recibido).toMatchObject({ responsableId: 'bea', pendiente: true, traspaso: null, version: 4 });
  });
  it('ni supervisión puede aceptar en nombre del destinatario', () => {
    const solicitado = cambiarAtencion(original, ana, 'traspasar', bea, 'Confirmar horario');
    expect(() => cambiarAtencion(solicitado, { ...ana, supervisor: true }, 'aceptar')).toThrow();
  });
  it('impide robar el chat y modificar pendientes de otra responsable', () => {
    expect(() => cambiarAtencion(original, bea, 'tomar')).toThrow();
    expect(() => cambiarAtencion(original, bea, 'resolver')).toThrow();
    expect(() => cambiarAtencion(original, bea, 'traspasar', ana, 'x')).toThrow();
  });
  it('exige resumen y evita dos traspasos simultáneos', () => {
    expect(() => cambiarAtencion(original, ana, 'traspasar', bea, ' ')).toThrow();
    const solicitado = cambiarAtencion(original, ana, 'traspasar', bea, 'Confirmar');
    expect(() => cambiarAtencion(solicitado, ana, 'traspasar', bea, 'Otro')).toThrow();
    expect(cambiarAtencion(solicitado, ana, 'cancelar').responsableId).toBe('ana');
  });
  it('resolver es una acción explícita y no reasigna', () => {
    expect(cambiarAtencion(original, ana, 'resolver')).toMatchObject({ pendiente: false, responsableId: 'ana' });
    expect(cambiarAtencion({ ...original, responsableId: null }, bea, 'tomar').responsableId).toBe('bea');
  });
});
