import type { Firestore, Transaction, Timestamp } from 'firebase-admin/firestore';
import { prepararLiberacionComision, type PoliticaCobroComision } from '../../src/utils/comisionCobro.js';

/** Preparar durante las lecturas de la transacción; no consulta ni migra comisiones históricas. */
export async function leerComisionRetenida(tx: Transaction, db: Firestore, ordenId: string) {
  const ref = db.doc(`comisiones/orden_${encodeURIComponent(ordenId)}`);
  const snap = await tx.get(ref);
  const datos = snap.data();
  if (datos && datos.ordenId !== ordenId) throw new Error('Comisión canónica asociada a otra orden; requiere revisión');
  return { ref, datos };
}

/** Invocar solo tras todas las lecturas y dentro de la misma transacción que guarda el cobro. */
export function liberarComisionPorCobro(
  tx: Transaction,
  comision: Awaited<ReturnType<typeof leerComisionRetenida>>,
  ordenActualizada: Record<string, unknown>,
  ahora: Timestamp,
  politica: PoliticaCobroComision,
): boolean {
  const cambio = prepararLiberacionComision(comision.datos, ordenActualizada, ahora, ahora.toDate(), politica);
  if (!cambio) return false;
  tx.update(comision.ref, cambio);
  return true;
}
