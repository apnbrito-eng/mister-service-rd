/**
 * Helper compartido para resolver la lista de modelos disponibles para un
 * tipo de equipo dado, leyendo del catálogo configurable que vive en
 * `config_web/sitio.modelosPorTipoEquipo`.
 *
 * Pensado para usarse desde:
 *   - `FormularioAgendarPublico` (form público `/agendar`).
 *   - `OrdenCreateModal` (modal interno "Crear Orden de Servicio").
 *
 * Reglas:
 *   - Si el catálogo no está cargado o el tipo no existe en él → `[]`
 *     (el caller renderiza input texto libre).
 *   - Si el tipo existe pero su lista está vacía → `[]` (mismo comportamiento).
 *   - Si el tipo tiene modelos definidos → la lista exacta del catálogo
 *     (orden preservado, sin re-ordenar — el admin lo controla en
 *     `/admin/configuracion`).
 */
export function obtenerModelosDeTipo(
  tipoEquipo: string,
  catalogoConfig?: { [tipoEquipo: string]: string[] },
): string[] {
  if (!catalogoConfig || !tipoEquipo) return [];
  const lista = catalogoConfig[tipoEquipo];
  if (!Array.isArray(lista)) return [];
  return lista;
}
