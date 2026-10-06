// Destino: src/utils/__tests__/mapaClientes.test.ts
import { describe, expect, it } from 'vitest';
import type { Cliente } from '../../src/utils/../types';
import {
  antiguedadDe, sectorDe, pesoCalor, resumenPorSector, ordenarSectores, valorMetrica,
  oportunidadesCercaDeRuta, kmEntre, textoOferta, ANTIGUEDAD,
} from '../../src/utils/mapaClientes';

// Fecha fija: los clientes se arman con fechaUltimoServicio relativa a hoy real del test
const haceMeses = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d.toISOString().slice(0, 10); };
const cli = (id: string, extra: Partial<Cliente> & { meses?: number; monto?: number }): Cliente => ({
  id, nombre: `Cliente ${id}`, telefono: '8095550101', direccion: '',
  legacyMetricas: extra.meses === undefined ? undefined : { totalServicios: 2, fechaUltimoServicio: haceMeses(extra.meses), montoTotalHistorico: extra.monto ?? 5000, equiposAtendidos: 'Lavadora', marcasHabituales: '', bancosPago: '' },
  ...extra,
} as Cliente);
const wa = () => true;

describe('antigüedad', () => {
  it('rangos y sin rojo', () => {
    expect([antiguedadDe(null), antiguedadDe(1), antiguedadDe(4), antiguedadDe(8), antiguedadDe(20)]).toEqual(['sin_registro', 'activo', 'reciente', 'enfriando', 'frio']);
    expect(Object.values(ANTIGUEDAD).map(a => a.color.toLowerCase())).not.toContain('#ef4444');
  });
});

describe('sector', () => {
  it('prefiere sector, luego zona, luego coordenadas', () => {
    expect(sectorDe({ sector: '  los   prados ', zona: 'Distrito Nacional' })).toBe('Los Prados');
    expect(sectorDe({ zona: 'Santo Domingo Este' })).toBe('Santo Domingo Este');
    expect(sectorDe({ lat: 18.474, lng: -69.928 })).toBe('Distrito Nacional');
    expect(sectorDe({})).toBe('Sin sector');
  });
});

describe('resumen por sector y métricas', () => {
  const cs = [
    cli('1', { sector: 'Naco', meses: 1, lat: 18.474, lng: -69.928, monto: 10000 }),
    cli('2', { sector: 'Naco', meses: 20, lat: 18.475, lng: -69.929, monto: 9000 }),
    cli('3', { sector: 'Herrera', meses: 15, lat: 18.474, lng: -70.003 }),
    cli('4', { sector: 'Herrera', meses: 30 }),
    cli('5', { sector: 'Herrera', meses: 4 }),
  ];
  const rs = resumenPorSector(cs, wa);
  it('cuenta por antigüedad, fríos con WhatsApp y centro', () => {
    const naco = rs.find(r => r.sector === 'Naco')!;
    expect(naco.clientes).toBe(2);
    expect(naco.porAntiguedad.frio).toBe(1);
    expect(naco.friosConWhatsApp).toBe(1);
    expect(naco.centro!.lat).toBeCloseTo(18.4745, 3);
    expect(rs.find(r => r.sector === 'Herrera')!.centro).not.toBeNull();
  });
  it('ordena según la métrica', () => {
    expect(ordenarSectores(rs, 'frios')[0].sector).toBe('Herrera');
    expect(ordenarSectores(rs, 'facturacion')[0].sector).toBe('Naco');
    expect(valorMetrica(rs.find(r => r.sector === 'Herrera')!, 'activos')).toBe(1);
  });
  it('peso de calor', () => {
    expect(pesoCalor(cs[0], 'frios')).toBe(0);
    expect(pesoCalor(cs[1], 'frios')).toBe(1);
    expect(pesoCalor(cs[0], 'facturacion')).toBeCloseTo(0.25);
  });
});

describe('cerca de la ruta', () => {
  const parada = { lat: 18.474, lng: -69.928, hora: new Date(), ordenId: 'OS-1' };
  const cs = [
    cli('a', { sector: 'Naco', meses: 20, lat: 18.476, lng: -69.930 }),        // ~0.3 km, frío
    cli('b', { sector: 'Naco', meses: 2, lat: 18.476, lng: -69.930 }),         // activo → fuera
    cli('c', { sector: 'Pedro Brand', meses: 20, lat: 18.566, lng: -70.093 }), // lejos → fuera
    cli('d', { sector: 'Naco', meses: 20 }),                                    // sin coords → fuera
  ];
  it('solo fríos con WhatsApp dentro del radio', () => {
    const o = oportunidadesCercaDeRuta(cs, [parada], wa);
    expect(o.map(x => x.cliente.id)).toEqual(['a']);
    expect(o[0].km).toBeLessThan(1);
    expect(oportunidadesCercaDeRuta(cs, [parada], () => false)).toHaveLength(0);
    expect(oportunidadesCercaDeRuta(cs, [parada], wa, { excluirIds: new Set(['a']) })).toHaveLength(0);
  });
  it('km y texto de oferta', () => {
    expect(kmEntre(parada, { lat: 18.566, lng: -70.093 })).toBeGreaterThan(15);
    expect(textoOferta('Rosa Fermín', 'Yoniel', 'Naco', 'Lavadora')).toContain('Hola Rosa');
  });
});
