/** Mantiene el cierre técnico alineado con ordenAprobada() en Firestore. */
export function tieneAprobacionCierre(orden: {
  estadoAprobacion?: string;
  presupuestoEstado?: string;
  soloChequeo?: boolean;
  propuestaCrmRevision?: unknown;
  propuestaCrmAprobada?: unknown;
}): boolean {
  return orden.estadoAprobacion === 'aprobado' &&
    (orden.soloChequeo === true || !orden.presupuestoEstado || orden.presupuestoEstado === 'aceptado') &&
    (orden.propuestaCrmRevision == null ||
      orden.propuestaCrmRevision === orden.propuestaCrmAprobada);
}
