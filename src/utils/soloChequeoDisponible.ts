/** Cerrado es válido para seguimiento comercial; cancelado/eliminado detienen la gestión. */
export function ordenVigenteParaChequeo(orden: { eliminada?: unknown; fase?: unknown } | undefined): boolean {
  return !!orden && !orden.eliminada && orden.fase !== 'cancelado';
}
export function soloChequeoDisponible(orden: { eliminada?: unknown; fase?: unknown; soloChequeo?: unknown } | undefined): boolean {
  return ordenVigenteParaChequeo(orden) && orden?.soloChequeo === true;
}
