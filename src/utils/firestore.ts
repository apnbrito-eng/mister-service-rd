import { Timestamp } from 'firebase/firestore';

/**
 * Sanitiza un payload antes de escribirlo a Firestore.
 *
 * Firestore rechaza campos con valor `undefined` (a cualquier nivel de
 * anidamiento) y lanza el error
 * `Unsupported field value: undefined (found in field …)`. Sin embargo,
 * sí acepta `null`. Este helper recorre el valor recursivamente y elimina
 * todas las propiedades `undefined`, preservando arrays, objetos
 * anidados, `Date` y `Timestamp` (Firestore).
 *
 * Úsalo siempre que un payload pueda contener campos opcionales que
 * podrían quedar como `undefined` (típico cuando el editor admin alterna
 * entre tipos de campo y limpia propiedades dependientes).
 */
export function stripUndefined<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as unknown as T;
  }
  // Preservar tipos especiales (Date, Timestamp, otros con prototipo propio)
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}
