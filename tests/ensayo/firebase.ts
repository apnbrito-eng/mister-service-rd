// Exclusivo del servidor local de ensayo. Nunca se importa desde producción.
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

if (!import.meta.env.DEV || !['127.0.0.1', 'localhost'].includes(location.hostname)) {
  throw new Error('El ensayo solo puede ejecutarse en este equipo.');
}
const app = initializeApp({
  apiKey: 'demo-local-only', projectId: 'demo-mister-ensayo',
  authDomain: 'demo-mister-ensayo.firebaseapp.com',
  storageBucket: 'demo-mister-ensayo.appspot.com', appId: 'demo-local',
});
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const appCheck = null;
connectAuthEmulator(auth, 'http://127.0.0.1:9198', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8289);
connectStorageEmulator(storage, '127.0.0.1', 9298);
export default app;
