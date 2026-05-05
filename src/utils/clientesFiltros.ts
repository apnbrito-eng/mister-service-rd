import { Cliente } from '../types';

/**
 * Filtros aplicables al listado/mapa de clientes en `/admin/clientes`.
 * Todos los criterios se combinan con AND. Cuando un campo está en
 * "todos" / arreglo vacío / "indiferente" no aplica restricción.
 */
export interface FiltrosClientes {
  /** Multi-select. Vacío = todas las zonas. */
  zonas: string[];
  /** Rango de tiempo desde el último servicio registrado. */
  ultimoServicio:
    | 'todos'
    | 'sin_registro'
    | 'menos_3m'
    | '3_6m'
    | '6_12m'
    | 'mas_12m'
    | 'mas_24m';
  /** Tipo de cliente. */
  tipo: 'todos' | 'particular' | 'b2b';
  /** Total servicios histórico (legacyMetricas.totalServicios). */
  totalServicios: 'todos' | '1' | '2_5' | '6_10' | '11_mas';
  /** Multi-select sobre legacyMetricas.equiposAtendidos. Vacío = todos. */
  equipos: string[];
  /** Filtro WhatsApp válido (10 dígitos normalizados). */
  whatsapp: 'indiferente' | 'si' | 'no';
}

export const FILTROS_DEFAULT: FiltrosClientes = {
  zonas: [],
  ultimoServicio: 'todos',
  tipo: 'todos',
  totalServicios: 'todos',
  equipos: [],
  whatsapp: 'indiferente',
};

/**
 * Calcula los meses transcurridos desde el último servicio del cliente.
 * Lee `legacyMetricas.fechaUltimoServicio` (formato YYYY-MM-DD).
 * Devuelve null si no hay registro válido.
 */
export function mesesDesdeUltimoServicio(c: Cliente): number | null {
  const fecha = c.legacyMetricas?.fechaUltimoServicio;
  if (!fecha || typeof fecha !== 'string') return null;
  // Esperamos YYYY-MM-DD; cualquier otra forma rechazamos para no producir NaN.
  const m = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  const fechaServ = new Date(year, month - 1, day);
  if (isNaN(fechaServ.getTime())) return null;
  const ahora = new Date();
  const diffMs = ahora.getTime() - fechaServ.getTime();
  const dias = diffMs / (1000 * 60 * 60 * 24);
  return dias / 30.4375; // promedio mensual (365.25/12)
}

/** Verifica que el cliente tenga teléfono normalizado de exactamente 10 dígitos. */
export function tieneWhatsAppValido(c: Cliente): boolean {
  const tel = (c.telefonoNormalizado || c.telefono || '').replace(/\D/g, '');
  // Acepta 10 dígitos directos o 11 con prefijo 1 (RD).
  if (tel.length === 10) return true;
  if (tel.length === 11 && tel.startsWith('1')) return true;
  return false;
}

/**
 * Devuelve la lista de tipos de equipo presentes en `legacyMetricas.equiposAtendidos`
 * (CSV) entre todos los clientes recibidos. Útil para poblar el multi-select del
 * filtro sin hardcodear opciones.
 */
export function equiposPresentesEnBase(clientes: Cliente[]): string[] {
  const set = new Set<string>();
  clientes.forEach(c => {
    const csv = c.legacyMetricas?.equiposAtendidos;
    if (!csv) return;
    csv.split(',').forEach(raw => {
      const v = raw.trim();
      if (v) set.add(v);
    });
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
}

/** Aplica todos los filtros (AND) sobre un cliente individual. */
export function aplicaFiltros(c: Cliente, f: FiltrosClientes): boolean {
  // Zona
  if (f.zonas.length > 0) {
    if (!c.zona || !f.zonas.includes(c.zona)) return false;
  }

  // Último servicio
  if (f.ultimoServicio !== 'todos') {
    const meses = mesesDesdeUltimoServicio(c);
    if (f.ultimoServicio === 'sin_registro') {
      if (meses !== null) return false;
    } else if (meses === null) {
      // Cualquier rango temporal explícito requiere registro válido
      return false;
    } else if (f.ultimoServicio === 'menos_3m') {
      if (meses >= 3) return false;
    } else if (f.ultimoServicio === '3_6m') {
      if (meses < 3 || meses >= 6) return false;
    } else if (f.ultimoServicio === '6_12m') {
      if (meses < 6 || meses >= 12) return false;
    } else if (f.ultimoServicio === 'mas_12m') {
      if (meses < 12) return false;
    } else if (f.ultimoServicio === 'mas_24m') {
      if (meses < 24) return false;
    }
  }

  // Tipo
  if (f.tipo !== 'todos') {
    const t = c.tipo || 'particular';
    if (t !== f.tipo) return false;
  }

  // Total servicios
  if (f.totalServicios !== 'todos') {
    const total = c.legacyMetricas?.totalServicios || 0;
    if (f.totalServicios === '1' && total !== 1) return false;
    if (f.totalServicios === '2_5' && (total < 2 || total > 5)) return false;
    if (f.totalServicios === '6_10' && (total < 6 || total > 10)) return false;
    if (f.totalServicios === '11_mas' && total < 11) return false;
  }

  // Equipos atendidos (cliente debe tener al menos UNO de los seleccionados)
  if (f.equipos.length > 0) {
    const csv = c.legacyMetricas?.equiposAtendidos || '';
    const presentes = csv.split(',').map(s => s.trim()).filter(Boolean);
    const hayInterseccion = presentes.some(e => f.equipos.includes(e));
    if (!hayInterseccion) return false;
  }

  // WhatsApp válido
  if (f.whatsapp === 'si' && !tieneWhatsAppValido(c)) return false;
  if (f.whatsapp === 'no' && tieneWhatsAppValido(c)) return false;

  return true;
}
