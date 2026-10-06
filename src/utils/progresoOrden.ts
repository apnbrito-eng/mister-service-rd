/**
 * progresoOrden.ts — lógica pura (sin React, sin Firestore) que traduce una orden
 * a su "paso visible del día". Destino sugerido: src/utils/progresoOrden.ts
 *
 * Reglas:
 *  - NO cambia fases ni escribe datos. Solo lee.
 *  - Los pasos "En camino" y "En sitio" NO existen hoy en FaseOrden: salen de
 *    `visita.enCaminoEn` / `visita.enSitioEn` (campos NUEVOS, ver ESPEC-DISENO.md §5).
 *    Mientras no existan, la orden pasa de Agendada directo a Diagnóstico.
 *  - En mantenimiento la cotización ocurre ANTES de la visita; por eso las fases
 *    de diagnóstico/cotización solo cuentan si ocurren después de la llegada.
 *  - Sin precisión inventada: no se calcula "porcentaje dentro del paso".
 */
import type { FaseOrden } from '../types';

export type PasoVisible =
  | 'agendada'
  | 'en_camino'
  | 'en_sitio'
  | 'diagnostico'
  | 'trabajando'
  | 'cobro'
  | 'cerrada';

export const PASOS: readonly PasoVisible[] = [
  'agendada',
  'en_camino',
  'en_sitio',
  'diagnostico',
  'trabajando',
  'cobro',
  'cerrada',
] as const;

export type TipoServicio = 'reparacion' | 'mantenimiento' | 'garantia';

export interface EntradaProgreso {
  fase: FaseOrden;
  historialFases: { fase: string; timestamp: Date }[];
  visita?: { enCaminoEn?: Date; enSitioEn?: Date };
  estadoPago?: 'pendiente' | 'parcial' | 'completo';
  fechaCita?: Date;
  duracionMin?: number;
  tipoServicio?: TipoServicio;
  /** true si hay un ítem de Stand-by abierto (estado !== 'llego') para esta orden */
  standbyAbierto?: boolean;
  standbyDesde?: Date;
}

export interface ProgresoOrden {
  /** -1 = aún no agendada (nuevo_lead / en_gestion / cotización previa) */
  indice: number;
  paso: PasoVisible | null;
  etiqueta: string;
  /** Momento en que empezó el paso actual, si se conoce */
  desde?: Date;
  completa: boolean;
  cancelada: boolean;
  garantia: boolean;
  standby: boolean;
  /** Minutos pasados de la hora de fin agendada. 0 si va a tiempo o no aplica */
  atrasoMin: number;
}

const DURACION_DEFECTO_MIN = 60;

export function etiquetaPaso(indice: number, tipo?: TipoServicio): string {
  switch (indice) {
    case 0: return 'Agendada';
    case 1: return 'En camino';
    case 2: return 'En sitio';
    case 3: return tipo === 'mantenimiento' ? 'Revisión' : 'Diagnóstico';
    case 4: return 'Trabajando';
    case 5: return tipo === 'garantia' ? 'Validación' : 'Cobro';
    case 6: return 'Cerrada';
    default: return 'Sin agendar';
  }
}

function ultimaVez(h: EntradaProgreso['historialFases'], fases: string[], despuesDe?: Date): Date | undefined {
  let r: Date | undefined;
  for (const e of h) {
    if (!fases.includes(e.fase)) continue;
    if (despuesDe && e.timestamp < despuesDe) continue;
    if (!r || e.timestamp > r) r = e.timestamp;
  }
  return r;
}

export function calcularProgreso(o: EntradaProgreso, ahora: Date = new Date()): ProgresoOrden {
  const tipo = o.tipoServicio;
  const garantia = tipo === 'garantia' || o.fase === 'garantia_reclamada';
  const base = { garantia, standby: !!o.standbyAbierto, cancelada: false, completa: false, atrasoMin: 0 };

  if (o.fase === 'cancelado') {
    return { ...base, cancelada: true, indice: -1, paso: null, etiqueta: 'Cancelada' };
  }
  if (o.fase === 'nuevo_lead' || o.fase === 'en_gestion') {
    return { ...base, indice: -1, paso: null, etiqueta: 'Sin agendar' };
  }
  if (o.fase === 'cerrado') {
    return { ...base, indice: 6, paso: 'cerrada', etiqueta: 'Cerrada', completa: true,
      desde: ultimaVez(o.historialFases, ['cerrado']) };
  }

  const llegada = o.visita?.enSitioEn;
  let indice: number;
  let desde: Date | undefined;

  if (o.fase === 'trabajo_realizado') {
    if (o.estadoPago === 'completo') {
      indice = 6; // pagada, falta cerrar en el sistema
      desde = ultimaVez(o.historialFases, ['trabajo_realizado']);
    } else {
      indice = 5;
      desde = ultimaVez(o.historialFases, ['trabajo_realizado']);
    }
  } else if (llegada) {
    const tTrabajo = ultimaVez(o.historialFases, ['aprobado'], llegada);
    const tDiag = ultimaVez(o.historialFases, ['en_diagnostico', 'en_cotizacion'], llegada);
    if (tTrabajo) { indice = 4; desde = tTrabajo; }
    else if (tDiag) { indice = 3; desde = tDiag; }
    else { indice = 2; desde = llegada; }
  } else if (o.visita?.enCaminoEn) {
    indice = 1; desde = o.visita.enCaminoEn;
  } else {
    // Fix hallazgo QA 2026-10-01 §10: SIN `visita.enSitioEn` NO se infiere presencia física
    // a partir de fases como 'aprobado'/'en_diagnostico'/'en_cotizacion'. La fase es un dato de
    // negocio (cotización puede ocurrir antes de visita en mantenimiento) y no una validación
    // persistida de que el técnico llegó. La orden se queda «Agendada» hasta que haya marca
    // real de visita o cambie de fase a `trabajo_realizado`/`cerrado`.
    indice = 0;
    desde = ultimaVez(o.historialFases, ['agendado']);
  }

  // Atraso: solo cuando NO hay standby y la orden está en vivo (en camino/sitio/trabajando).
  // Fix hallazgo QA 2026-10-01 §11: standby no cuenta como atraso.
  let atrasoMin = 0;
  if (!o.standbyAbierto && o.fechaCita && indice >= 1 && indice <= 4) {
    const fin = o.fechaCita.getTime() + (o.duracionMin ?? DURACION_DEFECTO_MIN) * 60_000;
    const diff = Math.round((ahora.getTime() - fin) / 60_000);
    atrasoMin = diff > 0 ? diff : 0;
  }

  return {
    ...base,
    indice,
    paso: PASOS[indice],
    etiqueta: o.standbyAbierto ? 'Stand‑by · pieza' : etiquetaPaso(indice, tipo),
    desde: o.standbyAbierto ? o.standbyDesde ?? desde : desde,
    atrasoMin,
  };
}

/** Avance 0..1 de una orden para resúmenes (barra del día). Pasos completos / 7. */
export function avanceOrden(p: ProgresoOrden): number {
  if (p.completa) return 1;
  if (p.indice < 0) return 0;
  return p.indice / PASOS.length;
}

/** Color CSS del tramo i según la orden (garantía siempre roja). */
export function colorPaso(i: number, garantia: boolean): string {
  return garantia ? 'var(--ms-garantia)' : `var(--ms-paso-${i})`;
}
