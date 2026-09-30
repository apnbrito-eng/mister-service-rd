/** Identidad histórica: ID explícito manda; legacy solo UID exige un vínculo único.
 * Incluye personal inactivo: desactivar hoy no borra la asistencia anterior.
 */
export function personalIdDePonche(ponche: { personalId?: string; personalUid?: string }, personal: Array<{ id: string; uid?: string }>): string | null {
  if (ponche.personalId) return ponche.personalId;
  if (!ponche.personalUid) return null;
  const candidatos = personal.filter(p => p.uid === ponche.personalUid);
  return candidatos.length === 1 ? candidatos[0].id : null;
}

/** Dominios distintos evitan fusionar UID ambiguo con un documento homónimo. */
export function claveIdentidadPonche(ponche: { id: string; personalId?: string; personalUid?: string }, personal: Array<{ id: string; uid?: string }>): string {
  const id = personalIdDePonche(ponche, personal);
  if (id) return `personal:${id}`;
  // Sin resolución única no inferir una pareja entrada/salida.
  return `sin-resolver:${ponche.id}`;
}
