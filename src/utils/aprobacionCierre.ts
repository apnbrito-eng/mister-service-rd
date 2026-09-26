/** Mantiene el cierre técnico alineado con ordenAprobada() en Firestore. */
export function tieneAprobacionCierre(orden: {
  estadoAprobacion?: string;
  propuestaCrmRevision?: unknown;
  propuestaCrmAprobada?: unknown;
}): boolean {
  return orden.estadoAprobacion === 'aprobado' &&
    (orden.propuestaCrmRevision == null ||
      orden.propuestaCrmRevision === orden.propuestaCrmAprobada);
}
