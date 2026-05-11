import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Configuración de Firebase — fail-fast si falta cualquier env var.
// Antes había fallback hardcodeado al proyecto productivo (audit fix SPRINT-136 2026-05-11):
// si alguien clonaba el repo sin `.env`, la app arrancaba pegada a producción real.
// Ahora si falta cualquier variable, el módulo throw-ea con mensaje explícito.
const REQUIRED_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

const missing = REQUIRED_ENV_VARS.filter((k) => !import.meta.env[k]);
if (missing.length > 0) {
  throw new Error(
    `[firebase] Faltan variables de entorno obligatorias: ${missing.join(', ')}.\n` +
    `Copiá .env.example a .env y rellená los valores antes de arrancar.\n` +
    `En Vercel: agregalas en Project Settings → Environment Variables.`
  );
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// App Check: valida que los requests vienen de la app real (no bots/scripts).
// El enforcement (bloqueo real) se activa manualmente en Firebase Console
// tras validar que los tokens llegan en producción.
let appCheckInstance: AppCheck | null = null;
if (typeof window !== 'undefined') {
  if (import.meta.env.DEV) {
    // @ts-expect-error - propiedad global de Firebase para debug en localhost
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  if (siteKey) {
    try {
      appCheckInstance = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
      console.log('[firebase] App Check inicializado con reCAPTCHA v3');
    } catch (err) {
      console.error('[firebase] Error inicializando App Check:', err);
      appCheckInstance = null;
    }
  } else {
    console.warn('[firebase] VITE_RECAPTCHA_SITE_KEY no definida, App Check desactivado');
  }
}

export const appCheck = appCheckInstance;
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
