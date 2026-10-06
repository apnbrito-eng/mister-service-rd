import { describe, expect, it } from 'vitest';
import type { OrdenServicio, Personal } from '../../src/types';
import { agregarAvisos, clasificarPendienteAnterior, jornadaTecnico, resumirDia } from '../../src/utils/operacionesPrioridad';

const ahora = new Date('2026-10-02T15:00:00-04:00');
function orden(cambios: Partial<OrdenServicio> = {}): OrdenServicio {
  return {
    id: 'orden-1', clienteNombre: 'Ana', tecnicoId: 'uid-yoniel',
    operariaNombre: 'Wila', fase: 'agendado', estado: 'activo',
    fechaCita: new Date('2026-10-02T09:00:00-04:00'),
    historialFases: [], ...cambios,
  } as OrdenServicio;
}
function tecnico(cambios: Partial<Personal> = {}): Personal {
  return { id: 'doc-yoniel', uid: 'uid-yoniel', nombre: 'Yoniel', rol: 'tecnico',
    activo: true, operariaNombre: 'Wila', ...cambios } as Personal;
}
function avisos(ordenes: OrdenServicio[], pendientesAnteriores: OrdenServicio[] = []) {
  return agregarAvisos({ ordenes, pendientesAnteriores, ahora });
}

describe('Cotejo independiente de Centro de operaciones', () => {
  it('no afirma un atraso calculado con una duración que nunca se registró', () => {
    const o = orden({ visita: { enCaminoEn: new Date('2026-10-02T08:45:00-04:00') } });
    expect(avisos([o]).avisos.some(a => a.categoria === 'atrasada')).toBe(false);
    expect(resumirDia({ ordenes: [o], personal: [tecnico()], ahora }).atrasadas).toBe(0);
  });

  it('cuenta una sola persona cuando sus órdenes usan UID y docId', () => {
    const visita = { enCaminoEn: new Date('2026-10-02T14:50:00-04:00') };
    const resumen = resumirDia({ ahora, personal: [tecnico()], ordenes: [
      orden({ id: 'uno', tecnicoId: 'uid-yoniel', visita }),
      orden({ id: 'dos', tecnicoId: 'doc-yoniel', visita }),
    ] });
    expect(resumen.enCamino).toBe(1);
    expect(resumen.enCamino).toBeLessThanOrEqual(resumen.tecnicosActivos);
  });

  it('el total de avisos cuenta órdenes únicas incluso entre día y pendientes', () => {
    const o = orden();
    const resultado = avisos([o, { ...o }], [o]);
    expect(resultado.avisos).toHaveLength(1);
    expect(Object.values(resultado.totalesCategoria).reduce((s, n) => s + n, 0)).toBe(1);
  });

  it('el filtro Equipo A deja fuera órdenes cuyo equipo se desconoce', () => {
    const resultado = agregarAvisos({ ahora, equipo: 'A', pendientesAnteriores: [],
      ordenes: [orden(), orden({ id: 'sin-equipo', operariaNombre: undefined })] });
    expect(resultado.avisos.map(a => a.ordenId)).toEqual(['orden-1']);
  });

  it.each(['cancelado', 'cerrado'] as const)('no alerta una orden con estado %s aunque conserve una fase antigua', estado => {
    const o = orden({ estado, fase: 'agendado' });
    expect(avisos([o], [o]).avisos).toEqual([]);
  });

  it('una fecha inválida no produce antigüedad NaN ni prioridad no numérica', () => {
    const aviso = clasificarPendienteAnterior(orden({ fechaCita: new Date('invalid') }), ahora);
    expect(Number.isFinite(aviso.prioridad)).toBe(true);
    expect(aviso.metrica).not.toMatch(/NaN|Invalid/);
    expect(aviso.metrica).toMatch(/sin fecha/i);
  });

  it('el filtro de técnico también limita las métricas de órdenes', () => {
    const resumen = resumirDia({ ahora, personal: [tecnico()],
      tecnicoIdsVisibles: new Set(['uid-yoniel']),
      ordenes: [orden(), orden({ id: 'otra', tecnicoId: 'uid-otro' })] });
    expect(resumen.totalDelDia).toBe(1);
  });

  it('la jornada tampoco inventa atraso cuando falta la duración registrada', () => {
    const o = orden({ visita: { enCaminoEn: new Date('2026-10-02T08:45:00-04:00') } });
    const jornada = jornadaTecnico(tecnico(), [o], ahora);
    expect(jornada).toHaveLength(1);
    expect(jornada[0].progreso.atrasoMin).toBe(0);
  });

  it('la jornada reconoce estado cerrado aunque la fase conserve agendado', () => {
    const o = orden({ estado: 'cerrado', fase: 'agendado' });
    const jornada = jornadaTecnico(tecnico(), [o], ahora);
    const resumen = resumirDia({ ahora, personal: [tecnico()], ordenes: [o] });
    expect(jornada).toHaveLength(1);
    expect(jornada[0].progreso.completa).toBe(true);
    expect(resumen.cerradas).toBe(1);
  });

  it('sin filtro explícito conserva citas sin asignar y de inactivos, contando solo técnicos activos canónicos', () => {
    const visita = { enCaminoEn: new Date('2026-10-02T14:50:00-04:00') };
    const resumen = resumirDia({ ahora, personal: [tecnico(), tecnico({ id: 'doc-baja', uid: 'uid-baja', activo: false })],
      ordenes: [
        orden({ id: 'activa-uid', tecnicoId: 'uid-yoniel', visita }),
        orden({ id: 'activa-doc', tecnicoId: 'doc-yoniel', visita }),
        orden({ id: 'sin-asignar', tecnicoId: undefined }),
        orden({ id: 'inactivo', tecnicoId: 'uid-baja', visita }),
      ] });
    expect(resumen.totalDelDia).toBe(4);
    expect(resumen.tecnicosActivos).toBe(1);
    expect(resumen.enCamino).toBe(1);
    expect(resumen.enSitio).toBe(0);
  });

  it('sin filtro explícito los avisos incluyen la cita sin técnico asignado', () => {
    const resultado = agregarAvisos({ ahora, personal: [tecnico()], pendientesAnteriores: [],
      ordenes: [orden({ id: 'sin-asignar', tecnicoId: undefined })] });
    expect(resultado.avisos.map(a => a.ordenId)).toContain('sin-asignar');
  });
});
