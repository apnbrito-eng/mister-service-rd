/** Sidebar real; servicios sustituidos por vite.config dedicado, sin datos reales. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '../../src/index.css';
import Sidebar from '../../src/components/Sidebar';
import { RolPrueba } from './sidebar-stubs/contexto';
import type { Rol } from '../../src/types';
function Prueba() {
 const [collapsed, setCollapsed] = useState(false);
 const [rol, setRol] = useState<Rol>('administrador');
 const {pathname} = useLocation();
 return <RolPrueba.Provider value={rol}><div className="service-ui flex h-screen overflow-hidden">
 <Sidebar collapsed={collapsed} onToggle={()=>setCollapsed(v=>!v)}/>
 <main className="flex-1 min-w-0 overflow-auto p-2"><h1>Prueba local</h1>
 <label>Rol<select value={rol} onChange={event=>setRol(event.target.value as Rol)}>{['administrador','coordinadora','operaria','secretaria'].map(valor=><option key={valor}>{valor}</option>)}</select></label>
 <p className="break-all">{pathname}</p><p>Sin datos ni conexiones reales.</p>
 </main></div></RolPrueba.Provider>;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/admin/clientes']}><Prueba/></MemoryRouter>);
