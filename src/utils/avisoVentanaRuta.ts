/**
 * Helper puro (sin dependencias Firebase) para decidir si un aviso de
 * ventana horaria del Dashboard está dentro de su ventana de 15 min.
 *
 * Decisión Jorge (chat 09/10/2026, plan integral §alertas revisado):
 *   "Los avisos urgentes de rutas en Resumen de hoy duran 15 minutos o
 *   hasta completar la tarea; el pendiente continúa visible en su módulo.
 *   Mantener 9-10 para organizar rutas y 11-12 para avisar a clientes."
 *
 * Se usa desde `recordatorios.service.ts` (re-exportado) y es consumido
 * por `RecordatorioBanner.tsx`. Vive aparte para que las pruebas
 * unitarias con `node:test` NO carguen Firebase (que requiere Vite env).
 */
import type { TipoRecordatorio } from '../types';
import { componentesRD } from './mapaFechas';

const DURACION_AVISO_MS = 15 * 60 * 1000;

/**
 * Ventana de trabajo completa y 15 minutos posteriores al vencimiento.
 * Ventanas duras — ampliar requiere nueva aprobación de Jorge.
 */
export function avisoDentroDeVentana(tipo: TipoRecordatorio, ahora: Date): boolean {
  const horaInicio = tipo === 'ruta_manana' ? 9 : 11;
  const { hora, minuto } = componentesRD(ahora);
  const ms = ((hora - horaInicio) * 60 + minuto) * 60_000
    + ahora.getUTCSeconds() * 1000 + ahora.getUTCMilliseconds();
  return ms >= 0 && ms < 60 * 60 * 1000 + DURACION_AVISO_MS;
}
