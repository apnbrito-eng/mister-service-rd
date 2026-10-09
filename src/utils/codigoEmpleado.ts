/** Identificador administrativo manual; independiente de UID, login y cédula. */
export function normalizarCodigoEmpleado(valor: string | undefined): string | undefined {
  const codigo = valor?.trim();
  if (!codigo) return undefined;
  if (codigo.length > 30 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(codigo)) {
    throw new Error('El código admite hasta 30 letras, números, puntos, guiones o guiones bajos.');
  }
  return codigo;
}
