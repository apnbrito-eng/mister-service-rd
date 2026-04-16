import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  ConfigWeb,
  CONFIG_WEB_DEFAULTS,
  ConfigWhatsApp,
  ConfigHero,
  ConfigEstadisticas,
  ConfigContacto,
  getWhatsAppUrl,
} from '../services/configWeb.service';

// ─── Caché en memoria ────────────────────────────────
// Evita que cada página pública re-lea Firestore al montar.
// Se invalida automáticamente cuando onSnapshot detecta cambios.

let cachedConfig: ConfigWeb | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minuto

function isCacheFresh(): boolean {
  return cachedConfig !== null && (Date.now() - cacheTimestamp) < CACHE_TTL;
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
            hero: (data.hero as ConfigHero) || CONFIG_WEB_DEFAULTS.hero,
            estadisticas: (data.estadisticas as ConfigEstadisticas) || CONFIG_WEB_DEFAULTS.estadisticas,
            contacto: (data.contacto as ConfigContacto) || CONFIG_WEB_DEFAULTS.contacto,
            marcas: Array.isArray(data.marcas) ? (data.marcas as string[]) : CONFIG_WEB_DEFAULTS.marcas,
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
