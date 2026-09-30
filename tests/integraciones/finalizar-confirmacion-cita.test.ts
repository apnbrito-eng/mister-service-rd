import { describe, expect, it, vi } from 'vitest';
import { finalizarConfirmacionCita } from '../../src/utils/finalizarConfirmacionCita';
describe('finalización real usada por useOrdenCreateForm', () => {
  it('fallo posterior no notifica éxito ni resetea formulario; retry confirma la misma orden', async () => {
    const estado = { formulario: 'datos editados', ordenId: 'persistida' };
    const reset = vi.fn(() => { estado.formulario = ''; });
    const exito = vi.fn();
    const confirmar = vi.fn().mockRejectedValueOnce(new Error('garantía falló')).mockResolvedValueOnce(undefined);
    const pendiente = vi.fn(), liberar = vi.fn().mockResolvedValue(undefined);
    const parametros = { confirmar: () => confirmar(estado.ordenId), liberar, pendiente, completada: () => { exito(); reset(); } };
    expect(await finalizarConfirmacionCita(parametros)).toBe(false);
    expect(pendiente).toHaveBeenCalledOnce();
    expect(liberar).toHaveBeenCalledOnce();
    expect(exito).not.toHaveBeenCalled(); expect(reset).not.toHaveBeenCalled();
    expect(estado.formulario).toBe('datos editados');
    expect(await finalizarConfirmacionCita(parametros)).toBe(true);
    expect(confirmar.mock.calls).toEqual([['persistida'], ['persistida']]);
    expect(exito).toHaveBeenCalledOnce(); expect(reset).toHaveBeenCalledOnce();
  });
  it('sin callback libera bloqueo y completa normalmente', async () => {
    const liberar = vi.fn().mockResolvedValue(undefined), completada = vi.fn(), pendiente = vi.fn();
    expect(await finalizarConfirmacionCita({ liberar, completada, pendiente })).toBe(true);
    expect(liberar).toHaveBeenCalledOnce(); expect(completada).toHaveBeenCalledOnce();
    expect(pendiente).not.toHaveBeenCalled();
  });
});
