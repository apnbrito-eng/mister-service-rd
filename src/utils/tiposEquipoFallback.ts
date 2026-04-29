/**
 * Fallback hardcoded usado SOLO cuando `config_web/sitio.tiposEquipoPublicos`
 * no existe todavía o falla la lectura. Mantener sincronizado con lo que
 * el admin tendría tras su primera edición — sin elementos legacy como
 * Microondas o Lavavajillas que ya no se usan en el negocio.
 */
export const TIPOS_EQUIPO_FALLBACK = [
  'Lavadora',
  'Secadora',
  'Nevera',
  'Estufa',
  'Aire Acondicionado',
  'Otro',
];
