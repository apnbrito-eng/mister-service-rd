import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Cliente } from '../types';
import { parseCliente } from '../utils';

/**
 * Suscripción real-time a la colección `clientes`.
 *
 * Devuelve la lista parseada (vía `parseCliente`, que aplica defaults
 * defensivos como `tipo='particular'` para clientes legacy) ordenada
 * alfabéticamente. También retorna un `Set<string>` con los ids de
 * clientes que NO tienen `tipo` definido en el doc raw — para que la UI
 * muestre el badge "Cliente sin tipo definido — verificar" (G2 del
 * sprint Conduces SIBS C3b).
 *
 * **Anti-misuse — usar SIEMPRE en el componente padre de la página**:
 * el listener vive acá y la lista se pasa por props a hijos. NO instanciar
 * este hook dentro de un modal/drawer hijo cuando el padre ya está
 * suscrito — duplicarías el listener y los costos de Firestore.
 *
 * No usar cuando ya tenés `useOrdenCreateForm` en el árbol — duplica el
 * listener.
 */
export function useClientesEnVivo(): {
  clientes: Cliente[];
  /** IDs de clientes cuyo doc raw NO tenía `tipo` (legacy migración pendiente). */
  clientesSinTipoDefinido: Set<string>;
  loading: boolean;
} {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clientesSinTipoDefinido, setClientesSinTipoDefinido] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clientes'), (snap) => {
      const sinTipo = new Set<string>();
      const lista = snap.docs.map(d => {
        const raw = d.data() as Record<string, unknown>;
        if (raw.tipo !== 'particular' && raw.tipo !== 'b2b') {
          // No tenía tipo definido en el doc; parseCliente le pone 'particular'
          // como default — guardamos el id para que la UI muestre el badge.
          sinTipo.add(d.id);
        }
        return parseCliente(d.id, raw);
      });
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      setClientes(lista);
      setClientesSinTipoDefinido(sinTipo);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { clientes, clientesSinTipoDefinido, loading };
}
