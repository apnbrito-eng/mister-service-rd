import {expect,it} from 'vitest';
import {fechaCalendarioRD,fechaProgramadaRD,estadoFechaMantenimiento} from '../../src/utils/fechaMantenimiento';
it('fecha de formulario conserva día RD y rechaza fechas imposibles',()=>{expect(fechaCalendarioRD(fechaProgramadaRD('2026-09-29')!)).toBe('2026-09-29');expect(fechaProgramadaRD('2026-02-30')).toBeNull();});
it('hoy no vence hasta cambiar día RD',()=>{const fecha=fechaProgramadaRD('2026-09-29')!;expect(estadoFechaMantenimiento(fecha,new Date('2026-09-30T03:59:00Z'))).toBe('hoy');expect(estadoFechaMantenimiento(fecha,new Date('2026-09-30T04:00:00Z'))).toBe('vencido');});
