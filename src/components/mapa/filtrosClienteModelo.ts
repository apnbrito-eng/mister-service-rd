/**
 * filtrosClienteModelo.ts — tipos y funciones puras para el filtrado de la
 * capa de clientes del Mapa. Se separa de `FiltrosClientesMapa.tsx` para
 * cumplir con `react-refresh/only-export-components`.
 */
import type { Cliente } from '../../types';
import { aplicaFiltros, FILTROS_DEFAULT, mesesDesdeUltimoServicio, type FiltrosClientes } from '../../utils/clientesFiltros';
import { antiguedadDe, sectorDe, type Antiguedad } from '../../utils/mapaClientes';

export interface FiltrosCapaCliente {
  busqueda: string;
  sector: string | null;
  antiguedades: Antiguedad[];
  conGarantia: boolean;
  originales: FiltrosClientes;
}

export const FILTROS_CAPA_DEFAULT: FiltrosCapaCliente = {
  busqueda: '',
  sector: null,
  antiguedades: [],
  conGarantia: false,
  originales: FILTROS_DEFAULT,
};

export function aplicaFiltrosCapa(c: Cliente, f: FiltrosCapaCliente): boolean {
  if (f.busqueda) {
    const q = f.busqueda.toLowerCase();
    const nombre = (c.nombre || '').toLowerCase();
    const tel = (c.telefonoNormalizado || c.telefono || '').toLowerCase();
    const dir = (c.direccion || '').toLowerCase();
    if (!nombre.includes(q) && !tel.includes(q) && !dir.includes(q)) return false;
  }
  if (f.sector) {
    const s = sectorDe({ sector: c.sector, zona: c.zona, lat: c.lat, lng: c.lng });
    if (s !== f.sector) return false;
  }
  if (f.antiguedades.length) {
    const a = antiguedadDe(mesesDesdeUltimoServicio(c));
    if (!f.antiguedades.includes(a)) return false;
  }
  if (f.conGarantia) {
    const servicios = c.legacyMetricas?.totalServicios ?? 0;
    if (servicios <= 0) return false;
  }
  if (!aplicaFiltros(c, f.originales)) return false;
  return true;
}
