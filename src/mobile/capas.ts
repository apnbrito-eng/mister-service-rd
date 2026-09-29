/** Capas temporales consumen Atrás antes de cambiar de ruta o minimizar Android. */
const cierres: Array<() => void> = [];

export function registrarCierreCapa(cerrar: () => void): () => void {
  cierres.push(cerrar);
  return () => {
    const indice = cierres.lastIndexOf(cerrar);
    if (indice >= 0) cierres.splice(indice, 1);
  };
}

export function cerrarCapaSuperior(): boolean {
  const cerrar = cierres.pop();
  if (!cerrar) return false;
  cerrar();
  return true;
}
