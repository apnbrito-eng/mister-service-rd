import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ acceso: vi.fn() }));
vi.mock('../../api/_lib/accesoEquipo.js', () => ({ accesoEquipo: mocks.acceso, ErrorAcceso: class extends Error { constructor(public status: number, mensaje: string) { super(mensaje); } } }));
vi.mock('../../api/_lib/appMovilVerificada.js', () => ({ exigirAppMovil: vi.fn() }));
import handler from '../../api/movil/estado';
afterEach(() => vi.restoreAllMocks());
it('registra fallo inesperado sin incluir mensaje sensible ni datos de solicitud', async () => {
 const secreto = 'Bearer secreto lat=18.4321 cliente=Nombre';
 mocks.acceso.mockRejectedValueOnce(new Error(secreto));
 const log = vi.spyOn(console, 'error').mockImplementation(() => {});
 let status = 0, salida: unknown;
 const res = { setHeader: vi.fn(), status: (n: number) => { status = n; return res; }, json: (v: unknown) => { salida = v; return res; } };
 await handler({ method: 'POST', headers: { authorization: secreto }, body: { accion: 'ubicacion', muestra: secreto } } as never, res as never);
 expect(status).toBe(500);
 expect(log).toHaveBeenCalledExactlyOnceWith('[movil/estado] fallo inesperado', { codigo: 'ESTADO_MOVIL_ERROR', clase: 'error' });
 expect(JSON.stringify([log.mock.calls, salida])).not.toContain(secreto);
});
