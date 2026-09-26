export const categoriasEvaluacion = ['puntualidad', 'trato', 'claridad', 'calidad'] as const;
export type EvaluacionServicio = Record<typeof categoriasEvaluacion[number], number>;
export function validarEvaluacion(value: unknown): EvaluacionServicio | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).length !== categoriasEvaluacion.length) return null;
  const resultado = {} as EvaluacionServicio;
  for (const categoria of categoriasEvaluacion) {
    const score = obj[categoria];
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) return null;
    resultado[categoria] = score;
  }
  return resultado;
}
