import { expect, it, vi } from 'vitest';
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({}) }));
vi.mock('firebase/firestore', async original => ({ ...await original<typeof import('firebase/firestore')>(),
 collection: (_: unknown, nombre: string) => nombre,
 query: (ref: unknown) => ref,
 getDocs: async (nombre: string) => ({ docs: (nombre === 'facturas' ? [{ fechaEmision: '2026-09-15', total: 100, subtotal: 100, costoPiezas: 180, itbisMonto: 0, estado: 'pagada' }] : nombre === 'gastos' ? [{ fecha: '2026-09-15', monto: 20, categoria: 'otros' }] : []).map(d => ({ id: 'x', data: () => d })) }),
}));
import { cargarDataMes } from '../../src/services/estadoResultado.service';
it('pérdida bruta reduce resultado operativo en vez de truncarse a cero', async () => {
 const resultado = await cargarDataMes(2026, 9, []);
 expect(resultado.utilidadBruta).toBe(-80);
 expect(resultado.utilidadOperativa).toBe(-100);
});
