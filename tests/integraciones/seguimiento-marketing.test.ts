import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/firebase/config', () => ({ db: {} }));
import { Timestamp } from 'firebase/firestore';
import { rangoDiasRD, resumirPorOrigen, resumirAnuncios, resumirCampanas, cobrosVerificadosOrden } from '../../src/utils/seguimientoMarketing';
import { enlacesSeguimientoPara } from '../../src/utils/enlacesSeguimiento';
import type { Usuario } from '../../src/types';

const rango = rangoDiasRD('2026-09-01', '2026-09-30')!;
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
const orden = (id: string, extra: Record<string, unknown>) => ({ id, datos: { createdAt: ts('2026-09-10T15:00:00Z'), fase: 'agendado', ...extra } });

describe('rangoDiasRD', () => {
  it('cubre días completos en hora RD y rechaza rangos invertidos', () => {
    expect(rango.desde.toISOString()).toBe('2026-09-01T04:00:00.000Z');
    expect(rango.hasta.toISOString()).toBe('2026-10-01T03:59:59.999Z');
    expect(rangoDiasRD('2026-09-30', '2026-09-01')).toBeNull();
    expect(rangoDiasRD('30/09/2026', '2026-09-01')).toBeNull();
  });
});

describe('cobrosVerificadosOrden', () => {
  it('suma solo verificados válidos y no duplica el mismo ID', () => {
    const raw = orden('o', { pagos: [
      { id: 'a', monto: 1000, verificado: true, fecha: '2026-09-05', metodo: 'efectivo' },
      { id: 'a', monto: 1000, verificado: true, fecha: '2026-09-05', metodo: 'efectivo' },
      { id: 'b', monto: 500, verificado: false }, { id: 'c', monto: -5, verificado: true }, { monto: 250.5, verificado: true },
      { id: 'valido', monto: 200, verificado: true, fecha: '2026-09-05', metodo: 'efectivo' },
    ] });
    expect(cobrosVerificadosOrden(raw, rango)).toBe(200);
  });
});

describe('resumirPorOrigen', () => {
  it('agrupa por origen registrado, excluye eliminadas, fuera de rango y cuenta sin fecha aparte', () => {
    const r = resumirPorOrigen([
      orden('1', { metadatosCita: { origen: 'calendario_publico' }, fase: 'cerrado', pagos: [{ id: 'p', monto: 2000, verificado: true, fecha: '2026-09-10', metodo: 'efectivo' }] }),
      orden('2', { metadatosCita: { origen: 'calendario_publico' }, fase: 'cancelado' }),
      orden('3', {}),
      orden('4', { metadatosCita: { origen: 'inventado' } }),
      orden('5', { eliminada: true }),
      orden('6', { createdAt: ts('2026-08-31T12:00:00Z') }),
      { id: '7', datos: { fase: 'agendado' } },
    ], rango);
    expect(r.sinFecha).toBe(1);
    const cal = r.filas.find(f => f.origen === 'calendario_publico')!;
    expect(cal).toMatchObject({ ordenes: 2, cerradas: 1, canceladas: 1, conCobroVerificado: 1, cobrosVerificados: 2000 });
    expect(r.filas.find(f => f.origen === 'sin_registro')!.ordenes).toBe(2);
  });
});

describe('resumirAnuncios', () => {
  const conv = (id: string, anuncioId: string, fecha: string, clienteId?: string) => ({ id, datos: { origenMarketing: { canal: 'whatsapp', anuncioId, fecha: ts(fecha) }, ...(clienteId ? { clienteId } : {}) } });
  it('solo cuenta órdenes del mismo cliente por ID creadas después de la consulta', () => {
    const r = resumirAnuncios(
      [conv('c1', 'A1', '2026-09-05T12:00:00Z', 'cli1'), conv('c2', 'A1', '2026-09-06T12:00:00Z'), conv('c3', 'A2', '2026-09-20T12:00:00Z', 'cli2')],
      [
        orden('o1', { clienteId: 'cli1', fase: 'cerrado', pagos: [{ id: 'x', monto: 3000, verificado: true, fecha: '2026-09-10', metodo: 'efectivo' }] }),
        orden('o2', { clienteId: 'cli2' }),
        orden('o3', { clienteNombre: 'cli1' }),
      ], rango);
    const a1 = r.filas.find(f => f.anuncioId === 'A1')!;
    expect(a1).toMatchObject({ consultas: 2, conCliente: 1, ordenes: 1, cerradas: 1, cobrosVerificados: 3000 });
    expect(r.filas.find(f => f.anuncioId === 'A2')!.ordenes).toBe(0);
  });
  it('consulta sin fecha no se inventa', () => {
    const r = resumirAnuncios([{ id: 'c', datos: { origenMarketing: { anuncioId: 'A' } } }], [], rango);
    expect(r).toMatchObject({ filas: [], sinFecha: 1 });
  });
});

describe('resumirCampanas', () => {
  it('usa la medición guardada y detecta clientes contactados en varias campañas', () => {
    const r = resumirCampanas([
      { id: 'k1', datos: { fecha: ts('2026-09-02T12:00:00Z'), plantillaNombre: 'Mantenimiento', totalReactivados: 2, clientesContactados: [{ clienteId: 'a', enviado: true }, { clienteId: 'b', enviado: false }] } },
      { id: 'k2', datos: { fecha: ts('2026-09-15T12:00:00Z'), plantillaNombre: 'Chequeo', clientesContactados: [{ clienteId: 'a', enviado: true }] } },
      { id: 'k3', datos: { fecha: ts('2026-07-01T12:00:00Z'), clientesContactados: [{ clienteId: 'a', enviado: true }] } },
    ], rango);
    expect(r.filas.map(f => f.id)).toEqual(['k2', 'k1']);
    expect(r.filas[1]).toMatchObject({ contactados: 2, enviados: 1, reactivados: 2 });
    expect(r.filas[0].reactivados).toBeNull();
    expect(r.clientesRepetidos).toBe(1);
  });
});

describe('enlacesSeguimientoPara', () => {
  const u = (rol: string) => ({ rol }) as unknown as Usuario;
  it('coincide con los guards de App.tsx por rol', () => {
    const admin = enlacesSeguimientoPara(u('administrador')).map(e => e.to);
    expect(admin).toContain('/admin/configuracion-marketing');
    const coord = enlacesSeguimientoPara(u('coordinadora')).map(e => e.to);
    expect(coord).toContain('/admin/sugerencias-chequeo');
    expect(coord).not.toContain('/admin/configuracion-marketing');
    const sec = enlacesSeguimientoPara(u('secretaria')).map(e => e.to);
    expect(sec).toEqual(expect.arrayContaining(['/admin/inbox', '/admin/conocimiento', '/admin/clientes']));
    expect(sec).not.toContain('/admin/marketing');
    expect(sec).not.toContain('/admin/feedback');
    expect(enlacesSeguimientoPara(u('tecnico'))).toEqual([]);
    expect(enlacesSeguimientoPara(null)).toEqual([]);
  });
});

import { proyectarCobrosCaja } from '../../src/utils/movimientosCobros';
it('cobros coinciden con Caja para fecha/ID/método ausentes, duplicados y pagos fuera del rango RD', () => {
  const valido = { id: 'valido', monto: 200, verificado: true, fecha: '2026-09-30T23:59:59-04:00', metodo: 'efectivo' };
  const raw = orden('qa', { pagos: [valido, { ...valido, id: undefined }, { ...valido, id: 'sinfecha', fecha: undefined },
    { ...valido, id: 'sinmetodo', metodo: undefined }, { ...valido, id: 'repetido' }, { ...valido, id: 'repetido' },
    { ...valido, id: 'octubre', fecha: '2026-10-01T00:00:00-04:00' },
    { ...valido, id: 'link', metodo: 'link', bancoId: 'banco-qa' },
  ] });
  const caja = proyectarCobrosCaja([raw], undefined, '2026-09-01', '2026-09-30');
  expect(cobrosVerificadosOrden(raw, rango)).toBe(caja.totalConfirmado);
  expect(caja.totalConfirmado).toBe(400);
  expect(resumirPorOrigen([raw], rango).incidenciasCobros).toBe(caja.incidencias.length);
});
it('rechaza días normalizados inexistentes y acepta año bisiesto', () => {
  expect(rangoDiasRD('2026-02-31', '2026-03-04')).toBeNull();
  expect(rangoDiasRD('2026-02-01', '2026-02-29')).toBeNull();
  expect(rangoDiasRD('2024-02-29', '2024-02-29')).not.toBeNull();
});
it('no duplica una orden ni sus cobros entre anuncios: vinculación múltiple queda visible', () => {
  const conversaciones = ['a', 'b'].map(anuncioId => ({ id: anuncioId, datos: { clienteId: 'cliente', origenMarketing: { anuncioId, fecha: '2026-09-01' } } }));
  const r = resumirAnuncios(conversaciones, [orden('o', { clienteId: 'cliente', pagos: [{ id: 'p', monto: 500, verificado: true, fecha: '2026-09-15', metodo: 'efectivo' }] })], rango);
  expect(r.ordenesAmbiguas).toBe(1); expect(r.filas.reduce((s, f) => s + f.cobrosVerificados, 0)).toBe(0);
  expect(r.filas.reduce((s, f) => s + f.ordenes, 0)).toBe(0);
});
it('cohorte de órdenes y período del pago son condiciones independientes', () => {
  const filas = [orden('vieja', { createdAt: '2026-08-01', pagos: [{ id: 'p', fecha: '2026-09-15', monto: 100, verificado: true, metodo: 'efectivo' }] }),
    orden('nueva', { pagos: [{ id: 'p', fecha: '2026-10-15', monto: 100, verificado: true, metodo: 'efectivo' }] })];
  const r = resumirPorOrigen(filas, rango);
  expect(r.filas[0].ordenes).toBe(1); expect(r.filas[0].cobrosVerificados).toBe(0);
});
