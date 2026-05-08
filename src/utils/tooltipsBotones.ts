import type { OrdenServicio } from '../types';

/**
 * Helpers puros que devuelven la razón humana por la cual un botón crítico
 * del flujo de orden está deshabilitado. Si el botón está habilitado o
 * no hay razón conocida, devuelven `null` (el caller no muestra tooltip
 * o usa el `title` por defecto del componente).
 *
 * No leen ni escriben a Firestore. Reciben el shape ya cargado y los
 * estados internos del componente (foto tomada, GPS denegado, etc.).
 *
 * Patrón establecido por SPRINT-113b: la lógica de gating sigue
 * intacta en cada componente; estos helpers sólo traducen el estado a
 * un texto humano para el `title` del botón.
 */

/**
 * Razón humana del disabled de "Iniciar chequeo".
 *
 * Reglas conocidas:
 *  - `procesando` true → estamos en medio del flujo (subiendo foto/GPS).
 *  - `permisoGps === 'denied'` → permiso denegado a nivel de navegador.
 */
export function razonIniciarChequeoDisabled(args: {
  procesando: boolean;
  permisoGps: 'granted' | 'denied' | 'prompt' | 'unknown';
}): string | null {
  if (args.procesando) return 'Iniciando chequeo… esperá unos segundos.';
  if (args.permisoGps === 'denied') {
    return 'Permiso de ubicación bloqueado. Tocá el candado en la barra de direcciones para permitir GPS.';
  }
  return null;
}

/**
 * Razón humana del disabled de "Cerrar servicio".
 *
 * Reglas conocidas (todas vienen del estado del wizard, no del doc):
 *  - falta foto del cierre.
 *  - falta marcar "equipo funciona".
 *  - falta marcar "cliente satisfecho".
 *  - falta marcar "revisó conexiones".
 *  - eligió "usé piezas" pero no agregó ninguna pieza.
 *
 * Si hay varias razones, devuelve la primera no resuelta en el orden de
 * arriba — coincide con cómo el técnico ve el wizard de arriba a abajo.
 */
export function razonCerrarServicioDisabled(args: {
  saving: boolean;
  fotoTomada: boolean;
  equipoFunciona: 'si' | 'no' | null;
  clienteSatisfecho: 'si' | 'no' | null;
  revisoConexiones: 'si' | 'no' | null;
  usoPiezas: 'si' | 'no' | null;
  cantidadPiezas: number;
}): string | null {
  if (args.saving) return 'Cerrando servicio… esperá un momento.';
  if (!args.fotoTomada) return 'Falta tomar la foto del cierre.';
  if (args.equipoFunciona === null) return 'Falta marcar si el equipo funciona.';
  if (args.clienteSatisfecho === null) return 'Falta marcar si el cliente quedó satisfecho.';
  if (args.revisoConexiones === null) return 'Falta marcar si revisaste las conexiones.';
  if (args.usoPiezas === null) return 'Indicá si usaste piezas o elegí "No usé piezas".';
  if (args.usoPiezas === 'si' && args.cantidadPiezas === 0) {
    return 'Agregá al menos una pieza o cambiá a "No usé piezas".';
  }
  return null;
}

/**
 * Razón humana del disabled de "Enviar a conduce / facturación".
 *
 * Reglas:
 *  - orden ya enviada o ya facturada → mostrar el chip de éxito (caller
 *    suele rendererizar otro componente, pero por completitud).
 *  - falta al menos un pago registrado (`montoPagado <= 0`).
 */
export function razonEnviarFacturacionDisabled(orden: Pick<
  OrdenServicio,
  'enviadaAFacturacion' | 'facturada' | 'montoPagado'
>): string | null {
  if (orden.facturada) return 'Esta orden ya tiene conduce emitido.';
  if (orden.enviadaAFacturacion) return 'Ya enviada a conduce. Esperá el comprobante.';
  if (Number(orden.montoPagado || 0) <= 0) {
    return 'Necesitás registrar al menos un pago antes de enviar a conduce.';
  }
  return null;
}
