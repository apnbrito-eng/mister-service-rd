import { useEffect, useState, useCallback, useRef } from 'react';

interface VersionCheckResult {
  hayNuevaVersion: boolean;
  versionServidor: string | null;
  recargar: () => void;
}

export function useVersionCheck(intervaloMs: number = 5 * 60 * 1000): VersionCheckResult {
  const [hayNuevaVersion, setHayNuevaVersion] = useState(false);
  const [versionServidor, setVersionServidor] = useState<string | null>(null);
  const versionCliente = __APP_VERSION__;
  const timerRef = useRef<number | null>(null);

  const chequear = useCallback(async () => {
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json() as { commit?: string };
      if (data.commit && data.commit !== versionCliente) {
        setVersionServidor(data.commit);
        setHayNuevaVersion(true);
      }
    } catch {
      // silencio: network error, no es crítico
    }
  }, [versionCliente]);

  useEffect(() => {
    chequear(); // chequeo inicial
    timerRef.current = window.setInterval(chequear, intervaloMs);
    const onFocus = () => chequear();
    window.addEventListener('focus', onFocus);
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      window.removeEventListener('focus', onFocus);
    };
  }, [chequear, intervaloMs]);

  const recargar = useCallback(() => {
    window.location.reload();
  }, []);

  return { hayNuevaVersion, versionServidor, recargar };
}
