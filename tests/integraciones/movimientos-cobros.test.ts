import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { proyectarCobrosBanco } from '../../src/utils/movimientosCobros';
const pago = (extra: Record<string, unknown> = {}) => ({ id: 'p1', bancoId: 'b1', metodo: 'transferencia', monto: 100, fecha: '2026-09-29T12:00:00-04:00', verificado: true, ...extra });
const proyectar = (pagos: Record<string, unknown>[], desde = '', hasta = '') => proyectarCobrosBanco([{ id: 'o1', datos: { numero: 'OS-1', pagos } }], 'b1', desde, hasta);
describe('proyección de cobros por banco', () => {
  it.each([new Date('2026-09-29T16:00:00Z'), Timestamp.fromDate(new Date('2026-09-29T16:00:00Z')), '2026-09-29T16:00:00Z'])('acepta fecha cruda válida %s', fecha => {
    expect(proyectar([pago({ fecha })]).totalConfirmado).toBe(100);
  });
  it('excluye copias iguales y conflictivas del mismo ID sin sumar ninguna', () => {
    for (const monto of [100, 200]) {
      const r = proyectar([pago(), pago({ monto })]);
      expect(r.totalConfirmado).toBe(0); expect(r.incidencias).toHaveLength(2);
    }
  });
  it.each(['link', 'otro'])('admite método %s con bancoId y verificación', metodo => {
    const r = proyectar([pago({ metodo })]);
    expect(r.totalConfirmado).toBe(100); expect(r.incidencias).toHaveLength(0);
  });
  it('dos pagos legítimos iguales conservan sus IDs distintos', () => {
    const r = proyectar([pago(), pago({ id: 'p2' })]);
    expect(r.totalConfirmado).toBe(200); expect(r.incidencias).toHaveLength(0);
  });
  it('mismo pagoId en órdenes distintas es legítimo', () => {
    const r = proyectarCobrosBanco(['o1', 'o2'].map(id => ({ id, datos: { pagos: [pago()] } })), 'b1');
    expect(r.totalConfirmado).toBe(200); expect(new Set(r.movimientos.map(m => m.clave)).size).toBe(2);
  });
  it('identifica cuenta por ID aunque dos bancos compartan nombre', () => {
    const r = proyectar([pago({ bancoNombre: 'Popular' }), pago({ id: 'p2', bancoId: 'b2', bancoNombre: 'Popular', monto: 500 })]);
    expect(r.totalConfirmado).toBe(100);
  });
  it('no mezcla efectivo ni pagos sin banco', () => {
    expect(proyectar([pago({ metodo: 'efectivo' }), pago({ bancoId: undefined })]).movimientos).toHaveLength(0);
  });
  it('muestra pendientes separados, desconocidos como incidencia', () => {
    const r = proyectar([pago({ verificado: false }), pago({ id: 'p2', verificado: undefined })]);
    expect(r.totalConfirmado).toBe(0); expect(r.totalPendiente).toBe(100); expect(r.incidencias).toHaveLength(1);
  });
  it.each([undefined, null, '', 'no-fecha', '2026-02-30', 0])('fecha legacy %s no cae en hoy ni total', fecha => {
    const r = proyectar([pago({ fecha })], '2026-09-01', '2026-09-30');
    expect(r.incidencias).toHaveLength(1); expect(r.totalConfirmado).toBe(0);
  });
  it('pago sin ID se excluye aunque tenga fecha válida', () => {
    expect(proyectar([pago({ id: undefined })]).incidencias).toHaveLength(1);
  });
  it.each([0, -1, NaN, Infinity, '100'])('rechaza monto %s', monto => {
    expect(proyectar([pago({ monto })]).totalConfirmado).toBe(0);
    expect(proyectar([pago({ monto })]).incidencias).toHaveLength(1);
  });
  it('rango inclusivo usa día RD y no verificadoAt', () => {
    const r = proyectar([pago({ fecha: '2026-09-30T03:59:59.999Z', verificadoAt: '2026-10-05T12:00:00Z' }), pago({ id: 'p2', fecha: '2026-09-30T04:00:00Z' })], '2026-09-29', '2026-09-29');
    expect(r.totalConfirmado).toBe(100);
  });
  it('rango invertido no calcula', () => { expect(proyectar([pago()], '2026-10-01', '2026-09-01').rangoInvalido).toBe(true); });
  it('orden eliminada conserva incidencia sin sumar ni inventar reverso', () => {
    const r = proyectarCobrosBanco([{ id: 'o1', datos: { eliminada: true, pagos: [pago()] } }], 'b1');
    expect(r.totalConfirmado).toBe(0); expect(r.incidencias[0].motivo).toContain('eliminada');
  });
  it('duplicado entre cuentas también se excluye', () => {
    expect(proyectar([pago(), pago({ bancoId: 'b2' })]).totalConfirmado).toBe(0);
  });
  it('no suma espejo ni totales denormalizados de la orden', () => {
    expect(proyectarCobrosBanco([{ id: 'o1', datos: { montoPagado: 500, pagos: [pago()] } }], 'b1').totalConfirmado).toBe(100);
  });
});
