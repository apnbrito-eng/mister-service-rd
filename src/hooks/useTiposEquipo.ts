import { useConfigWeb } from './useConfigWeb';
import { TIPOS_EQUIPO_FALLBACK } from '../utils/tiposEquipoFallback';

/**
 * Hook centralizado para leer la lista de tipos de equipo.
 * Lee desde `config_web/sitio.tiposEquipoPublicos` (single source of truth).
 * Si la config aún no carga o no existe, retorna el fallback hardcoded.
 *
 * El admin edita la lista desde `/admin/configuracion`. Los cambios se
 * sincronizan a `config_web/sitio.tiposEquipoPublicos` y se reflejan en
 * vivo (onSnapshot) en todos los consumers.
 */
export function useTiposEquipo(): string[] {
  const { config, loading } = useConfigWeb();
  if (loading) return TIPOS_EQUIPO_FALLBACK;
  const lista = config?.tiposEquipoPublicos;
  if (Array.isArray(lista) && lista.length > 0) return lista;
  return TIPOS_EQUIPO_FALLBACK;
}
