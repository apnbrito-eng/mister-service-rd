import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, getDocs, collection, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { Usuario } from '../types';

interface AppContextType {
  currentUser: User | null;
  userProfile: Usuario | null;
  loading: boolean;
  setUserProfile: (profile: Usuario | null) => void;
}

const AppContext = createContext<AppContextType>({
  currentUser: null,
  userProfile: null,
  loading: true,
  setUserProfile: () => {},
});

export const useApp = () => useContext(AppContext);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  // Ref to hold the profile listener unsubscribe so we can clean it up
  const profileUnsubRef = useRef<(() => void) | null>(null);

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
          // If also not there, use the demo fallback (no listener needed)
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
                  color: data.color,
                });
              }
              setLoading(false);
            },
            (err) => {
              console.error('Error listening to personal profile:', err);
              setLoading(false);
            }
          );
        } else {
          // Default admin profile for demo (no listener — static fallback)
          setUserProfile({
            id: user.uid,
            nombre: user.email?.split('@')[0] || 'Usuario',
            email: user.email || '',
            rol: 'administrador',
            telefono: '',
            activo: true,
            createdAt: new Date(),
          });
          setLoading(false);
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
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
    <AppContext.Provider value={{ currentUser, userProfile, loading, setUserProfile }}>
      {children}
    </AppContext.Provider>
  );
}
