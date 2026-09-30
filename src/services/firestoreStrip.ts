/**
 * Helpers de limpieza de payloads Firestore compartidos entre servicios.
 *
 * Vive en `src/services/` (misma carpeta que los servicios que lo consumen)
 * para que el cazador P-020 lo escanee al detectar nuevos helpers de este
 * shape en el módulo.
 *
 * NO importa `firebase/firestore` para que sea consumible desde tests Node
 * sin cargar `firebase/config` (que exige env vars Vite). El guard de
 * prototipo funciona igual porque los sentinels/instancias de Firestore
 * llegan al helper por parámetro — sólo necesitamos comparar `getPrototypeOf`
 * contra `Object.prototype`/`null`.
 */

/**
 * Strip recursivo de `undefined` de un payload destinado a Firestore.
 *
 * P-020 (postmortem 2026-05-22): solo recursa en objetos PLANOS (`{}` literal
 * o `Object.create(null)`) y en ARRAYS. Instancias de clase (`Date`,
 * `Timestamp`, `GeoPoint`, `DocumentReference`) y sentinels FieldValue
 * (`serverTimestamp`, `increment`, etc.) se devuelven INTACTAS por
 * referencia. Recursar sobre ellas las reconstruye como mapas planos vacíos
 * y destruye el sentinel — los contadores quedan como `{operand: N}` y las
 * fechas como `{}` en Firestore, y el bug es silencioso.
 *
 * Arrays: iteramos elementos, quitamos `undefined` (Firestore también los
 * rechaza dentro de arrays) y recursamos en cada elemento. Sin esto, un
 * `historialFases: [..., undefined]` o un `[..., { nota: undefined }]` se
 * colaba y Firestore rechazaba el write completo.
 */
export function stripUndefinedProfundo(valor: unknown): unknown {
  if (valor === undefined || valor === null) return valor;
  if (Array.isArray(valor)) {
    const out: unknown[] = [];
    for (const item of valor) {
      if (item === undefined) continue;
      const limpio = stripUndefinedProfundo(item);
      if (limpio === undefined) continue;
      out.push(limpio);
    }
    return out;
  }
  if (typeof valor !== 'object') return valor;
  const proto = Object.getPrototypeOf(valor as object);
  if (proto !== Object.prototype && proto !== null) return valor;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (v === undefined) continue;
    const limpio = stripUndefinedProfundo(v);
    if (limpio === undefined) continue;
    out[k] = limpio;
  }
  return out;
}
