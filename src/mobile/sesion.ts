import { onAuthStateChanged } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { auth } from '../firebase/config';
import { detenerJornada } from './jornada';
import { desactivarNotificacionesMoviles } from './notificaciones';
/** No conservar sensores o token de avisos cuando cambia la persona autenticada. */
export function protegerSesionMovil() {
  if (!Capacitor.isNativePlatform()) return;
  let anterior = auth.currentUser?.uid;
  onAuthStateChanged(auth, user => {
    if (anterior && anterior !== user?.uid) {
      void detenerJornada(false).catch(() => {});
      void desactivarNotificacionesMoviles().catch(() => {});
    }
    anterior = user?.uid;
  });
}
