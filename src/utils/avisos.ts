/**
 * Wrappers del toaster (`react-hot-toast`) alineados con el catálogo
 * semántico de severidad del Lote A (auditoría alertas 2026-10-08).
 *
 * Propósito:
 *  - Deduplicación por `operacionId`: un error que se repite en reintentos
 *    automáticos NO acumula toasts; el llamante pasa un `id` estable y
 *    react-hot-toast reemplaza en vez de apilar.
 *  - Patrón loading→resultado: `avisoCargando` devuelve el `id` para que
 *    el llamante lo reemplace con `avisoExito/Error`. El `loading` persiste
 *    hasta que se resuelva o falle; no se oculta automáticamente a los 4s.
 *  - Mensajes de éxito usan la duración corta por default (3s); los errores
 *    persisten hasta que el usuario los descarte (botón "Cerrar" renderizado
 *    por `Toaster` en `App.tsx`).
 *
 * Convención:
 *  - `operacionId` corto, estable, descriptivo:  `marcar-leida`,
 *    `feedback-no-telefono`, `enviar-mensaje`, `migracion-cartera`.
 *  - NO usar como `id` identificadores de instancia (p. ej. ordenId) salvo
 *    cuando el mensaje depende de ese objeto Y conviene reemplazar el
 *    toast anterior del mismo objeto.
 */
import toast from 'react-hot-toast';

interface AvisoOptions {
  /**
   * ID estable para deduplicar. Si se repite la misma operación en
   * reintentos, el toast se reemplaza en vez de apilarse.
   */
  operacionId?: string;
}

export function avisoExito(mensaje: string, opts: AvisoOptions = {}): string {
  return toast.success(mensaje, { id: opts.operacionId });
}

export function avisoError(mensaje: string, opts: AvisoOptions = {}): string {
  return toast.error(mensaje, { id: opts.operacionId });
}

/**
 * Devuelve el `id` del toast loading para que el llamante lo reemplace
 * con `avisoExito/Error` cuando la operación resuelva o falle.
 *
 * Patrón recomendado:
 * ```ts
 * const id = avisoCargando('Guardando…');
 * try {
 *   await persistir();
 *   avisoExito('Guardado', { operacionId: id });
 * } catch (err) {
 *   avisoError(err.message, { operacionId: id });
 * }
 * ```
 */
export function avisoCargando(mensaje: string, opts: AvisoOptions = {}): string {
  // El llamante debe reemplazarlo. Nunca se oculta solo.
  return toast.loading(mensaje, { id: opts.operacionId });
}

/**
 * Descarta explícitamente un aviso. Útil cuando una operación se cancela
 * antes de resolver y queremos limpiar el loading.
 */
export function descartarAviso(operacionId: string): void {
  toast.dismiss(operacionId);
}
