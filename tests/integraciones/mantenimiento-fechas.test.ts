import {expect,it} from 'vitest';
import {fechaCalendarioRD,fechaProgramadaRD,estadoFechaMantenimiento} from '../../src/utils/fechaMantenimiento';
it('fecha de formulario conserva día RD y rechaza fechas imposibles',()=>{expect(fechaCalendarioRD(fechaProgramadaRD('2026-09-29')!)).toBe('2026-09-29');expect(fechaProgramadaRD('2026-02-30')).toBeNull();});
it('hoy no vence hasta cambiar día RD',()=>{const fecha=fechaProgramadaRD('2026-09-29')!;expect(estadoFechaMantenimiento(fecha,new Date('2026-09-30T03:59:00Z'))).toBe('hoy');expect(estadoFechaMantenimiento(fecha,new Date('2026-09-30T04:00:00Z'))).toBe('vencido');});

it('avanza mes civil RD incluso con dispositivo Auckland y fin de mes', async () => {
  const { sumarMesesMantenimientoRD } = await import('../../src/utils/fechaMantenimiento');
  const previa = process.env.TZ;
  try {
    process.env.TZ = 'Pacific/Auckland';
    expect(sumarMesesMantenimientoRD(new Date('2026-01-30T12:00:00-04:00'),1).toISOString()).toBe('2026-02-28T16:00:00.000Z');
    expect(sumarMesesMantenimientoRD(new Date('2028-01-31T12:00:00-04:00'),1).toISOString()).toBe('2028-02-29T16:00:00.000Z');
  } finally { if (previa === undefined) delete process.env.TZ; else process.env.TZ=previa; }
});
