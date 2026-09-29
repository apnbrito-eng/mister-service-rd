import { createContext, useContext, useState, type ReactNode } from 'react';
type Seleccion = { clienteId?: string; telefono?: string; nombre?: string; waId?: string };
const Context = createContext<{ seleccion: Seleccion | null; seleccionar: (s: Seleccion | null) => void }>({seleccion:null,seleccionar:()=>{}});
export function AtencionProvider({children}: {children: ReactNode}) {
  const [seleccion, seleccionar] = useState<Seleccion | null>(null);
  return <Context.Provider value={{seleccion, seleccionar}}>{children}</Context.Provider>;
}
export const useAtencion = () => useContext(Context);
