import { expect, it, vi } from 'vitest';
vi.mock('../../api/_lib/firebaseAdmin.js', () => ({ getAdminAuth: vi.fn(), getAdminFirestore: vi.fn() }));
import { normalizarRespuesta } from '../../api/gps/ubicacion';
it.each(['Wialon', 'Samsara', 'Traccar', 'Fleet Complete', 'API Personalizada'] as const)('%s no fabrica hora actual cuando falta la fecha GPS', proveedor => {
  expect(normalizarRespuesta({}, proveedor, 'qa').timestamp).toBeNull();
});
it('conserva hora real del proveedor y tolera fecha inválida', () => {
  expect(normalizarRespuesta({ time: 1790863200 }, 'Wialon', 'qa').timestamp).toBe(new Date(1790863200000).toISOString());
  expect(normalizarRespuesta({ time: 'fecha-rota' }, 'Samsara', 'qa').timestamp).toBeNull();
  expect(normalizarRespuesta({ deviceTime: '2026-10-01T12:00:00-04:00' }, 'Traccar', 'qa').timestamp).toBe('2026-10-01T16:00:00.000Z');
});
