import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  ConfigWeb,
  CONFIG_WEB_DEFAULTS,
  ConfigWhatsApp,
  ConfigEstadisticas,
  ConfigContacto,
  ConfigFeedbackNPS,
  getWhatsAppUrl,
  parseConfigHero,
  parseConfigServicios,
} from '../services/configWeb.service';
import { ConfigFormularioAgendar } from '../types/configFormularioAgendar';

// ─── Caché en memoria ────────────────────────────────
// Evita que cada página pública re-lea Firestore al montar.
// Se invalida automáticamente cuando onSnapshot detecta cambios.

let cachedConfig: ConfigWeb | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minuto

function isCacheFresh(): boolean {
  return cachedConfig !== null && (Date.now() - cacheTimestamp) < CACHE_TTL;
}

/**
 * Parsea defensivamente `modelosPorTipoEquipo` desde Firestore en el
 * listener real-time. Devuelve `undefined` (no defaults) cuando la forma
 * no calza, para que el caller pueda decidir entre defaults o input libre.
 */
function parseModelosPorTipoEquipoLive(
  raw: unknown,
): { [tipoEquipo: string]: string[] } | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: { [tipoEquipo: string]: string[] } = {};
  for (const [tipo, lista] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof tipo !== 'string' || !tipo) continue;
    if (!Array.isArray(lista)) continue;
    out[tipo] = lista.filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    );
  }
  return out;
}

// ─── Hook principal ──────────────────────────────────

export function useConfigWeb(): { config: ConfigWeb; loading: boolean } {
  const [config, setConfig] = useState<ConfigWeb>(cachedConfig || CONFIG_WEB_DEFAULTS);
  const [loading, setLoading] = useState(!isCacheFresh());

  useEffect(() => {
    // Si el cache está fresco, no crear un nuevo listener
    if (isCacheFresh() && cachedConfig) {
      setConfig(cachedConfig);
      setLoading(false);
      return;
    }

    const ref = doc(db, 'config_web', 'sitio');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const parsed: ConfigWeb = {
            whatsapp: (data.whatsapp as ConfigWhatsApp) || CONFIG_WEB_DEFAULTS.whatsapp,
            hero: parseConfigHero(data.hero),
            estadisticas: (data.estadisticas as ConfigEstadisticas) || CONFIG_WEB_DEFAULTS.estadisticas,
            contacto: (data.contacto as ConfigContacto) || CONFIG_WEB_DEFAULTS.contacto,
            marcas: Array.isArray(data.marcas) ? (data.marcas as string[]) : CONFIG_WEB_DEFAULTS.marcas,
            formularioAgendar:
              (data.formularioAgendar as ConfigFormularioAgendar) ||
              CONFIG_WEB_DEFAULTS.formularioAgendar,
            tiposEquipoPublicos: Array.isArray(data.tiposEquipoPublicos)
              ? (data.tiposEquipoPublicos as string[]).filter(
                  (x): x is string => typeof x === 'string' && !!x,
                )
              : CONFIG_WEB_DEFAULTS.tiposEquipoPublicos,
            modelosPorTipoEquipo: parseModelosPorTipoEquipoLive(data.modelosPorTipoEquipo),
            feedbackNPS:
              (data.feedbackNPS as ConfigFeedbackNPS) || CONFIG_WEB_DEFAULTS.feedbackNPS,
            servicios: parseConfigServicios(data.servicios),
            updatedAt: data.updatedAt?.toDate?.() || undefined,
          };
          cachedConfig = parsed;
          cacheTimestamp = Date.now();
          setConfig(parsed);
        } else {
          // Documento no existe — usar defaults
          setConfig(CONFIG_WEB_DEFAULTS);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to config_web:', err);
        // Fallback a defaults sin romper la app
        setConfig(cachedConfig || CONFIG_WEB_DEFAULTS);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  return { config, loading };
}

// Re-exportar el helper para uso directo
export { getWhatsAppUrl };
