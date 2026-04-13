import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/config';

/** Genera siguiente número de orden atómicamente: OS-0001, OS-0002... */
export async function siguienteNumeroOrden(): Promise<string> {
  const contadorRef = doc(db, 'config', 'contadores');

  const nuevoNumero = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(contadorRef);
    const actual = snap.exists() ? (snap.data().ultimaOrden ?? 0) : 0;
    const siguiente = actual + 1;
    transaction.set(contadorRef, { ...snap.data(), ultimaOrden: siguiente }, { merge: true });
    return siguiente;
  });

  return `OS-${String(nuevoNumero).padStart(4, '0')}`;
}

/** Genera siguiente número de cotización atómicamente: QT-00001, QT-00002... */
export async function siguienteNumeroCotizacion(): Promise<string> {
  const contadorRef = doc(db, 'config', 'contadores');

  const nuevoNumero = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(contadorRef);
    const actual = snap.exists() ? (snap.data().ultimaCotizacion ?? 0) : 0;
    const siguiente = actual + 1;
    transaction.set(contadorRef, { ...snap.data(), ultimaCotizacion: siguiente }, { merge: true });
    return siguiente;
  });

  return `QT-${String(nuevoNumero).padStart(5, '0')}`;
}

/** Genera siguiente número de factura atómicamente: FAC-00001, FAC-00002... */
export async function siguienteNumeroFactura(): Promise<string> {
  const contadorRef = doc(db, 'config', 'contadores');

  const nuevoNumero = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(contadorRef);
    const actual = snap.exists() ? (snap.data().ultimaFactura ?? 0) : 0;
    const siguiente = actual + 1;
    transaction.set(contadorRef, { ...snap.data(), ultimaFactura: siguiente }, { merge: true });
    return siguiente;
  });

  return `FAC-${String(nuevoNumero).padStart(5, '0')}`;
}
