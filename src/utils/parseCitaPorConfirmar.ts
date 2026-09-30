import type { CitaPorConfirmar, GarantiaOrigen } from '../types';

type RawCita = Record<string, unknown> & {
  createdAt?: { toDate?: () => Date };
  fechaSolicitada?: { toDate?: () => Date };
};

function s(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Parser puro del doc `citas_por_confirmar` a `CitaPorConfirmar`.
 *
 * Extraído del listener de `src/pages/Citas.tsx` para poder testear la lectura
 * sin acoplarnos a Firebase ni React. La regla de oro: cada campo que se
 * persiste desde `api/_lib/citaPublica.ts` debe leerse acá. Si falta uno, el
 * modal "Confirmar y Agendar" arranca sin datos y la promesa al cliente se
 * rompe silenciosamente (patrón P-009 aplicado a esta colección).
 *
 * Diseñado para ser tolerante a docs viejos que no traen los campos nuevos —
 * cada campo opcional retorna `undefined` en ese caso.
 */
export function parseCitaPorConfirmar(id: string, raw: RawCita): CitaPorConfirmar {
  return {
    id,
    clienteNombre: (raw.clienteNombre as string) || '',
    telefono: (raw.telefono as string) || (raw.clienteTelefono as string) || '',
    servicio: (raw.servicio as string) || '',
    falla: raw.falla as string | undefined,
    horarioSolicitado: raw.horarioSolicitado as string | undefined,
    origen: raw.origen as string | undefined,
    ordenNumero: raw.ordenNumero as string | undefined,
    fotoEquipoUrl: raw.fotoEquipoUrl as string | undefined,
    clienteEmail: raw.clienteEmail as string | undefined,
    clienteDireccion: raw.clienteDireccion as string | undefined,
    clienteReferencia: raw.clienteReferencia as string | undefined,
    clienteSector: raw.clienteSector as string | undefined,
    clienteLat: typeof raw.clienteLat === 'number' ? raw.clienteLat : undefined,
    clienteLng: typeof raw.clienteLng === 'number' ? raw.clienteLng : undefined,
    equipoTipo: raw.equipoTipo as string | undefined,
    equipoMarca: raw.equipoMarca as string | undefined,
    equipoModelo: raw.equipoModelo as string | undefined,
    equipoTipoMotor:
      raw.equipoTipoMotor === 'torre' || raw.equipoTipoMotor === 'individual'
        ? (raw.equipoTipoMotor as 'torre' | 'individual')
        : undefined,
    citaIdProvisional: s(raw.citaIdProvisional),
    comoNosConocio: s(raw.comoNosConocio),
    calendarioId: raw.calendarioId as string | undefined,
    calendarioNombre: raw.calendarioNombre as string | undefined,
    // 2026-09-29 sprint calendarios/solicitudes — campos persistidos por
    // `api/_lib/citaPublica.ts` que antes se descartaban.
    asignadoId: s(raw.asignadoId),
    asignadoNombre: s(raw.asignadoNombre),
    equipoId: s(raw.equipoId),
    responsableAtencionId: s(raw.responsableAtencionId),
    repartoPendiente: raw.repartoPendiente === true ? true : undefined,
    fechaSolicitada: raw.fechaSolicitada?.toDate?.() || undefined,
    horaSolicitada: raw.horaSolicitada as string | undefined,
    tipo: raw.tipo as 'normal' | 'garantia' | undefined,
    esGarantia: raw.esGarantia === true,
    referenciaFacturaId: raw.referenciaFacturaId as string | undefined,
    referenciaConduce: raw.referenciaConduce as string | undefined,
    referenciaOrdenId: raw.referenciaOrdenId as string | undefined,
    tecnicoOriginalUid: raw.tecnicoOriginalUid as string | undefined,
    tecnicoOriginalNombre: raw.tecnicoOriginalNombre as string | undefined,
    descripcionProblema: raw.descripcionProblema as string | undefined,
    origenGarantia: raw.origenGarantia as GarantiaOrigen | undefined,
    whatsappAsignado: raw.whatsappAsignado as string | undefined,
    whatsappAsignadoNombre: raw.whatsappAsignadoNombre as string | undefined,
    telefonoNormalizado: s(raw.telefonoNormalizado),
    camposPersonalizados:
      raw.camposPersonalizados &&
      typeof raw.camposPersonalizados === 'object' &&
      !Array.isArray(raw.camposPersonalizados)
        ? (raw.camposPersonalizados as Record<string, string>)
        : undefined,
    createdAt: raw.createdAt?.toDate?.() || new Date(),
  };
}
