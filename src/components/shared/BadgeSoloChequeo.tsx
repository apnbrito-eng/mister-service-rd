import { AlertTriangle } from 'lucide-react';
import { OrdenServicio } from '../../types';

/**
 * SPRINT-181 (2026-05-18) — Badge "Solo chequeo · sin reparación" unificado.
 *
 * Antes: la lógica `orden.tipoCierre === 'solo_chequeo' || orden.soloChequeo === true`
 * + el estilo amarillo prominente vivían inline en `OrdenResumenLectura.tsx:92-97`
 * (fila expandida de /admin/facturas). Faltaba en los headers del modal de
 * detalle de orden (`OrdenDetailModal`) y del modal de emisión de conduce
 * (`ProcesarFacturacionModal`). QA E2E 2026-05-16 lo detectó: la coordinadora
 * abría el modal y solo inferia por texto.
 *
 * Ahora: componente compartido. Una sola fuente de verdad para la lógica de
 * detección + el estilo. Acepta `orden` directamente y se renderea solo si
 * aplica (null si no es solo chequeo).
 *
 * Tamaño: por defecto compact (text-xs, py-1) — apto para headers. Pasar
 * `prominent` para la variante más visible que se usa en la fila de factura.
 */
export default function BadgeSoloChequeo({
  orden,
  prominent = false,
}: {
  orden: Pick<OrdenServicio, 'tipoCierre' | 'soloChequeo'>;
  prominent?: boolean;
}) {
  const esSoloChequeo =
    orden.tipoCierre === 'solo_chequeo' || orden.soloChequeo === true;
  if (!esSoloChequeo) return null;

  if (prominent) {
    return (
      <span className="inline-flex items-center gap-1.5 bg-amber-100 border border-amber-300 text-amber-900 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">
        <AlertTriangle size={14} />
        Solo chequeo · sin reparación
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 bg-amber-100 border border-amber-300 text-amber-900 px-2 py-1 rounded-full text-xs font-semibold uppercase tracking-wide">
      <AlertTriangle size={12} />
      Solo chequeo
    </span>
  );
}
