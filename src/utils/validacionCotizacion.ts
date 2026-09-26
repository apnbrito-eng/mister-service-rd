/** Validación compartida del formulario antes de crear o modificar una cotización. */
export function errorCotizacion(cliente: string, items: readonly { descripcion: string; cantidad: number; precio: number }[]): string | null {
  if (!cliente.trim()) return 'Cliente es requerido';
  if (!items.length) return 'Agrega al menos un item';
  if (items.some(i => !i.descripcion.trim())) return 'Completa la descripción de todos los items';
  if (items.some(i => !Number.isInteger(i.cantidad) || i.cantidad < 1 || !Number.isFinite(i.precio) || i.precio < 0)) {
    return 'Revisa las cantidades y los precios: no pueden ser negativos y la cantidad debe ser un entero mayor que cero.';
  }
  if (!Number.isFinite(items.reduce((total, i) => total + i.cantidad * i.precio, 0))) return 'El importe total excede el límite permitido.';
  return null;
}
