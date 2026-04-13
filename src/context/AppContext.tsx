import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
          if (userDoc.exists()) {
            setUserProfile({ id: userDoc.id, ...userDoc.data() } as Usuario);
          } else {
            // Try to find by email in personal collection
            const q = query(collection(db, 'personal'), where('email', '==', user.email));
            const snap = await getDocs(q);
            if (!snap.empty) {
              const data = snap.docs[0].data();
              setUserProfile({
                id: snap.docs[0].id,
                nombre: data.nombre,
                email: data.email || user.email || '',
                rol: data.rol,
                telefono: data.telefono || '',
                activo: data.activo,
                createdAt: data.createdAt?.toDate() || new Date(),
                permisos: data.permisos,
                color: data.color,
              });
            } else {
              // Default admin profile for demo
              setUserProfile({
                id: user.uid,
                nombre: user.email?.split('@')[0] || 'Usuario',
                email: user.email || '',
                rol: 'administrador',
                telefono: '',
                activo: true,
                createdAt: new Date(),
              });
            }
          }
        } catch (error) {
          console.error('Error loading user profile:', error);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AppContext.Provider value={{ currentUser, userProfile, loading, setUserProfile }}>
      {children}
    </AppContext.Provider>
  );
}
