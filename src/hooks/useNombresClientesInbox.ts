import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { normalizarTelefono } from '../services/clientes.service';

/** Suscripciones por grupos de teléfonos visibles, sin descargar toda la cartera. */
export function useNombresClientesInbox(telefonos: string[], usuarioId?: string) {
  const clave = JSON.stringify([...new Set(telefonos.map(normalizarTelefono).filter(Boolean))].sort());
  const [resultado, setResultado] = useState<{ usuarioId?: string; clave: string; nombres: Record<string, string> }>({ clave: '', nombres: {} });
  useEffect(() => {
    if (!usuarioId) return;
    const numeros = JSON.parse(clave) as string[];
    let activo = true;
    const grupos: Record<string, string>[] = [];
    const publicar = () => { if (activo) setResultado({ usuarioId, clave, nombres: Object.assign({}, ...grupos) }); };
    publicar();
    const cancelar: (() => void)[] = [];
    for (let i = 0; i < numeros.length; i += 30) {
      const grupo = i / 30;
      cancelar.push(onSnapshot(query(collection(db, 'clientes'), where('telefonoNormalizado', 'in', numeros.slice(i, i + 30))), snap => {
        grupos[grupo] = {};
        for (const doc of snap.docs) {
          const c = doc.data();
          if (c.eliminado !== true && typeof c.nombre === 'string' && c.nombre.trim() && typeof c.telefonoNormalizado === 'string') {
            grupos[grupo][c.telefonoNormalizado] ??= c.nombre.trim();
          }
        }
        publicar();
      }, () => { grupos[grupo] = {}; publicar(); }));
    }
    return () => { activo = false; cancelar.forEach(fn => fn()); };
  }, [clave, usuarioId]);
  if (resultado.usuarioId !== usuarioId || resultado.clave !== clave) return {};
  return Object.fromEntries(telefonos.map(telefono => [telefono, resultado.nombres[normalizarTelefono(telefono)] ?? '']));
}
