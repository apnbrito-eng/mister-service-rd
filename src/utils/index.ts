import { format, formatDistanceToNow, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import { FaseOrden, EstadoOrdenSimple, OrdenServicio, StandbyPieza, AlertaItem, AccionAuditoria, PiezaUsada, CondicionPieza, OrigenPieza } from '../types';

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

export function faseLabel(fase: FaseOrden): string {
  const labels: Record<FaseOrden, string> = {
    nuevo_lead: 'Nuevo Lead',
    en_gestion: 'En Gestión',
    en_diagnostico: 'En Diagnóstico',
    en_cotizacion: 'En Cotización',
    aprobado: 'Aprobado',
    agendado: 'Agendado',
    trabajo_realizado: 'Trabajo Realizado',
    cerrado: 'Cerrado',
    cancelado: 'Cancelado',
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

export function faseColor(fase: FaseOrden): string {
  const colors: Record<FaseOrden, string> = {
    nuevo_lead: 'bg-gray-100 text-gray-700',
    en_gestion: 'bg-blue-100 text-blue-700',
    en_diagnostico: 'bg-yellow-100 text-yellow-700',
    en_cotizacion: 'bg-orange-100 text-orange-700',
    aprobado: 'bg-purple-100 text-purple-700',
    agendado: 'bg-indigo-100 text-indigo-700',
    trabajo_realizado: 'bg-teal-100 text-teal-700',
    cerrado: 'bg-green-100 text-green-700',
    cancelado: 'bg-red-100 text-red-700',
  };
  return colors[fase] || 'bg-gray-100 text-gray-700';
}

export function faseBgColor(fase: FaseOrden): string {
  const colors: Record<FaseOrden, string> = {
    nuevo_lead: '#6b7280',
    en_gestion: '#3b82f6',
    en_diagnostico: '#f59e0b',
    en_cotizacion: '#f97316',
    aprobado: '#8b5cf6',
    agendado: '#6366f1',
    trabajo_realizado: '#14b8a6',
    cerrado: '#22c55e',
    cancelado: '#ef4444',
  };
  return colors[fase] || '#6b7280';
}

export function faseToEstadoSimple(fase: FaseOrden): EstadoOrdenSimple {
  if (['nuevo_lead', 'en_gestion', 'aprobado', 'agendado'].includes(fase)) return 'pendiente';
  if (['en_diagnostico', 'en_cotizacion'].includes(fase)) return 'en_proceso';
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

export function generateNumeroOrden(count: number): string {
  return `OS-${String(count + 1).padStart(4, '0')}`;
}

export function generateNumeroCotizacion(count: number): string {
  return `QT-${String(count + 1).padStart(5, '0')}`;
}

export function generateNumeroFactura(count: number): string {
  return `FAC-${String(count + 1).padStart(5, '0')}`;
}

export const TIPOS_EQUIPO = ['Lavadora', 'Secadora', 'Nevera', 'Estufa', 'Aire Acondicionado', 'Microondas', 'Lavavajillas', 'Otro'];

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
    historialFases: historialRaw.map(h => ({
      fase: (h.fase as FaseOrden) || 'nuevo_lead',
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
