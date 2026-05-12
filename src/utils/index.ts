import { format, formatDistanceToNow, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import { FaseOrden, EstadoOrdenSimple, OrdenServicio, StandbyPieza, AlertaItem, AccionAuditoria, PiezaUsada, CondicionPieza, OrigenPieza, Factura, EstadoFactura, GarantiaInfo, GarantiaEstado, GarantiaOrigen, ItemCotizacion, MetodoPago, PropuestaReprogramacion, SugerenciaSoloChequeo, Cliente, DireccionCliente, ServicioPrecio, PiezaInventario } from '../types';

/** Orden visual del ciclo de fases (agendado va antes de diagnostico) */
export const FASES_ORDENADAS: FaseOrden[] = [
  'nuevo_lead',
  'en_gestion',
  'agendado',
  'en_diagnostico',
  'en_cotizacion',
  'aprobado',
  'trabajo_realizado',
  'cerrado',
];

export function formatFecha(date: Date | undefined | null): string {
  if (!date) return 'Sin fecha';
  try {
    return format(date, "dd MMM yyyy, HH:mm", { locale: es });
  } catch {
    return 'Fecha inválida';
  }
}

export function formatFechaCorta(date: Date | undefined | null): string {
  if (!date) return 'Sin fecha';
  try {
    return format(date, "dd/MM/yyyy", { locale: es });
  } catch {
    return 'Fecha inválida';
  }
}

export function formatHora(date: Date | undefined | null): string {
  if (!date) return '';
  try {
    return format(date, "HH:mm", { locale: es });
  } catch {
    return '';
  }
}

export function tiempoTranscurrido(date: Date | undefined | null): string {
  if (!date) return '';
  try {
    return formatDistanceToNow(date, { locale: es, addSuffix: true });
  } catch {
    return '';
  }
}

export function formatMoneda(amount: number): string {
  return `RD$${amount.toLocaleString('es-DO')}`;
}

/** Igual que formatMoneda pero conserva hasta 2 decimales si el monto los tiene. */
export function formatMonedaPrecisa(amount: number): string {
  return `RD$${Number(amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatTelefono(tel: string): string {
  const digits = tel.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return tel;
}

export function whatsappLink(telefono: string, mensaje?: string): string {
  const digits = telefono.replace(/\D/g, '');
  const numero = digits.length === 10 ? `1${digits}` : digits;
  const url = `https://wa.me/${numero}`;
  return mensaje ? `${url}?text=${encodeURIComponent(mensaje)}` : url;
}

export function googleMapsLink(lat?: number, lng?: number, direccion?: string): string {
  // Si la dirección ya es una URL (pegada desde WhatsApp), usarla directamente
  if (direccion && (direccion.startsWith('http') || direccion.includes('maps.google'))) {
    return direccion;
  }
  if (lat && lng) return `https://maps.google.com/?q=${lat},${lng}`;
  if (direccion) return `https://maps.google.com/?q=${encodeURIComponent(direccion)}`;
  return '#';
}

export function faseLabel(fase: FaseOrden | 'reactivada_post_chequeo'): string {
  const labels: Record<FaseOrden | 'reactivada_post_chequeo', string> = {
    nuevo_lead: 'Nuevo Lead',
    en_gestion: 'En Gestión',
    en_diagnostico: 'En Diagnóstico',
    en_cotizacion: 'En Cotización',
    aprobado: 'Aprobado',
    agendado: 'Agendado',
    trabajo_realizado: 'Trabajo Realizado',
    cerrado: 'Cerrado',
    cancelado: 'Cancelado',
    garantia_reclamada: 'Garantía reclamada',
    reactivada_post_chequeo: 'Reactivada (post-chequeo)',
  };
  return labels[fase] || fase;
}

export function estadoSimpleLabel(estado: EstadoOrdenSimple): string {
  const labels: Record<EstadoOrdenSimple, string> = {
    pendiente: 'Pendiente',
    en_proceso: 'En Proceso',
    completado: 'Completado',
    cancelado: 'Cancelado',
  };
  return labels[estado] || estado;
}

export function estadoSimpleColor(estado: EstadoOrdenSimple): string {
  const colors: Record<EstadoOrdenSimple, string> = {
    pendiente: 'bg-blue-100 text-blue-700',
    en_proceso: 'bg-orange-100 text-orange-700',
    completado: 'bg-green-100 text-green-700',
    cancelado: 'bg-red-100 text-red-700',
  };
  return colors[estado] || 'bg-gray-100 text-gray-700';
}

export function estadoSimpleBorder(estado: EstadoOrdenSimple): string {
  const colors: Record<EstadoOrdenSimple, string> = {
    pendiente: 'border-l-blue-500',
    en_proceso: 'border-l-orange-500',
    completado: 'border-l-green-500',
    cancelado: 'border-l-red-500',
  };
  return colors[estado] || 'border-l-gray-300';
}

export function faseColor(fase: FaseOrden | 'reactivada_post_chequeo'): string {
  const colors: Record<FaseOrden | 'reactivada_post_chequeo', string> = {
    nuevo_lead: 'bg-gray-100 text-gray-700',
    en_gestion: 'bg-blue-100 text-blue-700',
    en_diagnostico: 'bg-yellow-100 text-yellow-700',
    en_cotizacion: 'bg-orange-100 text-orange-700',
    aprobado: 'bg-purple-100 text-purple-700',
    agendado: 'bg-indigo-100 text-indigo-700',
    trabajo_realizado: 'bg-teal-100 text-teal-700',
    cerrado: 'bg-green-100 text-green-700',
    cancelado: 'bg-red-100 text-red-700',
    garantia_reclamada: 'bg-orange-100 text-orange-800',
    reactivada_post_chequeo: 'bg-blue-50 text-blue-700',
  };
  return colors[fase] || 'bg-gray-100 text-gray-700';
}

export function faseBgColor(fase: FaseOrden | 'reactivada_post_chequeo'): string {
  const colors: Record<FaseOrden | 'reactivada_post_chequeo', string> = {
    nuevo_lead: '#6b7280',
    en_gestion: '#3b82f6',
    en_diagnostico: '#f59e0b',
    en_cotizacion: '#f97316',
    aprobado: '#8b5cf6',
    agendado: '#6366f1',
    trabajo_realizado: '#14b8a6',
    cerrado: '#22c55e',
    cancelado: '#ef4444',
    garantia_reclamada: '#ea580c',
    reactivada_post_chequeo: '#3b82f6',
  };
  return colors[fase] || '#6b7280';
}

export function faseToEstadoSimple(fase: FaseOrden): EstadoOrdenSimple {
  if (['nuevo_lead', 'en_gestion', 'aprobado', 'agendado'].includes(fase)) return 'pendiente';
  // SPRINT-135a: 'garantia_reclamada' es lateral pero conceptualmente "en proceso"
  // (la orden original ya cerró, pero hay una visita activa).
  if (['en_diagnostico', 'en_cotizacion', 'garantia_reclamada'].includes(fase)) return 'en_proceso';
  if (['trabajo_realizado', 'cerrado'].includes(fase)) return 'completado';
  return 'cancelado';
}

export function getAlertasFromOrdenes(ordenes: OrdenServicio[]): AlertaItem[] {
  const alertas: AlertaItem[] = [];
  const idsUsados = new Set<string>();
  const now = new Date();

  for (const orden of ordenes) {
    if (idsUsados.has(orden.id)) continue;
    if (orden.soloChequeo) continue;
    if (orden.eliminada) continue;
    if (orden.enStandby) continue;
    const createdAt = orden.createdAt;
    const updatedAt = orden.updatedAt;
    if (!createdAt) continue;

    // Nuevo lead > 15 minutos
    if (orden.fase === 'nuevo_lead') {
      const minutos = differenceInMinutes(now, createdAt);
      if (minutos > 15) {
        alertas.push({
          id: `lead-${orden.id}`, tipo: 'roja',
          mensaje: `${orden.clienteNombre} — "${orden.equipoTipo}" lleva ${minutos} min en Nuevo Lead`,
          ordenId: orden.id, createdAt,
        });
        idsUsados.add(orden.id);
        continue;
      }
    }

    // Aprobado sin agendar
    if (orden.fase === 'aprobado' && !orden.fechaCita) {
      alertas.push({
        id: `apro-${orden.id}`, tipo: 'roja',
        mensaje: `${orden.clienteNombre} — Servicio aprobado sin agendar (${orden.equipoTipo})`,
        ordenId: orden.id, createdAt: updatedAt || createdAt,
      });
      idsUsados.add(orden.id);
      continue;
    }

    // Diagnóstico > 2 horas
    if (orden.fase === 'en_diagnostico') {
      const faseEntry = orden.historialFases?.find(h => h.fase === 'en_diagnostico');
      if (faseEntry?.timestamp && differenceInHours(now, faseEntry.timestamp) > 2) {
        alertas.push({
          id: `diag-${orden.id}`, tipo: 'naranja',
          mensaje: `${orden.clienteNombre} — "${orden.equipoTipo}" lleva más de 2h en Diagnóstico`,
          ordenId: orden.id, createdAt: faseEntry.timestamp,
        });
        idsUsados.add(orden.id);
        continue;
      }
    }

    // Cotización > 24 horas
    if (orden.fase === 'en_cotizacion') {
      const faseEntry = orden.historialFases?.find(h => h.fase === 'en_cotizacion');
      if (faseEntry?.timestamp && differenceInHours(now, faseEntry.timestamp) > 24) {
        alertas.push({
          id: `cot-${orden.id}`, tipo: 'naranja',
          mensaje: `${orden.clienteNombre} — Cotización sin respuesta hace más de 24h`,
          ordenId: orden.id, createdAt: faseEntry.timestamp,
        });
        idsUsados.add(orden.id);
        continue;
      }
    }

    // Cierres con observaciones
    if (orden.cierreServicio) {
      const cs = orden.cierreServicio;
      const tieneNoEnChecklist = cs.checklist?.some(c => c.respuesta === 'no');
      if (tieneNoEnChecklist) {
        alertas.push({
          id: `cierre-obs-${orden.id}`, tipo: 'naranja',
          mensaje: `⚠️ ${cs.tecnicoNombre} cerró ${orden.numero} con observaciones en checklist`,
          ordenId: orden.id, createdAt: cs.fechaCierre instanceof Date ? cs.fechaCierre : new Date(),
        });
        idsUsados.add(orden.id);
        continue;
      }
      if (cs.fotoCierre && !cs.fotoCierre.gpsVerificado) {
        alertas.push({
          id: `cierre-gps-${orden.id}`, tipo: 'naranja',
          mensaje: `📍 ${cs.tecnicoNombre} cerró ${orden.numero} sin verificación GPS (${orden.clienteNombre})`,
          ordenId: orden.id, createdAt: cs.fechaCierre instanceof Date ? cs.fechaCierre : new Date(),
        });
        idsUsados.add(orden.id);
        continue;
      }
      if (cs.fotoCierre?.distanciaCliente && cs.fotoCierre.distanciaCliente > 500) {
        alertas.push({
          id: `cierre-dist-${orden.id}`, tipo: 'naranja',
          mensaje: `📍 ${cs.tecnicoNombre} cerró ${orden.numero} a ${cs.fotoCierre.distanciaCliente}m del domicilio`,
          ordenId: orden.id, createdAt: cs.fechaCierre instanceof Date ? cs.fechaCierre : new Date(),
        });
        idsUsados.add(orden.id);
        continue;
      }
    }

    // SLA 24h
    if (orden.estado === 'activo' && !['cerrado', 'cancelado', 'trabajo_realizado'].includes(orden.fase)) {
      const dias = differenceInDays(now, createdAt);
      if (dias >= 1) {
        alertas.push({
          id: `sla-${orden.id}`, tipo: dias >= 2 ? 'roja' : 'naranja',
          mensaje: `${orden.numero} — ${orden.clienteNombre} lleva ${dias} día(s) sin completar`,
          ordenId: orden.id, createdAt,
        });
        idsUsados.add(orden.id);
      }
    }
  }

  return alertas
    .sort((a, b) => (a.tipo === 'roja' && b.tipo !== 'roja' ? -1 : a.tipo !== 'roja' && b.tipo === 'roja' ? 1 : 0))
    .slice(0, 15);
}

export function getStandbyAlertas(standbyItems: StandbyPieza[]): AlertaItem[] {
  const alertas: AlertaItem[] = [];
  const now = new Date();
  for (const item of standbyItems) {
    if (item.estado === 'llego') continue;
    if (!item.fechaInicio) continue;
    const dias = differenceInDays(now, item.fechaInicio);
    if (dias > 14) {
      alertas.push({
        id: `standby-${item.id}`, tipo: 'naranja',
        mensaje: `${item.clienteNombre} — "${item.piezaFaltante}" en stand-by hace ${dias} días`,
        ordenId: item.ordenId, createdAt: item.fechaInicio,
      });
    }
  }
  return alertas;
}

/**
 * Genera un token único para el Portal del Cliente. 32 chars hex sin
 * guiones (usa `crypto.randomUUID()` y elimina los `-`). Llamar al
 * confirmar la cita (transición a `fase: 'agendado'`). Idempotente desde
 * el caller: si la orden ya tiene `tokenPortalCliente`, no se regenera.
 *
 * IMPORTANTE: el token NUNCA debe loguearse. Cualquier error que se
 * propague al cliente debe ser genérico, sin incluir el token en el body.
 */
export function generarTokenPortalCliente(): string {
  // crypto.randomUUID está disponible en navegadores modernos y en Node 19+.
  // Con TS lib > es2022 ya está tipado en `globalThis.crypto`.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  // Fallback ultra-defensivo (no debería usarse en runtime real). 32 chars hex.
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

/**
 * Días de gracia que sigue funcionando el `tokenPortalCliente` después
 * de cerrar/cancelar la orden. Decidido por Jorge 2026-05-11 — cubre
 * reclamos de garantía tempranos y consultas post-cierre.
 *
 * SPRINT-139.
 */
export const TOKEN_PORTAL_DIAS_GRACIA = 30;

/**
 * Calcula la fecha de expiración del `tokenPortalCliente` para una orden
 * que recién pasa a `fase: 'cerrado'` o `'cancelado'`. Setear este campo
 * en la misma escritura que cambia la fase.
 *
 * SPRINT-139 (2026-05-11).
 */
export function calcularExpiracionTokenPortal(desdeFecha: Date = new Date()): Date {
  const exp = new Date(desdeFecha);
  exp.setDate(exp.getDate() + TOKEN_PORTAL_DIAS_GRACIA);
  return exp;
}

/**
 * Devuelve `true` si el `tokenPortalCliente` de la orden sigue siendo válido.
 *
 * Reglas:
 * - Si la orden NO está cerrada/cancelada → válido siempre (sin fecha límite).
 * - Si la orden está cerrada/cancelada y tiene `tokenPortalClienteExpiraEn`
 *   → válido si `Date.now() <= expiraEn`.
 * - Si la orden está cerrada/cancelada y NO tiene `tokenPortalClienteExpiraEn`
 *   (legacy pre-SPRINT-139) → válido si `Date.now() <= fechaCierre + 30 días`.
 * - Si no hay forma de calcular fecha (orden cerrada sin `fechaCierre` ni
 *   `fechaCancelacion`) → válido (fail-open, evita romper portales legacy).
 *
 * SPRINT-139 (2026-05-11).
 */
export function tokenPortalClienteValido(orden: {
  fase?: string;
  estado?: string;
  tokenPortalClienteExpiraEn?: { toDate?: () => Date } | Date | null;
  fechaCierre?: { toDate?: () => Date } | Date | null;
  fechaCancelacion?: { toDate?: () => Date } | Date | null;
}): boolean {
  const faseEsCerrada = orden.fase === 'cerrado' || orden.fase === 'cancelado'
    || orden.estado === 'cerrado' || orden.estado === 'cancelado';

  if (!faseEsCerrada) return true;

  const toDate = (v: unknown): Date | null => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'object' && v && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function') {
      try {
        return (v as { toDate: () => Date }).toDate();
      } catch {
        return null;
      }
    }
    return null;
  };

  const expiraExplicito = toDate(orden.tokenPortalClienteExpiraEn);
  if (expiraExplicito) {
    return Date.now() <= expiraExplicito.getTime();
  }

  // Legacy: computar desde fechaCierre / fechaCancelacion + 30 días.
  const fechaBase = toDate(orden.fechaCierre) ?? toDate(orden.fechaCancelacion);
  if (!fechaBase) {
    // Orden cerrada pero sin fechaCierre — fail-open para no romper portales legacy.
    return true;
  }
  const expiracionLegacy = calcularExpiracionTokenPortal(fechaBase);
  return Date.now() <= expiracionLegacy.getTime();
}

/**
 * Devuelve la propuesta de reprogramación pendiente del CLIENTE más
 * reciente — la que está esperando resolución de admin/coord — o null
 * si no hay ninguna. Defensiva: la fecha de propuesta puede venir como
 * Timestamp o Date.
 *
 * Filtramos por `propuestaPor === 'cliente'` deliberadamente: las
 * contrapropuestas del propio admin (`propuestaPor === 'admin'`) no
 * aparecen en el panel admin como "pendientes de revisar" — quedan en
 * `auditoria` y se confirman manualmente vía WhatsApp con el cliente.
 */
export function obtenerPropuestaReprogramacionPendiente(
  orden: { propuestasReprogramacion?: PropuestaReprogramacion[] },
): PropuestaReprogramacion | null {
  const lista = orden.propuestasReprogramacion;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const pendientes = lista.filter(
    p => p.estado === 'pendiente' && p.propuestaPor === 'cliente',
  );
  if (pendientes.length === 0) return null;
  // Ordenar por `fechaPropuesta` desc (la más reciente primero).
  pendientes.sort((a, b) => {
    const at = parseFirestoreDate(a.fechaPropuesta as unknown)?.getTime() ?? 0;
    const bt = parseFirestoreDate(b.fechaPropuesta as unknown)?.getTime() ?? 0;
    return bt - at;
  });
  return pendientes[0];
}

/**
 * Devuelve la sugerencia de "solo chequeo" pendiente más reciente, o null si
 * no hay ninguna esperando aprobación de oficina. Defensiva: si por algún
 * motivo hay múltiples pendientes (no debería ocurrir, el frontend gateaa),
 * elige la más reciente por `fechaSugerencia`.
 */
export function obtenerSugerenciaSoloChequeoPendiente(
  orden: { sugerenciasSoloChequeo?: SugerenciaSoloChequeo[] },
): SugerenciaSoloChequeo | null {
  const lista = orden.sugerenciasSoloChequeo;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const pendientes = lista.filter(s => s.estado === 'pendiente');
  if (pendientes.length === 0) return null;
  pendientes.sort((a, b) => {
    const at = parseFirestoreDate(a.fechaSugerencia as unknown)?.getTime() ?? 0;
    const bt = parseFirestoreDate(b.fechaSugerencia as unknown)?.getTime() ?? 0;
    return bt - at;
  });
  return pendientes[0];
}

/**
 * Devuelve la sugerencia de "solo chequeo" más reciente sin importar el
 * estado. Útil para renderizar el banner verde/rojo después de que oficina
 * resuelve (aprueba/rechaza), aunque ya no esté `pendiente`.
 */
export function obtenerUltimaSugerenciaSoloChequeo(
  orden: { sugerenciasSoloChequeo?: SugerenciaSoloChequeo[] },
): SugerenciaSoloChequeo | null {
  const lista = orden.sugerenciasSoloChequeo;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const ordenadas = [...lista].sort((a, b) => {
    const at = parseFirestoreDate(a.fechaSugerencia as unknown)?.getTime() ?? 0;
    const bt = parseFirestoreDate(b.fechaSugerencia as unknown)?.getTime() ?? 0;
    return bt - at;
  });
  return ordenadas[0] ?? null;
}

export function generateNumeroOrden(count: number): string {
  return `OS-${String(count + 1).padStart(4, '0')}`;
}

export function generateNumeroCotizacion(count: number): string {
  return `QT-${String(count + 1).padStart(5, '0')}`;
}

/**
 * @deprecated Usa `useTiposEquipo()` de `src/hooks/useTiposEquipo.ts` para
 * leer la lista en vivo desde el catálogo admin. Esta constante se
 * preserva solo para componentes que aún no se migraron al hook.
 *
 * NO incluye 'Microondas' ni 'Lavavajillas' (legacy del primer prototipo).
 * Si necesitas la lista de fallback con tipos default, importa
 * `TIPOS_EQUIPO_FALLBACK` desde `./tiposEquipoFallback`.
 */
export const TIPOS_EQUIPO = ['Lavadora', 'Secadora', 'Nevera', 'Estufa', 'Aire Acondicionado', 'Otro'];

/**
 * Formatea una línea descriptiva del equipo para listar en cards y resúmenes.
 * Usa " · " como separador.
 *
 * Después del sprint del catálogo configurable, `equipoModelo` ya guarda la
 * opción elegida del catálogo (incluyendo "Torre" / "Individual" para
 * lavadoras). `equipoTipoMotor` queda solo como fallback histórico para
 * órdenes pre-catálogo que no tienen `equipoModelo` poblado.
 *
 * Ejemplos:
 *   formatearEquipoLabel({ equipoTipo: 'Lavadora', equipoMarca: 'Mabe', equipoModelo: 'Torre' })
 *     => 'Lavadora · Mabe · Torre'
 *   formatearEquipoLabel({ equipoTipo: 'Nevera', equipoMarca: 'LG', equipoModelo: 'French door' })
 *     => 'Nevera · LG · French door'
 *   formatearEquipoLabel({ equipoTipo: 'Lavadora', equipoMarca: 'Mabe', equipoTipoMotor: 'torre' })
 *     => 'Lavadora · Mabe · Torre' (orden histórica, fallback a equipoTipoMotor)
 */
export function formatearEquipoLabel(equipo: {
  equipoTipo?: string;
  equipoMarca?: string;
  equipoModelo?: string;
  equipoTipoMotor?: 'torre' | 'individual';
}): string {
  const partes: string[] = [];
  if (equipo.equipoTipo) partes.push(equipo.equipoTipo);
  if (equipo.equipoMarca) partes.push(equipo.equipoMarca);
  if (equipo.equipoModelo) {
    partes.push(equipo.equipoModelo);
  } else if (equipo.equipoTipoMotor) {
    // Fallback histórico para órdenes pre-catálogo (sprint Parte 2) que
    // sólo tienen equipoTipoMotor sin equipoModelo poblado.
    partes.push(equipo.equipoTipoMotor === 'torre' ? 'Torre' : 'Individual');
  }
  return partes.join(' · ');
}

/** Etiqueta legible del campo `equipoTipoMotor`. */
export function labelTipoMotor(tipoMotor?: 'torre' | 'individual'): string {
  if (tipoMotor === 'torre') return 'Torre';
  if (tipoMotor === 'individual') return 'Individual';
  return '';
}

export const DURACIONES = [15, 30, 45, 60, 90, 120];

/**
 * Detecta si una orden tiene piezas en stand-by pendientes (no llegadas aún).
 * Recibe el array de StandbyPieza ya cargado en memoria.
 */
export function tieneStandby(orden: { id: string }, standbyItems: import('../types').StandbyPieza[]): boolean {
  return standbyItems.some(s => s.ordenId === orden.id && s.estado !== 'llego');
}

/**
 * Heurística para detectar si una orden es de mantenimiento por su descripción.
 * Usado para preaprobar precios automáticamente desde el catálogo (Fase 4B).
 */
export function esOrdenMantenimiento(descripcionFalla?: string): boolean {
  const t = (descripcionFalla || '').toLowerCase();
  return t.includes('mantenimiento');
}

export const HORARIOS = [
  '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00'
];

export const HORARIOS_LABEL: Record<string, string> = {
  '09:00': '9:00 AM', '10:00': '10:00 AM', '11:00': '11:00 AM',
  '12:00': '12:00 PM', '13:00': '1:00 PM', '14:00': '2:00 PM',
  '15:00': '3:00 PM', '16:00': '4:00 PM', '17:00': '5:00 PM',
  '18:00': '6:00 PM'
};

export const TECNICO_COLORS: Record<string, string> = {
  'Carlos Técnico': '#3b82f6',
  'Pedro Técnico': '#f97316',
  default: '#8b5cf6',
};

export function getTecnicoColor(nombre: string): string {
  return TECNICO_COLORS[nombre] || TECNICO_COLORS.default;
}

export function parseFirestoreDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as Record<string, unknown>).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  if (typeof val === 'string') return new Date(val);
  return null;
}

/**
 * Rehidrata defensivamente un cliente desde un doc de Firestore. Tolera
 * campos faltantes (clientes viejos sin `origen` o `legacyMetricas`) y
 * arrays mal escritos. Útil para nuevos call sites; los existentes pueden
 * seguir construyendo el objeto inline.
 */
export function parseCliente(id: string, raw: Record<string, unknown>): Cliente {
  const direccionesRaw = Array.isArray(raw.direcciones) ? (raw.direcciones as DireccionCliente[]) : undefined;

  const legacyRaw = raw.legacyMetricas;
  const legacyMetricas = legacyRaw && typeof legacyRaw === 'object'
    ? (() => {
      const lm = legacyRaw as Record<string, unknown>;
      return {
        totalServicios: typeof lm.totalServicios === 'number' ? lm.totalServicios : 0,
        fechaUltimoServicio: typeof lm.fechaUltimoServicio === 'string' ? lm.fechaUltimoServicio : '',
        montoTotalHistorico: typeof lm.montoTotalHistorico === 'number' ? lm.montoTotalHistorico : 0,
        equiposAtendidos: typeof lm.equiposAtendidos === 'string' ? lm.equiposAtendidos : '',
        marcasHabituales: typeof lm.marcasHabituales === 'string' ? lm.marcasHabituales : '',
        bancosPago: typeof lm.bancosPago === 'string' ? lm.bancosPago : '',
      };
    })()
    : undefined;

  const origenRaw = raw.origen;
  const origen = (origenRaw === 'calendar_legacy' || origenRaw === 'manual'
    || origenRaw === 'agendar_publico' || origenRaw === 'cita_publica')
    ? origenRaw
    : undefined;

  // Migración defensiva: clientes existentes sin `tipo` se tratan como
  // 'particular'. Solo se respeta 'b2b' explícito; cualquier otro valor
  // (undefined, null, string raro) cae al default seguro.
  const tipo: 'particular' | 'b2b' = raw.tipo === 'b2b' ? 'b2b' : 'particular';

  // Sprint Reactivación Marketing (Commit 2): rehidratamos defensivamente
  // los campos nuevos. Clientes legacy sin estos campos no rompen.
  const ultimoContactoMarketing = parseFirestoreDate(raw.ultimoContactoMarketing) || undefined;
  const contactosMarketingRaw = raw.contactosMarketing;
  const contactosMarketing = Array.isArray(contactosMarketingRaw)
    ? contactosMarketingRaw
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const e = entry as Record<string, unknown>;
          const fecha = parseFirestoreDate(e.fecha);
          if (!fecha) return null;
          return {
            fecha,
            plantillaId: typeof e.plantillaId === 'string' ? e.plantillaId : '',
            plantillaNombre: typeof e.plantillaNombre === 'string' ? e.plantillaNombre : '',
            agenteId: typeof e.agenteId === 'string' ? e.agenteId : '',
            agenteNombre: typeof e.agenteNombre === 'string' ? e.agenteNombre : '',
            campanaId: typeof e.campanaId === 'string' ? e.campanaId : '',
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null)
    : undefined;

  return {
    id,
    nombre: (raw.nombre as string) || '',
    telefono: (raw.telefono as string) || '',
    telefonoNormalizado: (raw.telefonoNormalizado as string) || undefined,
    email: (raw.email as string) || undefined,
    direccion: (raw.direccion as string) || '',
    referenciaDireccion: (raw.referenciaDireccion as string) || undefined,
    sector: (raw.sector as string) || undefined,
    ciudad: (raw.ciudad as string) || undefined,
    zona: (raw.zona as string) || undefined,
    lat: typeof raw.lat === 'number' ? raw.lat : undefined,
    lng: typeof raw.lng === 'number' ? raw.lng : undefined,
    direcciones: direccionesRaw,
    rnc: (raw.rnc as string) || undefined,
    razonSocial: (raw.razonSocial as string) || undefined,
    cedula: (raw.cedula as string) || undefined,
    tipo,
    origen,
    legacyMetricas,
    ultimoContactoMarketing,
    contactosMarketing,
    createdAt: parseFirestoreDate(raw.createdAt) || new Date(),
    updatedAt: parseFirestoreDate(raw.updatedAt) || undefined,
  };
}

export function parseOrden(id: string, raw: Record<string, unknown>): OrdenServicio {
  const historialRaw = (raw.historialFases as Array<Record<string, unknown>>) || [];
  return {
    id,
    numero: (raw.numero as string) || '',
    clienteId: (raw.clienteId as string) || '',
    clienteNombre: (raw.clienteNombre as string) || '',
    clienteTelefono: (raw.clienteTelefono as string) || undefined,
    clienteEmail: (raw.clienteEmail as string) || undefined,
    clienteDireccion: (raw.clienteDireccion as string) || undefined,
    clienteReferencia: (raw.clienteReferencia as string) || undefined,
    clienteLat: (raw.clienteLat as number) || undefined,
    clienteLng: (raw.clienteLng as number) || undefined,
    equipoTipo: (raw.equipoTipo as string) || '',
    equipoMarca: (raw.equipoMarca as string) || '',
    equipoModelo: (raw.equipoModelo as string) || undefined,
    equipoTipoMotor: raw.equipoTipoMotor === 'torre' || raw.equipoTipoMotor === 'individual'
      ? raw.equipoTipoMotor
      : undefined,
    descripcionFalla: (raw.descripcionFalla as string) || '',
    fotoEquipoUrl: (raw.fotoEquipoUrl as string) || undefined,
    tecnicoId: (raw.tecnicoId as string) || undefined,
    tecnicoNombre: (raw.tecnicoNombre as string) || undefined,
    operariaId: (raw.operariaId as string) || undefined,
    operariaNombre: (raw.operariaNombre as string) || undefined,
    responsableId: (raw.responsableId as string) || undefined,
    responsableNombre: (raw.responsableNombre as string) || undefined,
    fase: (raw.fase as FaseOrden) || 'nuevo_lead',
    estadoSimple: (raw.estadoSimple as EstadoOrdenSimple) || faseToEstadoSimple((raw.fase as FaseOrden) || 'nuevo_lead'),
    estado: (raw.estado as 'activo' | 'cerrado' | 'cancelado') || 'activo',
    fechaCita: parseFirestoreDate(raw.fechaCita) || undefined,
    duracionMin: (raw.duracionMin as number) || undefined,
    reagendada: (raw.reagendada as boolean) || false,
    notas: (raw.notas as string) || undefined,
    notasTecnico: (raw.notasTecnico as string) || undefined,
    precioSugerido: typeof raw.precioSugerido === 'number' ? raw.precioSugerido : undefined,
    precioAprobado: typeof raw.precioAprobado === 'number' ? raw.precioAprobado : undefined,
    precioFinal: typeof raw.precioFinal === 'number' ? raw.precioFinal : undefined,
    estadoAprobacion: (raw.estadoAprobacion as 'pendiente' | 'aprobado') || undefined,
    aprobadoPor: (raw.aprobadoPor as string) || undefined,
    fechaAprobacion: parseFirestoreDate(raw.fechaAprobacion) || undefined,
    creadoPor: (raw.creadoPor as string) || undefined,
    trackingGPS: raw.trackingGPS ? (() => {
      const tg = raw.trackingGPS as Record<string, unknown>;
      return {
        habilitado: (tg.habilitado as boolean) || false,
        token: (tg.token as string) || '',
        vehiculoId: (tg.vehiculoId as string) || '',
        tecnicoId: (tg.tecnicoId as string) || '',
        activadoPor: (tg.activadoPor as string) || '',
        activadoEn: parseFirestoreDate(tg.activadoEn) || new Date(),
        enlace: (tg.enlace as string) || '',
        expiresAt: parseFirestoreDate(tg.expiresAt) || new Date(),
      };
    })() : undefined,
    cierreServicio: raw.cierreServicio ? (() => {
      const cs = raw.cierreServicio as Record<string, unknown>;
      const foto = cs.fotoCierre as Record<string, unknown> | undefined;
      return {
        fechaCierre: parseFirestoreDate(cs.fechaCierre) || new Date(),
        tecnicoId: (cs.tecnicoId as string) || '',
        tecnicoNombre: (cs.tecnicoNombre as string) || '',
        // Wizard simplificado (nuevo)
        equipoFunciona: typeof cs.equipoFunciona === 'boolean' ? (cs.equipoFunciona as boolean) : undefined,
        clienteSatisfecho: typeof cs.clienteSatisfecho === 'boolean' ? (cs.clienteSatisfecho as boolean) : undefined,
        revisoConexiones: typeof cs.revisoConexiones === 'boolean' ? (cs.revisoConexiones as boolean) : undefined,
        fotoCierre: foto ? {
          url: (foto.url as string) || '',
          lat: (foto.lat as number) || 0,
          lng: (foto.lng as number) || 0,
          timestamp: parseFirestoreDate(foto.timestamp) || new Date(),
          gpsVerificado: (foto.gpsVerificado as boolean) || false,
          distanciaCliente: (foto.distanciaCliente as number) || undefined,
        } : undefined,
        // Piezas utilizadas (Fase A1)
        piezasUsadas: Array.isArray(cs.piezasUsadas)
          ? (cs.piezasUsadas as Array<Record<string, unknown>>).map((p): PiezaUsada => ({
              id: (p.id as string) || `pieza_${Math.random().toString(36).slice(2)}`,
              nombre: (p.nombre as string) || '',
              marca: (p.marca as string) || undefined,
              modelo: (p.modelo as string) || undefined,
              condicion: ((p.condicion as CondicionPieza) || 'usada'),
              origen: ((p.origen as OrigenPieza) || 'inventario_taller'),
              cantidad: typeof p.cantidad === 'number' ? (p.cantidad as number) : 1,
              costoUnitario: typeof p.costoUnitario === 'number' ? (p.costoUnitario as number) : 0,
              costoTotal: typeof p.costoTotal === 'number'
                ? (p.costoTotal as number)
                : (typeof p.cantidad === 'number' ? (p.cantidad as number) : 1) * (typeof p.costoUnitario === 'number' ? (p.costoUnitario as number) : 0),
              proveedor: (p.proveedor as string) || undefined,
              fotoUrl: (p.fotoUrl as string) || undefined,
              notas: (p.notas as string) || undefined,
              registradaPor: (p.registradaPor as string) || '',
              registradaPorNombre: (p.registradaPorNombre as string) || '',
              registradaEn: parseFirestoreDate(p.registradaEn) || new Date(),
              aprobadaPorAdmin: typeof p.aprobadaPorAdmin === 'boolean' ? (p.aprobadaPorAdmin as boolean) : undefined,
              aprobadaEn: parseFirestoreDate(p.aprobadaEn) || undefined,
              aprobadaPor: (p.aprobadaPor as string) || undefined,
              editadaPor: (p.editadaPor as string) || undefined,
              editadaEn: parseFirestoreDate(p.editadaEn) || undefined,
            }))
          : undefined,
        piezasValidadasPorAdmin: typeof cs.piezasValidadasPorAdmin === 'boolean' ? (cs.piezasValidadasPorAdmin as boolean) : undefined,
        piezasValidadasEn: parseFirestoreDate(cs.piezasValidadasEn) || undefined,
        piezasValidadasPor: (cs.piezasValidadasPor as string) || undefined,
        // Wizard completo legacy
        piezasRetiradas: cs.piezasRetiradas ? (cs.piezasRetiradas as Array<Record<string, unknown>>) as unknown as import('../types').PiezaRetirada[] : undefined,
        piezasInstaladas: cs.piezasInstaladas ? (cs.piezasInstaladas as Array<Record<string, unknown>>) as unknown as import('../types').PiezaInstalada[] : undefined,
        checklist: cs.checklist ? (cs.checklist as Array<Record<string, unknown>>) as unknown as import('../types').ChecklistItem[] : undefined,
        descripcionTrabajo: (cs.descripcionTrabajo as string) || undefined,
        trabajoPendiente: (cs.trabajoPendiente as string) || undefined,
        satisfaccionCliente: typeof cs.satisfaccionCliente === 'number' ? (cs.satisfaccionCliente as number) : undefined,
      };
    })() : undefined,
    metodoPagoCierre: (raw.metodoPagoCierre as import('../types').MetodoPago) || undefined,
    bancoDestinoCierre: (raw.bancoDestinoCierre as string) || undefined,
    soloChequeo: (raw.soloChequeo as boolean) || undefined,
    precioChequeo: typeof raw.precioChequeo === 'number' ? raw.precioChequeo : undefined,
    motivoChequeo: (raw.motivoChequeo as string) || undefined,
    tipoCierre: raw.tipoCierre === 'solo_chequeo' || raw.tipoCierre === 'reparacion_completa'
      ? raw.tipoCierre
      : undefined,
    reactivadaPostChequeo: raw.reactivadaPostChequeo === true ? true : undefined,
    reactivadaPostChequeoEn: parseFirestoreDate(raw.reactivadaPostChequeoEn) || undefined,
    reactivadaPostChequeoPor: typeof raw.reactivadaPostChequeoPor === 'string' && raw.reactivadaPostChequeoPor.length > 0
      ? raw.reactivadaPostChequeoPor
      : undefined,
    cierreChequeoHistorico: raw.cierreChequeoHistorico && typeof raw.cierreChequeoHistorico === 'object'
      ? (() => {
          const ch = raw.cierreChequeoHistorico as Record<string, unknown>;
          return {
            monto: Number(ch.monto || 0),
            fechaCierre: parseFirestoreDate(ch.fechaCierre) || new Date(),
            conduceCG: typeof ch.conduceCG === 'string' && ch.conduceCG.length > 0 ? ch.conduceCG : undefined,
            tecnicoId: typeof ch.tecnicoId === 'string' && ch.tecnicoId.length > 0 ? ch.tecnicoId : undefined,
            tecnicoNombre: typeof ch.tecnicoNombre === 'string' && ch.tecnicoNombre.length > 0 ? ch.tecnicoNombre : undefined,
            motivoChequeo: typeof ch.motivoChequeo === 'string' && ch.motivoChequeo.length > 0 ? ch.motivoChequeo : undefined,
          };
        })()
      : undefined,
    eliminada: (raw.eliminada as boolean) || undefined,
    motivoEliminacion: (raw.motivoEliminacion as string) || undefined,
    eliminadaPor: (raw.eliminadaPor as string) || undefined,
    eliminadaPorId: (raw.eliminadaPorId as string) || undefined,
    fechaEliminacion: parseFirestoreDate(raw.fechaEliminacion) || undefined,
    motivoCancelacion: (raw.motivoCancelacion as string) || undefined,
    canceladaPor: (raw.canceladaPor as string) || undefined,
    canceladaPorId: (raw.canceladaPorId as string) || undefined,
    fechaCancelacion: parseFirestoreDate(raw.fechaCancelacion) || undefined,
    efectivoEntregado: (raw.efectivoEntregado as boolean) || undefined,
    efectivoEntregadoPor: (raw.efectivoEntregadoPor as string) || undefined,
    efectivoEntregadoEn: parseFirestoreDate(raw.efectivoEntregadoEn) || undefined,
    cotizacionId: (raw.cotizacionId as string) || undefined,
    inicioChequeo: raw.inicioChequeo ? (() => {
      const ic = raw.inicioChequeo as Record<string, unknown>;
      return {
        fechaInicio: parseFirestoreDate(ic.fechaInicio) || new Date(),
        tecnicoId: (ic.tecnicoId as string) || '',
        tecnicoNombre: (ic.tecnicoNombre as string) || '',
        fotoUrl: (ic.fotoUrl as string) || '',
        lat: typeof ic.lat === 'number' ? ic.lat : undefined,
        lng: typeof ic.lng === 'number' ? ic.lng : undefined,
        distanciaClienteMetros: typeof ic.distanciaClienteMetros === 'number' ? ic.distanciaClienteMetros : undefined,
        gpsVerificado: typeof ic.gpsVerificado === 'boolean' ? ic.gpsVerificado : undefined,
      };
    })() : undefined,
    // Pagos y facturación (Fase 7)
    pagos: Array.isArray(raw.pagos)
      ? (raw.pagos as Array<Record<string, unknown>>).map(p => ({
          id: (p.id as string) || `pago_${Math.random().toString(36).slice(2)}`,
          metodo: (p.metodo as 'efectivo' | 'transferencia' | 'tarjeta') || 'efectivo',
          monto: Number(p.monto) || 0,
          fecha: parseFirestoreDate(p.fecha) || new Date(),
          recibidoPorId: (p.recibidoPorId as string) || undefined,
          recibidoPorNombre: (p.recibidoPorNombre as string) || undefined,
          bancoId: (p.bancoId as string) || undefined,
          bancoNombre: (p.bancoNombre as string) || undefined,
          referencia: (p.referencia as string) || undefined,
          notas: (p.notas as string) || undefined,
          registradoPorId: (p.registradoPorId as string) || '',
          registradoPorNombre: (p.registradoPorNombre as string) || '',
        }))
      : undefined,
    montoPagado: typeof raw.montoPagado === 'number' ? raw.montoPagado : undefined,
    estadoPago: (raw.estadoPago as 'pendiente' | 'parcial' | 'completo') || undefined,
    enviadaAFacturacion: (raw.enviadaAFacturacion as boolean) || undefined,
    enviadaAFacturacionAt: parseFirestoreDate(raw.enviadaAFacturacionAt) || undefined,
    enviadaAFacturacionPorId: (raw.enviadaAFacturacionPorId as string) || undefined,
    enviadaAFacturacionPorNombre: (raw.enviadaAFacturacionPorNombre as string) || undefined,
    facturada: (raw.facturada as boolean) || undefined,
    facturaId: (raw.facturaId as string) || undefined,
    facturaNumero: (raw.facturaNumero as string) || undefined,
    facturadaAt: parseFirestoreDate(raw.facturadaAt) || undefined,
    facturadaPorId: (raw.facturadaPorId as string) || undefined,
    facturadaPorNombre: (raw.facturadaPorNombre as string) || undefined,
    // Piezas utilizadas (Fase A1)
    costoPiezasTotal: typeof raw.costoPiezasTotal === 'number' ? raw.costoPiezasTotal : undefined,
    cantidadPiezasUsadas: typeof raw.cantidadPiezasUsadas === 'number' ? raw.cantidadPiezasUsadas : undefined,
    // Stand-by de orden
    enStandby: typeof raw.enStandby === 'boolean' ? (raw.enStandby as boolean) : undefined,
    standbyMotivo: (raw.standbyMotivo as string) || undefined,
    standbyDesde: parseFirestoreDate(raw.standbyDesde) || undefined,
    standbyHasta: parseFirestoreDate(raw.standbyHasta) || undefined,
    standbyNotas: (raw.standbyNotas as string) || undefined,
    standbyPor: (raw.standbyPor as string) || undefined,
    // Garantía — orden reasignada (checks defensivos: tipo exacto)
    esGarantia: raw.esGarantia === true ? true : undefined,
    tecnicoOriginalUid: typeof raw.tecnicoOriginalUid === 'string' && raw.tecnicoOriginalUid.length > 0 ? raw.tecnicoOriginalUid : undefined,
    tecnicoOriginalNombre: typeof raw.tecnicoOriginalNombre === 'string' && raw.tecnicoOriginalNombre.length > 0 ? raw.tecnicoOriginalNombre : undefined,
    referenciaConduce: typeof raw.referenciaConduce === 'string' && raw.referenciaConduce.length > 0 ? raw.referenciaConduce : undefined,
    referenciaFacturaId: typeof raw.referenciaFacturaId === 'string' && raw.referenciaFacturaId.length > 0 ? raw.referenciaFacturaId : undefined,
    referenciaOrdenId: typeof raw.referenciaOrdenId === 'string' && raw.referenciaOrdenId.length > 0 ? raw.referenciaOrdenId : undefined,
    feedback: raw.feedback && typeof raw.feedback === 'object'
      ? (() => {
          const f = raw.feedback as Record<string, unknown>;
          const npsRaw = f.nps;
          if (typeof npsRaw !== 'number' || npsRaw < 0 || npsRaw > 10) return undefined;
          const fecha = parseFirestoreDate(f.fechaFeedback);
          if (!fecha) return undefined;
          const ratingTipo: 'detractor' | 'pasivo' | 'promotor' =
            f.ratingTipo === 'detractor' || f.ratingTipo === 'pasivo' || f.ratingTipo === 'promotor'
              ? f.ratingTipo
              : npsRaw <= 6 ? 'detractor' : npsRaw <= 8 ? 'pasivo' : 'promotor';
          const fb: NonNullable<OrdenServicio['feedback']> = {
            nps: npsRaw,
            ratingTipo,
            fechaFeedback: fecha,
          };
          if (typeof f.comentario === 'string' && f.comentario.length > 0) fb.comentario = f.comentario;
          if (f.googleReviewClicked === true) fb.googleReviewClicked = true;
          if (f.whatsappContactClicked === true) fb.whatsappContactClicked = true;
          return fb;
        })()
      : undefined,
    metadatosCita: raw.metadatosCita && typeof raw.metadatosCita === 'object'
      ? (() => {
          const m = raw.metadatosCita as Record<string, unknown>;
          const camposRaw = m.camposPersonalizados;
          let camposPersonalizados: Record<string, string> | undefined;
          if (camposRaw && typeof camposRaw === 'object' && !Array.isArray(camposRaw)) {
            const entries = Object.entries(camposRaw as Record<string, unknown>)
              .filter(([, v]) => typeof v === 'string' && (v as string).length > 0)
              .map(([k, v]) => [k, v as string] as const);
            if (entries.length > 0) camposPersonalizados = Object.fromEntries(entries);
          }
          const result: NonNullable<OrdenServicio['metadatosCita']> = {};
          if (typeof m.comoNosConocio === 'string' && m.comoNosConocio.length > 0) {
            result.comoNosConocio = m.comoNosConocio;
          }
          if (camposPersonalizados) result.camposPersonalizados = camposPersonalizados;
          if (typeof m.whatsappAsignado === 'string' && m.whatsappAsignado.length > 0) {
            result.whatsappAsignado = m.whatsappAsignado;
          }
          if (typeof m.whatsappAsignadoNombre === 'string' && m.whatsappAsignadoNombre.length > 0) {
            result.whatsappAsignadoNombre = m.whatsappAsignadoNombre;
          }
          if (typeof m.citaOrigenId === 'string' && m.citaOrigenId.length > 0) {
            result.citaOrigenId = m.citaOrigenId;
          }
          return Object.keys(result).length > 0 ? result : undefined;
        })()
      : undefined,
    // Portal del Cliente — token + tracking de envío + propuestas reprogramación.
    // Defensivos: las órdenes viejas (pre-sprint) no tienen estos campos. El
    // parser devuelve `undefined` cuando no existen, y `Object.fromEntries`
    // de stripUndefined los elimina antes de cualquier write.
    tokenPortalCliente: typeof raw.tokenPortalCliente === 'string' && raw.tokenPortalCliente.length > 0
      ? raw.tokenPortalCliente
      : undefined,
    portalClienteEnviado: raw.portalClienteEnviado && typeof raw.portalClienteEnviado === 'object'
      ? (() => {
          const pe = raw.portalClienteEnviado as Record<string, unknown>;
          const enviadoEn = parseFirestoreDate(pe.enviadoEn);
          if (!enviadoEn) return undefined;
          const metodo = pe.metodo === 'whatsapp' || pe.metodo === 'email' || pe.metodo === 'manual'
            ? pe.metodo
            : 'whatsapp';
          return {
            enviadoEn,
            enviadoPor: typeof pe.enviadoPor === 'string' ? pe.enviadoPor : '',
            enviadoPorNombre: typeof pe.enviadoPorNombre === 'string' ? pe.enviadoPorNombre : '',
            metodo,
          };
        })()
      : undefined,
    sugerenciasSoloChequeo: Array.isArray(raw.sugerenciasSoloChequeo)
      ? (raw.sugerenciasSoloChequeo as Array<Record<string, unknown>>)
          .map((s): SugerenciaSoloChequeo | null => {
            // Filtrar entries inválidas defensivamente: id, estado y
            // fechaSugerencia son obligatorios. Las rules permiten que el
            // técnico haga arrayUnion sin validación granular del shape.
            const idVal = typeof s.id === 'string' && s.id.length > 0 ? s.id : null;
            const estadoVal = s.estado === 'pendiente' || s.estado === 'aprobada' || s.estado === 'rechazada'
              ? s.estado
              : null;
            const fechaSugerencia = parseFirestoreDate(s.fechaSugerencia);
            if (!idVal || !estadoVal || !fechaSugerencia) return null;
            const out: SugerenciaSoloChequeo = {
              id: idVal,
              estado: estadoVal,
              sugeridaPor: typeof s.sugeridaPor === 'string' ? s.sugeridaPor : '',
              sugeridaPorNombre: typeof s.sugeridaPorNombre === 'string' ? s.sugeridaPorNombre : '',
              fechaSugerencia,
              motivo: typeof s.motivo === 'string' ? s.motivo : '',
              montoChequeo: typeof s.montoChequeo === 'number' ? s.montoChequeo : 0,
            };
            if (typeof s.resueltaPor === 'string' && s.resueltaPor.length > 0) out.resueltaPor = s.resueltaPor;
            if (typeof s.resueltaPorNombre === 'string' && s.resueltaPorNombre.length > 0) out.resueltaPorNombre = s.resueltaPorNombre;
            const resueltaEn = parseFirestoreDate(s.resueltaEn);
            if (resueltaEn) out.resueltaEn = resueltaEn;
            if (typeof s.notaResolucion === 'string' && s.notaResolucion.length > 0) out.notaResolucion = s.notaResolucion;
            return out;
          })
          .filter((s): s is SugerenciaSoloChequeo => s !== null)
      : undefined,
    propuestasReprogramacion: Array.isArray(raw.propuestasReprogramacion)
      ? (raw.propuestasReprogramacion as Array<Record<string, unknown>>)
          .map((p): PropuestaReprogramacion | null => {
            const fechaPropuesta = parseFirestoreDate(p.fechaPropuesta);
            // `fechaActualOrden` puede ser null si la propuesta se hizo sobre
            // una orden no agendada (defensivo — el endpoint hoy bloquea ese
            // caso) o si la orden mutó después. NO la requerimos para
            // hidratar la propuesta — sólo la mostramos como "Sin agendar
            // previamente" en el panel admin.
            const fechaActualOrden = parseFirestoreDate(p.fechaActualOrden);
            const fechaNuevaPropuesta = parseFirestoreDate(p.fechaNuevaPropuesta);
            if (!fechaPropuesta || !fechaNuevaPropuesta) return null;
            const estado = p.estado === 'pendiente' || p.estado === 'aceptada' || p.estado === 'rechazada' || p.estado === 'contrapropuesta'
              ? p.estado
              : 'pendiente';
            const propuestaPor = p.propuestaPor === 'admin' ? 'admin' : 'cliente';
            const out: PropuestaReprogramacion = {
              id: typeof p.id === 'string' && p.id.length > 0 ? p.id : `prop_${Math.random().toString(36).slice(2)}`,
              propuestaPor,
              fechaPropuesta,
              fechaActualOrden: fechaActualOrden ?? null,
              fechaNuevaPropuesta,
              motivo: typeof p.motivo === 'string' ? p.motivo : '',
              estado,
            };
            if (typeof p.resueltaPor === 'string' && p.resueltaPor.length > 0) out.resueltaPor = p.resueltaPor;
            if (typeof p.resueltaPorNombre === 'string' && p.resueltaPorNombre.length > 0) out.resueltaPorNombre = p.resueltaPorNombre;
            const resueltaEn = parseFirestoreDate(p.resueltaEn);
            if (resueltaEn) out.resueltaEn = resueltaEn;
            if (typeof p.notaResolucion === 'string' && p.notaResolucion.length > 0) out.notaResolucion = p.notaResolucion;
            const contrapropuestaFecha = parseFirestoreDate(p.contrapropuestaFecha);
            if (contrapropuestaFecha) out.contrapropuestaFecha = contrapropuestaFecha;
            return out;
          })
          .filter((p): p is PropuestaReprogramacion => p !== null)
      : undefined,
    // ROI tracking sprint Mapa Clientes Commit 3 — `reactivadaPor` snapshot
    // de la campaña que reactivó esta orden. Defensivo: si el bloque no es
    // un objeto válido o le falta `campanaId`/fechas, devolvemos undefined
    // para no inflar el snapshot UI con basura.
    reactivadaPor: raw.reactivadaPor && typeof raw.reactivadaPor === 'object' && !Array.isArray(raw.reactivadaPor)
      ? (() => {
          const r = raw.reactivadaPor as Record<string, unknown>;
          const campanaId = typeof r.campanaId === 'string' && r.campanaId.length > 0 ? r.campanaId : undefined;
          const campanaFecha = parseFirestoreDate(r.campanaFecha) || undefined;
          const fechaContacto = parseFirestoreDate(r.fechaContacto) || undefined;
          if (!campanaId || !campanaFecha || !fechaContacto) return undefined;
          return {
            campanaId,
            campanaFecha,
            campanaPlantillaNombre: typeof r.campanaPlantillaNombre === 'string' ? r.campanaPlantillaNombre : '',
            fechaContacto,
          };
        })()
      : undefined,
    historialFases: historialRaw.map(h => ({
      fase: (h.fase as FaseOrden | 'reactivada_post_chequeo') || 'nuevo_lead',
      timestamp: parseFirestoreDate(h.timestamp) || new Date(),
      usuario: (h.usuario as string) || 'Sistema',
      nota: (h.nota as string) || undefined,
    })),
    auditoria: Array.isArray(raw.auditoria)
      ? (raw.auditoria as Array<Record<string, unknown>>).map(a => ({
          fecha: parseFirestoreDate(a.fecha) || new Date(),
          usuario: (a.usuario as string) || 'Sistema',
          accion: (a.accion as AccionAuditoria) || 'editar',
          campo: (a.campo as string) || undefined,
          valorAnterior: (a.valorAnterior as string) || undefined,
          valorNuevo: (a.valorNuevo as string) || undefined,
          detalle: (a.detalle as string) || undefined,
        }))
      : [],
    createdAt: parseFirestoreDate(raw.createdAt) || new Date(),
    updatedAt: parseFirestoreDate(raw.updatedAt) || new Date(),
  };
}

/**
 * Parser/hidratador para documentos de la colección `facturas` (Conduces de
 * Garantía). Convierte Timestamps en Dates y rehidrata el bloque `garantia`.
 */
export function parseFactura(id: string, raw: Record<string, unknown>): Factura {
  const itemsRaw = Array.isArray(raw.items) ? (raw.items as Array<Record<string, unknown>>) : [];
  const items: ItemCotizacion[] = itemsRaw.map(i => ({
    descripcion: (i.descripcion as string) || '',
    cantidad: typeof i.cantidad === 'number' ? (i.cantidad as number) : 0,
    precio: typeof i.precio === 'number' ? (i.precio as number) : 0,
    tipoItem: (i.tipoItem as ItemCotizacion['tipoItem']) || undefined,
    servicioPrecioId: (i.servicioPrecioId as string) || undefined,
    piezaInventarioId: (i.piezaInventarioId as string) || undefined,
    costoCompra: typeof i.costoCompra === 'number' ? (i.costoCompra as number) : undefined,
    // Vendedor por línea (sprint Conduces SIBS — C1)
    tecnicoId: (i.tecnicoId as string) || undefined,
    tecnicoNombre: (i.tecnicoNombre as string) || undefined,
    precioModalidad: (i.precioModalidad === 'mayoreo' || i.precioModalidad === 'detalle')
      ? (i.precioModalidad as 'mayoreo' | 'detalle')
      : undefined,
  }));

  let garantia: GarantiaInfo | undefined;
  if (raw.garantia && typeof raw.garantia === 'object') {
    const g = raw.garantia as Record<string, unknown>;
    const inicioFecha = parseFirestoreDate(g.inicioFecha);
    const finFecha = parseFirestoreDate(g.finFecha);
    // Si las fechas críticas no son válidas (factura legacy sin estos
    // campos), preferimos NO retornar el bloque garantía antes que mostrar
    // fechas inventadas (`new Date()`) en el frontend.
    if (inicioFecha && finFecha) {
      garantia = {
        tiempoDias: typeof g.tiempoDias === 'number' ? (g.tiempoDias as number) : 0,
        inicioFecha,
        finFecha,
        token: (g.token as string) || '',
        estado: (g.estado as GarantiaEstado) || 'vigente',
        reclamadaEn: parseFirestoreDate(g.reclamadaEn) || undefined,
        problemaDescripcion: (g.problemaDescripcion as string) || undefined,
        origen: (g.origen as GarantiaOrigen) || undefined,
        ordenGarantiaId: (g.ordenGarantiaId as string) || undefined,
        tecnicoOriginalUid: (g.tecnicoOriginalUid as string) || undefined,
        tecnicoOriginalNombre: (g.tecnicoOriginalNombre as string) || undefined,
      };
    }
  }

  return {
    id,
    numero: (raw.numero as string) || '',
    clienteId: (raw.clienteId as string) || undefined,
    clienteNombre: (raw.clienteNombre as string) || '',
    clienteTelefono: (raw.clienteTelefono as string) || undefined,
    ordenId: (raw.ordenId as string) || undefined,
    ordenNumero: (raw.ordenNumero as string) || undefined,
    items,
    total: typeof raw.total === 'number' ? (raw.total as number) : 0,
    estado: (raw.estado as EstadoFactura) || 'emitida',
    fechaEmision: parseFirestoreDate(raw.fechaEmision) || new Date(),
    fechaVencimiento: parseFirestoreDate(raw.fechaVencimiento) || undefined,
    fechaPago: parseFirestoreDate(raw.fechaPago) || undefined,
    notas: (raw.notas as string) || undefined,
    metodoPago: (raw.metodoPago as MetodoPago) || undefined,
    bancoDestino: (raw.bancoDestino as string) || undefined,
    cotizacionId: (raw.cotizacionId as string) || undefined,
    subtotal: typeof raw.subtotal === 'number' ? (raw.subtotal as number) : undefined,
    itbisPorcentaje: typeof raw.itbisPorcentaje === 'number' ? (raw.itbisPorcentaje as number) : undefined,
    itbisMonto: typeof raw.itbisMonto === 'number' ? (raw.itbisMonto as number) : undefined,
    costoPiezas: typeof raw.costoPiezas === 'number' ? (raw.costoPiezas as number) : undefined,
    gananciaNeta: typeof raw.gananciaNeta === 'number' ? (raw.gananciaNeta as number) : undefined,
    comisionTecnicoId: (raw.comisionTecnicoId as string) || undefined,
    comisionTecnicoNombre: (raw.comisionTecnicoNombre as string) || undefined,
    comisionTecnicoPorcentaje: typeof raw.comisionTecnicoPorcentaje === 'number' ? (raw.comisionTecnicoPorcentaje as number) : undefined,
    comisionTecnicoMonto: typeof raw.comisionTecnicoMonto === 'number' ? (raw.comisionTecnicoMonto as number) : undefined,
    comisionRegistroId: (raw.comisionRegistroId as string) || undefined,
    equipoTipo: (raw.equipoTipo as string) || undefined,
    equipoMarca: (raw.equipoMarca as string) || undefined,
    equipoModelo: (raw.equipoModelo as string) || undefined,
    tecnicoId: (raw.tecnicoId as string) || undefined,
    tecnicoNombre: (raw.tecnicoNombre as string) || undefined,
    fechaServicio: parseFirestoreDate(raw.fechaServicio) || undefined,
    tipoCierre: raw.tipoCierre === 'solo_chequeo' || raw.tipoCierre === 'reparacion_completa'
      ? raw.tipoCierre
      : undefined,
    garantia,
    origen: raw.origen === 'manual' || raw.origen === 'post-cierre'
      ? raw.origen
      : undefined,
    clienteTipoEnEmision:
      raw.clienteTipoEnEmision === 'particular' || raw.clienteTipoEnEmision === 'b2b'
        ? raw.clienteTipoEnEmision
        : undefined,
    createdAt: parseFirestoreDate(raw.createdAt) || new Date(),
  };
}

/**
 * Parser defensivo para docs de la colección `precios_servicios` (catálogo
 * de servicios). Extiende lectura para soportar Mayoreo/Detalle (sprint
 * Conduces SIBS C2).
 *
 * Cascada de migración:
 * - `precio` (legacy) = `Number(raw.precio) || 0`.
 * - `precioMayoreo` = `raw.precioMayoreo ?? precio ?? 0`.
 * - `precioDetalle` = `raw.precioDetalle ?? precioMayoreo ?? precio ?? 0`.
 *
 * IMPORTANTE — asimetría con `parsePiezaInventario`: en `ServicioPrecio` el
 * campo legacy se llama `precio`. En `PiezaInventario` se llama `precioVenta`.
 * Mantener separados para no confundir cascadas. Ver decisión 29 del sprint.
 */
export function parseServicioPrecio(id: string, raw: Record<string, unknown>): ServicioPrecio {
  const precio = typeof raw.precio === 'number' ? (raw.precio as number) : Number(raw.precio) || 0;
  const precioMayoreoRaw = typeof raw.precioMayoreo === 'number' ? (raw.precioMayoreo as number) : undefined;
  const precioDetalleRaw = typeof raw.precioDetalle === 'number' ? (raw.precioDetalle as number) : undefined;
  const precioMayoreo = precioMayoreoRaw ?? precio ?? 0;
  const precioDetalle = precioDetalleRaw ?? precioMayoreo ?? precio ?? 0;
  return {
    id,
    marca: (raw.marca as string) || '',
    categoria: (raw.categoria as string) || '',
    equipoTipo: (raw.equipoTipo as string) || '',
    nombre: (raw.nombre as string) || '',
    precio,
    precioMayoreo,
    precioDetalle,
    activo: raw.activo !== false,
    createdAt: parseFirestoreDate(raw.createdAt) || new Date(),
    updatedAt: parseFirestoreDate(raw.updatedAt) || undefined,
    notas: (raw.notas as string) || undefined,
  };
}

/**
 * Parser defensivo para docs de la colección `piezas_inventario`. Extiende
 * lectura para soportar Mayoreo/Detalle (sprint Conduces SIBS C2).
 *
 * Cascada de migración (asimétrica vs `parseServicioPrecio`):
 * - `precioVenta` (legacy) = `Number(raw.precioVenta) || 0`.
 * - `precioMayoreo` = `raw.precioMayoreo ?? precioVenta ?? 0`.
 * - `precioDetalle` = `raw.precioDetalle ?? precioMayoreo ?? precioVenta ?? 0`.
 *
 * IMPORTANTE — asimetría con `parseServicioPrecio`: en `PiezaInventario` el
 * campo legacy se llama `precioVenta` (no `precio`). Ver decisión 29 del sprint.
 */
export function parsePiezaInventario(id: string, raw: Record<string, unknown>): PiezaInventario {
  const precioVenta = typeof raw.precioVenta === 'number' ? (raw.precioVenta as number) : Number(raw.precioVenta) || 0;
  const precioMayoreoRaw = typeof raw.precioMayoreo === 'number' ? (raw.precioMayoreo as number) : undefined;
  const precioDetalleRaw = typeof raw.precioDetalle === 'number' ? (raw.precioDetalle as number) : undefined;
  const precioMayoreo = precioMayoreoRaw ?? precioVenta ?? 0;
  const precioDetalle = precioDetalleRaw ?? precioMayoreo ?? precioVenta ?? 0;
  return {
    id,
    nombre: (raw.nombre as string) || '',
    codigo: (raw.codigo as string) || undefined,
    descripcion: (raw.descripcion as string) || undefined,
    precioCompra: typeof raw.precioCompra === 'number' ? (raw.precioCompra as number) : undefined,
    precioVenta,
    precioMayoreo,
    precioDetalle,
    stockActual: typeof raw.stockActual === 'number' ? (raw.stockActual as number) : 0,
    stockMinimo: typeof raw.stockMinimo === 'number' ? (raw.stockMinimo as number) : undefined,
    proveedorSugerido: (raw.proveedorSugerido as string) || undefined,
    categoria: (raw.categoria as string) || undefined,
    activo: raw.activo !== false,
    createdAt: parseFirestoreDate(raw.createdAt) || new Date(),
    updatedAt: parseFirestoreDate(raw.updatedAt) || undefined,
  };
}

/** Helper para crear un registro de auditoría que se guarda en Firestore */
export function crearRegistroAuditoria(
  usuario: string,
  accion: AccionAuditoria,
  detalle: string,
  campo?: string,
  valorAnterior?: string,
  valorNuevo?: string
): Record<string, unknown> {
  return {
    fecha: Timestamp.now(),
    usuario,
    accion,
    campo: campo || null,
    valorAnterior: valorAnterior || null,
    valorNuevo: valorNuevo || null,
    detalle,
  };
}
