import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ llamadas: [] as string[] }));
vi.mock('../../src/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ collection: (_: unknown, path: string) => path,
  getDocs: async (path: string) => { m.llamadas.push(path); return { docs: [{ id: 'legacy', data: () => path === 'campanas_marketing' ? { creadaEn: '2026-09-05' } : {} }] }; },
}));
import { cargarDatosSeguimiento } from '../../src/services/seguimientoMarketing.service';
import { rangoDiasRD, resumirCampanas, resumirPorOrigen } from '../../src/utils/seguimientoMarketing';
it('lectura puntual conserva órdenes sin fecha y campañas legacy creadaEn para filtro local', async () => {
  const rango = rangoDiasRD('2026-09-01', '2026-09-30')!;
  const d = await cargarDatosSeguimiento(rango);
  expect(m.llamadas).toEqual(['ordenes_servicio', 'whatsapp_conversaciones', 'campanas_marketing']);
  expect(resumirPorOrigen(d.ordenes!, rango).sinFecha).toBe(1);
  expect(resumirCampanas(d.campanas!, rango).filas).toHaveLength(1);
});
