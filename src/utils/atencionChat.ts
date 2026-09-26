/** Ownership of the conversation is independent of customer portfolio and order stage. */
export interface AtencionChat {
  version: number;
  responsableId: string | null;
  responsableNombre: string | null;
  pendiente: boolean;
  traspaso: {
    destinoId: string;
    destinoNombre: string;
    motivo: string;
    solicitadoPor: string;
  } | null;
}
export type AccionAtencion =
  | "tomar"
  | "traspasar"
  | "transferir"
  | "aceptar"
  | "cancelar"
  | "resolver"
  | "pendiente";
export function cambiarAtencion(
  actual: AtencionChat,
  actor: { uid: string; nombre: string; supervisor: boolean },
  accion: AccionAtencion,
  destino?: { uid: string; nombre: string },
  motivo = "",
): AtencionChat {
  const siguiente = { ...actual, version: actual.version + 1 };
  const responsable = actual.responsableId === actor.uid;
  if (accion === "aceptar") {
    if (!actual.traspaso || actual.traspaso.destinoId !== actor.uid)
      throw new Error("Solo la persona destinataria puede recibir este chat.");
    return {
      ...siguiente,
      responsableId: actor.uid,
      responsableNombre: actor.nombre,
      traspaso: null,
    };
  }
  if (accion === "tomar") {
    if (actual.responsableId || actual.traspaso)
      throw new Error("Este chat ya tiene responsable. Solicita un traspaso.");
    return {
      ...siguiente,
      responsableId: actor.uid,
      responsableNombre: actor.nombre,
    };
  }
  if (!responsable && !actor.supervisor)
    throw new Error(
      "Esta acción corresponde a la responsable del chat o a supervisión.",
    );
  if (accion === "transferir") {
    if (!destino || destino.uid === actual.responsableId || !motivo.trim()) throw new Error("Selecciona otra responsable e indica lo que queda pendiente.");
    return { ...siguiente, responsableId: destino.uid, responsableNombre: destino.nombre, traspaso: null, pendiente: true };
  }
  if (accion === "traspasar") {
    if (actual.traspaso) throw new Error("Ya existe un traspaso pendiente.");
    if (!destino || destino.uid === actual.responsableId || !motivo.trim())
      throw new Error(
        "Selecciona otra responsable e indica lo que queda pendiente.",
      );
    return {
      ...siguiente,
      traspaso: {
        destinoId: destino.uid,
        destinoNombre: destino.nombre,
        motivo: motivo.trim(),
        solicitadoPor: actor.uid,
      },
    };
  }
  if (accion === "cancelar") {
    if (!actual.traspaso) throw new Error("No hay traspaso pendiente.");
    return { ...siguiente, traspaso: null };
  }
  if (accion === "resolver" || accion === "pendiente")
    return { ...siguiente, pendiente: accion === "pendiente" };
  throw new Error("Acción desconocida.");
}
