import { activarNotificacionesMoviles } from './notificaciones';
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { equipoApi } from "../services/equipoApi";
import { auth } from "../firebase/config";
import toast from "react-hot-toast";
export function useAvisosNativos(uid?: string) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!uid || !Capacitor.isNativePlatform()) return;
    let cancelado = false;
    void activarNotificacionesMoviles().catch(() => {
      if (!cancelado) toast.error('No se activaron los avisos. Abre el menú y pulsa Activar avisos en este teléfono.', { duration: 6000 });
    });
    const primerPlano = FirebaseMessaging.addListener('notificationReceived', event => {
      if (cancelado || auth.currentUser?.uid !== uid) return;
      const data = event.notification.data as { conversacionId?: string } | undefined;
      if (data?.conversacionId && window.location.pathname === `/admin/inbox/${data.conversacionId}`) return;
      toast(event.notification.body || 'Tienes una actualización de trabajo.', { icon: '🔔', duration: 5000 });
    });
    const registro = FirebaseMessaging.addListener(
      "notificationActionPerformed",
      async (event) => {
        if (cancelado || auth.currentUser?.uid !== uid) return;
        const id = (
          event.notification.data as { avisoId?: unknown } | undefined
        )?.avisoId;
        if (typeof id !== "string" || !/^[\w.-]{1,160}$/.test(id)) return;
        try {
          const r = await equipoApi<{ ruta: string }>(
            `/api/crm/destino-aviso?id=${encodeURIComponent(id)}`,
          );
          if (!cancelado && auth.currentUser?.uid === uid) navigate(r.ruta);
        } catch (e) {
          if (!cancelado) toast.error((e as Error).message);
        }
      },
    );
    void registro.catch(() => {});
    return () => {
      cancelado = true;
      void primerPlano.then(l => l.remove()).catch(() => {});
      void registro.then((l) => l.remove()).catch(() => {});
    };
  }, [uid, navigate]);
}
