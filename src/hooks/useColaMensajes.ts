import { useEffect } from 'react';
import { escucharPendientes, procesarPendientes } from '../services/colaMensajes';
export function useColaMensajes(uid?: string) {
  useEffect(() => {
    if (!uid) return;
    const enviar = () => { void procesarPendientes(uid); };
    const salir = escucharPendientes(enviar);
    const timer = window.setInterval(enviar, 10000);
    window.addEventListener('online', enviar); enviar();
    return () => { salir(); clearInterval(timer); window.removeEventListener('online', enviar); };
  }, [uid]);
}
