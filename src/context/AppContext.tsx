import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, getDocs, collection, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { Usuario } from '../types';
import { useAutoRefreshToken } from '../hooks/useAutoRefreshToken';

interface AppContextType {
  currentUser: User | null;
  userProfile: Usuario | null;
  loading: boolean;
  /** Mensaje de error cuando el usuario está autenticado en Firebase Auth pero
   *  no existe perfil real en `usuarios/{uid}` ni en `personal where email==`.
   *  Reemplaza al antiguo "demo mode" que sintetizaba un admin en memoria
   *  (eliminado en audit fix C3 — escalación silenciosa de privilegios). */
  authError: string | null;
  setUserProfile: (profile: Usuario | null) => void;
}

const AppContext = createContext<AppContextType>({
  currentUser: null,
  userProfile: null,
  loading: true,
  authError: null,
  setUserProfile: () => {},
});

export const useApp = () => useContext(AppContext);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Ref to hold the profile listener unsubscribe so we can clean it up
  const profileUnsubRef = useRef<(() => void) | null>(null);

  // Auto-refresh del ID token de Firebase cada 45 min para evitar que la
  // sesión expire mientras la pestaña está abierta pero inactiva.
  useAutoRefreshToken(currentUser);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // Clean up any previous profile listener
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }

      setCurrentUser(user);

      if (!user) {
        setUserProfile(null);
        setAuthError(null);
        setLoading(false);
        return;
      }

      try {
        // Step 1: Try usuarios/{uid} with real-time listener
        const userDocRef = doc(db, 'usuarios', user.uid);
        let foundInUsuarios = false;

        // Quick check if doc exists before setting up listener
        const personalQuery = query(collection(db, 'personal'), where('email', '==', user.email));
        const personalSnap = await getDocs(personalQuery);

        if (personalSnap.empty) {
          // Not in personal collection either — check usuarios collection
          const { getDoc } = await import('firebase/firestore');
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            foundInUsuarios = true;
          }
        }

        if (foundInUsuarios) {
          // Listen to usuarios/{uid} in real time
          profileUnsubRef.current = onSnapshot(
            userDocRef,
            (snap) => {
              if (snap.exists()) {
                setUserProfile({ id: snap.id, ...snap.data() } as Usuario);
                setAuthError(null);
              }
              setLoading(false);
            },
            (err) => {
              console.error('Error listening to user profile:', err);
              setLoading(false);
            }
          );
        } else if (!personalSnap.empty) {
          // Listen to the personal document in real time
          const personalDocRef = doc(db, 'personal', personalSnap.docs[0].id);
          profileUnsubRef.current = onSnapshot(
            personalDocRef,
            (snap) => {
              if (snap.exists()) {
                const data = snap.data();
                setUserProfile({
                  id: snap.id,
                  nombre: data.nombre,
                  email: data.email || user.email || '',
                  rol: data.rol,
                  telefono: data.telefono || '',
                  activo: data.activo,
                  createdAt: data.createdAt?.toDate() || new Date(),
                  permisos: data.permisos,
                  permisosSistema: data.permisosSistema,
                  permisosPersonalizados: data.permisosPersonalizados,
                  color: data.color,
                });
                setAuthError(null);
              }
              setLoading(false);
            },
            (err) => {
              console.error('Error listening to personal profile:', err);
              setLoading(false);
            }
          );
        } else {
          // Audit fix C3: NO sintetizar perfil "administrador" en memoria.
          // Antes esto permitía a cualquier usuario autenticado en Firebase
          // Auth (con email no registrado en `usuarios` ni `personal`) entrar
          // como administrador silenciosamente. Ahora exigimos perfil real.
          setUserProfile(null);
          setAuthError(
            'Perfil no encontrado. Tu email está autenticado en Firebase pero no existe en el sistema. Contactá al administrador para que cree tu perfil.'
          );
          setLoading(false);
        }
      } catch (error) {
        // Audit fix C3 iter 2: si Firestore lanza durante la carga del perfil
        // (Step 1 o Step 2), antes solo se llamaba setLoading(false) dejando
        // userProfile=null y authError=null → ProtectedRoute renderizaba la
        // app igual con perfil nulo (estado limbo). Ahora seteamos perfil null
        // y un authError genérico para que la UI muestre PerfilNoEncontrado.
        console.error('[auth] error cargando perfil:', error);
        setUserProfile(null);
        setAuthError('No se pudo cargar tu perfil. Reintentá o contactá al administrador.');
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }
    };
  }, []);

  return (
    <AppContext.Provider value={{ currentUser, userProfile, loading, authError, setUserProfile }}>
      {children}
    </AppContext.Provider>
  );
}
