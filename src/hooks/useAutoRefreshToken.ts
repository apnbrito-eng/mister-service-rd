import { useEffect, useRef } from 'react';
import { User } from 'firebase/auth';

/**
 * Refresca el ID token de Firebase cada 45 minutos mientras el usuario
 * tenga sesión activa. Esto evita que la sesión se "enfríe" cuando la
 * pestaña está abierta pero inactiva.
 *
 * Firebase SDK refresca automáticamente en background cuando hace
 * requests, pero si no hay actividad por >50 min, el token expira.
 * Este hook fuerza refresh cada 45 min.
 */
export function useAutoRefreshToken(user: User | null) {
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Refresh inmediato al mount (por si el user acaba de loguearse)
    user.getIdToken(true).catch(err => {
      console.warn('[auth] Error en refresh inicial del token:', err);
    });

    // Refresh cada 45 minutos
    const FORTY_FIVE_MINUTES = 45 * 60 * 1000;
    intervalRef.current = window.setInterval(() => {
      user.getIdToken(true).catch(err => {
        console.warn('[auth] Error en auto-refresh del token:', err);
      });
    }, FORTY_FIVE_MINUTES);

    // También refrescar al volver la pestaña a focus (si estuvo en background
    // >45 min, el timer puede haber sido pausado por el navegador)
    const onFocus = () => {
      user.getIdToken(true).catch(err => {
        console.warn('[auth] Error en refresh al focus:', err);
      });
    };
    window.addEventListener('focus', onFocus);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('focus', onFocus);
    };
  }, [user]);
}
