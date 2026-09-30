import type { CitaPorConfirmar, OrdenServicio } from '../types';

/**
 * Construye el sub-objeto `orden.metadatosCita` desde una `CitaPorConfirmar`.
 *
 * Preserva el origen del lead, el técnico captador del calendario público
 * (aunque la oficina cambie el técnico final), el equipo y responsable del
 * canal WhatsApp, y los identificadores necesarios para atribuir marketing
 * o auditar la conversión de la cita.
 *
 * Retorna un objeto sin `undefined` para no violar la regla de Firestore
 * (rechaza campos undefined en `addDoc`/`setDoc`). Si la cita no tiene
 * ningún metadato relevante, retorna `{}` — el caller decide si
 * persistirlo o no.
 *
 * NO infiere datos que no vengan en la cita: si la cita no trae
 * `calendarioId`, la orden no obtiene `metadatosCita.calendarioId`.
 * Sin invenciones: cada campo persiste solo si viene del lead real.
 */
export function construirMetadatosCita(
  cita: CitaPorConfirmar,
): NonNullable<OrdenServicio['metadatosCita']> {
  const meta: NonNullable<OrdenServicio['metadatosCita']> = {};

  if (cita.comoNosConocio) meta.comoNosConocio = cita.comoNosConocio;
  if (
    cita.camposPersonalizados &&
    Object.keys(cita.camposPersonalizados).length > 0
  ) {
    meta.camposPersonalizados = cita.camposPersonalizados;
  }
  if (cita.whatsappAsignado) meta.whatsappAsignado = cita.whatsappAsignado;
  if (cita.whatsappAsignadoNombre) meta.whatsappAsignadoNombre = cita.whatsappAsignadoNombre;
  meta.citaOrigenId = cita.id;

  // Origen normalizado: calendario público tiene precedencia sobre el
  // origen genérico del formulario (el calendario ES un formulario público,
  // pero el flujo del cliente es distinto — necesitamos distinguirlos).
  if (cita.calendarioId) {
    meta.origen = 'calendario_publico';
    meta.calendarioId = cita.calendarioId;
    if (cita.calendarioNombre) meta.calendarioNombre = cita.calendarioNombre;
  } else if (cita.origen === 'formulario_publico') {
    meta.origen = 'formulario_publico';
  } else if (cita.origen === 'oficina') {
    meta.origen = 'oficina';
  } else if (cita.esGarantia) {
    meta.origen = 'garantia';
  }

  if (cita.asignadoId) {
    meta.asignadoCaptadorId = cita.asignadoId;
    if (cita.asignadoNombre) meta.asignadoCaptadorNombre = cita.asignadoNombre;
  }
  if (cita.equipoId) meta.equipoId = cita.equipoId;
  if (cita.responsableAtencionId) meta.responsableAtencionId = cita.responsableAtencionId;

  return meta;
}
