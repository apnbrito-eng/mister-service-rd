/**
 * adaptadores.ts — convierte los datos reales (OrdenServicio, Personal, UbicacionVehiculo)
 * a lo que usa mapaOperaciones.ts. Destino: src/utils/mapaAdaptadores.ts
 *
 * Un solo lugar donde se decide de dónde sale cada dato. Si un campo cambia de nombre, se arregla aquí.
 */
import type { OrdenServicio, Personal, UbicacionVehiculo } from '../types';
import { calcularProgreso, type TipoServicio } from './progresoOrden';
import { especialidadDe } from './capacidadAgenda';
import { TECNICOS, equipoDeOperaria, type Especialidad } from './equiposOperacion';
import { tieneCoord } from './geo';
import type { CitaMapa, PosicionGPS, TecnicoMapa } from './mapaOperaciones';

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Convierte un valor que puede ser Date, Firestore Timestamp (`{seconds, nanoseconds}`) o string ISO
 * a un `Date` real. Si no se puede convertir, devuelve `undefined`.
 * Fix hallazgo QA 2026-10-01 §12: antes se hacía `new Date(objeto)` sobre un Timestamp,
 * lo que daba Invalid Date silencioso.
 */
function aDate(v: unknown): Date | undefined {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : undefined;
  if (v && typeof v === 'object' && 'seconds' in (v as Record<string, unknown>) && typeof (v as { seconds: unknown }).seconds === 'number') {
    const seconds = (v as { seconds: number }).seconds;
    const nanos = typeof (v as { nanoseconds?: number }).nanoseconds === 'number' ? (v as { nanoseconds: number }).nanoseconds : 0;
    return new Date(seconds * 1000 + nanos / 1_000_000);
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : undefined;
  }
  if (v && typeof v === 'object' && 'toDate' in (v as Record<string, unknown>) && typeof (v as { toDate: unknown }).toDate === 'function') {
    try {
      const d = (v as { toDate: () => unknown }).toDate();
      return d instanceof Date && Number.isFinite(d.getTime()) ? d : undefined;
    } catch { return undefined; }
  }
  return undefined;
}

/**
 * Tipo de servicio. Fix hallazgo QA 2026-10-01 §12: antes se buscaba «mantenimiento» en texto libre y
 * se ignoraban los campos reales de la orden (`esGarantia` y `enStandby`). Ahora:
 *  - garantía: `esGarantia === true` o `fase === 'garantia_reclamada'`.
 *  - mantenimiento: solo cuando viene de un flujo real de mantenimiento (campo `esMantenimiento` cuando
 *    exista) o la columna `equipoTipo` lo deja explícito; el texto libre `descripcionFalla` no decide.
 *  - reparación: en los demás casos.
 */
export function tipoDeOrden(o: Pick<OrdenServicio, 'fase' | 'descripcionFalla' | 'equipoTipo' | 'esGarantia'> & { esMantenimiento?: boolean }): TipoServicio {
  if (o.esGarantia === true || o.fase === 'garantia_reclamada') return 'garantia';
  if (o.esMantenimiento === true) return 'mantenimiento';
  // El texto libre `descripcionFalla` NO se usa — una «lavadora con descripcion: pide mantenimiento»
  // es una reparación, no un mantenimiento. Solo si el tipo de equipo lo dice explícitamente.
  if (/^mantenimiento\b/i.test((o.equipoTipo ?? '').trim())) return 'mantenimiento';
  return 'reparacion';
}

/**
 * Orden → cita del mapa. `coordsCliente` es el respaldo cuando la orden no trae clienteLat/clienteLng
 * (se toma de clientes/{clienteId}). Devuelve null si la orden no tiene fecha de cita.
 *
 * Fix hallazgo QA 2026-10-01 §12:
 *  - `enStandby` se lee de la orden real.
 *  - Los timestamps se interpretan vía `aDate` (soporta Firestore Timestamp, string ISO, Date).
 *  - El campo `visita` propuesto (`enCaminoEn`/`enSitioEn`) sigue siendo opcional — no está en el tipo
 *    principal; mientras no exista, calcularProgreso cae a fases.
 */
export function citaDesdeOrden(
  o: OrdenServicio & { visita?: { enCaminoEn?: unknown; enSitioEn?: unknown }; esMantenimiento?: boolean },
  ahora: Date,
  extra: { coordsCliente?: { lat?: number; lng?: number } | null; standbyAbierto?: boolean } = {},
): CitaMapa | null {
  const fechaCita = aDate(o.fechaCita);
  if (!fechaCita) return null;
  const tipo = tipoDeOrden(o);
  // Standby real: OR entre `standby_piezas` abierto (callsite) y el campo `enStandby` del documento.
  // Si uno de los dos dice true, hay standby. Un caller que pase `false` por error (p. ej. un Map
  // vacío de standby_piezas) NO puede borrar un `enStandby=true` persistido en la orden.
  const standbyAbierto = extra.standbyAbierto === true || o.enStandby === true;
  const standbyDesde = aDate(o.standbyDesde);
  const historialFases: { fase: string; timestamp: Date }[] = [];
  for (const h of o.historialFases ?? []) {
    const ts = aDate(h.timestamp);
    if (ts) historialFases.push({ fase: h.fase, timestamp: ts });
  }
  const p = calcularProgreso({
    fase: o.fase,
    historialFases,
    visita: o.visita ? { enCaminoEn: aDate(o.visita.enCaminoEn), enSitioEn: aDate(o.visita.enSitioEn) } : undefined,
    estadoPago: (o as { estadoPago?: 'pendiente' | 'parcial' | 'completo' }).estadoPago,
    fechaCita,
    duracionMin: o.duracionMin,
    tipoServicio: tipo,
    standbyAbierto,
    standbyDesde,
  }, ahora);
  const propia = { lat: o.clienteLat, lng: o.clienteLng };
  const pos = tieneCoord(propia) ? propia : tieneCoord(extra.coordsCliente ?? null) ? extra.coordsCliente! : null;
  return {
    id: o.id, numero: o.numero, tecnicoId: o.tecnicoId || null, clienteNombre: o.clienteNombre,
    inicio: fechaCita, duracionMin: o.duracionMin, lat: pos?.lat, lng: pos?.lng,
    equipo: especialidadDe(o.equipoTipo), tipo, fase: o.fase, eliminada: o.eliminada,
    progreso: { indice: p.indice, completa: p.completa, cancelada: p.cancelada, desde: p.desde, garantia: p.garantia, standby: p.standby },
  };
}

/**
 * Personal → técnico del mapa. El equipo sale de la operaria asignada (`operariaNombre`) y, como
 * respaldo, de la referencia dada por Jorge (`equiposOperacion.ts`) SOLO cuando el emparejamiento
 * por nombre es UNÍVOCO.
 *
 * Fix revisión Codex 2026-10-02:
 *  - `findFirst` sobre un criterio laxo convertía ambiguos («Yoniel Miguel» → primer match «Yoniel» ∧
 *    «Miguel» entre partes) en mappings falsos. Ahora:
 *    1) match exacto normalizado (nombre completo o apodo singular),
 *    2) si no, nombre canónico de la referencia es prefijo exacto de todos sus tokens (ej. "Reyes
 *       Guzmán" vs "Reyes Guzmán Pérez" OK; "Yoniel Miguel" NO) y UNICO en la lista,
 *    3) si no, apodo exacto (multi-word compilado como frase: "Gata salvaje" matchea solo si el
 *       nombre contiene «gata salvaje», no «gata» o «salvaje» por separado).
 *  - Si hay >1 referencia candidata, se descarta y se marca `emparejado=false`.
 *  - Si no hay match, NO se inventa equipo ni se adivinan especialidades. `equipo` solo se setea
 *    desde una `operariaNombre` que iguale «Wila» o «Yohana» exacto / con sufijo (apellido).
 *  - El id del técnico es `uid` cuando existe; si no, el doc id de personal (solo para presentación
 *    — el caller decide si eso basta para escrituras).
 */
function matchReferencia(nombreNorm: string): typeof TECNICOS[number] | null {
  const partes = nombreNorm.split(/\s+/).filter(Boolean);
  const setPartes = new Set(partes);
  const frase = nombreNorm;
  const exactos = TECNICOS.filter(t => norm(t.nombre) === nombreNorm);
  if (exactos.length === 1) return exactos[0];
  if (exactos.length > 1) return null; // ambigüedad declarada

  const porTokens = TECNICOS.filter(t => {
    const refTokens = norm(t.nombre).split(/\s+/).filter(Boolean);
    // Todos los tokens del nombre canónico deben aparecer en el nombre del personal.
    return refTokens.length > 0 && refTokens.every(r => setPartes.has(r));
  });
  if (porTokens.length === 1) return porTokens[0];
  if (porTokens.length > 1) return null;

  // Apodos: cada apodo se compara como FRASE (puede tener espacios). Debe aparecer como subcadena
  // separada por bordes de palabra.
  const porApodo = TECNICOS.filter(t => {
    if (!t.apodos?.length) return false;
    return t.apodos.some(a => {
      const aNorm = norm(a);
      if (!aNorm) return false;
      const regex = new RegExp(`(^|\\s)${aNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      return regex.test(frase);
    });
  });
  if (porApodo.length === 1) return porApodo[0];
  return null;
}

export function tecnicoDesdePersonal(p: Personal): TecnicoMapa & { emparejado: boolean } {
  const nombreNorm = norm(p.nombre);
  const ref = matchReferencia(nombreNorm);
  const equipo: 'A' | 'B' | null = equipoDeOperaria(p.operariaNombre) ?? (ref?.equipo ?? null);
  const propia = especialidadDe(p.especialidad);
  const repara: Especialidad[] = ref?.repara ?? (propia ? [propia] : []);
  return {
    // @safe-tecnicoid-id: `TecnicoMapa.id` es siempre el valor que las rules validan contra `auth.uid`
    // (campo `tecnicoId` en `ordenes_servicio`). Preferimos `uid`; si no existe, caemos a `id` del
    // doc `personal` SOLO para presentación — el caller NO debe usar este id para escritura hasta
    // confirmar que ese personal tiene uid.
    id: p.uid || p.id,
    nombre: p.nombre,
    equipo,
    repara,
    soloMantenimiento: ref?.soloMantenimiento,
    contratista: ref?.contratista,
    activo: p.activo !== false,
    color: p.color,
    emparejado: !!ref,
  };
}

/**
 * Fix hallazgo QA 2026-10-01 §12: valida timestamp antes de convertir. Si el GPS trae un timestamp
 * no-Date (Firestore Timestamp, string ISO), lo normalizamos; si no se puede, el callsite decidirá
 * (`senalGPS` ya trata inválido como `sin_gps`).
 */
export function posicionDesdeGPS(u: UbicacionVehiculo): PosicionGPS {
  const ts = aDate(u.timestamp);
  return {
    tecnicoId: u.tecnicoId,
    lat: u.lat,
    lng: u.lng,
    timestamp: ts ?? new Date(NaN),
    enMovimiento: u.enMovimiento,
  };
}
