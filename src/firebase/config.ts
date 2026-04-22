import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Configuración de Firebase con fallbacks al proyecto mister-service-app-cloude
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAKjaZAWHi_OKoH9HAdvk64MN4dmvVYoRk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mister-service-app-cloude.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mister-service-app-cloude",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mister-service-app-cloude.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "342961599729",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:342961599729:web:aa7d3bdb531e530419a550",
};

const app = initializeApp(firebaseConfig);

// App Check: valida que los requests vienen de la app real (no bots/scripts).
// El enforcement (bloqueo real) se activa manualmente en Firebase Console
// tras validar que los tokens llegan en producción.
if (typeof window !== 'undefined') {
  if (import.meta.env.DEV) {
    // @ts-expect-error - propiedad global de Firebase para debug en localhost
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  if (siteKey) {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
      console.log('[firebase] App Check inicializado con reCAPTCHA v3');
    } catch (err) {
      console.error('[firebase] Error inicializando App Check:', err);
    }
  } else {
    console.warn('[firebase] VITE_RECAPTCHA_SITE_KEY no definida, App Check desactivado');
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
