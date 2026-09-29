import { createContext, useContext, useMemo } from 'react';
import type { Usuario, Rol } from '../../../src/types';
export const RolPrueba = createContext<Rol>('administrador');
export function useApp() {
 const rol = useContext(RolPrueba);
 return useMemo(() => ({userProfile: { id: `qa-${rol}`, nombre: 'Prueba local', rol } as Usuario, currentUser: {uid: `qa-sidebar-${rol}`}}), [rol]);
}
