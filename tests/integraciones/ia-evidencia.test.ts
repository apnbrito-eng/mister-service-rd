import { describe, expect, it, vi } from 'vitest';
vi.mock('../../api/_lib/firebaseAdmin', () => ({ getAdminFirestore: vi.fn() }));
import { mapearOrdenResumen } from '../../api/_lib/iaTools';
describe('evidencia de seguimiento por rol', () => {
  const orden = { numero: 'OS-QA', precioAprobado: 123, notas: 'Cliente urgente', historialFases: [{ fase: 'nuevo_lead', timestamp: new Date('2026-09-13T15:02:00Z'), usuario: 'interno', nota: 'Dato privado' }] };
  it('entrega cronología registrada sin convertirla en incumplimiento', () => {
    const r = mapearOrdenResumen(orden, 'administrador');
    expect(r.evidenciaSeguimiento).toMatchObject({ eventosRegistrados: [{ fase: 'nuevo_lead', fecha: '2026-09-13T15:02:00.000Z' }], notaRegistrada: 'Cliente urgente', historialRecortado: false });
    expect(JSON.stringify(r)).not.toContain('Dato privado');
  });
  it.each(['secretaria', 'operaria'] as const)('no expone importe ni notas libres a %s en el resumen', rol => {
    const r = mapearOrdenResumen(orden, rol);
    expect(r).not.toHaveProperty('montoAprobado');
    expect(r.evidenciaSeguimiento).not.toHaveProperty('notaRegistrada');
  });
  it('declara cuando recorta historia y notas, sin inventar eventos faltantes', () => {
    const r = mapearOrdenResumen({ ...orden, notas: 'x'.repeat(900), historialFases: Array(12).fill(orden.historialFases[0]) }, 'administrador');
    expect(r.evidenciaSeguimiento).toMatchObject({ historialRecortado: true, notaRecortada: true });
  });
});
