import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ emitir: null as null | ((s: unknown) => void), cancelar: vi.fn() }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('../../src/services/equipoApi', () => ({ equipoApi: vi.fn() }));
vi.mock('firebase/firestore', async () => ({ ...await vi.importActual<object>('firebase/firestore'), collection: () => ({}), onSnapshot: (_ref: unknown, fn: (s: unknown) => void) => { m.emitir = fn; return m.cancelar; } }));
import { suscribirContadorSinLeer } from '../../src/services/whatsappInbox.service';
it('dos mensajes del mismo chat cuentan uno y marcar leído actualiza a cero', () => {
 const resultado = vi.fn(); const cancelar = suscribirContadorSinLeer(resultado);
 const emitir = (valores: number[]) => m.emitir?.({ docs: valores.map((noLeidos, i) => ({ id: String(i), data: () => ({ noLeidos }) })) });
 emitir([2, 0]); expect(resultado).toHaveBeenLastCalledWith(1);
 emitir([2, 4, 0]); expect(resultado).toHaveBeenLastCalledWith(2);
 emitir([0, 0]); expect(resultado).toHaveBeenLastCalledWith(0);
 cancelar(); expect(m.cancelar).toHaveBeenCalledOnce();
});
